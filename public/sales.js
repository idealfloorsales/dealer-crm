document.addEventListener('DOMContentLoaded', () => {
    
    const API_DEALERS = '/api/dealers';
    const API_SALES = '/api/sales';
    const API_SECTORS = '/api/sectors';
    const API_MANAGERS = '/api/managers';
    
    // Элементы
    const monthPicker = document.getElementById('month-picker');
    const container = document.getElementById('sales-container');
    const summaryList = document.getElementById('summary-list');
    const saveBtn = document.getElementById('save-btn');
    const printBtn = document.getElementById('print-btn');
    const summaryCol = document.getElementById('summary-col');
    const lastUpdateInfo = document.getElementById('last-update-info');
    const searchInput = document.getElementById('sales-search');
    const areaFilter = document.getElementById('sales-area-filter');
    const collapseBtn = document.getElementById('collapse-groups-btn');
    const monthPrevBtn = document.getElementById('month-prev');
    const monthNextBtn = document.getElementById('month-next');
    const monthCurrentBtn = document.getElementById('month-current');
    const noResults = document.getElementById('sales-no-results');
    const customModalEl = document.getElementById('sales-custom-modal');
    const customNameInput = document.getElementById('custom-sale-name');
    const customGroupLabel = document.getElementById('custom-sale-group-label');
    const customSaveBtn = document.getElementById('custom-sale-save');
    const performanceCards = document.getElementById('sales-performance-cards');
    const printReport = document.getElementById('sales-print-report');
    const printPeriod = document.getElementById('print-period');
    const printGenerated = document.getElementById('print-generated');
    const printOverview = document.getElementById('print-overview');
    const printSalesBody = document.getElementById('print-sales-body');
    const customModal = customModalEl ? new bootstrap.Modal(customModalEl) : null;
    
    // Табы
    const tabInputBtn = document.getElementById('tab-input-btn');
    const tabSummaryBtn = document.getElementById('tab-summary-btn');
    const colInput = document.getElementById('sales-container-col');
    const colSummary = document.getElementById('summary-col');

    const now = new Date();
    monthPicker.value = now.toISOString().slice(0, 7);

    // КОНФИГУРАЦИЯ ГРУПП
    let groupsConfig = [
        { key: 'vip', title: 'Индивидуальные планы', isSystem: true, type: 'vip' }
    ];

    let allDealers = [];
    let currentSales = [];
    let allSectors = [];
    let managerUsers = [];
    let canEditFact = false;
    let canEditPlan = false;
    let isDirty = false;
    let loadedMonth = '';
    let pendingCustomGroup = '';
    let groupsCollapsed = false;
    let currentScope = 'all';
    let autoSaveTimer = null;
    let autoSaveInFlight = false;
    let autoSaveQueued = false;
    let autoSaveRevision = 0;
    
    // Загрузка настроек видимости планов
    let planVisibility = JSON.parse(localStorage.getItem('sales_plan_config')) || {};

    async function init() {
        try {
            if (window.CRMAuth && CRMAuth.ready) await CRMAuth.ready;
            canEditFact = window.CRMAuth ? CRMAuth.can('can_edit_sales_fact') : false;
            canEditPlan = window.CRMAuth ? CRMAuth.can('can_edit_sales_plan') : false;
            const authUser = window.CRMAuth?.user;
            currentScope = (authUser?.role === 'marketing' || authUser?.permissions?.is_admin)
                ? 'all'
                : (authUser?.scope || 'all');

            if (areaFilter && currentScope !== 'all') {
                areaFilter.querySelectorAll('option').forEach(option => {
                    if (currentScope === 'astana' && option.value === 'regions') option.remove();
                    if (currentScope === 'regions' && option.value === 'astana') option.remove();
                });
            }

            if (saveBtn && !canEditFact && !canEditPlan) {
                setSaveButtonState('readonly');
            } else {
                setSaveButtonState('saved');
            }
        } catch (e) { console.error(e); }

        await Promise.all([loadSectors(), loadManagers()]);
        loadData();
        setupMobileTabs();
    }

    async function loadManagers() {
        try {
            const res = await fetch(API_MANAGERS);
            if (res.ok) managerUsers = await res.json();
        } catch (e) {
            console.warn('Не удалось загрузить менеджеров', e);
        }
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
                        groupsConfig.push({ key: key, title: `Астана — ${s.name}`, sectorName: s.name, type: 'astana' });
                    }
                });
                if (!groupsConfig.find(g => g.key === 'regional_astana')) {
                    groupsConfig.push({ key: 'regional_astana', title: 'Астана — без сектора', isSystem: true, type: 'astana' });
                }

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
        const showInput = () => {
            tabInputBtn.classList.add('active');
            tabSummaryBtn.classList.remove('active');
            colInput.classList.remove('mobile-hidden');
            colSummary.classList.add('mobile-hidden');
        };
        const showSummary = () => {
            tabSummaryBtn.classList.add('active');
            tabInputBtn.classList.remove('active');
            colSummary.classList.remove('mobile-hidden');
            colInput.classList.add('mobile-hidden');
        };
        tabInputBtn.onclick = showInput;
        tabSummaryBtn.onclick = showSummary;
    }

    function setSaveButtonState(state) {
        if (!saveBtn) return;

        if (!canEditFact && !canEditPlan) {
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<i class="bi bi-lock"></i><span>Только чтение</span>';
            return;
        }

        saveBtn.disabled = state === 'saving';

        if (state === 'saving') {
            saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span><span>Сохраняем…</span>';
        } else if (state === 'dirty') {
            saveBtn.innerHTML = '<i class="bi bi-cloud-arrow-up"></i><span>Есть изменения</span>';
        } else if (state === 'error') {
            saveBtn.innerHTML = '<i class="bi bi-exclamation-triangle"></i><span>Сохранить снова</span>';
        } else {
            saveBtn.innerHTML = '<i class="bi bi-cloud-check"></i><span>Сохранено</span>';
        }
    }

    function setAutoSaveInfo(state) {
        if (!lastUpdateInfo) return;
        lastUpdateInfo.classList.toggle('is-dirty', state === 'dirty' || state === 'error');

        if (state === 'saving') {
            lastUpdateInfo.innerHTML = '<i class="bi bi-arrow-repeat me-1"></i>Автосохранение…';
        } else if (state === 'dirty') {
            lastUpdateInfo.innerHTML = '<i class="bi bi-circle-fill"></i> Изменения сохранятся автоматически';
        } else if (state === 'error') {
            lastUpdateInfo.innerHTML = '<i class="bi bi-exclamation-triangle me-1"></i>Не удалось сохранить. Повторим автоматически';
        } else {
            const time = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
            lastUpdateInfo.innerHTML = '<i class="bi bi-cloud-check me-1"></i>Сохранено автоматически · ' + time;
        }
    }

    function cancelScheduledAutoSave() {
        if (autoSaveTimer) clearTimeout(autoSaveTimer);
        autoSaveTimer = null;
    }

    function scheduleAutoSave(delay = 900) {
        if (!canEditFact && !canEditPlan) return;
        cancelScheduledAutoSave();
        autoSaveTimer = setTimeout(() => {
            autoSaveTimer = null;
            persistSales(false);
        }, delay);
    }

    function markDirty() {
        if (!canEditFact && !canEditPlan) return;
        isDirty = true;
        autoSaveRevision += 1;
        setSaveButtonState('dirty');
        setAutoSaveInfo('dirty');
        scheduleAutoSave();
    }

    function clearDirty() {
        isDirty = false;
        if (lastUpdateInfo) lastUpdateInfo.classList.remove('is-dirty');
    }

    function canLeaveCurrentMonth() {
        return !isDirty || confirm('Есть несохранённые изменения. Перейти к другому месяцу без сохранения?');
    }

    function shiftMonth(delta) {
        if (!canLeaveCurrentMonth()) return;
        const [year, month] = monthPicker.value.split('-').map(Number);
        const d = new Date(year, month - 1 + delta, 1);
        monthPicker.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        cancelScheduledAutoSave();
        isDirty = false;
        loadData();
    }

    function goToCurrentMonth() {
        if (!canLeaveCurrentMonth()) return;
        monthPicker.value = new Date().toISOString().slice(0, 7);
        cancelScheduledAutoSave();
        isDirty = false;
        loadData();
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
            loadedMonth = monthPicker.value;
            clearDirty();
            renderAll();
            updateLastModifiedText();
        } catch (e) { 
            container.innerHTML = `<div class="alert alert-danger">Ошибка: ${e.message}</div>`;
        }
    }

    function updateLastModifiedText() {
        if (!lastUpdateInfo) return;
        lastUpdateInfo.classList.remove('is-dirty');
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
            lastUpdateInfo.innerHTML = '<i class="bi bi-cloud-check me-1"></i>Автосохранение включено';
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

    function getGroupArea(grp) {
        if (grp.key === 'vip') return 'vip';
        if (grp.key === 'other') return 'other';
        if (grp.type === 'astana') return 'astana';
        if (grp.type === 'region') return 'regions';
        return 'other';
    }

    function applyViewFilters() {
        const query = (searchInput?.value || '').trim().toLowerCase();
        const area = areaFilter?.value || 'all';
        let visibleCards = 0;

        document.querySelectorAll('#sales-container .region-card').forEach(card => {
            const areaMatch = area === 'all' || card.dataset.area === area;
            let visibleRows = 0;

            card.querySelectorAll('.sales-row').forEach(row => {
                const name = (row.dataset.search || '').toLowerCase();
                const show = areaMatch && (!query || name.includes(query));
                row.classList.toggle('d-none', !show);
                if (show) visibleRows++;
            });

            const showCard = areaMatch && visibleRows > 0;
            card.classList.toggle('d-none', !showCard);
            if (showCard) visibleCards++;
        });

        if (noResults) noResults.classList.toggle('d-none', visibleCards > 0);
    }

    function setGroupsCollapsed(collapsed) {
        groupsCollapsed = collapsed;
        document.querySelectorAll('#sales-container .region-card').forEach(card => {
            card.classList.toggle('is-collapsed', collapsed);
        });
        if (collapseBtn) {
            collapseBtn.innerHTML = collapsed
                ? '<i class="bi bi-arrows-expand"></i> Развернуть группы'
                : '<i class="bi bi-arrows-collapse"></i> Свернуть группы';
        }
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function escapeAttr(value) {
        return escapeHtml(value);
    }

    function fmt(num) {
        if (typeof num !== 'number' || isNaN(num)) return 0;
        return Math.round(num * 100) / 100;
    }

    function calculateProgress(plan, fact, daysInMonth, currentDay) {
        plan = parseFloat(plan) || 0;
        fact = parseFloat(fact) || 0;
        let forecast = 0;
        if (currentDay > 0) { forecast = (fact / currentDay) * daysInMonth; }
        const percent = plan > 0 ? (fact / plan) * 100 : (fact > 0 ? 100 : 0);
        const diff = fact - plan; 
        return { diff, forecast, percent };
    }

    function captureState() {
        if (canEditFact) document.querySelectorAll('.sales-input.inp-fact').forEach(inp => {
            const row = inp.closest('.sales-row');
            const dealerId = row.dataset.id === "null" ? null : row.dataset.id;
            const dealerName = row.dataset.name;
            const isCustom = row.dataset.custom === 'true';
            const group = row.closest('.region-card').dataset.group;
            const val = parseFloat(inp.value.replace(',', '.')) || 0;

            let record = currentSales.find(s => (isCustom && s.isCustom && s.group === group && s.dealerName === dealerName) || (!isCustom && !s.isCustom && s.dealerId === dealerId));
            if (record) { record.fact = val; } 
            else if (val !== 0) { currentSales.push({ month: monthPicker.value, group, dealerId, dealerName, isCustom, plan: 0, fact: val }); }
        });
        
        if (canEditPlan) document.querySelectorAll('.plan-input').forEach(inp => {
            const planKey = inp.dataset.planKey;
            const val = parseFloat(inp.value.replace(',', '.')) || 0;
            let record = currentSales.find(s => s.dealerId === `PLAN_${planKey}`);
            if (record) { record.plan = val; } 
            else if (val !== 0) {
                currentSales.push({ month: monthPicker.value, group: 'PLAN', dealerId: `PLAN_${planKey}`, dealerName: `Plan ${planKey}`, isCustom: false, plan: val, fact: 0 });
            }
        });
    }

    async function persistSales(manual = false) {
        if (!canEditFact && !canEditPlan) return true;

        cancelScheduledAutoSave();

        if (autoSaveInFlight) {
            autoSaveQueued = true;
            return false;
        }

        if (!isDirty && !manual) return true;
        if (!isDirty && manual) {
            setSaveButtonState('saved');
            setAutoSaveInfo('saved');
            return true;
        }

        captureState();

        const revisionAtStart = autoSaveRevision;
        const monthAtStart = monthPicker.value;
        const payload = JSON.parse(JSON.stringify(currentSales));

        autoSaveInFlight = true;
        autoSaveQueued = false;
        setSaveButtonState('saving');
        setAutoSaveInfo('saving');

        try {
            const res = await fetch(API_SALES, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ month: monthAtStart, data: payload })
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || 'Ошибка при сохранении');
            }

            const noNewChanges = revisionAtStart === autoSaveRevision && monthAtStart === monthPicker.value;
            if (noNewChanges) {
                clearDirty();
                setSaveButtonState('saved');
                setAutoSaveInfo('saved');
            } else {
                setSaveButtonState('dirty');
                setAutoSaveInfo('dirty');
                autoSaveQueued = true;
            }

            return true;
        } catch (e) {
            console.error('Sales autosave error', e);
            isDirty = true;
            setSaveButtonState('error');
            setAutoSaveInfo('error');

            if (manual) {
                if (window.showToast) window.showToast(e.message || 'Не удалось сохранить продажи', 'error');
                else alert(e.message || 'Не удалось сохранить продажи');
            } else {
                scheduleAutoSave(5000);
            }

            return false;
        } finally {
            autoSaveInFlight = false;

            if (autoSaveQueued || isDirty && revisionAtStart !== autoSaveRevision) {
                autoSaveQueued = false;
                scheduleAutoSave(250);
            }
        }
    }

    function getProgressLevel(percent, hasPlan = true) {
        if (!hasPlan) return 'none';
        if (percent >= 90) return 'good';
        if (percent >= 70) return 'mid';
        return 'low';
    }

    function buildPerformanceCard(title, fact, plan, meta = '') {
        const hasPlan = Number(plan) > 0;
        const percent = hasPlan ? (Number(fact) / Number(plan)) * 100 : 0;
        const level = getProgressLevel(percent, hasPlan);
        const shownPercent = hasPlan ? Math.round(percent) + '%' : 'Без плана';
        const width = hasPlan ? Math.min(percent, 100) : 0;

        return `<article class="sales-performance-card is-${level}">
            <div class="sales-performance-card-top">
                <div class="sales-performance-card-title">${escapeHtml(title)}</div>
                <div class="sales-performance-card-percent">${shownPercent}</div>
            </div>
            <div class="sales-performance-card-values">
                <div><span>Факт</span><strong>${fmt(Number(fact) || 0)} м²</strong></div>
                <div><span>План</span><strong>${hasPlan ? fmt(Number(plan)) + ' м²' : '—'}</strong></div>
            </div>
            <div class="sales-performance-bar"><span style="width:${width}%"></span></div>
            ${meta ? `<div class="sales-performance-card-meta">${escapeHtml(meta)}</div>` : ''}
        </article>`;
    }

    function renderPerformanceCards(facts, plans, totalRegionsFact, totalAstanaFact, totalVipFact, totalOtherFact) {
        if (!performanceCards) return;

        const cards = [];
        const totalFactAll = totalRegionsFact + totalAstanaFact + totalVipFact + totalOtherFact;
        const authUser = window.CRMAuth?.user;
        const personalManagerView = Boolean(authUser && authUser.role === 'manager' && !authUser.permissions?.is_admin);

        if (personalManagerView) {
            cards.push({
                title: authUser.fullName || authUser.username || 'Мой план',
                fact: totalFactAll,
                plan: plans[`manager_${authUser.id}`] || 0,
                meta: 'Личный результат'
            });
        } else if (currentScope === 'all') {
            cards.push({ title: 'Вся компания', fact: totalFactAll, plan: plans.total_all || 0, meta: 'Общий результат' });
            cards.push({ title: 'Астана', fact: totalAstanaFact, plan: plans.astana_all || 0, meta: 'Итого по Астане' });
            cards.push({ title: 'Регионы', fact: totalRegionsFact, plan: plans.regions_all || 0, meta: 'Итого по регионам' });
        } else if (currentScope === 'astana') {
            cards.push({ title: 'Астана', fact: totalAstanaFact, plan: plans.astana_all || 0, meta: 'Моя зона' });
        } else if (currentScope === 'regions') {
            cards.push({ title: 'Регионы', fact: totalRegionsFact, plan: plans.regions_all || 0, meta: 'Моя зона' });
        }

        facts.vip
            .slice()
            .sort((a,b) => {
                const pa = Number(plans[`vip_${a.id}`]) || 0;
                const pb = Number(plans[`vip_${b.id}`]) || 0;
                const aa = pa > 0 ? a.fact / pa : 0;
                const ab = pb > 0 ? b.fact / pb : 0;
                return ab - aa;
            })
            .forEach(v => {
                cards.push({
                    title: v.name,
                    fact: v.fact,
                    plan: plans[`vip_${v.id}`] || 0,
                    meta: 'Индивидуальный план'
                });
            });

        performanceCards.innerHTML = cards.length
            ? cards.map(card => buildPerformanceCard(card.title, card.fact, card.plan, card.meta)).join('')
            : '<div class="cc-empty">Нет данных для отображения</div>';
    }

    function renderPrintReport(facts, plans, totalRegionsFact, totalAstanaFact, totalVipFact, totalOtherFact, daysInMonth, currentDay) {
        if (!printSalesBody || !printOverview) return;

        const selected = new Date(monthPicker.value + '-01T00:00:00');
        const monthTitle = selected.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
        if (printPeriod) printPeriod.textContent = monthTitle.charAt(0).toUpperCase() + monthTitle.slice(1);
        if (printGenerated) printGenerated.textContent = new Date().toLocaleString('ru-RU', {
            day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'
        });

        const totalFactAll = totalRegionsFact + totalAstanaFact + totalVipFact + totalOtherFact;
        const authUser = window.CRMAuth?.user;
        const personalManagerView = Boolean(authUser && authUser.role === 'manager' && !authUser.permissions?.is_admin);
        const managerPlanKey = personalManagerView ? `manager_${authUser.id}` : '';

        const levelFor = (fact, plan) => {
            if (!(Number(plan) > 0)) return 'none';
            const pct = Number(fact) / Number(plan) * 100;
            if (pct >= 90) return 'good';
            if (pct >= 70) return 'mid';
            return 'low';
        };

        const overview = [];
        if (personalManagerView) {
            overview.push([
                authUser.fullName || authUser.username || 'Мой план',
                totalFactAll,
                plans[managerPlanKey] || 0
            ]);
        } else if (currentScope === 'all') {
            overview.push(['Вся компания', totalFactAll, plans.total_all || 0]);
            overview.push(['Астана', totalAstanaFact, plans.astana_all || 0]);
            overview.push(['Регионы', totalRegionsFact, plans.regions_all || 0]);
        } else if (currentScope === 'astana') {
            overview.push(['Астана', totalAstanaFact, plans.astana_all || 0]);
        } else {
            overview.push(['Регионы', totalRegionsFact, plans.regions_all || 0]);
        }

        printOverview.innerHTML = overview.map(([title, fact, plan]) => {
            const hasPlan = Number(plan) > 0;
            const pct = hasPlan ? Math.round(Number(fact) / Number(plan) * 100) : null;
            const level = levelFor(fact, plan);
            const width = pct === null ? 0 : Math.min(pct, 100);
            return `<article class="sales-print-overview-card is-${level}">
                <div class="sales-print-overview-top">
                    <span>${escapeHtml(title)}</span>
                    <strong>${pct === null ? 'Без плана' : pct + '%'}</strong>
                </div>
                <div class="sales-print-overview-values">
                    <span>Факт <b>${fmt(fact)} м²</b></span>
                    <span>План <b>${hasPlan ? fmt(plan) + ' м²' : '—'}</b></span>
                </div>
                <div class="sales-print-overview-bar"><i style="width:${width}%"></i></div>
            </article>`;
        }).join('');

        const rows = [];
        const addRow = (section, title, fact, plan, isTotal = false) => {
            const hasPlan = Number(plan) > 0;
            const progress = calculateProgress(plan, fact, daysInMonth, currentDay);
            rows.push({
                section,
                title,
                fact: Number(fact) || 0,
                plan: Number(plan) || 0,
                percent: hasPlan ? progress.percent : null,
                forecast: progress.forecast,
                isTotal,
                level: hasPlan ? getProgressLevel(progress.percent, true) : 'none'
            });
        };

        if (personalManagerView) {
            addRow('Мой результат', authUser.fullName || authUser.username || 'Мой план', totalFactAll, plans[managerPlanKey] || 0, true);
        } else if (currentScope === 'all') {
            addRow('Компания', 'Вся компания', totalFactAll, plans.total_all || 0, true);
        }

        if (!personalManagerView && currentScope !== 'regions') {
            addRow('Астана', 'Астана — всего', totalAstanaFact, plans.astana_all || 0, true);
            groupsConfig.forEach(g => {
                if (g.type === 'astana' && ((facts[g.key] || 0) !== 0 || (plans[g.key] || 0) !== 0)) {
                    addRow('Астана', g.title.replace('Астана — ', ''), facts[g.key] || 0, plans[g.key] || 0);
                }
            });
        }

        facts.vip.forEach(v => {
            addRow('Индивидуальные планы', v.name, v.fact, plans[`vip_${v.id}`] || 0);
        });

        if (!personalManagerView && currentScope !== 'astana') {
            addRow('Регионы', 'Регионы — всего', totalRegionsFact, plans.regions_all || 0, true);
            groupsConfig.forEach(g => {
                if (g.type === 'region' && ((facts[g.key] || 0) !== 0 || (plans[g.key] || 0) !== 0)) {
                    addRow('Регионы', g.title.replace('Регион ', ''), facts[g.key] || 0, plans[g.key] || 0);
                }
            });
        }

        if (totalOtherFact > 0) {
            addRow('Без категории', 'Не распределено', totalOtherFact, 0);
        }

        const grouped = new Map();
        rows.forEach(row => {
            if (!grouped.has(row.section)) grouped.set(row.section, []);
            grouped.get(row.section).push(row);
        });

        printSalesBody.innerHTML = [...grouped.entries()].map(([section, sectionRows]) => {
            const items = sectionRows.map(row => {
                const pctText = row.percent === null ? 'Без плана' : Math.round(row.percent) + '%';
                const barWidth = row.percent === null ? 0 : Math.min(row.percent, 100);
                const planText = row.plan > 0 ? fmt(row.plan) + ' м²' : '—';

                return `<article class="sales-print-item is-${row.level} ${row.isTotal ? 'is-total' : ''}">
                    <div class="sales-print-item-head">
                        <div class="sales-print-item-title">${escapeHtml(row.title)}</div>
                        <div class="sales-print-item-percent">${pctText}</div>
                    </div>
                    <div class="sales-print-item-metrics">
                        <div><span>План</span><strong>${planText}</strong></div>
                        <div><span>Факт</span><strong>${fmt(row.fact)} м²</strong></div>
                        <div><span>Прогноз</span><strong>${fmt(row.forecast)} м²</strong></div>
                    </div>
                    <div class="sales-print-item-progress"><span style="width:${barWidth}%"></span></div>
                </article>`;
            }).join('');

            return `<section class="sales-print-section">
                <div class="sales-print-section-title">${escapeHtml(section)}</div>
                <div class="sales-print-section-items">${items}</div>
            </section>`;
        }).join('');
    }

    function renderAll() {
        const date = new Date(monthPicker.value);
        const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
        const today = new Date();
        let currentDay = daysInMonth; 
        if (today.getFullYear() === date.getFullYear() && today.getMonth() === date.getMonth()) { currentDay = today.getDate(); }

        container.innerHTML = '';
        summaryList.innerHTML = '';

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
            let groupFact = 0;
            const items = [
                ...groupDealers.map(d => ({ id: d.id, name: d.name, isCustom: false })),
                ...customSales.map(s => ({ id: null, name: s.dealerName, isCustom: true }))
            ];
            items.sort((a,b) => a.name.localeCompare(b.name));

            items.forEach(item => {
                const sale = currentSales.find(s => (item.isCustom && s.isCustom && s.group === grp.key && s.dealerName === item.name) || (!item.isCustom && !s.isCustom && s.dealerId === item.id)) || {};
                const fact = parseFloat(sale.fact) || 0;
                groupFact += fact;
                
                if (grp.key === 'vip') {
                    facts.vip.push({ id: item.id || item.name, name: item.name, fact });
                } else {
                    facts[grp.key] = (facts[grp.key] || 0) + fact;
                }

                rowsHtml += `
                    <div class="sales-row" data-id="${item.id || ''}" data-name="${escapeAttr(item.name)}" data-search="${escapeAttr(item.name)}" data-custom="${item.isCustom}">
                        <div class="sales-dealer-name">
                            <span>${escapeHtml(item.name)}</span>
                            ${item.isCustom ? '<small>Разовая запись</small>' : ''}
                        </div>
                        <div class="sales-row-actions">
                            <div class="sales-input-group">
                                <input type="number" step="0.01" min="0" inputmode="decimal" class="sales-input inp-fact" value="${fact!==0?fact:''}" placeholder="0" ${canEditFact ? '' : 'disabled'}>
                                <span>м²</span>
                            </div>
                            ${item.isCustom && canEditFact ? `<button class="sales-delete-row btn-del-row" type="button" title="Удалить"><i class="bi bi-x-lg"></i></button>` : ''}
                        </div>
                    </div>`;
            });
            
            const isPlanVisible = planVisibility[grp.key] !== false;
            const planControl = grp.key === 'vip'
                ? '<span class="sales-plan-state is-personal"><i class="bi bi-person-check"></i> Индивидуально</span>'
                : `<button class="sales-plan-state ${isPlanVisible ? 'is-on' : ''}" type="button" onclick="toggleGroupPlan('${grp.key}')">
                    <i class="bi bi-${isPlanVisible ? 'bullseye' : 'dash-circle'}"></i>
                    ${isPlanVisible ? 'План включён' : 'Без плана'}
                   </button>`;

            container.innerHTML += `
                <div class="region-card" data-group="${grp.key}" data-area="${getGroupArea(grp)}">
                    <div class="region-header">
                        <button class="sales-group-toggle" type="button" aria-label="Свернуть группу"><i class="bi bi-chevron-down"></i></button>
                        <div class="sales-group-title-wrap">
                            <span class="region-title">${grp.title}</span>
                            <span class="sales-group-meta">${items.length} дил. · ${fmt(groupFact)} м²</span>
                        </div>
                        <div class="sales-group-actions">
                            ${planControl}
                            ${canEditFact && grp.key !== 'vip' ? `<button class="sales-add-row btn-add-custom" type="button" data-group="${grp.key}" data-title="${escapeAttr(grp.title)}"><i class="bi bi-plus-lg"></i> Добавить</button>` : ''}
                        </div>
                    </div>
                    <div class="region-body">${rowsHtml || '<div class="cc-empty">Нет записей</div>'}</div>
                </div>`;
        });

        // --- СВОДКА ---
        const plans = {};
        const allPlanKeys = ['total_all', 'astana_all', 'regions_all'];
        groupsConfig.forEach(g => allPlanKeys.push(g.key));
        facts.vip.forEach(v => allPlanKeys.push(`vip_${v.id}`));
        managerUsers.forEach(manager => allPlanKeys.push(`manager_${manager.id}`));

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

        renderPerformanceCards(facts, plans, totalRegionsFact, totalAstanaFact, totalVipFact, totalOtherFact);
        renderPrintReport(facts, plans, totalRegionsFact, totalAstanaFact, totalVipFact, totalOtherFact, daysInMonth, currentDay);
        
        const renderSumItem = (title, planKey, factVal, isSubItem = false, forcePlan = false) => {
            const isVisible = forcePlan || (planVisibility[planKey] !== false);

            if (!isVisible) {
                return `<div class="summary-item ${isSubItem ? 'is-sub' : ''}">
                    <div class="summary-header">
                        <span class="summary-title">${title}</span>
                        <span class="sales-no-plan">Без плана</span>
                    </div>
                    <div class="summary-values single">
                        <div><span>Факт</span><strong>${fmt(factVal)} м²</strong></div>
                    </div>
                </div>`;
            }

            const plan = plans[planKey] || 0;
            const { percent, forecast, diff } = calculateProgress(plan, factVal, daysInMonth, currentDay);
            const level = percent >= 90 ? 'good' : percent >= 70 ? 'mid' : 'low';
            const planVal = plan !== 0 ? plan : '';
            const width = Math.min(percent, 100);
            const diffText = plan > 0
                ? (diff < 0 ? `Осталось ${fmt(Math.abs(diff))} м²` : `Сверх плана ${fmt(diff)} м²`)
                : 'План не заполнен';

            return `<div class="summary-item ${isSubItem ? 'is-sub' : ''}">
                <div class="summary-header">
                    <span class="summary-title">${title}</span>
                    <span class="summary-percent is-${level}">${plan > 0 ? fmt(percent) + '%' : '—'}</span>
                </div>
                <div class="summary-values">
                    <label>
                        <span>План, м²</span>
                        <input type="number" min="0" step="0.01" inputmode="decimal" class="plan-input" data-plan-key="${planKey}" value="${planVal}" placeholder="0" ${canEditPlan ? '' : 'disabled'}>
                    </label>
                    <div><span>Факт, м²</span><strong>${fmt(factVal)}</strong></div>
                    <div><span>Прогноз, м²</span><strong>${fmt(forecast)}</strong></div>
                </div>
                <div class="sales-summary-progress"><span class="is-${level}" style="width:${width}%"></span></div>
                <div class="summary-diff ${diff >= 0 && plan > 0 ? 'is-good' : ''}">${diffText}</div>
            </div>`;
        };

        const authUser = window.CRMAuth?.user;
        const personalManagerView = Boolean(authUser && authUser.role === 'manager' && !authUser.permissions?.is_admin);
        const rootPlanKey = personalManagerView
            ? `manager_${authUser.id}`
            : currentScope === 'astana'
                ? 'astana_all'
                : currentScope === 'regions'
                    ? 'regions_all'
                    : 'total_all';
        const rootTitle = personalManagerView
            ? (authUser.fullName || authUser.username || 'Мой план')
            : currentScope === 'astana'
                ? 'Астана'
                : currentScope === 'regions'
                    ? 'Регионы'
                    : 'Вся компания';
        const rootFact = personalManagerView
            ? totalFactAll
            : currentScope === 'astana'
                ? totalAstanaFact
                : currentScope === 'regions'
                    ? totalRegionsFact
                    : totalFactAll;

        const managerFactById = (managerId) => {
            const ownedIds = new Set(
                allDealers
                    .filter(dealer => String(dealer.responsibleUserId || '') === String(managerId))
                    .map(dealer => String(dealer.id))
            );
            return currentSales
                .filter(row => !row.isCustom && ownedIds.has(String(row.dealerId || '')))
                .reduce((sum, row) => sum + (Number(row.fact) || 0), 0);
        };

        let summaryHtml = '';
        summaryHtml += `<div class="sales-summary-group is-company"><div class="sales-summary-group-title">${personalManagerView ? 'Мой результат' : (currentScope === 'all' ? 'Компания' : 'Моя зона')}</div>${renderSumItem(rootTitle, rootPlanKey, rootFact, false, true)}</div>`;

        if (!personalManagerView && currentScope === 'all' && managerUsers.length) {
            summaryHtml += '<div class="sales-summary-group"><div class="sales-summary-group-title">Планы менеджеров</div>';
            managerUsers.forEach(manager => {
                const managerName = manager.fullName || manager.username || 'Менеджер';
                summaryHtml += renderSumItem(managerName, `manager_${manager.id}`, managerFactById(manager.id), true, true);
            });
            summaryHtml += '</div>';
        }

        if (currentScope !== 'regions') {
            summaryHtml += `<div class="sales-summary-group"><div class="sales-summary-group-title">Астана</div>`;
            summaryHtml += renderSumItem("Астана — всего", "astana_all", totalAstanaFact, false, true);
            groupsConfig.forEach(g => {
                if (g.type === 'astana' && ((facts[g.key] || 0) !== 0 || (plans[g.key] || 0) !== 0)) {
                    summaryHtml += renderSumItem(g.title.replace('Астана — ', ''), g.key, facts[g.key], true);
                }
            });
            summaryHtml += '</div>';
        }

        if (facts.vip.length > 0) {
            summaryHtml += '<div class="sales-summary-group"><div class="sales-summary-group-title">Индивидуальные планы</div>';
            facts.vip.forEach(v => summaryHtml += renderSumItem(v.name, `vip_${v.id}`, v.fact, false, true));
            summaryHtml += '</div>';
        }

        if (currentScope !== 'astana') {
            summaryHtml += '<div class="sales-summary-group"><div class="sales-summary-group-title">Регионы</div>';
            summaryHtml += renderSumItem("Регионы — всего", "regions_all", totalRegionsFact, false, true);
            groupsConfig.forEach(g => {
                if (g.type === 'region' && ((facts[g.key] || 0) !== 0 || (plans[g.key] || 0) !== 0)) {
                    summaryHtml += renderSumItem(g.title.replace('Регион ', ''), g.key, facts[g.key], true);
                }
            });
            summaryHtml += '</div>';
        }
        
        if (facts.other && facts.other !== 0) {
            summaryHtml += `<div class="sales-summary-group"><div class="sales-summary-group-title">Без категории</div>
                <div class="summary-item"><div class="summary-header"><span class="summary-title">Не распределено</span></div>
                <div class="summary-values single"><div><span>Факт</span><strong>${fmt(facts.other)} м²</strong></div></div></div></div>`;
        }

        summaryList.innerHTML = summaryHtml;
        setupEventListeners();
        applyViewFilters();
        if (groupsCollapsed) setGroupsCollapsed(true);
    }

    function setupEventListeners() {
        document.querySelectorAll('.btn-add-custom').forEach(btn => {
            btn.onclick = () => {
                captureState();
                pendingCustomGroup = btn.dataset.group;
                if (customGroupLabel) customGroupLabel.textContent = btn.dataset.title || '';
                if (customNameInput) customNameInput.value = '';
                customModal?.show();
                setTimeout(() => customNameInput?.focus(), 150);
            };
        });

        document.querySelectorAll('.btn-del-row').forEach(btn => {
            btn.onclick = (e) => {
                if(confirm('Удалить эту разовую запись?')) {
                    captureState();
                    const row = e.target.closest('.sales-row');
                    const name = row.dataset.name;
                    const group = row.closest('.region-card')?.dataset.group;
                    currentSales = currentSales.filter(s => !(s.isCustom && s.group === group && s.dealerName === name));
                    markDirty();
                    renderAll();
                    scheduleAutoSave(180);
                }
            };
        });

        document.querySelectorAll('.sales-group-toggle').forEach(btn => {
            btn.onclick = () => {
                const card = btn.closest('.region-card');
                card.classList.toggle('is-collapsed');
            };
        });
    }

    if (printBtn) {
        printBtn.onclick = () => {
            captureState();
            renderAll();
            if (printReport) printReport.setAttribute('aria-hidden', 'false');
            window.print();
            if (printReport) printReport.setAttribute('aria-hidden', 'true');
        };
    }

    if (customSaveBtn) {
        customSaveBtn.onclick = () => {
            const name = (customNameInput?.value || '').trim();
            if (!name || !pendingCustomGroup) return;
            currentSales.push({
                month: monthPicker.value,
                group: pendingCustomGroup,
                dealerName: name,
                isCustom: true,
                plan: 0,
                fact: 0
            });
            markDirty();
            customModal?.hide();
            renderAll();
            scheduleAutoSave(180);
        };
    }

    if (customNameInput) {
        customNameInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') customSaveBtn?.click();
        });
    }

    if (saveBtn) {
        saveBtn.onclick = () => persistSales(true);
    }

    monthPicker.addEventListener('change', () => {
        if (!canLeaveCurrentMonth()) {
            monthPicker.value = loadedMonth;
            return;
        }
        cancelScheduledAutoSave();
        isDirty = false;
        loadData();
    });

    monthPrevBtn?.addEventListener('click', () => shiftMonth(-1));
    monthNextBtn?.addEventListener('click', () => shiftMonth(1));
    monthCurrentBtn?.addEventListener('click', goToCurrentMonth);

    searchInput?.addEventListener('input', applyViewFilters);
    areaFilter?.addEventListener('change', applyViewFilters);
    collapseBtn?.addEventListener('click', () => setGroupsCollapsed(!groupsCollapsed));

    document.addEventListener('input', e => {
        if (e.target.matches('.sales-input, .plan-input')) markDirty();
    });

    document.addEventListener('change', e => {
        if (!e.target.matches('.sales-input, .plan-input')) return;
        captureState();
        renderAll();
        scheduleAutoSave(180);
    });

    document.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
            e.preventDefault();
            if (!saveBtn?.disabled) saveBtn?.click();
        }
    });

    window.addEventListener('beforeunload', e => {
        if (!isDirty) return;
        e.preventDefault();
        e.returnValue = '';
    });

    init();
});
