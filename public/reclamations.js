document.addEventListener('DOMContentLoaded', () => {
    let allReclamations = [];
    let allDealers = [];
    let allProducts = [];
    let uploadedPhotos = []; // Теперь элементы: { photo_url: base64, isVideo: boolean }
    let currentViewId = null;
    let canManageReclamations = false;
    const reclamationDetailCache = new Map();
    let referenceDataPromise = null;
    let dateFilterMode = 'all';

    const listEl = document.getElementById('reclamations-list');
    const searchInput = document.getElementById('search-input');
    const searchClear = document.getElementById('rec-search-clear');
    const sortSelect = document.getElementById('sort-select');
    const statusFilter = document.getElementById('status-filter');
    const mediaFilter = document.getElementById('media-filter');
    const dealerFilter = document.getElementById('dealer-filter');
    const resetFiltersBtn = document.getElementById('rec-reset-filters');
    const kpiHost = document.getElementById('reclamation-kpis');
    const filterSummary = document.getElementById('rec-filter-summary');
    const visibleSummary = document.getElementById('rec-visible-summary');
    const addModalEl = document.getElementById('add-modal');
    const addModal = new bootstrap.Modal(addModalEl);
    const viewModal = new bootstrap.Modal(document.getElementById('view-modal'));
    const fullscreenModal = new bootstrap.Modal(document.getElementById('fullscreen-modal'));
    const form = document.getElementById('reclamation-form');

    init();

    async function init() {
        if (window.CRMAuth && CRMAuth.ready) await CRMAuth.ready;
        canManageReclamations = window.CRMAuth ? CRMAuth.can('can_manage_reclamations') : false;

        const saveBtn = document.getElementById('btn-save');
        const mediaInput = document.getElementById('r_photos');
        const cameraInput = document.getElementById('r_camera');
        if (saveBtn && !canManageReclamations) saveBtn.style.display = 'none';
        if (mediaInput && !canManageReclamations) mediaInput.disabled = true;
        if (cameraInput && !canManageReclamations) cameraInput.disabled = true;

        document.getElementById('r_date').value = localDateInputValue();

        referenceDataPromise = Promise.allSettled([
            fetchDealers(),
            fetchProducts()
        ]);

        await fetchReclamations();
        renderList();
        setupPhotoUpload();
        setupVolumeControls();
        setupFieldShortcuts();
        setupFormProgress();
    }

    async function fetchReclamations() {
        try {
            const res = await fetch('/api/reclamations');
            if (res.ok) {
                allReclamations = await res.json();
                reclamationDetailCache.clear();
                populateReclamationDealerFilter();
            }
        } catch (e) { console.error(e); }
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g,'&amp;')
            .replace(/</g,'&lt;')
            .replace(/>/g,'&gt;')
            .replace(/"/g,'&quot;')
            .replace(/'/g,'&#039;');
    }

    function normalize(value) {
        return String(value ?? '').trim().toLowerCase().replace(/\s+/g,' ');
    }

    const reclamationStatuses = {
        new: 'Новая', inspection: 'Проверка', waiting_customer: 'Ждём данные',
        waiting_expertise: 'Ждём экспертизу', decision_ready: 'Решение подготовлено',
        closed: 'Закрыта', rejected: 'Отказано'
    };
    const problemTypeLabels = {
        surface:'Повреждение поверхности / декора', lock:'Замок / соединение',
        geometry:'Геометрия / размер планки', moisture:'Вздутие / влага',
        color:'Цвет / оттенок', packaging:'Упаковка / маркировка', other:'Другое',
        legacy:'Не классифицировано (старая запись)'
    };
    const decisionTypeLabels = {
        replacement:'Замена товара', compensation:'Компенсация', refund:'Возврат средств',
        no_defect:'Дефект не подтверждён', recommendation:'Рекомендации по эксплуатации', other:'Другое'
    };

    function getStatusCode(item) {
        const status = String(item?.status || '').trim();
        if (Object.prototype.hasOwnProperty.call(reclamationStatuses, status)) return status;
        // Старые обращения не закрываем автоматически из-за заполненного текста решения.
        return String(item?.resolution || '').trim() ? 'decision_ready' : 'new';
    }

    function isResolved(item) {
        return ['closed', 'rejected'].includes(getStatusCode(item));
    }

    function isOverdue(item) {
        if (!item?.dueDate || isResolved(item)) return false;
        const due = new Date(`${item.dueDate}T00:00:00`);
        if (Number.isNaN(due.getTime())) return false;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return due < today;
    }

    function formatRecDate(value) {
        if (!value) return '—';
        const date = new Date(`${String(value).slice(0,10)}T00:00:00`);
        return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('ru-RU');
    }

    function localDateInputValue() {
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        return now.toISOString().slice(0,10);
    }

    function mediaCount(item) {
        return Number(item?.photoCount ?? item?.photos?.length ?? 0) || 0;
    }

    function daysSince(value) {
        const date = new Date(value || 0);
        if (Number.isNaN(date.getTime())) return 0;
        return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000));
    }

    function populateReclamationDealerFilter() {
        if (!dealerFilter) return;
        const current = dealerFilter.value || '';
        const map = new Map();
        allReclamations.forEach(r => {
            const id = String(r.dealerId || '');
            const name = String(r.dealerName || '').trim();
            if (id && name && !map.has(id)) map.set(id,name);
        });
        const items = [...map.entries()].sort((a,b)=>a[1].localeCompare(b[1],'ru'));
        dealerFilter.innerHTML = '<option value="">Все дилеры</option>' +
            items.map(([id,name]) => `<option value="${escapeHtml(id)}">${escapeHtml(name)}</option>`).join('');
        if (items.some(([id])=>id===current)) dealerFilter.value=current;
    }

    async function fetchDealers() {
        try {
            const res = await fetch('/api/dealers?scope=all');
            if (res.ok) {
                allDealers = (await res.json())
                    .filter(d => !['potential','archive'].includes(String(d.status || '').toLowerCase()));
                allDealers.sort((a,b) => String(a.name || '').localeCompare(String(b.name || ''),'ru'));
                const select = document.getElementById('r_dealer');
                select.innerHTML = '<option value="">-- Выберите дилера --</option>' + 
                    allDealers.map(d => `<option value="${escapeHtml(d.id)}">${escapeHtml(d.name)}${d.city ? ' ('+escapeHtml(d.city)+')' : ''}</option>`).join('');

            }
        } catch (e) {}
    }

    async function fetchProducts() {
        try {
            const res = await fetch('/api/products');
            if (res.ok) {
                allProducts = await res.json();
                const dl = document.getElementById('products-datalist');
                dl.innerHTML = allProducts.map(p => `<option value="${p.sku} ${p.name}">`).join('');
            }
        } catch(e) {}
    }

    // --- РЕЕСТР: КАРТОЧКИ, KPI И ФИЛЬТРЫ ---
    function getFilteredReclamations() {
        const query = normalize(searchInput?.value);
        const sortMode = sortSelect?.value || 'newest';
        const status = statusFilter?.value || 'all';
        const media = mediaFilter?.value || 'all';
        const dealerId = dealerFilter?.value || '';

        let filtered = allReclamations.filter(r => {
            const blob = normalize([
                r.dealerName, r.productName, r.invoiceNumber,
                r.clientName, r.description, r.clientDemand
            ].filter(Boolean).join(' '));
            if (query && !blob.includes(query)) return false;
            const currentStatus = getStatusCode(r);
            if (status === 'open' && isResolved(r)) return false;
            if (status === 'resolved' && !isResolved(r)) return false;
            if (status === 'overdue' && !isOverdue(r)) return false;
            if (reclamationStatuses[status] && currentStatus !== status) return false;
            const photos = mediaCount(r);
            if (media === 'with' && photos <= 0) return false;
            if (media === 'without' && photos > 0) return false;
            if (dealerId && String(r.dealerId || '') !== dealerId) return false;
            if (dateFilterMode === 'recent' && daysSince(r.createdAt || r.date) > 30) return false;
            return true;
        });

        filtered.sort((a,b) => {
            if (sortMode === 'oldest') return new Date(a.createdAt || a.date) - new Date(b.createdAt || b.date);
            if (sortMode === 'dealer_asc') return String(a.dealerName || '').localeCompare(String(b.dealerName || ''),'ru');
            if (sortMode === 'dealer_desc') return String(b.dealerName || '').localeCompare(String(a.dealerName || ''),'ru');
            return new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date);
        });
        return filtered;
    }

    function renderKpis() {
        if (!kpiHost) return;
        const total = allReclamations.length;
        const open = allReclamations.filter(r => !isResolved(r)).length;
        const resolved = total - open;
        const withoutMedia = allReclamations.filter(r => mediaCount(r) === 0).length;
        const overdue = allReclamations.filter(isOverdue).length;

        const cleanSearch = !normalize(searchInput?.value) && !dealerFilter?.value;
        const cards = [
            {key:'all',icon:'bi-collection',label:'Всего',value:total,foot:'в реестре',tone:'',active:cleanSearch && statusFilter?.value==='all' && mediaFilter?.value==='all' && dateFilterMode==='all'},
            {key:'open',icon:'bi-hourglass-split',label:'В работе',value:open,foot:'ещё не закрыты',tone:open?'warn':'',active:statusFilter?.value==='open' && dateFilterMode==='all'},
            {key:'overdue',icon:'bi-alarm',label:'Просрочено',value:overdue,foot:'следующий шаг уже должен быть',tone:overdue?'risk':'',active:statusFilter?.value==='overdue' && dateFilterMode==='all'},
            {key:'resolved',icon:'bi-check2-circle',label:'Закрыто',value:resolved,foot:'закрытые обращения',tone:'good',active:statusFilter?.value==='resolved' && dateFilterMode==='all'},
            {key:'without-media',icon:'bi-camera',label:'Без фото',value:withoutMedia,foot:'нужно проверить',tone:withoutMedia?'risk':'',active:mediaFilter?.value==='without' && dateFilterMode==='all'},
        ];

        kpiHost.innerHTML = cards.map(card => `
            <button type="button" class="rec-kpi ${card.tone?'is-'+card.tone:''} ${card.active?'active':''}" data-rec-kpi="${card.key}">
                <span class="rec-kpi-icon"><i class="bi ${card.icon}"></i></span>
                <span class="rec-kpi-copy"><small>${escapeHtml(card.label)}</small><strong>${escapeHtml(card.value)}</strong><em>${escapeHtml(card.foot)}</em></span>
            </button>
        `).join('');

        kpiHost.querySelectorAll('[data-rec-kpi]').forEach(btn => {
            btn.addEventListener('click', () => {
                const key = btn.dataset.recKpi;
                if (searchInput) searchInput.value = '';
                if (dealerFilter) dealerFilter.value = '';
                if (statusFilter) statusFilter.value = key === 'open' ? 'open' : key === 'resolved' ? 'resolved' : key === 'overdue' ? 'overdue' : 'all';
                if (mediaFilter) mediaFilter.value = key === 'without-media' ? 'without' : 'all';
                dateFilterMode = 'all';
                renderList();
            });
        });
    }

    function renderFilterMeta(filtered) {
        const parts = [];
        const status = statusFilter?.value || 'all';
        const media = mediaFilter?.value || 'all';
        if (status === 'open') parts.push('В работе');
        else if (status === 'resolved') parts.push('Закрытые');
        else if (status === 'overdue') parts.push('Просрочено');
        else if (reclamationStatuses[status]) parts.push(reclamationStatuses[status]);
        else parts.push('Все рекламации');
        if (media === 'with') parts.push('с медиа');
        if (media === 'without') parts.push('без медиа');
        if (dealerFilter?.value) parts.push(dealerFilter.selectedOptions?.[0]?.textContent || 'дилер');
        if (dateFilterMode === 'recent') parts.push('за 30 дней');
        if (normalize(searchInput?.value)) parts.push(`поиск: «${searchInput.value.trim()}»`);

        if (filterSummary) filterSummary.textContent = parts.join(' · ');
        const openVisible = filtered.filter(r => !isResolved(r)).length;
        if (visibleSummary) visibleSummary.textContent = `${filtered.length} показано · ${openVisible} в работе`;
    }

    function renderList() {
        if (searchClear) searchClear.hidden = !normalize(searchInput?.value);
        const filtered = getFilteredReclamations();
        renderKpis();
        renderFilterMeta(filtered);

        if (!filtered.length) {
            listEl.innerHTML = '<div class="rec-empty"><i class="bi bi-inbox"></i><span>По текущим фильтрам ничего не найдено</span></div>';
            return;
        }

        const chronological = [...allReclamations].sort((a,b) => new Date(a.createdAt || a.date) - new Date(b.createdAt || b.date));
        const sequenceMap = new Map(chronological.map((r,index) => [String(r.id), index + 1]));

        listEl.innerHTML = filtered.map(r => {
            const dateObj = new Date(r.createdAt || r.date);
            const dateStr = Number.isNaN(dateObj.getTime()) ? '—' : dateObj.toLocaleDateString('ru-RU');
            const photos = mediaCount(r);
            const resolved = isResolved(r);
            const statusCode = getStatusCode(r);
            const statusText = reclamationStatuses[statusCode] || 'В работе';
            const overdue = isOverdue(r);
            const seq = sequenceMap.get(String(r.id)) || 0;
            const age = daysSince(r.createdAt || r.date);
            const ageText = !resolved && age > 0 ? `${age} дн. в работе` : dateStr;
            const product = r.productName || 'Товар не указан';
            const description = r.description || 'Описание не заполнено';
            const purchased = r.purchasedVolume || '—';
            const defect = r.defectVolume || '—';
            const workflowMeta = [
                r.assignedToName ? `<span><i class="bi bi-person"></i> ${escapeHtml(r.assignedToName)}</span>` : '',
                r.dueDate ? `<span class="${overdue?'is-overdue':''}"><i class="bi bi-calendar-event"></i> ${overdue?'Просрочено · ':''}${escapeHtml(formatRecDate(r.dueDate))}</span>` : ''
            ].filter(Boolean).join('');
            return `
                <article class="reclamation-card" data-reclamation-id="${escapeHtml(r.id)}">
                    <div class="rec-card">
                        <div class="rec-card-head">
                            <span class="rec-number">№${String(seq).padStart(3,'0')}</span>
                            <div class="rec-card-title">
                                <strong>${escapeHtml(r.dealerName || 'Дилер не указан')}</strong>
                                <small>${escapeHtml(dateStr)}${r.invoiceNumber ? ' · Накл. '+escapeHtml(r.invoiceNumber) : ''}</small>
                            </div>
                        </div>
                        <span class="rec-status is-${statusCode} ${overdue?'is-overdue':''}"><i class="bi ${resolved?'bi-check2-circle':overdue?'bi-alarm':'bi-hourglass-split'}"></i>${escapeHtml(statusText)}</span>
                        <div class="rec-card-product">
                            <strong>${escapeHtml(product)}</strong>
                            <small><span>Куплено: <b>${escapeHtml(purchased)}</b></span><span>Брак: <b>${escapeHtml(defect)}</b></span></small>
                        </div>
                        <div class="rec-card-problem">${escapeHtml(description)}</div>
                        ${!resolved ? `<div class="rec-card-next ${r.nextAction?'':'is-missing'}"><strong><i class="bi ${r.nextAction?'bi-arrow-return-right':'bi-exclamation-circle'}"></i> ${r.nextAction?'Следующий шаг':'Нет следующего шага'}</strong><span>${r.nextAction?escapeHtml(r.nextAction):'Добавьте действие, чтобы обращение не потерялось.'}</span>${workflowMeta?`<small>${workflowMeta}</small>`:''}</div>` : ''}
                        <div class="rec-card-foot">
                            <span class="rec-card-demand">${escapeHtml(r.clientDemand || 'Требование не указано')}</span>
                            <span class="rec-card-meta">
                                <span><i class="bi bi-camera"></i> ${photos}</span>
                                <span>${escapeHtml(ageText)}</span>
                            </span>
                        </div>
                    </div>
                </article>`;
        }).join('');

        listEl.querySelectorAll('[data-reclamation-id]').forEach(card => {
            card.addEventListener('click', () => viewReclamation(card.dataset.reclamationId));
        });
    }

    searchInput?.addEventListener('input', () => { dateFilterMode='all'; renderList(); });
    searchClear?.addEventListener('click', () => {
        searchInput.value='';
        dateFilterMode='all';
        renderList();
        searchInput.focus();
    });
    sortSelect?.addEventListener('change', renderList);
    statusFilter?.addEventListener('change', () => { dateFilterMode='all'; renderList(); });
    mediaFilter?.addEventListener('change', () => { dateFilterMode='all'; renderList(); });
    dealerFilter?.addEventListener('change', () => { dateFilterMode='all'; renderList(); });
    resetFiltersBtn?.addEventListener('click', () => {
        if (searchInput) searchInput.value='';
        if (sortSelect) sortSelect.value='newest';
        if (statusFilter) statusFilter.value='all';
        if (mediaFilter) mediaFilter.value='all';
        if (dealerFilter) dealerFilter.value='';
        dateFilterMode='all';
        renderList();
    });

    function setupFieldShortcuts() {
        document.querySelectorAll('[data-rec-target]').forEach(button => {
            button.addEventListener('click', () => {
                document.querySelectorAll('[data-rec-target]').forEach(item => item.classList.toggle('active', item === button));
                const target = document.querySelector(button.dataset.recTarget);
                if (!target) return;
                if (target instanceof HTMLDetailsElement) target.open = true;
                target.scrollIntoView({behavior:'smooth', block:'start'});
                if (target.matches('input,textarea,select')) setTimeout(() => target.focus({preventScroll:true}), 180);
            });
        });
    }

    function updateFormProgress() {
        const requiredIds = ['r_dealer','r_date','r_product','r_problem_type','r_description'];
        const completed = requiredIds.filter(id => String(document.getElementById(id)?.value || '').trim()).length;
        const percent = Math.round((completed / requiredIds.length) * 100);
        const bar = document.getElementById('rec-form-progress-bar');
        const textEl = document.getElementById('rec-form-progress-text');
        if (bar) bar.style.width = percent + '%';
        if (textEl) textEl.textContent = completed === requiredIds.length
            ? 'Обязательные поля заполнены'
            : `Обязательные поля: ${completed} из ${requiredIds.length}`;
    }

    function setupFormProgress() {
        form?.addEventListener('input', updateFormProgress);
        form?.addEventListener('change', updateFormProgress);
        updateFormProgress();
    }

    function resetFieldShortcutState() {
        document.querySelectorAll('[data-rec-target]').forEach((button,index) => button.classList.toggle('active', index === 0));
        updateFormProgress();
        setTimeout(() => {
            const body = addModalEl?.querySelector('.rec-modal-body');
            if (body) body.scrollTop = 0;
        }, 50);
    }

    function setSelectValue(id, value) {
        const select = document.getElementById(id);
        if (!select) return;
        const normalized = String(value ?? '');
        if (normalized && !Array.from(select.options).some(option => option.value === normalized)) {
            const option = document.createElement('option');
            option.value = normalized;
            option.textContent = normalized;
            option.dataset.legacyValue = 'true';
            select.appendChild(option);
        }
        select.value = normalized;
    }

    function clearLegacySelectOptions() {
        document.querySelectorAll('option[data-legacy-value="true"]').forEach(option => option.remove());
    }

    const volumeUnits = { m2:'м²', pack:'уп.', piece:'шт.' };
    function formatVolumeValue(quantity, unit) {
        const amount = Number(String(quantity).replace(',', '.'));
        if (!Number.isFinite(amount) || !volumeUnits[unit]) return '';
        return `${new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(amount)} ${volumeUnits[unit]}`;
    }

    function syncVolumeField(prefix) {
        const quantity = document.getElementById(`r_${prefix}_quantity`);
        const unit = document.getElementById(`r_${prefix}_unit`);
        const legacy = document.getElementById(`r_${prefix}_legacy`);
        const output = document.getElementById(`r_${prefix}_volume`);
        const hasQuantity = String(quantity.value || '').trim() !== '';
        if (hasQuantity) {
            output.value = formatVolumeValue(quantity.value, unit.value);
            legacy.value = '';
            legacy.classList.add('d-none');
        } else {
            output.value = legacy.value.trim();
        }
    }

    function parseVolumeText(value) {
        const match = String(value || '').trim().match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
        if (!match || !match[2]) return null;
        const suffix = match[2].trim().toLowerCase();
        let unit = '';
        if (/^(?:м(?:²|2)|кв\.?\s*м(?:етр(?:а|ов)?)?\.?)$/i.test(suffix)) unit = 'm2';
        else if (/^(?:уп\.?|упаков(?:ка|ки|ок)?|пач(?:ка|ки|ек)?|короб(?:ка|ки|ок)?)$/i.test(suffix)) unit = 'pack';
        else if (/^(?:шт\.?|штук(?:а|и)?|планк(?:а|и|у|и))$/i.test(suffix)) unit = 'piece';
        if (!unit) return null;
        return { quantity:match[1].replace(',', '.'), unit };
    }

    function setVolumeField(prefix, rawValue, quantityValue, unitValue) {
        const quantity = document.getElementById(`r_${prefix}_quantity`);
        const unit = document.getElementById(`r_${prefix}_unit`);
        const legacy = document.getElementById(`r_${prefix}_legacy`);
        const storedQuantity = quantityValue !== undefined && quantityValue !== null && quantityValue !== '' ? Number(quantityValue) : NaN;
        const parsed = Number.isFinite(storedQuantity) && volumeUnits[unitValue] ? {quantity:String(storedQuantity),unit:unitValue} : parseVolumeText(rawValue);
        quantity.value = '';
        legacy.value = '';
        legacy.classList.add('d-none');
        if (parsed) {
            quantity.value = parsed.quantity;
            unit.value = parsed.unit;
        } else if (String(rawValue || '').trim()) {
            legacy.value = String(rawValue);
            legacy.classList.remove('d-none');
        }
        syncVolumeField(prefix);
    }

    function resetVolumeField(prefix) {
        document.getElementById(`r_${prefix}_quantity`).value = '';
        document.getElementById(`r_${prefix}_unit`).value = 'm2';
        const legacy = document.getElementById(`r_${prefix}_legacy`);
        legacy.value = '';
        legacy.classList.add('d-none');
        syncVolumeField(prefix);
    }

    function setupVolumeControls() {
        ['purchased','defect'].forEach(prefix => {
            ['quantity','unit','legacy'].forEach(part => {
                document.getElementById(`r_${prefix}_${part}`)?.addEventListener('input', () => syncVolumeField(prefix));
                document.getElementById(`r_${prefix}_${part}`)?.addEventListener('change', () => syncVolumeField(prefix));
            });
        });
    }

    window.addBatchInput = function() {
        const container = document.getElementById('batch-list');
        container.insertAdjacentHTML('beforeend', `<input type="text" class="form-control form-control-sm batch-input mt-1" placeholder="Номер партии">`);
    };

    window.openAddModal = async () => {
        if (!canManageReclamations) return;
        if (referenceDataPromise) await referenceDataPromise;
        form.reset();
        resetVolumeField('purchased');
        resetVolumeField('defect');
        clearLegacySelectOptions();
        document.getElementById('r_id').value = ''; 
        document.getElementById('add-modal-title').textContent = 'Оформление рекламации';
        document.getElementById('r_date').value = localDateInputValue();
        document.getElementById('r_status').value = 'new';
        document.getElementById('r_assigned_to').value = String(window.CRMAuth?.user?.fullName || window.CRMAuth?.user?.username || '');
        document.getElementById('rec-tech-details').open = false;
        uploadedPhotos = [];
        renderPhotoPreviews();
        document.getElementById('batch-list').innerHTML = `<input type="text" class="form-control form-control-sm batch-input" placeholder="Номер партии">`;
        resetFieldShortcutState();
        addModal.show();
    };

    window.openEditModal = async () => {
        if (!canManageReclamations) return;
        if (referenceDataPromise) await referenceDataPromise;
        if(!currentViewId) return;
        let r;
        try {
            const response=await fetch('/api/reclamations/'+encodeURIComponent(currentViewId));
            if(!response.ok)throw Error('Не удалось загрузить оригиналы вложений для редактирования');
            r=await response.json();
        }catch(error){window.CRMUI?.toast?.(error.message,'error');return;}

        viewModal.hide(); 
        document.getElementById('r_id').value = r.id; 
        document.getElementById('add-modal-title').textContent = 'Редактирование рекламации';
        
        clearLegacySelectOptions();
        const dealerSelect = document.getElementById('r_dealer');
        if (r.dealerId && !Array.from(dealerSelect.options).some(option => option.value === String(r.dealerId))) {
            const option = document.createElement('option');
            option.value = String(r.dealerId);
            option.textContent = `${r.dealerName || 'Дилер из старой рекламации'} · архивная запись`;
            option.dataset.legacyValue = 'true';
            dealerSelect.appendChild(option);
        }
        dealerSelect.value = r.dealerId || '';
        document.getElementById('r_date').value = r.date || '';
        document.getElementById('r_product').value = r.productName || '';
        document.getElementById('r_invoice').value = r.invoiceNumber || '';
        document.getElementById('r_purchase_date').value = r.purchaseDate || '';
        
        document.getElementById('r_client_name').value = r.clientName || '';
        document.getElementById('r_client_phone').value = r.clientPhone || '';
        document.getElementById('r_address').value = r.address || '';
        document.getElementById('r_floor').value = r.floor || '';
        document.getElementById('r_house_type').value = r.houseType || '';
        document.getElementById('r_total_area').value = r.totalArea || '';
        setVolumeField('purchased', r.purchasedVolume, r.purchasedQuantity, r.purchasedUnit);
        setVolumeField('defect', r.defectVolume, r.defectQuantity, r.defectUnit);
        
        document.getElementById('r_base_type').value = r.baseType || '';
        document.getElementById('r_underlayment').value = r.underlayment || '';
        document.getElementById('r_warm_floor').value = r.warmFloor || '';
        document.getElementById('r_installer').value = r.installer || '';
        
        document.getElementById('r_acclimatization').value = r.acclimatization || '';
        document.getElementById('r_storage').value = r.storageMethod || '';
        document.getElementById('r_drying_time').value = r.dryingTime || '';
        document.getElementById('r_floor_flatness').value = r.floorFlatness || '';

        setSelectValue('r_defect_moment', r.defectMoment || '');
        document.getElementById('r_description').value = r.description || '';
        setSelectValue('r_client_demand', r.clientDemand || '');
        document.getElementById('r_claimant_type').value = r.claimantType || 'dealer';
        document.getElementById('r_problem_type').value = r.problemType || 'legacy';
        document.getElementById('r_status').value = getStatusCode(r);
        document.getElementById('r_assigned_to').value = r.assignedToName || '';
        document.getElementById('r_due_date').value = r.dueDate || '';
        document.getElementById('r_next_action').value = r.nextAction || '';
        document.getElementById('r_waiting_for').value = r.waitingFor || '';
        document.getElementById('r_confirmed_cause').value = r.confirmedCause || '';
        document.getElementById('r_cause_confidence').value = r.causeConfidence || 'unknown';
        document.getElementById('r_inspected_date').value = r.inspectedDate || '';
        
        document.getElementById('r_resolution').value = r.resolution || '';
        document.getElementById('r_decision_type').value = r.decisionType || '';
        document.getElementById('r_compensation_amount').value = r.compensationAmount || '';
        document.getElementById('r_internal_notes').value = r.internalNotes || '';
        document.getElementById('rec-tech-details').open = Boolean(r.baseType || r.underlayment || r.warmFloor || r.installer || r.acclimatization || r.storageMethod || r.dryingTime || r.floorFlatness || r.confirmedCause);

        const batchContainer = document.getElementById('batch-list');
        batchContainer.innerHTML = '';
        if(r.batchNumbers && r.batchNumbers.length > 0) {
            r.batchNumbers.forEach(bn => {
                const input = document.createElement('input');
                input.type = 'text'; input.className = 'form-control form-control-sm batch-input mt-1'; input.value = bn;
                batchContainer.appendChild(input);
            });
        } else {
            batchContainer.innerHTML = `<input type="text" class="form-control form-control-sm batch-input" placeholder="Номер партии">`;
        }

        // Подгружаем медиа (проверяем, видео ли это)
        uploadedPhotos = (r.photos || []).map(p => ({
            photo_url: p.photo_url,
            isVideo: p.photo_url.startsWith('data:video')
        }));
        renderPhotoPreviews();
        resetFieldShortcutState();
        addModal.show();
    };

    // --- ПОДДЕРЖКА ФОТО И ВИДЕО ---
    const compressImage = (file, maxWidth = 1000, quality = 0.7) => new Promise((resolve, reject) => { 
        const reader = new FileReader(); reader.readAsDataURL(file); 
        reader.onload = event => { 
            const img = new Image(); img.src = event.target.result; 
            img.onload = () => { 
                const elem = document.createElement('canvas'); 
                let width = img.width; let height = img.height; 
                if (width > maxWidth) { height *= maxWidth / width; width = maxWidth; } 
                elem.width = width; elem.height = height; 
                const ctx = elem.getContext('2d'); ctx.drawImage(img, 0, 0, width, height); 
                resolve(elem.toDataURL('image/jpeg', quality)); 
            }; 
        }; 
    });

    // Чтение видео (без сжатия, конвертация в Base64)
    const readVideo = (file) => new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.readAsDataURL(file);
    });

    function setupPhotoUpload() {
        const mediaInput = document.getElementById('r_photos');
        const cameraInput = document.getElementById('r_camera');

        async function handleFiles(input) {
            const files = [...(input?.files || [])];
            for (const file of files) {
                if (file.type.startsWith('image/')) {
                    const base64 = await compressImage(file, 1000, 0.72);
                    uploadedPhotos.push({ photo_url: base64, isVideo: false });
                } else if (file.type.startsWith('video/')) {
                    if (file.size > 8 * 1024 * 1024) {
                        alert(`Видео "${file.name}" слишком большое. Максимальный размер 8 МБ.`);
                        continue;
                    }
                    const base64 = await readVideo(file);
                    uploadedPhotos.push({ photo_url: base64, isVideo: true });
                }
            }
            renderPhotoPreviews();
            if (input) input.value = '';
        }

        mediaInput?.addEventListener('change', () => handleFiles(mediaInput));
        cameraInput?.addEventListener('change', () => handleFiles(cameraInput));
    }

    function renderPhotoPreviews() {
        const container = document.getElementById('r_photos_preview');
        container.innerHTML = uploadedPhotos.map((p, index) => {
            const mediaHtml = p.isVideo 
                ? `<video src="${p.photo_url}#t=0.1" preload="metadata"></video><i class="bi bi-play-circle play-icon-overlay"></i>`
                : `<img src="${p.photo_url}">`;
            
            return `
            <div class="photo-preview-item">
                ${mediaHtml}
                <button type="button" class="btn-remove-photo" onclick="removePhoto(${index})"><i class="bi bi-x"></i></button>
            </div>`;
        }).join('');
    }
    window.removePhoto = (index) => {
        if (!canManageReclamations) return;
        uploadedPhotos.splice(index, 1);
        renderPhotoPreviews();
    };

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!canManageReclamations) return;
        const btn = document.getElementById('btn-save');
        btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';

        const id = document.getElementById('r_id').value; 
        const dealerSelect = document.getElementById('r_dealer');
        const dealerName = dealerSelect.options[dealerSelect.selectedIndex].text.split(' (')[0];
        const batchInputs = Array.from(document.querySelectorAll('.batch-input')).map(i => i.value.trim()).filter(Boolean);
        const decisionType = document.getElementById('r_decision_type').value;
        const resolution = document.getElementById('r_resolution').value.trim();
        const selectedStatus = document.getElementById('r_status').value;
        syncVolumeField('purchased');
        syncVolumeField('defect');

        if (selectedStatus === 'closed' && !decisionType && !resolution) {
            if (window.CRMUI?.toast) CRMUI.toast('Чтобы закрыть рекламацию, укажите результат рассмотрения или текст решения.','error');
            btn.disabled = false;
            btn.innerHTML = '<i class="bi bi-check-lg"></i><span>Сохранить рекламацию</span>';
            document.getElementById('r_decision_type').focus();
            document.getElementById('rec-section-resolution').scrollIntoView({behavior:'smooth',block:'start'});
            return;
        }

        // Формируем чистый массив фото для базы (сервер ждет { photo_url: '...' })
        const dbPhotos = uploadedPhotos.map(p => ({ photo_url: p.photo_url }));

        const data = {
            dealerId: dealerSelect.value,
            dealerName: dealerName,
            date: document.getElementById('r_date').value,
            productName: document.getElementById('r_product').value,
            invoiceNumber: document.getElementById('r_invoice').value,
            purchaseDate: document.getElementById('r_purchase_date').value,
            
            clientName: document.getElementById('r_client_name').value,
            clientPhone: document.getElementById('r_client_phone').value,
            address: document.getElementById('r_address').value,
            floor: document.getElementById('r_floor').value,
            houseType: document.getElementById('r_house_type').value,
            totalArea: document.getElementById('r_total_area').value,
            purchasedVolume: document.getElementById('r_purchased_volume').value,
            purchasedQuantity: String(document.getElementById('r_purchased_quantity').value || '').trim() ? Number(String(document.getElementById('r_purchased_quantity').value).replace(',', '.')) : null,
            purchasedUnit: String(document.getElementById('r_purchased_quantity').value || '').trim() ? document.getElementById('r_purchased_unit').value : '',
            defectQuantity: String(document.getElementById('r_defect_quantity').value || '').trim() ? Number(String(document.getElementById('r_defect_quantity').value).replace(',', '.')) : null,
            defectUnit: String(document.getElementById('r_defect_quantity').value || '').trim() ? document.getElementById('r_defect_unit').value : '',
            
            baseType: document.getElementById('r_base_type').value,
            underlayment: document.getElementById('r_underlayment').value,
            warmFloor: document.getElementById('r_warm_floor').value,
            installer: document.getElementById('r_installer').value,
            batchNumbers: batchInputs,
            
            acclimatization: document.getElementById('r_acclimatization').value,
            storageMethod: document.getElementById('r_storage').value,
            dryingTime: document.getElementById('r_drying_time').value,
            floorFlatness: document.getElementById('r_floor_flatness').value,

            defectMoment: document.getElementById('r_defect_moment').value,
            defectVolume: document.getElementById('r_defect_volume').value,
            description: document.getElementById('r_description').value,
            clientDemand: document.getElementById('r_client_demand').value,
            claimantType: document.getElementById('r_claimant_type').value,
            problemType: document.getElementById('r_problem_type').value,
            status: selectedStatus,
            assignedToName: document.getElementById('r_assigned_to').value.trim(),
            nextAction: document.getElementById('r_next_action').value.trim(),
            dueDate: document.getElementById('r_due_date').value,
            waitingFor: document.getElementById('r_waiting_for').value,
            confirmedCause: document.getElementById('r_confirmed_cause').value.trim(),
            causeConfidence: document.getElementById('r_cause_confidence').value,
            inspectedDate: document.getElementById('r_inspected_date').value,
            
            resolution,
            decisionType,
            compensationAmount: parseFloat(document.getElementById('r_compensation_amount').value) || 0,
            internalNotes: document.getElementById('r_internal_notes').value,

            photos: dbPhotos
        };

        const method = id ? 'PUT' : 'POST';
        const url = id ? `/api/reclamations/${encodeURIComponent(id)}` : '/api/reclamations';

        try {
            const res = await fetch(url, { method: method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) });
            if(res.ok) {
                await fetchReclamations();
                renderList();
                addModal.hide();
            } else {
                const payload = await res.json().catch(() => ({}));
                throw new Error(payload.error || 'Не удалось сохранить рекламацию. Проверьте размер вложений и обязательные поля.');
            }
        } catch(err) {
            if (window.CRMUI?.toast) CRMUI.toast(err.message,'error');
            else alert(err.message);
        }
        finally { btn.disabled = false; btn.innerHTML = '<i class="bi bi-check-lg"></i><span>Сохранить рекламацию</span>'; }
    });

    // --- ПРОСМОТР НА ВЕСЬ ЭКРАН ---
    window.openReclamationMedia = async index => {
        const id=currentViewId,details=reclamationDetailCache.get(id),photo=details?.photos?.find((p,i)=>(p.originalIndex??i)===index);
        try {
            const url='/api/reclamations/'+encodeURIComponent(id)+'/photos/'+index+(photo?.originalVersion?'?v='+encodeURIComponent(photo.originalVersion):'');
            const response=await fetch(url,{crmTrackLoading:false});
            if(!response.ok)throw Error('Не удалось открыть оригинал. Обновите рекламацию и повторите.');
            const original=await response.json();if(id!==currentViewId)return;
            const value=String(original.photo_url||'');
            openFullscreen(value,/^data:video\/|\.(mp4|webm|mov)(?:\?|$)/i.test(value));
        }catch(error){if(window.CRMUI?.toast)CRMUI.toast(error.message,'error');else alert(error.message);}
    };
    window.openFullscreen = (url, isVideo) => {
        const viewer = document.getElementById('fullscreen-viewer');
        if (isVideo) {
            viewer.innerHTML = `<video src="${url}" controls autoplay style="max-width:100%; max-height:90vh; border-radius:8px;"></video>`;
        } else {
            viewer.innerHTML = `<img src="${url}" style="max-width:100%; max-height:90vh; object-fit:contain; border-radius:8px;">`;
        }
        fullscreenModal.show();
    };

    window.viewReclamation = async (id) => {
        const summary = allReclamations.find(x => x.id === id);
        if(!summary) return;
        currentViewId = id;

        const sortedAll = [...allReclamations].sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
        const absIndex = sortedAll.findIndex(x => x.id === id);
        const seqNumStr = `№${String(absIndex + 1).padStart(3, '0')} - `;

        document.getElementById('v_title').textContent = `Акт ${seqNumStr}${summary.dealerName}`;
        document.getElementById('view-body').innerHTML = '<div class="text-center text-muted py-5"><span class="spinner-border spinner-border-sm me-2"></span>Загрузка акта...</div>';
        viewModal.show();

        let r = reclamationDetailCache.get(id);
        if (!r) {
            try {
                const res = await fetch(`/api/reclamations/${id}?view=preview`);
                if (!res.ok) throw new Error('Не удалось загрузить рекламацию');
                r = await res.json();
                reclamationDetailCache.set(id, r);

                const listIndex = allReclamations.findIndex(x => x.id === id);
                if (listIndex >= 0) {
                    allReclamations[listIndex] = {
                        ...summary,
                        ...r,
                        photoCount: summary.photoCount ?? (r.photos ? r.photos.length : 0)
                    };
                }
            } catch (error) {
                document.getElementById('view-body').innerHTML = `<div class="alert alert-danger mb-0">${error.message}</div>`;
                return;
            }
        }
        
        let photosHtml = '';
        if(r.photos && r.photos.length > 0) {
            const mediaItems = r.photos.map(p => {
                const isVid = p.isVideo || p.photo_url.startsWith('data:video');
                const inner = isVid 
                    ? `<span style="color:white;font-size:12px">Видео</span><i class="bi bi-play-circle play-icon-overlay"></i>`
                    : `<img src="${p.photo_url}" style="width: 100px; height: 100px; object-fit: cover;">`;
                
                return `
                <div class="photo-preview-item cursor-pointer" onclick="openReclamationMedia(${p.originalIndex??r.photos.indexOf(p)})" style="cursor: pointer; border-radius: 8px; overflow: hidden; border: 1px solid #ccc; position: relative; width: 100px; height: 100px; display: flex; align-items: center; justify-content: center; background: #000;">
                    ${inner}
                </div>`;
            }).join('');

            photosHtml = `<div class="mt-3 border-top pt-3"><h6 class="fw-bold">Прикрепленные медиа:</h6><div class="d-flex flex-wrap gap-2">${mediaItems}</div></div>`;
        }

        const pDate = r.purchaseDate ? new Date(r.purchaseDate).toLocaleDateString('ru-RU') : '-';
        const statusCode = getStatusCode(r);
        const statusText = reclamationStatuses[statusCode] || 'В работе';
        const legacyResolutionNote = !r.status && String(r.resolution || '').trim()
            ? '<div class="rec-legacy-status-note"><i class="bi bi-info-circle"></i> В старой записи есть текст решения. Этап «Закрыта» не назначен автоматически — проверьте и подтвердите его вручную.</div>'
            : '';
        const historyHtml = (Array.isArray(r.statusHistory) ? r.statusHistory : []).slice().reverse().map(entry => `
            <li><span>${escapeHtml(reclamationStatuses[entry.status] || entry.status || 'Обновление')}</span><small>${escapeHtml(entry.byName || 'Сотрудник')} · ${escapeHtml(entry.at ? new Date(entry.at).toLocaleString('ru-RU') : 'дата не указана')}</small></li>
        `).join('');
        const nextActionHtml = r.nextAction
            ? `<div class="rec-view-next"><strong>Следующее действие</strong><span>${escapeHtml(r.nextAction)}</span></div>`
            : (!isResolved(r) ? '<div class="rec-view-next is-missing"><strong>Следующее действие не назначено</strong><span>Добавьте конкретный шаг и дату, чтобы не потерять обращение.</span></div>' : '');
        const workflowHtml = `<div class="card rec-view-workflow mb-3"><div class="card-body p-3">
            <div class="d-flex flex-wrap align-items-center justify-content-between gap-2"><span class="rec-status is-${statusCode} ${isOverdue(r)?'is-overdue':''}">${escapeHtml(statusText)}</span><span class="small text-muted">${r.assignedToName ? `Ответственный: <b>${escapeHtml(r.assignedToName)}</b>` : 'Ответственный не назначен'}${r.dueDate ? ` · Следующий шаг до <b>${escapeHtml(formatRecDate(r.dueDate))}</b>` : ''}</span></div>
            ${legacyResolutionNote}${nextActionHtml}${historyHtml ? `<details class="rec-status-history mt-3"><summary>История статусов (${(r.statusHistory || []).length})</summary><ol>${historyHtml}</ol></details>` : ''}
        </div></div>`;
        const claimantLabel = r.claimantType === 'customer' ? 'Конечный клиент' : 'Дилер';
        const problemTypeLabel = problemTypeLabels[r.problemType] || r.problemType || 'Не указано';
        const causeConfidenceLabel = r.causeConfidence === 'confirmed' ? 'Подтверждено проверкой' : r.causeConfidence === 'possible' ? 'Предположение' : 'Не проверено';

        document.getElementById('view-body').innerHTML = `
            ${workflowHtml}
            <div class="card border-0 mb-3"><div class="card-body p-3">
                <p class="mb-1 small text-muted">Товар / Артикул</p>
                <h5 class="fw-bold text-dark">${escapeHtml(r.productName || '—')}</h5>
                <div class="d-flex gap-4 mt-3">
                    <div><small class="text-muted d-block">Куплено:</small><span class="fw-bold fs-6">${escapeHtml(r.purchasedVolume || '-')}</span></div>
                    <div><small class="text-danger d-block">Брак заявлен:</small><span class="fw-bold fs-6 text-danger">${escapeHtml(r.defectVolume || '-')}</span></div>
                    <div><small class="text-muted d-block">Площадь объекта:</small><span class="fw-bold fs-6">${escapeHtml(r.totalArea || '-')}</span></div>
                </div>
            </div></div>

            <div class="card border-0 mb-3"><div class="card-body p-3">
                <h6 class="fw-bold border-bottom pb-2 mb-2 text-brand">Данные покупки и клиент</h6>
                <div class="row g-2 small">
                    <div class="col-6"><span class="text-muted">Накладная:</span> <br><b>${escapeHtml(r.invoiceNumber || '-')}</b></div>
                    <div class="col-6"><span class="text-muted">Дата покупки:</span> <br><b>${pDate}</b></div>
                    <div class="col-12 mt-2"><span class="text-muted">Обратился:</span> <b>${escapeHtml(claimantLabel)}</b></div>
                    <div class="col-12"><span class="text-muted">Клиент:</span> <b>${escapeHtml(r.clientName || '-')}</b> ${r.clientPhone ? `(${escapeHtml(r.clientPhone)})` : ''}</div>
                    <div class="col-12"><span class="text-muted">Адрес:</span> <b>${escapeHtml(r.address || '-')}</b> ${r.floor ? `, этаж ${escapeHtml(r.floor)}` : ''}</div>
                </div>
            </div></div>

            <div class="card border-0 mb-3"><div class="card-body p-3">
                <h6 class="fw-bold border-bottom pb-2 mb-2 text-brand">Технические данные</h6>
                <div class="row g-2 small">
                    <div class="col-6"><span class="text-muted">Тип дома:</span> <br><b>${escapeHtml(r.houseType || '-')}</b></div>
                    <div class="col-6"><span class="text-muted">Монтаж:</span> <br><b>${escapeHtml(r.installer || '-')}</b></div>
                    <div class="col-6"><span class="text-muted">Основание:</span> <br><b>${escapeHtml(r.baseType || '-')}</b></div>
                    <div class="col-6"><span class="text-muted">Теплый пол:</span> <br><b class="${r.warmFloor && r.warmFloor !== 'Нет' ? 'text-danger' : ''}">${escapeHtml(r.warmFloor || '-')}</b></div>
                    
                    <div class="col-6"><span class="text-muted">Сушка пола:</span> <br><b>${escapeHtml(r.dryingTime || '-')}</b></div>
                    <div class="col-6"><span class="text-muted">Ровность (Перепад):</span> <br><b>${escapeHtml(r.floorFlatness || '-')}</b></div>
                    <div class="col-6"><span class="text-muted">Акклиматизация:</span> <br><b>${escapeHtml(r.acclimatization || '-')}</b></div>
                    <div class="col-6"><span class="text-muted">Способ хранения:</span> <br><b class="${r.storageMethod === 'Вертикально (Запрещено)' ? 'text-danger' : ''}">${escapeHtml(r.storageMethod || '-')}</b></div>

                    <div class="col-12"><span class="text-muted">Подложка:</span> <b>${escapeHtml(r.underlayment || '-')}</b></div>
                    <div class="col-12"><span class="text-muted">Партии:</span> <b>${escapeHtml((r.batchNumbers||[]).join(', ') || '-')}</b></div>
                </div>
            </div></div>

            <div class="card border-0 mb-3"><div class="card-body p-3">
                <h6 class="fw-bold border-bottom pb-2 mb-2 text-brand">Суть проблемы</h6>
                <p class="small text-muted mb-1">Категория: <b>${escapeHtml(problemTypeLabel)}</b> · Выявлено: <b>${escapeHtml(r.defectMoment || '-')}</b></p>
                <p class="small mb-2">${escapeHtml(r.description || 'Описание не заполнено')}</p>
                <div class="p-2 bg-light rounded text-dark small fw-bold mb-2">Требование: ${escapeHtml(r.clientDemand || '-')}</div>
                ${r.confirmedCause ? `<div class="rec-cause-note"><small>Вывод проверки · ${escapeHtml(causeConfidenceLabel)}</small><p>${escapeHtml(r.confirmedCause)}</p></div>` : ''}
            </div></div>

            ${canManageReclamations && r.internalNotes ? `
            <div class="card border-0 mb-3" style="background-color: #fff3cd; border-left: 4px solid #ffc107 !important;">
                <div class="card-body p-3">
                    <h6 class="fw-bold text-warning-emphasis mb-1"><i class="bi bi-lock-fill"></i> Служебные заметки</h6>
                    <p class="small mb-0 text-dark">${escapeHtml(r.internalNotes)}</p>
                </div>
            </div>` : ''}

            <div class="card border-0 mb-3" style="background-color: #f8f9fa; border-left: 4px solid #198754 !important;">
                <div class="card-body p-3">
                    <div class="d-flex justify-content-between align-items-start">
                        <h6 class="fw-bold text-success mb-2">Принятое решение</h6>
                        ${r.compensationAmount ? `<span class="badge bg-success fs-6">${escapeHtml(r.compensationAmount)} ₸</span>` : ''}
                    </div>
                    ${r.decisionType ? `<p class="small text-muted mb-1">Результат: ${escapeHtml(decisionTypeLabels[r.decisionType] || r.decisionType)}</p>` : ''}
                    <p class="small mb-0 text-dark fw-medium">${r.resolution ? escapeHtml(r.resolution) : '<span class="text-muted fw-normal fst-italic">Решение еще не заполнено...</span>'}</p>
                </div>
            </div>

            ${photosHtml}
        `;
        viewModal.show();
    };

    // Остановка видео при закрытии полноэкранного окна
    document.getElementById('fullscreen-modal').addEventListener('hidden.bs.modal', function () {
        document.getElementById('fullscreen-viewer').innerHTML = '';
    });

    window.deleteCurrentReclamation = async () => {
        if (!canManageReclamations) return;
        if(!currentViewId) return;
        if(!confirm("Удалить эту рекламацию навсегда?")) return;
        try {
            const response = await fetch(`/api/reclamations/${encodeURIComponent(currentViewId)}`, { method: 'DELETE' });
            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data.error || 'Не удалось удалить рекламацию');
            }
            viewModal.hide();
            await fetchReclamations();
            renderList();
        } catch(e) { alert(e.message || "Ошибка удаления"); }
    };

    // ==========================================
    // ЛОГИКА ПЕЧАТИ
    // ==========================================
    function generatePrintHTML(data) {
        const d = data || {};
        const hasValue = value => value !== undefined && value !== null && String(value).trim() !== '';
        const field = (label, value, span) => {
            const present = hasValue(value);
            const content = present ? escapeHtml(String(value)) : '&nbsp;';
            return '<div class="print-field print-span-' + (span || 6) + '">' +
                '<div class="print-field-label">' + label + '</div>' +
                '<div class="print-field-value' + (present ? '' : ' is-empty') + '">' + content + '</div>' +
            '</div>';
        };
        const writingArea = (label, value, sizeClass) => {
            const content = hasValue(value) ? escapeHtml(String(value)) : '';
            return '<div class="print-writing-field ' + (sizeClass || '') + '">' +
                '<div class="print-field-label">' + label + '</div>' +
                '<div class="print-writing-area">' + content + '</div>' +
            '</div>';
        };
        const sectionTitle = (number, title) =>
            '<div class="print-section-title"><span>' + String(number).padStart(2, '0') + '</span><strong>' + title + '</strong></div>';

        let seqNumStr = '______';
        if (d.id && allReclamations.length > 0) {
            const sortedAll = [...allReclamations].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
            const idx = sortedAll.findIndex(x => x.id === d.id);
            if (idx !== -1) seqNumStr = String(idx + 1).padStart(3, '0');
        }

        const formattedDate = hasValue(d.date) ? new Date(d.date).toLocaleDateString('ru-RU') : '';
        const purchaseDate = hasValue(d.purchaseDate) ? new Date(d.purchaseDate).toLocaleDateString('ru-RU') : '';
        const batchNumbers = Array.isArray(d.batchNumbers) ? d.batchNumbers.join(', ') : (d.batchNumbers || '');
        const totalArea = hasValue(d.totalArea) ? String(d.totalArea) + ' м²' : '';
        const claimantLabel = d.claimantType === 'customer' ? 'Конечный клиент' : 'Дилер';
        const issueLabel = problemTypeLabels[d.problemType] || d.problemType || '';

        return [
            '<div class="print-document">',
                '<div class="print-top-accent"></div>',
                '<header class="print-brand-header">',
                    '<div class="print-brand-lockup">',
                        '<img class="print-brand-logo" src="logo.png" alt="IDEAL FLOOR">',
                        '<div class="print-brand-copy"><strong>КОНТРОЛЬ КАЧЕСТВА</strong><small>Документ по качеству товара</small></div>',
                    '</div>',
                    '<div class="print-document-mark"><span>IDEAL FLOOR CRM</span><strong>СЕРВИСНЫЙ ДОКУМЕНТ</strong></div>',
                '</header>',
                '<div class="print-title-row">',
                    '<div class="print-title-copy"><div class="print-eyebrow">ФИКСАЦИЯ ОБРАЩЕНИЯ</div><h1>Акт рекламации</h1><p>Претензия по качеству товара</p></div>',
                    '<div class="print-number"><small>Номер акта</small><strong>№ ' + seqNumStr + '</strong></div>',
                '</div>',
                '<div class="print-fields print-meta-grid">',
                    field('Дата составления', formattedDate, 4),
                    field('Дилер / магазин', d.dealerName, 8),
                '</div>',

                '<section class="print-section">',
                    sectionTitle(1, 'Товар и поставка'),
                    '<div class="print-fields">',
                        field('Наименование товара / артикул', d.productName, 12),
                        field('Номер накладной', d.invoiceNumber, 4),
                        field('Дата покупки', purchaseDate, 4),
                        field('Номера партий', batchNumbers, 4),
                    '</div>',
                '</section>',

                '<section class="print-section">',
                    sectionTitle(2, 'Клиент и объект'),
                    '<div class="print-fields">',
                        field('ФИО клиента', d.clientName, 5),
                        field('Телефон', d.clientPhone, 3),
                        field('Кто обратился', claimantLabel, 4),
                        field('Адрес объекта', d.address, 12),
                        field('Тип помещения', d.houseType, 4),
                        field('Этаж', d.floor, 2),
                        field('Площадь помещения', totalArea, 3),
                        field('Купленный объём', d.purchasedVolume, 3),
                    '</div>',
                '</section>',

                '<section class="print-section">',
                    sectionTitle(3, 'Условия монтажа'),
                    '<div class="print-fields">',
                        field('Тип основания', d.baseType, 6),
                        field('Время сушки пола', d.dryingTime, 6),
                        field('Ровность пола · перепад на 1 м', d.floorFlatness, 6),
                        field('Акклиматизация', d.acclimatization, 6),
                        field('Хранение до укладки', d.storageMethod, 6),
                        field('Подложка', d.underlayment, 6),
                        field('Система «тёплый пол»', d.warmFloor, 4),
                        field('Кто производил монтаж', d.installer, 8),
                    '</div>',
                '</section>',

                '<section class="print-section">',
                    sectionTitle(4, 'Дефект и требование клиента'),
                    '<div class="print-fields">',
                        field('Тип дефекта', issueLabel, 6),
                        field('Когда выявлен дефект', d.defectMoment, 6),
                        field('Объём заявленного брака', d.defectVolume, 6),
                    '</div>',
                    writingArea('Подробное описание проблемы', d.description, 'print-writing-large'),
                    field('Требование клиента', d.clientDemand, 12),
                '</section>',

                '<section class="print-section">',
                    sectionTitle(5, 'Решение по рекламации'),
                    writingArea('Решение / комментарий', d.resolution, 'print-writing-medium'),
                '</section>',

                '<div class="print-signatures">',
                    '<div class="print-signature"><div class="print-signature-line"></div><div class="print-signature-label">Подпись клиента · ФИО</div><div class="print-signature-date">Дата: __________________</div></div>',
                    '<div class="print-signature"><div class="print-signature-line"></div><div class="print-signature-label">Представитель дилера · ФИО</div><div class="print-signature-date">Дата: __________________</div></div>',
                '</div>',
                '<footer class="print-footer"><span>IDEAL FLOOR · Акт рекламации</span><span>№ ' + seqNumStr + '</span></footer>',
            '</div>'
        ].join('\n');
    }

    window.printBlankForm = () => {
        const area = document.getElementById('printable-area');
        area.innerHTML = generatePrintHTML(null);
        document.body.classList.add('printing');
        window.print();
        document.body.classList.remove('printing');
    };

    window.printFilledForm = () => {
        if(!currentViewId) return;
        const r = allReclamations.find(x => x.id === currentViewId);
        if(!r) return;

        const area = document.getElementById('printable-area');
        area.innerHTML = generatePrintHTML(r);
        document.body.classList.add('printing');
        window.print();
        document.body.classList.remove('printing');
    };
});

