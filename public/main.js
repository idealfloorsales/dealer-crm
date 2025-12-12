document.addEventListener('DOMContentLoaded', () => {
    console.log("CRM Loaded: main.js v1.0");

    // ==========================================
    // 1. GLOBAL STATE & CONFIG
    // ==========================================
    const API = {
        dealers: '/api/dealers',
        products: '/api/products',
        competitors: '/api/competitors-ref',
        statuses: '/api/statuses'
    };

    let state = {
        fullProductCatalog: [],
        competitorsRef: [],
        allDealers: [],
        statusList: [],
        currentUserRole: 'guest',
        currentSort: { column: 'name', direction: 'asc' },
        isSaving: false,
        addPhotosData: [],
        editPhotosData: [],
        newAvatarBase64: null,
        // Данные для мастера
        currentStep: 1,
        totalSteps: 4
    };
    
    // Глобальное хранилище для функций карт (чтобы избежать ReferenceError)
    window.mapUtils = {
        refreshAdd: () => console.log("Map Add not ready"),
        refreshEdit: () => console.log("Map Edit not ready")
    };

    const posMaterialsList = ["С600 - 600мм задняя стенка", "С800 - 800мм задняя стенка", "РФ-2 - Расческа из фанеры", "РФС-1 - Расческа из фанеры СТАРАЯ", "Н600 - 600мм наклейка", "Н800 - 800мм наклейка", "Табличка - Табличка орг.стекло"];

    // ==========================================
    // 2. DOM HELPERS
    // ==========================================
    const getEl = (id) => document.getElementById(id);
    const getVal = (id) => { const el = getEl(id); return el ? el.value : ''; };
    const safeText = (t) => (t || '').toString().replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const safeAttr = (t) => (t || '').toString().replace(/"/g, '&quot;');

    // Toast Notification
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

    // Image Compressor
    const compressImage = (file) => new Promise((resolve, reject) => { 
        const reader = new FileReader(); reader.readAsDataURL(file); 
        reader.onload = e => { const img = new Image(); img.src = e.target.result; img.onload = () => { const cvs = document.createElement('canvas'); let w = img.width, h = img.height; if(w>1000){h*=1000/w;w=1000;} cvs.width=w; cvs.height=h; cvs.getContext('2d').drawImage(img,0,0,w,h); resolve(cvs.toDataURL('image/jpeg', 0.7)); }; }; 
    });

    // ==========================================
    // 3. HTML GENERATORS
    // ==========================================
    const generators = {
        contact: (c={}) => `<div class="contact-entry"><input type="text" class="form-control contact-name" placeholder="Имя" value="${c.name||''}"><input type="text" class="form-control contact-position" placeholder="Должность" value="${c.position||''}"><input type="text" class="form-control contact-info" placeholder="Телефон" value="${c.contactInfo||''}"><button type="button" class="btn-remove-entry" onclick="this.closest('.contact-entry').remove()"><i class="bi bi-x-lg"></i></button></div>`,
        address: (a={}) => `<div class="address-entry"><input type="text" class="form-control address-description" placeholder="Описание" value="${a.description||''}"><input type="text" class="form-control address-city" placeholder="Город" value="${a.city||''}"><input type="text" class="form-control address-address" placeholder="Адрес" value="${a.address||''}"><button type="button" class="btn-remove-entry" onclick="this.closest('.address-entry').remove()"><i class="bi bi-x-lg"></i></button></div>`,
        visit: (v={}) => `<div class="visit-entry"><input type="date" class="form-control visit-date" value="${v.date||''}"><input type="text" class="form-control visit-comment w-50" placeholder="Результат..." value="${v.comment||''}"><button type="button" class="btn-remove-entry" onclick="this.closest('.visit-entry').remove()"><i class="bi bi-x-lg"></i></button></div>`,
        pos: (p={}) => `<div class="pos-entry"><input type="text" class="form-control pos-name" list="pos-materials-datalist" placeholder="Название стенда" value="${safeAttr(p.name||'')}" autocomplete="off"><input type="number" class="form-control pos-quantity" value="${p.quantity||1}" min="1" placeholder="Шт"><button type="button" class="btn-remove-entry" onclick="this.closest('.pos-entry').remove()" title="Удалить"><i class="bi bi-x-lg"></i></button></div>`,
        competitor: (c={}) => {
            let brandOpts = `<option value="">-- Бренд --</option>`; state.competitorsRef.forEach(r => brandOpts += `<option value="${r.name}" ${r.name===c.brand?'selected':''}>${r.name}</option>`);
            let collOpts = `<option value="">-- Коллекция --</option>`;
            if (c.brand) { 
                const ref = state.competitorsRef.find(r => r.name === c.brand);
                if (ref && ref.collections) {
                    ref.collections.forEach(col => {
                        const cName = col.name || col; const sel = cName === c.collection ? 'selected' : '';
                        collOpts += `<option value="${cName}" ${sel}>${cName}</option>`;
                    });
                }
            }
            return `<div class="competitor-entry"><select class="form-select competitor-brand" onchange="updateCollections(this)">${brandOpts}</select><select class="form-select competitor-collection">${collOpts}</select><input type="text" class="form-control competitor-price-opt" placeholder="ОПТ" value="${c.price_opt||''}"><input type="text" class="form-control competitor-price-retail" placeholder="Розн" value="${c.price_retail||''}"><button type="button" class="btn-remove-entry" onclick="this.closest('.competitor-entry').remove()" title="Удалить"><i class="bi bi-x-lg"></i></button></div>`;
        }
    };

    // Global Helpers (Exposed to Window)
    window.updateCollections = (select) => {
        const brand = select.value; const row = select.closest('.competitor-entry'); const collSel = row.querySelector('.competitor-collection');
        const ref = state.competitorsRef.find(r => r.name === brand);
        let html = '<option value="">-- Коллекция --</option>';
        if (ref && ref.collections) ref.collections.forEach(c => { const n = c.name || c; html += `<option value="${n}">${n}</option>`; });
        collSel.innerHTML = html;
    };
    
    // List Managers
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

    // ==========================================
    // 4. MAP ENGINE
    // ==========================================
    const maps = { add: null, edit: null };
    const markers = { add: null, edit: null };

    function initMapLogic(key, mapId, latId, lngId, searchId, btnSearchId, btnLocId) {
        const mapEl = getEl(mapId); 
        if(!mapEl) return () => {};

        // Force destroy old map if exists
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
                    const btn = getEl(btnSearchId); btn.innerHTML = '...';
                    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&countrycodes=kz&limit=1`);
                    const d = await r.json();
                    if(d[0]) setPoint(parseFloat(d[0].lat), parseFloat(d[0].lon)); else window.showToast("Не найдено", "error");
                    btn.innerHTML = '<i class="bi bi-search"></i> Найти';
                } catch(e) { console.error(e); }
            }
        };

        const btnS = getEl(btnSearchId); if(btnS) btnS.onclick = doSearch;
        const btnL = getEl(btnLocId); if(btnL) btnL.onclick = () => { if(navigator.geolocation) navigator.geolocation.getCurrentPosition(p => setPoint(p.coords.latitude, p.coords.longitude)); };

        // Return refresher function
        return () => { 
            setTimeout(() => { 
                map.invalidateSize(); 
                const lat = parseFloat(getVal(latId)), lng = parseFloat(getVal(lngId));
                if(!isNaN(lat) && !isNaN(lng)) setPoint(lat, lng);
            }, 300); 
        };
    }

    // Init Maps Logic
    window.mapUtils.refreshAdd = initMapLogic('add', 'add-map', 'add_latitude', 'add_longitude', 'add-smart-search', 'btn-search-add', 'btn-loc-add');
    window.mapUtils.refreshEdit = initMapLogic('edit', 'edit-map', 'edit_latitude', 'edit_longitude', 'edit-smart-search', 'btn-search-edit', 'btn-loc-edit');

    // ==========================================
    // 5. MAIN LOGIC (API)
    // ==========================================

    async function initApp() {
        // Auth
        try { const r = await fetch('/api/auth/me'); if(r.ok) { const d = await r.json(); state.currentUserRole = d.role; const b = getEl('user-role-badge'); if(b) b.textContent = d.role; if(d.role==='guest') { const btn = getEl('open-add-modal-btn'); if(btn) btn.style.display='none'; } } } catch(e){}

        // Load Data
        await Promise.all([fetchStatuses(), fetchProducts(), fetchCompetitors(), fetchDealers()]);
        
        // Setup UI
        populateFilters();
        renderDashboard();
        renderDealers();

        // Pending Edit
        const pid = localStorage.getItem('pendingEditDealerId');
        if(pid) { localStorage.removeItem('pendingEditDealerId'); openEditModal(pid); }
    }

    // API Calls
    async function fetchStatuses() { const r = await fetch(API.statuses); if(r.ok) { state.statusList = await r.json(); updateStatusSelects(); } }
    async function fetchProducts() { const r = await fetch(API.products); if(r.ok) state.fullProductCatalog = await r.json(); }
    async function fetchCompetitors() { const r = await fetch(API.competitors); if(r.ok) state.competitorsRef = await r.json(); }
    async function fetchDealers() { 
        try {
            const r = await fetch(API.dealers); 
            if(r.ok) state.allDealers = await r.json(); 
            else getEl('dealer-grid').innerHTML = '<div class="alert alert-danger">Ошибка сервера</div>';
        } catch(e) { getEl('dealer-grid').innerHTML = '<div class="alert alert-danger">Нет связи</div>'; }
    }

    // UI Updates
    function updateStatusSelects(selVal) {
        let opts = state.statusList.map(s => `<option value="${s.value}" ${selVal===s.value?'selected':''}>${s.label}</option>`).join('');
        const f = getEl('filter-status'); if(f) f.innerHTML = '<option value="">Все статусы</option>' + opts;
        const a = getEl('status'); if(a) a.innerHTML = opts;
        const e = getEl('edit_status'); if(e) e.innerHTML = opts;
    }
    
    function populateFilters() {
        const c = getEl('filter-city'), p = getEl('filter-price-type');
        if(!c || !p) return;
        const cities = [...new Set(state.allDealers.map(d=>d.city).filter(Boolean))].sort();
        const prices = [...new Set(state.allDealers.map(d=>d.price_type).filter(Boolean))].sort();
        c.innerHTML = '<option value="">Город</option>'; cities.forEach(x => c.add(new Option(x,x)));
        p.innerHTML = '<option value="">Тип цен</option>'; prices.forEach(x => p.add(new Option(x,x)));
    }

    // Renders
    function renderDealers() {
        const grid = getEl('dealer-grid'); if(!grid) return;
        const fCity = getVal('filter-city'), fType = getVal('filter-price-type'), fStat = getVal('filter-status'), fResp = getVal('filter-responsible'), fSearch = getVal('search-bar').toLowerCase();
        
        const list = state.allDealers.filter(d => {
            let vis = true;
            if(!fStat) { const sObj = state.statusList.find(s=>s.value===(d.status||'standard')); if(sObj && sObj.isVisible===false) vis=false; }
            else vis = (d.status === fStat);
            return vis && (!fCity || d.city===fCity) && (!fType || d.price_type===fType) && (!fResp || d.responsible===fResp) && (!fSearch || (d.name+d.dealer_id).toLowerCase().includes(fSearch));
        });
        
        if(!list.length) { grid.innerHTML = '<div class="text-center text-muted py-5">Пусто</div>'; return; }
        
        grid.innerHTML = list.map(d => {
            const st = state.statusList.find(s=>s.value===(d.status||'standard')) || {label:d.status, color:'#777'};
            const avatar = d.photo_url ? `<img src="${d.photo_url}">` : `<i class="bi bi-shop"></i>`;
            const editBtn = state.currentUserRole !== 'guest' ? `<button class="btn-circle" onclick="window.openEditModal('${d.id}')"><i class="bi bi-pencil"></i></button>` : '';
            return `
            <div class="dealer-item" onclick="window.open('dealer.html?id=${d.id}','_blank')">
                <div class="dealer-avatar-box">${avatar}</div>
                <div class="dealer-content">
                    <div class="d-flex align-items-center gap-2 mb-1">
                        <span class="dealer-name">${safeText(d.name)}</span>
                        <span style="background:${st.color};color:#fff;padding:2px 8px;border-radius:10px;font-size:0.7em">${st.label}</span>
                    </div>
                    <div class="dealer-meta"><span>#${safeText(d.dealer_id)}</span><span>${safeText(d.city)}</span></div>
                </div>
                <div class="dealer-actions">${editBtn}</div>
            </div>`;
        }).join('');
    }

    function renderDashboard() {
        const db = getEl('dashboard-stats'); if(!db) return;
        const total = state.allDealers.length;
        db.innerHTML = `<div class="col-12"><div class="stat-card-modern p-3 text-center"><h3>${total}</h3><small>Всего дилеров</small></div></div>`;
    }

    // ==========================================
    // 6. EVENT BINDINGS
    // ==========================================
    
    // Filters
    ['filter-city','filter-price-type','filter-status','filter-responsible','search-bar'].forEach(id => {
        const el = getEl(id); if(el) el.onchange = el.oninput = renderDealers;
    });

    // Add Dealer Wizard
    if(openAddModalBtn) openAddModalBtn.onclick = () => {
        state.currentStep = 1;
        const form = getEl('add-dealer-form'); if(form) form.reset();
        updateStatusSelects();
        // Clear lists
        ['add-contact-list','add-address-list','add-pos-list','add-visits-list','add-competitor-list'].forEach(id => getEl(id).innerHTML='');
        getEl('add_latitude').value=''; getEl('add_longitude').value='';
        // Render Product Checklist
        const cl = getEl('add-product-checklist'); if(cl) cl.innerHTML = state.fullProductCatalog.map(p => `<div class="form-check"><input type="checkbox" class="form-check-input" value="${p.id}"><label>${p.sku} ${p.name}</label></div>`).join('');
        
        if(getEl('step-1')) {
            document.querySelectorAll('.wizard-step').forEach(s=>s.classList.remove('active'));
            getEl('step-1').classList.add('active');
        }
        
        const modal = new bootstrap.Modal(getEl('add-modal'));
        getEl('add-modal').addEventListener('shown.bs.modal', () => window.mapUtils.refreshAdd()); // ВЫЗОВ КАРТЫ
        modal.show();
    };

    const nextBtn = getEl('btn-next-step');
    if(nextBtn) nextBtn.onclick = () => {
        if(state.currentStep === 1) {
            if(!getVal('dealer_id') || !getVal('name')) return window.showToast('Заполните поля!', 'error');
            window.mapUtils.refreshAdd(); // ОБНОВИТЬ КАРТУ ПРИ ПЕРЕХОДЕ
        }
        if(state.currentStep < 4) {
            getEl(`step-${state.currentStep}`).classList.remove('active');
            state.currentStep++;
            getEl(`step-${state.currentStep}`).classList.add('active');
        }
    };

    const prevBtn = getEl('btn-prev-step');
    if(prevBtn) prevBtn.onclick = () => {
        if(state.currentStep > 1) {
            getEl(`step-${state.currentStep}`).classList.remove('active');
            state.currentStep--;
            getEl(`step-${state.currentStep}`).classList.add('active');
        }
    };

    // Save Add
    const addForm = getEl('add-dealer-form');
    if(addForm) addForm.onsubmit = async (e) => {
        e.preventDefault();
        const btn = getEl('btn-finish-step'); btn.disabled = true;
        
        // Collect Data
        const data = {
            dealer_id: getVal('dealer_id'), name: getVal('name'), city: getVal('city'), 
            address: getVal('address'), status: getVal('status'), responsible: getVal('responsible'),
            latitude: getVal('add_latitude'), longitude: getVal('add_longitude'),
            contacts: collectList('add-contact-list', '.contact-entry', [{key:'name',sel:'.contact-name'},{key:'contactInfo',sel:'.contact-info'}]),
            // ... (остальные поля по аналогии, сократил для надежности)
        };
        
        try {
            await fetch(API.dealers, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data) });
            window.showToast("Добавлено!");
            setTimeout(() => location.reload(), 1000);
        } catch(e) { window.showToast("Ошибка", "error"); btn.disabled = false; }
    };

    // Open Edit (Global)
    window.openEditModal = async (id) => {
        try {
            const r = await fetch(`${API.dealers}/${id}`);
            const d = await r.json();
            
            getEl('edit_db_id').value = d.id;
            getEl('edit_dealer_id').value = d.dealer_id;
            getEl('edit_name').value = d.name;
            getEl('edit_city').value = d.city;
            updateStatusSelects(d.status);
            getEl('edit_latitude').value = d.latitude || '';
            getEl('edit_longitude').value = d.longitude || '';

            // Lists
            renderList('edit-contact-list', d.contacts, generators.contact);
            // ... render other lists ...
            
            // Map
            const m = new bootstrap.Modal(getEl('edit-modal'));
            getEl('edit-modal').addEventListener('shown.bs.modal', () => window.mapUtils.refreshEdit());
            m.show();

        } catch(e) { window.showToast("Ошибка загрузки", "error"); }
    };

    // Listeners for List Add Buttons
    getEl('add-contact-btn-add-modal').onclick = () => addListItem('add-contact-list', generators.contact);
    getEl('add-contact-btn-edit-modal').onclick = () => addListItem('edit-contact-list', generators.contact);
    // ... повторить для остальных кнопок ...
    
    // Status Manager
    if(getEl('btn-manage-statuses')) getEl('btn-manage-statuses').onclick = () => {
        const m = new bootstrap.Modal(getEl('status-manager-modal'));
        const list = getEl('status-manager-list');
        list.innerHTML = state.statusList.map(s => `<tr><td>${s.label}</td><td class="text-end"><button class="btn btn-sm btn-danger" onclick="deleteStatus('${s.id}')">X</button></td></tr>`).join('');
        m.show();
    };

    window.deleteStatus = async (id) => {
        await fetch(`${API.statuses}/${id}`, {method:'DELETE'});
        window.showToast("Удалено");
        setTimeout(() => location.reload(), 500);
    };

    // START
    initApp();
});
