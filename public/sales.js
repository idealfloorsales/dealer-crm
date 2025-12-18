document.addEventListener('DOMContentLoaded', () => {
    
    // Config
    const API_DEALERS = '/api/dealers';
    const API_SALES = '/api/sales';
    
    // UI Elements
    const monthPicker = document.getElementById('month-picker');
    const container = document.getElementById('sales-container');
    const summaryList = document.getElementById('summary-list');
    const saveBtn = document.getElementById('save-btn');
    const logoutBtn = document.getElementById('logout-btn');
    
    // Set Month
    const now = new Date();
    monthPicker.value = now.toISOString().slice(0, 7);

    // Группы отображения
    const inputGroups = [
        { key: 'regional_astana', title: 'Региональный Астана' },
        { key: 'north', title: 'Регион Север' },
        { key: 'south', title: 'Регион Юг' },
        { key: 'west', title: 'Регион Запад' },
        { key: 'east', title: 'Регион Восток' },
        { key: 'center', title: 'Регион Центр' },
        { key: 'other', title: 'Остальные / Разовые' }
    ];

    let allDealers = [];
    let currentSales = [];
    let currentUserRole = 'guest';

    // --- INIT ---
    async function init() {
        try {
            const authRes = await fetch('/api/auth/me');
            if (authRes.ok) {
                const authData = await authRes.json();
                currentUserRole = authData.role;
                if (currentUserRole === 'guest') {
                    if(saveBtn) {
                        saveBtn.disabled = true;
                        saveBtn.innerHTML = '<i class="bi bi-lock"></i> Только чтение';
                    }
                }
            }
        } catch (e) {}
        loadData();
    }

    async function loadData() {
        try {
            container.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div></div>';
            const month = monthPicker.value;
            const [dealersRes, salesRes] = await Promise.all([
                fetch(API_DEALERS),
                fetch(`${API_SALES}?month=${month}`)
            ]);
            allDealers = await dealersRes.json();
            currentSales = await salesRes.json();
            renderAll();
        } catch (e) { 
            container.innerHTML = `<div class="alert alert-danger">Ошибка: ${e.message}</div>`;
        }
    }

    // --- LOGIC: ГРУППИРОВКА ---
    function getDealerGroup(d) {
        // 1. Астана
        if (d.responsible === 'regional_astana') return 'regional_astana';
        
        // 2. Регионы (смотрим поле region_sector)
        if (d.responsible === 'regional_regions') {
            const sec = (d.region_sector || '').toLowerCase().trim();
            if (sec === 'север') return 'north';
            if (sec === 'юг') return 'south';
            if (sec === 'запад') return 'west';
            if (sec === 'восток') return 'east';
            if (sec === 'центр') return 'center';
            return 'other'; 
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
        if (currentDay > 0) forecast = (fact / currentDay) * daysInMonth;
        const percent = plan > 0 ? (fact / plan) * 100 : 0;
        return { diff: fact - plan, forecast, percent };
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
                currentSales.push({ month: monthPicker.value, group, dealerId, dealerName, isCustom, plan: 0, fact: val });
            }
        });
        
        document.querySelectorAll('.plan-input').forEach(inp => {
            const planKey = inp.dataset.planKey;
            const val = parseFloat(inp.value.replace(',', '.')) || 0;
            let record = currentSales.find(s => s.dealerId === `PLAN_${planKey}`);
            if (record) { record.plan = val; } 
            else if (val !== 0) {
                currentSales.push({ month: monthPicker.value, group: 'PLAN', dealerId: `PLAN_${planKey}`, dealerName: `Plan ${planKey}`, isCustom: false, plan: val, fact: 0 });
            }
        });
    }

    // --- RENDER ---
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

        // Суммы фактов
        const facts = {
            north: 0, south: 0, west: 0, east: 0, center: 0,
            regional_astana: 0, other: 0, 
            vip: [] // Массив для VIP клиентов {name, fact}
        };

        // 1. Рендер блоков ввода
        inputGroups.forEach(grp => {
            // Фильтруем дилеров для этого блока
            const groupDealers = allDealers.filter(d => {
                const matchGroup = getDealerGroup(d) === grp.key;
                const isReal = d.status !== 'potential' && d.status !== 'archive';
                return matchGroup && isReal;
            });
            
            const customSales = currentSales.filter(s => s.isCustom && s.group === grp.key);

            if (groupDealers.length === 0 && customSales.length === 0 && grp.key !== 'other') return;

            let rowsHtml = '';
            const items = [
                ...groupDealers.map(d => ({ id: d.id, name: d.name, isCustom: false, hasPersonalPlan: d.hasPersonalPlan })),
                ...customSales.map(s => ({ id: null, name: s.dealerName, isCustom: true, hasPersonalPlan: false }))
            ];
            
            items.sort((a,b) => a.name.localeCompare(b.name));

            items.forEach(item => {
                const sale = currentSales.find(s => (item.isCustom && s.isCustom && s.dealerName === item.name) || (!item.isCustom && !s.isCustom && s.dealerId === item.id)) || {};
                const fact = parseFloat(sale.fact) || 0;
                
                // --- ГЛАВНАЯ ЛОГИКА СУММИРОВАНИЯ ---
                if (item.hasPersonalPlan) {
                    // Если VIP - добавляем в список VIP (не в регион!)
                    facts.vip.push({ id: item.id, name: item.name, fact: fact });
                } else {
                    // Если обычный - добавляем в регион
                    if (facts[grp.key] !== undefined) facts[grp.key] += fact;
                    else facts.other += fact;
                }

                const displayVal = (fact !== 0) ? fact : '';
                const isMajor = item.hasPersonalPlan;

                rowsHtml += `
                    <div class="sales-row" data-id="${item.id || ''}" data-name="${item.name}" data-custom="${item.isCustom}">
                        <div class="sales-dealer-name text-truncate">
                            ${item.isCustom ? '<i class="bi bi-asterisk text-warning me-1" style="font-size:0.7em" title="Разовый"></i>' : ''}
                            ${isMajor ? '<i class="bi bi-star-fill text-warning me-1" title="Отдельный план (VIP)"></i>' : ''}
                            <span class="${isMajor ? 'fw-bold text-primary' : ''}">${item.name}</span>
                        </div>
                        <div class="d-flex align-items-center gap-2">
                            <div class="sales-input-group">
                                <input type="number" step="0.01" class="form-control form-control-sm sales-input inp-fact" value="${displayVal}" placeholder="0">
                            </div>
                            ${item.isCustom ? `<button class="btn btn-sm text-danger btn-del-row p-0" title="Удалить строку"><i class="bi bi-x-circle"></i></button>` : ''}
                        </div>
                    </div>
                `;
            });
            
            if (!rowsHtml) rowsHtml = `<div class="text-center text-muted small py-3">Нет записей.</div>`;

            container.innerHTML += `
                <div class="region-card" data-group="${grp.key}">
                    <div class="region-header">
                        <span class="region-title">${grp.title}</span>
                        <button class="btn btn-sm btn-light border-0 text-primary py-0 btn-add-custom" data-group="${grp.key}" style="font-size:0.8rem">+ Добавить</button>
                    </div>
                    <div class="region-body">${rowsHtml}</div>
                </div>
            `;
        });

        // 2. Рендер Сводки (Summary)
        const plans = {};
        const keys = ["regional_regions", "north", "south", "west", "east", "center", "regional_astana", "total_all"];
        
        // Добавляем планы для VIP
        facts.vip.forEach(v => keys.push(`vip_${v.id}`));

        keys.forEach(k => {
            const p = currentSales.find(s => s.dealerId === `PLAN_${k}`) || {};
            plans[k] = parseFloat(p.plan) || 0;
        });

        // Считаем суммы
        const totalRegionsFact = facts.north + facts.south + facts.west + facts.east + facts.center;
        
        // Считаем VIP
        let totalVipFact = 0;
        facts.vip.forEach(v => totalVipFact += v.fact);

        const totalFactAll = totalRegionsFact + facts.regional_astana + totalVipFact + facts.other;
        
        const renderSumItem = (title, planKey, factVal, isSubItem = false) => {
            const plan = plans[planKey] || 0;
            const { diff, forecast, percent } = calculateKPI(plan, factVal, daysInMonth, currentDay);
            
            let colorClass = 'p-mid'; let bgClass = 'bg-mid';
            if (percent >= 90) { colorClass = 'p-high'; bgClass = 'bg-high'; }
            if (percent < 70) { colorClass = 'p-low'; bgClass = 'bg-low'; }
            const width = Math.min(percent, 100);

            const planVal = plan !== 0 ? plan : '';

            return `
            <div class="summary-item ${isSubItem ? 'ps-4 bg-light bg-opacity-25' : ''}">
                <div class="summary-header">
                    <span class="summary-title">
                        ${title}
                        <input type="number" class="plan-input" data-plan-key="${planKey}" value="${planVal}" placeholder="План">
                    </span>
                    <span class="summary-percent ${colorClass}">${fmt(percent)}%</span>
                </div>
                <div class="summary-progress">
                    <div class="summary-bar ${bgClass}" style="width: ${width}%"></div>
                </div>
                <div class="summary-meta">
                    <span>Факт: <strong>${fmt(factVal)}</strong></span>
                    <span class="${diff>=0 ? 'text-success':'text-danger'}">${diff>0?'+':''}${fmt(diff)}</span>
                    <span>Прогноз: <strong>${fmt(forecast)}</strong></span>
                </div>
            </div>`;
        };

        let summaryHtml = '';
        summaryHtml += `<div class="p-3 bg-primary-subtle border-bottom"><h6 class="fw-bold mb-3 text-primary text-uppercase small ls-1">Общий результат</h6>${renderSumItem("ВСЕГО ПО КОМПАНИИ", "total_all", totalFactAll)}</div>`;
        summaryHtml += renderSumItem("Астана (Региональный)", "regional_astana", facts.regional_astana);
        
        // VIP БЛОК
        if (facts.vip.length > 0) {
            summaryHtml += `<div class="summary-divider"><span class="small fw-bold text-muted">Спец. Клиенты</span></div>`;
            facts.vip.forEach(v => {
                summaryHtml += renderSumItem(v.name, `vip_${v.id}`, v.fact);
            });
        }

        summaryHtml += `<div class="mt-2 border-top"></div>`;
        summaryHtml += renderSumItem("Регионы (Общее)", "regional_regions", totalRegionsFact);
        summaryHtml += renderSumItem("Север", "north", facts.north, true);
        summaryHtml += renderSumItem("Восток", "east", facts.east, true);
        summaryHtml += renderSumItem("Юг", "south", facts.south, true);
        summaryHtml += renderSumItem("Запад", "west", facts.west, true);
        summaryHtml += renderSumItem("Центр", "center", facts.center, true);
        
        if (facts.other !== 0) {
            summaryHtml += `<div class="summary-item"><div class="summary-header"><span class="summary-title text-muted">Прочие / Разовые</span><span class="summary-percent text-muted">-</span></div><div class="summary-meta"><span>Факт: <strong>${fmt(facts.other)}</strong></span></div></div>`;
        }

        summaryList.innerHTML = summaryHtml;
        setupEventListeners();
    }

    function setupEventListeners() {
        document.querySelectorAll('.btn-add-custom').forEach(btn => {
            btn.onclick = () => {
                captureState();
                const name = prompt("Название дилера/клиента:");
                if (name) {
                    currentSales.push({ month: monthPicker.value, group: btn.dataset.group, dealerName: name, isCustom: true, plan: 0, fact: 0 });
                    renderAll();
                }
            };
        });
        document.querySelectorAll('.btn-del-row').forEach(btn => {
            btn.onclick = (e) => {
                if(confirm('Удалить строку?')) {
                    captureState();
                    const row = e.target.closest('.sales-row');
                    const name = row.dataset.name;
                    currentSales = currentSales.filter(s => !(s.isCustom && s.dealerName === name));
                    renderAll();
                }
            };
        });
    }

    // --- SAVE BTN ---
    if (saveBtn) {
        saveBtn.onclick = async () => {
            captureState();
            try {
                saveBtn.disabled = true; 
                saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
                const res = await fetch(API_SALES, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ month: monthPicker.value, data: currentSales }) });
                if (res.ok) { 
                    if (window.showToast) { window.showToast('Сохранено успешно!'); } else { alert('Сохранено!'); }
                    saveBtn.className = 'btn btn-success shadow-sm px-4 rounded-pill';
                    saveBtn.innerHTML = '<i class="bi bi-check-lg"></i> Сохранено'; 
                    setTimeout(() => { saveBtn.innerHTML = '<i class="bi bi-save me-2"></i>Сохранить'; }, 2000);
                    loadData(); 
                } else throw new Error('Ошибка');
            } catch (e) { 
                if (window.showToast) window.showToast(e.message, 'error'); else alert(e.message);
                saveBtn.disabled = false; 
            }
            finally { saveBtn.disabled = false; }
        };
    }
    
    // --- LOGOUT ---
    if (logoutBtn) { 
        logoutBtn.onclick = (e) => {
            e.preventDefault();
            localStorage.clear();
            sessionStorage.clear();
            logoutBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
            const xhr = new XMLHttpRequest();
            xhr.open("GET", "/?chk=" + Math.random(), true, "logout", "logout");
            xhr.onreadystatechange = function () {
                if (xhr.readyState == 4) window.location.reload();
            };
            xhr.send();
        }; 
    }

    monthPicker.addEventListener('change', loadData);
    init();
});
