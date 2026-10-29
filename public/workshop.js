document.addEventListener('DOMContentLoaded', () => {
    const API = '/api/workshop';
    const state = {
        products: [], dealers: [], materials: [], recipes: [], laminateStocks: [],
        dealerAssets: [], productions: [], movements: [], stats: {}
    };

    const $ = id => document.getElementById(id);
    const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
    const n = value => {
        const x = Number(String(value ?? '').replace(',', '.'));
        return Number.isFinite(x) ? x : 0;
    };
    const fmt = (value, digits = 0) => n(value).toLocaleString('ru-RU', { maximumFractionDigits: digits });
    const dateText = value => {
        if (!value) return '—';
        const d = new Date(value);
        return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('ru-RU', { day:'2-digit', month:'2-digit', year:'2-digit' });
    };
    const todayValue = () => new Date().toISOString().slice(0,10);
    const toast = (message, type = 'success') => window.showToast ? window.showToast(message, type) : alert(message);

    function idOf(value) {
        if (!value) return '';
        return String(value.id || value._id || value);
    }
    function productById(id) { return state.products.find(item => idOf(item) === String(id || '')); }
    function recipeById(id) { return state.recipes.find(item => idOf(item) === String(id || '')); }
    function materialById(id) { return state.materials.find(item => idOf(item) === String(id || '')); }
    function dealerById(id) { return state.dealers.find(item => idOf(item) === String(id || '')); }

    function packQty(product, override = 0) {
        const direct = Math.round(n(override));
        if (direct > 0) return direct;
        const raw = product?.characteristics?.package_qty;
        const match = String(raw ?? '').replace(',', '.').match(/\d+(?:\.\d+)?/);
        return match ? Math.round(Number(match[0])) : 0;
    }

    function gcd(a, b) {
        a = Math.abs(Math.round(a)); b = Math.abs(Math.round(b));
        while (b) [a,b] = [b,a%b];
        return a || 1;
    }

    function noWasteBatch(pack, perUnit) {
        pack = Math.round(n(pack)); perUnit = Math.round(n(perUnit));
        if (pack <= 0 || perUnit <= 0) return null;
        const g = gcd(pack, perUnit);
        return { packs: perUnit / g, output: pack / g, planks: (perUnit / g) * pack };
    }

    const modalIds = {
        receipt:'ws-receipt-modal', production:'ws-production-modal', dealer:'ws-dealer-modal',
        material:'ws-material-modal', writeoff:'ws-writeoff-modal', recipe:'ws-recipe-modal',
        stocktake:'ws-stocktake-modal', 'new-material':'ws-new-material-modal'
    };
    function showModal(name) {
        const el = $(modalIds[name]);
        if (!el) return;
        if (name === 'receipt') resetReceipt();
        if (name === 'production') resetProduction();
        if (name === 'dealer') resetDealerMovement();
        if (name === 'material') resetMaterialMovement();
        if (name === 'writeoff') resetWriteoff();
        if (name === 'recipe') resetRecipe();
        if (name === 'stocktake') buildStocktake();
        if (name === 'new-material') $('ws-new-material-form')?.reset();
        bootstrap.Modal.getOrCreateInstance(el).show();
    }
    function hideModal(name) {
        const el = $(modalIds[name]);
        if (el) bootstrap.Modal.getOrCreateInstance(el).hide();
    }

    document.querySelectorAll('[data-open-workshop]').forEach(btn => {
        btn.addEventListener('click', () => showModal(btn.dataset.openWorkshop));
    });

    document.querySelectorAll('[data-ws-tab]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('[data-ws-tab]').forEach(x => x.classList.toggle('active', x === btn));
            document.querySelectorAll('[data-ws-pane]').forEach(pane => pane.classList.toggle('active', pane.dataset.wsPane === btn.dataset.wsTab));
        });
    });

    async function load() {
        try {
            if (window.CRMAuth?.ready) await CRMAuth.ready;
            if (window.CRMAuth && !CRMAuth.can('can_view_workshop')) return;
            const response = await fetch(API + '/bootstrap');
            if (!response.ok) throw new Error('Не удалось загрузить данные цеха');
            const data = await response.json();
            Object.keys(state).forEach(key => { if (Object.prototype.hasOwnProperty.call(data, key)) state[key] = data[key]; });
            renderAll();
        } catch (error) {
            console.error(error);
            toast(error.message || 'Ошибка загрузки цеха', 'error');
        }
    }

    function renderAll() {
        renderKpis();
        renderProduction();
        renderAttention();
        renderStocks();
        renderDealerAssets();
        renderRecipes();
        renderHistory();
        populateFormSelects();
    }

    function renderKpis() {
        $('ws-kpi-today').textContent = fmt(state.stats.todayProduction);
        $('ws-kpi-finished').textContent = fmt(state.stats.finishedStock);
        $('ws-kpi-laminate').textContent = fmt(state.stats.laminatePlanks);
        $('ws-kpi-low').textContent = fmt(state.stats.lowMaterials);
    }

    function renderProduction() {
        const host = $('ws-production-list');
        if (!host) return;
        if (!state.productions.length) {
            host.innerHTML = '<div class="workshop-empty"><i class="bi bi-hammer"></i>Пока нет записей производства</div>';
            return;
        }
        host.innerHTML = state.productions.slice(0,12).map(item => {
            const ops = (item.operations || []).map(op => op.type).filter(Boolean).join(', ');
            return `<div class="workshop-feed-item">
                <span class="icon"><i class="bi bi-tools"></i></span>
                <div><strong>${esc(item.recipe?.name || 'Изделие')}</strong><small>${dateText(item.date)}${ops ? ' · '+esc(ops) : ''}${item.scrapPlanks ? ' · отход '+fmt(item.scrapPlanks)+' пл.' : ''}</small></div>
                <b>+${fmt(item.outputQty)} шт</b>
            </div>`;
        }).join('');
    }

    function renderAttention() {
        const host = $('ws-attention-list');
        if (!host) return;
        const items = [];
        state.materials.forEach(item => {
            if (n(item.minQty) > 0 && n(item.stockQty) <= n(item.minQty)) {
                items.push({ type:'warning', icon:'exclamation-triangle', title:item.name, text:`Остаток ${fmt(item.stockQty,2)} ${item.unit || 'шт'} · минимум ${fmt(item.minQty,2)}` });
            }
        });
        state.recipes.forEach(item => {
            if (n(item.stockQty) <= 0) {
                items.push({ type:'danger', icon:'box', title:item.name, text:'Готовых изделий нет в остатке' });
            }
        });
        state.laminateStocks.forEach(stock => {
            if (stock.product?.is_liquid === false && n(stock.planksQty) > 0) {
                items.push({ type:'warning', icon:'clock-history', title:stock.product?.name || stock.product?.sku, text:`Неактуальная позиция · в цехе ${fmt(stock.planksQty)} планок` });
            }
        });
        host.innerHTML = items.length ? items.slice(0,12).map(item => `<div class="workshop-attention-item is-${item.type}">
            <span class="icon"><i class="bi bi-${item.icon}"></i></span><div><strong>${esc(item.title)}</strong><small>${esc(item.text)}</small></div><i class="bi bi-chevron-right text-muted"></i>
        </div>`).join('') : '<div class="workshop-empty"><i class="bi bi-check2-circle"></i>Критичных остатков нет</div>';
    }

    function stockSearchTerm() { return ($('ws-stock-search')?.value || '').trim().toLowerCase(); }

    function renderStocks() {
        const term = stockSearchTerm();
        const laminateHost = $('ws-laminate-stock');
        const rows = state.laminateStocks.filter(stock => {
            const text = `${stock.product?.sku || ''} ${stock.product?.name || ''}`.toLowerCase();
            return !term || text.includes(term);
        });
        laminateHost.innerHTML = rows.length ? `<table class="workshop-table"><thead><tr><th>SKU / декор</th><th>Актуальность</th><th>В упаковке</th><th>Остаток</th><th>Эквивалент</th></tr></thead><tbody>${rows.map(stock => {
            const pq = packQty(stock.product);
            const planks = n(stock.planksQty);
            const packs = pq > 0 ? Math.floor(planks / pq) : 0;
            const loose = pq > 0 ? Math.round(planks - packs*pq) : planks;
            return `<tr><td><div class="ws-stock-main"><strong>${esc(stock.product?.sku || '—')} · ${esc(stock.product?.name || '')}</strong><small>${esc(stock.product?.characteristics?.size || '')}</small></div></td>
            <td><span class="ws-liquid ${stock.product?.is_liquid === false ? 'is-old':''}">${stock.product?.is_liquid === false ? 'неактуален':'актуален'}</span></td>
            <td>${pq ? pq+' пл.' : 'не задано'}</td><td><strong>${fmt(planks)} пл.</strong></td><td>${pq ? `${packs} уп. + ${loose} пл.` : '—'}</td></tr>`;
        }).join('')}</tbody></table>` : '<div class="workshop-empty"><i class="bi bi-layers"></i>Ламинат в цех ещё не принимали</div>';

        const finished = state.recipes.filter(item => !term || `${item.name} ${item.sku || ''} ${item.product?.name || ''}`.toLowerCase().includes(term));
        $('ws-finished-stock').innerHTML = finished.length ? finished.map(item => `<div class="workshop-stock-card">
            <div><strong>${esc(item.name)}</strong><small>${esc(item.outputType === 'sample' ? 'образец / планшет' : item.outputType === 'stand' ? 'стенд' : item.outputType)}${item.product ? ' · '+esc(item.product.sku || '') : ''}</small></div><b>${fmt(item.stockQty)} шт</b>
        </div>`).join('') : '<div class="workshop-empty">Нет рецептур</div>';

        const materials = state.materials.filter(item => !term || `${item.code || ''} ${item.name}`.toLowerCase().includes(term));
        $('ws-material-stock').innerHTML = materials.length ? materials.map(item => {
            const low = n(item.minQty) > 0 && n(item.stockQty) <= n(item.minQty);
            return `<div class="workshop-stock-card ${low?'is-low':''}"><div><strong>${esc(item.name)}</strong><small>${esc(item.code || item.category || '')}${low ? ' · минимум '+fmt(item.minQty,2):''}</small></div><b>${fmt(item.stockQty,2)} ${esc(item.unit || 'шт')}</b></div>`;
        }).join('') : '<div class="workshop-empty">Материалы не найдены</div>';
    }

    function renderDealerAssets() {
        const host = $('ws-dealer-assets');
        const term = ($('ws-dealer-search')?.value || '').trim().toLowerCase();
        const groups = new Map();
        state.dealerAssets.forEach(asset => {
            if (!asset.dealer || !asset.recipe || n(asset.qty) <= 0) return;
            const key = idOf(asset.dealer);
            if (!groups.has(key)) groups.set(key, { dealer: asset.dealer, assets: [] });
            groups.get(key).assets.push(asset);
        });
        const list = [...groups.values()].filter(group => {
            const text = [group.dealer?.name, group.dealer?.city, ...group.assets.flatMap(a => [a.recipe?.name,a.recipe?.product?.sku,a.recipe?.product?.name])].join(' ').toLowerCase();
            return !term || text.includes(term);
        });
        host.innerHTML = list.length ? list.map(group => `<article class="workshop-dealer-card">
            <div class="workshop-dealer-head"><div><strong>${esc(group.dealer.name)}</strong><small>${esc(group.dealer.city || '')}</small></div><a href="/dealer.html?id=${idOf(group.dealer)}" class="workshop-link-btn">Профиль</a></div>
            <div class="workshop-asset-list">${group.assets.map(asset => `<span class="workshop-asset-pill">${asset.recipe?.product?.is_liquid === false ? '<i class="bi bi-clock text-warning"></i>' : ''}<span>${esc(asset.recipe.name)}</span><b>${fmt(asset.qty)}</b></span>`).join('')}</div>
        </article>`).join('') : '<div class="workshop-empty"><i class="bi bi-shop"></i>У дилеров пока ничего не числится</div>';
    }

    function recipePack(item) {
        return packQty(item.product, item.packQtyOverride);
    }

    function renderRecipes() {
        const host = $('ws-recipes');
        if (!host) return;
        host.innerHTML = state.recipes.length ? state.recipes.map(item => {
            const pq = recipePack(item);
            const batch = noWasteBatch(pq, item.planksPerUnit);
            const materialCount = (item.materials || []).length + (item.components || []).length;
            return `<article class="workshop-recipe-card" data-recipe-edit="${idOf(item)}">
                <div class="top"><div><strong>${esc(item.name)}</strong><small>${esc(item.sku || '')}${item.product ? ' · '+esc(item.product.sku || '') : ''}</small></div><span class="ws-liquid ${item.product?.is_liquid === false?'is-old':''}">${item.outputType === 'sample'?'образец':item.outputType === 'stand'?'стенд':esc(item.outputType)}</span></div>
                <div class="numbers"><span>Планок / шт<b>${fmt(item.planksPerUnit)}</b></span><span>На складе<b>${fmt(item.stockQty)} шт</b></span><span>Компонентов<b>${materialCount}</b></span></div>
                <small class="mt-2">${batch ? `Безотходно: ${batch.packs} уп. → ${batch.output} шт` : 'Норма ламината не задана'}${item.sideA || item.sideB ? ' · '+esc([item.sideA,item.sideB].filter(Boolean).join(' / ')):''}</small>
            </article>`;
        }).join('') : '<div class="workshop-empty"><i class="bi bi-diagram-3"></i>Создайте первую рецептуру</div>';
        host.querySelectorAll('[data-recipe-edit]').forEach(card => card.addEventListener('click', () => openRecipeEdit(card.dataset.recipeEdit)));
    }

    const movementLabels = {
        laminate_receipt:'Приход ламината', production_laminate:'Ламинат в производство',
        production_material:'Материал в производство', production_component:'Компонент в производство',
        production_output:'Изготовлено', dealer_issue:'Выдано дилеру', dealer_return:'Возврат от дилера',
        dealer_replacement:'Замена у дилера', writeoff:'Списание', material_receipt:'Приход материала',
        material_issue:'Расход материала', stocktake_adjustment:'Корректировка инвентаризации'
    };

    function movementName(item) {
        return item.recipe?.name || item.product ? (item.product?.sku ? item.product.sku+' '+(item.product.name||'') : item.product?.name) : item.material?.name || '—';
    }

    function renderHistory() {
        const host = $('ws-history');
        const term = ($('ws-history-search')?.value || '').trim().toLowerCase();
        const type = $('ws-history-type')?.value || '';
        const list = state.movements.filter(item => {
            if (type && item.type !== type) return false;
            const text = [movementLabels[item.type], movementName(item), item.dealer?.name, item.serviceMemoNumber, item.note, item.createdBy?.name].join(' ').toLowerCase();
            return !term || text.includes(term);
        });
        host.innerHTML = list.length ? `<table class="workshop-table"><thead><tr><th>Дата</th><th>Операция</th><th>Позиция</th><th>Кол-во</th><th>Дилер / документ</th><th>Сотрудник</th></tr></thead><tbody>${list.map(item => `<tr>
            <td>${dateText(item.date)}</td><td><strong>${esc(movementLabels[item.type] || item.type)}</strong></td><td>${esc(movementName(item))}</td>
            <td>${item.direction === 'in' ? '+' : item.direction === 'out' ? '−' : ''}${fmt(item.qty,2)} ${esc(item.unit || '')}</td>
            <td>${esc(item.dealer?.name || item.serviceMemoNumber || item.note || '—')}</td><td>${esc(item.createdBy?.name || '—')}</td>
        </tr>`).join('')}</tbody></table>` : '<div class="workshop-empty">Движения не найдены</div>';
    }

    function option(value, label, selected = false) {
        return `<option value="${esc(value)}" ${selected?'selected':''}>${esc(label)}</option>`;
    }
    function productOptions(empty = 'Выберите позицию') {
        return option('', empty) + state.products.map(item => option(idOf(item), `${item.sku || '—'} · ${item.name || ''}`)).join('');
    }
    function recipeOptions(empty = 'Выберите изделие') {
        return option('', empty) + state.recipes.map(item => option(idOf(item), `${item.name}${item.product?.sku ? ' · '+item.product.sku:''}`)).join('');
    }
    function materialOptions(empty = 'Выберите материал') {
        return option('', empty) + state.materials.map(item => option(idOf(item), `${item.name} · ${fmt(item.stockQty,2)} ${item.unit || 'шт'}`)).join('');
    }
    function dealerOptions() {
        return option('', 'Выберите дилера') + state.dealers.map(item => option(idOf(item), `${item.name} · ${item.city || ''}`)).join('');
    }

    function populateFormSelects() {
        ['ws-receipt-expected','ws-receipt-actual','ws-recipe-product'].forEach(id => { if ($(id)) $(id).innerHTML = productOptions(id === 'ws-recipe-product' ? 'Без ламината' : 'Выберите позицию'); });
        ['ws-production-recipe','ws-dealer-recipe'].forEach(id => { if ($(id)) $(id).innerHTML = recipeOptions(); });
        if ($('ws-material-id')) $('ws-material-id').innerHTML = materialOptions();
        if ($('ws-dealer-id')) $('ws-dealer-id').innerHTML = dealerOptions();
        updateWriteoffItems();
    }

    function resetReceipt() {
        $('ws-receipt-form')?.reset();
        $('ws-receipt-date').value = todayValue();
        populateFormSelects(); updateReceiptCalc();
    }
    function updateReceiptCalc() {
        const expected = productById($('ws-receipt-expected')?.value);
        const actual = productById($('ws-receipt-actual')?.value);
        const pq = packQty(actual);
        const delivered = n($('ws-receipt-delivered')?.value);
        const accepted = n($('ws-receipt-accepted')?.value);
        const loose = n($('ws-receipt-loose')?.value);
        const total = accepted*pq + loose;
        const mismatch = expected && actual && idOf(expected) !== idOf(actual);
        $('ws-receipt-calc').innerHTML = actual ? `В упаковке: <strong>${pq || 'не задано'} планок</strong> · В остаток цеха поступит: <strong>${fmt(total)} планок</strong>${mismatch ? ' · <strong class="text-danger">Позиция не совпадает с ожидаемой</strong>' : ''}${delivered !== accepted ? ' · принято не всё количество':''}` : 'Выберите фактически принятую позицию.';
    }
    ['ws-receipt-expected','ws-receipt-actual','ws-receipt-delivered','ws-receipt-accepted','ws-receipt-loose'].forEach(id => $(id)?.addEventListener('input', updateReceiptCalc));
    $('ws-receipt-expected')?.addEventListener('change', () => { if (!$('ws-receipt-actual').value) $('ws-receipt-actual').value = $('ws-receipt-expected').value; updateReceiptCalc(); });

    $('ws-receipt-form')?.addEventListener('submit', async event => {
        event.preventDefault();
        await post(API+'/laminate-receipt', {
            expectedProductId:$('ws-receipt-expected').value, actualProductId:$('ws-receipt-actual').value,
            deliveredPacks:n($('ws-receipt-delivered').value), acceptedPacks:n($('ws-receipt-accepted').value),
            acceptedLoosePlanks:n($('ws-receipt-loose').value), date:$('ws-receipt-date').value,
            discrepancyReason:$('ws-receipt-reason').value, note:$('ws-receipt-note').value
        }, 'Ламинат принят в цех', 'receipt');
    });

    function resetProduction() {
        $('ws-production-form')?.reset(); $('ws-production-date').value = todayValue(); $('ws-production-output').value = 1;
        populateFormSelects(); updateProductionCalc();
    }
    function productionRecipe() { return recipeById($('ws-production-recipe')?.value); }
    function laminateAvailableForRecipe(recipe) {
        const productId = idOf(recipe?.product);
        const stock = state.laminateStocks.find(item => idOf(item.product) === productId);
        return n(stock?.planksQty);
    }
    function updateProductionCalc() {
        const recipe = productionRecipe();
        if (!recipe) { $('ws-production-calc').textContent='Выберите изделие — CRM покажет норму и возможный выпуск.'; return; }
        const pq = recipePack(recipe);
        const packs = n($('ws-production-packs')?.value);
        const loose = n($('ws-production-loose')?.value);
        const output = n($('ws-production-output')?.value);
        const scrap = n($('ws-production-scrap')?.value);
        const accepted = packs*pq + loose;
        const need = output*n(recipe.planksPerUnit) + scrap;
        const available = laminateAvailableForRecipe(recipe);
        const batch = noWasteBatch(pq, recipe.planksPerUnit);
        const fromAccepted = n(recipe.planksPerUnit)>0 ? Math.floor(accepted/n(recipe.planksPerUnit)) : 0;
        $('ws-production-calc').innerHTML = `Норма: <strong>${fmt(recipe.planksPerUnit)} планок / изделие</strong>${pq ? ' · '+pq+' планок в упаковке':''}. 
        В цехе: <strong>${fmt(available)} планок</strong>. Принято в работу: <strong>${fmt(accepted)} планок</strong>${accepted ? ' → до '+fromAccepted+' шт':''}. 
        На указанное производство будет списано: <strong class="${need>available?'text-danger':''}">${fmt(need)} планок</strong>.
        ${batch ? `Безотходная партия: <strong>${batch.packs} уп. → ${batch.output} шт</strong>.` : ''}`;
    }
    ['ws-production-recipe','ws-production-packs','ws-production-loose','ws-production-output','ws-production-scrap'].forEach(id => $(id)?.addEventListener('input',updateProductionCalc));

    $('ws-production-form')?.addEventListener('submit', async event => {
        event.preventDefault();
        const operations = [...document.querySelectorAll('.workshop-operation-grid label')].map(label => {
            const cb = label.querySelector('.ws-operation-check');
            const qty = label.querySelector('.ws-operation-qty');
            return cb?.checked ? { type:cb.value, qty:n(qty?.value) } : null;
        }).filter(Boolean);
        await post(API+'/production', {
            recipeId:$('ws-production-recipe').value, acceptedPacks:n($('ws-production-packs').value),
            acceptedLoosePlanks:n($('ws-production-loose').value), outputQty:n($('ws-production-output').value),
            scrapPlanks:n($('ws-production-scrap').value), date:$('ws-production-date').value,
            operations, note:$('ws-production-note').value
        }, 'Производство записано', 'production');
    });

    function resetDealerMovement() {
        $('ws-dealer-form')?.reset(); $('ws-dealer-date').value=todayValue(); $('ws-dealer-qty').value=1;
        populateFormSelects(); updateDealerCurrent();
    }
    function updateDealerCurrent() {
        const dealerId=$('ws-dealer-id')?.value, recipeId=$('ws-dealer-recipe')?.value;
        const asset=state.dealerAssets.find(x=>idOf(x.dealer)===dealerId && idOf(x.recipe)===recipeId);
        const recipe=recipeById(recipeId);
        $('ws-dealer-current').innerHTML = recipe ? `В цехе готово: <strong>${fmt(recipe.stockQty)} шт</strong> · У выбранного дилера числится: <strong>${fmt(asset?.qty || 0)} шт</strong>.` : 'Выберите дилера и изделие.';
    }
    ['ws-dealer-id','ws-dealer-recipe','ws-dealer-action'].forEach(id=>$(id)?.addEventListener('change',updateDealerCurrent));
    $('ws-dealer-form')?.addEventListener('submit', async event => {
        event.preventDefault();
        await post(API+'/dealer-movement', {
            dealerId:$('ws-dealer-id').value, recipeId:$('ws-dealer-recipe').value, action:$('ws-dealer-action').value,
            qty:n($('ws-dealer-qty').value), returnCondition:$('ws-dealer-condition').value, date:$('ws-dealer-date').value,
            reason:$('ws-dealer-reason').value, note:$('ws-dealer-note').value
        }, 'Движение по дилеру проведено', 'dealer');
    });

    function resetMaterialMovement(){ $('ws-material-form')?.reset(); $('ws-material-date').value=todayValue(); populateFormSelects(); }
    $('ws-material-form')?.addEventListener('submit', async event => {
        event.preventDefault();
        const direction=$('ws-material-direction').value;
        await post(API+'/material-movement', {
            materialId:$('ws-material-id').value, direction, qty:n($('ws-material-qty').value), date:$('ws-material-date').value,
            type:direction==='in'?'material_receipt':'material_issue', note:$('ws-material-note').value
        }, 'Движение материала проведено', 'material');
    });

    $('ws-new-material-form')?.addEventListener('submit', async event => {
        event.preventDefault();
        await post(API+'/materials', {
            code:$('ws-new-material-code').value, name:$('ws-new-material-name').value, category:$('ws-new-material-category').value,
            unit:$('ws-new-material-unit').value, stockQty:n($('ws-new-material-stock').value), minQty:n($('ws-new-material-min').value),
            note:$('ws-new-material-note').value
        }, 'Материал добавлен', 'new-material');
    });

    function resetWriteoff(){ $('ws-writeoff-form')?.reset(); $('ws-writeoff-date').value=todayValue(); updateWriteoffItems(); }
    function updateWriteoffItems(){
        const type=$('ws-writeoff-type')?.value || 'laminate';
        const select=$('ws-writeoff-item'); if(!select)return;
        if(type==='laminate') select.innerHTML=option('','Выберите ламинат')+state.laminateStocks.map(x=>option(idOf(x.product),`${x.product?.sku||'—'} · ${x.product?.name||''} · ${fmt(x.planksQty)} пл.`)).join('');
        if(type==='material') select.innerHTML=materialOptions();
        if(type==='finished') select.innerHTML=recipeOptions();
        updateWriteoffHint();
    }
    function updateWriteoffHint(){
        const type=$('ws-writeoff-type')?.value,itemId=$('ws-writeoff-item')?.value,qty=n($('ws-writeoff-qty')?.value);
        if(type==='laminate'){
            const product=productById(itemId); const pq=packQty(product);
            $('ws-writeoff-hint').innerHTML=product ? `Списание ламината вводится в <strong>планках</strong>. ${pq? qty+' планок = '+(qty/pq).toFixed(2)+' уп.':''}`:'Выберите позицию.';
        }else $('ws-writeoff-hint').textContent='Списание будет зафиксировано в истории с номером служебной записки.';
    }
    ['ws-writeoff-type','ws-writeoff-item','ws-writeoff-qty'].forEach(id=>$(id)?.addEventListener('input',()=>{if(id==='ws-writeoff-type')updateWriteoffItems();else updateWriteoffHint();}));
    $('ws-writeoff-type')?.addEventListener('change',updateWriteoffItems);
    $('ws-writeoff-form')?.addEventListener('submit', async event => {
        event.preventDefault();
        const type=$('ws-writeoff-type').value,itemId=$('ws-writeoff-item').value;
        const payload={entityType:type,qty:n($('ws-writeoff-qty').value),serviceMemoNumber:$('ws-writeoff-memo').value,date:$('ws-writeoff-date').value,note:$('ws-writeoff-note').value};
        if(type==='laminate')payload.productId=itemId;if(type==='material')payload.materialId=itemId;if(type==='finished')payload.recipeId=itemId;
        await post(API+'/writeoff',payload,'Списание проведено','writeoff');
    });

    function resetRecipe(){
        $('ws-recipe-form')?.reset(); $('ws-recipe-id').value=''; $('ws-recipe-planks').value=0; $('ws-recipe-pack-override').value=0;
        $('ws-bom-materials').innerHTML=''; $('ws-bom-components').innerHTML=''; populateFormSelects(); updateRecipeCalc();
    }
    function updateRecipeCalc(){
        const product=productById($('ws-recipe-product')?.value);const per=n($('ws-recipe-planks')?.value);const pq=packQty(product,n($('ws-recipe-pack-override')?.value));const batch=noWasteBatch(pq,per);
        $('ws-recipe-calc').innerHTML=product ? `Каталог: <strong>${pq || 'не указано'} планок в упаковке</strong>.${batch?` Безотходная партия: <strong>${batch.packs} уп. (${batch.planks} планок) → ${batch.output} изделий</strong>.`:''}`:'Если изделие использует ламинат — выберите SKU.';
    }
    ['ws-recipe-product','ws-recipe-planks','ws-recipe-pack-override'].forEach(id=>$(id)?.addEventListener('input',updateRecipeCalc));
    $('ws-add-bom-material')?.addEventListener('click',()=>addBomMaterial());
    $('ws-add-bom-component')?.addEventListener('click',()=>addBomComponent());
    function addBomMaterial(item={}){
        const row=document.createElement('div');row.className='ws-bom-row';row.innerHTML=`<select class="form-select ws-bom-material-id">${materialOptions()}</select><input type="number" min="0" step="0.001" class="form-control ws-bom-qty" placeholder="кол-во" value="${esc(item.qty||'')}"><button type="button"><i class="bi bi-x"></i></button>`;
        $('ws-bom-materials').appendChild(row);row.querySelector('select').value=idOf(item.material||item.materialId);row.querySelector('button').onclick=()=>row.remove();
    }
    function addBomComponent(item={}){
        const row=document.createElement('div');row.className='ws-bom-row';row.innerHTML=`<select class="form-select ws-bom-component-id">${recipeOptions()}</select><input type="number" min="0" step="0.001" class="form-control ws-bom-qty" placeholder="кол-во" value="${esc(item.qty||'')}"><button type="button"><i class="bi bi-x"></i></button>`;
        $('ws-bom-components').appendChild(row);row.querySelector('select').value=idOf(item.recipe||item.recipeId);row.querySelector('button').onclick=()=>row.remove();
    }
    function collectBom(selector,idSelector){
        return [...document.querySelectorAll(selector)].map(row=>({id:row.querySelector(idSelector)?.value,qty:n(row.querySelector('.ws-bom-qty')?.value)})).filter(x=>x.id&&x.qty>0);
    }
    function openRecipeEdit(id){
        const item=recipeById(id);if(!item)return;resetRecipe();$('ws-recipe-id').value=id;$('ws-recipe-name').value=item.name||'';$('ws-recipe-type').value=item.outputType||'sample';$('ws-recipe-sku').value=item.sku||'';$('ws-recipe-product').value=idOf(item.product);$('ws-recipe-planks').value=n(item.planksPerUnit);$('ws-recipe-pack-override').value=n(item.packQtyOverride);$('ws-recipe-side-a').value=item.sideA||'';$('ws-recipe-side-b').value=item.sideB||'';$('ws-recipe-matrix-pos').value=item.matrixPosName||'';$('ws-recipe-note').value=item.note||'';(item.materials||[]).forEach(addBomMaterial);(item.components||[]).forEach(addBomComponent);updateRecipeCalc();bootstrap.Modal.getOrCreateInstance($('ws-recipe-modal')).show();
    }
    $('ws-recipe-form')?.addEventListener('submit',async event=>{
        event.preventDefault();const id=$('ws-recipe-id').value;const materials=collectBom('#ws-bom-materials .ws-bom-row','.ws-bom-material-id').map(x=>({materialId:x.id,qty:x.qty}));const components=collectBom('#ws-bom-components .ws-bom-row','.ws-bom-component-id').map(x=>({recipeId:x.id,qty:x.qty}));
        const payload={name:$('ws-recipe-name').value,outputType:$('ws-recipe-type').value,sku:$('ws-recipe-sku').value,productId:$('ws-recipe-product').value||null,planksPerUnit:n($('ws-recipe-planks').value),packQtyOverride:n($('ws-recipe-pack-override').value),sideA:$('ws-recipe-side-a').value,sideB:$('ws-recipe-side-b').value,matrixPosName:$('ws-recipe-matrix-pos').value,note:$('ws-recipe-note').value,materials,components};
        await send(id?API+'/recipes/'+id:API+'/recipes',id?'PUT':'POST',payload,'Рецептура сохранена','recipe');
    });

    function buildStocktake(){
        const host=$('ws-stocktake-lines');host.innerHTML='';
        state.laminateStocks.forEach(stock=>addStocktakeRow(host,'laminate',idOf(stock.product),`${stock.product?.sku||'—'} · ${stock.product?.name||''}`,n(stock.planksQty),'планок'));
        state.materials.forEach(item=>addStocktakeRow(host,'material',idOf(item),item.name,n(item.stockQty),item.unit||'шт'));
        state.recipes.forEach(item=>addStocktakeRow(host,'finished',idOf(item),item.name,n(item.stockQty),'шт'));
    }
    function addStocktakeRow(host,type,id,name,system,unit){
        const row=document.createElement('div');row.className='ws-stocktake-row';row.dataset.type=type;row.dataset.id=id;row.dataset.system=system;
        row.innerHTML=`<div><strong>${esc(name)}</strong><small>По системе: ${fmt(system,2)} ${esc(unit)}</small></div><input type="number" min="0" step="0.001" class="form-control ws-stocktake-actual" placeholder="факт"><input class="form-control ws-stocktake-line-note" placeholder="комментарий">`;host.appendChild(row);
    }
    $('ws-stocktake-form')?.addEventListener('submit',async event=>{
        event.preventDefault();const lines=[...document.querySelectorAll('.ws-stocktake-row')].map(row=>{const input=row.querySelector('.ws-stocktake-actual');if(!input.value.trim())return null;const line={entityType:row.dataset.type,actualQty:n(input.value),note:row.querySelector('.ws-stocktake-line-note').value};if(row.dataset.type==='laminate')line.productId=row.dataset.id;if(row.dataset.type==='material')line.materialId=row.dataset.id;if(row.dataset.type==='finished')line.recipeId=row.dataset.id;return line;}).filter(Boolean);
        if(!lines.length){toast('Введите хотя бы один фактический остаток','warning');return;}
        await post(API+'/stocktake',{date:todayValue(),lines,note:$('ws-stocktake-note').value},'Инвентаризация сохранена','stocktake');
    });

    async function send(url,method,payload,success,modalName){
        try{
            const response=await fetch(url,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
            const data=await response.json().catch(()=>({}));
            if(!response.ok)throw new Error(data.error||'Ошибка операции');
            if(modalName)hideModal(modalName);toast(success,'success');await load();
            return data;
        }catch(error){toast(error.message||'Ошибка','error');throw error;}
    }
    async function post(url,payload,success,modalName){return send(url,'POST',payload,success,modalName);}

    $('ws-stock-search')?.addEventListener('input',renderStocks);
    $('ws-dealer-search')?.addEventListener('input',renderDealerAssets);
    $('ws-history-search')?.addEventListener('input',renderHistory);
    $('ws-history-type')?.addEventListener('change',renderHistory);

    load();
});