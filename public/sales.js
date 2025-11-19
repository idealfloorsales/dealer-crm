document.addEventListener('DOMContentLoaded', () => {
    
    const API_DEALERS = '/api/dealers';
    const API_SALES = '/api/sales';
    
    const monthPicker = document.getElementById('month-picker');
    const container = document.getElementById('sales-container');
    const saveBtn = document.getElementById('save-btn');
    
    // Установка текущего месяца
    const now = new Date();
    const currentMonthStr = now.toISOString().slice(0, 7); // YYYY-MM
    monthPicker.value = currentMonthStr;

    const groupsOrder = [
        { key: 'michael', title: 'Отдел продаж Михаил' },
        { key: 'alexander', title: 'Отдел продаж Александр' },
        { key: 'north', title: 'Регион Север' },
        { key: 'south', title: 'Регион Юг' },
        { key: 'west', title: 'Регион Запад' },
        { key: 'east', title: 'Регион Восток' },
        { key: 'center', title: 'Регион Центр' },
        { key: '', title: 'Без группы' } // Для остальных
    ];

    let allDealers = [];
    let currentSales = [];

    // --- Загрузка ---
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

    // --- Расчеты (KPI) ---
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

    // --- Рендер ---
    function renderTable() {
        const date = new Date(monthPicker.value);
        const year = date.getFullYear();
        const monthIndex = date.getMonth(); // 0-11
        
        const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
        
        // Определяем "текущий день" для прогноза
        const today = new Date();
        let currentDay = daysInMonth; // По умолчанию весь месяц
        if (today.getFullYear() === year && today.getMonth() === monthIndex) {
            currentDay = today.getDate();
        }

        container.innerHTML = '';

        // Проходим по группам
        groupsOrder.forEach(grp => {
            // 1. Находим дилеров из базы для этой группы
            const groupDealers = allDealers.filter(d => (d.responsible || '') === grp.key);
            
            // 2. Находим "Разовых" (custom), которые сохранены в продажах для этой группы
            const customSales = currentSales.filter(s => s.isCustom && s.group === grp.key);

            if (groupDealers.length === 0 && customSales.length === 0) return; // Пропускаем пустые группы

            // Строим HTML таблицы
            let rowsHtml = '';
            let totalPlan = 0;
            let totalFact = 0;

            // Объединяем списки для отображения
            const items = [
                ...groupDealers.map(d => ({ id: d.id, name: d.name, isCustom: false })),
                ...customSales.map(s => ({ id: null, name: s.dealerName, isCustom: true }))
            ];

            items.forEach(item => {
                // Ищем сохраненные данные
                const sale = currentSales.find(s => 
                    (item.isCustom && s.isCustom && s.dealerName === item.name) || 
                    (!item.isCustom && !s.isCustom && s.dealerId === item.id)
                ) || {};

                const plan = sale.plan || '';
                const fact = sale.fact || '';
                
                const { diff, forecast, percent } = calculateKPI(plan, fact, daysInMonth, currentDay);
                
                totalPlan += parseFloat(plan) || 0;
                totalFact += parseFloat(fact) || 0;

                rowsHtml += `
                    <tr data-id="${item.id || ''}" data-name="${item.name}" data-custom="${item.isCustom}" data-group="${grp.key}">
                        <td>${item.name} ${item.isCustom ? '<span class="badge bg-secondary">Разовый</span>' : ''}</td>
                        <td><input type="number" class="form-control form-control-sm inp-plan" value="${plan}" placeholder="0"></td>
                        <td><input type="number" class="form-control form-control-sm inp-fact" value="${fact}" placeholder="0"></td>
                        <td class="${diff >= 0 ? 'text-success' : 'text-danger'} fw-bold">${Math.round(diff)}</td>
                        <td>${currentDay}/${daysInMonth}</td>
                        <td class="fw-bold">${Math.round(forecast)}</td>
                        <td>
                            <div class="progress position-relative" style="height: 20px;">
                                <div class="progress-bar ${percent >= 100 ? 'bg-success' : 'bg-warning'}" role="progressbar" style="width: ${Math.min(percent, 100)}%"></div>
                                <small class="justify-content-center d-flex position-absolute w-100 text-dark">${Math.round(percent)}%</small>
                            </div>
                        </td>
                        <td>
                             ${item.isCustom ? `<button class="btn btn-sm btn-outline-danger btn-del-row">×</button>` : ''}
                        </td>
                    </tr>
                `;
            });

            // ИТОГО по группе
            const { diff: totalDiff, forecast: totalForecast, percent: totalPercent } = calculateKPI(totalPlan, totalFact, daysInMonth, currentDay);

            const tableHtml = `
                <div class="card mb-4 shadow-sm">
                    <div class="card-header bg-light d-flex justify-content-between align-items-center">
                        <h5 class="mb-0">${grp.title}</h5>
                        <button class="btn btn-sm btn-outline-primary btn-add-custom" data-group="${grp.key}">+ Добавить разового</button>
                    </div>
                    <div class="table-responsive">
                        <table class="table table-hover align-middle mb-0">
                            <thead class="table-light">
                                <tr>
                                    <th style="width: 25%">Дилер</th>
                                    <th style="width: 10%">План (м²)</th>
                                    <th style="width: 10%">Факт (м²)</th>
                                    <th>Разница</th>
                                    <th>Дней</th>
                                    <th>Прогноз</th>
                                    <th style="width: 15%">Выполнение</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                ${rowsHtml}
                            </tbody>
                            <tfoot class="table-secondary fw-bold">
                                <tr>
                                    <td>ИТОГО</td>
                                    <td>${totalPlan}</td>
                                    <td>${totalFact}</td>
                                    <td class="${totalDiff >= 0 ? 'text-success' : 'text-danger'}">${Math.round(totalDiff)}</td>
                                    <td>-</td>
                                    <td>${Math.round(totalForecast)}</td>
                                    <td>${Math.round(totalPercent)}%</td>
                                    <td></td>
                                </tr>
                            </tfoot>
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
        // Авто-пересчет при вводе (визуально, без сохранения)
        document.querySelectorAll('.inp-plan, .inp-fact').forEach(input => {
            input.addEventListener('input', (e) => {
                // Тут можно сделать пересчет строки на лету, но для простоты пока оставим сохранение
            });
        });

        // Добавление разового
        document.querySelectorAll('.btn-add-custom').forEach(btn => {
            btn.onclick = () => {
                const name = prompt("Введите название разового покупателя:");
                if (name) {
                    const grp = btn.dataset.group;
                    currentSales.push({
                        month: monthPicker.value,
                        group: grp,
                        dealerName: name,
                        isCustom: true,
                        plan: 0, fact: 0
                    });
                    renderTable(); // Перерисовать
                }
            };
        });
        
        // Удаление разового
        document.querySelectorAll('.btn-del-row').forEach(btn => {
            btn.onclick = (e) => {
                if(confirm('Удалить строку?')) {
                    const row = e.target.closest('tr');
                    const name = row.dataset.name;
                    // Удаляем из массива currentSales
                    currentSales = currentSales.filter(s => !(s.isCustom && s.dealerName === name));
                    renderTable();
                }
            };
        });
    }

    // --- Сохранение ---
    saveBtn.onclick = async () => {
        const dataToSave = [];
        
        document.querySelectorAll('#sales-container tr[data-group]').forEach(tr => {
            const dealerId = tr.dataset.id; // может быть "null"
            const dealerName = tr.dataset.name;
            const isCustom = tr.dataset.custom === 'true';
            const group = tr.dataset.group;
            
            const plan = parseFloat(tr.querySelector('.inp-plan').value) || 0;
            const fact = parseFloat(tr.querySelector('.inp-fact').value) || 0;

            // Сохраняем, если есть хоть какие-то цифры или это разовый (чтобы не потерять его)
            if (plan > 0 || fact > 0 || isCustom) {
                dataToSave.push({
                    month: monthPicker.value,
                    group,
                    dealerId: dealerId === "null" ? null : dealerId,
                    dealerName,
                    isCustom,
                    plan,
                    fact
                });
            }
        });

        try {
            saveBtn.disabled = true;
            saveBtn.innerHTML = 'Сохранение...';
            
            const res = await fetch(API_SALES, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ month: monthPicker.value, data: dataToSave })
            });
            
            if (res.ok) {
                alert('Сохранено!');
                loadData(); // Перезагрузить, чтобы обновить итоги
            } else throw new Error('Ошибка');
            
        } catch (e) { alert(e.message); }
        finally {
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<i class="bi bi-save me-2"></i>Сохранить';
        }
    };

    monthPicker.addEventListener('change', loadData);
    
    loadData();
});
