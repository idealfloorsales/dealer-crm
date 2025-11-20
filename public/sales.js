document.addEventListener('DOMContentLoaded', () => {
    
    const API_DEALERS = '/api/dealers';
    const API_SALES = '/api/sales';
    
    const monthPicker = document.getElementById('month-picker');
    const container = document.getElementById('sales-container');
    const summaryBody = document.getElementById('summary-body');
    const saveBtn = document.getElementById('save-btn');
    
    const now = new Date();
    const currentMonthStr = now.toISOString().slice(0, 7);
    monthPicker.value = currentMonthStr;

    // (ИЗМЕНЕНО) Группы для ВВОДА (оставил только регионы и Астану)
    const inputGroups = [
        { key: 'regional_astana', title: 'Региональный Астана' },
        { key: 'north', title: 'Регион Север' },
        { key: 'south', title: 'Регион Юг' },
        { key: 'west', title: 'Регион Запад' },
        { key: 'east', title: 'Регион Восток' },
        { key: 'center', title: 'Регион Центр' },
        { key: 'other', title: 'Остальные / Разовые' }
    ];

    const cityToRegion = {
        "павлодар": "north", "кокшетау": "north", "петропавловск": "north", "костанай": "north",
        "семей": "east", "усть-каменогорск": "east", "оскемен": "east",
        "шымкент": "south", "алматы": "south", "алмата": "south", "тараз": "south", "кызылорда": "south",
        "актобе": "west", "актау": "west", "атырау": "west", "уральск": "west", "орал": "west",
        "караганда": "center", "жезказган": "center",
        "астана": "regional_astana"
    };

    // Крупные дилеры
    const majorDealersConfig = [
        { name: "Мир Ламината", key: "mir_laminata" },
        { name: "12 месяцев Алаш", key: "twelve_months" }
    ];

    let allDealers = [];
    let currentSales = [];

    // (ИЗМЕНЕНО) Убрана проверка на Михаила/Александра
    function getDealerGroup(d) {
        // 1. Если явно назначен ответственный
        if (d.responsible === 'regional_astana') return 'regional_astana';
        
        // 2. Если "Региональный Регионы" - смотрим на город
        if (d.responsible === 'regional_regions' || (!d.responsible && d.city)) {
            const cityKey = (d.city || '').trim().toLowerCase();
            if (cityKey === 'астана') return 'regional_astana';
            if (cityToRegion[cityKey]) return cityToRegion[cityKey];
        }
        
        return 'other';
    }

    // ... (весь остальной код: getMajorKey, loadData, calculateKPI, renderAll, renderSummaryRow и т.д. без изменений) ...
    // Скопируйте полный код из предыдущих версий, изменив только inputGroups и getDealerGroup.
    
    // Для надежности - вот полный код остатка файла:
    
    function getMajorKey(dealerName) {
        if (!dealerName) return null;
        const lowerName = dealerName.toLowerCase();
        if (lowerName.includes("мир ламината")) return "mir_laminata";
        if (lowerName.includes("12 месяцев") && lowerName.includes("алаш")) return "twelve_months";
        return null;
    }

    async function loadData() {
        try {
            const month = monthPicker.value;
            const [dealersRes, salesRes] = await Promise.all([
                fetch(API_DEALERS),
                fetch(`${API_SALES}?month=${month}`)
            ]);
            allDealers = await dealersRes.json();
            currentSales = await salesRes.json();
            renderAll();
        } catch (e) { alert('Ошибка: ' + e.message); }
    }

    function fmt(num) {
        if (typeof num !== 'number' || isNaN(num)) return 0;
        return Math.round(num * 100) / 100;
    }

    function calculateKPI(plan, fact, daysInMonth, currentDay) {
        plan = parseFloat(plan) || 0;
        fact = parseFloat(fact) || 0;
        const diff = fact - plan;
        
        let forecast = 0;
        if (currentDay > 0) forecast = (fact / currentDay) * daysInMonth;
        
        const percent = plan > 0 ? (fact / plan) * 100 : 0;
        return { diff, forecast, percent };
    }

    // (НОВОЕ) Функция "Запомнить то, что ввел юзер" перед перерисовкой
    function captureState() {
        document.querySelectorAll('.inp-fact').forEach(inp => {
            const tr = inp.closest('tr');
            const dealerId = tr.dataset.id === "null" ? null : tr.dataset.id;
            const dealerName = tr.dataset.name;
            const isCustom = tr.dataset.custom === 'true';
            const group = tr.dataset.group;
            const val = parseFloat(inp.value) || 0;

            let record = currentSales.find(s => 
                (isCustom && s.isCustom && s.dealerName === dealerName) || 
                (!isCustom && !s.isCustom && s.dealerId === dealerId)
            );

            if (record) { record.fact = val; } 
            else if (val > 0) {
                currentSales.push({ month: monthPicker.value, group, dealerId, dealerName, isCustom, plan: 0, fact: val });
            }
        });
        document.querySelectorAll('.inp-group-plan').forEach(inp => {
            const tr = inp.closest('tr');
            const planKey = tr.dataset.planKey;
            const val = parseFloat(inp.value) || 0;
            let record = currentSales.find(s => s.dealerId === `PLAN_${planKey}`);
            if (record) { record.plan = val; } 
            else if (val > 0) {
                currentSales.push({ month: monthPicker.value, group: 'PLAN', dealerId: `PLAN_${planKey}`, dealerName: `Plan ${planKey}`, isCustom: false, plan: val, fact: 0 });
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
        summaryBody.innerHTML = '';

        const facts = {
            north: 0, south: 0, west: 0, east: 0, center: 0,
            regional_astana: 0,
            mir_laminata: 0,
            twelve_months: 0,
            other: 0
        };

        inputGroups.forEach(grp => {
            const groupDealers = allDealers.filter(d => {
                const matchGroup = getDealerGroup(d) === grp.key;
                const isReal = d.status !== 'potential' && d.status !== 'archive';
                return matchGroup && isReal;
            });
            const customSales = currentSales.filter(s => s.isCustom && s.group === grp.key);

            if (groupDealers.length === 0 && customSales.length === 0) return;

            let rowsHtml = '';
            const items = [
                ...groupDealers.map(d => ({ id: d.id, name: d.name, isCustom: false })),
                ...customSales.map(s => ({ id: null, name: s.dealerName, isCustom: true }))
            ];

            items.forEach(item => {
                const sale = currentSales.find(s => (item.isCustom && s.isCustom && s.dealerName === item.name) || (!item.isCustom && !s.isCustom && s.dealerId === item.id)) || {};
                const fact = parseFloat(sale.fact) || 0;
                const majorKey = getMajorKey(item.name);
                if (majorKey) facts[majorKey] += fact;
                else if (grp.key === 'regional_astana') facts.regional_astana += fact;
                else if (grp.key !== 'other') facts[grp.key] += fact;
                else facts.other += fact;

                rowsHtml += `
                    <tr data-id="${item.id || ''}" data-name="${item.name}" data-custom="${item.isCustom}" data-group="${grp.key}">
                        <td class="ps-4">${item.name} ${item.isCustom ? '<span class="badge bg-secondary">Разовый</span>' : ''}</td>
                        <td><input type="number" step="0.01" class="form-control form-control-sm inp-fact" value="${fact || ''}" placeholder="0"></td>
                        <td>${item.isCustom ? `<button class="btn btn-sm btn-outline-danger btn-del-row">×</button>` : ''}</td>
                    </tr>
                `;
            });

            container.innerHTML += `<div class="card mb-4 shadow-sm border-0"><div class="card-header bg-light d-flex justify-content-between py-2"><h6 class="mb-0 fw-bold">${grp.title}</h6><button class="btn btn-sm btn-link btn-add-custom" data-group="${grp.key}">+ Добавить</button></div><div class="table-responsive"><table class="table table-hover align-middle mb-0 table-sm"><tbody>${rowsHtml}</tbody></table></div></div>`;
        });

        const plans = {};
        const keys = ["regional_regions", "north", "south", "west", "east", "center", "regional_astana", "mir_laminata", "twelve_months", "total_all"];
        keys.forEach(k => {
            const p = currentSales.find(s => s.dealerId === `PLAN_${k}`) || {};
            plans[k] = parseFloat(p.plan) || 0;
        });

        const totalRegionsFact = facts.north + facts.south + facts.west + facts.east + facts.center;
        const totalPlanAll = plans.total_all; 
        const totalFactAll = totalRegionsFact + facts.regional_astana + facts.mir_laminata + facts.twelve_months + facts.other;

        const renderSummaryRow = (title, planKey, factVal, isBold=false, isMain=false) => {
            const plan = plans[planKey] || 0;
            const { diff, forecast, percent } = calculateKPI(plan, factVal, daysInMonth, currentDay);
            const dailyFact = plan > 0 ? (factVal / plan) : 0;
            const rowClass = isMain ? 'table-info fw-bold' : (isBold ? 'fw-bold' : '');
            
            return `<tr class="${rowClass}" data-plan-key="${planKey}"><td>${title}</td><td><input type="number" step="0.01" class="form-control form-control-sm fw-bold inp-group-plan" value="${plan || ''}" placeholder="0" style="width: 100px; background: #fffbf0; border: 1px solid #ffc107;"></td><td>${fmt(factVal)}</td><td class="${diff >= 0 ? 'text-success' : 'text-danger'}">${fmt(diff)}</td><td>${currentDay}</td><td>${daysInMonth}</td><td>${fmt(forecast)}</td><td>${fmt(dailyFact)}</td><td>${fmt(percent)}%</td></tr>`;
        };

        let summaryHtml = '';
        summaryHtml += renderSummaryRow("Региональный Регионы (Сумма)", "regional_regions", totalRegionsFact, true, true);
        summaryHtml += renderSummaryRow("   - Север", "north", facts.north);
        summaryHtml += renderSummaryRow("   - Восток", "east", facts.east);
        summaryHtml += renderSummaryRow("   - Юг", "south", facts.south);
        summaryHtml += renderSummaryRow("   - Запад", "west", facts.west);
        summaryHtml += renderSummaryRow("   - Центр", "center", facts.center);
        summaryHtml += renderSummaryRow("Региональный Астана", "regional_astana", facts.regional_astana, true, true);
        summaryHtml += renderSummaryRow("Мир Ламината", "mir_laminata", facts.mir_laminata, true);
        summaryHtml += renderSummaryRow("12 Месяцев Алаш", "twelve_months", facts.twelve_months, true);
        if (facts.other > 0) summaryHtml += `<tr><td colspan="2">Разовые / Прочие</td><td>${fmt(facts.other)}</td><td colspan="6"></td></tr>`;
        summaryHtml += renderSummaryRow("ОБЩЕЕ ВЫПОЛНЕНИЕ", "total_all", totalFactAll, true, true);

        summaryBody.innerHTML = summaryHtml;
        setupEventListeners();
    }

    function setupEventListeners() {
        document.querySelectorAll('.btn-add-custom').forEach(btn => {
            btn.onclick = () => {
                captureState();
                const name = prompt("Название:");
                if (name) {
                    currentSales.push({ month: monthPicker.value, group: btn.dataset.group, dealerName: name, isCustom: true, plan: 0, fact: 0 });
                    renderAll();
                }
            };
        });
        document.querySelectorAll('.btn-del-row').forEach(btn => {
            btn.onclick = (e) => {
                if(confirm('Удалить?')) {
                    captureState();
                    const row = e.target.closest('tr');
                    const name = row.dataset.name;
                    currentSales = currentSales.filter(s => !(s.isCustom && s.dealerName === name));
                    renderAll();
                }
            };
        });
    }

    saveBtn.onclick = async () => {
        captureState();
        try {
            saveBtn.disabled = true; saveBtn.innerHTML = '...';
            const res = await fetch(API_SALES, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ month: monthPicker.value, data: currentSales }) });
            if (res.ok) { alert('Сохранено!'); loadData(); } else throw new Error('Ошибка');
        } catch (e) { alert(e.message); }
        finally { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="bi bi-save me-2"></i>Сохранить'; }
    };

    monthPicker.addEventListener('change', loadData);
    loadData();
});
