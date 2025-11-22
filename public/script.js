document.addEventListener('DOMContentLoaded', () => {
    
    const API_DEALERS_URL = '/api/dealers';
    const API_PRODUCTS_URL = '/api/products'; 
    const API_COMPETITORS_REF_URL = '/api/competitors-ref';

    let fullProductCatalog = [];
    let competitorsRef = []; 
    let allDealers = [];
    let currentSort = { column: 'name', direction: 'asc' };
    let isSaving = false; 
    
    const posMaterialsList = [
        "С600 - 600мм задняя стенка", "С800 - 800мм задняя стенка", "РФ-2 - Расческа из фанеры",
        "РФС-1 - Расческа из фанеры СТАРАЯ", "Н600 - 600мм наклейка", "Н800 - 800мм наклейка",
        "Табличка - Табличка орг.стекло"
    ];

    // --- Модалки ---
    const addModalEl = document.getElementById('add-modal'); const addModal = new bootstrap.Modal(addModalEl);
    const addForm = document.getElementById('add-dealer-form');
    
    const editModalEl = document.getElementById('edit-modal'); const editModal = new bootstrap.Modal(editModalEl);
    const editForm = document.getElementById('edit-dealer-form');

    // (НОВОЕ) Модалка Быстрого Визита
    const qvModalEl = document.getElementById('quick-visit-modal'); 
    const qvModal = new bootstrap.Modal(qvModalEl);
    const qvForm = document.getElementById('quick-visit-form');

    // Элементы
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

    let addPhotosData = []; let editPhotosData = []; let newAvatarBase64 = null; 

    const getVal = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };
    const safeText = (text) => (text || '').toString().replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const safeAttr = (text) => (text || '').toString().replace(/"/g, '&quot;');
    const toBase64 = file => new Promise((resolve, reject) => { const reader = new FileReader(); reader.readAsDataURL(file); reader.onload = () => resolve(reader.result); reader.onerror = error => reject(error); });
    const compressImage = (file, maxWidth = 1000, quality = 0.7) => new Promise((resolve, reject) => { const reader = new FileReader(); reader.readAsDataURL(file); reader.onload = event => { const img = new Image(); img.src = event.target.result; img.onload = () => { const elem = document.createElement('canvas'); let width = img.width; let height = img.height; if (width > maxWidth) { height *= maxWidth / width; width = maxWidth; } elem.width = width; elem.height = height; const ctx = elem.getContext('2d'); ctx.drawImage(img, 0, 0, width, height); resolve(elem.toDataURL('image/jpeg', quality)); }; img.onerror = error => reject(error); }; reader.onerror = error => reject(error); });

    // --- КАРТА ---
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

    async function fetchProductCatalog() { if (fullProductCatalog.length > 0) return; try { const response = await fetch(API_PRODUCTS_URL); if (!response.ok) throw new Error(`Ошибка: ${response.status}`); fullProductCatalog = await response.json(); fullProductCatalog.sort((a, b) => a.sku.localeCompare(b.sku, 'ru', { numeric: true })); } catch (error) {} }
    async function completeTask(btn, dealerId, visitIndex) { try { btn.disabled = true; const res = await fetch(`${API_DEALERS_URL}/${dealerId}`); if(!res.ok) throw new Error('Err'); const dealer = await res.json(); if (dealer.visits && dealer.visits[visitIndex]) { dealer.visits[visitIndex].isCompleted = true; } await fetch(`${API_DEALERS_URL}/${dealerId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visits: dealer.visits }) }); initApp(); } catch (e) { alert("Ошибка"); btn.disabled = false; } }

    function renderDashboard() {
        if (!dashboardContainer) { if(tasksListUpcoming) tasksListUpcoming.innerHTML = '<p class="text-muted text-center p-3">Нет задач</p>'; return; }
        if (!allDealers || allDealers.length === 0) { dashboardContainer.innerHTML = ''; return; }
        const activeDealers = allDealers.filter(d => d.status !== 'potential');
        const totalDealers = activeDealers.length;
        const noAvatarCount = activeDealers.filter(d => !d.photo_url).length; 
        dashboardContainer.innerHTML = `<div class="col-md-6"><div class="stat-card h-100"><i class="bi bi-shop stat-icon text-primary"></i><span class="stat-number">${totalDealers}</span><span class="stat-label">Всего дилеров</span></div></div><div class="col-md-6"><div class="stat-card h-100 ${noAvatarCount > 0 ? 'border-danger' : ''}"><i class="bi bi-camera-fill stat-icon ${noAvatarCount > 0 ? 'text-danger' : 'text-secondary'}"></i><span class="stat-number ${noAvatarCount > 0 ? 'text-danger' : ''}">${noAvatarCount}</span><span class="stat-label">Без Аватара</span></div></div>`;
        const today = new Date(); today.setHours(0,0,0,0); const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1); const thirtyDaysAgo = new Date(today.getTime() - (30 * 24 * 60 * 60 * 1000));
        const tasksUpcoming = []; const tasksProblem = []; const tasksCooling = [];
        allDealers.forEach(d => {
            if (d.status === 'archive') return; const isPotential = d.status === 'potential'; let lastVisitDate = null; let hasFutureTasks = false;
            if (d.visits && Array.isArray(d.visits)) { d.visits.forEach((v, index) => { const vDate = new Date(v.date); if (!v.date) return; vDate.setHours(0,0,0,0); if (v.isCompleted && (!lastVisitDate || vDate > lastVisitDate)) { lastVisitDate = vDate; } if (!v.isCompleted) { const taskData = { dealerName: d.name, dealerId: d.id, date: vDate, comment: v.comment || "", visitIndex: index }; if (vDate < today) { tasksProblem.push({...taskData, type: 'overdue'}); } else { tasksUpcoming.push({...taskData, isToday: vDate.getTime() === today.getTime()}); hasFutureTasks = true; } } }); }
            if (d.status === 'problem') { if (!tasksProblem.some(t => t.dealerId === d.id && t.type === 'overdue')) { tasksProblem.push({ dealerName: d.name, dealerId: d.id, type: 'status' }); } }
            if (!hasFutureTasks && d.status !== 'problem' && !isPotential) { if (!lastVisitDate) { tasksCooling.push({ dealerName: d.name, dealerId: d.id, days: 999 }); } else if (lastVisitDate < thirtyDaysAgo) { const days = Math.floor((today - lastVisitDate) / (1000 * 60 * 60 * 24)); tasksCooling.push({ dealerName: d.name, dealerId: d.id, days: days }); } }
        });
        tasksUpcoming.sort((a, b) => a.date - b.date); tasksProblem.sort((a, b) => (a.date || 0) - (b.date || 0)); tasksCooling.sort((a, b) => b.days - a.days);
        renderTaskList(tasksListUpcoming, tasksUpcoming, 'upcoming'); renderTaskList(tasksListProblem, tasksProblem, 'problem'); renderTaskList(tasksListCooling, tasksCooling, 'cooling');
    }
    function renderTaskList(container, tasks, type) { if (!container) return; if (tasks.length === 0) { const msg = type === 'cooling' ? 'Нет таких' : 'Нет задач'; container.innerHTML = `<p class="text-muted text-center p-3">${msg}</p>`; return; } container.innerHTML = tasks.map(t => { let badge = ''; let comment = safeText(t.comment); if (type === 'upcoming') { badge = `<span class="badge ${t.isToday ? 'bg-danger' : 'bg-primary'} rounded-pill me-2">${t.isToday ? 'Сегодня' : t.date.toLocaleDateString('ru-RU')}</span>`; } else if (type === 'problem') { badge = t.type === 'overdue' ? `<span class="badge bg-danger rounded-pill me-2">Просрочено: ${t.date.toLocaleDateString('ru-RU')}</span>` : `<span class="badge bg-danger rounded-pill me-2">Статус: Проблемный</span>`; if(t.type !== 'overdue') comment = '<i>Требует внимания</i>'; } else if (type === 'cooling') { badge = `<span class="badge bg-warning text-dark rounded-pill me-2">Нет визитов: ${t.days === 999 ? 'Никогда' : `${t.days} дн.`}</span>`; comment = '<i>Нужно связаться</i>'; } return `<div class="list-group-item task-item d-flex justify-content-between align-items-center"><div class="me-auto"><div class="d-flex align-items-center mb-1">${badge}<a href="dealer.html?id=${t.dealerId}" target="_blank" class="fw-bold text-decoration-none text-dark">${t.dealerName}</a></div><small class="text-muted" style="white-space: pre-wrap;">${comment}</small></div>${(type === 'upcoming' || (type === 'problem' && t.type === 'overdue')) ? `<button class="btn btn-sm btn-success btn-complete-task ms-2" title="Выполнено" data-id="${t.dealerId}" data-index="${t.visitIndex}"><i class="bi bi-check-lg"></i></button>` : ''}</div>`; }).join(''); }
    
    // --- ГЕНЕРАТОРЫ ---
    function createCompetitorEntryHTML(c={}) { 
        let brandOpts = `<option value="">-- Бренд --</option>`;
        competitorsRef.forEach(ref => { const sel = ref.name === c.brand ? 'selected' : ''; brandOpts += `<option value="${ref.name}" ${sel}>${ref.name}</option>`; });
        if (c.brand && !competitorsRef.find(r => r.name === c.brand)) { brandOpts += `<option value="${c.brand}" selected>${c.brand}</option>`; }
        let collOpts = `<option value="">-- Коллекция --</option>`;
        if (c.brand) {
            const ref = competitorsRef.find(r => r.name === c.brand);
            if (ref && ref.collections) {
                const sortedCols = [...ref.collections].sort((a, b) => { const typeA = (typeof a === 'object') ? a.type : 'std'; const typeB = (typeof b === 'object') ? b.type : 'std'; if (typeA === 'std' && typeB !== 'std') return 1; if (typeA !== 'std' && typeB === 'std') return -1; return 0; });
                sortedCols.forEach(col => { const colName = (typeof col === 'string') ? col : col.name; const colType = (typeof col === 'object') ? col.type : 'std'; const sel = colName === c.collection ? 'selected' : ''; let icon = ''; if(colType.includes('eng')) icon = '🌲 '; else if(colType.includes('french')) icon = '🌊 '; else if(colType.includes('art')) icon = '🎨 '; collOpts += `<option value="${colName}" ${sel}>${icon}${colName}</option>`; });
            } else if (c.collection) { collOpts += `<option value="${c.collection}" selected>${c.collection}</option>`; }
        }
        return `<div class="competitor-entry"><select class="form-select competitor-brand" onchange="updateCollections(this)">${brandOpts}</select><select class="form-select competitor-collection">${collOpts}</select><input type="text" class="form-control competitor-price-opt" placeholder="ОПТ" value="${c.price_opt||''}"><input type="text" class="form-control competitor-price-retail" placeholder="Розница" value="${c.price_retail||''}"><button type="button" class="btn btn-outline-danger btn-remove-entry"><i class="bi bi-trash"></i></button></div>`; 
    }

    window.updateCollections = function(select) {
        const brandName = select.value; const row = select.closest('.competitor-entry'); const collSelect = row.querySelector('.competitor-collection');
        let html = `<option value="">-- Коллекция --</option>`;
        const ref = competitorsRef.find(r => r.name === brandName);
        if (ref && ref.collections) {
             const sortedCols = [...ref.collections].sort((a, b) => { const typeA = (typeof a === 'object') ? a.type : 'std'; const typeB = (typeof b === 'object') ? b.type : 'std'; if (typeA === 'std' && typeB !== 'std') return 1; if (typeA !== 'std' && typeB === 'std') return -1; return 0; });
             html += sortedCols.map(col => { const colName = (typeof col === 'string') ? col : col.name; const colType = (typeof col === 'object') ? col.type : 'std'; let icon = ''; if(colType.includes('eng')) icon = '🌲 '; else if(colType.includes('french')) icon = '🌊 '; else if(colType.includes('art')) icon = '🎨 '; return `<option value="${colName}">${icon}${colName}</option>`; }).join('');
        }
        collSelect.innerHTML = html;
    };

    function createContactEntryHTML(c={}) { return `<div class="contact-entry input-group mb-2"><input type="text" class="form-control contact-name" placeholder="Имя" value="${c.name||''}"><input type="text" class="form-control contact-position" placeholder="Должность" value="${c.position||''}"><input type="text" class="form-control contact-info" placeholder="Телефон" value="${c.contactInfo||''}"><button type="button" class="btn btn-outline-danger btn-remove-entry"><i class="bi bi-trash"></i></button></div>`; }
    function createAddressEntryHTML(a={}) { return `<div class="address-entry input-group mb-2"><input type="text" class="form-control address-description" placeholder="Описание" value="${a.description||''}"><input type="text" class="form-control address-city" placeholder="Город" value="${a.city||''}"><input type="text" class="form-control address-address" placeholder="Адрес" value="${a.address||''}"><button type="button" class="btn btn-outline-danger btn-remove-entry"><i class="bi bi-trash"></i></button></div>`; }
    function createPosEntryHTML(p={}) { const opts = posMaterialsList.map(n => `<option value="${n}" ${n===p.name?'selected':''}>${n}</option>`).join(''); return `<div class="pos-entry input-group mb-2"><select class="form-select pos-name"><option value="">-- Выбор --</option>${opts}</select><input type="number" class="form-control pos-quantity" value="${p.quantity||1}" min="1"><button type="button" class="btn btn-outline-danger btn-remove-entry"><i class="bi bi-trash"></i></button></div>`; }
    function createVisitEntryHTML(v={}) { return `<div class="visit-entry input-group mb-2"><input type="date" class="form-control visit-date" value="${v.date||''}"><input type="text" class="form-control visit-comment w-50" placeholder="Результат визита..." value="${v.comment||''}"><input type="hidden" class="visit-completed" value="${v.isCompleted || 'false'}"><button type="button" class="btn btn-outline-danger btn-remove-entry"><i class="bi bi-trash"></i></button></div>`; }
    function renderPhotoPreviews(container, photosArray) { if(container) container.innerHTML = photosArray.map((p, index) => `<div class="photo-preview-item"><img src="${p.photo_url}"><button type="button" class="btn-remove-photo" data-index="${index}">×</button></div>`).join(''); }

    // Обработчики Фото
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

    // --- ФИЛЬТРАЦИЯ ---
    function renderDealerList() {
        if (!dealerListBody) return;
        const city = filterCity ? filterCity.value : ''; const type = filterPriceType ? filterPriceType.value : ''; const status = filterStatus ? filterStatus.value : ''; const responsible = filterResponsible ? filterResponsible.value : ''; const search = searchBar ? searchBar.value.toLowerCase() : '';
        const filtered = allDealers.filter(d => {
            let statusMatch = false; const s = d.status || 'standard';
            if (status) statusMatch = s === status; else statusMatch = s !== 'potential';
            return (!city||d.city===city) && (!type||d.price_type===type) && (!responsible||d.responsible===responsible) && statusMatch && (!search || ((d.name||'').toLowerCase().includes(search)||(d.dealer_id||'').toLowerCase().includes(search)||(d.organization||'').toLowerCase().includes(search)));
        });
        filtered.sort((a, b) => { let valA = (a[currentSort.column] || '').toString(); let valB = (b[currentSort.column] || '').toString(); let res = currentSort.column === 'dealer_id' ? valA.localeCompare(valB, undefined, {numeric:true}) : valA.toLowerCase().localeCompare(valB.toLowerCase(), 'ru'); return currentSort.direction === 'asc' ? res : -res; });
        dealerListBody.innerHTML = filtered.length ? filtered.map((d, idx) => {
            let rowClass = 'row-status-standard';
            if (d.status === 'active') rowClass = 'row-status-active'; else if (d.status === 'problem') rowClass = 'row-status-problem'; else if (d.status === 'archive') rowClass = 'row-status-archive'; else if (d.status === 'potential') rowClass = 'row-status-potential';
            
            // WA
            let whatsappLink = '#'; let hasPhone = false;
            if (d.contacts && d.contacts.length > 0) { const phone = d.contacts.find(c => c.contactInfo)?.contactInfo || ''; const cleanPhone = phone.replace(/[^0-9]/g, ''); if (cleanPhone.length >= 10) { whatsappLink = `https://wa.me/${cleanPhone}`; hasPhone = true; } }
            // Map
            let mapLink = '#'; let hasCoords = false;
            if (d.latitude && d.longitude) { mapLink = `https://yandex.kz/maps/?pt=${d.longitude},${d.latitude}&z=17&l=map`; hasCoords = true; }

            return `<tr class="${rowClass}"><td class="cell-number">${idx+1}</td><td>${d.photo_url ? `<img src="${d.photo_url}" class="table-photo">` : `<div class="no-photo">Нет</div>`}</td><td>${safeText(d.dealer_id)}</td><td><a href="#" class="btn-view fw-bold text-decoration-none" data-id="${d.id}" style="color: inherit;">${safeText(d.name)}</a></td><td>${safeText(d.city)}</td><td>${safeText(d.price_type)}</td><td>${safeText(d.organization)}</td>
            <td class="actions-cell">
                <div class="dropdown">
                    <button class="btn btn-light btn-sm" data-bs-toggle="dropdown"><i class="bi bi-three-dots-vertical"></i></button>
                    <ul class="dropdown-menu dropdown-menu-end shadow">
                        <li><a class="dropdown-item btn-view" data-id="${d.id}" href="#"><i class="bi bi-eye me-2 text-primary"></i>Подробнее</a></li>
                        <li><a class="dropdown-item btn-edit" data-id="${d.id}" href="#"><i class="bi bi-pencil me-2 text-warning"></i>Редактировать</a></li>
                        <li><a class="dropdown-item btn-duplicate" data-id="${d.id}" href="#"><i class="bi bi-copy me-2 text-secondary"></i>Дублировать</a></li>
                        <li><hr class="dropdown-divider"></li>
                        ${hasPhone ? `<li><a class="dropdown-item" href="${whatsappLink}" target="_blank"><i class="bi bi-whatsapp me-2 text-success"></i>WhatsApp</a></li>` : ''}
                        ${hasCoords ? `<li><a class="dropdown-item" href="${mapLink}" target="_blank"><i class="bi bi-map me-2 text-info"></i>Маршрут</a></li>` : ''}
                        <li><button class="dropdown-item btn-quick-visit" data-id="${d.id}" data-name="${safeText(d.name)}"><i class="bi bi-calendar-check me-2 text-dark"></i>Быстрый визит</button></li>
                        <li><hr class="dropdown-divider"></li>
                        <li><a class="dropdown-item text-danger btn-delete" data-id="${d.id}" data-name="${safeText(d.name)}" href="#"><i class="bi bi-trash me-2"></i>Удалить</a></li>
                    </ul>
                </div>
            </td></tr>`;
        }).join('') : '';
        if(dealerTable) dealerTable.style.display = filtered.length ? 'table' : 'none';
        if(noDataMsg) { noDataMsg.style.display = filtered.length ? 'none' : 'block'; noDataMsg.textContent = allDealers.length === 0 ? 'Список пуст.' : 'Не найдено.'; }
    }

    // --- НОВЫЕ ФУНКЦИИ (ДУБЛЬ и ВИЗИТ) ---
    
    // 1. Дублирование
    async function duplicateDealer(id) {
        try {
            const res = await fetch(`${API_DEALERS_URL}/${id}`);
            if(!res.ok) throw new Error("Ошибка загрузки");
            const d = await res.json();
            
            // Заполняем форму Add данными существующего
            addForm.reset();
            
            // Основное
            document.getElementById('dealer_id').value = ''; // ID стираем
            document.getElementById('name').value = d.name + ' (Копия)';
            document.getElementById('organization').value = d.organization || '';
            document.getElementById('price_type').value = d.price_type || '';
            document.getElementById('city').value = d.city || '';
            document.getElementById('address').value = d.address || '';
            document.getElementById('responsible').value = d.responsible || '';
            document.getElementById('status').value = 'potential'; // Сбрасываем на потенциальный

            // Заполняем списки (клонируем)
            renderList(addContactList, d.contacts || [], createContactEntryHTML);
            renderList(addAddressList, d.additional_addresses || [], createAddressEntryHTML);
            renderList(addPosList, d.pos_materials || [], createPosEntryHTML);
            renderList(addCompetitorList, d.competitors || [], createCompetitorEntryHTML);
            
            // Товары
            const pIds = (d.products || []).map(p => p.id);
            renderProductChecklist(addProductChecklist, pIds);

            // Открываем модалку
            currentStep = 1; 
            showStep(1);
            addModal.show();
            alert("Данные скопированы. Введите новый ID.");

        } catch (e) { alert("Ошибка дублирования"); }
    }

    // 2. Быстрый визит
    if(dealerListBody) dealerListBody.addEventListener('click', (e) => {
        const t = e.target;
        if (t.closest('a.dropdown-item')) e.preventDefault();
        
        // Обработка кликов
        if (t.closest('.btn-view')) window.open(`dealer.html?id=${t.closest('.btn-view').dataset.id}`, '_blank');
        if (t.closest('.btn-edit')) openEditModal(t.closest('.btn-edit').dataset.id);
        if (t.closest('.btn-delete') && confirm("Удалить?")) fetch(`${API_DEALERS_URL}/${t.closest('.btn-delete').dataset.id}`, {method:'DELETE'}).then(initApp);
        
        // Новые кнопки
        if (t.closest('.btn-duplicate')) duplicateDealer(t.closest('.btn-duplicate').dataset.id);
        if (t.closest('.btn-quick-visit')) {
            const btn = t.closest('.btn-quick-visit');
            document.getElementById('qv_dealer_id').value = btn.dataset.id;
            document.getElementById('qv_comment').value = '';
            qvModal.show();
        }
    });

    // Сохранение быстрого визита
    if(qvForm) qvForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('qv_dealer_id').value;
        const comment = document.getElementById('qv_comment').value;
        const btn = qvForm.querySelector('button');
        
        if(!id || !comment) return;

        try {
            btn.disabled = true;
            // Сначала получаем текущие визиты
            const getRes = await fetch(`${API_DEALERS_URL}/${id}`);
            const dealer = await getRes.json();
            const newVisit = {
                date: new Date().toISOString().slice(0,10),
                comment: comment,
                isCompleted: true
            };
            const visits = [...(dealer.visits || []), newVisit];
            
            // Сохраняем
            await fetch(`${API_DEALERS_URL}/${id}`, { 
                method: 'PUT', 
                headers: {'Content-Type':'application/json'}, 
                body: JSON.stringify({ visits }) 
            });
            
            qvModal.hide();
            alert("Визит добавлен!");
        } catch(e) { alert("Ошибка"); }
        finally { btn.disabled = false; }
    });

    // ... остальные Listeners (ADD, EDIT) и инициализация ...
    // (Весь код Wizard, Save, Export из предыдущих ответов здесь должен быть)
    // Я их не дублирую, так как они не менялись, но убедитесь что они на месте.
    
    // ... (Конец файла)
    if(document.getElementById('add-contact-btn-add-modal')) document.getElementById('add-contact-btn-add-modal').onclick = () => addContactList.insertAdjacentHTML('beforeend', createContactEntryHTML());
    if(document.getElementById('add-address-btn-add-modal')) document.getElementById('add-address-btn-add-modal').onclick = () => addAddressList.insertAdjacentHTML('beforeend', createAddressEntryHTML());
    if(document.getElementById('add-pos-btn-add-modal')) document.getElementById('add-pos-btn-add-modal').onclick = () => addPosList.insertAdjacentHTML('beforeend', createPosEntryHTML());
    if(document.getElementById('add-visits-btn-add-modal')) document.getElementById('add-visits-btn-add-modal').onclick = () => addVisitsList.insertAdjacentHTML('beforeend', createVisitEntryHTML());
    if(document.getElementById('add-competitor-btn-add-modal')) document.getElementById('add-competitor-btn-add-modal').onclick = () => addCompetitorList.insertAdjacentHTML('beforeend', createCompetitorEntryHTML());
    
    if(document.getElementById('add-contact-btn-edit-modal')) document.getElementById('add-contact-btn-edit-modal').onclick = () => editContactList.insertAdjacentHTML('beforeend', createContactEntryHTML());
    if(document.getElementById('add-address-btn-edit-modal')) document.getElementById('add-address-btn-edit-modal').onclick = () => editAddressList.insertAdjacentHTML('beforeend', createAddressEntryHTML());
    if(document.getElementById('add-pos-btn-edit-modal')) document.getElementById('add-pos-btn-edit-modal').onclick = () => editPosList.insertAdjacentHTML('beforeend', createPosEntryHTML());
    if(document.getElementById('add-visits-btn-edit-modal')) document.getElementById('add-visits-btn-edit-modal').onclick = () => editVisitsList.insertAdjacentHTML('beforeend', createVisitEntryHTML());
    if(document.getElementById('add-competitor-btn-edit-modal')) document.getElementById('add-competitor-btn-edit-modal').onclick = () => editCompetitorList.insertAdjacentHTML('beforeend', createCompetitorEntryHTML());

    if(openAddModalBtn) openAddModalBtn.onclick = () => {
        if(addForm) addForm.reset();
        currentStep = 1; showStep(1);
        renderProductChecklist(addProductChecklist);
        renderList(addContactList, [], createContactEntryHTML); renderList(addAddressList, [], createAddressEntryHTML);
        renderList(addPosList, [], createPosEntryHTML); renderList(addVisitsList, [], createVisitEntryHTML);
        renderList(addCompetitorList, [], createCompetitorEntryHTML);
        if(document.getElementById('add_latitude')) { document.getElementById('add_latitude').value = ''; document.getElementById('add_longitude').value = ''; }
        addPhotosData = []; renderPhotoPreviews(addPhotoPreviewContainer, []);
        if(addAvatarPreview) addAvatarPreview.src = ''; newAvatarBase64 = null;
        if(addModal) addModal.show();
    };

    let currentStep = 1; const totalSteps = 4;
    const prevBtn = document.getElementById('btn-prev-step'); const nextBtn = document.getElementById('btn-next-step'); const finishBtn = document.getElementById('btn-finish-step');
    function showStep(step) {
        document.querySelectorAll('.wizard-step').forEach(s => s.classList.remove('active'));
        document.querySelectorAll('.step-indicator').forEach(i => i.classList.remove('active'));
        const stepEl = document.getElementById(`step-${step}`); if(stepEl) stepEl.classList.add('active');
        for (let i = 1; i <= totalSteps; i++) { const ind = document.getElementById(`step-ind-${i}`); if(!ind) continue; if (i < step) { ind.classList.add('completed'); ind.innerHTML = '✔'; } else { ind.classList.remove('completed'); ind.innerHTML = i; if (i === step) ind.classList.add('active'); else ind.classList.remove('active'); } }
        if (prevBtn) prevBtn.style.display = step === 1 ? 'none' : 'inline-block';
        if (nextBtn && finishBtn) { if (step === totalSteps) { nextBtn.style.display = 'none'; finishBtn.style.display = 'inline-block'; } else { nextBtn.style.display = 'inline-block'; finishBtn.style.display = 'none'; } }
    }
    if(nextBtn) nextBtn.onclick = () => { if (currentStep === 1) { if (!document.getElementById('dealer_id').value || !document.getElementById('name').value) { alert("Заполните ID и Название"); return; } if (addMap) setTimeout(() => addMap.invalidateSize(), 200); } if (currentStep < totalSteps) { currentStep++; showStep(currentStep); } };
    if(prevBtn) prevBtn.onclick = () => { if (currentStep > 1) { currentStep--; showStep(currentStep); } };

    if(addForm) addForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (isSaving) return; isSaving = true;
        const btn = document.getElementById('btn-finish-step'); const oldText = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
        const data = {
            dealer_id: getVal('dealer_id'), name: getVal('name'), organization: getVal('organization'), price_type: getVal('price_type'),
            city: getVal('city'), address: getVal('address'), delivery: getVal('delivery'), website: getVal('website'), instagram: getVal('instagram'),
            latitude: getVal('add_latitude'), longitude: getVal('add_longitude'), bonuses: getVal('bonuses'), status: getVal('status'),
            responsible: document.getElementById('responsible') ? document.getElementById('responsible').value : '',
            contacts: collectData(addContactList, '.contact-entry', [{key:'name',class:'.contact-name'},{key:'position',class:'.contact-position'},{key:'contactInfo',class:'.contact-info'}]),
            additional_addresses: collectData(addAddressList, '.address-entry', [{key:'description',class:'.address-description'},{key:'city',class:'.address-city'},{key:'address',class:'.address-address'}]),
            pos_materials: collectData(addPosList, '.pos-entry', [{key:'name',class:'.pos-name'},{key:'quantity',class:'.pos-quantity'}]),
            visits: collectData(addVisitsList, '.visit-entry', [{key:'date',class:'.visit-date'},{key:'comment',class:'.visit-comment'}]),
            photos: addPhotosData,
            avatarUrl: newAvatarBase64,
            competitors: collectData(addCompetitorList, '.competitor-entry', [{key:'brand',class:'.competitor-brand'},{key:'collection',class:'.competitor-collection'},{key:'price_opt',class:'.competitor-price-opt'},{key:'price_retail',class:'.competitor-price-retail'}])
        };
        try { const res = await fetch(API_DEALERS_URL, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data)}); if (!res.ok) throw new Error(await res.text()); const newD = await res.json(); const pIds = getSelectedProductIds('add-product-checklist'); if(pIds.length) await saveProducts(newD.id, pIds); addModal.hide(); initApp(); } catch (e) { alert("Ошибка при добавлении."); } finally { isSaving = false; btn.disabled = false; btn.innerHTML = oldText; }
    });

    // SAVE EDIT
    if(editForm) editForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (isSaving) return; isSaving = true;
        const btn = document.querySelector('button[form="edit-dealer-form"]'); const oldText = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
        const id = document.getElementById('edit_db_id').value;
        let avatarToSend = getVal('edit-current-avatar-url'); if (newAvatarBase64) avatarToSend = newAvatarBase64;
        const data = {
            dealer_id: getVal('edit_dealer_id'), name: getVal('edit_name'),
            organization: getVal('edit_organization'), price_type: getVal('edit_price_type'),
            city: getVal('edit_city'), address: getVal('edit_address'),
            delivery: getVal('edit_delivery'), website: getVal('edit_website'), instagram: getVal('edit_instagram'),
            latitude: getVal('edit_latitude'), longitude: getVal('edit_longitude'),
            bonuses: getVal('edit_bonuses'),
            status: getVal('edit_status'),
            responsible: document.getElementById('edit_responsible') ? document.getElementById('edit_responsible').value : '',
            avatarUrl: avatarToSend,
            contacts: collectData(editContactList, '.contact-entry', [{key:'name',class:'.contact-name'},{key:'position',class:'.contact-position'},{key:'contactInfo',class:'.contact-info'}]),
            additional_addresses: collectData(editAddressList, '.address-entry', [{key:'description',class:'.address-description'},{key:'city',class:'.address-city'},{key:'address',class:'.address-address'}]),
            pos_materials: collectData(editPosList, '.pos-entry', [{key:'name',class:'.pos-name'},{key:'quantity',class:'.pos-quantity'}]),
            visits: collectData(editVisitsList, '.visit-entry', [{key:'date',class:'.visit-date'},{key:'comment',class:'.visit-comment'},{key:'isCompleted',class:'.visit-completed'}]),
            photos: editPhotosData,
            competitors: collectData(editCompetitorList, '.competitor-entry', [{key:'brand',class:'.competitor-brand'},{key:'collection',class:'.competitor-collection'},{key:'price_opt',class:'.competitor-price-opt'},{key:'price_retail',class:'.competitor-price-retail'}])
        };
        try { await fetch(`${API_DEALERS_URL}/${id}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data)}); await saveProducts(id, getSelectedProductIds('edit-product-checklist')); editModal.hide(); initApp(); } catch (e) { alert("Ошибка при сохранении."); } finally { isSaving = false; if(btn) { btn.disabled = false; btn.innerHTML = oldText; } }
    });

    if(filterCity) filterCity.onchange = renderDealerList; 
    if(filterPriceType) filterPriceType.onchange = renderDealerList; 
    if(filterStatus) filterStatus.onchange = renderDealerList;
    if(filterResponsible) filterResponsible.onchange = renderDealerList;
    if(searchBar) searchBar.oninput = renderDealerList;
    
    document.querySelectorAll('th[data-sort]').forEach(th => th.onclick = () => { if(currentSort.column===th.dataset.sort) currentSort.direction=(currentSort.direction==='asc'?'desc':'asc'); else {currentSort.column=th.dataset.sort;currentSort.direction='asc';} renderDealerList(); });
    
    if(exportBtn) {
        exportBtn.onclick = async () => {
            if (!allDealers.length) return alert("Пусто. Нечего экспортировать.");
            exportBtn.disabled = true;
            exportBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Загрузка...';
            const clean = (text) => `"${String(text || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`;
            const headers = ["ID", "Название", "Статус", "Ответственный", "Город", "Адрес", "Тип цен", "Организация", "Доставка", "Сайт", "Инстаграм", "Контакты (Имя)", "Контакты (Должность)", "Контакты (Телефон)", "Доп. Адреса", "Стенды", "Конкуренты (Бренд - Коллекция - Цены)", "Бонусы"];
            let csv = "\uFEFF" + headers.join(";") + "\r\n";
            try {
                const visibleDealerIds = Array.from(dealerListBody.querySelectorAll('tr .btn-view')).map(btn => btn.dataset.id);
                for (const id of visibleDealerIds) {
                    const res = await fetch(`${API_DEALERS_URL}/${id}`);
                    if (!res.ok) continue;
                    const dealer = await res.json();
                    const contactsName = (dealer.contacts || []).map(c => c.name).join('; ');
                    const contactsPos = (dealer.contacts || []).map(c => c.position).join('; ');
                    const contactsInfo = (dealer.contacts || []).map(c => c.contactInfo).join('; ');
                    const addresses = (dealer.additional_addresses || []).map(a => `${a.description || ''}: ${a.city || ''} ${a.address || ''}`).join('; ');
                    const stands = (dealer.pos_materials || []).map(p => `${p.name} (${p.quantity} шт)`).join('; '); 
                    const compStr = (dealer.competitors || []).map(c => `⚔️ ${c.brand} - ${c.collection} (Опт: ${c.price_opt} / Розн: ${c.price_retail})`).join('\n');
                    const row = [
                        clean(dealer.dealer_id), clean(dealer.name), clean(dealer.status), clean(dealer.responsible),
                        clean(dealer.city), clean(dealer.address), clean(dealer.price_type),
                        clean(dealer.organization), clean(dealer.delivery), clean(dealer.website), clean(dealer.instagram),
                        clean(contactsName), clean(contactsPos), clean(contactsInfo),
                        clean(addresses), clean(stands), clean(compStr), clean(dealer.bonuses)
                    ];
                    csv += row.join(";") + "\r\n";
                }
                const a = document.createElement('a');
                a.href = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8;'}));
                a.download = 'dealers_export.csv';
                a.click();
            } catch (e) { alert("Ошибка: " + e.message); } 
            finally {
                exportBtn.disabled = false;
                exportBtn.innerHTML = '<i class="bi bi-file-earmark-excel me-2"></i>Экспорт';
            }
        };
    }

    // (НОВОЕ) Экспорт цен
    if(document.getElementById('export-competitors-prices-btn')) {
        document.getElementById('export-competitors-prices-btn').onclick = async () => {
            if (!allDealers.length) return alert("Пусто");
            
            const typeMap = {
                'std': 'Стандарт', 'eng': 'Англ. Елка', 'fr': 'Фр. Елка',
                'art': 'Художественный', 'art_eng': 'Худ. Английская', 'art_fr': 'Худ. Французская', 'mix': 'Худ. Микс'
            };

            let csv = "\uFEFFДилер;Город;Бренд;Коллекция;Тип;Цена ОПТ;Цена Розница\n";
            
            allDealers.forEach(d => {
                if(d.competitors) {
                    d.competitors.forEach(c => {
                        let typeLabel = 'Стандарт';
                        const refBrand = competitorsRef.find(r => r.name === c.brand);
                        if (refBrand && refBrand.collections) {
                            const refCol = refBrand.collections.find(col => (typeof col === 'string' ? col : col.name) === c.collection);
                            if (refCol) {
                                const typeCode = (typeof refCol === 'string') ? 'std' : refCol.type;
                                typeLabel = typeMap[typeCode] || 'Стандарт';
                            }
                        }
                        csv += `"${d.name}";"${d.city}";"${c.brand||''}";"${c.collection||''}";"${typeLabel}";"${c.price_opt||''}";"${c.price_retail||''}"\n`;
                    });
                }
            });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8;'}));
            a.download = 'competitor_prices.csv';
            a.click();
        };
    }
    
    initApp();
});
