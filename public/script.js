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

    // MODALS
    const addModalEl = document.getElementById('add-modal'); const addModal = new bootstrap.Modal(addModalEl, { backdrop: 'static', keyboard: false });
    const addForm = document.getElementById('add-dealer-form');
    const editModalEl = document.getElementById('edit-modal'); const editModal = new bootstrap.Modal(editModalEl, { backdrop: 'static', keyboard: false });
    const editForm = document.getElementById('edit-dealer-form');
    const qvModalEl = document.getElementById('quick-visit-modal'); const qvModal = new bootstrap.Modal(qvModalEl, { backdrop: 'static', keyboard: false });
    const qvForm = document.getElementById('quick-visit-form');

    // ELEMENTS
    const openAddModalBtn = document.getElementById('open-add-modal-btn');
    const brandsDatalist = document.getElementById('brands-datalist');
    const posDatalist = document.getElementById('pos-materials-datalist');
    
    // !!! ИСПОЛЬЗУЕМ КОНТЕЙНЕР КАРТОЧЕК !!!
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

    // INIT
    async function initApp() {
        await fetchProductCatalog();
        updatePosDatalist();
        try { const r=await fetch(API_COMPETITORS_REF_URL); if(r.ok) { competitorsRef=await r.json(); updateBrandsDatalist(); } }catch(e){}
        try { 
            const r=await fetch(API_DEALERS_URL); 
            if(r.ok) { 
                allDealers=await r.json(); 
                populateFilters(allDealers); 
                renderDealerList(); // КАРТОЧКИ
                renderDashboard(); // 2 КАРТОЧКИ
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
            btn.disabled=true; btn.innerHTML='<span class="spinner-border spinner-border-sm"></span>'; 
            const r=await fetch(`${API_DEALERS_URL}/${id}`); const d=await r.json(); 
            if(d.visits&&d.visits[idx]) d.visits[idx].isCompleted=true; 
            await fetch(`${API_DEALERS_URL}/${id}`, {method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({visits:d.visits})}); 
            initApp(); 
        } catch(e){btn.disabled=false;btn.innerHTML='✔';} 
    }

    // --- DASHBOARD (2 КАРТОЧКИ) ---
    function renderDashboard() {
        if(!dashboardContainer) return;
        if(!allDealers.length) { dashboardContainer.innerHTML=''; return; }
        const total = allDealers.filter(d=>d.status!=='potential'&&d.status!=='archive').length;
        const noPhoto = allDealers.filter(d=>!d.photo_url).length;
        dashboardContainer.innerHTML=`
            <div class="col-6 col-md-6"><div class="stat-card h-100 p-3 bg-white rounded shadow-sm border border-primary text-center d-flex align-items-center justify-content-center flex-column"><i class="bi bi-shop stat-icon text-primary fs-1 mb-2"></i><span class="fs-2 fw-bold text-primary">${total}</span><span class="text-muted small text-uppercase fw-bold">Всего дилеров</span></div></div>
            <div class="col-6 col-md-6"><div class="stat-card h-100 p-3 bg-white rounded shadow-sm border border-danger text-center d-flex align-items-center justify-content-center flex-column"><i class="bi bi-camera-fill stat-icon text-danger fs-1 mb-2"></i><span class="fs-2 fw-bold text-danger">${noPhoto}</span><span class="text-muted small text-uppercase fw-bold">Без фото</span></div></div>
        `;
        
        const today=new Date(); today.setHours(0,0,0,0); const upcoming=[], problem=[], cooling=[]; const monthAgo=new Date(today.getTime()-(30*24*60*60*1000));
        allDealers.forEach(d=>{
            if(d.status==='archive'||d.status==='potential') return;
            let last=null, future=false;
            if(d.visits) d.visits.forEach((v,i)=>{ if(!v.date)return; const dt=new Date(v.date); dt.setHours(0,0,0,0); if(v.isCompleted){if(!last||dt>last)last=dt;} else { const t={dealerName:d.name,dealerId:d.id,date:dt,comment:v.comment,visitIndex:i}; if(dt<today) problem.push({...t,type:'overdue'}); else { upcoming.push({...t,isToday:dt.getTime()===today.getTime()}); future=true; } } });
            if(d.status==='problem' && !problem.some(x=>x.dealerId===d.id)) problem.push({dealerName:d.name,dealerId:d.id,type:'status'});
            if(!future && d.status!=='problem') { if(!last) cooling.push({dealerName:d.name,dealerId:d.id,days:999}); else if(last<monthAgo) cooling.push({dealerName:d.name,dealerId:d.id,days:Math.floor((today-last)/(1000*60*60*24))}); }
        });
        renderTaskList(document.getElementById('tasks-list-upcoming'), upcoming.sort((a,b)=>a.date-b.date), 'upcoming');
        renderTaskList(document.getElementById('tasks-list-problem'), problem, 'problem');
        renderTaskList(document.getElementById('tasks-list-cooling'), cooling.sort((a,b)=>b.days-a.days), 'cooling');
    }

    function renderTaskList(container, tasks, type) {
        if(!container) return;
        if(!tasks.length) { container.innerHTML=`<p class="text-muted text-center p-2 small">Пусто</p>`; return; }
        c.innerHTML=tasks.map(t=>{
            let b=''; if(type==='upcoming') b=`<span class="badge ${t.isToday?'bg-danger':'bg-primary'} rounded-pill me-2">${t.isToday?'Сегодня':t.date.toLocaleDateString()}</span>`;
            if(type==='problem') b=t.type==='overdue'?`<span class="badge bg-danger me-2">Просрочено</span>`:`<span class="badge bg-danger me-2">Статус</span>`;
            if(type==='cooling') b=`<span class="badge bg-warning text-dark me-2">${t.days} дн.</span>`;
            return `<div class="list-group-item d-flex justify-content-between align-items-center p-2"><div>${b}<a href="dealer.html?id=${t.dealerId}" target="_blank" class="fw-bold text-dark text-decoration-none">${t.dealerName}</a></div>${type!=='cooling'?`<button class="btn btn-sm btn-success btn-complete-task" data-id="${t.dealerId}" data-index="${t.visitIndex}">✔</button>`:''}</div>`;
        }).join('');
    }

    // --- RENDER CARDS ---
    function renderDealerList() {
        if (!dealerListContainer) return;
        const city = filterCity.value; const type = filterPriceType.value; const status = filterStatus.value; const responsible = filterResponsible.value; const search = searchBar.value.toLowerCase();
        const filtered = allDealers.filter(d => {
            return (!city||d.city===city) && (!type||d.price_type===type) && (!status||d.status===status) && (!responsible||d.responsible===responsible) && 
                   (!search || (d.name||'').toLowerCase().includes(search)||(d.dealer_id||'').toLowerCase().includes(search));
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

    if(filterCity) filterCity.onchange = renderDealerList; 
    if(filterPriceType) filterPriceType.onchange = renderDealerList; 
    if(filterStatus) filterStatus.onchange = renderDealerList;
    if(filterResponsible) filterResponsible.onchange = renderDealerList;
    if(searchBar) searchBar.oninput = renderDealerList;

    if(document.body) { document.body.addEventListener('click', (e) => { const taskBtn = e.target.closest('.btn-complete-task'); if (taskBtn) { completeTask(taskBtn, taskBtn.dataset.id, taskBtn.dataset.index); } }); }

    // GENERATORS
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
                    let icon = ''; if(colType.includes('eng')) icon = '🌲 '; else if(colType.includes('french')) icon = '🌊 '; else if(colType.includes('art')) icon = '🎨 ';
                    collOpts += `<option value="${colName}" ${sel}>${icon}${colName}</option>`;
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
             html += sortedCols.map(col => { const colName = (typeof col === 'string') ? col : col.name; const colType = (typeof col === 'object') ? col.type : 'std'; let icon = ''; if(colType.includes('eng')) icon = '🌲 '; else if(colType.includes('french')) icon = '🌊 '; else if(colType.includes('art')) icon = '🎨 '; return `<option value="${colName}">${icon}${colName}</option>`; }).join('');
        }
        collSelect.innerHTML = html;
    };

    function createPosEntryHTML(p={}) { return `<div class="pos-entry input-group mb-2"><input type="text" class="form-control pos-name" list="pos-materials-datalist" placeholder="Стенд (ввод)" value="${p.name||''}"><input type="number" class="form-control pos-quantity" value="${p.quantity||1}" min="1" style="max-width: 80px;" placeholder="Кол"><button type="button" class="btn btn-outline-danger btn-remove-entry" onclick="this.closest('.pos-entry').remove()">×</button></div>`; }
    function createContactEntryHTML(c={}) { return `<div class="contact-entry input-group mb-2"><input type="text" class="form-control contact-name" placeholder="Имя" value="${c.name||''}"><input type="text" class="form-control contact-position" placeholder="Должность" value="${c.position||''}"><input type="text" class="form-control contact-info" placeholder="Телефон" value="${c.contactInfo||''}"><button type="button" class="btn btn-outline-danger btn-remove-entry" onclick="this.closest('.contact-entry').remove()">×</button></div>`; }
    function createAddressEntryHTML(a={}) { return `<div class="address-entry input-group mb-2"><input type="text" class="form-control address-description" placeholder="Описание" value="${a.description||''}"><input type="text" class="form-control address-city" placeholder="Город" value="${a.city||''}"><input type="text" class="form-control address-address" placeholder="Адрес" value="${a.address||''}"><button type="button" class="btn btn-outline-danger btn-remove-entry" onclick="this.closest('.address-entry').remove()">×</button></div>`; }
    function createVisitEntryHTML(v={}) { return `<div class="visit-entry input-group mb-2"><input type="date" class="form-control visit-date" value="${v.date||''}"><input type="text" class="form-control visit-comment w-50" placeholder="Результат..." value="${v.comment||''}"><button type="button" class="btn btn-outline-danger btn-remove-entry" onclick="this.closest('.visit-entry').remove()">×</button></div>`; }
    function renderPhotoPreviews(container, photosArray) { if(container) container.innerHTML = photosArray.map((p, index) => `<div class="photo-preview-item"><img src="${p.photo_url}"><button type="button" class="btn-remove-photo" data-index="${index}">×</button></div>`).join(''); }

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
    
    function renderList(container, data, htmlGen) { if(container) container.innerHTML = (data || []).map(htmlGen).join(''); }
    function renderProductChecklist(container, selectedIds=[]) { if(!container) return; const set = new Set(selectedIds); container.innerHTML = fullProductCatalog.map(p => `<div class="checklist-item form-check"><input type="checkbox" class="form-check-input" value="${p.id}" ${set.has(p.id)?'checked':''}><label class="form-check-label">${p.sku} - ${p.name}</label></div>`).join(''); }
    function getSelectedProductIds(containerId) { const el=document.getElementById(containerId); if(!el) return []; return Array.from(el.querySelectorAll('input:checked')).map(cb=>cb.value); }
    async function saveProducts(dealerId, ids) { await fetch(`${API_DEALERS_URL}/${dealerId}/products`, {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({productIds: ids})}); }

    // EXPORT (Standard)
    if(exportBtn) exportBtn.onclick = async () => {
        if (!allDealers.length) return alert("Пусто");
        exportBtn.disabled = true; exportBtn.innerHTML = '...';
        const clean = (text) => `"${String(text || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`;
        const city = filterCity.value; const type = filterPriceType.value; const status = filterStatus.value; const responsible = filterResponsible.value; const search = searchBar.value.toLowerCase();
        const filteredForExport = allDealers.filter(d => {
            let statusMatch = false; const s = d.status || 'standard'; if (status) statusMatch = s === status; else statusMatch = s !== 'potential';
            return (!city||d.city===city) && (!type||d.price_type===type) && (!responsible||d.responsible===responsible) && statusMatch && (!search || ((d.name||'').toLowerCase().includes(search)||(d.dealer_id||'').toLowerCase().includes(search)||(d.organization||'').toLowerCase().includes(search)));
        });
        let csv = "\uFEFFID;Название;Статус;Ответственный;Город;Адрес;Тип цен;Организация;Доставка;Сайт;Инстаграм;Контакты;Доп. Адреса;Бонусы\n";
        try {
            for (const d of filteredForExport) {
                const contacts = (d.contacts || []).map(c => `${c.name} (${c.contactInfo})`).join('; ');
                const addrs = (d.additional_addresses || []).map(a => `${a.description}: ${a.city}, ${a.address}`).join('; ');
                csv += `${clean(d.dealer_id)};${clean(d.name)};${clean(d.status)};${clean(d.responsible)};${clean(d.city)};${clean(d.address)};${clean(d.price_type)};${clean(d.organization)};${clean(d.delivery)};${clean(d.website)};${clean(d.instagram)};${clean(contacts)};${clean(addrs)};${clean(d.bonuses)}\n`;
            }
            const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8;'})); a.download = 'dealers_export.csv'; a.click();
        } catch(e){} finally { exportBtn.disabled = false; exportBtn.innerHTML = 'База'; }
    };

    initApp();
});
