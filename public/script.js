document.addEventListener('DOMContentLoaded', () => {
    
// --- 1. АВТОРИЗАЦИЯ ---
    // Общая авторизация и права находятся в permissions.js.
    // Важно: 403 означает "нет права", а не "токен просрочен".

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
    let salesHistory = [];
    let reclamationsData = [];
    let allSectors = []; // <--- ХРАНИЛИЩЕ СЕКТОРОВ
    
    let currentSort = { column: 'dealer_id', direction: 'asc' };
    let dealerQuickFilter = 'all';
    let dealerRouteIds = [];
    try {
        const savedRoute = JSON.parse(localStorage.getItem('dealer_route_v1') || '[]');
        dealerRouteIds = Array.isArray(savedRoute) ? savedRoute.map(String).filter(Boolean) : [];
    } catch (e) {
        dealerRouteIds = [];
    }
    const dealerAvatarCache = new Map();
    let dealerAvatarObserver = null;
    let isSaving = false; 
    let addPhotosData = []; 
    let editPhotosData = []; 
    let newAvatarBase64 = null; 
    let currentUserRole = 'guest';
    let addCloneMeta = null;
    let duplicateQueryHandled = false;
    let dealerPriceLists = [];

    function fillDealerPriceListSelect(selectId, selectedId = '') {
        const select = document.getElementById(selectId);
        if (!select) return;
        const wanted = String(selectedId || select.value || '');
        select.innerHTML = '';
        select.add(new Option('Не назначен', ''));
        dealerPriceLists
            .filter(item => item.active !== false)
            .sort((a,b) => String(a.name || '').localeCompare(String(b.name || ''), 'ru'))
            .forEach(item => {
                const label = [item.name, item.versionDate ? 'от ' + item.versionDate.split('-').reverse().join('.') : ''].filter(Boolean).join(' · ');
                select.add(new Option(label, item.id));
            });
        if ([...select.options].some(option => option.value === wanted)) select.value = wanted;
    }

    async function fetchDealerPriceLists(selectedAdd = '', selectedEdit = '') {
        const response = await fetch('/api/pricing/price-lists', { crmTrackLoading:false });
        if (!response.ok) throw new Error('Не удалось загрузить прайсы');
        const data = await response.json();
        dealerPriceLists = Array.isArray(data) ? data : [];
        fillDealerPriceListSelect('price_list', selectedAdd);
        fillDealerPriceListSelect('edit_price_list', selectedEdit);
        return dealerPriceLists;
    }

    // Для секторов
    const sectorModalEl = document.getElementById('sector-manager-modal');
    const sectorModal = sectorModalEl ? new bootstrap.Modal(sectorModalEl) : null;
    let currentSectorTypeMode = ''; // 'astana' или 'region'

    // Настройки дашборда
    const defaultDashConfig = { showPulse: true, showAttention: true, showPlan: true, showActivity: true };
    let dashConfig = { ...defaultDashConfig, ...(JSON.parse(localStorage.getItem('dash_config') || '{}')) };

    // Список POS-материалов
    const posMaterialsList = ["С600 - 600мм задняя стенка", "С800 - 800мм задняя стенка", "РФ-2 - Расческа из фанеры", "РФС-1 - Расческа из фанеры СТАРАЯ", "Н600 - 600мм наклейка", "Н800 - 800мм наклейка", "Табличка - Табличка орг.стекло"];

    // --- 3. ЭЛЕМЕНТЫ DOM ---
    const addModalEl = document.getElementById('add-modal'); const addModal = new bootstrap.Modal(addModalEl, { backdrop: 'static', keyboard: false }); const addForm = document.getElementById('add-dealer-form');
    const editModalEl = document.getElementById('edit-modal'); const editModal = new bootstrap.Modal(editModalEl, { backdrop: 'static', keyboard: false }); const editForm = document.getElementById('edit-dealer-form');
    const qvModalEl = document.getElementById('quick-visit-modal'); const qvModal = new bootstrap.Modal(qvModalEl, { backdrop: 'static', keyboard: false }); const qvForm = document.getElementById('quick-visit-form');
    const dealerRouteBar = document.getElementById('dealer-route-bar');
    const dealerRouteModalEl = document.getElementById('dealer-route-modal');
    const dealerRouteModal = dealerRouteModalEl ? new bootstrap.Modal(dealerRouteModalEl) : null;
    const dealerRouteList = document.getElementById('dealer-route-list');
    const dealerRouteReview = document.getElementById('dealer-route-review');
    const dealerRouteClear = document.getElementById('dealer-route-clear');
    const dealerRouteClearModal = document.getElementById('dealer-route-clear-modal');
    const dealerRouteOpen = document.getElementById('dealer-route-open');
    
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
    const dealerVisibleCount = document.getElementById('dealer-visible-count');
    const dealerSortSelect = document.getElementById('dealer-sort-select');
    const dealerResetFilters = document.getElementById('dealer-reset-filters');
    const dealerQuickFilters = document.getElementById('dealer-quick-filters');
    const dealerFilterToggle = document.getElementById('dealer-filter-toggle');
    const filterHealth = document.getElementById('filter-health');
    const btnExportDealers = document.getElementById('export-dealers-btn'); const btnExportCompetitors = document.getElementById('export-competitors-prices-btn');
    const addLegalEntityList = document.getElementById('add-legal-entity-list');
    const editLegalEntityList = document.getElementById('edit-legal-entity-list');
    const btnAddLegalEntityAdd = document.getElementById('btn-add-legal-entity-add');
    const btnAddLegalEntityEdit = document.getElementById('btn-add-legal-entity-edit');
    const logoutBtn = document.getElementById('logout-btn');

    let mapInstances = { add: null, edit: null };
    let markerInstances = { add: null, edit: null };
    let refreshAddMap = null; let refreshEditMap = null;

    // --- 4. EXPORT CONFIGURATION ---
    let activeExportType = 'dealers';
    let excelJsLoadPromise = null;

    function exportLegalValues(dealer, field) {
        return getDealerLegalEntities(dealer)
            .map(entity => String(entity?.[field] || '').trim())
            .filter(Boolean)
            .filter((value,index,array) => array.indexOf(value) === index)
            .join('; ');
    }

    function exportContactValues(dealer) {
        return (Array.isArray(dealer.contacts) ? dealer.contacts : [])
            .map(contact => {
                const parts = [contact?.name, contact?.position].filter(Boolean).join(' · ');
                const phone = String(contact?.contactInfo || '').trim();
                return [parts,phone].filter(Boolean).join(' — ');
            })
            .filter(Boolean)
            .join('; ');
    }

    function exportLastVisit(dealer) {
        let visits = Array.isArray(dealer.visits) ? dealer.visits : [];
        if (!visits.length) {
            const taskData = allTasksData.find(item => String(item.id) === String(dealer.id));
            visits = Array.isArray(taskData?.visits) ? taskData.visits : [];
        }
        const valid = visits
            .filter(visit => visit?.date && visit.isCompleted !== false)
            .sort((a,b) => new Date(b.date) - new Date(a.date));
        return valid[0]?.date ? String(valid[0].date).slice(0,10) : '';
    }

    function exportMoneyValue(value) {
        const raw = String(value ?? '').trim();
        if (!raw) return '';
        const normalized = raw.replace(/\s/g,'').replace(',','.').replace(/[^0-9.-]/g,'');
        const num = Number(normalized);
        return Number.isFinite(num) ? num : raw;
    }

    function exportPriceNumber(value) {
        const converted = exportMoneyValue(value);
        return typeof converted === 'number' ? converted : null;
    }

    function exportStatusLabel(dealer) {
        const custom = statusList.find(status => status.value === dealer.status);
        if (custom) return custom.label || custom.value;
        const map = {potential:'Потенциальный',active:'Активный',standard:'Стандарт',problem:'Проблемный',archive:'Архив'};
        return map[dealer.status] || dealer.status || '';
    }

    const dealerExportColumns = [
        {id:'dealer_id',group:'Основное',label:'ID дилера',width:14,checked:true,getValue:d=>d.dealer_id||''},
        {id:'name',group:'Основное',label:'Дилер',width:30,checked:true,getValue:d=>d.name||''},
        {id:'legal_names',group:'Юр. данные',label:'Юридические лица',width:32,checked:false,getValue:d=>exportLegalValues(d,'organizationName')},
        {id:'bin',group:'Юр. данные',label:'БИН / ИИН',width:18,checked:false,getValue:d=>exportLegalValues(d,'bin')},
        {id:'city',group:'Основное',label:'Город',width:18,checked:true,getValue:d=>normalizeDisplayValue(d.city)},
        {id:'address',group:'Основное',label:'Фактический адрес',width:34,checked:true,getValue:d=>d.address||''},
        {id:'status',group:'Работа',label:'Статус дилера',width:18,checked:true,getValue:d=>exportStatusLabel(d)},
        {id:'responsible',group:'Работа',label:'Зона ответственности',width:20,checked:true,getValue:d=>responsibleLabel(d.responsible)},
        {id:'sector',group:'Работа',label:'Сектор',width:20,checked:true,getValue:d=>d.region_sector||''},
        {id:'price_type',group:'Коммерция',label:'Прайс',width:22,checked:true,getValue:d=>d.price_list?.name || d.price_type || ''},
        {id:'contacts',group:'Контакты',label:'Контакты',width:42,checked:true,getValue:d=>exportContactValues(d)},
        {id:'website',group:'Контакты',label:'Сайт',width:28,checked:false,getValue:d=>d.website||''},
        {id:'instagram',group:'Контакты',label:'Instagram',width:24,checked:false,getValue:d=>d.instagram||''},
        {id:'contract_number',group:'Договор',label:'№ договора',width:15,checked:false,getValue:d=>d.dealer_id||''},
        {id:'contract_signed',group:'Договор',label:'Договор подписан',width:18,checked:false,getValue:d=>d.contract?.isSigned?'Да':'Нет'},
        {id:'contract_date',group:'Договор',label:'Дата договора',width:16,checked:false,getValue:d=>d.contract?.date||''},
        {id:'sales_month',group:'Коммерция',label:'Продажи за месяц, м²',width:20,checked:true,getValue:d=>Number(getDealerListMetrics(d).fact||0)},
        {id:'plan_month',group:'Коммерция',label:'План на месяц, м²',width:19,checked:false,getValue:d=>Number(getDealerListMetrics(d).plan||0)},
        {id:'plan_percent',group:'Коммерция',label:'Выполнение плана, %',width:20,checked:true,getValue:d=>getDealerListMetrics(d).achievement ?? ''},
        {id:'health_score',group:'Контроль',label:'Оценка дилера, %',width:18,checked:false,getValue:d=>Number(getDealerListMetrics(d).health?.score||0)},
        {id:'last_visit',group:'Контроль',label:'Последний визит',width:17,checked:true,getValue:d=>exportLastVisit(d)},
        {id:'delivery',group:'Работа',label:'Условия доставки',width:30,checked:false,getValue:d=>d.delivery||''},
        {id:'notes',group:'Работа',label:'Заметки / особые условия',width:40,checked:false,getValue:d=>d.bonuses||''},
        {id:'latitude',group:'Локация',label:'Широта',width:15,checked:false,getValue:d=>d.latitude??''},
        {id:'longitude',group:'Локация',label:'Долгота',width:15,checked:false,getValue:d=>d.longitude??''}
    ];

    const competitorPriceExportColumns = [
        {id:'dealer_id',group:'Дилер',label:'ID дилера',width:14,checked:true,getValue:r=>r.dealer.dealer_id||''},
        {id:'dealer',group:'Дилер',label:'Дилер',width:28,checked:true,getValue:r=>r.dealer.name||''},
        {id:'city',group:'Дилер',label:'Город',width:18,checked:true,getValue:r=>normalizeDisplayValue(r.dealer.city)},
        {id:'status',group:'Дилер',label:'Статус дилера',width:18,checked:false,getValue:r=>exportStatusLabel(r.dealer)},
        {id:'responsible',group:'Дилер',label:'Зона ответственности',width:20,checked:false,getValue:r=>responsibleLabel(r.dealer.responsible)},
        {id:'sector',group:'Дилер',label:'Сектор',width:20,checked:false,getValue:r=>r.dealer.region_sector||''},
        {id:'brand',group:'Конкурент',label:'Бренд конкурента',width:24,checked:true,getValue:r=>r.competitor.brand||''},
        {id:'collection',group:'Конкурент',label:'Коллекция',width:28,checked:true,getValue:r=>r.competitor.collection||''},
        {id:'price_opt',group:'Цена',label:'Оптовая цена',width:17,checked:true,getValue:r=>exportMoneyValue(r.competitor.price_opt)},
        {id:'price_retail',group:'Цена',label:'Розничная цена',width:17,checked:true,getValue:r=>exportMoneyValue(r.competitor.price_retail)},
        {id:'difference',group:'Аналитика',label:'Разница розница − опт',width:21,checked:false,getValue:r=>{
            const opt=exportPriceNumber(r.competitor.price_opt),retail=exportPriceNumber(r.competitor.price_retail);
            return opt!==null&&retail!==null?retail-opt:'';
        }},
        {id:'markup',group:'Аналитика',label:'Наценка, %',width:15,checked:false,getValue:r=>{
            const opt=exportPriceNumber(r.competitor.price_opt),retail=exportPriceNumber(r.competitor.price_retail);
            return opt!==null&&retail!==null&&opt!==0?Math.round(((retail-opt)/opt)*10000)/100:'';
        }}
    ];

    const exportPresets = {
        dealers: [
            {id:'work',label:'Рабочая база',icon:'briefcase',columns:['dealer_id','name','city','address','status','responsible','sector','price_type','contacts','sales_month','plan_percent','last_visit']},
            {id:'contacts',label:'Контакты и договоры',icon:'person-lines-fill',columns:['dealer_id','name','legal_names','bin','city','address','contacts','website','instagram','contract_number','contract_signed','contract_date']},
            {id:'commercial',label:'Коммерческий контроль',icon:'graph-up-arrow',columns:['dealer_id','name','city','status','responsible','sector','price_type','sales_month','plan_month','plan_percent','health_score','last_visit']},
            {id:'all',label:'Все поля',icon:'grid-3x3-gap',columns:'all'}
        ],
        prices: [
            {id:'monitoring',label:'Мониторинг цен',icon:'tags',columns:['dealer_id','dealer','city','brand','collection','price_opt','price_retail']},
            {id:'analysis',label:'Для анализа',icon:'bar-chart',columns:['dealer_id','dealer','city','status','responsible','sector','brand','collection','price_opt','price_retail','difference','markup']},
            {id:'all',label:'Все поля',icon:'grid-3x3-gap',columns:'all'}
        ]
    };

    function getExportColumns() {
        return activeExportType === 'prices' ? competitorPriceExportColumns : dealerExportColumns;
    }

    // --- 5. HELPERS ---

    const getVal = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };
    const safeText = (text) => (text || '').toString().replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const safeAttr = (text) => (text || '').toString().replace(/"/g, '&quot;');
    const compactActivityText = (text, max = 72) => {
        const value = String(text || '').replace(/\s+/g, ' ').trim();
        if (value.length <= max) return value;
        return value.slice(0, Math.max(1, max - 1)).trimEnd() + '…';
    };

    function normalizeDisplayValue(value) {
        let text = String(value || '').trim().replace(/\s+/g, ' ');
        if (!text) return '';

        const chunks = text.split(/\s*(?:,|;|\||\/)\s*/).filter(Boolean);
        if (chunks.length > 1) {
            const unique = [];
            const seen = new Set();
            chunks.forEach(chunk => {
                const key = chunk.toLocaleLowerCase('ru-RU');
                if (!seen.has(key)) {
                    seen.add(key);
                    unique.push(chunk);
                }
            });
            text = unique.join(' · ');
        }

        const words = text.split(' ').filter(Boolean);
        if (words.length >= 2 && words.length % 2 === 0) {
            const half = words.length / 2;
            const left = words.slice(0, half).join(' ');
            const right = words.slice(half).join(' ');
            if (left.toLocaleLowerCase('ru-RU') === right.toLocaleLowerCase('ru-RU')) text = left;
        }

        return text;
    }
    const compressImage = (file, maxWidth = 1000, quality = 0.7) => new Promise((resolve, reject) => { const reader = new FileReader(); reader.readAsDataURL(file); reader.onload = event => { const img = new Image(); img.src = event.target.result; img.onload = () => { const elem = document.createElement('canvas'); let width = img.width; let height = img.height; if (width > maxWidth) { height *= maxWidth / width; width = maxWidth; } elem.width = width; elem.height = height; const ctx = elem.getContext('2d'); ctx.drawImage(img, 0, 0, width, height); resolve(elem.toDataURL('image/jpeg', quality)); }; img.onerror = error => reject(error); }; reader.onerror = error => reject(error); });
    function createContactEntryHTML(c={}) { return `<div class="contact-entry"><input type="text" class="form-control contact-name" placeholder="Имя" value="${c.name||''}"><input type="text" class="form-control contact-position" placeholder="Должность" value="${c.position||''}"><input type="text" class="form-control contact-info" placeholder="Телефон" value="${c.contactInfo||''}"><button type="button" class="btn-remove-entry" onclick="this.closest('.contact-entry').remove()"><i class="bi bi-x-lg"></i></button></div>`; }
    function createAddressEntryHTML(a={}) { return `<div class="address-entry"><input type="text" class="form-control address-description" placeholder="Описание" value="${a.description||''}"><input type="text" class="form-control address-city" placeholder="Город" value="${a.city||''}"><input type="text" class="form-control address-address" placeholder="Адрес" value="${a.address||''}"><button type="button" class="btn-remove-entry" onclick="this.closest('.address-entry').remove()"><i class="bi bi-x-lg"></i></button></div>`; }
    function createVisitEntryHTML(v={}) { 
    const isCompleted = v.isCompleted ? 'true' : 'false';
    return `<div class="visit-entry">
        <input type="hidden" class="visit-completed" value="${isCompleted}">
        <input type="date" class="form-control visit-date" value="${v.date||''}">
        <input type="text" class="form-control visit-comment w-50" placeholder="Результат..." value="${v.comment||''}">
        <button type="button" class="btn-remove-entry" onclick="this.closest('.visit-entry').remove()"><i class="bi bi-x-lg"></i></button>
    </div>`; 
}
    function renderPhotoPreviews(container, photosArray) { if(container) container.innerHTML = photosArray.map((p, index) => `<div class="photo-preview-item"><img src="${p.photo_url}"><button type="button" class="btn-remove-photo" data-index="${index}"><i class="bi bi-x"></i></button></div>`).join(''); }
    function createPosEntryHTML(p={}) { return `<div class="pos-entry"><input type="text" class="form-control pos-name" list="pos-materials-datalist" placeholder="Название стенда" value="${safeAttr(p.name||'')}" autocomplete="off"><input type="number" class="form-control pos-quantity" value="${p.quantity||1}" min="1" placeholder="Шт"><button type="button" class="btn-remove-entry" onclick="this.closest('.pos-entry').remove()" title="Удалить"><i class="bi bi-x-lg"></i></button></div>`; }
    function createCompetitorEntryHTML(c={}) {
        let brandOpts = '<option value="">Выберите бренд</option>';
        competitorsRef.forEach(ref => {
            const sel = ref.name === c.brand ? 'selected' : '';
            brandOpts += `<option value="${safeAttr(ref.name)}" ${sel}>${safeText(ref.name)}</option>`;
        });

        let collOpts = '<option value="">Выберите коллекцию</option>';
        if (c.brand) {
            const ref = competitorsRef.find(r => r.name === c.brand);
            if (ref && ref.collections) {
                const sortedCols = [...ref.collections].sort((a, b) => {
                    const typeA = (typeof a === 'object') ? a.type : 'std';
                    const typeB = (typeof b === 'object') ? b.type : 'std';
                    if (typeA === 'std' && typeB !== 'std') return 1;
                    if (typeA !== 'std' && typeB === 'std') return -1;
                    return 0;
                });
                sortedCols.forEach(col => {
                    const colName = (typeof col === 'string') ? col : col.name;
                    const colType = (typeof col === 'object') ? col.type : 'std';
                    let label = '';
                    if(String(colType).includes('eng')) label = ' · Ёлка';
                    else if(String(colType).includes('french')) label = ' · Фр. ёлка';
                    else if(String(colType).includes('art')) label = ' · Арт';
                    const sel = colName === c.collection ? 'selected' : '';
                    collOpts += `<option value="${safeAttr(colName)}" ${sel}>${safeText(colName)}${label}</option>`;
                });
            }
        }

        return `
            <div class="competitor-entry dealer-competitor-entry">
                <label class="dealer-competitor-field is-brand">
                    <span>Бренд</span>
                    <select class="form-select competitor-brand" onchange="updateCollections(this)">${brandOpts}</select>
                </label>
                <label class="dealer-competitor-field is-collection">
                    <span>Коллекция</span>
                    <select class="form-select competitor-collection">${collOpts}</select>
                </label>
                <label class="dealer-competitor-field is-price">
                    <span>ОПТ</span>
                    <input type="text" inputmode="decimal" class="form-control competitor-price-opt" placeholder="Цена" value="${safeAttr(c.price_opt||'')}">
                </label>
                <label class="dealer-competitor-field is-price">
                    <span>Розница</span>
                    <input type="text" inputmode="decimal" class="form-control competitor-price-retail" placeholder="Цена" value="${safeAttr(c.price_retail||'')}">
                </label>
                <button type="button" class="btn-remove-entry" onclick="this.closest('.competitor-entry').remove()" title="Удалить конкурента"><i class="bi bi-trash3"></i></button>
            </div>`;
    }
    function inferLegalEntityType(type, name='') {
        const explicit = String(type || '').trim();
        if (explicit) return explicit;
        const value = String(name || '').trim();
        if (/^ИП\b/i.test(value)) return 'ИП';
        if (/^(ЧС|ФЛ|Физ|частн)/i.test(value)) return 'Частное лицо';
        return 'ТОО';
    }

    function getDealerLegalEntities(d={}) {
        return Array.isArray(d.legal_entities) ? d.legal_entities.filter(Boolean) : [];
    }

    function createLegalEntityHTML(entity={}) {
        const type = inferLegalEntityType(entity.type, entity.organizationName);
        const options = [
            ['ТОО','ТОО'],
            ['ИП','ИП'],
            ['Частное лицо','Частное лицо / ЧС']
        ].map(([value,label]) => `<option value="${value}" ${value === type ? 'selected' : ''}>${label}</option>`).join('');
        return `
            <div class="legal-entity-entry">
                <div class="legal-entity-entry-head">
                    <div>
                        <strong>Организация для документов</strong>
                        <small>У каждого юрлица свои банковские и юридические реквизиты</small>
                    </div>
                    <button type="button" class="btn-remove-entry" onclick="this.closest('.legal-entity-entry').remove()" title="Удалить"><i class="bi bi-x-lg"></i></button>
                </div>
                <div class="legal-entity-grid">
                    <label><span>Тип</span><select class="form-select legal-entity-type">${options}</select></label>
                    <label class="span-2"><span>Наименование / ФИО</span><input type="text" class="form-control legal-entity-name" value="${safeAttr(entity.organizationName || '')}" placeholder="ТОО «Компания», ИП «...», ФИО"></label>
                    <label class="span-2"><span>Директор / руководитель</span><input type="text" class="form-control legal-entity-director" value="${safeAttr(entity.director || '')}" placeholder="ФИО"></label>
                    <label class="span-3"><span>Юридический адрес</span><input type="text" class="form-control legal-entity-address" value="${safeAttr(entity.legalAddress || '')}"></label>
                    <label><span>БИН / ИИН</span><input type="text" class="form-control legal-entity-bin" value="${safeAttr(entity.bin || '')}"></label>
                    <label class="span-2"><span>ИИК</span><input type="text" class="form-control legal-entity-iik" value="${safeAttr(entity.iik || '')}"></label>
                    <label class="span-2"><span>Банк</span><input type="text" class="form-control legal-entity-bank" value="${safeAttr(entity.bank || '')}"></label>
                    <label><span>БИК</span><input type="text" class="form-control legal-entity-bik" value="${safeAttr(entity.bik || '')}"></label>
                    <label><span>КБе</span><input type="text" class="form-control legal-entity-kbe" value="${safeAttr(entity.kbe || '')}"></label>
                    <label class="span-2"><span>E-mail</span><input type="email" class="form-control legal-entity-email" value="${safeAttr(entity.email || '')}"></label>
                </div>
            </div>`;
    }

    function collectLegalEntities(container) {
        if (!container) return [];
        return Array.from(container.querySelectorAll('.legal-entity-entry')).map(entry => ({
            type: entry.querySelector('.legal-entity-type')?.value || 'ТОО',
            organizationName: entry.querySelector('.legal-entity-name')?.value.trim() || '',
            director: entry.querySelector('.legal-entity-director')?.value.trim() || '',
            legalAddress: entry.querySelector('.legal-entity-address')?.value.trim() || '',
            bin: entry.querySelector('.legal-entity-bin')?.value.trim() || '',
            iik: entry.querySelector('.legal-entity-iik')?.value.trim() || '',
            bank: entry.querySelector('.legal-entity-bank')?.value.trim() || '',
            bik: entry.querySelector('.legal-entity-bik')?.value.trim() || '',
            kbe: entry.querySelector('.legal-entity-kbe')?.value.trim() || '',
            email: entry.querySelector('.legal-entity-email')?.value.trim() || ''
        })).filter(entity => entity.organizationName || entity.bin || entity.iik);
    }
    window.updateCollections = function(select) { const brandName = select.value; const row = select.closest('.competitor-entry'); const collSelect = row.querySelector('.competitor-collection'); let html = `<option value="">-- Коллекция --</option>`; const ref = competitorsRef.find(r => r.name === brandName); if (ref && ref.collections) { const sortedCols = [...ref.collections].sort((a, b) => { const typeA = (typeof a === 'object') ? a.type : 'std'; const typeB = (typeof b === 'object') ? b.type : 'std'; if (typeA === 'std' && typeB !== 'std') return 1; if (typeA !== 'std' && typeB === 'std') return -1; return 0; }); html += sortedCols.map(col => { const colName = (typeof col === 'string') ? col : col.name; const colType = (typeof col === 'object') ? col.type : 'std'; let label = ''; if(colType.includes('eng')) label = ' (Елка)'; else if(colType.includes('french')) label = ' (Фр. Елка)'; else if(colType.includes('art')) label = ' (Арт)'; return `<option value="${colName}">${colName}${label}</option>`; }).join(''); } collSelect.innerHTML = html; };
    window.showToast = window.showToast || function(message, type = 'success') { let container = document.getElementById('toast-container-custom'); if (!container) { container = document.createElement('div'); container.id = 'toast-container-custom'; container.className = 'toast-container-custom'; document.body.appendChild(container); } const toast = document.createElement('div'); toast.className = `toast-modern toast-${type}`; toast.textContent = message; container.appendChild(toast); setTimeout(() => toast.remove(), 3000); };
    
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
        else return alert("Сначала выберите ответственного: Астана или Регионы");

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

    // Полевой селектор выставленности: поиск + быстрые режимы + крупные строки для телефона.
    function renderProductChecklist(container, selectedIds=[]) { 
        if(!container) return; 
        const selected = new Set((selectedIds || []).map(String));
        const canEditMatrix = window.CRMAuth && CRMAuth.can('can_edit_matrix');
        const filteredCatalog = fullProductCatalog
            .filter(p => !posMaterialsList.includes(p.name))
            .sort((a,b) => {
                const aSelected = selected.has(String(a.id));
                const bSelected = selected.has(String(b.id));
                if (aSelected !== bSelected) return aSelected ? -1 : 1;
                const aLiquid = a.is_liquid !== false;
                const bLiquid = b.is_liquid !== false;
                if (aLiquid !== bLiquid) return aLiquid ? -1 : 1;
                return String(a.sku || '').localeCompare(String(b.sku || ''), 'ru', { numeric:true });
            });

        const defaultMode = selected.size ? 'selected' : 'liquid';
        const itemsHtml = filteredCatalog.map(p => {
            const id = String(p.id);
            const isSelected = selected.has(id);
            const isLiquid = p.is_liquid !== false;
            const chars = [
                p.characteristics?.class ? `${safeText(p.characteristics.class)} кл` : '',
                p.characteristics?.thickness ? `${safeText(p.characteristics.thickness)} мм` : ''
            ].filter(Boolean).join(' · ');
            const searchBlob = [
                p.sku, p.name, p.characteristics?.class, p.characteristics?.thickness,
                p.characteristics?.size, p.characteristics?.bevel
            ].filter(Boolean).join(' ').toLowerCase();

            return `
                <label class="dealer-field-product-item ${isSelected ? 'is-selected' : ''}" 
                       data-product-search="${safeAttr(searchBlob)}"
                       data-selected="${isSelected ? '1' : '0'}"
                       data-liquid="${isLiquid ? '1' : '0'}"
                       for="prod-${container.id}-${safeAttr(id)}">
                    <input type="checkbox" id="prod-${container.id}-${safeAttr(id)}" value="${safeAttr(id)}"
                           ${isSelected ? 'checked' : ''} ${canEditMatrix ? '' : 'disabled'}>
                    <span class="dealer-field-product-check"><i class="bi bi-check-lg"></i></span>
                    <span class="dealer-field-product-copy">
                        <span><strong>${safeText(p.sku || '—')}</strong><b>${safeText(p.name || 'Без названия')}</b></span>
                        <small>${chars || 'Характеристики не указаны'}${!isLiquid ? ' · Неликвид' : ''}</small>
                    </span>
                    ${!isLiquid ? '<em>Неликвид</em>' : ''}
                </label>`;
        }).join('');

        container.innerHTML = `
            <div class="dealer-field-product-controls">
                <div class="dealer-field-product-search">
                    <i class="bi bi-search"></i>
                    <input type="search" class="form-control" placeholder="Артикул или название…" autocomplete="off">
                    <button type="button" class="dealer-field-product-clear" title="Очистить"><i class="bi bi-x-lg"></i></button>
                </div>
                <div class="dealer-field-product-filterbar">
                    <button type="button" data-product-view="selected" class="${defaultMode === 'selected' ? 'active' : ''}">Выбрано <span data-selected-count>${selected.size}</span></button>
                    <button type="button" data-product-view="liquid" class="${defaultMode === 'liquid' ? 'active' : ''}">Ликвид</button>
                    <button type="button" data-product-view="all">Все</button>
                    <button type="button" data-product-view="illiquid">Неликвид</button>
                </div>
            </div>
            <div class="dealer-field-product-items" data-current-view="${defaultMode}">
                ${itemsHtml || '<div class="dealer-field-product-empty">Каталог пуст</div>'}
            </div>
            <div class="dealer-field-product-footer">
                <span><strong data-visible-product-count>0</strong> позиций видно</span>
                <span><strong data-total-selected-count>${selected.size}</strong> отмечено у дилера</span>
            </div>`;

        const searchInput = container.querySelector('.dealer-field-product-search input');
        const clearBtn = container.querySelector('.dealer-field-product-clear');
        const itemsHost = container.querySelector('.dealer-field-product-items');
        const viewButtons = [...container.querySelectorAll('[data-product-view]')];

        function refreshProductPicker() {
            const query = String(searchInput?.value || '').trim().toLowerCase();
            const view = itemsHost?.dataset.currentView || 'all';
            let visible = 0;
            let selectedCount = 0;

            container.querySelectorAll('.dealer-field-product-item').forEach(item => {
                const checkbox = item.querySelector('input[type="checkbox"]');
                const checked = Boolean(checkbox?.checked);
                item.dataset.selected = checked ? '1' : '0';
                item.classList.toggle('is-selected', checked);
                if (checked) selectedCount++;

                const matchSearch = !query || String(item.dataset.productSearch || '').includes(query);
                const matchView =
                    view === 'all' ||
                    (view === 'selected' && checked) ||
                    (view === 'liquid' && item.dataset.liquid === '1') ||
                    (view === 'illiquid' && item.dataset.liquid === '0');

                const show = matchSearch && matchView;
                item.hidden = !show;
                if (show) visible++;
            });

            container.querySelectorAll('[data-selected-count],[data-total-selected-count]').forEach(el => el.textContent = String(selectedCount));
            const visibleEl = container.querySelector('[data-visible-product-count]');
            if (visibleEl) visibleEl.textContent = String(visible);
            if (clearBtn) clearBtn.hidden = !query;
        }

        viewButtons.forEach(button => button.addEventListener('click', () => {
            if (!itemsHost) return;
            itemsHost.dataset.currentView = button.dataset.productView || 'all';
            viewButtons.forEach(item => item.classList.toggle('active', item === button));
            refreshProductPicker();
        }));
        searchInput?.addEventListener('input', refreshProductPicker);
        clearBtn?.addEventListener('click', () => {
            if (!searchInput) return;
            searchInput.value = '';
            refreshProductPicker();
            searchInput.focus();
        });
        container.querySelectorAll('.dealer-field-product-item input[type="checkbox"]').forEach(cb => {
            cb.addEventListener('change', refreshProductPicker);
        });

        refreshProductPicker();
    }

    function getSelectedProductIds(containerId) { const el=document.getElementById(containerId); if(!el) return []; return Array.from(el.querySelectorAll('input:checked')).map(cb=>cb.value); }
    function collectData(container, selector, fields) { if (!container) return []; const data = []; container.querySelectorAll(selector).forEach(entry => { const item = {}; let hasData = false; fields.forEach(f => { const inp = entry.querySelector(f.class); if(inp){item[f.key]=inp.value; if(item[f.key]) hasData=true;} }); if(hasData) data.push(item); }); return data; }
    function renderList(container, data, htmlGen) { if(container) container.innerHTML = (data && data.length > 0) ? data.map(htmlGen).join('') : htmlGen(); }

    // --- SETUP BUTTONS ---
    const setupListBtn = (id, list, genFunc) => {
        const btn = document.getElementById(id);
        if(!btn || !list) return;
        btn.onclick = () => {
            list.insertAdjacentHTML('beforeend', genFunc());
            const entry = list.lastElementChild;
            if (!entry) return;
            if (window.innerWidth <= 767) {
                setTimeout(() => {
                    entry.scrollIntoView({ behavior:'smooth', block:'center' });
                    entry.querySelector('select, input, textarea')?.focus({ preventScroll:true });
                }, 60);
            }
        };
    };
    setupListBtn('add-contact-btn-add-modal', addContactList, createContactEntryHTML); setupListBtn('add-address-btn-add-modal', addAddressList, createAddressEntryHTML); setupListBtn('add-pos-btn-add-modal', addPosList, createPosEntryHTML); setupListBtn('add-visits-btn-add-modal', addVisitsList, createVisitEntryHTML); setupListBtn('add-competitor-btn-add-modal', addCompetitorList, createCompetitorEntryHTML);
    setupListBtn('add-contact-btn-edit-modal', editContactList, createContactEntryHTML); setupListBtn('add-address-btn-edit-modal', editAddressList, createAddressEntryHTML); setupListBtn('add-pos-btn-edit-modal', editPosList, createPosEntryHTML); setupListBtn('add-visits-btn-edit-modal', editVisitsList, createVisitEntryHTML); setupListBtn('add-competitor-btn-edit-modal', editCompetitorList, createCompetitorEntryHTML);

    if(btnAddLegalEntityAdd) btnAddLegalEntityAdd.onclick = () => addLegalEntityList?.insertAdjacentHTML('beforeend', createLegalEntityHTML());
    if(btnAddLegalEntityEdit) btnAddLegalEntityEdit.onclick = () => editLegalEntityList?.insertAdjacentHTML('beforeend', createLegalEntityHTML());

    if(addAvatarInput) addAvatarInput.addEventListener('change', async (e) => { const file = e.target.files[0]; if (file) { newAvatarBase64 = await compressImage(file, 800, 0.8); addAvatarPreview.src = newAvatarBase64; addAvatarPreview.style.display='block'; } });
    if(editAvatarInput) editAvatarInput.addEventListener('change', async (e) => { const file = e.target.files[0]; if (file) { newAvatarBase64 = await compressImage(file, 800, 0.8); editAvatarPreview.src = newAvatarBase64; editAvatarPreview.style.display='block'; } });
    if(addPhotoInput) addPhotoInput.addEventListener('change', async (e) => { for (let file of e.target.files) addPhotosData.push({ photo_url: await compressImage(file, 1000, 0.7) }); renderPhotoPreviews(addPhotoPreviewContainer, addPhotosData); addPhotoInput.value = ''; });
    if(addPhotoPreviewContainer) addPhotoPreviewContainer.addEventListener('click', (e) => { const btn = e.target.closest('.btn-remove-photo'); if(btn) { addPhotosData.splice(btn.dataset.index, 1); renderPhotoPreviews(addPhotoPreviewContainer, addPhotosData); } });
    if(editPhotoInput) editPhotoInput.addEventListener('change', async (e) => { for (let file of e.target.files) editPhotosData.push({ photo_url: await compressImage(file, 1000, 0.7) }); renderPhotoPreviews(editPhotoPreviewContainer, editPhotosData); editPhotoInput.value = ''; });
    if(editPhotoPreviewContainer) editPhotoPreviewContainer.addEventListener('click', (e) => { const btn = e.target.closest('.btn-remove-photo'); if(btn) { editPhotosData.splice(btn.dataset.index, 1); renderPhotoPreviews(editPhotoPreviewContainer, editPhotosData); } });

    if (logoutBtn) { 
        logoutBtn.onclick = () => { 
            localStorage.removeItem('crm_token');
            localStorage.removeItem('crm_user');
            window.location.href = '/login.html'; 
        }; 
    }
    
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

    // --- MAIN LOGIC ---
    async function initApp() {
        try {
            console.log("Starting app init...");

            // 1. Auth / permissions.
            try {
                if (window.CRMAuth && CRMAuth.ready) await CRMAuth.ready;
                const user = window.CRMAuth ? CRMAuth.user : null;
                currentUserRole = user ? user.role : 'guest';

                if (openAddModalBtn && !CRMAuth.can('can_create_dealer')) openAddModalBtn.style.display = 'none';
                if (btnManageStatuses && !CRMAuth.can('can_edit_dealer')) btnManageStatuses.style.display = 'none';
                if (btnExportDealers && !CRMAuth.can('can_export_base')) btnExportDealers.style.display = 'none';
                if (btnExportCompetitors && !CRMAuth.can('can_export_prices')) btnExportCompetitors.style.display = 'none';

                const dashboardContainer = document.getElementById('dashboard-container');
                if (dashboardContainer && !CRMAuth.can('can_view_dashboard') && !CRMAuth.can('can_view_sales')) {
                    dashboardContainer.style.display = 'none';
                }
                if (btnDashSettings && !CRMAuth.can('can_view_dashboard')) btnDashSettings.style.display = 'none';
            } catch (e) {
                console.warn('Не удалось применить права пользователя', e);
            }

            const canDashboard = Boolean(window.CRMAuth && CRMAuth.can('can_view_dashboard'));
            const canSales = Boolean(window.CRMAuth && CRMAuth.can('can_view_sales'));

            // 2. Start everything needed for the first screen at the same time.
            // Dealers/statuses/sectors are required for the directory.
            // Tasks/current sales enrich it with visit and sales metrics.
            const statusesPromise = fetchStatuses(false).catch(e => {
                console.warn('Не удалось загрузить статусы', e);
                statusList = [];
            });
            const sectorsPromise = fetchSectors().catch(e => {
                console.warn('Не удалось загрузить сектора', e);
                allSectors = [];
            });
            const dealersPromise = fetchDealers();
            const tasksPromise = canDashboard
                ? fetchTasks().catch(e => { allTasksData = []; console.warn(e); })
                : Promise.resolve(allTasksData = []);
            const currentSalesPromise = canSales
                ? fetchCurrentMonthSales().catch(e => { currentMonthSales = []; console.warn(e); })
                : Promise.resolve(currentMonthSales = []);

            await Promise.all([
                statusesPromise,
                sectorsPromise,
                dealersPromise,
                tasksPromise,
                currentSalesPromise
            ]);

            updatePosDatalist();

            // 3. First meaningful paint: dashboard + dealer directory.
            populateFilters(allDealers);
            renderDashboard();
            setupGlobalSearch();
            renderDealerList();
            setupEventListeners();

            const duplicateFromUrl = new URLSearchParams(window.location.search).get('duplicate');
            if (!duplicateQueryHandled && duplicateFromUrl && window.CRMAuth && CRMAuth.can('can_create_dealer')) {
                duplicateQueryHandled = true;
                const cleanUrl = new URL(window.location.href);
                cleanUrl.searchParams.delete('duplicate');
                window.history.replaceState({},'',cleanUrl.pathname + cleanUrl.search + cleanUrl.hash);
                setTimeout(() => window.openDuplicateDealer?.(duplicateFromUrl),80);
            }

            // Legacy redirect-based dealer editing is no longer used.
            localStorage.removeItem('pendingEditDealerId');

            // 4. Non-critical data must never delay the first screen.
            const backgroundLoads = [];
            if (canSales) backgroundLoads.push(fetchSalesHistory());
            if (window.CRMAuth && CRMAuth.can('can_view_reclamations')) {
                backgroundLoads.push(fetchReclamationsForDashboard());
            }

            Promise.allSettled(backgroundLoads).then(() => {
                renderDashboard();
                renderDealerList();
            });

            // 5. Product/competitor dictionaries are only needed inside add/edit dialogs.
            // Prefetch them when the browser is idle, but don't block the home page.
            const prefetchAuxiliary = () => {
                const jobs = [];
                if (window.CRMAuth && CRMAuth.can('can_view_dealers')) jobs.push(fetchProductCatalog());
                if (window.CRMAuth && CRMAuth.can('can_view_competitors')) jobs.push(fetchCompetitorsRef());
                if (window.CRMAuth && CRMAuth.can('can_view_dealers')) jobs.push(fetchDealerPriceLists());
                Promise.allSettled(jobs);
            };
            if ('requestIdleCallback' in window) {
                window.requestIdleCallback(prefetchAuxiliary, { timeout: 4000 });
            } else {
                setTimeout(prefetchAuxiliary, 1800);
            }

        } catch (error) {
            console.error("CRITICAL ERROR:", error);
            if(dealerGrid) {
                dealerGrid.innerHTML = `
                <div class="alert alert-danger text-center m-5 shadow-sm p-4 rounded-4 border-0">
                    <h1 class="display-6 text-danger mb-3"><i class="bi bi-wifi-off"></i></h1>
                    <h4 class="fw-bold">Не удалось загрузить данные</h4>
                    <p class="mb-3">Сервер не отвечает или произошла ошибка обработки.</p>
                    <div class="p-2 bg-white rounded border d-inline-block text-start mb-3"><small class="text-danger font-monospace">${error.message}</small></div>
                    <div><button class="btn btn-outline-danger px-4 rounded-pill" onclick="window.location.reload()"><i class="bi bi-arrow-clockwise me-2"></i>Попробовать снова</button></div>
                </div>`;
            }
            if(dashboardStats) dashboardStats.innerHTML = '<p class="text-danger small text-center">Ошибка статистики</p>';
        }
    }
    
    // --- SAFE LISTENERS ---
    function setupEventListeners() {
        if(filterCity) filterCity.onchange = renderDealerList;
        if(filterPriceType) filterPriceType.onchange = renderDealerList;
        if(filterStatus) filterStatus.onchange = renderDealerList;
        if(filterResponsible) filterResponsible.onchange = renderDealerList;
        if(filterHealth) filterHealth.onchange = renderDealerList;
        const sectorFilter = document.getElementById('filter-sector');
        if(sectorFilter) sectorFilter.onchange = renderDealerList;
        if(searchBar) searchBar.oninput = renderDealerList;
        if(dealerSortSelect) dealerSortSelect.onchange = renderDealerList;

        qvForm?.querySelectorAll('input[name="qv_mode"]').forEach(input => {
            input.onchange = syncQuickVisitMode;
        });
        const qvPresets = document.getElementById('qv_presets');
        if (qvPresets) {
            qvPresets.onclick = (e) => {
                const btn = e.target.closest('[data-visit-preset]');
                if (!btn) return;
                const comment = document.getElementById('qv_comment');
                if (!comment) return;
                comment.value = btn.dataset.visitPreset || '';
                comment.focus();
            };
        }

        if (dealerRouteReview) dealerRouteReview.onclick = () => {
            renderDealerRouteModal();
            dealerRouteModal?.show();
        };
        if (dealerRouteClear) dealerRouteClear.onclick = clearDealerRouteSelection;
        if (dealerRouteClearModal) dealerRouteClearModal.onclick = clearDealerRouteSelection;
        if (dealerRouteOpen) dealerRouteOpen.onclick = openDealerRouteIn2Gis;

        if (dealerQuickFilters) {
            dealerQuickFilters.onclick = (e) => {
                const btn = e.target.closest('.dealer-quick-filter');
                if (!btn) return;
                dealerQuickFilter = btn.dataset.filter || 'all';
                dealerQuickFilters.querySelectorAll('.dealer-quick-filter').forEach(el => {
                    el.classList.toggle('active', el === btn);
                });
                renderDealerList();
            };
        }

        if (dealerFilterToggle) {
            dealerFilterToggle.onclick = () => {
                const toolbar = dealerFilterToggle.closest('.dealer-list-toolbar');
                toolbar?.classList.toggle('filters-open');
                dealerFilterToggle.classList.toggle('active');
            };
        }

        if (dealerResetFilters) {
            dealerResetFilters.onclick = () => {
                if (searchBar) searchBar.value = '';
                if (filterStatus) filterStatus.value = '';
                if (filterCity) filterCity.value = '';
                if (filterPriceType) filterPriceType.value = '';
                if (filterResponsible) filterResponsible.value = '';
                if (filterHealth) filterHealth.value = '';
                if (sectorFilter) sectorFilter.value = '';
                if (dealerSortSelect) dealerSortSelect.value = 'dealer_id_asc';
                dealerQuickFilter = 'all';
                dealerQuickFilters?.querySelectorAll('.dealer-quick-filter').forEach(el => {
                    el.classList.toggle('active', el.dataset.filter === 'all');
                });
                renderDealerList();
            };
        }
    }

    // --- DASHBOARD SETTINGS LOGIC ---
    if(btnDashSettings) {
        btnDashSettings.onclick = () => {
            const list = document.getElementById('dash-settings-list');
            if(list) {
                list.innerHTML = `
                    <div class="form-check form-switch mb-3">
                        <input class="form-check-input" type="checkbox" id="set-showPulse" ${dashConfig.showPulse ? 'checked' : ''}>
                        <label class="form-check-label" for="set-showPulse">Продажи</label>
                    </div>
                    <div class="form-check form-switch mb-3">
                        <input class="form-check-input" type="checkbox" id="set-showAttention" ${dashConfig.showAttention ? 'checked' : ''}>
                        <label class="form-check-label" for="set-showAttention">Требуют внимания</label>
                    </div>
                    <div class="form-check form-switch mb-3">
                        <input class="form-check-input" type="checkbox" id="set-showPlan" ${dashConfig.showPlan ? 'checked' : ''}>
                        <label class="form-check-label" for="set-showPlan">План на сегодня</label>
                    </div>
                    <div class="form-check form-switch">
                        <input class="form-check-input" type="checkbox" id="set-showActivity" ${dashConfig.showActivity ? 'checked' : ''}>
                        <label class="form-check-label" for="set-showActivity">Последние события</label>
                    </div>
                `;
            }
            if(settingsModal) settingsModal.show();
        };
    }

    window.saveDashboardConfig = () => {
        dashConfig.showPulse = document.getElementById('set-showPulse')?.checked ?? true;
        dashConfig.showAttention = document.getElementById('set-showAttention')?.checked ?? true;
        dashConfig.showPlan = document.getElementById('set-showPlan')?.checked ?? true;
        dashConfig.showActivity = document.getElementById('set-showActivity')?.checked ?? true;
        localStorage.setItem('dash_config', JSON.stringify(dashConfig));
        if(settingsModal) settingsModal.hide();
        renderDashboard();
    };

    // --- RENDER DASHBOARD (V3) ---
    function getTaskDealer(dealerId) {
        return allTasksData.find(d => String(d.id) === String(dealerId));
    }

    function getSalesForDealer(dealer) {
        const dealerId = String(dealer?.id || dealer?._id || '');
        const personalPlanKey = `PLAN_vip_${dealerId}`;

        return (currentMonthSales || []).filter(s => {
            const rowDealerId = String(s.dealerId || '');
            return rowDealerId === dealerId || (dealer?.hasPersonalPlan && rowDealerId === personalPlanKey);
        });
    }

    function getDealerHealth(dealer) {
        const taskDealer = getTaskDealer(dealer.id);
        const canViewSales = Boolean(window.CRMAuth && CRMAuth.can('can_view_sales'));
        const canViewVisits = Boolean(window.CRMAuth && CRMAuth.can('can_view_dashboard'));

        if (window.CRMScore && typeof CRMScore.calculateDealerScore === 'function') {
            return CRMScore.calculateDealerScore({
                dealer,
                salesRows: canViewSales ? getSalesForDealer(dealer) : [],
                visits: canViewVisits ? (taskDealer?.visits || []) : [],
                canViewSales,
                canViewVisits
            });
        }

        return { score: 0, level: 'problem', label: 'Нет оценки', reasons: [] };
    }

    function formatCompactNumber(value) {
        const n = Number(value) || 0;
        if (Math.abs(n) >= 1000000) return (n / 1000000).toFixed(1).replace('.0','') + ' млн';
        if (Math.abs(n) >= 1000) return (n / 1000).toFixed(1).replace('.0','') + ' тыс';
        return n.toLocaleString('ru-RU', { maximumFractionDigits: 0 });
    }

    function formatExactSqm(value) {
        const n = Number(value) || 0;
        return n.toLocaleString('ru-RU', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
        });
    }

    function isPersonalManagerView() {
        const user = window.CRMAuth?.user;
        return Boolean(user && user.role === 'manager' && !user.permissions?.is_admin);
    }

    function getEffectiveDashboardScope() {
        const user = window.CRMAuth?.user;
        if (!user) return 'all';
        if (user.role === 'marketing' || user.permissions?.is_admin) return 'all';
        return user.scope || 'all';
    }

    function getDashboardPlanKey(scope) {
        if (scope === 'astana') return 'astana_all';
        if (scope === 'regions') return 'regions_all';
        return 'total_all';
    }

    function getDashboardPlanLabel(scope) {
        if (scope === 'astana') return 'План Астана';
        if (scope === 'regions') return 'План Регионы';
        return 'Общий план';
    }

    function getDashboardMonthTotals(rows, scope = 'all') {
        const source = Array.isArray(rows) ? rows : [];
        const factRows = source.filter(row => !String(row.dealerId || '').startsWith('PLAN_'));
        const fact = factRows.reduce((sum, row) => sum + (Number(row.fact) || 0), 0);

        const rootKey = `PLAN_${getDashboardPlanKey(scope)}`;
        const rootPlan = source.find(row => String(row.dealerId || '') === rootKey);
        if (rootPlan) {
            return { fact, plan: Number(rootPlan.plan) || 0 };
        }

        if (scope === 'all') {
            const astanaPlan = source.find(row => String(row.dealerId || '') === 'PLAN_astana_all');
            const regionsPlan = source.find(row => String(row.dealerId || '') === 'PLAN_regions_all');
            if (astanaPlan || regionsPlan) {
                return {
                    fact,
                    plan: (Number(astanaPlan?.plan) || 0) + (Number(regionsPlan?.plan) || 0)
                };
            }
        }

        const legacyPlan = factRows.reduce((sum, row) => sum + (Number(row.plan) || 0), 0);
        return { fact, plan: legacyPlan };
    }

    function getMonthLabel(key) {
        const [y,m] = key.split('-').map(Number);
        return new Date(y, m - 1, 1).toLocaleDateString('ru-RU', { month: 'short' }).replace('.', '');
    }

    function renderPulseChart() {
        const chart = document.getElementById('pulse-chart');
        const summary = document.getElementById('pulse-summary');
        if (!chart || !summary) return;

        if (!window.CRMAuth || !CRMAuth.can('can_view_sales')) {
            chart.innerHTML = '<div class="cc-empty">Нет доступа к продажам</div>';
            summary.innerHTML = '';
            return;
        }

        const months = [];
        const now = new Date();
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            months.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
        }

        const userScope = getEffectiveDashboardScope();
        const totals = months.map(month => {
            const rows = salesHistory.filter(s => s.month === month);
            return {
                month,
                ...getDashboardMonthTotals(rows, userScope)
            };
        });

        const current = totals[totals.length - 1] || { fact:0, plan:0 };
        const previous = totals[totals.length - 2] || { fact:0, plan:0 };
        const achievement = current.plan > 0 ? Math.round(current.fact / current.plan * 100) : 0;
        const delta = previous.fact > 0 ? Math.round((current.fact - previous.fact) / previous.fact * 100) : null;

        summary.innerHTML = `
            <div class="pulse-summary-item"><span>Факт месяца</span><strong>${formatExactSqm(current.fact)} м²</strong></div>
            <div class="pulse-summary-item"><span>План</span><strong>${formatExactSqm(current.plan)} м²</strong></div>
            <div class="pulse-summary-item"><span>Выполнение</span><strong>${achievement}%</strong></div>
            <div class="pulse-summary-item"><span>К прошлому месяцу</span><strong>${delta === null ? '—' : (delta >= 0 ? '+' : '') + delta + '%'}</strong></div>
        `;

        const width = 720, height = 205, left = 28, right = 16, top = 15, bottom = 30;
        const max = Math.max(1, ...totals.flatMap(x => [x.fact, x.plan])) * 1.08;
        const x = idx => left + idx * ((width-left-right) / Math.max(1, totals.length-1));
        const y = val => top + (height-top-bottom) * (1 - val/max);
        const factPts = totals.map((d,i) => `${x(i)},${y(d.fact)}`).join(' ');
        const planPts = totals.map((d,i) => `${x(i)},${y(d.plan)}`).join(' ');
        const areaPts = `${left},${height-bottom} ${factPts} ${x(totals.length-1)},${height-bottom}`;

        const grid = [0,.25,.5,.75,1].map(p => {
            const gy = top + (height-top-bottom)*p;
            return `<line class="grid-line" x1="${left}" x2="${width-right}" y1="${gy}" y2="${gy}"/>`;
        }).join('');
        const labels = totals.map((d,i) => `<text class="axis-label" x="${x(i)}" y="${height-8}" text-anchor="middle">${getMonthLabel(d.month)}</text>`).join('');
        const points = totals.map((d,i) => `<circle class="point" cx="${x(i)}" cy="${y(d.fact)}" r="4"><title>${getMonthLabel(d.month)}: ${d.fact.toFixed(0)} м²</title></circle>`).join('');

        chart.innerHTML = `
            <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
                <defs>
                    <linearGradient id="pulseGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="#b9040a" stop-opacity=".18"/>
                        <stop offset="100%" stop-color="#b9040a" stop-opacity="0"/>
                    </linearGradient>
                </defs>
                ${grid}
                <polygon class="area" points="${areaPts}"/>
                <polyline class="plan-line" points="${planPts}"/>
                <polyline class="fact-line" points="${factPts}"/>
                ${points}
                ${labels}
            </svg>`;
    }

    function isNonWorkingDealer(dealer) {
        return ['potential', 'archive'].includes(String(dealer?.status || '').trim().toLowerCase());
    }

    function isWorkingDealer(dealer) {
        return !isNonWorkingDealer(dealer);
    }

    function isDealerStatusVisible(dealer) {
        if (isNonWorkingDealer(dealer)) return false;
        const statusValue = dealer?.status || 'standard';
        const statusObj = statusList.find(s => s.value === statusValue);
        return !(statusObj && (statusObj.isVisible === false || String(statusObj.isVisible) === 'false'));
    }

    function buildAttentionItems() {
        const items = [];
        const today = new Date(); today.setHours(0,0,0,0);

        // "Требуют внимания" — только рабочие дилеры.
        // Если у статуса выключен глазик в управлении статусами,
        // дилер полностью исключается из этого блока.
        const attentionDealers = allDealers.filter(d => isWorkingDealer(d) && isDealerStatusVisible(d));
        const visibleDealerIds = new Set(attentionDealers.map(d => String(d.id || d._id || '')));

        attentionDealers.forEach(dealer => {
            const health = getDealerHealth(dealer);
            if (dealer.status === 'problem') {
                items.push({ priority: 100, type:'risk', icon:'exclamation-diamond', title:dealer.name, meta:'Статус дилера: проблемный', dealerId:dealer.id, health });
            } else if (health.score < 60) {
                items.push({ priority: 80 + (60-health.score), type:'risk', icon:'heart-pulse', title:dealer.name, meta:health.reasons[0] || 'Низкая оценка дилера', dealerId:dealer.id, health });
            }
        });

        (allTasksData || []).forEach(d => {
            if (!visibleDealerIds.has(String(d.id || d._id || ''))) return;
            (d.visits || []).forEach((v,index) => {
                if (v.isCompleted || !v.date) return;
                const date = new Date(v.date); date.setHours(0,0,0,0);
                if (date < today) {
                    const days = Math.max(1, Math.floor((today-date)/86400000));
                    items.push({ priority:90+Math.min(days,10), type:'warn', icon:'calendar-x', title:d.name, meta:`Просрочена задача на ${days} дн.`, dealerId:d.id, visitIndex:index });
                }
            });
        });

        reclamationsData
            .filter(r => !r.resolution && visibleDealerIds.has(String(r.dealerId || '')))
            .slice(0,10)
            .forEach(r => {
                items.push({ priority:88, type:'risk', icon:'shield-exclamation', title:r.dealerName || 'Рекламация', meta:'Рекламация без решения', dealerId:r.dealerId });
            });

        return items.sort((a,b) => b.priority-a.priority).slice(0,7);
    }

    function renderAttentionFeed() {
        const container = document.getElementById('attention-feed');
        const count = document.getElementById('attention-count');
        if (!container) return;
        const items = buildAttentionItems();
        if (count) count.textContent = items.length;

        if (!items.length) {
            container.innerHTML = '<div class="cc-empty"><i class="bi bi-check2-circle d-block fs-3 mb-2"></i>Критичных сигналов нет</div>';
            return;
        }
        container.innerHTML = items.map(item => `
            <a class="attention-item is-${item.type}" href="${item.dealerId ? 'dealer.html?id='+item.dealerId : '#'}">
                <span class="attention-icon"><i class="bi bi-${item.icon}"></i></span>
                <span class="attention-copy">
                    <span class="attention-title">${safeText(item.title)}</span>
                    <span class="attention-meta">${safeText(item.meta)}</span>
                </span>
                ${item.health ? `<span class="cc-health-pill ${item.health.level}">${item.health.score}</span>` : '<i class="bi bi-chevron-right text-muted small"></i>'}
            </a>`).join('');
    }

    function renderActivityFeed() {
        const container = document.getElementById('activity-feed');
        if (!container) return;

        if (window.CRMAuth?.can?.('can_manage_users')) {
            if (!renderActivityFeed.auditLoaded && !renderActivityFeed.auditLoading) {
                renderActivityFeed.auditLoading = true;
                fetch('/api/audit?limit=8')
                    .then(async response => {
                        const data = await response.json();
                        if (!response.ok) throw new Error(data.error || 'Не удалось загрузить журнал');
                        renderActivityFeed.auditItems = Array.isArray(data.items) ? data.items : [];
                    })
                    .catch(() => { renderActivityFeed.auditItems = []; })
                    .finally(() => {
                        renderActivityFeed.auditLoaded = true;
                        renderActivityFeed.auditLoading = false;
                        renderActivityFeed();
                    });
            }

            if (renderActivityFeed.auditLoading && !renderActivityFeed.auditLoaded) {
                container.innerHTML = '<div class="cc-empty">Загружаем реальные действия сотрудников…</div>';
                return;
            }

            if (Array.isArray(renderActivityFeed.auditItems) && renderActivityFeed.auditItems.length) {
                const moduleMeta = {
                    dealers:['shop-window','/'], matrix:['grid-3x3-gap','/report.html'], visits:['geo-alt','/'],
                    products:['boxes','/products.html'], sales:['graph-up-arrow','/sales.html'], competitors:['globe2','/competitors.html'],
                    knowledge:['journal-text','/knowledge.html'], reclamations:['shield-exclamation','/reclamations.html'],
                    workshop:['tools','/workshop.html'], pricing:['percent','/pricing.html'], exports:['file-earmark-spreadsheet','/audit.html'], users:['people','/users.html'],
                    settings:['gear','/']
                };
                container.innerHTML = renderActivityFeed.auditItems.slice(0,8).map(item => {
                    const meta = moduleMeta[item.module] || ['activity','/audit.html'];
                    const date = new Date(item.createdAt);
                    const actor = item.actor?.name || item.actor?.username || 'Пользователь';
                    const when = Number.isNaN(date.getTime()) ? '' : date.toLocaleString('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
                    const fullTitle = String(item.summary || 'Действие в CRM').replace(/\s+/g, ' ').trim();
                    const displayTitle = compactActivityText(fullTitle);
                    const metaText = `${when} · ${actor}${item.success === false ? ' · Ошибка' : ''}`;
                    return `<a class="cc-event-item" href="/audit.html" title="${safeAttr(safeText(fullTitle))}">
                        <span class="cc-event-icon"><i class="bi bi-${meta[0]}"></i></span>
                        <span class="cc-event-copy">
                            <span class="cc-event-title" title="${safeAttr(safeText(fullTitle))}">${safeText(displayTitle)}</span>
                            <span class="cc-event-meta" title="${safeAttr(safeText(metaText))}">${safeText(metaText)}</span>
                        </span>
                    </a>`;
                }).join('');
                return;
            }
        }

        const events = [];

        const objectIdDate = (id) => {
            const value = String(id || '');
            if (!/^[a-f0-9]{24}$/i.test(value)) return null;
            const seconds = parseInt(value.slice(0, 8), 16);
            const date = new Date(seconds * 1000);
            return Number.isNaN(date.getTime()) ? null : date;
        };

        allDealers.filter(isWorkingDealer).forEach(d => {
            const createdDate = d.createdAt ? new Date(d.createdAt) : objectIdDate(d.id || d._id);
            if (createdDate && !Number.isNaN(createdDate.getTime())) {
                events.push({
                    type: 'dealer',
                    date: createdDate,
                    icon: 'shop-window',
                    title: `Добавлен дилер ${d.name}`,
                    meta: d.city || d.dealer_id || 'Новый дилер',
                    href: `dealer.html?id=${d.id}`
                });
            }
        });

        allTasksData.forEach(d => (d.visits || []).forEach(v => {
            if (v.isCompleted && v.date) {
                const date = new Date(v.date);
                if (!Number.isNaN(date.getTime())) {
                    events.push({
                        type: 'visit',
                        date,
                        icon: 'geo-alt',
                        title: `Визит · ${d.name}`,
                        meta: v.comment || 'Визит завершён',
                        href: `dealer.html?id=${d.id}`
                    });
                }
            }
        }));

        reclamationsData.forEach(r => {
            if (!r.createdAt) return;
            const date = new Date(r.createdAt);
            if (Number.isNaN(date.getTime())) return;
            events.push({
                type: 'reclamation',
                date,
                icon: 'shield-exclamation',
                title: `Рекламация · ${r.dealerName || 'Дилер'}`,
                meta: r.productName || 'Новая рекламация',
                href: '/reclamations.html'
            });
        });

        // Автосохранение обновляет много строк продаж одновременно.
        // Поэтому берём максимум 3 последних уникальных дилера, чтобы продажи
        // не вытесняли добавления дилеров, визиты и рекламации.
        const recentSales = salesHistory
            .filter(s => s.updatedAt && Number(s.fact) > 0 && !String(s.dealerId || '').startsWith('PLAN_'))
            .sort((a,b) => new Date(b.updatedAt) - new Date(a.updatedAt));

        const seenSalesDealers = new Set();
        for (const s of recentSales) {
            const key = String(s.dealerId || s.dealerName || '');
            if (!key || seenSalesDealers.has(key)) continue;
            seenSalesDealers.add(key);

            const date = new Date(s.updatedAt);
            if (Number.isNaN(date.getTime())) continue;

            events.push({
                type: 'sale',
                date,
                icon: 'graph-up-arrow',
                title: `Продажи · ${s.dealerName || 'Дилер'}`,
                meta: `${Number(s.fact).toLocaleString('ru-RU')} м²`,
                href: '/sales.html'
            });

            if (seenSalesDealers.size >= 3) break;
        }

        events.sort((a,b) => b.date-a.date);
        const top = events.slice(0,8);

        container.innerHTML = top.length ? top.map(e => {
            const fullTitle = String(e.title || '').replace(/\s+/g, ' ').trim();
            const displayTitle = compactActivityText(fullTitle);
            const metaText = `${e.date.toLocaleDateString('ru-RU', {day:'numeric',month:'short'})} · ${e.meta || ''}`;
            return `<a class="cc-event-item" href="${e.href}" title="${safeAttr(safeText(fullTitle))}">
                <span class="cc-event-icon"><i class="bi bi-${e.icon}"></i></span>
                <span class="cc-event-copy">
                    <span class="cc-event-title" title="${safeAttr(safeText(fullTitle))}">${safeText(displayTitle)}</span>
                    <span class="cc-event-meta" title="${safeAttr(safeText(metaText))}">${safeText(metaText)}</span>
                </span>
            </a>`;
        }).join('') : '<div class="cc-empty">Событий пока нет</div>';
    }

    function renderUpcomingPlan() {
        const container = document.getElementById('tasks-list-upcoming');
        if (!container) return;
        const today = new Date(); today.setHours(0,0,0,0);
        const tasks = [];

        allTasksData.forEach(d => (d.visits || []).forEach((v,index) => {
            if (v.isCompleted || !v.date) return;
            const date = new Date(v.date); date.setHours(0,0,0,0);
            if (date >= today) tasks.push({ dealerName:d.name, dealerId:d.id, date, comment:v.comment || 'Без комментария', visitIndex:index });
        }));
        tasks.sort((a,b)=>a.date-b.date);

        const top=tasks.slice(0,7);
        container.innerHTML = top.length ? top.map(t => {
            const isToday=t.date.getTime()===today.getTime();
            const canComplete=window.CRMAuth && CRMAuth.can('can_manage_visits');
            return `<div class="cc-task-row">
                <span class="attention-icon"><i class="bi bi-${isToday?'calendar-check':'calendar3'}"></i></span>
                <span class="attention-copy">
                    <a class="attention-title text-decoration-none" href="dealer.html?id=${t.dealerId}">${safeText(t.dealerName)}</a>
                    <span class="attention-meta">${isToday?'Сегодня':t.date.toLocaleDateString('ru-RU',{day:'numeric',month:'short'})} · ${safeText(t.comment)}</span>
                </span>
                ${canComplete?`<button class="btn-task-check btn-complete-task" data-id="${t.dealerId}" data-index="${t.visitIndex}" title="Выполнить"><i class="bi bi-check-lg"></i></button>`:''}
            </div>`;
        }).join('') : '<div class="cc-empty"><i class="bi bi-calendar2-check d-block fs-3 mb-2"></i>Ближайших задач нет</div>';
    }

    function renderDashboard() {
        if (!dashboardStats || !allDealers) return;

        const network = allDealers.filter(isWorkingDealer);
        const activeIds = new Set((currentMonthSales || []).filter(s => Number(s.fact)>0).map(s => String(s.dealerId)));
        const activeCount = network.filter(d => activeIds.has(String(d.id))).length;
        const attentionNetwork = network.filter(isDealerStatusVisible);
        const problemCount = attentionNetwork.filter(d => d.status === 'problem' || getDealerHealth(d).score < 60).length;
        const userScope = getEffectiveDashboardScope();
        const currentTotals = getDashboardMonthTotals(currentMonthSales, userScope);
        const currentFact = currentTotals.fact;
        const currentPlan = currentTotals.plan;
        const achievement = currentPlan > 0 ? Math.round(currentFact/currentPlan*100) : 0;

        const scores = network.map(getDealerHealth);
        const avgHealth = scores.length ? Math.round(scores.reduce((a,h)=>a+h.score,0)/scores.length) : 0;

        dashboardStats.innerHTML = `
            <div class="cc-kpi-card cc-kpi-dealers">
                <span class="cc-kpi-icon"><i class="bi bi-buildings"></i></span>
                <div class="cc-kpi-label">Всего дилеров</div>
                <div class="cc-kpi-value">${network.length}</div>
                <div class="cc-kpi-foot">${activeCount} с продажами в этом месяце</div>
            </div>
            <div class="cc-kpi-card is-good cc-kpi-score">
                <span class="cc-kpi-icon"><i class="bi bi-activity"></i></span>
                <div class="cc-kpi-label">Средняя оценка дилеров</div>
                <div class="cc-kpi-value">${avgHealth}<span style="font-size:.85rem;color:#9a9ca1"> / 100</span></div>
                <div class="cc-kpi-foot">По шкале от 0 до 100</div>
            </div>
            <div class="cc-kpi-card cc-kpi-sales">
                <span class="cc-kpi-icon"><i class="bi bi-graph-up-arrow"></i></span>
                <div class="cc-kpi-label">Продажи за месяц</div>
                <div class="cc-kpi-value cc-kpi-value-exact">${formatExactSqm(currentFact)} <span>м²</span></div>
                <div class="cc-kpi-foot">Точная квадратура за текущий месяц</div>
            </div>
            <div class="cc-kpi-card cc-kpi-plan ${achievement>=90?'is-good':''}">
                <span class="cc-kpi-icon"><i class="bi bi-bullseye"></i></span>
                <div class="cc-kpi-label">Выполнение плана</div>
                <div class="cc-kpi-value">${currentPlan > 0 ? achievement + '%' : '—'}</div>
                <div class="cc-kpi-foot">${currentPlan > 0 ? getDashboardPlanLabel(userScope) + ': ' + formatExactSqm(currentPlan) + ' м²' : 'План не задан'}</div>
            </div>
            <div class="cc-kpi-card is-alert cc-kpi-problems">
                <span class="cc-kpi-icon"><i class="bi bi-exclamation-triangle"></i></span>
                <div class="cc-kpi-label">Проблемные дилеры</div>
                <div class="cc-kpi-value">${problemCount}</div>
                <div class="cc-kpi-foot">Нужна проверка или визит</div>
            </div>`;

        const user = window.CRMAuth?.user || {};
        const greeting = document.getElementById('cc-greeting');
        const dateEl = document.getElementById('cc-date');
        const scopeEl = document.getElementById('cc-scope');
        if (greeting) {
            const hour = new Date().getHours();
            const hello = hour < 12 ? 'Доброе утро' : hour < 18 ? 'Добрый день' : 'Добрый вечер';
            const firstName = (user.fullName || '').trim().split(/\s+/)[0];
            greeting.textContent = firstName ? `${hello}, ${firstName}` : hello;
        }
        if (dateEl) dateEl.textContent = new Date().toLocaleDateString('ru-RU', { day:'numeric', month:'long', weekday:'long' });
        if (scopeEl) scopeEl.textContent = user.scope === 'astana' ? 'Астана' : user.scope === 'regions' ? 'Регионы' : 'Вся компания';

        const pulsePanel = document.getElementById('cc-pulse-panel');
        const attentionPanel = document.getElementById('cc-attention-panel');
        const planPanel = document.getElementById('cc-plan-panel');
        const activityPanel = document.getElementById('cc-activity-panel');
        if (pulsePanel) pulsePanel.style.display = dashConfig.showPulse ? '' : 'none';
        if (attentionPanel) attentionPanel.style.display = dashConfig.showAttention ? '' : 'none';
        if (planPanel) planPanel.style.display = dashConfig.showPlan ? '' : 'none';
        if (activityPanel) activityPanel.style.display = dashConfig.showActivity ? '' : 'none';

        if (dashConfig.showPulse) renderPulseChart();
        if (dashConfig.showAttention) renderAttentionFeed();
        if (dashConfig.showPlan) renderUpcomingPlan();
        if (dashConfig.showActivity) renderActivityFeed();
    }

    function renderTaskList(container, tasks, type) { if (!container) return; if (tasks.length === 0) { const msg = type === 'cooling' ? 'Все посещены недавно' : 'Задач нет'; container.innerHTML = `<div class="text-center py-4 text-muted"><i class="bi bi-check-circle display-6 d-block mb-2 text-success opacity-50"></i><small>${msg}</small></div>`; return; } container.innerHTML = tasks.map(t => { let badgeHtml = ''; let metaHtml = ''; if (type === 'upcoming') { const dateStr = t.date.toLocaleDateString('ru-RU', {day:'numeric', month:'short'}); badgeHtml = t.isToday ? `<span class="task-badge tb-today mt-1 d-inline-block">Сегодня</span>` : `<span class="task-badge tb-future mt-1 d-inline-block">${dateStr}</span>`; metaHtml = `<span class="text-muted small">${safeText(t.comment)}</span>`; } else if (type === 'problem') { if (t.type === 'overdue') { const dateStr = t.date.toLocaleDateString('ru-RU'); badgeHtml = `<span class="task-badge tb-overdue mt-1 d-inline-block">Просрок: ${dateStr}</span>`; metaHtml = `<span class="text-danger small fw-bold">${safeText(t.comment)}</span>`; } else { badgeHtml = `<span class="task-badge tb-overdue mt-1 d-inline-block">Проблема</span>`; metaHtml = `<span class="small text-muted">Внимание!</span>`; } } else if (type === 'cooling') { const daysStr = t.days === 999 ? 'Никогда' : `${t.days} дн.`; badgeHtml = `<span class="task-badge tb-cooling mt-1 d-inline-block">Без визитов: ${daysStr}</span>`; metaHtml = `<span class="text-muted small">Пора навестить</span>`; } const showCheckBtn = (window.CRMAuth && CRMAuth.can('can_manage_visits')) && (type === 'upcoming' || (type === 'problem' && t.type === 'overdue')); const btnHtml = showCheckBtn ? `<button class="btn-task-check btn-complete-task" data-id="${t.dealerId}" data-index="${t.visitIndex}" title="Выполнить"><i class="bi bi-check-lg"></i></button>` : ''; return `<div class="task-item-modern align-items-start"><div class="task-content"><a href="dealer.html?id=${t.dealerId}" target="_blank" class="task-title text-truncate d-block" style="max-width: 200px;">${safeText(t.dealerName)}</a>${badgeHtml}<div class="mt-1">${metaHtml}</div></div><div class="mt-1">${btnHtml}</div></div>`; }).join(''); }

    // --- OTHER / CUSTOM EXCEL EXPORT ---
    function ensureExcelJsLoaded() {
        if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
        if (excelJsLoadPromise) return excelJsLoadPromise;

        excelJsLoadPromise = new Promise((resolve,reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
            script.async = true;
            script.onload = () => window.ExcelJS ? resolve(window.ExcelJS) : reject(new Error('Excel-модуль не загрузился'));
            script.onerror = () => reject(new Error('Не удалось загрузить Excel-модуль'));
            document.head.appendChild(script);
        }).catch(error => {
            excelJsLoadPromise = null;
            throw error;
        });

        return excelJsLoadPromise;
    }

    function getCurrentExportDealers() {
        const city = filterCity?.value || '';
        const type = filterPriceType?.value || '';
        const status = filterStatus?.value || '';
        const responsible = filterResponsible?.value || '';
        const healthFilter = filterHealth?.value || '';
        const search = (searchBar?.value || '').trim().toLowerCase();
        const sector = document.getElementById('filter-sector')?.value || '';

        const baseFiltered = allDealers.filter(dealer => {
            let visible = true;
            if (!status) {
                if (isNonWorkingDealer(dealer)) visible = false;
                else {
                    const statusObj = statusList.find(item => item.value === (dealer.status || 'standard'));
                    if (statusObj && (statusObj.isVisible === false || String(statusObj.isVisible) === 'false')) visible = false;
                }
            } else {
                visible = dealer.status === status;
            }

            const normalizedCity = normalizeDisplayValue(dealer.city);
            const normalizedType = dealerPriceListName(dealer);
            const normalizedSector = normalizeDisplayValue(dealer.region_sector);
            const searchable = [
                dealer.name,dealer.dealer_id,normalizedCity,dealer.address,normalizedSector,normalizedType,
                responsibleLabel(dealer.responsible)
            ].filter(Boolean).join(' ').toLowerCase();

            return visible &&
                (!city || normalizedCity === city) &&
                (!type || normalizedType === type) &&
                (!responsible ||
                    (responsible === '__unassigned__' && !dealer.responsible) ||
                    (responsible !== '__unassigned__' && String(dealer.responsible || '') === String(responsible))) &&
                (!sector || normalizedSector === sector) &&
                (!search || searchable.includes(search));
        });

        let entries = baseFiltered.map(dealer => ({dealer,metrics:getDealerListMetrics(dealer)}));

        if (healthFilter) entries = entries.filter(({metrics}) => metrics.health.level === healthFilter);
        entries = entries.filter(({metrics}) => {
            if (dealerQuickFilter === 'sales') return metrics.fact > 0;
            if (dealerQuickFilter === 'plan') return metrics.planRisk;
            if (dealerQuickFilter === 'visit') return metrics.needsVisit;
            if (dealerQuickFilter === 'problem') return metrics.problem;
            return true;
        });

        const sortValue = dealerSortSelect?.value || 'dealer_id_asc';
        entries.sort((a,b) => {
            if (sortValue === 'name_asc') return String(a.dealer.name||'').localeCompare(String(b.dealer.name||''),'ru');
            if (sortValue === 'sales_desc') return b.metrics.fact-a.metrics.fact;
            if (sortValue === 'achievement_asc') {
                const av=a.metrics.achievement===null?Number.POSITIVE_INFINITY:a.metrics.achievement;
                const bv=b.metrics.achievement===null?Number.POSITIVE_INFINITY:b.metrics.achievement;
                return av-bv;
            }
            if (sortValue === 'health_asc') return a.metrics.health.score-b.metrics.health.score;
            if (sortValue === 'health_desc') return b.metrics.health.score-a.metrics.health.score;
            if (sortValue === 'visit_desc') {
                const av=a.metrics.daysSinceVisit===null?Number.POSITIVE_INFINITY:a.metrics.daysSinceVisit;
                const bv=b.metrics.daysSinceVisit===null?Number.POSITIVE_INFINITY:b.metrics.daysSinceVisit;
                return bv-av;
            }
            return String(a.dealer.dealer_id||'').localeCompare(String(b.dealer.dealer_id||''),undefined,{numeric:true});
        });

        return entries.map(item => item.dealer);
    }

    function getExportDealerPool(scope) {
        if (scope === 'all') return [...allDealers];
        if (scope === 'working') return allDealers.filter(isWorkingDealer);
        return getCurrentExportDealers();
    }

    function getCompetitorPriceRows(dealers) {
        const filledOnly = Boolean(document.getElementById('export-prices-filled-only')?.checked);
        const rows = [];
        dealers.forEach(dealer => {
            (Array.isArray(dealer.competitors) ? dealer.competitors : []).forEach(competitor => {
                const hasPrice = String(competitor?.price_opt || '').trim() || String(competitor?.price_retail || '').trim();
                if (filledOnly && !hasPrice) return;
                rows.push({dealer,competitor});
            });
        });
        return rows;
    }

    function currentExportScope() {
        return document.querySelector('input[name="export-scope"]:checked')?.value || 'current';
    }

    function exportScopeLabel(scope) {
        if (scope === 'working') return 'Все рабочие дилеры';
        if (scope === 'all') return 'Вся доступная база';
        return 'Текущая выборка';
    }

    function getSelectedExportColumns() {
        const selectedIds = new Set(
            [...document.querySelectorAll('#export-columns-list input[data-export-column]:checked')]
                .map(input => input.dataset.exportColumn)
        );
        return getExportColumns().filter(column => selectedIds.has(column.id));
    }

    function updateExportBuilderSummary() {
        const scope = currentExportScope();
        const dealers = getExportDealerPool(scope);
        const rows = activeExportType === 'prices' ? getCompetitorPriceRows(dealers) : dealers;
        const selected = getSelectedExportColumns();

        const rowCount = document.getElementById('export-builder-row-count');
        const selectedCount = document.getElementById('export-builder-selected-count');
        const summary = document.getElementById('export-builder-summary');
        const detail = document.getElementById('export-builder-summary-detail');

        if (rowCount) rowCount.textContent = `${rows.length.toLocaleString('ru-RU')} ${activeExportType==='prices'?'строк цен':'дил.'}`;
        if (selectedCount) selectedCount.textContent = `${selected.length} выбрано`;
        if (summary) summary.textContent = activeExportType === 'prices'
            ? `Цены конкурентов · ${rows.length.toLocaleString('ru-RU')} строк`
            : `База дилеров · ${rows.length.toLocaleString('ru-RU')} записей`;
        if (detail) detail.textContent = `${exportScopeLabel(scope)} · ${selected.length} колонок · Excel .xlsx`;
    }

    function renderExportColumns() {
        const list = document.getElementById('export-columns-list');
        if (!list) return;

        const columns = getExportColumns();
        const groups = [...new Set(columns.map(column => column.group || 'Данные'))];
        list.innerHTML = groups.map(group => {
            const groupColumns = columns.filter(column => (column.group || 'Данные') === group);
            return `<div class="export-column-group">
                <div class="export-column-group-title">${safeText(group)}</div>
                <div class="export-column-group-grid">
                    ${groupColumns.map(column => `
                        <label class="export-column-option">
                            <input type="checkbox" data-export-column="${safeAttr(column.id)}" ${column.checked?'checked':''}>
                            <span class="export-column-check"><i class="bi bi-check-lg"></i></span>
                            <span>${safeText(column.label)}</span>
                        </label>`).join('')}
                </div>
            </div>`;
        }).join('');

        list.querySelectorAll('input[data-export-column]').forEach(input => {
            input.addEventListener('change',() => {
                document.querySelectorAll('#export-builder-presets .export-preset').forEach(button => button.classList.remove('active'));
                updateExportBuilderSummary();
            });
        });
    }

    function applyExportPreset(presetId) {
        const preset = (exportPresets[activeExportType] || []).find(item => item.id === presetId);
        if (!preset) return;
        const ids = preset.columns === 'all'
            ? new Set(getExportColumns().map(column => column.id))
            : new Set(preset.columns);

        document.querySelectorAll('#export-columns-list input[data-export-column]').forEach(input => {
            input.checked = ids.has(input.dataset.exportColumn);
        });
        document.querySelectorAll('#export-builder-presets .export-preset').forEach(button => {
            button.classList.toggle('active',button.dataset.exportPreset === presetId);
        });
        updateExportBuilderSummary();
    }

    function renderExportPresets() {
        const container = document.getElementById('export-builder-presets');
        if (!container) return;
        container.innerHTML = (exportPresets[activeExportType] || []).map((preset,index) => `
            <button type="button" class="export-preset ${index===0?'active':''}" data-export-preset="${safeAttr(preset.id)}">
                <i class="bi bi-${safeAttr(preset.icon)}"></i><span>${safeText(preset.label)}</span>
            </button>`).join('');
        container.querySelectorAll('[data-export-preset]').forEach(button => {
            button.addEventListener('click',() => applyExportPreset(button.dataset.exportPreset));
        });
    }

    function openExportBuilder(type) {
        if (!allDealers.length) {
            window.showToast('Нет данных для выгрузки','warning');
            return;
        }

        activeExportType = type === 'prices' ? 'prices' : 'dealers';
        const isPrices = activeExportType === 'prices';
        const title = document.getElementById('export-builder-title');
        const description = document.getElementById('export-builder-description');
        const icon = document.getElementById('export-builder-icon');
        const priceOptions = document.getElementById('export-price-options');

        if (title) title.textContent = isPrices ? 'Цены конкурентов' : 'База дилеров';
        if (description) description.textContent = isPrices
            ? 'Настройте выгрузку мониторинга цен конкурентов по дилерской сети.'
            : 'Настройте состав базы дилеров — от короткого рабочего списка до полной карточки.';
        if (icon) icon.innerHTML = isPrices ? '<i class="bi bi-tags"></i>' : '<i class="bi bi-file-earmark-spreadsheet"></i>';
        if (priceOptions) priceOptions.hidden = !isPrices;

        const currentScope = document.querySelector('input[name="export-scope"][value="current"]');
        if (currentScope) currentScope.checked = true;
        const filledOnly = document.getElementById('export-prices-filled-only');
        if (filledOnly) filledOnly.checked = true;

        renderExportColumns();
        renderExportPresets();
        const firstPreset = exportPresets[activeExportType]?.[0]?.id;
        if (firstPreset) applyExportPreset(firstPreset);
        updateExportBuilderSummary();
        exportModal?.show();
    }

    function exportWorkbookTitle() {
        return activeExportType === 'prices' ? 'Цены конкурентов' : 'База дилеров';
    }

    function exportFilename() {
        const now = new Date();
        const stamp = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
        return activeExportType === 'prices'
            ? `IDEAL_FLOOR_Цены_конкурентов_${stamp}.xlsx`
            : `IDEAL_FLOOR_База_дилеров_${stamp}.xlsx`;
    }

    function styleExportWorksheet(sheet,selectedColumns,dataStartRow) {
        const lastColumn = Math.max(1,selectedColumns.length);
        sheet.views = [{state:'frozen',ySplit:dataStartRow-1}];
        sheet.autoFilter = {
            from:{row:dataStartRow-1,column:1},
            to:{row:dataStartRow-1,column:lastColumn}
        };

        sheet.mergeCells(1,1,1,lastColumn);
        const titleCell = sheet.getCell(1,1);
        titleCell.font = {bold:true,size:16,color:{argb:'FFFFFFFF'}};
        titleCell.fill = {type:'pattern',pattern:'solid',fgColor:{argb:'FF171719'}};
        titleCell.alignment = {vertical:'middle'};
        sheet.getRow(1).height = 30;

        sheet.mergeCells(2,1,2,lastColumn);
        const metaCell = sheet.getCell(2,1);
        metaCell.font = {size:10,color:{argb:'FF777A82'}};
        metaCell.fill = {type:'pattern',pattern:'solid',fgColor:{argb:'FFF4F2EF'}};
        metaCell.alignment = {vertical:'middle'};
        sheet.getRow(2).height = 22;

        const header = sheet.getRow(dataStartRow-1);
        header.font = {bold:true,color:{argb:'FFFFFFFF'}};
        header.fill = {type:'pattern',pattern:'solid',fgColor:{argb:'FFB9040A'}};
        header.alignment = {vertical:'middle',horizontal:'left',wrapText:true};
        header.height = 28;

        selectedColumns.forEach((column,index) => {
            sheet.getColumn(index+1).width = column.width || 18;
        });

        for (let rowIndex=dataStartRow; rowIndex<=sheet.rowCount; rowIndex++) {
            const row = sheet.getRow(rowIndex);
            row.alignment = {vertical:'top',wrapText:true};
            if ((rowIndex-dataStartRow)%2===1) {
                row.fill = {type:'pattern',pattern:'solid',fgColor:{argb:'FFFAF9F7'}};
            }
            row.eachCell({includeEmpty:true},cell => {
                cell.border = {
                    bottom:{style:'hair',color:{argb:'FFE6E1DD'}}
                };
                if (typeof cell.value === 'number') cell.numFmt = '#,##0.00';
            });
        }
    }

    async function logExportAction(scope,columns,rowCount) {
        try {
            await fetch('/api/exports/log',{
                method:'POST',
                headers:{'Content-Type':'application/json'},
                body:JSON.stringify({
                    type:activeExportType,
                    scope,
                    columns:columns.map(column => column.id),
                    rowCount
                }),
                crmTrackLoading:false
            });
        } catch (_) {}
    }

    async function downloadCustomExport() {
        const selectedColumns = getSelectedExportColumns();
        if (!selectedColumns.length) {
            window.showToast('Выберите хотя бы одну колонку','warning');
            return;
        }

        const scope = currentExportScope();
        const dealers = getExportDealerPool(scope);
        const sourceRows = activeExportType === 'prices' ? getCompetitorPriceRows(dealers) : dealers;
        if (!sourceRows.length) {
            window.showToast(activeExportType==='prices'?'Нет цен конкурентов для выбранной выборки':'В выбранной выборке нет дилеров','warning');
            return;
        }

        const button = document.getElementById('export-builder-download');
        const oldHtml = button?.innerHTML || '';
        if (button) {
            button.disabled = true;
            button.innerHTML = '<span class="spinner-border spinner-border-sm"></span><span>Формируем Excel…</span>';
        }

        try {
            await ensureExcelJsLoaded();
            const workbook = new ExcelJS.Workbook();
            workbook.creator = 'IDEAL FLOOR CRM';
            workbook.company = 'IDEAL FLOOR';
            workbook.subject = exportWorkbookTitle();
            workbook.created = new Date();

            const sheet = workbook.addWorksheet(activeExportType==='prices'?'Цены конкурентов':'Дилеры',{
                properties:{defaultRowHeight:20}
            });
            sheet.columns = selectedColumns.map(column => ({key:column.id,width:column.width||18}));

            const title = exportWorkbookTitle();
            sheet.getCell(1,1).value = title;
            sheet.getCell(2,1).value = `${exportScopeLabel(scope)} · ${sourceRows.length.toLocaleString('ru-RU')} строк · сформировано ${new Date().toLocaleString('ru-RU')}`;
            sheet.getRow(3).values = selectedColumns.map(column => column.label);

            sourceRows.forEach(source => {
                sheet.addRow(selectedColumns.map(column => {
                    try { return column.getValue(source); }
                    catch (_) { return ''; }
                }));
            });

            styleExportWorksheet(sheet,selectedColumns,4);

            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = exportFilename();
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url),1200);

            logExportAction(scope,selectedColumns,sourceRows.length);
            exportModal?.hide();
            window.showToast(`Excel готов: ${sourceRows.length.toLocaleString('ru-RU')} строк`,'success');
        } catch (error) {
            console.error('Custom export error',error);
            window.showToast(error.message || 'Не удалось сформировать Excel','error');
        } finally {
            if (button) {
                button.disabled = false;
                button.innerHTML = oldHtml;
            }
        }
    }

    btnExportDealers?.addEventListener('click',() => openExportBuilder('dealers'));
    btnExportCompetitors?.addEventListener('click',() => openExportBuilder('prices'));

    document.querySelectorAll('input[name="export-scope"]').forEach(input => {
        input.addEventListener('change',updateExportBuilderSummary);
    });
    document.getElementById('export-prices-filled-only')?.addEventListener('change',updateExportBuilderSummary);
    document.getElementById('export-builder-select-all')?.addEventListener('click',() => {
        const inputs = [...document.querySelectorAll('#export-columns-list input[data-export-column]')];
        const shouldCheck = inputs.some(input => !input.checked);
        inputs.forEach(input => { input.checked = shouldCheck; });
        document.querySelectorAll('#export-builder-presets .export-preset').forEach(button => button.classList.remove('active'));
        const control = document.getElementById('export-builder-select-all');
        if (control) control.textContent = shouldCheck ? 'Снять всё' : 'Выбрать всё';
        updateExportBuilderSummary();
    });
    document.getElementById('export-builder-download')?.addEventListener('click',downloadCustomExport);

    // --- ОТКРЫТИЕ РЕДАКТИРОВАНИЯ (С УЧЕТОМ СЕКТОРА) ---
    async function openEditModal(id) {
        document.querySelectorAll('.dealer-v3-menu.show').forEach(menu => {
            const toggle = menu.parentElement?.querySelector('[data-bs-toggle="dropdown"]');
            try {
                if (toggle && window.bootstrap?.Dropdown) {
                    const instance = bootstrap.Dropdown.getInstance(toggle) || bootstrap.Dropdown.getOrCreateInstance(toggle);
                    instance.hide();
                }
            } catch (_) {}
            menu.classList.remove('show');
        });

        if (!window.CRMAuth || !CRMAuth.can('can_edit_dealer')) {
            window.showToast("Нет права редактировать дилеров", "error");
            return;
        }
        try {
            const [res] = await Promise.all([
                fetch(`${API_DEALERS_URL}/${id}`),
                fetchProductCatalog().catch(e => console.warn('Каталог недоступен', e)),
                fetchCompetitorsRef().catch(e => console.warn('Справочник конкурентов недоступен', e)),
                fetchDealerPriceLists().catch(e => console.warn('Прайсы недоступны', e))
            ]);
            if(!res.ok) throw new Error("Ошибка");
            const d = await res.json();
            const titleEl = document.querySelector('#edit-modal .modal-title');
            if(titleEl) titleEl.textContent = 'Редактирование дилера';
            const subtitleEl = document.getElementById('edit-modal-subtitle');
            if(subtitleEl) subtitleEl.textContent = d.name ? `${d.name} · измените только нужные данные` : 'Измените только нужные данные';
            document.getElementById('edit_db_id').value=d.id; document.getElementById('edit_dealer_id').value=d.dealer_id; document.getElementById('edit_name').value=d.name; fillDealerPriceListSelect('edit_price_list', d.price_list?.id || d.price_list || ''); document.getElementById('edit_city').value=d.city; document.getElementById('edit_address').value=d.address; document.getElementById('edit_delivery').value=d.delivery; document.getElementById('edit_website').value=d.website; document.getElementById('edit_instagram').value=d.instagram;
            if(document.getElementById('edit_latitude')) document.getElementById('edit_latitude').value=d.latitude||''; if(document.getElementById('edit_longitude')) document.getElementById('edit_longitude').value=d.longitude||'';
            document.getElementById('edit_bonuses').value=d.bonuses; populateStatusSelects(d.status); 
            
            // --- ЛОГИКА ОТКРЫТИЯ (СЕКТОР) ---
            if(document.getElementById('edit_responsible')) {
                const editResponsible = document.getElementById('edit_responsible');
                editResponsible.value = d.responsible || '';

                const secSelect = document.getElementById('edit_region_sector');
                if(secSelect) secSelect.setAttribute('data-selected', d.region_sector || '');
                toggleSectorSelect('edit', d.responsible || '');
                if(secSelect) secSelect.value = d.region_sector || '';
            }

            if(d.contract) { document.getElementById('edit_contract_signed').checked = d.contract.isSigned || false; document.getElementById('edit_contract_date').value = d.contract.date || ''; } else { document.getElementById('edit_contract_signed').checked = false; document.getElementById('edit_contract_date').value = ''; }
            if (editLegalEntityList) {
                editLegalEntityList.innerHTML = '';
                const legalEntities = getDealerLegalEntities(d);
                (legalEntities.length ? legalEntities : [{}]).forEach(entity => editLegalEntityList.insertAdjacentHTML('beforeend', createLegalEntityHTML(entity)));
            }

            const vipCheck = document.getElementById('edit_has_personal_plan');
            if(vipCheck) vipCheck.checked = d.hasPersonalPlan || false;

            if(editAvatarPreview) { editAvatarPreview.src = d.avatarUrl || ''; editAvatarPreview.style.display = d.avatarUrl ? 'block' : 'none'; }
            if(editCurrentAvatarUrl) editCurrentAvatarUrl.value = d.avatarUrl || ''; newAvatarBase64 = null;
            renderList(editContactList, d.contacts, createContactEntryHTML); renderList(editAddressList, d.additional_addresses, createAddressEntryHTML); renderList(editPosList, d.pos_materials, createPosEntryHTML); renderList(editVisitsList, d.visits, createVisitEntryHTML); renderList(editCompetitorList, d.competitors, createCompetitorEntryHTML);
            renderProductChecklist(editProductChecklist, (d.products||[]).map(p=>p.id)); editPhotosData = d.photos||[]; renderPhotoPreviews(editPhotoPreviewContainer, editPhotosData);
            const firstTabEl = document.querySelector('#editTabs button[data-bs-target="#tab-main"]'); if(firstTabEl) { const tab = new bootstrap.Tab(firstTabEl); tab.show(); }
            document.querySelectorAll('[data-field-shortcuts="edit"] button').forEach((item,index) => item.classList.toggle('active', index === 0));
            editModal.show();
        } catch(e){ window.showToast("Ошибка загрузки данных", "error"); console.error(e); }
    }
    // EXPOSE TO WINDOW
    window.openEditModal = openEditModal;

    function syncQuickVisitMode() {
        if (!qvForm) return;
        const mode = qvForm.querySelector('input[name="qv_mode"]:checked')?.value || 'plan';
        const completed = mode === 'completed';
        const dateInput = document.getElementById('qv_date');
        const comment = document.getElementById('qv_comment');
        const commentLabel = document.getElementById('qv_comment_label');
        const hint = document.getElementById('qv_mode_hint');
        const submit = document.getElementById('qv_submit');
        const today = new Date().toISOString().slice(0,10);

        if (dateInput) {
            if (!dateInput.value) dateInput.value = today;
            dateInput.min = completed ? '' : today;
            dateInput.max = completed ? today : '';
            if (completed && dateInput.value > today) dateInput.value = today;
        }

        if (commentLabel) commentLabel.textContent = completed ? 'Что сделано?' : 'Что нужно сделать?';
        if (comment) comment.placeholder = completed ? 'Например: заменил ценники' : 'Например: заменить ценники';
        if (hint) hint.textContent = completed
            ? 'Визит сразу попадёт в историю как выполненный.'
            : 'Этот визит попадёт в план и останется невыполненным.';
        if (submit) submit.innerHTML = completed
            ? '<i class="bi bi-check2-circle"></i> Завершить визит'
            : '<i class="bi bi-calendar-plus"></i> Добавить в план';
    }

    window.showQuickVisit = (id, preferredMode = 'plan') => {
        if (!window.CRMAuth || !CRMAuth.can('can_manage_visits')) {
            window.showToast("Нет права добавлять визиты", "error");
            return;
        }

        const dealer = allDealers.find(d => String(d.id) === String(id));
        const dealerName = document.getElementById('qv_dealer_name');
        const planMode = document.getElementById('qv_mode_plan');
        const completedMode = document.getElementById('qv_mode_completed');

        document.getElementById('qv_dealer_id').value = id;
        document.getElementById('qv_comment').value = '';
        document.getElementById('qv_date').value = new Date().toISOString().slice(0,10);
        if (dealerName) dealerName.textContent = dealer ? dealer.name : 'Дилер';

        if (preferredMode === 'completed' && completedMode) completedMode.checked = true;
        else if (planMode) planMode.checked = true;

        syncQuickVisitMode();
        qvModal.show();
    };

    async function fetchDealers() { const response = await fetch(API_DEALERS_URL + '?view=main'); if (!response.ok) throw new Error("Не удалось загрузить список дилеров"); allDealers = await response.json(); }
    async function fetchTasks() { const response = await fetch(API_TASKS_URL); if(response.ok) allTasksData = await response.json(); else throw new Error("Ошибка задач"); }
    async function fetchCurrentMonthSales() {
        const month = new Date().toISOString().slice(0, 7);
        const r = await fetch(`${API_SALES_URL}?month=${month}`);
        if(r.ok) currentMonthSales = await r.json();
        else throw new Error("Ошибка продаж");
    }

    async function fetchSalesHistory() {
        const r = await fetch(`${API_SALES_URL}?months=6`);
        if (r.ok) salesHistory = await r.json();
        else salesHistory = [];
    }

    async function fetchReclamationsForDashboard() {
        if (!window.CRMAuth || !CRMAuth.can('can_view_reclamations')) {
            reclamationsData = [];
            return;
        }
        try {
            const r = await fetch('/api/reclamations/dashboard');
            reclamationsData = r.ok ? await r.json() : [];
        } catch (_) {
            reclamationsData = [];
        }
    }
    async function fetchStatuses(rerender = true) { const res = await fetch(API_STATUSES_URL); if(res.ok) { statusList = await res.json(); populateStatusSelects(); renderStatusManagerList(); if(rerender && typeof renderDealerList === 'function') renderDealerList(); } else throw new Error("Ошибка статусов"); }
    
    function populateStatusSelects(selectedStatus = null) { let filterHtml = '<option value="">Рабочие дилеры</option>'; statusList.forEach(s => { filterHtml += `<option value="${s.value}">${s.label}</option>`; }); if(filterStatus) filterStatus.innerHTML = filterHtml; const modalHtml = statusList.map(s => `<option value="${s.value}" ${selectedStatus === s.value ? 'selected' : ''}>${s.label}</option>`).join(''); const addStatusSel = document.getElementById('status'); if(addStatusSel) addStatusSel.innerHTML = modalHtml; const editStatusSel = document.getElementById('edit_status'); if(editStatusSel) editStatusSel.innerHTML = modalHtml; }
    function statusDealerCount(value) {
        return (Array.isArray(allDealers) ? allDealers : []).filter(dealer => String(dealer.status || '') === String(value || '')).length;
    }

    function statusColor(value) {
        const color = String(value || '').trim();
        return /^#[0-9a-f]{6}$/i.test(color) ? color : '#8f9197';
    }

    function renderStatusManagerStats() {
        const total = statusList.length;
        const visible = statusList.filter(item => item.isVisible !== false).length;
        const hidden = total - visible;
        const assigned = (Array.isArray(allDealers) ? allDealers : []).filter(dealer =>
            statusList.some(status => String(status.value) === String(dealer.status || ''))
        ).length;
        const set = (id,value) => {
            const el = document.getElementById(id);
            if (el) el.textContent = Number(value || 0).toLocaleString('ru-RU');
        };
        set('status-stat-total',total);
        set('status-stat-visible',visible);
        set('status-stat-hidden',hidden);
        set('status-stat-dealers',assigned);
    }

    function renderStatusManagerList() {
        if (!statusListContainer) return;
        renderStatusManagerStats();

        if (!statusList.length) {
            statusListContainer.innerHTML = '<div class="status-manager-empty"><i class="bi bi-tag"></i><span>Статусы ещё не созданы</span></div>';
            return;
        }

        const editingId = String(document.getElementById('st_id')?.value || '');
        statusListContainer.innerHTML = statusList.map((status,index) => {
            const id = String(status.id || status._id || '');
            const count = statusDealerCount(status.value);
            const visible = status.isVisible !== false;
            const color = statusColor(status.color);
            const deleteTitle = count > 0 ? `Статус используется: ${count} дил.` : 'Удалить статус';
            return `
                <article class="status-manager-item ${editingId === id ? 'is-editing' : ''}" data-status-id="${safeAttr(id)}">
                    <div class="status-manager-item-main">
                        <span class="status-manager-color" style="background:${safeAttr(color)}"></span>
                        <div class="status-manager-copy">
                            <strong>${safeText(status.label || status.value || 'Без названия')}</strong>
                            <div class="status-manager-meta">
                                <span class="status-manager-code">${safeText(status.value || '—')}</span>
                                <span class="status-manager-count"><i class="bi bi-shop"></i>${count} дил.</span>
                            </div>
                        </div>
                    </div>
                    <div class="status-manager-actions">
                        <button type="button" class="status-manager-eye ${visible ? '' : 'is-hidden'}" data-status-action="visibility" title="${visible ? 'Скрыть из рабочего списка' : 'Показывать в рабочем списке'}">
                            <i class="bi bi-${visible ? 'eye-fill' : 'eye-slash'}"></i>
                            <span>${visible ? 'Показывается' : 'Скрыт'}</span>
                        </button>
                        <span class="status-manager-reorder" title="Изменить порядок">
                            <button type="button" data-status-action="up" ${index === 0 ? 'disabled' : ''}><i class="bi bi-chevron-up"></i></button>
                            <button type="button" data-status-action="down" ${index === statusList.length - 1 ? 'disabled' : ''}><i class="bi bi-chevron-down"></i></button>
                        </span>
                        <button type="button" class="status-manager-icon-btn" data-status-action="edit" title="Редактировать"><i class="bi bi-pencil"></i></button>
                        <button type="button" class="status-manager-icon-btn is-danger" data-status-action="delete" title="${safeAttr(deleteTitle)}" ${count > 0 ? 'disabled' : ''}><i class="bi bi-trash"></i></button>
                    </div>
                </article>`;
        }).join('');
    }

    function updateStatusColorPreview() {
        const input = document.getElementById('st_color');
        const dot = document.querySelector('#status-color-preview i');
        if (input && dot) dot.style.background = statusColor(input.value);
    }

    function resetStatusForm(options = {}) {
        if (!statusForm) return;
        statusForm.reset();
        const idInput = document.getElementById('st_id');
        const codeInput = document.getElementById('st_value');
        const colorInput = document.getElementById('st_color');
        const visibleInput = document.getElementById('st_visible');
        const saveBtn = document.getElementById('btn-save-status');
        const cancelBtn = document.getElementById('btn-cancel-edit-status');
        const kicker = document.getElementById('status-editor-kicker');
        const title = document.getElementById('status-editor-title');

        if (idInput) idInput.value = '';
        if (codeInput) {
            codeInput.value = '';
            codeInput.disabled = false;
            codeInput.title = '';
            const help = codeInput.closest('.status-editor-field')?.querySelector('small');
            if (help) help.textContent = 'Системный код на латинице. После использования лучше его не менять.';
        }
        if (colorInput) colorInput.value = '#B9040A';
        if (visibleInput) visibleInput.checked = true;
        if (saveBtn) saveBtn.innerHTML = '<i class="bi bi-plus-lg"></i><span>Добавить статус</span>';
        if (cancelBtn) cancelBtn.textContent = 'Очистить';
        if (kicker) kicker.textContent = 'НОВЫЙ СТАТУС';
        if (title) title.textContent = 'Добавить статус';

        updateStatusColorPreview();
        renderStatusManagerList();

        if (options.focus) {
            document.getElementById('st_label')?.focus();
            if (window.innerWidth < 768) document.getElementById('status-manager-editor')?.scrollIntoView({behavior:'smooth',block:'start'});
        }
    }

    function translitStatusCode(value) {
        const map = {
            'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'e','ж':'zh','з':'z','и':'i','й':'y',
            'к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f',
            'х':'h','ц':'c','ч':'ch','ш':'sh','щ':'sch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya',
            'қ':'q','ғ':'g','ң':'n','ө':'o','ұ':'u','ү':'u','һ':'h','і':'i','ә':'a'
        };
        return String(value || '').trim().toLowerCase().split('').map(ch => map[ch] ?? ch).join('')
            .replace(/[^a-z0-9]+/g,'_')
            .replace(/^_+|_+$/g,'')
            .replace(/_+/g,'_')
            .slice(0,48);
    }

    function editStatus(id) {
        const status = statusList.find(item => String(item.id || item._id) === String(id));
        if (!status) return;

        const count = statusDealerCount(status.value);
        document.getElementById('st_id').value = status.id || status._id || '';
        document.getElementById('st_label').value = status.label || '';
        const codeInput = document.getElementById('st_value');
        codeInput.value = status.value || '';
        codeInput.disabled = count > 0;
        codeInput.title = count > 0 ? 'Код заблокирован, потому что статус уже используется дилерами' : '';
        const help = codeInput.closest('.status-editor-field')?.querySelector('small');
        if (help) help.textContent = count > 0
            ? `Код заблокирован: этот статус используют ${count} дил. Название и цвет можно менять безопасно.`
            : 'Системный код на латинице. После использования лучше его не менять.';

        document.getElementById('st_color').value = statusColor(status.color);
        document.getElementById('st_visible').checked = status.isVisible !== false;
        document.getElementById('status-editor-kicker').textContent = 'РЕДАКТИРОВАНИЕ';
        document.getElementById('status-editor-title').textContent = status.label || status.value || 'Статус';
        document.getElementById('btn-save-status').innerHTML = '<i class="bi bi-check-lg"></i><span>Сохранить изменения</span>';
        document.getElementById('btn-cancel-edit-status').textContent = 'Отмена';

        updateStatusColorPreview();
        renderStatusManagerList();
        if (window.innerWidth < 768) document.getElementById('status-manager-editor')?.scrollIntoView({behavior:'smooth',block:'start'});
    }

    async function toggleStatusVisibility(id) {
        const status = statusList.find(item => String(item.id || item._id) === String(id));
        if (!status) return;
        try {
            const response = await fetch(`${API_STATUSES_URL}/${id}`, {
                method:'PUT',
                headers:{'Content-Type':'application/json'},
                body:JSON.stringify({isVisible: status.isVisible === false})
            });
            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data.error || 'Не удалось изменить видимость');
            }
            window.showToast(status.isVisible === false ? 'Статус снова показывается' : 'Статус скрыт из рабочего списка');
            await fetchStatuses();
        } catch (error) {
            window.showToast(error.message || 'Ошибка изменения статуса','error');
        }
    }

    async function moveStatus(id,direction) {
        const index = statusList.findIndex(item => String(item.id || item._id) === String(id));
        const target = index + direction;
        if (index < 0 || target < 0 || target >= statusList.length) return;

        const current = statusList[index];
        const other = statusList[target];
        const currentOrder = Number.isFinite(Number(current.sortOrder)) ? Number(current.sortOrder) : (index + 1) * 10;
        const otherOrder = Number.isFinite(Number(other.sortOrder)) ? Number(other.sortOrder) : (target + 1) * 10;

        try {
            const responses = await Promise.all([
                fetch(`${API_STATUSES_URL}/${current.id || current._id}`, {
                    method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({sortOrder:otherOrder})
                }),
                fetch(`${API_STATUSES_URL}/${other.id || other._id}`, {
                    method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({sortOrder:currentOrder})
                })
            ]);
            if (responses.some(response => !response.ok)) throw new Error('Не удалось изменить порядок');
            await fetchStatuses();
        } catch (error) {
            window.showToast(error.message || 'Ошибка изменения порядка','error');
        }
    }

    async function deleteStatus(id) {
        const status = statusList.find(item => String(item.id || item._id) === String(id));
        if (!status) return;
        const count = statusDealerCount(status.value);
        if (count > 0) {
            window.showToast(`Статус используют ${count} дил. Сначала переведите их на другой статус.`,'warning');
            return;
        }
        if (!confirm(`Удалить статус «${status.label || status.value}»? Это действие нельзя отменить.`)) return;

        try {
            const response = await fetch(`${API_STATUSES_URL}/${id}`,{method:'DELETE'});
            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data.error || 'Не удалось удалить статус');
            }
            window.showToast('Статус удалён');
            resetStatusForm();
            await fetchStatuses();
        } catch (error) {
            window.showToast(error.message || 'Ошибка удаления','error');
        }
    }

    statusListContainer?.addEventListener('click', event => {
        const button = event.target.closest('[data-status-action]');
        const item = event.target.closest('[data-status-id]');
        if (!button || !item) return;
        const id = item.dataset.statusId;
        const action = button.dataset.statusAction;
        if (action === 'edit') editStatus(id);
        if (action === 'delete') deleteStatus(id);
        if (action === 'visibility') toggleStatusVisibility(id);
        if (action === 'up') moveStatus(id,-1);
        if (action === 'down') moveStatus(id,1);
    });

    document.getElementById('btn-new-status')?.addEventListener('click', () => resetStatusForm({focus:true}));
    document.getElementById('btn-cancel-edit-status')?.addEventListener('click', () => resetStatusForm());
    document.getElementById('status-generate-code')?.addEventListener('click', () => {
        const codeInput = document.getElementById('st_value');
        if (!codeInput || codeInput.disabled) return;
        codeInput.value = translitStatusCode(document.getElementById('st_label')?.value);
        codeInput.focus();
    });
    document.getElementById('st_label')?.addEventListener('blur', () => {
        const codeInput = document.getElementById('st_value');
        if (codeInput && !codeInput.disabled && !codeInput.value.trim()) {
            codeInput.value = translitStatusCode(document.getElementById('st_label')?.value);
        }
    });
    document.getElementById('st_value')?.addEventListener('input', event => {
        if (!event.target.disabled) event.target.value = translitStatusCode(event.target.value);
    });
    document.getElementById('st_color')?.addEventListener('input', updateStatusColorPreview);

    if (statusForm) {
        statusForm.addEventListener('submit', async event => {
            event.preventDefault();
            const id = String(document.getElementById('st_id')?.value || '');
            const label = String(document.getElementById('st_label')?.value || '').trim();
            const codeInput = document.getElementById('st_value');
            const value = String(codeInput?.value || '').trim();
            const color = statusColor(document.getElementById('st_color')?.value);
            const isVisible = Boolean(document.getElementById('st_visible')?.checked);

            if (!label || !value) {
                window.showToast('Заполните название и код статуса','warning');
                return;
            }
            const duplicate = statusList.find(item =>
                String(item.value || '').toLowerCase() === value.toLowerCase() &&
                String(item.id || item._id) !== id
            );
            if (duplicate) {
                window.showToast('Такой системный код уже используется','warning');
                return;
            }

            const body = {value,label,color,isVisible};
            if (!id) {
                const maxOrder = statusList.reduce((max,item,index) => Math.max(max,Number(item.sortOrder) || (index + 1) * 10),0);
                body.sortOrder = maxOrder + 10;
            }

            const button = document.getElementById('btn-save-status');
            const previous = button?.innerHTML;
            if (button) {
                button.disabled = true;
                button.innerHTML = '<span class="spinner-border spinner-border-sm"></span><span>Сохраняем…</span>';
            }
            try {
                const response = await fetch(id ? `${API_STATUSES_URL}/${id}` : API_STATUSES_URL, {
                    method:id ? 'PUT' : 'POST',
                    headers:{'Content-Type':'application/json'},
                    body:JSON.stringify(body)
                });
                if (!response.ok) {
                    const data = await response.json().catch(() => ({}));
                    throw new Error(data.error || 'Не удалось сохранить статус');
                }
                window.showToast(id ? 'Статус обновлён' : 'Статус добавлен');
                resetStatusForm();
                await fetchStatuses();
            } catch (error) {
                window.showToast(error.message || 'Ошибка сохранения','error');
            } finally {
                if (button) {
                    button.disabled = false;
                    if (previous && document.getElementById('st_id')?.value) button.innerHTML = previous;
                    else button.innerHTML = '<i class="bi bi-plus-lg"></i><span>Добавить статус</span>';
                }
            }
        });
    }

    // --- STANDARD API ---
    async function fetchProductCatalog() { if (fullProductCatalog.length > 0) return; const response = await fetch(API_PRODUCTS_URL); if (!response.ok) throw new Error("Ошибка каталога"); fullProductCatalog = await response.json(); fullProductCatalog.sort((a, b) => a.sku.localeCompare(b.sku, 'ru', { numeric: true })); }
    async function fetchCompetitorsRef() {
        if (competitorsRef.length > 0) return;
        if (!window.CRMAuth || !CRMAuth.can('can_view_competitors')) {
            competitorsRef = [];
            updateBrandsDatalist();
            return;
        }
        const response = await fetch(API_COMPETITORS_REF_URL);
        if (!response.ok) throw new Error("Ошибка справочника конкурентов");
        competitorsRef = await response.json();
        updateBrandsDatalist();
    }
    function updateBrandsDatalist() { if (!brandsDatalist) return; let html = ''; competitorsRef.forEach(ref => { html += `<option value="${ref.name}">`; }); brandsDatalist.innerHTML = html; }
    function updatePosDatalist() { if (!posDatalist) return; let html = ''; posMaterialsList.forEach(s => { html += `<option value="${s}">`; }); posDatalist.innerHTML = html; }
    function populateFilters(dealers) {
        if(!filterCity || !filterPriceType) return;

        const uniqueNormalized = (values) => {
            const map = new Map();
            values.forEach(value => {
                const clean = normalizeDisplayValue(value);
                if (!clean) return;
                const key = clean.toLocaleLowerCase('ru-RU');
                if (!map.has(key)) map.set(key, clean);
            });
            return [...map.values()].sort((a,b) => a.localeCompare(b, 'ru'));
        };

        const cities = uniqueNormalized(dealers.map(d => d.city));
        const types = uniqueNormalized(dealers.map(dealerPriceListName));
        const sectors = uniqueNormalized(dealers.map(d => d.region_sector));

        const sc = normalizeDisplayValue(filterCity.value);
        const st = normalizeDisplayValue(filterPriceType.value);

        filterCity.innerHTML = '<option value="">Все города</option>';
        filterPriceType.innerHTML = '<option value="">Все прайсы</option>';
        cities.forEach(c => filterCity.add(new Option(c, c)));
        types.forEach(t => filterPriceType.add(new Option(t, t)));
        if (cities.includes(sc)) filterCity.value = sc;
        if (types.includes(st)) filterPriceType.value = st;

        const fs = document.getElementById('filter-sector');
        if(fs) {
            const currSec = normalizeDisplayValue(fs.value);
            fs.innerHTML = '<option value="">Все сектора</option>';
            sectors.forEach(s => fs.add(new Option(s, s)));
            if (sectors.includes(currSec)) fs.value = currSec;
        }
    }
    async function saveProducts(dealerId, ids) {
        if (!window.CRMAuth || !CRMAuth.can('can_edit_matrix')) return;
        const response = await fetch(`${API_DEALERS_URL}/${dealerId}/products`, {
            method:'PUT',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({productIds: ids})
        });
        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.error || 'Не удалось сохранить матрицу');
        }
    }
    async function completeTask(btn, dealerId, visitIndex) {
        if (!window.CRMAuth || !CRMAuth.can('can_manage_visits')) {
            window.showToast("Нет права управлять визитами", "error");
            return;
        }
        try {
            btn.disabled = true;
            const response = await fetch(`${API_DEALERS_URL}/${dealerId}/visits/${visitIndex}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isCompleted: true })
            });
            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data.error || 'Не удалось выполнить задачу');
            }
            await initApp();
            window.showToast("Задача выполнена!");
        } catch (e) {
            window.showToast(e.message || "Ошибка", "error");
            btn.disabled = false;
            btn.innerHTML = '<i class="bi bi-check-lg"></i>';
        }
    }

   function getDealerListMetrics(dealer) {
        const canViewSales = Boolean(window.CRMAuth && CRMAuth.can('can_view_sales'));
        const canViewVisits = Boolean(window.CRMAuth && CRMAuth.can('can_view_dashboard'));
        const rows = canViewSales ? getSalesForDealer(dealer) : [];
        const totals = window.CRMScore?.getSalesTotals
            ? CRMScore.getSalesTotals(rows)
            : {
                fact: rows.reduce((sum, row) => sum + (Number(row.fact) || 0), 0),
                plan: rows.reduce((sum, row) => sum + (Number(row.plan) || 0), 0)
            };

        const fact = Number(totals.fact) || 0;
        const plan = Number(totals.plan) || 0;
        const achievement = plan > 0 ? Math.round(fact / plan * 100) : null;

        const taskDealer = getTaskDealer(dealer.id);
        const visits = canViewVisits ? (taskDealer?.visits || dealer.visits || []) : [];
        const latestVisit = window.CRMScore?.latestCompletedVisit
            ? CRMScore.latestCompletedVisit(visits)
            : null;

        let daysSinceVisit = null;
        if (latestVisit?._date) {
            daysSinceVisit = Math.max(0, Math.floor((Date.now() - latestVisit._date.getTime()) / 86400000));
        }

        const today = new Date();
        today.setHours(0,0,0,0);
        const pendingVisits = visits
            .filter(v => v && !v.isCompleted && v.date)
            .map(v => ({ ...v, _date: new Date(v.date) }))
            .filter(v => !Number.isNaN(v._date.getTime()))
            .sort((a,b) => a._date - b._date);

        const overdueVisit = pendingVisits.find(v => {
            const d = new Date(v._date);
            d.setHours(0,0,0,0);
            return d < today;
        }) || null;

        const openClaims = (reclamationsData || []).filter(r =>
            !r.resolution && String(r.dealerId || '') === String(dealer.id)
        ).length;

        const health = getDealerHealth(dealer);
        const needsVisit = canViewVisits && (!latestVisit || daysSinceVisit > 60 || Boolean(overdueVisit));
        const planRisk = plan > 0 && achievement < 70;
        const problem = dealer.status === 'problem' || health.score < 40 || openClaims > 0;

        const signals = [];
        if (dealer.status === 'problem') signals.push({ level:'risk', icon:'exclamation-diamond', text:'Проблемный статус' });
        if (openClaims > 0) signals.push({ level:'risk', icon:'shield-exclamation', text:`Рекламаций: ${openClaims}` });
        if (overdueVisit) signals.push({ level:'risk', icon:'calendar-x', text:'Просрочен визит' });
        if (planRisk) signals.push({ level:achievement < 50 ? 'risk' : 'warn', icon:'bullseye', text:`План ${achievement}%` });
        if (canViewSales && fact <= 0 && ['active','standard'].includes(dealer.status || 'standard')) {
            signals.push({ level:'warn', icon:'graph-down', text:'Нет продаж' });
        }
        if (canViewVisits && !overdueVisit && (!latestVisit || daysSinceVisit > 60)) {
            signals.push({
                level:'warn',
                icon:'geo-alt',
                text: latestVisit ? `Не были ${daysSinceVisit} дн.` : 'Нет визитов'
            });
        }

        return {
            fact, plan, achievement, health,
            latestVisit, daysSinceVisit, overdueVisit, openClaims,
            needsVisit, planRisk, problem, signals
        };
    }

    function formatDealerVisit(metrics) {
        if (!window.CRMAuth || !CRMAuth.can('can_view_dashboard')) {
            return { value:'—', foot:'Нет доступа' };
        }
        if (!metrics.latestVisit?._date) {
            return { value:'Не было', foot:'Визитов нет' };
        }
        if (metrics.daysSinceVisit === 0) {
            return { value:'Сегодня', foot:metrics.latestVisit._date.toLocaleDateString('ru-RU') };
        }
        return {
            value:`${metrics.daysSinceVisit} дн.`,
            foot:metrics.latestVisit._date.toLocaleDateString('ru-RU', {day:'numeric', month:'short'})
        };
    }

    function dealerPriceListName(dealer) {
        return normalizeDisplayValue(dealer?.price_list?.name || dealer?.price_type || '');
    }

    function responsibleLabel(value) {
        const labels = {
            regional_astana: 'Астана',
            regional_regions: 'Регионы',
            office: 'Офис'
        };
        return labels[value] || 'Ответственный не назначен';
    }


    function persistDealerRoute() {
        localStorage.setItem('dealer_route_v1', JSON.stringify(dealerRouteIds));
    }

    function cleanDealerRoute() {
        if (!allDealers.length || !dealerRouteIds.length) return;
        const validIds = new Set(allDealers.filter(isWorkingDealer).map(d => String(d.id)));
        const cleaned = dealerRouteIds.filter((id, index, arr) => validIds.has(String(id)) && arr.indexOf(id) === index);
        if (cleaned.length !== dealerRouteIds.length) {
            dealerRouteIds = cleaned;
            persistDealerRoute();
        }
    }

    function selectedRouteDealers() {
        return dealerRouteIds
            .map(id => allDealers.find(d => isWorkingDealer(d) && String(d.id) === String(id)))
            .filter(Boolean);
    }

    function refreshRouteSelectionUI() {
        cleanDealerRoute();
        const selected = selectedRouteDealers();
        const count = selected.length;
        document.body.classList.toggle('dealer-route-active', count > 0);

        if (dealerRouteBar) dealerRouteBar.hidden = count === 0;
        const countEl = document.getElementById('dealer-route-count');
        const namesEl = document.getElementById('dealer-route-names');
        if (countEl) countEl.textContent = String(count);
        if (namesEl) {
            const names = selected.slice(0, 3).map(d => d.name).filter(Boolean);
            namesEl.textContent = names.length
                ? names.join(' · ') + (count > 3 ? ` +${count - 3}` : '')
                : 'Выберите дилеров из списка';
        }

        document.querySelectorAll('[data-route-toggle]').forEach(btn => {
            const active = dealerRouteIds.includes(String(btn.dataset.routeToggle));
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-pressed', active ? 'true' : 'false');
            const text = btn.querySelector('span');
            const icon = btn.querySelector('i');
            if (text) text.textContent = active ? 'В маршруте' : 'В маршрут';
            if (icon) icon.className = active ? 'bi bi-check2' : 'bi bi-plus-lg';
            btn.title = active ? 'Убрать из маршрута' : 'Добавить в маршрут';
        });
    }

    window.toggleDealerRoute = function(id) {
        const key = String(id);
        const index = dealerRouteIds.indexOf(key);
        if (index >= 0) dealerRouteIds.splice(index, 1);
        else dealerRouteIds.push(key);
        persistDealerRoute();
        refreshRouteSelectionUI();
        if (dealerRouteModalEl?.classList.contains('show')) renderDealerRouteModal();
    };

    window.moveDealerRoute = function(id, direction) {
        const key = String(id);
        const index = dealerRouteIds.indexOf(key);
        const next = index + Number(direction);
        if (index < 0 || next < 0 || next >= dealerRouteIds.length) return;
        [dealerRouteIds[index], dealerRouteIds[next]] = [dealerRouteIds[next], dealerRouteIds[index]];
        persistDealerRoute();
        renderDealerRouteModal();
        refreshRouteSelectionUI();
    };

    window.removeDealerFromRoute = function(id) {
        dealerRouteIds = dealerRouteIds.filter(x => String(x) !== String(id));
        persistDealerRoute();
        renderDealerRouteModal();
        refreshRouteSelectionUI();
    };

    function clearDealerRouteSelection() {
        dealerRouteIds = [];
        persistDealerRoute();
        renderDealerRouteModal();
        refreshRouteSelectionUI();
    }

    function renderDealerRouteModal() {
        if (!dealerRouteList) return;
        const selected = selectedRouteDealers();

        if (!selected.length) {
            dealerRouteList.innerHTML = '<div class="dealer-route-empty"><i class="bi bi-signpost-split"></i><strong>Маршрут пуст</strong><span>Отметьте нужных дилеров в списке.</span></div>';
            if (dealerRouteOpen) dealerRouteOpen.disabled = true;
            return;
        }

        dealerRouteList.innerHTML = selected.map((d, index) => {
            const hasCoords = Number.isFinite(Number(d.latitude)) && Number.isFinite(Number(d.longitude));
            const meta = [normalizeDisplayValue(d.city), normalizeDisplayValue(d.address)].filter(Boolean).join(' · ') || 'Адрес не указан';
            return `<div class="dealer-route-row">
                <span class="dealer-route-order">${index + 1}</span>
                <span class="dealer-route-row-main">
                    <strong>${safeText(d.name)}</strong>
                    <small>${safeText(meta)}</small>
                </span>
                <span class="dealer-route-coords ${hasCoords ? 'ok' : 'missing'}" title="${hasCoords ? 'Координаты есть' : 'Нет координат'}"><i class="bi bi-${hasCoords ? 'geo-alt-fill' : 'geo-alt'}"></i></span>
                <span class="dealer-route-row-actions">
                    <button type="button" onclick="moveDealerRoute('${safeAttr(d.id)}',-1)" ${index === 0 ? 'disabled' : ''} title="Выше"><i class="bi bi-chevron-up"></i></button>
                    <button type="button" onclick="moveDealerRoute('${safeAttr(d.id)}',1)" ${index === selected.length - 1 ? 'disabled' : ''} title="Ниже"><i class="bi bi-chevron-down"></i></button>
                    <button type="button" class="remove" onclick="removeDealerFromRoute('${safeAttr(d.id)}')" title="Убрать"><i class="bi bi-x-lg"></i></button>
                </span>
            </div>`;
        }).join('');

        if (dealerRouteOpen) {
            const coordsCount = selected.filter(d => Number.isFinite(Number(d.latitude)) && Number.isFinite(Number(d.longitude))).length;
            dealerRouteOpen.disabled = coordsCount === 0;
            dealerRouteOpen.innerHTML = `<i class="bi bi-box-arrow-up-right"></i> Открыть в 2ГИС · ${coordsCount}`;
        }
    }

    function get2GisCitySlug(city) {
        const key = String(city || '').toLowerCase().replace(/ё/g, 'е').trim();
        const cityMap = {
            'астана': 'astana', 'нур-султан': 'astana',
            'алматы': 'almaty',
            'шымкент': 'shymkent',
            'караганда': 'karaganda', 'қарағанды': 'karaganda',
            'костанай': 'kostanay', 'қостанай': 'kostanay',
            'павлодар': 'pavlodar',
            'усть-каменогорск': 'ust-kamenogorsk', 'оскемен': 'ust-kamenogorsk', 'өскемен': 'ust-kamenogorsk',
            'семей': 'semey',
            'актобе': 'aktobe', 'ақтөбе': 'aktobe',
            'атырау': 'atyrau',
            'актау': 'aktau', 'ақтау': 'aktau',
            'тараз': 'taraz',
            'кызылорда': 'kyzylorda', 'қызылорда': 'kyzylorda',
            'уральск': 'uralsk', 'орал': 'uralsk',
            'петропавловск': 'petropavlovsk', 'петропавл': 'petropavlovsk',
            'кокшетау': 'kokshetau', 'көкшетау': 'kokshetau',
            'туркестан': 'turkestan', 'түркістан': 'turkestan',
            'талдыкорган': 'taldykorgan', 'талдықорған': 'taldykorgan',
            'экибастуз': 'ekibastuz'
        };
        return cityMap[key] || '';
    }

    function build2GisDealerUrl(dealer) {
        const slug = get2GisCitySlug(dealer?.city);
        const query = [dealer?.name, dealer?.address].filter(Boolean).join(' ') || dealer?.city || 'IDEAL FLOOR';
        const base = slug ? `https://2gis.kz/${slug}` : 'https://2gis.kz';
        const lat = Number(dealer?.latitude);
        const lng = Number(dealer?.longitude);
        const mapParam = Number.isFinite(lat) && Number.isFinite(lng) ? `?m=${lng},${lat}/17` : '';
        return `${base}/search/${encodeURIComponent(query)}${mapParam}`;
    }

    function openDealerRouteIn2Gis() {
        const selected = selectedRouteDealers();
        const withCoords = selected.filter(d => Number.isFinite(Number(d.latitude)) && Number.isFinite(Number(d.longitude)));
        const missing = selected.length - withCoords.length;

        if (!withCoords.length) {
            window.showToast('У выбранных дилеров нет координат', 'error');
            return;
        }

        let url = '';
        if (withCoords.length === 1) {
            url = build2GisDealerUrl(withCoords[0]);
        } else {
            const slug = get2GisCitySlug(withCoords[0]?.city) || 'astana';
            const points = withCoords.map(d => `|${Number(d.longitude)},${Number(d.latitude)}`).join(';');
            url = `https://2gis.kz/${slug}/directions/points/${encodeURIComponent(points)}`;
        }

        if (missing > 0) window.showToast(`${missing} дилер(а) без координат не добавлены в навигацию`, 'info');
        window.open(url, '_blank', 'noopener');
    }

    function applyDealerAvatar(img, url) {
        if (!img || !url) return;
        img.onload = () => img.closest('.dealer-v3-photo')?.classList.add('has-image');
        img.onerror = () => img.closest('.dealer-v3-photo')?.classList.remove('has-image');
        img.src = url;
    }

    async function loadDealerAvatar(img) {
        if (!img || img.dataset.avatarLoaded === '1' || img.dataset.avatarLoading === '1') return;
        const dealerId = img.dataset.dealerAvatar;
        if (!dealerId) return;

        if (dealerAvatarCache.has(dealerId)) {
            img.dataset.avatarLoaded = '1';
            applyDealerAvatar(img, dealerAvatarCache.get(dealerId));
            return;
        }

        img.dataset.avatarLoading = '1';
        try {
            const response = await fetch(`${API_DEALERS_URL}/${encodeURIComponent(dealerId)}/avatar`);
            if (!response.ok) throw new Error('avatar');
            const data = await response.json();
            const url = data.avatarUrl || '';
            dealerAvatarCache.set(dealerId, url);
            img.dataset.avatarLoaded = '1';
            applyDealerAvatar(img, url);
        } catch (e) {
            dealerAvatarCache.set(dealerId, '');
            img.dataset.avatarLoaded = '1';
        } finally {
            delete img.dataset.avatarLoading;
        }
    }

    function hydrateDealerAvatars() {
        if (!dealerGrid) return;
        const images = [...dealerGrid.querySelectorAll('img[data-dealer-avatar]')];
        if (!images.length) return;

        if (dealerAvatarObserver) dealerAvatarObserver.disconnect();

        if (!('IntersectionObserver' in window)) {
            images.slice(0, 12).forEach(loadDealerAvatar);
            return;
        }

        dealerAvatarObserver = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                dealerAvatarObserver.unobserve(entry.target);
                loadDealerAvatar(entry.target);
            });
        }, { rootMargin: '220px 0px' });

        images.forEach(img => dealerAvatarObserver.observe(img));
    }

    function dealerInfoChips(dealer) {
        const seen = new Set();
        const items = [];
        const add = (label, value, icon) => {
            const raw = normalizeDisplayValue(value);
            if (!raw) return;
            const key = raw.toLocaleLowerCase('ru-RU').replace(/\s+/g, ' ');
            if (seen.has(key)) return;
            seen.add(key);
            items.push({ label, value: raw, icon });
        };

        add('Город', dealer.city, 'geo-alt');
        add('Сектор', dealer.region_sector, 'diagram-3');
        add('Прайс', dealerPriceListName(dealer), 'receipt');
        add('Ответственный', responsibleLabel(dealer.responsible), 'person');

        return items;
    }

    function updateDealerQuickCounts(dealersWithMetrics) {
        const counts = {
            all: dealersWithMetrics.length,
            sales: dealersWithMetrics.filter(x => x.metrics.fact > 0).length,
            plan: dealersWithMetrics.filter(x => x.metrics.planRisk).length,
            visit: dealersWithMetrics.filter(x => x.metrics.needsVisit).length,
            problem: dealersWithMetrics.filter(x => x.metrics.problem).length
        };
        Object.entries(counts).forEach(([key,value]) => {
            const el = document.querySelector(`[data-quick-count="${key}"]`);
            if (el) el.textContent = value;
        });
    }

    function renderDealerList() {
        if (!dealerGrid) return;

        const canViewSalesForList = Boolean(window.CRMAuth && CRMAuth.can('can_view_sales'));
        const canViewVisitsForList = Boolean(window.CRMAuth && CRMAuth.can('can_view_dashboard'));
        const salesQuick = dealerQuickFilters?.querySelector('[data-filter="sales"]');
        const planQuick = dealerQuickFilters?.querySelector('[data-filter="plan"]');
        const visitQuick = dealerQuickFilters?.querySelector('[data-filter="visit"]');

        if (salesQuick) salesQuick.style.display = canViewSalesForList ? '' : 'none';
        if (planQuick) planQuick.style.display = canViewSalesForList ? '' : 'none';
        if (visitQuick) visitQuick.style.display = canViewVisitsForList ? '' : 'none';

        if ((!canViewSalesForList && ['sales','plan'].includes(dealerQuickFilter)) ||
            (!canViewVisitsForList && dealerQuickFilter === 'visit')) {
            dealerQuickFilter = 'all';
            dealerQuickFilters?.querySelectorAll('.dealer-quick-filter').forEach(el => {
                el.classList.toggle('active', el.dataset.filter === 'all');
            });
        }

        const city = filterCity?.value || '';
        const type = filterPriceType?.value || '';
        const status = filterStatus?.value || '';
        const responsible = filterResponsible?.value || '';
        const healthFilter = filterHealth?.value || '';
        const search = (searchBar?.value || '').trim().toLowerCase();
        const sector = document.getElementById('filter-sector')?.value || '';

        const baseFiltered = allDealers.filter(d => {
            let isVisible = true;
            if (!status) {
                // По умолчанию на главной показываем только рабочих дилеров.
                // Потенциальные и архивные остаются доступны через явный фильтр по статусу.
                if (isNonWorkingDealer(d)) {
                    isVisible = false;
                } else {
                    const statusObj = statusList.find(s => s.value === (d.status || 'standard'));
                    if (statusObj && (statusObj.isVisible === false || String(statusObj.isVisible) === 'false')) isVisible = false;
                }
            } else {
                isVisible = d.status === status;
            }

            const normalizedCity = normalizeDisplayValue(d.city);
            const normalizedType = dealerPriceListName(d);
            const normalizedSector = normalizeDisplayValue(d.region_sector);
            const searchable = [
                d.name, d.dealer_id, normalizedCity, d.address, normalizedSector, normalizedType,
                responsibleLabel(d.responsible)
            ].filter(Boolean).join(' ').toLowerCase();

            return isVisible &&
                (!city || normalizedCity === city) &&
                (!type || normalizedType === type) &&
                (!responsible ||
                    (responsible === '__unassigned__' && !d.responsible) ||
                    (responsible !== '__unassigned__' && String(d.responsible || '') === String(responsible))) &&
                (!sector || normalizedSector === sector) &&
                (!search || searchable.includes(search));
        });

        const enriched = baseFiltered.map(dealer => ({
            dealer,
            metrics: getDealerListMetrics(dealer)
        }));

        const scoreFiltered = healthFilter
            ? enriched.filter(({metrics}) => metrics.health.level === healthFilter)
            : enriched;

        updateDealerQuickCounts(scoreFiltered);

        let filtered = scoreFiltered.filter(({metrics}) => {
            if (dealerQuickFilter === 'sales') return metrics.fact > 0;
            if (dealerQuickFilter === 'plan') return metrics.planRisk;
            if (dealerQuickFilter === 'visit') return metrics.needsVisit;
            if (dealerQuickFilter === 'problem') return metrics.problem;
            return true;
        });

        const sortValue = dealerSortSelect?.value || 'dealer_id_asc';
        filtered.sort((a,b) => {
            if (sortValue === 'name_asc') {
                return String(a.dealer.name || '').localeCompare(String(b.dealer.name || ''), 'ru');
            }
            if (sortValue === 'sales_desc') return b.metrics.fact - a.metrics.fact;
            if (sortValue === 'achievement_asc') {
                const av = a.metrics.achievement === null ? Number.POSITIVE_INFINITY : a.metrics.achievement;
                const bv = b.metrics.achievement === null ? Number.POSITIVE_INFINITY : b.metrics.achievement;
                return av - bv;
            }
            if (sortValue === 'health_asc') return a.metrics.health.score - b.metrics.health.score;
            if (sortValue === 'health_desc') return b.metrics.health.score - a.metrics.health.score;
            if (sortValue === 'visit_desc') {
                const av = a.metrics.daysSinceVisit === null ? Number.POSITIVE_INFINITY : a.metrics.daysSinceVisit;
                const bv = b.metrics.daysSinceVisit === null ? Number.POSITIVE_INFINITY : b.metrics.daysSinceVisit;
                return bv - av;
            }
            return String(a.dealer.dealer_id || '').localeCompare(String(b.dealer.dealer_id || ''), undefined, {numeric:true});
        });

        if (dealerVisibleCount) {
            dealerVisibleCount.textContent = filtered.length === baseFiltered.length
                ? String(filtered.length)
                : `${filtered.length} из ${baseFiltered.length}`;
        }

        if (filtered.length === 0) {
            dealerGrid.innerHTML = `
                <div class="dealer-directory-empty">
                    <span><i class="bi bi-search"></i></span>
                    <strong>Дилеры не найдены</strong>
                    <p>Измените поиск или сбросьте фильтры.</p>
                    <button type="button" onclick="document.getElementById('dealer-reset-filters')?.click()">Сбросить фильтры</button>
                </div>`;
            refreshRouteSelectionUI();
            return;
        }

        const canViewSales = Boolean(window.CRMAuth && CRMAuth.can('can_view_sales'));
        const canEdit = Boolean(window.CRMAuth && CRMAuth.can('can_edit_dealer'));
        const canCreate = Boolean(window.CRMAuth && CRMAuth.can('can_create_dealer'));

        dealerGrid.innerHTML = filtered.map(({dealer:d, metrics}) => {
            const statusObj = statusList.find(s => s.value === (d.status || 'standard')) || {
                label: d.status || 'Стандарт',
                color: '#72747a'
            };

            const secondaryActions = [];
            if (Array.isArray(d.contacts) && d.contacts.length) {
                const phone = d.contacts.find(contact => contact?.contactInfo)?.contactInfo || '';
                const cleanPhone = phone.replace(/[^0-9]/g, '');
                if (cleanPhone.length >= 10) {
                    secondaryActions.push(`<a class="dealer-v3-menu-item" href="tel:+${cleanPhone}"><i class="bi bi-telephone"></i><span>Позвонить</span></a>`);
                    secondaryActions.push(`<a class="dealer-v3-menu-item is-whatsapp" href="https://wa.me/${cleanPhone}" target="_blank" rel="noopener"><i class="bi bi-whatsapp"></i><span>WhatsApp</span></a>`);
                }
            }

            if (d.latitude && d.longitude) {
                secondaryActions.push(`<a class="dealer-v3-menu-item" href="${safeAttr(build2GisDealerUrl(d))}" target="_blank" rel="noopener"><i class="bi bi-box-arrow-up-right"></i><span>Открыть в 2ГИС</span></a>`);
            }

            if (d.instagram) {
                let url = String(d.instagram).trim();
                if (!/^https?:\/\//i.test(url)) url = 'https://instagram.com/' + url.replace(/^@/, '');
                secondaryActions.push(`<a class="dealer-v3-menu-item" href="${safeAttr(url)}" target="_blank" rel="noopener"><i class="bi bi-instagram"></i><span>Instagram</span></a>`);
            }

            if (canEdit) {
                secondaryActions.push(`<button class="dealer-v3-menu-item" type="button" onclick="openEditModal('${safeAttr(d.id)}')"><i class="bi bi-pencil"></i><span>Редактировать</span></button>`);
            }
            if (canCreate) {
                secondaryActions.push(`<button class="dealer-v3-menu-item" type="button" onclick="openDuplicateDealer('${safeAttr(d.id)}')"><i class="bi bi-copy"></i><span>Дублировать дилера</span></button>`);
            }

            const moreMenu = secondaryActions.length
                ? `<div class="dropdown dealer-v3-more" onclick="event.stopPropagation()">
                    <button class="dealer-v3-more-btn" type="button" data-bs-toggle="dropdown" aria-expanded="false" title="Ещё">
                        <i class="bi bi-three-dots"></i>
                    </button>
                    <div class="dropdown-menu dropdown-menu-end dealer-v3-menu">${secondaryActions.join('')}</div>
                </div>`
                : '';

            const quickVisitBtn = (window.CRMAuth && CRMAuth.can('can_manage_visits'))
                ? `<button class="dealer-v3-primary-action is-visit" type="button" onclick="event.stopPropagation(); showQuickVisit('${safeAttr(d.id)}')"><i class="bi bi-journal-check"></i><span>Визит</span></button>`
                : '';
            const routeActive = dealerRouteIds.includes(String(d.id));
            const routeToggleBtn = `<button class="dealer-v3-primary-action is-route ${routeActive ? 'active' : ''}" type="button" data-route-toggle="${safeAttr(d.id)}" aria-pressed="${routeActive ? 'true' : 'false'}" onclick="event.stopPropagation(); toggleDealerRoute('${safeAttr(d.id)}')"><i class="bi bi-${routeActive ? 'check2' : 'plus-lg'}"></i><span>${routeActive ? 'В маршруте' : 'В маршрут'}</span></button>`;

            const visit = formatDealerVisit(metrics);
            let planValue = 'Без плана';
            let planFoot = 'Индивидуальный план не задан';
            let progressWidth = 0;
            let progressLevel = 'none';

            if (!canViewSales) {
                planValue = '—';
                planFoot = 'Нет доступа';
            } else if (metrics.plan > 0) {
                planValue = `${metrics.achievement}%`;
                planFoot = `${formatExactSqm(metrics.fact)} из ${formatExactSqm(metrics.plan)} м²`;
                progressWidth = Math.min(metrics.achievement, 100);
                progressLevel = metrics.achievement >= 90 ? 'good' : metrics.achievement >= 70 ? 'mid' : 'risk';
            } else if (d.hasPersonalPlan) {
                planValue = 'Не задан';
                planFoot = 'Нужно заполнить план';
            }

            const infoChips = dealerInfoChips(d);
            const infoHtml = infoChips.length
                ? infoChips.map(item => `<span class="dealer-v3-info" title="${safeAttr(item.label + ': ' + item.value)}"><i class="bi bi-${item.icon}"></i><span>${safeText(item.value)}</span></span>`).join('')
                : '<span class="dealer-v3-info is-muted"><i class="bi bi-info-circle"></i><span>Основные данные не заполнены</span></span>';

            const signals = metrics.signals.slice(0, 2);
            const signalsHtml = signals.length
                ? signals.map(signal => `<span class="dealer-v3-signal is-${signal.level}"><i class="bi bi-${signal.icon}"></i>${safeText(signal.text)}</span>`).join('')
                : '<span class="dealer-v3-signal is-ok"><i class="bi bi-check2-circle"></i>Без критичных сигналов</span>';

            const score = Math.max(0, Math.min(100, Number(metrics.health.score) || 0));
            const initial = safeText((d.name || 'Д').trim().charAt(0).toUpperCase());

            const metaHtml = infoChips
                .filter(item => ['Город','Сектор','Прайс'].includes(item.label))
                .slice(0,3)
                .map(item => `<span><i class="bi bi-${item.icon}"></i>${safeText(item.value)}</span>`)
                .join('');

            const mainSignal = signals[0]
                ? `<span class="dealer-list-v6-signal is-${signals[0].level}"><i class="bi bi-${signals[0].icon}"></i>${safeText(signals[0].text)}</span>`
                : '<span class="dealer-list-v6-signal is-ok"><i class="bi bi-check2-circle"></i>Без критичных сигналов</span>';

            const routeSelect = `<button class="dealer-list-v6-route ${routeActive ? 'active' : ''}" type="button" data-route-toggle="${safeAttr(d.id)}" aria-pressed="${routeActive ? 'true' : 'false'}" onclick="event.stopPropagation(); toggleDealerRoute('${safeAttr(d.id)}')" title="${routeActive ? 'Убрать из маршрута' : 'Добавить в маршрут'}"><i class="bi bi-${routeActive ? 'check2' : 'plus-lg'}"></i></button>`;

            return `<article class="dealer-list-v6-card ${metrics.problem ? 'has-risk' : ''}" onclick="window.location.href='dealer.html?id=${encodeURIComponent(d.id)}'">
                <div class="dealer-list-v6-route-cell">${routeSelect}</div>

                <div class="dealer-list-v6-main">
                    <div class="dealer-v3-photo dealer-list-v6-photo">
                        <img data-dealer-avatar="${safeAttr(d.id)}" alt="" loading="lazy">
                        <span>${initial}</span>
                    </div>
                    <div class="dealer-list-v6-copy">
                        <div class="dealer-list-v6-name-line">
                            <a href="dealer.html?id=${encodeURIComponent(d.id)}" class="dealer-list-v6-name" onclick="event.stopPropagation()">${safeText(d.name)}</a>
                            <span class="dealer-list-v6-status" style="--status-color:${safeAttr(statusObj.color || '#72747a')}">${safeText(statusObj.label)}</span>
                        </div>
                        <div class="dealer-list-v6-meta">${metaHtml || '<span>Данные не заполнены</span>'}</div>
                        <div class="dealer-list-v6-sub">
                            <span>ID ${safeText(d.dealer_id || '—')}</span>
                            ${mainSignal}
                        </div>
                    </div>
                </div>

                <div class="dealer-list-v6-cell">
                    <span class="dealer-list-v6-label">Продажи</span>
                    <strong>${canViewSales ? formatExactSqm(metrics.fact) + ' м²' : '—'}</strong>
                    <small>${canViewSales ? (metrics.fact > 0 ? 'текущий месяц' : 'нет продаж') : 'нет доступа'}</small>
                </div>

                <div class="dealer-list-v6-cell">
                    <span class="dealer-list-v6-label">План</span>
                    <strong>${planValue}</strong>
                    <small>${planFoot}</small>
                    <div class="dealer-list-v6-progress is-${progressLevel}"><i style="width:${progressWidth}%"></i></div>
                </div>

                <div class="dealer-list-v6-cell">
                    <span class="dealer-list-v6-label">Последний визит</span>
                    <strong>${visit.value}</strong>
                    <small>${visit.foot}</small>
                </div>

                <div class="dealer-list-v6-score is-${metrics.health.level}">
                    <strong>${score}</strong>
                    <span>/100</span>
                    <small>${safeText(metrics.health.label)}</small>
                </div>

                <div class="dealer-list-v6-actions" onclick="event.stopPropagation()">
                    ${quickVisitBtn}
                    ${moreMenu}
                    <a href="dealer.html?id=${encodeURIComponent(d.id)}" class="dealer-list-v6-open" title="Открыть карточку"><i class="bi bi-arrow-right"></i></a>
                </div>
            </article>`;
        }).join('');
        hydrateDealerAvatars();
        refreshRouteSelectionUI();
    }

    let globalSearchIndex = 0;
    let globalSearchReady = false;
    function setupGlobalSearch() {
        if (globalSearchReady) return;
        globalSearchReady = true;
        const overlay = document.getElementById('global-search-overlay');
        const trigger = document.getElementById('global-search-trigger');
        const input = document.getElementById('global-search-input');
        const results = document.getElementById('global-search-results');
        if (!overlay || !input || !results) return;

        const open = () => {
            overlay.classList.add('open');
            overlay.setAttribute('aria-hidden','false');
            globalSearchIndex = 0;
            input.value = '';
            renderGlobalSearchResults('');
            setTimeout(() => input.focus(), 20);
        };
        const close = () => {
            overlay.classList.remove('open');
            overlay.setAttribute('aria-hidden','true');
        };

        if (trigger) trigger.onclick = open;
        overlay.onclick = e => { if (e.target === overlay) close(); };

        function searchableText(d) {
            return [
                d.dealer_id,d.name,d.city,d.address,d.region_sector,dealerPriceListName(d),
                ...(d.contacts || []).flatMap(x => [x.name,x.position,x.contactInfo])
            ].filter(Boolean).join(' ').toLowerCase();
        }

        window.renderGlobalSearchResults = function(query) {
            const q = (query || '').trim().toLowerCase();
            const matches = allDealers
                .filter(d => isWorkingDealer(d) && (!q || searchableText(d).includes(q)))
                .slice(0,10);

            globalSearchIndex = Math.min(globalSearchIndex, Math.max(0,matches.length-1));
            results.innerHTML = matches.length ? matches.map((d,i) => {
                const health=getDealerHealth(d);
                const avatar=d.photo_url ? `<img src="${d.photo_url}" alt="">` : '<i class="bi bi-shop"></i>';
                return `<a class="global-search-result ${i===globalSearchIndex?'active':''}" data-index="${i}" href="dealer.html?id=${d.id}">
                    <span class="global-search-avatar">${avatar}</span>
                    <span class="global-search-main">
                        <span class="global-search-name">${safeText(d.name)}</span>
                        <span class="global-search-meta">${safeText(d.dealer_id)} · ${safeText(d.city || 'Город не указан')}</span>
                    </span>
                    <span class="cc-health-pill ${health.level}">${health.score}</span>
                </a>`;
            }).join('') : '<div class="cc-empty">Ничего не найдено</div>';
        };

        input.oninput = () => { globalSearchIndex = 0; renderGlobalSearchResults(input.value); };
        input.onkeydown = e => {
            const rows=[...results.querySelectorAll('.global-search-result')];
            if (e.key === 'ArrowDown') { e.preventDefault(); globalSearchIndex=Math.min(globalSearchIndex+1,rows.length-1); renderGlobalSearchResults(input.value); }
            if (e.key === 'ArrowUp') { e.preventDefault(); globalSearchIndex=Math.max(globalSearchIndex-1,0); renderGlobalSearchResults(input.value); }
            if (e.key === 'Enter' && rows.length) { e.preventDefault(); const active=results.querySelector('.global-search-result.active') || rows[0]; window.location.href=active.href; }
            if (e.key === 'Escape') close();
        };

        document.addEventListener('keydown', e => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); open(); }
            else if (e.key === 'Escape' && overlay.classList.contains('open')) close();
        });
    }

    if(editModalEl) { const tabMapBtn = document.querySelector('button[data-bs-target="#tab-map"]'); if(tabMapBtn) { tabMapBtn.addEventListener('shown.bs.tab', () => { if (refreshEditMap) refreshEditMap(); }); } }
    function setAddDealerModalMode(mode, sourceName='') {
        const title = addModalEl?.querySelector('.dealer-modal-header .modal-title');
        const description = addModalEl?.querySelector('.dealer-modal-header p');
        if (mode === 'duplicate') {
            if (title) title.textContent = 'Дублирование дилера';
            if (description) description.textContent = 'Данные скопированы из ' + sourceName + '. При необходимости измените только данные конкретного салона.';
        } else {
            if (title) title.textContent = 'Новый дилер';
            if (description) description.textContent = 'Добавьте основные данные, контакты и информацию для работы с дилером.';
        }
    }

    window.openDuplicateDealer = async (id) => {
        if (!window.CRMAuth || !CRMAuth.can('can_create_dealer')) {
            window.showToast('Нет права создавать дилеров','error');
            return;
        }

        document.querySelectorAll('.dealer-v3-menu.show').forEach(menu => {
            bootstrap.Dropdown.getInstance(menu.previousElementSibling)?.hide();
        });

        try {
            await Promise.allSettled([fetchProductCatalog(), fetchCompetitorsRef(), fetchDealerPriceLists()]);
            const dealerRes = await fetch(`${API_DEALERS_URL}/${encodeURIComponent(id)}`);
            if (!dealerRes.ok) throw new Error('Не удалось загрузить исходного дилера');

            const d = await dealerRes.json();
            addCloneMeta = {
                sourceId: String(d.id || id),
                sourceDealerId: String(d.dealer_id || ''),
                sourceLabel: String(d.name || ''),
                responsibleUserId: String(d.responsibleUserId || '')
            };

            if (addForm) addForm.reset();
            populateStatusSelects(d.status || 'standard');

            const setValue = (fieldId,value) => {
                const el=document.getElementById(fieldId);
                if (el) el.value = value ?? '';
            };

            setValue('dealer_id',d.dealer_id || '');
            setValue('name',d.name || '');
            fillDealerPriceListSelect('price_list', d.price_list?.id || d.price_list || '');
            setValue('city',d.city || '');
            setValue('address',d.address || '');
            setValue('delivery',d.delivery || '');
            setValue('website',d.website || '');
            setValue('instagram',d.instagram || '');
            setValue('add_latitude',d.latitude || '');
            setValue('add_longitude',d.longitude || '');
            setValue('bonuses',d.bonuses || '');
            setValue('status',d.status || 'standard');

            const addResponsible=document.getElementById('responsible');
            if (addResponsible) {
                addResponsible.value=d.responsible || '';
                const sectorSelect=document.getElementById('add_region_sector');
                if (sectorSelect) sectorSelect.setAttribute('data-selected',d.region_sector || '');
                toggleSectorSelect('add',addResponsible.value);
                if (sectorSelect) sectorSelect.value=d.region_sector || '';
            }

            if (addLegalEntityList) {
                addLegalEntityList.innerHTML='';
                const legalEntities=getDealerLegalEntities(d);
                (legalEntities.length ? legalEntities : [{}]).forEach(entity => {
                    addLegalEntityList.insertAdjacentHTML('beforeend',createLegalEntityHTML(entity));
                });
            }

            renderList(addContactList,d.contacts || [],createContactEntryHTML);
            renderList(addAddressList,d.additional_addresses || [],createAddressEntryHTML);
            renderList(addPosList,[],createPosEntryHTML);
            renderList(addVisitsList,[],createVisitEntryHTML);
            renderList(addCompetitorList,d.competitors || [],createCompetitorEntryHTML);
            renderProductChecklist(addProductChecklist,(d.products || []).map(product => product?.id || product?._id || product).filter(Boolean));

            addPhotosData=[];
            renderPhotoPreviews(addPhotoPreviewContainer,[]);
            if (addAvatarPreview) {
                addAvatarPreview.src='';
                addAvatarPreview.style.display='none';
            }
            newAvatarBase64=null;

            const contractSigned=document.getElementById('add_contract_signed');
            const contractDate=document.getElementById('add_contract_date');
            const personalPlan=document.getElementById('add_has_personal_plan');
            if (contractSigned) contractSigned.checked=false;
            if (contractDate) contractDate.value='';
            if (personalPlan) personalPlan.checked=false;

            currentStep=1;
            showStep(1);
            document.querySelectorAll('[data-field-shortcuts="add"] button').forEach((item,index) => item.classList.toggle('active',index===0));
            setAddDealerModalMode('duplicate',d.name || d.dealer_id || 'исходного дилера');
            addModal.show();
            setTimeout(() => document.getElementById('name')?.focus({preventScroll:true}),180);
        } catch (e) {
            console.error('Dealer duplicate error',e);
            window.showToast(e.message || 'Не удалось подготовить копию дилера','error');
        }
    };

    if(openAddModalBtn) openAddModalBtn.onclick = async () => {
        addCloneMeta = null;
        setAddDealerModalMode('new');
        if (!window.CRMAuth || !CRMAuth.can('can_create_dealer')) {
            window.showToast("Нет права создавать дилеров", "error");
            return;
        }
        try {
            await Promise.all([fetchProductCatalog(), fetchCompetitorsRef(), fetchDealerPriceLists()]);
        } catch (e) {
            console.warn('Не удалось заранее загрузить справочники формы', e);
        }
        if(addForm) addForm.reset(); populateStatusSelects(); renderProductChecklist(addProductChecklist); renderList(addContactList, [], createContactEntryHTML); renderList(addAddressList, [], createAddressEntryHTML); renderList(addPosList, [], createPosEntryHTML); renderList(addVisitsList, [], createVisitEntryHTML); renderList(addCompetitorList, [], createCompetitorEntryHTML); if(document.getElementById('add_latitude')) { document.getElementById('add_latitude').value = ''; document.getElementById('add_longitude').value = ''; } addPhotosData = []; renderPhotoPreviews(addPhotoPreviewContainer, []); if(addAvatarPreview) { addAvatarPreview.src = ''; addAvatarPreview.style.display='none'; } newAvatarBase64 = null; 
        if (addLegalEntityList) { addLegalEntityList.innerHTML = ''; addLegalEntityList.insertAdjacentHTML('beforeend', createLegalEntityHTML()); }
        document.getElementById('add_contract_signed').checked = false; document.getElementById('add_contract_date').value = '';
        const personalPlanAdd = document.getElementById('add_has_personal_plan');
        if (personalPlanAdd) personalPlanAdd.checked = false;
        const addResponsible = document.getElementById('responsible');
        if (addResponsible) {
            const userScope = window.CRMAuth?.user?.scope || '';
            addResponsible.value = userScope === 'astana'
                ? 'regional_astana'
                : userScope === 'regions'
                    ? 'regional_regions'
                    : '';
            toggleSectorSelect('add', addResponsible.value);
        }
        currentStep = 1;
        showStep(1);
        document.querySelectorAll('[data-field-shortcuts="add"] button').forEach((item,index) => item.classList.toggle('active', index === 0));
        addModal.show(); 
    };
    let currentStep = 1;
    const totalSteps = 4;
    const prevBtn = document.getElementById('btn-prev-step');
    const nextBtn = document.getElementById('btn-next-step');
    const finishBtn = document.getElementById('btn-finish-step');
    const stepCaption = document.getElementById('dealer-step-caption');

    function showStep(step) {
        document.querySelectorAll('#add-modal .wizard-step').forEach(el => el.classList.remove('active'));

        const stepEl = document.getElementById(`step-${step}`);
        if (stepEl) stepEl.classList.add('active');

        document.querySelectorAll('#add-modal .dealer-wizard-step-label').forEach(label => {
            const n = Number(label.dataset.step);
            label.classList.toggle('active', n === step);
            label.classList.toggle('completed', n < step);

            const circle = label.querySelector('.step-circle');
            if (!circle) return;
            circle.classList.toggle('active', n === step);
            circle.classList.toggle('completed', n < step);
            circle.innerHTML = n < step ? '<i class="bi bi-check-lg"></i>' : String(n);
        });

        if (prevBtn) prevBtn.style.display = step === 1 ? 'none' : 'inline-flex';
        if (nextBtn) nextBtn.style.display = step === totalSteps ? 'none' : 'inline-flex';
        if (finishBtn) finishBtn.style.display = step === totalSteps ? 'inline-flex' : 'none';
        if (stepCaption) stepCaption.textContent = `Шаг ${step} из ${totalSteps}`;

        if (step === 3 && refreshAddMap) refreshAddMap();

        const body = addModalEl?.querySelector('.modal-body');
        if (body) body.scrollTop = 0;
    }

    function scrollFieldTarget(selector) {
        if (!selector) return;
        const target = document.querySelector(selector);
        if (!target) return;
        setTimeout(() => {
            target.scrollIntoView({ behavior:'smooth', block:'start' });
            const search = target.querySelector('input[type="search"]');
            if (search) setTimeout(() => search.focus({preventScroll:true}), 180);
        }, 120);
    }

    document.querySelectorAll('[data-field-shortcuts="add"] [data-add-step]').forEach(button => {
        button.addEventListener('click', () => {
            const targetStep = Number(button.dataset.addStep || 1);
            if (targetStep > 1) {
                const dealerId = document.getElementById('dealer_id')?.value.trim();
                const name = document.getElementById('name')?.value.trim();
                if (!dealerId || !name) {
                    showStep(1);
                    window.showToast('Сначала укажите ID и название дилера', 'warning');
                    return;
                }
            }
            currentStep = targetStep;
            showStep(targetStep);
            document.querySelectorAll('[data-field-shortcuts="add"] button').forEach(item => item.classList.toggle('active', item === button));
            scrollFieldTarget(button.dataset.fieldFocus);
        });
    });

    document.querySelectorAll('[data-field-shortcuts="edit"] [data-edit-tab]').forEach(button => {
        button.addEventListener('click', () => {
            const target = button.dataset.editTab;
            const tabButton = document.querySelector(`#editTabs button[data-bs-target="${target}"]`);
            if (tabButton) bootstrap.Tab.getOrCreateInstance(tabButton).show();
            document.querySelectorAll('[data-field-shortcuts="edit"] button').forEach(item => item.classList.toggle('active', item === button));
            scrollFieldTarget(button.dataset.fieldFocus);
        });
    });

    if (nextBtn) {
        nextBtn.onclick = () => {
            if (currentStep === 1) {
                const dealerId = document.getElementById('dealer_id')?.value.trim();
                const name = document.getElementById('name')?.value.trim();
                if (!dealerId || !name) {
                    window.showToast("Заполните ID дилера и название", "error");
                    return;
                }
            }

            if (currentStep < totalSteps) {
                currentStep++;
                showStep(currentStep);
            }
        };
    }

    if (prevBtn) {
        prevBtn.onclick = () => {
            if (currentStep > 1) {
                currentStep--;
                showStep(currentStep);
            }
        };
    }

    if(addForm) addForm.addEventListener('submit', async (e) => { e.preventDefault(); if (!window.CRMAuth || !CRMAuth.can('can_create_dealer')) { window.showToast("Нет права создавать дилеров", "error"); return; } if (isSaving) return; isSaving = true; const btn = document.getElementById('btn-finish-step'); const oldText = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>'; 
        const legalEntities = collectLegalEntities(addLegalEntityList);
        const data = { dealer_id: getVal('dealer_id'), name: getVal('name'), legal_entities: legalEntities, price_list: getVal('price_list') || null, city: getVal('city'), address: getVal('address'), delivery: getVal('delivery'), website: getVal('website'), instagram: getVal('instagram'), latitude: getVal('add_latitude'), longitude: getVal('add_longitude'), bonuses: getVal('bonuses'), status: getVal('status'), responsible: document.getElementById('responsible').value, region_sector: document.getElementById('add_region_sector').value, hasPersonalPlan: document.getElementById('add_has_personal_plan')?.checked || false, contract: { isSigned: document.getElementById('add_contract_signed').checked, date: getVal('add_contract_date') }, contacts: collectData(addContactList, '.contact-entry', [{key:'name',class:'.contact-name'},{key:'position',class:'.contact-position'},{key:'contactInfo',class:'.contact-info'}]), additional_addresses: collectData(addAddressList, '.address-entry', [{key:'description',class:'.address-description'},{key:'city',class:'.address-city'},{key:'address',class:'.address-address'}]), pos_materials: collectData(addPosList, '.pos-entry', [{key:'name',class:'.pos-name'},{key:'quantity',class:'.pos-quantity'}]), visits: collectData(addVisitsList, '.visit-entry', [{key:'date',class:'.visit-date'},{key:'comment',class:'.visit-comment'}]), photos: addPhotosData, avatarUrl: newAvatarBase64, competitors: collectData(addCompetitorList, '.competitor-entry', [{key:'brand',class:'.competitor-brand'},{key:'collection',class:'.competitor-collection'},{key:'price_opt',class:'.competitor-price-opt'},{key:'price_retail',class:'.competitor-price-retail'}]) };
        if (addCloneMeta) {
            data._cloneSourceId = addCloneMeta.sourceId;
            data._cloneSourceDealerId = addCloneMeta.sourceDealerId;
            data._cloneSourceLabel = addCloneMeta.sourceLabel;
            if (addCloneMeta.responsibleUserId) data.responsibleUserId = addCloneMeta.responsibleUserId;
        }
        try { const res = await fetch(API_DEALERS_URL, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data)}); if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || 'Не удалось сохранить дилера'); } const newD = await res.json(); const pIds = getSelectedProductIds('add-product-checklist'); if(window.CRMAuth && CRMAuth.can('can_edit_matrix') && pIds.length) await saveProducts(newD.id, pIds); const wasClone = Boolean(addCloneMeta); addCloneMeta = null; addModal.hide(); setAddDealerModalMode('new'); window.showToast(wasClone ? "Копия дилера создана" : "Дилер добавлен!"); initApp(); } catch (e) { window.showToast(e.message || "Ошибка сохранения", "error"); } finally { isSaving = false; btn.disabled = false; btn.innerHTML = oldText; } });
    if(editForm) editForm.addEventListener('submit', async (e) => { e.preventDefault(); if (!window.CRMAuth || !CRMAuth.can('can_edit_dealer')) { window.showToast("Нет права редактировать дилеров", "error"); return; } if (isSaving) return; isSaving = true; const btn = document.querySelector('button[form="edit-dealer-form"]'); const oldText = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>'; const id = document.getElementById('edit_db_id').value; let avatarToSend = getVal('edit-current-avatar-url'); if (newAvatarBase64) avatarToSend = newAvatarBase64; 
        const legalEntities = collectLegalEntities(editLegalEntityList);
        const data = { 
            dealer_id: getVal('edit_dealer_id'), name: getVal('edit_name'), legal_entities: legalEntities, price_list: getVal('edit_price_list') || null, city: getVal('edit_city'), address: getVal('edit_address'), delivery: getVal('edit_delivery'), website: getVal('edit_website'), instagram: getVal('edit_instagram'), latitude: getVal('edit_latitude'), longitude: getVal('edit_longitude'), bonuses: getVal('edit_bonuses'), status: getVal('edit_status'), responsible: document.getElementById('edit_responsible').value, region_sector: document.getElementById('edit_region_sector').value, 
            hasPersonalPlan: document.getElementById('edit_has_personal_plan').checked,
            contract: { isSigned: document.getElementById('edit_contract_signed').checked, date: getVal('edit_contract_date') }, avatarUrl: avatarToSend, contacts: collectData(editContactList, '.contact-entry', [{key:'name',class:'.contact-name'},{key:'position',class:'.contact-position'},{key:'contactInfo',class:'.contact-info'}]), additional_addresses: collectData(editAddressList, '.address-entry', [{key:'description',class:'.address-description'},{key:'city',class:'.address-city'},{key:'address',class:'.address-address'}]), pos_materials: collectData(editPosList, '.pos-entry', [{key:'name',class:'.pos-name'},{key:'quantity',class:'.pos-quantity'}]), visits: collectData(editVisitsList, '.visit-entry', [{key:'date',class:'.visit-date'},{key:'comment',class:'.visit-comment'},{key:'isCompleted',class:'.visit-completed'}]), photos: editPhotosData, competitors: collectData(editCompetitorList, '.competitor-entry', [{key:'brand',class:'.competitor-brand'},{key:'collection',class:'.competitor-collection'},{key:'price_opt',class:'.competitor-price-opt'},{key:'price_retail',class:'.competitor-price-retail'}]) 
        }; 
        try { const updateRes = await fetch(`${API_DEALERS_URL}/${id}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data)}); if(!updateRes.ok) throw new Error("Не удалось сохранить карточку дилера"); if(window.CRMAuth && CRMAuth.can('can_edit_matrix')) await saveProducts(id, getSelectedProductIds('edit-product-checklist')); editModal.hide(); window.showToast("Изменения сохранены!"); initApp(); } catch (e) { window.showToast("Ошибка сохранения", "error"); } finally { isSaving = false; if(btn) { btn.disabled = false; btn.innerHTML = oldText; } } });
    if(qvForm) qvForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (isSaving) return;
        if (window.CRMAuth && !CRMAuth.can('can_manage_visits')) {
            window.showToast("Нет права добавлять визиты", "error");
            return;
        }

        isSaving = true;
        const id = document.getElementById('qv_dealer_id').value;
        const comment = document.getElementById('qv_comment').value.trim();
        const date = document.getElementById('qv_date').value || new Date().toISOString().slice(0,10);
        const mode = qvForm.querySelector('input[name="qv_mode"]:checked')?.value || 'plan';
        const isCompleted = mode === 'completed';
        const btn = document.getElementById('qv_submit');
        if(!id || !comment || !date) { isSaving = false; return; }

        try {
            if (btn) btn.disabled = true;
            const response = await fetch(`${API_DEALERS_URL}/${id}/visits`, {
                method: 'POST',
                headers: {'Content-Type':'application/json'},
                body: JSON.stringify({ date, comment, isCompleted })
            });
            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data.error || "Не удалось добавить визит");
            }
            qvModal.hide();
            qvForm.reset();
            window.showToast(isCompleted ? "Визит отмечен как выполненный" : "Визит добавлен в план");
            await initApp();
        } catch(e) {
            window.showToast(e.message || "Ошибка", "error");
        } finally {
            isSaving = false;
            if (btn) btn.disabled = false;
        }
    });

    // --- EVENT LISTENERS ---
    if(filterCity) filterCity.onchange = renderDealerList; 
    if(filterPriceType) filterPriceType.onchange = renderDealerList; 
    if(filterStatus) filterStatus.onchange = renderDealerList; 
    if(filterResponsible) filterResponsible.onchange = renderDealerList; 
    if(searchBar) searchBar.oninput = renderDealerList;

    initApp();
    const fsListener = document.getElementById('filter-sector');
    if(fsListener) fsListener.onchange = renderDealerList;
});







