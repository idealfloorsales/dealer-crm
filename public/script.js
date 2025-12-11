document.addEventListener('DOMContentLoaded', () => {
    
    // 1. CONFIG
    const API_DEALERS_URL = '/api/dealers';
    const API_PRODUCTS_URL = '/api/products'; 
    const API_COMPETITORS_REF_URL = '/api/competitors-ref';
    const API_STATUSES_URL = '/api/statuses'; // NEW

    let fullProductCatalog = [];
    let competitorsRef = []; 
    let allDealers = [];
    let statusList = []; // Здесь будут жить статусы из БД
    
    let currentSort = { column: 'name', direction: 'asc' };
    let isSaving = false; 
    let addPhotosData = []; 
    let editPhotosData = []; 
    let newAvatarBase64 = null; 
    let currentUserRole = 'guest';

    const posMaterialsList = ["С600 - 600мм задняя стенка", "С800 - 800мм задняя стенка", "РФ-2 - Расческа из фанеры", "РФС-1 - Расческа из фанеры СТАРАЯ", "Н600 - 600мм наклейка", "Н800 - 800мм наклейка", "Табличка - Табличка орг.стекло"];

    // 2. ELEMENTS
    const addModalEl = document.getElementById('add-modal'); const addModal = new bootstrap.Modal(addModalEl, { backdrop: 'static', keyboard: false }); const addForm = document.getElementById('add-dealer-form');
    const editModalEl = document.getElementById('edit-modal'); const editModal = new bootstrap.Modal(editModalEl, { backdrop: 'static', keyboard: false }); const editForm = document.getElementById('edit-dealer-form');
    const qvModalEl = document.getElementById('quick-visit-modal'); const qvModal = new bootstrap.Modal(qvModalEl, { backdrop: 'static', keyboard: false }); const qvForm = document.getElementById('quick-visit-form');

    const openAddModalBtn = document.getElementById('open-add-modal-btn');
    const brandsDatalist = document.getElementById('brands-datalist');
    const posDatalist = document.getElementById('pos-materials-datalist');
    const dealerGrid = document.getElementById('dealer-grid'); 
    
    const addProductChecklist = document.getElementById('add-product-checklist'); const addContactList = document.getElementById('add-contact-list'); const addAddressList = document.getElementById('add-address-list'); const addPosList = document.getElementById('add-pos-list'); const addVisitsList = document.getElementById('add-visits-list'); const addCompetitorList = document.getElementById('add-competitor-list'); const addPhotoInput = document.getElementById('add-photo-input'); const addPhotoPreviewContainer = document.getElementById('add-photo-preview-container'); const addAvatarInput = document.getElementById('add-avatar-input'); const addAvatarPreview = document.getElementById('add-avatar-preview');
    const editProductChecklist = document.getElementById('edit-product-checklist'); const editContactList = document.getElementById('edit-contact-list'); const editAddressList = document.getElementById('edit-address-list'); const editPosList = document.getElementById('edit-pos-list'); const editVisitsList = document.getElementById('edit-visits-list'); const editCompetitorList = document.getElementById('edit-competitor-list'); const editPhotoInput = document.getElementById('edit-photo-input'); const editPhotoPreviewContainer = document.getElementById('edit-photo-preview-container'); const editAvatarInput = document.getElementById('edit-avatar-input'); const editAvatarPreview = document.getElementById('edit-avatar-preview'); const editCurrentAvatarUrl = document.getElementById('edit-current-avatar-url');

    const filterCity = document.getElementById('filter-city'); 
    const filterPriceType = document.getElementById('filter-price-type'); 
    const filterStatus = document.getElementById('filter-status'); // Этот теперь динамический
    const filterResponsible = document.getElementById('filter-responsible'); 
    const searchBar = document.getElementById('search-bar'); 
    const exportBtn = document.getElementById('export-dealers-btn'); 
    const dashboardStats = document.getElementById('dashboard-stats');
    const btnAddStatus = document.getElementById('btn-add-status'); // Кнопка "+"

    // 3. UTILS
    window.showToast = function(message, type = 'success') {
        let container = document.getElementById('toast-container-custom');
        if (!container) { container = document.createElement('div'); container.id = 'toast-container-custom'; container.className = 'toast-container-custom'; document.body.appendChild(container); }
        const toast = document.createElement('div'); toast.className = `toast-modern toast-${type}`;
        const icon = type === 'success' ? 'check-circle-fill' : (type === 'error' ? 'exclamation-triangle-fill' : 'info-circle-fill');
        toast.innerHTML = `<i class="bi bi-${icon} fs-5"></i><span class="fw-bold text-dark">${message}</span>`;
        container.appendChild(toast);
        setTimeout(() => { toast.style.animation = 'toastFadeOut 0.5s forwards'; setTimeout(() => toast.remove(), 500); }, 3000);
    };

    const getVal = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };
    const safeText = (text) => (text || '').toString().replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const safeAttr = (text) => (text || '').toString().replace(/"/g, '&quot;');
    const compressImage = (file, maxWidth = 1000, quality = 0.7) => new Promise((resolve, reject) => { const reader = new FileReader(); reader.readAsDataURL(file); reader.onload = event => { const img = new Image(); img.src = event.target.result; img.onload = () => { const elem = document.createElement('canvas'); let width = img.width; let height = img.height; if (width > maxWidth) { height *= maxWidth / width; width = maxWidth; } elem.width = width; elem.height = height; const ctx = elem.getContext('2d'); ctx.drawImage(img, 0, 0, width, height); resolve(elem.toDataURL('image/jpeg', quality)); }; img.onerror = error => reject(error); }; reader.onerror = error => reject(error); });

    // Generators
    function createContactEntryHTML(c={}) { return `<div class="contact-entry"><input type="text" class="form-control contact-name" placeholder="Имя" value="${c.name||''}"><input type="text" class="form-control contact-position" placeholder="Должность" value="${c.position||''}"><input type="text" class="form-control contact-info" placeholder="Телефон" value="${c.contactInfo||''}"><button type="button" class="btn-remove-entry" onclick="this.closest('.contact-entry').remove()"><i class="bi bi-x-lg"></i></button></div>`; }
    function createAddressEntryHTML(a={}) { return `<div class="address-entry"><input type="text" class="form-control address-description" placeholder="Описание" value="${a.description||''}"><input type="text" class="form-control address-city" placeholder="Город" value="${a.city||''}"><input type="text" class="form-control address-address" placeholder="Адрес" value="${a.address||''}"><button type="button" class="btn-remove-entry" onclick="this.closest('.address-entry').remove()"><i class="bi bi-x-lg"></i></button></div>`; }
    function createVisitEntryHTML(v={}) { return `<div class="visit-entry"><input type="date" class="form-control visit-date" value="${v.date||''}"><input type="text" class="form-control visit-comment w-50" placeholder="Результат..." value="${v.comment||''}"><button type="button" class="btn-remove-entry" onclick="this.closest('.visit-entry').remove()"><i class="bi bi-x-lg"></i></button></div>`; }
    function renderPhotoPreviews(container, photosArray) { if(container) container.innerHTML = photosArray.map((p, index) => `<div class="photo-preview-item"><img src="${p.photo_url}"><button type="button" class="btn-remove-photo" data-index="${index}"><i class="bi bi-x"></i></button></div>`).join(''); }
    function createPosEntryHTML(p={}) { return `<div class="pos-entry"><input type="text" class="form-control pos-name" list="pos-materials-datalist" placeholder="Название стенда" value="${safeAttr(p.name||'')}" autocomplete="off"><input type="number" class="form-control pos-quantity" value="${p.quantity||1}" min="1" placeholder="Шт"><button type="button" class="btn-remove-entry" onclick="this.closest('.pos-entry').remove()" title="Удалить"><i class="bi bi-x-lg"></i></button></div>`; }
    function createCompetitorEntryHTML(c={}) { let brandOpts = `<option value="">-- Бренд --</option>`; competitorsRef.forEach(ref => { const sel = ref.name === c.brand ? 'selected' : ''; brandOpts += `<option value="${ref.name}" ${sel}>${ref.name}</option>`; }); let collOpts = `<option value="">-- Коллекция --</option>`; if (c.brand) { const ref = competitorsRef.find(r => r.name === c.brand); if (ref && ref.collections) { const sortedCols = [...ref.collections].sort((a, b) => { const typeA = (typeof a === 'object') ? a.type : 'std'; const typeB = (typeof b === 'object') ? b.type : 'std'; if (typeA === 'std' && typeB !== 'std') return 1; if (typeA !== 'std' && typeB === 'std') return -1; return 0; }); sortedCols.forEach(col => { const colName = (typeof col === 'string') ? col : col.name; const colType = (typeof col === 'object') ? col.type : 'std'; let label = ''; if(colType.includes('eng')) label = ' (Елка)'; else if(colType.includes('french')) label = ' (Фр. Елка)'; else if(colType.includes('art')) label = ' (Арт)'; const sel = colName === c.collection ? 'selected' : ''; collOpts += `<option value="${colName}" ${sel}>${colName}${label}</option>`; }); } } return `<div class="competitor-entry"><select class="form-select competitor-brand" onchange="updateCollections(this)">${brandOpts}</select><select class="form-select competitor-collection">${collOpts}</select><input type="text" class="form-control competitor-price-opt" placeholder="ОПТ" value="${c.price_opt||''}"><input type="text" class="form-control competitor-price-retail" placeholder="Розн" value="${c.price_retail||''}"><button type="button" class="btn-remove-entry" onclick="this.closest('.competitor-entry').remove()" title="Удалить"><i class="bi bi-x-lg"></i></button></div>`; }
    window.updateCollections = function(select) { const brandName = select.value; const row = select.closest('.competitor-entry'); const collSelect = row.querySelector('.competitor-collection'); let html = `<option value="">-- Коллекция --</option>`; const ref = competitorsRef.find(r => r.name === brandName); if (ref && ref.collections) { const sortedCols = [...ref.collections].sort((a, b) => { const typeA = (typeof a === 'object') ? a.type : 'std'; const typeB = (typeof b === 'object') ? b.type : 'std'; if (typeA === 'std' && typeB !== 'std') return 1; if (typeA !== 'std' && typeB === 'std') return -1; return 0; }); html += sortedCols.map(col => { const colName = (typeof col === 'string') ? col : col.name; const colType = (typeof col === 'object') ? col.type : 'std'; let label = ''; if(colType.includes('eng')) label = ' (Елка)'; else if(colType.includes('french')) label = ' (Фр. Елка)'; else if(colType.includes('art')) label = ' (Арт)'; return `<option value="${colName}">${colName}${label}</option>`; }).join(''); } collSelect.innerHTML = html; };
    function renderProductChecklist(container, selectedIds=[]) { if(!container) return; const set = new Set(selectedIds); container.innerHTML = fullProductCatalog.map(p => `<div class="checklist-item form-check"><input type="checkbox" class="form-check-input" id="prod-${container.id}-${p.id}" value="${p.id}" ${set.has(p.id)?'checked':''}><label class="form-check-label" for="prod-${container.id}-${p.id}"><strong>${p.sku}</strong> - ${p.name}</label></div>`).join(''); }
    function getSelectedProductIds(containerId) { const el=document.getElementById(containerId); if(!el) return []; return Array.from(el.querySelectorAll('input:checked')).map(cb=>cb.value); }
    function collectData(container, selector, fields) { if (!container) return []; const data = []; container.querySelectorAll(selector).forEach(entry => { const item = {}; let hasData = false; fields.forEach(f => { const inp = entry.querySelector(f.class); if(inp){item[f.key]=inp.value; if(item[f.key]) hasData=true;} }); if(hasData) data.push(item); }); return data; }
    function renderList(container, data, htmlGen) { if(container) container.innerHTML = (data && data.length > 0) ? data.map(htmlGen).join('') : htmlGen(); }

    // 4. MAIN & API
    async function openEditModal(id) {
        try {
            const res = await fetch(`${API_DEALERS_URL}/${id}`); 
            if(!res.ok) throw new Error("Ошибка"); 
            const d = await res.json();
            const titleEl = document.querySelector('#edit-modal .modal-title'); if(titleEl) titleEl.textContent = `Редактировать: ${d.name}`;
            document.getElementById('edit_db_id').value=d.id; document.getElementById('edit_dealer_id').value=d.dealer_id; document.getElementById('edit_name').value=d.name; document.getElementById('edit_organization').value=d.organization; document.getElementById('edit_price_type').value=d.price_type; document.getElementById('edit_city').value=d.city; document.getElementById('edit_address').value=d.address; document.getElementById('edit_delivery').value=d.delivery; document.getElementById('edit_website').value=d.website; document.getElementById('edit_instagram').value=d.instagram;
            if(document.getElementById('edit_latitude')) document.getElementById('edit_latitude').value=d.latitude||'';
            if(document.getElementById('edit_longitude')) document.getElementById('edit_longitude').value=d.longitude||'';
            document.getElementById('edit_bonuses').value=d.bonuses;
            
            // Заполнение выпадающего списка статусов в модалке (ВАЖНО!)
            populateStatusSelects(d.status);
            
            if(document.getElementById('edit_responsible')) document.getElementById('edit_responsible').value = d.responsible || '';
            if(editAvatarPreview) { editAvatarPreview.src = d.avatarUrl || ''; editAvatarPreview.style.display = d.avatarUrl ? 'block' : 'none'; }
            if(editCurrentAvatarUrl) editCurrentAvatarUrl.value = d.avatarUrl || '';
            newAvatarBase64 = null;
            renderList(editContactList, d.contacts, createContactEntryHTML); renderList(editAddressList, d.additional_addresses, createAddressEntryHTML); renderList(editPosList, d.pos_materials, createPosEntryHTML); renderList(editVisitsList, d.visits, createVisitEntryHTML); renderList(editCompetitorList, d.competitors, createCompetitorEntryHTML);
            renderProductChecklist(editProductChecklist, (d.products||[]).map(p=>p.id));
            editPhotosData = d.photos||[]; renderPhotoPreviews(editPhotoPreviewContainer, editPhotosData);
            const firstTabEl = document.querySelector('#editTabs button[data-bs-target="#tab-main"]'); if(firstTabEl) { const tab = new bootstrap.Tab(firstTabEl); tab.show(); }
            editModal.show();
        } catch(e){ window.showToast("Ошибка загрузки данных", "error"); console.error(e); }
    }
    window.openEditModal = openEditModal;
    window.showQuickVisit = (id) => { document.getElementById('qv_dealer_id').value = id; document.getElementById('qv_comment').value = ''; qvModal.show(); };

    async function initApp() {
        try {
            const authRes = await fetch('/api/auth/me');
            if (authRes.ok) {
                const authData = await authRes.json();
                currentUserRole = authData.role;
                const badge = document.getElementById('user-role-badge');
                if(badge) { const names = { 'admin': 'Админ', 'astana': 'Астана', 'regions': 'Регионы', 'guest': 'Гость' }; badge.textContent = names[currentUserRole] || currentUserRole; }
                if (currentUserRole === 'guest') { if (openAddModalBtn) openAddModalBtn.style.display = 'none'; }
            }
        } catch (e) { console.warn('Auth check failed', e); }

        await fetchStatuses(); // СНАЧАЛА ГРУЗИМ СТАТУСЫ
        await fetchProductCatalog();
        updatePosDatalist(); 
        try { const compRes = await fetch(API_COMPETITORS_REF_URL); if (compRes.ok) { competitorsRef = await compRes.json(); updateBrandsDatalist(); } } catch(e){}
        try { 
            const response = await fetch(API_DEALERS_URL); 
            if (!response.ok) throw new Error(response.statusText); 
            allDealers = await response.json(); 
            populateFilters(allDealers); 
            renderDashboard(); 
            renderDealerList(); 
        } catch (error) { 
            if(dealerGrid) dealerGrid.innerHTML = `<div class="col-12"><div class="alert alert-danger text-center">Ошибка загрузки: ${error.message}</div></div>`; 
        }
        const pendingId = localStorage.getItem('pendingEditDealerId'); if (pendingId) { localStorage.removeItem('pendingEditDealerId'); openEditModal(pendingId); }
    }

    // НОВАЯ ФУНКЦИЯ ЗАГРУЗКИ СТАТУСОВ
    async function fetchStatuses() {
        try {
            const res = await fetch(API_STATUSES_URL);
            if(res.ok) {
                statusList = await res.json();
                populateStatusSelects(); // Обновляем все селекты в модалках и фильтре
            }
        } catch(e) { console.error("Error loading statuses", e); }
    }

    // ЗАПОЛНЕНИЕ ВЫПАДАЮЩИХ СПИСКОВ СТАТУСОВ
    function populateStatusSelects(selectedStatus = null) {
        const optionsHtml = statusList.map(s => `<option value="${s.value}" ${selectedStatus === s.value ? 'selected' : ''}>${s.label}</option>`).join('');
        
        // Фильтр на главной
        if(filterStatus) filterStatus.innerHTML = `<option value="">Все статусы</option>` + optionsHtml;
        
        // Модалка добавления
        const addStatusSel = document.getElementById('status');
        if(addStatusSel) addStatusSel.innerHTML = optionsHtml;
        
        // Модалка редактирования (если открыта)
        const editStatusSel = document.getElementById('edit_status');
        if(editStatusSel) editStatusSel.innerHTML = optionsHtml;
    }

    // ФУНКЦИЯ ДОБАВЛЕНИЯ НОВОГО СТАТУСА
    async function addNewStatus() {
        const label = prompt("Введите название статуса (напр. VIP):");
        if(!label) return;
        const color = prompt("Введите цвет (напр. #ff0000 или red):", "#6c757d");
        
        // Генерируем value из названия (транслит или просто random)
        const value = 'st_' + Math.random().toString(36).substr(2, 5);
        
        try {
            const res = await fetch(API_STATUSES_URL, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ value, label, color, sortOrder: statusList.length + 10 })
            });
            if(res.ok) {
                window.showToast("Статус добавлен!");
                await fetchStatuses(); // Перезагружаем список
            } else {
                window.showToast("Ошибка", "error");
            }
        } catch(e) { console.error(e); }
    }

    // Добавляем обработчик на кнопку "+"
    if(btnAddStatus) btnAddStatus.onclick = addNewStatus;

    async function fetchProductCatalog() { if (fullProductCatalog.length > 0) return; try { const response = await fetch(API_PRODUCTS_URL); if (!response.ok) throw new Error(`Ошибка: ${response.status}`); fullProductCatalog = await response.json(); fullProductCatalog.sort((a, b) => a.sku.localeCompare(b.sku, 'ru', { numeric: true })); } catch (error) { console.warn(error); } }
    function updateBrandsDatalist() { if (!brandsDatalist) return; let html = ''; competitorsRef.forEach(ref => { html += `<option value="${ref.name}">`; }); brandsDatalist.innerHTML = html; }
    function updatePosDatalist() { if (!posDatalist) return; let html = ''; posMaterialsList.forEach(s => { html += `<option value="${s}">`; }); posDatalist.innerHTML = html; }
    function populateFilters(dealers) { if(!filterCity || !filterPriceType) return; const cities = [...new Set(dealers.map(d => d.city).filter(Boolean))].sort(); const types = [...new Set(dealers.map(d => d.price_type).filter(Boolean))].sort(); const sc = filterCity.value; const st = filterPriceType.value; filterCity.innerHTML = '<option value="">Город</option>'; filterPriceType.innerHTML = '<option value="">Тип цен</option>'; cities.forEach(c => filterCity.add(new Option(c, c))); types.forEach(t => filterPriceType.add(new Option(t, t))); filterCity.value = sc; filterPriceType.value = st; }
    async function saveProducts(dealerId, ids) { await fetch(`${API_DEALERS_URL}/${dealerId}/products`, {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({productIds: ids})}); }
    async function completeTask(btn, dealerId, visitIndex) { try { btn.disabled = true; const res = await fetch(`${API_DEALERS_URL}/${dealerId}`); if(!res.ok) throw new Error('Err'); const dealer = await res.json(); if (dealer.visits && dealer.visits[visitIndex]) { dealer.visits[visitIndex].isCompleted = true; } await fetch(`${API_DEALERS_URL}/${dealerId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visits: dealer.visits }) }); initApp(); window.showToast("Задача выполнена!"); } catch (e) { window.showToast("Ошибка", "error"); btn.disabled = false; btn.innerHTML = '<i class="bi bi-check-lg"></i>'; } }

    // RENDER (ОБНОВЛЕН ДЛЯ ИСПОЛЬЗОВАНИЯ ЦВЕТОВ ИЗ БАЗЫ)
    function renderDealerList() {
        if (!dealerGrid) return;
        const city = filterCity ? filterCity.value : ''; const type = filterPriceType ? filterPriceType.value : ''; const status = filterStatus ? filterStatus.value : ''; const responsible = filterResponsible ? filterResponsible.value : ''; const search = searchBar ? searchBar.value.toLowerCase() : '';
        const filtered = allDealers.filter(d => { let statusMatch = false; const s = d.status || 'standard'; if (status) statusMatch = s === status; else statusMatch = s !== 'potential'; return (!city || d.city === city) && (!type || d.price_type === type) && (!responsible || d.responsible === responsible) && statusMatch && (!search || ((d.name||'').toLowerCase().includes(search) || (d.dealer_id||'').toLowerCase().includes(search))); });
        filtered.sort((a, b) => { let valA = (a[currentSort.column] || '').toString(); let valB = (b[currentSort.column] || '').toString(); let res = currentSort.column === 'dealer_id' ? valA.localeCompare(valB, undefined, {numeric:true}) : valA.toLowerCase().localeCompare(valB.toLowerCase(), 'ru'); return currentSort.direction === 'asc' ? res : -res; });
        if (filtered.length === 0) { dealerGrid.innerHTML = ` <div class="empty-state"><i class="bi bi-search empty-state-icon"></i><h5 class="text-muted">Ничего не найдено</h5><p class="text-secondary small mb-3">Попробуйте изменить фильтры</p><button class="btn btn-sm btn-outline-secondary" onclick="document.getElementById('search-bar').value=''; document.getElementById('filter-city').value=''; document.getElementById('filter-status').value=''; renderDealerList()">Сбросить фильтры</button></div>`; return; }
        
        dealerGrid.innerHTML = filtered.map(d => {
            // Ищем данные о статусе в загруженном списке
            const statusObj = statusList.find(s => s.value === (d.status || 'standard')) || { label: d.status, color: '#6c757d' };
            // Применяем инлайн-стиль для цвета
            const statusStyle = `background-color: ${statusObj.color}; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: 500;`;

            let phoneBtn = ''; let waBtn = ''; if (d.contacts && d.contacts.length > 0) { const phone = d.contacts.find(c => c.contactInfo)?.contactInfo || ''; const cleanPhone = phone.replace(/[^0-9]/g, ''); if (cleanPhone.length >= 10) { phoneBtn = `<a href="tel:+${cleanPhone}" class="btn-circle btn-circle-call" onclick="event.stopPropagation()" title="Позвонить"><i class="bi bi-telephone-fill"></i></a>`; waBtn = `<a href="https://wa.me/${cleanPhone}" target="_blank" class="btn-circle btn-circle-wa" onclick="event.stopPropagation()" title="WhatsApp"><i class="bi bi-whatsapp"></i></a>`; } }
            let mapBtn = ''; if (d.latitude && d.longitude) mapBtn = `<a href="https://yandex.kz/maps/?pt=${d.longitude},${d.latitude}&z=17&l=map" target="_blank" class="btn-circle" onclick="event.stopPropagation()" title="Маршрут"><i class="bi bi-geo-alt-fill"></i></a>`;
            let instaBtn = ''; if (d.instagram) { let url = d.instagram.trim(); if (!url.startsWith('http')) { if (url.startsWith('@')) url = 'https://instagram.com/' + url.substring(1); else url = 'https://instagram.com/' + url; } instaBtn = `<a href="${url}" target="_blank" class="btn-circle btn-circle-insta" onclick="event.stopPropagation()" title="Instagram"><i class="bi bi-instagram"></i></a>`; }
            const avatarHtml = d.photo_url ? `<img src="${d.photo_url}" alt="${d.name}">` : `<i class="bi bi-shop"></i>`;
            const editBtn = (currentUserRole !== 'guest') ? `<button class="btn-circle" onclick="event.stopPropagation(); openEditModal('${d.id}')" title="Редактировать"><i class="bi bi-pencil"></i></button>` : '';
            
            return `<div class="dealer-item" onclick="window.open('dealer.html?id=${d.id}', '_blank')">
                <div class="dealer-avatar-box">${avatarHtml}</div>
                <div class="dealer-content">
                    <div class="d-flex align-items-center gap-2 mb-1">
                        <a href="dealer.html?id=${d.id}" class="dealer-name" target="_blank">${safeText(d.name)}</a>
                        <span style="${statusStyle}">${statusObj.label}</span>
                    </div>
                    <div class="dealer-meta"><span><i class="bi bi-hash"></i>${safeText(d.dealer_id)}</span><span><i class="bi bi-geo-alt"></i>${safeText(d.city)}</span>${d.price_type ? `<span><i class="bi bi-tag"></i>${safeText(d.price_type)}</span>` : ''}</div>
                </div>
                <div class="dealer-actions">${instaBtn} ${waBtn} ${phoneBtn} ${mapBtn} ${editBtn}</div>
            </div>`;
        }).join('');
    }

    // ... ОСТАЛЬНОЙ КОД (Handlers, Save, Init) ... 
    // Вставь оставшуюся часть файла из предыдущей версии (Handlers, Events, Init Call)
    // Она не менялась, кроме добавления обработчика btnAddStatus (который я добавил выше)
    // Для надежности я добавлю конец файла сюда:

    if(addAvatarInput) addAvatarInput.addEventListener('change', async (e) => { const file = e.target.files[0]; if (file) { newAvatarBase64 = await compressImage(file, 800, 0.8); addAvatarPreview.src = newAvatarBase64; addAvatarPreview.style.display='block'; } });
    if(editAvatarInput) editAvatarInput.addEventListener('change', async (e) => { const file = e.target.files[0]; if (file) { newAvatarBase64 = await compressImage(file, 800, 0.8); editAvatarPreview.src = newAvatarBase64; editAvatarPreview.style.display='block'; } });
    if(addPhotoInput) addPhotoInput.addEventListener('change', async (e) => { for (let file of e.target.files) addPhotosData.push({ photo_url: await compressImage(file, 1000, 0.7) }); renderPhotoPreviews(addPhotoPreviewContainer, addPhotosData); addPhotoInput.value = ''; });
    if(addPhotoPreviewContainer) addPhotoPreviewContainer.addEventListener('click', (e) => { const btn = e.target.closest('.btn-remove-photo'); if(btn) { addPhotosData.splice(btn.dataset.index, 1); renderPhotoPreviews(addPhotoPreviewContainer, addPhotosData); } });
    if(editPhotoInput) editPhotoInput.addEventListener('change', async (e) => { for (let file of e.target.files) editPhotosData.push({ photo_url: await compressImage(file, 1000, 0.7) }); renderPhotoPreviews(editPhotoPreviewContainer, editPhotosData); editPhotoInput.value = ''; });
    if(editPhotoPreviewContainer) editPhotoPreviewContainer.addEventListener('click', (e) => { const btn = e.target.closest('.btn-remove-photo'); if(btn) { editPhotosData.splice(btn.dataset.index, 1); renderPhotoPreviews(editPhotoPreviewContainer, editPhotosData); } });
    
    if(filterCity) filterCity.onchange = renderDealerList; if(filterPriceType) filterPriceType.onchange = renderDealerList; if(filterStatus) filterStatus.onchange = renderDealerList; if(filterResponsible) filterResponsible.onchange = renderDealerList; if(searchBar) searchBar.oninput = renderDealerList;
    document.querySelectorAll('.sort-btn').forEach(btn => { btn.onclick = (e) => { const sortKey = e.currentTarget.dataset.sort; if(currentSort.column === sortKey) currentSort.direction = (currentSort.direction === 'asc' ? 'desc' : 'asc'); else { currentSort.column = sortKey; currentSort.direction = 'asc'; } renderDealerList(); }; });
    if(document.body) { document.body.addEventListener('click', (e) => { const taskBtn = e.target.closest('.btn-complete-task'); if (taskBtn) { taskBtn.disabled = true; taskBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>'; completeTask(taskBtn, taskBtn.dataset.id, taskBtn.dataset.index); } }); }

    const setupListBtn = (id, list, genFunc) => { const btn = document.getElementById(id); if(btn) btn.onclick = () => list.insertAdjacentHTML('beforeend', genFunc()); };
    setupListBtn('add-contact-btn-add-modal', addContactList, createContactEntryHTML); setupListBtn('add-address-btn-add-modal', addAddressList, createAddressEntryHTML); setupListBtn('add-pos-btn-add-modal', addPosList, createPosEntryHTML); setupListBtn('add-visits-btn-add-modal', addVisitsList, createVisitEntryHTML); setupListBtn('add-competitor-btn-add-modal', addCompetitorList, createCompetitorEntryHTML);
    setupListBtn('add-contact-btn-edit-modal', editContactList, createContactEntryHTML); setupListBtn('add-address-btn-edit-modal', editAddressList, createAddressEntryHTML); setupListBtn('add-pos-btn-edit-modal', editPosList, createPosEntryHTML); setupListBtn('add-visits-btn-edit-modal', editVisitsList, createVisitEntryHTML); setupListBtn('add-competitor-btn-edit-modal', editCompetitorList, createCompetitorEntryHTML);

    if(openAddModalBtn) openAddModalBtn.onclick = () => { if(addForm) addForm.reset(); populateStatusSelects(); renderProductChecklist(addProductChecklist); renderList(addContactList, [], createContactEntryHTML); renderList(addAddressList, [], createAddressEntryHTML); renderList(addPosList, [], createPosEntryHTML); renderList(addVisitsList, [], createVisitEntryHTML); renderList(addCompetitorList, [], createCompetitorEntryHTML); if(document.getElementById('add_latitude')) { document.getElementById('add_latitude').value = ''; document.getElementById('add_longitude').value = ''; } addPhotosData = []; renderPhotoPreviews(addPhotoPreviewContainer, []); if(addAvatarPreview) { addAvatarPreview.src = ''; addAvatarPreview.style.display='none'; } newAvatarBase64 = null; addModal.show(); };
    let currentStep = 1; const totalSteps = 4; const prevBtn = document.getElementById('btn-prev-step'); const nextBtn = document.getElementById('btn-next-step'); const finishBtn = document.getElementById('btn-finish-step'); function showStep(step) { document.querySelectorAll('.wizard-step').forEach(s => s.classList.remove('active')); document.querySelectorAll('.step-circle').forEach(i => i.classList.remove('active')); const stepEl = document.getElementById(`step-${step}`); if(stepEl) stepEl.classList.add('active'); for (let i = 1; i <= totalSteps; i++) { const ind = document.getElementById(`step-ind-${i}`); if(!ind) continue; if (i < step) { ind.classList.add('completed'); ind.innerHTML = '✔'; } else { ind.classList.remove('completed'); ind.innerHTML = i; if (i === step) ind.classList.add('active'); else ind.classList.remove('active'); } } if (prevBtn) prevBtn.style.display = step === 1 ? 'none' : 'inline-block'; if (nextBtn && finishBtn) { if (step === totalSteps) { nextBtn.style.display = 'none'; finishBtn.style.display = 'inline-block'; } else { nextBtn.style.display = 'inline-block'; finishBtn.style.display = 'none'; } } } if(nextBtn) nextBtn.onclick = () => { if (currentStep === 1) { if (!document.getElementById('dealer_id').value || !document.getElementById('name').value) { window.showToast("Заполните ID и Название", "error"); return; } if (addMap) setTimeout(() => addMap.invalidateSize(), 200); } if (currentStep < totalSteps) { currentStep++; showStep(currentStep); } }; if(prevBtn) prevBtn.onclick = () => { if (currentStep > 1) { currentStep--; showStep(currentStep); } };
    
    if(addForm) addForm.addEventListener('submit', async (e) => { e.preventDefault(); if (isSaving) return; isSaving = true; const btn = document.getElementById('btn-finish-step'); const oldText = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>'; const data = { dealer_id: getVal('dealer_id'), name: getVal('name'), organization: getVal('organization'), price_type: getVal('price_type'), city: getVal('city'), address: getVal('address'), delivery: getVal('delivery'), website: getVal('website'), instagram: getVal('instagram'), latitude: getVal('add_latitude'), longitude: getVal('add_longitude'), bonuses: getVal('bonuses'), status: getVal('status'), responsible: document.getElementById('responsible') ? document.getElementById('responsible').value : '', contacts: collectData(addContactList, '.contact-entry', [{key:'name',class:'.contact-name'},{key:'position',class:'.contact-position'},{key:'contactInfo',class:'.contact-info'}]), additional_addresses: collectData(addAddressList, '.address-entry', [{key:'description',class:'.address-description'},{key:'city',class:'.address-city'},{key:'address',class:'.address-address'}]), pos_materials: collectData(addPosList, '.pos-entry', [{key:'name',class:'.pos-name'},{key:'quantity',class:'.pos-quantity'}]), visits: collectData(addVisitsList, '.visit-entry', [{key:'date',class:'.visit-date'},{key:'comment',class:'.visit-comment'}]), photos: addPhotosData, avatarUrl: newAvatarBase64, competitors: collectData(addCompetitorList, '.competitor-entry', [{key:'brand',class:'.competitor-brand'},{key:'collection',class:'.competitor-collection'},{key:'price_opt',class:'.competitor-price-opt'},{key:'price_retail',class:'.competitor-price-retail'}]) }; try { const res = await fetch(API_DEALERS_URL, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data)}); if (!res.ok) throw new Error(await res.text()); const newD = await res.json(); const pIds = getSelectedProductIds('add-product-checklist'); if(pIds.length) await saveProducts(newD.id, pIds); addModal.hide(); window.showToast("Дилер добавлен!"); initApp(); } catch (e) { window.showToast("Ошибка сохранения", "error"); } finally { isSaving = false; btn.disabled = false; btn.innerHTML = oldText; } });
    if(editForm) editForm.addEventListener('submit', async (e) => { e.preventDefault(); if (isSaving) return; isSaving = true; const btn = document.querySelector('button[form="edit-dealer-form"]'); const oldText = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>'; const id = document.getElementById('edit_db_id').value; let avatarToSend = getVal('edit-current-avatar-url'); if (newAvatarBase64) avatarToSend = newAvatarBase64; const data = { dealer_id: getVal('edit_dealer_id'), name: getVal('edit_name'), organization: getVal('edit_organization'), price_type: getVal('edit_price_type'), city: getVal('edit_city'), address: getVal('edit_address'), delivery: getVal('edit_delivery'), website: getVal('edit_website'), instagram: getVal('edit_instagram'), latitude: getVal('edit_latitude'), longitude: getVal('edit_longitude'), bonuses: getVal('edit_bonuses'), status: getVal('edit_status'), responsible: document.getElementById('edit_responsible') ? document.getElementById('edit_responsible').value : '', avatarUrl: avatarToSend, contacts: collectData(editContactList, '.contact-entry', [{key:'name',class:'.contact-name'},{key:'position',class:'.contact-position'},{key:'contactInfo',class:'.contact-info'}]), additional_addresses: collectData(editAddressList, '.address-entry', [{key:'description',class:'.address-description'},{key:'city',class:'.address-city'},{key:'address',class:'.address-address'}]), pos_materials: collectData(editPosList, '.pos-entry', [{key:'name',class:'.pos-name'},{key:'quantity',class:'.pos-quantity'}]), visits: collectData(editVisitsList, '.visit-entry', [{key:'date',class:'.visit-date'},{key:'comment',class:'.visit-comment'},{key:'isCompleted',class:'.visit-completed'}]), photos: editPhotosData, competitors: collectData(editCompetitorList, '.competitor-entry', [{key:'brand',class:'.competitor-brand'},{key:'collection',class:'.competitor-collection'},{key:'price_opt',class:'.competitor-price-opt'},{key:'price_retail',class:'.competitor-price-retail'}]) }; try { await fetch(`${API_DEALERS_URL}/${id}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data)}); await saveProducts(id, getSelectedProductIds('edit-product-checklist')); editModal.hide(); window.showToast("Изменения сохранены!"); initApp(); } catch (e) { window.showToast("Ошибка сохранения", "error"); } finally { isSaving = false; if(btn) { btn.disabled = false; btn.innerHTML = oldText; } } });

    // 3. Файл `sales.js` (Для тостов в Продажах)
    // Вставь вызов showToast в sales.js (я не могу редактировать другие файлы в одном ответе, но ты понял суть).

    initApp();
});
