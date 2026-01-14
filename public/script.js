document.addEventListener('DOMContentLoaded', () => {
    
    // --- АВТОРИЗАЦИЯ ---
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

    // --- ПРАВА ДОСТУПА (Default) ---
    let currentUserPermissions = {
        can_view_dealers: false,
        can_view_map: false,
        can_view_products: false,
        can_view_report: false,
        can_view_sales: false,
        can_view_competitors: false,
        can_view_knowledge: false,
        can_view_dashboard: false,
        can_create_dealer: false,
        can_edit_dealer: false,
        can_delete_dealer: false,
        can_manage_users: false,
        can_export_base: false,
        can_export_prices: false,
        is_admin: false
    };

    const posMaterialsList = ["С600 - 600мм задняя стенка", "С800 - 800мм задняя стенка", "РФ-2 - Расческа из фанеры", "РФС-1 - Расческа из фанеры СТАРАЯ", "Н600 - 600мм наклейка", "Н800 - 800мм наклейка", "Табличка - Табличка орг.стекло"];

    // ELEMENTS
    const addModalEl = document.getElementById('add-modal'); const addModal = new bootstrap.Modal(addModalEl, { backdrop: 'static', keyboard: false }); const addForm = document.getElementById('add-dealer-form');
    const editModalEl = document.getElementById('edit-modal'); const editModal = new bootstrap.Modal(editModalEl, { backdrop: 'static', keyboard: false }); const editForm = document.getElementById('edit-dealer-form');
    const qvModalEl = document.getElementById('quick-visit-modal'); const qvModal = new bootstrap.Modal(qvModalEl, { backdrop: 'static', keyboard: false }); const qvForm = document.getElementById('quick-visit-form');
    const statusModalEl = document.getElementById('status-manager-modal'); const statusModal = statusModalEl ? new bootstrap.Modal(statusModalEl) : null; const btnManageStatuses = document.getElementById('btn-manage-statuses'); const statusForm = document.getElementById('status-form'); const statusListContainer = document.getElementById('status-manager-list');
    
    const openAddModalBtn = document.getElementById('open-add-modal-btn');
    const mobileFabBtn = document.getElementById('mobile-fab-add'); // Добавил ссылку на FAB
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

    // MAPS
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
    function renderProductChecklist(container, selectedIds=[]) { if(!container) return; const set = new Set(selectedIds); container.innerHTML = fullProductCatalog.map(p => `<div class="checklist-item form-check"><input type="checkbox" class="form-check-input" id="prod-${container.id}-${p.id}" value="${p.id}" ${set.has(p.id)?'checked':''}><label class="form-check-label" for="prod-${container.id}-${p.id}"><strong>${p.sku}</strong> - ${p.name}</label></div>`).join(''); }
    function getSelectedProductIds(containerId) { const el=document.getElementById(containerId); if(!el) return []; return Array.from(el.querySelectorAll('input:checked')).map(cb=>cb.value); }
    function collectData(container, selector, fields) { if (!container) return []; const data = []; container.querySelectorAll(selector).forEach(entry => { const item = {}; let hasData = false; fields.forEach(f => { const inp = entry.querySelector(f.class); if(inp){item[f.key]=inp.value; if(item[f.key]) hasData=true;} }); if(hasData) data.push(item); }); return data; }
    function renderList(container, data, htmlGen) { if(container) container.innerHTML = (data && data.length > 0) ? data.map(htmlGen).join('') : htmlGen(); }
    function collectOrgs(container) { const orgs = []; container.querySelectorAll('.org-input').forEach(inp => { if(inp.value.trim()) orgs.push(inp.value.trim()); }); return orgs; }

    if(filterCity) filterCity.onchange = renderDealerList; 
    if(filterPriceType) filterPriceType.onchange = renderDealerList; 
    if(filterStatus) filterStatus.onchange = renderDealerList; 
    if(filterResponsible) filterResponsible.onchange = renderDealerList; 
    if(searchBar) searchBar.oninput = renderDealerList;

    // --- BUTTONS ---
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

    if(logoutBtn) { logoutBtn.onclick = () => { localStorage.removeItem('crm_token'); localStorage.removeItem('crm_user'); window.location.href = '/login.html'; }; }
    
    if(document.body) { document.body.addEventListener('click', (e) => { const taskBtn = e.target.closest('.btn-complete-task'); if (taskBtn) { taskBtn.disabled = true; taskBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>'; completeTask(taskBtn, taskBtn.dataset.id, taskBtn.dataset.index); } }); }
    document.querySelectorAll('.sort-btn').forEach(btn => { btn.onclick = (e) => { const sortKey = e.currentTarget.dataset.sort; if(currentSort.column === sortKey) currentSort.direction = (currentSort.direction === 'asc' ? 'desc' : 'asc'); else { currentSort.column = sortKey; currentSort.direction = 'asc'; } renderDealerList(); }; });

    if(btnManageStatuses) { btnManageStatuses.onclick = () => { resetStatusForm(); statusModal.show(); }; }
    
    // --- EXPORTS ---
    if(btnExportDealers) btnExportDealers.onclick = () => { if(!allDealers.length) return window.showToast("Нет данных", "error"); let csv = "\uFEFFID;Название;Город;Адрес;Статус;Ответственный;Организации;Телефон\n"; allDealers.forEach(d => { const phone = (d.contacts && d.contacts[0]) ? d.contacts[0].contactInfo : ''; const orgs = (d.organizations || [d.organization]).filter(Boolean).join(', '); csv += `${cleanCsv(d.dealer_id)};${cleanCsv(d.name)};${cleanCsv(d.city)};${cleanCsv(d.address)};${cleanCsv(d.status)};${cleanCsv(d.responsible)};${cleanCsv(orgs)};${cleanCsv(phone)}\n`; }); downloadCsv(csv, `base_dealers_${new Date().toISOString().slice(0,10)}.csv`); };
    if(btnExportCompetitors) btnExportCompetitors.onclick = () => { if(!allDealers.length) return window.showToast("Нет данных", "error"); let csv = "\uFEFFДилер;Город;Бренд;Коллекция;ОПТ;Розница\n"; let count = 0; allDealers.forEach(d => { if(d.competitors && d.competitors.length > 0) { d.competitors.forEach(c => { csv += `${cleanCsv(d.name)};${cleanCsv(d.city)};${cleanCsv(c.brand)};${cleanCsv(c.collection)};${cleanCsv(c.price_opt)};${cleanCsv(c.price_retail)}\n`; count++; }); } }); if(count === 0) return window.showToast("Нет данных о конкурентах", "warning"); downloadCsv(csv, `competitors_prices_${new Date().toISOString().slice(0,10)}.csv`); };


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

    // --- PERMISSIONS LOGIC ---
    async function loadUserPermissions() {
        try {
            const res = await fetch('/api/auth/me');
            if (res.ok) {
                const data = await res.json();
                const user = data.user || data;
                if (user.permissions) currentUserPermissions = user.permissions;
                const badge = document.getElementById('user-role-badge');
                if(badge) badge.textContent = user.fullName || user.username;
            }
        } catch (e) { console.warn('Auth check failed', e); }
    }

    function applyPermissionsToUI() {
        const p = currentUserPermissions;
        const toggle = (sel, vis) => {
            document.querySelectorAll(sel).forEach(el => {
                if(vis) el.style.removeProperty('display');
                else el.style.setProperty('display', 'none', 'important');
            });
        };

        toggle('a[href="/map.html"]', p.can_view_map);
        toggle('a[href="/products.html"]', p.can_view_products);
        toggle('a[href="/report.html"]', p.can_view_report);
        toggle('a[href="/sales.html"]', p.can_view_sales);
        toggle('a[href="/competitors.html"]', p.can_view_competitors);
        toggle('a[href="/knowledge.html"]', p.can_view_knowledge);
        toggle('a[href="/users.html"]', p.can_manage_users);

        toggle('#dashboard-stats', p.can_view_dashboard);
        toggle('#dealer-grid', p.can_view_dealers);
        toggle('.sticky-filters', p.can_view_dealers);

        toggle('#open-add-modal-btn', p.can_create_dealer);
        toggle('#mobile-fab-add', p.can_create_dealer);
        toggle('#export-dealers-btn', p.can_export_base);
        toggle('#export-competitors-prices-btn', p.can_export_prices);
        
        if (!p.is_admin && !p.can_manage_competitors && btnManageStatuses) {
            btnManageStatuses.style.display = 'none';
        }
    }

    // --- INIT ---
    async function initApp() {
        try {
            console.log("🚀 Init...");
            await loadUserPermissions();
            applyPermissionsToUI();

            await Promise.all([
                fetchStatuses(),
                fetchProductCatalog(),
                updatePosDatalist()
            ]);

            try { const compRes = await fetch(API_COMPETITORS_REF_URL); if (compRes.ok) { competitorsRef = await compRes.json(); updateBrandsDatalist(); } } catch(e){}

            // CHECK VIEW PERMISSIONS
            if (currentUserPermissions.can_view_dealers) {
                await Promise.all([
                    fetchDealers(),
                    fetchTasks(),
                    fetchCurrentMonthSales()
                ]);
                populateFilters(allDealers);
                renderDashboard();
                renderDealerList();
            } else {
                if(dealerGrid) dealerGrid.innerHTML = '<div class="text-center mt-5 text-muted"><i class="bi bi-lock fs-1"></i><p>Нет доступа</p></div>';
                if(dashboardStats) dashboardStats.innerHTML = '';
            }
            
            const pendingId = localStorage.getItem('pendingEditDealerId'); 
            if (pendingId) { 
                localStorage.removeItem('pendingEditDealerId'); 
                if (currentUserPermissions.can_edit_dealer) openEditModal(pendingId); 
            }

        } catch (error) {
            console.error("CRITICAL ERROR:", error);
            if(dealerGrid) dealerGrid.innerHTML = `<p class="text-danger text-center mt-5">${error.message}</p>`;
        }
    }

    // --- FORM HANDLERS (SAVE) ---
    if(addForm) addForm.addEventListener('submit', async (e) => { e.preventDefault(); if (isSaving) return; isSaving = true; const btn = document.getElementById('btn-finish-step'); const oldText = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>'; 
        const data = { dealer_id: getVal('dealer_id'), name: getVal('name'), organizations: collectOrgs(document.getElementById('add-org-list')), price_type: getVal('price_type'), city: getVal('city'), address: getVal('address'), delivery: getVal('delivery'), website: getVal('website'), instagram: getVal('instagram'), latitude: getVal('add_latitude'), longitude: getVal('add_longitude'), bonuses: getVal('bonuses'), status: getVal('status'), responsible: document.getElementById('responsible').value, region_sector: document.getElementById('add_region_sector').value, contract: { isSigned: document.getElementById('add_contract_signed').checked, date: getVal('add_contract_date') }, contacts: collectData(addContactList, '.contact-entry', [{key:'name',class:'.contact-name'},{key:'position',class:'.contact-position'},{key:'contactInfo',class:'.contact-info'}]), additional_addresses: collectData(addAddressList, '.address-entry', [{key:'description',class:'.address-description'},{key:'city',class:'.address-city'},{key:'address',class:'.address-address'}]), pos_materials: collectData(addPosList, '.pos-entry', [{key:'name',class:'.pos-name'},{key:'quantity',class:'.pos-quantity'}]), visits: collectData(addVisitsList, '.visit-entry', [{key:'date',class:'.visit-date'},{key:'comment',class:'.visit-comment'}]), photos: addPhotosData, avatarUrl: newAvatarBase64, competitors: collectData(addCompetitorList, '.competitor-entry', [{key:'brand',class:'.competitor-brand'},{key:'collection',class:'.competitor-collection'},{key:'price_opt',class:'.competitor-price-opt'},{key:'price_retail',class:'.competitor-price-retail'}]) }; 
        try { const res = await fetch(API_DEALERS_URL, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data)}); if (!res.ok) throw new Error(await res.text()); const newD = await res.json(); const pIds = getSelectedProductIds('add-product-checklist'); if(pIds.length) await saveProducts(newD.id, pIds); addModal.hide(); window.showToast("Дилер добавлен!"); initApp(); } catch (e) { window.showToast("Ошибка сохранения", "error"); } finally { isSaving = false; btn.disabled = false; btn.innerHTML = oldText; } });
    
    if(editForm) editForm.addEventListener('submit', async (e) => { e.preventDefault(); if (isSaving) return; isSaving = true; const btn = document.querySelector('button[form="edit-dealer-form"]'); const oldText = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>'; const id = document.getElementById('edit_db_id').value; let avatarToSend = getVal('edit-current-avatar-url'); if (newAvatarBase64) avatarToSend = newAvatarBase64; 
        const data = { 
            dealer_id: getVal('edit_dealer_id'), name: getVal('edit_name'), organizations: collectOrgs(document.getElementById('edit-org-list')), price_type: getVal('edit_price_type'), city: getVal('edit_city'), address: getVal('edit_address'), delivery: getVal('edit_delivery'), website: getVal('edit_website'), instagram: getVal('edit_instagram'), latitude: getVal('edit_latitude'), longitude: getVal('edit_longitude'), bonuses: getVal('edit_bonuses'), status: getVal('edit_status'), responsible: document.getElementById('edit_responsible').value, region_sector: document.getElementById('edit_region_sector').value, 
            hasPersonalPlan: document.getElementById('edit_has_personal_plan').checked,
            contract: { isSigned: document.getElementById('edit_contract_signed').checked, date: getVal('edit_contract_date') }, avatarUrl: avatarToSend, contacts: collectData(editContactList, '.contact-entry', [{key:'name',class:'.contact-name'},{key:'position',class:'.contact-position'},{key:'contactInfo',class:'.contact-info'}]), additional_addresses: collectData(editAddressList, '.address-entry', [{key:'description',class:'.address-description'},{key:'city',class:'.address-city'},{key:'address',class:'.address-address'}]), pos_materials: collectData(editPosList, '.pos-entry', [{key:'name',class:'.pos-name'},{key:'quantity',class:'.pos-quantity'}]), visits: collectData(editVisitsList, '.visit-entry', [{key:'date',class:'.visit-date'},{key:'comment',class:'.visit-comment'},{key:'isCompleted',class:'.visit-completed'}]), photos: editPhotosData, competitors: collectData(editCompetitorList, '.competitor-entry', [{key:'brand',class:'.competitor-brand'},{key:'collection',class:'.competitor-collection'},{key:'price_opt',class:'.competitor-price-opt'},{key:'price_retail',class:'.competitor-price-retail'}]) 
        }; 
        try { await fetch(`${API_DEALERS_URL}/${id}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data)}); await saveProducts(id, getSelectedProductIds('edit-product-checklist')); editModal.hide(); window.showToast("Изменения сохранены!"); initApp(); } catch (e) { window.showToast("Ошибка сохранения", "error"); } finally { isSaving = false; if(btn) { btn.disabled = false; btn.innerHTML = oldText; } } });
    if(qvForm) qvForm.addEventListener('submit', async (e) => { e.preventDefault(); if (isSaving) return; isSaving = true; const id = document.getElementById('qv_dealer_id').value; const comment = document.getElementById('qv_comment').value; const btn = qvForm.querySelector('button'); if(!id || !comment) { isSaving = false; return; } try { btn.disabled = true; const getRes = await fetch(`${API_DEALERS_URL}/${id}`); const dealer = await getRes.json(); const newVisit = { date: new Date().toISOString().slice(0,10), comment: comment, isCompleted: true }; const visits = [...(dealer.visits || []), newVisit]; await fetch(`${API_DEALERS_URL}/${id}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ visits }) }); qvModal.hide(); alert("Визит добавлен!"); } catch(e) { alert("Ошибка"); } finally { isSaving = false; btn.disabled = false; } });

    // --- MISSING FUNCTIONS (ADDED FROM PREVIOUS CONTEXT) ---
    function populateStatusSelects(selectedStatus = null) { let filterHtml = '<option value="">Все статусы</option>'; statusList.forEach(s => { filterHtml += `<option value="${s.value}">${s.label}</option>`; }); if(filterStatus) filterStatus.innerHTML = filterHtml; const modalHtml = statusList.map(s => `<option value="${s.value}" ${selectedStatus === s.value ? 'selected' : ''}>${s.label}</option>`).join(''); const addStatusSel = document.getElementById('status'); if(addStatusSel) addStatusSel.innerHTML = modalHtml; const editStatusSel = document.getElementById('edit_status'); if(editStatusSel) editStatusSel.innerHTML = modalHtml; }
    function renderStatusManagerList() { if(!statusListContainer) return; statusListContainer.innerHTML = statusList.map(s => `<tr><td style="width: 50px;"><div style="width:20px;height:20px;background:${s.color};border-radius:50%;"></div></td><td class="fw-bold">${s.label}</td><td class="text-muted small">${s.value}</td><td class="text-center">${s.isVisible !== false ? '<i class="bi bi-eye-fill text-success"></i>' : '<i class="bi bi-eye-slash-fill text-muted"></i>'}</td><td class="text-end"><button class="btn btn-sm btn-light border me-1" onclick="editStatus('${s.id}')"><i class="bi bi-pencil"></i></button><button class="btn btn-sm btn-light border text-danger" onclick="deleteStatus('${s.id}')"><i class="bi bi-trash"></i></button></td></tr>`).join(''); }
    function resetStatusForm() { if(!statusForm) return; statusForm.reset(); document.getElementById('st_id').value = ''; document.getElementById('btn-save-status').textContent = 'Добавить'; document.getElementById('btn-save-status').className = 'btn btn-primary w-100'; document.getElementById('btn-cancel-edit-status').style.display = 'none'; document.getElementById('st_color').value = '#0d6efd'; }
    function populateFilters(dealers) { if(!filterCity || !filterPriceType) return; const cities = [...new Set(dealers.map(d => d.city).filter(Boolean))].sort(); const types = [...new Set(dealers.map(d => d.price_type).filter(Boolean))].sort(); const sc = filterCity.value; const st = filterPriceType.value; filterCity.innerHTML = '<option value="">Город</option>'; filterPriceType.innerHTML = '<option value="">Тип цен</option>'; cities.forEach(c => filterCity.add(new Option(c, c))); types.forEach(t => filterPriceType.add(new Option(t, t))); filterCity.value = sc; filterPriceType.value = st; }
    function updatePosDatalist() { if (!posDatalist) return; let html = ''; posMaterialsList.forEach(s => { html += `<option value="${s}">`; }); posDatalist.innerHTML = html; }
    function updateBrandsDatalist() { if (!brandsDatalist) return; let html = ''; competitorsRef.forEach(ref => { html += `<option value="${ref.name}">`; }); brandsDatalist.innerHTML = html; }
    function fetchStatuses() { return fetch(API_STATUSES_URL).then(res => res.json()).then(data => { statusList = data; populateStatusSelects(); renderStatusManagerList(); }); }
    function renderDashboard() {
        if (!dashboardStats) return; 
        if (!allDealers || allDealers.length === 0) { dashboardStats.innerHTML = ''; return; }
        const activeDealers = allDealers.filter(d => d.status !== 'potential'); const totalDealers = activeDealers.length; const noAvatarCount = activeDealers.filter(d => !d.photo_url).length; 
        let countActive = 0, countStandard = 0, countPotential = 0, countProblem = 0; 
        allDealers.forEach(d => { if (d.status === 'active') countActive++; else if (d.status === 'standard') countStandard++; else if (d.status === 'problem') countProblem++; else if (d.status === 'potential') countPotential++; });
        const totalAll = allDealers.length; const pctActive = totalAll > 0 ? (countActive / totalAll) * 100 : 0; const pctStandard = totalAll > 0 ? (countStandard / totalAll) * 100 : 0; const pctProblem = totalAll > 0 ? (countProblem / totalAll) * 100 : 0; const pctPotential = totalAll > 0 ? (countPotential / totalAll) * 100 : 0;
        
        dashboardStats.innerHTML = `
            <div class="col-6"><div class="stat-card-modern"><div class="stat-icon-box bg-primary-subtle text-primary"><i class="bi bi-shop"></i></div><div class="stat-info"><h3>${totalDealers}</h3><p>Дилеров</p></div></div></div>
            <div class="col-6"><div class="stat-card-modern"><div class="stat-icon-box ${noAvatarCount > 0 ? 'bg-danger-subtle text-danger' : 'bg-success-subtle text-success'}"><i class="bi bi-camera-fill"></i></div><div class="stat-info"><h3 class="${noAvatarCount > 0 ? 'text-danger' : ''}">${noAvatarCount}</h3><p>Без фото</p></div></div></div>
            <div class="col-12 mt-2"><div class="stat-card-modern d-block p-3"><h6 class="text-muted fw-bold small mb-3 text-uppercase" style="letter-spacing:1px;">Структура базы</h6><div class="progress mb-3" style="height: 12px; border-radius: 6px;"><div class="progress-bar bg-success" role="progressbar" style="width: ${pctActive}%"></div><div class="progress-bar bg-warning" role="progressbar" style="width: ${pctStandard}%"></div><div class="progress-bar bg-danger" role="progressbar" style="width: ${pctProblem}%"></div><div class="progress-bar bg-primary" role="progressbar" style="width: ${pctPotential}%"></div></div><div class="d-flex justify-content-between text-center small"><div><span class="badge rounded-pill text-bg-success mb-1">${countActive}</span><br><span class="text-muted" style="font-size:0.75rem">VIP</span></div><div><span class="badge rounded-pill text-bg-warning mb-1">${countStandard}</span><br><span class="text-muted" style="font-size:0.75rem">Станд.</span></div><div><span class="badge rounded-pill text-bg-danger mb-1">${countProblem}</span><br><span class="text-muted" style="font-size:0.75rem">Пробл.</span></div><div><span class="badge rounded-pill text-bg-primary mb-1">${countPotential}</span><br><span class="text-muted" style="font-size:0.75rem">Потенц.</span></div></div></div></div>
        `;
        
        const today = new Date(); today.setHours(0,0,0,0); const coolingLimit = new Date(today.getTime() - (15 * 24 * 60 * 60 * 1000));
        const tasksUpcoming = [], tasksProblem = [], tasksCooling = [];
        allTasksData.forEach(d => { if (d.status === 'archive') return; const isPotential = d.status === 'potential'; let lastVisitDate = null; let hasFutureTasks = false; if (d.visits && Array.isArray(d.visits)) { d.visits.forEach((v, index) => { const vDate = new Date(v.date); if (!v.date) return; vDate.setHours(0,0,0,0); if (v.isCompleted && (!lastVisitDate || vDate > lastVisitDate)) lastVisitDate = vDate; if (!v.isCompleted) { const taskData = { dealerName: d.name, dealerId: d.id, date: vDate, comment: v.comment || "Без комментария", visitIndex: index }; if (vDate < today) tasksProblem.push({...taskData, type: 'overdue'}); else { tasksUpcoming.push({...taskData, isToday: vDate.getTime() === today.getTime()}); hasFutureTasks = true; } } }); } if (d.status === 'problem') { if (!tasksProblem.some(t => t.dealerId === d.id && t.type === 'overdue')) tasksProblem.push({ dealerName: d.name, dealerId: d.id, type: 'status', comment: 'Статус: Проблемный' }); } if (!hasFutureTasks && d.status !== 'problem' && !isPotential) { if (!lastVisitDate) tasksCooling.push({ dealerName: d.name, dealerId: d.id, days: 999 }); else if (lastVisitDate < coolingLimit) { const days = Math.floor((today - lastVisitDate) / (1000 * 60 * 60 * 24)); tasksCooling.push({ dealerName: d.name, dealerId: d.id, days: days }); } } });
        tasksUpcoming.sort((a, b) => a.date - b.date); tasksProblem.sort((a, b) => (a.date || 0) - (b.date || 0)); tasksCooling.sort((a, b) => b.days - a.days);
        renderTaskList(document.getElementById('tasks-list-upcoming'), tasksUpcoming, 'upcoming'); renderTaskList(document.getElementById('tasks-list-problem'), tasksProblem, 'problem'); renderTaskList(document.getElementById('tasks-list-cooling'), tasksCooling, 'cooling');
    }

    if(addModalEl) { addModalEl.addEventListener('shown.bs.modal', () => { if (refreshAddMap) refreshAddMap(); }); }
    if(editModalEl) { const tabMapBtn = document.querySelector('button[data-bs-target="#tab-map"]'); if(tabMapBtn) { tabMapBtn.addEventListener('shown.bs.tab', () => { if (refreshEditMap) refreshEditMap(); }); } }
    if(openAddModalBtn) openAddModalBtn.onclick = () => { if(addForm) addForm.reset(); populateStatusSelects(); renderProductChecklist(addProductChecklist); renderList(addContactList, [], createContactEntryHTML); renderList(addAddressList, [], createAddressEntryHTML); renderList(addPosList, [], createPosEntryHTML); renderList(addVisitsList, [], createVisitEntryHTML); renderList(addCompetitorList, [], createCompetitorEntryHTML); if(document.getElementById('add_latitude')) { document.getElementById('add_latitude').value = ''; document.getElementById('add_longitude').value = ''; } addPhotosData = []; renderPhotoPreviews(addPhotoPreviewContainer, []); if(addAvatarPreview) { addAvatarPreview.src = ''; addAvatarPreview.style.display='none'; } newAvatarBase64 = null; 
        document.getElementById('add-org-list').innerHTML = ''; addOrgList.insertAdjacentHTML('beforeend', createOrgInputHTML());
        document.getElementById('add_contract_signed').checked = false; document.getElementById('add_contract_date').value = '';
        toggleSectorSelect('add', '');
        addModal.show(); 
    };

    window.editStatus = (id) => { const s = statusList.find(i => i.id === id); if(!s) return; document.getElementById('st_id').value = s.id; document.getElementById('st_label').value = s.label; document.getElementById('st_color').value = s.color; document.getElementById('st_visible').checked = s.isVisible !== false; const btn = document.getElementById('btn-save-status'); btn.textContent = 'Сохранить'; btn.className = 'btn btn-success w-100'; document.getElementById('btn-cancel-edit-status').style.display = 'inline-block'; };
    window.deleteStatus = async (id) => { if(!confirm("Удалить этот статус?")) return; try { await fetch(`${API_STATUSES_URL}/${id}`, { method: 'DELETE' }); window.showToast("Удалено"); fetchStatuses(); } catch(e) { window.showToast("Ошибка", "error"); } };
    if(document.getElementById('btn-cancel-edit-status')) document.getElementById('btn-cancel-edit-status').onclick = resetStatusForm;
    if(statusForm) { statusForm.addEventListener('submit', async (e) => { e.preventDefault(); const id = document.getElementById('st_id').value; const label = document.getElementById('st_label').value; const color = document.getElementById('st_color').value; const isVisible = document.getElementById('st_visible').checked; const body = { label, color, isVisible }; let url = API_STATUSES_URL; let method = 'POST'; if(id) { url += `/${id}`; method = 'PUT'; } else { body.value = 'st_' + Math.random().toString(36).substr(2, 5); body.sortOrder = statusList.length + 10; } try { const res = await fetch(url, { method: method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body) }); if(res.ok) { window.showToast(id ? "Обновлено" : "Создано"); resetStatusForm(); fetchStatuses(); } else { throw new Error(); } } catch(e) { window.showToast("Ошибка сохранения", "error"); } }); }

    initApp();
});
