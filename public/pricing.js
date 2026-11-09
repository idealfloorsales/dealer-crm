document.addEventListener('DOMContentLoaded', () => {
    const $ = id => document.getElementById(id);
    const API = '/api/pricing';
    const state = { today:'', rows:[], conditions:[], stats:{}, priceLists:[], catalog:[], currentSheet:null, activeView:'dealers' };
    let manage = false;
    let xlsxLoadPromise = null;
    let pdfMakeLoadPromise = null;
    let selectedTargets = new Set();

    const esc = value => String(value ?? '')
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
    const n = value => Number(value) || 0;
    const idOf = value => String(value?.id || value?._id || value || '');
    const fmt = (value, digits = 0) => n(value).toLocaleString('ru-RU', { maximumFractionDigits:digits });
    const dateText = value => {
        if (!value) return 'Без срока';
        const parts = String(value).slice(0,10).split('-');
        return parts.length === 3 ? `${parts[2]}.${parts[1]}.${parts[0]}` : value;
    };
    const todayValue = () => {
        const formatter = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Almaty',year:'numeric',month:'2-digit',day:'2-digit'});
        const parts = Object.fromEntries(formatter.formatToParts(new Date()).map(p=>[p.type,p.value]));
        return `${parts.year}-${parts.month}-${parts.day}`;
    };

    function toast(message, type='success') {
        if (window.CRMUI?.toast) return CRMUI.toast(message, type);
        const shell = document.createElement('div');
        shell.className = `position-fixed top-0 end-0 p-3`;
        shell.style.zIndex = '3000';
        shell.innerHTML = `<div class="toast show border-0 shadow"><div class="toast-body">${esc(message)}</div></div>`;
        document.body.appendChild(shell);
        setTimeout(()=>shell.remove(),2600);
    }

    function statusLabel(status) {
        return ({
            active:'Активно',
            planned:'Запланировано',
            expired:'Истекло',
            paused:'Приостановлено',
            cancelled:'Отменено'
        })[status] || status || '—';
    }

    function reasonLabel(reason) {
        return ({
            social_posts:'Соцсети',
            support_promo:'Поддержка продаж',
            regional_price:'Региональный прайс',
            individual:'Индивидуально',
            other:'Другое'
        })[reason] || 'Другое';
    }

    function compactTargetNames(values, prefix='') {
        const clean = [...new Set((values || []).map(value => String(value || '').trim()).filter(Boolean))];
        if (!clean.length) return prefix ? prefix + ': —' : '—';
        if (clean.length <= 2) return (prefix ? prefix + ': ' : '') + clean.join(', ');
        return (prefix ? prefix + ': ' : '') + clean.slice(0,2).join(', ') + ` +${clean.length-2}`;
    }

    function scopeLabel(condition) {
        if (condition.scopeType === 'dealer') {
            const names = Array.isArray(condition.dealers) && condition.dealers.length
                ? condition.dealers.map(item => item?.name || '')
                : [condition.dealer?.name || ''];
            return compactTargetNames(names, 'Дилеры');
        }
        if (condition.scopeType === 'sector') {
            const values = Array.isArray(condition.scopeValues) && condition.scopeValues.length
                ? condition.scopeValues
                : [condition.scopeValue || ''];
            return compactTargetNames(values, 'Сектора');
        }
        if (condition.scopeType === 'city') {
            const values = Array.isArray(condition.scopeValues) && condition.scopeValues.length
                ? condition.scopeValues
                : [condition.scopeValue || ''];
            return compactTargetNames(values, 'Города');
        }
        return 'Вся дилерская сеть';
    }

    function plusDays(dateKey, days) {
        if (!dateKey) return '';
        const d = new Date(dateKey + 'T00:00:00Z');
        d.setUTCDate(d.getUTCDate()+days);
        return d.toISOString().slice(0,10);
    }

    function isExpiring(row) {
        return Boolean(row.nearestEndDate && state.today && row.nearestEndDate >= state.today && row.nearestEndDate <= plusDays(state.today,7));
    }

    async function load() {
        try {
            if (window.CRMAuth?.ready) await CRMAuth.ready;
            if (!window.CRMAuth?.can('can_view_pricing')) return;
            manage = Boolean(window.CRMAuth?.can('can_manage_pricing'));
            const addBtn = $('pricing-add-btn');
            const addListBtn = $('pricing-add-list-btn');
            if (addBtn) addBtn.style.display = manage ? '' : 'none';
            if (addListBtn) addListBtn.style.display = manage ? '' : 'none';

            const [overviewRes, listsRes, catalogRes] = await Promise.all([
                fetch(API + '/overview'),
                fetch(API + '/price-lists'),
                fetch(API + '/catalog')
            ]);
            const data = await overviewRes.json().catch(()=>({}));
            const lists = await listsRes.json().catch(()=>[]);
            const catalog = await catalogRes.json().catch(()=>[]);
            if (!overviewRes.ok) throw new Error(data.error || 'Не удалось загрузить ценовые условия');
            if (!listsRes.ok) throw new Error(lists.error || 'Не удалось загрузить прайсы');
            if (!catalogRes.ok) throw new Error(catalog.error || 'Не удалось загрузить каталог');
            state.today = data.today || todayValue();
            state.rows = Array.isArray(data.rows) ? data.rows : [];
            state.conditions = Array.isArray(data.conditions) ? data.conditions : [];
            state.stats = data.stats || {};
            state.priceLists = Array.isArray(lists) ? lists : [];
            state.catalog = Array.isArray(catalog) ? catalog : [];
            renderAll();

            const presetDealer = new URLSearchParams(location.search).get('dealer');
            if (presetDealer && manage && state.rows.some(row => row.dealerId === presetDealer)) {
                openCreate(presetDealer);
            }
        } catch (error) {
            console.error(error);
            toast(error.message || 'Ошибка загрузки', 'error');
        }
    }

    function renderAll() {
        renderKpis();
        renderDealers();
        renderPriceLists();
        renderConditions();
        fillPriceListOptions();
        syncPriceOverrideHint();
        if ($('pricing-today')) $('pricing-today').textContent = `На ${dateText(state.today)}`;
        switchPricingView(state.activeView || 'dealers');
    }

    function renderKpis() {
        $('pricing-kpi-5').textContent = fmt(state.stats.dealersWith5);
        $('pricing-kpi-10').textContent = fmt(state.stats.dealersWith10);
        $('pricing-kpi-both').textContent = fmt(state.stats.dealersWithBoth);
        $('pricing-kpi-base').textContent = fmt(state.stats.activePriceOverrides);
        $('pricing-kpi-expiring').textContent = fmt(state.stats.expiringSoon);
        $('pricing-kpi-pending').textContent = fmt(state.stats.pendingRequirements);
    }

    function rowMatches(row) {
        const term = ($('pricing-search')?.value || '').trim().toLowerCase();
        if (term) {
            const text = [row.dealerName,row.city,row.sector,row.responsible,row.effectivePriceList].join(' ').toLowerCase();
            if (!text.includes(term)) return false;
        }
        const filter = $('pricing-filter')?.value || 'all';
        if (filter === '5' && !row.has5) return false;
        if (filter === '10' && !row.has10) return false;
        if (filter === 'both' && !(row.has5 && row.has10)) return false;
        if (filter === 'price' && !row.priceListCondition) return false;
        if (filter === 'expiring' && !isExpiring(row)) return false;
        if (filter === 'pending' && !row.pendingRequirements) return false;
        if (filter === 'none' && (row.priceListCondition || row.activeDiscounts?.length)) return false;
        return true;
    }

    function dealerCondition(row, code, kind = 'discount') {
        const list = Array.isArray(row.matchedConditions) ? row.matchedConditions : [];
        return list
            .filter(item =>
                item.kind === kind &&
                String(item.code || '').toUpperCase() === String(code || '').toUpperCase() &&
                item.scopeType === 'dealer' &&
                idOf(item.dealer) === String(row.dealerId) &&
                item.computedStatus !== 'cancelled'
            )
            .sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')))[0] || null;
    }

    function inheritedActiveConditions(row) {
        return (Array.isArray(row.matchedConditions) ? row.matchedConditions : [])
            .filter(item => item.computedStatus === 'active' && item.scopeType !== 'dealer');
    }

    function priceListOptionsHtml(selectedId = '', includeEmpty = true) {
        const selected = String(selectedId || '');
        const lists = state.priceLists.filter(item =>
            String(item.id) === selected ||
            (item.active !== false && (!item.validTo || !state.today || item.validTo >= state.today))
        );
        const empty = includeEmpty ? '<option value="">Выберите прайс</option>' : '';
        return empty + lists.map(item => {
            const dateState = priceListDateState(item);
            return `<option value="${esc(item.id)}" ${String(item.id) === selected ? 'selected' : ''}>${esc(item.name)}${item.versionDate ? ' · '+dateText(item.versionDate) : ''}${dateState.key !== 'active' ? ' · '+dateState.label.toLowerCase() : ''}</option>`;
        }).join('');
    }

    function fillPriceListOptions() {
        const select = $('pricing-price-list');
        if (!select) return;
        const current = select.value;
        select.innerHTML = priceListOptionsHtml(current, true);
        if (state.priceLists.some(item => String(item.id) === String(current))) select.value = current;
        syncPriceOverrideHint();
    }

    function syncPriceOverrideHint() {
        const host = $('pricing-price-override-hint');
        const select = $('pricing-price-list');
        if (!host || !select) return;

        const item = state.priceLists.find(list => String(list.id) === String(select.value));
        if (!item) {
            host.classList.remove('is-warning','is-ok');
            host.textContent = 'Название, цены и период действия берутся из выбранного прайса.';
            return;
        }

        const scopeType = $('pricing-scope-type')?.value || 'dealer';
        const scopeText = scopeType === 'dealer' ? 'выбранных дилеров'
            : scopeType === 'sector' ? 'выбранного сектора'
            : scopeType === 'city' ? 'выбранных городов'
            : 'всей дилерской сети';

        const from = item.validFrom ? dateText(item.validFrom) : 'сразу';
        const to = item.validTo ? dateText(item.validTo) : 'без даты окончания';

        host.classList.toggle('is-warning', !item.validTo);
        host.classList.toggle('is-ok', Boolean(item.validTo));

        host.innerHTML = item.validTo
            ? `Приоритетный прайс для ${esc(scopeText)}: <strong>${from} — ${to}</strong>. После окончания CRM автоматически вернёт каждому дилеру прайс из его профиля.`
            : `Прайс будет приоритетным для ${esc(scopeText)} <strong>без срока</strong>. Для автоматического возврата задайте в самом прайсе поле «Действует по».`;
    }

    function quickEditorHtml(row) {
        const social = dealerCondition(row, 'SOCIAL-5');
        const support = dealerCondition(row, 'SUPPORT-10');
        const base = (Array.isArray(row.matchedConditions) ? row.matchedConditions : [])
            .filter(item => item.kind === 'price_list' && item.scopeType === 'dealer' && idOf(item.dealer) === String(row.dealerId) && item.computedStatus !== 'cancelled')
            .sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')))[0] || null;
        const inherited = inheritedActiveConditions(row);
        const inheritedHtml = inherited.length
            ? `<div class="pricing-inline-inherited">
                <strong><i class="bi bi-diagram-3"></i> Унаследовано</strong>
                <div>${inherited.map(item => {
                    const value = item.kind === 'discount'
                        ? '−'+fmt(item.discountPercent,2)+'%'
                        : esc(item.priceListName || item.name);
                    return `<span title="Это условие задано на уровне ${esc(item.scopeType)}">${value} · ${esc(item.name)}</span>`;
                }).join('')}</div>
                <small>Эти условия нельзя снять только у одного дилера из этой строки — они заданы для региона/города/сети.</small>
              </div>`
            : '';

        return `<div class="pricing-inline-editor" data-inline-editor="${esc(row.dealerId)}" hidden>
            <div class="pricing-inline-head">
                <div><strong>Условия для ${esc(row.dealerName)}</strong><small>Изменения сохраняются только для этого дилера.</small></div>
                <button type="button" class="pricing-inline-close" data-close-inline="${esc(row.dealerId)}"><i class="bi bi-x-lg"></i></button>
            </div>
            ${inheritedHtml}
            <div class="pricing-inline-rules">
                <section class="pricing-inline-rule" data-inline-rule="social">
                    <label class="pricing-rule-toggle">
                        <input type="checkbox" class="form-check-input" data-inline-social-enabled ${social && ['active','planned','paused'].includes(social.computedStatus) ? 'checked':''}>
                        <span><strong>−5% · соцсети</strong><small>8 публикаций, суммируется с −10%</small></span>
                    </label>
                    <div class="pricing-inline-fields">
                        <label><span>С</span><input type="date" class="form-control" data-inline-social-start value="${esc(social?.startDate || state.today || todayValue())}"></label>
                        <label><span>По</span><input type="date" class="form-control" data-inline-social-end value="${esc(social?.endDate || '')}"></label>
                        <label><span>Публикации</span><div class="pricing-inline-progress"><input type="number" min="0" max="99" class="form-control" data-inline-social-current value="${fmt(social?.requirementCurrent || 0)}"><b>/ 8</b></div></label>
                        <label class="pricing-inline-check"><input type="checkbox" class="form-check-input" data-inline-social-verified ${social?.requirementVerified ? 'checked':''}><span>Проверено</span></label>
                    </div>
                </section>

                <section class="pricing-inline-rule" data-inline-rule="support">
                    <label class="pricing-rule-toggle">
                        <input type="checkbox" class="form-check-input" data-inline-support-enabled ${support && ['active','planned','paused'].includes(support.computedStatus) ? 'checked':''}>
                        <span><strong>−10% · поддержка продаж</strong><small>Суммируется с −5%</small></span>
                    </label>
                    <div class="pricing-inline-fields is-short">
                        <label><span>С</span><input type="date" class="form-control" data-inline-support-start value="${esc(support?.startDate || state.today || todayValue())}"></label>
                        <label><span>По</span><input type="date" class="form-control" data-inline-support-end value="${esc(support?.endDate || '')}"></label>
                    </div>
                </section>

                <section class="pricing-inline-rule" data-inline-rule="base">
                    <label class="pricing-rule-toggle">
                        <input type="checkbox" class="form-check-input" data-inline-base-enabled ${base && ['active','planned','paused'].includes(base.computedStatus) ? 'checked':''}>
                        <span><strong>Индивидуальный базовый прайс</strong><small>Используется до применения процентных скидок</small></span>
                    </label>
                    <div class="pricing-inline-fields is-base">
                        <label class="is-name"><span>Прайс</span><select class="form-select" data-inline-base-list>${priceListOptionsHtml(idOf(base?.priceList), true)}</select></label>
                        <label><span>С</span><input type="date" class="form-control" data-inline-base-start value="${esc(base?.startDate || state.today || todayValue())}"></label>
                        <label><span>По</span><input type="date" class="form-control" data-inline-base-end value="${esc(base?.endDate || '')}"></label>
                    </div>
                </section>
            </div>
            <div class="pricing-inline-footer">
                <small><i class="bi bi-info-circle"></i> −5% и −10% складываются арифметически. Региональные условия остаются активными отдельно.</small>
                <button type="button" class="pricing-inline-save" data-save-inline="${esc(row.dealerId)}"><i class="bi bi-check2"></i> Сохранить</button>
            </div>
        </div>`;
    }

    function renderDealers() {
        const host = $('pricing-dealer-list');
        if (!host) return;
        const rows = state.rows.filter(rowMatches);

        if (!rows.length) {
            host.innerHTML = '<div class="pricing-empty"><i class="bi bi-search me-1"></i>Ничего не найдено</div>';
            return;
        }

        host.innerHTML = rows.map(row => {
            const badges = [];
            if (row.priceListCondition) {
                badges.push(`<span class="pricing-badge is-base"><i class="bi bi-receipt"></i>${esc(row.effectivePriceList)}</span>`);
                if (row.priceOverride?.endDate) {
                    badges.push(`<span class="pricing-badge is-fallback"><i class="bi bi-arrow-counterclockwise"></i>до ${dateText(row.priceOverride.endDate)} → ${esc(row.priceOverride.fallbackPriceList || row.profilePriceList || 'прайс из профиля')}</span>`);
                }
            }
            (row.activeDiscounts || []).forEach(condition => {
                const inherited = condition.scopeType !== 'dealer';
                badges.push(`<span class="pricing-badge is-discount ${inherited?'is-inherited':''}">−${fmt(condition.discountPercent,2)}% · ${esc(condition.name)}${inherited?' · '+esc(condition.scopeType):''}</span>`);
            });
            if (row.pendingRequirements) badges.push(`<span class="pricing-badge is-warning"><i class="bi bi-exclamation-circle"></i>${row.pendingRequirements} обязательств</span>`);
            if (row.priceListConflicts) badges.push(`<span class="pricing-badge is-conflict"><i class="bi bi-exclamation-triangle"></i>${row.priceListConflicts + 1} базовых прайса</span>`);
            if (Array.isArray(row.ignoredDiscounts) && row.ignoredDiscounts.length) badges.push(`<span class="pricing-badge is-conflict"><i class="bi bi-slash-circle"></i>${row.ignoredDiscounts.length} скидок не применено</span>`);
            if (!badges.length) badges.push('<span class="pricing-badge">Стандартные условия</span>');

            const baseNote = row.priceListCondition
                ? `${esc(scopeLabel(row.priceListCondition))} · временно вместо «${esc(row.fallbackPriceList || row.profilePriceList || row.defaultPriceType || 'прайса из профиля')}»`
                : `из профиля дилера`;
            const end = row.nearestEndDate
                ? `<strong>${dateText(row.nearestEndDate)}</strong><small>${isExpiring(row) ? 'скоро заканчивается' : 'ближайший срок'}</small>`
                : '<strong>Без срока</strong><small>активные условия</small>';

            return `<div class="pricing-dealer-block">
                <article class="pricing-dealer-row">
                    <div class="pricing-dealer-main">
                        <strong>${esc(row.dealerName)}</strong>
                        <small>${esc(row.city || 'Город не указан')}${row.sector ? ' · '+esc(row.sector):''}</small>
                    </div>
                    <div class="pricing-dealer-meta">
                        <strong>${esc(row.responsible || 'Ответственный не указан')}</strong>
                        <small>ответственный</small>
                    </div>
                    <div class="pricing-price-base">
                        <strong>${esc(row.effectivePriceList)}</strong>
                        <small>${baseNote}</small>
                    </div>
                    <div class="pricing-badges">${badges.join('')}</div>
                    <div class="pricing-total">
                        <strong>${row.totalDiscountPercent ? '−'+fmt(row.totalDiscountPercent,2)+'%' : '0%'}</strong>
                        <small>итоговая скидка</small>
                    </div>
                    <div class="pricing-end">${end}</div>
                    <div class="pricing-row-actions">
                        <button type="button" class="pricing-sheet-btn" data-open-price-sheet="${esc(row.dealerId)}" title="Открыть прайс дилера"><i class="bi bi-receipt-cutoff"></i><span>Прайс</span></button>
                        ${manage ? `<button type="button" class="pricing-quick-btn ${row.has5?'is-active':''}" data-quick-open="${esc(row.dealerId)}" data-focus-rule="social" title="Настроить −5%">−5%</button>
                        <button type="button" class="pricing-quick-btn ${row.has10?'is-active':''}" data-quick-open="${esc(row.dealerId)}" data-focus-rule="support" title="Настроить −10%">−10%</button>
                        <button type="button" class="pricing-settings-btn" data-quick-open="${esc(row.dealerId)}" title="Все условия дилера"><i class="bi bi-sliders2"></i></button>` : ''}
                    </div>
                </article>
                ${manage ? quickEditorHtml(row) : ''}
            </div>`;
        }).join('');

        host.querySelectorAll('[data-quick-open]').forEach(button => {
            button.addEventListener('click', () => openInlineEditor(button.dataset.quickOpen, button.dataset.focusRule || ''));
        });
        host.querySelectorAll('[data-close-inline]').forEach(button => {
            button.addEventListener('click', () => closeInlineEditor(button.dataset.closeInline));
        });
        host.querySelectorAll('[data-save-inline]').forEach(button => {
            button.addEventListener('click', () => saveInlineDealerPricing(button.dataset.saveInline));
        });
        host.querySelectorAll('[data-open-price-sheet]').forEach(button => {
            button.addEventListener('click', () => openDealerPriceSheet(button.dataset.openPriceSheet));
        });
    }

    function openInlineEditor(dealerId, focusRule = '') {
        const editor = document.querySelector(`[data-inline-editor="${CSS.escape(String(dealerId))}"]`);
        if (!editor) return;
        document.querySelectorAll('.pricing-inline-editor:not([hidden])').forEach(other => {
            if (other !== editor) other.hidden = true;
        });
        editor.hidden = false;
        editor.closest('.pricing-dealer-block')?.classList.add('is-open');
        if (focusRule) {
            requestAnimationFrame(() => {
                const rule = editor.querySelector(`[data-inline-rule="${focusRule}"]`);
                rule?.scrollIntoView({block:'nearest',behavior:'smooth'});
                rule?.classList.add('is-focus');
                setTimeout(()=>rule?.classList.remove('is-focus'),900);
            });
        }
    }

    function closeInlineEditor(dealerId) {
        const editor = document.querySelector(`[data-inline-editor="${CSS.escape(String(dealerId))}"]`);
        if (!editor) return;
        editor.hidden = true;
        editor.closest('.pricing-dealer-block')?.classList.remove('is-open');
    }

    function dealerQuickPayload(dealerId, code, editor) {
        if (code === 'SOCIAL-5') {
            return {
                scopeType:'dealer', dealerId, kind:'discount',
                name:'−5% за публикации в соцсетях', code:'SOCIAL-5',
                discountPercent:5, stackable:true, priority:0,
                startDate:editor.querySelector('[data-inline-social-start]')?.value || state.today,
                endDate:editor.querySelector('[data-inline-social-end]')?.value || '',
                paused:false, reasonType:'social_posts',
                requirementTarget:8,
                requirementCurrent:n(editor.querySelector('[data-inline-social-current]')?.value),
                requirementUnit:'публикаций',
                requirementDueDate:editor.querySelector('[data-inline-social-end]')?.value || '',
                requirementVerified:Boolean(editor.querySelector('[data-inline-social-verified]')?.checked),
                proofNote:'', note:''
            };
        }
        if (code === 'SUPPORT-10') {
            return {
                scopeType:'dealer', dealerId, kind:'discount',
                name:'−10% акция для поддержки продаж', code:'SUPPORT-10',
                discountPercent:10, stackable:true, priority:0,
                startDate:editor.querySelector('[data-inline-support-start]')?.value || state.today,
                endDate:editor.querySelector('[data-inline-support-end]')?.value || '',
                paused:false, reasonType:'support_promo',
                requirementTarget:0, requirementCurrent:0, requirementUnit:'публикаций',
                requirementDueDate:'', requirementVerified:false, proofNote:'', note:''
            };
        }
        const priceListId = editor.querySelector('[data-inline-base-list]')?.value || '';
        const list = state.priceLists.find(item => String(item.id) === String(priceListId));
        return {
            scopeType:'dealer', dealerId, kind:'price_list',
            name:'Индивидуальный базовый прайс', code:'DEALER-PRICE',
            discountPercent:0,
            priceListId,
            priceListName:list?.name || '',
            stackable:false, priority:100,
            startDate:editor.querySelector('[data-inline-base-start]')?.value || state.today,
            endDate:editor.querySelector('[data-inline-base-end]')?.value || '',
            paused:false, reasonType:'individual',
            requirementTarget:0, requirementCurrent:0, requirementUnit:'публикаций',
            requirementDueDate:'', requirementVerified:false, proofNote:'', note:''
        };
    }

    async function syncInlineCondition(row, editor, code, enabled, existing) {
        if (enabled) {
            const payload = dealerQuickPayload(row.dealerId, code, editor);
            if (code === 'DEALER-PRICE' && !payload.priceListId) {
                throw new Error('Выберите базовый прайс');
            }
            if (existing) {
                return send(API + '/conditions/' + encodeURIComponent(idOf(existing)), 'PUT', payload);
            }
            return send(API + '/conditions', 'POST', payload);
        }

        if (existing && ['active','planned','paused'].includes(existing.computedStatus)) {
            return send(API + '/conditions/' + encodeURIComponent(idOf(existing)), 'DELETE', { reason:'Отключено из строки дилера' });
        }
        return null;
    }

    async function saveInlineDealerPricing(dealerId) {
        const row = state.rows.find(item => String(item.dealerId) === String(dealerId));
        const editor = document.querySelector(`[data-inline-editor="${CSS.escape(String(dealerId))}"]`);
        if (!row || !editor || !manage) return;
        const save = editor.querySelector('[data-save-inline]');
        try {
            if (save) {
                save.disabled = true;
                save.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Сохраняем…';
            }

            const social = dealerCondition(row, 'SOCIAL-5');
            const support = dealerCondition(row, 'SUPPORT-10');
            const base = (Array.isArray(row.matchedConditions) ? row.matchedConditions : [])
                .filter(item => item.kind === 'price_list' && item.scopeType === 'dealer' && idOf(item.dealer) === String(row.dealerId) && item.computedStatus !== 'cancelled')
                .sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')))[0] || null;

            await syncInlineCondition(row, editor, 'SOCIAL-5', Boolean(editor.querySelector('[data-inline-social-enabled]')?.checked), social);
            await syncInlineCondition(row, editor, 'SUPPORT-10', Boolean(editor.querySelector('[data-inline-support-enabled]')?.checked), support);
            await syncInlineCondition(row, editor, 'DEALER-PRICE', Boolean(editor.querySelector('[data-inline-base-enabled]')?.checked), base);

            toast('Ценовые условия дилера сохранены');
            await load();
            requestAnimationFrame(() => openInlineEditor(dealerId));
        } catch (error) {
            toast(error.message || 'Не удалось сохранить условия', 'error');
        } finally {
            if (save && document.body.contains(save)) {
                save.disabled = false;
                save.innerHTML = '<i class="bi bi-check2"></i> Сохранить';
            }
        }
    }


    function switchPricingView(view = 'dealers') {
        const allowed = ['dealers','lists','offers','conditions'];
        const next = allowed.includes(view) ? view : 'dealers';
        state.activeView = next;
        document.querySelectorAll('[data-pricing-view]').forEach(button => {
            button.classList.toggle('active', button.dataset.pricingView === next);
        });
        document.querySelectorAll('[data-pricing-view-panel]').forEach(panel => {
            panel.hidden = panel.dataset.pricingViewPanel !== next;
        });
        const addCondition = $('pricing-add-btn');
        if (addCondition) addCondition.style.display = manage && (next === 'dealers' || next === 'conditions') ? '' : 'none';
    }

    function priceListMatches(item) {
        const term = ($('pricing-list-search')?.value || '').trim().toLowerCase();
        const filter = $('pricing-list-filter')?.value || 'active';
        if (filter === 'active' && item.active === false) return false;
        if (filter === 'archive' && item.active !== false) return false;
        if (term) {
            const hay = [item.name,item.code,item.versionDate,item.validFrom,item.validTo,item.note].join(' ').toLowerCase();
            if (!hay.includes(term)) return false;
        }
        return true;
    }

    function priceListDateState(item) {
        const today = state.today || todayValue();
        if (item.active === false) return { key:'archive', label:'Архив' };
        if (item.validFrom && item.validFrom > today) return { key:'planned', label:'Запланирован' };
        if (item.validTo && item.validTo < today) return { key:'expired', label:'Истёк' };
        return { key:'active', label:'Действует' };
    }

    function priceListPeriodText(item) {
        if (!item.validFrom && !item.validTo) return 'Без ограничения по сроку';
        const from = item.validFrom ? dateText(item.validFrom) : 'без даты начала';
        const to = item.validTo ? dateText(item.validTo) : 'без даты окончания';
        return from + ' — ' + to;
    }

    function renderPriceLists() {
        const host = $('pricing-price-list-grid');
        if (!host) return;
        const lists = state.priceLists.filter(priceListMatches);
        if (!lists.length) {
            host.innerHTML = '<div class="pricing-empty"><i class="bi bi-receipt me-1"></i>Прайсов пока нет</div>';
            return;
        }

        host.innerHTML = lists.map(item => {
            const dateState = priceListDateState(item);
            return `
            <article class="pricing-price-list-card ${dateState.key === 'archive' ? 'is-archive' : ''}">
                <div class="pricing-price-list-card-top">
                    <div>
                        <span>${esc(item.code || 'ПРАЙС')}</span>
                        <strong>${esc(item.name)}</strong>
                        <small>${item.versionDate ? 'Версия '+dateText(item.versionDate) : 'Версия без даты'} · ${esc(priceListPeriodText(item))}</small>
                    </div>
                    <span class="pricing-list-state is-${dateState.key}">${dateState.label}</span>
                </div>
                <div class="pricing-price-list-stats">
                    <div><small>Позиций</small><strong>${fmt(item.rowsCount)}</strong></div>
                    <div><small>С ценами</small><strong>${fmt(item.pricedCount)}</strong></div>
                    <div><small>Обновлён</small><strong>${item.updatedAt ? new Date(item.updatedAt).toLocaleDateString('ru-RU') : '—'}</strong></div>
                </div>
                ${item.note ? `<p>${esc(item.note)}</p>` : ''}
                <div class="pricing-price-list-actions">
                    <button type="button" class="pricing-list-action is-primary" data-assign-price-list="${esc(item.id)}"><i class="bi bi-diagram-3"></i> Назначить</button>
                    <button type="button" class="pricing-list-action" data-edit-price-list="${esc(item.id)}"><i class="bi bi-pencil"></i> Открыть</button>
                    ${manage && item.active !== false ? `<button type="button" class="pricing-list-action is-danger" data-archive-price-list="${esc(item.id)}"><i class="bi bi-archive"></i></button>` : ''}
                </div>
            </article>`;
        }).join('');

        host.querySelectorAll('[data-edit-price-list]').forEach(button => button.addEventListener('click', () => openPriceListEditor(button.dataset.editPriceList)));
        host.querySelectorAll('[data-assign-price-list]').forEach(button => button.addEventListener('click', () => assignPriceList(button.dataset.assignPriceList)));
        host.querySelectorAll('[data-archive-price-list]').forEach(button => button.addEventListener('click', () => archivePriceList(button.dataset.archivePriceList)));
    }

    function renderPriceListEditorRows(existingRows = []) {
        const host = $('pricing-list-editor-rows');
        if (!host) return;

        const rows = Array.isArray(existingRows) ? existingRows : [];
        const collectionRows = new Map(
            rows
                .filter(row => row.scopeType === 'collection' && row.collection)
                .map(row => [String(row.collection).trim().toUpperCase(), row])
        );
        const productRows = new Map(
            rows
                .filter(row => row.productId)
                .map(row => [String(row.productId), row])
        );
        const skuRows = new Map(
            rows
                .filter(row => row.sku)
                .map(row => [String(row.sku).trim().toLowerCase(), row])
        );

        const catalogById = new Map(state.catalog.map(product => [String(product.id), product]));
        const legacyByCollection = new Map();
        rows.forEach(row => {
            if (row.scopeType === 'collection') return;
            const product = row.productId ? catalogById.get(String(row.productId)) : state.catalog.find(item => String(item.sku || '').trim().toLowerCase() === String(row.sku || '').trim().toLowerCase());
            const collection = String(row.collection || product?.collection || '').trim().toUpperCase();
            if (collection && !legacyByCollection.has(collection)) legacyByCollection.set(collection, row);
        });

        const collectionMembers = new Map();
        state.catalog.filter(product => product.productType !== 'equipment' && product.isLiquid !== false).forEach(product => {
            const collection = String(product.collection || 'ДРУГИЕ КОЛЛЕКЦИИ').trim().toUpperCase();
            if (!collectionMembers.has(collection)) collectionMembers.set(collection, []);
            collectionMembers.get(collection).push(product);
        });

        const liquidHtml = [...collectionMembers.entries()]
            .sort((a,b)=>String(a[0]).localeCompare(String(b[0]),'ru'))
            .map(([collection,members]) => {
                const existing = collectionRows.get(collection) || legacyByCollection.get(collection) || {};
                return `<tr class="pricing-list-collection-row" data-price-row data-scope-type="collection" data-collection="${esc(collection)}" data-name="${esc(collection)}">
                    <td><strong>${esc(collection)}</strong><small>${members.length} поз.</small></td>
                    <td><input type="number" min="0" step="0.01" inputmode="decimal" class="form-control" data-price-opt value="${n(existing.opt) || ''}" placeholder="0"></td>
                    <td><input type="number" min="0" step="0.01" inputmode="decimal" class="form-control" data-price-rrp value="${n(existing.rrp) || ''}" placeholder="0"></td>
                    <td><input type="number" min="0" step="0.01" inputmode="decimal" class="form-control" data-price-display value="${n(existing.displayPrice) || ''}" placeholder="0"></td>
                </tr>`;
            }).join('');

        const showIlliquid = Boolean($('pricing-list-show-illiquid')?.checked);
        const illiquidProducts = state.catalog
            .filter(product => product.productType !== 'equipment' && product.isLiquid === false)
            .sort((a,b) =>
                String(a.collection || '').localeCompare(String(b.collection || ''),'ru') ||
                String(a.sku || '').localeCompare(String(b.sku || ''),'ru')
            );

        const illiquidHtml = illiquidProducts.length
            ? `<tr class="pricing-list-section-row is-illiquid ${showIlliquid ? '' : 'pricing-list-row-hidden'}" data-price-illiquid-row>
                    <td colspan="4"><strong>Неликвид</strong><span>${illiquidProducts.length} поз. · цены задаются отдельно</span></td>
               </tr>` +
              illiquidProducts.map(product => {
                    const existing = productRows.get(String(product.id)) ||
                        skuRows.get(String(product.sku || '').trim().toLowerCase()) || {};
                    const collection = String(product.collection || '').trim().toUpperCase();
                    return `<tr class="pricing-list-product-row is-illiquid ${showIlliquid ? '' : 'pricing-list-row-hidden'}"
                        data-price-row data-price-illiquid-row data-scope-type="product"
                        data-product-id="${esc(product.id)}" data-sku="${esc(product.sku || '')}"
                        data-collection="${esc(collection)}" data-name="${esc(product.name || '')}" data-is-liquid="false">
                        <td><strong>${esc([product.sku,product.name].filter(Boolean).join(' · '))}</strong><small>${esc(collection || 'Неликвид')}</small></td>
                        <td><input type="number" min="0" step="0.01" inputmode="decimal" class="form-control" data-price-opt value="${n(existing.opt) || ''}" placeholder="0"></td>
                        <td><input type="number" min="0" step="0.01" inputmode="decimal" class="form-control" data-price-rrp value="${n(existing.rrp) || ''}" placeholder="0"></td>
                        <td><input type="number" min="0" step="0.01" inputmode="decimal" class="form-control" data-price-display value="${n(existing.displayPrice) || ''}" placeholder="0"></td>
                    </tr>`;
                }).join('')
            : '';

        host.innerHTML = liquidHtml + illiquidHtml || '<tr><td colspan="4" class="pricing-empty">Позиций для прайса пока нет</td></tr>';
    }

    function syncPriceListIlliquidVisibility() {
        const show = Boolean($('pricing-list-show-illiquid')?.checked);
        document.querySelectorAll('#pricing-list-editor-rows [data-price-illiquid-row]').forEach(row => {
            row.classList.toggle('pricing-list-row-hidden', !show);
        });
    }

    function collectPriceListRows() {
        return [...document.querySelectorAll('#pricing-list-editor-rows [data-price-row]')]
            .map(row => ({
                scopeType: row.dataset.scopeType === 'collection' ? 'collection' : 'product',
                collection: row.dataset.collection || '',
                productId: row.dataset.scopeType === 'collection' ? '' : (row.dataset.productId || ''),
                sku: row.dataset.scopeType === 'collection' ? '' : (row.dataset.sku || ''),
                name: row.dataset.name || '',
                isLiquid: row.dataset.scopeType === 'collection' ? true : row.dataset.isLiquid !== 'false',
                opt: n(row.querySelector('[data-price-opt]')?.value),
                rrp: n(row.querySelector('[data-price-rrp]')?.value),
                displayPrice: n(row.querySelector('[data-price-display]')?.value),
                currency:'KZT'
            }))
            .filter(row => row.opt > 0 || row.rrp > 0 || row.displayPrice > 0);
    }

    async function openPriceListEditor(priceListId = '') {
        if (!manage && !priceListId) return;
        const modalEl = $('pricing-price-list-modal');
        $('pricing-list-id').value = priceListId || '';
        $('pricing-list-modal-title').textContent = priceListId ? 'Редактирование прайса' : 'Новый прайс';
        $('pricing-list-name').value = '';
        $('pricing-list-code').value = '';
        $('pricing-list-version').value = state.today || todayValue();
        $('pricing-list-valid-from').value = state.today || todayValue();
        $('pricing-list-valid-to').value = '';
        $('pricing-list-active').value = 'true';
        $('pricing-list-note').value = '';
        if ($('pricing-list-show-illiquid')) $('pricing-list-show-illiquid').checked = false;
        renderPriceListEditorRows([]);

        if (priceListId) {
            try {
                const response = await fetch(API + '/price-lists/' + encodeURIComponent(priceListId));
                const data = await response.json().catch(()=>({}));
                if (!response.ok) throw new Error(data.error || 'Не удалось загрузить прайс');
                $('pricing-list-name').value = data.name || '';
                $('pricing-list-code').value = data.code || '';
                $('pricing-list-version').value = data.versionDate || '';
                $('pricing-list-valid-from').value = data.validFrom || '';
                $('pricing-list-valid-to').value = data.validTo || '';
                $('pricing-list-active').value = data.active === false ? 'false' : 'true';
                $('pricing-list-note').value = data.note || '';
                if ($('pricing-list-show-illiquid')) $('pricing-list-show-illiquid').checked = data.includeIlliquid === true;
                renderPriceListEditorRows(data.rows || []);
            } catch (error) {
                toast(error.message,'error');
                return;
            }
        }

        if (!manage) {
            modalEl.querySelectorAll('input,select,textarea').forEach(input => input.disabled = true);
            $('pricing-list-save-btn').style.display = 'none';
            $('pricing-list-import-btn').style.display = 'none';
            $('pricing-list-copy-opt-btn').style.display = 'none';
        } else {
            modalEl.querySelectorAll('input,select,textarea').forEach(input => input.disabled = false);
            $('pricing-list-save-btn').style.display = '';
            $('pricing-list-import-btn').style.display = '';
            $('pricing-list-copy-opt-btn').style.display = '';
        }
        bootstrap.Modal.getOrCreateInstance(modalEl).show();
    }

    async function savePriceList(event) {
        event.preventDefault();
        if (!manage) return;
        const id = $('pricing-list-id').value;
        const payload = {
            name:$('pricing-list-name').value.trim(),
            code:$('pricing-list-code').value.trim(),
            versionDate:$('pricing-list-version').value,
            validFrom:$('pricing-list-valid-from').value,
            validTo:$('pricing-list-valid-to').value,
            active:$('pricing-list-active').value === 'true',
            includeIlliquid:Boolean($('pricing-list-show-illiquid')?.checked),
            note:$('pricing-list-note').value.trim(),
            rows:collectPriceListRows()
        };
        if (!payload.name) return toast('Укажите название прайса','error');
        if (payload.validFrom && payload.validTo && payload.validTo < payload.validFrom) {
            return toast('Дата окончания прайса не может быть раньше даты начала','error');
        }
        const button = $('pricing-list-save-btn');
        try {
            button.disabled = true;
            button.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Сохраняем';
            await send(id ? API+'/price-lists/'+encodeURIComponent(id) : API+'/price-lists', id ? 'PUT' : 'POST', payload);
            bootstrap.Modal.getOrCreateInstance($('pricing-price-list-modal')).hide();
            toast(id ? 'Прайс обновлён' : 'Прайс создан');
            await load();
            switchPricingView('lists');
        } catch (error) {
            toast(error.message,'error');
        } finally {
            button.disabled = false;
            button.textContent = 'Сохранить прайс';
        }
    }

    async function archivePriceList(id) {
        if (!manage) return;
        const item = state.priceLists.find(list => String(list.id) === String(id));
        if (!item || !confirm(`Перенести прайс «${item.name}» в архив? Привязки и история сохранятся.`)) return;
        try {
            await send(API+'/price-lists/'+encodeURIComponent(id),'DELETE',{});
            toast('Прайс перенесён в архив');
            await load();
            switchPricingView('lists');
        } catch (error) {
            toast(error.message,'error');
        }
    }

    function assignPriceList(id) {
        if (!manage) return;
        const item = state.priceLists.find(list => String(list.id) === String(id));
        if (!item) return;
        switchPricingView('conditions');
        openCreate();
        $('pricing-price-list').value = item.id;
    }

    function ensureXlsxLoaded() {
        if (window.XLSX) return Promise.resolve(window.XLSX);
        if (xlsxLoadPromise) return xlsxLoadPromise;
        xlsxLoadPromise = new Promise((resolve,reject) => {
            const script=document.createElement('script');
            script.src='https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js';
            script.async=true;
            script.onload=()=>window.XLSX ? resolve(window.XLSX) : reject(new Error('Excel-библиотека не загрузилась'));
            script.onerror=()=>reject(new Error('Не удалось загрузить Excel-библиотеку'));
            document.head.appendChild(script);
        }).catch(error => { xlsxLoadPromise=null; throw error; });
        return xlsxLoadPromise;
    }

    async function ensurePdfMakeLoaded() {
        if (window.pdfMake?.vfs) return window.pdfMake;
        if (pdfMakeLoadPromise) return pdfMakeLoadPromise;
        pdfMakeLoadPromise = new Promise((resolve,reject) => {
            const first=document.createElement('script');
            first.src='https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.10/pdfmake.min.js';
            first.onload=()=>{
                const second=document.createElement('script');
                second.src='https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.10/vfs_fonts.js';
                second.onload=()=>window.pdfMake ? resolve(window.pdfMake) : reject(new Error('PDF-библиотека не загрузилась'));
                second.onerror=()=>reject(new Error('Не удалось загрузить шрифты PDF'));
                document.head.appendChild(second);
            };
            first.onerror=()=>reject(new Error('Не удалось загрузить PDF-библиотеку'));
            document.head.appendChild(first);
        }).catch(error => { pdfMakeLoadPromise=null; throw error; });
        return pdfMakeLoadPromise;
    }

    function normalizeImportHeader(value) {
        return String(value || '').toLowerCase().replace(/ё/g,'е').replace(/[^a-zа-я0-9]+/g,'');
    }

    function importPriceValue(source, matcher) {
        const key = Object.keys(source).find(raw => matcher(normalizeImportHeader(raw)));
        return key ? n(String(source[key]).replace(/\s/g,'').replace(',','.')) : 0;
    }

    async function importPriceListExcel(file) {
        if (!file) return;
        try {
            const XLSX = await ensureXlsxLoaded();
            const buffer = await file.arrayBuffer();
            const workbook = XLSX.read(buffer,{type:'array'});
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(sheet,{defval:''});
            if (!rows.length) throw new Error('В Excel нет строк с ценами');

            const inputRows=[...document.querySelectorAll('#pricing-list-editor-rows [data-price-row]')];
            const skuMap=new Map(
                inputRows
                    .filter(row=>row.dataset.scopeType==='product')
                    .map(row=>[String(row.dataset.sku||'').trim().toLowerCase(),row])
            );
            const collectionMap=new Map(
                inputRows
                    .filter(row=>row.dataset.scopeType==='collection')
                    .map(row=>[String(row.dataset.collection||'').trim().toUpperCase(),row])
            );

            let matched=0;
            rows.forEach(source=>{
                const keys=Object.keys(source);
                const skuKey=keys.find(raw=>['артикул','sku','код','article'].includes(normalizeImportHeader(raw)));
                const collectionKey=keys.find(raw=>['коллекция','collection','серия'].includes(normalizeImportHeader(raw)));
                const sku=skuKey ? String(source[skuKey]||'').trim() : '';
                const collection=collectionKey ? String(source[collectionKey]||'').trim().toUpperCase() : '';
                const target=(collection && collectionMap.get(collection)) || (sku && skuMap.get(sku.toLowerCase()));
                if(!target) return;

                const opt=importPriceValue(source,h=>h==='опт'||h.includes('оптов')||h.includes('спеццен')||h.includes('спеццена'));
                const rrp=importPriceValue(source,h=>h==='ррц'||h.includes('рекомендуем')||h.includes('рознич')||h==='rrp');
                const displayPrice=importPriceValue(source,h=>h.includes('ценанавитрин')||h.includes('витрин'));

                if(opt) target.querySelector('[data-price-opt]').value=opt;
                if(rrp) target.querySelector('[data-price-rrp]').value=rrp;
                if(displayPrice) target.querySelector('[data-price-display]').value=displayPrice;
                matched++;
            });
            toast(`Из Excel сопоставлено строк: ${matched}`);
        } catch(error) {
            toast(error.message || 'Не удалось прочитать Excel','error');
        } finally {
            $('pricing-list-import-input').value='';
        }
    }

    function copyOptToRrp() {
        document.querySelectorAll('#pricing-list-editor-rows [data-price-row]').forEach(row => {
            const opt=row.querySelector('[data-price-opt]');
            const rrp=row.querySelector('[data-price-rrp]');
            if (opt && rrp && n(opt.value)>0 && !n(rrp.value)) rrp.value=opt.value;
        });
        toast('Спец.цена скопирована в пустые РРЦ');
    }

    function safeFilename(value) {
        return String(value || 'price').replace(/[\\/:*?"<>|]+/g,'_').replace(/\s+/g,'_').slice(0,90);
    }

    async function openDealerPriceSheet(dealerId) {
        try {
            const response=await fetch(API+'/dealers/'+encodeURIComponent(dealerId)+'/price-sheet');
            const data=await response.json().catch(()=>({}));
            if(!response.ok) throw new Error(data.error || 'Не удалось сформировать прайс');
            state.currentSheet=data;
            renderDealerPriceSheet();
            bootstrap.Modal.getOrCreateInstance($('pricing-sheet-modal')).show();
        } catch(error) {
            toast(error.message,'error');
        }
    }

    function renderDealerPriceSheet() {
        const data=state.currentSheet;
        if(!data) return;
        $('pricing-sheet-title').textContent=data.dealer?.name || 'Прайс';
        $('pricing-sheet-subtitle').textContent=[data.dealer?.city,data.dealer?.sector].filter(Boolean).join(' · ');
        const list=data.priceList;
        $('pricing-sheet-summary').innerHTML=`
            <div><small>Прайс</small><strong>${esc(list?.name || 'Не назначен')}</strong><span>${list?.versionDate ? 'от '+dateText(list.versionDate) : ''}</span></div>
            <div><small>Базовая цена</small><strong>${esc(data.priceType?.label || data.dealer?.priceType || 'Спец.цена')}</strong><span>из карточки дилера</span></div>
            <div><small>Доп. скидка</small><strong>${data.totalDiscountPercent ? '−'+fmt(data.totalDiscountPercent,2)+'%' : '0%'}</strong><span>${(data.activeDiscounts||[]).length ? (data.activeDiscounts||[]).map(x=>x.name).join(' + ') : 'без активных скидок'}</span></div>`;

        const rows=Array.isArray(data.rows)?data.rows:[];
        $('pricing-sheet-empty').classList.toggle('d-none',Boolean(list && rows.length));
        $('pricing-sheet-table-wrap').classList.toggle('d-none',!(list && rows.length));

        const liquid=rows.filter(row=>row.isLiquid !== false);
        const illiquid=data.priceList?.includeIlliquid === true ? rows.filter(row=>row.isLiquid === false && row.productType !== 'equipment') : [];
        const renderRows=(items,isIlliquid=false)=>items.map(row=>`
            <tr data-sheet-row
                data-row-type="${esc(row.rowType || (isIlliquid?'product':'collection'))}"
                data-product-id="${esc(row.productId || '')}"
                data-collection="${esc(row.collection || '')}">
                <td>
                    <strong>${esc(isIlliquid ? ([row.sku,row.name].filter(Boolean).join(' · ')) : (row.collection || row.name || ''))}</strong>
                    <small>${esc(isIlliquid ? (row.collection || '') : ((row.members||0)+' поз. в коллекции'))}</small>
                </td>
                <td><strong>${row.finalPrice ? fmt(row.finalPrice,2)+' ₸' : '—'}</strong></td>
                <td>${row.rrp ? fmt(row.rrp,2)+' ₸' : '—'}</td>
                <td>${manage ? `<input type="number" min="0" step="0.01" inputmode="decimal" class="form-control pricing-display-price" value="${row.displayPrice || ''}" placeholder="Не указана">` : (row.displayPrice ? fmt(row.displayPrice,2)+' ₸' : '—')}</td>
            </tr>`).join('');

        $('pricing-sheet-rows').innerHTML=
            (liquid.length ? `<tr class="pricing-list-section-row"><td colspan="4"><strong>Коллекции</strong><span>актуальный ассортимент</span></td></tr>${renderRows(liquid,false)}` : '') +
            (illiquid.length ? `<tr class="pricing-list-section-row is-illiquid"><td colspan="4"><strong>Неликвид</strong><span>отдельные позиции</span></td></tr>${renderRows(illiquid,true)}` : '');

        $('pricing-sheet-save-display').style.display=manage && rows.length ? '' : 'none';
        $('pricing-sheet-excel').disabled=!rows.length;
        $('pricing-sheet-pdf').disabled=!rows.length;
        $('pricing-sheet-share').disabled=!rows.length;
    }

    async function saveDisplayPrices() {
        const data=state.currentSheet;
        if(!data || !manage) return;
        const prices=[...document.querySelectorAll('#pricing-sheet-rows [data-sheet-row]')].map(row=>({
            rowType:row.dataset.rowType || 'product',
            collection:row.dataset.collection || '',
            productId:row.dataset.productId || '',
            price:n(row.querySelector('.pricing-display-price')?.value)
        }));
        try {
            await send(API+'/dealers/'+encodeURIComponent(data.dealer.id)+'/display-prices','PUT',{prices});
            toast('Витринные цены сохранены');
            await openDealerPriceSheet(data.dealer.id);
        } catch(error) {
            toast(error.message,'error');
        }
    }

    function dealerExportRows() {
        const data=state.currentSheet;
        const includeIlliquid=data?.priceList?.includeIlliquid === true;
        return (data?.rows || [])
            .filter(row=>row.isLiquid !== false || (includeIlliquid && row.productType !== 'equipment'))
            .filter(row=>n(row.finalPrice)>0 || n(row.rrp)>0 || n(row.displayPrice)>0)
            .map(row=>({
                'Номенклатура':row.isLiquid === false ? ([row.sku,row.name].filter(Boolean).join(' · ')) : (row.collection || row.name || ''),
                'Спец.цена':n(row.finalPrice),
                'Рекомендуемая розница':n(row.rrp),
                'Цена на витрине':n(row.displayPrice)
            }));
    }

    async function createExcelBlob() {
        const XLSX=await ensureXlsxLoaded();
        const data=state.currentSheet;
        const rows=dealerExportRows();
        const aoa=[
            ['Прайс-Лист IDEALfloor для дилера'],
            [data.dealer?.name || ''],
            [],
            ['Номенклатура','Спец.цена','Рекомендуемая розница','Цена на витрине']
        ];
        rows.forEach(row=>aoa.push([
            row['Номенклатура'],
            row['Спец.цена'] || '',
            row['Рекомендуемая розница'] || '',
            row['Цена на витрине'] || ''
        ]));
        const ws=XLSX.utils.aoa_to_sheet(aoa);
        ws['!merges']=[XLSX.utils.decode_range('A1:D1')];
        ws['!cols']=[{wch:44},{wch:18},{wch:26},{wch:22}];
        ws['!rows']=[{hpt:24},{hpt:18},{hpt:8},{hpt:32}];
        ['A1','A2','A4','B4','C4','D4'].forEach(ref=>{
            if(!ws[ref]) return;
            ws[ref].s = ws[ref].s || {};
        });
        const wb=XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb,ws,'Прайс');
        const output=XLSX.write(wb,{bookType:'xlsx',type:'array',cellStyles:true});
        return new Blob([output],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
    }

    async function createPdfBlob() {
        const pdfMake=await ensurePdfMakeLoaded();
        const data=state.currentSheet;
        const body=[
            [
                {text:'Номенклатура',style:'th'},
                {text:'Спец.цена',style:'th',alignment:'right'},
                {text:'Рекомендуемая розница',style:'th',alignment:'right'},
                {text:'Цена на витрине',style:'th',alignment:'right'}
            ],
            ...dealerExportRows().map(row=>[
                row['Номенклатура'],
                {text:row['Спец.цена'] ? fmt(row['Спец.цена'],2) : '—',alignment:'right'},
                {text:row['Рекомендуемая розница'] ? fmt(row['Рекомендуемая розница'],2) : '—',alignment:'right'},
                {text:row['Цена на витрине'] ? fmt(row['Цена на витрине'],2) : '—',alignment:'right'}
            ])
        ];
        const doc={
            pageSize:'A4',
            pageMargins:[30,32,30,32],
            content:[
                {text:'Прайс-Лист IDEALfloor для дилера',fontSize:16,bold:true,alignment:'center',margin:[0,0,0,4]},
                {text:data.dealer?.name || '',fontSize:10,alignment:'center',color:'#666666',margin:[0,0,0,14]},
                {table:{headerRows:1,widths:['*',74,105,88],body},layout:'lightHorizontalLines'},
                {text:'Цены указаны в тенге. В прайс включён только актуальный ликвидный ассортимент.',fontSize:8,color:'#888888',margin:[0,12,0,0]}
            ],
            styles:{th:{bold:true,color:'#444444',fillColor:'#f3f1ee',fontSize:8}},
            defaultStyle:{fontSize:9}
        };
        return new Promise(resolve=>pdfMake.createPdf(doc).getBlob(resolve));
    }

    function downloadBlob(blob, filename) {
        const url=URL.createObjectURL(blob);
        const a=document.createElement('a');
        a.href=url;
        a.download=filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(()=>URL.revokeObjectURL(url),1500);
    }

    async function exportDealerExcel() {
        try {
            const blob=await createExcelBlob();
            downloadBlob(blob,safeFilename('Прайс_IDEAL_FLOOR_'+(state.currentSheet?.dealer?.name||''))+'.xlsx');
        } catch(error) { toast(error.message,'error'); }
    }

    async function exportDealerPdf() {
        try {
            const blob=await createPdfBlob();
            downloadBlob(blob,safeFilename('Прайс_IDEAL_FLOOR_'+(state.currentSheet?.dealer?.name||''))+'.pdf');
        } catch(error) { toast(error.message,'error'); }
    }

    async function shareDealerPrice() {
        const data=state.currentSheet;
        if(!data) return;
        try {
            const blob=await createPdfBlob();
            const file=new File([blob],safeFilename('Прайс_IDEAL_FLOOR_'+(data.dealer?.name||''))+'.pdf',{type:'application/pdf'});
            if(navigator.share && navigator.canShare?.({files:[file]})){
                await navigator.share({
                    title:'Прайс IDEAL FLOOR',
                    text:'Актуальный прайс IDEAL FLOOR для '+(data.dealer?.name||'дилера'),
                    files:[file]
                });
                return;
            }
            downloadBlob(blob,file.name);
            const text=encodeURIComponent('Прайс IDEAL FLOOR для '+(data.dealer?.name||'')+'. PDF скачан — прикрепите его к этому сообщению.');
            const phone=String(data.dealer?.phone||'').replace(/\D/g,'');
            window.open(phone ? 'https://wa.me/'+phone+'?text='+text : 'https://wa.me/?text='+text,'_blank','noopener');
            toast('PDF скачан. WhatsApp открыт для отправки файла.');
        } catch(error) {
            if(error?.name !== 'AbortError') toast(error.message || 'Не удалось поделиться прайсом','error');
        }
    }

    function renderConditions() {
        const host = $('pricing-condition-list');
        if (!host) return;
        const statusFilter = $('pricing-condition-status')?.value || 'all';
        const list = state.conditions.filter(item => statusFilter === 'all' || item.computedStatus === statusFilter);

        if (!list.length) {
            host.innerHTML = '<div class="pricing-empty"><i class="bi bi-inbox me-1"></i>Условий с таким статусом нет</div>';
            return;
        }

        host.innerHTML = list.map(condition => {
            const status = condition.computedStatus || 'active';
            const target = n(condition.requirementTarget);
            const current = n(condition.requirementCurrent);
            const requirementOk = target <= 0 || (current >= target && condition.requirementVerified === true);
            const requirement = target > 0
                ? `<div class="pricing-requirement ${requirementOk ? 'is-ok':''}">
                    <span><i class="bi bi-${requirementOk ? 'check-circle':'exclamation-circle'} me-1"></i>${esc(condition.requirementUnit || 'публикаций')}: <strong>${fmt(current)}/${fmt(target)}</strong></span>
                    <span>${condition.requirementVerified ? 'проверено' : 'не подтверждено'}${condition.requirementDueDate ? ' · до '+dateText(condition.requirementDueDate):''}</span>
                </div>`
                : '';

            const value = condition.kind === 'discount'
                ? `−${fmt(condition.discountPercent,2)}%${condition.stackable === false ? ' · не суммируется':''}`
                : condition.priceListName || 'Базовый прайс';

            return `<article class="pricing-condition-card is-${esc(status)}">
                <div class="pricing-condition-top">
                    <div>
                        <strong>${esc(condition.name)}</strong>
                        <small>${esc(scopeLabel(condition))} · ${esc(reasonLabel(condition.reasonType))}${condition.code ? ' · '+esc(condition.code):''}</small>
                    </div>
                    <span class="pricing-status is-${esc(status)}">${statusLabel(status)}</span>
                </div>
                <div class="pricing-condition-details">
                    <div><small>Условие</small><strong>${esc(value)}</strong></div>
                    <div><small>Период</small><strong>${condition.startDate ? dateText(condition.startDate):'сразу'} → ${condition.endDate ? dateText(condition.endDate):'без срока'}</strong></div>
                    <div><small>Приоритет</small><strong>${fmt(condition.priority)}</strong></div>
                </div>
                ${requirement}
                ${condition.note ? `<small class="text-muted">${esc(condition.note)}</small>` : ''}
                <div class="pricing-condition-actions">
                    ${manage && status !== 'cancelled' ? `<button type="button" class="pricing-icon-btn" data-edit-condition="${idOf(condition)}" title="Редактировать"><i class="bi bi-pencil"></i></button>
                    <button type="button" class="pricing-icon-btn is-danger" data-cancel-condition="${idOf(condition)}" title="Отменить"><i class="bi bi-x-lg"></i></button>` : ''}
                </div>
            </article>`;
        }).join('');

        host.querySelectorAll('[data-edit-condition]').forEach(button => {
            button.addEventListener('click', () => openEdit(button.dataset.editCondition));
        });
        host.querySelectorAll('[data-cancel-condition]').forEach(button => {
            button.addEventListener('click', () => cancelCondition(button.dataset.cancelCondition));
        });
    }

    function scopeChoices(type) {
        if (type === 'dealer') {
            return state.rows
                .slice()
                .sort((a,b)=>String(a.dealerName || '').localeCompare(String(b.dealerName || ''),'ru'))
                .map(row => ({
                    value:String(row.dealerId || ''),
                    label:row.dealerName || 'Без названия',
                    meta:[row.city,row.sector].filter(Boolean).join(' · ')
                }))
                .filter(item=>item.value);
        }

        const source = type === 'city'
            ? state.rows.map(row=>row.city)
            : type === 'sector'
                ? state.rows.map(row=>row.sector)
                : [];

        const map = new Map();
        source.forEach(value => {
            const clean = String(value || '').trim();
            if (!clean) return;
            const key = clean.toLocaleLowerCase('ru-RU');
            if (!map.has(key)) map.set(key, clean);
        });
        return [...map.values()]
            .sort((a,b)=>a.localeCompare(b,'ru'))
            .map(value=>({ value, label:value, meta:'' }));
    }

    function renderTargetSummary() {
        const summary = $('pricing-target-summary');
        if (!summary) return;
        const type = $('pricing-scope-type')?.value || 'dealer';
        if (type === 'all') {
            summary.textContent = 'Вся дилерская сеть';
            return;
        }
        const count = selectedTargets.size;
        const labels = scopeChoices(type)
            .filter(item=>selectedTargets.has(String(item.value)))
            .map(item=>item.label);
        if (!count) {
            summary.textContent = 'Ничего не выбрано';
            return;
        }
        const noun = type === 'dealer'
            ? (count === 1 ? 'дилер' : 'дилеров')
            : type === 'city'
                ? (count === 1 ? 'город' : 'городов')
                : (count === 1 ? 'сектор' : 'секторов');
        summary.innerHTML = `<strong>Выбрано: ${count} ${noun}</strong><span>${esc(labels.slice(0,4).join(', '))}${labels.length>4 ? ' +' + (labels.length-4) : ''}</span>`;
    }

    function renderTargetOptions() {
        const type = $('pricing-scope-type')?.value || 'dealer';
        const host = $('pricing-target-options');
        if (!host) return;
        if (type === 'all') {
            host.innerHTML = '';
            renderTargetSummary();
            return;
        }
        const term = String($('pricing-target-search')?.value || '').trim().toLowerCase();
        const choices = scopeChoices(type).filter(item =>
            !term || [item.label,item.meta].join(' ').toLowerCase().includes(term)
        );
        host.innerHTML = choices.length
            ? choices.map(item => {
                const checked = selectedTargets.has(String(item.value));
                return `<label class="pricing-target-option ${checked ? 'is-selected':''}">
                    <input type="checkbox" name="pricing-target-choice" value="${esc(item.value)}" ${checked?'checked':''}>
                    <span class="pricing-target-check"><i class="bi bi-check-lg"></i></span>
                    <span class="pricing-target-option-copy"><strong>${esc(item.label)}</strong>${item.meta ? `<small>${esc(item.meta)}</small>` : ''}</span>
                </label>`;
            }).join('')
            : '<div class="pricing-target-empty"><i class="bi bi-search"></i><span>Ничего не найдено</span></div>';
        host.querySelectorAll('input[name="pricing-target-choice"]').forEach(input => {
            input.addEventListener('change', () => {
                const pickerScrollTop = host.scrollTop;
                const modalBody = input.closest('.modal-body');
                const modalScrollTop = modalBody?.scrollTop || 0;

                const value = String(input.value || '');
                if (input.checked) selectedTargets.add(value);
                else selectedTargets.delete(value);

                input.closest('.pricing-target-option')?.classList.toggle('is-selected', input.checked);
                renderTargetSummary();

                // Selection must never move the user away from the current row.
                host.scrollTop = pickerScrollTop;
                if (modalBody) modalBody.scrollTop = modalScrollTop;
                requestAnimationFrame(() => {
                    host.scrollTop = pickerScrollTop;
                    if (modalBody) modalBody.scrollTop = modalScrollTop;
                });
            });
        });
        renderTargetSummary();
    }

    function setTargetSelections(values = []) {
        selectedTargets = new Set((values || []).map(value=>String(value || '').trim()).filter(Boolean));
        renderTargetOptions();
    }

    function syncScopeFields(options = {}) {
        const type = $('pricing-scope-type')?.value || 'dealer';
        const clear = options.clear !== false;
        if (clear) selectedTargets.clear();

        const picker = $('pricing-target-picker');
        const all = $('pricing-target-all');
        picker?.classList.toggle('d-none', type === 'all');
        all?.classList.toggle('d-none', type !== 'all');

        const title = $('pricing-target-title');
        const hint = $('pricing-target-hint');
        const search = $('pricing-target-search');
        const selectAll = $('pricing-target-select-all');
        if (search && clear) search.value = '';
        selectAll?.classList.toggle('d-none', type === 'all');

        if (title) {
            title.textContent = type === 'dealer'
                ? 'Выберите дилеров'
                : type === 'city'
                    ? 'Выберите города'
                    : type === 'sector'
                        ? 'Выберите сектора'
                        : 'Вся сеть';
        }
        if (hint) {
            hint.textContent = type === 'dealer'
                ? 'Можно выбрать одного или несколько дилеров из рабочей базы'
                : type === 'city'
                    ? 'Можно выбрать один или несколько существующих городов'
                    : type === 'sector'
                        ? 'Можно выбрать один или несколько существующих секторов'
                        : 'Условие применяется ко всем';
        }
        if (search) {
            search.placeholder = type === 'dealer'
                ? 'Поиск дилера, города или сектора'
                : type === 'city'
                    ? 'Поиск города'
                    : 'Поиск сектора';
        }
        renderTargetOptions();
    }

    function customDiscountValue() {
        const raw = String($('pricing-discount-custom')?.value || '').replace(',', '.').trim();
        const value = Number(raw);
        return Number.isFinite(value) && value > 0 ? Math.min(100, Math.round(value * 100) / 100) : 0;
    }

    function syncPromotionPeriod() {
        const enabled = Boolean($('pricing-discount-5')?.checked || $('pricing-discount-10')?.checked || customDiscountValue() > 0);
        const section = $('pricing-promo-period-section');
        const hint = $('pricing-promo-period-hint');
        ['pricing-start-date','pricing-end-date'].forEach(id => {
            if ($(id)) $(id).disabled = !enabled;
        });
        section?.classList.toggle('is-disabled', !enabled);
        if (hint) hint.textContent = enabled
            ? 'Период будет применён только к выбранным скидкам.'
            : 'Выберите хотя бы одну скидку, чтобы задать период акции.';
    }

    function resetForm() {
        $('pricing-condition-form').reset();
        $('pricing-condition-id').value = '';
        $('pricing-modal-title').textContent = 'Настройка цен';
        $('pricing-scope-type').value = 'dealer';
        selectedTargets.clear();
        $('pricing-start-date').value = state.today || todayValue();
        $('pricing-end-date').value = '';
        $('pricing-price-list').value = '';
        $('pricing-discount-5').checked = false;
        $('pricing-discount-10').checked = false;
        if ($('pricing-discount-custom')) $('pricing-discount-custom').value = '';
        $('pricing-note').value = '';
        syncScopeFields({clear:false});
        syncPromotionPeriod();
        syncPriceOverrideHint();
    }

    function resetPricingModalViewport() {
        const body = document.querySelector('#pricing-condition-modal .modal-body');
        if (body) {
            body.scrollTop = 0;
            body.scrollLeft = 0;
        }
    }

    function openCreate(dealerId='') {
        if (!manage) return;
        resetForm();
        if (dealerId) setTargetSelections([dealerId]);
        const modalEl = $('pricing-condition-modal');
        resetPricingModalViewport();
        bootstrap.Modal.getOrCreateInstance(modalEl).show();
        requestAnimationFrame(resetPricingModalViewport);
    }

    function sameTarget(condition, scopeType, targets) {
        if (condition.scopeType !== scopeType) return false;
        if (scopeType === 'all') return true;
        const normalize = value => String(value?.id || value?._id || value || '').trim().toLocaleLowerCase('ru-RU');
        const wanted = new Set((targets || []).map(normalize).filter(Boolean));
        let actual = [];
        if (scopeType === 'dealer') {
            actual = Array.isArray(condition.dealers) && condition.dealers.length
                ? condition.dealers.map(idOf)
                : [idOf(condition.dealer)];
        } else {
            actual = Array.isArray(condition.scopeValues) && condition.scopeValues.length
                ? condition.scopeValues
                : [condition.scopeValue || ''];
        }
        const got = new Set(actual.map(normalize).filter(Boolean));
        return wanted.size === got.size && [...wanted].every(value => got.has(value));
    }

    function openEdit(conditionId) {
        if (!manage) return;
        const condition = state.conditions.find(item => idOf(item) === String(conditionId));
        if (!condition) return;
        resetForm();
        $('pricing-condition-id').value = idOf(condition);
        $('pricing-modal-title').textContent = 'Редактирование цен';

        const scopeType = condition.scopeType || 'dealer';
        $('pricing-scope-type').value = scopeType;
        let editTargets = [];
        if (scopeType === 'dealer') {
            editTargets = Array.isArray(condition.dealers) && condition.dealers.length
                ? condition.dealers.map(idOf)
                : [idOf(condition.dealer)];
        } else if (scopeType === 'sector' || scopeType === 'city') {
            editTargets = Array.isArray(condition.scopeValues) && condition.scopeValues.length
                ? condition.scopeValues
                : [condition.scopeValue || ''];
        }
        editTargets = editTargets.map(value=>String(value || '').trim()).filter(Boolean);
        syncScopeFields({clear:false});
        setTargetSelections(editTargets);

        const related = state.conditions.filter(item =>
            !item.cancelledAt &&
            ['active','planned','paused'].includes(item.computedStatus || '') &&
            sameTarget(item, scopeType, editTargets)
        );
        const price = related.find(item => item.kind === 'price_list');
        const d5 = related.find(item => item.kind === 'discount' && Math.abs(n(item.discountPercent)-5) < 0.001);
        const d10 = related.find(item => item.kind === 'discount' && Math.abs(n(item.discountPercent)-10) < 0.001);
        const customDiscount = related.find(item =>
            item.kind === 'discount' &&
            Math.abs(n(item.discountPercent)-5) >= 0.001 &&
            Math.abs(n(item.discountPercent)-10) >= 0.001
        );

        if (price) $('pricing-price-list').value = idOf(price.priceList) || state.priceLists.find(item => item.name === price.priceListName)?.id || '';
        syncPriceOverrideHint();
        $('pricing-discount-5').checked = Boolean(d5);
        $('pricing-discount-10').checked = Boolean(d10);
        if ($('pricing-discount-custom')) $('pricing-discount-custom').value = customDiscount ? String(n(customDiscount.discountPercent)) : '';
        const promo = d5 || d10 || customDiscount;
        $('pricing-start-date').value = promo?.startDate || state.today || todayValue();
        $('pricing-end-date').value = promo?.endDate || '';
        $('pricing-note').value = condition.note || promo?.note || price?.note || '';
        syncPromotionPeriod();

        const modalEl = $('pricing-condition-modal');
        resetPricingModalViewport();
        bootstrap.Modal.getOrCreateInstance(modalEl).show();
        requestAnimationFrame(resetPricingModalViewport);
    }

    function pricingSetupPayload() {
        const scopeType = $('pricing-scope-type')?.value || 'dealer';
        const discounts = [];
        if ($('pricing-discount-5')?.checked) discounts.push(5);
        if ($('pricing-discount-10')?.checked) discounts.push(10);
        const custom = customDiscountValue();
        if (custom > 0 && !discounts.some(value => Math.abs(value-custom) < 0.001)) discounts.push(custom);
        return {
            scopeType,
            dealerIds: scopeType === 'dealer' ? [...selectedTargets] : [],
            scopeValues: (scopeType === 'sector' || scopeType === 'city') ? [...selectedTargets] : [],
            priceListId:$('pricing-price-list')?.value || '',
            discounts,
            startDate:discounts.length ? $('pricing-start-date').value : '',
            endDate:discounts.length ? $('pricing-end-date').value : '',
            note:$('pricing-note').value
        };
    }

    async function send(url, method, payload) {
        const res = await fetch(url, {
            method,
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify(payload || {})
        });
        const data = await res.json().catch(()=>({}));
        if (!res.ok) throw new Error(data.error || 'Ошибка операции');
        return data;
    }

    async function saveCondition(event) {
        event.preventDefault();
        if (!manage) return;
        try {
            $('pricing-save-btn').disabled = true;
            const payload = pricingSetupPayload();
            if (payload.scopeType !== 'all' && !selectedTargets.size) {
                throw new Error('Выберите, на кого действует настройка');
            }
            if (!payload.priceListId) {
                throw new Error('Выберите прайс');
            }
            await send(API+'/setup','POST',payload);
            bootstrap.Modal.getOrCreateInstance($('pricing-condition-modal')).hide();
            toast('Ценовые условия сохранены');
            await load();
        } catch (error) {
            toast(error.message,'error');
        } finally {
            $('pricing-save-btn').disabled = false;
        }
    }

    async function cancelCondition(conditionId) {
        if (!manage) return;
        const condition = state.conditions.find(item => idOf(item) === String(conditionId));
        if (!condition) return;
        if (!confirm(`Отменить условие «${condition.name}»? История сохранится.`)) return;
        const reason = prompt('Причина отмены (необязательно):','') || '';
        try {
            await send(API+'/conditions/'+encodeURIComponent(conditionId),'DELETE',{reason});
            toast('Условие отменено');
            await load();
        } catch (error) {
            toast(error.message,'error');
        }
    }

    document.querySelectorAll('[data-pricing-view]').forEach(button => {
        button.addEventListener('click', () => switchPricingView(button.dataset.pricingView || 'dealers'));
    });

    $('pricing-search')?.addEventListener('input',renderDealers);
    $('pricing-filter')?.addEventListener('change',renderDealers);
    $('pricing-list-search')?.addEventListener('input',renderPriceLists);
    $('pricing-list-filter')?.addEventListener('change',renderPriceLists);
    $('pricing-condition-status')?.addEventListener('change',renderConditions);

    $('pricing-add-btn')?.addEventListener('click',()=>openCreate());
    $('pricing-add-list-btn')?.addEventListener('click',()=>openPriceListEditor());
    $('pricing-price-list-form')?.addEventListener('submit',savePriceList);
    $('pricing-list-import-btn')?.addEventListener('click',()=>$('pricing-list-import-input')?.click());
    $('pricing-list-import-input')?.addEventListener('change',event=>importPriceListExcel(event.target.files?.[0]));
    $('pricing-list-copy-opt-btn')?.addEventListener('click',copyOptToRrp);
    $('pricing-list-show-illiquid')?.addEventListener('change',syncPriceListIlliquidVisibility);

    $('pricing-sheet-save-display')?.addEventListener('click',saveDisplayPrices);
    $('pricing-sheet-excel')?.addEventListener('click',exportDealerExcel);
    $('pricing-sheet-pdf')?.addEventListener('click',exportDealerPdf);
    $('pricing-sheet-share')?.addEventListener('click',shareDealerPrice);

    $('pricing-scope-type')?.addEventListener('change',()=>{
        syncScopeFields();
        syncPriceOverrideHint();
    });
    $('pricing-target-search')?.addEventListener('input',renderTargetOptions);
    $('pricing-target-clear')?.addEventListener('click',()=>setTargetSelections([]));
    $('pricing-target-select-all')?.addEventListener('click',()=>{
        const type = $('pricing-scope-type')?.value || 'dealer';
        if (type === 'all') return;
        const term = String($('pricing-target-search')?.value || '').trim().toLowerCase();
        const values = scopeChoices(type)
            .filter(item=>!term || [item.label,item.meta].join(' ').toLowerCase().includes(term))
            .map(item=>item.value);
        setTargetSelections(values);
    });
    $('pricing-price-list')?.addEventListener('change',syncPriceOverrideHint);
    $('pricing-discount-5')?.addEventListener('change',syncPromotionPeriod);
    $('pricing-discount-10')?.addEventListener('change',syncPromotionPeriod);
    $('pricing-discount-custom')?.addEventListener('input',syncPromotionPeriod);
    $('pricing-condition-form')?.addEventListener('submit',saveCondition);
    $('pricing-condition-modal')?.addEventListener('shown.bs.modal',resetPricingModalViewport);

    load();
});