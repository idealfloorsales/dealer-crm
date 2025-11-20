document.addEventListener('DOMContentLoaded', () => {
    
    const API_DEALERS = '/api/dealers';
    const API_SALES = '/api/sales';
    
    const monthPicker = document.getElementById('month-picker');
    const container = document.getElementById('sales-container');
    const saveBtn = document.getElementById('save-btn');
    
    // Установка текущего месяца по умолчанию
    const now = new Date();
    const currentMonthStr = now.toISOString().slice(0, 7); // YYYY-MM
    monthPicker.value = currentMonthStr;

    // 1. КОНФИГУРАЦИЯ ГРУПП (Объявляем в самом начале!)
    const groupsOrder = [
        { key: 'michael', title: 'Отдел продаж Михаил', type: 'main' },
        { key: 'alexander', title: 'Отдел продаж Александр', type: 'main' },
        { key: 'regional_astana', title: 'Региональный Астана', type: 'main' },
        { key: 'north', title: 'Регион Север (Павлодар, Кокшетау...)', type: 'region' },
        { key: 'south', title: 'Регион Юг (Алматы, Шымкент...)', type: 'region' },
        { key: 'west', title: 'Регион Запад (Актобе, Уральск...)', type: 'region' },
        { key: 'east', title: 'Регион Восток (Семей, Усть-Каменогорск)', type: 'region' },
        { key: 'center', title: 'Регион Центр (Караганда, Жезказган)', type: 'region' },
        { key: 'other', title: 'Остальные / Не распределенные', type: 'other' }
    ];

    // Карта городов к регионам (для авто-распределения)
    const cityToRegion = {
        "Павлодар": "north", "Кокшетау": "north", "Петропавловск": "north", "Костанай": "north",
        "Семей": "east", "Усть-Каменогорск": "east",
        "Шымкент": "south", "Алматы": "south", "Тараз": "south", "Кызылорда": "south",
        "Актобе": "west", "Актау": "west", "Атырау": "west", "Уральск": "west",
        "Караганда": "center", "Жезказган": "center",
        "Астана": "regional_astana" 
    };

    let allDealers = [];
    let currentSales = [];

    // --- Определение группы дилера ---
    function getDealerGroup(d) {
        // Приоритет 1: Явно назначен Ответственный в карточке
        if (['michael', 'alexander', 'regional_astana'].includes(d.responsible)) {
            return d.responsible;
        }
        // Приоритет 2: Если "Региональный Регионы", смотрим на Город
        if (d.responsible === 'regional_regions' || !d.responsible) {
            if (d.city && cityToRegion[d.city]) return cityToRegion[d.city];
        }
        
        return 'other';
    }

    // --- Загрузка данных ---
    async function loadData() {
        try {
            container.innerHTML = '<p class="text-center mt-5">Загрузка данных...</p>';
            
            const month = monthPicker.value;
            const [dealersRes, salesRes] = await Promise.all([
                fetch(API_DEALERS),
                fetch(`${API_SALES}?month=${month}`)
            ]);
            
            allDealers = await dealersRes.json();
            currentSales = await salesRes.json();
            
            renderTable();
        } catch (e) { 
            container.innerHTML = `<p class="text-center text-danger mt-5">Ошибка: ${e.message}</p>`;
        }
    }

    // --- Математика KPI ---
    function calculateKPI(plan, fact, daysInMonth, currentDay) {
        plan = parseFloat(plan) || 0;
        fact = parseFloat(fact) || 0;
        const diff = fact - plan;
        
        // Прогноз: (Факт / Прошло дней) * Всего дней
        let forecast = 0;
        if (currentDay > 0) {
            forecast = (fact / currentDay) * daysInMonth;
        }
        
        // Процент выполнения
        const percent = plan > 0 ? (fact / plan) * 100 : 0;
        
        return { diff, forecast, percent };
    }

    // --- Рендеринг Таблицы ---
    function renderTable() {
        const date = new Date(monthPicker.value);
        const year = date.getFullYear();
        const monthIndex = date.getMonth(); // 0-11
        const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
        
        // Текущий день для прогноза
        const today = new Date();
        let currentDay = daysInMonth; // Если месяц прошел, считаем за полный
        if (today.getFullYear() === year && today.getMonth() === monthIndex) {
            currentDay = today.getDate();
        }

        container.innerHTML = '';

        groupsOrder.forEach(grp => {
            // 1. Фильтруем дилеров из базы
            const groupDealers = allDealers.filter(d => {
                // Группа совпадает
                const matchGroup = getDealerGroup(d) === grp.key;
                // Статус НЕ "potential" и НЕ "archive"
                const isActive = d.status !== 'potential' && d.status !== 'archive';
                
                return matchGroup && isActive;
            });
            
            // 2. Разовые покупатели для этой группы
            const customSales = currentSales.filter(s => s.isCustom && s.group === grp.key);

            // 3. План Группы (сохраненный ранее)
            const groupPlanRecord = currentSales.find(s => s.dealerId === `GROUP_PLAN_${grp.key}`) || {};
            const groupPlan = groupPlanRecord.plan || 0;

            // Если группа пустая и нет плана - не показываем
            if (groupDealers.length === 0 && customSales.length === 0 && groupPlan === 0) return;

            let rowsHtml = '';
            let totalFact = 0;

            // Объединяем списки
            const items = [
                ...groupDealers.map(d => ({ id: d.id, name: d.name, isCustom: false })),
                ...customSales.map(s => ({ id: null, name: s.dealerName, isCustom: true }))
            ];

            items.forEach(item => {
                // Ищем сохраненный факт
                const sale = currentSales.find(s => 
                    (item.isCustom && s.isCustom && s.dealerName === item.name) || 
                    (!item.isCustom && !s.isCustom && s.dealerId === item.id)
                ) || {};

                const fact = parseFloat(sale.fact) || 0; // У дилера только факт
                totalFact += fact;

                rowsHtml += `
                    <tr data-id="${item.id || ''}" data-name="${item.name}" data-custom="${item.isCustom}" data-group="${grp.key}">
                        <td class="ps-4">
                            ${item.name} 
                            ${item.isCustom ? '<span class="badge bg-secondary ms-2">Разовый</span>' : ''}
                        </td>
                        <td class="text-muted text-center" style="background:#f9f9f9">-</td>
                        <td>
                            <input type="number" class="form-control form-control-sm inp-fact" 
                                   value="${fact || ''}" placeholder="0">
                        </td>
                        <td></td><td></td><td></td><td></td>
                        <td>
                             ${item.isCustom ? `<button class="btn btn-sm btn-outline-danger btn-del-row">×</button>` : ''}
                        </td>
                    </tr>
                `;
            });

            // ИТОГИ ГРУППЫ (Считаются по общему плану и сумме фактов)
            const { diff, forecast, percent } = calculateKPI(groupPlan, totalFact, daysInMonth, currentDay);

            // Цвет прогресс-бара
            let progressColor = 'bg-danger';
            if(percent >= 50) progressColor = 'bg-warning';
            if(percent >= 90) progressColor = 'bg-success';

            const tableHtml = `
                <div class="card mb-4 shadow-sm border-0">
                    <div class="card-header bg-white border-bottom d-flex justify-content-between align-items-center py-3">
                        <h5 class="mb-0 text-primary fw-bold">${grp.title}</h5>
                        <button class="btn btn-sm btn-outline-secondary btn-add-custom" data-group="${grp.key}">+ Добавить разового</button>
                    </div>
                    <div class="table-responsive">
                        <table class="table table-hover align-middle mb-0 table-sm">
                            <thead class="table-light small text-uppercase text-muted">
                                <tr>
                                    <th style="width: 30%">Наименование</th>
                                    <th style="width: 12%">План (м²)</th>
                                    <th style="width: 12%">Факт (м²)</th>
                                    <th style="width: 10%">Разница</th>
                                    <th style="width: 10%">Прогноз</th>
                                    <th style="width: 15%">Выполнение</th>
                                    <th style="width: 5%"></th>
                                </tr>
                            </thead>
                            
                            <tr class="table-warning fw-bold group-header-row" data-group-key="${grp.key}">
                                <td>ИТОГО: ${grp.title}</td>
                                <td>
                                    <input type="number" class="form-control form-control-sm fw-bold inp-group-plan" 
                                           value="${groupPlan || ''}" placeholder="План..." 
                                           style="border: 2px solid #ffc107; background: #fffbf0;">
                                </td>
                                <td class="fs-5">${Math.round(totalFact)}</td>
                                <td class="${diff >= 0 ? 'text-success' : 'text-danger'}">${Math.round(diff)}</td>
                                <td>${Math.round(forecast)}</td>
                                <td>
                                    <div class="d-flex align-items-center">
                                        <div class="progress flex-grow-1 me-2" style="height: 8px;">
                                            <div class="progress-bar ${progressColor}" role="progressbar" style="width: ${Math.min(percent, 100)}%"></div>
                                        </div>
                                        <span>${Math.round(percent)}%</span>
                                    </div>
                                </td>
                                <td></td>
                            </tr>
                            
                            <tbody class="border-top-0">
                                ${rowsHtml}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
            container.innerHTML += tableHtml;
        });
        
        setupEventListeners();
    }

    // --- Обработчики событий ---
    function setupEventListeners() {
        // Добавить разового
        document.querySelectorAll('.btn-add-custom').forEach(btn => {
            btn.onclick = () => {
                const name = prompt("Введите название клиента (Разовый):");
                if (name) {
                    const grp = btn.dataset.group;
                    currentSales.push({
                        month: monthPicker.value,
                        group: grp,
                        dealerName: name,
                        isCustom: true,
                        plan: 0, fact: 0
                    });
                    renderTable(); // Перерисовка для отображения новой строки
                }
            };
        });
        
        // Удалить строку
        document.querySelectorAll('.btn-del-row').forEach(btn => {
            btn.onclick = (e) => {
                if(confirm('Удалить эту строку продаж?')) {
                    const row = e.target.closest('tr');
                    const name = row.dataset.name;
                    // Удаляем из локального массива
                    currentSales = currentSales.filter(s => !(s.isCustom && s.dealerName === name));
                    renderTable();
                }
            };
        });
    }

    // --- Кнопка Сохранить ---
    saveBtn.onclick = async () => {
        const dataToSave = [];
        
        // 1. Собираем факты с дилеров
        document.querySelectorAll('#sales-container tbody tr').forEach(tr => {
            const dealerId = tr.dataset.id;
            const dealerName = tr.dataset.name;
            const isCustom = tr.dataset.custom === 'true';
            const group = tr.dataset.group;
            const fact = parseFloat(tr.querySelector('.inp-fact').value) || 0;

            // Сохраняем если есть факт или это кастомная строка (чтобы она не исчезла)
            if (fact > 0 || isCustom) {
                dataToSave.push({
                    month: monthPicker.value,
                    group,
                    dealerId: dealerId === "null" ? null : dealerId,
                    dealerName,
                    isCustom,
                    plan: 0, // У дилера плана нет
                    fact: fact
                });
            }
        });

        // 2. Собираем Планы с Групп
        document.querySelectorAll('.inp-group-plan').forEach(inp => {
            const row = inp.closest('tr');
            const groupKey = row.dataset.groupKey;
            const plan = parseFloat(inp.value) || 0;
            
            if (plan > 0) {
                // План группы сохраняем как специальную запись
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
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Сохранение...';
            
            const res = await fetch(API_SALES, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ month: monthPicker.value, data: dataToSave })
            });
            
            if (res.ok) {
                // Не делаем alert, просто обновляем кнопку
                saveBtn.innerHTML = '<i class="bi bi-check-lg me-2"></i>Сохранено!';
                setTimeout(() => {
                    saveBtn.disabled = false;
                    saveBtn.innerHTML = '<i class="bi bi-save me-2"></i>Сохранить';
                    loadData(); // Перезагрузка данных для обновления итогов
                }, 1000);
            } else {
                throw new Error('Ошибка сервера');
            }
        } catch (e) {
            alert(e.message);
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<i class="bi bi-save me-2"></i>Сохранить';
        }
    };

    // Смена месяца
    monthPicker.addEventListener('change', loadData);
    
    // Старт
    loadData();
});
