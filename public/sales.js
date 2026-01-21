// --- АВТОРИЗАЦИЯ (ВСТАВИТЬ В НАЧАЛО ФАЙЛА) ---
const originalFetch = window.fetch;
window.fetch = async function (url, options) {
    options = options || {};
    options.headers = options.headers || {};
    const token = localStorage.getItem('crm_token');
    if (token) options.headers['Authorization'] = 'Bearer ' + token;
    const response = await originalFetch(url, options);
    if (response.status === 401) window.location.href = '/login.html';
    return response;
};
// -------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
    
    const API_DEALERS = '/api/dealers';
    const API_SALES = '/api/sales';
    
    // Элементы интерфейса
    const monthPicker = document.getElementById('month-picker');
    const container = document.getElementById('sales-container');
    const summaryList = document.getElementById('summary-list');
    const dashboardTop = document.getElementById('sales-top-dashboard'); 
    const saveBtn = document.getElementById('save-btn');
    const printBtn = document.getElementById('print-btn');
    const summaryCol = document.getElementById('summary-col');
    
    // Мобильные табы (Ввод / Сводка)
    const tabInputBtn = document.getElementById('tab-input-btn');
    const tabSummaryBtn = document.getElementById('tab-summary-btn');
    const colInput = document.getElementById('sales-container-col');
    const colSummary = document.getElementById('summary-col');

    // Логика табов
    if(tabInputBtn && tabSummaryBtn) {
        tabInputBtn.onclick = () => {
            tabInputBtn.classList.add('active', 'bg-primary', 'text-white');
            tabInputBtn.classList.remove('bg-light', 'text-dark');
            tabSummaryBtn.classList.remove('active', 'bg-primary', 'text-white');
            tabSummaryBtn.classList.add('bg-light', 'text-dark');
            colInput.classList.remove('d-none');
            colSummary.classList.add('d-none');
        };
        tabSummaryBtn.onclick = () => {
            tabSummaryBtn.classList.add('active', 'bg-primary', 'text-white');
            tabSummaryBtn.classList.remove('bg-light', 'text-dark');
            tabInputBtn.classList.remove('active', 'bg-primary', 'text-white');
            tabInputBtn.classList.add('bg-light', 'text-dark');
            colSummary.classList.remove('d-none');
            colInput.classList.add('d-none');
        };
    }

    // Установка текущего месяца
    const now = new Date();
    monthPicker.value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;

    let dealers = [];
    let salesMap = {}; // dealerId -> { plan, fact }

    async function init() {
        try {
            const res = await fetch(API_DEALERS);
            if (!res.ok) throw new Error('Ошибка загрузки дилеров');
            const data = await res.json();
            // Фильтруем (убираем архив и "потенциальных" если нужно, пока берем всех активных/стандарт)
            dealers = data.filter(d => d.status !== 'archive' && d.status !== 'potential'); 
            
            // Сортировка по имени
            dealers.sort((a, b) => a.name.localeCompare(b.name));
            
            loadData();
        } catch (e) {
            console.error(e);
            alert("Не удалось загрузить список дилеров");
        }
    }

    async function loadData() {
        try {
            // Чтобы не блокировать интерфейс, пока грузим
            container.style.opacity = '0.5';
            
            const month = monthPicker.value;
            const res = await fetch(`${API_SALES}?month=${month}`);
            if (!res.ok) throw new Error('Ошибка загрузки продаж');
            const salesData = await res.json(); // Array of { dealerId, plan, fact, month }

            salesMap = {};
            salesData.forEach(s => {
                salesMap[s.dealerId] = { plan: s.plan, fact: s.fact };
            });

            renderTable();
            renderSummary();
            
        } catch (e) {
            console.error(e);
        } finally {
            container.style.opacity = '1';
        }
    }

    function renderTable() {
        container.innerHTML = dealers.map(d => {
            const s = salesMap[d.id] || { plan: '', fact: '' };
            
            // Автоподстановка плана, если он пустой (логика: берем предыдущий или дефолт)
            // Пока просто пустая строка или значение из базы
            
            // Подсчет процента выполнения для визуализации
            const plan = parseFloat(s.plan) || 0;
            const fact = parseFloat(s.fact) || 0;
            let percent = 0;
            let progressColor = 'bg-secondary';
            
            if (plan > 0) {
                percent = Math.round((fact / plan) * 100);
                if (percent >= 100) progressColor = 'bg-success';
                else if (percent >= 80) progressColor = 'bg-warning';
                else progressColor = 'bg-danger';
            }

            return `
            <div class="sale-row d-flex align-items-center bg-white border rounded p-2 mb-2 shadow-sm" data-id="${d.id}">
                <div class="flex-grow-1" style="min-width: 120px;">
                    <div class="fw-bold text-truncate" style="max-width: 180px;">${d.name}</div>
                    <div class="small text-muted">${d.city || '-'}</div>
                </div>
                
                <div class="d-flex gap-2 align-items-center">
                    <div class="position-relative">
                        <input type="number" class="form-control form-control-sm inp-plan" placeholder="План" value="${s.plan !== undefined ? s.plan : ''}" style="width: 70px;">
                        <span class="badg-label">План</span>
                    </div>
                    <div class="position-relative">
                        <input type="number" class="form-control form-control-sm inp-fact fw-bold" placeholder="Факт" value="${s.fact !== undefined ? s.fact : ''}" style="width: 70px;">
                        <span class="badg-label">Факт</span>
                    </div>
                </div>

                <div class="ms-3 d-none d-md-block" style="width: 60px; text-align: right;">
                    <span class="badge ${progressColor} rounded-pill">${percent}%</span>
                </div>
            </div>
            `;
        }).join('');
    }

    function renderSummary() {
        let totalPlan = 0;
        let totalFact = 0;

        // Собираем данные ПРЯМО ИЗ INPUTS, чтобы сводка была реактивной (или из map)
        // Но лучше из salesMap, который обновим перед рендером
        // Сейчас берем из salesMap, который обновился при загрузке.
        // А чтобы сводка обновлялась при вводе, нужно вешать listeners.
        
        // Для простоты считаем из salesMap (то что пришло с сервера + локальные изменения если будем сохранять в массив)
        
        // Давайте пройдемся по текущим данным в salesMap
        Object.values(salesMap).forEach(v => {
            totalPlan += parseFloat(v.plan) || 0;
            totalFact += parseFloat(v.fact) || 0;
        });

        const percent = totalPlan > 0 ? Math.round((totalFact / totalPlan) * 100) : 0;
        
        // Обновляем дашборд сверху
        dashboardTop.innerHTML = `
            <div class="d-flex justify-content-around text-center w-100">
                <div>
                    <div class="text-muted small text-uppercase">План</div>
                    <div class="fw-bold fs-5">${totalPlan.toLocaleString()}</div>
                </div>
                <div>
                    <div class="text-muted small text-uppercase">Факт</div>
                    <div class="fw-bold fs-5 text-primary">${totalFact.toLocaleString()}</div>
                </div>
                <div>
                    <div class="text-muted small text-uppercase">%</div>
                    <div class="fw-bold fs-5 ${percent >= 100 ? 'text-success' : 'text-warning'}">${percent}%</div>
                </div>
            </div>
        `;

        // Обновляем список лидеров (Топ 5 по факту)
        // Для этого нужно соединить dealers и salesMap
        const leaderBoard = dealers.map(d => {
            const s = salesMap[d.id] || { fact: 0 };
            return { name: d.name, fact: parseFloat(s.fact) || 0 };
        }).sort((a, b) => b.fact - a.fact).slice(0, 10); // Топ 10

        summaryList.innerHTML = leaderBoard.map((l, i) => `
            <div class="d-flex justify-content-between align-items-center py-2 border-bottom">
                <div class="d-flex align-items-center">
                    <span class="badge bg-light text-secondary me-2 rounded-circle border" style="width:24px;height:24px;display:flex;align-items:center;justify-content:center;">${i+1}</span>
                    <span class="text-truncate" style="max-width: 140px;">${l.name}</span>
                </div>
                <span class="fw-bold small">${l.fact.toLocaleString()}</span>
            </div>
        `).join('');
    }

    // Сбор данных перед сохранением
    function collectDataFromInputs() {
        const currentSales = [];
        const rows = container.querySelectorAll('.sale-row');
        rows.forEach(row => {
            const id = row.dataset.id;
            const planInp = row.querySelector('.inp-plan');
            const factInp = row.querySelector('.inp-fact');
            
            const planVal = parseFloat(planInp.value);
            const factVal = parseFloat(factInp.value);

            // Сохраняем, если есть хоть что-то
            if (!isNaN(planVal) || !isNaN(factVal)) {
                currentSales.push({
                    dealerId: id,
                    plan: isNaN(planVal) ? 0 : planVal,
                    fact: isNaN(factVal) ? 0 : factVal
                });
            }
        });
        return currentSales;
    }

    if (saveBtn) {
        saveBtn.onclick = async () => {
            const currentSales = collectDataFromInputs();
            if (currentSales.length === 0 && !confirm("Данные пустые. Сохранить пустой месяц?")) return;

            try {
                // БЛОКИРУЕМ КНОПКУ
                saveBtn.disabled = true;
                saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
                
                const res = await fetch(API_SALES, { 
                    method: 'POST', 
                    headers: { 'Content-Type': 'application/json' }, 
                    body: JSON.stringify({ month: monthPicker.value, data: currentSales }) 
                });

                if (res.ok) { 
                    if (window.showToast) { window.showToast('Сохранено!'); } else { alert('Сохранено!'); }
                    
                    saveBtn.className = 'btn btn-success shadow-sm px-4 rounded-pill';
                    saveBtn.innerHTML = '<i class="bi bi-check-lg"></i> OK'; 
                    
                    // Перезагрузка данных для обновления сумм
                    await loadData(); 
                    
                    // !!! ИСПРАВЛЕНИЕ: РАЗБЛОКИРОВКА КНОПКИ ЧЕРЕЗ 2 СЕКУНДЫ !!!
                    setTimeout(() => { 
                        saveBtn.innerHTML = '<i class="bi bi-save me-2"></i>Сохранить'; 
                        saveBtn.className = 'btn btn-success shadow-sm px-4 rounded-pill'; 
                        saveBtn.disabled = false; // Возвращаем активность
                    }, 2000);

                } else {
                    throw new Error('Ошибка при сохранении');
                }

            } catch (e) { 
                alert(e.message); 
                // При ошибке разблокируем сразу
                saveBtn.disabled = false; 
                saveBtn.innerHTML = '<i class="bi bi-save me-2"></i>Сохранить';
            } 
        };
    }
    
    // Пересчет сводки "на лету" при вводе (опционально)
    container.addEventListener('input', (e) => {
        if (e.target.classList.contains('inp-plan') || e.target.classList.contains('inp-fact')) {
            // Можно реализовать локальный пересчет, но проще пока оставить кнопку Сохранить
        }
    });

    monthPicker.addEventListener('change', loadData);
    init();
});
