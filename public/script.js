document.addEventListener('DOMContentLoaded', () => {
    
    const API_DEALERS_URL = '/api/dealers';
    const API_PRODUCTS_URL = '/api/products'; 
    const API_COMPETITORS_REF_URL = '/api/competitors-ref';

    let fullProductCatalog = [];
    let competitorsRef = []; 
    let allDealers = [];
    let currentSort = { column: 'name', direction: 'asc' };
    let isSaving = false; 
    
    const posMaterialsList = ["С600 - 600мм задняя стенка", "С800 - 800мм задняя стенка", "РФ-2 - Расческа из фанеры", "РФС-1 - Расческа из фанеры СТАРАЯ", "Н600 - 600мм наклейка", "Н800 - 800мм наклейка", "Табличка - Табличка орг.стекло"];

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
    const dealerListBody = document.getElementById('dealer-list-body');
    const dashboardContainer = document.getElementById('dashboard-container');
    const tasksListUpcoming = document.getElementById('tasks-list-upcoming');
    const searchBar = document.getElementById('search-bar');
    const filterCity = document.getElementById('filter-city');
    const filterStatus = document.getElementById('filter-status');
    const filterResponsible = document.getElementById('filter-responsible');
    const filterPriceType = document.getElementById('filter-price-type');
    const exportBtn = document.getElementById('export-dealers-btn');

    // --- LIST CONTAINERS (ADD) ---
    const addContactList = document.getElementById('add-contact-list');
    const addAddressList = document.getElementById('add-address-list');
    const addPosList = document.getElementById('add-pos-list');
    const addVisitsList = document.getElementById('add-visits-list');
    const addCompetitorList = document.getElementById('add-competitor-list');
    const addProductChecklist = document.getElementById('add-product-checklist');
    const addPhotoPreviewContainer = document.getElementById('add-photo-preview-container');

    // --- LIST CONTAINERS (EDIT) ---
    const editContactList = document.getElementById('edit-contact-list');
    const editAddressList = document.getElementById('edit-address-list');
    const editPosList = document.getElementById('edit-pos-list');
    const editVisitsList = document.getElementById('edit-visits-list');
    const editCompetitorList = document.getElementById('edit-competitor-list');
    const editProductChecklist = document.getElementById('edit-product-checklist');
    const editPhotoPreviewContainer = document.getElementById('edit-photo-preview-container');

    // Inputs
    const addAvatarInput = document.getElementById('add-avatar-input');
    const addPhotoInput = document.getElementById('add-photo-input');
    const editAvatarInput = document.getElementById('edit-avatar-input');
    const editPhotoInput = document.getElementById('edit-photo-input');

    let addPhotosData = []; let editPhotosData = []; let newAvatarBase64 = null; 

    // UTILS
    const getVal = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };
    const safeText = (text) => (text || '').toString().replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const compressImage = (file, w, q) => new Promise((resolve) => { const reader = new FileReader(); reader.readAsDataURL(file); reader.onload = e => { const img = new Image(); img.src = e.target.result; img.onload = () => { const c = document.createElement('canvas'); let width = img.width; let height = img.height; if (width > w) { height *= w / width; width = w; } c.width = width; c.height = height; c.getContext('2d').drawImage(img, 0, 0, width, height); resolve(c.toDataURL('image/jpeg', q)); }; }; });

    // --- MAPS ---
    const DEFAULT_LAT = 51.1605; const DEFAULT_LNG = 71.4704;
    let addMap, editMap;

    function initMap(id) { const el = document.getElementById(id); if(!el) return null; if(typeof L === 'undefined') return null; const m = L.map(id).setView([DEFAULT_LAT, DEFAULT_LNG], 13); L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: 'OSM' }).addTo(m); return m; }
    function setupMapClick(map, latId, lngId, markerRef) { 
        if(!map) return; 
        map.on('click', e => { 
            const { lat, lng } = e.latlng; 
            document.getElementById(latId).value = lat; document.getElementById(lngId).value = lng;
            if(markerRef.current) markerRef.current.setLatLng([lat, lng]); else markerRef.current = L.marker([lat, lng]).addTo(map); 
        }); 
    }
    function setupMapSearch(map, inputId, suggestionsId, latId, lngId, markerRef) {
        const input = document.getElementById(inputId); const box = document.getElementById(suggestionsId);
        if(!input || !box) return;
        let timer;
        input.addEventListener('input', () => {
            clearTimeout(timer);
            const q = input.value.trim();
            if(q.length < 3) { box.style.display = 'none'; return; }
            timer = setTimeout(async () => {
                try {
                    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&countrycodes=kz`);
                    const data = await res.json();
                    box.innerHTML = '';
                    if(data.length) {
                        box.style.display = 'block';
                        data.slice(0,5).forEach(p => {
                            const div = document.createElement('div'); div.className = 'address-suggestion-item'; div.textContent = p.display_name;
                            div.onclick = () => {
                                const lat = parseFloat(p.lat); const lon = parseFloat(p.lon);
                                if(markerRef.current) markerRef.current.setLatLng([lat, lon]); else markerRef.current = L.marker([lat, lon]).addTo(map);
                                map.setView([lat, lon], 16);
                                document.getElementById(latId).value = lat; document.getElementById(lngId).value = lon;
                                input.value = p.display_name; box.style.display = 'none';
                            };
                            box.appendChild(div);
                        });
                    } else box.style.display = 'none';
                } catch(e){}
            }, 500);
        });
        document.addEventListener('click', e => { if(!e.target.closest('.map-search-container')) box.style.display = 'none'; });
    }

    // INIT MAPS ON SHOW
    addModalEl.addEventListener('shown.bs.modal', () => {
        if(!addMap) { addMap = initMap('add-map'); addModalEl.markerRef = {current:null}; setupMapClick(addMap, 'add_latitude', 'add_longitude', addModalEl.markerRef); setupMapSearch(addMap, 'add-map-search', 'add-map-suggestions', 'add_latitude', 'add_longitude', addModalEl.markerRef); }
        else addMap.invalidateSize();
    });
    editModalEl.addEventListener('shown.bs.modal', () => {
        // Fix map inside tabs
        const tabBtn = document.querySelector('button[data-bs-target="#tab-map"]');
        if(tabBtn) tabBtn.addEventListener('shown.bs.tab', () => {
            if(!editMap) { editMap = initMap('edit-map'); editModalEl.markerRef = {current:null}; setupMapClick(editMap, 'edit_latitude', 'edit_longitude', editModalEl.markerRef); setupMapSearch(editMap, 'edit-map-search', 'edit-map-suggestions', 'edit_latitude', 'edit_longitude', editModalEl.markerRef); }
            if(editMap) { 
                editMap.invalidateSize(); 
                const lat = parseFloat(document.getElementById('edit_latitude').value);
                const lng = parseFloat(document.getElementById('edit_longitude').value);
                if(!isNaN(lat)) { editMap.setView([lat, lng], 15); if(editModalEl.markerRef.current) editModalEl.markerRef.current.setLatLng([lat, lng]); else editModalEl.markerRef.current = L.marker([lat, lng]).addTo(editMap); }
            }
        });
    });

    // --- DATA ---
    async function initApp() {
        await fetchProductCatalog();
        try { const res = await fetch(API_COMPETITORS_REF_URL); if(res.ok) { competitorsRef = await res.json(); updateBrandsDatalist(); } } catch(e){}
        try { const res = await fetch(API_DEALERS_URL); if(res.ok) { allDealers = await res.json(); populateFilters(allDealers); renderDealerList(); renderDashboard(); } } catch(e){}
        const pendingId = localStorage.getItem('pendingEditDealerId');
        if(pendingId) { localStorage.removeItem('pendingEditDealerId'); openEditModal(pendingId); }
    }

    async function fetchProductCatalog() {
        if(fullProductCatalog.length > 0) return;
        try { const res = await fetch(API_PRODUCTS_URL); if(res.ok) { fullProductCatalog = await res.json(); fullProductCatalog.sort((a, b) => a.sku.localeCompare(b.sku, 'ru', {numeric:true})); } } catch(e){}
    }

    function updateBrandsDatalist() {
        if(!brandsDatalist) return;
        brandsDatalist.innerHTML = competitorsRef.map(r => `<option value="${r.name}">`).join('');
    }

    // --- RENDER ---
    function renderDashboard() {
        if(!dashboardContainer) return;
        const total = allDealers.length;
        const noPhoto = allDealers.filter(d => !d.photo_url).length;
        dashboardContainer.innerHTML = `<div class="col-md-6"><div class="stat-card h-100"><i class="bi bi-shop stat-icon text-primary"></i><span class="stat-number">${total}</span><span class="stat-label">Всего</span></div></div><div class="col-md-6"><div class="stat-card h-100 border-danger"><i class="bi bi-camera-fill stat-icon text-danger"></i><span class="stat-number text-danger">${noPhoto}</span><span class="stat-label">Без фото</span></div></div>`;
        
        // Tasks logic
        const today = new Date(); today.setHours(0,0,0,0);
        const tasksUpcoming = [], tasksProblem = [], tasksCooling = [];
        const thirtyDaysAgo = new Date(today.getTime() - (30 * 24 * 60 * 60 * 1000));

        allDealers.forEach(d => {
            if(d.status === 'archive') return;
            let lastVisit = null;
            let hasFuture = false;
            if(d.visits) d.visits.forEach((v, idx) => {
                const dDate = new Date(v.date); dDate.setHours(0,0,0,0);
                if(v.isCompleted && (!lastVisit || dDate > lastVisit)) lastVisit = dDate;
                if(!v.isCompleted) {
                    const t = { dealerName: d.name, dealerId: d.id, date: dDate, comment: v.comment, visitIndex: idx };
                    if(dDate < today) tasksProblem.push({...t, type: 'overdue'});
                    else { tasksUpcoming.push({...t, isToday: dDate.getTime() === today.getTime()}); hasFuture = true; }
                }
            });
            if(d.status === 'problem' && !tasksProblem.some(x=>x.dealerId===d.id)) tasksProblem.push({ dealerName: d.name, dealerId: d.id, type: 'status' });
            if(!hasFuture && d.status !== 'problem' && d.status !== 'potential') {
                if(!lastVisit) tasksCooling.push({ dealerName: d.name, dealerId: d.id, days: 999 });
                else if(lastVisit < thirtyDaysAgo) tasksCooling.push({ dealerName: d.name, dealerId: d.id, days: Math.floor((today - lastVisit)/(1000*60*60*24)) });
            }
        });
        
        renderTaskList(document.getElementById('tasks-list-upcoming'), tasksUpcoming.sort((a,b)=>a.date-b.date), 'upcoming');
        renderTaskList(document.getElementById('tasks-list-problem'), tasksProblem, 'problem');
        renderTaskList(document.getElementById('tasks-list-cooling'), tasksCooling.sort((a,b)=>b.days-a.days), 'cooling');
    }

    function renderTaskList(container, tasks, type) {
        if(!container) return;
        if(!tasks.length) { container.innerHTML = '<p class="text-muted text-center p-2">Нет задач</p>'; return; }
        container.innerHTML = tasks.map(t => {
            let badge = '';
            if(type === 'upcoming') badge = `<span class="badge ${t.isToday?'bg-danger':'bg-primary'} rounded-pill me-2">${t.isToday?'Сегодня':t.date.toLocaleDateString()}</span>`;
            if(type === 'problem') badge = t.type==='overdue' ? `<span class="badge bg-danger me-2">Просрочено</span>` : `<span class="badge bg-danger me-2">Проблема</span>`;
            if(type === 'cooling') badge = `<span class="badge bg-warning text-dark me-2">${t.days} дн.</span>`;
            return `<div class="list-group-item d-flex justify-content-between align-items-center"><div>${badge}<a href="dealer.html?id=${t.dealerId}" target="_blank" class="fw-bold text-dark text-decoration-none">${t.dealerName}</a></div>${(type === 'upcoming' || (type==='problem' && t.type==='overdue')) ? `<button class="btn btn-sm btn-success btn-complete-task" data-id="${t.dealerId}" data-index="${t.visitIndex}">✔</button>` : ''}</div>`;
        }).join('');
    }

    if(document.body) {
        document.body.addEventListener('click', e => {
            const btn = e.target.closest('.btn-complete-task');
            if(btn) completeTask(btn, btn.dataset.id, btn.dataset.index);
        });
    }

    // --- GENERATORS ---
    function createCompetitorEntryHTML(c={}) {
        let collOpts = '<option value="">-- Коллекция --</option>';
        if(c.brand) {
            const ref = competitorsRef.find(r => r.name === c.brand);
            if(ref && ref.collections) {
                 // Sort collections: special types first
                 const sorted = [...ref.collections].sort((a,b) => {
                    const tA = (typeof a === 'object') ? a.type : 'std'; const tB = (typeof b === 'object') ? b.type : 'std';
                    if(tA === 'std' && tB !== 'std') return 1; if(tA !== 'std' && tB === 'std') return -1; return 0;
                 });
                 sorted.forEach(col => {
                    const name = typeof col === 'string' ? col : col.name;
                    const type = typeof col === 'object' ? col.type : 'std';
                    let icon = ''; if(type.includes('eng')) icon = '🌲 '; else if(type.includes('french')) icon = '🌊 '; else if(type.includes('art')) icon = '🎨 ';
                    collOpts += `<option value="${name}" ${name === c.collection ? 'selected' : ''}>${icon}${name}</option>`;
                 });
            } else if(c.collection) collOpts += `<option value="${c.collection}" selected>${c.collection}</option>`;
        }
        return `<div class="competitor-entry"><input class="form-control competitor-brand" list="brands-datalist" placeholder="Бренд (поиск)" value="${c.brand||''}" oninput="updateCollections(this)"><select class="form-select competitor-collection">${collOpts}</select><input type="text" class="form-control competitor-price-opt" placeholder="ОПТ" value="${c.price_opt||''}"><input type="text" class="form-control competitor-price-retail" placeholder="Розница" value="${c.price_retail||''}"><button type="button" class="btn btn-outline-danger btn-remove-entry">×</button></div>`;
    }

    window.updateCollections = function(input) {
        const brandName = input.value;
        const row = input.closest('.competitor-entry');
        const select = row.querySelector('.competitor-collection');
        let html = '<option value="">-- Коллекция --</option>';
        const ref = competitorsRef.find(r => r.name === brandName);
        if(ref && ref.collections) {
             const sorted = [...ref.collections].sort((a,b) => {
                const tA = (typeof a === 'object') ? a.type : 'std'; const tB = (typeof b === 'object') ? b.type : 'std';
                if(tA === 'std' && tB !== 'std') return 1; if(tA !== 'std' && tB === 'std') return -1; return 0;
             });
             html += sorted.map(col => {
                const name = typeof col === 'string' ? col : col.name;
                const type = typeof col === 'object' ? col.type : 'std';
                let icon = ''; if(type.includes('eng')) icon = '🌲 '; else if(type.includes('french')) icon = '🌊 '; else if(type.includes('art')) icon = '🎨 ';
                return `<option value="${name}">${icon}${name}</option>`;
             }).join('');
        }
        select.innerHTML = html;
    };

    // Standard generators
    function createContactEntryHTML(c={}) { return `<div class="contact-entry input-group mb-2"><input type="text" class="form-control contact-name" placeholder="Имя" value="${c.name||''}"><input type="text" class="form-control contact-position" placeholder="Должность" value="${c.position||''}"><input type="text" class="form-control contact-info" placeholder="Телефон" value="${c.contactInfo||''}"><button type="button" class="btn btn-outline-danger btn-remove-entry">×</button></div>`; }
    function createAddressEntryHTML(a={}) { return `<div class="address-entry input-group mb-2"><input type="text" class="form-control address-description" placeholder="Описание" value="${a.description||''}"><input type="text" class="form-control address-city" placeholder="Город" value="${a.city||''}"><input type="text" class="form-control address-address" placeholder="Адрес" value="${a.address||''}"><button type="button" class="btn btn-outline-danger btn-remove-entry">×</button></div>`; }
    function createPosEntryHTML(p={}) { const opts = posMaterialsList.map(n => `<option value="${n}" ${n===p.name?'selected':''}>${n}</option>`).join(''); return `<div class="pos-entry input-group mb-2"><select class="form-select pos-name"><option value="">-- Выбор --</option>${opts}</select><input type="number" class="form-control pos-quantity" value="${p.quantity||1}"><button type="button" class="btn btn-outline-danger btn-remove-entry">×</button></div>`; }
    function createVisitEntryHTML(v={}) { return `<div class="visit-entry input-group mb-2"><input type="date" class="form-control visit-date" value="${v.date||''}"><input type="text" class="form-control visit-comment w-50" placeholder="Комментарий..." value="${v.comment||''}"><button type="button" class="btn btn-outline-danger btn-remove-entry">×</button></div>`; }
    function renderPhotoPreviews(c, arr) { if(c) c.innerHTML = arr.map((p,i) => `<div class="photo-preview-item"><img src="${p.photo_url}"><button type="button" class="btn-remove-photo" data-index="${i}">×</button></div>`).join(''); }
    
    // --- LISTENERS ---
    // ADD Buttons
    ['add-contact-btn-add-modal', 'add-address-btn-add-modal', 'add-pos-btn-add-modal', 'add-visits-btn-add-modal', 'add-competitor-btn-add-modal'].forEach(id => {
        const btn = document.getElementById(id);
        if(btn) btn.onclick = () => {
            const type = id.split('-')[1];
            if(type === 'contact') addContactList.insertAdjacentHTML('beforeend', createContactEntryHTML());
            if(type === 'address') addAddressList.insertAdjacentHTML('beforeend', createAddressEntryHTML());
            if(type === 'pos') addPosList.insertAdjacentHTML('beforeend', createPosEntryHTML());
            if(type === 'visits') addVisitsList.insertAdjacentHTML('beforeend', createVisitEntryHTML());
            if(type === 'competitor') addCompetitorList.insertAdjacentHTML('beforeend', createCompetitorEntryHTML());
        };
    });
    // EDIT Buttons
    ['add-contact-btn-edit-modal', 'add-address-btn-edit-modal', 'add-pos-btn-edit-modal', 'add-visits-btn-edit-modal', 'add-competitor-btn-edit-modal'].forEach(id => {
        const btn = document.getElementById(id);
        if(btn) btn.onclick = () => {
            const type = id.split('-')[1];
            if(type === 'contact') editContactList.insertAdjacentHTML('beforeend', createContactEntryHTML());
            if(type === 'address') editAddressList.insertAdjacentHTML('beforeend', createAddressEntryHTML());
            if(type === 'pos') editPosList.insertAdjacentHTML('beforeend', createPosEntryHTML());
            if(type === 'visits') editVisitsList.insertAdjacentHTML('beforeend', createVisitEntryHTML());
            if(type === 'competitor') editCompetitorList.insertAdjacentHTML('beforeend', createCompetitorEntryHTML());
        };
    });
    
    // Remove handlers
    document.addEventListener('click', e => { if(e.target.closest('.btn-remove-entry')) e.target.closest('.contact-entry, .address-entry, .pos-entry, .visit-entry, .competitor-entry').remove(); });

    // --- PHOTOS & AVATAR ---
    if(addAvatarInput) addAvatarInput.onchange = async e => { if(e.target.files[0]) { newAvatarBase64 = await compressImage(e.target.files[0], 800, 0.8); document.getElementById('add-avatar-preview').src = newAvatarBase64; } };
    if(editAvatarInput) editAvatarInput.onchange = async e => { if(e.target.files[0]) { newAvatarBase64 = await compressImage(e.target.files[0], 800, 0.8); document.getElementById('edit-avatar-preview').src = newAvatarBase64; } };
    if(addPhotoInput) addPhotoInput.onchange = async e => { for(let f of e.target.files) addPhotosData.push({ photo_url: await compressImage(f, 1000, 0.7) }); renderPhotoPreviews(addPhotoPreviewContainer, addPhotosData); };
    if(editPhotoInput) editPhotoInput.onchange = async e => { for(let f of e.target.files) editPhotosData.push({ photo_url: await compressImage(f, 1000, 0.7) }); renderPhotoPreviews(editPhotoPreviewContainer, editPhotosData); };
    
    // --- WIZARD ---
    if(openAddModalBtn) openAddModalBtn.onclick = () => {
        addForm.reset();
        currentStep = 1; showStep(1);
        renderList(addContactList, [], createContactEntryHTML); renderList(addAddressList, [], createAddressEntryHTML); renderList(addPosList, [], createPosEntryHTML); renderList(addVisitsList, [], createVisitEntryHTML); renderList(addCompetitorList, [], createCompetitorEntryHTML);
        if(addProductChecklist) addProductChecklist.innerHTML = fullProductCatalog.map(p => `<div class="checklist-item form-check"><input type="checkbox" class="form-check-input" value="${p.id}"><label class="form-check-label">${p.sku} - ${p.name}</label></div>`).join('');
        addPhotosData = []; renderPhotoPreviews(addPhotoPreviewContainer, []);
        addModal.show();
    };

    let currentStep = 1;
    function showStep(s) {
        document.querySelectorAll('.wizard-step').forEach(x => x.classList.remove('active'));
        document.querySelectorAll('.step-indicator').forEach((x, i) => { x.classList.remove('active'); if(i+1 < s) x.classList.add('completed'); else x.classList.remove('completed'); if(i+1 === s) x.classList.add('active'); });
        document.getElementById(`step-${s}`).classList.add('active');
        const prev = document.getElementById('btn-prev-step'); const next = document.getElementById('btn-next-step'); const finish = document.getElementById('btn-finish-step');
        if(prev) prev.style.display = s===1?'none':'inline-block';
        if(next) next.style.display = s===4?'none':'inline-block';
        if(finish) finish.style.display = s===4?'inline-block':'none';
    }
    const nextBtn = document.getElementById('btn-next-step');
    const prevBtn = document.getElementById('btn-prev-step');
    if(nextBtn) nextBtn.onclick = () => { if(currentStep===1) { if(!document.getElementById('dealer_id').value || !document.getElementById('name').value) return alert('Заполните ID и Имя'); if(addMap) setTimeout(()=>addMap.invalidateSize(), 200); } if(currentStep < 4) { currentStep++; showStep(currentStep); } };
    if(prevBtn) prevBtn.onclick = () => { if(currentStep > 1) { currentStep--; showStep(currentStep); } };

    // --- SAVE ADD ---
    if(addForm) addForm.onsubmit = async e => {
        e.preventDefault();
        if(isSaving) return; isSaving = true;
        const btn = document.getElementById('btn-finish-step'); const old = btn.innerHTML; btn.disabled = true; btn.innerHTML = '...';
        
        const data = collectFormData(addForm, 'add');
        data.photos = addPhotosData;
        if(newAvatarBase64) data.avatarUrl = newAvatarBase64;

        try {
            const res = await fetch(API_DEALERS_URL, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data) });
            if(!res.ok) throw new Error();
            const d = await res.json();
            const pIds = Array.from(addProductChecklist.querySelectorAll('input:checked')).map(cb => cb.value);
            if(pIds.length) await saveProducts(d.id, pIds);
            addModal.hide(); initApp();
        } catch(e) { alert('Ошибка'); } finally { isSaving = false; btn.disabled = false; btn.innerHTML = old; }
    };

    // --- OPEN EDIT ---
    async function openEditModal(id) {
        try {
            const res = await fetch(`${API_DEALERS_URL}/${id}`);
            if(!res.ok) throw new Error();
            const d = await res.json();
            
            document.getElementById('edit_db_id').value = d.id;
            document.getElementById('edit_dealer_id').value = d.dealer_id;
            document.getElementById('edit_name').value = d.name;
            document.getElementById('edit_organization').value = d.organization || '';
            document.getElementById('edit_price_type').value = d.price_type || '';
            document.getElementById('edit_city').value = d.city || '';
            document.getElementById('edit_address').value = d.address || '';
            document.getElementById('edit_delivery').value = d.delivery || '';
            document.getElementById('edit_website').value = d.website || '';
            document.getElementById('edit_instagram').value = d.instagram || '';
            document.getElementById('edit_latitude').value = d.latitude || '';
            document.getElementById('edit_longitude').value = d.longitude || '';
            document.getElementById('edit_bonuses').value = d.bonuses || '';
            document.getElementById('edit_status').value = d.status || 'standard';
            document.getElementById('edit_responsible').value = d.responsible || '';
            document.getElementById('edit-current-avatar-url').value = d.avatarUrl || '';
            document.getElementById('edit-avatar-preview').src = d.avatarUrl || '';
            newAvatarBase64 = null;

            renderList(editContactList, d.contacts, createContactEntryHTML);
            renderList(editAddressList, d.additional_addresses, createAddressEntryHTML);
            renderList(editPosList, d.pos_materials, createPosEntryHTML);
            renderList(editVisitsList, d.visits, createVisitEntryHTML);
            renderList(editCompetitorList, d.competitors, createCompetitorEntryHTML);
            editPhotosData = d.photos || []; renderPhotoPreviews(document.getElementById('edit-photo-preview-container'), editPhotosData);

            const pIds = new Set((d.products||[]).map(p=>p.id));
            editProductChecklist.innerHTML = fullProductCatalog.map(p => `<div class="checklist-item form-check"><input type="checkbox" class="form-check-input" value="${p.id}" ${pIds.has(p.id)?'checked':''}><label class="form-check-label">${p.sku} - ${p.name}</label></div>`).join('');

            editModal.show();
        } catch(e) { alert('Ошибка загрузки'); }
    }

    // --- SAVE EDIT ---
    if(editForm) editForm.onsubmit = async e => {
        e.preventDefault();
        if(isSaving) return; isSaving = true;
        const btn = editForm.querySelector('button[type="submit"]'); const old = btn.innerHTML; btn.disabled = true; btn.innerHTML = '...';

        const data = collectFormData(editForm, 'edit');
        data.photos = editPhotosData;
        if(newAvatarBase64) data.avatarUrl = newAvatarBase64;
        else data.avatarUrl = document.getElementById('edit-current-avatar-url').value;

        try {
            await fetch(`${API_DEALERS_URL}/${document.getElementById('edit_db_id').value}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data) });
            const pIds = Array.from(editProductChecklist.querySelectorAll('input:checked')).map(cb => cb.value);
            await saveProducts(document.getElementById('edit_db_id').value, pIds);
            editModal.hide(); initApp();
        } catch(e) { alert('Ошибка'); } finally { isSaving = false; btn.disabled = false; btn.innerHTML = old; }
    };

    // Helper to collect form data
    function collectFormData(form, prefix) {
        const list = prefix === 'add' ? 
            [addContactList, addAddressList, addPosList, addVisitsList, addCompetitorList] : 
            [editContactList, editAddressList, editPosList, editVisitsList, editCompetitorList];
            
        return {
            dealer_id: document.getElementById(`${prefix}_dealer_id`).value,
            name: document.getElementById(`${prefix}_name`).value,
            organization: document.getElementById(`${prefix}_organization`)?.value,
            price_type: document.getElementById(`${prefix}_price_type`)?.value,
            city: document.getElementById(`${prefix}_city`)?.value,
            address: document.getElementById(`${prefix}_address`)?.value,
            delivery: document.getElementById(`${prefix}_delivery`)?.value,
            website: document.getElementById(`${prefix}_website`)?.value,
            instagram: document.getElementById(`${prefix}_instagram`)?.value,
            latitude: document.getElementById(`${prefix}_latitude`)?.value,
            longitude: document.getElementById(`${prefix}_longitude`)?.value,
            bonuses: document.getElementById(`${prefix === 'add' ? 'bonuses' : 'edit_bonuses'}`)?.value,
            status: document.getElementById(`${prefix}_status`)?.value,
            responsible: document.getElementById(`${prefix}_responsible`)?.value,
            contacts: collectData(list[0], '.contact-entry', [{key:'name',class:'.contact-name'},{key:'position',class:'.contact-position'},{key:'contactInfo',class:'.contact-info'}]),
            additional_addresses: collectData(list[1], '.address-entry', [{key:'description',class:'.address-description'},{key:'city',class:'.address-city'},{key:'address',class:'.address-address'}]),
            pos_materials: collectData(list[2], '.pos-entry', [{key:'name',class:'.pos-name'},{key:'quantity',class:'.pos-quantity'}]),
            visits: collectData(list[3], '.visit-entry', [{key:'date',class:'.visit-date'},{key:'comment',class:'.visit-comment'}]),
            competitors: collectData(list[4], '.competitor-entry', [{key:'brand',class:'.competitor-brand'},{key:'collection',class:'.competitor-collection'},{key:'price_opt',class:'.competitor-price-opt'},{key:'price_retail',class:'.competitor-price-retail'}])
        };
    }

    // --- TABLE ACTIONS ---
    if(dealerListBody) dealerListBody.addEventListener('click', e => {
        const t = e.target;
        if(t.closest('.dropdown-item')) e.preventDefault();
        
        if(t.closest('.btn-view')) window.open(`dealer.html?id=${t.closest('.btn-view').dataset.id}`, '_blank');
        if(t.closest('.btn-edit')) openEditModal(t.closest('.btn-edit').dataset.id);
        if(t.closest('.btn-duplicate')) duplicateDealer(t.closest('.btn-duplicate').dataset.id);
        if(t.closest('.btn-delete') && confirm('Удалить?')) fetch(`${API_DEALERS_URL}/${t.closest('.btn-delete').dataset.id}`, {method:'DELETE'}).then(initApp);
        if(t.closest('.btn-quick-visit')) {
             document.getElementById('qv_dealer_id').value = t.closest('.btn-quick-visit').dataset.id;
             document.getElementById('qv_comment').value = '';
             qvModal.show();
        }
    });

    // Quick Visit Save
    if(qvForm) qvForm.onsubmit = async e => {
        e.preventDefault();
        const id = document.getElementById('qv_dealer_id').value;
        const comment = document.getElementById('qv_comment').value;
        if(!id || !comment) return;
        try {
            const res = await fetch(`${API_DEALERS_URL}/${id}`);
            const d = await res.json();
            const visits = [...(d.visits||[]), { date: new Date().toISOString().slice(0,10), comment, isCompleted: true }];
            await fetch(`${API_DEALERS_URL}/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({visits})});
            qvModal.hide(); alert('Визит добавлен');
        } catch(e){}
    };

    // Duplicate
    async function duplicateDealer(id) {
        try {
            const res = await fetch(`${API_DEALERS_URL}/${id}`);
            const d = await res.json();
            addForm.reset();
            document.getElementById('dealer_id').value = '';
            document.getElementById('name').value = d.name + ' (Копия)';
            document.getElementById('city').value = d.city;
            // ... populate basic fields ...
            currentStep = 1; showStep(1); addModal.show(); alert('Введите новый ID');
        } catch(e){}
    }

    // Utils
    function renderList(container, data, htmlGen) { if(container) container.innerHTML = (data||[]).map(htmlGen).join(''); }

    // Filters
    if(filterCity) filterCity.onchange = renderDealerList; 
    if(filterStatus) filterStatus.onchange = renderDealerList;
    if(filterResponsible) filterResponsible.onchange = renderDealerList;
    if(searchBar) searchBar.oninput = renderDealerList;
    if(exportBtn) exportBtn.onclick = async () => { /* ... export logic ... */ };

    initApp();
});
