// --- АВТОРИЗАЦИЯ ---
const originalFetch = window.fetch;
window.fetch = async function (url, options) {
    options = options || {};
    options.headers = options.headers || {};
    const token = localStorage.getItem('crm_token');
    if (token) options.headers['Authorization'] = 'Bearer ' + token;
    
    const response = await originalFetch(url, options);
    
    if (response.status === 401 || response.status === 403) {
        localStorage.removeItem('crm_token');
        window.location.href = '/login.html';
    }
    
    return response;
};
// --------------------

document.addEventListener('DOMContentLoaded', () => {
    
    const API_DEALERS = '/api/dealers';
    const API_SALES = '/api/sales';
    const API_SECTORS = '/api/sectors';
    
    // Элементы
    const monthPicker = document.getElementById('month-picker');
    const container = document.getElementById('sales-container');
    const summaryList = document.getElementById('summary-list');
    const dashboardTop = document.getElementById('sales-top-dashboard'); 
    const saveBtn = document.getElementById('save-btn');
    const printBtn = document.getElementById('print-btn');
    const summaryCol = document.getElementById('summary-col');
    const lastUpdateInfo = document.getElementById('last-update-info');
    
    // Табы
    const tabInputBtn = document.getElementById('tab-input-btn');
    const tabSummaryBtn = document.getElementById('tab-summary-btn');
    const colInput = document.getElementById('sales-container-col');
    const colSummary = document.getElementById('summary-col');

    const now = new Date();
    monthPicker.value = now.toISOString().slice(0, 7);

    // КОНФИГУРАЦИЯ ГРУПП
    let groupsConfig = [
        { key: 'vip', title: 'Спец. Клиенты (VIP)', isSystem: true }
    ];

    let allDealers = [];
    let currentSales = [];
    let allSectors = []; 
    
    // Загрузка настроек видимости планов
    let planVisibility = JSON.parse(localStorage.getItem('sales_plan_config')) || {};

    async function init() {
        try {
            const authRes = await fetch('/api/auth/me');
            if (authRes.ok) {
                const authData = await authRes.json();
                const user = authData.user || {};
                const canEdit = user.permissions && user.permissions.can_edit_sales;
                if (!canEdit && saveBtn) { 
                    saveBtn.disabled = true; 
                    saveBtn.innerHTML = '<i class="bi bi-lock"></i> Только чтение'; 
                }
            }
        } catch (e) { console.error(e); }

        await loadSectors(); 
        loadData();
        setupMobileTabs();
    }

    async function loadSectors() {
        try {
            const res = await fetch(API_SECTORS);
            if (res.ok) {
                allSectors = await res.json();
                
                // АСТАНА
                const astanaSectors = allSectors.filter(s => s.type === 'astana');
                astanaSectors.forEach(s => {
                    const key = 'astana_' + s.name.replace(/\s+/g, '_').toLowerCase();
                    if (!groupsConfig.find(g => g.key === key)) {
                        groupsConfig.push({ key: key, title: `Астана - ${s.name}`, sectorName: s.name, type: 'astana' });
                    }
                });

                // РЕГИОНЫ
                const regionSectors = allSectors.filter(s => s.type === 'region');
                regionSectors.forEach(s => {
                    const key = 'sector_' + s.name.replace(/\s+/g, '_').toLowerCase();
                    if (!groupsConfig.find(g => g.key === key)) {
                        groupsConfig.push({ key: key, title: `Регион ${s.name}`, sectorName: s.name, type: 'region' });
                    }
                });

                groupsConfig.push({ key: 'regional_regions', title: 'Регионы (Без сектора)', isSystem: true, type: 'region' });
                groupsConfig.push({ key: 'other', title: 'Без ответственного / Прочие', isSystem: true });
            }
        } catch (e) { console.error("Ошибка секторов", e); }
    }

    function setupMobileTabs() {
        if(!tabInputBtn || !tabSummaryBtn) return;
        tabInputBtn.onclick = () => {
            tabInputBtn.classList.add('btn-white', 'shadow-sm', 'text-primary'); tabInputBtn.classList.remove('text-muted');
            tabSummaryBtn.classList.remove('btn-white', 'shadow-sm', 'text-primary'); tabSummaryBtn.classList.add('text-muted');
            colInput.classList.remove('mobile-hidden'); colSummary.classList.add('mobile-hidden'); window.scrollTo(0, 0);
        };
        tabSummaryBtn.onclick = () => {
            tabSummaryBtn.classList.add('btn-white', 'shadow-sm', 'text-primary'); tabSummaryBtn.classList.remove('text-muted');
            tabInputBtn.classList.remove('btn-white', 'shadow-sm', 'text-primary'); tabInputBtn.classList.add('text-muted');
            colSummary.classList.remove('mobile-hidden'); colInput.classList.add('mobile-hidden'); window.scrollTo(0, 0);
        };
    }

    async function loadData() {
        try {
            container.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div></div>';
            const [dealersRes, salesRes] = await Promise.all([
                fetch(API_DEALERS + '?scope=all'),
                fetch(`${API_SALES}?month=${monthPicker.value}`)
            ]);

            if (!dealersRes.ok || !salesRes.ok) throw new Error("Ошибка доступа");

            allDealers = await dealersRes.json();
            currentSales = await salesRes.json();
            renderAll();
            updateLastModifiedText();
        } catch (e) { 
            container.innerHTML = `<div class="alert alert-danger">Ошибка: ${e.message}</div>`;
        }
    }

    function updateLastModifiedText() {
        if (!lastUpdateInfo) return;
        if (!currentSales || currentSales.length === 0) {
            lastUpdateInfo.innerHTML = '<i class="bi bi-clock-history me-1"></i>Нет данных';
            return;
        }
        let maxDate = null;
        currentSales.forEach(item => {
            if (item.updatedAt) {
                const d = new Date(item.updatedAt);
                if (!maxDate || d > maxDate) maxDate = d;
            }
        });
        if (maxDate) {
            const str = maxDate.toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
            lastUpdateInfo.innerHTML = `<i class="bi bi-clock-history me-1"></i>Обновлено: ${str}`;
        } else {
            lastUpdateInfo.innerHTML = '<i class="bi bi-exclamation-circle me-1"></i>Нажмите "Сохранить"';
        }
    }

    // Переключение плана
    window.toggleGroupPlan = (groupKey) => {
        const current = planVisibility[groupKey] !== false;
        planVisibility[groupKey] = !current;
        localStorage.setItem('sales_plan_config', JSON.stringify(planVisibility));
        renderAll(); 
    };

    function getDealerGroup(d) {
        if (d.hasPersonalPlan) return 'vip';
        const sectorName = d.region_sector || '';
        const secLower = sectorName.toLowerCase().trim();

        if (d.responsible === 'regional_astana') {
            const group = groupsConfig.find(g => g.type === 'astana' && g.sectorName === sectorName);
            if (group) return group.key;
            const fuzzy = groupsConfig.find(g => g.type === 'astana' && g.title.toLowerCase().includes(secLower));
            if (fuzzy && secLower) return fuzzy.key;
            return 'regional_astana'; 
        }
        
        if (d.responsible === 'regional_regions') {
            const group = groupsConfig.find(g => g.type === 'region' && g.sectorName === sectorName);
            if (group) return group.key;
            const fuzzy = groupsConfig.find(g => g.type === 'region' && g.title.toLowerCase().includes(secLower));
            if (fuzzy && secLower) return fuzzy.key;
            return 'regional_regions';
        }
        return 'other';
    }

    function fmt(num) {
        if (typeof num !== 'number' || isNaN(num)) return 0;
        return Math.round(num * 100) / 100;
    }

    function calculateKPI(plan, fact, daysInMonth, currentDay) {
        plan = parseFloat(plan) || 0;
        fact = parseFloat(fact) || 0;
        let forecast = 0;
        if (currentDay > 0) { forecast = (fact / currentDay) * daysInMonth; }
        const percent = plan > 0 ? (fact / plan) * 100 : (fact > 0 ? 100 : 0);
        const diff = fact - plan; 
        return { diff, forecast, percent };
    }

    function captureState() {
        document.querySelectorAll('.sales-input.inp-fact').forEach(inp => {
            const row = inp.closest('.sales-row');
            const dealerId = row.dataset.id === "null" ? null : row.dataset.id;
            const dealerName = row.dataset.name;
            const isCustom = row.dataset.custom === 'true';
            const group = row.closest('.region-card').dataset.group;
            const val = parseFloat(inp.value.replace(',', '.')) || 0;

            let record = currentSales.find(s => (isCustom && s.isCustom && s.dealerName === dealerName) || (!isCustom && !s.isCustom && s.dealerId === dealerId));
            if (record) { record.fact = val; } 
            else if (val !== 0) { currentSales.push({ month: monthPicker.value, group, dealerId, dealerName, isCustom, plan: 0, fact: val }); }
        });
        
        document.querySelectorAll('.plan-input').forEach(inp => {
            const planKey = inp.dataset.planKey;
            const val = parseFloat(inp.value.replace(',', '.')) || 0;
            let record = currentSales.find(s => s.dealerId === `PLAN_${planKey}`);
            if (record) { record.plan = val; } 
            else if (val !== 0) {
                currentSales.push({ month: monthPicker.value, group: 'PLAN', dealerId: `PLAN_${planKey}`, dealerName: `Plan ${planKey}`, isCustom: false, plan: val, fact: 0 });
            }
        });
    }

    function renderAll() {
        const date = new Date(monthPicker.value);
        const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
        const today = new Date();
        let currentDay = daysInMonth; 
        if (today.getFullYear() === date.getFullYear() && today.getMonth() === date.getMonth()) { currentDay = today.getDate(); }

        container.innerHTML = '';
        summaryList.innerHTML = '';
        if(dashboardTop) dashboardTop.innerHTML = '';

        const facts = {};
        groupsConfig.forEach(g => facts[g.key] = 0);
        facts.vip = []; 

        groupsConfig.forEach(grp => {
            const groupDealers = allDealers.filter(d => {
                const isReal = d.status !== 'potential' && d.status !== 'archive';
                const matchGroup = getDealerGroup(d) === grp.key;
                return isReal && matchGroup;
            });
            
            const customSales = currentSales.filter(s => s.isCustom && s.group === grp.key);

            if (groupDealers.length === 0 && customSales.length === 0 && grp.key !== 'other') return;

            let rowsHtml = '';
            const items = [
                ...groupDealers.map(d => ({ id: d.id, name: d.name, isCustom: false })),
                ...customSales.map(s => ({ id: null, name: s.dealerName, isCustom: true }))
            ];
            items.sort((a,b) => a.name.localeCompare(b.name));

            items.forEach(item => {
                const sale = currentSales.find(s => (item.isCustom && s.isCustom && s.dealerName === item.name) || (!item.isCustom && !s.isCustom && s.dealerId === item.id)) || {};
                const fact = parseFloat(sale.fact) || 0;
                
                if (grp.key === 'vip') {
                    facts.vip.push({ id: item.id || item.name, name: item.name, fact: fact });
                } else {
                    facts[grp.key] = (facts[grp.key] || 0) + fact;
                }

                rowsHtml += `
                    <div class="sales-row" data-id="${item.id || ''}" data-name="${item.name}" data-custom="${item.isCustom}">
                        <div class="sales-dealer-name text-truncate">
                            <span class="${grp.key === 'vip' ? 'fw-bold text-primary' : ''}">${item.name}</span>
                        </div>
                        <div class="d-flex align-items-center gap-2">
                            <div class="sales-input-group">
                                <input type="number" step="0.01" class="form-control form-control-sm sales-input inp-fact" value="${fact!==0?fact:''}" placeholder="0">
                            </div>
                            ${item.isCustom ? `<button class="btn btn-sm text-danger btn-del-row p-0"><i class="bi bi-x-circle"></i></button>` : ''}
                        </div>
                    </div>`;
            });
            
            const isPlanVisible = planVisibility[grp.key] !== false; 
            const eyeIcon = isPlanVisible ? '<i class="bi bi-bullseye"></i>' : '<i class="bi bi-circle"></i>';
            const eyeTitle = isPlanVisible ? 'Скрыть план' : 'Включить план';
            const eyeClass = isPlanVisible ? 'text-success' : 'text-muted';

            container.innerHTML += `
                <div class="region-card" data-group="${grp.key}">
                    <div class="region-header">
                        <div class="d-flex align-items-center gap-2">
                            <span class="region-title">${grp.title}</span>
                            <button class="btn btn-sm border-0 ${eyeClass} py-0" onclick="toggleGroupPlan('${grp.key}')" title="${eyeTitle}" style="font-size: 1.1rem;">
                                ${eyeIcon}
                            </button>
                        </div>
                        <button class="btn btn-sm btn-light border-0 text-primary py-0 btn-add-custom" data-group="${grp.key}">+ Добавить</button>
                    </div>
                    <div class="region-body">${rowsHtml || '<div class="text-center text-muted small py-3">Нет записей</div>'}</div>
                </div>`;
        });

        // --- СВОДКА ---
        const plans = {};
        const allPlanKeys = ['total_all', 'astana_all', 'regions_all']; 
        groupsConfig.forEach(g => allPlanKeys.push(g.key));
        facts.vip.forEach(v => allPlanKeys.push(`vip_${v.id}`));

        allPlanKeys.forEach(k => {
            const p = currentSales.find(s => s.dealerId === `PLAN_${k}`) || {};
            plans[k] = parseFloat(p.plan) || 0;
        });

        let totalRegionsFact = 0;
        let totalAstanaFact = 0;
        let totalOtherFact = facts.other || 0;

        groupsConfig.forEach(g => {
            if (g.type === 'region') totalRegionsFact += (facts[g.key] || 0);
            if (g.type === 'astana') totalAstanaFact += (facts[g.key] || 0);
        });

        let totalVipFact = 0; facts.vip.forEach(v => totalVipFact += v.fact);
        const totalFactAll = totalRegionsFact + totalAstanaFact + totalVipFact + totalOtherFact;
        
        renderTopDashboard(facts, plans, totalRegionsFact, totalAstanaFact);

        const renderSumItem = (title, planKey, factVal, isSubItem = false, forcePlan = false) => {
            const isVisible = forcePlan || (planVisibility[planKey] !== false);

            let innerContent = '';
            if (isVisible) {
                const plan = plans[planKey] || 0;
                const { percent, forecast, diff } = calculateKPI(plan, factVal, daysInMonth, currentDay);
                let colorClass = 'text-warning'; let bgClass = 'bg-warning';
                if (percent >= 90) { colorClass = 'text-success'; bgClass = 'bg-success'; }
                if (percent < 70) { colorClass = 'text-danger'; bgClass = 'bg-danger'; }
                let diffHtml = '';
                if (plan > 0) {
                    if (diff < 0) diffHtml = `<span class="text-danger fw-bold" title="Не хватает">Ещё: ${fmt(Math.abs(diff))}</span>`;
                    else diffHtml = `<span class="text-success fw-bold" title="Сверх"> +${fmt(diff)}</span>`;
                }
                const width = Math.min(percent, 100);
                const planVal = plan !== 0 ? plan : '';

                innerContent = `
                    <div class="summary-header">
                        <span class="summary-title">
                            ${title}
                            <input type="number" class="plan-input" data-plan-key="${planKey}" value="${planVal}" placeholder="План">
                        </span>
                        <span class="summary-percent ${colorClass} fw-bold">${fmt(percent)}%</span>
                    </div>
                    <div class="progress mb-2" style="height: 6px;">
                        <div class="progress-bar ${bgClass}" style="width: ${width}%"></div>
                    </div>
                    <div class="d-flex justify-content-between align-items-center small mt-1">
                        <span class="text-dark">Факт: <strong>${fmt(factVal)}</strong></span>
                        ${diffHtml}
                    </div>
                    <div class="text-end small text-muted mt-1" style="font-size: 0.7rem;">Прогноз: <strong>${fmt(forecast)}</strong></div>
                `;
            } else {
                innerContent = `
                    <div class="summary-header mb-1">
                        <span class="summary-title text-dark">${title}</span>
                    </div>
                    <div class="d-flex justify-content-between align-items-center small">
                        <span class="text-muted fst-italic" style="font-size: 0.75rem;">Без плана</span>
                        <span class="text-dark fs-6">Факт: <strong>${fmt(factVal)}</strong></span>
                    </div>
                `;
            }

            return `<div class="summary-item ${isSubItem ? 'ps-4 bg-light bg-opacity-25' : ''}">${innerContent}</div>`;
        };

        let summaryHtml = '';
        summaryHtml += `<div class="p-3 bg-primary-subtle border-bottom"><h6 class="fw-bold mb-3 text-primary text-uppercase small ls-1">Общий результат</h6>${renderSumItem("ВСЕГО ПО КОМПАНИИ", "total_all", totalFactAll, false, true)}</div>`;
        
        summaryHtml += `<div class="mt-2 mb-1 px-3 pt-2 border-top"><span class="small fw-bold text-muted text-uppercase">Астана</span></div>`;
        summaryHtml += renderSumItem("Астана (Итого)", "astana_all", totalAstanaFact, false, true);
        groupsConfig.forEach(g => { if (g.type === 'astana') summaryHtml += renderSumItem(g.title.replace('Астана - ', ''), g.key, facts[g.key], true); });

        if (facts.vip.length > 0) {
            summaryHtml += `<div class="mt-2 mb-1 px-3 pt-2 border-top"><span class="small fw-bold text-muted text-uppercase">VIP Клиенты</span></div>`;
            facts.vip.forEach(v => summaryHtml += renderSumItem(v.name, `vip_${v.id}`, v.fact, false, true));
        }

        summaryHtml += `<div class="mt-2 mb-1 px-3 pt-2 border-top"><span class="small fw-bold text-muted text-uppercase">Регионы</span></div>`;
        summaryHtml += renderSumItem("Регионы (Итого)", "regions_all", totalRegionsFact, false, true);
        groupsConfig.forEach(g => { if (g.type === 'region') summaryHtml += renderSumItem(g.title.replace('Регион ', ''), g.key, facts[g.key], true); });
        
        if (facts.other && facts.other !== 0) {
            summaryHtml += `<div class="summary-item"><div class="summary-header"><span class="summary-title text-danger">⚠️ Без категории</span></div><div class="summary-meta"><span>Факт: <strong>${fmt(facts.other)}</strong></span></div></div>`;
        }

        summaryList.innerHTML = summaryHtml;
        setupEventListeners();
    }

    function renderTopDashboard(facts, plans, totalRegionsFact, totalAstanaFact) {
        if (!dashboardTop) return;
        const createCard = (title, fact, plan, iconClass='bi-graph-up', color='primary') => {
            const { percent } = calculateKPI(plan, fact, 1, 1);
            let badgeColor = 'bg-danger'; if (percent >= 100) badgeColor = 'bg-success'; else if (percent >= 80) badgeColor = 'bg-warning text-dark';
            return `<div class="col-md-3 col-sm-6 col-6"><div class="card dash-card h-100 rounded-4"><div class="card-body p-2 p-md-3"><div class="d-flex justify-content-between align-items-start mb-2"><span class="dash-label text-truncate" style="max-width: 80%">${title}</span><div class="icon-circle bg-${color}-subtle text-${color} small d-none d-md-flex"><i class="bi ${iconClass}"></i></div></div><div class="d-flex align-items-baseline gap-2 mb-1 flex-wrap"><span class="dash-value fs-5 fs-md-4">${fmt(fact)}</span><span class="badge ${badgeColor} rounded-pill" style="font-size: 0.65rem">${fmt(percent)}%</span></div><div class="progress" style="height: 4px;"><div class="progress-bar ${badgeColor}" style="width: ${Math.min(percent, 100)}%"></div></div><div class="small text-muted mt-2 d-none d-md-block">План: ${fmt(plan)}</div></div></div></div>`;
        };
        let html = '';
        html += createCard('Астана', totalAstanaFact, plans.astana_all, 'bi-building', 'primary');
        html += createCard('Регионы', totalRegionsFact, plans.regions_all, 'bi-globe', 'info');
        facts.vip.slice(0, 2).forEach(v => { const plan = plans[`vip_${v.id}`] || 0; html += createCard(v.name, v.fact, plan, 'bi-star', 'warning'); });
        dashboardTop.innerHTML = html;
    }

    function setupEventListeners() {
        document.querySelectorAll('.btn-add-custom').forEach(btn => {
            btn.onclick = () => {
                captureState();
                const name = prompt("Название (Имя дилера или пометка):");
                if (name) {
                    currentSales.push({ month: monthPicker.value, group: btn.dataset.group, dealerName: name, isCustom: true, plan: 0, fact: 0 });
                    renderAll();
                }
            };
        });
        document.querySelectorAll('.btn-del-row').forEach(btn => {
            btn.onclick = (e) => {
                if(confirm('Удалить эту запись?')) {
                    captureState();
                    const row = e.target.closest('.sales-row');
                    const name = row.dataset.name;
                    currentSales = currentSales.filter(s => !(s.isCustom && s.dealerName === name));
                    renderAll();
                }
            };
        });
    }

    if (printBtn) { printBtn.onclick = () => { if(summaryCol) summaryCol.setAttribute('data-print-date', new Date().toLocaleDateString()); window.print(); }; }

    if (saveBtn) {
        saveBtn.onclick = async () => {
            captureState();
            try {
                saveBtn.disabled = true; saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
                const res = await fetch(API_SALES, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ month: monthPicker.value, data: currentSales }) });
                if (res.ok) { 
                    if (window.showToast) { window.showToast('Сохранено!'); } else { alert('Сохранено!'); }
                    saveBtn.className = 'btn btn-success shadow-sm px-4 rounded-pill'; saveBtn.innerHTML = '<i class="bi bi-check-lg"></i> OK'; 
                    setTimeout(() => { saveBtn.innerHTML = '<i class="bi bi-save me-2"></i>Сохранить'; saveBtn.className='btn btn-success shadow-sm px-4 rounded-pill'; saveBtn.disabled = false; }, 2000);
                    loadData(); 
                } else throw new Error('Ошибка при сохранении');
            } catch (e) { alert(e.message); saveBtn.disabled = false; saveBtn.innerHTML = '<i class="bi bi-save me-2"></i>Сохранить'; } 
        };
    }

    monthPicker.addEventListener('change', loadData);
    init();
});
