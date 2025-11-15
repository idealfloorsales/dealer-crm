// map.js
document.addEventListener('DOMContentLoaded', async () => {
    const API_DEALERS_URL = '/api/dealers';
    
    // Координаты по умолчанию (Астана)
    const DEFAULT_LAT = 51.1605;
    const DEFAULT_LNG = 71.4704;

    // Проверяем, загрузилась ли библиотека Leaflet (L)
    if (typeof L === 'undefined') {
        console.error("Leaflet не загрузился!");
        document.getElementById('map').innerHTML = '<div class="alert alert-danger">Ошибка: Не удалось загрузить карту.</div>';
        return;
    }

    const map = L.map('map').setView([DEFAULT_LAT, DEFAULT_LNG], 12);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    // --- Кнопка "Найти меня" ---
    const locateControl = L.control({position: 'topleft'});
    locateControl.onAdd = function () {
        const div = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom');
        div.innerHTML = '<button class="btn btn-light btn-sm" style="width:34px;height:34px;display:flex;align-items:center;justify-content:center;padding:0;"><i class="bi bi-cursor-fill"></i></button>';
        div.onclick = (e) => {
            e.stopPropagation(); // Остановка клика, чтобы карта не среагировала
            map.locate({setView: true, maxZoom: 16});
        };
        return div;
    };
    locateControl.addTo(map);

    // Событие: Геопозиция найдена
    map.on('locationfound', (e) => {
        L.marker(e.latlng).addTo(map).bindPopup("Вы здесь").openPopup();
    });
    // Событие: Ошибка геопозиции
    map.on('locationerror', (e) => {
        alert("Не удалось определить вашу геопозицию.");
    });

    // --- Загрузка дилеров ---
    try {
        const response = await fetch(API_DEALERS_URL);
        if (!response.ok) throw new Error('Ошибка загрузки данных');
        const dealers = await response.json();

        const markers = L.featureGroup();
        let hasMarkers = false;

        dealers.forEach(d => {
            // Ставим маркер, только если есть обе координаты
            if (d.latitude && d.longitude) {
                const lat = parseFloat(d.latitude);
                const lng = parseFloat(d.longitude);

                if (!isNaN(lat) && !isNaN(lng)) {
                    const marker = L.marker([lat, lng]);
                    
                    const popupContent = `
                        <div style="text-align:center; min-width: 150px;">
                            <h6 style="margin-bottom:5px; font-weight: 600;">${d.name}</h6>
                            <small class="text-muted">${d.city || ''}</small><br>
                            <a href="dealer.html?id=${d.id}" target="_blank" class="btn btn-primary btn-sm mt-2 w-100">Открыть</a>
                        </div>
                    `;
                    
                    marker.bindPopup(popupContent);
                    markers.addLayer(marker);
                    hasMarkers = true;
                }
            }
        });

        // Если маркеры есть, центрируем карту по ним
        if (hasMarkers) {
            map.fitBounds(markers.getBounds(), { padding: [50, 50] });
        }

    } catch (error) {
        console.error("Ошибка загрузки дилеров на карту:", error);
        alert("Не удалось загрузить список дилеров на карту.");
    }
});
