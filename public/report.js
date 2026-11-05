document.addEventListener('DOMContentLoaded', () => {
    const API_MATRIX_URL = '/api/matrix';
    const $ = id => document.getElementById(id);

    const matrixHeader = $('matrix-header');
    const matrixBody = $('matrix-body');
    const matrixFooter = $('matrix-footer');
    const matrixContainer = $('matrix-container');
    const loadingMsg = $('loading-msg');
    const exportBtn = $('export-csv-btn');
    const kpiHost = $('exhibition-kpis');
    const matrixMeta = $('matrix-current-meta');

    const matrixView = $('matrix-view');
    const fieldView = $('field-view');

    const filterCity = $('filter-city');
    const filterResponsible = $('filter-responsible');
    const resetFiltersBtn = $('report-reset-filters');

    const dealerBtn = $('dealer-dropdown-btn');
    const dealerMenu = $('dealer-menu');
    const dealerListContainer = $('dealer-list-container');
    const dealerSearch = $('dealer-search');
    const dealerSelectAll = $('dealer-select-all');
    const dealerClear = $('dealer-clear');

    const productBtn = $('product-dropdown-btn');
    const productMenu = $('product-menu');
    const productListContainer = $('product-list-container');
    const productSearch = $('product-search');
    const productSelectAll = $('product-select-all');
    const productClear = $('product-clear');

    const fieldDealerSearch = $('field-dealer-search');
    const fieldDealerList = $('field-dealer-list');
    const fieldDealerHead = $('field-dealer-head');
    const fieldProductSearch = $('field-product-search');
    const fieldProductList = $('field-product-list');

    let fullData = { headers: [], matrix: [] };
    let selectedDealerIds = new Set();
    let selectedProductSkus = new Set();
    let activeFieldDealerId = '';
    let fieldStatus = 'all';

    const storedView = localStorage.getItem('report_view');
    let reportView = storedView || (window.innerWidth <= 768 ? 'field' : 'matrix');

    const safeText = value => String(value ?? '')
        .replace(/&/g,'&amp;')
        .replace(/</g,'&lt;')
        .replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;')
        .replace(/'/g,'&#039;');

    const idOf = value => String(value?.id || value?._id || value || '');
    const n = value => Number(value) || 0;
    const fmt = value => n(value).toLocaleString('ru-RU');

    function cellState(cell) {
        if (!cell) return 'missing';
        if (cell.is_pos) return n(cell.value) > 0 ? 'pos-present' : 'pos-missing';
        const manual = n(cell.value) > 0;
        const workshop = n(cell.sample_qty) > 0;
        if (manual && workshop) return 'confirmed';
        if (manual) return 'manual';
        if (workshop) return 'workshop';
        return 'missing';
    }

    function stateLabel(state) {
        return ({
            confirmed:'Подтверждено',
            manual:'Только матрица',
            workshop:'Только Цех',
            missing:'Нет образца',
            'pos-present':'POS есть',
            'pos-missing':'POS нет'
        })[state] || state;
    }

    function getFilteredData() {
        const city = filterCity?.value || '';
        const responsible = filterResponsible?.value || '';

        const headers = fullData.headers.filter(h => {
            const id = idOf(h.id);
            const matchCity = !city || h.city === city;
            const matchResponsible = !responsible || h.responsible === responsible;
            const matchDealer = selectedDealerIds.size === 0 || selectedDealerIds.has(id);
            return matchCity && matchResponsible && matchDealer;
        });

        const matrix = fullData.matrix.filter(row => {
            const key = row.type === 'pos' ? row.name : row.sku;
            return selectedProductSkus.size === 0 || selectedProductSkus.has(String(key));
        });

        return { headers, matrix };
    }

    function visibleOriginalIndices(headers) {
        return headers.map(h => fullData.headers.findIndex(original => idOf(original.id) === idOf(h.id)));
    }

    function calculateStats(data = getFilteredData()) {
        const indices = visibleOriginalIndices(data.headers);
        const products = data.matrix.filter(row => row.type !== 'pos');
        const posRows = data.matrix.filter(row => row.type === 'pos');

        let totalCells = products.length * data.headers.length;
        let present = 0;
        let confirmed = 0;
        let manualOnly = 0;
        let workshopOnly = 0;
        let samples = 0;
        let posUnits = 0;

        products.forEach(row => indices.forEach(index => {
            const cell = row.dealers[index] || {};
            const state = cellState(cell);
            samples += n(cell.sample_qty);
            if (state !== 'missing') present++;
            if (state === 'confirmed') confirmed++;
            if (state === 'manual') manualOnly++;
            if (state === 'workshop') workshopOnly++;
        }));

        posRows.forEach(row => indices.forEach(index => {
            posUnits += n(row.dealers[index]?.value);
        }));

        const coverage = totalCells ? Math.round((present / totalCells) * 100) : 0;
        const confirmedPercent = totalCells ? Math.round((confirmed / totalCells) * 100) : 0;
        return {
            dealers:data.headers.length,
            products:products.length,
            totalCells,
            present,
            coverage,
            confirmed,
            confirmedPercent,
            manualOnly,
            workshopOnly,
            discrepancies:manualOnly + workshopOnly,
            missing:Math.max(0,totalCells-present),
            samples,
            posUnits
        };
    }

    function renderKpis() {
        if (!kpiHost) return;
        const stats = calculateStats();
        const cards = [
            {icon:'bi-shop',label:'Дилеров',value:stats.dealers,unit:'в выборке',tone:''},
            {icon:'bi-grid-3x3-gap',label:'Выставлено',value:stats.coverage+'%',unit:`${fmt(stats.present)} из ${fmt(stats.totalCells)}`,tone:stats.coverage>=70?'good':stats.coverage>=40?'warn':'risk'},
            {icon:'bi-patch-check',label:'Подтверждено',value:stats.confirmedPercent+'%',unit:`${fmt(stats.confirmed)} совпадений`,tone:'good'},
            {icon:'bi-exclamation-triangle',label:'Расхождения',value:stats.discrepancies,unit:`${fmt(stats.manualOnly)} матрица · ${fmt(stats.workshopOnly)} цех`,tone:stats.discrepancies?'warn':''},
            {icon:'bi-layers',label:'Образцов у дилеров',value:stats.samples,unit:'шт по учёту Цеха',tone:''},
            {icon:'bi-easel2',label:'POS-материалов',value:stats.posUnits,unit:'шт в выбранной сети',tone:''}
        ];
        kpiHost.innerHTML = cards.map(card => `
            <article class="exhibition-kpi ${card.tone ? 'is-'+card.tone : ''}">
                <span class="exhibition-kpi-icon"><i class="bi ${card.icon}"></i></span>
                <div>
                    <small>${safeText(card.label)}</small>
                    <strong>${safeText(card.value)}</strong>
                    <em>${safeText(card.unit)}</em>
                </div>
            </article>
        `).join('');
    }

    function matrixCellHtml(cell) {
        if (cell?.is_pos) {
            const qty = n(cell.value);
            return qty > 0
                ? `<td class="text-center matrix-state-cell is-pos"><span class="matrix-pos-count">${fmt(qty)}</span></td>`
                : '<td class="text-center matrix-state-cell is-missing"><span class="matrix-state-icon"><i class="bi bi-dash"></i></span></td>';
        }

        const state = cellState(cell);
        const qty = n(cell?.sample_qty);
        if (state === 'confirmed') {
            return `<td class="text-center matrix-state-cell is-confirmed" title="Матрица и Цех совпадают">
                <span class="matrix-state-stack"><span class="matrix-state-icon"><i class="bi bi-check-lg"></i></span>${qty ? `<b>×${fmt(qty)}</b>` : ''}</span>
            </td>`;
        }
        if (state === 'manual') {
            return `<td class="text-center matrix-state-cell is-manual" title="Отмечено в матрице, но выдача из Цеха не найдена">
                <span class="matrix-state-icon"><i class="bi bi-check-lg"></i></span>
            </td>`;
        }
        if (state === 'workshop') {
            return `<td class="text-center matrix-state-cell is-workshop" title="Есть по учёту Цеха, но нет отметки в матрице">
                <span class="matrix-state-stack"><span class="matrix-state-icon"><i class="bi bi-tools"></i></span><b>×${fmt(qty)}</b></span>
            </td>`;
        }
        return '<td class="text-center matrix-state-cell is-missing"><span class="matrix-state-icon"><i class="bi bi-dash"></i></span></td>';
    }

    function renderMatrix() {
        const data = getFilteredData();
        const indices = visibleOriginalIndices(data.headers);
        const totalDealers = data.headers.length;
        const productRows = data.matrix.filter(row => row.type !== 'pos');
        const totalProductRows = productRows.length;
        const dealerTotals = new Array(totalDealers).fill(0);

        matrixHeader.innerHTML = `
            <tr>
                <th class="matrix-sticky-col matrix-sku-col">Артикул</th>
                <th class="matrix-sticky-col matrix-name-col">Название</th>
                ${data.headers.map(h => `
                    <th class="text-center matrix-dealer-head" title="${safeText(h.name)}">
                        <a href="/dealer.html?id=${encodeURIComponent(idOf(h.id))}" class="matrix-dealer-link">
                            <strong>${safeText(h.name)}</strong>
                            <small><i class="bi bi-geo-alt"></i>${safeText(h.city || '—')}</small>
                        </a>
                    </th>
                `).join('')}
                <th class="text-center matrix-summary-col">Сводка</th>
            </tr>
        `;

        matrixBody.innerHTML = data.matrix.map(row => {
            const isPos = row.type === 'pos';
            let rowPresent = 0;

            const cells = indices.map((index, visibleIndex) => {
                const cell = row.dealers[index] || {};
                const state = cellState(cell);
                if (isPos) {
                    if (n(cell.value)>0) rowPresent++;
                } else if (state !== 'missing') {
                    rowPresent++;
                    dealerTotals[visibleIndex]++;
                }
                return matrixCellHtml(cell);
            }).join('');

            const percent = totalDealers ? Math.round((rowPresent/totalDealers)*100) : 0;
            return `
                <tr class="${isPos?'matrix-pos-row':''}">
                    <td class="matrix-sticky-col matrix-sku-col">${isPos?'<span class="matrix-pos-label">POS</span>':`<strong>${safeText(row.sku)}</strong>`}</td>
                    <td class="matrix-sticky-col matrix-name-col" title="${safeText(row.name)}"><span>${safeText(row.name)}</span></td>
                    ${cells}
                    <td class="text-center matrix-summary-col">
                        <strong>${rowPresent}/${totalDealers}</strong>
                        <small>${percent}%</small>
                    </td>
                </tr>
            `;
        }).join('');

        matrixFooter.innerHTML = `
            <tr>
                <td colspan="2" class="matrix-sticky-col matrix-total-label">Итого по дилерам</td>
                ${dealerTotals.map(count => {
                    const percent = totalProductRows ? Math.round((count/totalProductRows)*100) : 0;
                    const cls = percent>=70?'good':percent>=40?'warn':'risk';
                    return `<td class="text-center matrix-dealer-total ${cls}"><strong>${count}/${totalProductRows}</strong><small>${percent}%</small></td>`;
                }).join('')}
                <td class="matrix-summary-col"></td>
            </tr>
        `;

        if (matrixMeta) {
            matrixMeta.innerHTML = `<strong>${fmt(totalDealers)}</strong><span>дилеров</span><i></i><strong>${fmt(data.matrix.length)}</strong><span>позиций</span>`;
        }

        renderKpis();
        updateDropdownLabels();
        renderFieldDealers();
        ensureActiveFieldDealer();
        renderFieldDealer();
    }

    async function initPage() {
        try {
            if (window.CRMAuth?.ready) await CRMAuth.ready;
            if (window.CRMAuth && !CRMAuth.can('can_view_report')) return;

            loadingMsg.hidden = false;
            const response = await fetch(API_MATRIX_URL);
            if (!response.ok) throw new Error('Не удалось загрузить матрицу');
            fullData = await response.json();
            fullData.headers = Array.isArray(fullData.headers) ? fullData.headers : [];
            fullData.matrix = Array.isArray(fullData.matrix) ? fullData.matrix : [];
            fullData.headers.forEach(h => h.id = idOf(h.id));

            populateGlobalFilters();
            updateDealerListOptions();
            populateProductList();
            applyView();
            renderMatrix();

            loadingMsg.hidden = true;
            matrixContainer.hidden = false;
        } catch (error) {
            loadingMsg.hidden = false;
            loadingMsg.innerHTML = `<i class="bi bi-exclamation-circle"></i> ${safeText(error.message)}`;
            loadingMsg.classList.add('is-error');
        }
    }

    function populateGlobalFilters() {
        const cities = [...new Set(fullData.headers.map(h=>h.city).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru'));
        filterCity.innerHTML = '<option value="">Все города</option>' + cities.map(city=>`<option value="${safeText(city)}">${safeText(city)}</option>`).join('');

        const responsibles = [...new Set(fullData.headers.map(h=>h.responsible).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),'ru'));
        const names = {
            regional_astana:'Региональный Астана',
            regional_regions:'Региональный Регионы'
        };
        filterResponsible.innerHTML = '<option value="">Все ответственные</option>' +
            responsibles.map(value=>`<option value="${safeText(value)}">${safeText(names[value] || value)}</option>`).join('');
    }

    function baseDealerFilter() {
        const city = filterCity?.value || '';
        const responsible = filterResponsible?.value || '';
        return fullData.headers.filter(d => {
            const matchCity = !city || d.city === city;
            const matchResponsible = !responsible || d.responsible === responsible;
            const matchSelected = selectedDealerIds.size===0 || selectedDealerIds.has(idOf(d.id));
            return matchCity && matchResponsible && matchSelected;
        });
    }

    function updateDealerListOptions() {
        const city = filterCity?.value || '';
        const responsible = filterResponsible?.value || '';
        const term = String(dealerSearch?.value || '').trim().toLowerCase();

        const available = fullData.headers.filter(d => {
            const matchCity = !city || d.city === city;
            const matchResponsible = !responsible || d.responsible === responsible;
            const searchBlob = `${d.name||''} ${d.city||''}`.toLowerCase();
            return matchCity && matchResponsible && (!term || searchBlob.includes(term));
        });

        dealerListContainer.innerHTML = available.length ? available.map((d,index) => {
            const id = idOf(d.id);
            return `
                <label class="multi-select-item" for="dealer-check-${index}">
                    <input class="form-check-input dealer-checkbox" type="checkbox" value="${safeText(id)}" id="dealer-check-${index}" ${selectedDealerIds.has(id)?'checked':''}>
                    <span><strong>${safeText(d.name)}</strong><small>${safeText(d.city || '—')}</small></span>
                </label>
            `;
        }).join('') : '<div class="exhibition-dropdown-empty">Дилеры не найдены</div>';

        dealerListContainer.querySelectorAll('.dealer-checkbox').forEach(cb => cb.addEventListener('change', event => {
            if (event.target.checked) selectedDealerIds.add(String(event.target.value));
            else selectedDealerIds.delete(String(event.target.value));
            renderMatrix();
        }));
    }

    function populateProductList() {
        const term = String(productSearch?.value || '').trim().toLowerCase();
        const rows = fullData.matrix.filter(row => {
            const blob = `${row.sku||''} ${row.name||''}`.toLowerCase();
            return !term || blob.includes(term);
        });

        productListContainer.innerHTML = rows.map((row,index) => {
            const key = String(row.type === 'pos' ? row.name : row.sku);
            return `
                <label class="multi-select-item" for="product-check-${index}">
                    <input class="form-check-input product-checkbox" type="checkbox" value="${safeText(key)}" id="product-check-${index}" ${selectedProductSkus.has(key)?'checked':''}>
                    <span><strong>${row.type==='pos'?'POS':safeText(row.sku)}</strong><small>${safeText(row.name)}</small></span>
                </label>
            `;
        }).join('');

        productListContainer.querySelectorAll('.product-checkbox').forEach(cb => cb.addEventListener('change', event => {
            if (event.target.checked) selectedProductSkus.add(String(event.target.value));
            else selectedProductSkus.delete(String(event.target.value));
            renderMatrix();
        }));
    }

    function updateDropdownLabels() {
        dealerBtn.textContent = selectedDealerIds.size ? `Выбрано дилеров: ${selectedDealerIds.size}` : 'Все дилеры';
        productBtn.textContent = selectedProductSkus.size ? `Выбрано позиций: ${selectedProductSkus.size}` : 'Все позиции';
    }

    function toggleMenu(menu) {
        menu?.classList.toggle('show');
    }

    function setView(view) {
        reportView = view === 'field' ? 'field' : 'matrix';
        localStorage.setItem('report_view',reportView);
        applyView();
    }

    function applyView() {
        const isField = reportView === 'field';
        matrixView.hidden = isField;
        fieldView.hidden = !isField;
        document.querySelectorAll('[data-report-view]').forEach(button => {
            button.classList.toggle('active',button.dataset.reportView===reportView);
        });
        if (isField) {
            renderFieldDealers();
            ensureActiveFieldDealer();
            renderFieldDealer();
        }
    }

    function ensureActiveFieldDealer() {
        const available = baseDealerFilter();
        if (!available.some(d=>idOf(d.id)===activeFieldDealerId)) {
            activeFieldDealerId = available[0] ? idOf(available[0].id) : '';
        }
    }

    function renderFieldDealers() {
        if (!fieldDealerList) return;
        const term = String(fieldDealerSearch?.value || '').trim().toLowerCase();
        const dealers = baseDealerFilter().filter(d => {
            const blob = `${d.name||''} ${d.city||''}`.toLowerCase();
            return !term || blob.includes(term);
        });

        fieldDealerList.innerHTML = dealers.length ? dealers.map(dealer => {
            const id = idOf(dealer.id);
            const originalIndex = fullData.headers.findIndex(h=>idOf(h.id)===id);
            const productRows = getFilteredData().matrix.filter(row=>row.type!=='pos');
            let present=0, issues=0, samples=0;
            productRows.forEach(row=>{
                const cell=row.dealers[originalIndex]||{};
                const state=cellState(cell);
                if(state!=='missing') present++;
                if(state==='manual'||state==='workshop') issues++;
                samples+=n(cell.sample_qty);
            });
            const percent=productRows.length?Math.round((present/productRows.length)*100):0;
            return `
                <button type="button" class="exhibition-field-dealer ${id===activeFieldDealerId?'active':''}" data-field-dealer="${safeText(id)}">
                    <span class="exhibition-field-dealer-main"><strong>${safeText(dealer.name)}</strong><small><i class="bi bi-geo-alt"></i>${safeText(dealer.city||'—')}</small></span>
                    <span class="exhibition-field-dealer-stats"><b>${percent}%</b><small>${issues?issues+' расх.':samples+' обр.'}</small></span>
                </button>
            `;
        }).join('') : '<div class="exhibition-field-placeholder">Дилеры не найдены</div>';

        fieldDealerList.querySelectorAll('[data-field-dealer]').forEach(button => {
            button.addEventListener('click',()=>{
                activeFieldDealerId=button.dataset.fieldDealer;
                renderFieldDealers();
                renderFieldDealer();
            });
        });
    }

    function fieldRowMatches(state,row) {
        if (fieldStatus==='all') return true;
        if (fieldStatus==='issues') return state==='manual'||state==='workshop';
        if (fieldStatus==='missing') return state==='missing'||state==='pos-missing';
        if (fieldStatus==='present') return ['confirmed','manual','workshop','pos-present'].includes(state);
        if (fieldStatus==='pos') return row.type==='pos';
        return true;
    }

    function renderFieldDealer() {
        if (!fieldDealerHead || !fieldProductList) return;
        const dealer = fullData.headers.find(h=>idOf(h.id)===activeFieldDealerId);
        if (!dealer) {
            fieldDealerHead.innerHTML='<div class="exhibition-field-placeholder">Выберите дилера</div>';
            fieldProductList.innerHTML='<div class="exhibition-field-placeholder">Нет данных</div>';
            return;
        }

        const originalIndex=fullData.headers.findIndex(h=>idOf(h.id)===activeFieldDealerId);
        const rows=getFilteredData().matrix;
        const products=rows.filter(row=>row.type!=='pos');
        let present=0,confirmed=0,issues=0,samples=0;
        products.forEach(row=>{
            const cell=row.dealers[originalIndex]||{};
            const state=cellState(cell);
            if(state!=='missing')present++;
            if(state==='confirmed')confirmed++;
            if(state==='manual'||state==='workshop')issues++;
            samples+=n(cell.sample_qty);
        });
        const percent=products.length?Math.round((present/products.length)*100):0;

        fieldDealerHead.innerHTML=`
            <div class="exhibition-field-dealer-title">
                <div><span>ВЫБРАННЫЙ ДИЛЕР</span><h2>${safeText(dealer.name)}</h2><p><i class="bi bi-geo-alt"></i>${safeText(dealer.city||'—')}</p></div>
                <a href="/dealer.html?id=${encodeURIComponent(activeFieldDealerId)}" class="exhibition-open-dealer"><i class="bi bi-box-arrow-up-right"></i><span>Карточка дилера</span></a>
            </div>
            <div class="exhibition-field-summary">
                <div><small>Выставлено</small><strong>${percent}%</strong><span>${present}/${products.length}</span></div>
                <div><small>Подтверждено</small><strong>${confirmed}</strong><span>позиций</span></div>
                <div class="${issues?'is-warning':''}"><small>Расхождения</small><strong>${issues}</strong><span>позиций</span></div>
                <div><small>Образцов</small><strong>${samples}</strong><span>шт</span></div>
            </div>
        `;

        const term=String(fieldProductSearch?.value||'').trim().toLowerCase();
        const filtered=rows.filter(row=>{
            const cell=row.dealers[originalIndex]||{};
            const state=cellState(cell);
            const blob=`${row.sku||''} ${row.name||''}`.toLowerCase();
            return (!term||blob.includes(term)) && fieldRowMatches(state,row);
        });

        fieldProductList.innerHTML=filtered.length?filtered.map(row=>{
            const cell=row.dealers[originalIndex]||{};
            const state=cellState(cell);
            const qty=n(cell.sample_qty);
            const posQty=row.type==='pos'?n(cell.value):0;
            const icon=state==='confirmed'?'bi-check-lg':
                state==='manual'?'bi-check-lg':
                state==='workshop'?'bi-tools':
                state==='pos-present'?'bi-easel2':'bi-dash';
            const detail=row.type==='pos'
                ? (posQty?`${posQty} шт у дилера`:'POS отсутствует')
                : state==='confirmed'
                    ? `Матрица + Цех${qty?' · '+qty+' шт':''}`
                    : state==='manual'
                        ? 'Отмечено вручную, выдача Цеха не найдена'
                        : state==='workshop'
                            ? `По Цеху ${qty} шт, в матрице не отмечено`
                            : 'Нет ни в матрице, ни по учёту Цеха';
            return `
                <article class="exhibition-field-product is-${safeText(state)}">
                    <span class="exhibition-field-state"><i class="bi ${icon}"></i></span>
                    <div class="exhibition-field-product-main">
                        <div><strong>${row.type==='pos'?'POS':safeText(row.sku)}</strong><span>${safeText(row.name)}</span></div>
                        <small>${safeText(detail)}</small>
                    </div>
                    <span class="exhibition-field-status">${safeText(stateLabel(state))}</span>
                </article>
            `;
        }).join(''):'<div class="exhibition-field-placeholder">По выбранному фильтру позиций нет</div>';
    }

    function resetFilters() {
        filterCity.value='';
        filterResponsible.value='';
        selectedDealerIds.clear();
        selectedProductSkus.clear();
        dealerSearch.value='';
        productSearch.value='';
        fieldDealerSearch.value='';
        fieldProductSearch.value='';
        fieldStatus='all';
        document.querySelectorAll('[data-field-status]').forEach(btn=>btn.classList.toggle('active',btn.dataset.fieldStatus==='all'));
        updateDealerListOptions();
        populateProductList();
        renderMatrix();
    }

    function bulkAction(container,className,set,checked) {
        container.querySelectorAll('.'+className).forEach(cb=>{
            if(cb.closest('.multi-select-item')?.style.display==='none') return;
            cb.checked=checked;
            if(checked)set.add(String(cb.value)); else set.delete(String(cb.value));
        });
        renderMatrix();
    }

    function exportCsv() {
        if (!fullData.matrix.length) return;
        const data=getFilteredData();
        const indices=visibleOriginalIndices(data.headers);
        const clean=value=>`"${String(value??'').replace(/"/g,'""')}"`;
        let csv='\uFEFFАртикул;Название;'+data.headers.map(h=>clean(`${h.name} (${h.city||''})`)).join(';')+';Итого\r\n';

        data.matrix.forEach(row=>{
            let present=0;
            const cells=indices.map(index=>{
                const cell=row.dealers[index]||{};
                if(cell.is_pos){
                    const qty=n(cell.value);
                    if(qty>0)present++;
                    return qty>0?String(qty):'';
                }
                const state=cellState(cell);
                if(state!=='missing')present++;
                const qty=n(cell.sample_qty);
                if(state==='confirmed')return qty?`Подтверждено ×${qty}`:'Подтверждено';
                if(state==='manual')return 'Только матрица';
                if(state==='workshop')return `Только Цех ×${qty}`;
                return '';
            });
            csv+=`${clean(row.sku)};${clean(row.name)};${cells.map(clean).join(';')};${present}\r\n`;
        });

        const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));
        const a=document.createElement('a');
        a.href=url;a.download='IDEAL_FLOOR_Exhibition.csv';document.body.appendChild(a);a.click();a.remove();
        setTimeout(()=>URL.revokeObjectURL(url),500);
    }

    document.addEventListener('click',event=>{
        if(!event.target.closest('#dealer-dropdown')) dealerMenu?.classList.remove('show');
        if(!event.target.closest('#product-dropdown')) productMenu?.classList.remove('show');
    });

    dealerBtn?.addEventListener('click',()=>toggleMenu(dealerMenu));
    productBtn?.addEventListener('click',()=>toggleMenu(productMenu));
    dealerSearch?.addEventListener('input',updateDealerListOptions);
    productSearch?.addEventListener('input',populateProductList);

    dealerSelectAll?.addEventListener('click',()=>bulkAction(dealerListContainer,'dealer-checkbox',selectedDealerIds,true));
    dealerClear?.addEventListener('click',()=>{
        selectedDealerIds.clear();updateDealerListOptions();renderMatrix();
    });
    productSelectAll?.addEventListener('click',()=>bulkAction(productListContainer,'product-checkbox',selectedProductSkus,true));
    productClear?.addEventListener('click',()=>{
        selectedProductSkus.clear();populateProductList();renderMatrix();
    });

    filterCity?.addEventListener('change',()=>{updateDealerListOptions();renderMatrix();});
    filterResponsible?.addEventListener('change',()=>{updateDealerListOptions();renderMatrix();});
    resetFiltersBtn?.addEventListener('click',resetFilters);
    exportBtn?.addEventListener('click',exportCsv);

    document.querySelectorAll('[data-report-view]').forEach(button=>{
        button.addEventListener('click',()=>setView(button.dataset.reportView));
    });

    fieldDealerSearch?.addEventListener('input',renderFieldDealers);
    fieldProductSearch?.addEventListener('input',renderFieldDealer);
    document.querySelectorAll('[data-field-status]').forEach(button=>{
        button.addEventListener('click',()=>{
            fieldStatus=button.dataset.fieldStatus||'all';
            document.querySelectorAll('[data-field-status]').forEach(item=>item.classList.toggle('active',item===button));
            renderFieldDealer();
        });
    });

    initPage();
});