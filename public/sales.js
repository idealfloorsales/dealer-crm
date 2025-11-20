document.addEventListener('DOMContentLoaded', () => {
    
    const API_DEALERS = '/api/dealers';
    const API_SALES = '/api/sales';
    
    const monthPicker = document.getElementById('month-picker');
    const container = document.getElementById('sales-container');
    const summaryBody = document.getElementById('summary-body');
    const saveBtn = document.getElementById('save-btn');
    
    // Установка месяца
    const now = new Date();
    const currentMonthStr = now.toISOString().slice(0, 7);
    monthPicker.value = currentMonthStr;

    // --- КОНФИГУРАЦИЯ ГРУПП ДЛЯ ВВОДА ---
    // Эти группы будут сверху, чтобы в них вбивать дилеров
    const inputGroups = [
        { key: 'regional_astana', title: 'Региональный Астана' },
        { key: 'north', title: 'Регион Север' },
        { key: 'south', title: 'Регион Юг' },
        { key: 'west', title: 'Регион Запад' },
        { key: 'east', title: 'Регион Восток' },
        { key: 'center', title: 'Регион Центр' },
        { key: 'other', title: 'Остальные / Разовые' }
    ];

    // Карта городов (для авто-распределения)
    const cityToRegion = {
        "Павлодар": "north", "Кокшетау": "north", "Петропавловск": "north", "Костанай": "north",
        "Семей": "east", "Усть-Каменогорск": "east",
        "Шымкент": "south", "Алматы": "south", "Тараз": "south", "Кызылорда": "south",
        "Актобе": "west", "Актау": "west", "Атырау": "west", "Уральск": "west",
        "Караганда": "center", "Жезказган": "center",
        "Астана": "regional_astana"
    };

    // Специальные крупные дилеры (для отдельной строки в сводке)
    // Важно: они должны точно совпадать с именем дилера в базе!
    const majorDealersConfig = [
        { name: "Мир Ламината", key: "mir_laminata" },
        { name: "12 месяцев Алаш", key: "12_months" }
    ];

    let allDealers = [];
    let currentSales = [];

    // --- Определение группы ---
    function getDealerGroup(d) {
        if (d.responsible === 'regional_astana') return 'regional_astana';
        if (d.responsible === 'regional_regions') {
            if (d.city && cityToRegion[d.city]) return cityToRegion[d.city];
            return 'other';
        }
        // Авто-определение по городу, если ответственный не задан
        if (!d.responsible && d.city === 'Астана') return 'regional_astana';
        if (!d.responsible && d.city && cityToRegion[d.city]) return cityToRegion[d.city];
        
        return 'other';
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

    // --- РЕНДЕР ВСЕГО ---
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

        // Словари для подсчета сумм
        const facts = {
            north: 0, south: 0, west: 0, east: 0, center: 0,
            regional_astana: 0,
            mir_laminata: 0,
            twelve_months: 0,
            other: 0
        };

        // --- 1. РЕНДЕР ТАБЛИЦ ВВОДА ---
        inputGroups.forEach(grp => {
            const groupDealers = allDealers.filter(d => getDealerGroup(d) === grp.key);
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

                // Суммируем факт в нужную категорию
                if (grp.key !== 'other' && grp.key !== 'regional_astana') {
                    facts[grp.key] += fact; // Регионы
                } else if (grp.key === 'regional_astana') {
                    // Проверка на крупных дилеров внутри Астаны
                    if (item.name.includes("Мир Ламината")) facts.mir_laminata += fact;
                    else if (item.name.includes("12 месяцев") && item.name.includes("Алаш")) facts.twelve_months += fact;
                    else facts.regional_astana += fact; // Остальные астанинские
                } else {
                    facts.other += fact;
                }

                rowsHtml += `
                    <tr data-id="${item.id || ''}" data-name="${item.name}" data-custom="${item.isCustom}" data-group="${grp.key}">
                        <td class="ps-4">${item.name} ${item.isCustom ? '<span class="badge bg-secondary">Разовый</span>' : ''}</td>
                        <td><input type="number" class="form-control form-control-sm inp-fact" value="${fact || ''}" placeholder="0"></td>
                        <td>${item.isCustom ? `<button class="btn btn-sm btn-outline-danger btn-del-row">×</button>` : ''}</td>
                    </tr>
                `;
            });

            container.innerHTML += `
                <div class="card mb-4 shadow-sm border-0">
                    <div class="card-header bg-light d-flex justify-content-between py-2">
                        <h6 class="mb-0 fw-bold">${grp.title}</h6>
                        <button class="btn btn-sm btn-link btn-add-custom" data-group="${grp.key}">+ Добавить</button>
                    </div>
                    <div class="table-responsive">
                        <table class="table table-hover align-middle mb-0 table-sm">
                            <tbody>${rowsHtml}</tbody>
                        </table>
                    </div>
                </div>`;
        });

        // --- 2. РЕНДЕР СВОДНОЙ ТАБЛИЦЫ (ИТОГИ) ---
        // Загружаем сохраненные планы для групп
        const plans = {};
        ["regional_regions", "north", "south", "west", "east", "center", "regional_astana", "mir_laminata", "twelve_months"].forEach(k => {
            const p = currentSales.find(s => s.dealerId === `PLAN_${k}`) || {};
            plans[k] = parseFloat(p.plan) || 0;
        });

        // Сумма регионов
        const totalRegionsFact = facts.north + facts.south + facts.west + facts.east + facts.center;
        const totalPlanAll = plans.regional_regions + plans.regional_astana + plans.mir_laminata + plans.twelve_months; // Общий план
        const totalFactAll = totalRegionsFact + facts.regional_astana + facts.mir_laminata + facts.twelve_months + facts.other;

        // Функция генерации строки сводки
        const renderSummaryRow = (title, planKey, factVal, isBold=false, isMain=false) => {
            const plan = plans[planKey] || 0;
            const diff = factVal - plan;
            
            let forecast = 0;
            if (currentDay > 0) forecast = (factVal / currentDay) * daysInMonth;
            
            const percent = plan > 0 ? (factVal / plan) * 100 : 0;
            const dailyFact = plan > 0 ? (factVal / plan) : 0; // На текущий день (коэффициент)

            const rowClass = isMain ? 'table-info fw-bold' : (isBold ? 'fw-bold' : '');
            
            // Для общей суммы План вычисляем или берем из инпута?
            // В вашем файле "Общее выполнение" - это сумма планов.
            
            return `
                <tr class="${rowClass}" data-plan-key="${planKey}">
                    <td>${title}</td>
                    <td>
                        <input type="number" class="form-control form-control-sm fw-bold inp-group-plan" 
                               value="${plan || ''}" placeholder="0" 
                               style="width: 100px; background: #fffbf0; border: 1px solid #ffc107;">
                    </td>
                    <td>${Math.round(factVal)}</td>
                    <td class="${diff >= 0 ? 'text-success' : 'text-danger'}">${Math.round(diff)}</td>
                    <td>${currentDay}</td>
                    <td>${daysInMonth}</td>
                    <td>${Math.round(forecast)}</td>
                    <td>${dailyFact.toFixed(2)}</td>
                    <td>${Math.round(percent)}%</td>
                </tr>
            `;
        };

        let summaryHtml = '';
        
        // 1. Региональный Регионы (Главная)
        summaryHtml += renderSummaryRow("Региональный Регионы", "regional_regions", totalRegionsFact, true, true);
        
        // 2. Подгруппы регионов
        summaryHtml += renderSummaryRow("   - Север", "north", facts.north);
        summaryHtml += renderSummaryRow("   - Восток", "east", facts.east);
        summaryHtml += renderSummaryRow("   - Юг", "south", facts.south);
        summaryHtml += renderSummaryRow("   - Запад", "west", facts.west);
        summaryHtml += renderSummaryRow("   - Центр", "center", facts.center);
        
        // 3. Астана (Главная)
        summaryHtml += renderSummaryRow("Региональный Астана", "regional_astana", facts.regional_astana, true, true);
        
        // 4. Крупные
        summaryHtml += renderSummaryRow("Мир Ламината", "mir_laminata", facts.mir_laminata, true);
        summaryHtml += renderSummaryRow("12 Месяцев Алаш", "twelve_months", facts.twelve_months, true);

        // 5. Разовые
        if (facts.other > 0) {
            summaryHtml += `<tr><td colspan="2">Разовые / Прочие</td><td>${facts.other}</td><td colspan="6"></td></tr>`;
        }

        // 6. ОБЩЕЕ ВЫПОЛНЕНИЕ
        // План общий = сумме планов главных категорий
        // Факт общий = сумма всех фактов
        // Прогноз общий
        let totalForecast = 0;
        if (currentDay > 0) totalForecast = (totalFactAll / currentDay) * daysInMonth;
        const totalDiff = totalFactAll - totalPlanAll;
        const totalPercent = totalPlanAll > 0 ? (totalFactAll / totalPlanAll) * 100 : 0;

        summaryHtml += `
            <tr class="table-dark fw-bold" style="border-top: 2px solid #000;">
                <td>ОБЩЕЕ ВЫПОЛНЕНИЕ ПЛАНА</td>
                <td>${totalPlanAll}</td>
                <td>${Math.round(totalFactAll)}</td>
                <td class="${totalDiff >= 0 ? 'text-success' : 'text-danger'}">${Math.round(totalDiff)}</td>
                <td>${currentDay}</td>
                <td>${daysInMonth}</td>
                <td>${Math.round(totalForecast)}</td>
                <td>-</td>
                <td>${Math.round(totalPercent)}%</td>
            </tr>
        `;

        summaryBody.innerHTML = summaryHtml;

        setupEventListeners();
    }

    function setupEventListeners() {
        document.querySelectorAll('.btn-add-custom').forEach(btn => {
            btn.onclick = () => {
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
        
        // 1. Факты дилеров
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

        // 2. Планы групп (из сводной таблицы)
        document.querySelectorAll('.inp-group-plan').forEach(inp => {
            const row = inp.closest('tr');
            const planKey = row.dataset.planKey;
            const plan = parseFloat(inp.value) || 0;
            if (plan > 0 || planKey) {
                dataToSave.push({ 
                    month: monthPicker.value, 
                    group: 'PLAN', 
                    dealerId: `PLAN_${planKey}`, // Специальный ID для плана
                    dealerName: `Plan ${planKey}`, 
                    isCustom: false, 
                    plan, 
                    fact: 0 
                });
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
