// map.js
document.addEventListener('DOMContentLoaded', async () => {
    const API_DEALERS_URL = '/api/dealers';
    const map = L.map('map').setView([51.1605, 71.4704], 12); // Центр Астаны

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    // Кнопка "Я здесь"
    const locateControl = L.control({position: 'topleft'});
    locateControl.onAdd = function () {
        const div = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom');
        div.innerHTML = '<button class="btn btn-light btn-sm" style="width:34px;height:34px;display:flex;align-items:center;justify-content:center;"><i class="bi bi-cursor-fill"></i></button>';
        div.onclick = () => {
            map.locate({setView: true, maxZoom: 16});
        };
        return div;
    };
    locateControl.addTo(map);

    map.on('locationfound', (e) => {
        L.marker(e.latlng).addTo(map).bindPopup("Вы здесь").openPopup();
    });

    try {
        const response = await fetch(API_DEALERS_URL);
        if (!response.ok) throw new Error();
        const dealers = await response.json();

        const markers = L.featureGroup();

        dealers.forEach(d => {
            if (d.latitude && d.longitude) {
                const marker = L.marker([d.latitude, d.longitude]).addTo(map);
                
                const popupContent = `
                    <div style="text-align:center;">
                        <strong>${d.name}</strong><br>
                        <small>${d.address || ''}</small><br>
                        <a href="dealer.html?id=${d.id}" target="_blank" class="btn btn-primary btn-sm mt-2">Открыть</a>
                    </div>
                `;
                
                marker.bindPopup(popupContent);
                markers.addLayer(marker);
            }
        });

        if (markers.getLayers().length > 0) {
            map.fitBounds(markers.getBounds(), { padding: [50, 50] });
        }

    } catch (error) {
        console.error("Ошибка загрузки карты:", error);
    }
});
