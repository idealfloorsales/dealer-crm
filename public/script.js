document.addEventListener('DOMContentLoaded', () => {
    
    // --- АВТО-ВСТАВКА ТОКЕНА ---
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

    const API_DEALERS_URL = '/api/dealers';
    const API_PRODUCTS_URL = '/api/products'; 
    const API_COMPETITORS_REF_URL = '/api/competitors-ref';
    const API_STATUSES_URL = '/api/statuses';
    const API_TASKS_URL = '/api/tasks';
    const API_SALES_URL = '/api/sales';

    let fullProductCatalog = [];
    let competitorsRef = []; 
    let allDealers = [];
    let statusList = []; 
    let allTasksData = [];
    let currentMonthSales = [];
    
    let currentSort = { column: 'name', direction: 'asc' };
    let isSaving = false; 
    let addPhotosData = []; 
    let editPhotosData = []; 
    let newAvatarBase64 = null; 
    let currentUserRole = 'guest';

    // --- DASHBOARD CONFIG ---
    const defaultDashConfig = {
        showHealth: true,
        showGrowth: true,
        showCityPen: true,
        showMatrix: false,
        showVisits: false
    };
    let dashConfig = JSON.parse(localStorage.getItem('dash_config')) || defaultDashConfig;

    // СПИСОК POS-МАТЕРИАЛОВ (Они будут в выпадающем списке Стендов, но СКРЫТЫ из Матрицы товаров)
    const posMaterialsList = [
        "С600 - 600мм задняя стенка", 
        "С800 - 800мм задняя стенка", 
        "РФ-2 - Расческа из фанеры", 
        "РФС-1 - Расческа из фанеры СТАРАЯ", 
        "Н600 - 600мм наклейка", 
        "Н800 - 800мм наклейка", 
        "Табличка - Табличка орг.стекло"
    ];

    // ELEMENTS
    const addModalEl = document.getElementById('add-modal'); const addModal = new bootstrap.Modal(addModalEl, { backdrop: 'static', keyboard: false }); const addForm = document.getElementById('add-dealer-form');
    const editModalEl = document.getElementById('edit-modal'); const editModal = new bootstrap.Modal(editModalEl, { backdrop: 'static', keyboard: false }); const editForm = document.getElementById('edit-dealer-form');
    const qvModalEl = document.getElementById('quick-visit-modal'); const qvModal = new bootstrap.Modal(qvModalEl, { backdrop: 'static', keyboard: false }); const qvForm = document.getElementById('quick-visit-form');
    const statusModalEl = document.getElementById('status-manager-modal'); const statusModal = statusModalEl ? new bootstrap.Modal(statusModalEl) : null; const btnManageStatuses = document.getElementById('btn-manage-statuses'); const statusForm = document.getElementById('status-form'); const statusListContainer = document.getElementById('status-manager-list');
    
    // Settings & Nav Elements
    const btnDashSettings = document.getElementById('btn-dash-settings');
    const settingsModalElement = document.getElementById('dashboard-settings-modal');
    const settingsModal = settingsModalElement ? new bootstrap.Modal(settingsModalElement) : null;

    const openAddModalBtn = document.getElementById('open-add-modal-btn');
    const brandsDatalist = document.getElementById('brands-datalist');
    const posDatalist = document.getElementById('pos-materials-datalist');
    const dealerGrid = document.getElementById('dealer-grid'); 
    const dashboardStats = document.getElementById('dashboard-stats');
    
    const addProductChecklist = document.getElementById('add-product-checklist'); const addContactList = document.getElementById('add-contact-list'); const addAddressList = document.getElementById('add-address-list'); const addPosList = document.getElementById('add-pos-list'); const addVisitsList = document.getElementById('add-visits-list'); const addCompetitorList = document.getElementById('add-competitor-list'); const addPhotoInput = document.getElementById('add-photo-input'); const addPhotoPreviewContainer = document.getElementById('add-photo-preview-container'); const addAvatarInput = document.getElementById('add-avatar-input'); const addAvatarPreview = document.getElementById('add-avatar-preview');
    const editProductChecklist = document.getElementById('edit-product-checklist'); const editContactList = document.getElementById('edit-contact-list'); const editAddressList = document.getElementById('edit-address-list'); const editPosList = document.getElementById('edit-pos-list'); const editVisitsList = document.getElementById('edit-visits-list'); const editCompetitorList = document.getElementById('edit-competitor-list'); const editPhotoInput = document.getElementById('edit-photo-input'); const editPhotoPreviewContainer = document.getElementById('edit-photo-preview-container'); const editAvatarInput = document.getElementById('edit-avatar-input'); const editAvatarPreview = document.getElementById('edit-avatar-preview'); const editCurrentAvatarUrl = document.getElementById('edit-current-avatar-url');
    
    const filterCity = document.getElementById('filter-city'); const filterPriceType = document.getElementById('filter-price-type'); const filterStatus = document.getElementById('filter-status'); const filterResponsible = document.getElementById('filter-responsible'); const searchBar = document.getElementById('search-bar'); 
    const btnExportDealers = document.getElementById('export-dealers-btn'); const btnExportCompetitors = document.getElementById('export-competitors-prices-btn');
    
    const addOrgList = document.getElementById('add-org-list'); const editOrgList = document.getElementById('edit-org-list'); const btnAddOrgAdd = document.getElementById('btn-add-org-add'); const btnEditOrgAdd = document.getElementById('btn-edit-org-add');
    const logoutBtn = document.getElementById('logout-btn');

    let mapInstances = { add: null, edit: null };
    let markerInstances = { add: null, edit: null };
    let refreshAddMap = null; let refreshEditMap = null;

    // HELPERS
    const getVal = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };
    const safeText = (text) => (text || '').toString().replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const safeAttr = (text) => (text || '').toString().replace(/"/g, '&quot;');
    const compressImage = (file, maxWidth = 1000, quality = 0.7) => new Promise((resolve, reject) => { const reader = new FileReader(); reader.readAsDataURL(file); reader.onload = event => { const img = new Image(); img.src = event.target.result; img.onload = () => { const elem = document.createElement('canvas'); let width = img.width; let height = img.height; if (width > maxWidth) { height *= maxWidth / width; width = maxWidth; } elem.width = width; elem.height = height; const ctx = elem.getContext('2d'); ctx.drawImage(img, 0, 0, width, height); resolve(elem.toDataURL('image/jpeg', quality)); }; img.onerror = error => reject(error); }; reader.onerror = error => reject(error); });
    function cleanCsv(text) { return `"${String(text || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`; }
    function downloadCsv(content, filename) { const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); document.body.removeChild(a); }
    function createContactEntryHTML(c={}) { return `<div class="contact-entry"><input type="text" class="form-control contact-name" placeholder="Имя" value="${c.name||''}"><input type="text" class="form-control contact-position" placeholder="Должность" value="${c.position||''}"><input type="text" class="form-control contact-info" placeholder="Телефон" value="${c.contactInfo||''}"><button type="button" class="btn-remove-entry" onclick="this.closest('.contact-entry').remove()"><i class="bi bi-x-lg"></i></button></div>`; }
    function createAddressEntryHTML(a={}) { return `<div class="address-entry"><input type="text" class="form-control address-description" placeholder="Описание" value="${a.description||''}"><input type="text" class="form-control address-city" placeholder="Город" value="${a.city||''}"><input type="text" class="form-control address-address" placeholder="Адрес" value="${a.address||''}"><button type="button" class="btn-remove-entry" onclick="this.closest('.address-entry').remove()"><i class="bi bi-x-lg"></i></button></div>`; }
    function createVisitEntryHTML(v={}) { return `<div class="visit-entry"><input type="date" class="form-control visit-date" value="${v.date||''}"><input type="text" class="form-control visit-comment w-50" placeholder="Результат..." value="${v.comment||''}"><button type="button" class="btn-remove-entry" onclick="this.closest('.visit-entry').remove()"><i class="bi bi-x-lg"></i></button></div>`; }
    function renderPhotoPreviews(container, photosArray) { if(container) container.innerHTML = photosArray.map((p, index) => `<div class="photo-preview-item"><img src="${p.photo_url}"><button type="button" class="btn-remove-photo" data-index="${index}"><i class="bi bi-x"></i></button></div>`).join(''); }
    function createPosEntryHTML(p={}) { return `<div class="pos-entry"><input type="text" class="form-control pos-name" list="pos-materials-datalist" placeholder="Название стенда" value="${safeAttr(p.name||'')}" autocomplete="off"><input type="number" class="form-control pos-quantity" value="${p.quantity||1}" min="1" placeholder="Шт"><button type="button" class="btn-remove-entry" onclick="this.closest('.pos-entry').remove()" title="Удалить"><i class="bi bi-x-lg"></i></button></div>`; }
    function createCompetitorEntryHTML(c={}) { let brandOpts = `<option value="">-- Бренд --</option>`; competitorsRef.forEach(ref => { const sel = ref.name === c.brand ? 'selected' : ''; brandOpts += `<option value="${ref.name}" ${sel}>${ref.name}</option>`; }); let collOpts = `<option value="">-- Коллекция --</option>`; if (c.brand) { const ref = competitorsRef.find(r => r.name === c.brand); if (ref && ref.collections) { const sortedCols = [...ref.collections].sort((a, b) => { const typeA = (typeof a === 'object') ? a.type : 'std'; const typeB = (typeof b === 'object') ? b.type : 'std'; if (typeA === 'std' && typeB !== 'std') return 1; if (typeA !== 'std' && typeB === 'std') return -1; return 0; }); sortedCols.forEach(col => { const colName = (typeof col === 'string') ? col : col.name; const colType = (typeof col === 'object') ? col.type : 'std'; let label = ''; if(colType.includes('eng')) label = ' (Елка)'; else if(colType.includes('french')) label = ' (Фр. Елка)'; else if(colType.includes('art')) label = ' (Арт)'; const sel = colName === c.collection ? 'selected' : ''; collOpts += `<option value="${colName}" ${sel}>${colName}${label}</option>`; }); } } return `<div class="competitor-entry"><select class="form-select competitor-brand" onchange="updateCollections(this)">${brandOpts}</select><select class="form-select competitor-collection">${collOpts}</select><input type="text" class="form-control competitor-price-opt" placeholder="ОПТ" value="${c.price_opt||''}"><input type="text" class="form-control competitor-price-retail" placeholder="Розн" value="${c.price_retail||''}"><button type="button" class="btn-remove-entry" onclick="this.closest('.competitor-entry').remove()" title="Удалить"><i class="bi bi-x-lg"></i></button></div>`; }
    function createOrgInputHTML(value='') { return `<div class="input-group mb-1 org-entry"><input type="text" class="form-control org-input" placeholder="Юр. лицо" value="${safeAttr(value)}"><button type="button" class="btn btn-outline-danger" onclick="this.closest('.org-entry').remove()">X</button></div>`; }
    window.updateCollections = function(select) { const brandName = select.value; const row = select.closest('.competitor-entry'); const collSelect = row.querySelector('.competitor-collection'); let html = `<option value="">-- Коллекция --</option>`; const ref = competitorsRef.find(r => r.name === brandName); if (ref && ref.collections) { const sortedCols = [...ref.collections].sort((a, b) => { const typeA = (typeof a === 'object') ? a.type : 'std'; const typeB = (typeof b === 'object') ? b.type : 'std'; if (typeA === 'std' && typeB !== 'std') return 1; if (typeA !== 'std' && typeB === 'std') return -1; return 0; }); html += sortedCols.map(col => { const colName = (typeof col === 'string') ? col : col.name; const colType = (typeof col === 'object') ? col.type : 'std'; let label = ''; if(colType.includes('eng')) label = ' (Елка)'; else if(colType.includes('french')) label = ' (Фр. Елка)'; else if(colType.includes('art')) label = ' (Арт)'; return `<option value="${colName}">${colName}${label}</option>`; }).join(''); } collSelect.innerHTML = html; };
    window.showToast = function(message, type = 'success') { let container = document.getElementById('toast-container-custom'); if (!container) { container = document.createElement('div'); container.id = 'toast-container-custom'; container.className = 'toast-container-custom'; document.body.appendChild(container); } const toast = document.createElement('div'); toast.className = `toast-modern toast-${type}`; const icon = type === 'success' ? 'check-circle-fill' : (type === 'error' ? 'exclamation-triangle-fill' : 'info-circle-fill'); toast.innerHTML = `<i class="bi bi-${icon} fs-5"></i><span class="fw-bold text-dark">${message}</span>`; container.appendChild(toast); setTimeout(() => { toast.style.animation = 'toastFadeOut 0.5s forwards'; setTimeout(() => toast.remove(), 500); }, 3000); };
    window.toggleSectorSelect = function(prefix, responsibleValue) { const sectorSelect = document.getElementById(`${prefix}_region_sector`); if (responsibleValue === 'regional_regions') { sectorSelect.style.display = 'block'; } else { sectorSelect.style.display = 'none'; sectorSelect.value = ''; } };
    
    // --- ИЗМЕНЕННАЯ ФУНКЦИЯ RENDERPRODUCTCHECKLIST (С ФИЛЬТРОМ POS) ---
    function renderProductChecklist(container, selectedIds=[]) { 
        if(!container) return; 
        const set = new Set(selectedIds); 
        
        // Фильтруем каталог: убираем POS-материалы из списка товаров
        const filteredCatalog = fullProductCatalog.filter(p => !posMaterialsList.includes(p.name));
        
        container.innerHTML = filteredCatalog.map(p => 
            `<div class="checklist-item form-check">
                <input type="checkbox" class="form-check-input" id="prod-${container.id}-${p.id}" value="${p.id}" ${set.has(p.id)?'checked':''}>
                <label class="form-check-label" for="prod-${container.id}-${p.id}"><strong>${p.sku}</strong> - ${p.name}</label>
             </div>`
        ).join(''); 
    }
    // -------------------------------------------------------------------

    function getSelectedProductIds(containerId) { const el=document.getElementById(containerId); if(!el) return []; return Array.from(el.querySelectorAll('input:checked')).map(cb=>cb.value); }
    function collectData(container, selector, fields) { if (!container) return []; const data = []; container.querySelectorAll(selector).forEach(entry => { const item = {}; let hasData = false; fields.forEach(f => { const inp = entry.querySelector(f.class); if(inp){item[f.key]=inp.value; if(item[f.key]) hasData=true;} }); if(hasData) data.push(item); }); return data; }
    function renderList(container, data, htmlGen) { if(container) container.innerHTML = (data && data.length > 0) ? data.map(htmlGen).join('') : htmlGen(); }
    function collectOrgs(container) { const orgs = []; container.querySelectorAll('.org-input').forEach(inp => { if(inp.value.trim()) orgs.push(inp.value.trim()); }); return orgs; }

    // --- BUTTONS SETUP ---
    const setupListBtn = (id, list, genFunc) => { const btn = document.getElementById(id); if(btn) btn.onclick = () => list.insertAdjacentHTML('beforeend', genFunc()); };
    setupListBtn('add-contact-btn-add-modal', addContactList, createContactEntryHTML); setupListBtn('add-address-btn-add-modal', addAddressList, createAddressEntryHTML); setupListBtn('add-pos-btn-add-modal', addPosList, createPosEntryHTML); setupListBtn('add-visits-btn-add-modal', addVisitsList, createVisitEntryHTML); setupListBtn('add-competitor-btn-add-modal', addCompetitorList, createCompetitorEntryHTML);
    setupListBtn('add-contact-btn-edit-modal', editContactList, createContactEntryHTML); setupListBtn('add-address-btn-edit-modal', editAddressList, createAddressEntryHTML); setupListBtn('add-pos-btn-edit-modal', editPosList, createPosEntryHTML); setupListBtn('add-visits-btn-edit-modal', editVisitsList, createVisitEntryHTML); setupListBtn('add-competitor-btn-edit-modal', editCompetitorList, createCompetitorEntryHTML);

    if(btnAddOrgAdd) btnAddOrgAdd.onclick = () => addOrgList.insertAdjacentHTML('beforeend', createOrgInputHTML());
    if(btnEditOrgAdd) btnEditOrgAdd.onclick = () => editOrgList.insertAdjacentHTML('beforeend', createOrgInputHTML());

    if(addAvatarInput) addAvatarInput.addEventListener('change', async (e) => { const file = e.target.files[0]; if (file) { newAvatarBase64 = await compressImage(file, 800, 0.8); addAvatarPreview.src = newAvatarBase64; addAvatarPreview.style.display='block'; } });
    if(editAvatarInput) editAvatarInput.addEventListener('change', async (e) => { const file = e.target.files[0]; if (file) { newAvatarBase64 = await compressImage(file, 800, 0.8); editAvatarPreview.src = newAvatarBase64; editAvatarPreview.style.display='block'; } });
    if(addPhotoInput) addPhotoInput.addEventListener('change', async (e) => { for (let file of e.target.files) addPhotosData.push({ photo_url: await compressImage(file, 1000, 0.7) }); renderPhotoPreviews(addPhotoPreviewContainer, addPhotosData); addPhotoInput.value = ''; });
    if(addPhotoPreviewContainer) addPhotoPreviewContainer.addEventListener('click', (e) => { const btn = e.target.closest('.btn-remove-photo'); if(btn) { addPhotosData.splice(btn.dataset.index, 1); renderPhotoPreviews(addPhotoPreviewContainer, addPhotosData); } });
    if(editPhotoInput) editPhotoInput.addEventListener('change', async (e) => { for (let file of e.target.files) editPhotosData.push({ photo_url: await compressImage(file, 1000, 0.7) }); renderPhotoPreviews(editPhotoPreviewContainer, editPhotosData); editPhotoInput.value = ''; });
    if(editPhotoPreviewContainer) editPhotoPreviewContainer.addEventListener('click', (e) => { const btn = e.target.closest('.btn-remove-photo'); if(btn) { editPhotosData.splice(btn.dataset.index, 1); renderPhotoPreviews(editPhotoPreviewContainer, editPhotosData); } });

    if (logoutBtn) { 
        logoutBtn.onclick = () => { 
            localStorage.removeItem('crm_token');
            localStorage.removeItem('crm_user');
            window.location.href = '/login.html'; 
        }; 
    }
    
    if(document.body) { document.body.addEventListener('click', (e) => { const taskBtn = e.target.closest('.btn-complete-task'); if (taskBtn) { taskBtn.disabled = true; taskBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>'; completeTask(taskBtn, taskBtn.dataset.id, taskBtn.dataset.index); } }); }
    document.querySelectorAll('.sort-btn').forEach(btn => { btn.onclick = (e) => { const sortKey = e.currentTarget.dataset.sort; if(currentSort.column === sortKey) currentSort.direction = (currentSort.direction === 'asc' ? 'desc' : 'asc'); else { currentSort.column = sortKey; currentSort.direction = 'asc'; } renderDealerList(); }; });

    if(btnManageStatuses) { btnManageStatuses.onclick = () => { resetStatusForm(); statusModal.show(); }; }

    function setupMapLogic(mapId, latId, lngId, searchId, btnSearchId, btnLocId, instanceKey) {
        const mapEl = document.getElementById(mapId); if (!mapEl) return;
        if (!mapInstances[instanceKey]) {
            const map = L.map(mapId).setView([51.1605, 71.4704], 12);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: 'OSM' }).addTo(map);
            mapInstances[instanceKey] = map;
            map.on('click', (e) => { setMarker(e.latlng.lat, e.latlng.lng, instanceKey, latId, lngId); });
        }
        const map = mapInstances[instanceKey];
        function setMarker(lat, lng, key, latInputId, lngInputId) {
            if (markerInstances[key]) map.removeLayer(markerInstances[key]);
            markerInstances[key] = L.marker([lat, lng], { draggable: true }).addTo(map);
            document.getElementById(latInputId).value = lat.toFixed(6);
            document.getElementById(lngInputId).value = lng.toFixed(6);
            markerInstances[key].on('dragend', function(event) { const pos = event.target.getLatLng(); document.getElementById(latInputId).value = pos.lat.toFixed(6); document.getElementById(lngInputId).value = pos.lng.toFixed(6); });
            map.setView([lat, lng], 16);
        }
        const handleSearch = async () => {
            const input = document.getElementById(searchId); const query = input.value.trim(); if (!query) return;
            const coordsRegex = /^(-?\d+(\.\d+)?)[,\s]+(-?\d+(\.\d+)?)$/; const match = query.match(coordsRegex);
            if (match) { const lat = parseFloat(match[1]); const lng = parseFloat(match[3]); setMarker(lat, lng, instanceKey, latId, lngId); window.showToast("Координаты приняты!"); } 
            else { try { const btn = document.getElementById(btnSearchId); const oldHtml = btn.innerHTML; btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>'; const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=kz&limit=1`); const data = await res.json(); if (data && data.length > 0) { const lat = parseFloat(data[0].lat); const lng = parseFloat(data[0].lon); setMarker(lat, lng, instanceKey, latId, lngId); } else { alert("Адрес не найден."); } btn.innerHTML = oldHtml; } catch (e) { console.error(e); } }
        };
        const searchBtn = document.getElementById(btnSearchId); const searchInp = document.getElementById(searchId);
        if(searchBtn) searchBtn.onclick = handleSearch;
        if(searchInp) searchInp.addEventListener('keypress', (e) => { if (e.key === 'Enter') { e.preventDefault(); handleSearch(); } });
        const locBtn = document.getElementById(btnLocId);
        if(locBtn) { locBtn.onclick = () => { if (navigator.geolocation) { locBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>'; navigator.geolocation.getCurrentPosition(pos => { setMarker(pos.coords.latitude, pos.coords.longitude, instanceKey, latId, lngId); locBtn.innerHTML = '<i class="bi bi-geo-alt-fill"></i>'; }, () => { alert("Нет доступа к геопозиции"); locBtn.innerHTML = '<i class="bi bi-geo-alt-fill"></i>'; }); } }; }
        return function invalidate() { setTimeout(() => { map.invalidateSize(); const curLat = parseFloat(document.getElementById(latId).value); const curLng = parseFloat(document.getElementById(lngId).value); if (!isNaN(curLat) && !isNaN(curLng)) { setMarker(curLat, curLng, instanceKey, latId, lngId); } }, 300); };
    }
    refreshAddMap = setupMapLogic('add-map', 'add_latitude', 'add_longitude', 'add-smart-search', 'btn-search-add', 'btn-loc-add', 'add');
    refreshEditMap = setupMapLogic('edit-map', 'edit_latitude', 'edit_longitude', 'edit-smart-search', 'btn-search-edit', 'btn-loc-edit', 'edit');

    // --- MAIN LOGIC ---
    async function initApp() {
        try {
            console.log("Starting app init...");
            // 1. Auth
            try { const authRes = await fetch('/api/auth/me'); if (authRes.ok) { const authData = await authRes.json(); currentUserRole = authData.user ? authData.user.role : 'guest'; const badge = document.getElementById('user-role-badge'); if(badge) { const names = { 'admin': 'Админ', 'astana': 'Астана', 'regions': 'Регионы', 'guest': 'Гость' }; badge.textContent = names[currentUserRole] || currentUserRole; } if (currentUserRole === 'guest') { if (openAddModalBtn) openAddModalBtn.style.display = 'none'; } } } catch (e) {}

            // 2. Load Dictionaries
            await Promise.all([
                fetchStatuses(),
                fetchProductCatalog(),
                updatePosDatalist()
            ]);

            try { const compRes = await fetch(API_COMPETITORS_REF_URL); if (compRes.ok) { competitorsRef = await compRes.json(); updateBrandsDatalist(); } } catch(e){}

            // 3. Load Main Data
            console.log("Fetching main data...");
            await Promise.all([
                fetchDealers(),
                fetchTasks(),
                fetchCurrentMonthSales()
            ]);

            // 4. Render
            populateFilters(allDealers);
            renderDashboard(); 
            renderDealerList();
            
            const pendingId = localStorage.getItem('pendingEditDealerId'); if (pendingId) { localStorage.removeItem('pendingEditDealerId'); openEditModal(pendingId); }

        } catch (error) {
            console.error("CRITICAL ERROR:", error);
            if(dealerGrid) {
                dealerGrid.innerHTML = `
                <div class="alert alert-danger text-center m-5 shadow-sm p-4 rounded-4 border-0">
                    <h1 class="display-6 text-danger mb-3"><i class="bi bi-wifi-off"></i></h1>
                    <h4 class="fw-bold">Не удалось загрузить данные</h4>
                    <p class="mb-3">Сервер не отвечает или произошла ошибка обработки.</p>
                    <div class="p-2 bg-white rounded border d-inline-block text-start mb-3"><small class="text-danger font-monospace">${error.message}</small></div>
                    <div><button class="btn btn-outline-danger px-4 rounded-pill" onclick="window.location.reload()"><i class="bi bi-arrow-clockwise me-2"></i>Попробовать снова</button></div>
                </div>`;
            }
            if(dashboardStats) dashboardStats.innerHTML = '<p class="text-danger small text-center">Ошибка статистики</p>';
        }
    }

    // --- DASHBOARD SETTINGS LOGIC ---
    if(btnDashSettings) {
        btnDashSettings.onclick = () => {
            const list = document.getElementById('dash-settings-list');
            if(list) {
                list.innerHTML = `
                    <div class="form-check form-switch mb-2">
                        <input class="form-check-input" type="checkbox" id="set-showHealth" ${dashConfig.showHealth ? 'checked' : ''}>
                        <label class="form-check-label" for="set-showHealth">Здоровье базы (Актив/Спят)</label>
                    </div>
                    <div class="form-check form-switch mb-2">
                        <input class="form-check-input" type="checkbox" id="set-showGrowth" ${dashConfig.showGrowth ? 'checked' : ''}>
                        <label class="form-check-label" for="set-showGrowth">Прирост (Новые)</label>
                    </div>
                    <div class="form-check form-switch mb-2">
                        <input class="form-check-input" type="checkbox" id="set-showCityPen" ${dashConfig.showCityPen ? 'checked' : ''}>
                        <label class="form-check-label" for="set-showCityPen">Потенциал городов</label>
                    </div>
                    <div class="form-check form-switch mb-2">
                        <input class="form-check-input" type="checkbox" id="set-showMatrix" ${dashConfig.showMatrix ? 'checked' : ''}>
                        <label class="form-check-label" for="set-showMatrix">Матрица (Среднее SKU)</label>
                    </div>
                    <div class="form-check form-switch mb-2">
                        <input class="form-check-input" type="checkbox" id="set-showVisits" ${dashConfig.showVisits ? 'checked' : ''}>
                        <label class="form-check-label" for="set-showVisits">Активность (Визиты)</label>
                    </div>
                `;
            }
            if(settingsModal) settingsModal.show();
        };
    }

    window.saveDashboardConfig = () => {
        dashConfig.showHealth = document.getElementById('set-showHealth').checked;
        dashConfig.showGrowth = document.getElementById('set-showGrowth').checked;
        dashConfig.showCityPen = document.getElementById('set-showCityPen').checked;
        dashConfig.showMatrix = document.getElementById('set-showMatrix').checked;
        dashConfig.showVisits = document.getElementById('set-showVisits').checked;
        
        localStorage.setItem('dash_config', JSON.stringify(dashConfig));
        if(settingsModal) settingsModal.hide();
        renderDashboard(); 
    };

    // --- RENDER DASHBOARD (V3: Active/Potential Cities) ---
    function renderDashboard() {
        if (!dashboardStats) return; 
        if (!allDealers || allDealers.length === 0) { dashboardStats.innerHTML = ''; return; }

        let html = '';
        
        // 1. Calculations
        const activeIds = new Set();
        if(currentMonthSales) currentMonthSales.forEach(s => { if(s.fact > 0) activeIds.add(s.dealerId); });
        
        let activeCount = 0;
        let sleepingCount = 0;
        let newCount = 0;
        let totalSKU = 0;
        let totalDealersWithProducts = 0;

        const cityStats = {}; 
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        allDealers.forEach(d => {
            if (d.status === 'archive') return;

            const isActive = activeIds.has(d.id);
            if (isActive) activeCount++; else sleepingCount++;

            if (d.createdAt && new Date(d.createdAt) >= startOfMonth) newCount++;

            // Считаем SKU, исключая POS-материалы
            if (d.products && d.products.length > 0) {
                // Фильтруем POS, чтобы считать только реальный товар
                const realProducts = d.products.filter(p => !posMaterialsList.includes(p.name));
                totalSKU += realProducts.length;
                if(realProducts.length > 0) totalDealersWithProducts++;
            }

            const city = d.city || 'Не указан';
            if (!cityStats[city]) cityStats[city] = { active: 0, potential: 0, total: 0 };
            
            if (isActive) cityStats[city].active++;
            else cityStats[city].potential++;
            
            cityStats[city].total++;
        });

        const avgSKU = totalDealersWithProducts > 0 ? (totalSKU / totalDealersWithProducts).toFixed(1) : 0;

        // 2. Widgets
        if (dashConfig.showHealth) {
            html += `
            <div class="col-6">
                <div class="stat-card-modern h-100 flex-column align-items-start justify-content-center p-3">
                    <div class="d-flex align-items-center gap-2 mb-2">
                        <div class="icon-circle bg-success-subtle text-success"><i class="bi bi-heart-pulse-fill"></i></div>
                        <span class="small fw-bold text-muted">Здоровье</span>
                    </div>
                    <div class="stat-dual-value">
                        <span class="stat-val-active">${activeCount}</span>
                        <span class="text-muted fw-light" style="font-size:1rem;">/</span>
                        <span class="stat-val-sleep">${sleepingCount}</span>
                    </div>
                    <div class="stat-sublabel">Актив / Спят</div>
                </div>
            </div>`;
        }

        if (dashConfig.showGrowth) {
            html += `
            <div class="col-6">
                <div class="stat-card-modern h-100 flex-column align-items-start justify-content-center p-3">
                    <div class="d-flex align-items-center gap-2 mb-2">
                        <div class="icon-circle bg-primary-subtle text-primary"><i class="bi bi-graph-up-arrow"></i></div>
                        <span class="small fw-bold text-muted">Прирост</span>
                    </div>
                    <h3 class="mb-0 text-primary fw-bolder">+${newCount}</h3>
                    <div class="stat-sublabel">Новых в этом мес.</div>
                </div>
            </div>`;
        }

        if (dashConfig.showMatrix) {
            html += `
            <div class="col-6">
                <div class="stat-card-modern h-100 flex-column align-items-start justify-content-center p-3">
                    <div class="d-flex align-items-center gap-2 mb-2">
                        <div class="icon-circle bg-warning-subtle text-warning"><i class="bi bi-grid-3x3-gap-fill"></i></div>
                        <span class="small fw-bold text-muted">Матрица</span>
                    </div>
                    <h3 class="mb-0 text-dark fw-bolder">${avgSKU}</h3>
                    <div class="stat-sublabel">Среднее SKU</div>
                </div>
            </div>`;
        }

        if (dashConfig.showCityPen) {
            const sortedCities = Object.entries(cityStats).sort((a, b) => b[1].total - a[1].total);
            let citiesHtml = '';
            sortedCities.forEach(([name, stats]) => {
                const activePct = Math.round((stats.active / stats.total) * 100);
                const potPct = 100 - activePct; 
                citiesHtml += `
                <div class="city-stat-row">
                    <div class="city-bar-header">
                        <span>${name}</span>
                        <span class="text-muted" style="font-size:0.75rem">${stats.active} / ${stats.potential}</span>
                    </div>
                    <div class="city-stacked-bar">
                        <div class="bar-active" style="width: ${activePct}%" title="Активные (${stats.active})"></div>
                        <div class="bar-potential" style="width: ${potPct}%" title="Потенциал (${stats.potential})"></div>
                    </div>
                </div>`;
            });

            html += `
            <div class="col-12 mt-2">
                <div class="stat-card-modern d-block p-3">
                    <div class="d-flex justify-content-between align-items-center mb-3">
                         <h6 class="text-muted fw-bold small mb-0 text-uppercase" style="letter-spacing:1px;">Потенциал городов</h6>
                         <div class="d-flex gap-2 small">
                            <span class="text-success fw-bold" style="font-size:0.7rem">● Актив</span>
                            <span class="text-primary fw-bold" style="font-size:0.7rem">● Потенциал</span>
                         </div>
                    </div>
                    <div style="max-height: 250px; overflow-y: auto; padding-right: 5px;">
                        ${citiesHtml || '<div class="text-center text-muted small">Нет данных</div>'}
                    </div>
                </div>
            </div>`;
        }

        dashboardStats.innerHTML = html;

        // --- TASKS ---
        const today = new Date(); today.setHours(0,0,0,0); const coolingLimit = new Date(today.getTime() - (15 * 24 * 60 * 60 * 1000));
        const tasksUpcoming = [], tasksProblem = [], tasksCooling = [];
        allTasksData.forEach(d => { if (d.status === 'archive') return; const isPotential = d.status === 'potential'; let lastVisitDate = null; let hasFutureTasks = false; if (d.visits && Array.isArray(d.visits)) { d.visits.forEach((v, index) => { const vDate = new Date(v.date); if (!v.date) return; vDate.setHours(0,0,0,0); if (v.isCompleted && (!lastVisitDate || vDate > lastVisitDate)) lastVisitDate = vDate; if (!v.isCompleted) { const taskData = { dealerName: d.name, dealerId: d.id, date: vDate, comment: v.comment || "Без комментария", visitIndex: index }; if (vDate < today) tasksProblem.push({...taskData, type: 'overdue'}); else { tasksUpcoming.push({...taskData, isToday: vDate.getTime() === today.getTime()}); hasFutureTasks = true; } } }); } if (d.status === 'problem') { if (!tasksProblem.some(t => t.dealerId === d.id && t.type === 'overdue')) tasksProblem.push({ dealerName: d.name, dealerId: d.id, type: 'status', comment: 'Статус: Проблемный' }); } if (!hasFutureTasks && d.status !== 'problem' && !isPotential) { if (!lastVisitDate) tasksCooling.push({ dealerName: d.name, dealerId: d.id, days: 999 }); else if (lastVisitDate < coolingLimit) { const days = Math.floor((today - lastVisitDate) / (1000 * 60 * 60 * 24)); tasksCooling.push({ dealerName: d.name, dealerId: d.id, days: days }); } } });
        tasksUpcoming.sort((a, b) => a.date - b.date); tasksProblem.sort((a, b) => (a.date || 0) - (b.date || 0)); tasksCooling.sort((a, b) => b.days - a.days);
        renderTaskList(document.getElementById('tasks-list-upcoming'), tasksUpcoming, 'upcoming'); renderTaskList(document.getElementById('tasks-list-problem'), tasksProblem, 'problem'); renderTaskList(document.getElementById('tasks-list-cooling'), tasksCooling, 'cooling');
    }

    // --- OTHER ---
    if(btnExportDealers) btnExportDealers.onclick = () => { if(!allDealers.length) return window.showToast("Нет данных", "error"); let csv = "\uFEFFID;Название;Город;Адрес;Статус;Ответственный;Организации;Телефон\n"; allDealers.forEach(d => { const phone = (d.contacts && d.contacts[0]) ? d.contacts[0].contactInfo : ''; const orgs = (d.organizations || [d.organization]).filter(Boolean).join(', '); csv += `${cleanCsv(d.dealer_id)};${cleanCsv(d.name)};${cleanCsv(d.city)};${cleanCsv(d.address)};${cleanCsv(d.status)};${cleanCsv(d.responsible)};${cleanCsv(orgs)};${cleanCsv(phone)}\n`; }); downloadCsv(csv, `base_dealers_${new Date().toISOString().slice(0,10)}.csv`); };
    if(btnExportCompetitors) btnExportCompetitors.onclick = () => { if(!allDealers.length) return window.showToast("Нет данных", "error"); let csv = "\uFEFFДилер;Город;Бренд;Коллекция;ОПТ;Розница\n"; let count = 0; allDealers.forEach(d => { if(d.competitors && d.competitors.length > 0) { d.competitors.forEach(c => { csv += `${cleanCsv(d.name)};${cleanCsv(d.city)};${cleanCsv(c.brand)};${cleanCsv(c.collection)};${cleanCsv(c.price_opt)};${cleanCsv(c.price_retail)}\n`; count++; }); } }); if(count === 0) return window.showToast("Нет данных о конкурентах", "warning"); downloadCsv(csv, `competitors_prices_${new Date().toISOString().slice(0,10)}.csv`); };

    // --- EVENT LISTENERS (MOVED HERE TO FIX REFERENCE ERROR) ---
    if(filterCity) filterCity.onchange = renderDealerList; 
    if(filterPriceType) filterPriceType.onchange = renderDealerList; 
    if(filterStatus) filterStatus.onchange = renderDealerList; 
    if(filterResponsible) filterResponsible.onchange = renderDealerList; 
    if(searchBar) searchBar.oninput = renderDealerList;

    initApp();
});
