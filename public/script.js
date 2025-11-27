document.addEventListener('DOMContentLoaded', () => {
    
    const API_DEALERS_URL = '/api/dealers';
    const API_PRODUCTS_URL = '/api/products'; 
    const API_COMPETITORS_REF_URL = '/api/competitors-ref';

    let fullProductCatalog = [];
    let competitorsRef = []; 
    let allDealers = [];
    let currentSort = { column: 'name', direction: 'asc' };
    let isSaving = false; 
    
    // Список для подсказок стендов (стандартный)
    const posMaterialsList = [
        "С600 - 600мм задняя стенка", "С800 - 800мм задняя стенка", "РФ-2 - Расческа из фанеры",
        "РФС-1 - Расческа из фанеры СТАРАЯ", "Н600 - 600мм наклейка", "Н800 - 800мм наклейка",
        "Табличка - Табличка орг.стекло"
    ];

    // --- МОДАЛКИ (С ЗАЩИТОЙ) ---
    const addModalEl = document.getElementById('add-modal'); 
    const addModal = new bootstrap.Modal(addModalEl, { backdrop: 'static', keyboard: false });
    const addForm = document.getElementById('add-dealer-form');
    
    const editModalEl = document.getElementById('edit-modal'); 
    const editModal = new bootstrap.Modal(editModalEl, { backdrop: 'static', keyboard: false });
    const editForm = document.getElementById('edit-dealer-form');

    const qvModalEl = document.getElementById('quick-visit-modal'); 
    const qvModal = new bootstrap.Modal(qvModalEl, { backdrop: 'static', keyboard: false });
    const qvForm = document.getElementById('quick-visit-form');

    // --- ЭЛЕМЕНТЫ ---
    const openAddModalBtn = document.getElementById('open-add-modal-btn');
    const brandsDatalist = document.getElementById('brands-datalist');
    const posDatalist = document.getElementById('pos-materials-datalist');

    // ГЛАВНЫЙ КОНТЕЙНЕР СПИСКА (КАРТОЧКИ)
    const dealerListContainer = document.getElementById('dealer-list-container'); 

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

    // Списки (ADD)
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
    
    // Списки (EDIT)
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

    let addPhotosData = []; let editPhotosData = []; let newAvatarBase64 = null; 

    // --- UTILS ---
    const getVal = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };
    const safeText = (text) => (text || '').toString().replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const safeAttr = (text) => (text || '').toString().replace(/"/g, '&quot;');
    const toBase64 = file => new Promise((resolve, reject) => { const reader = new FileReader(); reader.readAsDataURL(file); reader.onload = () => resolve(reader.result); reader.onerror = error => reject(error); });
    const compressImage = (file, w, q) => new Promise((resolve, reject) => { const reader = new FileReader(); reader.readAsDataURL(file); reader.onload = e => { const img = new Image(); img.src = e.target.result; img.onload = () => { const c = document.createElement('canvas'); let width = img.width; let height = img.height; if (width > w) { height *= w / width; width = w; } c.width = width; c.height = height; c.getContext('2d').drawImage(img, 0, 0, width, height); resolve(c.toDataURL('image/jpeg', q)); }; }; });

    // --- MAP ---
    const DEFAULT_LAT = 51.1605; const DEFAULT_LNG = 71.4704;
    let addMap, editMap;

    function initMap(mapId) { const el = document.getElementById(mapId); if (!el) return null; if (typeof L === 'undefined') return null; const map = L.map(mapId).setView([DEFAULT_LAT, DEFAULT_LNG], 13); L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: 'OSM' }).addTo(map); return map; }
    function setupMapClick(map, latId, lngId, markerRef) { if (!map) return; map.on('click', function(e) { const lat = e.latlng.lat; const lng = e.latlng.lng; const latIn = document.getElementById(latId); const lngIn = document.getElementById(lngId); if(latIn) latIn.value = lat; if(lngIn) lngIn.value = lng; if (markerRef.current) markerRef.current.setLatLng([lat, lng]); else markerRef.current = L.marker([lat, lng]).addTo(map); }); }
    function setupMapSearch(map, inputId, suggestionsId, latId, lngId, markerRef) {
        const input = document.getElementById(inputId); const suggestionsBox = document.getElementById(suggestionsId); const latInput = document.getElementById(latId); const lngInput = document.getElementById(lngId);
        if (!input || !suggestionsBox) return; let debounceTimer;
        input.addEventListener('input', async () => { clearTimeout(debounceTimer); const query = input.value.trim(); if (query.length < 3) { suggestionsBox.style.display = 'none'; return; } debounceTimer = setTimeout(async () => { try { const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=kz`); const data = await res.json(); suggestionsBox.innerHTML = ''; if (data.length > 0) { suggestionsBox.style.display = 'block'; data.slice(0, 5).forEach(place => { const div = document.createElement('div'); div.className = 'address-suggestion-item'; div.textContent = place.display_name; div.onclick = () => { const lat = parseFloat(place.lat); const lon = parseFloat(place.lon); if (markerRef.current) markerRef.current.setLatLng([lat, lon]); else markerRef.current = L.marker([lat, lon]).addTo(map); map.setView([lat, lon], 16); if (latInput) latInput.value = lat; if (lngInput) lngInput.value = lon; input.value = place.display_name; suggestionsBox.style.display = 'none'; }; suggestionsBox.appendChild(div); }); } else { suggestionsBox.style.display = 'none'; } } catch (e) { console.error(e); } }, 500); });
        document.addEventListener('click', (e) => { if (!e.target.closest('.map-search-container')) suggestionsBox.style.display = 'none'; });
    }

    if (addModalEl) { addModalEl.addEventListener('shown.bs.modal', () => { if (!addMap) { addMap = initMap('add-map'); addModalEl.markerRef = { current: null }; setupMapClick(addMap, 'add_latitude', 'add_longitude', addModalEl.markerRef); setupMapSearch(addMap, 'add-map-search', 'add-map-suggestions', 'add_latitude', 'add_longitude', addModalEl.markerRef); } else { addMap.invalidateSize(); } if (addMap && addModalEl.markerRef && addModalEl.markerRef.current) { addMap.removeLayer(addModalEl.markerRef.current); addModalEl.markerRef.current = null; } if (addMap) addMap.setView([DEFAULT_LAT, DEFAULT_LNG], 13); }); }
    if (editModalEl) { editModalEl.addEventListener('shown.bs.modal', () => { const tabMapBtn = document.querySelector('button[data-bs-target="#tab-map"]'); if(tabMapBtn) { tabMapBtn.addEventListener('shown.bs.tab', () => { if (!editMap) { editMap = initMap('edit-map'); editModalEl.markerRef = { current: null }; setupMapClick(editMap, 'edit_latitude', 'edit_longitude', editModalEl.markerRef); setupMapSearch(editMap, 'edit-map-search', 'edit-map-suggestions', 'edit_latitude', 'edit_longitude', editModalEl.markerRef); } if(editMap) { editMap.invalidateSize(); const lat = parseFloat(document.getElementById('edit_latitude').value); const lng = parseFloat(document.getElementById('edit_longitude').value); if (!isNaN(lat) && !isNaN(lng)) { editMap.setView([lat, lng], 15); if(editModalEl.markerRef.current) editModalEl.markerRef.current.setLatLng([lat, lng]); else editModalEl.markerRef.current = L.marker([lat, lng]).addTo(editMap); } else { editMap.setView([DEFAULT_LAT, DEFAULT_LNG], 13); } } }); } }); }

    // --- DATA ---
    async function initApp() {
        await fetchProductCatalog();
        updatePosDatalist(); 
        try { 
            const compRes = await fetch(API_COMPETITORS_REF_URL); 
            if (compRes.ok) {
                competitorsRef = await compRes.json();
                // updateBrandsDatalist(); // Не нужно, так как используем Select
            }
        } catch(e){}
        try { 
            const response = await fetch(API_DEALERS_URL); 
            if (!response.ok) throw new Error(response.statusText); 
            allDealers = await response.json(); 
            populateFilters(allDealers); 
            
            // ВАЖНО: Рендерим КАРТОЧКИ
            renderDealerList(); 
            
            renderDashboard(); 
        } catch (error) { 
            if(dealerListContainer) dealerListContainer.innerHTML = `<p class="text-danger text-center p-5">Ошибка загрузки списка</p>`; 
        }
        const pendingId = localStorage.getItem('pendingEditDealerId');
        if (pendingId) { localStorage.removeItem('pendingEditDealerId'); openEditModal(pendingId); }
    }

    function updatePosDatalist() { if (!posDatalist) return; let html = ''; posMaterialsList.forEach(s => { html += `<option value="${s}">`; }); posDatalist.innerHTML = html; }

    async function fetchProductCatalog() { if (fullProductCatalog.length > 0) return; try { const response = await fetch(API_PRODUCTS_URL); if (!response.ok) throw new Error(`Ошибка: ${response.status}`); fullProductCatalog = await response.json(); fullProductCatalog.sort((a, b) => a.sku.localeCompare(b.sku, 'ru', { numeric: true })); } catch (error) {} }
    async function completeTask(btn, dealerId, visitIndex) { try { btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>'; const res = await fetch(`${API_DEALERS_URL}/${dealerId}`); if(!res.ok) throw new Error('Err'); const dealer = await res.json(); if (dealer.visits && dealer.visits[visitIndex]) { dealer.visits[visitIndex].isCompleted = true; } await fetch(`${API_DEALERS_URL}/${dealerId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visits: dealer.visits }) }); initApp(); } catch (e) { alert("Ошибка"); btn.disabled = false; btn.innerHTML = '✔'; } }

    // --- DASHBOARD ---
    function renderDashboard() {
        if (!dashboardContainer) return;
        if (!allDealers || allDealers.length === 0) { dashboardContainer.innerHTML = ''; return; }
        const activeDealers = allDealers.filter(d => d.status !== 'potential' && d.status !== 'archive');
        const totalDealers = activeDealers.length;
        const noAvatarCount = activeDealers.filter(d => !d.photo_url).length; 
        
        dashboardContainer.innerHTML = `<div class="col-md-6"><div class="stat-card h-100"><i class="bi bi-shop stat-icon text-primary"></i><span class="stat-number">${totalDealers}</span><span class="stat-label">Активных дилеров</span></div></div><div class="col-md-6"><div class="stat-card h-100 ${noAvatarCount > 0 ? 'border-danger' : ''}"><i class="bi bi-camera-fill stat-icon ${noAvatarCount > 0 ? 'text-danger' : 'text-secondary'}"></i><span class="stat-number ${noAvatarCount > 0 ? 'text-danger' : ''}">${noAvatarCount}</span><span class="stat-label">Без Аватара</span></div></div>`;
        
        const today = new Date(); today.setHours(0,0,0,0); const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1); const thirtyDaysAgo = new Date(today.getTime() - (30 * 24 * 60 * 60 * 1000));
        const tasksUpcoming = [], tasksProblem = [], tasksCooling = [];

        allDealers.forEach(d => {
            if (d.status === 'archive' || d.status === 'potential') return; 
            let lastVisitDate = null; let hasFutureTasks = false;

            if (d.visits && Array.isArray(d.visits)) {
                d.visits.forEach((v, index) => {
                    if(!v.date) return; const dDate = new Date(v.date); dDate.setHours(0,0,0,0);
                    if(v.isCompleted) { if(!lastVisitDate || dDate > lastVisitDate) lastVisitDate = dDate; } 
                    else {
                        const t = { dealerName: d.name, dealerId: d.id, date: dDate, comment: v.comment, visitIndex: index };
                        if (dDate < today) { tasksProblem.push({...t, type: 'overdue'}); } 
                        else { tasksUpcoming.push({...t, isToday: dDate.getTime() === today.getTime()}); hasFutureTasks = true; }
                    }
                });
            }
            if (d.status === 'problem' && !tasksProblem.some(x=>x.dealerId===d.id)) tasksProblem.push({ dealerName: d.name, dealerId: d.id, type: 'status' });
            if (!hasFuture && d.status !== 'problem') {
                if(!lastVisitDate) tasksCooling.push({ dealerName: d.name, dealerId: d.id, days: 999 });
                else if(lastVisitDate < thirtyDaysAgo) tasksCooling.push({ dealerName: d.name, dealerId: d.id, days: Math.floor((today - lastVisitDate)/(1000*60*60*24)) });
            }
        });

        tasksUpcoming.sort((a, b) => a.date - b.date); tasksProblem.sort((a, b) => (a.date || 0) - (b.date || 0)); tasksCooling.sort((a, b) => b.days - a.days);
        renderTaskList(document.getElementById('tasks-list-upcoming'), tasksUpcoming, 'upcoming');
        renderTaskList(document.getElementById('tasks-list-problem'), tasksProblem, 'problem');
        renderTaskList(document.getElementById('tasks-list-cooling'), tasksCooling, 'cooling');
    }

    function renderTaskList(container, tasks, type) {
        if (!container) return;
        if (tasks.length === 0) { const msg = type === 'cooling' ? 'Никого нет' : 'Задач нет'; container.innerHTML = `<p class="text-muted text-center p-3">${msg}</p>`; return; }
        container.innerHTML = tasks.map(t => {
            let badge = ''; 
            if(type === 'upcoming') badge = `<span class="badge ${t.isToday?'bg-danger':'bg-primary'} rounded-pill me-2">${t.isToday?'Сегодня':t.date.toLocaleDateString()}</span>`;
            if(type === 'problem') { badge = t.type==='overdue' ? `<span class="badge bg-danger me-2">Просрочено: ${t.date.toLocaleDateString()}</span>` : `<span class="badge bg-danger me-2">Статус</span>`; }
            if(type === 'cooling') badge = `<span class="badge bg-warning text-dark me-2">Не были: ${t.days} дн.</span>`;
            
            // Безопасный комментарий
            const comment = safeText(t.comment || (type==='problem' && t.type!=='overdue' ? 'Требует внимания' : (type==='cooling' ? 'Связаться' : '')));

            return `<div class="list-group-item d-flex justify-content-between align-items-center"><div>${badge}<a href="dealer.html?id=${t.dealerId}" target="_blank" class="fw-bold text-dark text-decoration-none">${t.dealerName}</a><div class="small text-muted text-truncate" style="max-width: 250px;">${comment}</div></div>${(type === 'upcoming' || (type==='problem' && t.type==='overdue')) ? `<button class="btn btn-sm btn-success btn-complete-task" data-id="${t.dealerId}" data-index="${t.visitIndex}">✔</button>` : ''}</div>`;
        }).join('');
    }

    // --- GENERATORS ---
    
    // 1. Конкуренты: Select
    function createCompetitorEntryHTML(c={}) { 
        let brandOpts = `<option value="">-- Бренд --</option>`;
        competitorsRef.forEach(ref => { const sel = ref.name === c.brand ? 'selected' : ''; brandOpts += `<option value="${ref.name}" ${sel}>${ref.name}</option>`; });
        if (c.brand && !competitorsRef.find(r => r.name === c.brand)) { brandOpts += `<option value="${c.brand}" selected>${c.brand}</option>`; }
        
        let collOpts = `<option value="">-- Коллекция --</option>`;
        if (c.brand) {
            const ref = competitorsRef.find(r => r.name === c.brand);
            if (ref && ref.collections) {
                const sortedCols = [...ref.collections].sort((a, b) => { const typeA = (typeof a === 'object') ? a.type : 'std'; const typeB = (typeof b === 'object') ? b.type : 'std'; if (typeA === 'std' && typeB !== 'std') return 1; if (typeA !== 'std' && typeB === 'std') return -1; return 0; });
                sortedCols.forEach(col => {
                    const colName = (typeof col === 'string') ? col : col.name; const colType = (typeof col === 'object') ? col.type : 'std'; const sel = colName === c.collection ? 'selected' : '';
                    let label = ''; if(colType.includes('eng')) label = ' (Елка)'; else if(colType.includes('french')) label = ' (Фр. Елка)'; else if(colType.includes('art')) label = ' (Арт)';
                    collOpts += `<option value="${colName}" ${sel}>${colName}${label}</option>`;
                });
            } else if (c.collection) { collOpts += `<option value="${c.collection}" selected>${c.collection}</option>`; }
        }
        return `<div class="competitor-entry"><select class="form-select competitor-brand" onchange="updateCollections(this)">${brandOpts}</select><select class="form-select competitor-collection">${collOpts}</select><input type="text" class="form-control competitor-price-opt" placeholder="ОПТ" value="${c.price_opt||''}"><input type="text" class="form-control competitor-price-retail" placeholder="Розница" value="${c.price_retail||''}"><button type="button" class="btn btn-outline-danger btn-remove-entry" onclick="this.closest('.competitor-entry').remove()">×</button></div>`; 
    }

    window.updateCollections = function(select) {
        const brandName = select.value; const row = select.closest('.competitor-entry'); const collSelect = row.querySelector('.competitor-collection');
        let html = `<option value="">-- Коллекция --</option>`;
        const ref = competitorsRef.find(r => r.name === brandName);
        if (ref && ref.collections) {
             const sortedCols = [...ref.collections].sort((a, b) => { const typeA = (typeof a === 'object') ? a.type : 'std'; const typeB = (typeof b === 'object') ? b.type : 'std'; if (typeA === 'std' && typeB !== 'std') return 1; if (typeA !== 'std' && typeB === 'std') return -1; return 0; });
             html += sortedCols.map(col => { const colName = (typeof col === 'string') ? col : col.name; const colType = (typeof col === 'object') ? col.type : 'std'; let label = ''; if(colType.includes('eng')) label = ' (Елка)'; else if(colType.includes('french')) label = ' (Фр. Елка)'; else if(colType.includes('art')) label = ' (Арт)'; return `<option value="${colName}">${colName}${label}</option>`; }).join('');
        }
        collSelect.innerHTML = html;
    };

    // 2. Стенды: Умное поле
    function createPosEntryHTML(p={}) { 
        return `<div class="pos-entry input-group mb-2">
            <input type="text" class="form-control pos-name" list="pos-materials-datalist" placeholder="Стенд (ввод)" value="${p.name||''}">
            <input type="number" class="form-control pos-quantity" value="${p.quantity||1}" min="1" style="max-width: 80px;" placeholder="Кол">
            <button type="button" class="btn btn-outline-danger btn-remove-entry" onclick="this.closest('.pos-entry').remove()">×</button>
        </div>`; 
    }

    function createContactEntryHTML(c={}) { return `<div class="contact-entry input-group mb-2"><input type="text" class="form-control contact-name" placeholder="Имя" value="${c.name||''}"><input type="text" class="form-control contact-position" placeholder="Должность" value="${c.position||''}"><input type="text" class="form-control contact-info" placeholder="Телефон" value="${c.contactInfo||''}"><button type="button" class="btn btn-outline-danger btn-remove-entry" onclick="this.closest('.contact-entry').remove()">×</button></div>`; }
    function createAddressEntryHTML(a={}) { return `<div class="address-entry input-group mb-2"><input type="text" class="form-control address-description" placeholder="Описание" value="${a.description||''}"><input type="text" class="form-control address-city" placeholder="Город" value="${a.city||''}"><input type="text" class="form-control address-address" placeholder="Адрес" value="${a.address||''}"><button type="button" class="btn btn-outline-danger btn-remove-entry" onclick="this.closest('.address-entry').remove()">×</button></div>`; }
    function createVisitEntryHTML(v={}) { return `<div class="visit-entry input-group mb-2"><input type="date" class="form-control visit-date" value="${v.date||''}"><input type="text" class="form-control visit-comment w-50" placeholder="Результат..." value="${v.comment||''}"><button type="button" class="btn btn-outline-danger btn-remove-entry" onclick="this.closest('.visit-entry').remove()">×</button></div>`; }
    function renderPhotoPreviews(container, photosArray) { if(container) container.innerHTML = photosArray.map((p, index) => `<div class="photo-preview-item"><img src="${p.photo_url}"><button type="button" class="btn-remove-photo" data-index="${index}">×</button></div>`).join(''); }

    if(addAvatarInput) addAvatarInput.addEventListener('change', async (e) => { const file = e.target.files[0]; if (file) { newAvatarBase64 = await compressImage(file, 800, 0.8); addAvatarPreview.src = newAvatarBase64; } });
    if(editAvatarInput) editAvatarInput.addEventListener('change', async (e) => { const file = e.target.files[0]; if (file) { newAvatarBase64 = await compressImage(file, 800, 0.8); editAvatarPreview.src = newAvatarBase64; } });
    if(addPhotoInput) addPhotoInput.addEventListener('change', async (e) => { for (let file of e.target.files) addPhotosData.push({ photo_url: await compressImage(file, 1000, 0.7) }); renderPhotoPreviews(addPhotoPreviewContainer, addPhotosData); addPhotoInput.value = ''; });
    if(addPhotoPreviewContainer) addPhotoPreviewContainer.addEventListener('click', (e) => { if(e.target.classList.contains('btn-remove-photo')) { addPhotosData.splice(e.target.dataset.index, 1); renderPhotoPreviews(addPhotoPreviewContainer, addPhotosData); }});
    if(editPhotoInput) editPhotoInput.addEventListener('change', async (e) => { for (let file of e.target.files) editPhotosData.push({ photo_url: await compressImage(file, 1000, 0.7) }); renderPhotoPreviews(editPhotoPreviewContainer, editPhotosData); editPhotoInput.value = ''; });
    if(editPhotoPreviewContainer) editPhotoPreviewContainer.addEventListener('click', (e) => { if(e.target.classList.contains('btn-remove-photo')) { editPhotosData.splice(e.target.dataset.index, 1); renderPhotoPreviews(editPhotoPreviewContainer, editPhotosData); }});

    function collectData(container, selector, fields) { if (!container) return []; const data = []; container.querySelectorAll(selector).forEach(entry => { const item = {}; let hasData = false; fields.forEach(f => { const inp = entry.querySelector(f.class); if(inp){item[f.key]=inp.value; if(item[f.key]) hasData=true;} }); if(hasData) data.push(item); }); return data; }
    function renderList(container, data, htmlGen) { if(container) container.innerHTML = (data && data.length > 0) ? data.map(htmlGen).join('') : htmlGen(); }
    function renderProductChecklist(container, selectedIds=[]) { if(!container) return; const set = new Set(selectedIds); container.innerHTML = fullProductCatalog.map(p => `<div class="checklist-item form-check"><input type="checkbox" class="form-check-input" id="prod-${container.id}-${p.id}" value="${p.id}" ${set.has(p.id)?'checked':''}><label class="form-check-label" for="prod-${container.id}-${p.id}"><strong>${p.sku}</strong> - ${p.name}</label></div>`).join(''); }
    function getSelectedProductIds(containerId) { const el=document.getElementById(containerId); if(!el) return []; return Array.from(el.querySelectorAll('input:checked')).map(cb=>cb.value); }
    async function saveProducts(dealerId, ids) { await fetch(`${API_DEALERS_URL}/${dealerId}/products`, {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({productIds: ids})}); }

    // --- LIST RENDER (CARDS) ---
    function renderDealerList() {
        if (!dealerListContainer) return;
        const city = filterCity ? filterCity.value : ''; const type = filterPriceType ? filterPriceType.value : ''; const status = filterStatus ? filterStatus.value : ''; const responsible = filterResponsible ? filterResponsible.value : ''; const search = searchBar ? searchBar.value.toLowerCase() : '';
        
        const filtered = allDealers.filter(d => {
            let statusMatch = false; const s = d.status || 'standard';
            if (status) statusMatch = s === status; else statusMatch = s !== 'potential';
            return (!city||d.city===city) && (!type||d.price_type===type) && (!responsible||d.responsible===responsible) && statusMatch && (!search || ((d.name||'').toLowerCase().includes(search)||(d.dealer_id||'').toLowerCase().includes(search)||(d.organization||'').toLowerCase().includes(search)));
        });
        
        if (filtered.length === 0) { dealerListContainer.innerHTML = ''; noDataMsg.style.display = 'block'; return; }
        noDataMsg.style.display = 'none';

        dealerListContainer.innerHTML = filtered.map(d => {
            const avatarHtml = d.photo_url ? `<img src="${d.photo_url}" alt="${d.name}">` : `<i class="bi bi-shop"></i>`;
            let statusClass = 'st-standard'; let statusText = 'Стандарт';
            if(d.status==='active'){statusClass='st-active';statusText='Активный';}
            else if(d.status==='problem'){statusClass='st-problem';statusText='Проблема';}
            else if(d.status==='potential'){statusClass='st-potential';statusText='Лид';}
            else if(d.status==='archive'){statusClass='st-archive';statusText='Архив';}

            let phoneClean = ''; if(d.contacts && d.contacts.length) phoneClean = d.contacts[0].contactInfo?.replace(/[^0-9]/g,'') || '';
            const hasWA = phoneClean.length >= 10;
            let hasMap = (d.latitude && d.longitude);
            const mapLink = hasMap ? `https://yandex.kz/maps/?pt=${d.longitude},${d.latitude}&z=17&l=map` : '#';

            return `
            <div class="dealer-item" data-id="${d.id}" data-name="${safeText(d.name)}">
                <div class="dealer-item-avatar">${avatarHtml}</div>
                <div class="dealer-item-info" onclick="window.open('dealer.html?id=${d.id}', '_blank')">
                    <div class="dealer-item-name text-truncate">${safeText(d.name)}</div>
                    <div class="dealer-item-meta">
                        <span class="status-badge ${statusClass}">${statusText}</span>
                        <span><i class="bi bi-geo-alt"></i> ${safeText(d.city)}</span>
                        <span class="text-muted small">${safeText(d.price_type)}</span>
                    </div>
                </div>
                <div class="dealer-item-actions d-none d-md-flex">
                    ${hasWA ? `<a href="https://wa.me/${phoneClean}" target="_blank" class="btn btn-outline-success btn-sm" title="WhatsApp"><i class="bi bi-whatsapp"></i></a>` : ''}
                    ${hasMap ? `<a href="${mapLink}" target="_blank" class="btn btn-outline-info btn-sm" title="Карта"><i class="bi bi-map"></i></a>` : ''}
                    <button class="btn btn-outline-primary btn-sm btn-quick-visit" title="Визит"><i class="bi bi-calendar-check"></i></button>
                    <button class="btn btn-outline-warning btn-sm btn-edit" title="Редактировать"><i class="bi bi-pencil"></i></button>
                    <button class="btn btn-outline-secondary btn-sm btn-duplicate" title="Дублировать"><i class="bi bi-copy"></i></button>
                    <button class="btn btn-outline-danger btn-sm btn-delete" title="Удалить"><i class="bi bi-trash"></i></button>
                </div>
                <div class="dealer-mobile-actions d-flex d-md-none">
                    ${hasWA ? `<a href="https://wa.me/${phoneClean}" target="_blank" class="dealer-mobile-btn text-success"><i class="bi bi-whatsapp"></i></a>` : ''}
                    <a href="#" onclick="window.open('dealer.html?id=${d.id}', '_blank'); return false;" class="dealer-mobile-btn text-primary"><i class="bi bi-eye"></i></a>
                    <button class="dealer-mobile-btn text-dark btn-quick-visit"><i class="bi bi-calendar-check"></i></button>
                    <button class="dealer-mobile-btn text-warning btn-edit"><i class="bi bi-pencil"></i></button>
                </div>
            </div>
            `;
        }).join('');
    }
    
    // --- ACTION HANDLERS (DELEGATION) ---
    if(dealerListContainer) dealerListContainer.addEventListener('click', (e) => {
        const btnEdit = e.target.closest('.btn-edit');
        const btnDel = e.target.closest('.btn-delete');
        const btnDup = e.target.closest('.btn-duplicate');
        const btnVisit = e.target.closest('.btn-quick-visit');
        const item = e.target.closest('.dealer-item');

        if (!item) return;
        const id = item.dataset.id;

        if (btnEdit) openEditModal(id);
        else if (btnDel && confirm('Удалить?')) fetch(`${API_DEALERS_URL}/${id}`, {method:'DELETE'}).then(initApp);
        else if (btnDup) duplicateDealer(id);
        else if (btnVisit) {
            document.getElementById('qv_dealer_id').value = id;
            document.getElementById('qv_comment').value = '';
            qvModal.show();
        }
    });

    if(filterCity) filterCity.onchange = renderDealerList; 
    if(filterPriceType) filterPriceType.onchange = renderDealerList; 
    if(filterStatus) filterStatus.onchange = renderDealerList;
    if(filterResponsible) filterResponsible.onchange = renderDealerList;
    if(searchBar) searchBar.oninput = renderDealerList;

    initApp();
});
