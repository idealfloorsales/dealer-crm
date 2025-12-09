document.addEventListener('DOMContentLoaded', () => {
    
    const API_URL = '/api/dealers';
    const DEFAULT_LAT = 51.1605; 
    const DEFAULT_LNG = 71.4704;

    // Элементы
    const filterCity = document.getElementById('map-filter-city');
    const filterStatus = document.getElementById('map-filter-status');
    const searchInput = document.getElementById('map-search');
    const suggestionsBox = document.getElementById('map-search-suggestions');
    const btnMyLocation = document.getElementById('btn-my-location');
    const btnToggleHeat = document.getElementById('btn-toggle-heat');
    const btnFullscreen = document.getElementById('btn-fullscreen');
    const visibleCountBadge = document.getElementById('map-visible-count');
    const legendBox = document.getElementById('map-legend-box');

    // Карта
    const map = L.map('main-map', { zoomControl: false }).setView([DEFAULT_LAT, DEFAULT_LNG], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { 
        attribution: '&copy; OSM', maxZoom: 18 
    }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    let allDealers = [];
    
    // Слои
    let markersCluster = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 50 });
    let heatLayer = null; // Будет создан позже
    
    let isHeatmapMode = false; // Режим просмотра

    // --- СТАТУСЫ И ЦВЕТА ---
    const statusColors = {
        'active': '#198754', 'standard': '#ffc107', 'problem': '#dc3545', 'potential': '#0d6efd', 'archive': '#6c757d'
    };

    function createPinIcon(status) {
        const color = statusColors[status] || '#ffc107';
        const svgHtml = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${color}" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="pin-svg"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3" fill="white"></circle></svg>`;
        return L.divIcon({ className: 'custom-pin', html: svgHtml, iconSize: [36, 36], iconAnchor: [18, 36], popupAnchor: [0, -32] });
    }

    async function loadDealers() {
        try {
            const res = await fetch(API_URL);
            if(!res.ok) throw new Error('Error');
            allDealers = await res.json();
            
            const cities = [...new Set(allDealers.map(d => d.city).filter(Boolean))].sort();
            filterCity.innerHTML = '<option value="">Все города</option>';
            cities.forEach(c => filterCity.add(new Option(c, c)));

            renderMap();
        } catch (e) { console.error(e); visibleCountBadge.textContent = "Ошибка загрузки"; }
    }

    function renderMap() {
        // Очистка
        markersCluster.clearLayers();
        if (heatLayer) map.removeLayer(heatLayer);

        const city = filterCity.value;
        const status = filterStatus.value;

        // Фильтрация
        const filtered = allDealers.filter(d => {
            if (!d.latitude || !d.longitude) return false;
            let statusMatch = true;
            if (status) statusMatch = (d.status === status);
            else statusMatch = (d.status !== 'archive'); 
            return (!city || d.city === city) && statusMatch;
        });

        // 1. Режим МАРКЕРОВ
        if (!isHeatmapMode) {
            filtered.forEach(d => {
                const marker = L.marker([d.latitude, d.longitude], { icon: createPinIcon(d.status || 'standard') });
                const phone = d.contacts && d.contacts[0] && d.contacts[0].contactInfo ? d.contacts[0].contactInfo.replace(/[^0-9]/g, '') : null;
                const waLink = phone ? `https://wa.me/${phone}` : '#';
                const navLink = `https://yandex.kz/maps/?pt=${d.longitude},${d.latitude}&z=17&l=map`;
                const popupContent = `<div class="popup-header">${d.name}</div><div class="popup-body"><div style="margin-bottom:5px;"><i class="bi bi-geo-alt text-muted"></i> ${d.address || 'Адрес не указан'}</div>${d.city ? `<span class="badge bg-light text-dark border">${d.city}</span>` : ''}</div><div class="popup-footer"><a href="dealer.html?id=${d.id}" class="btn btn-sm btn-primary flex-fill" target="_blank">Профиль</a>${phone ? `<a href="${waLink}" class="btn btn-sm btn-success" target="_blank"><i class="bi bi-whatsapp"></i></a>` : ''}<a href="${navLink}" class="btn btn-sm btn-outline-secondary" target="_blank"><i class="bi bi-map"></i></a></div>`;
                marker.bindPopup(popupContent);
                markersCluster.addLayer(marker);
            });
            map.addLayer(markersCluster);
            if(legendBox) legendBox.style.display = 'block';
        } 
        // 2. Режим ТЕПЛОВОЙ КАРТЫ
        else {
            const heatPoints = filtered.map(d => [d.latitude, d.longitude, 1]); // 1 - интенсивность
            heatLayer = L.heatLayer(heatPoints, { radius: 25, blur: 15, maxZoom: 17 }).addTo(map);
            if(legendBox) legendBox.style.display = 'none';
        }

        updateVisibleCount(); // Обновляем счетчик
    }

    // Подсчет видимых
    function updateVisibleCount() {
        if (!allDealers.length) return;
        const bounds = map.getBounds();
        let count = 0;
        
        // Считаем только отфильтрованных и видимых
        const city = filterCity.value;
        const status = filterStatus.value;

        allDealers.forEach(d => {
            if (!d.latitude || !d.longitude) return;
            // Тот же фильтр
            let statusMatch = true; if (status) statusMatch = (d.status === status); else statusMatch = (d.status !== 'archive'); 
            if ((!city || d.city === city) && statusMatch) {
                // Проверка попадания в экран
                if (bounds.contains([d.latitude, d.longitude])) count++;
            }
        });
        
        visibleCountBadge.textContent = `В этой области: ${count}`;
    }

    // Слушатель движения карты
    map.on('moveend', updateVisibleCount);

    filterCity.onchange = renderMap;
    filterStatus.onchange = renderMap;

    // Переключатель Тепло/Маркеры
    btnToggleHeat.onclick = () => {
        isHeatmapMode = !isHeatmapMode;
        btnToggleHeat.classList.toggle('active');
        renderMap();
    };

    // Поиск
    let debounceTimer;
    searchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        const query = searchInput.value.trim();
        if (query.length < 3) { suggestionsBox.style.display = 'none'; return; }
        debounceTimer = setTimeout(async () => {
            try {
                const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=kz`);
                const data = await res.json();
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
                            if(!isHeatmapMode) {
                                L.marker([lat, lon]).addTo(map).bindPopup("Вы искали здесь").openPopup();
                            }
                            searchInput.value = place.display_name;
                            suggestionsBox.style.display = 'none';
                        };
                        suggestionsBox.appendChild(div);
                    });
                } else { suggestionsBox.style.display = 'none'; }
            } catch (e) { console.error(e); }
        }, 500);
    });
    document.addEventListener('click', (e) => { if (!e.target.closest('.map-floating-panel')) suggestionsBox.style.display = 'none'; });

    // Геолокация
    btnMyLocation.onclick = () => {
        if (navigator.geolocation) {
            const oldHtml = btnMyLocation.innerHTML;
            btnMyLocation.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
            navigator.geolocation.getCurrentPosition(pos => {
                const { latitude, longitude } = pos.coords;
                map.setView([latitude, longitude], 15);
                btnMyLocation.innerHTML = oldHtml;
            }, () => { alert("Ошибка геопозиции"); btnMyLocation.innerHTML = oldHtml; });
        }
    };

    // Fullscreen
    btnFullscreen.onclick = () => {
        const elem = document.getElementById('map-container-fullscreen'); // В HTML нужно добавить этот ID
        if (!document.fullscreenElement) {
            elem.requestFullscreen().catch(err => { alert(`Ошибка: ${err.message}`); });
        } else {
            document.exitFullscreen();
        }
    };

    loadDealers();
});
