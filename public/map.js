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

    // Карта
    const map = L.map('main-map', { zoomControl: false }).setView([DEFAULT_LAT, DEFAULT_LNG], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { 
        attribution: '&copy; OSM', maxZoom: 19 
    }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    let allDealers = [];
    
    // --- УМНАЯ ГРУППИРОВКА (CLUSTERING) ---
    // Создаем слой кластеров вместо обычного слоя
    let markersLayer = L.markerClusterGroup({
        showCoverageOnHover: false,
        maxClusterRadius: 50, // Радиус объединения
    });
    map.addLayer(markersLayer);

    const statusColors = {
        'active': '#198754',   
        'standard': '#ffc107', 
        'problem': '#dc3545',  
        'potential': '#0d6efd',
        'archive': '#6c757d'
    };

    // --- SVG PIN ICON (КРАСИВАЯ БУЛАВКА) ---
    function createPinIcon(status) {
        const color = statusColors[status] || '#ffc107';
        
        // SVG код иконки-капли
        const svgHtml = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${color}" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="pin-svg">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
              <circle cx="12" cy="10" r="3" fill="white"></circle>
            </svg>
        `;

        return L.divIcon({
            className: 'custom-pin', // Класс для анимации CSS
            html: svgHtml,
            iconSize: [36, 36], // Размер
            iconAnchor: [18, 36], // Острие пина (внизу по центру)
            popupAnchor: [0, -32] // Попап открывается над пином
        });
    }

    async function loadDealers() {
        try {
            const res = await fetch(API_URL);
            if(!res.ok) throw new Error('Error');
            allDealers = await res.json();
            
            const cities = [...new Set(allDealers.map(d => d.city).filter(Boolean))].sort();
            filterCity.innerHTML = '<option value="">Все города</option>';
            cities.forEach(c => filterCity.add(new Option(c, c)));

            renderMarkers();
        } catch (e) { console.error(e); }
    }

    function renderMarkers() {
        markersLayer.clearLayers();

        const city = filterCity.value;
        const status = filterStatus.value;

        const filtered = allDealers.filter(d => {
            if (!d.latitude || !d.longitude) return false;
            let statusMatch = true;
            if (status) statusMatch = (d.status === status);
            else statusMatch = (d.status !== 'archive'); // По умолчанию архив скрыт
            return (!city || d.city === city) && statusMatch;
        });

        const bounds = L.latLngBounds();

        filtered.forEach(d => {
            const lat = d.latitude;
            const lng = d.longitude;
            
            // Создаем маркер с новой иконкой
            const marker = L.marker([lat, lng], {
                icon: createPinIcon(d.status || 'standard')
            });

            // Красивый попап
            const phone = d.contacts && d.contacts[0] && d.contacts[0].contactInfo ? d.contacts[0].contactInfo.replace(/[^0-9]/g, '') : null;
            const waLink = phone ? `https://wa.me/${phone}` : '#';
            const navLink = `https://yandex.kz/maps/?pt=${lng},${lat}&z=17&l=map`;

            const popupContent = `
                <div class="popup-header">${d.name}</div>
                <div class="popup-body">
                    <div style="margin-bottom:5px;"><i class="bi bi-geo-alt text-muted"></i> ${d.address || 'Адрес не указан'}</div>
                    ${d.city ? `<span class="badge bg-light text-dark border">${d.city}</span>` : ''}
                </div>
                <div class="popup-footer">
                    <a href="dealer.html?id=${d.id}" class="btn btn-sm btn-primary flex-fill" target="_blank">Профиль</a>
                    ${phone ? `<a href="${waLink}" class="btn btn-sm btn-success" target="_blank"><i class="bi bi-whatsapp"></i></a>` : ''}
                    <a href="${navLink}" class="btn btn-sm btn-outline-secondary" target="_blank"><i class="bi bi-map"></i></a>
                </div>
            `;
            
            marker.bindPopup(popupContent);
            markersLayer.addLayer(marker); // Добавляем в кластер, а не напрямую в карту
            bounds.extend([lat, lng]);
        });

        if (filtered.length > 0) {
            map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
        }
    }

    filterCity.onchange = renderMarkers;
    filterStatus.onchange = renderMarkers;

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
                            const lat = parseFloat(place.lat);
                            const lon = parseFloat(place.lon);
                            map.setView([lat, lon], 16);
                            L.marker([lat, lon]).addTo(map).bindPopup("Вы искали здесь").openPopup();
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
            btnMyLocation.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
            navigator.geolocation.getCurrentPosition(pos => {
                const { latitude, longitude } = pos.coords;
                map.setView([latitude, longitude], 15);
                L.circleMarker([latitude, longitude], {radius: 8, color: '#3388ff', fillOpacity: 0.8}).addTo(map).bindPopup("Вы здесь").openPopup();
                btnMyLocation.innerHTML = '<i class="bi bi-geo-alt-fill"></i>';
            }, () => {
                alert("Ошибка геопозиции");
                btnMyLocation.innerHTML = '<i class="bi bi-geo-alt-fill"></i>';
            });
        }
    };

    loadDealers();
});
