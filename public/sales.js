document.addEventListener('DOMContentLoaded', async () => {
    
    const API_DEALERS_URL = '/api/dealers';
    const API_SALES_URL = '/api/sales';
    const API_AUTH_ME = '/api/auth/me'; 

    const container = document.getElementById('sales-container');
    const totalStatsContainer = document.getElementById('total-stats-container');
    const monthPicker = document.getElementById('month-picker');
    const prevBtn = document.getElementById('btn-prev-month');
    const nextBtn = document.getElementById('btn-next-month');
    
    // Modal elements
    const modalEl = document.getElementById('edit-sales-modal');
    const modal = new bootstrap.Modal(modalEl);
    const inpPlan = document.getElementById('edit_sales_plan');
    const inpFact = document.getElementById('edit_sales_fact');
    const btnSave = document.getElementById('btn-save-sales');

    let allDealers = [];
    let currentSales = [];
    let currentUserRole = 'guest';

    // Init Date
    const now = new Date();
    monthPicker.value = now.toISOString().slice(0, 7);

    // --- INITIALIZATION ---
    try {
        const authRes = await fetch(API_AUTH_ME);
        if (authRes.ok) { const d = await authRes.json(); currentUserRole = d.role; }
        
        await fetchDealers();
        await loadData();
    } catch (e) { console.error(e); }

    // --- LISTENERS ---
    monthPicker.addEventListener('change', loadData);
    prevBtn.addEventListener('click', () => changeMonth(-1));
    nextBtn.addEventListener('click', () => changeMonth(1));
    btnSave.addEventListener('click', saveSales);

    function changeMonth(delta) {
        const d = new Date(monthPicker.value + '-01');
        d.setMonth(d.getMonth() + delta);
        monthPicker.value = d.toISOString().slice(0, 7);
        loadData();
    }

    // --- DATA LOADING ---
    async function fetchDealers() {
        const res = await fetch(API_DEALERS_URL);
        if(res.ok) allDealers = await res.json();
    }

    async function loadData() {
        container.innerHTML = '<div class="text-center py-5 text-muted">Загрузка данных...</div>';
        const month = monthPicker.value;
        try {
            const res = await fetch(`${API_SALES_URL}?month=${month}`);
            if(!res.ok) throw new Error();
            currentSales = await res.json();
            renderReport();
        } catch(e) {
            container.innerHTML = '<div class="alert alert-danger">Ошибка загрузки продаж</div>';
        }
    }

    // --- RENDERING LOGIC ---
    function renderReport() {
        // 1. Подготовка структуры групп
        const groups = {
            'regional_astana': { id: 'astana', title: 'Астана', dealers: [], totalPlan: 0, totalFact: 0 },
            'Север': { id: 'north', title: 'Север', dealers: [], totalPlan: 0, totalFact: 0 },
            'Юг': { id: 'south', title: 'Юг', dealers: [], totalPlan: 0, totalFact: 0 },
            'Запад': { id: 'west', title: 'Запад', dealers: [], totalPlan: 0, totalFact: 0 },
            'Восток': { id: 'east', title: 'Восток', dealers: [], totalPlan: 0, totalFact: 0 },
            'Центр': { id: 'center', title: 'Центр', dealers: [], totalPlan: 0, totalFact: 0 },
            'other': { id: 'other', title: 'Прочее / Без сектора', dealers: [], totalPlan: 0, totalFact: 0 }
        };

        let grandPlan = 0;
        let grandFact = 0;

        // 2. Распределение дилеров по группам
        allDealers.forEach(d => {
            if (d.status === 'archive' || d.status === 'potential') return; // Исключаем архив и потенциальных

            // Находим продажу для дилера
            const sale = currentSales.find(s => s.dealerId === d.id) || { plan: 0, fact: 0 };
            const dealerData = { ...d, plan: sale.plan || 0, fact: sale.fact || 0 };

            // Определяем группу
            let groupKey = 'other';
            
            if (d.responsible === 'regional_astana') {
                groupKey = 'regional_astana';
            } else if (d.responsible === 'regional_regions') {
                // Если регионы - смотрим сектор
                if (d.region_sector && groups[d.region_sector]) {
                    groupKey = d.region_sector;
                } else {
                    groupKey = 'other'; // Региональный, но без сектора
                }
            }

            // Добавляем в группу
            groups[groupKey].dealers.push(dealerData);
            groups[groupKey].totalPlan += dealerData.plan;
            groups[groupKey].totalFact += dealerData.fact;

            grandPlan += dealerData.plan;
            grandFact += dealerData.fact;
        });

        // 3. Рендер верхней сводки (Total Stats)
        const grandPercent = grandPlan > 0 ? Math.round((grandFact / grandPlan) * 100) : 0;
        let progressColor = 'bg-danger';
        if(grandPercent >= 100) progressColor = 'bg-success';
        else if(grandPercent >= 80) progressColor = 'bg-warning';

        totalStatsContainer.innerHTML = `
            <div class="col-md-4">
                <div class="card border-0 shadow-sm h-100">
                    <div class="card-body text-center">
                        <h6 class="text-muted text-uppercase small fw-bold">Общий План</h6>
                        <h2 class="fw-bold mb-0">${grandPlan.toLocaleString()} <small class="text-muted fs-6">м²</small></h2>
                    </div>
                </div>
            </div>
            <div class="col-md-4">
                <div class="card border-0 shadow-sm h-100">
                    <div class="card-body text-center">
                        <h6 class="text-muted text-uppercase small fw-bold">Общий Факт</h6>
                        <h2 class="fw-bold text-primary mb-0">${grandFact.toLocaleString()} <small class="text-muted fs-6">м²</small></h2>
                    </div>
                </div>
            </div>
            <div class="col-md-4">
                <div class="card border-0 shadow-sm h-100">
                    <div class="card-body text-center">
                        <h6 class="text-muted text-uppercase small fw-bold">Выполнение</h6>
                        <div class="progress mt-2" style="height: 10px;">
                            <div class="progress-bar ${progressColor}" role="progressbar" style="width: ${grandPercent}%"></div>
                        </div>
                        <h3 class="fw-bold mt-2 mb-0">${grandPercent}%</h3>
                    </div>
                </div>
            </div>
        `;

        // 4. Рендер Секторов
        container.innerHTML = '';
        
        // Порядок вывода: Астана, затем сектора, затем прочее
        const orderedKeys = ['regional_astana', 'Север', 'Юг', 'Запад', 'Восток', 'Центр', 'other'];

        orderedKeys.forEach(key => {
            const group = groups[key];
            if (group.dealers.length === 0) return; // Пропускаем пустые группы

            const gPercent = group.totalPlan > 0 ? Math.round((group.totalFact / group.totalPlan) * 100) : 0;
            let gColor = 'text-danger'; 
            if(gPercent >= 100) gColor = 'text-success'; else if(gPercent >= 80) gColor = 'text-warning';

            // Карточка группы
            const card = document.createElement('div');
            card.className = 'card border-0 shadow-sm';
            
            // Заголовок группы
            let headerHtml = `
                <div class="card-header bg-white border-0 pt-3 pb-2 d-flex justify-content-between align-items-center">
                    <h5 class="fw-bold mb-0">${group.title} <span class="badge bg-light text-dark border ms-2">${group.dealers.length}</span></h5>
                    <div class="text-end">
                        <span class="d-block small text-muted">Выполнение</span>
                        <span class="fw-bold ${gColor}">${gPercent}%</span>
                    </div>
                </div>
                <div class="px-3 pb-2">
                    <div class="progress" style="height: 6px;">
                        <div class="progress-bar ${gPercent >= 100 ? 'bg-success' : (gPercent >= 80 ? 'bg-warning' : 'bg-danger')}" style="width: ${gPercent}%"></div>
                    </div>
                    <div class="d-flex justify-content-between small text-muted mt-1">
                        <span>План: <b>${group.totalPlan}</b></span>
                        <span>Факт: <b>${group.totalFact}</b></span>
                    </div>
                </div>
            `;

            // Таблица дилеров
            let rowsHtml = '';
            // Сортировка внутри группы: сначала те, у кого больше факт
            group.dealers.sort((a, b) => b.fact - a.fact);

            group.dealers.forEach(d => {
                const dPercent = d.plan > 0 ? Math.round((d.fact / d.plan) * 100) : 0;
                let badgeClass = 'bg-danger-subtle text-danger';
                if(dPercent >= 100) badgeClass = 'bg-success-subtle text-success';
                else if(dPercent >= 80) badgeClass = 'bg-warning-subtle text-warning-emphasis';

                rowsHtml += `
                    <tr onclick="openEditModal('${d.id}', '${d.name}', ${d.plan}, ${d.fact})">
                        <td class="ps-3">
                            <div class="fw-bold text-truncate" style="max-width: 180px;">${d.name}</div>
                            <div class="small text-muted">${d.city}</div>
                        </td>
                        <td class="text-end">
                            <div class="small text-muted">План: ${d.plan}</div>
                            <div class="fw-bold">${d.fact}</div>
                        </td>
                        <td class="text-end pe-3" style="width: 60px;">
                            <span class="badge ${badgeClass}">${dPercent}%</span>
                        </td>
                    </tr>
                `;
            });

            card.innerHTML = `
                ${headerHtml}
                <div class="table-responsive">
                    <table class="table table-hover align-middle mb-0">
                        <tbody>${rowsHtml}</tbody>
                    </table>
                </div>
            `;
            container.appendChild(card);
        });
    }

    // --- EDIT LOGIC ---
    window.openEditModal = function(id, name, plan, fact) {
        if (currentUserRole === 'guest') return;
        document.getElementById('edit_sales_dealer_id').value = id;
        document.getElementById('edit_sales_dealer_name').value = name;
        inpPlan.value = plan || 0;
        inpFact.value = fact || 0;
        modal.show();
    };

    async function saveSales() {
        const id = document.getElementById('edit_sales_dealer_id').value;
        const name = document.getElementById('edit_sales_dealer_name').value;
        const plan = parseFloat(inpPlan.value) || 0;
        const fact = parseFloat(inpFact.value) || 0;
        const month = monthPicker.value;

        btnSave.disabled = true;
        try {
            // Отправляем массив, так как API принимает bulk write
            const payload = {
                month: month,
                data: [{
                    dealerId: id,
                    dealerName: name,
                    plan: plan,
                    fact: fact
                }]
            };

            const res = await fetch(API_SALES_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if(res.ok) {
                modal.hide();
                loadData(); // Перегрузить таблицу
            } else {
                alert('Ошибка сохранения');
            }
        } catch(e) {
            console.error(e);
            alert('Ошибка сети');
        } finally {
            btnSave.disabled = false;
        }
    }
});
