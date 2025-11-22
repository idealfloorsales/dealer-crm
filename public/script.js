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

    // ГРУППЫ ДЛЯ ВВОДА (ВЕРХНЯЯ ТАБЛИЦА)
    const inputGroups = [
        { key: 'regional_astana', title: 'Региональный Астана' },
        { key: 'north', title: 'Регион Север' },
        { key: 'south', title: 'Регион Юг' },
        { key: 'west', title: 'Регион Запад' },
        { key: 'east', title: 'Регион Восток' },
        { key: 'center', title: 'Регион Центр' },
        { key: 'other', title: 'Остальные / Разовые' }
    ];

    // КАРТА ГОРОДОВ
    const cityToRegion = {
        "павлодар": "north", "кокшетау": "north", "петропавловск": "north", "костанай": "north", "экибастуз": "north",
        "семей": "east", "усть-каменогорск": "east", "оскемен": "east",
        "шымкент": "south", "алматы": "south", "алмата": "south", "тараз": "south", "кызылорда": "south", "туркестан": "south", "талдыкорган": "south",
        "актобе": "west", "актау": "west", "атырау": "west", "уральск": "west", "орал": "west", "жанаозен": "west",
        "караганда": "center", "жезказган": "center", "темиртау": "center",
        "астана": "regional_astana" 
    };

    // КРУПНЫЕ ДИЛЕРЫ (ВЫДЕЛЕНИЕ В ОТДЕЛЬНЫЕ СТРОКИ ИТОГОВ)
    const majorDealersConfig = [
        { name: "мир ламината", key: "mir_laminata" },
        { name: "12 месяцев алаш", key: "twelve_months" }
    ];

    let allDealers = [];
    let currentSales = [];

    // Форматирование (оставляем дроби)
    function fmt(num) {
        if (typeof num !== 'number' || isNaN(num)) return 0;
        return Math.round(num * 100) / 100;
    }

    // Определение группы дилера
    function getDealerGroup(d) {
        if (d.responsible === 'regional_astana') return 'regional_astana';
        
        if (d.responsible === 'regional_regions') {
            const city = (d.city || '').toLowerCase().trim();
            if (cityToRegion[city]) return cityToRegion[city];
            return 'other';
        }
        // Авто-определение по городу
        const city = (d.city || '').toLowerCase().trim();
        if (city === 'астана') return 'regional_astana';
        if (cityToRegion[city]) return cityToRegion[city];
        
        return 'other';
    }

    // Проверка на крупного дилера
    function getMajorKey(dealerName) {
        if (!dealerName) return null;
        const lower = dealerName.toLowerCase();
        const found = majorDealersConfig.find(m => lower.includes(m.name));
        return found ? found.key : null;
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
        } catch (e) { alert('Ошибка загрузки: ' + e.message); }
    }

    function calculateKPI(plan, fact, daysInMonth, currentDay) {
        plan = parseFloat(plan) || 0;
        fact = parseFloat(fact) || 0;
        const diff = fact - plan;
        
        let forecast = 0;
        if (currentDay > 0) forecast = (fact / currentDay) * daysInMonth;
        
        const percent = plan > 0 ? (fact / plan) * 100 : 0;
        
        // Коэффициент на текущий день
        let dailyRatio = 0;
        if (plan > 0 && currentDay > 0) {
             const planPerDay = plan / daysInMonth;
             const factPerDay = fact / currentDay;
             dailyRatio = factPerDay / planPerDay;
        }

        return { diff, forecast, percent, dailyRatio };
    }

    // --- ЗАХВАТ ДАННЫХ ПЕРЕД ПЕРЕРИСОВКОЙ ---
    function captureState() {
        // 1. Факты (из верхней таблицы)
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

        // 2. Планы (из нижней таблицы)
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

    // --- ГЛАВНЫЙ РЕНДЕР ---
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

        // --- 1. РАСЧЕТ СУММ ФАКТОВ ---
        const facts = {
            north: 0, south: 0, west: 0, east: 0, center: 0,
            regional_astana: 0, // Чистая Астана
            mir_laminata: 0,
            twelve_months: 0,
            other: 0
        };

        // Рендер верхней таблицы (Ввод)
        inputGroups.forEach(grp => {
            // Фильтр дилеров
            const groupDealers = allDealers.filter(d => {
                const matchGroup = getDealerGroup(d) === grp.key;
                // Исключаем Потенциальных и Архив
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

            // Таблица группы
            rowsHtml += `
            <div class="card mb-4 shadow-sm border-0">
                <div class="card-header bg-light d-flex justify-content-between py-2">
                    <h6 class="mb-0 fw-bold">${grp.title}</h6>
                    <button class="btn btn-sm btn-link btn-add-custom" data-group="${grp.key}">+ Добавить</button>
                </div>
                <div class="table-responsive">
                    <table class="table table-hover align-middle mb-0 table-sm">
                        <tbody>`;

            items.forEach(item => {
                const sale = currentSales.find(s => (item.isCustom && s.isCustom && s.dealerName === item.name) || (!item.isCustom && !s.isCustom && s.dealerId === item.id)) || {};
                const fact = parseFloat(sale.fact) || 0;

                // РАСПРЕДЕЛЕНИЕ ДЕНЕГ (КРУПНЫЕ ОТДЕЛЬНО)
                const majorKey = getMajorKey(item.name);
                
                if (majorKey) {
                    facts[majorKey] += fact; // Уходит в спец. строку (Мир Ламината)
                } else if (grp.key === 'regional_astana') {
                    facts.regional_astana += fact; // Уходит в Региональный Астана
                } else if (grp.key !== 'other') {
                    facts[grp.key] += fact; // Уходит в регион
                } else {
                    facts.other += fact; // Разовые
                }

                rowsHtml += `
                    <tr data-id="${item.id || ''}" data-name="${item.name}" data-custom="${item.isCustom}" data-group="${grp.key}">
                        <td class="ps-4">${item.name} ${item.isCustom ? '<span class="badge bg-secondary">Разовый</span>' : ''}</td>
                        <td style="width: 150px;">
                            <input type="number" step="0.01" class="form-control form-control-sm inp-fact" value="${fact || ''}" placeholder="0">
                        </td>
                        <td style="width: 50px;">${item.isCustom ? `<button class="btn btn-sm btn-outline-danger btn-del-row">×</button>` : ''}</td>
                    </tr>
                `;
            });
            rowsHtml += `</tbody></table></div></div>`;
            container.innerHTML += rowsHtml;
        });

        // --- 2. РЕНДЕР СВОДНОЙ ТАБЛИЦЫ (НИЗ) ---
        
        // Загрузка Планов
        const plans = {};
        const keys = ["regional_regions", "north", "south", "west", "east", "center", "regional_astana", "mir_laminata", "twelve_months", "total_all"];
        keys.forEach(k => {
            const p = currentSales.find(s => s.dealerId === `PLAN_${k}`) || {};
            plans[k] = parseFloat(p.plan) || 0;
        });

        // Агрегация Фактов
        const totalRegionsFact = facts.north + facts.south + facts.west + facts.east + facts.center;
        
        // ОБЩИЕ ИТОГИ
        const totalPlanAll = plans.total_all; // Берем из ручного ввода
        const totalFactAll = totalRegionsFact + facts.regional_astana + facts.mir_laminata + facts.twelve_months + facts.other;

        const renderSummaryRow = (title, planKey, factVal, indent=false, isBold=false) => {
            const plan = plans[planKey] || 0;
            const { diff, forecast, percent, dailyRatio } = calculateKPI(plan, factVal, daysInMonth, currentDay);
            
            let rowStyle = '';
            if(isBold) rowStyle = 'font-weight: bold; background-color: #f8f9fa;';
            if(indent) rowStyle += 'color: #666; font-style: italic;';
            
            // Отступ названия
            const titleHtml = indent ? `<span style="padding-left: 20px;">- ${title}</span>` : title;

            // Цвет процента
            let percClass = 'text-dark';
            if(percent >= 100) percClass = 'text-success fw-bold';
            else if(percent < 50) percClass = 'text-danger';

            return `
                <tr style="${rowStyle}" data-plan-key="${planKey}">
                    <td>${titleHtml}</td>
                    <td>
                        <input type="number" step="0.01" class="form-control form-control-sm fw-bold inp-group-plan" 
                               value="${plan || ''}" placeholder="0" 
                               style="width: 100px; background: #fffbf0; border: 1px solid #ffc107;">
                    </td>
                    <td>${fmt(factVal)}</td>
                    <td class="${diff >= 0 ? 'text-success' : 'text-danger'}">${fmt(diff)}</td>
                    <td>${currentDay}</td>
                    <td>${daysInMonth}</td>
                    <td>${fmt(forecast)}</td>
                    <td>${fmt(dailyRatio)}</td>
                    <td class="${percClass}">${fmt(percent)}%</td>
                </tr>
            `;
        };

        let summaryHtml = '';
        
        // 1. РЕГИОНЫ
        summaryHtml += renderSummaryRow("Региональный Регионы (Сумма)", "regional_regions", totalRegionsFact, false, true);
        summaryHtml += renderSummaryRow("Север", "north", facts.north, true);
        summaryHtml += renderSummaryRow("Восток", "east", facts.east, true);
        summaryHtml += renderSummaryRow("Юг", "south", facts.south, true);
        summaryHtml += renderSummaryRow("Запад", "west", facts.west, true);
        summaryHtml += renderSummaryRow("Центр", "center", facts.center, true);

        // Разделитель
        summaryHtml += `<tr><td colspan="9" class="bg-secondary" style="height: 2px; padding: 0;"></td></tr>`;

        // 2. АСТАНА И КРУПНЫЕ
        summaryHtml += renderSummaryRow("Региональный Астана", "regional_astana", facts.regional_astana, false, true);
        summaryHtml += renderSummaryRow("Мир Ламината", "mir_laminata", facts.mir_laminata, false, true);
        summaryHtml += renderSummaryRow("12 Месяцев Алаш", "twelve_months", facts.twelve_months, false, true);

        // 3. ПРОЧИЕ
        if (facts.other > 0) {
            summaryHtml += `<tr><td colspan="2" class="text-muted fst-italic">Разовые / Нераспределенные</td><td>${fmt(facts.other)}</td><td colspan="6"></td></tr>`;
        }

        // 4. ОБЩИЙ ИТОГ
        const totalKPI = calculateKPI(totalPlanAll, totalFactAll, daysInMonth, currentDay);
        
        summaryHtml += `
            <tr class="table-dark fw-bold" style="border-top: 3px solid #000;" data-plan-key="total_all">
                <td>ОБЩЕЕ ВЫПОЛНЕНИЕ</td>
                <td>
                    <input type="number" step="0.01" class="form-control form-control-sm fw-bold inp-group-plan text-center" 
                           value="${totalPlanAll || ''}" placeholder="План" 
                           style="width: 100px; color: black; background: #fff;">
                </td>
                <td>${fmt(totalFactAll)}</td>
                <td class="${totalKPI.diff >= 0 ? 'text-success' : 'text-danger'}">${fmt(totalKPI.diff)}</td>
                <td>${currentDay}</td>
                <td>${daysInMonth}</td>
                <td>${fmt(totalKPI.forecast)}</td>
                <td>${fmt(totalKPI.dailyRatio)}</td>
                <td>${fmt(totalKPI.percent)}%</td>
            </tr>
        `;

        summaryBody.innerHTML = summaryHtml;
        setupEventListeners();
    }

    function setupEventListeners() {
        document.querySelectorAll('.btn-add-custom').forEach(btn => {
            btn.onclick = () => {
                captureState(); // Сохраняем перед добавлением
                const name = prompt("Введите название клиента (Разовый):");
                if (name) {
                    const grp = btn.dataset.group;
                    currentSales.push({ month: monthPicker.value, group: grp, dealerName: name, isCustom: true, plan: 0, fact: 0 });
                    renderAll();
                }
            };
        });
        document.querySelectorAll('.btn-del-row').forEach(btn => {
            btn.onclick = (e) => {
                if(confirm('Удалить строку?')) {
                    captureState(); // Сохраняем перед удалением
                    const row = e.target.closest('tr');
                    const name = row.dataset.name;
                    currentSales = currentSales.filter(s => !(s.isCustom && s.dealerName === name));
                    renderAll();
                }
            };
        });
    }

    saveBtn.onclick = async () => {
        captureState(); // Финальный захват данных из полей
        
        // Оставляем только данные текущего месяца для отправки
        // (В currentSales могут быть накопившиеся данные, если мы не перезагружали страницу, но сервер перезапишет месяц)
        // Лучше отправить весь currentSales, сервер сам разберется с month
        
        try {
            saveBtn.disabled = true; saveBtn.innerHTML = 'Сохранение...';
            const res = await fetch(API_SALES, { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify({ month: monthPicker.value, data: currentSales }) 
            });
            
            if (res.ok) { 
                alert('Сохранено успешно!'); 
                loadData(); // Перезагрузка для верности
            } else throw new Error('Ошибка сервера');
            
        } catch (e) { alert(e.message); }
        finally { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="bi bi-save me-2"></i>Сохранить'; }
    };

    monthPicker.addEventListener('change', loadData);
    loadData();
});
