document.addEventListener('DOMContentLoaded', () => {
    const API_MATRIX_URL = '/api/matrix';
    const $ = id => document.getElementById(id);

    const matrixHeader = $('matrix-header');
    const matrixBody = $('matrix-body');
    const matrixFooter = $('matrix-footer');
    const matrixContainer = $('matrix-container');
    const loadingMsg = $('loading-msg');
    const exportBtn = $('export-excel-btn');
    const excelExportModalEl = $('excel-export-modal');
    const excelExportModal = excelExportModalEl ? bootstrap.Modal.getOrCreateInstance(excelExportModalEl) : null;
    const excelExportScope = $('excel-export-scope');
    const excelExportConfirm = $('excel-export-confirm');
    const excelSelectAll = $('excel-select-all');
    const kpiHost = $('exhibition-kpis');
    const matrixMeta = $('matrix-current-meta');

    const matrixView = $('matrix-view');
    const fieldView = $('field-view');

    const filterCity = $('filter-city');
    const filterResponsible = $('filter-responsible');
    const filterLiquidity = $('filter-liquidity');
    const filterNeedsReplacement = $('filter-needs-replacement');
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
    const inspectionModalEl = $('exhibition-inspection-modal');
    const inspectionModal = inspectionModalEl ? bootstrap.Modal.getOrCreateInstance(inspectionModalEl) : null;
    const inspectionForm = $('exhibition-inspection-form');
    const inspectionSave = $('exhibition-inspection-save');
    const inspectionFeedback = $('exhibition-inspection-feedback');
    const canEditMatrix = () => Boolean(window.CRMAuth?.can('can_edit_matrix'));
    const canManageWorkshop = () => Boolean(window.CRMAuth?.can('can_manage_workshop'));
    const editModeButton = $('exhibition-edit-mode');
    const editHint = $('exhibition-edit-hint');
    const batchBar = $('exhibition-batch-bar');
    const batchCount = $('exhibition-batch-count');
    const batchDetails = $('exhibition-batch-details');
    const batchSave = $('exhibition-batch-save');
    const batchUndo = $('exhibition-batch-undo');
    const batchDiscard = $('exhibition-batch-discard');
    let batchEditMode = false;
    let batchSaving = false;
    const stagedPresence = new Map();
    const editHistory = [];
    let inspectionContext = null;

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

    // Protected two-step editor: an explicit edit mode plus one batch Save.
    // Original matrix data is never changed while the user is selecting.
    const presenceKey=(dealerId,productId)=>String(dealerId)+'|'+String(productId);
    function stagedEntry(dealerId,productId){
        return stagedPresence.get(presenceKey(dealerId,productId));
    }
    function previewCell(row,index){
        const cell=row.dealers?.[index]||{};
        if(row.type==='pos')return cell;
        const dealerId=idOf(fullData.headers[index]?.id);
        const pending=stagedEntry(dealerId,row.id);
        return pending?{...cell,value:pending.present?1:0}:cell;
    }
    function updateBatchControls(){
        if(editModeButton){
            editModeButton.hidden=!canEditMatrix();
            editModeButton.disabled=batchSaving;
            editModeButton.classList.toggle('is-active',batchEditMode);
            editModeButton.setAttribute('aria-pressed',batchEditMode?'true':'false');
            editModeButton.innerHTML=batchEditMode
                ? '<i class="bi bi-lock-fill"></i><span>Завершить правки</span>'
                : '<i class="bi bi-unlock"></i><span>Редактировать</span>';
        }
        if(editHint)editHint.hidden=!batchEditMode;
        if(batchBar)batchBar.hidden=stagedPresence.size===0;
        if(batchCount)batchCount.textContent=stagedPresence.size+' '+(
            stagedPresence.size%10===1&&stagedPresence.size%100!==11?'изменение':
            [2,3,4].includes(stagedPresence.size%10)&&![12,13,14].includes(stagedPresence.size%100)?'изменения':'изменений'
        );
        if(batchDetails)batchDetails.textContent=batchSaving?'Сохраняю изменения…'
            :'Предпросмотр · ещё не сохранено';
        if(batchSave){
            batchSave.disabled=batchSaving||!stagedPresence.size;
            batchSave.innerHTML=batchSaving
                ? '<span class="spinner-border spinner-border-sm"></span><span>Сохраняю…</span>'
                : '<i class="bi bi-check2-circle"></i><span>Сохранить '+stagedPresence.size+'</span>';
        }
        if(batchUndo)batchUndo.disabled=batchSaving||!editHistory.length;
        if(batchDiscard)batchDiscard.disabled=batchSaving||!stagedPresence.size;
        document.body.classList.toggle('exhibition-batch-editing',batchEditMode);
    }
    function toggleBatchEditMode(){
        if(!canEditMatrix()||batchSaving)return;
        if(batchEditMode&&stagedPresence.size){
            window.showToast?.('Сначала сохраните или сбросьте изменения','warning');
            return;
        }
        batchEditMode=!batchEditMode;
        renderMatrix();
    }
    function toggleStagedPresence(dealerId,productId){
        if(!batchEditMode||batchSaving||!canEditMatrix())return;
        const index=fullData.headers.findIndex(header=>idOf(header.id)===dealerId);
        const row=fullData.matrix.find(item=>item.type!=='pos'&&String(item.id)===productId);
        if(index<0||!row)return;
        const original=Boolean(n(row.dealers[index]?.value));
        const key=presenceKey(dealerId,productId);
        const previous=stagedPresence.get(key)||null;
        if(!previous&&stagedPresence.size>=250){
            window.showToast?.('За один раз можно сохранить до 250 отметок','warning');
            return;
        }
        const next=!(previous?previous.present:original);
        editHistory.push({key,previous});
        if(next===original)stagedPresence.delete(key);
        else stagedPresence.set(key,{dealerId,productId,present:next,expectedPresent:original});
        if(!stagedPresence.size)editHistory.length=0;
        renderMatrix();
    }
    function markAllVisibleSamples(dealerId){
        if(!batchEditMode||batchSaving||!canEditMatrix()||!dealerId||!fieldProductList)return;
        const index=fullData.headers.findIndex(header=>idOf(header.id)===String(dealerId));
        if(index<0)return;
        const productIds=[...new Set([...fieldProductList.querySelectorAll('[data-exhibition-presence]')]
            .map(button=>String(button.dataset.editKey||'')).filter(Boolean))];
        const plans=[];
        productIds.forEach(productId=>{
            const row=fullData.matrix.find(item=>item.type!=='pos'&&String(item.id)===productId);
            if(!row)return;
            const original=Boolean(n(row.dealers[index]?.value));
            const key=presenceKey(dealerId,productId);
            const previous=stagedPresence.get(key)||null;
            const current=previous?Boolean(previous.present):original;
            if(current)return;
            const next=original?null:{dealerId:String(dealerId),productId,present:true,expectedPresent:original};
            plans.push({key,previous,next});
        });
        if(!plans.length){
            window.showToast?.('Все образцы в текущем списке уже отмечены','info');
            return;
        }
        let projectedSize=stagedPresence.size;
        plans.forEach(plan=>{
            if(plan.previous&&!plan.next)projectedSize--;
            else if(!plan.previous&&plan.next)projectedSize++;
        });
        if(projectedSize>250){
            window.showToast?.('За один раз можно сохранить до 250 отметок','warning');
            return;
        }
        const historyGroup=[];
        plans.forEach(plan=>{
            historyGroup.push({key:plan.key,previous:plan.previous});
            if(plan.next)stagedPresence.set(plan.key,plan.next);
            else stagedPresence.delete(plan.key);
        });
        editHistory.push({batch:historyGroup});
        renderMatrix();
        window.showToast?.('Отмечено '+plans.length+' образцов. Изменения пока не сохранены','success');
    }

    function undoStagedPresence(){
        if(batchSaving||!editHistory.length)return;
        const last=editHistory.pop();
        if(Array.isArray(last.batch)){
            [...last.batch].reverse().forEach(change=>{
                if(change.previous)stagedPresence.set(change.key,change.previous);
                else stagedPresence.delete(change.key);
            });
        }else if(last.previous)stagedPresence.set(last.key,last.previous);
        else stagedPresence.delete(last.key);
        if(!stagedPresence.size)editHistory.length=0;
        renderMatrix();
    }
    function discardStagedPresence(){
        if(batchSaving)return;
        stagedPresence.clear();
        editHistory.length=0;
        renderMatrix();
    }
    async function saveStagedPresence(){
        if(batchSaving||!stagedPresence.size||!canEditMatrix())return;
        batchSaving=true;
        updateBatchControls();
        const changes=[...stagedPresence.values()];
        try{
            const response=await fetch('/api/exhibition/presence/batch',{
                method:'PUT',headers:{'Content-Type':'application/json'},
                body:JSON.stringify({changes})
            });
            const result=await response.json().catch(()=>({}));
            if(!response.ok)throw new Error(result.error||'Не удалось сохранить выставленность');
            if(result.status!=='ok'||!Array.isArray(result.changes)||result.changes.length!==changes.length)
                throw new Error('Сервер вернул неполный результат. Обновите данные выставленности.');
            result.changes.forEach(item=>{
                const index=fullData.headers.findIndex(d=>idOf(d.id)===item.dealerId);
                const row=fullData.matrix.find(r=>r.type!=='pos'&&String(r.id)===item.productId);
                if(index>=0&&row){
                    const cell=row.dealers[index]||{};
                    row.dealers[index]={...cell,value:item.present?1:0};
                }
            });
            stagedPresence.clear();
            editHistory.length=0;
            batchEditMode=false;
            window.showToast?.('Сохранено '+result.changes.length+' отметок выставленности','success');
        }catch(error){
            window.showToast?.(error.message||'Ошибка сохранения','error');
        }finally{
            batchSaving=false;
            renderMatrix();
        }
    }

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

    const needsSampleReplace = cell => ['damaged','missing'].includes(cell?.condition);
    const needsTagAttention = cell => ['replace','missing'].includes(cell?.priceTag);
    const needsAttention = cell => needsSampleReplace(cell)||needsTagAttention(cell);
    const knownPriceTag = cell => Boolean(cell?.priceTag&&cell.priceTag!=='unknown');
    function checkBadgeText(cell,type) {
        const messages=[];
        if(needsSampleReplace(cell))messages.push(type==='pos'
            ? (cell.condition==='damaged'?'Брак оборудования':'Оборудование отсутствует')
            : (cell.condition==='damaged'?'Образец повреждён':'Образец отсутствует'));
        if(type!=='pos'){
            if(cell?.priceTag==='replace')messages.push('Заменить ценник');
            else if(cell?.priceTag==='missing')messages.push('Нет ценника');
            else if(cell?.priceTag==='ok')messages.push('Ценник ✓');
        }
        return messages;
    }
    function rowMatchesLiquidity(row) {
        const mode = filterLiquidity?.value || 'liquid';
        if (row?.type === 'pos') return mode !== 'illiquid';
        const isLiquid = row?.is_liquid !== false;
        if (mode === 'illiquid') return !isLiquid;
        if (mode === 'all') return true;
        return isLiquid;
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

        const selectedRows = fullData.matrix.filter(row => {
            if (!rowMatchesLiquidity(row)) return false;
            const key = row.type === 'pos' ? row.name : row.sku;
            return selectedProductSkus.size === 0 || selectedProductSkus.has(String(key));
        });
        if (!filterNeedsReplacement?.checked) return {headers,matrix:selectedRows};

        // Only inspected problems count. A product not displayed at a dealer
        // does not automatically require replacement.
        const matchedIndices = new Set();
        const originalIndices = visibleOriginalIndices(headers);
        const matrix = selectedRows.filter(row => {
            let matches=false;
            // Visit every dealer: Array.some() would stop at the first issue
            // and hide other dealers with problems in the same product row.
            originalIndices.forEach(index=>{
                if(needsAttention(row.dealers?.[index])){
                    matchedIndices.add(index);
                    matches=true;
                }
            });
            return matches;
        });
        const matchingHeaders = headers.filter((_,index)=>matchedIndices.has(originalIndices[index]));
        return {headers:matchingHeaders,matrix};

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
        let replacements=0,tagIssues=0,tagChecked=0,priceTagUnits=0;
        data.matrix.forEach(row=>indices.forEach(index=>{
            const cell=previewCell(row,index);
            if(needsSampleReplace(cell))replacements++;
            if(needsTagAttention(cell))tagIssues++;
            if(row.type!=='pos'&&knownPriceTag(cell))tagChecked++;
            if(row.type!=='pos')priceTagUnits+=n(cell.priceTagQty);
        }));

        products.forEach(row => indices.forEach(index => {
            const cell = previewCell(row,index);
            const state = cellState(cell);
            samples += n(cell.sample_qty);
            if (state !== 'missing') present++;
            if (state === 'confirmed') confirmed++;
            if (state === 'manual') manualOnly++;
            if (state === 'workshop') workshopOnly++;
        }));

        posRows.forEach(row => indices.forEach(index => {
            posUnits += n(previewCell(row,index).value);
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
            posUnits,
            replacements,
            tagIssues,
            tagChecked,
            priceTagUnits
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
            {icon:'bi-easel2',label:'POS-материалов',value:stats.posUnits,unit:'шт в выбранной сети',tone:''},
            {icon:'bi-wrench-adjustable',label:'На замену',value:stats.replacements,unit:'образцы и оборудование',tone:stats.replacements?'warn':''},
            {icon:'bi-tags',label:'Ценники',value:stats.tagIssues,unit:`${fmt(stats.tagChecked)} проверено · ${fmt(stats.priceTagUnits)} шт`,tone:stats.tagIssues?'risk':''}
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

    function decorateMatrixCell(html,cell,row,dealerId) {
        const badges=checkBadgeText(cell,row.type);
        const badge=badges.filter(x=>!x.includes('✓')).length
            ? '<span class="exhibition-cell-alert" title="'+safeText(badges.join(' · '))+'"><i class="bi bi-exclamation-lg"></i></span>'
            : '';
        const editable=row.type!=='pos'&&batchEditMode&&canEditMatrix();
        const pending=row.type!=='pos'&&stagedEntry(dealerId,row.id);
        if(editable||pending)html=html.replace('matrix-state-cell',
            'matrix-state-cell'+(editable?' is-batch-editable':'')+(pending?' is-staged':''));
        const quick=editable
            ? '<button type="button" class="exhibition-quick-toggle" data-exhibition-presence="1"'+
              ' data-edit-dealer="'+safeText(dealerId)+'" data-edit-key="'+safeText(row.id)+'"'+
              ' aria-label="'+safeText((n(cell.value)?'Убрать образец: ':'Отметить образец: ')+
                [row.sku,row.name].filter(Boolean).join(' '))+'"'+
              ' aria-pressed="'+(n(cell.value)?'true':'false')+'">'+
              '<span class="exhibition-quick-glyph"><i class="bi '+
                (n(cell.value)?'bi-check2':'bi-plus-lg')+'"></i></span></button>'
            : '';
        const edit=canEditMatrix()
            ? '<button type="button" class="exhibition-cell-edit" data-exhibition-edit="1" data-edit-dealer="'+safeText(dealerId)+'" data-edit-kind="'+(row.type==='pos'?'pos':'laminate')+'" data-edit-key="'+safeText(row.type==='pos'?row.name:row.id)+'" title="Состояние, замены и ценники" aria-label="Редактировать '+safeText(row.name)+'"><i class="bi bi-pencil"></i></button>'
            : '';
        return html.replace(/<\/td>\s*$/,quick+badge+edit+'</td>');
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
                const cell = previewCell(row,index);
                const state = cellState(cell);
                if (isPos) {
                    if (n(cell.value)>0) rowPresent++;
                } else if (state !== 'missing') {
                    rowPresent++;
                    dealerTotals[visibleIndex]++;
                }
                return decorateMatrixCell(matrixCellHtml(cell),cell,row,idOf(data.headers[visibleIndex].id));
            }).join('');

            const percent = totalDealers ? Math.round((rowPresent/totalDealers)*100) : 0;
            const isIlliquid = !isPos && row.is_liquid === false;
            return `
                <tr class="${isPos?'matrix-pos-row':''} ${isIlliquid?'is-illiquid':''}">
                    <td class="matrix-sticky-col matrix-sku-col">${isPos?'<span class="matrix-pos-label">POS</span>':`<strong>${safeText(row.sku)}</strong>`}</td>
                    <td class="matrix-sticky-col matrix-name-col" title="${safeText(row.name)}"><span>${safeText(row.name)}</span>${isIlliquid?'<span class="matrix-liquidity-badge">Неликвид</span>':''}</td>
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
        updateBatchControls();
        updateDropdownLabels();
        ensureActiveFieldDealer();
        renderFieldDealers();
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
            if (!rowMatchesLiquidity(row)) return false;
            const blob = `${row.sku||''} ${row.name||''}`.toLowerCase();
            return !term || blob.includes(term);
        });

        productListContainer.innerHTML = rows.map((row,index) => {
            const key = String(row.type === 'pos' ? row.name : row.sku);
            return `
                <label class="multi-select-item" for="product-check-${index}">
                    <input class="form-check-input product-checkbox" type="checkbox" value="${safeText(key)}" id="product-check-${index}" ${selectedProductSkus.has(key)?'checked':''}>
                    <span><strong>${row.type==='pos'?'POS':safeText(row.sku)}${row.type!=='pos' && row.is_liquid===false?' · НЕЛИКВИД':''}</strong><small>${safeText(row.name)}</small></span>
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
            ensureActiveFieldDealer();
            renderFieldDealers();
            renderFieldDealer();
        }
    }

    function ensureActiveFieldDealer() {
        const available = getFilteredData().headers;
        if (!available.some(d=>idOf(d.id)===activeFieldDealerId)) {
            activeFieldDealerId = available[0] ? idOf(available[0].id) : '';
        }
    }

    function renderFieldDealers() {
        if (!fieldDealerList) return;
        const term = String(fieldDealerSearch?.value || '').trim().toLowerCase();
        const data = getFilteredData();
        const dealers = data.headers.filter(d => {
            const blob = `${d.name||''} ${d.city||''}`.toLowerCase();
            return !term || blob.includes(term);
        });

        fieldDealerList.innerHTML = dealers.length ? dealers.map(dealer => {
            const id = idOf(dealer.id);
            const originalIndex = fullData.headers.findIndex(h=>idOf(h.id)===id);
            const productRows = data.matrix.filter(row=>row.type!=='pos');
            let present=0, issues=0, samples=0,replacements=0,tagIssues=0;
            productRows.forEach(row=>{
                const cell=previewCell(row,originalIndex);
                const state=cellState(cell);
                if(state!=='missing') present++;
                if(state==='manual'||state==='workshop') issues++;
                if(needsSampleReplace(cell))replacements++;
                if(needsTagAttention(cell))tagIssues++;
                samples+=n(cell.sample_qty);
            });
            data.matrix.filter(row=>row.type==='pos').forEach(row=>{
                if(needsSampleReplace(previewCell(row,originalIndex)))replacements++;
            });
            const percent=productRows.length?Math.round((present/productRows.length)*100):0;
            const workCount=replacements+tagIssues;
            const workLabel=workCount?workCount+' требуют внимания':issues?issues+' расх.':samples+' обр.';
            return `
                <button type="button" class="exhibition-field-dealer ${id===activeFieldDealerId?'active':''}" data-field-dealer="${safeText(id)}">
                    <span class="exhibition-field-dealer-main"><strong>${safeText(dealer.name)}</strong><small><i class="bi bi-geo-alt"></i>${safeText(dealer.city||'—')}</small></span>
                    <span class="exhibition-field-dealer-stats ${workCount?'has-work':''}"><b>${percent}%</b><small>${safeText(workLabel)}</small></span>
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


    function fieldRowMatches(state,row,cell) {
        if (fieldStatus==='all') return true;
        if (fieldStatus==='issues') return state==='manual'||state==='workshop';
        if (fieldStatus==='replace') return needsAttention(cell);
        if (fieldStatus==='tags') return row.type!=='pos'&&knownPriceTag(cell);
        if (fieldStatus==='missing') return state==='missing'||state==='pos-missing';
        if (fieldStatus==='present') return ['confirmed','manual','workshop','pos-present'].includes(state);
        if (fieldStatus==='pos') return row.type==='pos';
        return true;
    }

    function renderFieldDealer() {
        if(!fieldDealerHead||!fieldProductList)return;
        const dealer=fullData.headers.find(h=>idOf(h.id)===activeFieldDealerId);
        if(!dealer){
            fieldDealerHead.innerHTML='<div class="exhibition-field-placeholder">Выберите дилера</div>';
            fieldProductList.innerHTML='<div class="exhibition-field-placeholder">Нет данных</div>';
            return;
        }
        const originalIndex=fullData.headers.findIndex(h=>idOf(h.id)===activeFieldDealerId);
        const rows=getFilteredData().matrix;
        const products=rows.filter(row=>row.type!=='pos');
        let present=0,confirmed=0,issues=0,samples=0,replacements=0,tagIssues=0,tagChecked=0;
        products.forEach(row=>{
            const cell=previewCell(row,originalIndex);
            const state=cellState(cell);
            if(state!=='missing')present++;
            if(state==='confirmed')confirmed++;
            if(state==='manual'||state==='workshop')issues++;
            if(needsSampleReplace(cell))replacements++;
            if(needsTagAttention(cell))tagIssues++;
            if(knownPriceTag(cell))tagChecked++;
            samples+=n(cell.sample_qty);
        });
        rows.filter(row=>row.type==='pos').forEach(row=>{
            if(needsSampleReplace(row.dealers[originalIndex]))replacements++;
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
                <div><small>Образцов Цеха</small><strong>${samples}</strong><span>шт</span></div>
                <div class="${replacements?'is-warning':''}"><small>На замену</small><strong>${replacements}</strong><span>образцы / POS</span></div>
                <div class="${tagIssues?'is-warning':''}"><small>Ценники</small><strong>${tagIssues}</strong><span>проблем · ${tagChecked} провер.</span></div>
            </div>
        `;
        const term=String(fieldProductSearch?.value||'').trim().toLowerCase();
        const filtered=rows.filter(row=>{
            const cell=previewCell(row,originalIndex);
            const state=cellState(cell);
            const blob=`${row.sku||''} ${row.name||''}`.toLowerCase();
            return (!term||blob.includes(term))&&
                (!filterNeedsReplacement?.checked||needsAttention(cell))&&
                fieldRowMatches(state,row,cell);
        });
        const visibleSampleRows=filtered.filter(row=>row.type!=='pos');
        const unmarkedVisibleCount=visibleSampleRows.reduce((count,row)=>
            count+(n(previewCell(row,originalIndex).value)?0:1),0);
        const bulkAction=batchEditMode&&canEditMatrix()&&visibleSampleRows.length
            ? '<div class="exhibition-field-bulk-actions"><button type="button" data-exhibition-mark-all="1" data-exhibition-dealer="'+safeText(activeFieldDealerId)+'" '+(unmarkedVisibleCount?'':'disabled')+'><i class="bi bi-check2-all"></i><span>'+(unmarkedVisibleCount?'Отметить все в списке · '+fmt(unmarkedVisibleCount):'Все образцы в списке уже отмечены')+'</span></button><small>Только отображаемые образцы ламината. POS и учёт Цеха не меняются.</small></div>'
            : '';
        fieldProductList.innerHTML=filtered.length?bulkAction+filtered.map(row=>{
            const cell=previewCell(row,originalIndex);
            const pending=row.type!=='pos'&&stagedEntry(activeFieldDealerId,row.id);
            const state=cellState(cell);
            const qty=n(cell.sample_qty);
            const posQty=row.type==='pos'?n(cell.value):0;
            const icon=state==='confirmed'?'bi-check-lg':
                state==='manual'?'bi-check-lg':
                state==='workshop'?'bi-tools':
                state==='pos-present'?'bi-easel2':'bi-dash';
            const detail=row.type==='pos'
                ? (posQty?`${posQty} шт по учёту Цеха / дилера`:'POS отсутствует')
                : state==='confirmed'
                    ? `Матрица + Цех${qty?' · '+qty+' шт':''}`
                    : state==='manual'
                        ? 'Отмечено вручную, выдача Цеха не найдена'
                        : state==='workshop'
                            ? `По Цеху ${qty} шт, в матрице не отмечено`
                            : 'Нет ни в матрице, ни по учёту Цеха';
            const badges=checkBadgeText(cell,row.type);
            const issueBadges=badges.map(message=>
                '<span class="exhibition-check-flag '+(message.includes('✓')?'is-ok':'is-warning')+'">'+
                '<i class="bi '+(message.includes('✓')?'bi-check-circle':'bi-exclamation-triangle')+'"></i>'+
                safeText(message)+'</span>').join('');
            const tagCount=row.type!=='pos'&&n(cell.priceTagQty)>0
                ? '<span class="exhibition-check-flag is-neutral">Ценников: '+fmt(cell.priceTagQty)+'</span>':'';
            const quickButton=batchEditMode&&row.type!=='pos'&&canEditMatrix()
                ? '<button type="button" class="exhibition-field-quick-toggle" data-exhibition-presence="1"'+
                  ' data-edit-dealer="'+safeText(activeFieldDealerId)+'" data-edit-key="'+safeText(row.id)+'"'+
                  ' aria-pressed="'+(n(cell.value)?'true':'false')+'">'+
                  '<i class="bi '+(n(cell.value)?'bi-check2-circle':'bi-plus-circle')+'"></i>'+
                  '<span>'+(n(cell.value)?'Убрать':'Отметить')+'</span></button>'
                : '';
            const editButton=canEditMatrix()
                ? '<button type="button" class="exhibition-field-edit" data-exhibition-edit="1" data-edit-dealer="'+safeText(activeFieldDealerId)+'" data-edit-kind="'+(row.type==='pos'?'pos':'laminate')+'" data-edit-key="'+safeText(row.type==='pos'?row.name:row.id)+'" title="Изменить выставленность и состояние"><i class="bi bi-pencil-square"></i><span>Изменить</span></button>'
                : '';
            return `
                <article class="exhibition-field-product is-${safeText(state)} ${needsAttention(cell)?'has-inspection-issue':''} ${pending?'is-staged':''}">
                    <span class="exhibition-field-state"><i class="bi ${icon}"></i></span>
                    <div class="exhibition-field-product-main">
                        <div><strong>${row.type==='pos'?'POS':safeText(row.sku)}</strong><span>${safeText(row.name)}</span>${row.type!=='pos'&&row.is_liquid===false?'<em class="exhibition-liquidity-tag">Неликвид</em>':''}</div>
                        <small>${safeText(detail)}</small>
                        ${issueBadges||tagCount?'<div class="exhibition-check-flags">'+issueBadges+tagCount+'</div>':''}
                        ${cell.note?'<small class="exhibition-check-note">'+safeText(cell.note)+'</small>':''}
                    </div>
                    <div class="exhibition-field-product-side">
                        <span class="exhibition-field-status">${safeText(stateLabel(state))}</span>
                        ${quickButton}
                        ${editButton}
                    </div>
                </article>
            `;
        }).join(''):'<div class="exhibition-field-placeholder">По выбранному фильтру позиций нет</div>';
    }


    function updatePosQuantityPreview(){
        const preview=$('exhibition-pos-quantity-preview');
        const input=$('exhibition-pos-quantity');
        if(!preview||!input||!inspectionContext||inspectionContext.kind!=='pos')return;
        const requested=Number(input.value);
        if(!Number.isSafeInteger(requested)||requested<0||requested>1000){
            preview.textContent='Введите целое количество от 0 до 1000.';
            return;
        }
        const current=inspectionContext.initialPosQuantity;
        if(requested===current){
            preview.textContent='Количество не изменится.';
            return;
        }
        const delta=Math.abs(requested-current);
        if(requested>current){
            preview.textContent='Из Цеха будет выдано дилеру: +'+delta+' шт.';
            return;
        }
        const condition=$('exhibition-inspection-condition')?.value||'ok';
        preview.textContent=condition==='ok'
            ? 'В Цех вернётся исправное оборудование: '+delta+' шт.'
            : 'У дилера будет снято '+delta+' шт.; складской остаток Цеха не увеличится.';
    }
    function openInspectionEditor({dealerId,kind,key}) {
        if(!canEditMatrix()||!inspectionModal)return;
        if(stagedPresence.size){
            window.showToast?.('Сначала сохраните или сбросьте выбранные изменения','warning');
            return;
        }
        const dealer=fullData.headers.find(item=>idOf(item.id)===dealerId);
        const row=fullData.matrix.find(item=>kind==='pos'
            ? item.type==='pos'&&item.name===key
            : item.type!=='pos'&&String(item.id)===key);
        if(!dealer||!row)return;
        const index=fullData.headers.findIndex(item=>idOf(item.id)===dealerId);
        const cell=row.dealers[index]||{};
        inspectionContext={dealerId,kind,key,row,index,initialPosQuantity:Math.max(0,Math.floor(n(cell.value)))};
        $('exhibition-inspection-dealer').textContent=[dealer.name,dealer.city].filter(Boolean).join(' · ');
        $('exhibition-inspection-item').textContent=[row.sku,row.name].filter(Boolean).join(' · ');
        $('exhibition-inspection-type').textContent=kind==='pos'?'ТОРГОВОЕ ОБОРУДОВАНИЕ':'ОБРАЗЕЦ ЛАМИНАТА';
        $('exhibition-inspection-stock').textContent=kind==='pos'
            ? (canManageWorkshop()
                ? 'Сейчас у дилера: '+fmt(cell.value)+' шт. Изменение количества будет записано в движение оборудования Цеха.'
                : 'У дилера числится: '+fmt(cell.value)+' шт. Количество изменяется через Цех.')
            : 'Выдано из Цеха: '+fmt(cell.sample_qty)+' шт. · Матрица: '+(n(cell.value)?'есть':'нет');
        const posQuantityRow=$('exhibition-pos-quantity-row');
        if(posQuantityRow)posQuantityRow.hidden=kind!=='pos'||!canManageWorkshop();
        if(kind==='pos'&&canManageWorkshop())$('exhibition-pos-quantity').value=String(Math.max(0,Math.floor(n(cell.value))));
        $('exhibition-inspection-presence-row').hidden=kind==='pos';
        $('exhibition-inspection-tags').hidden=kind==='pos';
        $('exhibition-inspection-present').checked=Boolean(n(cell.value));
        $('exhibition-inspection-condition').value=['ok','damaged','missing'].includes(cell.condition)?cell.condition:'ok';
        $('exhibition-inspection-replace-qty').value=Number.isInteger(Number(cell.replacementQty))?Number(cell.replacementQty):0;
        $('exhibition-inspection-tag').value=['unknown','ok','replace','missing'].includes(cell.priceTag)?cell.priceTag:'unknown';
        $('exhibition-inspection-tag-qty').value=Number.isInteger(Number(cell.priceTagQty))?Number(cell.priceTagQty):0;
        $('exhibition-inspection-note').value=cell.note||'';
        updatePosQuantityPreview();
        if(inspectionFeedback){inspectionFeedback.hidden=true;inspectionFeedback.textContent='';}
        if(inspectionSave)inspectionSave.disabled=false;
        inspectionModal.show();
    }
    function showInspectionError(message){
        if(inspectionFeedback){
            inspectionFeedback.hidden=false;
            inspectionFeedback.textContent=message||'Не удалось сохранить проверку';
        }
    }
    function parsePositiveInteger(id) {
        const raw=$(id)?.value||'0';
        const number=Number(raw);
        if(!Number.isSafeInteger(number)||number<0||number>1000)throw new Error('Количество должно быть целым числом от 0 до 1000');
        return number;
    }
    async function saveInspection(event){
        event.preventDefault();
        if(!inspectionContext||!canEditMatrix())return;
        const {dealerId,kind,key,row,index}=inspectionContext;
        let body;
        try{
            const condition=$('exhibition-inspection-condition')?.value||'ok';
            body={
                kind,key,condition,
                replacementQty:condition==='ok'?0:parsePositiveInteger('exhibition-inspection-replace-qty'),
                priceTag:kind==='pos'?'unknown':$('exhibition-inspection-tag')?.value||'unknown',
                priceTagQty:kind==='pos'?0:parsePositiveInteger('exhibition-inspection-tag-qty'),
                note:String($('exhibition-inspection-note')?.value||'').trim().slice(0,500)
            };
            if(kind!=='pos')body.present=Boolean($('exhibition-inspection-present')?.checked);
            else if(canManageWorkshop()){
                const posQuantity=parsePositiveInteger('exhibition-pos-quantity');
                if(posQuantity!==inspectionContext.initialPosQuantity)body.posQuantity=posQuantity;
            }
        }catch(error){showInspectionError(error.message);return;}
        if(inspectionSave){
            inspectionSave.disabled=true;
            inspectionSave.innerHTML='<span class="spinner-border spinner-border-sm"></span> Сохраняю…';
        }
        if(inspectionFeedback)inspectionFeedback.hidden=true;
        try{
            const response=await fetch('/api/exhibition/dealers/'+encodeURIComponent(dealerId)+'/item',{
                method:'PUT',
                headers:{'Content-Type':'application/json'},
                body:JSON.stringify(body)
            });
            const data=await response.json().catch(()=>({}));
            if(!response.ok)throw new Error(data.error||'Не удалось сохранить выставленность');
            // Update only the inspected cell; filter, dealer and scroll stay intact.
            // POS quantity changes are already recorded as workshop movements.
            const cell=row.dealers[index]||{};
            Object.assign(cell,data.inspection||{});
            if(kind!=='pos'&&typeof data.present==='boolean')cell.value=data.present?1:0;
            if(kind==='pos'&&data.posQuantity!==null&&data.posQuantity!==undefined&&Number.isSafeInteger(Number(data.posQuantity)))cell.value=Number(data.posQuantity);
            row.dealers[index]=cell;
            inspectionModal?.hide();
            inspectionContext=null;
            renderMatrix();
            if(window.showToast)window.showToast(kind==='pos'&&typeof data.posQuantity==='number'
                ? 'Количество оборудования и состояние сохранены'
                : 'Выставленность и отметки сохранены','success');
        }catch(error){
            showInspectionError(error.message||'Ошибка сети');
        }finally{
            if(inspectionSave){
                inspectionSave.disabled=false;
                inspectionSave.innerHTML='<i class="bi bi-check2-circle"></i> Сохранить';
            }
        }
    }

    function resetFilters() {
        filterCity.value='';
        filterResponsible.value='';
        if (filterLiquidity) filterLiquidity.value='liquid';
        if (filterNeedsReplacement) filterNeedsReplacement.checked=false;
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

    function selectedExportSheets() {
        return {
            summary:Boolean($('excel-sheet-summary')?.checked),
            matrix:Boolean($('excel-sheet-matrix')?.checked),
            dealers:Boolean($('excel-sheet-dealers')?.checked),
            issues:Boolean($('excel-sheet-issues')?.checked),
            pos:Boolean($('excel-sheet-pos')?.checked),
            inspection:Boolean($('excel-sheet-inspection')?.checked)
        };
    }

    function exportScopeText() {
        const data=getFilteredData();
        const city=filterCity?.value || 'Все города';
        const responsible=filterResponsible?.selectedOptions?.[0]?.textContent || 'Все ответственные';
        const liquidity=filterLiquidity?.selectedOptions?.[0]?.textContent || 'Ликвидные + POS';
        const dealerText=selectedDealerIds.size ? `${selectedDealerIds.size} выбрано` : `Все (${data.headers.length})`;
        const productText=selectedProductSkus.size ? `${selectedProductSkus.size} выбрано` : `Все (${data.matrix.length})`;
        return {city,responsible,liquidity,dealerText,productText};
    }

    function renderExportScope() {
        if(!excelExportScope) return;
        const scope=exportScopeText();
        excelExportScope.innerHTML=`
            <div><small>Город</small><strong>${safeText(scope.city)}</strong></div>
            <div><small>Ответственный</small><strong>${safeText(scope.responsible)}</strong></div>
            <div><small>Актуальность</small><strong>${safeText(scope.liquidity)}</strong></div>
            <div><small>Дилеры</small><strong>${safeText(scope.dealerText)}</strong></div>
            <div><small>Позиции</small><strong>${safeText(scope.productText)}</strong></div>
        `;
    }

    function openExcelExport() {
        if (!fullData.matrix.length) return;
        renderExportScope();
        excelExportModal?.show();
    }

    const excelColors = {
        dark:'FF25262A',
        red:'FFB9040A',
        redSoft:'FFFFEEEE',
        green:'FF397A55',
        greenSoft:'FFEAF5ED',
        blue:'FF4C6E91',
        blueSoft:'FFEDF3F8',
        amber:'FF956718',
        amberSoft:'FFFFF4D8',
        gray:'FF8E9096',
        graySoft:'FFF4F2EF',
        line:'FFE6E1DD',
        white:'FFFFFFFF'
    };

    function styleTitleRow(row, fill = excelColors.dark) {
        row.height=28;
        row.eachCell(cell=>{
            cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:fill}};
            cell.font={bold:true,color:{argb:excelColors.white},size:11};
            cell.alignment={vertical:'middle',horizontal:'left'};
        });
    }

    function styleHeaderRow(row) {
        row.height=25;
        row.eachCell(cell=>{
            cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:excelColors.graySoft}};
            cell.font={bold:true,color:{argb:excelColors.dark},size:10};
            cell.alignment={vertical:'middle',horizontal:'center',wrapText:true};
            cell.border={
                top:{style:'thin',color:{argb:excelColors.line}},
                left:{style:'thin',color:{argb:excelColors.line}},
                bottom:{style:'thin',color:{argb:excelColors.line}},
                right:{style:'thin',color:{argb:excelColors.line}}
            };
        });
    }

    function applyGridBorders(worksheet, fromRow, toRow, fromCol, toCol) {
        for(let r=fromRow;r<=toRow;r++){
            for(let col=fromCol;col<=toCol;col++){
                const cell=worksheet.getCell(r,col);
                cell.border={
                    top:{style:'hair',color:{argb:excelColors.line}},
                    left:{style:'hair',color:{argb:excelColors.line}},
                    bottom:{style:'hair',color:{argb:excelColors.line}},
                    right:{style:'hair',color:{argb:excelColors.line}}
                };
            }
        }
    }

    function setStatusCellStyle(cell,state) {
        const map={
            confirmed:{fill:excelColors.greenSoft,font:excelColors.green},
            manual:{fill:excelColors.blueSoft,font:excelColors.blue},
            workshop:{fill:excelColors.amberSoft,font:excelColors.amber},
            missing:{fill:excelColors.graySoft,font:excelColors.gray},
            'pos-present':{fill:'FFF1EDFA',font:'FF6A5592'},
            'pos-missing':{fill:excelColors.graySoft,font:excelColors.gray}
        };
        const style=map[state]||map.missing;
        cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:style.fill}};
        cell.font={bold:true,color:{argb:style.font},size:9};
        cell.alignment={vertical:'middle',horizontal:'center',wrapText:true};
    }

    function matrixCellExportValue(cell) {
        const state=cellState(cell);
        if(cell?.is_pos){
            const qty=n(cell.value);
            return {state,value:qty>0?qty:''};
        }
        const qty=n(cell?.sample_qty);
        if(state==='confirmed') return {state,value:qty?`Подтверждено ×${qty}`:'Подтверждено'};
        if(state==='manual') return {state,value:'Только матрица'};
        if(state==='workshop') return {state,value:`Только Цех ×${qty}`};
        return {state,value:''};
    }

    function dealerExportStats(dealerId,data) {
        const index=fullData.headers.findIndex(h=>idOf(h.id)===String(dealerId));
        const products=data.matrix.filter(row=>row.type!=='pos');
        const pos=data.matrix.filter(row=>row.type==='pos');
        let present=0,confirmed=0,manual=0,workshop=0,samples=0,posUnits=0;
        products.forEach(row=>{
            const cell=row.dealers[index]||{};
            const state=cellState(cell);
            if(state!=='missing')present++;
            if(state==='confirmed')confirmed++;
            if(state==='manual')manual++;
            if(state==='workshop')workshop++;
            samples+=n(cell.sample_qty);
        });
        pos.forEach(row=>{posUnits+=n(row.dealers[index]?.value);});
        return {
            total:products.length,
            present,
            coverage:products.length?Math.round((present/products.length)*100):0,
            confirmed,
            manual,
            workshop,
            issues:manual+workshop,
            missing:Math.max(0,products.length-present),
            samples,
            posUnits
        };
    }

    function addSummarySheet(workbook,data) {
        const ws=workbook.addWorksheet('Сводка',{properties:{tabColor:{argb:excelColors.red}}});
        ws.views=[{state:'frozen',ySplit:4}];
        ws.columns=[
            {width:25},{width:24},{width:24},{width:24},{width:24},{width:24}
        ];

        ws.mergeCells('A1:F2');
        const title=ws.getCell('A1');
        title.value='IDEAL FLOOR — ВЫСТАВЛЕННОСТЬ';
        title.fill={type:'pattern',pattern:'solid',fgColor:{argb:excelColors.dark}};
        title.font={bold:true,color:{argb:excelColors.white},size:18};
        title.alignment={vertical:'middle',horizontal:'left'};
        ws.getRow(1).height=26;ws.getRow(2).height=20;

        const scope=exportScopeText();
        ws.mergeCells('A3:F3');
        ws.getCell('A3').value=`Сформировано: ${new Date().toLocaleString('ru-RU')} · Город: ${scope.city} · Ответственный: ${scope.responsible} · Актуальность: ${scope.liquidity} · Дилеры: ${scope.dealerText} · Позиции: ${scope.productText}`;
        ws.getCell('A3').font={color:{argb:excelColors.gray},size:9};
        ws.getCell('A3').alignment={wrapText:true,vertical:'middle'};
        ws.getRow(3).height=30;

        const stats=calculateStats(data);
        const kpis=[
            ['Дилеров',stats.dealers,'в выборке'],
            ['Выставлено',stats.coverage+'%',`${stats.present} из ${stats.totalCells}`],
            ['Подтверждено',stats.confirmedPercent+'%',`${stats.confirmed} совпадений`],
            ['Расхождения',stats.discrepancies,`${stats.manualOnly} матрица / ${stats.workshopOnly} цех`],
            ['Образцов',stats.samples,'шт по Цеху'],
            ['POS',stats.posUnits,'шт']
        ];
        const header=ws.addRow(['ПОКАЗАТЕЛЬ','ЗНАЧЕНИЕ','КОММЕНТАРИЙ','','','']);
        styleHeaderRow(header);
        ws.mergeCells(header.number,3,header.number,6);

        kpis.forEach((item,index)=>{
            const row=ws.addRow([item[0],item[1],item[2]]);
            ws.mergeCells(row.number,3,row.number,6);
            row.getCell(1).font={bold:true,color:{argb:excelColors.dark}};
            row.getCell(2).font={bold:true,size:13,color:{argb:index===3&&stats.discrepancies?excelColors.amber:excelColors.dark}};
            row.getCell(3).font={color:{argb:excelColors.gray}};
            row.height=24;
        });

        ws.addRow([]);
        const legendTitle=ws.addRow(['ЛЕГЕНДА СТАТУСОВ']);
        ws.mergeCells(legendTitle.number,1,legendTitle.number,6);
        styleTitleRow(legendTitle,excelColors.red);

        const legend=[
            ['Подтверждено','Матрица и Цех совпадают','confirmed'],
            ['Только матрица','Есть ручная отметка, но выдача Цеха не найдена','manual'],
            ['Только Цех','Есть образец по Цеху, но нет отметки в матрице','workshop'],
            ['Нет образца','Нет ни ручной отметки, ни выдачи из Цеха','missing']
        ];
        legend.forEach(item=>{
            const row=ws.addRow([item[0],item[1]]);
            ws.mergeCells(row.number,2,row.number,6);
            setStatusCellStyle(row.getCell(1),item[2]);
            row.getCell(2).alignment={wrapText:true,vertical:'middle'};
            row.getCell(2).font={color:{argb:excelColors.dark},size:9};
            row.height=25;
        });

        ws.addRow([]);
        const filterTitle=ws.addRow(['ТЕКУЩИЕ ФИЛЬТРЫ']);
        ws.mergeCells(filterTitle.number,1,filterTitle.number,6);
        styleTitleRow(filterTitle,excelColors.dark);
        [
            ['Город',scope.city],
            ['Ответственный',scope.responsible],
            ['Актуальность',scope.liquidity],
            ['Дилеры',scope.dealerText],
            ['Позиции',scope.productText]
        ].forEach(item=>{
            const row=ws.addRow(item);
            row.getCell(1).font={bold:true,color:{argb:excelColors.gray}};
            row.getCell(2).font={bold:true,color:{argb:excelColors.dark}};
        });
        return ws;
    }

    function addMatrixSheet(workbook,data) {
        const dealerCount=data.headers.length;
        const lastCol=dealerCount+3;
        const ws=workbook.addWorksheet('Матрица',{properties:{tabColor:{argb:excelColors.dark}}});
        ws.views=[{state:'frozen',xSplit:2,ySplit:4}];

        ws.mergeCells(1,1,1,lastCol);
        ws.getCell(1,1).value='IDEAL FLOOR — Матрица выставленности';
        styleTitleRow(ws.getRow(1));
        ws.mergeCells(2,1,2,lastCol);
        ws.getCell(2,1).value='Статусы: зелёный — подтверждено, синий — только матрица, жёлтый — только Цех.';
        ws.getCell(2,1).font={color:{argb:excelColors.gray},italic:true,size:9};

        const headers=['Артикул','Название',...data.headers.map(h=>`${h.name} · ${h.city||'—'}`),'Сводка'];
        const headerRow=ws.getRow(4);
        headerRow.values=headers;
        styleHeaderRow(headerRow);

        ws.getColumn(1).width=16;
        ws.getColumn(2).width=34;
        for(let col=3;col<lastCol;col++) ws.getColumn(col).width=18;
        ws.getColumn(lastCol).width=16;

        const indices=visibleOriginalIndices(data.headers);
        data.matrix.forEach(row=>{
            let present=0;
            const values=[row.type==='pos'?'POS':row.sku,row.type!=='pos' && row.is_liquid===false ? `${row.name} [НЕЛИКВИД]` : row.name];
            const states=[];
            indices.forEach(index=>{
                const cell=row.dealers[index]||{};
                const exported=matrixCellExportValue(cell);
                if(row.type==='pos'){
                    if(n(cell.value)>0)present++;
                }else if(exported.state!=='missing'){
                    present++;
                }
                values.push(exported.value);
                states.push(exported.state);
            });
            const total=data.headers.length;
            values.push(`${present}/${total} · ${total?Math.round((present/total)*100):0}%`);
            const excelRow=ws.addRow(values);
            excelRow.height=30;
            excelRow.getCell(1).font={bold:true,color:{argb:row.type==='pos'?excelColors.amber:excelColors.dark}};
            excelRow.getCell(2).alignment={wrapText:true,vertical:'middle'};
            states.forEach((state,index)=>setStatusCellStyle(excelRow.getCell(index+3),state));
            excelRow.getCell(lastCol).font={bold:true,color:{argb:excelColors.dark}};
            excelRow.getCell(lastCol).alignment={horizontal:'center'};
        });

        ws.autoFilter={from:{row:4,column:1},to:{row:4,column:lastCol}};
        applyGridBorders(ws,4,ws.lastRow.number,1,lastCol);
        return ws;
    }

    function addDealersSheet(workbook,data) {
        const ws=workbook.addWorksheet('Дилеры',{properties:{tabColor:{argb:excelColors.green}}});
        ws.views=[{state:'frozen',ySplit:2}];
        const columns=[
            ['Дилер',28],['Город',16],['Ответственный',20],['Выставлено %',14],['Есть',10],
            ['Подтверждено',14],['Только матрица',14],['Только Цех',12],['Расхождения',13],['Нет',10],['Образцов',11],['POS, шт',10]
        ];
        ws.columns=columns.map(([header,width])=>({header,width}));
        styleHeaderRow(ws.getRow(1));

        data.headers.forEach(dealer=>{
            const s=dealerExportStats(idOf(dealer.id),data);
            const row=ws.addRow([
                dealer.name,dealer.city||'',dealer.responsible||'',s.coverage,s.present,s.confirmed,s.manual,s.workshop,s.issues,s.missing,s.samples,s.posUnits
            ]);
            row.height=24;
            row.getCell(4).numFmt='0"%"';
            if(s.issues){
                row.getCell(9).fill={type:'pattern',pattern:'solid',fgColor:{argb:excelColors.amberSoft}};
                row.getCell(9).font={bold:true,color:{argb:excelColors.amber}};
            }
            if(s.coverage>=70) row.getCell(4).font={bold:true,color:{argb:excelColors.green}};
            else if(s.coverage>=40) row.getCell(4).font={bold:true,color:{argb:excelColors.amber}};
            else row.getCell(4).font={bold:true,color:{argb:excelColors.red}};
        });
        ws.autoFilter={from:'A1',to:'L1'};
        applyGridBorders(ws,1,ws.lastRow.number,1,12);
        return ws;
    }

    function addIssuesSheet(workbook,data) {
        const ws=workbook.addWorksheet('Расхождения',{properties:{tabColor:{argb:excelColors.amber}}});
        ws.views=[{state:'frozen',ySplit:2}];
        const columns=[
            ['Дилер',28],['Город',16],['Ответственный',20],['Артикул',16],['Товар',34],['Статус',18],['Образцов по Цеху',16],['Что проверить',34]
        ];
        ws.columns=columns.map(([header,width])=>({header,width}));
        styleHeaderRow(ws.getRow(1));

        const indices=visibleOriginalIndices(data.headers);
        data.headers.forEach((dealer,visibleIndex)=>{
            const originalIndex=indices[visibleIndex];
            data.matrix.filter(row=>row.type!=='pos').forEach(row=>{
                const cell=row.dealers[originalIndex]||{};
                const state=cellState(cell);
                if(!['manual','workshop'].includes(state)) return;
                const action=state==='manual'
                    ? 'Проверить, выдавался ли образец из Цеха / актуальна ли ручная отметка'
                    : 'Добавить отметку в Матрицу или проверить фактическое наличие у дилера';
                const excelRow=ws.addRow([
                    dealer.name,dealer.city||'',dealer.responsible||'',row.sku,row.name,stateLabel(state),n(cell.sample_qty),action
                ]);
                setStatusCellStyle(excelRow.getCell(6),state);
                excelRow.getCell(8).alignment={wrapText:true,vertical:'middle'};
                excelRow.height=32;
            });
        });
        ws.autoFilter={from:'A1',to:'H1'};
        if(ws.lastRow.number>1) applyGridBorders(ws,1,ws.lastRow.number,1,8);
        return ws;
    }


    function addInspectionSheet(workbook,data) {
        const ws=workbook.addWorksheet('Замены и ценники',{properties:{tabColor:{argb:excelColors.red}}});
        ws.views=[{state:'frozen',xSplit:3,ySplit:1}];
        const columns=[
            ['Дилер',25],['Город',18],['Тип',17],['Артикул / POS',27],['Позиция',39],
            ['Выставлено',14],['Состояние',21],['На замену, шт',16],
            ['Ценник',18],['Ценников, шт',15],['Примечание',43],['Проверено',20],['Сотрудник',22]
        ];
        ws.columns=columns.map(([header,width])=>({header,width}));
        styleHeaderRow(ws.getRow(1));
        const indices=visibleOriginalIndices(data.headers);
        const conditionLabel={ok:'В порядке',damaged:'Повреждено — заменить',missing:'Отсутствует — установить'};
        const tagLabel={unknown:'Не проверен',ok:'Актуален',replace:'Заменить',missing:'Нет ценника'};
        data.headers.forEach((dealer,visibleIndex)=>{
            const index=indices[visibleIndex];
            data.matrix.forEach(row=>{
                const cell=row.dealers[index]||{};
                const tagKnown=row.type!=='pos'&&knownPriceTag(cell);
                if(!needsAttention(cell)&&!tagKnown&&!cell.note&&!n(cell.priceTagQty))return;
                const type=row.type==='pos'?'Оборудование':'Ламинат';
                const value=row.type==='pos'?n(cell.value):n(cell.value)?'Да':'Нет';
                const checked=cell.checkedAt?new Date(cell.checkedAt).toLocaleString('ru-RU'):'';
                const excelRow=ws.addRow([
                    dealer.name,dealer.city||'',type,row.type==='pos'?row.name:row.sku,
                    row.name,value,conditionLabel[cell.condition]||'В порядке',
                    n(cell.replacementQty),row.type==='pos'?'—':tagLabel[cell.priceTag]||'Не проверен',
                    row.type==='pos'?'':n(cell.priceTagQty),cell.note||'',checked,cell.checkedBy||''
                ]);
                if(needsAttention(cell)){
                    excelRow.getCell(7).fill={type:'pattern',pattern:'solid',fgColor:{argb:excelColors.amberSoft}};
                    excelRow.getCell(7).font={bold:true,color:excelColors.amber};
                    if(needsTagAttention(cell)){
                        excelRow.getCell(9).fill={type:'pattern',pattern:'solid',fgColor:{argb:excelColors.redSoft}};
                        excelRow.getCell(9).font={bold:true,color:excelColors.red};
                    }
                }
                excelRow.getCell(11).alignment={wrapText:true,vertical:'middle'};
                excelRow.height=30;
            });
        });
        ws.autoFilter={from:'A1',to:'M1'};
        if(ws.lastRow.number>1)applyGridBorders(ws,1,ws.lastRow.number,1,13);
        return ws;
    }

    function addPosSheet(workbook,data) {
        const ws=workbook.addWorksheet('POS',{properties:{tabColor:{argb:'FF6A5592'}}});
        ws.views=[{state:'frozen',ySplit:2}];
        const columns=[
            ['Дилер',28],['Город',16],['Ответственный',20],['POS-материал',36],['Количество, шт',14]
        ];
        ws.columns=columns.map(([header,width])=>({header,width}));
        styleHeaderRow(ws.getRow(1));
        const indices=visibleOriginalIndices(data.headers);
        data.headers.forEach((dealer,visibleIndex)=>{
            const originalIndex=indices[visibleIndex];
            data.matrix.filter(row=>row.type==='pos').forEach(row=>{
                ws.addRow([dealer.name,dealer.city||'',dealer.responsible||'',row.name,n(row.dealers[originalIndex]?.value)]);
            });
        });
        ws.autoFilter={from:'A1',to:'E1'};
        if(ws.lastRow.number>1) applyGridBorders(ws,1,ws.lastRow.number,1,5);
        return ws;
    }

    async function exportExcel() {
        const sheets=selectedExportSheets();
        if(!Object.values(sheets).some(Boolean)) return alert('Выберите хотя бы один лист для экспорта');
        if(!window.ExcelJS) return alert('Модуль Excel не загрузился. Обновите страницу и попробуйте ещё раз.');

        const data=getFilteredData();
        const oldHtml=excelExportConfirm?.innerHTML;
        if(excelExportConfirm){
            excelExportConfirm.disabled=true;
            excelExportConfirm.innerHTML='<span class="spinner-border spinner-border-sm me-1"></span>Формируем Excel…';
        }

        try{
            const workbook=new ExcelJS.Workbook();
            workbook.creator='IDEAL FLOOR CRM';
            workbook.company='IDEAL FLOOR';
            workbook.subject='Выставленность дилерской сети';
            workbook.created=new Date();
            workbook.modified=new Date();

            if(sheets.summary) addSummarySheet(workbook,data);
            if(sheets.matrix) addMatrixSheet(workbook,data);
            if(sheets.dealers) addDealersSheet(workbook,data);
            if(sheets.issues) addIssuesSheet(workbook,data);
            if(sheets.pos) addPosSheet(workbook,data);
            if(sheets.inspection) addInspectionSheet(workbook,data);

            const buffer=await workbook.xlsx.writeBuffer();
            const blob=new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
            const url=URL.createObjectURL(blob);
            const now=new Date();
            const stamp=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
            const a=document.createElement('a');
            a.href=url;
            a.download=`IDEAL_FLOOR_Выставленность_${stamp}.xlsx`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(()=>URL.revokeObjectURL(url),1000);
            excelExportModal?.hide();
        }catch(error){
            console.error('Excel export error:',error);
            alert('Не удалось сформировать Excel: '+(error.message||'неизвестная ошибка'));
        }finally{
            if(excelExportConfirm){
                excelExportConfirm.disabled=false;
                excelExportConfirm.innerHTML=oldHtml;
            }
        }
    }

    document.addEventListener('click',event=>{
        const markAll=event.target.closest('[data-exhibition-mark-all]');
        if(markAll){
            event.preventDefault();
            if(!markAll.disabled)markAllVisibleSamples(markAll.dataset.exhibitionDealer);
            return;
        }
        const quick=event.target.closest('[data-exhibition-presence]');
        if(quick){
            event.preventDefault();
            toggleStagedPresence(quick.dataset.editDealer,quick.dataset.editKey);
            return;
        }
        const edit=event.target.closest('[data-exhibition-edit]');
        if(edit){
            event.preventDefault();
            openInspectionEditor({dealerId:edit.dataset.editDealer,kind:edit.dataset.editKind,key:edit.dataset.editKey});
            return;
        }
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
    filterNeedsReplacement?.addEventListener('change',()=>renderMatrix());
    filterLiquidity?.addEventListener('change',()=>{
        selectedProductSkus.clear();
        if (productSearch) productSearch.value='';
        populateProductList();
        renderMatrix();
    });
    resetFiltersBtn?.addEventListener('click',resetFilters);
    exportBtn?.addEventListener('click',openExcelExport);
    excelExportConfirm?.addEventListener('click',exportExcel);
    excelSelectAll?.addEventListener('click',()=>{
        const checkboxes=['excel-sheet-summary','excel-sheet-matrix','excel-sheet-dealers','excel-sheet-issues','excel-sheet-pos','excel-sheet-inspection']
            .map(id=>$(id)).filter(Boolean);
        const allChecked=checkboxes.every(input=>input.checked);
        checkboxes.forEach(input=>input.checked=!allChecked);
        excelSelectAll.textContent=allChecked?'Выбрать всё':'Снять всё';
    });

    document.querySelectorAll('[data-report-view]').forEach(button=>{
        button.addEventListener('click',()=>setView(button.dataset.reportView));
    });

    editModeButton?.addEventListener('click',toggleBatchEditMode);
    batchSave?.addEventListener('click',saveStagedPresence);
    batchUndo?.addEventListener('click',undoStagedPresence);
    batchDiscard?.addEventListener('click',discardStagedPresence);
    window.addEventListener('beforeunload',event=>{
        if(!stagedPresence.size)return;
        event.preventDefault();
        event.returnValue='';
    });
    inspectionForm?.addEventListener('submit',saveInspection);
    $('exhibition-inspection-condition')?.addEventListener('change',event=>{
        const input=$('exhibition-inspection-replace-qty');
        if(input){
            if(event.target.value==='ok')input.value=0;
            else if(!(Number(input.value)>0))input.value=1;
        }
        updatePosQuantityPreview();
    });
    $('exhibition-pos-quantity')?.addEventListener('input',updatePosQuantityPreview);
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