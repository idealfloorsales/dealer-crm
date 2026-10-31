document.addEventListener('DOMContentLoaded', () => {
    const $ = id => document.getElementById(id);
    const API = '/api/pricing';
    const state = { today:'', rows:[], conditions:[], stats:{} };
    let manage = false;

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

    function scopeLabel(condition) {
        if (condition.scopeType === 'dealer') return condition.dealer?.name || 'Дилер';
        if (condition.scopeType === 'sector') return `Сектор: ${condition.scopeValue || '—'}`;
        if (condition.scopeType === 'city') return `Город: ${condition.scopeValue || '—'}`;
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
            if (addBtn) addBtn.style.display = manage ? '' : 'none';

            const res = await fetch(API + '/overview');
            const data = await res.json().catch(()=>({}));
            if (!res.ok) throw new Error(data.error || 'Не удалось загрузить ценовые условия');
            state.today = data.today || todayValue();
            state.rows = Array.isArray(data.rows) ? data.rows : [];
            state.conditions = Array.isArray(data.conditions) ? data.conditions : [];
            state.stats = data.stats || {};
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
        renderConditions();
        fillDealerOptions();
        if ($('pricing-today')) $('pricing-today').textContent = `На ${dateText(state.today)}`;
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
                        <label class="is-name"><span>Название прайса</span><input class="form-control" data-inline-base-name value="${esc(base?.priceListName || '')}" placeholder="Например: Индивидуальный прайс"></label>
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
            if (row.priceListCondition) badges.push(`<span class="pricing-badge is-base"><i class="bi bi-receipt"></i>${esc(row.effectivePriceList)}</span>`);
            (row.activeDiscounts || []).forEach(condition => {
                const inherited = condition.scopeType !== 'dealer';
                badges.push(`<span class="pricing-badge is-discount ${inherited?'is-inherited':''}">−${fmt(condition.discountPercent,2)}% · ${esc(condition.name)}${inherited?' · '+esc(condition.scopeType):''}</span>`);
            });
            if (row.pendingRequirements) badges.push(`<span class="pricing-badge is-warning"><i class="bi bi-exclamation-circle"></i>${row.pendingRequirements} обязательств</span>`);
            if (row.priceListConflicts) badges.push(`<span class="pricing-badge is-conflict"><i class="bi bi-exclamation-triangle"></i>${row.priceListConflicts + 1} базовых прайса</span>`);
            if (Array.isArray(row.ignoredDiscounts) && row.ignoredDiscounts.length) badges.push(`<span class="pricing-badge is-conflict"><i class="bi bi-slash-circle"></i>${row.ignoredDiscounts.length} скидок не применено</span>`);
            if (!badges.length) badges.push('<span class="pricing-badge">Стандартные условия</span>');

            const baseNote = row.priceListCondition
                ? `переопределяет «${esc(row.defaultPriceType || 'Оптовая цена')}»`
                : 'базовый тип дилера';
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
        return {
            scopeType:'dealer', dealerId, kind:'price_list',
            name:'Индивидуальный базовый прайс', code:'DEALER-PRICE',
            discountPercent:0,
            priceListName:editor.querySelector('[data-inline-base-name]')?.value?.trim() || '',
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
            if (code === 'DEALER-PRICE' && !payload.priceListName) {
                throw new Error('Укажите название индивидуального базового прайса');
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

    function fillDealerOptions() {
        const select = $('pricing-dealer-id');
        if (!select) return;
        const current = select.value;
        select.innerHTML = '<option value="">Выберите дилера</option>' + state.rows
            .slice()
            .sort((a,b)=>String(a.dealerName).localeCompare(String(b.dealerName),'ru'))
            .map(row => `<option value="${esc(row.dealerId)}">${esc(row.dealerName)} · ${esc(row.city || '')}</option>`)
            .join('');
        if (state.rows.some(row=>row.dealerId===current)) select.value=current;
    }

    function syncScopeFields() {
        const type = $('pricing-scope-type').value;
        $('pricing-dealer-field').classList.toggle('d-none', type !== 'dealer');
        $('pricing-scope-value-field').classList.toggle('d-none', !(type === 'sector' || type === 'city'));
        $('pricing-scope-value-label').textContent = type === 'city' ? 'Город' : 'Сектор / регион';
        $('pricing-scope-value').placeholder = type === 'city' ? 'Например: Атырау' : 'Например: Запад';
    }

    function selectedKind() {
        return document.querySelector('input[name="pricing-kind"]:checked')?.value || 'discount';
    }

    function syncKindFields() {
        const kind = selectedKind();
        $('pricing-percent-field').classList.toggle('d-none', kind !== 'discount');
        $('pricing-stack-field').classList.toggle('d-none', kind !== 'discount');
        $('pricing-price-list-field').classList.toggle('d-none', kind !== 'price_list');
    }

    function syncReasonDefaults(force=false) {
        const reason = $('pricing-reason-type').value;
        const target = $('pricing-requirement-target');
        if (reason === 'social_posts') {
            if (force || n(target.value) === 0) target.value = 8;
            if (!$('pricing-requirement-unit').value) $('pricing-requirement-unit').value = 'публикаций';
        } else if (force) {
            target.value = 0;
            $('pricing-requirement-current').value = 0;
            $('pricing-requirement-verified').checked = false;
        }
    }

    function applyPreset(name) {
        if (!manage) return;
        if (name === 'social5') {
            document.querySelector('input[name="pricing-kind"][value="discount"]').checked = true;
            $('pricing-name').value = '−5% за публикации в соцсетях';
            $('pricing-code').value = 'SOCIAL-5';
            $('pricing-percent').value = 5;
            $('pricing-stackable').value = 'true';
            $('pricing-reason-type').value = 'social_posts';
            $('pricing-requirement-target').value = 8;
            $('pricing-requirement-current').value = 0;
            $('pricing-requirement-unit').value = 'публикаций';
            $('pricing-requirement-verified').checked = false;
        } else if (name === 'support10') {
            document.querySelector('input[name="pricing-kind"][value="discount"]').checked = true;
            $('pricing-name').value = '−10% акция для поддержки продаж';
            $('pricing-code').value = 'SUPPORT-10';
            $('pricing-percent').value = 10;
            $('pricing-stackable').value = 'true';
            $('pricing-reason-type').value = 'support_promo';
            $('pricing-requirement-target').value = 0;
            $('pricing-requirement-current').value = 0;
            $('pricing-requirement-verified').checked = false;
        } else if (name === 'regional') {
            document.querySelector('input[name="pricing-kind"][value="price_list"]').checked = true;
            $('pricing-name').value = 'Региональный базовый прайс';
            $('pricing-code').value = 'REGIONAL-PRICE';
            $('pricing-price-list').value = '';
            $('pricing-reason-type').value = 'regional_price';
            $('pricing-requirement-target').value = 0;
            $('pricing-requirement-current').value = 0;
            $('pricing-requirement-verified').checked = false;
            if ($('pricing-scope-type').value === 'dealer') $('pricing-scope-type').value = 'sector';
        }
        syncScopeFields();
        syncKindFields();
    }

        function resetForm() {
        $('pricing-condition-form').reset();
        $('pricing-condition-id').value = '';
        $('pricing-modal-title').textContent = 'Новое условие';
        $('pricing-scope-type').value = 'dealer';
        document.querySelector('input[name="pricing-kind"][value="discount"]').checked = true;
        $('pricing-percent').value = 5;
        $('pricing-stackable').value = 'true';
        $('pricing-priority').value = 0;
        $('pricing-start-date').value = state.today || todayValue();
        $('pricing-reason-type').value = 'social_posts';
        $('pricing-requirement-target').value = 8;
        $('pricing-requirement-current').value = 0;
        $('pricing-requirement-unit').value = 'публикаций';
        $('pricing-requirement-verified').checked = false;
        $('pricing-paused').value = 'false';
        syncScopeFields();
        syncKindFields();
    }

    function openCreate(dealerId='') {
        if (!manage) return;
        resetForm();
        if (dealerId) $('pricing-dealer-id').value = dealerId;
        bootstrap.Modal.getOrCreateInstance($('pricing-condition-modal')).show();
    }

    function openEdit(conditionId) {
        if (!manage) return;
        const condition = state.conditions.find(item => idOf(item) === String(conditionId));
        if (!condition) return;
        resetForm();
        $('pricing-condition-id').value = idOf(condition);
        $('pricing-modal-title').textContent = 'Редактирование условия';
        $('pricing-scope-type').value = condition.scopeType || 'dealer';
        syncScopeFields();
        if (condition.scopeType === 'dealer') $('pricing-dealer-id').value = idOf(condition.dealer);
        else $('pricing-scope-value').value = condition.scopeValue || '';

        const radio = document.querySelector(`input[name="pricing-kind"][value="${condition.kind || 'discount'}"]`);
        if (radio) radio.checked = true;
        syncKindFields();

        $('pricing-name').value = condition.name || '';
        $('pricing-code').value = condition.code || '';
        $('pricing-percent').value = n(condition.discountPercent) || 5;
        $('pricing-price-list').value = condition.priceListName || '';
        $('pricing-stackable').value = condition.stackable === false ? 'false' : 'true';
        $('pricing-priority').value = n(condition.priority);
        $('pricing-start-date').value = condition.startDate || '';
        $('pricing-end-date').value = condition.endDate || '';
        $('pricing-paused').value = condition.paused ? 'true' : 'false';
        $('pricing-reason-type').value = condition.reasonType || 'other';
        $('pricing-requirement-target').value = n(condition.requirementTarget);
        $('pricing-requirement-current').value = n(condition.requirementCurrent);
        $('pricing-requirement-unit').value = condition.requirementUnit || 'публикаций';
        $('pricing-requirement-due').value = condition.requirementDueDate || '';
        $('pricing-requirement-verified').checked = condition.requirementVerified === true;
        $('pricing-proof-note').value = condition.proofNote || '';
        $('pricing-note').value = condition.note || '';
        bootstrap.Modal.getOrCreateInstance($('pricing-condition-modal')).show();
    }

    function formPayload() {
        const kind = selectedKind();
        const scopeType = $('pricing-scope-type').value;
        return {
            scopeType,
            dealerId: scopeType === 'dealer' ? $('pricing-dealer-id').value : null,
            scopeValue: (scopeType === 'sector' || scopeType === 'city') ? $('pricing-scope-value').value : '',
            kind,
            name:$('pricing-name').value,
            code:$('pricing-code').value,
            discountPercent:kind === 'discount' ? n($('pricing-percent').value) : 0,
            priceListName:kind === 'price_list' ? $('pricing-price-list').value : '',
            stackable:kind === 'discount' ? $('pricing-stackable').value === 'true' : false,
            priority:n($('pricing-priority').value),
            startDate:$('pricing-start-date').value,
            endDate:$('pricing-end-date').value,
            paused:$('pricing-paused').value === 'true',
            reasonType:$('pricing-reason-type').value,
            requirementTarget:n($('pricing-requirement-target').value),
            requirementCurrent:n($('pricing-requirement-current').value),
            requirementUnit:$('pricing-requirement-unit').value,
            requirementDueDate:$('pricing-requirement-due').value,
            requirementVerified:$('pricing-requirement-verified').checked,
            proofNote:$('pricing-proof-note').value,
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
        const id = $('pricing-condition-id').value;
        try {
            $('pricing-save-btn').disabled = true;
            await send(id ? API+'/conditions/'+encodeURIComponent(id) : API+'/conditions', id ? 'PUT' : 'POST', formPayload());
            bootstrap.Modal.getOrCreateInstance($('pricing-condition-modal')).hide();
            toast(id ? 'Ценовое условие обновлено' : 'Ценовое условие добавлено');
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

    $('pricing-search')?.addEventListener('input',renderDealers);
    $('pricing-filter')?.addEventListener('change',renderDealers);
    $('pricing-condition-status')?.addEventListener('change',renderConditions);
    $('pricing-add-btn')?.addEventListener('click',()=>openCreate());
    $('pricing-scope-type')?.addEventListener('change',syncScopeFields);
    document.querySelectorAll('input[name="pricing-kind"]').forEach(input=>input.addEventListener('change',syncKindFields));
    $('pricing-reason-type')?.addEventListener('change',()=>syncReasonDefaults(true));
    document.querySelectorAll('[data-pricing-preset]').forEach(button => {
        button.addEventListener('click', () => applyPreset(button.dataset.pricingPreset));
    });
    $('pricing-condition-form')?.addEventListener('submit',saveCondition);

    load();
});