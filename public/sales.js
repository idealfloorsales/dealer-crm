document.addEventListener('DOMContentLoaded', () => {
    
    const API_DEALERS = '/api/dealers';
    const API_SALES = '/api/sales';
    
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

    // Конфигурация групп (Порядок отображения на странице)
    const groupsConfig = [
        { key: 'regional_astana', title: 'Астана (Региональный)' },
        { key: 'vip', title: 'Спец. Клиенты (VIP)' }, 
        { key: 'north', title: 'Регион Север' },
        { key: 'south', title: 'Регион Юг' },
        { key: 'west', title: 'Регион Запад' },
        { key: 'east', title: 'Регион Восток' },
        { key: 'center', title: 'Регион Центр' },
        { key: 'other', title: 'Без ответственного / Прочие' }
    ];

    let allDealers = [];
    let currentSales = [];
    
    async function init() {
        try {
            // Проверка прав (чтобы отключить кнопку Гостю)
            const authRes = await fetch('/api/auth/me');
            if (authRes.ok) {
                const authData = await authRes.json();
                
                // Если это ГОСТЬ — блокируем кнопку.
                // Астана и Регионы — НЕ гости, поэтому кнопка у них будет работать.
                if (authData.role === 'guest' && saveBtn) { 
                    saveBtn.disabled = true; 
                    saveBtn.innerHTML = '<i class="bi bi-lock"></i> Только чтение'; 
                }
            }
        } catch (e) { console.error(e); }

        loadData();
        setupMobileTabs();
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
                // ВАЖНО: Добавляем ?scope=all
                // Это говорит серверу: "Дай мне ВСЕХ дилеров, даже если я Региональный менеджер"
                fetch(API_DEALERS + '?scope=all'),
                fetch(`${API_SALES}?month=${month}`)
            ]);

            allDealers = await dealersRes.json();
            currentSales = await salesRes.json();
            
            renderAll();
        } catch (e) { 
            container.innerHTML = `<div class="alert alert-danger">Ошибка загрузки: ${e.message}</div>`;
        }
    }

    function getDealerGroup(d) {
        // Определение группы дилера для сортировки по блокам
        if (d.hasPersonalPlan) return 'vip';
        if (d.responsible === 'regional_astana') return 'regional_astana';
        if (d.responsible === 'regional_regions') {
            const sec = (d.region_sector || '').toLowerCase().trim();
            if (sec === 'север') return 'north';
            if (sec === 'юг') return 'south';
            if (sec === 'запад') return 'west';
            if (sec === 'восток') return 'east';
            if (sec === 'центр') return 'center';
            return 'other'; // Если сектор не указан
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
        
        // Прогноз до конца месяца
        let forecast = 0;
        if (currentDay > 0) {
            forecast = (fact / currentDay) * daysInMonth;
        }
        
        const percent = plan > 0 ? (fact / plan) * 100 : (fact > 0 ? 100 : 0);
        const diff = fact - plan; 
        
        return { diff, forecast, percent };
    }

    // Сбор данных из инпутов перед сохранением или переключением
    function captureState() {
        // 1. Собираем факты по дилерам
        document.querySelectorAll('.sales-input.inp-fact').forEach(inp => {
            const row = inp.closest('.sales-row');
            const dealerId = row.dataset.id === "null" ? null : row.dataset.id;
            const dealerName = row.dataset.name;
            const isCustom = row.dataset.custom === 'true';
            const group = row.closest('.region-card').dataset.group;
            
            // Меняем запятую на точку для чисел
            const val = parseFloat(inp.value.replace(',', '.')) || 0;

            let record = currentSales.find(s => 
                (isCustom && s.isCustom && s.dealerName === dealerName) || 
                (!isCustom && !s.isCustom && s.dealerId === dealerId)
            );

            if (record) { 
                record.fact = val; 
            } else if (val !== 0) { 
                // Создаем новую запись, если её не было
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
        
        // 2. Собираем планы по регионам
        document.querySelectorAll('.plan-input').forEach(inp => {
            const planKey = inp.dataset.planKey;
            const val = parseFloat(inp.value.replace(',', '.')) || 0;
            
            // Планы храним как "фейкового" дилера с ID = PLAN_RegionName
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
        
        // Если выбран текущий месяц, считаем прогноз по текущему дню
        if (today.getFullYear() === year && today.getMonth() === monthIndex) {
            currentDay = today.getDate();
        }

        container.innerHTML = '';
        summaryList.innerHTML = '';
        if(dashboardTop) dashboardTop.innerHTML = '';

        // Статистика для сводки
        const facts = {
            north: 0, south: 0, west: 0, east: 0, center: 0,
            regional_astana: 0, other: 0, 
            vip: [] 
        };

        // Рендер по группам
        groupsConfig.forEach(grp => {
            // Фильтруем дилеров для этой группы
            const groupDealers = allDealers.filter(d => {
                const isReal = d.status !== 'potential' && d.status !== 'archive';
                const matchGroup = getDealerGroup(d) === grp.key;
                return isReal && matchGroup;
            });
            
            // Кастомные строки (добавленные вручную)
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
                
                // Суммируем факты для сводки
                if (grp.key === 'vip') {
                    facts.vip.push({ id: item.id || item.name, name: item.name, fact: fact });
                } else if (facts[grp.key] !== undefined) {
                    facts[grp.key] += fact;
                } else {
                    facts.other += fact;
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

        // Сбор планов для сводки
        const plans = {};
        const summaryKeys = ["regional_regions", "north", "south", "west", "east", "center", "regional_astana", "total_all"];
        facts.vip.forEach(v => summaryKeys.push(`vip_${v.id}`));

        summaryKeys.forEach(k => {
            const p = currentSales.find(s => s.dealerId === `PLAN_${k}`) || {};
            plans[k] = parseFloat(p.plan) || 0;
        });

        // Подсчет итогов
        const totalRegionsFact = facts.north + facts.south + facts.west + facts.east + facts.center;
        let totalVipFact = 0; facts.vip.forEach(v => totalVipFact += v.fact);
        const totalFactAll = totalRegionsFact + facts.regional_astana + totalVipFact + facts.other;
        
        // Рендер верхней панели (Дашборд)
        renderTopDashboard(facts, plans, totalRegionsFact);

        // Функция отрисовки одного элемента сводки
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

        // Сборка HTML сводки
        let summaryHtml = '';
        summaryHtml += `<div class="p-3 bg-primary-subtle border-bottom"><h6 class="fw-bold mb-3 text-primary text-uppercase small ls-1">Общий результат</h6>${renderSumItem("ВСЕГО ПО КОМПАНИИ", "total_all", totalFactAll)}</div>`;
        summaryHtml += renderSumItem("Астана (Региональный)", "regional_astana", facts.regional_astana);
        
        if (facts.vip.length > 0) {
            summaryHtml += `<div class="mt-2 mb-1 px-3 pt-2 border-top"><span class="small fw-bold text-muted text-uppercase">VIP Клиенты</span></div>`;
            facts.vip.forEach(v => summaryHtml += renderSumItem(v.name, `vip_${v.id}`, v.fact));
        }

        summaryHtml += `<div class="mt-2 mb-1 px-3 pt-2 border-top"><span class="small fw-bold text-muted text-uppercase">Регионы</span></div>`;
        summaryHtml += renderSumItem("Регионы (Итого)", "regional_regions", totalRegionsFact);
        summaryHtml += renderSumItem("Север", "north", facts.north, true);
        summaryHtml += renderSumItem("Юг", "south", facts.south, true);
        summaryHtml += renderSumItem("Запад", "west", facts.west, true);
        summaryHtml += renderSumItem("Восток", "east", facts.east, true);
        summaryHtml += renderSumItem("Центр", "center", facts.center, true);
        
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
        // Кнопка "+ Добавить" (кастомная продажа)
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

        // Кнопка удаления кастомной строки
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

    // Печать
    if (printBtn) {
        printBtn.onclick = () => {
            if(summaryCol) summaryCol.setAttribute('data-print-date', new Date().toLocaleDateString());
            window.print();
        };
    }

    // Сохранение
    if (saveBtn) {
        saveBtn.onclick = async () => {
            captureState();
            try {
                saveBtn.disabled = true; 
                saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
                
                const res = await fetch(API_SALES, { 
                    method: 'POST', 
                    headers: { 'Content-Type': 'application/json' }, 
                    body: JSON.stringify({ month: monthPicker.value, data: currentSales }) 
                });

                if (res.ok) { 
                    if (window.showToast) { window.showToast('Сохранено!'); } else { alert('Сохранено!'); }
                    saveBtn.className = 'btn btn-success shadow-sm px-4 rounded-pill';
                    saveBtn.innerHTML = '<i class="bi bi-check-lg"></i> OK'; 
                    setTimeout(() => { 
                        saveBtn.innerHTML = '<i class="bi bi-save me-2"></i>Сохранить'; 
                        saveBtn.className='btn btn-success shadow-sm px-4 rounded-pill'; 
                    }, 2000);
                    loadData(); 
                } else throw new Error('Ошибка при сохранении');
            } catch (e) { 
                alert(e.message); 
                saveBtn.disabled = false; 
                saveBtn.innerHTML = '<i class="bi bi-save me-2"></i>Сохранить';
            } finally { 
                if (saveBtn.innerHTML.includes('spinner')) saveBtn.disabled = false; 
            }
        };
    }

    monthPicker.addEventListener('change', loadData);
    init();
});
