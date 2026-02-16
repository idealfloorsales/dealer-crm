// --- АВТОРИЗАЦИЯ (ВСТАВИТЬ В НАЧАЛО ФАЙЛА) ---
const originalFetch = window.fetch;
window.fetch = async function (url, options) {
    options = options || {};
    options.headers = options.headers || {};
    const token = localStorage.getItem('crm_token');
    if (token) options.headers['Authorization'] = 'Bearer ' + token;
    
    const response = await originalFetch(url, options);
    
    // ИСПРАВЛЕНИЕ: Добавлена проверка 403 (Forbidden)
    if (response.status === 401 || response.status === 403) {
        localStorage.removeItem('crm_token'); // Чистим плохой токен
        window.location.href = '/login.html';
    }
    
    return response;
};
// -------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
    
    const API_DEALERS = '/api/dealers';
    const API_SALES = '/api/sales';
    const API_SECTORS = '/api/sectors'; // Новый API для секторов
    
    // Элементы интерфейса
    const monthPicker = document.getElementById('month-picker');
    const container = document.getElementById('sales-container');
    const summaryList = document.getElementById('summary-list');
    const dashboardTop = document.getElementById('sales-top-dashboard'); 
    const saveBtn = document.getElementById('save-btn');
    const printBtn = document.getElementById('print-btn');
    const summaryCol = document.getElementById('summary-col');
    
    // Мобильные табы (Ввод / Сводка)
    const tabInputBtn = document.getElementById('tab-input-btn');
    const tabSummaryBtn = document.getElementById('tab-summary-btn');
    const colInput = document.getElementById('sales-container-col');
    const colSummary = document.getElementById('summary-col');

    // Установка текущего месяца по умолчанию
    const now = new Date();
    monthPicker.value = now.toISOString().slice(0, 7);

    // БАЗОВАЯ КОНФИГУРАЦИЯ ГРУПП (Будет дополнена динамически)
    let groupsConfig = [
        { key: 'vip', title: 'Спец. Клиенты (VIP)', isSystem: true }, 
        { key: 'regional_astana', title: 'Астана (Региональный)', isSystem: true }
        // Остальные группы (регионы) добавятся динамически из базы
    ];

    let allDealers = [];
    let currentSales = [];
    let allSectors = []; // Список секторов из БД
    
    async function init() {
        try {
            // Проверка прав
            const authRes = await fetch('/api/auth/me');
            if (authRes.ok) {
                const authData = await authRes.json();
                const user = authData.user || {};
                const canEdit = user.permissions && user.permissions.can_edit_sales;
                if (!canEdit && saveBtn) { 
                    saveBtn.disabled = true; 
                    saveBtn.innerHTML = '<i class="bi bi-lock"></i> Только чтение'; 
                }
            }
        } catch (e) { console.error(e); }

        // Сначала грузим сектора, чтобы построить структуру
        await loadSectors(); 
        loadData();
        setupMobileTabs();
    }

    async function loadSectors() {
        try {
            const res = await fetch(API_SECTORS);
            if (res.ok) {
                allSectors = await res.json();
                
                // Строим группы на основе секторов
                // 1. Астана (DIY, Салоны и т.д.)
                const astanaSectors = allSectors.filter(s => s.type === 'astana');
                astanaSectors.forEach(s => {
                    // Добавляем как подгруппы или отдельные группы, если нужно
                    // Пока оставим "Астана" как одну большую группу, или можно разбить
                });

                // 2. Регионы (Север, Юг, Запад...)
                const regionSectors = allSectors.filter(s => s.type === 'region');
                
                // Добавляем регионы в конфиг, если их там еще нет
                regionSectors.forEach(s => {
                    // Генерируем ключ из названия (например "Север" -> "North" или транслит, или просто ID)
                    // Для простоты используем название как ключ (убрав пробелы)
                    const key = 'sector_' + s.name.replace(/\s+/g, '_').toLowerCase();
                    
                    // Проверяем, нет ли уже такой группы
                    if (!groupsConfig.find(g => g.key === key)) {
                        groupsConfig.push({ key: key, title: `Регион ${s.name}`, sectorName: s.name });
                    }
                });

                // Добавляем "Прочие" в конец
                groupsConfig.push({ key: 'other', title: 'Без сектора / Прочие', isSystem: true });
            }
        } catch (e) { console.error("Ошибка загрузки секторов", e); }
    }

    function setupMobileTabs() {
        if(!tabInputBtn || !tabSummaryBtn) return;

        tabInputBtn.onclick = () => {
            tabInputBtn.classList.add('btn-white', 'shadow-sm', 'text-primary');
            tabInputBtn.classList.remove('text-muted');
            tabSummaryBtn.classList.remove('btn-white', 'shadow-sm', 'text-primary');
            tabSummaryBtn.classList.add('text-muted');
            colInput.classList.remove('mobile-hidden');
            colSummary.classList.add('mobile-hidden');
            window.scrollTo(0, 0);
        };

        tabSummaryBtn.onclick = () => {
            tabSummaryBtn.classList.add('btn-white', 'shadow-sm', 'text-primary');
            tabSummaryBtn.classList.remove('text-muted');
            tabInputBtn.classList.remove('btn-white', 'shadow-sm', 'text-primary');
            tabInputBtn.classList.add('text-muted');
            colSummary.classList.remove('mobile-hidden');
            colInput.classList.add('mobile-hidden');
            window.scrollTo(0, 0);
        };
    }

    async function loadData() {
        try {
            container.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div></div>';
            const month = monthPicker.value;
            
            const [dealersRes, salesRes] = await Promise.all([
                fetch(API_DEALERS + '?scope=all'),
                fetch(`${API_SALES}?month=${month}`)
            ]);

            if (!dealersRes.ok || !salesRes.ok) throw new Error("Ошибка доступа к данным");

            allDealers = await dealersRes.json();
            currentSales = await salesRes.json();
            
            renderAll();
        } catch (e) { 
            container.innerHTML = `<div class="alert alert-danger">Ошибка загрузки: ${e.message}</div>`;
        }
    }

    function getDealerGroup(d) {
        if (d.hasPersonalPlan) return 'vip';
        if (d.responsible === 'regional_astana') return 'regional_astana';
        
        if (d.responsible === 'regional_regions') {
            // Ищем сектор в конфиге
            const sectorName = d.region_sector || '';
            const group = groupsConfig.find(g => g.sectorName === sectorName);
            if (group) return group.key;
            
            // Если сектор старый (например "север" текстом, а не из справочника) - фалбэк
            const secLower = sectorName.toLowerCase().trim();
            // Попробуем найти по частичному совпадению
            const fuzzyGroup = groupsConfig.find(g => g.title.toLowerCase().includes(secLower));
            if (fuzzyGroup) return fuzzyGroup.key;
        }
        return 'other';
    }

    function fmt(num) {
        if (typeof num !== 'number' || isNaN(num)) return 0;
        return Math.round(num * 100) / 100;
    }

    function calculateKPI(plan, fact, daysInMonth, currentDay) {
        plan = parseFloat(plan) || 0;
        fact = parseFloat(fact) || 0;
        
        let forecast = 0;
        if (currentDay > 0) {
            forecast = (fact / currentDay) * daysInMonth;
        }
        
        const percent = plan > 0 ? (fact / plan) * 100 : (fact > 0 ? 100 : 0);
        const diff = fact - plan; 
        
        return { diff, forecast, percent };
    }

    function captureState() {
        document.querySelectorAll('.sales-input.inp-fact').forEach(inp => {
            const row = inp.closest('.sales-row');
            const dealerId = row.dataset.id === "null" ? null : row.dataset.id;
            const dealerName = row.dataset.name;
            const isCustom = row.dataset.custom === 'true';
            const group = row.closest('.region-card').dataset.group;
            
            const val = parseFloat(inp.value.replace(',', '.')) || 0;

            let record = currentSales.find(s => 
                (isCustom && s.isCustom && s.dealerName === dealerName) || 
                (!isCustom && !s.isCustom && s.dealerId === dealerId)
            );

            if (record) { 
                record.fact = val; 
            } else if (val !== 0) { 
                currentSales.push({ 
                    month: monthPicker.value, 
                    group, 
                    dealerId, 
                    dealerName, 
                    isCustom, 
                    plan: 0, 
                    fact: val 
                });
            }
        });
        
        document.querySelectorAll('.plan-input').forEach(inp => {
            const planKey = inp.dataset.planKey;
            const val = parseFloat(inp.value.replace(',', '.')) || 0;
            
            let record = currentSales.find(s => s.dealerId === `PLAN_${planKey}`);
            
            if (record) { 
                record.plan = val; 
            } else if (val !== 0) {
                currentSales.push({ 
                    month: monthPicker.value, 
                    group: 'PLAN', 
                    dealerId: `PLAN_${planKey}`, 
                    dealerName: `Plan ${planKey}`, 
                    isCustom: false, 
                    plan: val, 
                    fact: 0 
                });
            }
        });
    }

    function renderAll() {
        const date = new Date(monthPicker.value);
        const year = date.getFullYear();
        const monthIndex = date.getMonth();
        const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
        
        const today = new Date();
        let currentDay = daysInMonth; 
        
        if (today.getFullYear() === year && today.getMonth() === monthIndex) {
            currentDay = today.getDate();
        }

        container.innerHTML = '';
        summaryList.innerHTML = '';
        if(dashboardTop) dashboardTop.innerHTML = '';

        // Динамический объект для фактов (на основе конфига групп)
        const facts = {};
        groupsConfig.forEach(g => facts[g.key] = 0);
        facts.vip = []; // VIP храним массивом для детализации

        groupsConfig.forEach(grp => {
            const groupDealers = allDealers.filter(d => {
                const isReal = d.status !== 'potential' && d.status !== 'archive';
                const matchGroup = getDealerGroup(d) === grp.key;
                return isReal && matchGroup;
            });
            
            const customSales = currentSales.filter(s => s.isCustom && s.group === grp.key);

            if (groupDealers.length === 0 && customSales.length === 0 && grp.key !== 'other') return;

            let rowsHtml = '';
            const items = [
                ...groupDealers.map(d => ({ id: d.id, name: d.name, isCustom: false })),
                ...customSales.map(s => ({ id: null, name: s.dealerName, isCustom: true }))
            ];
            
            items.sort((a,b) => a.name.localeCompare(b.name));

            items.forEach(item => {
                const sale = currentSales.find(s => (item.isCustom && s.isCustom && s.dealerName === item.name) || (!item.isCustom && !s.isCustom && s.dealerId === item.id)) || {};
                const fact = parseFloat(sale.fact) || 0;
                
                if (grp.key === 'vip') {
                    facts.vip.push({ id: item.id || item.name, name: item.name, fact: fact });
                } else {
                    facts[grp.key] += fact;
                }

                const displayVal = (fact !== 0) ? fact : '';

                rowsHtml += `
                    <div class="sales-row" data-id="${item.id || ''}" data-name="${item.name}" data-custom="${item.isCustom}">
                        <div class="sales-dealer-name text-truncate">
                            <span class="${grp.key === 'vip' ? 'fw-bold text-primary' : ''}">${item.name}</span>
                        </div>
                        <div class="d-flex align-items-center gap-2">
                            <div class="sales-input-group">
                                <input type="number" step="0.01" class="form-control form-control-sm sales-input inp-fact" value="${displayVal}" placeholder="0">
                            </div>
                            ${item.isCustom ? `<button class="btn btn-sm text-danger btn-del-row p-0"><i class="bi bi-x-circle"></i></button>` : ''}
                        </div>
                    </div>
                `;
            });
            
            container.innerHTML += `
                <div class="region-card" data-group="${grp.key}">
                    <div class="region-header">
                        <span class="region-title">${grp.title}</span>
                        <button class="btn btn-sm btn-light border-0 text-primary py-0 btn-add-custom" data-group="${grp.key}">+ Добавить</button>
                    </div>
                    <div class="region-body">${rowsHtml || '<div class="text-center text-muted small py-3">Нет записей</div>'}</div>
                </div>
            `;
        });

        // СБОРКА СВОДНОЙ ВЕДОМОСТИ
        const plans = {};
        // Собираем ключи для планов (системные + динамические регионы + vip)
        const allPlanKeys = ['regional_regions', 'regional_astana', 'total_all']; // Базовые
        groupsConfig.forEach(g => { if(!g.isSystem || g.key==='other') allPlanKeys.push(g.key); }); // Добавляем регионы
        facts.vip.forEach(v => allPlanKeys.push(`vip_${v.id}`)); // Добавляем VIP

        allPlanKeys.forEach(k => {
            const p = currentSales.find(s => s.dealerId === `PLAN_${k}`) || {};
            plans[k] = parseFloat(p.plan) || 0;
        });

        // Считаем ИТОГО по регионам (все, кроме Астаны и VIP и Other)
        let totalRegionsFact = 0;
        groupsConfig.forEach(g => {
            if (g.key !== 'vip' && g.key !== 'regional_astana' && g.key !== 'other') {
                totalRegionsFact += facts[g.key];
            }
        });

        let totalVipFact = 0; facts.vip.forEach(v => totalVipFact += v.fact);
        const totalFactAll = totalRegionsFact + facts.regional_astana + totalVipFact + facts.other;
        
        renderTopDashboard(facts, plans, totalRegionsFact);

        const renderSumItem = (title, planKey, factVal, isSubItem = false) => {
            const plan = plans[planKey] || 0;
            const { percent, forecast, diff } = calculateKPI(plan, factVal, daysInMonth, currentDay);
            
            let colorClass = 'text-warning'; let bgClass = 'bg-warning';
            if (percent >= 90) { colorClass = 'text-success'; bgClass = 'bg-success'; }
            if (percent < 70) { colorClass = 'text-danger'; bgClass = 'bg-danger'; }
            
            let diffHtml = '';
            if (plan > 0) {
                if (diff < 0) {
                    diffHtml = `<span class="text-danger fw-bold" title="Не хватает до плана">Ещё: ${fmt(Math.abs(diff))}</span>`;
                } else {
                    diffHtml = `<span class="text-success fw-bold" title="Сверх плана">+${fmt(diff)}</span>`;
                }
            }

            const width = Math.min(percent, 100);
            const planVal = plan !== 0 ? plan : '';

            return `
            <div class="summary-item ${isSubItem ? 'ps-4 bg-light bg-opacity-25' : ''}">
                <div class="summary-header">
                    <span class="summary-title">
                        ${title}
                        <input type="number" class="plan-input" data-plan-key="${planKey}" value="${planVal}" placeholder="План">
                    </span>
                    <span class="summary-percent ${colorClass} fw-bold">${fmt(percent)}%</span>
                </div>
                <div class="progress mb-2" style="height: 6px;">
                    <div class="progress-bar ${bgClass}" style="width: ${width}%"></div>
                </div>
                <div class="d-flex justify-content-between align-items-center small mt-1">
                    <span class="text-dark">Факт: <strong>${fmt(factVal)}</strong></span>
                    ${diffHtml}
                </div>
                <div class="text-end small text-muted mt-1" style="font-size: 0.7rem;">
                    Прогноз: <strong>${fmt(forecast)}</strong>
                </div>
            </div>`;
        };

        let summaryHtml = '';
        summaryHtml += `<div class="p-3 bg-primary-subtle border-bottom"><h6 class="fw-bold mb-3 text-primary text-uppercase small ls-1">Общий результат</h6>${renderSumItem("ВСЕГО ПО КОМПАНИИ", "total_all", totalFactAll)}</div>`;
        summaryHtml += renderSumItem("Астана (Региональный)", "regional_astana", facts.regional_astana);
        
        if (facts.vip.length > 0) {
            summaryHtml += `<div class="mt-2 mb-1 px-3 pt-2 border-top"><span class="small fw-bold text-muted text-uppercase">VIP Клиенты</span></div>`;
            facts.vip.forEach(v => summaryHtml += renderSumItem(v.name, `vip_${v.id}`, v.fact));
        }

        summaryHtml += `<div class="mt-2 mb-1 px-3 pt-2 border-top"><span class="small fw-bold text-muted text-uppercase">Регионы</span></div>`;
        summaryHtml += renderSumItem("Регионы (Итого)", "regional_regions", totalRegionsFact);
        
        // Рендерим динамические регионы
        groupsConfig.forEach(g => {
            if (g.key !== 'vip' && g.key !== 'regional_astana' && g.key !== 'other') {
                summaryHtml += renderSumItem(g.title, g.key, facts[g.key], true);
            }
        });
        
        if (facts.other !== 0) {
            summaryHtml += `<div class="summary-item"><div class="summary-header"><span class="summary-title text-danger">⚠️ Без категории</span><span class="summary-percent text-muted">-</span></div><div class="summary-meta"><span>Факт: <strong>${fmt(facts.other)}</strong></span></div></div>`;
        }

        summaryList.innerHTML = summaryHtml;
        setupEventListeners();
    }

    function renderTopDashboard(facts, plans, totalRegionsFact) {
        if (!dashboardTop) return;
        
        const createCard = (title, fact, plan, iconClass='bi-graph-up', color='primary') => {
            const { percent } = calculateKPI(plan, fact, 1, 1);
            let badgeColor = 'bg-danger';
            if (percent >= 100) badgeColor = 'bg-success';
            else if (percent >= 80) badgeColor = 'bg-warning text-dark';

            return `
            <div class="col-md-3 col-sm-6 col-6"> 
                <div class="card dash-card h-100 rounded-4">
                    <div class="card-body p-2 p-md-3">
                        <div class="d-flex justify-content-between align-items-start mb-2">
                            <span class="dash-label text-truncate" style="max-width: 80%">${title}</span>
                            <div class="icon-circle bg-${color}-subtle text-${color} small d-none d-md-flex"><i class="bi ${iconClass}"></i></div>
                        </div>
                        <div class="d-flex align-items-baseline gap-2 mb-1 flex-wrap">
                            <span class="dash-value fs-5 fs-md-4">${fmt(fact)}</span>
                            <span class="badge ${badgeColor} rounded-pill" style="font-size: 0.65rem">${fmt(percent)}%</span>
                        </div>
                        <div class="progress" style="height: 4px;">
                            <div class="progress-bar ${badgeColor}" style="width: ${Math.min(percent, 100)}%"></div>
                        </div>
                        <div class="small text-muted mt-2 d-none d-md-block">План: ${fmt(plan)}</div>
                    </div>
                </div>
            </div>`;
        };

        let html = '';
        html += createCard('Астана', facts.regional_astana, plans.regional_astana, 'bi-building', 'primary');
        html += createCard('Регионы', totalRegionsFact, plans.regional_regions, 'bi-globe', 'info');
        
        facts.vip.forEach(v => {
            const plan = plans[`vip_${v.id}`] || 0;
            html += createCard(v.name, v.fact, plan, 'bi-star', 'warning');
        });

        dashboardTop.innerHTML = html;
    }

    function setupEventListeners() {
        document.querySelectorAll('.btn-add-custom').forEach(btn => {
            btn.onclick = () => {
                captureState();
                const name = prompt("Название (Имя дилера или пометка):");
                if (name) {
                    currentSales.push({ 
                        month: monthPicker.value, 
                        group: btn.dataset.group, 
                        dealerName: name, 
                        isCustom: true, 
                        plan: 0, 
                        fact: 0 
                    });
                    renderAll();
                }
            };
        });

        document.querySelectorAll('.btn-del-row').forEach(btn => {
            btn.onclick = (e) => {
                if(confirm('Удалить эту запись?')) {
                    captureState();
                    const row = e.target.closest('.sales-row');
                    const name = row.dataset.name;
                    currentSales = currentSales.filter(s => !(s.isCustom && s.dealerName === name));
                    renderAll();
                }
            };
        });
    }

    if (printBtn) {
        printBtn.onclick = () => {
            if(summaryCol) summaryCol.setAttribute('data-print-date', new Date().toLocaleDateString());
            window.print();
        };
    }

    if (saveBtn) {
        saveBtn.onclick = async () => {
            captureState();
            try {
                // БЛОКИРУЕМ КНОПКУ, ЧТОБЫ ИЗБЕЖАТЬ ДВОЙНОГО КЛИКА
                saveBtn.disabled = true; 
                saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
                
                const res = await fetch(API_SALES, { 
                    method: 'POST', 
                    headers: { 'Content-Type': 'application/json' }, 
                    body: JSON.stringify({ month: monthPicker.value, data: currentSales }) 
                });

                if (res.ok) { 
                    // ЕСЛИ УСПЕШНО
                    if (window.showToast) { window.showToast('Сохранено!'); } else { alert('Сохранено!'); }
                    saveBtn.className = 'btn btn-success shadow-sm px-4 rounded-pill';
                    saveBtn.innerHTML = '<i class="bi bi-check-lg"></i> OK'; 
                    
                    // РАЗБЛОКИРУЕМ ЧЕРЕЗ 2 СЕКУНДЫ
                    setTimeout(() => { 
                        saveBtn.innerHTML = '<i class="bi bi-save me-2"></i>Сохранить'; 
                        saveBtn.className='btn btn-success shadow-sm px-4 rounded-pill'; 
                        saveBtn.disabled = false; // Важно: разблокируем для повторного нажатия
                    }, 2000);

                    loadData(); 
                } else throw new Error('Ошибка при сохранении');
            } catch (e) { 
                // ЕСЛИ ОШИБКА - РАЗБЛОКИРУЕМ СРАЗУ
                alert(e.message); 
                saveBtn.disabled = false; 
                saveBtn.innerHTML = '<i class="bi bi-save me-2"></i>Сохранить';
            } 
        };
    }

    monthPicker.addEventListener('change', loadData);
    init();
});
