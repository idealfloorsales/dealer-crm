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

    // --- MODALS ---
    const addModalEl = document.getElementById('add-modal'); const addModal = new bootstrap.Modal(addModalEl, { backdrop: 'static', keyboard: false });
    const addForm = document.getElementById('add-dealer-form');
    const editModalEl = document.getElementById('edit-modal'); const editModal = new bootstrap.Modal(editModalEl, { backdrop: 'static', keyboard: false });
    const editForm = document.getElementById('edit-dealer-form');
    const qvModalEl = document.getElementById('quick-visit-modal'); const qvModal = new bootstrap.Modal(qvModalEl, { backdrop: 'static', keyboard: false });
    const qvForm = document.getElementById('quick-visit-form');

    // --- ELEMENTS ---
    const openAddModalBtn = document.getElementById('open-add-modal-btn');
    const brandsDatalist = document.getElementById('brands-datalist');
    const posDatalist = document.getElementById('pos-materials-datalist');

    // ТАБЛИЦА
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

    // List Containers
    const addProductChecklist = document.getElementById('add-product-checklist'); 
    const addContactList = document.getElementById('add-contact-list'); const addAddressList = document.getElementById('add-address-list'); const addPosList = document.getElementById('add-pos-list'); const addVisitsList = document.getElementById('add-visits-list'); const addCompetitorList = document.getElementById('add-competitor-list');
    const editProductChecklist = document.getElementById('edit-product-checklist'); 
    const editContactList = document.getElementById('edit-contact-list'); const editAddressList = document.getElementById('edit-address-list'); const editPosList = document.getElementById('edit-pos-list'); const editVisitsList = document.getElementById('edit-visits-list'); const editCompetitorList = document.getElementById('edit-competitor-list');
    
    // Inputs
    const addPhotoInput = document.getElementById('add-photo-input'); const addPhotoPreviewContainer = document.getElementById('add-photo-preview-container');
    const addAvatarInput = document.getElementById('add-avatar-input'); const addAvatarPreview = document.getElementById('add-avatar-preview');
    const editPhotoInput = document.getElementById('edit-photo-input'); const editPhotoPreviewContainer = document.getElementById('edit-photo-preview-container');
    const editAvatarInput = document.getElementById('edit-avatar-input'); const editAvatarPreview = document.getElementById('edit-avatar-preview');
    const editCurrentAvatarUrl = document.getElementById('edit-current-avatar-url');

    let addPhotosData = []; let editPhotosData = []; let newAvatarBase64 = null; 

    // UTILS
    const getVal = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };
    const safeText = (text) => (text || '').toString().replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const safeAttr = (text) => (text || '').toString().replace(/"/g, '&quot;');
    const toBase64 = file => new Promise((resolve, reject) => { const reader = new FileReader(); reader.readAsDataURL(file); reader.onload = () => resolve(reader.result); });
    const compressImage = (file, w, q) => new Promise((resolve, reject) => { const reader = new FileReader(); reader.readAsDataURL(file); reader.onload = e => { const img = new Image(); img.src = e.target.result; img.onload = () => { const c = document.createElement('canvas'); let width = img.width; let height = img.height; if (width > w) { height *= w / width; width = w; } c.width = width; c.height = height; c.getContext('2d').drawImage(img, 0, 0, width, height); resolve(c.toDataURL('image/jpeg', q)); }; }; });

    // MAPS
    const DEFAULT_LAT = 51.1605; const DEFAULT_LNG = 71.4704;
    let addMap, editMap;
    function initMap(id) { const el = document.getElementById(id); if(!el) return null; if(typeof L==='undefined') return null; const m=L.map(id).setView([DEFAULT_LAT,DEFAULT_LNG],13); L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'OSM'}).addTo(m); return m; }
    function setupMapClick(m,latId,lngId,ref) { if(!m)return; m.on('click',e=>{ const{lat,lng}=e.latlng; document.getElementById(latId).value=lat; document.getElementById(lngId).value=lng; if(ref.current)ref.current.setLatLng([lat,lng]); else ref.current=L.marker([lat,lng]).addTo(m); }); }
    function setupMapSearch(m,inputId,boxId,latId,lngId,ref) { const i=document.getElementById(inputId),b=document.getElementById(boxId); if(!i||!b)return; let t; i.addEventListener('input',()=>{ clearTimeout(t); const q=i.value.trim(); if(q.length<3){b.style.display='none';return;} t=setTimeout(async()=>{ try{ const r=await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&countrycodes=kz`); const d=await r.json(); b.innerHTML=''; if(d.length){ b.style.display='block'; d.slice(0,5).forEach(p=>{ const div=document.createElement('div'); div.className='address-suggestion-item'; div.textContent=p.display_name; div.onclick=()=>{ const lat=parseFloat(p.lat),lon=parseFloat(p.lon); if(ref.current)ref.current.setLatLng([lat,lon]); else ref.current=L.marker([lat,lon]).addTo(m); m.setView([lat,lon],16); document.getElementById(latId).value=lat; document.getElementById(lngId).value=lon; i.value=p.display_name; b.style.display='none'; }; b.appendChild(div); }); } else b.style.display='none'; }catch(e){} },500); }); document.addEventListener('click',e=>{ if(!e.target.closest('.map-search-container')) b.style.display='none'; }); }
    if (addModalEl) { addModalEl.addEventListener('shown.bs.modal', () => { if(!addMap) { addMap=initMap('add-map'); addModalEl.markerRef={current:null}; setupMapClick(addMap,'add_latitude','add_longitude',addModalEl.markerRef); setupMapSearch(addMap,'add-map-search','add-map-suggestions','add_latitude','add_longitude',addModalEl.markerRef); } else addMap.invalidateSize(); }); }
    if (editModalEl) { editModalEl.addEventListener('shown.bs.modal', () => { const t=document.querySelector('button[data-bs-target="#tab-map"]'); if(t) t.addEventListener('shown.bs.tab', () => { if(!editMap) { editMap=initMap('edit-map'); editModalEl.markerRef={current:null}; setupMapClick(editMap,'edit_latitude','edit_longitude',editModalEl.markerRef); setupMapSearch(editMap,'edit-map-search','edit-map-suggestions','edit_latitude','edit_longitude',editModalEl.markerRef); } if(editMap) { editMap.invalidateSize(); const lat=parseFloat(document.getElementById('edit_latitude').value),lng=parseFloat(document.getElementById('edit_longitude').value); if(!isNaN(lat)) { editMap.setView([lat,lng],15); if(editModalEl.markerRef.current) editModalEl.markerRef.current.setLatLng([lat,lng]); else editModalEl.markerRef.current=L.marker([lat,lng]).addTo(editMap); } } }); }); }

    // DATA INIT
    async function initApp() {
        await fetchProductCatalog();
        updatePosDatalist();
        try { const r=await fetch(API_COMPETITORS_REF_URL); if(r.ok) { competitorsRef=await r.json(); updateBrandsDatalist(); } }catch(e){}
        try { 
            const r=await fetch(API_DEALERS_URL); 
            if(r.ok) { 
                allDealers=await r.json(); 
                populateFilters(allDealers); 
                renderDealerList(); // TABLE RENDER
                renderDashboard(); 
            } 
        } catch(e) { 
            if(dealerListBody) dealerListBody.innerHTML=`<tr><td colspan="8" class="text-danger text-center p-3">Ошибка загрузки</td></tr>`; 
        }
        const pid=localStorage.getItem('pendingEditDealerId'); if(pid){localStorage.removeItem('pendingEditDealerId');openEditModal(pid);}
    }

    function updateBrandsDatalist(){ if(brandsDatalist) brandsDatalist.innerHTML=competitorsRef.map(r=>`<option value="${r.name}">`).join(''); }
    function updatePosDatalist(){ if(posDatalist) posDatalist.innerHTML=posMaterialsList.map(s=>`<option value="${s}">`).join(''); }
    async function fetchProductCatalog(){ if(!fullProductCatalog.length) try{const r=await fetch(API_PRODUCTS_URL);if(r.ok){fullProductCatalog=await r.json();fullProductCatalog.sort((a,b)=>a.sku.localeCompare(b.sku,'ru',{numeric:true}));}}catch(e){} }
    async function completeTask(btn, id, idx) { try { btn.disabled=true; btn.innerHTML='<span class="spinner-border spinner-border-sm"></span>'; const r=await fetch(`${API_DEALERS_URL}/${id}`); const d=await r.json(); if(d.visits&&d.visits[idx]) d.visits[idx].isCompleted=true; await fetch(`${API_DEALERS_URL}/${id}`, {method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({visits:d.visits})}); initApp(); } catch(e){btn.disabled=false;btn.innerHTML='✔';} }

    // --- LIST RENDER (TABLE) ---
    function renderDealerList() {
        if (!dealerListBody) return;
        const city = filterCity.value; const type = filterPriceType.value; const status = filterStatus.value; const responsible = filterResponsible.value; const search = searchBar.value.toLowerCase();
        const filtered = allDealers.filter(d => {
            return (!city||d.city===city) && (!type||d.price_type===type) && (!status||d.status===status) && (!responsible||d.responsible===responsible) && 
                   (!search || (d.name||'').toLowerCase().includes(search)||(d.dealer_id||'').toLowerCase().includes(search));
        });
        filtered.sort((a, b) => { let valA = (a[currentSort.column] || '').toString(); let valB = (b[currentSort.column] || '').toString(); let res = currentSort.column === 'dealer_id' ? valA.localeCompare(valB, undefined, {numeric:true}) : valA.toLowerCase().localeCompare(valB.toLowerCase(), 'ru'); return currentSort.direction === 'asc' ? res : -res; });
        
        if (filtered.length === 0) { dealerListBody.innerHTML = ''; noDataMsg.style.display = 'block'; if(dealerTable) dealerTable.style.display='none'; return; }
        noDataMsg.style.display = 'none'; if(dealerTable) dealerTable.style.display='block';

        dealerListBody.innerHTML = filtered.map((d, idx) => {
            let rowClass = 'row-status-standard';
            if (d.status === 'active') rowClass = 'row-status-active'; else if (d.status === 'problem') rowClass = 'row-status-problem'; else if (d.status === 'archive') rowClass = 'row-status-archive'; else if (d.status === 'potential') rowClass = 'row-status-potential';
            
            let whatsappLink = '#'; let hasPhone = false;
            if (d.contacts && d.contacts.length > 0) { const phone = d.contacts.find(c => c.contactInfo)?.contactInfo || ''; const cleanPhone = phone.replace(/[^0-9]/g, ''); if (cleanPhone.length >= 10) { whatsappLink = `https://wa.me/${cleanPhone}`; hasPhone = true; } }
            let mapLink = '#'; let hasCoords = false;
            if (d.latitude && d.longitude) { mapLink = `https://yandex.kz/maps/?pt=${d.longitude},${d.latitude}&z=17&l=map`; hasCoords = true; }

            return `<tr class="${rowClass}"><td class="cell-number">${idx+1}</td><td>${d.photo_url ? `<img src="${d.photo_url}" class="table-photo">` : `<div class="no-photo">Нет</div>`}</td><td>${safeText(d.dealer_id)}</td><td><a href="#" class="btn-view fw-bold text-decoration-none" data-id="${d.id}" style="color: inherit;">${safeText(d.name)}</a></td><td>${safeText(d.city)}</td><td>${safeText(d.price_type)}</td><td>${safeText(d.organization)}</td><td class="actions-cell"><div class="dropdown"><button class="btn btn-light btn-sm" data-bs-toggle="dropdown"><i class="bi bi-three-dots-vertical"></i></button><ul class="dropdown-menu dropdown-menu-end shadow"><li><a class="dropdown-item btn-view" data-id="${d.id}" href="#"><i class="bi bi-eye me-2 text-primary"></i>Подробнее</a></li><li><a class="dropdown-item btn-edit" data-id="${d.id}" href="#"><i class="bi bi-pencil me-2 text-warning"></i>Редактировать</a></li><li><a class="dropdown-item btn-duplicate" data-id="${d.id}" href="#"><i class="bi bi-copy me-2 text-secondary"></i>Дублировать</a></li><li><hr class="dropdown-divider"></li>${hasPhone ? `<li><a class="dropdown-item" href="${whatsappLink}" target="_blank"><i class="bi bi-whatsapp me-2 text-success"></i>WhatsApp</a></li>` : ''}${hasCoords ? `<li><a class="dropdown-item" href="${mapLink}" target="_blank"><i class="bi bi-map me-2 text-info"></i>Маршрут</a></li>` : ''}<li><button class="dropdown-item btn-quick-visit" data-id="${d.id}" data-name="${safeText(d.name)}"><i class="bi bi-calendar-check me-2 text-dark"></i>Быстрый визит</button></li><li><hr class="dropdown-divider"></li><li><a class="dropdown-item text-danger btn-delete" data-id="${d.id}" data-name="${safeText(d.name)}" href="#"><i class="bi bi-trash me-2"></i>Удалить</a></li></ul></div></td></tr>`;
        }).join('');
    }

    // --- DASHBOARD ---
    function renderDashboard() {
        if (!dashboardContainer) return;
        if (!allDealers.length) { dashboardContainer.innerHTML = ''; return; }
        const total = allDealers.filter(d => d.status !== 'potential' && d.status !== 'archive').length;
        const noPhoto = allDealers.filter(d => !d.photo_url).length;
        dashboardContainer.innerHTML = `<div class="col-md-6"><div class="stat-card h-100"><i class="bi bi-shop stat-icon text-primary"></i><span class="stat-number">${total}</span><span class="stat-label">Активных дилеров</span></div></div><div class="col-md-6"><div class="stat-card h-100 ${noAvatarCount > 0 ? 'border-danger' : ''}"><i class="bi bi-camera-fill stat-icon ${noAvatarCount > 0 ? 'text-danger' : 'text-secondary'}"></i><span class="stat-number ${noAvatarCount > 0 ? 'text-danger' : ''}">${noAvatarCount}</span><span class="stat-label">Без Аватара</span></div></div>`;
        // ... (Tasks logic remains same, omitted for brevity in this strict table response) ...
    }

    // --- GENERATORS ---
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

    function createPosEntryHTML(p={}) { return `<div class="pos-entry input-group mb-2"><input type="text" class="form-control pos-name" list="pos-materials-datalist" placeholder="Стенд" value="${p.name||''}"><input type="number" class="form-control pos-quantity" value="${p.quantity||1}" min="1" style="max-width: 80px;" placeholder="Кол"><button type="button" class="btn btn-outline-danger btn-remove-entry" onclick="this.closest('.pos-entry').remove()">×</button></div>`; }
    function createContactEntryHTML(c={}) { return `<div class="contact-entry input-group mb-2"><input type="text" class="form-control contact-name" placeholder="Имя" value="${c.name||''}"><input type="text" class="form-control contact-position" placeholder="Должность" value="${c.position||''}"><input type="text" class="form-control contact-info" placeholder="Телефон" value="${c.contactInfo||''}"><button type="button" class="btn btn-outline-danger btn-remove-entry" onclick="this.closest('.contact-entry').remove()">×</button></div>`; }
    function createAddressEntryHTML(a={}) { return `<div class="address-entry input-group mb-2"><input type="text" class="form-control address-description" placeholder="Описание" value="${a.description||''}"><input type="text" class="form-control address-city" placeholder="Город" value="${a.city||''}"><input type="text" class="form-control address-address" placeholder="Адрес" value="${a.address||''}"><button type="button" class="btn btn-outline-danger btn-remove-entry" onclick="this.closest('.address-entry').remove()">×</button></div>`; }
    function createVisitEntryHTML(v={}) { return `<div class="visit-entry input-group mb-2"><input type="date" class="form-control visit-date" value="${v.date||''}"><input type="text" class="form-control visit-comment w-50" placeholder="Результат..." value="${v.comment||''}"><button type="button" class="btn btn-outline-danger btn-remove-entry" onclick="this.closest('.visit-entry').remove()">×</button></div>`; }
    function renderPhotoPreviews(container, photosArray) { if(container) container.innerHTML = photosArray.map((p, index) => `<div class="photo-preview-item"><img src="${p.photo_url}"><button type="button" class="btn-remove-photo" data-index="${index}">×</button></div>`).join(''); }

    // Handlers (Add/Edit Buttons, Photo, etc.) - same as before...
    ['add-contact-btn-add-modal', 'add-address-btn-add-modal', 'add-pos-btn-add-modal', 'add-visits-btn-add-modal', 'add-competitor-btn-add-modal', 'add-contact-btn-edit-modal', 'add-address-btn-edit-modal', 'add-pos-btn-edit-modal', 'add-visits-btn-edit-modal', 'add-competitor-btn-edit-modal'].forEach(id => { const b=document.getElementById(id); if(b) b.onclick=()=>{ const t=id.split('-')[1]; if(t==='contact') (id.includes('add')?addContactList:editContactList).insertAdjacentHTML('beforeend',createContactEntryHTML()); else if(t==='address') (id.includes('add')?addAddressList:editAddressList).insertAdjacentHTML('beforeend',createAddressEntryHTML()); else if(t==='pos') (id.includes('add')?addPosList:editPosList).insertAdjacentHTML('beforeend',createPosEntryHTML()); else if(t==='visits') (id.includes('add')?addVisitsList:editVisitsList).insertAdjacentHTML('beforeend',createVisitEntryHTML()); else if(t==='competitor') (id.includes('add')?addCompetitorList:editCompetitorList).insertAdjacentHTML('beforeend',createCompetitorEntryHTML()); } });

    // ACTIONS
    if(dealerListBody) dealerListBody.addEventListener('click', e => {
        const t = e.target;
        if (t.closest('a.dropdown-item')) e.preventDefault();
        if (t.closest('.btn-view')) window.open(`dealer.html?id=${t.closest('.btn-view').dataset.id}`, '_blank');
        if (t.closest('.btn-edit')) openEditModal(t.closest('.btn-edit').dataset.id);
        if (t.closest('.btn-delete') && confirm('Удалить?')) fetch(`${API_DEALERS_URL}/${t.closest('.btn-delete').dataset.id}`, {method:'DELETE'}).then(initApp);
        if (t.closest('.btn-duplicate')) duplicateDealer(t.closest('.btn-duplicate').dataset.id);
        if (t.closest('.btn-quick-visit')) {
             document.getElementById('qv_dealer_id').value = t.closest('.btn-quick-visit').dataset.id;
             document.getElementById('qv_comment').value = '';
             qvModal.show();
        }
    });
    
    // ... (Paste standard save/duplicate logic here, same as in previous answers) ...
    
    initApp();
});
