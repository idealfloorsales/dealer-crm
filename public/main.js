document.addEventListener('DOMContentLoaded', () => {
    console.log("CRM Loaded: main.js v1.5 (Map Fix & Spinner)");

    // ==========================================
    // 1. HELPERS
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
        const icon = type === 'success' ? 'check-circle-fill' : 'exclamation-triangle-fill';
        toast.innerHTML = `<i class="bi bi-${icon} fs-5"></i><span class="fw-bold text-dark">${message}</span>`;
        container.appendChild(toast);
        setTimeout(() => { toast.style.animation = 'toastFadeOut 0.5s forwards'; setTimeout(() => toast.remove(), 500); }, 3000);
    };

    const compressImage = (file) => new Promise((resolve) => { 
        const reader = new FileReader(); reader.readAsDataURL(file); 
        reader.onload = e => { const img = new Image(); img.src = e.target.result; img.onload = () => { const cvs = document.createElement('canvas'); let w = img.width, h = img.height; if(w>1000){h*=1000/w;w=1000;} cvs.width=w; cvs.height=h; cvs.getContext('2d').drawImage(img,0,0,w,h); resolve(cvs.toDataURL('image/jpeg', 0.7)); }; }; 
    });

    // ==========================================
    // 2. STATE & CONFIG
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
        totalSteps: 4,
        addPhotosData: [],
        editPhotosData: [],
        newAvatarBase64: null,
        isSaving: false
    };
    const posMaterialsList = ["С600 - 600мм задняя стенка", "С800 - 800мм задняя стенка", "РФ-2 - Расческа из фанеры", "РФС-1 - Расческа из фанеры СТАРАЯ", "Н600 - 600мм наклейка", "Н800 - 800мм наклейка", "Табличка - Табличка орг.стекло"];

    // ==========================================
    // 3. GENERATORS
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
        const el = getEl(listId); if(!el) return []; const res = [];
        el.querySelectorAll(selector).forEach(row => {
            const obj = {}; let hasVal = false;
            keys.forEach(k => { const inp = row.querySelector(k.sel); if(inp){ obj[k.key] = inp.value; if(obj[k.key]) hasVal=true; } });
            if(hasVal) res.push(obj);
        }); return res;
    }
    
    function renderProductChecklist(container, selectedIds=[]) { if(!container) return; const set = new Set(selectedIds); container.innerHTML = state.fullProductCatalog.map(p => `<div class="checklist-item form-check"><input type="checkbox" class="form-check-input" id="prod-${container.id}-${p.id}" value="${p.id}" ${set.has(p.id)?'checked':''}><label class="form-check-label" for="prod-${container.id}-${p.id}"><strong>${p.sku}</strong> - ${p.name}</label></div>`).join(''); }
    function getSelectedProducts(containerId) { const el = getEl(containerId); if(!el) return []; return Array.from(el.querySelectorAll('input:checked')).map(cb=>cb.value); }
    function renderPhotoPreviews(container, photosArray) { if(container) container.innerHTML = photosArray.map((p, index) => `<div class="photo-preview-item"><img src="${p.photo_url}"><button type="button" class="btn-remove-photo" data-index="${index}"><i class="bi bi-x"></i></button></div>`).join(''); }

    // ==========================================
    // 4. MAP LOGIC
    // ==========================================
    const maps = { add: null, edit: null };
    const markers = { add: null, edit: null };

    function initMapLogic(key, mapId, latId, lngId, searchId, btnSearchId, btnLocId) {
        const mapEl = getEl(mapId); if(!mapEl) return () => {};
        
        // Удаляем старую карту если есть
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
            }, 300); // Тайм-аут для надежности
        };
    }

    const refreshAddMap = initMapLogic('add', 'add-map', 'add_latitude', 'add_longitude', 'add-smart-search', 'btn-search-add', 'btn-loc-add');
    const refreshEditMap = initMapLogic('edit', 'edit-map', 'edit_latitude', 'edit_longitude', 'edit-smart-search', 'btn-search-edit', 'btn-loc-edit');

    // ==========================================
    // 5. DATA POPULATION
    // ==========================================
    function populateModalMenus(prefix) {
        const typeSelect = getEl(`${prefix}_price_type`);
        const respSelect = getEl(`${prefix}_responsible`);
        
        if (typeSelect && typeSelect.tagName === 'SELECT') {
            const existing = new Set(state.allDealers.map(d => d.price_type).filter(Boolean));
            let html = '<option value="">-- Выберите --</option>';
            existing.forEach(t => html += `<option value="${t}">${t}</option>`);
            if(!existing.has('ОПТ')) html += `<option value="ОПТ">ОПТ</option>`;
            if(!existing.has('Розница')) html += `<option value="Розница">Розница</option>`;
            typeSelect.innerHTML = html;
        }

        if (respSelect && respSelect.tagName === 'SELECT') {
            const existing = new Set(state.allDealers.map(d => d.responsible).filter(Boolean));
            let html = '<option value="">-- Выберите --</option>';
            html += `<option value="regional_astana">Региональный Астана</option>`;
            html += `<option value="regional_regions">Региональный Регионы</option>`;
            html += `<option value="office">Офис</option>`;
            existing.forEach(r => {
                if (!['regional_astana', 'regional_regions', 'office'].includes(r)) html += `<option value="${r}">${r}</option>`;
            });
            respSelect.innerHTML = html;
        }
    }

    // ==========================================
    // 6. MAIN LOGIC
    // ==========================================

    async function initApp() {
        try { const r = await fetch('/api/auth/me'); if(r.ok) { const d = await r.json(); state.currentUserRole = d.role; const b = getEl('user-role-badge'); if(b) b.textContent = d.role; if(d.role==='guest') { const btn = getEl('open-add-modal-btn'); if(btn) btn.style.display='none'; } } } catch(e){}
        await Promise.all([fetchStatuses(), fetchProducts(), fetchCompetitors(), fetchDealers()]);
        updateUI();
        const pid = localStorage.getItem('pendingEditDealerId'); if(pid) { localStorage.removeItem('pendingEditDealerId'); window.openEditModal(pid); }
    }

    async function fetchStatuses() { const r = await fetch(API.statuses); if(r.ok) state.statusList = await r.json(); }
    async function fetchProducts() { const r = await fetch(API.products); if(r.ok) state.fullProductCatalog = await r.json(); }
    async function fetchCompetitors() { const r = await fetch(API.competitors); if(r.ok) state.competitorsRef = await r.json(); }
    async function fetchDealers() { try { const r = await fetch(API.dealers); if(r.ok) state.allDealers = await r.json(); else getEl('dealer-grid').innerHTML = '<div class="alert alert-danger">Ошибка сервера</div>'; } catch(e) { getEl('dealer-grid').innerHTML = '<div class="alert alert-danger">Нет связи</div>'; } }

    function updateUI() {
        populateFilters();
        renderDashboard();
        renderDealers();
        updateStatusSelects();
        const dl1 = getEl('brands-datalist'); if(dl1) dl1.innerHTML = state.competitorsRef.map(r=>`<option value="${r.name}">`).join('');
        const dl2 = getEl('pos-materials-datalist'); if(dl2) dl2.innerHTML = posMaterialsList.map(s=>`<option value="${s}">`).join('');
    }

    function updateStatusSelects(selVal) {
        let opts = state.statusList.map(s => `<option value="${s.value}" ${selVal===s.value?'selected':''}>${s.label}</option>`).join('');
        const f = getEl('filter-status'); if(f) f.innerHTML = '<option value="">Все статусы</option>' + opts;
        const a = getEl('status'); if(a) a.innerHTML = opts;
        const e = getEl('edit_status'); if(e) e.innerHTML = opts;
    }

    function populateFilters() {
        const c = getEl('filter-city'), p = getEl('filter-price-type'); if(!c || !p) return;
        const cities = [...new Set(state.allDealers.map(d=>d.city).filter(Boolean))].sort();
        const prices = [...new Set(state.allDealers.map(d=>d.price_type).filter(Boolean))].sort();
        c.innerHTML = '<option value="">Город</option>'; cities.forEach(x => c.add(new Option(x,x)));
        p.innerHTML = '<option value="">Тип цен</option>'; prices.forEach(x => p.add(new Option(x,x)));
    }

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
            const editBtn = state.currentUserRole !== 'guest' ? `<button class="btn-circle" onclick="event.stopPropagation(); window.openEditModal('${d.id}')"><i class="bi bi-pencil"></i></button>` : ''; 
            
            let icons = '';
            if (d.contacts && d.contacts.length > 0) {
                const phone = d.contacts.find(c => c.contactInfo)?.contactInfo || '';
                const cleanPhone = phone.replace(/[^0-9]/g, '');
                if (cleanPhone.length >= 10) {
                    icons += `<a href="https://wa.me/${cleanPhone}" target="_blank" class="btn-circle btn-circle-wa" onclick="event.stopPropagation()"><i class="bi bi-whatsapp"></i></a>`;
                    icons += `<a href="tel:+${cleanPhone}" class="btn-circle btn-circle-call" onclick="event.stopPropagation()"><i class="bi bi-telephone-fill"></i></a>`;
                }
            }
            if (d.latitude && d.longitude) {
                icons += `<a href="https://yandex.kz/maps/?pt=${d.longitude},${d.latitude}&z=17&l=map" target="_blank" class="btn-circle" onclick="event.stopPropagation()"><i class="bi bi-geo-alt-fill"></i></a>`;
            }
            if (d.instagram) {
                let url = d.instagram.trim();
                if (!url.startsWith('http')) { if (url.startsWith('@')) url = 'https://instagram.com/' + url.substring(1); else url = 'https://instagram.com/' + url; }
                icons += `<a href="${url}" target="_blank" class="btn-circle btn-circle-insta" onclick="event.stopPropagation()"><i class="bi bi-instagram"></i></a>`;
            }

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
                <div class="dealer-actions">${icons} ${editBtn}</div>
            </div>`;
        }).join('');
    }

    function renderDashboard() {
        const db = getEl('dashboard-stats'); if(!db) return;
        const total = state.allDealers.length;
        if(total === 0) { db.innerHTML=''; return; }

        const activeDealers = state.allDealers.filter(d => d.status !== 'potential');
        const totalReal = activeDealers.length;
        const noAvatar = activeDealers.filter(d => !d.photo_url).length;

        let cActive=0, cStandard=0, cProblem=0, cPotential=0;
        state.allDealers.forEach(d => {
            if(d.status==='active') cActive++;
            else if(d.status==='standard') cStandard++;
            else if(d.status==='problem') cProblem++;
            else if(d.status==='potential') cPotential++;
        });

        const pActive = total > 0 ? (cActive/total)*100 : 0;
        const pStandard = total > 0 ? (cStandard/total)*100 : 0;
        const pProblem = total > 0 ? (cProblem/total)*100 : 0;
        const pPotential = total > 0 ? (cPotential/total)*100 : 0;

        db.innerHTML = `
            <div class="col-6"><div class="stat-card-modern"><div class="stat-icon-box bg-primary-subtle text-primary"><i class="bi bi-shop"></i></div><div class="stat-info"><h3>${totalReal}</h3><p>Дилеров</p></div></div></div>
            <div class="col-6"><div class="stat-card-modern"><div class="stat-icon-box ${noAvatar>0?'bg-danger-subtle text-danger':'bg-success-subtle text-success'}"><i class="bi bi-camera-fill"></i></div><div class="stat-info"><h3 class="${noAvatar>0?'text-danger':''}">${noAvatar}</h3><p>Без фото</p></div></div></div>
            <div class="col-12 mt-2">
                <div class="stat-card-modern d-block p-3">
                    <h6 class="text-muted fw-bold small mb-3 text-uppercase">Структура базы</h6>
                    <div class="progress mb-3" style="height: 12px; border-radius: 6px;">
                        <div class="progress-bar bg-success" style="width: ${pActive}%"></div>
                        <div class="progress-bar bg-warning" style="width: ${pStandard}%"></div>
                        <div class="progress-bar bg-danger" style="width: ${pProblem}%"></div>
                        <div class="progress-bar bg-primary" style="width: ${pPotential}%"></div>
                    </div>
                    <div class="d-flex justify-content-between text-center small">
                        <div><span class="badge rounded-pill text-bg-success mb-1">${cActive}</span><br><span class="text-muted" style="font-size:0.75rem">VIP</span></div>
                        <div><span class="badge rounded-pill text-bg-warning mb-1">${cStandard}</span><br><span class="text-muted" style="font-size:0.75rem">Std</span></div>
                        <div><span class="badge rounded-pill text-bg-danger mb-1">${cProblem}</span><br><span class="text-muted" style="font-size:0.75rem">Prob</span></div>
                        <div><span class="badge rounded-pill text-bg-primary mb-1">${cPotential}</span><br><span class="text-muted" style="font-size:0.75rem">Pot</span></div>
                    </div>
                </div>
            </div>
        `;
    }

    // ==========================================
    // 7. EVENT HANDLERS
    // ==========================================
    
    // Global Edit
    window.openEditModal = async (id) => {
        try {
            const r = await fetch(`${API.dealers}/${id}`); const d = await r.json();
            
            populateModalMenus('edit');

            getEl('edit_db_id').value = d.id; 
            getEl('edit_dealer_id').value = d.dealer_id; 
            getEl('edit_name').value = d.name; 
            getEl('edit_city').value = d.city;
            getEl('edit_address').value = d.address; 
            getEl('edit_latitude').value = d.latitude||''; 
            getEl('edit_longitude').value = d.longitude||'';
            if(getEl('edit_status')) getEl('edit_status').value = d.status || 'standard';
            if(getEl('edit_price_type')) getEl('edit_price_type').value = d.price_type || '';
            if(getEl('edit_responsible')) getEl('edit_responsible').value = d.responsible || '';

            renderList('edit-contact-list', d.contacts, generators.contact);
            renderList('edit-address-list', d.additional_addresses, generators.address);
            renderList('edit-pos-list', d.pos_materials, generators.pos);
            renderList('edit-visits-list', d.visits, generators.visit);
            renderList('edit-competitor-list', d.competitors, generators.competitor);
            
            state.editPhotosData = d.photos || [];
            renderPhotoPreviews(getEl('edit-photo-preview-container'), state.editPhotosData);

            const cl = getEl('edit-product-checklist'); 
            if(cl) cl.innerHTML = state.fullProductCatalog.map(p => `<div class="form-check"><input type="checkbox" class="form-check-input" value="${p.id}" ${(d.products||[]).find(x=>x.id===p.id)?'checked':''}><label>${p.sku} ${p.name}</label></div>`).join('');
            
            const modalEl = getEl('edit-modal');
            const m = new bootstrap.Modal(modalEl, {backdrop:'static'}); 
            
            // Map Listener: Call refresher AND resize logic explicitly
            modalEl.addEventListener('shown.bs.modal', () => { 
                refreshEditMap(); 
            });
            // Also listen for tab switches inside modal
            const tabMap = modalEl.querySelector('button[data-bs-target="#tab-map"]');
            if(tabMap) tabMap.addEventListener('shown.bs.tab', () => refreshEditMap());

            m.show();

        } catch(e) { window.showToast("Ошибка загрузки", "error"); console.error(e); }
    };

    // Add Dealer Wizard
    const btnAdd = getEl('open-add-modal-btn');
    if(btnAdd) btnAdd.onclick = () => {
        state.currentStep = 1;
        getEl('add-dealer-form').reset();
        populateModalMenus('add'); 
        
        ['add-contact-list','add-address-list','add-pos-list','add-visits-list','add-competitor-list'].forEach(id => getEl(id).innerHTML='');
        getEl('add_latitude').value=''; getEl('add_longitude').value=''; state.addPhotosData=[]; renderPhotoPreviews(getEl('add-photo-preview-container'), []);
        renderProductChecklist(getEl('add-product-checklist'));
        
        if(getEl('step-1')) {
            document.querySelectorAll('.wizard-step').forEach(s=>s.classList.remove('active'));
            document.querySelectorAll('.step-circle').forEach(s=>s.classList.remove('active'));
            getEl('step-1').classList.add('active');
        }
        
        const m = new bootstrap.Modal(getEl('add-modal'), {backdrop:'static'});
        getEl('add-modal').addEventListener('shown.bs.modal', () => refreshAddMap());
        m.show();
    };

    const next = getEl('btn-next-step');
    if(next) next.onclick = () => {
        if(state.currentStep === 1) {
            if(!getVal('dealer_id') || !getVal('name')) return window.showToast('Заполните поля!', 'error');
            refreshAddMap();
        }
        if(state.currentStep < state.totalSteps) {
            getEl(`step-${state.currentStep}`).classList.remove('active');
            state.currentStep++;
            getEl(`step-${state.currentStep}`).classList.add('active');
            
            for(let i=1; i<=state.totalSteps; i++) {
                const c = getEl(`step-ind-${i}`);
                if(i < state.currentStep) { c.classList.add('completed'); c.innerHTML='✔'; }
                else { c.classList.remove('completed'); c.innerHTML=i; if(i===state.currentStep) c.classList.add('active'); else c.classList.remove('active'); }
            }
            getEl('btn-prev-step').style.display = 'inline-block';
            if(state.currentStep === state.totalSteps) {
                next.style.display = 'none';
                getEl('btn-finish-step').style.display = 'inline-block';
            }
        }
    };

    const prev = getEl('btn-prev-step');
    if(prev) prev.onclick = () => {
        if(state.currentStep > 1) {
            getEl(`step-${state.currentStep}`).classList.remove('active');
            state.currentStep--;
            getEl(`step-${state.currentStep}`).classList.add('active');
            
             for(let i=1; i<=state.totalSteps; i++) {
                const c = getEl(`step-ind-${i}`);
                if(i===state.currentStep) c.classList.add('active'); else c.classList.remove('active');
            }
            getEl('btn-next-step').style.display = 'inline-block';
            getEl('btn-finish-step').style.display = 'none';
            if(state.currentStep === 1) prev.style.display = 'none';
        }
    };

    // Filters
    ['filter-city','filter-price-type','filter-status','filter-responsible','search-bar'].forEach(id => {
        const el = getEl(id); if(el) el.onchange = el.oninput = renderDealers;
    });

    // List Buttons
    const bindAddBtn = (btnId, listId, type) => { const b = getEl(btnId); if(b) b.onclick = () => addListItem(listId, generators[type]); };
    bindAddBtn('add-contact-btn-add-modal', 'add-contact-list', 'contact'); bindAddBtn('add-contact-btn-edit-modal', 'edit-contact-list', 'contact');
    bindAddBtn('add-address-btn-add-modal', 'add-address-list', 'address'); bindAddBtn('add-address-btn-edit-modal', 'edit-address-list', 'address');
    bindAddBtn('add-pos-btn-add-modal', 'add-pos-list', 'pos'); bindAddBtn('add-pos-btn-edit-modal', 'edit-pos-list', 'pos');
    bindAddBtn('add-visits-btn-add-modal', 'add-visits-list', 'visit'); bindAddBtn('add-visits-btn-edit-modal', 'edit-visits-list', 'visit');
    bindAddBtn('add-competitor-btn-add-modal', 'add-competitor-list', 'competitor'); bindAddBtn('add-competitor-btn-edit-modal', 'edit-competitor-list', 'competitor');

    // Save
    const formAdd = getEl('add-dealer-form');
    if(formAdd) formAdd.onsubmit = async (e) => {
        e.preventDefault();
        const btn = getEl('btn-finish-step'); btn.disabled = true;
        const data = {
            dealer_id: getVal('dealer_id'), name: getVal('name'), city: getVal('city'), address: getVal('address'), status: getVal('status'), responsible: getVal('responsible'), latitude: getVal('add_latitude'), longitude: getVal('add_longitude'), price_type: getVal('price_type'), organization: getVal('organization'),
            contacts: collectList('add-contact-list', '.contact-entry', [{key:'name',sel:'.contact-name'},{key:'contactInfo',sel:'.contact-info'}]),
            pos_materials: collectList('add-pos-list', '.pos-entry', [{key:'name',sel:'.pos-name'},{key:'quantity',sel:'.pos-quantity'}]),
            competitors: collectList('add-competitor-list', '.competitor-entry', [{key:'brand',sel:'.competitor-brand'},{key:'collection',sel:'.competitor-collection'},{key:'price_opt',sel:'.competitor-price-opt'},{key:'price_retail',sel:'.competitor-price-retail'}])
        };
        try {
            const r = await fetch(API.dealers, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)});
            if(r.ok) { 
                const newD = await r.json();
                const pIds = getSelectedProducts('add-product-checklist');
                if(pIds.length) await fetch(`${API.dealers}/${newD.id}/products`, {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({productIds:pIds})});
                window.showToast("Добавлено!"); setTimeout(()=>location.reload(), 500); 
            }
        } catch(e) { window.showToast("Ошибка", "error"); btn.disabled = false; }
    };

    const formEdit = getEl('edit-dealer-form');
    if(formEdit) formEdit.onsubmit = async (e) => {
        e.preventDefault();
        
        // --- SPINNER LOGIC ---
        const btn = formEdit.querySelector('button[type="submit"]'); 
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Сохранение...';
        // ---------------------

        const id = getVal('edit_db_id');
        const data = {
            dealer_id: getVal('edit_dealer_id'), name: getVal('edit_name'), city: getVal('edit_city'), address: getVal('edit_address'), status: getVal('edit_status'), responsible: getVal('edit_responsible'), latitude: getVal('edit_latitude'), longitude: getVal('edit_longitude'), price_type: getVal('edit_price_type'), organization: getVal('edit_organization'),
            contacts: collectList('edit-contact-list', '.contact-entry', [{key:'name',sel:'.contact-name'},{key:'contactInfo',sel:'.contact-info'}]),
            pos_materials: collectList('edit-pos-list', '.pos-entry', [{key:'name',sel:'.pos-name'},{key:'quantity',sel:'.pos-quantity'}]),
            competitors: collectList('edit-competitor-list', '.competitor-entry', [{key:'brand',sel:'.competitor-brand'},{key:'collection',sel:'.competitor-collection'},{key:'price_opt',sel:'.competitor-price-opt'},{key:'price_retail',sel:'.competitor-price-retail'}])
        };
        try {
            await fetch(`${API.dealers}/${id}`, {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)});
            const pIds = getSelectedProducts('edit-product-checklist');
            await fetch(`${API.dealers}/${id}/products`, {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({productIds:pIds})});
            window.showToast("Сохранено!"); setTimeout(()=>location.reload(), 500); 
        } catch(e) { 
            window.showToast("Ошибка", "error"); 
            btn.disabled = false; 
            btn.innerHTML = originalText;
        }
    };

    // Logout
    const btnLogout = getEl('logout-btn');
    if(btnLogout) btnLogout.onclick = (e) => { e.preventDefault(); const x = new XMLHttpRequest(); x.open("GET", "/?x="+Math.random(), true, "logout", "logout"); x.onreadystatechange=()=>window.location.reload(); x.send(); };

    // Status Manager
    if(getEl('btn-manage-statuses')) getEl('btn-manage-statuses').onclick = () => {
        const m = new bootstrap.Modal(getEl('status-manager-modal'));
        const list = getEl('status-manager-list');
        list.innerHTML = state.statusList.map(s => `<tr><td><div style="width:20px;height:20px;background:${s.color};border-radius:50%"></div></td><td>${s.label}</td><td class="text-end"><button class="btn btn-sm btn-danger" onclick="deleteStatus('${s.id}')">X</button></td></tr>`).join('');
        m.show();
    };
    
    // Status Add
    const sForm = getEl('status-form');
    if(sForm) sForm.onsubmit = async (e) => {
        e.preventDefault();
        const body = { label: getVal('st_label'), color: getVal('st_color'), isVisible: getEl('st_visible').checked, value: 'st_'+Math.random().toString(36).substr(2,5), sortOrder: state.statusList.length+10 };
        try { await fetch(API.statuses, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)}); window.showToast("Создано"); setTimeout(()=>location.reload(),500); } catch(e){ window.showToast("Ошибка","error"); }
    };
    
    window.deleteStatus = async (id) => { if(confirm("Удалить?")) { await fetch(`${API.statuses}/${id}`, {method:'DELETE'}); location.reload(); } };

    // Start
    initApp();
});
