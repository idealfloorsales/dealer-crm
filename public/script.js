document.addEventListener('DOMContentLoaded', () => {
    
    // --- 1. АВТОРИЗАЦИЯ ---
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

    // --- 2. КОНСТАНТЫ И ПЕРЕМЕННЫЕ ---
    const API_DEALERS_URL = '/api/dealers';
    const API_PRODUCTS_URL = '/api/products'; 
    const API_COMPETITORS_REF_URL = '/api/competitors-ref';
    const API_STATUSES_URL = '/api/statuses';
    const API_TASKS_URL = '/api/tasks';
    const API_SALES_URL = '/api/sales';
    const API_SECTORS_URL = '/api/sectors'; // <--- НОВЫЙ API

    let fullProductCatalog = [];
    let competitorsRef = []; 
    let allDealers = [];
    let statusList = []; 
    let allTasksData = [];
    let currentMonthSales = [];
    let allSectors = []; // <--- ХРАНИЛИЩЕ СЕКТОРОВ
    
    let currentSort = { column: 'name', direction: 'asc' };
    let isSaving = false; 
    let addPhotosData = []; 
    let editPhotosData = []; 
    let newAvatarBase64 = null; 
    let currentUserRole = 'guest';

    // Для секторов
    const sectorModalEl = document.getElementById('sector-manager-modal');
    const sectorModal = sectorModalEl ? new bootstrap.Modal(sectorModalEl) : null;
    let currentSectorTypeMode = ''; // 'astana' или 'region'

    // Настройки дашборда
    const defaultDashConfig = { showKpi: true, showTop: true, showCoverage: true, showTasks: true };
    let dashConfig = JSON.parse(localStorage.getItem('dash_config')) || defaultDashConfig;

    // Список POS-материалов
    const posMaterialsList = ["С600 - 600мм задняя стенка", "С800 - 800мм задняя стенка", "РФ-2 - Расческа из фанеры", "РФС-1 - Расческа из фанеры СТАРАЯ", "Н600 - 600мм наклейка", "Н800 - 800мм наклейка", "Табличка - Табличка орг.стекло"];

    // --- 3. ЭЛЕМЕНТЫ DOM ---
    const addModalEl = document.getElementById('add-modal'); const addModal = new bootstrap.Modal(addModalEl, { backdrop: 'static', keyboard: false }); const addForm = document.getElementById('add-dealer-form');
    const editModalEl = document.getElementById('edit-modal'); const editModal = new bootstrap.Modal(editModalEl, { backdrop: 'static', keyboard: false }); const editForm = document.getElementById('edit-dealer-form');
    const qvModalEl = document.getElementById('quick-visit-modal'); const qvModal = new bootstrap.Modal(qvModalEl, { backdrop: 'static', keyboard: false }); const qvForm = document.getElementById('quick-visit-form');
    
    // Status Manager
    const statusModalEl = document.getElementById('status-manager-modal'); const statusModal = statusModalEl ? new bootstrap.Modal(statusModalEl) : null; const btnManageStatuses = document.getElementById('btn-manage-statuses'); const statusForm = document.getElementById('status-form'); const statusListContainer = document.getElementById('status-manager-list');
    
    // Settings Elements
    const btnDashSettings = document.getElementById('btn-dash-settings');
    const settingsModalElement = document.getElementById('dashboard-settings-modal');
    const settingsModal = settingsModalElement ? new bootstrap.Modal(settingsModalElement) : null;
    
    // Export Settings Elements
    const exportModalElement = document.getElementById('export-settings-modal');
    const exportModal = exportModalElement ? new bootstrap.Modal(exportModalElement) : null;

    const openAddModalBtn = document.getElementById('open-add-modal-btn');
    const brandsDatalist = document.getElementById('brands-datalist');
    const posDatalist = document.getElementById('pos-materials-datalist');
    const dealerGrid = document.getElementById('dealer-grid'); 
    const dashboardStats = document.getElementById('dashboard-stats');
    
    const addProductChecklist = document.getElementById('add-product-checklist'); const addContactList = document.getElementById('add-contact-list'); const addAddressList = document.getElementById('add-address-list'); const addPosList = document.getElementById('add-pos-list'); const addVisitsList = document.getElementById('add-visits-list'); const addCompetitorList = document.getElementById('add-competitor-list'); const addPhotoInput = document.getElementById('add-photo-input'); const addPhotoPreviewContainer = document.getElementById('add-photo-preview-container'); const addAvatarInput = document.getElementById('add-avatar-input'); const addAvatarPreview = document.getElementById('add-avatar-preview');
    const editProductChecklist = document.getElementById('edit-product-checklist'); const editContactList = document.getElementById('edit-contact-list'); const editAddressList = document.getElementById('edit-address-list'); const editPosList = document.getElementById('edit-pos-list'); const editVisitsList = document.getElementById('edit-visits-list'); const editCompetitorList = document.getElementById('edit-competitor-list'); const editPhotoInput = document.getElementById('edit-photo-input'); const editPhotoPreviewContainer = document.getElementById('edit-photo-preview-container'); const editAvatarInput = document.getElementById('edit-avatar-input'); const editAvatarPreview = document.getElementById('edit-avatar-preview'); const editCurrentAvatarUrl = document.getElementById('edit-current-avatar-url');
    
    const filterCity = document.getElementById('filter-city'); const filterPriceType = document.getElementById('filter-price-type'); const filterStatus = document.getElementById('filter-status'); const filterResponsible = document.getElementById('filter-responsible'); const searchBar = document.getElementById('search-bar'); 
    const btnExportDealers = document.getElementById('export-dealers-btn'); const btnExportCompetitors = document.getElementById('export-competitors-prices-btn');
    const addOrgList = document.getElementById('add-org-list'); const editOrgList = document.getElementById('edit-org-list'); const btnAddOrgAdd = document.getElementById('btn-add-org-add'); const btnEditOrgAdd = document.getElementById('btn-edit-org-add');
    const logoutBtn = document.getElementById('logout-btn');

    let mapInstances = { add: null, edit: null };
    let markerInstances = { add: null, edit: null };
    let refreshAddMap = null; let refreshEditMap = null;

    // --- 4. EXPORT CONFIGURATION ---
    const exportColumnsConfig = [
        { id: 'id', label: 'ID дилера', isChecked: true, getValue: d => d.dealer_id },
        { id: 'name_org', label: 'Название и Организация', isChecked: true, getValue: d => {
            const orgs = (d.organizations || [d.organization]).filter(Boolean).join(', ');
            return orgs ? `${d.name} (${orgs})` : d.name;
        }},
        { id: 'city', label: 'Город', isChecked: true, getValue: d => d.city },
        { id: 'address', label: 'Адрес', isChecked: true, getValue: d => d.address },
        { id: 'status', label: 'Статус', isChecked: true, getValue: d => {
            const map = { 'potential': 'Потенциальный', 'active': 'Активный', 'standard': 'Стандарт', 'problem': 'Проблемный', 'archive': 'Архив' };
            const custom = statusList.find(s => s.value === d.status);
            return custom ? custom.label : (map[d.status] || d.status);
        }},
        { id: 'responsible', label: 'Ответственный', isChecked: true, getValue: d => {
            const map = { 'regional_astana': 'Региональный Астана', 'regional_regions': 'Региональный Регионы', 'office': 'Офис' };
            return map[d.responsible] || d.responsible;
        }},
        { id: 'sector', label: 'Сектор', isChecked: true, getValue: d => d.region_sector || '' }, // <--- ДОБАВЛЕНО В ЭКСПОРТ
        { id: 'price_type', label: 'Тип цен', isChecked: true, getValue: d => d.price_type },
        { id: 'contacts', label: 'Контакты (Телефон)', isChecked: true, getValue: d => {
            if (!d.contacts || !d.contacts.length) return '';
            return d.contacts.map(c => `${c.name || 'Без имени'} (${c.contactInfo || '-'})`).join('; ');
        }},
        { id: 'contract', label: 'Договор (Подписан/Нет)', isChecked: true, getValue: d => (d.contract && d.contract.isSigned) ? 'Подписан' : 'Нет' },
        { id: 'contract_date', label: 'Дата договора', isChecked: true, getValue: d => (d.contract && d.contract.date) ? d.contract.date : '' },
        { id: 'website_insta', label: 'Сайт / Инстаграм', isChecked: false, getValue: d => [d.website, d.instagram].filter(Boolean).join(' / ') },
        { id: 'bonuses', label: 'Бонусы / Заметки', isChecked: false, getValue: d => d.bonuses },
        { id: 'total_sales', label: 'Общие продажи (Тек. мес)', isChecked: true, getValue: d => {
            const sale = currentMonthSales.find(s => String(s.dealerId) === String(d.id));
            return sale ? sale.fact : '0';
        }},
        { id: 'last_visit', label: 'Последний визит', isChecked: true, getValue: d => {
            let visits = d.visits;
            if (!visits || !Array.isArray(visits) || visits.length === 0) {
                const taskData = allTasksData.find(t => String(t.id) === String(d.id));
                if (taskData && taskData.visits && Array.isArray(taskData.visits)) visits = taskData.visits;
            }
            if(!visits || !Array.isArray(visits) || visits.length === 0) return '-';
            const sorted = [...visits].sort((a,b) => new Date(b.date) - new Date(a.date));
            const lastDate = sorted[0].date;
            if(!lastDate) return '-';
            try { return lastDate.split('T')[0].split('-').reverse().join('.'); } catch(e) { return lastDate; }
        }}
    ];

    // --- 5. HELPERS ---
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
    
    // --- НОВЫЕ ФУНКЦИИ СЕКТОРОВ (SECTORS LOGIC) ---
    async function fetchSectors() {
        try {
            const res = await fetch(API_SECTORS_URL);
            if(res.ok) allSectors = await res.json();
        } catch(e) { console.error("Sector fetch error", e); }
    }

    // Универсальная функция переключения списка
    window.toggleSectorSelect = function(prefix, responsibleValue) {
        const wrapper = document.getElementById(`${prefix}_sector_wrapper`);
        const select = document.getElementById(`${prefix}_region_sector`);
        
        if (!wrapper || !select) return;

        let type = '';
        if (responsibleValue === 'regional_astana') type = 'astana';
        else if (responsibleValue === 'regional_regions') type = 'region';

        if (type) {
            wrapper.style.display = 'flex';
            // Фильтруем список
            const filtered = allSectors.filter(s => s.type === type);
            // Сохраняем текущее значение, если оно есть
            const currentVal = select.getAttribute('data-selected') || select.value;
            
            select.innerHTML = '<option value="">Выбрать...</option>' + 
                filtered.map(s => `<option value="${s.name}">${s.name}</option>`).join('');
            
            // Пытаемся восстановить выбор
            if (currentVal) select.value = currentVal;
        } else {
            wrapper.style.display = 'none';
            select.value = '';
        }
    };

    // Открытие менеджера из модалки
    window.openSectorManagerFromModal = (prefix) => {
        const responsibleSelect = document.getElementById(prefix === 'add' ? 'responsible' : 'edit_responsible');
        const val = responsibleSelect.value;
        
        if (val === 'regional_astana') currentSectorTypeMode = 'astana';
        else if (val === 'regional_regions') currentSectorTypeMode = 'region';
        else return alert("Сначала выберите ответственного!");

        document.getElementById('sec-man-type-label').textContent = (currentSectorTypeMode === 'astana' ? 'Астана' : 'Регионы');
        renderSectorManagerList();
        sectorModal.show();
    };

    function renderSectorManagerList() {
        const list = document.getElementById('sector-manager-list');
        const filtered = allSectors.filter(s => s.type === currentSectorTypeMode);
        
        if(filtered.length === 0) {
            list.innerHTML = '<div class="text-muted text-center small">Список пуст</div>';
            return;
        }

        list.innerHTML = filtered.map(s => `
            <div class="list-group-item d-flex justify-content-between align-items-center py-2 px-0">
                <span class="fw-bold">${s.name}</span>
                <button class="btn btn-sm btn-outline-danger border-0" onclick="deleteSector('${s.id}')">
                    <i class="bi bi-trash"></i>
                </button>
            </div>
        `).join('');
    }

    window.addNewSector = async () => {
        const input = document.getElementById('new-sector-name');
        const name = input.value.trim();
        if (!name) return;

        try {
            const res = await fetch(API_SECTORS_URL, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ name: name, type: currentSectorTypeMode })
            });
            if (res.ok) {
                input.value = '';
                await fetchSectors(); // Обновляем глобальный список
                renderSectorManagerList(); // Обновляем список в модалке
                
                // Обновляем селекты в открытых модалках
                if (document.getElementById('add-modal').classList.contains('show')) {
                    toggleSectorSelect('add', document.getElementById('responsible').value);
                }
                if (document.getElementById('edit-modal').classList.contains('show')) {
                    toggleSectorSelect('edit', document.getElementById('edit_responsible').value);
                }
            }
        } catch(e) { alert("Ошибка сохранения"); }
    };

    window.deleteSector = async (id) => {
        if(!confirm("Удалить сектор?")) return;
        try {
            await fetch(`${API_SECTORS_URL}/${id}`, { method: 'DELETE' });
            await fetchSectors();
            renderSectorManagerList();
             // Обновляем селекты
             if (document.getElementById('add-modal').classList.contains('show')) {
                toggleSectorSelect('add', document.getElementById('responsible').value);
            }
            if (document.getElementById('edit-modal').classList.contains('show')) {
                toggleSectorSelect('edit', document.getElementById('edit_responsible').value);
            }
        } catch(e) { alert("Ошибка удаления"); }
    };

    // --- DASHBOARD SETTINGS ---
    if(btnDashSettings) { btnDashSettings.onclick = () => { if(settingsModal) settingsModal.show(); }; }
    window.saveDashboardConfig = () => { if(settingsModal) settingsModal.hide(); renderDashboard(); };

    // --- NEW RENDER DASHBOARD (KPI, TOP-5, COVERAGE) ---
    function renderDashboard() {
        if (!dashboardStats) return; 
        if (!allDealers || allDealers.length === 0) { dashboardStats.innerHTML = ''; return; }

        // 1. KPI: План продаж
        let totalPlan = 0; let totalFact = 0;
        const dealerSalesMap = new Map();

        if (currentMonthSales) {
            currentMonthSales.forEach(s => {
                const p = parseFloat(s.plan) || 0;
                const f = parseFloat(s.fact) || 0;
                totalPlan += p;
                totalFact += f;
                if (f > 0) {
                    // Используем ID дилера или название если ID нет (для кастомных)
                    const key = s.dealerId || s.dealerName;
                    dealerSalesMap.set(key, { name: s.dealerName, value: f, id: s.dealerId });
                }
            });
        }
        
        const kpiPercent = totalPlan > 0 ? Math.round((totalFact / totalPlan) * 100) : 0;
        
        // Обновляем HTML KPI
        const kpiFactEl = document.getElementById('kpi-fact-val');
        const kpiPlanEl = document.getElementById('kpi-plan-val');
        const kpiBadge = document.getElementById('kpi-percent-badge');
        const kpiBar = document.getElementById('kpi-progress-bar');

        if(kpiFactEl) kpiFactEl.textContent = `${totalFact.toLocaleString('ru-RU')} м²`;
        if(kpiPlanEl) kpiPlanEl.textContent = `${totalPlan.toLocaleString('ru-RU')} м²`;
        if(kpiBadge) {
            kpiBadge.textContent = `${kpiPercent}%`;
            kpiBadge.className = `badge border fs-6 ${kpiPercent >= 100 ? 'bg-success text-white' : (kpiPercent >= 50 ? 'bg-warning text-dark' : 'bg-light text-dark')}`;
        }
        if(kpiBar) {
            kpiBar.style.width = `${Math.min(kpiPercent, 100)}%`;
            kpiBar.className = `progress-bar ${kpiPercent >= 100 ? 'bg-success' : (kpiPercent >= 50 ? 'bg-warning' : 'bg-danger')}`;
        }

        // 2. TOP-5 DEALERS
        const topListEl = document.getElementById('dash-top-dealers');
        if (topListEl) {
            const sortedSales = Array.from(dealerSalesMap.values()).sort((a,b) => b.value - a.value).slice(0, 5);
            if (sortedSales.length === 0) {
                topListEl.innerHTML = '<p class="text-center text-muted py-3 small">Нет продаж</p>';
            } else {
                topListEl.innerHTML = sortedSales.map((s, idx) => {
                    const icon = idx === 0 ? '🥇' : (idx === 1 ? '🥈' : (idx === 2 ? '🥉' : `${idx+1}.`));
                    return `
                    <div class="list-group-item px-0 py-2 border-0 d-flex justify-content-between align-items-center">
                        <div class="d-flex align-items-center gap-2 text-truncate">
                            <span class="fw-bold text-secondary" style="width:25px;">${icon}</span>
                            <span class="text-dark fw-medium text-truncate" style="max-width: 150px;" title="${s.name}">${s.name}</span>
                        </div>
                        <span class="badge bg-light text-dark border">${s.value.toFixed(0)}</span>
                    </div>`;
                }).join('');
            }
        }

        // 3. COVERAGE (Active Dealers Visited in 30 days)
        const activeDealers = allDealers.filter(d => d.status === 'active' || d.status === 'problem' || (d.status === 'standard' && (d.sales > 0 || dealerSalesMap.has(d.id))));
        const totalActive = activeDealers.length;
        
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        thirtyDaysAgo.setHours(0,0,0,0);

        let visitedCount = 0;
        activeDealers.forEach(d => {
            // Проверяем визиты из карточки
            let hasVisit = false;
            if (d.visits && Array.isArray(d.visits)) {
                const recentVisit = d.visits.find(v => {
                    const vDate = new Date(v.date);
                    return v.isCompleted && vDate >= thirtyDaysAgo;
                });
                if (recentVisit) hasVisit = true;
            }
            // Проверяем задачи (для надежности)
            if (!hasVisit) {
                const task = allTasksData.find(t => String(t.id) === String(d.id));
                if (task && task.visits) {
                    const recentTaskVisit = task.visits.find(v => v.isCompleted && new Date(v.date) >= thirtyDaysAgo);
                    if (recentTaskVisit) hasVisit = true;
                }
            }
            if (hasVisit) visitedCount++;
        });

        const covPercent = totalActive > 0 ? Math.round((visitedCount / totalActive) * 100) : 0;
        const circle = document.getElementById('coverage-circle');
        const textPct = document.getElementById('coverage-percent');
        const textInfo = document.getElementById('coverage-text');

        if(circle) circle.setAttribute('stroke-dasharray', `${covPercent}, 100`);
        if(textPct) textPct.textContent = `${covPercent}%`;
        if(textInfo) textInfo.textContent = `Посещено: ${visitedCount} из ${totalActive}`;

        // 4. TASKS (Старый код для задач)
        const today = new Date(); today.setHours(0,0,0,0); const coolingLimit = new Date(today.getTime() - (15 * 24 * 60 * 60 * 1000));
        const tasksUpcoming = [], tasksProblem = [], tasksCooling = [];
        allTasksData.forEach(d => { if (d.status === 'archive') return; const isPotential = d.status === 'potential'; let lastVisitDate = null; let hasFutureTasks = false; if (d.visits && Array.isArray(d.visits)) { d.visits.forEach((v, index) => { const vDate = new Date(v.date); if (!v.date) return; vDate.setHours(0,0,0,0); if (v.isCompleted && (!lastVisitDate || vDate > lastVisitDate)) lastVisitDate = vDate; if (!v.isCompleted) { const taskData = { dealerName: d.name, dealerId: d.id, date: vDate, comment: v.comment || "Без комментария", visitIndex: index }; if (vDate < today) tasksProblem.push({...taskData, type: 'overdue'}); else { tasksUpcoming.push({...taskData, isToday: vDate.getTime() === today.getTime()}); hasFutureTasks = true; } } }); } if (d.status === 'problem') { if (!tasksProblem.some(t => t.dealerId === d.id && t.type === 'overdue')) tasksProblem.push({ dealerName: d.name, dealerId: d.id, type: 'status', comment: 'Статус: Проблемный' }); } if (!hasFutureTasks && d.status !== 'problem' && !isPotential) { if (!lastVisitDate) tasksCooling.push({ dealerName: d.name, dealerId: d.id, days: 999 }); else if (lastVisitDate < coolingLimit) { const days = Math.floor((today - lastVisitDate) / (1000 * 60 * 60 * 24)); tasksCooling.push({ dealerName: d.name, dealerId: d.id, days: days }); } } });
        tasksUpcoming.sort((a, b) => a.date - b.date); tasksProblem.sort((a, b) => (a.date || 0) - (b.date || 0)); tasksCooling.sort((a, b) => b.days - a.days);
        renderTaskList(document.getElementById('tasks-list-upcoming'), tasksUpcoming, 'upcoming'); renderTaskList(document.getElementById('tasks-list-problem'), tasksProblem, 'problem'); renderTaskList(document.getElementById('tasks-list-cooling'), tasksCooling, 'cooling');
    }

    function renderTaskList(container, tasks, type) { if (!container) return; if (tasks.length === 0) { const msg = type === 'cooling' ? 'Все посещены недавно' : 'Задач нет'; container.innerHTML = `<div class="text-center py-4 text-muted"><i class="bi bi-check-circle display-6 d-block mb-2 text-success opacity-50"></i><small>${msg}</small></div>`; return; } container.innerHTML = tasks.map(t => { let badgeHtml = ''; let metaHtml = ''; if (type === 'upcoming') { const dateStr = t.date.toLocaleDateString('ru-RU', {day:'numeric', month:'short'}); badgeHtml = t.isToday ? `<span class="task-badge tb-today mt-1 d-inline-block">Сегодня</span>` : `<span class="task-badge tb-future mt-1 d-inline-block">${dateStr}</span>`; metaHtml = `<span class="text-muted small">${safeText(t.comment)}</span>`; } else if (type === 'problem') { if (t.type === 'overdue') { const dateStr = t.date.toLocaleDateString('ru-RU'); badgeHtml = `<span class="task-badge tb-overdue mt-1 d-inline-block">Просрок: ${dateStr}</span>`; metaHtml = `<span class="text-danger small fw-bold">${safeText(t.comment)}</span>`; } else { badgeHtml = `<span class="task-badge tb-overdue mt-1 d-inline-block">Проблема</span>`; metaHtml = `<span class="small text-muted">Внимание!</span>`; } } else if (type === 'cooling') { const daysStr = t.days === 999 ? 'Никогда' : `${t.days} дн.`; badgeHtml = `<span class="task-badge tb-cooling mt-1 d-inline-block">Без визитов: ${daysStr}</span>`; metaHtml = `<span class="text-muted small">Пора навестить</span>`; } const showCheckBtn = (type === 'upcoming' || (type === 'problem' && t.type === 'overdue')); const btnHtml = showCheckBtn ? `<button class="btn-task-check btn-complete-task" data-id="${t.dealerId}" data-index="${t.visitIndex}" title="Выполнить"><i class="bi bi-check-lg"></i></button>` : ''; return `<div class="task-item-modern align-items-start"><div class="task-content"><a href="dealer.html?id=${t.dealerId}" target="_blank" class="task-title text-truncate d-block" style="max-width: 200px;">${safeText(t.dealerName)}</a>${badgeHtml}<div class="mt-1">${metaHtml}</div></div><div class="mt-1">${btnHtml}</div></div>`; }).join(''); }

    // --- OTHER ---
    if(btnExportDealers) btnExportDealers.onclick = () => { if(!allDealers.length) return window.showToast("Нет данных", "error"); renderExportModal(); };

    function renderExportModal() {
        const list = document.getElementById('export-columns-list');
        if(!list) return;

        list.innerHTML = exportColumnsConfig.map((col, index) => `
            <div class="export-option-row" onclick="toggleExportCheckbox(${index})">
                <label class="form-check-label flex-grow-1 cursor-pointer" for="exp-col-${index}">
                    ${col.label}
                </label>
                <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" id="exp-col-${index}" ${col.isChecked ? 'checked' : ''} onclick="event.stopPropagation()">
                </div>
            </div>
        `).join('');

        if(exportModal) exportModal.show();
    }

    // Глобальная функция для клика по строке
    window.toggleExportCheckbox = (index) => {
        const cb = document.getElementById(`exp-col-${index}`);
        if(cb) cb.checked = !cb.checked;
    };

    window.generateAndDownloadCSV = () => {
        const selectedCols = [];
        exportColumnsConfig.forEach((col, index) => {
            const cb = document.getElementById(`exp-col-${index}`);
            if (cb && cb.checked) selectedCols.push(col);
        });

        if (selectedCols.length === 0) { alert("Выберите хотя бы одну колонку!"); return; }

        let csvContent = "\uFEFF"; 
        csvContent += selectedCols.map(c => cleanCsv(c.label)).join(";") + "\n";

        allDealers.forEach(dealer => {
            const row = selectedCols.map(col => {
                const val = col.getValue(dealer);
                return cleanCsv(val);
            });
            csvContent += row.join(";") + "\n";
        });

        downloadCsv(csvContent, `Base_Dealers_${new Date().toISOString().slice(0,10)}.csv`);
        if(exportModal) exportModal.hide();
    };

    if(btnExportCompetitors) btnExportCompetitors.onclick = () => { if(!allDealers.length) return window.showToast("Нет данных", "error"); let csv = "\uFEFFДилер;Город;Бренд;Коллекция;ОПТ;Розница\n"; let count = 0; allDealers.forEach(d => { if(d.competitors && d.competitors.length > 0) { d.competitors.forEach(c => { csv += `${cleanCsv(d.name)};${cleanCsv(d.city)};${cleanCsv(c.brand)};${cleanCsv(c.collection)};${cleanCsv(c.price_opt)};${cleanCsv(c.price_retail)}\n`; count++; }); } }); if(count === 0) return window.showToast("Нет данных о конкурентах", "warning"); downloadCsv(csv, `competitors_prices_${new Date().toISOString().slice(0,10)}.csv`); };

    // --- ОТКРЫТИЕ РЕДАКТИРОВАНИЯ (С УЧЕТОМ СЕКТОРА) ---
    async function openEditModal(id) {
        try {
            const res = await fetch(`${API_DEALERS_URL}/${id}`); if(!res.ok) throw new Error("Ошибка"); const d = await res.json();
            const titleEl = document.querySelector('#edit-modal .modal-title'); if(titleEl) titleEl.textContent = `Редактировать: ${d.name}`;
            document.getElementById('edit_db_id').value=d.id; document.getElementById('edit_dealer_id').value=d.dealer_id; document.getElementById('edit_name').value=d.name; document.getElementById('edit_price_type').value=d.price_type; document.getElementById('edit_city').value=d.city; document.getElementById('edit_address').value=d.address; document.getElementById('edit_delivery').value=d.delivery; document.getElementById('edit_website').value=d.website; document.getElementById('edit_instagram').value=d.instagram;
            if(document.getElementById('edit_latitude')) document.getElementById('edit_latitude').value=d.latitude||''; if(document.getElementById('edit_longitude')) document.getElementById('edit_longitude').value=d.longitude||'';
            document.getElementById('edit_bonuses').value=d.bonuses; populateStatusSelects(d.status); 
            
            // --- ЛОГИКА ОТКРЫТИЯ (СЕКТОР) ---
            if(document.getElementById('edit_responsible')) { 
                document.getElementById('edit_responsible').value = d.responsible || ''; 
                
                // 1. Ставим атрибут data-selected (чтобы функция toggle знала, что выбрать)
                const secSelect = document.getElementById('edit_region_sector');
                if(secSelect) secSelect.setAttribute('data-selected', d.region_sector || '');
                
                // 2. Запускаем функцию обновления списка (она наполнит select нужными опциями)
                toggleSectorSelect('edit', d.responsible); 
                
                // 3. На всякий случай дублируем явное присвоение
                if(secSelect) secSelect.value = d.region_sector || '';
            }

            if(d.contract) { document.getElementById('edit_contract_signed').checked = d.contract.isSigned || false; document.getElementById('edit_contract_date').value = d.contract.date || ''; } else { document.getElementById('edit_contract_signed').checked = false; document.getElementById('edit_contract_date').value = ''; }

            editOrgList.innerHTML = '';
            if (d.organizations && d.organizations.length > 0) { d.organizations.forEach(org => editOrgList.insertAdjacentHTML('beforeend', createOrgInputHTML(org))); } else { editOrgList.insertAdjacentHTML('beforeend', createOrgInputHTML('')); }

            const vipCheck = document.getElementById('edit_has_personal_plan');
            if(vipCheck) vipCheck.checked = d.hasPersonalPlan || false;

            if(editAvatarPreview) { editAvatarPreview.src = d.avatarUrl || ''; editAvatarPreview.style.display = d.avatarUrl ? 'block' : 'none'; }
            if(editCurrentAvatarUrl) editCurrentAvatarUrl.value = d.avatarUrl || ''; newAvatarBase64 = null;
            renderList(editContactList, d.contacts, createContactEntryHTML); renderList(editAddressList, d.additional_addresses, createAddressEntryHTML); renderList(editPosList, d.pos_materials, createPosEntryHTML); renderList(editVisitsList, d.visits, createVisitEntryHTML); renderList(editCompetitorList, d.competitors, createCompetitorEntryHTML);
            renderProductChecklist(editProductChecklist, (d.products||[]).map(p=>p.id)); editPhotosData = d.photos||[]; renderPhotoPreviews(editPhotoPreviewContainer, editPhotosData);
            const firstTabEl = document.querySelector('#editTabs button[data-bs-target="#tab-main"]'); if(firstTabEl) { const tab = new bootstrap.Tab(firstTabEl); tab.show(); } editModal.show();
        } catch(e){ window.showToast("Ошибка загрузки данных", "error"); console.error(e); }
    }
    // EXPOSE TO WINDOW
    window.openEditModal = openEditModal;

    window.showQuickVisit = (id) => { document.getElementById('qv_dealer_id').value = id; document.getElementById('qv_comment').value = ''; qvModal.show(); };

    async function fetchDealers() { const response = await fetch(API_DEALERS_URL); if (!response.ok) throw new Error("Не удалось загрузить список дилеров"); allDealers = await response.json(); }
    async function fetchTasks() { const response = await fetch(API_TASKS_URL); if(response.ok) allTasksData = await response.json(); else throw new Error("Ошибка задач"); }
    async function fetchCurrentMonthSales() { const month = new Date().toISOString().slice(0, 7); const r = await fetch(`${API_SALES_URL}?month=${month}`); if(r.ok) currentMonthSales = await r.json(); else throw new Error("Ошибка продаж"); }
    async function fetchStatuses() { const res = await fetch(API_STATUSES_URL); if(res.ok) { statusList = await res.json(); populateStatusSelects(); renderStatusManagerList(); } else throw new Error("Ошибка статусов"); }
    
    function populateStatusSelects(selectedStatus = null) { let filterHtml = '<option value="">Все статусы</option>'; statusList.forEach(s => { filterHtml += `<option value="${s.value}">${s.label}</option>`; }); if(filterStatus) filterStatus.innerHTML = filterHtml; const modalHtml = statusList.map(s => `<option value="${s.value}" ${selectedStatus === s.value ? 'selected' : ''}>${s.label}</option>`).join(''); const addStatusSel = document.getElementById('status'); if(addStatusSel) addStatusSel.innerHTML = modalHtml; const editStatusSel = document.getElementById('edit_status'); if(editStatusSel) editStatusSel.innerHTML = modalHtml; }
    function renderStatusManagerList() { if(!statusListContainer) return; statusListContainer.innerHTML = statusList.map(s => `<tr><td style="width: 50px;"><div style="width:20px;height:20px;background:${s.color};border-radius:50%;"></div></td><td class="fw-bold">${s.label}</td><td class="text-muted small">${s.value}</td><td class="text-center">${s.isVisible !== false ? '<i class="bi bi-eye-fill text-success"></i>' : '<i class="bi bi-eye-slash-fill text-muted"></i>'}</td><td class="text-end"><button class="btn btn-sm btn-light border me-1" onclick="editStatus('${s.id}')"><i class="bi bi-pencil"></i></button><button class="btn btn-sm btn-light border text-danger" onclick="deleteStatus('${s.id}')"><i class="bi bi-trash"></i></button></td></tr>`).join(''); }
    function resetStatusForm() { if(!statusForm) return; statusForm.reset(); document.getElementById('st_id').value = ''; document.getElementById('btn-save-status').textContent = 'Добавить'; document.getElementById('btn-save-status').className = 'btn btn-primary w-100'; document.getElementById('btn-cancel-edit-status').style.display = 'none'; document.getElementById('st_color').value = '#0d6efd'; }
    window.editStatus = (id) => { const s = statusList.find(i => i.id === id); if(!s) return; document.getElementById('st_id').value = s.id; document.getElementById('st_label').value = s.label; document.getElementById('st_color').value = s.color; document.getElementById('st_visible').checked = s.isVisible !== false; const btn = document.getElementById('btn-save-status'); btn.textContent = 'Сохранить'; btn.className = 'btn btn-success w-100'; document.getElementById('btn-cancel-edit-status').style.display = 'inline-block'; };
    window.deleteStatus = async (id) => { if(!confirm("Удалить этот статус?")) return; try { await fetch(`${API_STATUSES_URL}/${id}`, { method: 'DELETE' }); window.showToast("Удалено"); fetchStatuses(); } catch(e) { window.showToast("Ошибка", "error"); } };
    if(document.getElementById('btn-cancel-edit-status')) document.getElementById('btn-cancel-edit-status').onclick = resetStatusForm;
    if(statusForm) { statusForm.addEventListener('submit', async (e) => { e.preventDefault(); const id = document.getElementById('st_id').value; const label = document.getElementById('st_label').value; const color = document.getElementById('st_color').value; const isVisible = document.getElementById('st_visible').checked; const body = { label, color, isVisible }; let url = API_STATUSES_URL; let method = 'POST'; if(id) { url += `/${id}`; method = 'PUT'; } else { body.value = 'st_' + Math.random().toString(36).substr(2, 5); body.sortOrder = statusList.length + 10; } try { const res = await fetch(url, { method: method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body) }); if(res.ok) { window.showToast(id ? "Обновлено" : "Создано"); resetStatusForm(); fetchStatuses(); } else { throw new Error(); } } catch(e) { window.showToast("Ошибка сохранения", "error"); } }); }

    // --- STANDARD API ---
    async function fetchProductCatalog() { if (fullProductCatalog.length > 0) return; const response = await fetch(API_PRODUCTS_URL); if (!response.ok) throw new Error("Ошибка каталога"); fullProductCatalog = await response.json(); fullProductCatalog.sort((a, b) => a.sku.localeCompare(b.sku, 'ru', { numeric: true })); }
    function updateBrandsDatalist() { if (!brandsDatalist) return; let html = ''; competitorsRef.forEach(ref => { html += `<option value="${ref.name}">`; }); brandsDatalist.innerHTML = html; }
    function updatePosDatalist() { if (!posDatalist) return; let html = ''; posMaterialsList.forEach(s => { html += `<option value="${s}">`; }); posDatalist.innerHTML = html; }
    function populateFilters(dealers) { if(!filterCity || !filterPriceType) return; const cities = [...new Set(dealers.map(d => d.city).filter(Boolean))].sort(); const types = [...new Set(dealers.map(d => d.price_type).filter(Boolean))].sort(); const sc = filterCity.value; const st = filterPriceType.value; filterCity.innerHTML = '<option value="">Город</option>'; filterPriceType.innerHTML = '<option value="">Тип цен</option>'; cities.forEach(c => filterCity.add(new Option(c, c))); types.forEach(t => filterPriceType.add(new Option(t, t))); filterCity.value = sc; filterPriceType.value = st; }
    async function saveProducts(dealerId, ids) { await fetch(`${API_DEALERS_URL}/${dealerId}/products`, {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({productIds: ids})}); }
    async function completeTask(btn, dealerId, visitIndex) { try { btn.disabled = true; const res = await fetch(`${API_DEALERS_URL}/${dealerId}`); if(!res.ok) throw new Error(); const dealer = await res.json(); if (dealer.visits && dealer.visits[visitIndex]) { dealer.visits[visitIndex].isCompleted = true; } await fetch(`${API_DEALERS_URL}/${dealerId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visits: dealer.visits }) }); initApp(); window.showToast("Задача выполнена!"); } catch (e) { window.showToast("Ошибка", "error"); btn.disabled = false; btn.innerHTML = '<i class="bi bi-check-lg"></i>'; } }

    function renderDealerList() {
        if (!dealerGrid) return;
        const city = filterCity ? filterCity.value : ''; const type = filterPriceType ? filterPriceType.value : ''; const status = filterStatus ? filterStatus.value : ''; const responsible = filterResponsible ? filterResponsible.value : ''; const search = searchBar ? searchBar.value.toLowerCase() : '';
        
        const filtered = allDealers.filter(d => { 
            let isVisible = true;
            if (!status) { const statusObj = statusList.find(s => s.value === (d.status || 'standard')); if (statusObj && statusObj.isVisible === false) isVisible = false; } else { isVisible = (d.status === status); }
            return isVisible && (!city || d.city === city) && (!type || d.price_type === type) && (!responsible || d.responsible === responsible) && (!search || ((d.name||'').toLowerCase().includes(search) || (d.dealer_id||'').toLowerCase().includes(search)));
        });
        filtered.sort((a, b) => { let valA = (a[currentSort.column] || '').toString(); let valB = (b[currentSort.column] || '').toString(); let res = currentSort.column === 'dealer_id' ? valA.localeCompare(valB, undefined, {numeric:true}) : valA.toLowerCase().localeCompare(valB.toLowerCase(), 'ru'); return currentSort.direction === 'asc' ? res : -res; });
        
        if (filtered.length === 0) { dealerGrid.innerHTML = ` <div class="empty-state"><i class="bi bi-search empty-state-icon"></i><h5 class="text-muted">Ничего не найдено</h5><p class="text-secondary small mb-3">Попробуйте изменить фильтры</p><button class="btn btn-sm btn-outline-secondary" onclick="document.getElementById('search-bar').value=''; document.getElementById('filter-city').value=''; document.getElementById('filter-status').value=''; renderDealerList()">Сбросить фильтры</button></div>`; return; }
        
        const salesMap = {};
        if(currentMonthSales && currentMonthSales.length > 0) {
            currentMonthSales.forEach(s => { if(s.dealerId) salesMap[s.dealerId] = (salesMap[s.dealerId] || 0) + (s.fact || 0); });
        }

        dealerGrid.innerHTML = filtered.map((d, index) => {
            const statusObj = statusList.find(s => s.value === (d.status || 'standard')) || { label: d.status, color: '#6c757d' };
            const statusStyle = `background-color: ${statusObj.color}; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: 500;`;
            
            let phoneBtn = ''; let waBtn = ''; 
            if (d.contacts && d.contacts.length > 0) { 
                const phone = d.contacts.find(c => c.contactInfo)?.contactInfo || ''; 
                const cleanPhone = phone.replace(/[^0-9]/g, ''); 
                if (cleanPhone.length >= 10) { 
                    phoneBtn = `<a href="tel:+${cleanPhone}" class="btn-circle btn-circle-call" onclick="event.stopPropagation()" title="Позвонить"><i class="bi bi-telephone-fill"></i></a>`; 
                    waBtn = `<a href="https://wa.me/${cleanPhone}" target="_blank" class="btn-circle btn-circle-wa" onclick="event.stopPropagation()" title="WhatsApp"><i class="bi bi-whatsapp"></i></a>`; 
                } 
            }
            
            let mapBtn = ''; 
            if (d.latitude && d.longitude) mapBtn = `<a href="https://yandex.kz/maps/?pt=${d.longitude},${d.latitude}&z=17&l=map" target="_blank" class="btn-circle" onclick="event.stopPropagation()" title="Маршрут"><i class="bi bi-geo-alt-fill"></i></a>`;
            
            let instaBtn = ''; 
            if (d.instagram) { 
                let url = d.instagram.trim(); 
                if (!url.startsWith('http')) { url = url.startsWith('@') ? 'https://instagram.com/' + url.substring(1) : 'https://instagram.com/' + url; } 
                instaBtn = `<a href="${url}" target="_blank" class="btn-circle btn-circle-insta" onclick="event.stopPropagation()" title="Instagram"><i class="bi bi-instagram"></i></a>`; 
            }
            
            const avatarHtml = d.photo_url ? `<img src="${d.photo_url}" alt="${d.name}">` : `<i class="bi bi-shop"></i>`;
            const editBtn = (currentUserRole !== 'guest') ? `<button class="btn-circle" onclick="event.stopPropagation(); openEditModal('${d.id}')" title="Редактировать"><i class="bi bi-pencil"></i></button>` : '';
            
            const salesFact = salesMap[d.id] || 0;
            let salesColorClass = 'bg-danger'; if (salesFact >= 200) salesColorClass = 'bg-success'; else if (salesFact >= 100) salesColorClass = 'bg-warning text-dark'; 
            const salesBadge = `<span class="badge ${salesColorClass} rounded-pill ms-2" title="Продажи за текущий месяц">${salesFact.toFixed(2)} м²</span>`;

            return `<div class="dealer-item" onclick="window.open('dealer.html?id=${d.id}', '_blank')">
                <div class="dealer-index-number">${index + 1}</div>
                <div class="dealer-avatar-box">${avatarHtml}</div>
                <div class="dealer-content">
                    <div class="d-flex align-items-center gap-2 mb-1">
                        <a href="dealer.html?id=${d.id}" class="dealer-name" target="_blank">${safeText(d.name)}</a>
                        <span style="${statusStyle}">${statusObj.label}</span>
                    </div>
                    <div class="dealer-meta">
                        <span><i class="bi bi-hash"></i>${safeText(d.dealer_id)}</span>
                        <span><i class="bi bi-geo-alt"></i>${safeText(d.city)}</span>
                        ${d.price_type ? `<span><i class="bi bi-tag"></i>${safeText(d.price_type)}</span>` : ''}
                        ${salesBadge}
                    </div>
                </div>
                <div class="dealer-actions">${instaBtn} ${waBtn} ${phoneBtn} ${mapBtn} ${editBtn}</div>
            </div>`;
        }).join('');
    }

    if(addModalEl) { addModalEl.addEventListener('shown.bs.modal', () => { if (refreshAddMap) refreshAddMap(); }); }
    if(editModalEl) { const tabMapBtn = document.querySelector('button[data-bs-target="#tab-map"]'); if(tabMapBtn) { tabMapBtn.addEventListener('shown.bs.tab', () => { if (refreshEditMap) refreshEditMap(); }); } }
    if(openAddModalBtn) openAddModalBtn.onclick = () => { if(addForm) addForm.reset(); populateStatusSelects(); renderProductChecklist(addProductChecklist); renderList(addContactList, [], createContactEntryHTML); renderList(addAddressList, [], createAddressEntryHTML); renderList(addPosList, [], createPosEntryHTML); renderList(addVisitsList, [], createVisitEntryHTML); renderList(addCompetitorList, [], createCompetitorEntryHTML); if(document.getElementById('add_latitude')) { document.getElementById('add_latitude').value = ''; document.getElementById('add_longitude').value = ''; } addPhotosData = []; renderPhotoPreviews(addPhotoPreviewContainer, []); if(addAvatarPreview) { addAvatarPreview.src = ''; addAvatarPreview.style.display='none'; } newAvatarBase64 = null; 
        document.getElementById('add-org-list').innerHTML = ''; addOrgList.insertAdjacentHTML('beforeend', createOrgInputHTML());
        document.getElementById('add_contract_signed').checked = false; document.getElementById('add_contract_date').value = '';
        toggleSectorSelect('add', '');
        addModal.show(); 
    };
    let currentStep = 1; const totalSteps = 4; const prevBtn = document.getElementById('btn-prev-step'); const nextBtn = document.getElementById('btn-next-step'); const finishBtn = document.getElementById('btn-finish-step'); function showStep(step) { document.querySelectorAll('.wizard-step').forEach(s => s.classList.remove('active')); document.querySelectorAll('.step-circle').forEach(i => i.classList.remove('active')); const stepEl = document.getElementById(`step-${step}`); if(stepEl) stepEl.classList.add('active'); for (let i = 1; i <= totalSteps; i++) { const ind = document.getElementById(`step-ind-${i}`); if(!ind) continue; if (i < step) { ind.classList.add('completed'); ind.innerHTML = '✔'; } else { ind.classList.remove('completed'); ind.innerHTML = i; if (i === step) ind.classList.add('active'); else ind.classList.remove('active'); } } if (prevBtn) prevBtn.style.display = step === 1 ? 'none' : 'inline-block'; if (nextBtn && finishBtn) { if (step === totalSteps) { nextBtn.style.display = 'none'; finishBtn.style.display = 'inline-block'; } else { nextBtn.style.display = 'inline-block'; finishBtn.style.display = 'none'; } } } if(nextBtn) nextBtn.onclick = () => { if (currentStep === 1) { if (!document.getElementById('dealer_id').value || !document.getElementById('name').value) { window.showToast("Заполните ID и Название", "error"); return; } if (refreshAddMap) refreshAddMap(); } if (currentStep < totalSteps) { currentStep++; showStep(currentStep); } }; if(prevBtn) prevBtn.onclick = () => { if (currentStep > 1) { currentStep--; showStep(currentStep); } };
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

    // --- EVENT LISTENERS ---
    if(filterCity) filterCity.onchange = renderDealerList; 
    if(filterPriceType) filterPriceType.onchange = renderDealerList; 
    if(filterStatus) filterStatus.onchange = renderDealerList; 
    if(filterResponsible) filterResponsible.onchange = renderDealerList; 
    if(searchBar) searchBar.oninput = renderDealerList;

    initApp();
});
