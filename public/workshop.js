document.addEventListener('DOMContentLoaded', () => {
    const API = '/api/workshop';
    const state = {
        products: [], dealers: [], materials: [], recipes: [], laminateStocks: [],
        dealerAssets: [], productions: [], movements: [], memos: [], stats: {}
    };
    const memoDraft = new Map();
    let memoFilter = 'all';
    let editingMemoId = '';
    let openingFilter = 'all';
    const openingDraft = new Map();

    function canManageWorkshop() {
        return Boolean(window.CRMAuth?.can?.('can_manage_workshop'));
    }
    function isWorkshopAdmin() {
        return Boolean(window.CRMAuth?.user?.permissions?.is_admin);
    }

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
    const dateInputValue = value => {
        const d = value ? new Date(value) : null;
        return d && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0,10) : todayValue();
    };
    const toast = (message, type = 'success') => window.showToast ? window.showToast(message, type) : alert(message);

    function idOf(value) {
        if (!value) return '';
        return String(value.id || value._id || value);
    }
    function productById(id) { return state.products.find(item => idOf(item) === String(id || '')); }
    function recipeById(id) { return state.recipes.find(item => idOf(item) === String(id || '')); }
    function materialById(id) { return state.materials.find(item => idOf(item) === String(id || '')); }
    function dealerById(id) { return state.dealers.find(item => idOf(item) === String(id || '')); }
    function memoById(id) { return state.memos.find(item => idOf(item) === String(id || '')); }

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
        memo:'ws-memo-modal', receipt:'ws-receipt-modal', production:'ws-production-modal', dealer:'ws-dealer-modal',
        material:'ws-material-modal', writeoff:'ws-writeoff-modal', recipe:'ws-recipe-modal',
        stocktake:'ws-stocktake-modal', opening:'ws-opening-modal', print:'ws-print-modal', correction:'ws-correction-modal',
        'new-material':'ws-new-material-modal', 'production-edit':'ws-production-edit-modal'
    };
    function showModal(name) {
        const el = $(modalIds[name]);
        if (!el) return;
        if (name === 'memo') resetMemo();
        if (name === 'receipt') resetReceipt();
        if (name === 'production') resetProduction();
        if (name === 'dealer') resetDealerMovement();
        if (name === 'material') resetMaterialMovement();
        if (name === 'writeoff') resetWriteoff();
        if (name === 'recipe') resetRecipe();
        if (name === 'stocktake') buildStocktake();
        if (name === 'opening') resetOpening();
        if (name === 'print') preparePrintCenter();
        if (name === 'new-material') resetNewMaterial();
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
        renderMemos();
        renderProduction();
        renderAttention();
        renderStocks();
        renderDealerAssets();
        renderRecipes();
        renderHistory();
        populateFormSelects();
    }

    function finishedShortages() {
        return state.recipes
            .map(item => {
                const current = Math.max(0, n(item.stockQty));
                const minimum = Math.max(0, n(item.minStockQty));
                return { type:'finished', item, current, minimum, shortage:Math.max(0, minimum-current) };
            })
            .filter(row => row.minimum > 0 && row.shortage > 0)
            .sort((a,b) => b.shortage-a.shortage || String(a.item.name||'').localeCompare(String(b.item.name||''),'ru'));
    }

    function materialShortages() {
        return state.materials
            .map(item => {
                const current = Math.max(0, n(item.stockQty));
                const minimum = Math.max(0, n(item.minQty));
                return { type:'material', item, current, minimum, shortage:Math.max(0, minimum-current) };
            })
            .filter(row => row.minimum > 0 && row.shortage > 0)
            .sort((a,b) => b.shortage-a.shortage || String(a.item.name||'').localeCompare(String(b.item.name||''),'ru'));
    }

    function workshopShortages() {
        return [...finishedShortages(), ...materialShortages()];
    }

    function activateWorkshopTab(name) {
        const button = document.querySelector(`[data-ws-tab="${name}"]`);
        if (!button) return;
        document.querySelectorAll('[data-ws-tab]').forEach(item => item.classList.toggle('active', item === button));
        document.querySelectorAll('[data-ws-pane]').forEach(pane => pane.classList.toggle('active', pane.dataset.wsPane === name));
        document.querySelector('.workshop-tabs-shell')?.scrollIntoView({behavior:'smooth',block:'start'});
    }

    function renderKpis() {
        if ($('ws-kpi-open')) $('ws-kpi-open').textContent = fmt(state.stats.openMemos);
        if ($('ws-kpi-today')) $('ws-kpi-today').textContent = fmt(state.stats.todayProduction);
        if ($('ws-kpi-finished')) $('ws-kpi-finished').textContent = fmt(state.stats.finishedStock);
        if ($('ws-kpi-dealers')) $('ws-kpi-dealers').textContent = fmt(state.stats.dealerAssetStock);
        if ($('ws-kpi-shortage')) $('ws-kpi-shortage').textContent = fmt(workshopShortages().length);

        const banner = $('ws-opening-banner');
        if (banner) {
            const count = Math.max(0, n(state.stats.openingBalanceCount));
            banner.classList.toggle('is-done', count > 0);
            const text = $('ws-opening-banner-text');
            const button = banner.querySelector('button');
            if (text) text.textContent = count > 0
                ? `Стартовые остатки уже фиксировались (${fmt(count)} корректировок). Если нашли ещё старые готовые образцы — их можно спокойно добавить здесь.`
                : 'Внесите готовые образцы, которые уже лежат в цехе или уже стоят у дилеров. Производить их задним числом не нужно.';
            if (button) button.textContent = count > 0 ? 'Дополнить остатки' : 'Внести остатки';
        }
    }

    function memoStatusLabel(status) {
        return status === 'accepted' ? 'Принято' : status === 'mismatch' ? 'На обмен' : status === 'cancelled' ? 'Отменено' : 'Ожидает склад';
    }

    function renderMemos() {
        const host = $('ws-memo-list');
        if (!host) return;
        const actionable = state.memos
            .filter(item => item.status === 'mismatch' || item.status === 'created')
            .sort((a,b) => {
                const rank = status => status === 'mismatch' ? 0 : 1;
                return rank(a.status) - rank(b.status) || new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt);
            });
        const recentAccepted = state.memos
            .filter(item => item.status === 'accepted')
            .sort((a,b) => new Date(b.acceptedAt || b.date || b.createdAt) - new Date(a.acceptedAt || a.date || a.createdAt))
            .slice(0, actionable.length ? 2 : 4);
        const list = [...actionable, ...recentAccepted].slice(0, 12);
        if (!list.length) {
            host.innerHTML = '<div class="workshop-empty"><i class="bi bi-file-earmark-text"></i>Служебных записок пока нет</div>';
            return;
        }
        host.innerHTML = list.map(memo => {
            const lines = (memo.lines || []).map(line => {
                const requested = Number(line.requestedPacks || 0);
                const delivered = Number(line.deliveredPacks || 0);
                const diff = delivered - requested;
                const productMismatch = line.actualProduct && idOf(line.actualProduct) !== idOf(line.product);
                const lineState = memo.status === 'accepted' ? 'ok' : (line.isMatch ? 'ok' : (memo.status === 'mismatch' ? 'bad' : 'wait'));
                const actualText = productMismatch ? ` → ${esc(line.actualProduct?.sku || line.actualProduct?.name || 'другая позиция')}` : '';
                const produced = Number(line.producedQty || 0);
                const planText = `план ${Number(line.plannedOutputQty || 0)} шт · готово ${produced} шт`;
                const deliveryText = memo.status === 'created'
                    ? `${requested} уп. → ${planText}`
                    : `${requested} уп. / привезли ${delivered} уп.${diff ? ` (${diff > 0 ? '+' : ''}${diff})` : ''} · ${planText}`;
                return `<div class="workshop-memo-line-summary is-${lineState}">
                    <span class="workshop-memo-check"><i class="bi bi-${lineState === 'ok' ? 'check2' : lineState === 'bad' ? 'exclamation-lg' : 'dash'}"></i></span>
                    <div><strong>${esc(line.product?.sku || '—')} · ${esc(line.product?.name || '')}${actualText}</strong><small>${deliveryText}</small></div>
                </div>`;
            }).join('');
            const actionable = memo.status !== 'accepted' && memo.status !== 'cancelled';
            return `<article class="workshop-memo-card is-${esc(memo.status)}">
                <div class="workshop-memo-card-head">
                    <div><span>СЛУЖЕБНАЯ №${esc(memo.number)}</span><strong>${dateText(memo.date)}</strong><small>${esc(memo.signedBy || memo.createdBy?.name || '')}</small></div>
                    <span class="workshop-memo-status">${memoStatusLabel(memo.status)}</span>
                </div>
                <div class="workshop-memo-card-lines">${lines}</div>
                <div class="workshop-memo-card-foot">
                    <small>${(memo.lines || []).length} поз. · ${(memo.lines || []).reduce((sum,line)=>sum+n(line.requestedPacks),0)} уп. · ${(memo.lines || []).reduce((sum,line)=>sum+n(line.plannedOutputQty),0)} изделий</small>
                    <div class="workshop-card-actions">
                        <button type="button" class="workshop-icon-action" data-print-memo="${idOf(memo)}" title="Печать служебки"><i class="bi bi-printer"></i></button>
                        ${actionable && canManageWorkshop() ? `<button type="button" class="workshop-icon-action" data-edit-memo="${idOf(memo)}" title="Редактировать"><i class="bi bi-pencil"></i></button>` : ''}
                        ${actionable && isWorkshopAdmin() ? `<button type="button" class="workshop-icon-action is-danger" data-delete-memo="${idOf(memo)}" title="Удалить"><i class="bi bi-trash3"></i></button>` : ''}
                        ${actionable ? `<button type="button" class="workshop-link-btn" data-receive-memo="${idOf(memo)}"><i class="bi bi-check2-square"></i>${memo.status === 'mismatch' ? 'Повторно сверить' : 'Сверить приход'}</button>` : '<span class="text-success small fw-bold"><i class="bi bi-check-circle me-1"></i>Оприходовано</span>'}
                    </div>
                </div>
            </article>`;
        }).join('');

        host.querySelectorAll('[data-print-memo]').forEach(button => {
            button.addEventListener('click', () => printMemoDocument(memoById(button.dataset.printMemo)));
        });
        host.querySelectorAll('[data-receive-memo]').forEach(button => {
            button.addEventListener('click', () => openReceiptForMemo(button.dataset.receiveMemo));
        });
        host.querySelectorAll('[data-edit-memo]').forEach(button => {
            button.addEventListener('click', () => openMemoEdit(button.dataset.editMemo));
        });
        host.querySelectorAll('[data-delete-memo]').forEach(button => {
            button.addEventListener('click', () => deleteWorkshopMemo(button.dataset.deleteMemo));
        });
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
                <div><strong>${esc(item.recipe?.name || 'Изделие')}</strong><small>${dateText(item.date)}${ops ? ' · '+esc(ops) : ''}${item.scrapPlanks ? ' · отход '+fmt(item.scrapPlanks)+' пл.' : ''}${item.customOrderName ? ' · '+esc(item.customOrderName) : ''}</small></div>
                <div class="workshop-feed-actions"><b>+${fmt(item.outputQty)} шт</b>
                    ${canManageWorkshop() ? `<button type="button" class="workshop-icon-action" data-edit-production="${idOf(item)}" title="Редактировать детали"><i class="bi bi-pencil"></i></button>` : ''}
                    ${isWorkshopAdmin() ? `<button type="button" class="workshop-icon-action is-danger" data-delete-production="${idOf(item)}" title="Отменить запись"><i class="bi bi-trash3"></i></button>` : ''}
                </div>
            </div>`;
        }).join('');
        host.querySelectorAll('[data-edit-production]').forEach(button => {
            button.addEventListener('click', () => openProductionEdit(button.dataset.editProduction));
        });
        host.querySelectorAll('[data-delete-production]').forEach(button => {
            button.addEventListener('click', () => cancelProduction(button.dataset.deleteProduction));
        });
    }

    function renderAttention() {
        const host = $('ws-attention-list');
        if (!host) return;
        const items = [];
        state.memos.filter(item => item.status === 'mismatch').forEach(item => {
            const bad = (item.lines || []).filter(line => !line.isMatch).length;
            items.push({ type:'danger', icon:'arrow-left-right', title:`Служебка №${item.number}`, text:`${bad} поз. требуют обмена / повторной сверки` });
        });
        state.materials.forEach(item => {
            if (n(item.minQty) > 0 && n(item.stockQty) <= n(item.minQty)) {
                items.push({ type:'warning', icon:'exclamation-triangle', title:item.name, text:`Остаток ${fmt(item.stockQty,2)} ${item.unit || 'шт'} · минимум ${fmt(item.minQty,2)}` });
            }
        });
        state.recipes.forEach(item => {
            const minimum = Math.max(0, n(item.minStockQty));
            const stock = n(item.stockQty);
            if ((minimum > 0 && stock <= minimum) || (minimum === 0 && stock <= 0)) {
                items.push({
                    type: stock <= 0 ? 'danger' : 'warning',
                    icon:'box',
                    title:item.name,
                    text: minimum > 0 ? `Остаток ${fmt(stock)} шт · минимум ${fmt(minimum)} шт` : 'Готовых изделий нет в остатке'
                });
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

    function isTradingEquipmentRecipe(item) {
        if (!item) return false;
        const text = [
            item.sku, item.name, item.matrixPosName,
            item.product?.sku, item.product?.name
        ].filter(Boolean).join(' ').toUpperCase();
        return Boolean(
            item.matrixPosName ||
            /^POS-/i.test(String(item.sku || '')) ||
            item.outputType === 'stand' ||
            item.outputType === 'sign' ||
            /(^|[^A-ZА-Я0-9])(С|C)600([^0-9]|$)|(^|[^A-ZА-Я0-9])(С|C)800([^0-9]|$)|РФ-?2|RF-?2|(^|[^A-ZА-Я0-9])(Н|H)600([^0-9]|$)|(^|[^A-ZА-Я0-9])(Н|H)800([^0-9]|$)|ТАБЛИЧК|ОРГ.?СТЕКЛ|СТЕНД|ЗАДН.*СТЕНК|РАСЧЕСК.*ФАНЕР|НАКЛЕЙК/i.test(text)
        );
    }

    function isTradingEquipmentProduct(product) {
        if (!product) return false;
        const text=[product.sku,product.name].filter(Boolean).join(' ').toUpperCase();
        return /(^|[^A-ZА-Я0-9])(С|C)600([^0-9]|$)|(^|[^A-ZА-Я0-9])(С|C)800([^0-9]|$)|РФ-?2|RF-?2|(^|[^A-ZА-Я0-9])(Н|H)600([^0-9]|$)|(^|[^A-ZА-Я0-9])(Н|H)800([^0-9]|$)|ТАБЛИЧК|ОРГ.?СТЕКЛ|СТЕНД|ЗАДН.*СТЕНК|РАСЧЕСК.*ФАНЕР|НАКЛЕЙК/i.test(text);
    }

    function workshopRecipeDisplayName(item) {
        const name=String(item?.name || item?.product?.name || 'Изделие').trim();
        return isTradingEquipmentRecipe(item)
            ? name.replace(/^\s*(Планшет|Образец)\s+/i,'').trim()
            : name;
    }

    function workshopRecipeTypeLabel(item) {
        if (isTradingEquipmentRecipe(item)) return 'Торговое оборудование';
        if (item?.outputType === 'sample') return 'Планшет / образец';
        return 'Изделие';
    }

    function renderStocks() {
        const term = stockSearchTerm();
        const laminateHost = $('ws-laminate-stock');
        const rows = state.laminateStocks.filter(stock => {
            const text = `${stock.product?.sku || ''} ${stock.product?.name || ''}`.toLowerCase();
            return !term || text.includes(term);
        });
        laminateHost.innerHTML = rows.length ? `<table class="workshop-table"><thead><tr><th>SKU / декор</th><th>Актуальность</th><th>В упаковке</th><th>Остаток</th><th>Эквивалент</th><th></th></tr></thead><tbody>${rows.map(stock => {
            const pq = packQty(stock.product);
            const planks = n(stock.planksQty);
            const packs = pq > 0 ? Math.floor(planks / pq) : 0;
            const loose = pq > 0 ? Math.round(planks - packs*pq) : planks;
            return `<tr><td><div class="ws-stock-main"><strong>${esc(stock.product?.sku || '—')} · ${esc(stock.product?.name || '')}</strong><small>${esc(stock.product?.characteristics?.size || '')}</small></div></td>
            <td><span class="ws-liquid ${stock.product?.is_liquid === false ? 'is-old':''}">${stock.product?.is_liquid === false ? 'неактуален':'актуален'}</span></td>
            <td>${pq ? pq+' пл.' : 'не задано'}</td><td><strong>${fmt(planks)} пл.</strong></td><td>${pq ? `${packs} уп. + ${loose} пл.` : '—'}</td><td>${canManageWorkshop() ? `<button type="button" class="workshop-icon-action" data-correct-stock="laminate" data-correct-id="${idOf(stock.product)}" title="Исправить фактический остаток"><i class="bi bi-pencil-square"></i></button>` : ''}</td></tr>`;
        }).join('')}</tbody></table>` : '<div class="workshop-empty"><i class="bi bi-layers"></i>Ламинат в цех ещё не принимали</div>';

        const finished = state.recipes.filter(item => !term || `${item.name} ${item.sku || ''} ${item.product?.name || ''}`.toLowerCase().includes(term));
        $('ws-finished-stock').innerHTML = finished.length ? finished.map(item => {
            const minimum = Math.max(0, n(item.minStockQty));
            const low = minimum > 0 && n(item.stockQty) <= minimum;
            return `<div class="workshop-stock-card ${low ? 'is-low' : ''}">
                <div><strong>${esc(workshopRecipeDisplayName(item))}</strong><small>${esc(workshopRecipeTypeLabel(item))}${item.product ? ' · '+esc(item.product.sku || '') : ''}${minimum > 0 ? ' · минимум '+fmt(minimum) : ''}</small></div>
                <div class="workshop-stock-actions"><b>${fmt(item.stockQty)} шт</b>${canManageWorkshop() ? `<button type="button" class="workshop-icon-action" data-correct-stock="finished" data-correct-id="${idOf(item)}" title="Исправить фактический остаток"><i class="bi bi-pencil-square"></i></button>` : ''}</div>
            </div>`;
        }).join('') : '<div class="workshop-empty">Нет рецептур</div>';

        const materials = state.materials.filter(item => !term || `${item.code || ''} ${item.name}`.toLowerCase().includes(term));
        $('ws-material-stock').innerHTML = materials.length ? materials.map(item => {
            const low = n(item.minQty) > 0 && n(item.stockQty) <= n(item.minQty);
            const purchase = item.purchaseUnit && item.purchaseUnitSize
                ? ` · закупка: ${esc(item.purchaseUnit)}${n(item.purchaseUnitSize)!==1 ? ' = '+fmt(item.purchaseUnitSize,2)+' '+esc(item.unit||'') : ''}`
                : '';
            return `<div class="workshop-stock-card ${low?'is-low':''}">
                <div><strong>${esc(item.name)}</strong><small>${esc(item.code || item.category || '')}${purchase}${low ? ' · минимум '+fmt(item.minQty,2):''}</small></div>
                <div class="workshop-stock-actions"><b>${fmt(item.stockQty,2)} ${esc(item.unit || 'шт')}</b>
                    ${canManageWorkshop() ? `<button type="button" class="workshop-icon-action" data-correct-stock="material" data-correct-id="${idOf(item)}" title="Исправить фактический остаток"><i class="bi bi-pencil-square"></i></button>` : ''}
                    ${canManageWorkshop() ? `<button type="button" class="workshop-icon-action" data-edit-material="${idOf(item)}" title="Редактировать настройки материала"><i class="bi bi-gear"></i></button>` : ''}
                    ${isWorkshopAdmin() ? `<button type="button" class="workshop-icon-action is-danger" data-delete-material="${idOf(item)}" title="Удалить"><i class="bi bi-trash3"></i></button>` : ''}
                </div>
            </div>`;
        }).join('') : '<div class="workshop-empty">Материалы не найдены</div>';
        ['ws-laminate-stock','ws-finished-stock','ws-material-stock'].forEach(hostId => {
            $(hostId)?.querySelectorAll('[data-correct-stock]').forEach(button => {
                button.addEventListener('click',() => openStockCorrection(button.dataset.correctStock,button.dataset.correctId,'stock'));
            });
        });
        $('ws-material-stock')?.querySelectorAll('[data-edit-material]').forEach(button => {
            button.addEventListener('click', () => openMaterialEdit(button.dataset.editMaterial));
        });
        $('ws-material-stock')?.querySelectorAll('[data-delete-material]').forEach(button => {
            button.addEventListener('click', () => deleteWorkshopMaterial(button.dataset.deleteMaterial));
        });
    }

    let correctionReturnMode = '';

    function correctionEntityLabel(type) {
        return type === 'finished' ? 'Готовая продукция' : type === 'laminate' ? 'Ламинат' : 'Материал';
    }

    function correctionItems(type) {
        if (type === 'finished') {
            return state.recipes.map(item => ({
                id:idOf(item), name:workshopRecipeDisplayName(item) || 'Изделие', code:item.product?.sku || item.sku || '',
                current:Math.max(0,n(item.stockQty)), unit:'шт'
            }));
        }
        if (type === 'laminate') {
            return state.products.map(product => {
                const stock=state.laminateStocks.find(row => idOf(row.product) === idOf(product));
                return {
                    id:idOf(product), name:product?.name || 'Ламинат', code:product?.sku || '',
                    current:Math.max(0,n(stock?.planksQty)), unit:'планок'
                };
            });
        }
        return state.materials.map(item => ({
            id:idOf(item), name:item.name || 'Материал', code:item.code || '',
            current:Math.max(0,n(item.stockQty)), unit:item.unit || 'шт'
        }));
    }

    function correctionItem(type,id) {
        return correctionItems(type).find(item => String(item.id) === String(id || '')) || null;
    }

    function correctionOptionRows(type, selectedId='') {
        return correctionItems(type)
            .sort((a,b)=>String(a.code||a.name).localeCompare(String(b.code||b.name),'ru',{numeric:true}))
            .map(item => option(item.id, `${item.code ? item.code+' · ' : ''}${item.name} · сейчас ${fmt(item.current,2)} ${item.unit}`, String(item.id)===String(selectedId)))
            .join('');
    }

    function updateCorrectionDelta(which) {
        const isPrimary = which === 'primary';
        const type = isPrimary ? $('ws-correction-primary-entity')?.value : $('ws-correction-second-entity')?.value;
        const id = isPrimary ? $('ws-correction-primary-id')?.value : $('ws-correction-second-id')?.value;
        const input = isPrimary ? $('ws-correction-primary-actual') : $('ws-correction-second-actual');
        const currentHost = isPrimary ? $('ws-correction-primary-current') : $('ws-correction-second-current');
        const deltaHost = isPrimary ? $('ws-correction-primary-delta') : $('ws-correction-second-delta');
        const item = correctionItem(type,id);

        if (!item) {
            if (currentHost) currentHost.textContent='—';
            if (deltaHost) deltaHost.textContent='Выберите позицию';
            return;
        }
        if (currentHost) currentHost.textContent=`${fmt(item.current,2)} ${item.unit}`;
        if (!input?.value.trim()) {
            if (deltaHost) {
                deltaHost.className='workshop-correction-delta';
                deltaHost.textContent='Укажите правильный остаток';
            }
            return;
        }
        const actual=Math.max(0,n(input.value));
        const delta=actual-item.current;
        if (deltaHost) {
            deltaHost.className='workshop-correction-delta '+(Math.abs(delta)<0.0001?'is-same':delta>0?'is-plus':'is-minus');
            deltaHost.textContent=Math.abs(delta)<0.0001
                ? 'Изменений нет'
                : `CRM запишет корректировку ${delta>0?'+':''}${fmt(delta,2)} ${item.unit}`;
        }
    }

    function refreshSecondCorrectionPicker(selectedId='') {
        const type=$('ws-correction-second-entity')?.value || 'finished';
        const select=$('ws-correction-second-id');
        if (!select) return;
        select.innerHTML=option('','Выберите позицию')+correctionOptionRows(type,selectedId);
        if ($('ws-correction-second-actual')) $('ws-correction-second-actual').value='';
        updateCorrectionDelta('second');
    }

    function openStockCorrection(type,id,returnMode='') {
        if (!canManageWorkshop()) return toast('Нет права изменять остатки цеха','warning');
        const item=correctionItem(type,id);
        if (!item) return toast('Позиция не найдена','error');

        correctionReturnMode=returnMode || '';
        $('ws-correction-form')?.reset();
        $('ws-correction-primary-entity').value=type;
        $('ws-correction-primary-id').value=id;
        $('ws-correction-primary-name').textContent=`${item.code ? item.code+' · ' : ''}${item.name}`;
        $('ws-correction-primary-type').textContent=correctionEntityLabel(type);
        $('ws-correction-primary-current').textContent=`${fmt(item.current,2)} ${item.unit}`;
        $('ws-correction-primary-actual').value=String(item.current);
        $('ws-correction-primary-actual').step = type === 'finished' ? '1' : '0.001';
        $('ws-correction-primary-delta').className='workshop-correction-delta is-same';
        $('ws-correction-primary-delta').textContent='Изменений нет';
        $('ws-correction-reason').value='';

        const second=$('ws-correction-second');
        if (second) second.hidden=true;
        if ($('ws-correction-add-second')) $('ws-correction-add-second').hidden=false;
        if ($('ws-correction-second-entity')) $('ws-correction-second-entity').value=type;
        refreshSecondCorrectionPicker();

        const sourceModal=$('ws-stock-view-modal');
        const sourceInstance=sourceModal ? bootstrap.Modal.getInstance(sourceModal) : null;
        const show=()=>bootstrap.Modal.getOrCreateInstance($('ws-correction-modal')).show();
        if (sourceInstance && sourceModal.classList.contains('show')) {
            sourceModal.addEventListener('hidden.bs.modal',show,{once:true});
            sourceInstance.hide();
        } else {
            show();
        }
    }

    let stockViewMode = 'finished';

    function stockViewTitle(mode) {
        return {
            finished:'Готовая продукция в цехе',
            laminate:'Ламинат в цехе',
            materials:'Материалы и расходники',
            dealers:'Образцы и торговое оборудование у дилеров',
            shortage:'Чего не хватает'
        }[mode] || 'Остатки цеха';
    }

    function currentStockTypeLabel(item) {
        return workshopRecipeTypeLabel(item);
    }

    function renderStockView() {
        const host = $('ws-stock-view-content');
        const summary = $('ws-stock-view-summary');
        const title = $('ws-stock-view-title');
        if (!host || !summary) return;

        if (title) title.textContent = stockViewTitle(stockViewMode);
        document.querySelectorAll('[data-stock-view-tab]').forEach(button => {
            button.classList.toggle('active', button.dataset.stockViewTab === stockViewMode);
        });

        const term = ($('ws-stock-view-search')?.value || '').trim().toLowerCase();
        let html = '';
        let summaryHtml = '';

        if (stockViewMode === 'finished') {
            const rows = state.recipes
                .filter(item => {
                    const text = [item.name,item.sku,item.product?.sku,item.product?.name,currentStockTypeLabel(item)].join(' ').toLowerCase();
                    return !term || text.includes(term);
                })
                .sort((a,b) => n(b.stockQty)-n(a.stockQty) || String(a.name||'').localeCompare(String(b.name||''),'ru'));
            const total = rows.reduce((sum,item) => sum + Math.max(0,n(item.stockQty)),0);
            const inStock = rows.filter(item => n(item.stockQty)>0).length;
            const zero = rows.filter(item => n(item.stockQty)<=0).length;
            summaryHtml = `
                <div><small>Всего готово</small><strong>${fmt(total)} шт</strong></div>
                <div><small>Позиций с остатком</small><strong>${fmt(inStock)}</strong></div>
                <div><small>Нулевой остаток</small><strong>${fmt(zero)}</strong></div>`;
            html = rows.length ? rows.map(item => {
                const current=Math.max(0,n(item.stockQty)), minimum=Math.max(0,n(item.minStockQty));
                const shortage=Math.max(0,minimum-current);
                return `<article class="workshop-current-row ${shortage>0?'is-shortage':''}">
                    <div class="workshop-current-main">
                        <strong>${esc(workshopRecipeDisplayName(item))}</strong>
                        <small>${esc(currentStockTypeLabel(item))}${item.product?.sku?' · '+esc(item.product.sku):''}${item.product?.name?' · '+esc(item.product.name):''}</small>
                    </div>
                    <div class="workshop-current-min"><small>Минимум</small><span>${minimum>0?fmt(minimum)+' шт':'—'}</span></div>
                    <div class="workshop-current-qty"><small>Сейчас в цехе</small><strong>${fmt(current)} шт</strong>${shortage>0?`<em>не хватает ${fmt(shortage)}</em>`:''}${canManageWorkshop()?`<button type="button" class="workshop-current-edit" data-correct-stock="finished" data-correct-id="${idOf(item)}"><i class="bi bi-pencil-square"></i>Исправить</button>`:''}</div>
                </article>`;
            }).join('') : '<div class="workshop-empty">Готовые изделия не найдены</div>';
        } else if (stockViewMode === 'laminate') {
            const rows = state.laminateStocks
                .filter(item => {
                    const text=[item.product?.sku,item.product?.name].join(' ').toLowerCase();
                    return !term || text.includes(term);
                })
                .sort((a,b)=>String(a.product?.sku||'').localeCompare(String(b.product?.sku||''),undefined,{numeric:true}));
            const totalPlanks=rows.reduce((sum,item)=>sum+Math.max(0,n(item.planksQty)),0);
            summaryHtml = `<div><small>Позиций</small><strong>${fmt(rows.length)}</strong></div><div><small>Планок всего</small><strong>${fmt(totalPlanks)}</strong></div>`;
            html = rows.length ? rows.map(item => {
                const pq=packQty(item.product), planks=Math.max(0,n(item.planksQty));
                const packs=pq>0?Math.floor(planks/pq):0, loose=pq>0?Math.round(planks-packs*pq):planks;
                return `<article class="workshop-current-row">
                    <div class="workshop-current-main"><strong>${esc(item.product?.sku||'—')} · ${esc(item.product?.name||'')}</strong><small>${item.product?.is_liquid===false?'Неликвид / архивная позиция':'Актуальная позиция'}${pq?' · '+pq+' планок в упаковке':''}</small></div>
                    <div class="workshop-current-min"><small>Эквивалент</small><span>${pq?`${packs} уп. + ${loose} пл.`:'—'}</span></div>
                    <div class="workshop-current-qty"><small>Сейчас в цехе</small><strong>${fmt(planks)} пл.</strong>${canManageWorkshop()?`<button type="button" class="workshop-current-edit" data-correct-stock="laminate" data-correct-id="${idOf(item.product)}"><i class="bi bi-pencil-square"></i>Исправить</button>`:''}</div>
                </article>`;
            }).join('') : '<div class="workshop-empty">Ламинат не найден</div>';
        } else if (stockViewMode === 'materials') {
            const rows=state.materials
                .filter(item => !term || [item.code,item.name,item.category].join(' ').toLowerCase().includes(term))
                .sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'ru'));
            const low=rows.filter(item=>n(item.minQty)>0&&n(item.stockQty)<n(item.minQty)).length;
            summaryHtml = `<div><small>Материалов</small><strong>${fmt(rows.length)}</strong></div><div><small>Ниже минимума</small><strong>${fmt(low)}</strong></div>`;
            html=rows.length?rows.map(item=>{
                const current=Math.max(0,n(item.stockQty)), minimum=Math.max(0,n(item.minQty)), shortage=Math.max(0,minimum-current);
                return `<article class="workshop-current-row ${shortage>0?'is-shortage':''}">
                    <div class="workshop-current-main"><strong>${esc(item.name)}</strong><small>${esc(item.code||item.category||'')}${item.purchaseUnit?' · закупка: '+esc(item.purchaseUnit):''}</small></div>
                    <div class="workshop-current-min"><small>Минимум</small><span>${minimum>0?fmt(minimum,2)+' '+esc(item.unit||'шт'):'—'}</span></div>
                    <div class="workshop-current-qty"><small>Сейчас в цехе</small><strong>${fmt(current,2)} ${esc(item.unit||'шт')}</strong>${shortage>0?`<em>не хватает ${fmt(shortage,2)}</em>`:''}${canManageWorkshop()?`<button type="button" class="workshop-current-edit" data-correct-stock="material" data-correct-id="${idOf(item)}"><i class="bi bi-pencil-square"></i>Исправить</button>`:''}</div>
                </article>`;
            }).join(''):'<div class="workshop-empty">Материалы не найдены</div>';
        } else if (stockViewMode === 'dealers') {
            const rows=state.dealerAssets
                .filter(asset => n(asset.qty)>0)
                .filter(asset => !term || [asset.dealer?.name,asset.dealer?.city,asset.recipe?.name,asset.recipe?.product?.sku].join(' ').toLowerCase().includes(term))
                .sort((a,b)=>String(a.dealer?.name||'').localeCompare(String(b.dealer?.name||''),'ru') || String(a.recipe?.name||'').localeCompare(String(b.recipe?.name||''),'ru'));
            const total=rows.reduce((sum,item)=>sum+Math.max(0,n(item.qty)),0);
            const dealers=new Set(rows.map(item=>idOf(item.dealer)).filter(Boolean)).size;
            summaryHtml=`<div><small>У дилеров всего</small><strong>${fmt(total)} шт</strong></div><div><small>Дилеров</small><strong>${fmt(dealers)}</strong></div><div><small>Строк учёта</small><strong>${fmt(rows.length)}</strong></div>`;
            html=rows.length?rows.map(asset=>`<article class="workshop-current-row">
                <div class="workshop-current-main"><strong>${esc(asset.dealer?.name||'—')}</strong><small>${esc(asset.dealer?.city||'')}${asset.dealer?.dealer_id?' · '+esc(asset.dealer.dealer_id):''}</small></div>
                <div class="workshop-current-min"><small>Изделие</small><span>${esc(workshopRecipeDisplayName(asset.recipe)||'—')}${asset.recipe?.product?.sku?' · '+esc(asset.recipe.product.sku):''}</span></div>
                <div class="workshop-current-qty"><small>Сейчас у дилера</small><strong>${fmt(asset.qty)} шт</strong></div>
            </article>`).join(''):'<div class="workshop-empty">У дилеров ничего не числится</div>';
        } else {
            const finished=finishedShortages().filter(row => !term || [row.item.name,row.item.sku,row.item.product?.sku,row.item.product?.name].join(' ').toLowerCase().includes(term));
            const materials=materialShortages().filter(row => !term || [row.item.code,row.item.name].join(' ').toLowerCase().includes(term));
            const all=[...finished,...materials];
            const zeroCount=all.filter(row=>row.current<=0).length;
            summaryHtml=`<div class="is-danger"><small>Позиций не хватает</small><strong>${fmt(all.length)}</strong></div><div><small>Готовых изделий</small><strong>${fmt(finished.length)}</strong></div><div><small>Материалов</small><strong>${fmt(materials.length)}</strong></div><div><small>Совсем нет в наличии</small><strong>${fmt(zeroCount)}</strong></div>`;
            html=all.length?all.map(row=>{
                const item=row.item;
                const unit=row.type==='finished'?'шт':(item.unit||'шт');
                const label=row.type==='finished'?currentStockTypeLabel(item):'Материал / расходник';
                const code=row.type==='finished'?(item.product?.sku||item.sku||''):(item.code||'');
                return `<article class="workshop-current-row is-shortage">
                    <div class="workshop-current-main"><strong>${esc(row.type==='finished'?workshopRecipeDisplayName(item):item.name)}</strong><small>${esc(label)}${code?' · '+esc(code):''}</small></div>
                    <div class="workshop-current-min"><small>Нужно минимум</small><span>${fmt(row.minimum,2)} ${esc(unit)}</span><small>есть ${fmt(row.current,2)}</small></div>
                    <div class="workshop-current-qty"><small>Не хватает</small><strong>${fmt(row.shortage,2)} ${esc(unit)}</strong>${canManageWorkshop()?`<button type="button" class="workshop-current-edit" data-correct-stock="${row.type}" data-correct-id="${idOf(item)}"><i class="bi bi-pencil-square"></i>Исправить</button>`:''}</div>
                </article>`;
            }).join(''):'<div class="workshop-empty is-success"><i class="bi bi-check-circle"></i>Все позиции с заданным минимумом обеспечены</div>';
        }

        summary.innerHTML = summaryHtml;
        host.innerHTML = html;
        host.querySelectorAll('[data-correct-stock]').forEach(button => {
            button.addEventListener('click',event => {
                event.stopPropagation();
                openStockCorrection(button.dataset.correctStock,button.dataset.correctId,stockViewMode);
            });
        });
    }

    function openStockView(mode='finished') {
        stockViewMode = ['finished','laminate','materials','dealers','shortage'].includes(mode) ? mode : 'finished';
        if ($('ws-stock-view-search')) $('ws-stock-view-search').value='';
        renderStockView();
        bootstrap.Modal.getOrCreateInstance($('ws-stock-view-modal')).show();
    }

    function preparePrintCenter() {
        const select=$('ws-print-memo');
        if (!select) return;
        const rows=[...state.memos].sort((a,b)=>new Date(b.date||b.createdAt)-new Date(a.date||a.createdAt));
        select.innerHTML = rows.length
            ? rows.map(memo=>option(idOf(memo),`№${memo.number} · ${dateText(memo.date)} · ${memoStatusLabel(memo.status)}`)).join('')
            : option('','Служебок пока нет');
    }

    function printDateTime() {
        return new Date().toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
    }

    function printCell(value) {
        return esc(value === null || value === undefined || value === '' ? '—' : value);
    }

    function printTable(title,headers,rows,note='') {
        return `<section class="report-section">
            <h2>${esc(title)}</h2>
            ${note?`<p class="section-note">${esc(note)}</p>`:''}
            <table><thead><tr>${headers.map(header=>`<th>${esc(header)}</th>`).join('')}</tr></thead>
            <tbody>${rows.length?rows.map(row=>`<tr>${row.map(cell=>`<td>${printCell(cell)}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${headers.length}" class="empty">Нет данных</td></tr>`}</tbody></table>
        </section>`;
    }

    function sendWorkshopPrintToPrinter(title,subtitle,bodyHtml,options={}) {
        const frame=document.createElement('iframe');
        frame.setAttribute('aria-hidden','true');
        frame.style.position='fixed';
        frame.style.right='0';
        frame.style.bottom='0';
        frame.style.width='1px';
        frame.style.height='1px';
        frame.style.border='0';
        frame.style.opacity='0';
        document.body.appendChild(frame);

        const doc=frame.contentWindow.document;
        const user=window.CRMAuth?.user?.fullName || window.CRMAuth?.user?.name || window.CRMAuth?.user?.username || '';
        doc.open();
        doc.write(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${esc(title)}</title>
        <style>
            @page{size:A4 ${options.landscape?'landscape':'portrait'};margin:12mm}
            *{box-sizing:border-box}body{margin:0;color:#1f2023;font:11px Arial,sans-serif}
            .report-head{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;padding-bottom:10px;border-bottom:2px solid #1f2023}
            .brand{font-size:18px;font-weight:800;letter-spacing:.04em}.brand span{color:#b9040a}
            h1{margin:5px 0 0;font-size:17px} .meta{text-align:right;color:#666;line-height:1.5}
            .subtitle{margin:8px 0 0;color:#555;font-size:10px}
            .report-section{margin-top:14px;break-inside:auto}.report-section h2{margin:0 0 6px;font-size:12px}
            .section-note{margin:-2px 0 6px;color:#777;font-size:9px}
            table{width:100%;border-collapse:collapse;table-layout:auto}th,td{padding:5px 6px;border:1px solid #cfcfcf;text-align:left;vertical-align:top}
            th{background:#efefef;font-size:9px;text-transform:uppercase}td{font-size:10px}.empty{text-align:center;color:#888;padding:14px}
            .memo-meta{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:12px}.memo-meta div{padding:7px;border:1px solid #d5d5d5}
            .memo-meta small{display:block;color:#777;font-size:8px;text-transform:uppercase}.memo-meta strong{display:block;margin-top:2px}
            .memo-note{margin-top:10px;padding:8px;border:1px solid #d5d5d5;min-height:38px}.memo-note small{display:block;color:#777}
            .signatures{display:grid;grid-template-columns:1fr 1fr;gap:35px;margin-top:30px}.signature{border-top:1px solid #222;padding-top:4px;color:#555}
            .footer{margin-top:16px;padding-top:7px;border-top:1px solid #ddd;color:#888;font-size:8px}
            @media print{.report-section{break-inside:auto}tr{break-inside:avoid}}
        </style></head><body>
        <header class="report-head"><div><div class="brand"><span>IDEAL</span> FLOOR · ЦЕХ</div><h1>${esc(title)}</h1><p class="subtitle">${esc(subtitle||'')}</p></div>
        <div class="meta">Сформировано: ${esc(printDateTime())}<br>${user?'Сотрудник: '+esc(user):''}</div></header>
        ${bodyHtml}
        <div class="footer">IDEAL FLOOR CRM · документ сформирован из текущих данных системы</div>
        </body></html>`);
        doc.close();

        const doPrint=()=>{
            try{frame.contentWindow.focus();frame.contentWindow.print();}
            finally{setTimeout(()=>frame.remove(),1800);}
        };
        if (frame.contentWindow.document.readyState === 'complete') setTimeout(doPrint,120);
        else frame.onload=()=>setTimeout(doPrint,120);
    }

    function finishedPrintRows() {
        return [...state.recipes]
            .sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'ru'))
            .map(item=>[
                workshopRecipeDisplayName(item),
                currentStockTypeLabel(item),
                item.product?.sku || item.sku || '',
                `${fmt(Math.max(0,n(item.stockQty)))} шт`,
                n(item.minStockQty)>0?`${fmt(item.minStockQty)} шт`:'—'
            ]);
    }

    function laminatePrintRows() {
        return [...state.laminateStocks]
            .sort((a,b)=>String(a.product?.sku||'').localeCompare(String(b.product?.sku||''),undefined,{numeric:true}))
            .map(item=>{
                const planks=Math.max(0,n(item.planksQty)), pq=packQty(item.product);
                const packs=pq>0?Math.floor(planks/pq):0, loose=pq>0?Math.round(planks-packs*pq):planks;
                return [item.product?.sku||'',item.product?.name||'',`${fmt(planks)} пл.`,pq?`${packs} уп. + ${loose} пл.`:'—',item.product?.is_liquid===false?'Неликвид':'Актуален'];
            });
    }

    function materialPrintRows() {
        return [...state.materials]
            .sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'ru'))
            .map(item=>[
                item.code||'',item.name,
                `${fmt(Math.max(0,n(item.stockQty)),2)} ${item.unit||'шт'}`,
                n(item.minQty)>0?`${fmt(item.minQty,2)} ${item.unit||'шт'}`:'—',
                n(item.minQty)>n(item.stockQty)?`${fmt(n(item.minQty)-n(item.stockQty),2)} ${item.unit||'шт'}`:'—'
            ]);
    }

    function dealerAssetPrintRows() {
        return [...state.dealerAssets]
            .filter(item=>n(item.qty)>0)
            .sort((a,b)=>String(a.dealer?.name||'').localeCompare(String(b.dealer?.name||''),'ru'))
            .map(item=>[
                item.dealer?.dealer_id||'',item.dealer?.name||'',item.dealer?.city||'',
                workshopRecipeDisplayName(item.recipe)||'',item.recipe?.product?.sku||'',`${fmt(item.qty)} шт`
            ]);
    }

    function shortagePrintRows() {
        return workshopShortages().map(row=>{
            const item=row.item, unit=row.type==='finished'?'шт':(item.unit||'шт');
            return [
                row.type==='finished'?currentStockTypeLabel(item):'Материал',
                item.name,
                row.type==='finished'?(item.product?.sku||item.sku||''):(item.code||''),
                `${fmt(row.current,2)} ${unit}`,
                `${fmt(row.minimum,2)} ${unit}`,
                `${fmt(row.shortage,2)} ${unit}`
            ];
        });
    }

    function printMemoDocument(memo) {
        if (!memo) return toast('Выберите служебную записку','warning');
        const rows=(memo.lines||[]).map(line=>[
            line.product?.sku||'',
            line.product?.name||'',
            `${fmt(line.requestedPacks)} уп.`,
            line.packQty?`${fmt(line.packQty)} пл.`:'—',
            `${fmt(line.plannedOutputQty)} шт`,
            memo.status==='created'?'—':`${fmt(line.deliveredPacks)} уп.`,
            line.discrepancyReason||''
        ]);
        const body=`
            <div class="memo-meta">
                <div><small>№ служебной</small><strong>${esc(memo.number||'—')}</strong></div>
                <div><small>Дата</small><strong>${esc(dateText(memo.date))}</strong></div>
                <div><small>Статус</small><strong>${esc(memoStatusLabel(memo.status))}</strong></div>
            </div>
            ${printTable('Позиции',['Артикул','Наименование','Упаковок','Планок / уп.','Ожидаемый выпуск','Принято','Расхождение'],rows)}
            ${memo.note?`<div class="memo-note"><small>Комментарий</small>${esc(memo.note)}</div>`:''}
            <div class="signatures">
                <div class="signature">Передал: ${esc(memo.signedBy||memo.createdBy?.name||'')}</div>
                <div class="signature">Принял: ${esc(memo.acceptedBy?.name||'')}</div>
            </div>`;
        sendWorkshopPrintToPrinter(`Служебная записка №${memo.number||''}`,'Приход ламината в цех',body);
        logWorkshopPrint('memo',idOf(memo),`Служебная №${memo.number||''}`);
    }

    async function printWorkshopReport(type) {
        if (type === 'memo') {
            const memo=memoById($('ws-print-memo')?.value);
            return printMemoDocument(memo);
        }

        let body='',title='',subtitle='Фактическое состояние на момент печати',landscape=false;
        if (type === 'stock') {
            title='Остатки цеха';
            body=
                printTable('Готовая продукция',['Изделие','Тип','SKU','Сейчас','Минимум'],finishedPrintRows())+
                printTable('Ламинат',['SKU','Декор','Сейчас','Эквивалент','Актуальность'],laminatePrintRows())+
                printTable('Материалы',['Код','Материал','Сейчас','Минимум','Не хватает'],materialPrintRows());
            landscape=true;
        } else if (type === 'finished') {
            title='Готовая продукция в цехе';
            body=printTable('Текущие остатки',['Изделие','Тип','SKU','Сейчас','Минимум'],finishedPrintRows());
        } else if (type === 'laminate') {
            title='Ламинат в цехе';
            body=printTable('Текущие остатки',['SKU','Декор','Сейчас','Эквивалент','Актуальность'],laminatePrintRows());
        } else if (type === 'materials') {
            title='Материалы цеха';
            body=printTable('Текущие остатки',['Код','Материал','Сейчас','Минимум','Не хватает'],materialPrintRows());
        } else if (type === 'shortage') {
            title='Чего не хватает в цехе';
            subtitle='Позиции, где текущий остаток ниже установленного минимума';
            body=printTable('Дефицит',['Тип','Позиция','Код / SKU','Сейчас','Минимум','Не хватает'],shortagePrintRows());
        } else if (type === 'dealers') {
            title='Образцы и торговое оборудование у дилеров';
            body=printTable('Текущее размещение',['ID','Дилер','Город','Изделие','SKU','Сейчас у дилера'],dealerAssetPrintRows());
            landscape=true;
        } else if (type === 'production') {
            title='Производство цеха';
            subtitle='Последние сохранённые записи производства';
            const rows=state.productions.map(item=>[
                dateText(item.date),item.recipe?.name||'Изделие',item.product?.sku||'',`${fmt(item.outputQty)} шт`,
                item.operations?.map(op=>op.type).filter(Boolean).join(', ')||'',item.createdBy?.name||''
            ]);
            body=printTable('Производство',['Дата','Изделие','SKU','Изготовлено','Операции','Сотрудник'],rows);
            landscape=true;
        } else if (type === 'history') {
            title='История движений цеха';
            subtitle='Приходы, производство, выдачи, возвраты, списания и корректировки';
            let movements=state.movements;
            try {
                const response=await fetch(API+'/movements?limit=500');
                if (response.ok) movements=await response.json();
            } catch (_) {}
            const rows=movements.map(item=>[
                dateText(item.date),movementLabels[item.type]||item.type,movementName(item),
                `${item.direction==='in'?'+':item.direction==='out'?'−':''}${fmt(item.qty,2)} ${item.unit||''}`,
                item.dealer?.name||item.serviceMemoNumber||item.note||'',item.createdBy?.name||''
            ]);
            body=printTable('Движения',['Дата','Операция','Позиция','Изменение','Дилер / документ','Сотрудник'],rows);
            landscape=true;
        } else {
            return;
        }

        sendWorkshopPrintToPrinter(title,subtitle,body,{landscape});
        logWorkshopPrint(type,'',title);
    }

    function logWorkshopPrint(type,referenceId='',title='') {
        fetch(API+'/print-log',{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({type,referenceId,title}),
            crmTrackLoading:false
        }).catch(()=>{});
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
            return `<article class="workshop-recipe-card">
                <div class="top"><div><strong>${esc(workshopRecipeDisplayName(item))}</strong><small>${esc(item.sku || '')}${item.product ? ' · '+esc(item.product.sku || '') : ''}</small></div><span class="ws-liquid ${item.product?.is_liquid === false?'is-old':''}">${esc(workshopRecipeTypeLabel(item))}</span></div>
                <div class="numbers"><span>Планок / шт<b>${fmt(item.planksPerUnit)}</b></span><span>На складе<b>${fmt(item.stockQty)} шт</b></span><span>Минимум<b>${fmt(item.minStockQty || 0)} шт</b></span><span>Компонентов<b>${materialCount}</b></span></div>
                <small class="mt-2">${batch ? `Безотходно: ${batch.packs} уп. → ${batch.output} шт` : 'Норма ламината не задана'}${item.sideA || item.sideB ? ' · '+esc([item.sideA,item.sideB].filter(Boolean).join(' / ')):''}</small>
                <div class="workshop-recipe-actions">
                    ${canManageWorkshop() ? `<button type="button" class="workshop-link-btn" data-recipe-edit="${idOf(item)}"><i class="bi bi-pencil"></i> Изменить</button>` : ''}
                    ${isWorkshopAdmin() ? `<button type="button" class="workshop-icon-action is-danger" data-delete-recipe="${idOf(item)}" title="Удалить"><i class="bi bi-trash3"></i></button>` : ''}
                </div>
            </article>`;
        }).join('') : '<div class="workshop-empty"><i class="bi bi-diagram-3"></i>Создайте первую рецептуру</div>';
        host.querySelectorAll('[data-recipe-edit]').forEach(button => button.addEventListener('click', event => {
            event.stopPropagation();
            openRecipeEdit(button.dataset.recipeEdit);
        }));
        host.querySelectorAll('[data-delete-recipe]').forEach(button => button.addEventListener('click', event => {
            event.stopPropagation();
            deleteWorkshopRecipe(button.dataset.deleteRecipe);
        }));
    }

    const movementLabels = {
        laminate_receipt:'Приход ламината', production_laminate:'Ламинат в производство',
        production_material:'Материал в производство', production_component:'Компонент в производство',
        production_output:'Изготовлено', dealer_issue:'Выдано дилеру', dealer_return:'Возврат от дилера',
        dealer_replacement:'Замена у дилера', writeoff:'Списание', material_receipt:'Приход материала',
        material_issue:'Расход материала', stocktake_adjustment:'Корректировка инвентаризации', manual_correction:'Корректировка остатка',
        opening_balance:'Стартовый остаток в цехе', opening_dealer_balance:'Стартовый остаток у дилера'
    };

    function movementName(item) {
        if (item.recipe?.name) return item.recipe.name;
        if (item.product) return item.product.sku ? item.product.sku + ' ' + (item.product.name || '') : (item.product.name || '—');
        if (item.material?.name) return item.material.name;
        return '—';
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
        if ($('ws-recipe-product')) $('ws-recipe-product').innerHTML = productOptions('Без ламината');
        ['ws-production-recipe','ws-dealer-recipe'].forEach(id => { if ($(id)) $(id).innerHTML = recipeOptions(); });
        if ($('ws-material-id')) $('ws-material-id').innerHTML = materialOptions();
        
        if ($('ws-receipt-memo')) {
            const open = state.memos.filter(item => item.status === 'created' || item.status === 'mismatch');
            $('ws-receipt-memo').innerHTML = option('', 'Выберите служебную записку') + open.map(item => option(idOf(item), `№${item.number} · ${dateText(item.date)} · ${(item.lines || []).length} поз.`)).join('');
        }
        if ($('ws-opening-dealer')) $('ws-opening-dealer').innerHTML = dealerOptions();
        updateWriteoffItems();
    }

    function resetMemo() {
        editingMemoId = '';
        $('ws-memo-form')?.reset();
        if ($('ws-memo-title')) $('ws-memo-title').textContent = 'Что приняли со склада';
        if ($('ws-memo-quick-submit')) $('ws-memo-quick-submit').hidden = false;
        $('ws-memo-date').value = todayValue();
        const currentUser = window.CRMAuth?.user || {};
        $('ws-memo-signed').value = currentUser.fullName || currentUser.name || currentUser.username || '';
        memoDraft.clear();
        memoFilter = 'all';
        if ($('ws-memo-search')) $('ws-memo-search').value = '';
        document.querySelectorAll('[data-memo-filter]').forEach(button => {
            button.classList.toggle('active', button.dataset.memoFilter === memoFilter);
        });
        renderMemoProductPicker();
    }

    function recipesForProduct(productId) {
        const rank = { sample: 0, stand: 1, sign: 2, other: 3 };
        return state.recipes
            .filter(recipe => idOf(recipe.product) === String(productId || '') && n(recipe.planksPerUnit) > 0)
            .sort((a,b) => (rank[a.outputType] ?? 9) - (rank[b.outputType] ?? 9) || String(a.name || '').localeCompare(String(b.name || ''), 'ru'));
    }

    function defaultRecipeForProduct(productId) {
        return recipesForProduct(productId)[0] || null;
    }

    function recipeTypeLabel(recipe) {
        if (!recipe) return 'Нет рецептуры';
        return workshopRecipeTypeLabel(recipe);
    }

    function recommendedPacksForRecipe(recipe) {
        if (!recipe) return 0;
        const product = recipe.product || productById(idOf(recipe.product));
        const pq = recipePack(recipe);
        const per = Math.max(0, n(recipe.planksPerUnit));
        if (!pq || !per) return 0;

        const stock = Math.max(0, n(recipe.stockQty));
        const minimum = Math.max(0, n(recipe.minStockQty));
        const shortage = Math.max(0, minimum - stock);
        const batch = noWasteBatch(pq, per);

        if (batch) {
            const neededUnits = shortage > 0 ? shortage : (stock <= minimum ? batch.output : 0);
            if (neededUnits <= 0) return 0;
            return Math.max(batch.packs, Math.ceil(neededUnits / batch.output) * batch.packs);
        }

        if (shortage > 0) return Math.max(1, Math.ceil((shortage * per) / pq));
        return stock <= minimum ? 1 : 0;
    }

    function memoProductMeta(product) {
        const recipes = recipesForProduct(idOf(product));
        const draft = memoDraft.get(idOf(product));
        const selectedRecipe = recipeById(draft?.recipeId) || recipes[0] || null;
        const pq = selectedRecipe ? recipePack(selectedRecipe) : packQty(product);
        const per = n(selectedRecipe?.planksPerUnit);
        const stock = n(selectedRecipe?.stockQty);
        const minimum = n(selectedRecipe?.minStockQty);
        const needs = product?.is_liquid !== false && selectedRecipe
            ? ((minimum > 0 && stock <= minimum) || (minimum === 0 && stock <= 0))
            : false;
        const suggestedPacks = selectedRecipe ? recommendedPacksForRecipe(selectedRecipe) : 0;
        return { recipes, selectedRecipe, pq, per, stock, minimum, needs, suggestedPacks };
    }

    function memoRowMatchesFilter(product, meta) {
        const term = ($('ws-memo-search')?.value || '').trim().toLowerCase();
        const text = `${product.sku || ''} ${product.name || ''}`.toLowerCase();
        if (term && !text.includes(term)) return false;
        const selected = memoDraft.has(idOf(product));
        if (memoFilter === 'selected') return selected;
        if (memoFilter === 'need') return meta.needs || selected;
        return true;
    }

    function memoRecipeSelectHtml(productId, recipes, selectedRecipe) {
        if (!recipes.length) return `<button type="button" class="ws-memo-quick-norm" data-quick-norm-product="${esc(productId)}"><i class="bi bi-sliders"></i> Задать норму</button>`;
        if (recipes.length === 1) {
            return `<span class="ws-memo-recipe-static"><strong>${recipeTypeLabel(selectedRecipe)}</strong><small>${esc(selectedRecipe.name || '')}</small></span>`;
        }
        return `<select class="form-select ws-memo-grid-recipe" data-product-id="${esc(productId)}">${recipes.map(recipe => option(idOf(recipe), `${recipeTypeLabel(recipe)} · ${recipe.name}`, idOf(recipe) === idOf(selectedRecipe))).join('')}</select>`;
    }

    function renderMemoProductPicker() {
        const host = $('ws-memo-product-list');
        if (!host) return;

        const rows = state.products
            .map(product => ({ product, meta: memoProductMeta(product) }))
            .filter(item => memoRowMatchesFilter(item.product, item.meta))
            .sort((a,b) => {
                const aSelected = memoDraft.has(idOf(a.product)) ? 1 : 0;
                const bSelected = memoDraft.has(idOf(b.product)) ? 1 : 0;
                if (aSelected !== bSelected) return bSelected - aSelected;
                if (a.meta.needs !== b.meta.needs) return Number(b.meta.needs) - Number(a.meta.needs);
                return String(a.product.sku || '').localeCompare(String(b.product.sku || ''), 'ru', { numeric:true });
            });

        if (!rows.length) {
            host.innerHTML = '<div class="workshop-empty"><i class="bi bi-search"></i>Подходящих позиций нет</div>';
            updateMemoSummary();
            return;
        }

        host.innerHTML = rows.map(({product,meta}) => {
            const productId = idOf(product);
            const draft = memoDraft.get(productId);
            const selected = Boolean(draft);
            const recipe = meta.selectedRecipe;
            const packs = selected ? Math.max(0, Math.floor(n(draft.packs))) : 0;
            const totalPlanks = packs * meta.pq;
            const output = meta.per > 0 ? Math.floor(totalPlanks / meta.per) : 0;
            const remainder = meta.per > 0 ? totalPlanks - output * meta.per : 0;
            const disabled = !meta.pq;
            const stockClass = meta.needs ? 'is-low' : '';
            const urgency = meta.needs
                ? `<span class="ws-memo-need"><i class="bi bi-exclamation-circle"></i> нужно пополнить</span>`
                : (product.is_liquid === false
                    ? '<span class="ws-memo-need is-old"><i class="bi bi-clock-history"></i> неактуален</span>'
                    : '');
            const suggestion = meta.suggestedPacks > 0
                ? `<button type="button" class="ws-memo-suggest" data-suggest-packs="${meta.suggestedPacks}" title="Подставить рекомендуемое количество">${meta.suggestedPacks} уп. рекоменд.</button>`
                : '';
            return `<div class="workshop-memo-product-row ${selected ? 'is-selected' : ''} ${stockClass}" data-product-id="${productId}">
                <div class="ws-memo-select-cell">
                    <input type="checkbox" class="form-check-input ws-memo-grid-check" ${selected ? 'checked' : ''} ${disabled ? 'disabled' : ''}>
                </div>
                <div class="ws-memo-product-cell">
                    <strong>${esc(product.sku || '—')} · ${esc(product.name || '')}</strong>
                    <small>${meta.pq ? meta.pq+' пл./уп.' : 'не указано планок в упаковке'}${urgency}</small>
                </div>
                <div class="ws-memo-stock-cell">
                    <strong>${recipe ? fmt(meta.stock) + ' шт' : '—'}</strong>
                    <small>${recipe ? 'готовых · минимум '+fmt(meta.minimum) : 'норма не нужна для прихода'} ${suggestion}</small>
                </div>
                <div class="ws-memo-packs-cell">
                    <input type="number" min="1" step="1" inputmode="numeric" class="form-control ws-memo-grid-packs" value="${selected ? packs : ''}" placeholder="${meta.suggestedPacks || 1}" ${selected ? '' : 'disabled'}>
                </div>
                <div class="ws-memo-result-cell">
                    ${memoRecipeSelectHtml(productId, meta.recipes, recipe)}
                    <div class="ws-memo-output-preview">${selected
                        ? (recipe && meta.per > 0
                            ? `<strong>${output} ${recipeTypeLabel(recipe).toLowerCase()}</strong><small>${totalPlanks} пл.${remainder ? ' · остаток '+remainder+' пл.' : ' · без отхода'}</small>`
                            : `<strong>${packs} уп.</strong><small>${totalPlanks} пл. · принять можно без нормы</small>`)
                        : recipe ? '<small>Отметьте позицию</small>' : '<small>Можно принять без нормы</small>'}</div>
                </div>
            </div>`;
        }).join('');

        host.querySelectorAll('.workshop-memo-product-row').forEach(row => {
            const productId = row.dataset.productId;
            const check = row.querySelector('.ws-memo-grid-check');
            const packsInput = row.querySelector('.ws-memo-grid-packs');
            const recipeSelect = row.querySelector('.ws-memo-grid-recipe');

            check?.addEventListener('change', () => {
                if (check.checked) {
                    const meta = memoProductMeta(productById(productId));
                    const recipe = meta.selectedRecipe;
                    memoDraft.set(productId, {
                        recipeId: idOf(recipe),
                        packs: meta.suggestedPacks || (recipe ? noWasteBatch(meta.pq, meta.per)?.packs : 0) || 1
                    });                } else {
                    memoDraft.delete(productId);
                }
                renderMemoProductPicker();
            });

            packsInput?.addEventListener('input', () => {
                const draft = memoDraft.get(productId);
                if (!draft) return;
                draft.packs = Math.max(0, Math.floor(n(packsInput.value)));
                memoDraft.set(productId, draft);
                updateMemoRowPreview(row);
                updateMemoSummary();
            });

            recipeSelect?.addEventListener('change', () => {
                const draft = memoDraft.get(productId);
                if (draft) {
                    draft.recipeId = recipeSelect.value;
                    const recipe = recipeById(recipeSelect.value);
                    const recommended = recommendedPacksForRecipe(recipe);
                    if (!draft.packs || draft.packs <= 0) draft.packs = recommended || 1;
                    memoDraft.set(productId, draft);
                }
                renderMemoProductPicker();
            });

            row.querySelector('.ws-memo-suggest')?.addEventListener('click', event => {
                event.preventDefault();
                const suggested = Math.max(1, Math.floor(n(event.currentTarget.dataset.suggestPacks)));
                const meta = memoProductMeta(productById(productId));
                memoDraft.set(productId, {
                    recipeId: idOf(meta.selectedRecipe),
                    packs: suggested
                });
                renderMemoProductPicker();
            });

            row.querySelector('[data-quick-norm-product]')?.addEventListener('click', event => {
                event.preventDefault();
                openQuickNorm(event.currentTarget.dataset.quickNormProduct);
            });
        });

        updateMemoSummary();
    }

    function updateMemoRowPreview(row) {
        const productId = row?.dataset?.productId;
        const draft = memoDraft.get(productId);
        if (!row || !draft) return;
        const product = productById(productId);
        const recipe = recipeById(draft.recipeId);
        const pq = recipe ? recipePack(recipe) : packQty(product);
        const per = n(recipe?.planksPerUnit);
        const packs = Math.max(0, Math.floor(n(draft.packs)));
        const totalPlanks = packs * pq;
        const output = per > 0 ? Math.floor(totalPlanks / per) : 0;
        const remainder = per > 0 ? totalPlanks - output * per : 0;
        const preview = row.querySelector('.ws-memo-output-preview');
        if (!preview) return;
        preview.innerHTML = recipe && per > 0
            ? `<strong>${output} ${recipeTypeLabel(recipe).toLowerCase()}</strong><small>${totalPlanks} пл.${remainder ? ' · остаток '+remainder+' пл.' : ' · без отхода'}</small>`
            : `<strong>${packs} уп.</strong><small>${totalPlanks} пл. · норму производства можно задать позже</small>`;
    }

    function updateMemoSummary() {
        let totalPacks = 0;
        let totalPlanks = 0;
        let totalOutput = 0;
        let valid = true;
        let withoutRecipe = 0;
        const breakdown = {};

        memoDraft.forEach((draft, productId) => {
            const recipe = recipeById(draft.recipeId);
            const product = productById(productId);
            const pq = recipe ? recipePack(recipe) : packQty(product);
            const per = n(recipe?.planksPerUnit);
            const packs = Math.max(0, Math.floor(n(draft.packs)));
            if (!product || !pq || packs <= 0) valid = false;
            const planks = packs * pq;
            const output = per > 0 ? Math.floor(planks / per) : 0;
            totalPacks += packs;
            totalPlanks += planks;
            totalOutput += output;
            if (recipe && per > 0) {
                const label = recipeTypeLabel(recipe);
                breakdown[label] = (breakdown[label] || 0) + output;
            } else {
                withoutRecipe++;
            }
        });

        if ($('ws-memo-total-lines')) $('ws-memo-total-lines').textContent = memoDraft.size;
        if ($('ws-memo-total-packs')) $('ws-memo-total-packs').textContent = fmt(totalPacks);
        if ($('ws-memo-total-planks')) $('ws-memo-total-planks').textContent = fmt(totalPlanks);
        if ($('ws-memo-total-output')) $('ws-memo-total-output').textContent = fmt(totalOutput);

        const validation = $('ws-memo-validation');
        if (validation) {
            if (!memoDraft.size) {
                validation.textContent = 'Выберите позиции';
                validation.className = '';
            } else if (!valid) {
                validation.textContent = 'Проверьте количество упаковок и данные товара';
                validation.className = 'is-error';
            } else {
                const parts = Object.entries(breakdown).map(([name,qty]) => `${name}: ${fmt(qty)}`);
                const noNorm = withoutRecipe ? ` · без нормы: ${withoutRecipe} поз.` : '';
                validation.textContent = `Готово к приходу${parts.length ? ' · '+parts.join(' · ') : ''}${noNorm}`;
                validation.className = 'is-ok';
            }
        }
    }
    $('ws-memo-search')?.addEventListener('input', renderMemoProductPicker);
    document.querySelectorAll('[data-memo-filter]').forEach(button => {
        button.addEventListener('click', () => {
            memoFilter = button.dataset.memoFilter || 'need';
            document.querySelectorAll('[data-memo-filter]').forEach(item => item.classList.toggle('active', item === button));
            renderMemoProductPicker();
        });
    });

    function openMemoEdit(memoId) {
        if (!canManageWorkshop()) return;
        const memo = memoById(memoId);
        if (!memo || memo.status === 'accepted' || memo.postedAt) {
            return toast('Эту служебную записку уже нельзя редактировать', 'warning');
        }
        resetMemo();
        editingMemoId = memoId;
        if ($('ws-memo-title')) $('ws-memo-title').textContent = `Редактирование служебной №${memo.number}`;
        if ($('ws-memo-quick-submit')) $('ws-memo-quick-submit').hidden = true;
        $('ws-memo-number').value = memo.number || '';
        $('ws-memo-date').value = dateInputValue(memo.date);
        $('ws-memo-signed').value = memo.signedBy || memo.createdBy?.name || '';
        $('ws-memo-note').value = memo.note || '';
        memoDraft.clear();
        (memo.lines || []).forEach(line => {
            memoDraft.set(idOf(line.product), {
                recipeId: idOf(line.recipe),
                packs: Math.max(1, Math.floor(n(line.requestedPacks)))
            });
        });
        memoFilter = 'selected';
        document.querySelectorAll('[data-memo-filter]').forEach(button => {
            button.classList.toggle('active', button.dataset.memoFilter === memoFilter);
        });
        renderMemoProductPicker();
        bootstrap.Modal.getOrCreateInstance($('ws-memo-modal')).show();
    }

    async function deleteWorkshopMemo(memoId) {
        if (!isWorkshopAdmin()) return;
        const memo = memoById(memoId);
        if (!memo) return;
        if (!window.confirm(`Удалить служебную №${memo.number}? Это доступно только администратору.`)) return;
        await send(API + '/memos/' + encodeURIComponent(memoId), 'DELETE', {}, 'Служебная записка удалена');
    }

    function collectMemoPayload() {
        const lines = [];
        let invalid = false;

        memoDraft.forEach((draft, productId) => {
            const recipe = recipeById(draft.recipeId);
            const product = productById(productId);
            const packs = Math.max(0, Math.floor(n(draft.packs)));
            const pq = recipe ? recipePack(recipe) : packQty(product);
            if (!product || !pq || packs <= 0) {
                invalid = true;
                return;
            }
            lines.push({
                productId,
                recipeId: recipe ? idOf(recipe) : null,
                requestedPacks: packs
            });
        });

        if (!lines.length) {
            toast('Отметьте хотя бы одну позицию', 'warning');
            return null;
        }
        if (invalid) {
            toast('Проверьте количество упаковок и данные товара', 'warning');
            return null;
        }
        return {
            number: $('ws-memo-number').value,
            date: $('ws-memo-date').value,
            signedBy: $('ws-memo-signed').value,
            note: $('ws-memo-note').value,
            lines
        };
    }
    $('ws-memo-form')?.addEventListener('submit', async event => {
        event.preventDefault();
        const payload = collectMemoPayload();
        if (!payload) return;
        await send(
            editingMemoId ? API + '/memos/' + encodeURIComponent(editingMemoId) : API + '/memos',
            editingMemoId ? 'PUT' : 'POST',
            payload,
            editingMemoId ? 'Служебная записка обновлена' : 'Служебная записка создана',
            'memo'
        );
    });

    $('ws-memo-quick-submit')?.addEventListener('click', async () => {
        if (editingMemoId) return;
        const payload = collectMemoPayload();
        if (!payload) return;

        const button = $('ws-memo-quick-submit');
        const oldHtml = button.innerHTML;
        button.disabled = true;
        button.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Принимаем…';
        try {
            const createResponse = await fetch(API + '/memos', {
                method:'POST',
                headers:{'Content-Type':'application/json'},
                body:JSON.stringify(payload)
            });
            const memo = await createResponse.json().catch(() => ({}));
            if (!createResponse.ok) throw new Error(memo.error || 'Не удалось создать служебную записку');

            const memoId = idOf(memo);
            const receiveLines = (memo.lines || []).map(line => ({
                lineId:idOf(line),
                actualProductId:idOf(line.product),
                deliveredPacks:Math.max(0, Math.floor(n(line.requestedPacks))),
                checked:true,
                discrepancyReason:''
            }));
            const receiveResponse = await fetch(API + '/memos/' + encodeURIComponent(memoId) + '/receive', {
                method:'POST',
                headers:{'Content-Type':'application/json'},
                body:JSON.stringify({
                    date:payload.date || todayValue(),
                    note:payload.note || '',
                    lines:receiveLines
                })
            });
            const received = await receiveResponse.json().catch(() => ({}));
            if (!receiveResponse.ok || received.accepted === false) {
                throw new Error(received.error || received.message || 'Служебка создана, но приход требует отдельной сверки');
            }

            hideModal('memo');
            toast('Приход принят и оприходован одним действием', 'success');
            await load();
        } catch (error) {
            toast(error.message || 'Ошибка при оформлении прихода', 'error');
            await load();
        } finally {
            button.disabled = false;
            button.innerHTML = oldHtml;
        }
    });

    function openQuickNorm(productId) {
        const product = productById(productId);
        if (!product) return;
        $('ws-quick-norm-product').value = productId;
        $('ws-quick-norm-title').textContent = `${product.sku || '—'} · ${product.name || ''}`;
        $('ws-quick-norm-pack').value = packQty(product) || '';
        $('ws-quick-norm-planks').value = '';
        $('ws-quick-norm-min').value = 0;
        $('ws-quick-norm-name').value = `Планшет ${product.sku || ''} ${product.name || ''}`.trim();
        $('ws-quick-norm-note').value = '';
        bootstrap.Modal.getOrCreateInstance($('ws-quick-norm-modal')).show();
    }

    $('ws-quick-norm-form')?.addEventListener('submit', async event => {
        event.preventDefault();
        const productId = $('ws-quick-norm-product').value;
        const product = productById(productId);
        if (!product) return;
        try {
            const response = await fetch(API + '/recipes', {
                method:'POST',
                headers:{'Content-Type':'application/json'},
                body:JSON.stringify({
                    name:$('ws-quick-norm-name').value,
                    outputType:'sample',
                    sku:`SAMPLE-${product.sku || productId.slice(-6)}`,
                    productId,
                    planksPerUnit:n($('ws-quick-norm-planks').value),
                    packQtyOverride:n($('ws-quick-norm-pack').value),
                    minStockQty:n($('ws-quick-norm-min').value),
                    note:$('ws-quick-norm-note').value
                })
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error || 'Не удалось сохранить норму');
            bootstrap.Modal.getOrCreateInstance($('ws-quick-norm-modal')).hide();
            toast('Норма сохранена', 'success');
            await load();
            const recipe = state.recipes.find(item => idOf(item.product) === productId && item.outputType === 'sample');
            if (recipe) {
                memoDraft.set(productId, {
                    recipeId:idOf(recipe),
                    packs:recommendedPacksForRecipe(recipe) || noWasteBatch(recipePack(recipe), recipe.planksPerUnit)?.packs || 1
                });
            }
            renderMemoProductPicker();
        } catch (error) {
            toast(error.message || 'Ошибка сохранения нормы', 'error');
        }
    });

    function resetReceipt(selectedMemoId = '') {
        $('ws-receipt-form')?.reset();
        $('ws-receipt-date').value = todayValue();
        populateFormSelects();
        if (selectedMemoId && $('ws-receipt-memo')) $('ws-receipt-memo').value = selectedMemoId;
        renderReceiptLines();
    }

    function openReceiptForMemo(memoId) {
        resetReceipt(memoId);
        bootstrap.Modal.getOrCreateInstance($('ws-receipt-modal')).show();
    }

    function renderReceiptLines() {
        const memo = memoById($('ws-receipt-memo')?.value);
        const host = $('ws-receipt-lines');
        if (!host) return;
        if (!memo) {
            host.innerHTML = '<div class="workshop-empty"><i class="bi bi-check2-square"></i>Выберите служебную записку</div>';
            updateReceiptCalc();
            return;
        }

        host.innerHTML = (memo.lines || []).map(line => {
            const lineId = idOf(line);
            const expectedId = idOf(line.product);
            const actualId = idOf(line.actualProduct) || expectedId;
            const delivered = memo.status === 'mismatch' ? Number(line.deliveredPacks || 0) : Number(line.requestedPacks || 0);
            const checked = memo.status === 'mismatch' ? Boolean(line.checked) : false;
            return `<div class="workshop-receipt-line" data-line-id="${lineId}" data-expected-id="${expectedId}" data-requested="${Number(line.requestedPacks || 0)}">
                <label class="workshop-check-cell"><input type="checkbox" class="form-check-input ws-receipt-checked" ${checked ? 'checked' : ''}><span>Проверено</span></label>
                <div class="workshop-receipt-expected"><span>По служебке</span><strong>${esc(line.product?.sku || '—')} · ${esc(line.product?.name || '')}</strong><small>${Number(line.requestedPacks || 0)} уп. → ${Number(line.plannedOutputQty || 0)} изделий</small></div>
                <label><span>Фактически позиция</span><select class="form-select ws-receipt-actual">${productOptions()}</select></label>
                <label><span>Привезли, упаковок</span><input type="number" min="0" step="1" class="form-control ws-receipt-packs" value="${delivered}"></label>
                <label class="workshop-receipt-reason"><span>Расхождение / что обменять</span><input class="form-control ws-receipt-reason-input" value="${esc(line.discrepancyReason || '')}" placeholder="Заполнится при необходимости"></label>
                <div class="workshop-receipt-line-status"></div>
            </div>`;
        }).join('');

        host.querySelectorAll('.workshop-receipt-line').forEach(row => {
            const actual = row.querySelector('.ws-receipt-actual');
            const memoLine = (memo.lines || []).find(line => idOf(line) === row.dataset.lineId);
            actual.value = idOf(memoLine?.actualProduct) || row.dataset.expectedId;
            row.querySelectorAll('input,select').forEach(input => input.addEventListener('input', () => updateReceiptLine(row)));
            updateReceiptLine(row);
        });
        updateReceiptCalc();
    }

    function updateReceiptLine(row) {
        const expectedId = row.dataset.expectedId;
        const requested = Number(row.dataset.requested || 0);
        const actualId = row.querySelector('.ws-receipt-actual')?.value || '';
        const delivered = Math.max(0, Math.floor(n(row.querySelector('.ws-receipt-packs')?.value)));
        const checked = Boolean(row.querySelector('.ws-receipt-checked')?.checked);
        const sameProduct = actualId === expectedId;
        const sameQty = delivered === requested;
        const match = checked && sameProduct && sameQty;
        const status = row.querySelector('.workshop-receipt-line-status');
        row.classList.toggle('is-match', match);
        row.classList.toggle('is-mismatch', checked && !match);
        if (match) {
            status.innerHTML = '<i class="bi bi-check-circle-fill"></i><span>Совпадает</span>';
        } else if (!checked) {
            status.innerHTML = '<i class="bi bi-circle"></i><span>Не проверено</span>';
        } else {
            const diff = delivered - requested;
            const parts = [];
            if (!sameProduct) parts.push('другая позиция');
            if (!sameQty) parts.push(diff > 0 ? `лишних ${diff} уп.` : `не хватает ${Math.abs(diff)} уп.`);
            status.innerHTML = `<i class="bi bi-exclamation-triangle-fill"></i><span>${esc(parts.join(' · ') || 'расхождение')}</span>`;
            const reason = row.querySelector('.ws-receipt-reason-input');
            if (reason && !reason.value) reason.placeholder = parts.join(' · ');
        }
        updateReceiptCalc();
    }

    function updateReceiptCalc() {
        const memo = memoById($('ws-receipt-memo')?.value);
        const rows = [...document.querySelectorAll('#ws-receipt-lines .workshop-receipt-line')];
        if (!memo || !rows.length) {
            $('ws-receipt-calc').innerHTML = 'Выберите служебную записку.';
            return;
        }
        const matched = rows.filter(row => row.classList.contains('is-match')).length;
        const unchecked = rows.filter(row => !row.querySelector('.ws-receipt-checked')?.checked).length;
        const mismatched = rows.length - matched - unchecked;
        $('ws-receipt-calc').innerHTML = matched === rows.length
            ? `<strong class="text-success">Все ${rows.length} позиций совпадают.</strong> После сохранения упаковки будут оприходованы в цех.`
            : `Совпало: <strong>${matched}/${rows.length}</strong> · расхождений: <strong class="text-danger">${mismatched}</strong> · не проверено: <strong>${unchecked}</strong>. Ламинат пока не будет оприходован.`;
    }

    $('ws-receipt-memo')?.addEventListener('change', renderReceiptLines);

    $('ws-receipt-form')?.addEventListener('submit', async event => {
        event.preventDefault();
        const memoId = $('ws-receipt-memo').value;
        if (!memoId) return toast('Выберите служебную записку', 'warning');
        const lines = [...document.querySelectorAll('#ws-receipt-lines .workshop-receipt-line')].map(row => ({
            lineId: row.dataset.lineId,
            actualProductId: row.querySelector('.ws-receipt-actual')?.value,
            deliveredPacks: Math.max(0, Math.floor(n(row.querySelector('.ws-receipt-packs')?.value))),
            checked: Boolean(row.querySelector('.ws-receipt-checked')?.checked),
            discrepancyReason: row.querySelector('.ws-receipt-reason-input')?.value || ''
        }));
        try {
            const response = await fetch(`${API}/memos/${encodeURIComponent(memoId)}/receive`, {
                method:'POST',
                headers:{'Content-Type':'application/json'},
                body:JSON.stringify({ date:$('ws-receipt-date').value, note:$('ws-receipt-note').value, lines })
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error || 'Ошибка сверки');
            hideModal('receipt');
            toast(data.message || (data.accepted ? 'Приход принят' : 'Есть расхождения'), data.accepted ? 'success' : 'warning');
            await load();
        } catch (error) {
            toast(error.message || 'Ошибка сверки', 'error');
        }
    });

    function updateProductionMemoOptions() {
        const select = $('ws-production-memo-line');
        if (!select) return;
        const recipe = productionRecipe();
        const recipeId = idOf(recipe);
        const productId = idOf(recipe?.product);
        const options = [];
        state.memos.filter(memo => memo.status === 'accepted').forEach(memo => {
            (memo.lines || []).forEach(line => {
                const lineRecipeId = idOf(line.recipe);
                const lineProductId = idOf(line.product);
                if (recipeId && lineRecipeId && lineRecipeId !== recipeId) return;
                if (productId && lineProductId !== productId) return;
                const planned = Number(line.plannedOutputQty || 0);
                const produced = Number(line.producedQty || 0);
                const remaining = Math.max(0, planned - produced);
                options.push({
                    value: `${idOf(memo)}::${idOf(line)}`,
                    label: `№${memo.number} · ${line.product?.sku || line.product?.name || 'позиция'} · план ${planned} / готово ${produced} / осталось ${remaining}`
                });
            });
        });
        select.innerHTML = option('', 'Без привязки / из текущего остатка') + options.map(item => option(item.value, item.label)).join('');
    }

    function resetProduction() {
        $('ws-production-form')?.reset();
        const advanced = $('ws-production-form')?.querySelector('.workshop-advanced-fields');
        if (advanced) advanced.open = false;
        $('ws-production-date').value = todayValue();
        $('ws-production-output').value = 1;
        if ($('ws-production-custom-toggle')) $('ws-production-custom-toggle').checked = false;
        if ($('ws-production-custom-fields')) $('ws-production-custom-fields').hidden = true;
        if ($('ws-production-actual-planks')) $('ws-production-actual-planks').value = '';
        if ($('ws-production-custom-reason')) $('ws-production-custom-reason').value = '';
        if ($('ws-production-custom-order')) $('ws-production-custom-order').value = '';
        if ($('ws-production-custom-dimensions')) $('ws-production-custom-dimensions').value = '';
        populateFormSelects();
        updateProductionMemoOptions();
        updateProductionCalc();
    }
    function productionRecipe() { return recipeById($('ws-production-recipe')?.value); }
    function laminateAvailableForRecipe(recipe) {
        const productId = idOf(recipe?.product);
        const stock = state.laminateStocks.find(item => idOf(item.product) === productId);
        return n(stock?.planksQty);
    }
    function productionMaterialNeeds(recipe, outputQty) {
        return (recipe?.materials || []).map(line => {
            const material = line.material || {};
            return {
                name: material.name || 'Материал',
                unit: material.unit || 'шт',
                qty: n(line.qty) * outputQty,
                mode: line.mode || 'strict',
                stock: n(material.stockQty)
            };
        });
    }

    function updateProductionCustomVisibility() {
        const recipe = productionRecipe();
        const box = $('ws-production-custom-fields');
        const toggle = $('ws-production-custom-toggle');
        const shell = toggle?.closest('.workshop-custom-norm');
        if (!box || !toggle || !shell) return;
        const hasLaminate = Boolean(recipe?.product && n(recipe?.planksPerUnit) > 0);
        shell.classList.toggle('is-hidden', !hasLaminate);
        if (!hasLaminate) {
            toggle.checked = false;
            box.hidden = true;
        } else {
            box.hidden = !toggle.checked;
            if (toggle.checked && !$('ws-production-actual-planks').value) {
                $('ws-production-actual-planks').value = n(recipe.planksPerUnit) || '';
            }
        }
    }

    function updateProductionCalc() {
        const recipe = productionRecipe();
        if (!recipe) {
            $('ws-production-calc').textContent='Выберите изделие — CRM покажет норму и возможный выпуск.';
            updateProductionCustomVisibility();
            return;
        }

        updateProductionCustomVisibility();
        const output = Math.max(0, n($('ws-production-output')?.value));
        const scrap = Math.max(0, n($('ws-production-scrap')?.value));
        const materialNeeds = productionMaterialNeeds(recipe, output);

        if (!recipe.product || n(recipe.planksPerUnit) <= 0) {
            const lines = materialNeeds.map(item => {
                const availability = item.mode === 'estimate'
                    ? 'расчётно, остаток не блокирует'
                    : `остаток ${fmt(item.stock,3)} ${esc(item.unit)}`;
                return `<span><strong>${esc(item.name)}</strong>: ${fmt(item.qty,3)} ${esc(item.unit)} · ${availability}</span>`;
            });
            $('ws-production-calc').innerHTML = `Изготавливаем: <strong>${fmt(output)} шт</strong>.
                ${lines.length ? '<div class="ws-production-material-needs">'+lines.join('')+'</div>' : 'Материалы в рецептуре не заданы.'}`;
            return;
        }

        const pq = recipePack(recipe);
        const standardPer = Math.max(0, n(recipe.planksPerUnit));
        const custom = Boolean($('ws-production-custom-toggle')?.checked);
        const actualPer = custom ? Math.max(0, n($('ws-production-actual-planks')?.value)) : standardPer;
        const need = output * actualPer + scrap;
        const available = laminateAvailableForRecipe(recipe);
        const maxOutput = actualPer > 0 ? Math.floor(available / actualPer) : 0;
        const batch = noWasteBatch(pq, standardPer);
        const deviation = custom && Math.abs(actualPer-standardPer) > 0.0001
            ? ` · фактическая норма <strong>${fmt(actualPer,3)} пл./шт</strong> вместо ${fmt(standardPer,3)}`
            : '';

        $('ws-production-calc').innerHTML = `Стандарт: <strong>${fmt(standardPer,3)} планок / изделие</strong>${pq ? ' · '+pq+' планок в упаковке':''}${deviation}.
        В доступном остатке цеха: <strong>${fmt(available)} планок</strong> → можно изготовить до <strong>${maxOutput} шт</strong>.
        На эту партию будет списано: <strong class="${need>available?'text-danger':''}">${fmt(need,3)} планок</strong>.
        ${batch ? `Стандартная безотходная партия: <strong>${batch.packs} уп. → ${batch.output} шт</strong>.` : ''}`;
    }

    $('ws-production-recipe')?.addEventListener('change', () => {
        updateProductionMemoOptions();
        updateProductionCalc();
    });
    $('ws-production-custom-toggle')?.addEventListener('change', updateProductionCalc);
    ['ws-production-output','ws-production-scrap','ws-production-actual-planks'].forEach(id => $(id)?.addEventListener('input',updateProductionCalc));

    $('ws-production-form')?.addEventListener('submit', async event => {
        event.preventDefault();
        const operations = [...document.querySelectorAll('.workshop-operation-grid label')].map(label => {
            const cb = label.querySelector('.ws-operation-check');
            const qty = label.querySelector('.ws-operation-qty');
            return cb?.checked ? { type:cb.value, qty:n(qty?.value) } : null;
        }).filter(Boolean);
        const source = String($('ws-production-memo-line')?.value || '').split('::');
        await post(API+'/production', {
            recipeId:$('ws-production-recipe').value,
            memoId:source[0] || null,
            memoLineId:source[1] || null,
            outputQty:n($('ws-production-output').value),
            actualPlanksPerUnit:$('ws-production-custom-toggle')?.checked ? n($('ws-production-actual-planks').value) : 0,
            customNormReason:$('ws-production-custom-toggle')?.checked ? $('ws-production-custom-reason').value : '',
            customOrderName:$('ws-production-custom-toggle')?.checked ? $('ws-production-custom-order').value : '',
            customDimensions:$('ws-production-custom-toggle')?.checked ? $('ws-production-custom-dimensions').value : '',
            scrapPlanks:n($('ws-production-scrap').value),
            date:$('ws-production-date').value,
            operations,
            note:$('ws-production-note').value
        }, 'Производство записано', 'production');
    });

    const dealerSelectedRecipes=new Map();
    function dealerRecipeCollection(recipe){
        const product=productById(idOf(recipe.product))||recipe.product;
        return String(product?.collection||'').trim().toUpperCase();
    }
    function filteredDealerRecipes(){
        const q=String($('ws-dealer-recipe-search')?.value||'').toLowerCase().trim();
        const collection=$('ws-dealer-collection')?.value||'';
        return state.recipes.filter(r=>(!collection||dealerRecipeCollection(r)===collection)&&
            [r.name,r.product?.sku,dealerRecipeCollection(r)].join(' ').toLowerCase().includes(q));
    }
    function populateDealerCollections(){
        const select=$('ws-dealer-collection');if(!select)return;
        select.innerHTML=option('','Все коллекции')+[...new Set(state.recipes.map(dealerRecipeCollection).filter(Boolean))]
            .sort((a,b)=>a.localeCompare(b,'ru')).map(c=>option(c,c)).join('');
    }
    function renderDealerChoices(){
        const grid=$('ws-dealer-recipe-grid');if(!grid)return;
        const filtered=filteredDealerRecipes();
        $('ws-dealer-select-visible').textContent=$('ws-dealer-collection').value?'Выбрать всю коллекцию':'Выбрать все';
        $('ws-dealer-select-visible').disabled=!filtered.length;
        grid.innerHTML=filtered.map(r=>{
            const id=idOf(r),qty=dealerSelectedRecipes.get(id)||0;
            return '<article class="ws-dealer-choice '+(qty?'is-selected':'')+'"><button type="button" data-recipe="'+esc(id)+'" aria-pressed="'+Boolean(qty)+'"><span class="ws-choice-check"><i class="bi bi-'+(qty?'check-lg':'plus-lg')+'"></i></span><span class="ws-dealer-choice-name"><small>'+esc(r.product?.sku||'')+'</small><strong>'+esc(r.name)+'</strong><small>В цехе: '+fmt(r.stockQty||0)+' шт</small></span></button>'+(qty?'<label class="ws-choice-quantity">Количество, шт<input type="number" data-qty="'+esc(id)+'" min="1" step="1" value="'+qty+'" required aria-label="Количество '+esc(r.name)+'" class="form-control"></label>':'')+'</article>';

        }).join('')||'<div class="text-muted small p-2">Ничего не найдено</div>';
        $('ws-dealer-selected-count').textContent=dealerSelectedRecipes.size+' выбрано';
    }
    function resetDealerMovement(){
        $('ws-dealer-form')?.reset();$('ws-dealer-date').value=todayValue();
        dealerSelectedRecipes.clear();
        $('ws-dealer-id').value='';
        closeDealerResults();
        if($('ws-dealer-recipe-search'))$('ws-dealer-recipe-search').value='';
        if($('ws-dealer-search-input'))$('ws-dealer-search-input').value='';
        populateFormSelects();populateDealerCollections();renderDealerChoices();updateDealerCurrent();
        if($('ws-dealer-extra'))$('ws-dealer-extra').open=false;
    }
    function updateDealerCurrent(){
        const dealerId=$('ws-dealer-id')?.value,action=$('ws-dealer-action')?.value||'issue';
        if($('ws-dealer-condition-wrap'))$('ws-dealer-condition-wrap').hidden=action==='issue';
        if($('ws-dealer-extra')&&action!=='issue')$('ws-dealer-extra').open=true;
        $('ws-dealer-current').innerHTML=dealerSelectedRecipes.size
            ? [...dealerSelectedRecipes].map(([id,qty])=>{
                const r=recipeById(id),asset=state.dealerAssets.find(x=>idOf(x.dealer)===dealerId&&idOf(x.recipe)===id);
                return '<div class="py-1">'+esc(r?.name||'Изделие')+' · '+qty+' шт · в цехе '+fmt(r?.stockQty||0)+' · у дилера '+fmt(asset?.qty||0)+'</div>';
            }).join(''):'Выберите изделия для движения.';
    }
    $('ws-dealer-recipe-search')?.addEventListener('input',renderDealerChoices);
    $('ws-dealer-collection')?.addEventListener('change',renderDealerChoices);
    $('ws-dealer-select-visible')?.addEventListener('click',()=>{
        filteredDealerRecipes().forEach(r=>{const id=idOf(r);if(!dealerSelectedRecipes.has(id))dealerSelectedRecipes.set(id,1);});
        renderDealerChoices();updateDealerCurrent();
    });
    $('ws-dealer-clear')?.addEventListener('click',()=>{
        dealerSelectedRecipes.clear();renderDealerChoices();updateDealerCurrent();
    });

    $('ws-dealer-recipe-grid')?.addEventListener('click',e=>{
        const button=e.target.closest('[data-recipe]');if(!button)return;
        const id=button.dataset.recipe;
        if(dealerSelectedRecipes.has(id))dealerSelectedRecipes.delete(id);
        else dealerSelectedRecipes.set(id,1);
        renderDealerChoices();updateDealerCurrent();
    });
    $('ws-dealer-recipe-grid')?.addEventListener('input',e=>{
        const id=e.target.dataset.qty;if(!id)return;
        dealerSelectedRecipes.set(id,Math.max(1,Math.floor(Number(e.target.value)||1)));
        updateDealerCurrent();
    });
    function closeDealerResults(){
        $('ws-dealer-results').hidden=true;
        $('ws-dealer-search-input').setAttribute('aria-expanded','false');
    }
    function renderDealerResults(){
        const q=$('ws-dealer-search-input').value.toLowerCase().trim();
        const list=state.dealers.filter(d=>[d.name,d.city,d.dealerId,d.dealerCode,d.code].join(' ').toLowerCase().includes(q));
        $('ws-dealer-results').innerHTML=list.map(d=>'<button type="button" role="option" data-dealer-choice="'+esc(idOf(d))+'"><strong>'+esc(d.name)+'</strong><small>'+esc([d.dealerId||d.dealerCode||d.code,d.city].filter(Boolean).join(' · '))+'</small></button>').join('')||'<div class="p-3 text-muted">Дилер не найден</div>';
        $('ws-dealer-results').hidden=false;
        $('ws-dealer-search-input').setAttribute('aria-expanded','true');
    }
    $('ws-dealer-search-input')?.addEventListener('focus',renderDealerResults);
    $('ws-dealer-search-input')?.addEventListener('input',()=>{
        $('ws-dealer-id').value='';renderDealerResults();updateDealerCurrent();
    });
    $('ws-dealer-results')?.addEventListener('click',e=>{
        const button=e.target.closest('[data-dealer-choice]');if(!button)return;
        const d=state.dealers.find(d=>idOf(d)===button.dataset.dealerChoice);if(!d)return;
        $('ws-dealer-id').value=idOf(d);
        $('ws-dealer-search-input').value=[d.name,d.city].filter(Boolean).join(' · ');
        closeDealerResults();updateDealerCurrent();
    });
    $('ws-dealer-search-input')?.addEventListener('keydown',e=>{
        if(e.key==='Escape'){closeDealerResults();return;}
        if(e.key==='ArrowDown'){e.preventDefault();renderDealerResults();$('ws-dealer-results').querySelector('button')?.focus();}
        if(e.key==='Enter'){e.preventDefault();if(!$('ws-dealer-results').hidden)$('ws-dealer-results').querySelector('button')?.click();}
    });
    $('ws-dealer-results')?.addEventListener('keydown',e=>{
        const buttons=[...$('ws-dealer-results').querySelectorAll('button')],i=buttons.indexOf(document.activeElement);
        if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();buttons[(i+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();}
        if(e.key==='Escape'){closeDealerResults();$('ws-dealer-search-input').focus();closeDealerResults();}
    });
    document.addEventListener('click',e=>{if(!e.target.closest('.ws-dealer-combobox'))closeDealerResults();});
    ['ws-dealer-id','ws-dealer-action'].forEach(id=>$(id)?.addEventListener('change',updateDealerCurrent));
    $('ws-dealer-form')?.addEventListener('submit',async event=>{
        event.preventDefault();
        const lines=[...dealerSelectedRecipes].map(([recipeId,qty])=>({recipeId,qty}));
        if(!$('ws-dealer-id').value||!lines.length){toast('Выберите дилера и изделия','error');return;}
        const btn=event.currentTarget.querySelector('[type="submit"]');if(btn)btn.disabled=true;
        let completed=0;
        try{
            for(const line of lines){
                const response=await fetch(API+'/dealer-movement',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
                    dealerId:$('ws-dealer-id').value,recipeId:line.recipeId,qty:line.qty,
                    action:$('ws-dealer-action').value,returnCondition:$('ws-dealer-condition').value,
                    date:$('ws-dealer-date').value,reason:$('ws-dealer-reason').value,note:$('ws-dealer-note').value
                })});
                const data=await response.json().catch(()=>({}));
                if(!response.ok)throw new Error(data.error||'Ошибка проведения');
                completed++;
            }
            hideModal('dealer');toast('Проведено позиций: '+completed,'success');await load();
        }catch(error){toast('Проведено '+completed+' из '+lines.length+'. '+(error.message||'Ошибка')+'. Проверьте историю перед повтором.','error');await load();}
        finally{if(btn)btn.disabled=false;}
    });

    function resetMaterialMovement(){
        $('ws-material-form')?.reset();
        $('ws-material-date').value=todayValue();
        populateFormSelects();
        updateMaterialConversion();
    }
    function selectedMaterial() { return materialById($('ws-material-id')?.value); }
    function updateMaterialConversion() {
        const material = selectedMaterial();
        const direction = $('ws-material-direction')?.value || 'in';
        const qty = Math.max(0, n($('ws-material-qty')?.value));
        const label = $('ws-material-qty-label');
        const box = $('ws-material-conversion');
        if (!material) {
            if (label) label.textContent = 'Количество';
            if (box) box.textContent = 'Выберите материал.';
            return;
        }
        const purchaseUnit = material.purchaseUnit || material.unit || 'шт';
        const purchaseSize = Math.max(0.0001, n(material.purchaseUnitSize) || 1);
        if (direction === 'in') {
            if (label) label.textContent = `Количество, ${purchaseUnit}`;
            if (box) box.innerHTML = qty
                ? `Будет оприходовано: <strong>${fmt(qty * purchaseSize,3)} ${esc(material.unit || 'шт')}</strong>${purchaseSize !== 1 ? ` · 1 ${esc(purchaseUnit)} = ${fmt(purchaseSize,3)} ${esc(material.unit || '')}` : ''}`
                : `Приход вводится в закупочных единицах: <strong>${esc(purchaseUnit)}</strong>.`;
        } else {
            if (label) label.textContent = `Фактический расход, ${material.unit || 'шт'}`;
            if (box) box.innerHTML = `Расход списывается в базовой единице <strong>${esc(material.unit || 'шт')}</strong>. Остаток: <strong>${fmt(material.stockQty,3)} ${esc(material.unit || '')}</strong>.`;
        }
    }
    ['ws-material-id','ws-material-direction','ws-material-qty'].forEach(id => $(id)?.addEventListener('input', updateMaterialConversion));
    $('ws-material-id')?.addEventListener('change', updateMaterialConversion);
    $('ws-material-direction')?.addEventListener('change', updateMaterialConversion);
    $('ws-material-form')?.addEventListener('submit', async event => {
        event.preventDefault();
        const direction=$('ws-material-direction').value;
        const material=selectedMaterial();
        const enteredQty=n($('ws-material-qty').value);
        const qty=direction==='in' ? enteredQty*Math.max(0.0001,n(material?.purchaseUnitSize)||1) : enteredQty;
        await post(API+'/material-movement', {
            materialId:$('ws-material-id').value, direction, qty, date:$('ws-material-date').value,
            type:direction==='in'?'material_receipt':'material_issue', note:$('ws-material-note').value
        }, 'Движение материала проведено', 'material');
    });

    function resetNewMaterial() {
        $('ws-new-material-form')?.reset();
        $('ws-new-material-id').value = '';
        if ($('ws-new-material-title')) $('ws-new-material-title').textContent = 'Новый материал';
        if ($('ws-new-material-save')) $('ws-new-material-save').textContent = 'Добавить';
        $('ws-new-material-unit').value = 'шт';
        $('ws-new-material-purchase-unit').value = 'шт';
        $('ws-new-material-purchase-size').value = 1;
        $('ws-new-material-stock').value = 0;
        $('ws-new-material-stock').disabled = false;
        $('ws-new-material-min').value = 0;
    }

    function openMaterialEdit(materialId) {
        if (!canManageWorkshop()) return;
        const item = materialById(materialId);
        if (!item) return;
        resetNewMaterial();
        $('ws-new-material-id').value = materialId;
        if ($('ws-new-material-title')) $('ws-new-material-title').textContent = 'Редактирование материала';
        if ($('ws-new-material-save')) $('ws-new-material-save').textContent = 'Сохранить';
        $('ws-new-material-code').value = item.code || '';
        $('ws-new-material-name').value = item.name || '';
        $('ws-new-material-category').value = item.category || 'consumable';
        $('ws-new-material-unit').value = item.unit || 'шт';
        $('ws-new-material-purchase-unit').value = item.purchaseUnit || item.unit || 'шт';
        $('ws-new-material-purchase-size').value = n(item.purchaseUnitSize) || 1;
        $('ws-new-material-stock').value = n(item.stockQty);
        $('ws-new-material-stock').disabled = true;
        $('ws-new-material-min').value = n(item.minQty);
        $('ws-new-material-note').value = item.note || '';
        bootstrap.Modal.getOrCreateInstance($('ws-new-material-modal')).show();
    }

    async function deleteWorkshopMaterial(materialId) {
        if (!isWorkshopAdmin()) return;
        const item = materialById(materialId);
        if (!item) return;
        if (!window.confirm(`Удалить материал «${item.name}»? Если он уже использовался, система не даст удалить его.`)) return;
        await send(API + '/materials/' + encodeURIComponent(materialId), 'DELETE', {}, 'Материал удалён');
    }

        $('ws-new-material-form')?.addEventListener('submit', async event => {
        event.preventDefault();
        const id = $('ws-new-material-id').value;
        const payload = {
            code:$('ws-new-material-code').value,
            name:$('ws-new-material-name').value,
            category:$('ws-new-material-category').value,
            unit:$('ws-new-material-unit').value,
            purchaseUnit:$('ws-new-material-purchase-unit').value,
            purchaseUnitSize:n($('ws-new-material-purchase-size').value),
            minQty:n($('ws-new-material-min').value),
            note:$('ws-new-material-note').value
        };
        if (!id) payload.stockQty = n($('ws-new-material-stock').value);
        await send(id ? API+'/materials/'+encodeURIComponent(id) : API+'/materials', id ? 'PUT' : 'POST', payload, id ? 'Материал обновлён' : 'Материал добавлен', 'new-material');
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
        $('ws-recipe-form')?.reset(); $('ws-recipe-id').value=''; $('ws-recipe-planks').value=0; $('ws-recipe-min-stock').value=0; $('ws-recipe-pack-override').value=0;
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
        const row=document.createElement('div');
        row.className='ws-bom-row ws-bom-material-row';
        row.innerHTML=`<select class="form-select ws-bom-material-id">${materialOptions()}</select><input type="number" min="0" step="0.001" class="form-control ws-bom-qty" placeholder="кол-во" value="${esc(item.qty ?? '')}"><select class="form-select ws-bom-mode"><option value="strict">точно</option><option value="estimate">расчётно</option></select><button type="button"><i class="bi bi-x"></i></button>`;
        $('ws-bom-materials').appendChild(row);
        row.querySelector('.ws-bom-material-id').value=idOf(item.material||item.materialId);
        row.querySelector('.ws-bom-mode').value=item.mode==='estimate'?'estimate':'strict';
        row.querySelector('button').onclick=()=>row.remove();
    }
    function addBomComponent(item={}){
        const row=document.createElement('div');row.className='ws-bom-row';row.innerHTML=`<select class="form-select ws-bom-component-id">${recipeOptions()}</select><input type="number" min="0" step="0.001" class="form-control ws-bom-qty" placeholder="кол-во" value="${esc(item.qty||'')}"><button type="button"><i class="bi bi-x"></i></button>`;
        $('ws-bom-components').appendChild(row);row.querySelector('select').value=idOf(item.recipe||item.recipeId);row.querySelector('button').onclick=()=>row.remove();
    }
    function collectBom(selector,idSelector){
        return [...document.querySelectorAll(selector)].map(row=>({
            id:row.querySelector(idSelector)?.value,
            qty:n(row.querySelector('.ws-bom-qty')?.value),
            mode:row.querySelector('.ws-bom-mode')?.value || 'strict'
        })).filter(x=>x.id&&x.qty>=0);
    }
    function openRecipeEdit(id){
        const item=recipeById(id);if(!item)return;resetRecipe();$('ws-recipe-id').value=id;$('ws-recipe-name').value=item.name||'';$('ws-recipe-type').value=item.outputType||'sample';$('ws-recipe-sku').value=item.sku||'';$('ws-recipe-product').value=idOf(item.product);$('ws-recipe-planks').value=n(item.planksPerUnit);$('ws-recipe-min-stock').value=n(item.minStockQty);$('ws-recipe-pack-override').value=n(item.packQtyOverride);$('ws-recipe-side-a').value=item.sideA||'';$('ws-recipe-side-b').value=item.sideB||'';$('ws-recipe-matrix-pos').value=item.matrixPosName||'';$('ws-recipe-note').value=item.note||'';(item.materials||[]).forEach(addBomMaterial);(item.components||[]).forEach(addBomComponent);updateRecipeCalc();bootstrap.Modal.getOrCreateInstance($('ws-recipe-modal')).show();
    }
    async function deleteWorkshopRecipe(recipeId) {
        if (!isWorkshopAdmin()) return;
        const recipe = recipeById(recipeId);
        if (!recipe) return;
        if (!window.confirm(`Удалить рецептуру «${recipe.name}»? Если она уже участвовала в учёте, система сохранит её и покажет причину.`)) return;
        await send(API + '/recipes/' + encodeURIComponent(recipeId), 'DELETE', {}, 'Рецептура удалена');
    }

        $('ws-recipe-form')?.addEventListener('submit',async event=>{
        event.preventDefault();const id=$('ws-recipe-id').value;const materials=collectBom('#ws-bom-materials .ws-bom-row','.ws-bom-material-id').map(x=>({materialId:x.id,qty:x.qty,mode:x.mode}));const components=collectBom('#ws-bom-components .ws-bom-row','.ws-bom-component-id').map(x=>({recipeId:x.id,qty:x.qty}));
        const payload={name:$('ws-recipe-name').value,outputType:$('ws-recipe-type').value,sku:$('ws-recipe-sku').value,productId:$('ws-recipe-product').value||null,planksPerUnit:n($('ws-recipe-planks').value),minStockQty:n($('ws-recipe-min-stock').value),packQtyOverride:n($('ws-recipe-pack-override').value),sideA:$('ws-recipe-side-a').value,sideB:$('ws-recipe-side-b').value,matrixPosName:$('ws-recipe-matrix-pos').value,note:$('ws-recipe-note').value,materials,components};
        await send(id?API+'/recipes/'+id:API+'/recipes',id?'PUT':'POST',payload,'Рецептура сохранена','recipe');
    });

    function openProductionEdit(productionId) {
        if (!canManageWorkshop()) return;
        const item = state.productions.find(row => idOf(row) === String(productionId));
        if (!item) return;
        $('ws-production-edit-id').value = productionId;
        $('ws-production-edit-title').textContent = item.recipe?.name || 'Производство';
        $('ws-production-edit-date').value = dateInputValue(item.date);
        $('ws-production-edit-order').value = item.customOrderName || '';
        $('ws-production-edit-dimensions').value = item.customDimensions || '';
        $('ws-production-edit-reason').value = item.customNormReason || '';
        $('ws-production-edit-note').value = item.note || '';

        const opMap = new Map((item.operations || []).map(op => [op.type, op]));
        document.querySelectorAll('#ws-production-edit-operations label').forEach(label => {
            const check = label.querySelector('.ws-production-edit-op');
            const qty = label.querySelector('.ws-production-edit-op-qty');
            const current = opMap.get(check?.value);
            if (check) check.checked = Boolean(current);
            if (qty) qty.value = current?.qty || '';
        });
        bootstrap.Modal.getOrCreateInstance($('ws-production-edit-modal')).show();
    }

    $('ws-production-edit-form')?.addEventListener('submit', async event => {
        event.preventDefault();
        const id = $('ws-production-edit-id').value;
        const operations = [...document.querySelectorAll('#ws-production-edit-operations label')].map(label => {
            const check = label.querySelector('.ws-production-edit-op');
            const qty = label.querySelector('.ws-production-edit-op-qty');
            return check?.checked ? { type: check.value, qty: n(qty?.value) } : null;
        }).filter(Boolean);
        await send(API + '/productions/' + encodeURIComponent(id), 'PUT', {
            date: $('ws-production-edit-date').value,
            customOrderName: $('ws-production-edit-order').value,
            customDimensions: $('ws-production-edit-dimensions').value,
            customNormReason: $('ws-production-edit-reason').value,
            note: $('ws-production-edit-note').value,
            operations
        }, 'Запись производства обновлена', 'production-edit');
    });

    async function cancelProduction(productionId) {
        if (!isWorkshopAdmin()) return;
        const item = state.productions.find(row => idOf(row) === String(productionId));
        if (!item) return;
        if (!window.confirm(`Отменить запись «${item.recipe?.name || 'Производство'}» на ${fmt(item.outputQty)} шт? Остатки будут пересчитаны обратно.`)) return;
        await send(API + '/productions/' + encodeURIComponent(productionId), 'DELETE', {
            reason: 'Отмена записи администратором'
        }, 'Производство отменено, остатки восстановлены');
    }

        function openingCandidates() {
        const recipeProductIds = new Set(
            state.recipes
                .filter(recipe => recipe.outputType === 'sample')
                .map(recipe => idOf(recipe.product))
                .filter(Boolean)
        );

        const recipeRows = state.recipes.map(recipe => ({
            key:`recipe:${idOf(recipe)}`,
            recipe,
            product:recipe.product || null,
            name:workshopRecipeDisplayName(recipe) || 'Изделие',
            sku:recipe.sku || recipe.product?.sku || '',
            outputType:recipe.outputType || 'other',
            autoRecipe:false
        }));

        const productRows = state.products
            .filter(product => !recipeProductIds.has(idOf(product)) && !isTradingEquipmentProduct(product))
            .map(product => ({
                key:`product:${idOf(product)}`,
                recipe:null,
                product,
                name:`Планшет ${product.sku || ''} ${product.name || ''}`.trim(),
                sku:product.sku || '',
                outputType:'sample',
                autoRecipe:true
            }));

        return [...recipeRows, ...productRows];
    }

    function openingCurrentQty(candidate) {
        if (!candidate?.recipe) return 0;
        const recipeId = idOf(candidate.recipe);
        const location = $('ws-opening-location')?.value || 'workshop';
        if (location === 'dealer') {
            const dealerId = $('ws-opening-dealer')?.value || '';
            const asset = state.dealerAssets.find(item =>
                idOf(item.dealer) === dealerId && idOf(item.recipe) === recipeId
            );
            return Math.max(0, n(asset?.qty));
        }
        return Math.max(0, n(candidate.recipe?.stockQty));
    }

    function openingTypeLabel(candidate) {
        if (candidate?.autoRecipe) return 'образец · карточка создастся автоматически';
        if (candidate?.recipe && isTradingEquipmentRecipe(candidate.recipe)) return 'Торговое оборудование';
        if (candidate?.outputType === 'sample') return 'Планшет / образец';
        return 'Изделие';
    }

    function resetOpening() {
        $('ws-opening-form')?.reset();
        if ($('ws-opening-date')) $('ws-opening-date').value = todayValue();
        if ($('ws-opening-location')) $('ws-opening-location').value = 'workshop';
        if ($('ws-opening-search')) $('ws-opening-search').value = '';
        openingFilter = 'all';
        openingDraft.clear();
        populateFormSelects();
        updateOpeningLocation();
        document.querySelectorAll('[data-opening-filter]').forEach(button => {
            button.classList.toggle('active', button.dataset.openingFilter === openingFilter);
        });
        renderOpeningLines();
    }

    function updateOpeningLocation() {
        const location = $('ws-opening-location')?.value || 'workshop';
        const dealerWrap = $('ws-opening-dealer-wrap');
        if (dealerWrap) dealerWrap.hidden = location !== 'dealer';
        if (location !== 'dealer' && $('ws-opening-dealer')) $('ws-opening-dealer').value = '';
    }

    function openingRowMatches(candidate) {
        const term = ($('ws-opening-search')?.value || '').trim().toLowerCase();
        const text = `${candidate.name || ''} ${candidate.sku || ''} ${candidate.product?.sku || ''} ${candidate.product?.name || ''}`.toLowerCase();
        if (term && !text.includes(term)) return false;
        if (openingFilter === 'changed') return openingDraft.has(candidate.key);
        return true;
    }

    function renderOpeningLines() {
        const host = $('ws-opening-lines');
        if (!host) return;

        updateOpeningLocation();
        const location = $('ws-opening-location')?.value || 'workshop';
        const dealerId = $('ws-opening-dealer')?.value || '';
        if (location === 'dealer' && !dealerId) {
            host.innerHTML = '<div class="workshop-empty"><i class="bi bi-shop"></i>Выберите дилера — затем укажите фактические образцы, которые уже у него находятся</div>';
            return;
        }

        const rank = item => item.outputType === 'sample' ? 0 : item.outputType === 'stand' ? 1 : item.outputType === 'sign' ? 2 : 3;
        const rows = openingCandidates()
            .filter(openingRowMatches)
            .sort((a,b) =>
                rank(a) - rank(b) ||
                Number(a.autoRecipe) - Number(b.autoRecipe) ||
                String(a.sku || a.name || '').localeCompare(String(b.sku || b.name || ''),'ru',{numeric:true})
            );

        if (!rows.length) {
            host.innerHTML = '<div class="workshop-empty"><i class="bi bi-search"></i>Подходящих изделий нет</div>';
            return;
        }

        host.innerHTML = rows.map(candidate => {
            const current = openingCurrentQty(candidate);
            const hasDraft = openingDraft.has(candidate.key);
            const draftValue = hasDraft ? openingDraft.get(candidate.key) : '';
            const productMeta = candidate.product?.sku ? ` · ${candidate.product.sku}` : '';
            return `<div class="workshop-opening-row ${hasDraft ? 'is-changed' : ''} ${candidate.autoRecipe ? 'is-auto' : ''}" data-opening-key="${esc(candidate.key)}">
                <div class="workshop-opening-name">
                    <strong>${esc(candidate.name)}</strong>
                    <small>${esc(openingTypeLabel(candidate) + productMeta)}</small>
                </div>
                <div class="workshop-opening-current"><strong>${fmt(current)}</strong><small>шт в CRM</small></div>
                <label class="workshop-opening-actual">
                    <input type="number" min="0" step="1" inputmode="numeric" class="form-control" value="${hasDraft ? esc(draftValue) : ''}" placeholder="${fmt(current)}">
                    <small>${hasDraft && n(draftValue) !== current ? (n(draftValue) > current ? '+' : '') + fmt(n(draftValue)-current) + ' к системе' : candidate.autoRecipe ? 'введите факт — позиция создастся сама' : 'оставьте пустым, если верно'}</small>
                </label>
            </div>`;
        }).join('');

        host.querySelectorAll('.workshop-opening-row').forEach(row => {
            const input = row.querySelector('input');
            const key = row.dataset.openingKey;
            input?.addEventListener('input', () => {
                const raw = String(input.value || '').trim();
                if (!raw) openingDraft.delete(key);
                else openingDraft.set(key, Math.max(0, Math.floor(n(raw))));
                row.classList.toggle('is-changed', openingDraft.has(key));

                const candidate = openingCandidates().find(item => item.key === key);
                const current = openingCurrentQty(candidate);
                const hint = row.querySelector('.workshop-opening-actual small');
                if (hint) {
                    if (!openingDraft.has(key)) {
                        hint.textContent = candidate?.autoRecipe ? 'введите факт — позиция создастся сама' : 'оставьте пустым, если верно';
                    } else {
                        const delta = n(openingDraft.get(key)) - current;
                        hint.textContent = delta ? `${delta > 0 ? '+' : ''}${fmt(delta)} к системе` : 'совпадает с CRM';
                    }
                }
                if (openingFilter === 'changed' && !openingDraft.has(key)) row.hidden = true;
            });
        });
    }

    $('ws-opening-location')?.addEventListener('change', () => {
        openingDraft.clear();
        updateOpeningLocation();
        renderOpeningLines();
    });
    $('ws-opening-dealer')?.addEventListener('change', () => {
        openingDraft.clear();
        renderOpeningLines();
    });
    $('ws-opening-search')?.addEventListener('input', renderOpeningLines);
    document.querySelectorAll('[data-opening-filter]').forEach(button => {
        button.addEventListener('click', () => {
            openingFilter = button.dataset.openingFilter || 'all';
            document.querySelectorAll('[data-opening-filter]').forEach(item => item.classList.toggle('active', item === button));
            renderOpeningLines();
        });
    });

    $('ws-opening-form')?.addEventListener('submit', async event => {
        event.preventDefault();
        const location = $('ws-opening-location')?.value || 'workshop';
        const dealerId = $('ws-opening-dealer')?.value || '';
        if (location === 'dealer' && !dealerId) return toast('Выберите дилера', 'warning');

        const candidates = new Map(openingCandidates().map(item => [item.key,item]));
        const lines = [...openingDraft.entries()].map(([key, actualQty]) => {
            const candidate = candidates.get(key);
            if (!candidate) return null;
            const line = { actualQty:Math.max(0, Math.floor(n(actualQty))) };
            if (candidate.recipe) line.recipeId = idOf(candidate.recipe);
            else if (candidate.product) line.productId = idOf(candidate.product);
            return line;
        }).filter(Boolean);

        if (!lines.length) return toast('Введите фактическое количество хотя бы для одного изделия', 'warning');

        await post(API + '/opening-balance', {
            location,
            dealerId: location === 'dealer' ? dealerId : null,
            date:$('ws-opening-date')?.value || todayValue(),
            note:$('ws-opening-note')?.value || '',
            lines
        }, location === 'dealer' ? 'Стартовые остатки у дилера зафиксированы' : 'Стартовые остатки цеха зафиксированы', 'opening');
    });

    function syncSecondCorrectionItem() {
        const type=$('ws-correction-second-entity')?.value || 'finished';
        const id=$('ws-correction-second-id')?.value || '';
        const item=correctionItem(type,id);
        const input=$('ws-correction-second-actual');
        if (input) {
            input.step=type === 'finished' ? '1' : '0.001';
            input.value=item ? String(item.current) : '';
        }
        updateCorrectionDelta('second');
    }

    $('ws-correction-primary-actual')?.addEventListener('input',()=>updateCorrectionDelta('primary'));
    $('ws-correction-add-second')?.addEventListener('click',()=>{
        const section=$('ws-correction-second');
        if (section) section.hidden=false;
        $('ws-correction-add-second').hidden=true;
        refreshSecondCorrectionPicker();
    });
    $('ws-correction-remove-second')?.addEventListener('click',()=>{
        const section=$('ws-correction-second');
        if (section) section.hidden=true;
        $('ws-correction-add-second').hidden=false;
        if ($('ws-correction-second-id')) $('ws-correction-second-id').value='';
        if ($('ws-correction-second-actual')) $('ws-correction-second-actual').value='';
    });
    $('ws-correction-second-entity')?.addEventListener('change',()=>refreshSecondCorrectionPicker());
    $('ws-correction-second-id')?.addEventListener('change',syncSecondCorrectionItem);
    $('ws-correction-second-actual')?.addEventListener('input',()=>updateCorrectionDelta('second'));

    $('ws-correction-form')?.addEventListener('submit',async event=>{
        event.preventDefault();
        const reason=String($('ws-correction-reason')?.value || '').trim();
        if (reason.length < 3) return toast('Укажите причину исправления','warning');

        const primaryType=$('ws-correction-primary-entity')?.value || '';
        const primaryId=$('ws-correction-primary-id')?.value || '';
        const primaryActual=Math.max(0,n($('ws-correction-primary-actual')?.value));
        const lines=[{entityType:primaryType,id:primaryId,actualQty:primaryActual}];

        const secondVisible=!$('ws-correction-second')?.hidden;
        if (secondVisible) {
            const secondType=$('ws-correction-second-entity')?.value || '';
            const secondId=$('ws-correction-second-id')?.value || '';
            if (!secondId) return toast('Выберите вторую позицию','warning');
            if (secondType===primaryType && String(secondId)===String(primaryId)) return toast('Вторая позиция должна отличаться от первой','warning');
            if (!$('ws-correction-second-actual')?.value.trim()) return toast('Укажите правильный остаток второй позиции','warning');
            lines.push({entityType:secondType,id:secondId,actualQty:Math.max(0,n($('ws-correction-second-actual')?.value))});
        }

        const returnMode=correctionReturnMode;
        try {
            await post(API+'/correction',{date:todayValue(),reason,lines},lines.length>1?'Обе позиции исправлены':'Остаток исправлен','correction');
            correctionReturnMode='';
            setTimeout(()=>{
                if (returnMode === 'stock') activateWorkshopTab('stock');
                else if (returnMode) openStockView(returnMode);
            },180);
        } catch (_) {}
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

    document.querySelectorAll('[data-stock-view]').forEach(button => {
        const open = () => openStockView(button.dataset.stockView);
        button.addEventListener('click',open);
        button.addEventListener('keydown',event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                open();
            }
        });
    });

    document.querySelectorAll('[data-stock-view-tab]').forEach(button => {
        button.addEventListener('click',() => {
            stockViewMode=button.dataset.stockViewTab || 'finished';
            if ($('ws-stock-view-search')) $('ws-stock-view-search').value='';
            renderStockView();
        });
    });
    $('ws-stock-view-search')?.addEventListener('input',renderStockView);
    $('ws-stock-view-print')?.addEventListener('click',() => printWorkshopReport(stockViewMode));

    document.querySelectorAll('[data-workshop-drilldown]').forEach(button => {
        const open = () => {
            const type=button.dataset.workshopDrilldown;
            activateWorkshopTab('overview');
            setTimeout(() => {
                const target=type==='memos' ? $('ws-memo-list') : $('ws-production-list');
                target?.scrollIntoView({behavior:'smooth',block:'center'});
            },180);
        };
        button.addEventListener('click',open);
        button.addEventListener('keydown',event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                open();
            }
        });
    });

    document.querySelectorAll('[data-print-workshop]').forEach(button => {
        button.addEventListener('click',() => printWorkshopReport(button.dataset.printWorkshop));
    });

    load();
});
