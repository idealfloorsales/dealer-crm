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
    const defaultDashConfig = { showPulse: true, showAttention: true, showPlan: true, showActivity: true };
    let dashConfig = { ...defaultDashConfig, ...(JSON.parse(localStorage.getItem('dash_config') || '{}')) };

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
    const dealerVisibleCount = document.getElementById('dealer-visible-count');
    const dealerSortSelect = document.getElementById('dealer-sort-select');
    const dealerResetFilters = document.getElementById('dealer-reset-filters');
    const dealerQuickFilters = document.getElementById('dealer-quick-filters');
    const dealerFilterToggle = document.getElementById('dealer-filter-toggle');
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

    // ФУНКЦИЯ КАТАЛОГА С ФИЛЬТРАЦИЕЙ
    function renderProductChecklist(container, selectedIds=[]) { 
        if(!container) return; 
        const set = new Set(selectedIds); 
        const filteredCatalog = fullProductCatalog.filter(p => !posMaterialsList.includes(p.name));
        const canEditMatrix = window.CRMAuth && CRMAuth.can('can_edit_matrix');
        container.innerHTML = filteredCatalog.map(p => 
            `<div class="checklist-item form-check">
                <input type="checkbox" class="form-check-input" id="prod-${container.id}-${p.id}" value="${p.id}" ${set.has(p.id)?'checked':''} ${canEditMatrix ? '' : 'disabled'}>
                <label class="form-check-label" for="prod-${container.id}-${p.id}"><strong>${p.sku}</strong> - ${p.name}</label>
             </div>`
        ).join(''); 
    }

    function getSelectedProductIds(containerId) { const el=document.getElementById(containerId); if(!el) return []; return Array.from(el.querySelectorAll('input:checked')).map(cb=>cb.value); }
    function collectData(container, selector, fields) { if (!container) return []; const data = []; container.querySelectorAll(selector).forEach(entry => { const item = {}; let hasData = false; fields.forEach(f => { const inp = entry.querySelector(f.class); if(inp){item[f.key]=inp.value; if(item[f.key]) hasData=true;} }); if(hasData) data.push(item); }); return data; }
    function renderList(container, data, htmlGen) { if(container) container.innerHTML = (data && data.length > 0) ? data.map(htmlGen).join('') : htmlGen(); }
    function collectOrgs(container) { const orgs = []; container.querySelectorAll('.org-input').forEach(inp => { if(inp.value.trim()) orgs.push(inp.value.trim()); }); return orgs; }

    // --- SETUP BUTTONS ---
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

            const pendingId = localStorage.getItem('pendingEditDealerId');
            if (pendingId) {
                localStorage.removeItem('pendingEditDealerId');
                if (window.CRMAuth && CRMAuth.can('can_edit_dealer')) openEditModal(pendingId);
            }

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
        const sectorFilter = document.getElementById('filter-sector');
        if(sectorFilter) sectorFilter.onchange = renderDealerList;
        if(searchBar) searchBar.oninput = renderDealerList;
        if(dealerSortSelect) dealerSortSelect.onchange = renderDealerList;

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

    function getDashboardPlanKey(scope) {
        if (scope === 'astana') return 'astana_all';
        if (scope === 'regions') return 'regions_all';
        return 'total_all';
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

        // For full-company legacy months, prefer the two regional totals rather than
        // summing every PLAN_* row (group + region + VIP), which double-counts plans.
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

        // Compatibility with old records where plan was stored on the sales row.
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

        const userScope = window.CRMAuth?.user?.scope || 'all';
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

    function buildAttentionItems() {
        const items = [];
        const today = new Date(); today.setHours(0,0,0,0);

        allDealers.filter(d => d.status !== 'archive').forEach(dealer => {
            const health = getDealerHealth(dealer);
            if (dealer.status === 'problem') {
                items.push({ priority: 100, type:'risk', icon:'exclamation-diamond', title:dealer.name, meta:'Статус дилера: проблемный', dealerId:dealer.id, health });
            } else if (health.score < 60) {
                items.push({ priority: 80 + (60-health.score), type:'risk', icon:'heart-pulse', title:dealer.name, meta:health.reasons[0] || 'Низкая оценка дилера', dealerId:dealer.id, health });
            }
        });

        (allTasksData || []).forEach(d => {
            (d.visits || []).forEach((v,index) => {
                if (v.isCompleted || !v.date) return;
                const date = new Date(v.date); date.setHours(0,0,0,0);
                if (date < today) {
                    const days = Math.max(1, Math.floor((today-date)/86400000));
                    items.push({ priority:90+Math.min(days,10), type:'warn', icon:'calendar-x', title:d.name, meta:`Просрочена задача на ${days} дн.`, dealerId:d.id, visitIndex:index });
                }
            });
        });

        reclamationsData.filter(r => !r.resolution).slice(0,10).forEach(r => {
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
        const events = [];

        allDealers.forEach(d => {
            if (d.createdAt) events.push({ date:new Date(d.createdAt), icon:'shop-window', title:`Добавлен дилер ${d.name}`, meta:d.city || d.dealer_id, href:`dealer.html?id=${d.id}` });
        });

        allTasksData.forEach(d => (d.visits || []).forEach(v => {
            if (v.isCompleted && v.date) events.push({ date:new Date(v.date), icon:'geo-alt', title:`Визит · ${d.name}`, meta:v.comment || 'Визит завершён', href:`dealer.html?id=${d.id}` });
        }));

        reclamationsData.forEach(r => {
            if (r.createdAt) events.push({ date:new Date(r.createdAt), icon:'shield-exclamation', title:`Рекламация · ${r.dealerName || 'Дилер'}`, meta:r.productName || 'Новая рекламация', href:'/reclamations.html' });
        });

        salesHistory.filter(s => s.updatedAt && Number(s.fact) > 0).forEach(s => {
            events.push({ date:new Date(s.updatedAt), icon:'graph-up-arrow', title:`Продажи · ${s.dealerName || 'Дилер'}`, meta:`${Number(s.fact).toLocaleString('ru-RU')} м²`, href:'/sales.html' });
        });

        events.sort((a,b) => b.date-a.date);
        const top = events.slice(0,8);
        container.innerHTML = top.length ? top.map(e => `
            <a class="cc-event-item" href="${e.href}">
                <span class="cc-event-icon"><i class="bi bi-${e.icon}"></i></span>
                <span class="cc-event-copy">
                    <span class="cc-event-title">${safeText(e.title)}</span>
                    <span class="cc-event-meta">${e.date.toLocaleDateString('ru-RU', {day:'numeric',month:'short'})} · ${safeText(e.meta)}</span>
                </span>
            </a>`).join('') : '<div class="cc-empty">Событий пока нет</div>';
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

        const network = allDealers.filter(d => d.status !== 'archive');
        const activeIds = new Set((currentMonthSales || []).filter(s => Number(s.fact)>0).map(s => String(s.dealerId)));
        const activeCount = network.filter(d => activeIds.has(String(d.id))).length;
        const problemCount = network.filter(d => d.status === 'problem' || getDealerHealth(d).score < 60).length;
        const userScope = window.CRMAuth?.user?.scope || 'all';
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
                <div class="cc-kpi-foot">${currentPlan > 0 ? 'План: ' + formatExactSqm(currentPlan) + ' м²' : 'План не задан'}</div>
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
        if (!window.CRMAuth || !CRMAuth.can('can_edit_dealer')) {
            window.showToast("Нет права редактировать дилеров", "error");
            return;
        }
        try {
            const [res] = await Promise.all([
                fetch(`${API_DEALERS_URL}/${id}`),
                fetchProductCatalog().catch(e => console.warn('Каталог недоступен', e)),
                fetchCompetitorsRef().catch(e => console.warn('Справочник конкурентов недоступен', e))
            ]);
            if(!res.ok) throw new Error("Ошибка");
            const d = await res.json();
            const titleEl = document.querySelector('#edit-modal .modal-title');
            if(titleEl) titleEl.textContent = 'Редактирование дилера';
            const subtitleEl = document.getElementById('edit-modal-subtitle');
            if(subtitleEl) subtitleEl.textContent = d.name ? `${d.name} · измените только нужные данные` : 'Измените только нужные данные';
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

    window.showQuickVisit = (id) => {
        if (!window.CRMAuth || !CRMAuth.can('can_manage_visits')) {
            window.showToast("Нет права добавлять визиты", "error");
            return;
        }
        document.getElementById('qv_dealer_id').value = id;
        document.getElementById('qv_comment').value = '';
        qvModal.show();
    };

    async function fetchDealers() { const response = await fetch(API_DEALERS_URL); if (!response.ok) throw new Error("Не удалось загрузить список дилеров"); allDealers = await response.json(); }
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
    
    function populateStatusSelects(selectedStatus = null) { let filterHtml = '<option value="">Все статусы</option>'; statusList.forEach(s => { filterHtml += `<option value="${s.value}">${s.label}</option>`; }); if(filterStatus) filterStatus.innerHTML = filterHtml; const modalHtml = statusList.map(s => `<option value="${s.value}" ${selectedStatus === s.value ? 'selected' : ''}>${s.label}</option>`).join(''); const addStatusSel = document.getElementById('status'); if(addStatusSel) addStatusSel.innerHTML = modalHtml; const editStatusSel = document.getElementById('edit_status'); if(editStatusSel) editStatusSel.innerHTML = modalHtml; }
    function renderStatusManagerList() { if(!statusListContainer) return; statusListContainer.innerHTML = statusList.map(s => `<tr><td style="width: 50px;"><div style="width:20px;height:20px;background:${s.color};border-radius:50%;"></div></td><td class="fw-bold">${s.label}</td><td class="text-muted small">${s.value}</td><td class="text-center">${s.isVisible !== false ? '<i class="bi bi-eye-fill text-success"></i>' : '<i class="bi bi-eye-slash-fill text-muted"></i>'}</td><td class="text-end"><button class="btn btn-sm btn-light border me-1" onclick="editStatus('${s.id}')"><i class="bi bi-pencil"></i></button><button class="btn btn-sm btn-light border text-danger" onclick="deleteStatus('${s.id}')"><i class="bi bi-trash"></i></button></td></tr>`).join(''); }
function resetStatusForm() { if(!statusForm) return; statusForm.reset(); document.getElementById('st_id').value = ''; document.getElementById('st_value').value = ''; document.getElementById('btn-save-status').textContent = 'Добавить'; document.getElementById('btn-save-status').className = 'btn btn-primary w-100'; document.getElementById('btn-cancel-edit-status').style.display = 'none'; document.getElementById('st_color').value = '#0d6efd'; }
    window.editStatus = (id) => { const s = statusList.find(i => i.id === id); if(!s) return; document.getElementById('st_id').value = s.id; document.getElementById('st_value').value = s.value; document.getElementById('st_label').value = s.label; document.getElementById('st_color').value = s.color; document.getElementById('st_visible').checked = s.isVisible !== false; const btn = document.getElementById('btn-save-status'); btn.textContent = 'Сохранить'; btn.className = 'btn btn-success w-100'; document.getElementById('btn-cancel-edit-status').style.display = 'inline-block'; };
    window.deleteStatus = async (id) => { if(!confirm("Удалить этот статус?")) return; try { await fetch(`${API_STATUSES_URL}/${id}`, { method: 'DELETE' }); window.showToast("Удалено"); fetchStatuses(); } catch(e) { window.showToast("Ошибка", "error"); } };
    if(document.getElementById('btn-cancel-edit-status')) document.getElementById('btn-cancel-edit-status').onclick = resetStatusForm;
    if(statusForm) { statusForm.addEventListener('submit', async (e) => { e.preventDefault(); const id = document.getElementById('st_id').value; const val = document.getElementById('st_value').value.trim(); const label = document.getElementById('st_label').value; const color = document.getElementById('st_color').value; const isVisible = document.getElementById('st_visible').checked; const body = { value: val, label, color, isVisible }; let url = API_STATUSES_URL; let method = 'POST'; if(id) { url += `/${id}`; method = 'PUT'; } else { body.sortOrder = statusList.length + 10; } try { const res = await fetch(url, { method: method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body) }); if(res.ok) { window.showToast(id ? "Обновлено" : "Создано"); resetStatusForm(); fetchStatuses(); } else { throw new Error(); } } catch(e) { window.showToast("Ошибка сохранения", "error"); } }); }
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
    function populateFilters(dealers) { if(!filterCity || !filterPriceType) return; const cities = [...new Set(dealers.map(d => d.city).filter(Boolean))].sort(); const types = [...new Set(dealers.map(d => d.price_type).filter(Boolean))].sort(); const sectors = [...new Set(dealers.map(d => d.region_sector).filter(Boolean))].sort(); const sc = filterCity.value; const st = filterPriceType.value; filterCity.innerHTML = '<option value="">Город</option>'; filterPriceType.innerHTML = '<option value="">Тип цен</option>'; cities.forEach(c => filterCity.add(new Option(c, c))); types.forEach(t => filterPriceType.add(new Option(t, t))); filterCity.value = sc; filterPriceType.value = st; const fs = document.getElementById('filter-sector'); if(fs) { const currSec = fs.value; fs.innerHTML = '<option value="">Сектор</option>'; sectors.forEach(s => fs.add(new Option(s, s))); fs.value = currSec; } }
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

    function responsibleLabel(value) {
        const labels = {
            regional_astana: 'Астана',
            regional_regions: 'Регионы',
            office: 'Офис'
        };
        return labels[value] || value || 'Не назначен';
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
        const search = (searchBar?.value || '').trim().toLowerCase();
        const sector = document.getElementById('filter-sector')?.value || '';

        const baseFiltered = allDealers.filter(d => {
            let isVisible = true;
            if (!status) {
                const statusObj = statusList.find(s => s.value === (d.status || 'standard'));
                if (statusObj && (statusObj.isVisible === false || String(statusObj.isVisible) === 'false')) isVisible = false;
            } else {
                isVisible = d.status === status;
            }

            const searchable = [
                d.name, d.dealer_id, d.city, d.address, d.region_sector, d.price_type,
                responsibleLabel(d.responsible)
            ].filter(Boolean).join(' ').toLowerCase();

            return isVisible &&
                (!city || d.city === city) &&
                (!type || d.price_type === type) &&
                (!responsible || d.responsible === responsible) &&
                (!sector || d.region_sector === sector) &&
                (!search || searchable.includes(search));
        });

        const enriched = baseFiltered.map(dealer => ({
            dealer,
            metrics: getDealerListMetrics(dealer)
        }));

        updateDealerQuickCounts(enriched);

        let filtered = enriched.filter(({metrics}) => {
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
            return;
        }

        const canViewSales = Boolean(window.CRMAuth && CRMAuth.can('can_view_sales'));
        const canEdit = Boolean(window.CRMAuth && CRMAuth.can('can_edit_dealer'));

        dealerGrid.innerHTML = filtered.map(({dealer:d, metrics}, index) => {
            const statusObj = statusList.find(s => s.value === (d.status || 'standard')) || {
                label: d.status || 'Стандарт',
                color: '#72747a'
            };

            const avatarUrl = d.photo_url || d.avatarUrl || '';
            const avatarHtml = avatarUrl
                ? `<img src="${safeAttr(avatarUrl)}" alt="">`
                : '<i class="bi bi-shop"></i>';

            let phoneBtn = '';
            let waBtn = '';
            if (Array.isArray(d.contacts) && d.contacts.length) {
                const phone = d.contacts.find(contact => contact?.contactInfo)?.contactInfo || '';
                const cleanPhone = phone.replace(/[^0-9]/g, '');
                if (cleanPhone.length >= 10) {
                    phoneBtn = `<a href="tel:+${cleanPhone}" class="dealer-card-action is-phone" onclick="event.stopPropagation()" title="Позвонить"><i class="bi bi-telephone"></i></a>`;
                    waBtn = `<a href="https://wa.me/${cleanPhone}" target="_blank" rel="noopener" class="dealer-card-action is-whatsapp" onclick="event.stopPropagation()" title="WhatsApp"><i class="bi bi-whatsapp"></i></a>`;
                }
            }

            const mapBtn = d.latitude && d.longitude
                ? `<a href="https://yandex.kz/maps/?pt=${encodeURIComponent(d.longitude)},${encodeURIComponent(d.latitude)}&z=17&l=map" target="_blank" rel="noopener" class="dealer-card-action" onclick="event.stopPropagation()" title="Маршрут"><i class="bi bi-geo-alt"></i></a>`
                : '';

            let instaBtn = '';
            if (d.instagram) {
                let url = String(d.instagram).trim();
                if (!/^https?:\/\//i.test(url)) {
                    url = 'https://instagram.com/' + url.replace(/^@/, '');
                }
                instaBtn = `<a href="${safeAttr(url)}" target="_blank" rel="noopener" class="dealer-card-action" onclick="event.stopPropagation()" title="Instagram"><i class="bi bi-instagram"></i></a>`;
            }

            const editBtn = canEdit
                ? `<button class="dealer-card-action" type="button" onclick="event.stopPropagation(); openEditModal('${safeAttr(d.id)}')" title="Редактировать"><i class="bi bi-pencil"></i></button>`
                : '';
            const quickVisitBtn = (window.CRMAuth && CRMAuth.can('can_manage_visits'))
                ? `<button class="dealer-card-action" type="button" onclick="event.stopPropagation(); showQuickVisit('${safeAttr(d.id)}')" title="Запланировать визит"><i class="bi bi-calendar-plus"></i></button>`
                : '';

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
                planFoot = `План ${formatExactSqm(metrics.plan)} м²`;
                progressWidth = Math.min(metrics.achievement, 100);
                progressLevel = metrics.achievement >= 90 ? 'good' : metrics.achievement >= 70 ? 'mid' : 'risk';
            } else if (d.hasPersonalPlan) {
                planValue = 'Не задан';
                planFoot = 'Нужно заполнить план';
            }

            const signals = metrics.signals.slice(0, 2);
            const signalsHtml = signals.length
                ? signals.map(signal => `<span class="dealer-signal is-${signal.level}"><i class="bi bi-${signal.icon}"></i>${safeText(signal.text)}</span>`).join('')
                : '<span class="dealer-signal is-ok"><i class="bi bi-check2-circle"></i>Без критичных сигналов</span>';

            const locationMeta = [d.city, d.region_sector].filter(Boolean).map(safeText).join(' · ') || 'Локация не указана';
            const secondaryMeta = [responsibleLabel(d.responsible), d.price_type].filter(Boolean).map(safeText).join(' · ');

            return `<article class="dealer-smart-card ${metrics.problem ? 'has-risk' : ''}" onclick="window.location.href='dealer.html?id=${encodeURIComponent(d.id)}'">
                <div class="dealer-smart-index">${index + 1}</div>

                <div class="dealer-smart-identity">
                    <div class="dealer-smart-avatar">${avatarHtml}</div>
                    <div class="dealer-smart-copy">
                        <div class="dealer-smart-title-row">
                            <a href="dealer.html?id=${encodeURIComponent(d.id)}" class="dealer-smart-name" onclick="event.stopPropagation()">${safeText(d.name)}</a>
                            <span class="dealer-card-status" style="border-color:${safeAttr(statusObj.color || '#72747a')};color:${safeAttr(statusObj.color || '#72747a')}">${safeText(statusObj.label)}</span>
                        </div>
                        <div class="dealer-smart-id">#${safeText(d.dealer_id || '—')}</div>
                        <div class="dealer-smart-meta"><i class="bi bi-geo-alt"></i>${locationMeta}</div>
                        <div class="dealer-smart-meta"><i class="bi bi-person"></i>${secondaryMeta || 'Ответственный не назначен'}</div>
                    </div>
                </div>

                <div class="dealer-smart-metrics">
                    <div class="dealer-list-metric">
                        <span>Продажи</span>
                        <strong>${canViewSales ? formatExactSqm(metrics.fact) + ' м²' : '—'}</strong>
                        <small>${canViewSales ? (metrics.fact > 0 ? 'Текущий месяц' : 'Продаж пока нет') : 'Нет доступа'}</small>
                    </div>
                    <div class="dealer-list-metric is-plan">
                        <span>Выполнение плана</span>
                        <strong>${planValue}</strong>
                        <small>${planFoot}</small>
                        <div class="dealer-list-progress is-${progressLevel}"><i style="width:${progressWidth}%"></i></div>
                    </div>
                    <div class="dealer-list-metric">
                        <span>Последний визит</span>
                        <strong>${visit.value}</strong>
                        <small>${visit.foot}</small>
                    </div>
                    <div class="dealer-list-metric is-score">
                        <span>Оценка дилера</span>
                        <strong>${metrics.health.score}<em>/100</em></strong>
                        <small>${safeText(metrics.health.label)}</small>
                        <div class="dealer-score-mini is-${metrics.health.level}"><i style="width:${metrics.health.score}%"></i></div>
                    </div>
                </div>

                <div class="dealer-smart-side">
                    <div class="dealer-signal-list">${signalsHtml}</div>
                    <div class="dealer-card-actions">
                        ${waBtn}${phoneBtn}${mapBtn}${instaBtn}${quickVisitBtn}${editBtn}
                        <a href="dealer.html?id=${encodeURIComponent(d.id)}" class="dealer-open-card" onclick="event.stopPropagation()">Открыть <i class="bi bi-arrow-right"></i></a>
                    </div>
                </div>
            </article>`;
        }).join('');
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
                d.dealer_id,d.name,d.city,d.address,d.region_sector,d.price_type,
                ...(d.contacts || []).flatMap(x => [x.name,x.position,x.contactInfo])
            ].filter(Boolean).join(' ').toLowerCase();
        }

        window.renderGlobalSearchResults = function(query) {
            const q = (query || '').trim().toLowerCase();
            const matches = allDealers
                .filter(d => d.status !== 'archive' && (!q || searchableText(d).includes(q)))
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
    if(openAddModalBtn) openAddModalBtn.onclick = async () => {
        if (!window.CRMAuth || !CRMAuth.can('can_create_dealer')) {
            window.showToast("Нет права создавать дилеров", "error");
            return;
        }
        try {
            await Promise.all([fetchProductCatalog(), fetchCompetitorsRef()]);
        } catch (e) {
            console.warn('Не удалось заранее загрузить справочники формы', e);
        }
        if(addForm) addForm.reset(); populateStatusSelects(); renderProductChecklist(addProductChecklist); renderList(addContactList, [], createContactEntryHTML); renderList(addAddressList, [], createAddressEntryHTML); renderList(addPosList, [], createPosEntryHTML); renderList(addVisitsList, [], createVisitEntryHTML); renderList(addCompetitorList, [], createCompetitorEntryHTML); if(document.getElementById('add_latitude')) { document.getElementById('add_latitude').value = ''; document.getElementById('add_longitude').value = ''; } addPhotosData = []; renderPhotoPreviews(addPhotoPreviewContainer, []); if(addAvatarPreview) { addAvatarPreview.src = ''; addAvatarPreview.style.display='none'; } newAvatarBase64 = null; 
        document.getElementById('add-org-list').innerHTML = ''; addOrgList.insertAdjacentHTML('beforeend', createOrgInputHTML());
        document.getElementById('add_contract_signed').checked = false; document.getElementById('add_contract_date').value = '';
        const personalPlanAdd = document.getElementById('add_has_personal_plan');
        if (personalPlanAdd) personalPlanAdd.checked = false;
        toggleSectorSelect('add', '');
        currentStep = 1;
        showStep(1);
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
        const data = { dealer_id: getVal('dealer_id'), name: getVal('name'), organizations: collectOrgs(document.getElementById('add-org-list')), price_type: getVal('price_type'), city: getVal('city'), address: getVal('address'), delivery: getVal('delivery'), website: getVal('website'), instagram: getVal('instagram'), latitude: getVal('add_latitude'), longitude: getVal('add_longitude'), bonuses: getVal('bonuses'), status: getVal('status'), responsible: document.getElementById('responsible').value, region_sector: document.getElementById('add_region_sector').value, hasPersonalPlan: document.getElementById('add_has_personal_plan')?.checked || false, contract: { isSigned: document.getElementById('add_contract_signed').checked, date: getVal('add_contract_date') }, contacts: collectData(addContactList, '.contact-entry', [{key:'name',class:'.contact-name'},{key:'position',class:'.contact-position'},{key:'contactInfo',class:'.contact-info'}]), additional_addresses: collectData(addAddressList, '.address-entry', [{key:'description',class:'.address-description'},{key:'city',class:'.address-city'},{key:'address',class:'.address-address'}]), pos_materials: collectData(addPosList, '.pos-entry', [{key:'name',class:'.pos-name'},{key:'quantity',class:'.pos-quantity'}]), visits: collectData(addVisitsList, '.visit-entry', [{key:'date',class:'.visit-date'},{key:'comment',class:'.visit-comment'}]), photos: addPhotosData, avatarUrl: newAvatarBase64, competitors: collectData(addCompetitorList, '.competitor-entry', [{key:'brand',class:'.competitor-brand'},{key:'collection',class:'.competitor-collection'},{key:'price_opt',class:'.competitor-price-opt'},{key:'price_retail',class:'.competitor-price-retail'}]) }; 
        try { const res = await fetch(API_DEALERS_URL, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data)}); if (!res.ok) throw new Error(await res.text()); const newD = await res.json(); const pIds = getSelectedProductIds('add-product-checklist'); if(window.CRMAuth && CRMAuth.can('can_edit_matrix') && pIds.length) await saveProducts(newD.id, pIds); addModal.hide(); window.showToast("Дилер добавлен!"); initApp(); } catch (e) { window.showToast("Ошибка сохранения", "error"); } finally { isSaving = false; btn.disabled = false; btn.innerHTML = oldText; } });
    if(editForm) editForm.addEventListener('submit', async (e) => { e.preventDefault(); if (!window.CRMAuth || !CRMAuth.can('can_edit_dealer')) { window.showToast("Нет права редактировать дилеров", "error"); return; } if (isSaving) return; isSaving = true; const btn = document.querySelector('button[form="edit-dealer-form"]'); const oldText = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>'; const id = document.getElementById('edit_db_id').value; let avatarToSend = getVal('edit-current-avatar-url'); if (newAvatarBase64) avatarToSend = newAvatarBase64; 
        const data = { 
            dealer_id: getVal('edit_dealer_id'), name: getVal('edit_name'), organizations: collectOrgs(document.getElementById('edit-org-list')), price_type: getVal('edit_price_type'), city: getVal('edit_city'), address: getVal('edit_address'), delivery: getVal('edit_delivery'), website: getVal('edit_website'), instagram: getVal('edit_instagram'), latitude: getVal('edit_latitude'), longitude: getVal('edit_longitude'), bonuses: getVal('edit_bonuses'), status: getVal('edit_status'), responsible: document.getElementById('edit_responsible').value, region_sector: document.getElementById('edit_region_sector').value, 
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
        const btn = qvForm.querySelector('button');
        if(!id || !comment) { isSaving = false; return; }

        try {
            btn.disabled = true;
            const response = await fetch(`${API_DEALERS_URL}/${id}/visits`, {
                method: 'POST',
                headers: {'Content-Type':'application/json'},
                body: JSON.stringify({
                    date: new Date().toISOString().slice(0,10),
                    comment,
                    isCompleted: true
                })
            });
            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data.error || "Не удалось добавить визит");
            }
            qvModal.hide();
            qvForm.reset();
            window.showToast("Визит добавлен!");
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







