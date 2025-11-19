document.addEventListener('DOMContentLoaded', () => {
    
    const API_DEALERS_URL = '/api/dealers';
    const API_PRODUCTS_URL = '/api/products'; 

    let fullProductCatalog = [];
    let allDealers = [];
    let currentSort = { column: 'name', direction: 'asc' };
    
    const posMaterialsList = [
        "С600 - 600мм задняя стенка",
        "С800 - 800мм задняя стенка",
        "РФ-2 - Расческа из фанеры",
        "РФС-1 - Расческа из фанеры СТАРАЯ",
        "Н600 - 600мм наклейка",
        "Н800 - 800мм наклейка",
        "Табличка - Табличка орг.стекло"
    ];

    // --- Модалки ---
    const addModalEl = document.getElementById('add-modal'); 
    const addModal = new bootstrap.Modal(addModalEl);
    const addForm = document.getElementById('add-dealer-form');
    
    const editModalEl = document.getElementById('edit-modal'); 
    const editModal = new bootstrap.Modal(editModalEl);
    const editForm = document.getElementById('edit-dealer-form');

    // --- Элементы ---
    const openAddModalBtn = document.getElementById('open-add-modal-btn');
    const addProductChecklist = document.getElementById('add-product-checklist'); 
    const addContactList = document.getElementById('add-contact-list'); 
    const addAddressList = document.getElementById('add-address-list'); 
    const addPosList = document.getElementById('add-pos-list');
    const addVisitsList = document.getElementById('add-visits-list');
    const addCompetitorList = document.getElementById('add-competitor-list');
    const addPhotoInput = document.getElementById('add-photo-input');
    const addPhotoPreviewContainer = document.getElementById('add-photo-preview-container');
    const addAvatarInput = document.getElementById('add-avatar-input');
    const addAvatarPreview = document.getElementById('add-avatar-preview');
    
    const dealerListBody = document.getElementById('dealer-list-body');
    const dealerTable = document.getElementById('dealer-table');
    const noDataMsg = document.getElementById('no-data-msg');
    const filterCity = document.getElementById('filter-city');
    const filterPriceType = document.getElementById('filter-price-type');
    const filterStatus = document.getElementById('filter-status');
    const filterResponsible = document.getElementById('filter-responsible');
    const searchBar = document.getElementById('search-bar'); 
    const exportBtn = document.getElementById('export-dealers-btn'); 
    
    const dashboardContainer = document.getElementById('dashboard-container');
    const tasksListUpcoming = document.getElementById('tasks-list-upcoming');
    const tasksListProblem = document.getElementById('tasks-list-problem');
    const tasksListCooling = document.getElementById('tasks-list-cooling');

    const editProductChecklist = document.getElementById('edit-product-checklist'); 
    const editContactList = document.getElementById('edit-contact-list'); 
    const editAddressList = document.getElementById('edit-address-list'); 
    const editPosList = document.getElementById('edit-pos-list');
    const editVisitsList = document.getElementById('edit-visits-list');
    const editCompetitorList = document.getElementById('edit-competitor-list');
    const editPhotoList = document.getElementById('edit-photo-list'); 
    const editPhotoInput = document.getElementById('edit-photo-input');
    const editPhotoPreviewContainer = document.getElementById('edit-photo-preview-container');
    const editAvatarInput = document.getElementById('edit-avatar-input');
    const editAvatarPreview = document.getElementById('edit-avatar-preview');
    const editCurrentAvatarUrl = document.getElementById('edit-current-avatar-url');

    let addPhotosData = []; 
    let editPhotosData = [];
    let newAvatarBase64 = null; 

    const getVal = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };
    const safeText = (text) => (text || '').toString().replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const safeAttr = (text) => (text || '').toString().replace(/"/g, '&quot;');
    const toBase64 = file => new Promise((resolve, reject) => { const reader = new FileReader(); reader.readAsDataURL(file); reader.onload = () => resolve(reader.result); reader.onerror = error => reject(error); });
    const compressImage = (file, maxWidth = 1000, quality = 0.7) => new Promise((resolve, reject) => { const reader = new FileReader(); reader.readAsDataURL(file); reader.onload = event => { const img = new Image(); img.src = event.target.result; img.onload = () => { const elem = document.createElement('canvas'); let width = img.width; let height = img.height; if (width > maxWidth) { height *= maxWidth / width; width = maxWidth; } elem.width = width; elem.height = height; const ctx = elem.getContext('2d'); ctx.drawImage(img, 0, 0, width, height); resolve(elem.toDataURL('image/jpeg', quality)); }; img.onerror = error => reject(error); }; reader.onerror = error => reject(error); });

    // --- Карта ---
    const DEFAULT_LAT = 51.1605; const DEFAULT_LNG = 71.4704;
    const CITY_COORDS = { "Астана": [51.1605, 71.4704], "Алматы": [43.2220, 76.8512], "Шымкент": [42.3417, 69.5901], "Караганда": [49.8020, 73.1021], "Актобе": [50.2839, 57.1670], "Тараз": [42.9000, 71.3667], "Павлодар": [52.2873, 76.9674], "Усть-Каменогорск": [49.9632, 82.6059], "Семей": [50.4113, 80.2275], "Атырау": [47.1167, 51.8833], "Костанай": [53.2148, 63.6321], "Кызылорда": [44.8488, 65.4823], "Уральск": [51.2333, 51.3667], "Петропавловск": [54.8753, 69.1622], "Актау": [43.6500, 51.1500] };
    let addMap, editMap;

    function initMap(mapId) {
        const el = document.getElementById(mapId); if (!el) return null;
        if (typeof L === 'undefined') { console.warn("Leaflet не загружен"); return null; }
        const map = L.map(mapId).setView([DEFAULT_LAT, DEFAULT_LNG], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: 'OSM' }).addTo(map);
        return map;
    }
    function setupMapClick(map, latId, lngId, markerRef) {
        if (!map) return;
        map.on('click', function(e) {
            const lat = e.latlng.lat; const lng = e.latlng.lng;
            const latIn = document.getElementById(latId); const lngIn = document.getElementById(lngId);
            if(latIn) latIn.value = lat; if(lngIn) lngIn.value = lng;
            if (markerRef.current) markerRef.current.setLatLng([lat, lng]); else markerRef.current = L.marker([lat, lng]).addTo(map);
        });
    }
    if (addModalEl) {
        addModalEl.addEventListener('shown.bs.modal', () => {
            if (!addMap) { addMap = initMap('add-map'); addModalEl.markerRef = { current: null }; setupMapClick(addMap, 'add_latitude', 'add_longitude', addModalEl.markerRef); } else { addMap.invalidateSize(); }
            if (addMap && addModalEl.markerRef && addModalEl.markerRef.current) { addMap.removeLayer(addModalEl.markerRef.current); addModalEl.markerRef.current = null; }
            if (addMap) {
                const city = document.getElementById('city') ? document.getElementById('city').value.trim() : '';
                if (city && CITY_COORDS[city]) addMap.setView(CITY_COORDS[city], 12); else addMap.setView([DEFAULT_LAT, DEFAULT_LNG], 13);
            }
        });
    }
    if (editModalEl) {
        editModalEl.addEventListener('shown.bs.modal', () => {
            if (!editMap) { editMap = initMap('edit-map'); editModalEl.markerRef = { current: null }; setupMapClick(editMap, 'edit_latitude', 'edit_longitude', editModalEl.markerRef); } else { editMap.invalidateSize(); }
            const latEl = document.getElementById('edit_latitude');
