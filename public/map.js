// map.js
document.addEventListener('DOMContentLoaded', () => {
    
    const API_URL = '/api/dealers';
    const DEFAULT_LAT = 51.1605; 
    const DEFAULT_LNG = 71.4704; // Астана центр

    // Элементы
    const filterCity = document.getElementById('map-filter-city');
    const filterStatus = document.getElementById('map-filter-status');
    const searchInput = document.getElementById('map-search');
    const suggestionsBox = document.getElementById('map-search-suggestions');
    const btnMyLocation = document.getElementById('btn-my-location');

    // Инициализация карты
    const map = L.map('main-map').setView([DEFAULT_LAT, DEFAULT_LNG], 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { 
        attribution: 'OSM',
        maxZoom: 19
    }).addTo(map);

    let allDealers = [];
    let markersLayer = L.layerGroup().addTo(map); // Группа для маркеров

    // --- Цвета для маркеров ---
    const statusColors = {
        'active': '#198754',   // Зеленый
        'standard': '#ffc107', // Желтый
        'problem': '#dc3545',  // Красный
        'potential': '#0d6efd', // Синий
        'archive': '#6c757d'   // Серый
    };

    // Функция создания цветной иконки (CSS-маркер)
    function createColorIcon(status) {
        const color = statusColors[status] || statusColors['standard'];
        return L.divIcon({
            className: 'custom-map-marker',
            html: `<div style="
                background-color: ${color};
                width: 14px;
                height: 14px;
                border-radius: 50%;
                border: 2px solid white;
                box-shadow: 0 2px 4px rgba(0,0,0,0.4);
            "></div>`,
            iconSize: [14, 14],
            iconAnchor: [7, 7] // Центр круга
        });
    }

    // --- Загрузка данных ---
    async function loadDealers() {
        try {
            const res = await fetch(API_URL);
            if(!res.ok) throw new Error('Error');
            allDealers = await res.json();
            
            // Заполняем фильтр городов
            const cities = [...new Set(allDealers.map(d => d.city).filter(Boolean))].sort();
            filterCity.innerHTML = '<option value="">-- Все города --</option>';
            cities.forEach(c => filterCity.add(new Option(c, c)));

            renderMarkers(); // Рисуем всех
        } catch (e) {
            console.error(e);
            alert("Ошибка загрузки карты");
        }
    }

    // --- Отрисовка маркеров ---
    function renderMarkers() {
        markersLayer.clearLayers(); // Очищаем старые

        const city = filterCity.value;
        const status = filterStatus.value;

        // Фильтрация
        const filtered = allDealers.filter(d => {
            if (!d.latitude || !d.longitude) return false;
            // Логика: Если статус не выбран - показываем всех, КРОМЕ архива (потенциальных показываем)
            // Если статус выбран - показываем только его
            let statusMatch = true;
            if (status) statusMatch = (d.status === status);
            else statusMatch = (d.status !== 'archive');

            return (!city || d.city === city) && statusMatch;
        });

        const bounds = L.latLngBounds(); // Чтобы зумировать карту на результат

        filtered.forEach(d => {
            const lat = d.latitude;
            const lng = d.longitude;
            
            const marker = L.marker([lat, lng], {
                icon: createColorIcon(d.status || 'standard')
            });

            // Попап (всплывающее окно)
            const popupContent = `
                <div style="text-align:center;">
                    <strong>${d.name}</strong><br>
                    <span class="text-muted" style="font-size:0.8rem">${d.address || ''}</span><br>
                    <a href="dealer.html?id=${d.id}" class="btn btn-sm btn-primary mt-2">Подробнее</a>
                </div>
            `;
            marker.bindPopup(popupContent);
            
            markersLayer.addLayer(marker);
            bounds.extend([lat, lng]);
        });

        // Если есть маркеры, зумируем на них
        if (filtered.length > 0) {
            map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
        }
    }

    // --- Обработчики фильтров ---
    filterCity.onchange = renderMarkers;
    filterStatus.onchange = renderMarkers;

    // --- Поиск адреса (Nominatim) ---
    let debounceTimer;
    searchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        const query = searchInput.value.trim();
        
        if (query.length < 3) {
            suggestionsBox.style.display = 'none';
            return;
        }

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
                            
                            // Перемещаем карту
                            map.setView([lat, lon], 16);
                            
                            // Добавляем временный маркер поиска
                            L.marker([lat, lon]).addTo(map)
                                .bindPopup("Вы искали здесь").openPopup();

                            searchInput.value = place.display_name;
                            suggestionsBox.style.display = 'none';
                        };
                        suggestionsBox.appendChild(div);
                    });
                } else {
                    suggestionsBox.style.display = 'none';
                }
            } catch (e) { console.error(e); }
        }, 500);
    });

    // Скрыть подсказки при клике вне
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.map-search-container')) {
            suggestionsBox.style.display = 'none';
        }
    });

    // --- Кнопка "Я тут" ---
    btnMyLocation.onclick = () => {
        if (navigator.geolocation) {
            btnMyLocation.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
            navigator.geolocation.getCurrentPosition(pos => {
                const { latitude, longitude } = pos.coords;
                map.setView([latitude, longitude], 15);
                L.marker([latitude, longitude]).addTo(map).bindPopup("Вы здесь").openPopup();
                btnMyLocation.innerHTML = '<i class="bi bi-crosshair"></i> Я тут';
            }, err => {
                alert("Не удалось определить местоположение");
                btnMyLocation.innerHTML = '<i class="bi bi-crosshair"></i> Я тут';
            });
        } else {
            alert("Браузер не поддерживает геолокацию");
        }
    };

    loadDealers();
});
