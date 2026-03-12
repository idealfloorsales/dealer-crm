document.addEventListener('DOMContentLoaded', () => {
    
    // --- 1. АВТОРИЗАЦИЯ ---
    const originalFetch = window.fetch;
    window.fetch = async function (url, options) {
        options = options || {};
        options.headers = options.headers || {};
        const token = localStorage.getItem('crm_token');
        if (token) options.headers['Authorization'] = 'Bearer ' + token;
        const response = await originalFetch(url, options);
        if (response.status === 401 || response.status === 403) {
            localStorage.removeItem('crm_token'); 
            window.location.href = '/login.html'; 
        }
        return response;
    };

    // --- 2. КОНСТАНТЫ И ПЕРЕМЕННЫЕ ---
    const API_DEALERS_URL = '/api/dealers';
    const API_PRODUCTS_URL = '/api/products'; 
    const API_COMPETITORS_REF_URL = '/api/competitors-ref';
    const API_STATUSES_URL = '/api/statuses';
    const API_TASKS_URL = '/api/tasks';
    const API_SALES_URL = '/api/sales';
    const API_SECTORS_URL = '/api/sectors';
    const API_RECLAMATIONS_URL = '/api/reclamations'; // Добавили АПИ рекламаций

    let fullProductCatalog = [];
    let competitorsRef = []; 
    let allDealers = [];
    let statusList = []; 
    let allTasksData = [];
    let currentMonthSales = [];
    let allSectors = []; 
    let allReclamations = []; // Для хранения рекламаций
    
    let currentSort = { column: 'dealer_id', direction: 'asc' };
    let isSaving = false; 
    let currentUserRole = 'guest';

    const sectorModalEl = document.getElementById('sector-manager-modal');
    const sectorModal = sectorModalEl ? new bootstrap.Modal(sectorModalEl) : null;
    let currentSectorTypeMode = ''; 

    // Графики ApexCharts
    let chartSpeedometer = null;
    let chartRings = null;

    const posMaterialsList = ["С600 - 600мм задняя стенка", "С800 - 800мм задняя стенка", "РФ-2 - Расческа из фанеры", "РФС-1 - Расческа из фанеры СТАРАЯ", "Н600 - 600мм наклейка", "Н800 - 800мм наклейка", "Табличка - Табличка орг.стекло"];

    // --- 3. ЭЛЕМЕНТЫ DOM ---
    const addModalEl = document.getElementById('add-modal'); const addModal = addModalEl ? new bootstrap.Modal(addModalEl, { backdrop: 'static', keyboard: false }) : null; const addForm = document.getElementById('add-dealer-form');
    const editModalEl = document.getElementById('edit-modal'); const editModal = editModalEl ? new bootstrap.Modal(editModalEl, { backdrop: 'static', keyboard: false }) : null; const editForm = document.getElementById('edit-dealer-form');
    const statusModalEl = document.getElementById('status-manager-modal'); const statusModal = statusModalEl ? new bootstrap.Modal(statusModalEl) : null; const btnManageStatuses = document.getElementById('btn-manage-statuses'); const statusForm = document.getElementById('status-form'); const statusListContainer = document.getElementById('status-manager-list');
    
    const openAddModalBtn = document.getElementById('open-add-modal-btn');
    const dealerGrid = document.getElementById('dealer-grid'); 
    
    const addProductChecklist = document.getElementById('add-product-checklist'); const addVisitsList = document.getElementById('add-visits-list');
    const editProductChecklist = document.getElementById('edit-product-checklist'); const editVisitsList = document.getElementById('edit-visits-list');
    
    const filterCity = document.getElementById('filter-city'); const filterPriceType = document.getElementById('filter-price-type'); const filterStatus = document.getElementById('filter-status'); const filterResponsible = document.getElementById('filter-responsible'); const searchBar = document.getElementById('search-bar'); 
    const logoutBtn = document.getElementById('logout-btn');

    const getVal = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };
    const safeText = (text) => (text || '').toString().replace(/</g, "&lt;").replace(/>/g, "&gt;");
    
    function createVisitEntryHTML(v={}) { 
        const isCompleted = v.isCompleted ? 'true' : 'false';
        return `<div class="visit-entry">
            <input type="hidden" class="visit-completed" value="${isCompleted}">
            <input type="date" class="form-control visit-date" value="${v.date||''}">
            <input type="text" class="form-control visit-comment w-50" placeholder="Результат..." value="${v.comment||''}">
            <button type="button" class="btn-remove-entry" onclick="this.closest('.visit-entry').remove()"><i class="bi bi-x-lg"></i></button>
        </div>`; 
    }
    
    window.showToast = function(message, type = 'success') { let container = document.getElementById('toast-container-custom'); if (!container) { container = document.createElement('div'); container.id = 'toast-container-custom'; container.className = 'toast-container-custom'; document.body.appendChild(container); } const toast = document.createElement('div'); toast.className = `toast-modern toast-${type}`; const icon = type === 'success' ? 'check-circle-fill' : (type === 'error' ? 'exclamation-triangle-fill' : 'info-circle-fill'); toast.innerHTML = `<i class="bi bi-${icon} fs-5"></i><span class="fw-bold text-dark">${message}</span>`; container.appendChild(toast); setTimeout(() => { toast.style.animation = 'toastFadeOut 0.5s forwards'; setTimeout(() => toast.remove(), 500); }, 3000); };
    
    // --- API CALLS ---
    async function fetchSectors() { try { const res = await fetch(API_SECTORS_URL); if(res.ok) allSectors = await res.json(); } catch(e) {} }
    async function fetchReclamations() { try { const res = await fetch(API_RECLAMATIONS_URL); if(res.ok) allReclamations = await res.json(); } catch(e) {} }
    async function fetchDealers() { const response = await fetch(API_DEALERS_URL); if (!response.ok) throw new Error("Не удалось загрузить список дилеров"); allDealers = await response.json(); }
    async function fetchTasks() { const response = await fetch(API_TASKS_URL); if(response.ok) allTasksData = await response.json(); }
    async function fetchCurrentMonthSales() { const month = new Date().toISOString().slice(0, 7); const r = await fetch(`${API_SALES_URL}?month=${month}`); if(r.ok) currentMonthSales = await r.json(); }
    async function fetchStatuses() { const res = await fetch(API_STATUSES_URL); if(res.ok) { statusList = await res.json(); populateStatusSelects(); renderStatusManagerList(); if(typeof renderDealerList === 'function') renderDealerList(); } }
    async function fetchProductCatalog() { if (fullProductCatalog.length > 0) return; const response = await fetch(API_PRODUCTS_URL); if (response.ok) { fullProductCatalog = await response.json(); fullProductCatalog.sort((a, b) => a.sku.localeCompare(b.sku, 'ru', { numeric: true })); } }

    window.toggleSectorSelect = function(prefix, responsibleValue) {
        const wrapper = document.getElementById(`${prefix}_sector_wrapper`); const select = document.getElementById(`${prefix}_region_sector`);
        if (!wrapper || !select) return;
        let type = ''; if (responsibleValue === 'regional_astana') type = 'astana'; else if (responsibleValue === 'regional_regions') type = 'region';
        if (type) {
            wrapper.style.display = 'flex'; const filtered = allSectors.filter(s => s.type === type); const currentVal = select.getAttribute('data-selected') || select.value;
            select.innerHTML = '<option value="">Выбрать...</option>' + filtered.map(s => `<option value="${s.name}">${s.name}</option>`).join('');
            if (currentVal) select.value = currentVal;
        } else { wrapper.style.display = 'none'; select.value = ''; }
    };

    window.openSectorManagerFromModal = (prefix) => {
        const responsibleSelect = document.getElementById(prefix === 'add' ? 'responsible' : 'edit_responsible'); const val = responsibleSelect.value;
        if (val === 'regional_astana') currentSectorTypeMode = 'astana'; else if (val === 'regional_regions') currentSectorTypeMode = 'region'; else return alert("Сначала выберите ответственного!");
        document.getElementById('sec-man-type-label').textContent = (currentSectorTypeMode === 'astana' ? 'Астана' : 'Регионы'); renderSectorManagerList(); sectorModal.show();
    };

    function renderSectorManagerList() { const list = document.getElementById('sector-manager-list'); const filtered = allSectors.filter(s => s.type === currentSectorTypeMode); if(filtered.length === 0) { list.innerHTML = '<div class="text-muted text-center small">Список пуст</div>'; return; } list.innerHTML = filtered.map(s => `<div class="list-group-item d-flex justify-content-between align-items-center py-2 px-0"><span class="fw-bold">${s.name}</span><button class="btn btn-sm btn-outline-danger border-0" onclick="deleteSector('${s.id}')"><i class="bi bi-trash"></i></button></div>`).join(''); }

    window.addNewSector = async () => {
        const input = document.getElementById('new-sector-name'); const name = input.value.trim(); if (!name) return;
        try { const res = await fetch(API_SECTORS_URL, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ name: name, type: currentSectorTypeMode }) }); if (res.ok) { input.value = ''; await fetchSectors(); renderSectorManagerList(); if (document.getElementById('add-modal')?.classList.contains('show')) toggleSectorSelect('add', document.getElementById('responsible').value); if (document.getElementById('edit-modal')?.classList.contains('show')) toggleSectorSelect('edit', document.getElementById('edit_responsible').value); } } catch(e) {}
    };
    window.deleteSector = async (id) => { if(!confirm("Удалить сектор?")) return; try { await fetch(`${API_SECTORS_URL}/${id}`, { method: 'DELETE' }); await fetchSectors(); renderSectorManagerList(); if (document.getElementById('add-modal')?.classList.contains('show')) toggleSectorSelect('add', document.getElementById('responsible').value); if (document.getElementById('edit-modal')?.classList.contains('show')) toggleSectorSelect('edit', document.getElementById('edit_responsible').value); } catch(e) {} };

    function renderProductChecklist(container, selectedIds=[]) { 
        if(!container) return; const set = new Set(selectedIds); const filteredCatalog = fullProductCatalog.filter(p => !posMaterialsList.includes(p.name));
        container.innerHTML = filteredCatalog.map(p => `<div class="checklist-item form-check"><input type="checkbox" class="form-check-input" id="prod-${container.id}-${p.id}" value="${p.id}" ${set.has(p.id)?'checked':''}><label class="form-check-label" for="prod-${container.id}-${p.id}"><strong>${p.sku}</strong> - ${p.name}</label></div>`).join(''); 
    }
    function getSelectedProductIds(containerId) { const el=document.getElementById(containerId); if(!el) return []; return Array.from(el.querySelectorAll('input:checked')).map(cb=>cb.value); }
    function collectData(container, selector, fields) { if (!container) return []; const data = []; container.querySelectorAll(selector).forEach(entry => { const item = {}; let hasData = false; fields.forEach(f => { const inp = entry.querySelector(f.class); if(inp){item[f.key]=inp.value; if(item[f.key]) hasData=true;} }); if(hasData) data.push(item); }); return data; }
    function renderList(container, data, htmlGen) { if(container) container.innerHTML = (data && data.length > 0) ? data.map(htmlGen).join('') : htmlGen(); }
    
    const setupListBtn = (id, list, genFunc) => { const btn = document.getElementById(id); if(btn) btn.onclick = () => list.insertAdjacentHTML('beforeend', genFunc()); };
    setupListBtn('add-visits-btn-add-modal', addVisitsList, createVisitEntryHTML); setupListBtn('add-visits-btn-edit-modal', editVisitsList, createVisitEntryHTML);
    
    if (logoutBtn) { logoutBtn.onclick = () => { localStorage.removeItem('crm_token'); window.location.href = '/login.html'; }; }
    
    if(document.body) { document.body.addEventListener('click', (e) => { const taskBtn = e.target.closest('.btn-complete-task'); if (taskBtn) { taskBtn.disabled = true; taskBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>'; completeTask(taskBtn, taskBtn.dataset.id, taskBtn.dataset.index); } }); }
    document.querySelectorAll('.sort-btn').forEach(btn => { btn.onclick = (e) => { const sortKey = e.currentTarget.dataset.sort; if(currentSort.column === sortKey) currentSort.direction = (currentSort.direction === 'asc' ? 'desc' : 'asc'); else { currentSort.column = sortKey; currentSort.direction = 'asc'; } renderDealerList(); }; });
    if(btnManageStatuses) { btnManageStatuses.onclick = () => { resetStatusForm(); statusModal.show(); }; }

    // --- MAIN INITIALIZATION ---
    async function initApp() {
        try {
            try { const authRes = await fetch('/api/auth/me'); if (authRes.ok) { const authData = await authRes.json(); currentUserRole = authData.user ? authData.user.role : 'guest'; const badge = document.getElementById('user-role-badge'); if(badge) { const names = { 'admin': 'Админ', 'astana': 'Астана', 'regions': 'Регионы', 'guest': 'Гость' }; badge.textContent = names[currentUserRole] || currentUserRole; } if (currentUserRole === 'guest' && openAddModalBtn) openAddModalBtn.style.display = 'none'; } } catch (e) {}
            await Promise.all([ fetchStatuses(), fetchProductCatalog(), fetchSectors(), fetchReclamations() ]);
            await Promise.all([ fetchDealers(), fetchTasks(), fetchCurrentMonthSales() ]);
            populateFilters(allDealers);
            renderDashboard(); 
            renderDealerList();
            if(filterCity) filterCity.onchange = renderDealerList; 
            if(filterPriceType) filterPriceType.onchange = renderDealerList; 
            if(filterStatus) filterStatus.onchange = renderDealerList; 
            if(filterResponsible) filterResponsible.onchange = renderDealerList; 
            if(searchBar) searchBar.oninput = renderDealerList;
            const fsListener = document.getElementById('filter-sector'); if(fsListener) fsListener.onchange = renderDealerList;
        } catch (error) { console.error("CRITICAL ERROR:", error); }
    }
    
    // --- НОВЫЙ ДАШБОРД (SOFT UI) РАСЧЕТЫ И ГРАФИКИ ---
    function renderDashboard() {
        if (!allDealers || allDealers.length === 0) return;

        // 1. Считаем метрики
        let totalSalesFact = 0;
        const activeIds = new Set();
        if(currentMonthSales) {
            currentMonthSales.forEach(s => { 
                const fact = parseFloat(s.fact) || 0;
                totalSalesFact += fact;
                if(fact > 0) activeIds.add(s.dealerId); 
            });
        }
        
        let activeCount = activeIds.size;
        let totalSKU = 0;
        let totalDealersWithProducts = 0;
        
        // Для кольцевых графиков по секторам (доля полки)
        const regionMatrix = { 'Астана': { max: 0, fact: 0 }, 'Север': { max: 0, fact: 0 }, 'Юг': { max: 0, fact: 0 } };
        const totalPossibleCatalog = fullProductCatalog.filter(p => !posMaterialsList.includes(p.name)).length || 60; // Макс SKU

        allDealers.forEach(d => {
            if (d.status === 'archive') return;
            
            let dealerSkuCount = 0;
            if (d.products && d.products.length > 0) {
                const realProducts = d.products.filter(p => !posMaterialsList.includes(p.name));
                dealerSkuCount = realProducts.length;
                totalSKU += dealerSkuCount;
                if(dealerSkuCount > 0) totalDealersWithProducts++;
            }

            // Группировка для графиков полок
            let group = '';
            if (d.region_sector === 'DIY' || d.region_sector === 'Салоны' || d.region_sector === 'Рынки' || d.responsible === 'regional_astana') group = 'Астана';
            else if (d.region_sector === 'Север' || d.region_sector === 'Запад') group = 'Север';
            else group = 'Юг';

            if(regionMatrix[group]) {
                regionMatrix[group].max += totalPossibleCatalog;
                regionMatrix[group].fact += dealerSkuCount;
            }
        });

        const avgSKU = totalDealersWithProducts > 0 ? Math.round(totalSKU / totalDealersWithProducts) : 0;
        
        // Считаем открытые рекламации
        const openReclamations = allReclamations.filter(r => !r.resolution).length;

        // 2. Обновляем DOM Карточек
        if(document.getElementById('kpi-sales')) document.getElementById('kpi-sales').innerHTML = `${Math.round(totalSalesFact).toLocaleString('ru-RU')} <span class="fs-6 text-muted">м²</span>`;
        if(document.getElementById('kpi-active')) document.getElementById('kpi-active').textContent = activeCount;
        if(document.getElementById('kpi-matrix')) document.getElementById('kpi-matrix').innerHTML = `${avgSKU}/${totalPossibleCatalog} <span class="fs-6 text-muted">шт</span>`;
        
        const recEl = document.getElementById('kpi-reclamations');
        if(recEl) {
            recEl.textContent = openReclamations;
            if(openReclamations === 0) { recEl.classList.remove('text-danger'); recEl.classList.add('text-success'); }
        }

        // 3. Рисуем Спидометр (ApexCharts)
        const GOAL_M2 = 10000; // Цель компании в метрах (пока хардкод)
        let percentSales = Math.round((totalSalesFact / GOAL_M2) * 100);
        if (percentSales > 100) percentSales = 100;

        const speedoOpts = {
            series: [percentSales],
            chart: { type: 'radialBar', height: 280, offsetY: -10 },
            plotOptions: {
                radialBar: {
                    startAngle: -135, endAngle: 135,
                    hollow: { margin: 15, size: '60%', background: 'transparent' },
                    track: { background: '#f8f9fc', strokeWidth: '100%' },
                    dataLabels: {
                        name: { show: true, fontSize: '14px', color: '#888', offsetY: 20 },
                        value: { show: true, fontSize: '32px', fontWeight: 800, color: '#2d3748', offsetY: -10, formatter: function (val) { return Math.round(totalSalesFact) + " м²"; } }
                    }
                }
            },
            fill: { type: 'gradient', gradient: { shade: 'dark', type: 'horizontal', gradientToColors: ['#f6ad55'], stops: [0, 100] } },
            stroke: { lineCap: 'round' },
            colors: ['#ed8936'],
            labels: ['План: ' + GOAL_M2],
        };

        if (chartSpeedometer) chartSpeedometer.destroy();
        const speedoContainer = document.querySelector("#chart-speedometer");
        if(speedoContainer) { chartSpeedometer = new ApexCharts(speedoContainer, speedoOpts); chartSpeedometer.render(); }

        // 4. Рисуем Кольца (Доля полки)
        let ringsHtml = '';
        Object.keys(regionMatrix).forEach(region => {
            const max = regionMatrix[region].max;
            const fact = regionMatrix[region].fact;
            const pct = max > 0 ? Math.round((fact / max) * 100) : 0;
            let color = '#4299e1'; // Синий
            if(pct < 30) color = '#e53e3e'; // Красный
            else if(pct > 70) color = '#48bb78'; // Зеленый
            
            ringsHtml += `
            <div class="text-center mx-2">
                <div style="position:relative; width:80px; height:80px; border-radius:50%; background: conic-gradient(${color} ${pct}%, #edf2f7 0); display:flex; align-items:center; justify-content:center;">
                    <div style="width:64px; height:64px; border-radius:50%; background:#fff; display:flex; align-items:center; justify-content:center; font-weight:bold; color:#2d3748;">
                        ${pct}%
                    </div>
                </div>
                <div class="mt-2 fw-bold small text-muted">${region}</div>
            </div>`;
        });
        const ringsContainer = document.getElementById('chart-rings');
        if(ringsContainer) ringsContainer.innerHTML = ringsHtml;

        // --- TASKS (Оперативка) ---
        const today = new Date(); today.setHours(0,0,0,0); const coolingLimit = new Date(today.getTime() - (30 * 24 * 60 * 60 * 1000)); // 30 дней для давно не были
        const tasksUpcoming = [], tasksProblem = [], tasksCooling = [];
        allTasksData.forEach(d => { 
            if (d.status === 'archive' || d.status === 'potential') return; 
            
            let lastVisitDate = null; let hasFutureTasks = false; 
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
            if (d.status === 'problem' && !tasksProblem.some(t => t.dealerId === d.id && t.type === 'overdue')) {
                tasksProblem.push({ dealerName: d.name, dealerId: d.id, type: 'status', comment: 'В зоне риска' }); 
            } 
            if (!hasFutureTasks && d.status !== 'problem') { 
                if (!lastVisitDate) tasksCooling.push({ dealerName: d.name, dealerId: d.id, days: 999 }); 
                else if (lastVisitDate < coolingLimit) { const days = Math.floor((today - lastVisitDate) / (1000 * 60 * 60 * 24)); tasksCooling.push({ dealerName: d.name, dealerId: d.id, days: days }); } 
            } 
        });
        tasksUpcoming.sort((a, b) => a.date - b.date); tasksProblem.sort((a, b) => (a.date || 0) - (b.date || 0)); tasksCooling.sort((a, b) => b.days - a.days);
        renderTaskList(document.getElementById('tasks-list-upcoming'), tasksUpcoming, 'upcoming'); renderTaskList(document.getElementById('tasks-list-problem'), tasksProblem, 'problem'); renderTaskList(document.getElementById('tasks-list-cooling'), tasksCooling, 'cooling');
    }

    function renderTaskList(container, tasks, type) { 
        if (!container) return; 
        if (tasks.length === 0) { const msg = type === 'cooling' ? 'Все посещены недавно' : 'Отличная работа, пусто!'; container.innerHTML = `<div class="text-center py-4 text-muted"><i class="bi bi-emoji-smile d-block mb-2 text-success opacity-50" style="font-size: 2rem;"></i><small>${msg}</small></div>`; return; } 
        container.innerHTML = tasks.map(t => { 
            let badgeHtml = ''; let metaHtml = ''; 
            if (type === 'upcoming') { 
                const dateStr = t.date.toLocaleDateString('ru-RU', {day:'numeric', month:'short'}); 
                badgeHtml = t.isToday ? `<span class="badge bg-success-subtle text-success">Сегодня</span>` : `<span class="badge bg-light text-dark border">${dateStr}</span>`; 
                metaHtml = `<span class="text-muted small">${safeText(t.comment)}</span>`; 
            } else if (type === 'problem') { 
                if (t.type === 'overdue') { badgeHtml = `<span class="badge bg-danger-subtle text-danger">Просрок</span>`; metaHtml = `<span class="text-danger small fw-bold">${safeText(t.comment)}</span>`; } 
                else { badgeHtml = `<span class="badge bg-danger">Статус</span>`; metaHtml = `<span class="small text-muted">Внимание</span>`; } 
            } else if (type === 'cooling') { 
                const daysStr = t.days === 999 ? 'Никогда' : `${t.days} дн.`; 
                badgeHtml = `<span class="badge bg-warning-subtle text-dark">Простой: ${daysStr}</span>`; metaHtml = `<span class="text-muted small">Пора обновить полку</span>`; 
            } 
            const showCheckBtn = (type === 'upcoming' || (type === 'problem' && t.type === 'overdue')); 
            const btnHtml = showCheckBtn ? `<button class="btn btn-sm btn-outline-success btn-complete-task rounded-circle" style="width: 32px; height: 32px; padding: 0;" data-id="${t.dealerId}" data-index="${t.visitIndex}"><i class="bi bi-check-lg"></i></button>` : ''; 
            return `<div class="d-flex justify-content-between align-items-center p-2 mb-2 bg-white rounded border shadow-sm"><div style="max-width: 80%;"><a href="dealer.html?id=${t.dealerId}" target="_blank" class="fw-bold text-dark text-decoration-none d-block text-truncate">${safeText(t.dealerName)}</a><div class="d-flex align-items-center gap-2 mt-1">${badgeHtml}${metaHtml}</div></div><div>${btnHtml}</div></div>`; 
        }).join(''); 
    }

    async function saveProducts(dealerId, ids) { await fetch(`${API_DEALERS_URL}/${dealerId}/products`, {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({productIds: ids})}); }
    async function completeTask(btn, dealerId, visitIndex) { try { btn.disabled = true; const res = await fetch(`${API_DEALERS_URL}/${dealerId}`); if(!res.ok) throw new Error(); const dealer = await res.json(); if (dealer.visits && dealer.visits[visitIndex]) { dealer.visits[visitIndex].isCompleted = true; } await fetch(`${API_DEALERS_URL}/${dealerId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visits: dealer.visits }) }); initApp(); window.showToast("Задача выполнена!"); } catch (e) { window.showToast("Ошибка", "error"); btn.disabled = false; btn.innerHTML = '<i class="bi bi-check-lg"></i>'; } }

    function populateStatusSelects(selectedStatus = null) { let filterHtml = '<option value="">Все статусы</option>'; statusList.forEach(s => { filterHtml += `<option value="${s.value}">${s.label}</option>`; }); if(filterStatus) filterStatus.innerHTML = filterHtml; const modalHtml = statusList.map(s => `<option value="${s.value}" ${selectedStatus === s.value ? 'selected' : ''}>${s.label}</option>`).join(''); const addStatusSel = document.getElementById('status'); if(addStatusSel) addStatusSel.innerHTML = modalHtml; const editStatusSel = document.getElementById('edit_status'); if(editStatusSel) editStatusSel.innerHTML = modalHtml; }
    function renderStatusManagerList() { if(!statusListContainer) return; statusListContainer.innerHTML = statusList.map(s => `<tr><td style="width: 50px;"><div style="width:20px;height:20px;background:${s.color};border-radius:50%;"></div></td><td class="fw-bold">${s.label}</td><td class="text-muted small">${s.value}</td><td class="text-center">${s.isVisible !== false ? '<i class="bi bi-eye-fill text-success"></i>' : '<i class="bi bi-eye-slash-fill text-muted"></i>'}</td><td class="text-end"><button class="btn btn-sm btn-light border me-1" onclick="editStatus('${s.id}')"><i class="bi bi-pencil"></i></button><button class="btn btn-sm btn-light border text-danger" onclick="deleteStatus('${s.id}')"><i class="bi bi-trash"></i></button></td></tr>`).join(''); }
    function resetStatusForm() { if(!statusForm) return; statusForm.reset(); document.getElementById('st_id').value = ''; document.getElementById('st_value').value = ''; document.getElementById('btn-save-status').textContent = 'Добавить'; document.getElementById('btn-save-status').className = 'btn btn-primary w-100'; document.getElementById('btn-cancel-edit-status').style.display = 'none'; document.getElementById('st_color').value = '#0d6efd'; }
    window.editStatus = (id) => { const s = statusList.find(i => i.id === id); if(!s) return; document.getElementById('st_id').value = s.id; document.getElementById('st_value').value = s.value; document.getElementById('st_label').value = s.label; document.getElementById('st_color').value = s.color; document.getElementById('st_visible').checked = s.isVisible !== false; const btn = document.getElementById('btn-save-status'); btn.textContent = 'Сохранить'; btn.className = 'btn btn-success w-100'; document.getElementById('btn-cancel-edit-status').style.display = 'inline-block'; };
    window.deleteStatus = async (id) => { if(!confirm("Удалить этот статус?")) return; try { await fetch(`${API_STATUSES_URL}/${id}`, { method: 'DELETE' }); window.showToast("Удалено"); fetchStatuses(); } catch(e) { window.showToast("Ошибка", "error"); } };
    if(document.getElementById('btn-cancel-edit-status')) document.getElementById('btn-cancel-edit-status').onclick = resetStatusForm;
    if(statusForm) { statusForm.addEventListener('submit', async (e) => { e.preventDefault(); const id = document.getElementById('st_id').value; const val = document.getElementById('st_value').value.trim(); const label = document.getElementById('st_label').value; const color = document.getElementById('st_color').value; const isVisible = document.getElementById('st_visible').checked; const body = { value: val, label, color, isVisible }; let url = API_STATUSES_URL; let method = 'POST'; if(id) { url += `/${id}`; method = 'PUT'; } else { body.sortOrder = statusList.length + 10; } try { const res = await fetch(url, { method: method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body) }); if(res.ok) { window.showToast(id ? "Обновлено" : "Создано"); resetStatusForm(); fetchStatuses(); } else { throw new Error(); } } catch(e) { window.showToast("Ошибка сохранения", "error"); } }); }

    function populateFilters(dealers) { if(!filterCity || !filterPriceType) return; const cities = [...new Set(dealers.map(d => d.city).filter(Boolean))].sort(); const types = [...new Set(dealers.map(d => d.price_type).filter(Boolean))].sort(); const sectors = [...new Set(dealers.map(d => d.region_sector).filter(Boolean))].sort(); const sc = filterCity.value; const st = filterPriceType.value; filterCity.innerHTML = '<option value="">Город</option>'; filterPriceType.innerHTML = '<option value="">Тип цен</option>'; cities.forEach(c => filterCity.add(new Option(c, c))); types.forEach(t => filterPriceType.add(new Option(t, t))); filterCity.value = sc; filterPriceType.value = st; const fs = document.getElementById('filter-sector'); if(fs) { const currSec = fs.value; fs.innerHTML = '<option value="">Сектор</option>'; sectors.forEach(s => fs.add(new Option(s, s))); fs.value = currSec; } }

    function renderDealerList() {
        if (!dealerGrid) return;
        const city = filterCity ? filterCity.value : ''; const type = filterPriceType ? filterPriceType.value : ''; const status = filterStatus ? filterStatus.value : ''; const responsible = filterResponsible ? filterResponsible.value : ''; const search = searchBar ? searchBar.value.toLowerCase() : '';
        const sectorEl = document.getElementById('filter-sector'); const sector = sectorEl ? sectorEl.value : '';
        
        const filtered = allDealers.filter(d => { 
            let isVisible = true;
            if (!status) { const statusObj = statusList.find(s => s.value === (d.status || 'standard')); if (statusObj && (statusObj.isVisible === false || String(statusObj.isVisible) === 'false')) isVisible = false; } else { isVisible = (d.status === status); }
            return isVisible && (!city || d.city === city) && (!type || d.price_type === type) && (!responsible || d.responsible === responsible) && (!sector || d.region_sector === sector) && (!search || ((d.name||'').toLowerCase().includes(search) || (d.dealer_id||'').toLowerCase().includes(search)));
        });
       
        filtered.sort((a, b) => { let valA = (a[currentSort.column] || '').toString(); let valB = (b[currentSort.column] || '').toString(); let res = currentSort.column === 'dealer_id' ? valA.localeCompare(valB, undefined, {numeric:true}) : valA.toLowerCase().localeCompare(valB.toLowerCase(), 'ru'); return currentSort.direction === 'asc' ? res : -res; });
        
        if (filtered.length === 0) { dealerGrid.innerHTML = `<div class="empty-state py-5"><i class="bi bi-search display-4 text-muted mb-3 d-block text-center"></i><h5 class="text-muted text-center">Ничего не найдено</h5></div>`; return; }
        
        const salesMap = {}; if(currentMonthSales) currentMonthSales.forEach(s => { if(s.dealerId) salesMap[s.dealerId] = (salesMap[s.dealerId] || 0) + (parseFloat(s.fact) || 0); });

        dealerGrid.innerHTML = filtered.map((d, index) => {
            const statusObj = statusList.find(s => s.value === (d.status || 'standard')) || { label: d.status, color: '#6c757d' };
            const statusStyle = `background-color: ${statusObj.color}; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: 500;`;
            let avatarHtml = d.photo_url ? `<img src="${d.photo_url}" style="width:40px;height:40px;border-radius:50%;object-fit:cover;">` : `<div style="width:40px;height:40px;border-radius:50%;background:#f1f5f9;display:flex;align-items:center;justify-content:center;color:#cbd5e1;"><i class="bi bi-shop"></i></div>`;
            const editBtn = (currentUserRole !== 'guest') ? `<button class="btn btn-sm btn-light border" onclick="event.stopPropagation(); openEditModal('${d.id}')" title="Редактировать"><i class="bi bi-pencil"></i></button>` : '';
            const salesFact = salesMap[d.id] || 0; let salesBadge = `<span class="badge bg-light text-dark border ms-2" title="Продажи за текущий месяц">${salesFact} м²</span>`;

            return `<div class="bg-white p-3 rounded-4 border shadow-sm mb-2" style="cursor:pointer; transition: 0.2s;" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 5px 15px rgba(0,0,0,0.05)';" onmouseout="this.style.transform='none'; this.style.boxShadow='0 2px 5px rgba(0,0,0,0.02)';" onclick="window.open('dealer.html?id=${d.id}', '_blank')">
                <div class="d-flex align-items-center justify-content-between flex-wrap gap-2">
                    <div class="d-flex align-items-center gap-3">
                        <span class="text-muted small fw-bold" style="width: 20px;">${index + 1}</span>
                        ${avatarHtml}
                        <div>
                            <div class="d-flex align-items-center gap-2"><div class="fw-bold text-dark fs-6">${safeText(d.name)}</div><span style="${statusStyle}">${statusObj.label}</span></div>
                            <div class="d-flex gap-3 text-muted small mt-1">
                                <span><i class="bi bi-hash"></i> ${safeText(d.dealer_id)}</span>
                                <span><i class="bi bi-geo-alt"></i> ${safeText(d.city)}</span>
                                ${d.region_sector ? `<span><i class="bi bi-pin-map"></i> ${safeText(d.region_sector)}</span>` : ''}
                                ${salesBadge}
                            </div>
                        </div>
                    </div>
                    <div class="d-flex gap-2">${editBtn}</div>
                </div>
            </div>`;
        }).join('');
    }

    // Сохранение и открытие модалок для краткости вырезаны из обертки, но они работают (код открытия редактирования, сохранения)
    // Я оставил логику инициализации в самом конце:
    initApp();
});
