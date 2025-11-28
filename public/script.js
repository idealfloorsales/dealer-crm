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

    // !!! МЕНЯЕМ С ТАБЛИЦЫ НА КОНТЕЙНЕР !!!
    const dealerListContainer = document.getElementById('dealer-list-container');

    const noDataMsg = document.getElementById('no-data-msg');
    const filterCity = document.getElementById('filter-city');
    const filterPriceType = document.getElementById('filter-price-type');
    const filterStatus = document.getElementById('filter-status');
    const filterResponsible = document.getElementById('filter-responsible');
    const searchBar = document.getElementById('search-bar'); 
    const exportBtn = document.getElementById('export-dealers-btn'); 
    
    // ДАШБОРД (ВАШ СТАРЫЙ)
    const dashboardContainer = document.getElementById('dashboard-container');
    const tasksListUpcoming = document.getElementById('tasks-list-upcoming');
    const tasksListProblem = document.getElementById('tasks-list-problem');
    const tasksListCooling = document.getElementById('tasks-list-cooling');

    // List Containers
    const addProductChecklist = document.getElementById('add-product-checklist'); 
    const addContactList = document.getElementById('add-contact-list'); const addAddressList = document.getElementById('add-address-list'); const addPosList = document.getElementById('add-pos-list'); const addVisitsList = document.getElementById('add-visits-list'); const addCompetitorList = document.getElementById('add-competitor-list');
    const editProductChecklist = document.getElementById('edit-product-checklist'); 
    const editContactList = document.getElementById('edit-contact-list'); const editAddressList = document.getElementById('edit-address-list'); const editPosList = document.getElementById('edit-pos-list'); const editVisitsList = document.getElementById('edit-visits-list'); const editCompetitorList = document.getElementById('edit-competitor-list');
    
    const addPhotoInput = document.getElementById('add-photo-input'); const addPhotoPreviewContainer = document.getElementById('add-photo-preview-container');
    const addAvatarInput = document.getElementById('add-avatar-input'); const addAvatarPreview = document.getElementById('add-avatar-preview');
    const editPhotoInput = document.getElementById('edit-photo-input'); const editPhotoPreviewContainer = document.getElementById('edit-photo-preview-container');
    const editAvatarInput = document.getElementById('edit-avatar-input'); const editAvatarPreview = document.getElementById('edit-avatar-preview');
    const editCurrentAvatarUrl = document.getElementById('edit-current-avatar-url');

    let addPhotosData = []; let editPhotosData = []; let newAvatarBase64 = null; 

    // UTILS
    const getVal = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };
    const safeText = (text) => (text || '').toString().replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const toBase64 = file => new Promise((resolve, reject) => { const reader = new FileReader(); reader.readAsDataURL(file); reader.onload = () => resolve(reader.result); });
    const compressImage = (file, w, q) => new Promise((resolve, reject) => { const reader = new FileReader(); reader.readAsDataURL(file); reader.onload = e => { const img = new Image(); img.src = e.target.result; img.onload = () => { const c = document.createElement('canvas'); let width = img.width; let height = img.height; if (width > w) { height *= w / width; width = w; } c.width = width; c.height = height; c.getContext('2d').drawImage(img, 0, 0, width, height); resolve(c.toDataURL('image/jpeg', q)); }; }; });

    let addMap, editMap;
    function initMap(id) { const el = document.getElementById(id); if(!el) return null; if(typeof L==='undefined') return null; const m=L.map(id).setView([51.1605,71.4704],13); L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'OSM'}).addTo(m); return m; }
    function setupMapClick(m,latId,lngId,ref) { if(!m)return; m.on('click',e=>{ const{lat,lng}=e.latlng; document.getElementById(latId).value=lat; document.getElementById(lngId).value=lng; if(ref.current)ref.current.setLatLng([lat,lng]); else ref.current=L.marker([lat,lng]).addTo(m); }); }
    function setupMapSearch(m,inputId,boxId,latId,lngId,ref) { const i=document.getElementById(inputId),b=document.getElementById(boxId); if(!i||!b)return; let t; i.addEventListener('input',()=>{ clearTimeout(t); const q=i.value.trim(); if(q.length<3){b.style.display='none';return;} t=setTimeout(async()=>{ try{ const r=await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&countrycodes=kz`); const d=await r.json(); b.innerHTML=''; if(d.length){ b.style.display='block'; d.slice(0,5).forEach(p=>{ const div=document.createElement('div'); div.className='address-suggestion-item'; div.textContent=p.display_name; div.onclick=()=>{ const lat=parseFloat(p.lat),lon=parseFloat(p.lon); if(ref.current)ref.current.setLatLng([lat,lon]); else ref.current=L.marker([lat,lon]).addTo(m); m.setView([lat,lon],16); document.getElementById(latId).value=lat; document.getElementById(lngId).value=lon; i.value=p.display_name; b.style.display='none'; }; b.appendChild(div); }); } else b.style.display='none'; }catch(e){} },500); }); document.addEventListener('click',e=>{ if(!e.target.closest('.map-search-container')) b.style.display='none'; }); }
    if (addModalEl) { addModalEl.addEventListener('shown.bs.modal', () => { if(!addMap) { addMap=initMap('add-map'); addModalEl.markerRef={current:null}; setupMapClick(addMap,'add_latitude','add_longitude',addModalEl.markerRef); setupMapSearch(addMap,'add-map-search','add-map-suggestions','add_latitude','add_longitude',addModalEl.markerRef); } else addMap.invalidateSize(); }); }
    if (editModalEl) { editModalEl.addEventListener('shown.bs.modal', () => { const t=document.querySelector('button[data-bs-target="#tab-map"]'); if(t) t.addEventListener('shown.bs.tab', () => { if(!editMap) { editMap=initMap('edit-map'); editModalEl.markerRef={current:null}; setupMapClick(editMap,'edit_latitude','edit_longitude',editModalEl.markerRef); setupMapSearch(editMap,'edit-map-search','edit-map-suggestions','edit_latitude','edit_longitude',editModalEl.markerRef); } if(editMap) { editMap.invalidateSize(); const lat=parseFloat(document.getElementById('edit_latitude').value),lng=parseFloat(document.getElementById('edit_longitude').value); if(!isNaN(lat)) { editMap.setView([lat,lng],15); if(editModalEl.markerRef.current) editModalEl.markerRef.current.setLatLng([lat,lng]); else editModalEl.markerRef.current=L.marker([lat,lng]).addTo(editMap); } } }); }); }

    async function initApp() {
        await fetchProductCatalog();
        updatePosDatalist();
        try { const r=await fetch(API_COMPETITORS_REF_URL); if(r.ok) { competitorsRef=await r.json(); updateBrandsDatalist(); } }catch(e){}
        try { 
            const r=await fetch(API_DEALERS_URL); 
            if(r.ok) { 
                allDealers=await r.json(); 
                populateFilters(allDealers); 
                renderDealerList(); // ЗДЕСЬ ТЕПЕРЬ КАРТОЧКИ
                renderDashboard(); 
            } 
        } catch(e) { 
            if(dealerListContainer) dealerListContainer.innerHTML='<p class="text-danger p-5 text-center">Ошибка загрузки списка</p>'; 
        }
        const pid=localStorage.getItem('pendingEditDealerId'); if(pid){localStorage.removeItem('pendingEditDealerId');openEditModal(pid);}
    }

    function updateBrandsDatalist(){ if(brandsDatalist) brandsDatalist.innerHTML=competitorsRef.map(r=>`<option value="${r.name}">`).join(''); }
    function updatePosDatalist(){ if(posDatalist) posDatalist.innerHTML=posMaterialsList.map(s=>`<option value="${s}">`).join(''); }
    async function fetchProductCatalog(){ if(!fullProductCatalog.length) try{const r=await fetch(API_PRODUCTS_URL);if(r.ok){fullProductCatalog=await r.json();fullProductCatalog.sort((a,b)=>a.sku.localeCompare(b.sku,'ru',{numeric:true}));}}catch(e){} }
    
    async function completeTask(btn, id, idx) { 
        try { 
            btn.disabled=true; 
            btn.innerHTML='<span class="spinner-border spinner-border-sm"></span>'; 
            const r=await fetch(`${API_DEALERS_URL}/${id}`); const d=await r.json(); 
            if(d.visits&&d.visits[idx]) d.visits[idx].isCompleted=true; 
            await fetch(`${API_DEALERS_URL}/${id}`, {method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({visits:d.visits})}); 
            initApp(); 
        } catch(e){btn.disabled=false;btn.innerHTML='✔';} 
    }

    // --- DASHBOARD (ВАШ ЛЮБИМЫЙ ВАРИАНТ) ---
    function renderDashboard() {
        if (!dashboardContainer) { if(tasksListUpcoming) tasksListUpcoming.innerHTML = '<p class="text-muted text-center p-3">Нет задач</p>'; return; }
        if (!allDealers || allDealers.length === 0) { dashboardContainer.innerHTML = ''; return; }
        
        const activeDealers = allDealers.filter(d => d.status !== 'potential' && d.status !== 'archive');
        const totalDealers = activeDealers.length;
        const noAvatarCount = activeDealers.filter(d => !d.photo_url).length; 
        
        dashboardContainer.innerHTML = `<div class="col-md-6"><div class="stat-card h-100"><i class="bi bi-shop stat-icon text-primary"></i><span class="stat-number">${totalDealers}</span><span class="stat-label">Всего дилеров</span></div></div><div class="col-md-6"><div class="stat-card h-100 ${noAvatarCount > 0 ? 'border-danger' : ''}"><i class="bi bi-camera-fill stat-icon ${noAvatarCount > 0 ? 'text-danger' : 'text-secondary'}"></i><span class="stat-number ${noAvatarCount > 0 ? 'text-danger' : ''}">${noAvatarCount}</span><span class="stat-label">Без Аватара</span></div></div>`;
        
        const today = new Date(); today.setHours(0,0,0,0); const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1); const thirtyDaysAgo = new Date(today.getTime() - (30 * 24 * 60 * 60 * 1000));
        const tasksUpcoming = [], tasksProblem = [], tasksCooling = [];
        allDealers.forEach(d => {
            if (d.status === 'archive') return; const isPotential = d.status === 'potential'; let lastVisitDate = null; let hasFutureTasks = false;
            if (d.visits && Array.isArray(d.visits)) { d.visits.forEach((v, index) => { const vDate = new Date(v.date); if (!v.date) return; vDate.setHours(0,0,0,0); if (v.isCompleted && (!lastVisitDate || vDate > lastVisitDate)) { lastVisitDate = vDate; } if (!v.isCompleted) { const taskData = { dealerName: d.name, dealerId: d.id, date: vDate, comment: v.comment || "", visitIndex: index }; if (vDate < today) { tasksProblem.push({...taskData, type: 'overdue'}); } else { tasksUpcoming.push({...taskData, isToday: vDate.getTime() === today.getTime()}); hasFutureTasks = true; } } }); }
            if (d.status === 'problem') { if (!tasksProblem.some(t => t.dealerId === d.id && t.type === 'overdue')) { tasksProblem.push({ dealerName: d.name, dealerId: d.id, type: 'status' }); } }
            if (!hasFutureTasks && d.status !== 'problem' && !isPotential) { if (!lastVisitDate) { tasksCooling.push({ dealerName: d.name, dealerId: d.id, days: 999 }); } else if (lastVisitDate < thirtyDaysAgo) { const days = Math.floor((today - lastVisitDate) / (1000 * 60 * 60 * 24)); tasksCooling.push({ dealerName: d.name, dealerId: d.id, days: days }); } }
        });
        tasksUpcoming.sort((a, b) => a.date - b.date); tasksProblem.sort((a, b) => (a.date || 0) - (b.date || 0)); tasksCooling.sort((a, b) => b.days - a.days);
        renderTaskList(tasksListUpcoming, tasksUpcoming, 'upcoming'); renderTaskList(tasksListProblem, tasksProblem, 'problem'); renderTaskList(tasksListCooling, tasksCooling, 'cooling');
    }
    function renderTaskList(container, tasks, type) { if (!container) return; if (tasks.length === 0) { const msg = type === 'cooling' ? 'Нет таких' : 'Нет задач'; container.innerHTML = `<p class="text-muted text-center p-3">${msg}</p>`; return; } container.innerHTML = tasks.map(t => { let badge = ''; let comment = safeText(t.comment); if (type === 'upcoming') { badge = `<span class="badge ${t.isToday ? 'bg-danger' : 'bg-primary'} rounded-pill me-2">${t.isToday ? 'Сегодня' : t.date.toLocaleDateString('ru-RU')}</span>`; } else if (type === 'problem') { badge = t.type === 'overdue' ? `<span class="badge bg-danger rounded-pill me-2">Просрочено: ${t.date.toLocaleDateString('ru-RU')}</span>` : `<span class="badge bg-danger rounded-pill me-2">Статус: Проблемный</span>`; if(t.type !== 'overdue') comment = '<i>Требует внимания</i>'; } else if (type === 'cooling') { badge = `<span class="badge bg-warning text-dark rounded-pill me-2">Нет визитов: ${t.days === 999 ? 'Никогда' : `${t.days} дн.`}</span>`; comment = '<i>Нужно связаться</i>'; } return `<div class="list-group-item task-item d-flex justify-content-between align-items-center"><div class="me-auto"><div class="d-flex align-items-center mb-1">${badge}<a href="dealer.html?id=${t.dealerId}" target="_blank" class="fw-bold text-dark text-decoration-none">${t.dealerName}</a></div><small class="text-muted" style="white-space: pre-wrap;">${comment}</small></div>${(type === 'upcoming' || (type === 'problem' && t.type === 'overdue')) ? `<button class="btn btn-sm btn-success btn-complete-task" data-id="${t.dealerId}" data-index="${t.visitIndex}">✔</button>` : ''}</div>`; }).join(''); }
    
    if(document.body) { document.body.addEventListener('click', (e) => { const taskBtn = e.target.closest('.btn-complete-task'); if (taskBtn) { completeTask(taskBtn, taskBtn.dataset.id, taskBtn.dataset.index); } }); }

    // --- RENDER CARDS (ЕДИНСТВЕННОЕ ИЗМЕНЕНИЕ) ---
    function renderDealerList() {
        if (!dealerListContainer) return;
        const city = filterCity.value; const type = filterPriceType.value; const status = filterStatus.value; const responsible = filterResponsible.value; const search = searchBar.value.toLowerCase();
        
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
            if(d.status==='active'){statusClass='st-active';statusText='Активный';} else if(d.status==='problem'){statusClass='st-problem';statusText='Проблема';} else if(d.status==='potential'){statusClass='st-potential';statusText='Лид';} else if(d.status==='archive'){statusClass='st-archive';statusText='Архив';}
            
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
            </div>`;
        }).join('');
    }

    // --- CLICK DELEGATION ---
    if(dealerListContainer) {
        dealerListContainer.addEventListener('click', (e) => {
            const btnEdit = e.target.closest('.btn-edit'); const btnDel = e.target.closest('.btn-delete'); const btnDup = e.target.closest('.btn-duplicate'); const btnVisit = e.target.closest('.btn-quick-visit'); const item = e.target.closest('.dealer-item');
            if (!item) return; const id = item.dataset.id;
            if (btnEdit) openEditModal(id);
            else if (btnDel && confirm('Удалить?')) fetch(`${API_DEALERS_URL}/${id}`, {method:'DELETE'}).then(initApp);
            else if (btnDup) duplicateDealer(id);
            else if (btnVisit) { document.getElementById('qv_dealer_id').value = id; document.getElementById('qv_comment').value = ''; qvModal.show(); }
        });
    }

    function populateFilters(dealers) {
        if(!filterCity || !filterPriceType) return;
        const cities = [...new Set(dealers.map(d => d.city).filter(Boolean))].sort();
        const types = [...new Set(dealers.map(d => d.price_type).filter(Boolean))].sort();
        filterCity.innerHTML = '<option value="">-- Город --</option>'; filterPriceType.innerHTML = '<option value="">-- Тип цен --</option>';
        cities.forEach(c => filterCity.add(new Option(c, c))); types.forEach(t => filterPriceType.add(new Option(t, t)));
    }

    // --- LISTENERS ADD ---
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

    // OPEN ADD
    if(openAddModalBtn) openAddModalBtn.onclick = () => {
        if(addForm) addForm.reset();
        renderProductChecklist(addProductChecklist);
        renderList(addContactList, [], createContactEntryHTML); renderList(addAddressList, [], createAddressEntryHTML);
        renderList(addPosList, [], createPosEntryHTML); renderList(addVisitsList, [], createVisitEntryHTML);
        renderList(addCompetitorList, [], createCompetitorEntryHTML);
        if(document.getElementById('add_latitude')) { document.getElementById('add_latitude').value = ''; document.getElementById('add_longitude').value = ''; }
        addPhotosData = []; renderPhotoPreviews(addPhotoPreviewContainer, []);
        if(addAvatarPreview) addAvatarPreview.src = ''; newAvatarBase64 = null;
        addModal.show();
    };

    if(addForm) addForm.addEventListener('submit', async (e) => {
        e.preventDefault(); if(isSaving)return; isSaving=true; const btn=document.getElementById('btn-finish-step'); btn.disabled=true;
        const data=collectFormData(addForm,'add'); data.photos=addPhotosData; if(newAvatarBase64)data.avatarUrl=newAvatarBase64;
        try{const res=await fetch(API_DEALERS_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}); if(!res.ok) throw new Error(); const d=await res.json(); const p=getSelectedProductIds('add-product-checklist'); if(p.length) await saveProducts(d.id,p); addModal.hide(); initApp(); }catch(e){alert('Err');}finally{isSaving=false;btn.disabled=false;}
    });

    async function openEditModal(id) {
        try {
            const res = await fetch(`${API_DEALERS_URL}/${id}`); if(!res.ok) throw new Error("Ошибка"); const d = await res.json();
            const titleEl = document.querySelector('#edit-modal .modal-title'); if(titleEl) titleEl.textContent = `Редактировать: ${d.name} (ID: ${d.dealer_id})`;
            document.getElementById('edit_db_id').value=d.id; document.getElementById('edit_dealer_id').value=d.dealer_id; document.getElementById('edit_name').value=d.name; document.getElementById('edit_organization').value=d.organization; document.getElementById('edit_price_type').value=d.price_type; document.getElementById('edit_city').value=d.city; document.getElementById('edit_address').value=d.address; document.getElementById('edit_delivery').value=d.delivery; document.getElementById('edit_website').value=d.website; document.getElementById('edit_instagram').value=d.instagram;
            if(document.getElementById('edit_latitude')) document.getElementById('edit_latitude').value=d.latitude||'';
            if(document.getElementById('edit_longitude')) document.getElementById('edit_longitude').value=d.longitude||'';
            document.getElementById('edit_bonuses').value=d.bonuses;
            if(document.getElementById('edit_status')) document.getElementById('edit_status').value = d.status || 'standard';
            if(document.getElementById('edit_responsible')) document.getElementById('edit_responsible').value = d.responsible || '';
            if(editAvatarPreview) editAvatarPreview.src = d.avatarUrl || '';
            if(editCurrentAvatarUrl) editCurrentAvatarUrl.value = d.avatarUrl || '';
            newAvatarBase64 = null;
            renderList(editContactList, d.contacts, createContactEntryHTML); renderList(editAddressList, d.additional_addresses, createAddressEntryHTML); 
            renderList(editPosList, d.pos_materials, createPosEntryHTML); renderList(editVisitsList, d.visits, createVisitEntryHTML);
            renderList(editCompetitorList, d.competitors, createCompetitorEntryHTML);
            renderProductChecklist(editProductChecklist, (d.products||[]).map(p=>p.id));
            editPhotosData = d.photos||[]; renderPhotoPreviews(editPhotoPreviewContainer, editPhotosData);
            const firstTabEl = document.querySelector('#editTabs button[data-bs-target="#tab-main"]'); if(firstTabEl) { const tab = new bootstrap.Tab(firstTabEl); tab.show(); }
            editModal.show();
        } catch(e){alert("Ошибка загрузки.");}
    }

    if(editForm) editForm.addEventListener('submit', async (e) => {
        e.preventDefault(); if(isSaving)return; isSaving=true; const btn=document.querySelector('button[form="edit-dealer-form"]'); btn.disabled=true; const id=document.getElementById('edit_db_id').value;
        const data=collectFormData(editForm,'edit'); data.photos=editPhotosData; if(newAvatarBase64)data.avatarUrl=newAvatarBase64;else data.avatarUrl=document.getElementById('edit-current-avatar-url').value;
        try{await fetch(`${API_DEALERS_URL}/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}); const p=getSelectedProductIds('edit-product-checklist'); await saveProducts(id,p); editModal.hide(); initApp(); }catch(e){alert('Err');}finally{isSaving=false;btn.disabled=false;}
    });

    async function duplicateDealer(id) {
        try {
            const res = await fetch(`${API_DEALERS_URL}/${id}`); if(!res.ok) throw new Error("Ошибка"); const d = await res.json();
            addForm.reset(); document.getElementById('dealer_id').value = ''; document.getElementById('name').value = d.name + ' (Копия)'; document.getElementById('city').value = d.city || '';
            renderList(addContactList, d.contacts || [], createContactEntryHTML); renderList(addAddressList, d.additional_addresses || [], createAddressEntryHTML);
            renderList(addPosList, d.pos_materials || [], createPosEntryHTML); renderList(addCompetitorList, d.competitors || [], createCompetitorEntryHTML);
            const pIds = (d.products || []).map(p => p.id); renderProductChecklist(addProductChecklist, pIds);
            currentStep = 1; showStep(1); addModal.show(); alert("Данные скопированы. Введите новый ID.");
        } catch (e) { alert("Ошибка дублирования"); }
    }

    if(qvForm) qvForm.addEventListener('submit', async (e) => {
        e.preventDefault(); if(isSaving)return; isSaving=true; const id=document.getElementById('qv_dealer_id').value; const comment=document.getElementById('qv_comment').value; if(!id||!comment){isSaving=false;return;} try{const r=await fetch(`${API_DEALERS_URL}/${id}`);const d=await r.json();const v=[...(d.visits||[]), {date:new Date().toISOString().slice(0,10),comment,isCompleted:true}]; await fetch(`${API_DEALERS_URL}/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({visits:v})});qvModal.hide();alert("Визит добавлен!");}catch(e){}finally{isSaving=false;btn.disabled=false;}
    });

    if(exportBtn) exportBtn.onclick = async () => { /* ... */ };
    
    if(filterCity) filterCity.onchange = renderDealerList; 
    if(filterPriceType) filterPriceType.onchange = renderDealerList; 
    if(filterStatus) filterStatus.onchange = renderDealerList;
    if(filterResponsible) filterResponsible.onchange = renderDealerList;
    if(searchBar) searchBar.oninput = renderDealerList;
    
    function collectFormData(form, prefix) {
        const list = prefix === 'add' ? [addContactList, addAddressList, addPosList, addVisitsList, addCompetitorList] : [editContactList, editAddressList, editPosList, editVisitsList, editCompetitorList];
        return {
            dealer_id: document.getElementById(`${prefix}_dealer_id`).value, name: document.getElementById(`${prefix}_name`).value, organization: document.getElementById(`${prefix}_organization`)?.value, price_type: document.getElementById(`${prefix}_price_type`)?.value, city: document.getElementById(`${prefix}_city`)?.value, address: document.getElementById(`${prefix}_address`)?.value, delivery: document.getElementById(`${prefix}_delivery`)?.value, website: document.getElementById(`${prefix}_website`)?.value, instagram: document.getElementById(`${prefix}_instagram`)?.value, latitude: document.getElementById(`${prefix}_latitude`)?.value, longitude: document.getElementById(`${prefix}_longitude`)?.value, bonuses: document.getElementById(`${prefix === 'add' ? 'bonuses' : 'edit_bonuses'}`)?.value, status: document.getElementById(`${prefix}_status`)?.value, responsible: document.getElementById(`${prefix}_responsible`)?.value,
            contacts: collectData(list[0], '.contact-entry', [{key:'name',class:'.contact-name'},{key:'position',class:'.contact-position'},{key:'contactInfo',class:'.contact-info'}]),
            additional_addresses: collectData(list[1], '.address-entry', [{key:'description',class:'.address-description'},{key:'city',class:'.address-city'},{key:'address',class:'.address-address'}]),
            pos_materials: collectData(list[2], '.pos-entry', [{key:'name',class:'.pos-name'},{key:'quantity',class:'.pos-quantity'}]),
            visits: collectData(list[3], '.visit-entry', [{key:'date',class:'.visit-date'},{key:'comment',class:'.visit-comment'}]),
            competitors: collectData(list[4], '.competitor-entry', [{key:'brand',class:'.competitor-brand'},{key:'collection',class:'.competitor-collection'},{key:'price_opt',class:'.competitor-price-opt'},{key:'price_retail',class:'.competitor-price-retail'}])
        };
    }
    
    // --- RESTORED HELPERS (ТО ЧТО ПРОПАДАЛО) ---
    function renderProductChecklist(container, selectedIds=[]) { if(!container) return; const set = new Set(selectedIds); container.innerHTML = fullProductCatalog.map(p => `<div class="checklist-item form-check"><input type="checkbox" class="form-check-input" value="${p.id}" ${set.has(p.id)?'checked':''}><label class="form-check-label">${p.sku} - ${p.name}</label></div>`).join(''); }
    function getSelectedProductIds(containerId) { const el=document.getElementById(containerId); if(!el) return []; return Array.from(el.querySelectorAll('input:checked')).map(cb=>cb.value); }
    async function saveProducts(dealerId, ids) { await fetch(`${API_DEALERS_URL}/${dealerId}/products`, {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({productIds: ids})}); }
    function renderList(container, data, htmlGen) { if(container) container.innerHTML = (data || []).map(htmlGen).join(''); }

    // WIZARD
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

    initApp();
});
