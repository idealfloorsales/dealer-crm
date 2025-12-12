document.addEventListener('DOMContentLoaded', () => {
    console.log("CRM Loaded: main.js v1.1 (Fixed Vars)");

    // ==========================================
    // 1. HELPERS (Определяем первыми)
    // ==========================================
    const getEl = (id) => document.getElementById(id);
    const getVal = (id) => { const el = getEl(id); return el ? el.value : ''; };
    const safeText = (t) => (t || '').toString().replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const safeAttr = (t) => (t || '').toString().replace(/"/g, '&quot;');

    window.showToast = (message, type = 'success') => {
        let container = getEl('toast-container-custom');
        if (!container) { 
            container = document.createElement('div'); container.id = 'toast-container-custom'; container.className = 'toast-container-custom'; document.body.appendChild(container); 
        }
        const toast = document.createElement('div'); toast.className = `toast-modern toast-${type}`;
        const icon = type === 'success' ? 'check-circle-fill' : (type === 'error' ? 'exclamation-triangle-fill' : 'info-circle-fill');
        toast.innerHTML = `<i class="bi bi-${icon} fs-5"></i><span class="fw-bold text-dark">${message}</span>`;
        container.appendChild(toast);
        setTimeout(() => { toast.style.animation = 'toastFadeOut 0.5s forwards'; setTimeout(() => toast.remove(), 500); }, 3000);
    };

    const compressImage = (file) => new Promise((resolve) => { 
        const reader = new FileReader(); reader.readAsDataURL(file); 
        reader.onload = e => { const img = new Image(); img.src = e.target.result; img.onload = () => { const cvs = document.createElement('canvas'); let w = img.width, h = img.height; if(w>1000){h*=1000/w;w=1000;} cvs.width=w; cvs.height=h; cvs.getContext('2d').drawImage(img,0,0,w,h); resolve(cvs.toDataURL('image/jpeg', 0.7)); }; }; 
    });

    // ==========================================
    // 2. DOM ELEMENTS (Вот чего не хватало!)
    // ==========================================
    const openAddModalBtn = getEl('open-add-modal-btn'); // <--- ВОТ ОНА
    const dealerGrid = getEl('dealer-grid'); 
    const dashboardStats = getEl('dashboard-stats');
    
    // Modals
    const addModalEl = getEl('add-modal'); const addModal = addModalEl ? new bootstrap.Modal(addModalEl, {backdrop:'static'}) : null;
    const addForm = getEl('add-dealer-form');
    const editModalEl = getEl('edit-modal'); const editModal = editModalEl ? new bootstrap.Modal(editModalEl, {backdrop:'static'}) : null;
    const editForm = getEl('edit-dealer-form');
    const qvModalEl = getEl('quick-visit-modal'); const qvModal = qvModalEl ? new bootstrap.Modal(qvModalEl) : null;
    const qvForm = getEl('quick-visit-form');
    const statusModalEl = getEl('status-manager-modal'); const statusModal = statusModalEl ? new bootstrap.Modal(statusModalEl) : null;
    const statusForm = getEl('status-form');
    const btnManageStatuses = getEl('btn-manage-statuses');

    // Filters
    const filterCity = getEl('filter-city');
    const filterPriceType = getEl('filter-price-type');
    const filterStatus = getEl('filter-status');
    const filterResponsible = getEl('filter-responsible');
    const searchBar = getEl('search-bar');

    // Wizard
    const nextBtn = getEl('btn-next-step');
    const prevBtn = getEl('btn-prev-step');
    const finishBtn = getEl('btn-finish-step');

    // ==========================================
    // 3. STATE & CONFIG
    // ==========================================
    const API = { dealers: '/api/dealers', products: '/api/products', competitors: '/api/competitors-ref', statuses: '/api/statuses' };
    
    let state = {
        allDealers: [],
        statusList: [],
        competitorsRef: [],
        fullProductCatalog: [],
        currentUserRole: 'guest',
        currentSort: { column: 'name', direction: 'asc' },
        currentStep: 1,
        addPhotosData: [],
        editPhotosData: [],
        newAvatarBase64: null,
        isSaving: false
    };

    const posMaterialsList = ["С600 - 600мм задняя стенка", "С800 - 800мм задняя стенка", "РФ-2 - Расческа из фанеры", "РФС-1 - Расческа из фанеры СТАРАЯ", "Н600 - 600мм наклейка", "Н800 - 800мм наклейка", "Табличка - Табличка орг.стекло"];

    // ==========================================
    // 4. MAP LOGIC
    // ==========================================
    const maps = { add: null, edit: null };
    const markers = { add: null, edit: null };

    function initMapLogic(key, mapId, latId, lngId, searchId, btnSearchId, btnLocId) {
        const mapEl = getEl(mapId); if(!mapEl) return () => {};
        
        // Force reset
        if(maps[key]) { maps[key].remove(); maps[key] = null; markers[key] = null; }

        const map = L.map(mapId).setView([51.1605, 71.4704], 12);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: 'OSM' }).addTo(map);
        maps[key] = map;

        const setPoint = (lat, lng) => {
            if(markers[key]) map.removeLayer(markers[key]);
            markers[key] = L.marker([lat, lng], {draggable:true}).addTo(map);
            getEl(latId).value = lat.toFixed(6); getEl(lngId).value = lng.toFixed(6);
            markers[key].on('dragend', e => { const p = e.target.getLatLng(); getEl(latId).value = p.lat.toFixed(6); getEl(lngId).value = p.lng.toFixed(6); });
            map.setView([lat, lng], 16);
        };

        map.on('click', e => setPoint(e.latlng.lat, e.latlng.lng));

        const doSearch = async () => {
            const q = getEl(searchId).value.trim(); if(!q) return;
            const coords = q.match(/^(-?\d+(\.\d+)?)[,\s]+(-?\d+(\.\d+)?)$/);
            if(coords) { setPoint(parseFloat(coords[1]), parseFloat(coords[3])); window.showToast("Координаты!"); }
            else {
                try {
                    const btn = getEl(btnSearchId); const old = btn.innerHTML; btn.innerHTML = '...';
                    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&countrycodes=kz&limit=1`);
                    const d = await r.json();
                    if(d[0]) setPoint(parseFloat(d[0].lat), parseFloat(d[0].lon)); else window.showToast("Не найдено", "error");
                    btn.innerHTML = old;
                } catch(e) {}
            }
        };

        const btnS = getEl(btnSearchId); if(btnS) btnS.onclick = doSearch;
        const btnL = getEl(btnLocId); if(btnL) btnL.onclick = () => { if(navigator.geolocation) navigator.geolocation.getCurrentPosition(p => setPoint(p.coords.latitude, p.coords.longitude)); };

        return () => { 
            setTimeout(() => { 
                map.invalidateSize(); 
                const lat = parseFloat(getVal(latId)), lng = parseFloat(getVal(lngId));
                if(!isNaN(lat) && !isNaN(lng)) { 
                    setPoint(lat, lng); 
                }
            }, 300); 
        };
    }

    const refreshAddMap = initMapLogic('add', 'add-map', 'add_latitude', 'add_longitude', 'add-smart-search', 'btn-search-add', 'btn-loc-add');
    const refreshEditMap = initMapLogic('edit', 'edit-map', 'edit_latitude', 'edit_longitude', 'edit-smart-search', 'btn-search-edit', 'btn-loc-edit');

    // ==========================================
    // 5. LIST GENERATORS & HELPERS
    // ==========================================
    const generators = {
        contact: (c={}) => `<div class="contact-entry"><input type="text" class="form-control contact-name" placeholder="Имя" value="${c.name||''}"><input type="text" class="form-control contact-position" placeholder="Должность" value="${c.position||''}"><input type="text" class="form-control contact-info" placeholder="Телефон" value="${c.contactInfo||''}"><button type="button" class="btn-remove-entry" onclick="this.closest('.contact-entry').remove()"><i class="bi bi-x-lg"></i></button></div>`,
        address: (a={}) => `<div class="address-entry"><input type="text" class="form-control address-description" placeholder="Описание" value="${a.description||''}"><input type="text" class="form-control address-city" placeholder="Город" value="${a.city||''}"><input type="text" class="form-control address-address" placeholder="Адрес" value="${a.address||''}"><button type="button" class="btn-remove-entry" onclick="this.closest('.address-entry').remove()"><i class="bi bi-x-lg"></i></button></div>`,
        visit: (v={}) => `<div class="visit-entry"><input type="date" class="form-control visit-date" value="${v.date||''}"><input type="text" class="form-control visit-comment w-50" placeholder="Результат..." value="${v.comment||''}"><button type="button" class="btn-remove-entry" onclick="this.closest('.visit-entry').remove()"><i class="bi bi-x-lg"></i></button></div>`,
        pos: (p={}) => `<div class="pos-entry"><input type="text" class="form-control pos-name" list="pos-materials-datalist" placeholder="Название стенда" value="${safeAttr(p.name||'')}" autocomplete="off"><input type="number" class="form-control pos-quantity" value="${p.quantity||1}" min="1" placeholder="Шт"><button type="button" class="btn-remove-entry" onclick="this.closest('.pos-entry').remove()" title="Удалить"><i class="bi bi-x-lg"></i></button></div>`,
        competitor: (c={}) => {
            let brandOpts = `<option value="">-- Бренд --</option>`; state.competitorsRef.forEach(r => brandOpts += `<option value="${r.name}" ${r.name===c.brand?'selected':''}>${r.name}</option>`);
            return `<div class="competitor-entry"><select class="form-select competitor-brand" onchange="updateCollections(this)">${brandOpts}</select><select class="form-select competitor-collection"><option>${c.collection||'-- Коллекция --'}</option></select><input type="text" class="form-control competitor-price-opt" placeholder="ОПТ" value="${c.price_opt||''}"><input type="text" class="form-control competitor-price-retail" placeholder="Розн" value="${c.price_retail||''}"><button type="button" class="btn-remove-entry" onclick="this.closest('.competitor-entry').remove()" title="Удалить"><i class="bi bi-x-lg"></i></button></div>`;
        }
    };
    
    window.updateCollections = (select) => {
        const brand = select.value; const row = select.closest('.competitor-entry'); const collSel = row.querySelector('.competitor-collection');
        const ref = state.competitorsRef.find(r => r.name === brand);
        let html = '<option value="">-- Коллекция --</option>';
        if (ref && ref.collections) ref.collections.forEach(c => { const n = c.name || c; html += `<option value="${n}">${n}</option>`; });
        collSel.innerHTML = html;
    };

    function renderList(listId, data, generator) { const el = getEl(listId); if(el) el.innerHTML = (data||[]).map(generator).join(''); }
    function addListItem(listId, generator) { const el = getEl(listId); if(el) el.insertAdjacentHTML('beforeend', generator()); }
    function collectList(listId, selector, keys) {
        const el = getEl(listId); if(!el) return [];
        const res = [];
        el.querySelectorAll(selector).forEach(row => {
            const obj = {}; let hasVal = false;
            keys.forEach(k => { const inp = row.querySelector(k.sel); if(inp){ obj[k.key] = inp.value; if(obj[k.key]) hasVal=true; } });
            if(hasVal) res.push(obj);
        });
        return res;
    }
    
    function getSelectedProducts(containerId) { const el = getEl(containerId); if(!el) return []; return Array.from(el.querySelectorAll('input:checked')).map(cb=>cb.value); }

    // ==========================================
    // 6. MAIN LOGIC & INIT
    // ==========================================

    async function initApp() {
        try { const r = await fetch('/api/auth/me'); if(r.ok) { const d = await r.json(); state.currentUserRole = d.role; const b = getEl('user-role-badge'); if(b) b.textContent = d.role; if(d.role==='guest') { if(openAddModalBtn) openAddModalBtn.style.display='none'; } } } catch(e){}
        await Promise.all([fetchStatuses(), fetchProducts(), fetchCompetitors(), fetchDealers()]);
        updateUI();
        const pid = localStorage.getItem('pendingEditDealerId'); if(pid) { localStorage.removeItem('pendingEditDealerId'); openEditModal(pid); }
    }

    async function fetchStatuses() { const r = await fetch(API.statuses); if(r.ok) state.statusList = await r.json(); }
    async function fetchProducts() { const r = await fetch(API.products); if(r.ok) state.fullProductCatalog = await r.json(); }
    async function fetchCompetitors() { const r = await fetch(API.competitors); if(r.ok) state.competitorsRef = await r.json(); }
    async function fetchDealers() { const r = await fetch(API.dealers); if(r.ok) state.allDealers = await r.json(); }

    function updateUI() {
        populateFilters();
        renderDashboard();
        renderDealers();
        updateStatusSelects();
        // Update Datalists
        const dl1 = getEl('brands-datalist'); if(dl1) dl1.innerHTML = state.competitorsRef.map(r=>`<option value="${r.name}">`).join('');
        const dl2 = getEl('pos-materials-datalist'); if(dl2) dl2.innerHTML = posMaterialsList.map(s=>`<option value="${s}">`).join('');
    }

    function updateStatusSelects() {
        let opts = '<option value="">Все статусы</option>' + state.statusList.map(s => `<option value="${s.value}">${s.label}</option>`).join('');
        if(filterStatus) filterStatus.innerHTML = opts;
        let formOpts = state.statusList.map(s => `<option value="${s.value}">${s.label}</option>`).join('');
        const s1 = getEl('status'), s2 = getEl('edit_status');
        if(s1) s1.innerHTML = formOpts; if(s2) s2.innerHTML = formOpts;
    }

    function populateFilters() {
        if(!filterCity) return;
        const cities = [...new Set(state.allDealers.map(d=>d.city).filter(Boolean))].sort();
        const prices = [...new Set(state.allDealers.map(d=>d.price_type).filter(Boolean))].sort();
        filterCity.innerHTML = '<option value="">Город</option>'; cities.forEach(x => filterCity.add(new Option(x,x)));
        filterPriceType.innerHTML = '<option value="">Тип цен</option>'; prices.forEach(x => filterPriceType.add(new Option(x,x)));
    }

    function renderDealers() {
        if(!dealerGrid) return;
        const fCity = filterCity.value, fType = filterPriceType.value, fStat = filterStatus.value, fResp = filterResponsible.value, fSearch = searchBar.value.toLowerCase();
        
        const list = state.allDealers.filter(d => {
            let vis = true;
            if(!fStat) { const sObj = state.statusList.find(s=>s.value===(d.status||'standard')); if(sObj && sObj.isVisible===false) vis=false; }
            else vis = (d.status === fStat);
            return vis && (!fCity || d.city===fCity) && (!fType || d.price_type===fType) && (!fResp || d.responsible===fResp) && (!fSearch || (d.name+d.dealer_id).toLowerCase().includes(fSearch));
        });

        if(!list.length) { dealerGrid.innerHTML = '<div class="text-center text-muted py-5">Пусто</div>'; return; }
        
        dealerGrid.innerHTML = list.map(d => {
            const st = state.statusList.find(s=>s.value===(d.status||'standard')) || {label:d.status, color:'#777'};
            const avatar = d.photo_url ? `<img src="${d.photo_url}">` : `<i class="bi bi-shop"></i>`;
            const editBtn = state.currentUserRole !== 'guest' ? `<button class="btn-circle" onclick="window.openEditModal('${d.id}')"><i class="bi bi-pencil"></i></button>` : '';
            return `<div class="dealer-item" onclick="window.open('dealer.html?id=${d.id}','_blank')"><div class="dealer-avatar-box">${avatar}</div><div class="dealer-content"><div class="d-flex align-items-center gap-2 mb-1"><span class="dealer-name">${safeText(d.name)}</span><span style="background:${st.color};color:#fff;padding:2px 8px;border-radius:10px;font-size:0.7em">${st.label}</span></div><div class="dealer-meta"><span>#${safeText(d.dealer_id)}</span><span>${safeText(d.city)}</span></div></div><div class="dealer-actions">${editBtn}</div></div>`;
        }).join('');
    }

    function renderDashboard() {
        if(!dashboardStats) return;
        dashboardStats.innerHTML = `<div class="col-12"><div class="stat-card-modern p-3 text-center"><h3>${state.allDealers.length}</h3><small>Дилеров</small></div></div>`;
    }

    // ==========================================
    // 7. EVENT HANDLERS
    // ==========================================
    
    // Global Actions (Exposed)
    window.openEditModal = async (id) => {
        try {
            const r = await fetch(`${API.dealers}/${id}`); const d = await r.json();
            getEl('edit_db_id').value = d.id; getEl('edit_dealer_id').value = d.dealer_id; getEl('edit_name').value = d.name; getEl('edit_city').value = d.city;
            getEl('edit_address').value = d.address; getEl('edit_latitude').value = d.latitude||''; getEl('edit_longitude').value = d.longitude||'';
            if(getEl('edit_status')) getEl('edit_status').value = d.status || 'standard';
            // Render lists
            renderList('edit-contact-list', d.contacts, generators.contact);
            renderList('edit-address-list', d.additional_addresses, generators.address);
            renderList('edit-pos-list', d.pos_materials, generators.pos);
            renderList('edit-visits-list', d.visits, generators.visit);
            renderList('edit-competitor-list', d.competitors, generators.competitor);
            // Products
            const cl = getEl('edit-product-checklist'); 
            if(cl) cl.innerHTML = state.fullProductCatalog.map(p => `<div class="form-check"><input type="checkbox" class="form-check-input" value="${p.id}" ${(d.products||[]).find(x=>x.id===p.id)?'checked':''}><label>${p.sku} ${p.name}</label></div>`).join('');
            
            editModal.show();
        } catch(e) { window.showToast("Ошибка", "error"); }
    };

    // Add Dealer Wizard
    if(openAddModalBtn) openAddModalBtn.onclick = () => {
        state.currentStep = 1;
        if(addForm) addForm.reset();
        ['add-contact-list','add-address-list','add-pos-list','add-visits-list','add-competitor-list'].forEach(id => getEl(id).innerHTML='');
        getEl('add_latitude').value=''; getEl('add_longitude').value='';
        // Products
        const cl = getEl('add-product-checklist'); 
        if(cl) cl.innerHTML = state.fullProductCatalog.map(p => `<div class="form-check"><input type="checkbox" class="form-check-input" value="${p.id}"><label>${p.sku} ${p.name}</label></div>`).join('');
        
        showStep(1);
        addModal.show();
    };

    function showStep(s) {
        document.querySelectorAll('.wizard-step').forEach(e => e.classList.remove('active'));
        const stepEl = getEl(`step-${s}`); if(stepEl) stepEl.classList.add('active');
        if(prevBtn) prevBtn.style.display = s===1 ? 'none' : 'inline-block';
        if(nextBtn) nextBtn.style.display = s===totalSteps ? 'none' : 'inline-block';
        if(finishBtn) finishBtn.style.display = s===totalSteps ? 'inline-block' : 'none';
    }

    if(nextBtn) nextBtn.onclick = () => {
        if(state.currentStep===1) {
            if(!getVal('dealer_id') || !getVal('name')) return window.showToast("Заполните поля", "error");
            refreshAddMap();
        }
        if(state.currentStep < totalSteps) showStep(++state.currentStep);
    };
    if(prevBtn) prevBtn.onclick = () => { if(state.currentStep > 1) showStep(--state.currentStep); };

    // List Buttons
    const bindAddBtn = (btnId, listId, type) => { const b = getEl(btnId); if(b) b.onclick = () => addListItem(listId, generators[type]); };
    bindAddBtn('add-contact-btn-add-modal', 'add-contact-list', 'contact'); bindAddBtn('add-contact-btn-edit-modal', 'edit-contact-list', 'contact');
    bindAddBtn('add-address-btn-add-modal', 'add-address-list', 'address'); bindAddBtn('add-address-btn-edit-modal', 'edit-address-list', 'address');
    bindAddBtn('add-pos-btn-add-modal', 'add-pos-list', 'pos'); bindAddBtn('add-pos-btn-edit-modal', 'edit-pos-list', 'pos');
    bindAddBtn('add-visits-btn-add-modal', 'add-visits-list', 'visit'); bindAddBtn('add-visits-btn-edit-modal', 'edit-visits-list', 'visit');
    bindAddBtn('add-competitor-btn-add-modal', 'add-competitor-list', 'competitor'); bindAddBtn('add-competitor-btn-edit-modal', 'edit-competitor-list', 'competitor');

    // Filters
    [filterCity, filterPriceType, filterStatus, filterResponsible, searchBar].forEach(el => { if(el) el.onchange = el.oninput = renderDealers; });

    // Save
    if(addForm) addForm.onsubmit = async (e) => {
        e.preventDefault();
        const btn = finishBtn; btn.disabled = true;
        const data = {
            dealer_id: getVal('dealer_id'), name: getVal('name'), city: getVal('city'), address: getVal('address'), 
            status: getVal('status'), responsible: getVal('responsible'),
            latitude: getVal('add_latitude'), longitude: getVal('add_longitude'),
            contacts: collectList('add-contact-list', '.contact-entry', [{key:'name',sel:'.contact-name'},{key:'contactInfo',sel:'.contact-info'}]),
            pos_materials: collectList('add-pos-list', '.pos-entry', [{key:'name',sel:'.pos-name'},{key:'quantity',sel:'.pos-quantity'}]),
            // ... add other collections
        };
        try {
            const r = await fetch(API.dealers, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)});
            if(r.ok) { 
                const newD = await r.json();
                const pIds = getSelectedProducts('add-product-checklist');
                if(pIds.length) await fetch(`${API.dealers}/${newD.id}/products`, {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({productIds:pIds})});
                window.showToast("Добавлено"); setTimeout(()=>location.reload(), 500); 
            }
        } catch(e) { window.showToast("Ошибка", "error"); btn.disabled = false; }
    };
    
    // Map Listeners
    if(addModalEl) addModalEl.addEventListener('shown.bs.modal', () => refreshAddMap());
    if(editModalEl) {
        const tab = document.querySelector('button[data-bs-target="#tab-map"]');
        if(tab) tab.addEventListener('shown.bs.tab', () => refreshEditMap());
    }

    // Logout
    if(logoutBtn) logoutBtn.onclick = (e) => { e.preventDefault(); const x = new XMLHttpRequest(); x.open("GET", "/?x="+Math.random(), true, "logout", "logout"); x.onreadystatechange=()=>window.location.reload(); x.send(); };

    // Start
    initApp();
});
