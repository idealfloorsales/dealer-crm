document.addEventListener('DOMContentLoaded', () => {
    
    // --- 1. АВТОРИЗАЦИЯ (ТОКЕН) ---
    const originalFetch = window.fetch;
    window.fetch = async function (url, options) {
        options = options || {};
        options.headers = options.headers || {};
        const token = localStorage.getItem('crm_token');
        if (token) options.headers['Authorization'] = 'Bearer ' + token;
        const response = await originalFetch(url, options);
        if (response.status === 401) window.location.href = '/login.html';
        return response;
    };

    // --- 2. КОНСТАНТЫ ---
    const API_DEALERS_URL = '/api/dealers';
    const API_PRODUCTS_URL = '/api/products'; 
    const API_COMPETITORS_REF_URL = '/api/competitors-ref';
    const API_STATUSES_URL = '/api/statuses';
    const API_TASKS_URL = '/api/tasks';
    const API_SALES_URL = '/api/sales';

    let fullProductCatalog = [];
    let competitorsRef = []; 
    let allDealers = [];
    let statusList = []; 
    let allTasksData = [];
    let currentMonthSales = [];
    
    let currentSort = { column: 'name', direction: 'asc' };
    let isSaving = false; 
    let addPhotosData = []; 
    let editPhotosData = []; 
    let newAvatarBase64 = null; 
    
    // --- ПРАВА ДОСТУПА (По умолчанию всё выключено) ---
    let permissions = {
        is_admin: false,
        can_view_dealers: false,
        can_view_map: false,
        can_view_products: false,
        can_view_report: false,
        can_view_sales: false,
        can_view_competitors: false,
        can_view_knowledge: false,
        can_view_dashboard: false,
        can_create_dealer: false,
        can_edit_dealer: false,
        can_delete_dealer: false,
        can_manage_users: false,
        can_export_base: false,
        can_export_prices: false
    };

    const posMaterialsList = ["С600 - 600мм задняя стенка", "С800 - 800мм задняя стенка", "РФ-2 - Расческа из фанеры", "РФС-1 - Расческа из фанеры СТАРАЯ", "Н600 - 600мм наклейка", "Н800 - 800мм наклейка", "Табличка - Табличка орг.стекло"];

    // --- 3. ЭЛЕМЕНТЫ UI ---
    const addModalEl = document.getElementById('add-modal'); const addModal = new bootstrap.Modal(addModalEl, { backdrop: 'static', keyboard: false }); const addForm = document.getElementById('add-dealer-form');
    const editModalEl = document.getElementById('edit-modal'); const editModal = new bootstrap.Modal(editModalEl, { backdrop: 'static', keyboard: false }); const editForm = document.getElementById('edit-dealer-form');
    const qvModalEl = document.getElementById('quick-visit-modal'); const qvModal = new bootstrap.Modal(qvModalEl, { backdrop: 'static', keyboard: false }); const qvForm = document.getElementById('quick-visit-form');
    const statusModalEl = document.getElementById('status-manager-modal'); const statusModal = statusModalEl ? new bootstrap.Modal(statusModalEl) : null; const btnManageStatuses = document.getElementById('btn-manage-statuses'); const statusForm = document.getElementById('status-form'); const statusListContainer = document.getElementById('status-manager-list');
    
    // Кнопки управления
    const openAddModalBtn = document.getElementById('open-add-modal-btn');
    const mobileFabBtn = document.getElementById('mobile-fab-add');
    const btnExportDealers = document.getElementById('export-dealers-btn'); 
    const btnExportCompetitors = document.getElementById('export-competitors-prices-btn');
    
    const brandsDatalist = document.getElementById('brands-datalist');
    const posDatalist = document.getElementById('pos-materials-datalist');
    const dealerGrid = document.getElementById('dealer-grid'); 
    const dashboardStats = document.getElementById('dashboard-stats');
    
    // Фильтры
    const filterCity = document.getElementById('filter-city'); const filterPriceType = document.getElementById('filter-price-type'); const filterStatus = document.getElementById('filter-status'); const filterResponsible = document.getElementById('filter-responsible'); const searchBar = document.getElementById('search-bar'); 
    const logoutBtn = document.getElementById('logout-btn'); 

    // Внутренние списки модалок
    const addProductChecklist = document.getElementById('add-product-checklist'); const addContactList = document.getElementById('add-contact-list'); const addAddressList = document.getElementById('add-address-list'); const addPosList = document.getElementById('add-pos-list'); const addVisitsList = document.getElementById('add-visits-list'); const addCompetitorList = document.getElementById('add-competitor-list'); const addPhotoInput = document.getElementById('add-photo-input'); const addPhotoPreviewContainer = document.getElementById('add-photo-preview-container'); const addAvatarInput = document.getElementById('add-avatar-input'); const addAvatarPreview = document.getElementById('add-avatar-preview');
    const editProductChecklist = document.getElementById('edit-product-checklist'); const editContactList = document.getElementById('edit-contact-list'); const editAddressList = document.getElementById('edit-address-list'); const editPosList = document.getElementById('edit-pos-list'); const editVisitsList = document.getElementById('edit-visits-list'); const editCompetitorList = document.getElementById('edit-competitor-list'); const editPhotoInput = document.getElementById('edit-photo-input'); const editPhotoPreviewContainer = document.getElementById('edit-photo-preview-container'); const editAvatarInput = document.getElementById('edit-avatar-input'); const editAvatarPreview = document.getElementById('edit-avatar-preview'); const editCurrentAvatarUrl = document.getElementById('edit-current-avatar-url');
    const addOrgList = document.getElementById('add-org-list'); const editOrgList = document.getElementById('edit-org-list'); const btnAddOrgAdd = document.getElementById('btn-add-org-add'); const btnEditOrgAdd = document.getElementById('btn-edit-org-add');

    // Карты
    let mapInstances = { add: null, edit: null };
    let markerInstances = { add: null, edit: null };
    let refreshAddMap = null; let refreshEditMap = null;

    // --- 4. ЗАПУСК (INIT) ---
    async function initApp() {
        try {
            console.log("🚀 Init CRM...");
            
            // 1. Загружаем права пользователя
            await loadUserPermissions();
            
            // 2. Применяем права (Скрываем/Показываем кнопки и страницы)
            applyPermissionsToUI();

            // 3. Грузим справочники
            await Promise.all([
                fetchStatuses(),
                fetchProductCatalog(),
                updatePosDatalist()
            ]);

            try { const compRes = await fetch(API_COMPETITORS_REF_URL); if (compRes.ok) { competitorsRef = await compRes.json(); updateBrandsDatalist(); } } catch(e){}

            // 4. Если есть право на просмотр списка дилеров - грузим их
            if (permissions.can_view_dealers) {
                await Promise.all([
                    fetchDealers(),
                    fetchTasks(),
                    fetchCurrentMonthSales()
                ]);
                populateFilters(allDealers);
                renderDashboard();
                renderDealerList();
            } else {
                if(dealerGrid) dealerGrid.innerHTML = '<div class="text-center mt-5 text-muted"><i class="bi bi-lock fs-1"></i><p>У вас нет прав для просмотра списка дилеров</p></div>';
                if(dashboardStats) dashboardStats.innerHTML = '';
            }
            
            // 5. Открываем модалку, если обновляли страницу
            const pendingId = localStorage.getItem('pendingEditDealerId'); 
            if (pendingId) { 
                localStorage.removeItem('pendingEditDealerId'); 
                if (permissions.can_edit_dealer) openEditModal(pendingId); 
            }

        } catch (error) {
            console.error("CRITICAL ERROR:", error);
            showErrorScreen(error.message);
        }
    }

    // --- 5. ЛОГИКА ПРАВ (ПОЛЗУНКИ) ---
    async function loadUserPermissions() {
        try {
            const res = await fetch('/api/auth/me');
            if (res.ok) {
                const data = await res.json();
                const user = data.user || data;
                
                // Если админ - включаем всё, иначе берем из базы
                if (user.permissions) {
                    permissions = user.permissions;
                }
                
                // Бейджик имени
                const badge = document.getElementById('user-role-badge');
                if(badge) badge.textContent = user.fullName || user.username;
            }
        } catch (e) { console.warn('Auth check failed', e); }
    }

    function applyPermissionsToUI() {
        // Хелпер для скрытия элементов
        const toggle = (selector, isVisible) => {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => {
                // Используем !important, чтобы перебить d-flex и другие классы Bootstrap
                if (isVisible) el.style.removeProperty('display');
                else el.style.setProperty('display', 'none', 'important');
            });
        };

        const p = permissions;

        // --- СТРАНИЦЫ (МЕНЮ) ---
        toggle('a[href="/map.html"]', p.can_view_map);
        toggle('a[href="/products.html"]', p.can_view_products);       // Каталог (Матрица)
        toggle('a[href="/report.html"]', p.can_view_report);           // Отчет (Выставленность)
        toggle('a[href="/sales.html"]', p.can_view_sales);             // Продажи
        toggle('a[href="/competitors.html"]', p.can_view_competitors); // Конкуренты
        toggle('a[href="/knowledge.html"]', p.can_view_knowledge);     // База знаний
        toggle('a[href="/users.html"]', p.can_manage_users);           // Сотрудники

        // --- ЭЛЕМЕНТЫ НА ГЛАВНОЙ ---
        toggle('#dashboard-stats', p.can_view_dashboard);              // Дашборд
        toggle('#dealer-grid', p.can_view_dealers);                    // Список дилеров
        toggle('.sticky-filters', p.can_view_dealers);                 // Фильтры списка

        // --- КНОПКИ ДЕЙСТВИЙ ---
        // Создавать дилера
        toggle('#open-add-modal-btn', p.can_create_dealer);
        toggle('#mobile-fab-add', p.can_create_dealer);

        // Скачивать Excel
        toggle('#export-dealers-btn', p.can_export_base);
        toggle('#export-competitors-prices-btn', p.can_export_prices);
    }

    // --- 6. RENDER LIST (С ПРОВЕРКОЙ НА РЕДАКТИРОВАНИЕ) ---
    function renderDealerList() {
        if (!dealerGrid) return;
        const city = filterCity ? filterCity.value : ''; const type = filterPriceType ? filterPriceType.value : ''; const status = filterStatus ? filterStatus.value : ''; const responsible = filterResponsible ? filterResponsible.value : ''; const search = searchBar ? searchBar.value.toLowerCase() : '';
        
        const filtered = allDealers.filter(d => { 
            let isVisible = true;
            if (!status) { const statusObj = statusList.find(s => s.value === (d.status || 'standard')); if (statusObj && statusObj.isVisible === false) isVisible = false; } else { isVisible = (d.status === status); }
            return isVisible && (!city || d.city === city) && (!type || d.price_type === type) && (!responsible || d.responsible === responsible) && (!search || ((d.name||'').toLowerCase().includes(search) || (d.dealer_id||'').toLowerCase().includes(search)));
        });
        filtered.sort((a, b) => { let valA = (a[currentSort.column] || '').toString(); let valB = (b[currentSort.column] || '').toString(); let res = currentSort.column === 'dealer_id' ? valA.localeCompare(valB, undefined, {numeric:true}) : valA.toLowerCase().localeCompare(valB.toLowerCase(), 'ru'); return currentSort.direction === 'asc' ? res : -res; });
        
        if (filtered.length === 0) { dealerGrid.innerHTML = ` <div class="empty-state"><i class="bi bi-search empty-state-icon"></i><h5 class="text-muted">Ничего не найдено</h5><button class="btn btn-sm btn-outline-secondary mt-2" onclick="location.reload()">Сбросить</button></div>`; return; }
        
        const salesMap = {};
        if(currentMonthSales && currentMonthSales.length > 0) {
            currentMonthSales.forEach(s => { if(s.dealerId) salesMap[s.dealerId] = (salesMap[s.dealerId] || 0) + (s.fact || 0); });
        }

        dealerGrid.innerHTML = filtered.map(d => {
            const statusObj = statusList.find(s => s.value === (d.status || 'standard')) || { label: d.status, color: '#6c757d' };
            const statusStyle = `background-color: ${statusObj.color}; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: 500;`;
            let phoneBtn = ''; let waBtn = ''; if (d.contacts && d.contacts.length > 0) { const phone = d.contacts.find(c => c.contactInfo)?.contactInfo || ''; const cleanPhone = phone.replace(/[^0-9]/g, ''); if (cleanPhone.length >= 10) { phoneBtn = `<a href="tel:+${cleanPhone}" class="btn-circle btn-circle-call" onclick="event.stopPropagation()" title="Позвонить"><i class="bi bi-telephone-fill"></i></a>`; waBtn = `<a href="https://wa.me/${cleanPhone}" target="_blank" class="btn-circle btn-circle-wa" onclick="event.stopPropagation()" title="WhatsApp"><i class="bi bi-whatsapp"></i></a>`; } }
            let mapBtn = ''; if (d.latitude && d.longitude) mapBtn = `<a href="https://yandex.kz/maps/?pt=${d.longitude},${d.latitude}&z=17&l=map" target="_blank" class="btn-circle" onclick="event.stopPropagation()" title="Маршрут"><i class="bi bi-geo-alt-fill"></i></a>`;
            let instaBtn = ''; if (d.instagram) { let url = d.instagram.trim(); if (!url.startsWith('http')) { url = url.startsWith('@') ? 'https://instagram.com/' + url.substring(1) : 'https://instagram.com/' + url; } instaBtn = `<a href="${url}" target="_blank" class="btn-circle btn-circle-insta" onclick="event.stopPropagation()" title="Instagram"><i class="bi bi-instagram"></i></a>`; }
            const avatarHtml = d.photo_url ? `<img src="${d.photo_url}" alt="${d.name}">` : `<i class="bi bi-shop"></i>`;
            
            // --- ПРОВЕРКА ПРАВА НА РЕДАКТИРОВАНИЕ ---
            const editBtn = permissions.can_edit_dealer 
                ? `<button class="btn-circle" onclick="event.stopPropagation(); openEditModal('${d.id}')" title="Редактировать"><i class="bi bi-pencil"></i></button>` 
                : '';
            // ----------------------------------------

            const salesFact = salesMap[d.id] || 0;
            let salesColorClass = 'bg-danger'; if (salesFact >= 200) salesColorClass = 'bg-success'; else if (salesFact >= 100) salesColorClass = 'bg-warning text-dark'; 
            const salesBadge = `<span class="badge ${salesColorClass} rounded-pill ms-2">${salesFact.toFixed(0)} м²</span>`;

            return `<div class="dealer-item" onclick="window.open('dealer.html?id=${d.id}', '_blank')"><div class="dealer-avatar-box">${avatarHtml}</div><div class="dealer-content"><div class="d-flex align-items-center gap-2 mb-1"><a href="dealer.html?id=${d.id}" class="dealer-name" target="_blank">${safeText(d.name)}</a><span style="${statusStyle}">${statusObj.label}</span></div><div class="dealer-meta"><span><i class="bi bi-hash"></i>${safeText(d.dealer_id)}</span><span><i class="bi bi-geo-alt"></i>${safeText(d.city)}</span>${d.price_type ? `<span><i class="bi bi-tag"></i>${safeText(d.price_type)}</span>` : ''}${salesBadge}</div></div><div class="dealer-actions">${instaBtn} ${waBtn} ${phoneBtn} ${mapBtn} ${editBtn}</div></div>`;
        }).join('');
    }

    // --- API ЗАПРОСЫ ---
    async function fetchDealers() { const response = await fetch(API_DEALERS_URL); if (!response.ok) throw new Error("Не удалось загрузить список дилеров"); allDealers = await response.json(); }
    async function fetchTasks() { const response = await fetch(API_TASKS_URL); if(response.ok) allTasksData = await response.json(); }
    async function fetchCurrentMonthSales() { const month = new Date().toISOString().slice(0, 7); const r = await fetch(`${API_SALES_URL}?month=${month}`); if(r.ok) currentMonthSales = await r.json(); }
    async function fetchStatuses() { const res = await fetch(API_STATUSES_URL); if(res.ok) { statusList = await res.json(); populateStatusSelects(); renderStatusManagerList(); } }
    async function fetchProductCatalog() { if (fullProductCatalog.length > 0) return; const response = await fetch(API_PRODUCTS_URL); if (response.ok) fullProductCatalog = await response.json(); }
    
    // --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---
    function updatePosDatalist() { if (!posDatalist) return; let html = ''; posMaterialsList.forEach(s => { html += `<option value="${s}">`; }); posDatalist.innerHTML = html; }
    function updateBrandsDatalist() { if (!brandsDatalist) return; let html = ''; competitorsRef.forEach(ref => { html += `<option value="${ref.name}">`; }); brandsDatalist.innerHTML = html; }
    function populateFilters(dealers) { 
        if(!filterCity || !filterPriceType) return; 
        const cities = [...new Set(dealers.map(d => d.city).filter(Boolean))].sort(); 
        const types = [...new Set(dealers.map(d => d.price_type).filter(Boolean))].sort(); 
        const sc = filterCity.value; const st = filterPriceType.value; 
        filterCity.innerHTML = '<option value="">Город</option>'; filterPriceType.innerHTML = '<option value="">Тип цен</option>'; 
        cities.forEach(c => filterCity.add(new Option(c, c))); types.forEach(t => filterPriceType.add(new Option(t, t))); 
        filterCity.value = sc; filterPriceType.value = st; 
    }
    function populateStatusSelects(selectedStatus = null) { let filterHtml = '<option value="">Все статусы</option>'; statusList.forEach(s => { filterHtml += `<option value="${s.value}">${s.label}</option>`; }); if(filterStatus) filterStatus.innerHTML = filterHtml; const defaultOpts = `<option value="potential">🔵 Потенциальный</option><option value="active">🟢 Активный</option><option value="standard">🟡 Стандарт</option><option value="problem">🔴 Проблемный</option><option value="archive">⚫ Архив</option>`; const modalHtml = statusList.length > 0 ? statusList.map(s => `<option value="${s.value}" ${selectedStatus === s.value ? 'selected' : ''}>${s.label}</option>`).join('') : defaultOpts; const addStatusSel = document.getElementById('status'); if(addStatusSel) addStatusSel.innerHTML = modalHtml; const editStatusSel = document.getElementById('edit_status'); if(editStatusSel) editStatusSel.innerHTML = modalHtml; }
    function renderStatusManagerList() { if(!statusListContainer) return; statusListContainer.innerHTML = statusList.map(s => `<tr><td style="width: 50px;"><div style="width:20px;height:20px;background:${s.color};border-radius:50%;"></div></td><td class="fw-bold">${s.label}</td><td class="text-muted small">${s.value}</td><td class="text-center">${s.isVisible !== false ? '<i class="bi bi-eye-fill text-success"></i>' : '<i class="bi bi-eye-slash-fill text-muted"></i>'}</td><td class="text-end"><button class="btn btn-sm btn-light border me-1" onclick="editStatus('${s.id}')"><i class="bi bi-pencil"></i></button><button class="btn btn-sm btn-light border text-danger" onclick="deleteStatus('${s.id}')"><i class="bi bi-trash"></i></button></td></tr>`).join(''); }
    function resetStatusForm() { if(!statusForm) return; statusForm.reset(); document.getElementById('st_id').value = ''; document.getElementById('btn-save-status').textContent = 'Добавить'; document.getElementById('btn-save-status').className = 'btn btn-primary w-100'; document.getElementById('btn-cancel-edit-status').style.display = 'none'; document.getElementById('st_color').value = '#0d6efd'; }
    function showErrorScreen(msg) { if(dealerGrid) { dealerGrid.innerHTML = `<div class="alert alert-danger text-center m-5 shadow-sm p-4 rounded-4 border-0"><h1 class="display-6 text-danger mb-3"><i class="bi bi-wifi-off"></i></h1><h4 class="fw-bold">Ошибка загрузки</h4><div class="p-2 bg-white rounded border d-inline-block text-start mb-3"><small class="text-danger font-monospace">${msg}</small></div><div><button class="btn btn-outline-danger rounded-pill" onclick="location.reload()">Обновить</button></div></div>`; } }

    // --- КНОПКИ (С проверкой прав) ---
    if(btnExportDealers) btnExportDealers.onclick = () => { if(!allDealers.length) return window.showToast("Нет данных", "error"); let csv = "\uFEFFID;Название;Город;Адрес;Статус;Ответственный;Организации;Телефон\n"; allDealers.forEach(d => { const phone = (d.contacts && d.contacts[0]) ? d.contacts[0].contactInfo : ''; const orgs = (d.organizations || [d.organization]).filter(Boolean).join(', '); csv += `${cleanCsv(d.dealer_id)};${cleanCsv(d.name)};${cleanCsv(d.city)};${cleanCsv(d.address)};${cleanCsv(d.status)};${cleanCsv(d.responsible)};${cleanCsv(orgs)};${cleanCsv(phone)}\n`; }); downloadCsv(csv, `base_dealers_${new Date().toISOString().slice(0,10)}.csv`); };
    if(btnExportCompetitors) btnExportCompetitors.onclick = () => { if(!allDealers.length) return window.showToast("Нет данных", "error"); let csv = "\uFEFFДилер;Город;Бренд;Коллекция;ОПТ;Розница\n"; let count = 0; allDealers.forEach(d => { if(d.competitors && d.competitors.length > 0) { d.competitors.forEach(c => { csv += `${cleanCsv(d.name)};${cleanCsv(d.city)};${cleanCsv(c.brand)};${cleanCsv(c.collection)};${cleanCsv(c.price_opt)};${cleanCsv(c.price_retail)}\n`; count++; }); } }); if(count === 0) return window.showToast("Нет данных о конкурентах", "warning"); downloadCsv(csv, `competitors_prices_${new Date().toISOString().slice(0,10)}.csv`); };

    // --- ОТКРЫТИЕ РЕДАКТИРОВАНИЯ ---
    async function openEditModal(id) {
        if (!permissions.can_edit_dealer) { window.showToast("Нет прав на редактирование", "error"); return; }
        try {
            const res = await fetch(`${API_DEALERS_URL}/${id}`); if(!res.ok) throw new Error("Ошибка"); const d = await res.json();
            const titleEl = document.querySelector('#edit-modal .modal-title'); if(titleEl) titleEl.textContent = `Редактировать: ${d.name}`;
            document.getElementById('edit_db_id').value=d.id; document.getElementById('edit_dealer_id').value=d.dealer_id; document.getElementById('edit_name').value=d.name; document.getElementById('edit_price_type').value=d.price_type; document.getElementById('edit_city').value=d.city; document.getElementById('edit_address').value=d.address; document.getElementById('edit_delivery').value=d.delivery; document.getElementById('edit_website').value=d.website; document.getElementById('edit_instagram').value=d.instagram;
            if(document.getElementById('edit_latitude')) document.getElementById('edit_latitude').value=d.latitude||''; if(document.getElementById('edit_longitude')) document.getElementById('edit_longitude').value=d.longitude||'';
            document.getElementById('edit_bonuses').value=d.bonuses; populateStatusSelects(d.status); 
            if(document.getElementById('edit_responsible')) { document.getElementById('edit_responsible').value = d.responsible || ''; toggleSectorSelect('edit', d.responsible); }
            if(document.getElementById('edit_region_sector')) document.getElementById('edit_region_sector').value = d.region_sector || '';
            if(d.contract) { document.getElementById('edit_contract_signed').checked = d.contract.isSigned || false; document.getElementById('edit_contract_date').value = d.contract.date || ''; } else { document.getElementById('edit_contract_signed').checked = false; document.getElementById('edit_contract_date').value = ''; }
            editOrgList.innerHTML = ''; if (d.organizations && d.organizations.length > 0) { d.organizations.forEach(org => editOrgList.insertAdjacentHTML('beforeend', createOrgInputHTML(org))); } else { editOrgList.insertAdjacentHTML('beforeend', createOrgInputHTML('')); }
            const vipCheck = document.getElementById('edit_has_personal_plan'); if(vipCheck) vipCheck.checked = d.hasPersonalPlan || false;
            if(editAvatarPreview) { editAvatarPreview.src = d.avatarUrl || ''; editAvatarPreview.style.display = d.avatarUrl ? 'block' : 'none'; }
            if(editCurrentAvatarUrl) editCurrentAvatarUrl.value = d.avatarUrl || ''; newAvatarBase64 = null;
            renderList(editContactList, d.contacts, createContactEntryHTML); renderList(editAddressList, d.additional_addresses, createAddressEntryHTML); renderList(editPosList, d.pos_materials, createPosEntryHTML); renderList(editVisitsList, d.visits, createVisitEntryHTML); renderList(editCompetitorList, d.competitors, createCompetitorEntryHTML);
            renderProductChecklist(editProductChecklist, (d.products||[]).map(p=>p.id)); editPhotosData = d.photos||[]; renderPhotoPreviews(editPhotoPreviewContainer, editPhotosData);
            const firstTabEl = document.querySelector('#editTabs button[data-bs-target="#tab-main"]'); if(firstTabEl) { const tab = new bootstrap.Tab(firstTabEl); tab.show(); } editModal.show();
        } catch(e){ window.showToast("Ошибка загрузки данных", "error"); console.error(e); }
    }
    window.openEditModal = openEditModal;
    window.showQuickVisit = (id) => { document.getElementById('qv_dealer_id').value = id; document.getElementById('qv_comment').value = ''; qvModal.show(); };

    // --- STANDARD HELPERS (Неизменные) ---
    const getVal = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };
    const safeText = (text) => (text || '').toString().replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const safeAttr = (text) => (text || '').toString().replace(/"/g, '&quot;');
    const compressImage = (file, maxWidth = 1000, quality = 0.7) => new Promise((resolve, reject) => { const reader = new FileReader(); reader.readAsDataURL(file); reader.onload = event => { const img = new Image(); img.src = event.target.result; img.onload = () => { const elem = document.createElement('canvas'); let width = img.width; let height = img.height; if (width > maxWidth) { height *= maxWidth / width; width = maxWidth; } elem.width = width; elem.height = height; const ctx = elem.getContext('2d'); ctx.drawImage(img, 0, 0, width, height); resolve(elem.toDataURL('image/jpeg', quality)); }; img.onerror = error => reject(error); }; reader.onerror = error => reject(error); });
    function cleanCsv(text) { return `"${String(text || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`; }
    function downloadCsv(content, filename) { const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); document.body.removeChild(a); }
    function createContactEntryHTML(c={}) { return `<div class="contact-entry"><input type="text" class="form-control contact-name" placeholder="Имя" value="${c.name||''}"><input type="text" class="form-control contact-position" placeholder="Должность" value="${c.position||''}"><input type="text" class="form-control contact-info" placeholder="Телефон" value="${c.contactInfo||''}"><button type="button" class="btn-remove-entry" onclick="this.closest('.contact-entry').remove()"><i class="bi bi-x-lg"></i></button></div>`; }
    function createAddressEntryHTML(a={}) { return `<div class="address-entry"><input type="text" class="form-control address-description" placeholder="Описание" value="${a.description||''}"><input type="text" class="form-control address-city" placeholder="Город" value="${a.city||''}"><input type="text" class="form-control address-address" placeholder="Адрес" value="${a.address||''}"><button type="button" class="btn-remove-entry" onclick="this.closest('.address-entry').remove()"><i class="bi bi-x-lg"></i></button></div>`; }
    function createVisitEntryHTML(v={}) { return `<div class="visit-entry"><input type="date" class="form-control visit-date" value="${v.date||''}"><input type="text" class="form-control visit-comment w-50" placeholder="Результат..." value="${v.comment||''}"><button type="button" class="btn-remove-entry" onclick="this.closest('.visit-entry').remove()"><i class="bi bi-x-lg"></i></button></div>`; }
    function renderPhotoPreviews(container, photosArray) { if(container) container.innerHTML = photosArray.map((p, index) => `<div class="photo-preview-item"><img src="${p.photo_url}"><button type="button" class="btn-remove-photo" data-index="${index}"><i class="bi bi-x"></i></button></div>`).join(''); }
    function createPosEntryHTML(p={}) { return `<div class="pos-entry"><input type="text" class="form-control pos-name" list="pos-materials-datalist" placeholder="Название стенда" value="${safeAttr(p.name||'')}" autocomplete="off"><input type="number" class="form-control pos-quantity" value="${p.quantity||1}" min="1" placeholder="Шт"><button type="button" class="btn-remove-entry" onclick="this.closest('.pos-entry').remove()" title="Удалить"><i class="bi bi-x-lg"></i></button></div>`; }
    function createCompetitorEntryHTML(c={}) { let brandOpts = `<option value="">-- Бренд --</option>`; competitorsRef.forEach(ref => { const sel = ref.name === c.brand ? 'selected' : ''; brandOpts += `<option value="${ref.name}" ${sel}>${ref.name}</option>`; }); let collOpts = `<option value="">-- Коллекция --</option>`; if (c.brand) { const ref = competitorsRef.find(r => r.name === c.brand); if (ref && ref.collections) { const sortedCols = [...ref.collections].sort((a, b) => { const typeA = (typeof a === 'object') ? a.type : 'std'; const typeB = (typeof b === 'object') ? b.type : 'std'; if (typeA === 'std' && typeB !== 'std') return 1; if (typeA !== 'std' && typeB === 'std') return -1; return 0; }); sortedCols.forEach(col => { const colName = (typeof col === 'string') ? col : col.name; const colType = (typeof col === 'object') ? col.type : 'std'; let label = ''; if(colType.includes('eng')) label = ' (Елка)'; else if(colType.includes('french')) label = ' (Фр. Елка)'; else if(colType.includes('art')) label = ' (Арт)'; const sel = colName === c.collection ? 'selected' : ''; collOpts += `<option value="${colName}" ${sel}>${colName}${label}</option>`; }); } } return `<div class="competitor-entry"><select class="form-select competitor-brand" onchange="updateCollections(this)">${brandOpts}</select><select class="form-select competitor-collection">${collOpts}</select><input type="text" class="form-control competitor-price-opt" placeholder="ОПТ" value="${c.price_opt||''}"><input type="text" class="form-control competitor-price-retail" placeholder="Розн" value="${c.price_retail||''}"><button type="button" class="btn-remove-entry" onclick="this.closest('.competitor-entry').remove()" title="Удалить"><i class="bi bi-x-lg"></i></button></div>`; }
    function createOrgInputHTML(value='') { return `<div class="input-group mb-1 org-entry"><input type="text" class="form-control org-input" placeholder="Юр. лицо" value="${safeAttr(value)}"><button type="button" class="btn btn-outline-danger" onclick="this.closest('.org-entry').remove()">X</button></div>`; }
    window.updateCollections = function(select) { const brandName = select.value; const row = select.closest('.competitor-entry'); const collSelect = row.querySelector('.competitor-collection'); let html = `<option value="">-- Коллекция --</option>`; const ref = competitorsRef.find(r => r.name === brandName); if (ref && ref.collections) { const sortedCols = [...ref.collections].sort((a, b) => { const typeA = (typeof a === 'object') ? a.type : 'std'; const typeB = (typeof b === 'object') ? b.type : 'std'; if (typeA === 'std' && typeB !== 'std') return 1; if (typeA !== 'std' && typeB === 'std') return -1; return 0; }); html += sortedCols.map(col => { const colName = (typeof col === 'string') ? col : col.name; const colType = (typeof col === 'object') ? col.type : 'std'; let label = ''; if(colType.includes('eng')) label = ' (Елка)'; else if(colType.includes('french')) label = ' (Фр. Елка)'; else if(colType.includes('art')) label = ' (Арт)'; return `<option value="${colName}">${colName}${label}</option>`; }).join(''); } collSelect.innerHTML = html; };
    window.showToast = function(message, type = 'success') { let container = document.getElementById('toast-container-custom'); if (!container) { container = document.createElement('div'); container.id = 'toast-container-custom'; container.className = 'toast-container-custom'; document.body.appendChild(container); } const toast = document.createElement('div'); toast.className = `toast-modern toast-${type}`; const icon = type === 'success' ? 'check-circle-fill' : (type === 'error' ? 'exclamation-triangle-fill' : 'info-circle-fill'); toast.innerHTML = `<i class="bi bi-${icon} fs-5"></i><span class="fw-bold text-dark">${message}</span>`; container.appendChild(toast); setTimeout(() => { toast.style.animation = 'toastFadeOut 0.5s forwards'; setTimeout(() => toast.remove(), 500); }, 3000); };
    window.toggleSectorSelect = function(prefix, responsibleValue) { const sectorSelect = document.getElementById(`${prefix}_region_sector`); if (responsibleValue === 'regional_regions') { sectorSelect.style.display = 'block'; } else { sectorSelect.style.display = 'none'; sectorSelect.value = ''; } };
    function renderProductChecklist(container, selectedIds=[]) { if(!container) return; const set = new Set(selectedIds); container.innerHTML = fullProductCatalog.map(p => `<div class="checklist-item form-check"><input type="checkbox" class="form-check-input" id="prod-${container.id}-${p.id}" value="${p.id}" ${set.has(p.id)?'checked':''}><label class="form-check-label" for="prod-${container.id}-${p.id}"><strong>${p.sku}</strong> - ${p.name}</label></div>`).join(''); }
    function getSelectedProductIds(containerId) { const el=document.getElementById(containerId); if(!el) return []; return Array.from(el.querySelectorAll('input:checked')).map(cb=>cb.value); }
    function collectData(container, selector, fields) { if (!container) return []; const data = []; container.querySelectorAll(selector).forEach(entry => { const item = {}; let hasData = false; fields.forEach(f => { const inp = entry.querySelector(f.class); if(inp){item[f.key]=inp.value; if(item[f.key]) hasData=true;} }); if(hasData) data.push(item); }); return data; }
    function renderList(container, data, htmlGen) { if(container) container.innerHTML = (data && data.length > 0) ? data.map(htmlGen).join('') : htmlGen(); }
    function collectOrgs(container) { const orgs = []; container.querySelectorAll('.org-input').forEach(inp => { if(inp.value.trim()) orgs.push(inp.value.trim()); }); return orgs; }

    if(filterCity) filterCity.onchange = renderDealerList; 
    if(filterPriceType) filterPriceType.onchange = renderDealerList; 
    if(filterStatus) filterStatus.onchange = renderDealerList; 
    if(filterResponsible) filterResponsible.onchange = renderDealerList; 
    if(searchBar) searchBar.oninput = renderDealerList;
    
    const setupListBtn = (id, list, genFunc) => { const btn = document.getElementById(id); if(btn) btn.onclick = () => list.insertAdjacentHTML('beforeend', genFunc()); };
    setupListBtn('add-contact-btn-add-modal', addContactList, createContactEntryHTML); setupListBtn('add-address-btn-add-modal', addAddressList, createAddressEntryHTML); setupListBtn('add-pos-btn-add-modal', addPosList, createPosEntryHTML); setupListBtn('add-visits-btn-add-modal', addVisitsList, createVisitEntryHTML); setupListBtn('add-competitor-btn-add-modal', addCompetitorList, createCompetitorEntryHTML);
    setupListBtn('add-contact-btn-edit-modal', editContactList, createContactEntryHTML); setupListBtn('add-address-btn-edit-modal', editAddressList, createAddressEntryHTML); setupListBtn('add-pos-btn-edit-modal', editPosList, createPosEntryHTML); setupListBtn('add-visits-btn-edit-modal', editVisitsList, createVisitEntryHTML); setupListBtn('add-competitor-btn-edit-modal', editCompetitorList, createCompetitorEntryHTML);

    if(btnAddOrgAdd) btnAddOrgAdd.onclick = () => addOrgList.insertAdjacentHTML('beforeend', createOrgInputHTML());
    if(btnEditOrgAdd) btnEditOrgAdd.onclick = () => editOrgList.insertAdjacentHTML('beforeend', createOrgInputHTML());

    if(addAvatarInput) addAvatarInput.addEventListener('change', async (e) => { const file = e.target.files[0]; if (file) { newAvatarBase64 = await compressImage(file, 800, 0.8); addAvatarPreview.src = newAvatarBase64; addAvatarPreview.style.display='block'; } });
    if(editAvatarInput) editAvatarInput.addEventListener('change', async (e) => { const file = e.target.files[0]; if (file) { newAvatarBase64 = await compressImage(file, 800, 0.8); editAvatarPreview.src = newAvatarBase64; editAvatarPreview.style.display='block'; } });
    if(addPhotoInput) addPhotoInput.addEventListener('change', async (e) => { for (let file of e.target.files) addPhotosData.push({ photo_url: await compressImage(file, 1000, 0.7) }); renderPhotoPreviews(addPhotoPreviewContainer, addPhotosData); addPhotoInput.value = ''; });
    if(addPhotoPreviewContainer) addPhotoPreviewContainer.addEventListener('click', (e) => { const btn = e.target.closest('.btn-remove-photo'); if(btn) { addPhotosData.splice(btn.dataset.index, 1); renderPhotoPreviews(addPhotoPreviewContainer, addPhotosData); } });
    if(editPhotoInput) editPhotoInput.addEventListener('change', async (e) => { for (let file of e.target.files) editPhotosData.push({ photo_url: await compressImage(file, 1000, 0.7) }); renderPhotoPreviews(editPhotoPreviewContainer, editPhotosData); editPhotoInput.value = ''; });
    if(editPhotoPreviewContainer) editPhotoPreviewContainer.addEventListener('click', (e) => { const btn = e.target.closest('.btn-remove-photo'); if(btn) { editPhotosData.splice(btn.dataset.index, 1); renderPhotoPreviews(editPhotoPreviewContainer, editPhotosData); } });

    if(logoutBtn) { logoutBtn.onclick = () => { localStorage.removeItem('crm_token'); localStorage.removeItem('crm_user'); window.location.href = '/login.html'; }; }
    
    if(document.body) { document.body.addEventListener('click', (e) => { const taskBtn = e.target.closest('.btn-complete-task'); if (taskBtn) { taskBtn.disabled = true; taskBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>'; completeTask(taskBtn, taskBtn.dataset.id, taskBtn.dataset.index); } }); }
    document.querySelectorAll('.sort-btn').forEach(btn => { btn.onclick = (e) => { const sortKey = e.currentTarget.dataset.sort; if(currentSort.column === sortKey) currentSort.direction = (currentSort.direction === 'asc' ? 'desc' : 'asc'); else { currentSort.column = sortKey; currentSort.direction = 'asc'; } renderDealerList(); }; });

    if(btnManageStatuses) { btnManageStatuses.onclick = () => { resetStatusForm(); statusModal.show(); }; }

    function setupMapLogic(mapId, latId, lngId, searchId, btnSearchId, btnLocId, instanceKey) {
        const mapEl = document.getElementById(mapId); if (!mapEl) return;
        if (!mapInstances[instanceKey]) {
            const map = L.map(mapId).setView([51.1605, 71.4704], 12);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: 'OSM' }).addTo(map);
            mapInstances[instanceKey] = map;
            map.on('click', (e) => { setMarker(e.latlng.lat, e.latlng.lng, instanceKey, latId, lngId); });
        }
        const map = mapInstances[instanceKey];
        function setMarker(lat, lng, key, latInputId, lngInputId) {
            if (markerInstances[key]) map.removeLayer(markerInstances[key]);
            markerInstances[key] = L.marker([lat, lng], { draggable: true }).addTo(map);
            document.getElementById(latInputId).value = lat.toFixed(6);
            document.getElementById(lngInputId).value = lng.toFixed(6);
            markerInstances[key].on('dragend', function(event) { const pos = event.target.getLatLng(); document.getElementById(latInputId).value = pos.lat.toFixed(6); document.getElementById(lngInputId).value = pos.lng.toFixed(6); });
            map.setView([lat, lng], 16);
        }
        const handleSearch = async () => {
            const input = document.getElementById(searchId); const query = input.value.trim(); if (!query) return;
            const coordsRegex = /^(-?\d+(\.\d+)?)[,\s]+(-?\d+(\.\d+)?)$/; const match = query.match(coordsRegex);
            if (match) { const lat = parseFloat(match[1]); const lng = parseFloat(match[3]); setMarker(lat, lng, instanceKey, latId, lngId); window.showToast("Координаты приняты!"); } 
            else { try { const btn = document.getElementById(btnSearchId); const oldHtml = btn.innerHTML; btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>'; const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=kz&limit=1`); const data = await res.json(); if (data && data.length > 0) { const lat = parseFloat(data[0].lat); const lng = parseFloat(data[0].lon); setMarker(lat, lng, instanceKey, latId, lngId); } else { alert("Адрес не найден."); } btn.innerHTML = oldHtml; } catch (e) { console.error(e); } }
        };
        const searchBtn = document.getElementById(btnSearchId); const searchInp = document.getElementById(searchId);
        if(searchBtn) searchBtn.onclick = handleSearch;
        if(searchInp) searchInp.addEventListener('keypress', (e) => { if (e.key === 'Enter') { e.preventDefault(); handleSearch(); } });
        const locBtn = document.getElementById(btnLocId);
        if(locBtn) { locBtn.onclick = () => { if (navigator.geolocation) { locBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>'; navigator.geolocation.getCurrentPosition(pos => { setMarker(pos.coords.latitude, pos.coords.longitude, instanceKey, latId, lngId); locBtn.innerHTML = '<i class="bi bi-geo-alt-fill"></i>'; }, () => { alert("Нет доступа к геопозиции"); locBtn.innerHTML = '<i class="bi bi-geo-alt-fill"></i>'; }); } }; }
        return function invalidate() { setTimeout(() => { map.invalidateSize(); const curLat = parseFloat(document.getElementById(latId).value); const curLng = parseFloat(document.getElementById(lngId).value); if (!isNaN(curLat) && !isNaN(curLng)) { setMarker(curLat, curLng, instanceKey, latId, lngId); } }, 300); };
    }
    refreshAddMap = setupMapLogic('add-map', 'add_latitude', 'add_longitude', 'add-smart-search', 'btn-search-add', 'btn-loc-add', 'add');
    refreshEditMap = setupMapLogic('edit-map', 'edit_latitude', 'edit_longitude', 'edit-smart-search', 'btn-search-edit', 'btn-loc-edit', 'edit');

    // --- SAVE HANDLERS ---
    function showStep(step) { document.querySelectorAll('.wizard-step').forEach(s => s.classList.remove('active')); document.querySelectorAll('.step-circle').forEach(i => i.classList.remove('active')); const stepEl = document.getElementById(`step-${step}`); if(stepEl) stepEl.classList.add('active'); for (let i = 1; i <= totalSteps; i++) { const ind = document.getElementById(`step-ind-${i}`); if(!ind) continue; if (i < step) { ind.classList.add('completed'); ind.innerHTML = '✔'; } else { ind.classList.remove('completed'); ind.innerHTML = i; if (i === step) ind.classList.add('active'); else ind.classList.remove('active'); } } if (prevBtn) prevBtn.style.display = step === 1 ? 'none' : 'inline-block'; if (nextBtn && finishBtn) { if (step === totalSteps) { nextBtn.style.display = 'none'; finishBtn.style.display = 'block'; } else { nextBtn.style.display = 'block'; finishBtn.style.display = 'none'; } } } 
    let currentStep = 1; const totalSteps = 4; const prevBtn = document.getElementById('btn-prev-step'); const nextBtn = document.getElementById('btn-next-step'); const finishBtn = document.getElementById('btn-finish-step'); 
    if(nextBtn) nextBtn.onclick = () => { if (currentStep === 1) { if (!document.getElementById('dealer_id').value || !document.getElementById('name').value) { window.showToast("Заполните ID и Название", "error"); return; } if (refreshAddMap) refreshAddMap(); } if (currentStep < totalSteps) { currentStep++; showStep(currentStep); } }; if(prevBtn) prevBtn.onclick = () => { if (currentStep > 1) { currentStep--; showStep(currentStep); } };
    
    if(addForm) addForm.addEventListener('submit', async (e) => { e.preventDefault(); if (isSaving) return; isSaving = true; const btn = document.getElementById('btn-finish-step'); const oldText = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>'; 
        const data = { dealer_id: getVal('dealer_id'), name: getVal('name'), organizations: collectOrgs(document.getElementById('add-org-list')), price_type: getVal('price_type'), city: getVal('city'), address: getVal('address'), delivery: getVal('delivery'), website: getVal('website'), instagram: getVal('instagram'), latitude: getVal('add_latitude'), longitude: getVal('add_longitude'), bonuses: getVal('bonuses'), status: getVal('status'), responsible: document.getElementById('responsible').value, region_sector: document.getElementById('add_region_sector').value, contract: { isSigned: document.getElementById('add_contract_signed').checked, date: getVal('add_contract_date') }, contacts: collectData(addContactList, '.contact-entry', [{key:'name',class:'.contact-name'},{key:'position',class:'.contact-position'},{key:'contactInfo',class:'.contact-info'}]), additional_addresses: collectData(addAddressList, '.address-entry', [{key:'description',class:'.address-description'},{key:'city',class:'.address-city'},{key:'address',class:'.address-address'}]), pos_materials: collectData(addPosList, '.pos-entry', [{key:'name',class:'.pos-name'},{key:'quantity',class:'.pos-quantity'}]), visits: collectData(addVisitsList, '.visit-entry', [{key:'date',class:'.visit-date'},{key:'comment',class:'.visit-comment'}]), photos: addPhotosData, avatarUrl: newAvatarBase64, competitors: collectData(addCompetitorList, '.competitor-entry', [{key:'brand',class:'.competitor-brand'},{key:'collection',class:'.competitor-collection'},{key:'price_opt',class:'.competitor-price-opt'},{key:'price_retail',class:'.competitor-price-retail'}]) }; 
        try { const res = await fetch(API_DEALERS_URL, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data)}); if (!res.ok) throw new Error(await res.text()); const newD = await res.json(); const pIds = getSelectedProductIds('add-product-checklist'); if(pIds.length) await saveProducts(newD.id, pIds); addModal.hide(); window.showToast("Дилер добавлен!"); initApp(); } catch (e) { window.showToast("Ошибка сохранения", "error"); } finally { isSaving = false; btn.disabled = false; btn.innerHTML = oldText; } });
    
    if(editForm) editForm.addEventListener('submit', async (e) => { e.preventDefault(); if (isSaving) return; isSaving = true; const btn = document.querySelector('button[form="edit-dealer-form"]'); const oldText = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>'; const id = document.getElementById('edit_db_id').value; let avatarToSend = getVal('edit-current-avatar-url'); if (newAvatarBase64) avatarToSend = newAvatarBase64; 
        const data = { 
            dealer_id: getVal('edit_dealer_id'), name: getVal('edit_name'), organizations: collectOrgs(document.getElementById('edit-org-list')), price_type: getVal('edit_price_type'), city: getVal('edit_city'), address: getVal('edit_address'), delivery: getVal('edit_delivery'), website: getVal('edit_website'), instagram: getVal('edit_instagram'), latitude: getVal('edit_latitude'), longitude: getVal('edit_longitude'), bonuses: getVal('edit_bonuses'), status: getVal('edit_status'), responsible: document.getElementById('edit_responsible').value, region_sector: document.getElementById('edit_region_sector').value, 
            hasPersonalPlan: document.getElementById('edit_has_personal_plan').checked,
            contract: { isSigned: document.getElementById('edit_contract_signed').checked, date: getVal('edit_contract_date') }, avatarUrl: avatarToSend, contacts: collectData(editContactList, '.contact-entry', [{key:'name',class:'.contact-name'},{key:'position',class:'.contact-position'},{key:'contactInfo',class:'.contact-info'}]), additional_addresses: collectData(editAddressList, '.address-entry', [{key:'description',class:'.address-description'},{key:'city',class:'.address-city'},{key:'address',class:'.address-address'}]), pos_materials: collectData(editPosList, '.pos-entry', [{key:'name',class:'.pos-name'},{key:'quantity',class:'.pos-quantity'}]), visits: collectData(editVisitsList, '.visit-entry', [{key:'date',class:'.visit-date'},{key:'comment',class:'.visit-comment'},{key:'isCompleted',class:'.visit-completed'}]), photos: editPhotosData, competitors: collectData(editCompetitorList, '.competitor-entry', [{key:'brand',class:'.competitor-brand'},{key:'collection',class:'.competitor-collection'},{key:'price_opt',class:'.competitor-price-opt'},{key:'price_retail',class:'.competitor-price-retail'}]) 
        }; 
        try { await fetch(`${API_DEALERS_URL}/${id}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data)}); await saveProducts(id, getSelectedProductIds('edit-product-checklist')); editModal.hide(); window.showToast("Изменения сохранены!"); initApp(); } catch (e) { window.showToast("Ошибка сохранения", "error"); } finally { isSaving = false; if(btn) { btn.disabled = false; btn.innerHTML = oldText; } } });
    if(qvForm) qvForm.addEventListener('submit', async (e) => { e.preventDefault(); if (isSaving) return; isSaving = true; const id = document.getElementById('qv_dealer_id').value; const comment = document.getElementById('qv_comment').value; const btn = qvForm.querySelector('button'); if(!id || !comment) { isSaving = false; return; } try { btn.disabled = true; const getRes = await fetch(`${API_DEALERS_URL}/${id}`); const dealer = await getRes.json(); const newVisit = { date: new Date().toISOString().slice(0,10), comment: comment, isCompleted: true }; const visits = [...(dealer.visits || []), newVisit]; await fetch(`${API_DEALERS_URL}/${id}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ visits }) }); qvModal.hide(); alert("Визит добавлен!"); } catch(e) { alert("Ошибка"); } finally { isSaving = false; btn.disabled = false; } });

    initApp();
});
