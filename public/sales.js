document.addEventListener('DOMContentLoaded', () => {
    
    const API_DEALERS = '/api/dealers';
    const API_SALES = '/api/sales';
    
    const monthPicker = document.getElementById('month-picker');
    const container = document.getElementById('sales-container');
    const saveBtn = document.getElementById('save-btn');
    
    const now = new Date();
    const currentMonthStr = now.toISOString().slice(0, 7);
    monthPicker.value = currentMonthStr;

    // Ваши группы и города
    const groupsConfig = [
        { key: 'astana', title: 'Региональный Астана', type: 'main' },
        { key: 'north', title: 'Север (Павлодар, Кокшетау...)', type: 'region' },
        { key: 'south', title: 'Юг (Алматы, Шымкент...)', type: 'region' },
        { key: 'west', title: 'Запад (Актобе, Уральск...)', type: 'region' },
        { key: 'east', title: 'Восток (Семей, Усть-Каменогорск)', type: 'region' },
        { key: 'center', title: 'Центр (Караганда, Жезказган)', type: 'region' },
        { key: 'mir_laminata', title: 'Мир Ламината', type: 'special' }, // Спец. группа
        { key: 'other', title: 'Остальные', type: 'other' }
    ];

    const cityToRegion = {
        "Павлодар": "north", "Кокшетау": "north", "Петропавловск": "north", "Костанай": "north",
        "Семей": "east", "Усть-Каменогорск": "east",
        "Шымкент": "south", "Алматы": "south", "Тараз": "south", "Кызылорда": "south",
        "Актобе": "west", "Актау": "west", "Атырау": "west", "Уральск": "west",
        "Караганда": "center", "Жезказган": "center",
        "Астана": "astana" 
    };

    let allDealers = [];
    let currentSales = [];

    // Определяем группу дилера
    function getDealerGroup(d) {
        // 1. Если явно задан ответственный (например, для Мира Ламината)
        if (d.responsible === 'mir_laminata') return 'mir_laminata';
        
        // 2. Если Астана
        if (d.city === 'Астана' || d.responsible === 'regional_astana') return 'astana';

        // 3. По городу
        if (d.city && cityToRegion[d.city]) return cityToRegion[d.city];

        return 'other';
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
            renderTable();
        } catch (e) { alert('Ошибка загрузки: ' + e.message); }
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

    function renderTable() {
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

        groupsOrder.forEach(grp => {
            const groupDealers = allDealers.filter(d => getDealerGroup(d) === grp.key);
            const customSales = currentSales.filter(s => s.isCustom && s.group === grp.key);

            // Ищем сохраненный ПЛАН для этой группы (он хранится как "продажа" с dealerId='GROUP_PLAN_key')
            const groupPlanRecord = currentSales.find(s => s.dealerId === `GROUP_PLAN_${grp.key}`) || {};
            const groupPlan = groupPlanRecord.plan || 0;

            if (groupDealers.length === 0 && customSales.length === 0 && groupPlan === 0) return;

            let rowsHtml = '';
            let totalFact = 0;

            const items = [
                ...groupDealers.map(d => ({ id: d.id, name: d.name, isCustom: false })),
                ...customSales.map(s => ({ id: null, name: s.dealerName, isCustom: true }))
            ];

            items.forEach(item => {
                const sale = currentSales.find(s => 
                    (item.isCustom && s.isCustom && s.dealerName === item.name) || 
                    (!item.isCustom && !s.isCustom && s.dealerId === item.id)
                ) || {};

                const fact = parseFloat(sale.fact) || 0;
                totalFact += fact;

                rowsHtml += `
                    <tr data-id="${item.id || ''}" data-name="${item.name}" data-custom="${item.isCustom}" data-group="${grp.key}">
                        <td class="ps-4">${item.name} ${item.isCustom ? '<span class="badge bg-secondary">Разовый</span>' : ''}</td>
                        <td class="text-muted text-center">-</td> 
                        <td><input type="number" class="form-control form-control-sm inp-fact" value="${fact || ''}" placeholder="0"></td>
                        <td></td><td></td><td></td><td></td>
                        <td>${item.isCustom ? `<button class="btn btn-sm btn-outline-danger btn-del-row">×</button>` : ''}</td>
                    </tr>
                `;
            });

            // ИТОГИ ГРУППЫ
            const { diff, forecast, percent } = calculateKPI(groupPlan, totalFact, daysInMonth, currentDay);

            const tableHtml = `
                <div class="card mb-4 shadow-sm border-0">
                    <div class="card-header bg-white border-bottom d-flex justify-content-between align-items-center py-3">
                        <h5 class="mb-0 text-primary fw-bold">${grp.title}</h5>
                        <button class="btn btn-sm btn-outline-secondary btn-add-custom" data-group="${grp.key}">+ Разовый</button>
                    </div>
                    <div class="table-responsive">
                        <table class="table table-hover align-middle mb-0">
                            <thead class="table-light small text-uppercase">
                                <tr>
                                    <th style="width: 30%">Дилер</th>
                                    <th style="width: 12%">План группы</th>
                                    <th style="width: 12%">Факт</th>
                                    <th>Разница</th>
                                    <th>Прогноз</th>
                                    <th style="width: 15%">% Вып.</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tr class="table-warning fw-bold group-header-row" data-group-key="${grp.key}">
                                <td>ИТОГО: ${grp.title}</td>
                                <td>
                                    <input type="number" class="form-control form-control-sm fw-bold inp-group-plan" 
                                           value="${groupPlan || ''}" placeholder="План..." 
                                           style="border: 2px solid #ffc107;">
                                </td>
                                <td class="fs-5">${Math.round(totalFact)}</td>
                                <td class="${diff >= 0 ? 'text-success' : 'text-danger'}">${Math.round(diff)}</td>
                                <td>${Math.round(forecast)}</td>
                                <td>${Math.round(percent)}%</td>
                                <td></td>
                            </tr>
                            <tbody>${rowsHtml}</tbody>
                        </table>
                    </div>
                </div>
            `;
            container.innerHTML += tableHtml;
        });
        
        setupEventListeners();
    }

    function setupEventListeners() {
        // Кнопки добавления/удаления
        document.querySelectorAll('.btn-add-custom').forEach(btn => {
            btn.onclick = () => {
                const name = prompt("Название:");
                if (name) {
                    currentSales.push({ month: monthPicker.value, group: btn.dataset.group, dealerName: name, isCustom: true, plan: 0, fact: 0 });
                    renderTable();
                }
            };
        });
        document.querySelectorAll('.btn-del-row').forEach(btn => {
            btn.onclick = (e) => {
                if(confirm('Удалить?')) {
                    const row = e.target.closest('tr');
                    const name = row.dataset.name;
                    currentSales = currentSales.filter(s => !(s.isCustom && s.dealerName === name));
                    renderTable();
                }
            };
        });

        // Живой пересчет (при вводе факта или плана группы)
        const inputs = document.querySelectorAll('.inp-fact, .inp-group-plan');
        inputs.forEach(inp => {
            inp.addEventListener('change', () => {
                 // Пока просто сохраняем в память (визуально обновится после render)
                 // Для полноценного живого пересчета без перезагрузки нужно больше кода,
                 // проще нажать "Сохранить".
            });
        });
    }

    saveBtn.onclick = async () => {
        const dataToSave = [];
        
        // 1. Сохраняем факты дилеров
        document.querySelectorAll('#sales-container tbody tr').forEach(tr => {
            const dealerId = tr.dataset.id;
            const dealerName = tr.dataset.name;
            const isCustom = tr.dataset.custom === 'true';
            const group = tr.dataset.group;
            const fact = parseFloat(tr.querySelector('.inp-fact').value) || 0;

            if (fact > 0 || isCustom) {
                dataToSave.push({ month: monthPicker.value, group, dealerId: dealerId === "null" ? null : dealerId, dealerName, isCustom, plan: 0, fact });
            }
        });

        // 2. Сохраняем ПЛАНЫ ГРУПП
        document.querySelectorAll('.inp-group-plan').forEach(inp => {
            const row = inp.closest('tr');
            const groupKey = row.dataset.groupKey;
            const plan = parseFloat(inp.value) || 0;
            
            if (plan > 0) {
                // Сохраняем план группы как "фиктивного" дилера с ID = GROUP_PLAN_...
                dataToSave.push({
                    month: monthPicker.value,
                    group: groupKey,
                    dealerId: `GROUP_PLAN_${groupKey}`,
                    dealerName: `План ${groupKey}`,
                    isCustom: false,
                    plan: plan,
                    fact: 0 
                });
            }
        });

        try {
            saveBtn.disabled = true; saveBtn.innerHTML = 'Сохранение...';
            const res = await fetch(API_SALES, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ month: monthPicker.value, data: dataToSave }) });
            if (res.ok) { alert('Сохранено!'); loadData(); } else throw new Error('Ошибка');
        } catch (e) { alert(e.message); }
        finally { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="bi bi-save me-2"></i>Сохранить'; }
    };

    monthPicker.addEventListener('change', loadData);
    loadData();
});
