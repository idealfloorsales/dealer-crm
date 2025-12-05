document.addEventListener('DOMContentLoaded', () => {
    
    // ==========================================
    // 1. НАСТРОЙКИ И ПЕРЕМЕННЫЕ
    // ==========================================
    const API_DEALERS_URL = '/api/dealers';
    const API_PRODUCTS_URL = '/api/products'; 
    const API_COMPETITORS_REF_URL = '/api/competitors-ref';

    let fullProductCatalog = [];
    let competitorsRef = []; 
    let allDealers = [];
    let currentSort = { column: 'name', direction: 'asc' };
    let isSaving = false; 
    let addPhotosData = []; 
    let editPhotosData = []; 
    let newAvatarBase64 = null; 
    let currentUserRole = 'guest';

    const posMaterialsList = [
        "С600 - 600мм задняя стенка", "С800 - 800мм задняя стенка", "РФ-2 - Расческа из фанеры",
        "РФС-1 - Расческа из фанеры СТАРАЯ", "Н600 - 600мм наклейка", "Н800 - 800мм наклейка",
        "Табличка - Табличка орг.стекло"
    ];

    // ==========================================
    // 2. ЭЛЕМЕНТЫ ИНТЕРФЕЙСА
    // ==========================================
    const addModalEl = document.getElementById('add-modal'); 
    const addModal = new bootstrap.Modal(addModalEl, { backdrop: 'static', keyboard: false });
    const addForm = document.getElementById('add-dealer-form');
    
    const editModalEl = document.getElementById('edit-modal'); 
    const editModal = new bootstrap.Modal(editModalEl, { backdrop: 'static', keyboard: false });
    const editForm = document.getElementById('edit-dealer-form');

    const qvModalEl = document.getElementById('quick-visit-modal'); 
    const qvModal = new bootstrap.Modal(qvModalEl, { backdrop: 'static', keyboard: false });
    const qvForm = document.getElementById('quick-visit-form');

    const openAddModalBtn = document.getElementById('open-add-modal-btn');
    const brandsDatalist = document.getElementById('brands-datalist');
    const posDatalist = document.getElementById('pos-materials-datalist');
    const dealerGrid = document.getElementById('dealer-grid'); 
    const noDataMsg = document.getElementById('no-data-msg');
    
    // Списки внутри модалок
    const addProductChecklist = document.getElementById('add-product-checklist'); 
    const addContactList = document.getElementById('add-contact-list'); 
    const addAddressList = document.getElementById('add-address-list'); 
    const addPosList = document.getElementById('add-pos-list'); 
    const addVisitsList = document.getElementById('add-visits-list'); 
    const addCompetitorList = document.getElementById('add-competitor-list');
    const addPhotoInput = document.getElementById('add-photo-input');
    const addPhotoPreviewContainer = document.getElementById('add-photo-preview-container');
    const addAvatarInput = document.getElementById('add-avatar-input');
    const addAvatarPreview = document.getElementById('add-avatar-preview');
    
    const editProductChecklist = document.getElementById('edit-product-checklist'); 
    const editContactList = document.getElementById('edit-contact-list'); 
    const editAddressList = document.getElementById('edit-address-list'); 
    const editPosList = document.getElementById('edit-pos-list'); 
    const editVisitsList = document.getElementById('edit-visits-list');
    const editCompetitorList = document.getElementById('edit-competitor-list');
    const editPhotoInput = document.getElementById('edit-photo-input');
    const editPhotoPreviewContainer = document.getElementById('edit-photo-preview-container');
    const editAvatarInput = document.getElementById('edit-avatar-input');
    const editAvatarPreview = document.getElementById('edit-avatar-preview');
    const editCurrentAvatarUrl = document.getElementById('edit-current-avatar-url');

    const filterCity = document.getElementById('filter-city');
    const filterPriceType = document.getElementById('filter-price-type');
    const filterStatus = document.getElementById('filter-status');
    const filterResponsible = document.getElementById('filter-responsible');
    const searchBar = document.getElementById('search-bar'); 
    const exportBtn = document.getElementById('export-dealers-btn'); 
    const dashboardStats = document.getElementById('dashboard-stats');

    // ==========================================
    // 3. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
    // ==========================================
    
    const getVal = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };
    const safeText = (text) => (text || '').toString().replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const safeAttr = (text) => (text || '').toString().replace(/"/g, '&quot;');
    
    const compressImage = (file, maxWidth = 1000, quality = 0.7) => new Promise((resolve, reject) => { 
        const reader = new FileReader(); 
        reader.readAsDataURL(file); 
        reader.onload = event => { 
            const img = new Image(); 
            img.src = event.target.result; 
            img.onload = () => { 
                const elem = document.createElement('canvas'); 
                let width = img.width; let height = img.height; 
                if (width > maxWidth) { height *= maxWidth / width; width = maxWidth; } 
                elem.width = width; elem.height = height; 
                const ctx = elem.getContext('2d'); 
                ctx.drawImage(img, 0, 0, width, height); 
                resolve(elem.toDataURL('image/jpeg', quality)); 
            }; 
            img.onerror = error => reject(error); 
        }; 
        reader.onerror = error => reject(error); 
    });

    // Генераторы HTML
    function createContactEntryHTML(c={}) { return `<div class="contact-entry"><input type="text" class="form-control contact-name" placeholder="Имя" value="${c.name||''}"><input type="text" class="form-control contact-position" placeholder="Должность" value="${c.position||''}"><input type="text" class="form-control contact-info" placeholder="Телефон" value="${c.contactInfo||''}"><button type="button" class="btn-remove-entry" onclick="this.closest('.contact-entry').remove()"><i class="bi bi-x-lg"></i></button></div>`; }
    function createAddressEntryHTML(a={}) { return `<div class="address-entry"><input type="text" class="form-control address-description" placeholder="Описание" value="${a.description||''}"><input type="text" class="form-control address-city" placeholder="Город" value="${a.city||''}"><input type="text" class="form-control address-address" placeholder="Адрес" value="${a.address||''}"><button type="button" class="btn-remove-entry" onclick="this.closest('.address-entry').remove()"><i class="bi bi-x-lg"></i></button></div>`; }
    function createVisitEntryHTML(v={}) { return `<div class="visit-entry"><input type="date" class="form-control visit-date" value="${v.date||''}"><input type="text" class="form-control visit-comment w-50" placeholder="Результат..." value="${v.comment||''}"><button type="button" class="btn-remove-entry" onclick="this.closest('.visit-entry').remove()"><i class="bi bi-x-lg"></i></button></div>`; }
    function renderPhotoPreviews(container, photosArray) { if(container) container.innerHTML = photosArray.map((p, index) => `<div class="photo-preview-item"><img src="${p.photo_url}"><button type="button" class="btn-remove-photo" data-index="${index}"><i class="bi bi-x"></i></button></div>`).join(''); }
    
    function createPosEntryHTML(p={}) { 
        return `<div class="pos-entry"><input type="text" class="form-control pos-name" list="pos-materials-datalist" placeholder="Название стенда" value="${safeAttr(p.name||'')}" autocomplete="off"><input type="number" class="form-control pos-quantity" value="${p.quantity||1}" min="1" placeholder="Шт"><button type="button" class="btn-remove-entry" onclick="this.closest('.pos-entry').remove()" title="Удалить"><i class="bi bi-x-lg"></i></button></div>`; 
    }

    function createCompetitorEntryHTML(c={}) { 
        let brandOpts = `<option value="">-- Бренд --</option>`; competitorsRef.forEach(ref => { const sel = ref.name === c.brand ? 'selected' : ''; brandOpts += `<option value="${ref.name}" ${sel}>${ref.name}</option>`; });
        let collOpts = `<option value="">-- Коллекция --</option>`;
        if (c.brand) { const ref = competitorsRef.find(r => r.name === c.brand); if (ref && ref.collections) { const sortedCols = [...ref.collections].sort((a, b) => { const typeA = (typeof a === 'object') ? a.type : 'std'; const typeB = (typeof b === 'object') ? b.type : 'std'; if (typeA === 'std' && typeB !== 'std') return 1; if (typeA !== 'std' && typeB === 'std') return -1; return 0; }); sortedCols.forEach(col => { const colName = (typeof col === 'string') ? col : col.name; const colType = (typeof col === 'object') ? col.type : 'std'; let label = ''; if(colType.includes('eng')) label = ' (Елка)'; else if(colType.includes('french')) label = ' (Фр. Елка)'; else if(colType.includes('art')) label = ' (Арт)'; const sel = colName === c.collection ? 'selected' : ''; collOpts += `<option value="${colName}" ${sel}>${colName}${label}</option>`; }); } }
        return `<div class="competitor-entry"><select class="form-select competitor-brand" onchange="updateCollections(this)">${brandOpts}</select><select class="form-select competitor-collection">${collOpts}</select><input type="text" class="form-control competitor-price-opt" placeholder="ОПТ" value="${c.price_opt||''}"><input type="text" class="form-control competitor-price-retail" placeholder="Розн" value="${c.price_retail||''}"><button type="button" class="btn-remove-entry" onclick="this.closest('.competitor-entry').remove()" title="Удалить"><i class="bi bi-x-lg"></i></button></div>`; 
    }

    // Глобальная функция
    window.updateCollections = function(select) {
        const brandName = select.value; 
        const row = select.closest('.competitor-entry'); 
        const collSelect = row.querySelector('.competitor-collection');
        let html = `<option value="">-- Коллекция --</option>`;
        const ref = competitorsRef.find(r => r.name === brandName);
        if (ref && ref.collections) {
             const sortedCols = [...ref.collections].sort((a, b) => { 
                 const typeA = (typeof a === 'object') ? a.type : 'std'; 
                 const typeB = (typeof b === 'object') ? b.type : 'std'; 
                 if (typeA === 'std' && typeB !== 'std') return 1; 
                 if (typeA !== 'std' && typeB === 'std') return -1; 
                 return 0; 
             });
             html += sortedCols.map(col => { 
                const colName = (typeof col === 'string') ? col : col.name; 
                const colType = (typeof col === 'object') ? col.type : 'std'; 
                let label = ''; 
                if(colType.includes('eng')) label = ' (Елка)'; 
                else if(colType.includes('french')) label = ' (Фр. Елка)'; 
                else if(colType.includes('art')) label = ' (Арт)'; 
                return `<option value="${colName}">${colName}${label}</option>`; 
            }).join('');
        }
        collSelect.innerHTML = html;
    };
    
    function renderProductChecklist(container, selectedIds=[]) { if(!container) return; const set = new Set(selectedIds); container.innerHTML = fullProductCatalog.map(p => `<div class="checklist-item form-check"><input type="checkbox" class="form-check-input" id="prod-${container.id}-${p.id}" value="${p.id}" ${set.has(p.id)?'checked':''}><label class="form-check-label" for="prod-${container.id}-${p.id}"><strong>${p.sku}</strong> - ${p.name}</label></div>`).join(''); }
    function getSelectedProductIds(containerId) { const el=document.getElementById(containerId); if(!el) return []; return Array.from(el.querySelectorAll('input:checked')).map(cb=>cb.value); }
    function collectData(container, selector, fields) { if (!container) return []; const data = []; container.querySelectorAll(selector).forEach(entry => { const item = {}; let hasData = false; fields.forEach(f => { const inp = entry.querySelector(f.class); if(inp){item[f.key]=inp.value; if(item[f.key]) hasData=true;} }); if(hasData) data.push(item); }); return data; }
    function renderList(container, data, htmlGen) { if(container) container.innerHTML = (data && data.length > 0) ? data.map(htmlGen).join('') : htmlGen(); }

    // ==========================================
    // 4. ГЛОБАЛЬНЫЕ ФУНКЦИИ (ВАЖНО!)
    // ==========================================

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
            if(document.getElementById('edit_status')) document.getElementById('edit_status').value = d.status || 'standard';
            if(document.getElementById('edit_responsible')) document.getElementById('edit_responsible').value = d.responsible || '';

            if(editAvatarPreview) { editAvatarPreview.src = d.avatarUrl || ''; editAvatarPreview.style.display = d.avatarUrl ? 'block' : 'none'; }
            if(editCurrentAvatarUrl) editCurrentAvatarUrl.value = d.avatarUrl || '';
            newAvatarBase64 = null;

            renderList(editContactList, d.contacts, createContactEntryHTML); renderList(editAddressList, d.additional_addresses, createAddressEntryHTML); renderList(editPosList, d.pos_materials, createPosEntryHTML); renderList(editVisitsList, d.visits, createVisitEntryHTML); renderList(editCompetitorList, d.competitors, createCompetitorEntryHTML);
            renderProductChecklist(editProductChecklist, (d.products||[]).map(p=>p.id));
            editPhotosData = d.photos||[]; renderPhotoPreviews(editPhotoPreviewContainer, editPhotosData);
            
            const firstTabEl = document.querySelector('#editTabs button[data-bs-target="#tab-main"]');
            if(firstTabEl) { const tab = new bootstrap.Tab(firstTabEl); tab.show(); }
            editModal.show();
        } catch(e){ alert("Ошибка загрузки."); console.error(e); }
    }
    // Делаем функцию глобальной
    window.openEditModal = openEditModal;

    function showQuickVisit(id) { 
        document.getElementById('qv_dealer_id').value = id; 
        document.getElementById('qv_comment').value = ''; 
        qvModal.show(); 
    }
    // Делаем функцию глобальной
    window.showQuickVisit = showQuickVisit;

    // ==========================================
    // 5. API ФУНКЦИИ
    // ==========================================

    async function fetchProductCatalog() { 
        if (fullProductCatalog.length > 0) return; 
        try { 
            const response = await fetch(API_PRODUCTS_URL); 
            if (!response.ok) throw new Error(`Ошибка: ${response.status}`); 
            fullProductCatalog = await response.json(); 
            fullProductCatalog.sort((a, b) => a.sku.localeCompare(b.sku, 'ru', { numeric: true })); 
        } catch (error) { console.warn("Catalog fetch warning", error); } 
    }

    function updateBrandsDatalist() { if (!brandsDatalist) return; let html = ''; competitorsRef.forEach(ref => { html += `<option value="${ref.name}">`; }); brandsDatalist.innerHTML = html; }
    function updatePosDatalist() { if (!posDatalist) return; let html = ''; posMaterialsList.forEach(s => { html += `<option value="${s}">`; }); posDatalist.innerHTML = html; }

    function populateFilters(dealers) {
        if(!filterCity || !filterPriceType) return;
        const cities = [...new Set(dealers.map(d => d.city).filter(Boolean))].sort();
        const types = [...new Set(dealers.map(d => d.price_type).filter(Boolean))].sort();
        
        const sc = filterCity.value; const st = filterPriceType.value;
        filterCity.innerHTML = '<option value="">Город</option>'; 
        filterPriceType.innerHTML = '<option value="">Тип цен</option>';
        cities.forEach(c => filterCity.add(new Option(c, c))); 
        types.forEach(t => filterPriceType.add(new Option(t, t)));
        filterCity.value = sc; filterPriceType.value = st;
    }

    async function saveProducts(dealerId, ids) { await fetch(`${API_DEALERS_URL}/${dealerId}/products`, {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({productIds: ids})}); }

    async function completeTask(btn, dealerId, visitIndex) { 
        try { 
            btn.disabled = true; 
            const res = await fetch(`${API_DEALERS_URL}/${dealerId}`); 
            if(!res.ok) throw new Error('Err'); 
            const dealer = await res.json(); 
            if (dealer.visits && dealer.visits[visitIndex]) { dealer.visits[visitIndex].isCompleted = true; } 
            await fetch(`${API_DEALERS_URL}/${dealerId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visits: dealer.visits }) }); 
            initApp(); 
        } catch (e) { alert("Ошибка"); btn.disabled = false; btn.innerHTML = '<i class="bi bi-check-lg"></i>'; } 
    }

    // ==========================================
    // 6. RENDER DASHBOARD
    // ==========================================

    function renderDashboard() {
        if (!dashboardStats) return; 
        if (!allDealers || allDealers.length === 0) { dashboardStats.innerHTML = ''; return; }

        const activeDealers = allDealers.filter(d => d.status !== 'potential');
        const totalDealers = activeDealers.length;
        const noAvatarCount = activeDealers.filter(d => !d.photo_url).length; 
        
        // График структуры
        let countActive = 0, countStandard = 0, countPotential = 0, countProblem = 0;
        allDealers.forEach(d => {
            if (d.status === 'active') countActive++;
            else if (d.status === 'standard') countStandard++;
            else if (d.status === 'problem') countProblem++;
            else if (d.status === 'potential') countPotential++;
        });

        const totalAll = allDealers.length; 
        const pctActive = totalAll > 0 ? (countActive / totalAll) * 100 : 0;
        const pctStandard = totalAll > 0 ? (countStandard / totalAll) * 100 : 0;
        const pctProblem = totalAll > 0 ? (countProblem / totalAll) * 100 : 0;
        const pctPotential = totalAll > 0 ? (countPotential / totalAll) * 100 : 0;

        dashboardStats.innerHTML = `
            <div class="col-6"><div class="stat-card-modern"><div class="stat-icon-box bg-primary-subtle text-primary"><i class="bi bi-shop"></i></div><div class="stat-info"><h3>${totalDealers}</h3><p>Дилеров</p></div></div></div>
            <div class="col-6"><div class="stat-card-modern"><div class="stat-icon-box ${noAvatarCount > 0 ? 'bg-danger-subtle text-danger' : 'bg-success-subtle text-success'}"><i class="bi bi-camera-fill"></i></div><div class="stat-info"><h3 class="${noAvatarCount > 0 ? 'text-danger' : ''}">${noAvatarCount}</h3><p>Без фото</p></div></div></div>
            <div class="col-12 mt-2"><div class="stat-card-modern d-block p-3"><h6 class="text-muted fw-bold small mb-3 text-uppercase" style="letter-spacing:1px;">Структура базы</h6><div class="progress mb-3" style="height: 12px; border-radius: 6px;"><div class="progress-bar bg-success" role="progressbar" style="width: ${pctActive}%"></div><div class="progress-bar bg-warning" role="progressbar" style="width: ${pctStandard}%"></div><div class="progress-bar bg-danger" role="progressbar" style="width: ${pctProblem}%"></div><div class="progress-bar bg-primary" role="progressbar" style="width: ${pctPotential}%"></div></div><div class="d-flex justify-content-between text-center small"><div><span class="badge rounded-pill text-bg-success mb-1">${countActive}</span><br><span class="text-muted" style="font-size:0.75rem">VIP</span></div><div><span class="badge rounded-pill text-bg-warning mb-1">${countStandard}</span><br><span class="text-muted" style="font-size:0.75rem">Станд.</span></div><div><span class="badge rounded-pill text-bg-danger mb-1">${countProblem}</span><br><span class="text-muted" style="font-size:0.75rem">Пробл.</span></div><div><span class="badge rounded-pill text-bg-primary mb-1">${countPotential}</span><br><span class="text-muted" style="font-size:0.75rem">Потенц.</span></div></div></div></div>
        `;

        const today = new Date(); today.setHours(0,0,0,0);
        const coolingLimit = new Date(today.getTime() - (15 * 24 * 60 * 60 * 1000));
        
        const tasksUpcoming = [], tasksProblem = [], tasksCooling = [];
        allDealers.forEach(d => {
            if (d.status === 'archive') return; 
            const isPotential = d.status === 'potential'; 
            let lastVisitDate = null; 
            let hasFutureTasks = false;

            if (d.visits && Array.isArray(d.visits)) { 
                d.visits.forEach((v, index) => { 
                    const vDate = new Date(v.date); if (!v.date) return; vDate.setHours(0,0,0,0); 
                    if (v.isCompleted && (!lastVisitDate || vDate > lastVisitDate)) lastVisitDate = vDate; 
                    if (!v.isCompleted) { 
                        const taskData = { dealerName: d.name, dealerId: d.id, date: vDate, comment: v.comment || "Без комментария", visitIndex: index }; 
                        if (vDate < today) tasksProblem.push({...taskData, type: 'overdue'}); 
                        else { tasksUpcoming.push({...taskData, isToday: vDate.getTime() === today.getTime()}); hasFutureTasks = true; } 
                    } 
                }); 
            }
            if (d.status === 'problem') { if (!tasksProblem.some(t => t.dealerId === d.id && t.type === 'overdue')) tasksProblem.push({ dealerName: d.name, dealerId: d.id, type: 'status', comment: 'Статус: Проблемный' }); }
            if (!hasFutureTasks && d.status !== 'problem' && !isPotential) { 
                if (!lastVisitDate) tasksCooling.push({ dealerName: d.name, dealerId: d.id, days: 999 }); 
                else if (lastVisitDate < coolingLimit) { const days = Math.floor((today - lastVisitDate) / (1000 * 60 * 60 * 24)); tasksCooling.push({ dealerName: d.name, dealerId: d.id, days: days }); } 
            }
        });

        tasksUpcoming.sort((a, b) => a.date - b.date); 
        tasksProblem.sort((a, b) => (a.date || 0) - (b.date || 0)); 
        tasksCooling.sort((a, b) => b.days - a.days);

        renderTaskList(document.getElementById('tasks-list-upcoming'), tasksUpcoming, 'upcoming'); 
        renderTaskList(document.getElementById('tasks-list-problem'), tasksProblem, 'problem'); 
        renderTaskList(document.getElementById('tasks-list-cooling'), tasksCooling, 'cooling');
    }

    function renderTaskList(container, tasks, type) { 
        if (!container) return; 
        if (tasks.length === 0) { const msg = type === 'cooling' ? 'Все посещены недавно' : 'Задач нет'; container.innerHTML = `<div class="text-center py-4 text-muted"><i class="bi bi-check-circle display-6 d-block mb-2 text-success opacity-50"></i><small>${msg}</small></div>`; return; } 
        container.innerHTML = tasks.map(t => { 
            let badgeHtml = ''; let metaHtml = '';
            if (type === 'upcoming') { const dateStr = t.date.toLocaleDateString('ru-RU', {day:'numeric', month:'short'}); badgeHtml = t.isToday ? `<span class="task-badge tb-today mt-1 d-inline-block">Сегодня</span>` : `<span class="task-badge tb-future mt-1 d-inline-block">${dateStr}</span>`; metaHtml = `<span class="text-muted small">${safeText(t.comment)}</span>`; } 
            else if (type === 'problem') { if (t.type === 'overdue') { const dateStr = t.date.toLocaleDateString('ru-RU'); badgeHtml = `<span class="task-badge tb-overdue mt-1 d-inline-block">Просрок: ${dateStr}</span>`; metaHtml = `<span class="text-danger small fw-bold">${safeText(t.comment)}</span>`; } else { badgeHtml = `<span class="task-badge tb-overdue mt-1 d-inline-block">Проблема</span>`; metaHtml = `<span class="small text-muted">Внимание!</span>`; } } 
            else if (type === 'cooling') { const daysStr = t.days === 999 ? 'Никогда' : `${t.days} дн.`; badgeHtml = `<span class="task-badge tb-cooling mt-1 d-inline-block">Без визитов: ${daysStr}</span>`; metaHtml = `<span class="text-muted small">Пора навестить</span>`; } 
            const showCheckBtn = (type === 'upcoming' || (type === 'problem' && t.type === 'overdue'));
            const btnHtml = showCheckBtn ? `<button class="btn-task-check btn-complete-task" data-id="${t.dealerId}" data-index="${t.visitIndex}" title="Выполнить"><i class="bi bi-check-lg"></i></button>` : '';
            return `<div class="task-item-modern align-items-start"><div class="task-content"><a href="dealer.html?id=${t.dealerId}" target="_blank" class="task-title text-truncate d-block" style="max-width: 200px;">${safeText(t.dealerName)}</a>${badgeHtml}<div class="mt-1">${metaHtml}</div></div><div class="mt-1">${btnHtml}</div></div>`; 
        }).join(''); 
    }

    // --- 7. RENDER LIST ---
    function renderDealerList() {
        if (!dealerGrid) return;
        const city = filterCity ? filterCity.value : '';
        const type = filterPriceType ? filterPriceType.value : '';
        const status = filterStatus ? filterStatus.value : '';
        const responsible = filterResponsible ? filterResponsible.value : '';
        const search = searchBar ? searchBar.value.toLowerCase() : '';

        const filtered = allDealers.filter(d => {
            let statusMatch = false; const s = d.status || 'standard';
            if (status) statusMatch = s === status; else statusMatch = s !== 'potential';
            return (!city || d.city === city) && (!type || d.price_type === type) && (!responsible || d.responsible === responsible) && statusMatch && (!search || ((d.name||'').toLowerCase().includes(search) || (d.dealer_id||'').toLowerCase().includes(search)));
        });

        filtered.sort((a, b) => {
            let valA = (a[currentSort.column] || '').toString(); let valB = (b[currentSort.column] || '').toString();
            let res = currentSort.column === 'dealer_id' ? valA.localeCompare(valB, undefined, {numeric:true}) : valA.toLowerCase().localeCompare(valB.toLowerCase(), 'ru');
            return currentSort.direction === 'asc' ? res : -res;
        });

        if (filtered.length === 0) {
            dealerGrid.innerHTML = ` <div class="empty-state"><i class="bi bi-search empty-state-icon"></i><h5 class="text-muted">Ничего не найдено</h5><p class="text-secondary small mb-3">Попробуйте изменить фильтры</p><button class="btn btn-sm btn-outline-secondary" onclick="document.getElementById('search-bar').value=''; document.getElementById('filter-city').value=''; document.getElementById('filter-status').value=''; renderDealerList()">Сбросить фильтры</button></div>`;
            return;
        }

        const statusConfig = { 'active': { label: 'Активный', class: 'sp-active' }, 'standard': { label: 'Стандарт', class: 'sp-standard' }, 'problem': { label: 'Проблемный', class: 'sp-problem' }, 'potential': { label: 'Потенциальный', class: 'sp-potential' }, 'archive': { label: 'Архив', class: 'sp-archive' } };

        dealerGrid.innerHTML = filtered.map(d => {
            const st = statusConfig[d.status] || statusConfig['standard'];
            let phoneBtn = ''; let waBtn = ''; if (d.contacts && d.contacts.length > 0) { const phone = d.contacts.find(c => c.contactInfo)?.contactInfo || ''; const cleanPhone = phone.replace(/[^0-9]/g, ''); if (cleanPhone.length >= 10) { phoneBtn = `<a href="tel:+${cleanPhone}" class="btn-circle btn-circle-call" onclick="event.stopPropagation()" title="Позвонить"><i class="bi bi-telephone-fill"></i></a>`; waBtn = `<a href="https://wa.me/${cleanPhone}" target="_blank" class="btn-circle btn-circle-wa" onclick="event.stopPropagation()" title="WhatsApp"><i class="bi bi-whatsapp"></i></a>`; } }
            let mapBtn = ''; if (d.latitude && d.longitude) mapBtn = `<a href="https://yandex.kz/maps/?pt=${d.longitude},${d.latitude}&z=17&l=map" target="_blank" class="btn-circle" onclick="event.stopPropagation()" title="Маршрут"><i class="bi bi-geo-alt-fill"></i></a>`;
            const avatarHtml = d.photo_url ? `<img src="${d.photo_url}" alt="${d.name}">` : `<i class="bi bi-shop"></i>`;
            const editBtn = (currentUserRole !== 'guest') ? `<button class="btn-circle" onclick="event.stopPropagation(); openEditModal('${d.id}')" title="Редактировать"><i class="bi bi-pencil"></i></button>` : '';
            return `<div class="dealer-item" onclick="window.open('dealer.html?id=${d.id}', '_blank')"><div class="dealer-avatar-box">${avatarHtml}</div><div class="dealer-content"><div class="d-flex align-items-center gap-2 mb-1"><a href="dealer.html?id=${d.id}" class="dealer-name" target="_blank">${safeText(d.name)}</a><span class="status-pill ${st.class}">${st.label}</span></div><div class="dealer-meta"><span><i class="bi bi-hash"></i>${safeText(d.dealer_id)}</span><span><i class="bi bi-geo-alt"></i>${safeText(d.city)}</span>${d.price_type ? `<span><i class="bi bi-tag"></i>${safeText(d.price_type)}</span>` : ''}</div></div><div class="dealer-actions">${waBtn} ${phoneBtn} ${mapBtn}<button class="btn-circle" onclick="event.stopPropagation(); showQuickVisit('${d.id}')" title="Быстрый визит"><i class="bi bi-calendar-check"></i></button>${editBtn}</div></div>`;
        }).join('');
    }

    // --- 8. HANDLERS ---

    // Фото
    if(addAvatarInput) addAvatarInput.addEventListener('change', async (e) => { const file = e.target.files[0]; if (file) { newAvatarBase64 = await compressImage(file, 800, 0.8); addAvatarPreview.src = newAvatarBase64; addAvatarPreview.style.display='block'; } });
    if(editAvatarInput) editAvatarInput.addEventListener('change', async (e) => { const file = e.target.files[0]; if (file) { newAvatarBase64 = await compressImage(file, 800, 0.8); editAvatarPreview.src = newAvatarBase64; editAvatarPreview.style.display='block'; } });
    if(addPhotoInput) addPhotoInput.addEventListener('change', async (e) => { for (let file of e.target.files) addPhotosData.push({ photo_url: await compressImage(file, 1000, 0.7) }); renderPhotoPreviews(addPhotoPreviewContainer, addPhotosData); addPhotoInput.value = ''; });
    if(addPhotoPreviewContainer) addPhotoPreviewContainer.addEventListener('click', (e) => { const btn = e.target.closest('.btn-remove-photo'); if(btn) { addPhotosData.splice(btn.dataset.index, 1); renderPhotoPreviews(addPhotoPreviewContainer, addPhotosData); } });
    if(editPhotoInput) editPhotoInput.addEventListener('change', async (e) => { for (let file of e.target.files) editPhotosData.push({ photo_url: await compressImage(file, 1000, 0.7) }); renderPhotoPreviews(editPhotoPreviewContainer, editPhotosData); editPhotoInput.value = ''; });
    if(editPhotoPreviewContainer) editPhotoPreviewContainer.addEventListener('click', (e) => { const btn = e.target.closest('.btn-remove-photo'); if(btn) { editPhotosData.splice(btn.dataset.index, 1); renderPhotoPreviews(editPhotoPreviewContainer, editPhotosData); } });

    // Фильтры
    if(filterCity) filterCity.onchange = renderDealerList; if(filterPriceType) filterPriceType.onchange = renderDealerList; if(filterStatus) filterStatus.onchange = renderDealerList; if(filterResponsible) filterResponsible.onchange = renderDealerList; if(searchBar) searchBar.oninput = renderDealerList;
    document.querySelectorAll('.sort-btn').forEach(btn => { btn.onclick = (e) => { const sortKey = e.currentTarget.dataset.sort; if(currentSort.column === sortKey) currentSort.direction = (currentSort.direction === 'asc' ? 'desc' : 'asc'); else { currentSort.column = sortKey; currentSort.direction = 'asc'; } renderDealerList(); }; });

    // Клик по кнопкам списка
    if(document.body) { 
        document.body.addEventListener('click', (e) => { 
            const taskBtn = e.target.closest('.btn-complete-task'); 
            if (taskBtn) { 
                taskBtn.disabled = true; 
                taskBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>'; 
                completeTask(taskBtn, taskBtn.dataset.id, taskBtn.dataset.index); 
            } 
        }); 
    }

    const setupListBtn = (id, list, genFunc) => { const btn = document.getElementById(id); if(btn) btn.onclick = () => list.insertAdjacentHTML('beforeend', genFunc()); };
    setupListBtn('add-contact-btn-add-modal', addContactList, createContactEntryHTML); setupListBtn('add-address-btn-add-modal', addAddressList, createAddressEntryHTML); setupListBtn('add-pos-btn-add-modal', addPosList, createPosEntryHTML); setupListBtn('add-visits-btn-add-modal', addVisitsList, createVisitEntryHTML); setupListBtn('add-competitor-btn-add-modal', addCompetitorList, createCompetitorEntryHTML);
    setupListBtn('add-contact-btn-edit-modal', editContactList, createContactEntryHTML); setupListBtn('add-address-btn-edit-modal', editAddressList, createAddressEntryHTML); setupListBtn('add-pos-btn-edit-modal', editPosList, createPosEntryHTML); setupListBtn('add-visits-btn-edit-modal', editVisitsList, createVisitEntryHTML); setupListBtn('add-competitor-btn-edit-modal', editCompetitorList, createCompetitorEntryHTML);

    if(openAddModalBtn) openAddModalBtn.onclick = () => { if(addForm) addForm.reset(); currentStep = 1; showStep(1); renderProductChecklist(addProductChecklist); renderList(addContactList, [], createContactEntryHTML); renderList(addAddressList, [], createAddressEntryHTML); renderList(addPosList, [], createPosEntryHTML); renderList(addVisitsList, [], createVisitEntryHTML); renderList(addCompetitorList, [], createCompetitorEntryHTML); if(document.getElementById('add_latitude')) { document.getElementById('add_latitude').value = ''; document.getElementById('add_longitude').value = ''; } addPhotosData = []; renderPhotoPreviews(addPhotoPreviewContainer, []); if(addAvatarPreview) { addAvatarPreview.src = ''; addAvatarPreview.style.display='none'; } newAvatarBase64 = null; addModal.show(); };

    let currentStep = 1; const totalSteps = 4;
    const prevBtn = document.getElementById('btn-prev-step'); const nextBtn = document.getElementById('btn-next-step'); const finishBtn = document.getElementById('btn-finish-step');
    function showStep(step) { document.querySelectorAll('.wizard-step').forEach(s => s.classList.remove('active')); document.querySelectorAll('.step-circle').forEach(i => i.classList.remove('active')); const stepEl = document.getElementById(`step-${step}`); if(stepEl) stepEl.classList.add('active'); for (let i = 1; i <= totalSteps; i++) { const ind = document.getElementById(`step-ind-${i}`); if(!ind) continue; if (i < step) { ind.classList.add('completed'); ind.innerHTML = '✔'; } else { ind.classList.remove('completed'); ind.innerHTML = i; if (i === step) ind.classList.add('active'); else ind.classList.remove('active'); } } if (prevBtn) prevBtn.style.display = step === 1 ? 'none' : 'inline-block'; if (nextBtn && finishBtn) { if (step === totalSteps) { nextBtn.style.display = 'none'; finishBtn.style.display = 'inline-block'; } else { nextBtn.style.display = 'inline-block'; finishBtn.style.display = 'none'; } } }
    if(nextBtn) nextBtn.onclick = () => { if (currentStep === 1) { if (!document.getElementById('dealer_id').value || !document.getElementById('name').value) { alert("Заполните ID и Название"); return; } if (addMap) setTimeout(() => addMap.invalidateSize(), 200); } if (currentStep < totalSteps) { currentStep++; showStep(currentStep); } };
    if(prevBtn) prevBtn.onclick = () => { if (currentStep > 1) { currentStep--; showStep(currentStep); } };

    if(addForm) addForm.addEventListener('submit', async (e) => { e.preventDefault(); if (isSaving) return; isSaving = true; const btn = document.getElementById('btn-finish-step'); const oldText = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>'; const data = { dealer_id: getVal('dealer_id'), name: getVal('name'), organization: getVal('organization'), price_type: getVal('price_type'), city: getVal('city'), address: getVal('address'), delivery: getVal('delivery'), website: getVal('website'), instagram: getVal('instagram'), latitude: getVal('add_latitude'), longitude: getVal('add_longitude'), bonuses: getVal('bonuses'), status: getVal('status'), responsible: document.getElementById('responsible') ? document.getElementById('responsible').value : '', contacts: collectData(addContactList, '.contact-entry', [{key:'name',class:'.contact-name'},{key:'position',class:'.contact-position'},{key:'contactInfo',class:'.contact-info'}]), additional_addresses: collectData(addAddressList, '.address-entry', [{key:'description',class:'.address-description'},{key:'city',class:'.address-city'},{key:'address',class:'.address-address'}]), pos_materials: collectData(addPosList, '.pos-entry', [{key:'name',class:'.pos-name'},{key:'quantity',class:'.pos-quantity'}]), visits: collectData(addVisitsList, '.visit-entry', [{key:'date',class:'.visit-date'},{key:'comment',class:'.visit-comment'}]), photos: addPhotosData, avatarUrl: newAvatarBase64, competitors: collectData(addCompetitorList, '.competitor-entry', [{key:'brand',class:'.competitor-brand'},{key:'collection',class:'.competitor-collection'},{key:'price_opt',class:'.competitor-price-opt'},{key:'price_retail',class:'.competitor-price-retail'}]) }; try { const res = await fetch(API_DEALERS_URL, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data)}); if (!res.ok) throw new Error(await res.text()); const newD = await res.json(); const pIds = getSelectedProductIds('add-product-checklist'); if(pIds.length) await saveProducts(newD.id, pIds); addModal.hide(); initApp(); } catch (e) { alert("Ошибка при добавлении."); } finally { isSaving = false; btn.disabled = false; btn.innerHTML = oldText; } });
    if(editForm) editForm.addEventListener('submit', async (e) => { e.preventDefault(); if (isSaving) return; isSaving = true; const btn = document.querySelector('button[form="edit-dealer-form"]'); const oldText = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>'; const id = document.getElementById('edit_db_id').value; let avatarToSend = getVal('edit-current-avatar-url'); if (newAvatarBase64) avatarToSend = newAvatarBase64; const data = { dealer_id: getVal('edit_dealer_id'), name: getVal('edit_name'), organization: getVal('edit_organization'), price_type: getVal('edit_price_type'), city: getVal('edit_city'), address: getVal('edit_address'), delivery: getVal('edit_delivery'), website: getVal('edit_website'), instagram: getVal('edit_instagram'), latitude: getVal('edit_latitude'), longitude: getVal('edit_longitude'), bonuses: getVal('edit_bonuses'), status: getVal('edit_status'), responsible: document.getElementById('edit_responsible') ? document.getElementById('edit_responsible').value : '', avatarUrl: avatarToSend, contacts: collectData(editContactList, '.contact-entry', [{key:'name',class:'.contact-name'},{key:'position',class:'.contact-position'},{key:'contactInfo',class:'.contact-info'}]), additional_addresses: collectData(editAddressList, '.address-entry', [{key:'description',class:'.address-description'},{key:'city',class:'.address-city'},{key:'address',class:'.address-address'}]), pos_materials: collectData(editPosList, '.pos-entry', [{key:'name',class:'.pos-name'},{key:'quantity',class:'.pos-quantity'}]), visits: collectData(editVisitsList, '.visit-entry', [{key:'date',class:'.visit-date'},{key:'comment',class:'.visit-comment'},{key:'isCompleted',class:'.visit-completed'}]), photos: editPhotosData, competitors: collectData(editCompetitorList, '.competitor-entry', [{key:'brand',class:'.competitor-brand'},{key:'collection',class:'.competitor-collection'},{key:'price_opt',class:'.competitor-price-opt'},{key:'price_retail',class:'.competitor-price-retail'}]) }; try { await fetch(`${API_DEALERS_URL}/${id}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data)}); await saveProducts(id, getSelectedProductIds('edit-product-checklist')); editModal.hide(); initApp(); } catch (e) { alert("Ошибка при сохранении."); } finally { isSaving = false; if(btn) { btn.disabled = false; btn.innerHTML = oldText; } } });
    if(qvForm) qvForm.addEventListener('submit', async (e) => { e.preventDefault(); if (isSaving) return; isSaving = true; const id = document.getElementById('qv_dealer_id').value; const comment = document.getElementById('qv_comment').value; const btn = qvForm.querySelector('button'); if(!id || !comment) { isSaving = false; return; } try { btn.disabled = true; const getRes = await fetch(`${API_DEALERS_URL}/${id}`); const dealer = await getRes.json(); const newVisit = { date: new Date().toISOString().slice(0,10), comment: comment, isCompleted: true }; const visits = [...(dealer.visits || []), newVisit]; await fetch(`${API_DEALERS_URL}/${id}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ visits }) }); qvModal.hide(); alert("Визит добавлен!"); } catch(e) { alert("Ошибка"); } finally { isSaving = false; btn.disabled = false; } });

    if(exportBtn) { exportBtn.onclick = async () => { if (!allDealers.length) return alert("Пусто. Нечего экспортировать."); exportBtn.disabled = true; exportBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Загрузка...'; const clean = (text) => `"${String(text || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`; let csv = "\uFEFFID;Название;Статус;Ответственный;Город;Адрес;Тип цен;Организация;Доставка;Сайт;Инстаграм;Контакты;Доп. Адреса;Бонусы\n"; try { const city = filterCity.value; const type = filterPriceType.value; const status = filterStatus.value; const responsible = filterResponsible.value; const search = searchBar.value.toLowerCase(); const filteredForExport = allDealers.filter(d => { let statusMatch = false; const s = d.status || 'standard'; if (status) statusMatch = s === status; else statusMatch = s !== 'potential'; return (!city||d.city===city) && (!type||d.price_type===type) && (!responsible||d.responsible===responsible) && statusMatch && (!search || ((d.name||'').toLowerCase().includes(search)||(d.dealer_id||'').toLowerCase().includes(search))); }); for (const dealer of filteredForExport) { const contactsName = (dealer.contacts || []).map(c => { let info = c.name || ''; if (c.position) info += ` (${c.position})`; if (c.contactInfo) info += ` - ${c.contactInfo}`; return info; }).join('; '); const addresses = (dealer.additional_addresses || []).map(a => `${a.description || ''}: ${a.city || ''}, ${a.address || ''}`).join('; '); const row = [ clean(dealer.dealer_id), clean(dealer.name), clean(dealer.status), clean(dealer.responsible), clean(dealer.city), clean(dealer.address), clean(dealer.price_type), clean(dealer.organization), clean(dealer.delivery), clean(dealer.website), clean(dealer.instagram), clean(contactsName), clean(addresses), clean(dealer.bonuses) ]; csv += row.join(";") + "\r\n"; } const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8;'})); a.download = 'dealers_export.csv'; a.click(); } catch (e) { alert("Ошибка: " + e.message); } finally { exportBtn.disabled = false; exportBtn.innerHTML = '<i class="bi bi-file-earmark-excel me-2"></i>База'; } }; }
    if(document.getElementById('export-competitors-prices-btn')) { document.getElementById('export-competitors-prices-btn').onclick = async () => { if (!allDealers.length) return alert("Пусто"); const typeMap = { 'std': 'Стандарт', 'eng': 'Англ. Елка', 'fr': 'Фр. Елка', 'art': 'Художественный', 'art_eng': 'Худ. Английская', 'art_fr': 'Худ. Французская', 'mix': 'Худ. Микс' }; let csv = "\uFEFFДилер;Город;Бренд;Коллекция;Тип;Цена ОПТ;Цена Розница\n"; allDealers.forEach(d => { if(d.competitors) { d.competitors.forEach(c => { let typeLabel = 'Стандарт'; const refBrand = competitorsRef.find(r => r.name === c.brand); if (refBrand && refBrand.collections) { const refCol = refBrand.collections.find(col => (typeof col === 'string' ? col : col.name) === c.collection); if (refCol) { const typeCode = (typeof refCol === 'string') ? 'std' : refCol.type; typeLabel = typeMap[typeCode] || 'Стандарт'; } } csv += `"${d.name}";"${d.city}";"${c.brand||''}";"${c.collection||''}";"${typeLabel}";"${c.price_opt||''}";"${c.price_retail||''}"\n`; }); } }); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8;'})); a.download = 'competitor_prices.csv'; a.click(); }; }

    const logoutBtn = document.getElementById('logout-btn'); if (logoutBtn) { logoutBtn.onclick = () => { const url = window.location.protocol + "//" + "logout:logout@" + window.location.host + window.location.pathname; window.location.href = url; }; }

    // ==========================================
    // 9. START
    // ==========================================
    initApp();
});
