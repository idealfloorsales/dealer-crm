document.addEventListener('DOMContentLoaded', () => {
    
    const API_DEALERS = '/api/dealers';
    const API_SALES = '/api/sales';
    
    const monthPicker = document.getElementById('month-picker');
    const container = document.getElementById('sales-container');
    const saveBtn = document.getElementById('save-btn');
    
    const now = new Date();
    const currentMonthStr = now.toISOString().slice(0, 7);
    monthPicker.value = currentMonthStr;

    const groupsOrder = [
        { key: 'michael', title: 'Отдел продаж Михаил' },
        { key: 'alexander', title: 'Отдел продаж Александр' },
        { key: 'north', title: 'Регион Север' },
        { key: 'south', title: 'Регион Юг' },
        { key: 'west', title: 'Регион Запад' },
        { key: 'east', title: 'Регион Восток' },
        { key: 'center', title: 'Регион Центр' },
        { key: '', title: 'Без группы' }
    ];

    let allDealers = [];
    let currentSales = [];

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
        if (currentDay > 0) {
            forecast = (fact / currentDay) * daysInMonth;
        }
        
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
            const groupDealers = allDealers.filter(d => (d.responsible || '') === grp.key);
            const customSales = currentSales.filter(s => s.isCustom && s.group === grp.key);

            if (groupDealers.length === 0 && customSales.length === 0) return;

            let rowsHtml = '';
            let totalPlan = 0;
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
                        <td>${item.isCustom ? `<button class="btn btn-sm btn-outline-danger btn-del-row">×</button>` : ''}</td>
                    </tr>
                `;
            });

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
                            <tbody>${rowsHtml}</tbody>
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

    function setupEventListeners() {
        document.querySelectorAll('.btn-add-custom').forEach(btn => {
            btn.onclick = () => {
                const name = prompt("Введите название разового покупателя:");
                if (name) {
                    currentSales.push({ month: monthPicker.value, group: btn.dataset.group, dealerName: name, isCustom: true, plan: 0, fact: 0 });
                    renderTable();
                }
            };
        });
        document.querySelectorAll('.btn-del-row').forEach(btn => {
            btn.onclick = (e) => {
                if(confirm('Удалить строку?')) {
                    const row = e.target.closest('tr');
                    const name = row.dataset.name;
                    currentSales = currentSales.filter(s => !(s.isCustom && s.dealerName === name));
                    renderTable();
                }
            };
        });
    }

    saveBtn.onclick = async () => {
        const dataToSave = [];
        document.querySelectorAll('#sales-container tr[data-group]').forEach(tr => {
            const dealerId = tr.dataset.id;
            const dealerName = tr.dataset.name;
            const isCustom = tr.dataset.custom === 'true';
            const group = tr.dataset.group;
            const plan = parseFloat(tr.querySelector('.inp-plan').value) || 0;
            const fact = parseFloat(tr.querySelector('.inp-fact').value) || 0;

            if (plan > 0 || fact > 0 || isCustom) {
                dataToSave.push({ month: monthPicker.value, group, dealerId: dealerId === "null" ? null : dealerId, dealerName, isCustom, plan, fact });
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
