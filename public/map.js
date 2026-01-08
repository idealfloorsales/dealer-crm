// --- АВТОРИЗАЦИЯ (ВСТАВИТЬ В НАЧАЛО ФАЙЛА) ---
const originalFetch = window.fetch;
window.fetch = async function (url, options) {
    options = options || {};
    options.headers = options.headers || {};
    const token = localStorage.getItem('crm_token');
    if (token) options.headers['Authorization'] = 'Bearer ' + token;
    const response = await originalFetch(url, options);
    if (response.status === 401) window.location.href = '/login.html';
    return response;
};
// -------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
    
    const API_DEALERS_URL = '/api/dealers';
    const API_STATUSES_URL = '/api/statuses'; // Новый API
    const DEFAULT_LAT = 51.1605; 
    const DEFAULT_LNG = 71.4704;

    // Элементы
    const filterCity = document.getElementById('map-filter-city');
    const filterStatus = document.getElementById('map-filter-status');
    const searchInput = document.getElementById('map-search');
    const suggestionsBox = document.getElementById('map-search-suggestions');
    
    // Кнопки
    const btnMyLocation = document.getElementById('btn-my-location');
    const btnToggleHeat = document.getElementById('btn-toggle-heat');
    const btnFullscreen = document.getElementById('btn-fullscreen');
    
    // Сайдбар и список
    const sidebar = document.getElementById('map-sidebar');
    const dealerListContainer = document.getElementById('dealer-list-container');
    const btnShowListMobile = document.getElementById('btn-show-list-mobile');
    const btnToggleSidebar = document.getElementById('btn-toggle-sidebar'); 
    const visibleCountBadge = document.getElementById('map-visible-count'); 

    // --- 1. Инициализация карты ---
    const container = L.DomUtil.get('main-map');
    if(container != null){
      if(container._leaflet_id != null){
        container._leaflet_id = null;
      }
    }
    
    const map = L.map('main-map', { zoomControl: false }).setView([DEFAULT_LAT, DEFAULT_LNG], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OSM', maxZoom: 18 }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    let allDealers = [];
    let statusList = []; // Список статусов из базы
    let userLat = null; 
    let userLng = null;
    
    let markersCluster = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 50 });
    let heatLayer = null;
    let isHeatmapMode = false;

    // --- UTILS ---
    function getDistanceKm(lat1, lon1, lat2, lon2) {
        const R = 6371; 
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }

    // Получить цвет и иконку статуса (Динамически)
    function createPinIcon(status) {
        // По умолчанию серый
        let color = '#6c757d'; 
        
        // Ищем статус в загруженном списке
        const statusObj = statusList.find(s => s.value === status);
        
        if (statusObj && statusObj.color) {
            color = statusObj.color;
        } else {
            // Фолбэк для старых жестко заданных статусов (на всякий случай)
            const fallbackColors = { 'active': '#198754', 'standard': '#ffc107', 'problem': '#dc3545', 'potential': '#0d6efd', 'archive': '#6c757d' };
            color = fallbackColors[status] || '#6c757d';
        }

        const svgHtml = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${color}" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="pin-svg"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3" fill="white"></circle></svg>`;
        return L.divIcon({ className: 'custom-pin', html: svgHtml, iconSize: [36, 36], iconAnchor: [18, 36], popupAnchor: [0, -32] });
    }

    // --- LOAD DATA ---
    async function init() {
        try {
            // 1. Грузим статусы
            await loadStatuses();
            
            // 2. Грузим дилеров
            await loadDealers();
            
        } catch (e) { 
            console.error(e); 
            if(dealerListContainer) dealerListContainer.innerHTML = '<p class="text-center text-danger mt-4">Ошибка загрузки</p>';
        }
    }

    async function loadStatuses() {
        try {
            const res = await fetch(API_STATUSES_URL);
            if(res.ok) {
                statusList = await res.json();
                populateStatusFilter();
            }
        } catch(e) { console.warn('Statuses load error', e); }
    }

    function populateStatusFilter() {
        if(!filterStatus) return;
        
        let html = '<option value="">Все статусы</option>';
        
        // Если база пустая, добавим дефолтные
        if (statusList.length === 0) {
            html += `
                <option value="active">🟢 Активный</option>
                <option value="standard">🟡 Стандарт</option>
                <option value="problem">🔴 Проблемный</option>
                <option value="potential">🔵 Потенциальный</option>
                <option value="archive">⚫ Архив</option>
            `;
        } else {
            // Иначе генерируем из базы
            statusList.forEach(s => {
                // Если статус скрыт (isVisible=false), его не должно быть в фильтре? 
                // Обычно на карте хотят видеть всё, но можно добавить проверку:
                // if (s.isVisible !== false) ...
                html += `<option value="${s.value}">${s.label}</option>`;
            });
        }
        filterStatus.innerHTML = html;
    }

    async function loadDealers() {
        const res = await fetch(API_DEALERS_URL);
        if(!res.ok) throw new Error('Error');
        allDealers = await res.json();
        
        const cities = [...new Set(allDealers.map(d => d.city).filter(Boolean))].sort();
        if(filterCity) {
            filterCity.innerHTML = '<option value="">Все города</option>';
            cities.forEach(c => filterCity.add(new Option(c, c)));
        }

        updateMapAndList();
    }

    function updateMapAndList() {
        const city = filterCity ? filterCity.value : '';
        const status = filterStatus ? filterStatus.value : '';

        // Фильтрация
        let filtered = allDealers.filter(d => {
            if (!d.latitude || !d.longitude) return false;
            
            // Если статус не выбран - показываем всё, кроме "archive" (если такой есть в базе)
            // Но если статусы динамические, лучше показывать всё по дефолту
            let statusMatch = true;
            if (status) {
                statusMatch = (d.status === status);
            } else {
                // Показываем всё, если фильтр пуст
                statusMatch = true; 
            }
            
            return (!city || d.city === city) && statusMatch;
        });

        // Сортировка
        if (userLat && userLng) {
            filtered.forEach(d => { d._distance = getDistanceKm(userLat, userLng, d.latitude, d.longitude); });
            filtered.sort((a, b) => a._distance - b._distance);
        } else {
            filtered.sort((a, b) => (a.name||'').localeCompare(b.name||''));
        }

        renderMapMarkers(filtered);
        renderSideList(filtered);
    }

    function renderMapMarkers(filtered) {
        markersCluster.clearLayers();
        if (heatLayer) map.removeLayer(heatLayer);

        if (!isHeatmapMode) {
            // РЕЖИМ МАРКЕРОВ
            filtered.forEach(d => {
                const marker = L.marker([d.latitude, d.longitude], { icon: createPinIcon(d.status || 'standard') });
                const phone = d.contacts && d.contacts[0] && d.contacts[0].contactInfo ? d.contacts[0].contactInfo.replace(/[^0-9]/g, '') : null;
                const waLink = phone ? `https://wa.me/${phone}` : '#';
                const navLink = `https://yandex.kz/maps/?pt=${d.longitude},${d.latitude}&z=17&l=map`;
                const distBadge = (d._distance !== undefined) ? `<span class="badge bg-light text-dark border mb-2">${d._distance.toFixed(1)} км</span><br>` : '';

                marker.bindPopup(`
                    <div class="popup-header">${d.name}</div>
                    <div class="popup-body">
                        ${distBadge}
                        <div style="margin-bottom:5px;"><i class="bi bi-geo-alt text-muted"></i> ${d.address || ''}</div>
                    </div>
                    <div class="popup-footer">
                        <a href="dealer.html?id=${d.id}" class="btn btn-sm btn-primary flex-fill" target="_blank">Профиль</a>
                        ${phone ? `<a href="${waLink}" class="btn btn-sm btn-success" target="_blank"><i class="bi bi-whatsapp"></i></a>` : ''}
                        <a href="${navLink}" class="btn btn-sm btn-outline-secondary" target="_blank"><i class="bi bi-map"></i></a>
                    </div>
                `);
                markersCluster.addLayer(marker);
            });
            map.addLayer(markersCluster);
        } else {
            // РЕЖИМ ТЕПЛОВОЙ КАРТЫ
            const heatPoints = filtered.map(d => [d.latitude, d.longitude, 1]);
            
            if(L.heatLayer) {
                heatLayer = L.heatLayer(heatPoints, { 
                    radius: 50,        
                    blur: 35,          
                    minOpacity: 0.6,   
                    maxZoom: 12        
                }).addTo(map);
            }
        }
        
        // Обновляем счетчик
        if (visibleCountBadge) visibleCountBadge.textContent = `Дилеров на карте: ${filtered.length}`;
    }

    function renderSideList(filtered) {
        if (!dealerListContainer) return;
        if (filtered.length === 0) { dealerListContainer.innerHTML = '<p class="text-center text-muted mt-5">Ничего не найдено</p>'; return; }

        dealerListContainer.innerHTML = filtered.map(d => {
            const dist = (d._distance !== undefined) ? `<span class="dist-badge"><i class="bi bi-cursor-fill me-1"></i>${d._distance.toFixed(1)} км</span>` : '';
            
            // Название статуса берем из базы
            const statusObj = statusList.find(s => s.value === d.status) || { label: d.status, color: '#6c757d' };
            const statusColor = statusObj.color || '#6c757d';

            return `
            <div class="map-list-item" onclick="flyToDealer(${d.latitude}, ${d.longitude}, '${d.id}')">
                <div class="d-flex justify-content-between align-items-start">
                    <div class="map-item-title">${d.name}</div>
                    ${dist}
                </div>
                <div class="map-item-addr">${d.address || d.city || ''}</div>
                <div class="map-item-meta">
                    <span class="text-uppercase" style="font-size:0.7rem; font-weight:700; color:${statusColor}">${statusObj.label}</span>
                </div>
            </div>`;
        }).join('');
    }

    window.flyToDealer = (lat, lng, id) => {
        map.flyTo([lat, lng], 16);
        if (window.innerWidth < 768 && sidebar) sidebar.classList.remove('open');
    };

    // --- HANDLERS ---
    if(filterCity) filterCity.onchange = updateMapAndList;
    if(filterStatus) filterStatus.onchange = updateMapAndList;

    if(btnToggleHeat) btnToggleHeat.onclick = () => {
        if(!L.heatLayer) return alert("Плагин тепловой карты не загружен");
        isHeatmapMode = !isHeatmapMode;
        btnToggleHeat.classList.toggle('active');
        updateMapAndList();
    };

    // ГЕОЛОКАЦИЯ
    if(btnMyLocation) btnMyLocation.onclick = () => {
        if (navigator.geolocation) {
            const oldHtml = btnMyLocation.innerHTML;
            btnMyLocation.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
            navigator.geolocation.getCurrentPosition(pos => {
                userLat = pos.coords.latitude;
                userLng = pos.coords.longitude;
                map.setView([userLat, userLng], 13);
                L.circleMarker([userLat, userLng], {radius: 8, color: '#3388ff', fillOpacity: 0.8}).addTo(map).bindPopup("Вы здесь").openPopup();
                updateMapAndList(); // Пересортировка списка
                btnMyLocation.innerHTML = '<i class="bi bi-geo-alt-fill"></i>';
            }, () => { alert("Ошибка геопозиции"); btnMyLocation.innerHTML = oldHtml; });
        }
    };

    // FULLSCREEN
    if(btnFullscreen) btnFullscreen.onclick = () => {
        const elem = document.getElementById('map-container-fullscreen');
        if (!document.fullscreenElement) {
            elem.requestFullscreen().catch(err => { alert(`Ошибка: ${err.message}`); });
        } else { document.exitFullscreen(); }
    };

    // SEARCH
    let debounceTimer;
    if(searchInput) searchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        const query = searchInput.value.trim();
        if (query.length < 3) { if(suggestionsBox) suggestionsBox.style.display = 'none'; return; }
        debounceTimer = setTimeout(async () => {
            try {
                const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=kz`);
                const data = await res.json();
                if(suggestionsBox) {
                    suggestionsBox.innerHTML = '';
                    if (data.length > 0) {
                        suggestionsBox.style.display = 'block';
                        data.slice(0, 5).forEach(place => {
                            const div = document.createElement('div');
                            div.className = 'address-suggestion-item';
                            div.textContent = place.display_name;
                            div.onclick = () => {
                                const lat = parseFloat(place.lat); const lon = parseFloat(place.lon);
                                map.setView([lat, lon], 16);
                                if(!isHeatmapMode) L.marker([lat, lon]).addTo(map).bindPopup("Вы искали здесь").openPopup();
                                searchInput.value = place.display_name;
                                suggestionsBox.style.display = 'none';
                            };
                            suggestionsBox.appendChild(div);
                        });
                    } else { suggestionsBox.style.display = 'none'; }
                }
            } catch (e) { console.error(e); }
        }, 500);
    });

    document.addEventListener('click', (e) => { if (suggestionsBox && !e.target.closest('.sidebar-header')) suggestionsBox.style.display = 'none'; });

    if(btnShowListMobile && sidebar) btnShowListMobile.onclick = () => { sidebar.classList.add('open'); };
    if(btnToggleSidebar && sidebar) btnToggleSidebar.onclick = () => { sidebar.classList.remove('open'); };

    // START
    init();
});
