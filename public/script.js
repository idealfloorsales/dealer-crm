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

    // TABLE
    const dealerListBody = document.getElementById('dealer-list-body'); 
    const dealerTable = document.getElementById('dealer-table');

    const noDataMsg = document.getElementById('no-data-msg');
    const filterCity = document.getElementById('filter-city');
    const filterPriceType = document.getElementById('filter-price-type');
    const filterStatus = document.getElementById('filter-status');
    const filterResponsible = document.getElementById('filter-responsible');
    const searchBar = document.getElementById('search-bar'); 
    const exportBtn = document.getElementById('export-dealers-btn'); 
    
    // DASHBOARD ELEMENTS
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
                renderDealerList(); 
                renderDashboard(); 
            } 
        } catch(e) { 
            if(dealerListBody) dealerListBody.innerHTML='<tr><td colspan="8" class="text-danger text-center">Ошибка загрузки</td></tr>'; 
        }
        const pid=localStorage.getItem('pendingEditDealerId'); if(pid){localStorage.removeItem('pendingEditDealerId');openEditModal(pid);}
    }

    function updateBrandsDatalist(){ if(brandsDatalist) brandsDatalist.innerHTML=competitorsRef.map(r=>`<option value="${r.name}">`).join(''); }
    function updatePosDatalist(){ if(posDatalist) posDatalist.innerHTML=posMaterialsList.map(s=>`<option value="${s}">`).join(''); }
    async function fetchProductCatalog(){ if(!fullProductCatalog.length) try{const r=await fetch(API_PRODUCTS_URL);if(r.ok){fullProductCatalog=await r.json();fullProductCatalog.sort((a,b)=>a.sku.localeCompare(b.sku,'ru',{numeric:true}));}}catch(e){} }
    
    // TASK COMPLETE (SPINNER)
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

    // --- DASHBOARD (RESTORED 2x2 LOGIC: 2 STATS + 3 LISTS) ---
    function renderDashboard() {
        if(!dashboardContainer) return;
        if(!allDealers.length) { dashboardContainer.innerHTML=''; return; }
        
        // Статистика (2 большие карточки)
        const total = allDealers.filter(d=>d.status!=='potential'&&d.status!=='archive').length;
        const noPhoto = allDealers.filter(d=>!d.photo_url).length;
        
        dashboardContainer.innerHTML = `
            <div class="col-md-6"><div class="stat-card h-100 p-3 bg-white rounded shadow-sm border border-primary text-center d-flex align-items-center justify-content-center flex-column"><i class="bi bi-shop stat-icon text-primary fs-1 mb-2"></i><span class="fs-2 fw-bold text-primary">${total}</span><span class="text-muted small text-uppercase fw-bold">Всего дилеров</span></div></div>
            <div class="col-md-6"><div class="stat-card h-100 p-3 bg-white rounded shadow-sm border border-danger text-center d-flex align-items-center justify-content-center flex-column"><i class="bi bi-camera-fill stat-icon text-danger fs-1 mb-2"></i><span class="fs-2 fw-bold text-danger">${noPhoto}</span><span class="text-muted small text-uppercase fw-bold">Без фото</span></div></div>
        `;
        
        // Задачи
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
        container.innerHTML=tasks.map(t=>{
            let b=''; 
            if(type==='upcoming') b=`<span class="badge ${t.isToday?'bg-danger':'bg-primary'} rounded-pill me-2">${t.isToday?'Сегодня':t.date.toLocaleDateString()}</span>`;
            if(type==='problem') b=t.type==='overdue'?`<span class="badge bg-danger me-2">Просрочено</span>`:`<span class="badge bg-danger me-2">Статус</span>`;
            if(type==='cooling') b=`<span class="badge bg-warning text-dark me-2">${t.days} дн.</span>`;
            // Галочка с анимацией (при нажатии вызывается completeTask)
            return `<div class="list-group-item d-flex justify-content-between align-items-center p-2"><div>${b}<a href="dealer.html?id=${t.dealerId}" target="_blank" class="fw-bold text-dark text-decoration-none">${t.dealerName}</a></div>${type!=='cooling'?`<button class="btn btn-sm btn-success btn-complete-task" data-id="${t.dealerId}" data-index="${t.visitIndex}">✔</button>`:''}</div>`;
        }).join('');
    }

    if(document.body) { document.body.addEventListener('click', (e) => { const btn = e.target.closest('.btn-complete-task'); if (btn) { completeTask(btn, btn.dataset.id, btn.dataset.index); } }); }

    // --- RENDER TABLE ---
    function renderDealerList() {
        if (!dealerListBody) return;
        const city = filterCity.value; const type = filterPriceType.value; const status = filterStatus.value; const responsible = filterResponsible.value; const search = searchBar.value.toLowerCase();
        const filtered = allDealers.filter(d => {
            return (!city||d.city===city) && (!type||d.price_type===type) && (!status||d.status===status) && (!responsible||d.responsible===responsible) && 
                   (!search || (d.name||'').toLowerCase().includes(search)||(d.dealer_id||'').toLowerCase().includes(search));
        });
        filtered.sort((a, b) => { let valA = (a[currentSort.column] || '').toString(); let valB = (b[currentSort.column] || '').toString(); let res = currentSort.column === 'dealer_id' ? valA.localeCompare(valB, undefined, {numeric:true}) : valA.toLowerCase().localeCompare(valB.toLowerCase(), 'ru'); return currentSort.direction === 'asc' ? res : -res; });
        
        if (filtered.length === 0) { dealerListBody.innerHTML = ''; noDataMsg.style.display = 'block'; if(dealerTable) dealerTable.style.display='none'; return; }
        noDataMsg.style.display = 'none'; if(dealerTable) dealerTable.style.display='table';

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

    function populateFilters(dealers) {
        if(!filterCity || !filterPriceType) return;
        const cities = [...new Set(dealers.map(d => d.city).filter(Boolean))].sort();
        const types = [...new Set(dealers.map(d => d.price_type).filter(Boolean))].sort();
        filterCity.innerHTML = '<option value="">-- Город --</option>'; filterPriceType.innerHTML = '<option value="">-- Тип цен --</option>';
        cities.forEach(c => filterCity.add(new Option(c, c))); types.forEach(t => filterPriceType.add(new Option(t, t)));
        filterCity.value = sc; filterPriceType.value = st;
    }

    // --- LISTENERS ADD ---
    if(document.getElementById('add-contact-btn-add-modal')) document.getElementById('add-contact-btn-add-modal').onclick = () => addContactList.insertAdjacentHTML('beforeend', createContactEntryHTML());
    if(document.getElementById('add-address-btn-add-modal')) document.getElementById('add-address-btn-add-modal').onclick = () => addAddressList.insertAdjacentHTML('beforeend', createAddressEntryHTML());
    if(document.getElementById('add-pos-btn-add-modal')) document.getElementById('add-pos-btn-add-modal').onclick = () => addPosList.insertAdjacentHTML('beforeend', createPosEntryHTML());
    if(document.getElementById('add-visits-btn-add-modal')) document.getElementById('add-visits-btn-add-modal').onclick = () => addVisitsList.insertAdjacentHTML('beforeend', createVisitEntryHTML());
    if(document.getElementById('add-competitor-btn-add-modal')) document.getElementById('add-competitor-btn-add-modal').onclick = () => addCompetitorList.insertAdjacentHTML('beforeend', createCompetitorEntryHTML());
    
    // --- LISTENERS EDIT ---
    if(document.getElementById('add-contact-btn-edit-modal')) document.getElementById('add-contact-btn-edit-modal').onclick = () => editContactList.insertAdjacentHTML('beforeend', createContactEntryHTML());
    if(document.getElementById('add-address-btn-edit-modal')) document.getElementById('add-address-btn-edit-modal').onclick = () => editAddressList.insertAdjacentHTML('beforeend', createAddressEntryHTML());
    if(document.getElementById('add-pos-btn-edit-modal')) document.getElementById('add-pos-btn-edit-modal').onclick = () => editPosList.insertAdjacentHTML('beforeend', createPosEntryHTML());
    if(document.getElementById('add-visits-btn-edit-modal')) document.getElementById('add-visits-btn-edit-modal').onclick = () => editVisitsList.insertAdjacentHTML('beforeend', createVisitEntryHTML());
    if(document.getElementById('add-competitor-btn-edit-modal')) document.getElementById('add-competitor-btn-edit-modal').onclick = () => editCompetitorList.insertAdjacentHTML('beforeend', createCompetitorEntryHTML());

    // OPEN ADD
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
        addModal.show();
    };

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

    // SAVE ADD (LOCK)
    if(addForm) addForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (isSaving) return; isSaving = true;
        const btn = document.getElementById('btn-finish-step'); 
        const oldText = btn.innerHTML; 
        btn.disabled = true; 
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
        
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

    // OPEN EDIT
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
            renderList(editPosList, d.pos_materials, createPosEntryHTML); 
            renderList(editVisitsList, d.visits, createVisitEntryHTML);
            renderList(editCompetitorList, d.competitors, createCompetitorEntryHTML);
            renderProductChecklist(editProductChecklist, (d.products||[]).map(p=>p.id));
            editPhotosData = d.photos||[]; renderPhotoPreviews(editPhotoPreviewContainer, editPhotosData);
            const firstTabEl = document.querySelector('#editTabs button[data-bs-target="#tab-main"]'); if(firstTabEl) { const tab = new bootstrap.Tab(firstTabEl); tab.show(); }
            editModal.show();
        } catch(e){alert("Ошибка загрузки.");}
    }

    // SAVE EDIT (LOCK)
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

    async function duplicateDealer(id) {
        try {
            const res = await fetch(`${API_DEALERS_URL}/${id}`);
            if(!res.ok) throw new Error("Ошибка");
            const d = await res.json();
            addForm.reset();
            document.getElementById('dealer_id').value = ''; document.getElementById('name').value = d.name + ' (Копия)'; document.getElementById('city').value = d.city || '';
            renderList(addContactList, d.contacts || [], createContactEntryHTML);
            renderList(addAddressList, d.additional_addresses || [], createAddressEntryHTML);
            renderList(addPosList, d.pos_materials || [], createPosEntryHTML);
            renderList(addCompetitorList, d.competitors || [], createCompetitorEntryHTML);
            const pIds = (d.products || []).map(p => p.id);
            renderProductChecklist(addProductChecklist, pIds);
            currentStep = 1; showStep(1); addModal.show(); alert("Данные скопированы. Введите новый ID.");
        } catch (e) { alert("Ошибка дублирования"); }
    }

    if(dealerListBody) dealerListBody.addEventListener('click', (e) => {
        const t = e.target;
        if (t.closest('a.dropdown-item')) e.preventDefault();
        if (t.closest('.btn-view')) window.open(`dealer.html?id=${t.closest('.btn-view').dataset.id}`, '_blank');
        if (t.closest('.btn-edit')) openEditModal(t.closest('.btn-edit').dataset.id);
        if (t.closest('.btn-delete') && confirm("Удалить?")) fetch(`${API_DEALERS_URL}/${t.closest('.btn-delete').dataset.id}`, {method:'DELETE'}).then(initApp);
        if (t.closest('.btn-duplicate')) duplicateDealer(t.closest('.btn-duplicate').dataset.id);
        if (t.closest('.btn-quick-visit')) {
            const btn = t.closest('.btn-quick-visit');
            document.getElementById('qv_dealer_id').value = btn.dataset.id;
            document.getElementById('qv_comment').value = '';
            qvModal.show();
        }
    });

    if(qvForm) qvForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (isSaving) return; isSaving = true;
        const id = document.getElementById('qv_dealer_id').value;
        const comment = document.getElementById('qv_comment').value;
        const btn = qvForm.querySelector('button');
        if(!id || !comment) { isSaving = false; return; }
        try {
            btn.disabled = true;
            const getRes = await fetch(`${API_DEALERS_URL}/${id}`);
            const dealer = await getRes.json();
            const newVisit = { date: new Date().toISOString().slice(0,10), comment: comment, isCompleted: true };
            const visits = [...(dealer.visits || []), newVisit];
            await fetch(`${API_DEALERS_URL}/${id}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ visits }) });
            qvModal.hide(); alert("Визит добавлен!");
        } catch(e) { alert("Ошибка"); } finally { isSaving = false; btn.disabled = false; }
    });

    if(exportBtn) {
        exportBtn.onclick = async () => {
            if (!allDealers.length) return alert("Пусто. Нечего экспортировать.");
            exportBtn.disabled = true; exportBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Загрузка...';
            const clean = (text) => `"${String(text || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`;
            
            const city = filterCity.value; const type = filterPriceType.value; const status = filterStatus.value; const responsible = filterResponsible.value; const search = searchBar.value.toLowerCase();
            const filteredForExport = allDealers.filter(d => {
                let statusMatch = false; const s = d.status || 'standard';
                if (status) statusMatch = s === status; else statusMatch = s !== 'potential';
                return (!city||d.city===city) && (!type||d.price_type===type) && (!responsible||d.responsible===responsible) && statusMatch && (!search || ((d.name||'').toLowerCase().includes(search)||(d.dealer_id||'').toLowerCase().includes(search)||(d.organization||'').toLowerCase().includes(search)));
            });

            let csv = "\uFEFFID;Название;Статус;Ответственный;Город;Адрес;Тип цен;Организация;Доставка;Сайт;Инстаграм;Контакты;Доп. Адреса;Бонусы\n";
            
            try {
                for (const dealer of filteredForExport) {
                    const contactsName = (dealer.contacts || []).map(c => {
                        let info = c.name || ''; if (c.position) info += ` (${c.position})`; if (c.contactInfo) info += ` - ${c.contactInfo}`; return info;
                    }).join('; ');
                    const addresses = (dealer.additional_addresses || []).map(a => `${a.description || ''}: ${a.city || ''}, ${a.address || ''}`).join('; ');
                    const row = [clean(dealer.dealer_id), clean(dealer.name), clean(dealer.status), clean(dealer.responsible), clean(dealer.city), clean(dealer.address), clean(dealer.price_type), clean(dealer.organization), clean(dealer.delivery), clean(dealer.website), clean(dealer.instagram), clean(contactsName), clean(addresses), clean(dealer.bonuses)];
                    csv += row.join(";") + "\r\n";
                }
                const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8;'})); a.download = 'dealers_export.csv'; a.click();
            } catch (e) { alert("Ошибка: " + e.message); } finally { exportBtn.disabled = false; exportBtn.innerHTML = '<i class="bi bi-file-earmark-excel me-2"></i>Экспорт'; }
        };
    }
    
    if(document.getElementById('export-competitors-prices-btn')) {
        document.getElementById('export-competitors-prices-btn').onclick = async () => {
            if (!allDealers.length) return alert("Пусто");
            const typeMap = { 'std': 'Стандарт', 'eng': 'Англ. Елка', 'fr': 'Фр. Елка', 'art': 'Художественный', 'art_eng': 'Худ. Английская', 'art_fr': 'Худ. Французская', 'mix': 'Худ. Микс' };
            let csv = "\uFEFFДилер;Город;Бренд;Коллекция;Тип;Цена ОПТ;Цена Розница\n";
            allDealers.forEach(d => {
                if(d.competitors) {
                    d.competitors.forEach(c => {
                        let typeLabel = 'Стандарт';
                        const refBrand = competitorsRef.find(r => r.name === c.brand);
                        if (refBrand && refBrand.collections) {
                            const refCol = refBrand.collections.find(col => (typeof col === 'string' ? col : col.name) === c.collection);
                            if (refCol) { const typeCode = (typeof refCol === 'string') ? 'std' : refCol.type; typeLabel = typeMap[typeCode] || 'Стандарт'; }
                        }
                        csv += `"${d.name}";"${d.city}";"${c.brand||''}";"${c.collection||''}";"${typeLabel}";"${c.price_opt||''}";"${c.price_retail||''}"\n`;
                    });
                }
            });
            const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8;'})); a.download = 'competitor_prices.csv'; a.click();
        };
    }
    
    if(filterCity) filterCity.onchange = renderDealerList; 
    if(filterPriceType) filterPriceType.onchange = renderDealerList; 
    if(filterStatus) filterStatus.onchange = renderDealerList;
    if(filterResponsible) filterResponsible.onchange = renderDealerList;
    if(searchBar) searchBar.oninput = renderDealerList;
    
    document.querySelectorAll('th[data-sort]').forEach(th => th.onclick = () => { if(currentSort.column===th.dataset.sort) currentSort.direction=(currentSort.direction==='asc'?'desc':'asc'); else {currentSort.column=th.dataset.sort;currentSort.direction='asc';} renderDealerList(); });
    
    initApp();
});
