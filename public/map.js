document.addEventListener('DOMContentLoaded', () => {
    const API_DEALERS_URL = '/api/dealers?view=map';
    const API_STATUSES_URL = '/api/statuses';
    const DEFAULT_LAT = 51.1605;
    const DEFAULT_LNG = 71.4704;

    const filterCity = document.getElementById('map-filter-city');
    const filterStatus = document.getElementById('map-filter-status');
    const searchInput = document.getElementById('map-search');
    const searchClear = document.getElementById('map-search-clear');
    const suggestionsBox = document.getElementById('map-search-suggestions');
    const btnResetFilters = document.getElementById('map-reset-filters');
    const btnFitVisible = document.getElementById('map-fit-visible');
    const btnFitMap = document.getElementById('btn-fit-map');
    const btnMyLocation = document.getElementById('btn-my-location');
    const btnToggleHeat = document.getElementById('btn-toggle-heat');
    const btnFullscreen = document.getElementById('btn-fullscreen');

    const sidebar = document.getElementById('map-sidebar');
    const dealerListContainer = document.getElementById('dealer-list-container');
    const btnShowListMobile = document.getElementById('btn-show-list-mobile');
    const btnCloseMapList = document.getElementById('btn-close-map-list');
    const visibleCountBadge = document.getElementById('map-visible-count');
    const listCaption = document.getElementById('map-list-caption');
    const summaryTotal = document.getElementById('map-summary-total');
    const summaryVisible = document.getElementById('map-summary-visible');
    const summaryMissing = document.getElementById('map-summary-missing');
    const mobileCount = document.getElementById('map-mobile-count');

    const toast = (message, type = 'info') => {
        if (window.showToast) window.showToast(message, type);
        else console.log(message);
    };

    const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    })[char]);

    const normalize = (value) => String(value || '').toLowerCase().replace(/ё/g, 'е').trim();

    if (typeof window.L === 'undefined') {
        const mapHost = document.getElementById('main-map');
        if (mapHost) {
            mapHost.innerHTML = `
                <div class="map-load-error">
                    <div>
                        <i class="bi bi-map"></i>
                        <strong>Карта не загрузилась</strong>
                        <span>Проверьте интернет-соединение и обновите страницу.</span>
                        <button type="button" onclick="window.location.reload()">Обновить</button>
                    </div>
                </div>`;
        }
        if (dealerListContainer) dealerListContainer.innerHTML = '<div class="map-empty-state"><i class="bi bi-wifi-off"></i><strong>Карта временно недоступна</strong></div>';
        return;
    }

    const map = L.map('main-map', {
        zoomControl: false,
        preferCanvas: true
    }).setView([DEFAULT_LAT, DEFAULT_LNG], 5);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
        maxZoom: 19
    }).addTo(map);

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    let allDealers = [];
    let filteredDealers = [];
    let statusList = [];
    let userLat = null;
    let userLng = null;
    let userMarker = null;
    let heatLayer = null;
    let isHeatmapMode = false;
    let activeDealerId = null;
    let addressLookupMarker = null;
    let addressLookupTimer = null;
    const markerByDealerId = new Map();

    const markersCluster = typeof L.markerClusterGroup === 'function'
        ? L.markerClusterGroup({
            showCoverageOnHover: false,
            maxClusterRadius: 48,
            spiderfyOnMaxZoom: true,
            removeOutsideVisibleBounds: true
        })
        : L.layerGroup();

    function getDistanceKm(lat1, lon1, lat2, lon2) {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) *
            Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    function getStatusInfo(status) {
        const found = statusList.find(item => item.value === status);
        if (found) return found;
        const fallback = {
            active: { label: 'Активный', color: '#198754' },
            standard: { label: 'Стандарт', color: '#d29b20' },
            problem: { label: 'Проблемный', color: '#dc3545' },
            potential: { label: 'Потенциальный', color: '#0d6efd' },
            archive: { label: 'Архив', color: '#6c757d' }
        };
        return fallback[status] || { label: status || 'Без статуса', color: '#777b82' };
    }

    function createPinIcon(status) {
        const info = getStatusInfo(status);
        const color = info.color || '#777b82';
        const svgHtml = `
            <div class="map-pin-shell">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 34 42" class="pin-svg" aria-hidden="true">
                    <path fill="${color}" d="M17 0C7.6 0 0 7.6 0 17c0 12.2 17 25 17 25s17-12.8 17-25C34 7.6 26.4 0 17 0z"/>
                    <circle cx="17" cy="17" r="7.2" fill="#fff"/>
                    <circle cx="17" cy="17" r="3.4" fill="${color}"/>
                </svg>
            </div>`;
        return L.divIcon({
            className: 'custom-pin map-pin-v2',
            html: svgHtml,
            iconSize: [34, 42],
            iconAnchor: [17, 42],
            popupAnchor: [0, -39]
        });
    }

    function getPrimaryPhone(dealer) {
        const contacts = Array.isArray(dealer.contacts) ? dealer.contacts : [];
        const raw = contacts.find(contact => contact && contact.contactInfo)?.contactInfo || '';
        const digits = raw.replace(/\D/g, '');
        return digits.length >= 10 ? digits : '';
    }

    function get2GisCitySlug(city) {
        const key = normalize(city);
        const cityMap = {
            'астана': 'astana',
            'нур-султан': 'astana',
            'алматы': 'almaty',
            'шымкент': 'shymkent',
            'караганда': 'karaganda',
            'қарағанды': 'karaganda',
            'костанай': 'kostanay',
            'қостанай': 'kostanay',
            'павлодар': 'pavlodar',
            'усть-каменогорск': 'ust-kamenogorsk',
            'оскемен': 'ust-kamenogorsk',
            'өскемен': 'ust-kamenogorsk',
            'семей': 'semey',
            'актобе': 'aktobe',
            'ақтөбе': 'aktobe',
            'атырау': 'atyrau',
            'актау': 'aktau',
            'ақтау': 'aktau',
            'тараз': 'taraz',
            'кызылорда': 'kyzylorda',
            'қызылорда': 'kyzylorda',
            'уральск': 'uralsk',
            'орал': 'uralsk',
            'петропавловск': 'petropavlovsk',
            'петропавл': 'petropavlovsk',
            'кокшетау': 'kokshetau',
            'көкшетау': 'kokshetau',
            'туркестан': 'turkestan',
            'түркістан': 'turkestan',
            'талдыкорган': 'taldykorgan',
            'талдықорған': 'taldykorgan',
            'экибастуз': 'ekibastuz'
        };
        return cityMap[key] || '';
    }

    function build2GisUrl(dealer) {
        const slug = get2GisCitySlug(dealer.city);
        const query = [dealer.name, dealer.address].filter(Boolean).join(' ') || dealer.city || 'IDEAL FLOOR';
        const encodedQuery = encodeURIComponent(query);
        const lat = Number(dealer.latitude);
        const lng = Number(dealer.longitude);
        const mapParam = Number.isFinite(lat) && Number.isFinite(lng)
            ? `?m=${lng},${lat}/17`
            : '';
        return slug
            ? `https://2gis.kz/${slug}/search/${encodedQuery}${mapParam}`
            : `https://2gis.kz/search/${encodedQuery}`;
    }

    function isDealerVisibleByStatus(dealer) {
        if (!statusList.length) return dealer.status !== 'archive';
        const status = statusList.find(item => item.value === dealer.status);
        return !status || status.isVisible !== false;
    }

    function populateStatusFilter() {
        if (!filterStatus) return;
        const visibleStatuses = statusList.filter(status => status.isVisible !== false);
        const options = visibleStatuses.length
            ? visibleStatuses
            : [
                { value: 'active', label: 'Активный' },
                { value: 'standard', label: 'Стандарт' },
                { value: 'problem', label: 'Проблемный' },
                { value: 'potential', label: 'Потенциальный' }
            ];

        filterStatus.innerHTML = '<option value="">Все статусы</option>' +
            options.map(status => `<option value="${escapeHtml(status.value)}">${escapeHtml(status.label)}</option>`).join('');
    }

    async function loadStatuses() {
        try {
            const response = await fetch(API_STATUSES_URL);
            if (response.ok) statusList = await response.json();
        } catch (error) {
            console.warn('Statuses load error', error);
        }
        populateStatusFilter();
    }

    async function loadDealers() {
        const response = await fetch(API_DEALERS_URL);
        if (!response.ok) throw new Error('Не удалось загрузить дилеров');
        allDealers = await response.json();

        const cities = [...new Set(allDealers.map(dealer => dealer.city).filter(Boolean))]
            .sort((a, b) => String(a).localeCompare(String(b), 'ru'));

        if (filterCity) {
            filterCity.innerHTML = '<option value="">Все города</option>';
            cities.forEach(city => filterCity.add(new Option(city, city)));
        }

        updateSummary();
    }

    function updateSummary() {
        const withCoordinates = allDealers.filter(dealer => Number(dealer.latitude) && Number(dealer.longitude));
        const missingCoordinates = allDealers.length - withCoordinates.length;
        if (summaryTotal) summaryTotal.textContent = String(allDealers.length);
        if (summaryMissing) summaryMissing.textContent = String(missingCoordinates);
    }

    function dealerMatchesSearch(dealer, query) {
        if (!query) return true;
        const contacts = (dealer.contacts || []).flatMap(contact => [
            contact?.name,
            contact?.position,
            contact?.contactInfo
        ]);
        const haystack = normalize([
            dealer.name,
            dealer.city,
            dealer.address,
            dealer.responsible,
            ...contacts
        ].filter(Boolean).join(' '));
        return haystack.includes(query);
    }

    function getFilteredDealers() {
        const city = filterCity?.value || '';
        const status = filterStatus?.value || '';
        const query = normalize(searchInput?.value || '');

        const result = allDealers.filter(dealer => {
            const lat = Number(dealer.latitude);
            const lng = Number(dealer.longitude);
            if (!Number.isFinite(lat) || !Number.isFinite(lng) || !lat || !lng) return false;
            if (!status && !isDealerVisibleByStatus(dealer)) return false;
            if (city && dealer.city !== city) return false;
            if (status && dealer.status !== status) return false;
            if (!dealerMatchesSearch(dealer, query)) return false;
            return true;
        });

        if (userLat && userLng) {
            result.forEach(dealer => {
                dealer._distance = getDistanceKm(userLat, userLng, Number(dealer.latitude), Number(dealer.longitude));
            });
            result.sort((a, b) => a._distance - b._distance);
        } else {
            result.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ru'));
        }

        return result;
    }

    function makePopupHtml(dealer) {
        const phone = getPrimaryPhone(dealer);
        const status = getStatusInfo(dealer.status);
        const twoGisUrl = build2GisUrl(dealer);
        const distance = dealer._distance !== undefined
            ? `<span class="map-popup-distance"><i class="bi bi-cursor"></i>${dealer._distance.toFixed(1)} км</span>`
            : '';

        return `
            <div class="map-popup-v2">
                <div class="map-popup-top">
                    <span class="map-popup-status-dot" style="background:${escapeHtml(status.color || '#777')}"></span>
                    <div>
                        <strong>${escapeHtml(dealer.name || 'Дилер')}</strong>
                        <span>${escapeHtml(status.label || 'Без статуса')}</span>
                    </div>
                    ${distance}
                </div>
                <div class="map-popup-address"><i class="bi bi-geo-alt"></i><span>${escapeHtml(dealer.address || dealer.city || 'Адрес не указан')}</span></div>
                <div class="map-popup-actions">
                    <a href="dealer.html?id=${encodeURIComponent(dealer.id)}" class="map-popup-primary">Профиль</a>
                    <a href="${twoGisUrl}" target="_blank" rel="noopener" class="map-popup-2gis"><i class="bi bi-box-arrow-up-right"></i>2ГИС</a>
                    ${phone ? `<a href="https://wa.me/${phone}" target="_blank" rel="noopener" class="map-popup-icon" aria-label="WhatsApp"><i class="bi bi-whatsapp"></i></a>` : ''}
                </div>
            </div>`;
    }

    function renderMapMarkers(dealers) {
        markerByDealerId.clear();
        markersCluster.clearLayers();
        if (map.hasLayer(markersCluster)) map.removeLayer(markersCluster);
        if (heatLayer && map.hasLayer(heatLayer)) map.removeLayer(heatLayer);

        if (isHeatmapMode && window.L.heatLayer) {
            heatLayer = L.heatLayer(
                dealers.map(dealer => [Number(dealer.latitude), Number(dealer.longitude), 1]),
                { radius: 42, blur: 32, minOpacity: 0.45, maxZoom: 13 }
            ).addTo(map);
        } else {
            dealers.forEach(dealer => {
                const marker = L.marker(
                    [Number(dealer.latitude), Number(dealer.longitude)],
                    { icon: createPinIcon(dealer.status || 'standard') }
                );
                marker.bindPopup(makePopupHtml(dealer), {
                    maxWidth: 330,
                    minWidth: 270,
                    closeButton: true
                });
                marker.on('click', () => setActiveDealer(dealer.id));
                markerByDealerId.set(String(dealer.id), marker);
                markersCluster.addLayer(marker);
            });
            markersCluster.addTo(map);
        }
    }

    function renderSideList(dealers) {
        if (!dealerListContainer) return;

        if (listCaption) listCaption.textContent = dealers.length
            ? `${dealers.length} ${dealers.length === 1 ? 'точка' : 'точек'} на карте`
            : 'Нет точек по выбранным условиям';

        if (!dealers.length) {
            dealerListContainer.innerHTML = `
                <div class="map-empty-state">
                    <i class="bi bi-search"></i>
                    <strong>Дилеры не найдены</strong>
                    <span>Измените поиск или сбросьте фильтры.</span>
                    <button type="button" data-map-reset>Сбросить фильтры</button>
                </div>`;
            return;
        }

        dealerListContainer.innerHTML = dealers.map(dealer => {
            const status = getStatusInfo(dealer.status);
            const distance = dealer._distance !== undefined
                ? `<span class="map-card-distance"><i class="bi bi-cursor"></i>${dealer._distance.toFixed(1)} км</span>`
                : '';
            const twoGisUrl = build2GisUrl(dealer);

            return `
                <article class="map-dealer-card ${String(activeDealerId) === String(dealer.id) ? 'active' : ''}" data-dealer-id="${escapeHtml(dealer.id)}">
                    <button type="button" class="map-dealer-main" data-map-focus="${escapeHtml(dealer.id)}">
                        <span class="map-card-status" style="background:${escapeHtml(status.color || '#777')}"></span>
                        <span class="map-card-copy">
                            <strong>${escapeHtml(dealer.name || 'Без названия')}</strong>
                            <span><i class="bi bi-geo-alt"></i>${escapeHtml(dealer.address || dealer.city || 'Адрес не указан')}</span>
                            <small>${escapeHtml(dealer.city || '')} · ${escapeHtml(status.label || 'Без статуса')}</small>
                        </span>
                        ${distance}
                    </button>
                    <div class="map-card-actions">
                        <a href="dealer.html?id=${encodeURIComponent(dealer.id)}"><i class="bi bi-person-vcard"></i>Профиль</a>
                        <a href="${twoGisUrl}" target="_blank" rel="noopener" class="is-2gis"><i class="bi bi-box-arrow-up-right"></i>Открыть в 2ГИС</a>
                    </div>
                </article>`;
        }).join('');
    }

    function updateCounters() {
        const count = filteredDealers.length;
        if (summaryVisible) summaryVisible.textContent = String(count);
        if (visibleCountBadge) visibleCountBadge.innerHTML = `<i class="bi bi-geo-alt-fill"></i><strong>${count}</strong><span>на карте</span>`;
        if (mobileCount) mobileCount.textContent = String(count);
    }

    function applyFilters({ fit = false } = {}) {
        filteredDealers = getFilteredDealers();
        renderMapMarkers(filteredDealers);
        renderSideList(filteredDealers);
        updateCounters();

        if (fit) fitVisibleDealers();
    }

    function fitVisibleDealers() {
        if (!filteredDealers.length) return;
        if (filteredDealers.length === 1) {
            const dealer = filteredDealers[0];
            map.flyTo([Number(dealer.latitude), Number(dealer.longitude)], 16, { duration: 0.55 });
            return;
        }
        const bounds = L.latLngBounds(filteredDealers.map(dealer => [
            Number(dealer.latitude),
            Number(dealer.longitude)
        ]));
        map.fitBounds(bounds, {
            padding: window.innerWidth < 768 ? [42, 96] : [58, 58],
            maxZoom: 13,
            animate: true
        });
    }

    function setActiveDealer(id) {
        activeDealerId = String(id);
        dealerListContainer?.querySelectorAll('.map-dealer-card').forEach(card => {
            card.classList.toggle('active', card.dataset.dealerId === activeDealerId);
        });
        const activeCard = dealerListContainer?.querySelector(`.map-dealer-card[data-dealer-id="${CSS.escape(activeDealerId)}"]`);
        activeCard?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    function focusDealer(id) {
        const dealer = filteredDealers.find(item => String(item.id) === String(id));
        if (!dealer) return;

        setActiveDealer(id);
        const marker = markerByDealerId.get(String(id));
        map.flyTo([Number(dealer.latitude), Number(dealer.longitude)], 16, { duration: 0.55 });

        if (marker && !isHeatmapMode) {
            setTimeout(() => {
                if (markersCluster.zoomToShowLayer) {
                    markersCluster.zoomToShowLayer(marker, () => marker.openPopup());
                } else {
                    marker.openPopup();
                }
            }, 320);
        }

        if (window.innerWidth < 768) closeMobileList();
    }

    function openMobileList() {
        if (!sidebar) return;
        sidebar.classList.add('open');
        document.body.classList.add('map-list-open');
    }

    function closeMobileList() {
        if (!sidebar) return;
        sidebar.classList.remove('open');
        document.body.classList.remove('map-list-open');
    }

    function resetFilters() {
        if (filterCity) filterCity.value = '';
        if (filterStatus) filterStatus.value = '';
        if (searchInput) searchInput.value = '';
        if (searchClear) searchClear.hidden = true;
        if (suggestionsBox) {
            suggestionsBox.innerHTML = '';
            suggestionsBox.classList.remove('show');
        }
        activeDealerId = null;
        applyFilters({ fit: true });
    }

    async function lookupAddress(query) {
        if (!suggestionsBox || query.length < 4) return;
        const localMatches = allDealers.filter(dealer => dealerMatchesSearch(dealer, normalize(query)));
        if (localMatches.length) {
            suggestionsBox.classList.remove('show');
            suggestionsBox.innerHTML = '';
            return;
        }

        try {
            const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&countrycodes=kz&limit=4&q=${encodeURIComponent(query)}`);
            if (!response.ok) return;
            const data = await response.json();
            if (!Array.isArray(data) || !data.length) {
                suggestionsBox.classList.remove('show');
                return;
            }

            suggestionsBox.innerHTML = `
                <div class="map-suggestion-label">Найти адрес на карте</div>
                ${data.map((place, index) => `
                    <button type="button" data-address-index="${index}">
                        <i class="bi bi-geo-alt"></i>
                        <span>${escapeHtml(place.display_name)}</span>
                    </button>`).join('')}`;
            suggestionsBox.dataset.results = JSON.stringify(data.map(place => ({
                lat: Number(place.lat),
                lon: Number(place.lon),
                name: place.display_name
            })));
            suggestionsBox.classList.add('show');
        } catch (error) {
            console.warn('Address lookup error', error);
        }
    }

    suggestionsBox?.addEventListener('click', event => {
        const button = event.target.closest('[data-address-index]');
        if (!button) return;
        const results = JSON.parse(suggestionsBox.dataset.results || '[]');
        const place = results[Number(button.dataset.addressIndex)];
        if (!place) return;

        if (addressLookupMarker) map.removeLayer(addressLookupMarker);
        map.flyTo([place.lat, place.lon], 16, { duration: 0.5 });
        addressLookupMarker = L.marker([place.lat, place.lon]).addTo(map)
            .bindPopup(`<strong>Найденный адрес</strong><br>${escapeHtml(place.name)}`)
            .openPopup();

        suggestionsBox.classList.remove('show');
    });

    dealerListContainer?.addEventListener('click', event => {
        const reset = event.target.closest('[data-map-reset]');
        if (reset) {
            resetFilters();
            return;
        }

        const focusButton = event.target.closest('[data-map-focus]');
        if (focusButton) focusDealer(focusButton.dataset.mapFocus);
    });

    filterCity?.addEventListener('change', () => applyFilters({ fit: true }));
    filterStatus?.addEventListener('change', () => applyFilters({ fit: true }));

    searchInput?.addEventListener('input', () => {
        const query = searchInput.value.trim();
        if (searchClear) searchClear.hidden = !query;
        applyFilters({ fit: false });

        clearTimeout(addressLookupTimer);
        if (suggestionsBox) suggestionsBox.classList.remove('show');
        addressLookupTimer = setTimeout(() => lookupAddress(query), 500);
    });

    searchInput?.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            suggestionsBox?.classList.remove('show');
            searchInput.blur();
        }
        if (event.key === 'Enter' && filteredDealers.length === 1) {
            event.preventDefault();
            focusDealer(filteredDealers[0].id);
        }
    });

    searchClear?.addEventListener('click', () => {
        searchInput.value = '';
        searchClear.hidden = true;
        suggestionsBox?.classList.remove('show');
        applyFilters({ fit: false });
        searchInput.focus();
    });

    btnResetFilters?.addEventListener('click', resetFilters);
    btnFitVisible?.addEventListener('click', fitVisibleDealers);
    btnFitMap?.addEventListener('click', fitVisibleDealers);

    btnToggleHeat?.addEventListener('click', () => {
        if (!window.L.heatLayer) {
            toast('Тепловая карта временно недоступна', 'warning');
            return;
        }
        isHeatmapMode = !isHeatmapMode;
        btnToggleHeat.classList.toggle('active', isHeatmapMode);
        btnToggleHeat.setAttribute('aria-pressed', String(isHeatmapMode));
        applyFilters({ fit: false });
        toast(isHeatmapMode ? 'Включена тепловая карта' : 'Включены маркеры дилеров', 'info');
    });

    btnMyLocation?.addEventListener('click', () => {
        if (!navigator.geolocation) {
            toast('Геолокация не поддерживается браузером', 'warning');
            return;
        }

        const original = btnMyLocation.innerHTML;
        btnMyLocation.disabled = true;
        btnMyLocation.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';

        navigator.geolocation.getCurrentPosition(position => {
            userLat = position.coords.latitude;
            userLng = position.coords.longitude;

            if (userMarker) map.removeLayer(userMarker);
            userMarker = L.circleMarker([userLat, userLng], {
                radius: 8,
                color: '#fff',
                weight: 3,
                fillColor: '#2f70ff',
                fillOpacity: 1
            }).addTo(map).bindPopup('Вы здесь');

            map.flyTo([userLat, userLng], 13, { duration: 0.55 });
            applyFilters({ fit: false });
            btnMyLocation.disabled = false;
            btnMyLocation.innerHTML = original;
            toast('Список отсортирован по расстоянию', 'success');
        }, () => {
            btnMyLocation.disabled = false;
            btnMyLocation.innerHTML = original;
            toast('Не удалось получить местоположение', 'warning');
        }, { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 });
    });

    btnFullscreen?.addEventListener('click', async () => {
        const element = document.getElementById('map-container-fullscreen');
        try {
            if (!document.fullscreenElement) await element.requestFullscreen();
            else await document.exitFullscreen();
            setTimeout(() => map.invalidateSize(), 150);
        } catch (error) {
            toast('Не удалось открыть карту на весь экран', 'warning');
        }
    });

    btnShowListMobile?.addEventListener('click', openMobileList);
    btnCloseMapList?.addEventListener('click', closeMobileList);

    document.addEventListener('click', event => {
        if (suggestionsBox && !event.target.closest('.map-search-shell') && !event.target.closest('.map-search-suggestions')) {
            suggestionsBox.classList.remove('show');
        }
    });

    window.addEventListener('resize', () => {
        if (window.innerWidth >= 768) closeMobileList();
        setTimeout(() => map.invalidateSize(), 100);
    });

    async function init() {
        try {
            if (window.CRMAuth?.ready) await CRMAuth.ready;
            if (window.CRMAuth && !CRMAuth.can('can_view_map')) return;

            await Promise.all([loadStatuses(), loadDealers()]);
            applyFilters({ fit: true });
        } catch (error) {
            console.error(error);
            if (dealerListContainer) {
                dealerListContainer.innerHTML = `
                    <div class="map-empty-state">
                        <i class="bi bi-exclamation-circle"></i>
                        <strong>Не удалось загрузить дилеров</strong>
                        <span>Обновите страницу или попробуйте позже.</span>
                    </div>`;
            }
            toast('Ошибка загрузки карты дилеров', 'error');
        }
    }

    init();
});
