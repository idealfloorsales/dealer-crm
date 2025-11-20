// sales.js
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

    // 1. Конфигурация Групп (Порядок важен)
    const groupsOrder = [
        { key: 'regional_astana', title: 'Региональный Астана', isRegion: false },
        { key: 'north', title: 'Регион Север', isRegion: true },
        { key: 'south', title: 'Регион Юг', isRegion: true },
        { key: 'west', title: 'Регион Запад', isRegion: true },
        { key: 'east', title: 'Регион Восток', isRegion: true },
        { key: 'center', title: 'Регион Центр', isRegion: true },
        { key: 'michael', title: 'Отдел продаж Михаил', isRegion: false },
        { key: 'alexander', title: 'Отдел продаж Александр', isRegion: false },
        { key: 'other', title: 'Не распределенные', isRegion: false }
    ];

    // 2. Карта городов
    const cityToRegion = {
        "Павлодар": "north", "Кокшетау": "north", "Петропавловск": "north", "Костанай": "north",
        "Семей": "east", "Усть-Каменогорск": "east",
        "Шымкент": "south", "Алматы": "south", "Тараз": "south", "Кызылорда": "south",
        "Актобе": "west", "Актау": "west", "Атырау": "west", "Уральск": "west",
        "Караганда": "center", "Жезказган": "center",
        "Астана": "regional_astana"
    };

    // 3. Крупные дилеры (для них открываем поле ПЛАН)
    // Укажите здесь точные названия или части названий
    const majorDealers = ["Мир Ламината", "12 Месяцев Алаш", "12 Месяцев"]; 

    let allDealers = [];
    let currentSales = [];

    // Определение группы
    function getDealerGroup(d) {
        // Если явно назначен ответственный
        if (['michael', 'alexander', 'regional_astana'].includes(d.responsible)) return d.responsible;
        
        // Если "Регионы" или пусто - смотрим на город
        if (d.city && cityToRegion[d.city]) return cityToRegion[d.city];
        
        // Если Астана, но не назначен - в Астану
        if (d.city === 'Астана') return 'regional_astana';

        return 'other';
    }

    function isMajorDealer(name) {
        return majorDealers.some(major => name && name.toLowerCase().includes(major.toLowerCase()));
    }

    async function loadData() {
        try {
            // container.innerHTML = '<p class="text-center mt-5">Загрузка...</p>';
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

    function calculateKPI(plan, fact, daysInMonth, currentDay) {
        plan = parseFloat(plan) || 0;
        fact = parseFloat(fact) || 0;
        const diff = fact - plan;
        let forecast = 0;
        if (currentDay > 0) forecast = (fact / currentDay) * daysInMonth;
        const percent = plan > 0 ? (fact / plan) * 100 : 0;
        return { plan, fact, diff, forecast, percent };
    }

    function renderAll() {
        const date = new Date(monthPicker.value);
        const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
        const today = new Date();
        let currentDay = daysInMonth;
        if (today.getFullYear() === date.getFullYear() && today.getMonth() === date.getMonth()) {
            currentDay = today.getDate();
        }

        container.innerHTML = '';
        summaryBody.innerHTML = '';

        // Статистика для Сводной таблицы
        let totalRegionsPlan = 0, totalRegionsFact = 0;
        let totalAstanaPlan = 0, totalAstanaFact = 0;

        groupsOrder.forEach(grp => {
            // 1. Дилеры группы
            const groupDealers = allDealers.filter(d => {
                const matchGroup = getDealerGroup(d) === grp.key;
                const isActive = d.status !== 'potential' && d.status !== 'archive';
                return matchGroup && isActive;
            });
            const customSales = currentSales.filter(s => s.isCustom && s.group === grp.key);
            const groupPlanRecord = currentSales.find(s => s.dealerId === `GROUP_PLAN_${grp.key}`) || {};
            const groupCommonPlan = parseFloat(groupPlanRecord.plan) || 0;

            if (groupDealers.length === 0 && customSales.length === 0 && groupCommonPlan === 0) return;

            // 2. Рендер таблицы группы
            let rowsHtml = '';
            let groupTotalFact = 0;
            let groupTotalPlan = groupCommonPlan;

            const items = [
                ...groupDealers.map(d => ({ id: d.id, name: d.name, isCustom: false })),
                ...customSales.map(s => ({ id: null, name: s.dealerName, isCustom: true }))
            ];

            items.forEach(item => {
                const sale = currentSales.find(s => (item.isCustom && s.isCustom && s.dealerName === item.name) || (!item.isCustom && !s.isCustom && s.dealerId === item.id)) || {};
                const fact = parseFloat(sale.fact) || 0;
                const plan = parseFloat(sale.plan) || 0; // Индивидуальный план (для крупных)

                const isMajor = isMajorDealer(item.name);
                
                // Если это крупный дилер, его план добавляется к общему плану группы
                if (isMajor) groupTotalPlan += plan;
                groupTotalFact += fact;

                rowsHtml += `
                    <tr data-id="${item.id || ''}" data-name="${item.name}" data-custom="${item.isCustom}" data-group="${grp.key}">
                        <td class="ps-4">${item.name} ${item.isCustom ? '<span class="badge bg-secondary">Разовый</span>' : ''}</td>
                        <td>
                            ${isMajor ? `<input type="number" class="form-control form-control-sm inp-plan" value="${plan || ''}" placeholder="План">` : '<span class="text-muted">-</span><input type="hidden" class="inp-plan" value="0">'}
                        </td>
                        <td><input type="number" class="form-control form-control-sm inp-fact" value="${fact || ''}" placeholder="0"></td>
                        <td></td><td></td><td></td><td></td>
                        <td>${item.isCustom ? `<button class="btn btn-sm btn-outline-danger btn-del-row">×</button>` : ''}</td>
                    </tr>
                `;
            });

            // Итоги группы
            const kpi = calculateKPI(groupTotalPlan, groupTotalFact, daysInMonth, currentDay);
            
            // Копим данные для Сводной
            if (grp.isRegion) {
                totalRegionsPlan += kpi.plan;
                totalRegionsFact += kpi.fact;
            }
            if (grp.key === 'regional_astana') {
                totalAstanaPlan += kpi.plan;
                totalAstanaFact += kpi.fact;
            }

            // HTML Группы
            container.innerHTML += `
                <div class="card mb-4 shadow-sm border-0">
                    <div class="card-header bg-white border-bottom d-flex justify-content-between py-3">
                        <h5 class="mb-0 text-primary fw-bold">${grp.title}</h5>
                        <button class="btn btn-sm btn-outline-secondary btn-add-custom" data-group="${grp.key}">+ Разовый</button>
                    </div>
                    <div class="table-responsive">
                        <table class="table table-hover align-middle mb-0 table-sm">
                            <thead class="table-light small text-uppercase text-muted"><tr><th style="width:30%">Дилер</th><th style="width:12%">План</th><th style="width:12%">Факт</th><th>Разница</th><th>Прогноз</th><th>%</th><th></th></tr></thead>
                            <tr class="table-warning fw-bold group-header-row" data-group-key="${grp.key}">
                                <td>ИТОГО: ${grp.title} <small class="fw-normal text-muted">(включая крупных)</small></td>
                                <td>
                                    <div class="input-group input-group-sm">
                                        <span class="input-group-text">Общий:</span>
                                        <input type="number" class="form-control fw-bold inp-group-plan" value="${groupCommonPlan || ''}" placeholder="0">
                                    </div>
                                    <small class="text-muted">Всего: ${Math.round(groupTotalPlan)}</small>
                                </td>
                                <td class="fs-5">${Math.round(groupTotalFact)}</td>
                                <td class="${kpi.diff >= 0 ? 'text-success' : 'text-danger'}">${Math.round(kpi.diff)}</td>
                                <td>${Math.round(kpi.forecast)}</td>
                                <td>${Math.round(kpi.percent)}%</td>
                                <td></td>
                            </tr>
                            <tbody class="border-top-0">${rowsHtml}</tbody>
                        </table>
                    </div>
                </div>`;
        });

        // 4. Рендер Сводной таблицы
        const regionKPI = calculateKPI(totalRegionsPlan, totalRegionsFact, daysInMonth, currentDay);
        const astanaKPI = calculateKPI(totalAstanaPlan, totalAstanaFact, daysInMonth, currentDay);

        summaryBody.innerHTML = `
            <tr class="fw-bold table-info">
                <td>РЕГИОНАЛЬНЫЙ РЕГИОНЫ (Сумма)</td>
                <td>${Math.round(regionKPI.plan)}</td>
                <td>${Math.round(regionKPI.fact)}</td>
                <td class="${regionKPI.diff >= 0 ? 'text-success' : 'text-danger'}">${Math.round(regionKPI.diff)}</td>
                <td>${Math.round(regionKPI.forecast)}</td>
                <td>${Math.round(regionKPI.percent)}%</td>
            </tr>
            <tr class="fw-bold table-primary">
                <td>РЕГИОНАЛЬНЫЙ АСТАНА (Сумма)</td>
                <td>${Math.round(astanaKPI.plan)}</td>
                <td>${Math.round(astanaKPI.fact)}</td>
                <td class="${astanaKPI.diff >= 0 ? 'text-success' : 'text-danger'}">${Math.round(astanaKPI.diff)}</td>
                <td>${Math.round(astanaKPI.forecast)}</td>
                <td>${Math.round(astanaKPI.percent)}%</td>
            </tr>
        `;

        setupEventListeners();
    }

    function setupEventListeners() {
        document.querySelectorAll('.btn-add-custom').forEach(btn => {
            btn.onclick = () => {
                const name = prompt("Название:");
                if (name) {
                    currentSales.push({ month: monthPicker.value, group: btn.dataset.group, dealerName: name, isCustom: true, plan: 0, fact: 0 });
                    renderAll(); // Переименовал renderTable в renderAll для ясности
                }
            };
        });
        document.querySelectorAll('.btn-del-row').forEach(btn => {
            btn.onclick = (e) => {
                if(confirm('Удалить?')) {
                    const row = e.target.closest('tr');
                    const name = row.dataset.name;
                    currentSales = currentSales.filter(s => !(s.isCustom && s.dealerName === name));
                    renderAll();
                }
            };
        });
    }

    saveBtn.onclick = async () => {
        const dataToSave = [];
        
        // Дилеры (Факт и План для крупных)
        document.querySelectorAll('#sales-container tbody tr').forEach(tr => {
            const dealerId = tr.dataset.id;
            const dealerName = tr.dataset.name;
            const isCustom = tr.dataset.custom === 'true';
            const group = tr.dataset.group;
            const plan = parseFloat(tr.querySelector('.inp-plan')?.value) || 0;
            const fact = parseFloat(tr.querySelector('.inp-fact')?.value) || 0;

            if (plan > 0 || fact > 0 || isCustom) {
                dataToSave.push({ month: monthPicker.value, group, dealerId: dealerId === "null" ? null : dealerId, dealerName, isCustom, plan, fact });
            }
        });

        // Планы групп
        document.querySelectorAll('.inp-group-plan').forEach(inp => {
            const row = inp.closest('tr');
            const groupKey = row.dataset.groupKey;
            const plan = parseFloat(inp.value) || 0;
            if (plan > 0) {
                dataToSave.push({ month: monthPicker.value, group: groupKey, dealerId: `GROUP_PLAN_${groupKey}`, dealerName: `План ${groupKey}`, isCustom: false, plan, fact: 0 });
            }
        });

        try {
            saveBtn.disabled = true; saveBtn.innerHTML = '...';
            const res = await fetch(API_SALES, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ month: monthPicker.value, data: dataToSave }) });
            if (res.ok) { alert('Сохранено!'); loadData(); } else throw new Error('Ошибка');
        } catch (e) { alert(e.message); }
        finally { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="bi bi-save me-2"></i>Сохранить'; }
    };

    monthPicker.addEventListener('change', loadData);
    loadData();
});
