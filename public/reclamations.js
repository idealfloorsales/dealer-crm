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

        document.getElementById('r_date').value = new Date().toISOString().slice(0, 10);

        referenceDataPromise = Promise.allSettled([
            fetchDealers(),
            fetchProducts()
        ]);

        await fetchReclamations();
        renderList();
        setupPhotoUpload();
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

    function isResolved(item) {
        return Boolean(String(item?.resolution || '').trim());
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
            if (status === 'open' && isResolved(r)) return false;
            if (status === 'resolved' && !isResolved(r)) return false;
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
        const recent = allReclamations.filter(r => daysSince(r.createdAt || r.date) <= 30).length;

        const cleanSearch = !normalize(searchInput?.value) && !dealerFilter?.value;
        const cards = [
            {key:'all',icon:'bi-collection',label:'Всего',value:total,foot:'в реестре',tone:'',active:cleanSearch && statusFilter?.value==='all' && mediaFilter?.value==='all' && dateFilterMode==='all'},
            {key:'open',icon:'bi-hourglass-split',label:'В работе',value:open,foot:'без решения',tone:open?'warn':'',active:statusFilter?.value==='open' && dateFilterMode==='all'},
            {key:'resolved',icon:'bi-check2-circle',label:'Решено',value:resolved,foot:'закрытые обращения',tone:'good',active:statusFilter?.value==='resolved' && dateFilterMode==='all'},
            {key:'without-media',icon:'bi-camera',label:'Без фото',value:withoutMedia,foot:'нужно проверить',tone:withoutMedia?'risk':'',active:mediaFilter?.value==='without' && dateFilterMode==='all'},
            {key:'recent',icon:'bi-calendar3',label:'За 30 дней',value:recent,foot:'новые обращения',tone:'',active:dateFilterMode==='recent'}
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
                if (statusFilter) statusFilter.value = key === 'open' ? 'open' : key === 'resolved' ? 'resolved' : 'all';
                if (mediaFilter) mediaFilter.value = key === 'without-media' ? 'without' : 'all';
                dateFilterMode = key === 'recent' ? 'recent' : 'all';
                renderList();
            });
        });
    }

    function renderFilterMeta(filtered) {
        const parts = [];
        const status = statusFilter?.value || 'all';
        const media = mediaFilter?.value || 'all';
        if (status === 'open') parts.push('В работе');
        else if (status === 'resolved') parts.push('Решено');
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
            const seq = sequenceMap.get(String(r.id)) || 0;
            const age = daysSince(r.createdAt || r.date);
            const ageText = !resolved && age > 0 ? `${age} дн. в работе` : dateStr;
            const product = r.productName || 'Товар не указан';
            const description = r.description || 'Описание не заполнено';
            const purchased = r.purchasedVolume || '—';
            const defect = r.defectVolume || '—';
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
                        <span class="rec-status ${resolved?'is-resolved':''}"><i class="bi ${resolved?'bi-check2-circle':'bi-hourglass-split'}"></i>${resolved?'Решено':'В работе'}</span>
                        <div class="rec-card-product">
                            <strong>${escapeHtml(product)}</strong>
                            <small><span>Куплено: <b>${escapeHtml(purchased)}</b></span><span>Брак: <b>${escapeHtml(defect)}</b></span></small>
                        </div>
                        <div class="rec-card-problem">${escapeHtml(description)}</div>
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
                target.scrollIntoView({behavior:'smooth', block:'start'});
                if (target.matches('input,textarea,select')) setTimeout(() => target.focus({preventScroll:true}), 180);
            });
        });
    }

    function updateFormProgress() {
        const requiredIds = ['r_dealer','r_date','r_product','r_purchased_volume','r_defect_volume','r_description'];
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

    window.addBatchInput = function() {
        const container = document.getElementById('batch-list');
        container.insertAdjacentHTML('beforeend', `<input type="text" class="form-control form-control-sm batch-input mt-1" placeholder="Номер партии">`);
    };

    window.openAddModal = async () => {
        if (!canManageReclamations) return;
        if (referenceDataPromise) await referenceDataPromise;
        form.reset();
        document.getElementById('r_id').value = ''; 
        document.getElementById('add-modal-title').textContent = 'Оформление рекламации';
        document.getElementById('r_date').value = new Date().toISOString().slice(0, 10);
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
        
        document.getElementById('r_dealer').value = r.dealerId || '';
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
        document.getElementById('r_purchased_volume').value = r.purchasedVolume || '';
        
        document.getElementById('r_base_type').value = r.baseType || '';
        document.getElementById('r_underlayment').value = r.underlayment || '';
        document.getElementById('r_warm_floor').value = r.warmFloor || '';
        document.getElementById('r_installer').value = r.installer || '';
        
        document.getElementById('r_acclimatization').value = r.acclimatization || '';
        document.getElementById('r_storage').value = r.storageMethod || '';
        document.getElementById('r_drying_time').value = r.dryingTime || '';
        document.getElementById('r_floor_flatness').value = r.floorFlatness || '';

        document.getElementById('r_defect_moment').value = r.defectMoment || '';
        document.getElementById('r_defect_volume').value = r.defectVolume || '';
        document.getElementById('r_description').value = r.description || '';
        document.getElementById('r_client_demand').value = r.clientDemand || '';
        
        document.getElementById('r_resolution').value = r.resolution || '';
        document.getElementById('r_compensation_amount').value = r.compensationAmount || '';
        document.getElementById('r_internal_notes').value = r.internalNotes || '';

        const batchContainer = document.getElementById('batch-list');
        batchContainer.innerHTML = '';
        if(r.batchNumbers && r.batchNumbers.length > 0) {
            r.batchNumbers.forEach(bn => {
                batchContainer.insertAdjacentHTML('beforeend', `<input type="text" class="form-control form-control-sm batch-input mt-1" value="${bn}">`);
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
            
            resolution: document.getElementById('r_resolution').value,
            compensationAmount: parseFloat(document.getElementById('r_compensation_amount').value) || 0,
            internalNotes: document.getElementById('r_internal_notes').value,

            photos: dbPhotos
        };

        const method = id ? 'PUT' : 'POST';
        const url = id ? `/api/reclamations/${id}` : '/api/reclamations';

        try {
            const res = await fetch(url, { method: method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) });
            if(res.ok) {
                await fetchReclamations();
                renderList();
                addModal.hide();
            } else { alert("Ошибка сохранения. Возможно размер видео слишком большой."); }
        } catch(err) { alert(err.message); }
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

        document.getElementById('view-body').innerHTML = `
            <div class="card border-0 mb-3"><div class="card-body p-3">
                <p class="mb-1 small text-muted">Товар / Артикул</p>
                <h5 class="fw-bold text-dark">${r.productName}</h5>
                <div class="d-flex gap-4 mt-3">
                    <div><small class="text-muted d-block">Куплено:</small><span class="fw-bold fs-6">${r.purchasedVolume || '-'}</span></div>
                    <div><small class="text-danger d-block">Брак заявлен:</small><span class="fw-bold fs-6 text-danger">${r.defectVolume || '-'}</span></div>
                    <div><small class="text-muted d-block">Площадь объекта:</small><span class="fw-bold fs-6">${r.totalArea || '-'}</span></div>
                </div>
            </div></div>

            <div class="card border-0 mb-3"><div class="card-body p-3">
                <h6 class="fw-bold border-bottom pb-2 mb-2 text-brand">Данные покупки и клиент</h6>
                <div class="row g-2 small">
                    <div class="col-6"><span class="text-muted">Накладная:</span> <br><b>${r.invoiceNumber || '-'}</b></div>
                    <div class="col-6"><span class="text-muted">Дата покупки:</span> <br><b>${pDate}</b></div>
                    <div class="col-12 mt-2"><span class="text-muted">Клиент:</span> <b>${r.clientName || '-'}</b> ${r.clientPhone ? `(${r.clientPhone})` : ''}</div>
                    <div class="col-12"><span class="text-muted">Адрес:</span> <b>${r.address || '-'}</b> ${r.floor ? `, этаж ${r.floor}` : ''}</div>
                </div>
            </div></div>

            <div class="card border-0 mb-3"><div class="card-body p-3">
                <h6 class="fw-bold border-bottom pb-2 mb-2 text-brand">Технические данные</h6>
                <div class="row g-2 small">
                    <div class="col-6"><span class="text-muted">Тип дома:</span> <br><b>${r.houseType || '-'}</b></div>
                    <div class="col-6"><span class="text-muted">Монтаж:</span> <br><b>${r.installer || '-'}</b></div>
                    <div class="col-6"><span class="text-muted">Основание:</span> <br><b>${r.baseType || '-'}</b></div>
                    <div class="col-6"><span class="text-muted">Теплый пол:</span> <br><b class="${r.warmFloor && r.warmFloor !== 'Нет' ? 'text-danger' : ''}">${r.warmFloor || '-'}</b></div>
                    
                    <div class="col-6"><span class="text-muted">Сушка пола:</span> <br><b>${r.dryingTime || '-'}</b></div>
                    <div class="col-6"><span class="text-muted">Ровность (Перепад):</span> <br><b>${r.floorFlatness || '-'}</b></div>
                    <div class="col-6"><span class="text-muted">Акклиматизация:</span> <br><b>${r.acclimatization || '-'}</b></div>
                    <div class="col-6"><span class="text-muted">Способ хранения:</span> <br><b class="${r.storageMethod === 'Вертикально (Запрещено)' ? 'text-danger' : ''}">${r.storageMethod || '-'}</b></div>

                    <div class="col-12"><span class="text-muted">Подложка:</span> <b>${r.underlayment || '-'}</b></div>
                    <div class="col-12"><span class="text-muted">Партии:</span> <b>${(r.batchNumbers||[]).join(', ') || '-'}</b></div>
                </div>
            </div></div>

            <div class="card border-0 mb-3"><div class="card-body p-3">
                <h6 class="fw-bold border-bottom pb-2 mb-2 text-brand">Суть проблемы</h6>
                <p class="small text-muted mb-1">Выявлено: <b>${r.defectMoment || '-'}</b></p>
                <p class="small mb-2">${r.description}</p>
                <div class="p-2 bg-light rounded text-dark small fw-bold mb-2">Требование: ${r.clientDemand || '-'}</div>
            </div></div>

            ${r.internalNotes ? `
            <div class="card border-0 mb-3" style="background-color: #fff3cd; border-left: 4px solid #ffc107 !important;">
                <div class="card-body p-3">
                    <h6 class="fw-bold text-warning-emphasis mb-1"><i class="bi bi-lock-fill"></i> Служебные заметки</h6>
                    <p class="small mb-0 text-dark">${r.internalNotes}</p>
                </div>
            </div>` : ''}

            <div class="card border-0 mb-3" style="background-color: #f8f9fa; border-left: 4px solid #198754 !important;">
                <div class="card-body p-3">
                    <div class="d-flex justify-content-between align-items-start">
                        <h6 class="fw-bold text-success mb-2">Принятое решение</h6>
                        ${r.compensationAmount ? `<span class="badge bg-success fs-6">${r.compensationAmount} ₸</span>` : ''}
                    </div>
                    <p class="small mb-0 text-dark fw-medium">${r.resolution ? r.resolution : '<span class="text-muted fw-normal fst-italic">Решение еще не заполнено...</span>'}</p>
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
        
        const val = (v) => v ? `<div class="print-value">${escapeHtml(v)}</div>` : `<div class="print-value empty"></div>`;
        const blockVal = (v) => v ? `<div class="print-block-value">${escapeHtml(v)}</div>` : `<div class="print-block-value empty"></div>`;
        
        let seqNumStr = '______';
        if (d.id && allReclamations.length > 0) {
            // Абсолютный номер с момента первой рекламации
            const sortedAll = [...allReclamations].sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
            const idx = sortedAll.findIndex(x => x.id === d.id);
            if (idx !== -1) {
                seqNumStr = String(idx + 1).padStart(3, '0');
            }
        }

        const formattedDate = d.date ? new Date(d.date).toLocaleDateString('ru-RU') : '';
        const purchaseDate = d.purchaseDate ? new Date(d.purchaseDate).toLocaleDateString('ru-RU') : '';

        return `
            <div class="print-header">
                <div class="print-title">АКТ РЕКЛАМАЦИИ № ${seqNumStr}</div>
                <div class="print-subtitle">Документ фиксации претензии по качеству товара</div>
            </div>

            <div class="print-row">
                <div class="print-label">Дата составления:</div>
                <div class="print-value" style="flex-grow: 0; width: 150px;">${formattedDate}</div>
                <div class="print-label" style="margin-left: 20px;">Дилер (Магазин):</div>
                ${val(d.dealerName)}
            </div>
            
            <div class="print-section">
                <div class="print-section-title">1. Общая информация о товаре</div>
                <div class="print-row">
                    <div class="print-label">Товар (Название / Артикул):</div>
                    ${val(d.productName)}
                </div>
                <div class="print-row">
                    <div class="print-label">Номер накладной отгрузки:</div>
                    ${val(d.invoiceNumber)}
                    <div class="print-label" style="margin-left: 20px;">Дата покупки:</div>
                    <div class="print-value" style="flex-grow: 0; width: 150px;">${purchaseDate}</div>
                </div>
            </div>

            <div class="print-section">
                <div class="print-section-title">2. Данные объекта и клиента</div>
                <div class="print-row">
                    <div class="print-label">ФИО клиента:</div>
                    ${val(d.clientName)}
                    <div class="print-label" style="margin-left: 20px;">Телефон:</div>
                    <div class="print-value" style="flex-grow: 0; width: 250px;">${escapeHtml(d.clientPhone || '')}</div>
                </div>
                <div class="print-row">
                    <div class="print-label">Адрес объекта:</div>
                    ${val(d.address)}
                </div>
                <div class="print-row">
                    <div class="print-label">Тип помещения:</div>
                    <div class="print-value" style="flex-grow: 0; width: 250px;">${escapeHtml(d.houseType || '')}</div>
                    <div class="print-label" style="margin-left: 20px;">Этаж:</div>
                    <div class="print-value" style="flex-grow: 0; width: 100px;">${escapeHtml(d.floor || '')}</div>
                </div>
                <div class="print-row">
                    <div class="print-label">Общая площадь помещения:</div>
                    <div class="print-value" style="flex-grow: 0; width: 150px;">${escapeHtml(d.totalArea ? d.totalArea + ' м²' : '')}</div>
                    <div class="print-label" style="margin-left: 20px;">Купленный объем товара:</div>
                    <div class="print-value" style="flex-grow: 0; width: 150px;">${escapeHtml(d.purchasedVolume || '')}</div>
                </div>
                <div class="print-row">
                    <div class="print-label">Номера партий:</div>
                    ${val(d.batchNumbers && d.batchNumbers.length ? d.batchNumbers.join(', ') : '')}
                </div>
            </div>

            <div class="print-section">
                <div class="print-section-title">3. Технические условия монтажа</div>
                
                <div class="print-row">
                    <div class="print-label">Тип основания:</div>
                    ${val(d.baseType)}
                    <div class="print-label" style="margin-left: 20px;">Время сушки пола:</div>
                    <div class="print-value" style="flex-grow: 0; width: 200px;">${escapeHtml(d.dryingTime || '')}</div>
                </div>
                
                <div class="print-row">
                    <div class="print-label">Ровность пола (перепад на 1м):</div>
                    ${val(d.floorFlatness)}
                    <div class="print-label" style="margin-left: 20px;">Акклиматизация:</div>
                    <div class="print-value" style="flex-grow: 0; width: 200px;">${escapeHtml(d.acclimatization || '')}</div>
                </div>
                
                <div class="print-row">
                    <div class="print-label">Способ хранения до укладки:</div>
                    ${val(d.storageMethod)}
                    <div class="print-label" style="margin-left: 20px;">Подложка:</div>
                    <div class="print-value" style="flex-grow: 0; width: 200px;">${escapeHtml(d.underlayment || '')}</div>
                </div>

                <div class="print-row">
                    <div class="print-label">Система "Теплый пол":</div>
                    ${val(d.warmFloor)}
                    <div class="print-label" style="margin-left: 20px;">Кто производил монтаж:</div>
                    <div class="print-value" style="flex-grow: 0; width: 250px;">${escapeHtml(d.installer || '')}</div>
                </div>
            </div>

            <div class="print-section">
                <div class="print-section-title">4. Суть претензии и требования</div>
                <div class="print-row">
                    <div class="print-label">Момент выявления дефекта:</div>
                    ${val(d.defectMoment)}
                    <div class="print-label" style="margin-left: 20px;">Объем заявленного брака:</div>
                    <div class="print-value" style="flex-grow: 0; width: 150px;">${escapeHtml(d.defectVolume || '')}</div>
                </div>
                
                <div class="print-block-label" style="margin-top: 15px;">Подробное описание проблемы:</div>
                ${blockVal(d.description)}
                
                <div class="print-block-label" style="margin-top: 15px;">Требование клиента:</div>
                <div class="print-row">
                    ${val(d.clientDemand)}
                </div>
            </div>

            <div class="print-section">
                <div class="print-section-title">5. Решение по рекламации</div>
                ${blockVal(d.resolution)}
            </div>

            <div class="print-signatures">
                <div class="sig-box">
                    <div class="sig-line"></div>
                    <div class="sig-text">Подпись клиента (ФИО)</div>
                </div>
                <div class="sig-box">
                    <div class="sig-line"></div>
                    <div class="sig-text">Представитель дилера (ФИО)</div>
                </div>
            </div>
        `;
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
