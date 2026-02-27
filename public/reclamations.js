// Авторизация
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

document.addEventListener('DOMContentLoaded', () => {
    let allReclamations = [];
    let allDealers = [];
    let allProducts = [];
    let uploadedPhotos = []; // Теперь элементы: { photo_url: base64, isVideo: boolean }
    let currentViewId = null;

    const listEl = document.getElementById('reclamations-list');
    const searchInput = document.getElementById('search-input');
    const sortSelect = document.getElementById('sort-select'); // Сортировка
    const addModal = new bootstrap.Modal(document.getElementById('add-modal'));
    const viewModal = new bootstrap.Modal(document.getElementById('view-modal'));
    const fullscreenModal = new bootstrap.Modal(document.getElementById('fullscreen-modal'));
    const form = document.getElementById('reclamation-form');

    init();

    async function init() {
        document.getElementById('r_date').value = new Date().toISOString().slice(0, 10);
        await Promise.all([
            fetchDealers(),
            fetchProducts(),
            fetchReclamations()
        ]);
        renderList();
        setupPhotoUpload();
    }

    async function fetchReclamations() {
        try {
            const res = await fetch('/api/reclamations');
            if (res.ok) allReclamations = await res.json();
        } catch (e) { console.error(e); }
    }

    async function fetchDealers() {
        try {
            const res = await fetch('/api/dealers?scope=all');
            if (res.ok) {
                allDealers = await res.json();
                allDealers.sort((a,b) => a.name.localeCompare(b.name));
                const select = document.getElementById('r_dealer');
                select.innerHTML = '<option value="">-- Выберите дилера --</option>' + 
                    allDealers.map(d => `<option value="${d.id}">${d.name} (${d.city})</option>`).join('');
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

    // --- ОБНОВЛЕННЫЙ РЕНДЕР С СОРТИРОВКОЙ И НУМЕРАЦИЕЙ ---
    function renderList() {
        const query = searchInput.value.toLowerCase();
        const sortMode = sortSelect.value;

        // Фильтрация
        let filtered = allReclamations.filter(r => 
            (r.dealerName || '').toLowerCase().includes(query) || 
            (r.productName || '').toLowerCase().includes(query)
        );

        // Сортировка
        filtered.sort((a, b) => {
            if (sortMode === 'newest') return new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date);
            if (sortMode === 'oldest') return new Date(a.createdAt || a.date) - new Date(b.createdAt || b.date);
            if (sortMode === 'dealer_asc') return (a.dealerName || '').localeCompare(b.dealerName || '');
            if (sortMode === 'dealer_desc') return (b.dealerName || '').localeCompare(a.dealerName || '');
            return 0;
        });

        if (filtered.length === 0) {
            listEl.innerHTML = '<div class="text-center text-muted p-5"><i class="bi bi-inbox display-4 d-block mb-3"></i>Ничего не найдено</div>';
            return;
        }

        listEl.innerHTML = filtered.map((r, index) => {
            const dateStr = new Date(r.createdAt || r.date).toLocaleDateString('ru-RU');
            const imgBadge = r.photos && r.photos.length > 0 ? `<i class="bi bi-image text-brand ms-2"></i> ${r.photos.length}` : '';
            
            // Внешний вид статуса
            const statusBadge = r.resolution 
                ? `<span class="badge bg-success rounded-pill px-2 py-1"><i class="bi bi-check2-all"></i> Решено</span>` 
                : `<span class="badge bg-warning text-dark rounded-pill px-2 py-1"><i class="bi bi-hourglass-split"></i> В работе</span>`;

            const shortDesc = r.description ? (r.description.length > 60 ? r.description.substring(0, 60) + '...' : r.description) : 'Нет описания';
            const demandTag = r.clientDemand ? `<span class="badge bg-light text-dark border">${r.clientDemand}</span>` : '';

            // НУМЕРАЦИЯ (index + 1)
            return `
            <div class="card border-0 shadow-sm rounded-4 mb-3 reclamation-card" onclick="viewReclamation('${r.id}')">
                <div class="rec-index">${index + 1}</div>
                <div class="card-body p-3 ps-4">
                    <div class="d-flex justify-content-between align-items-start mb-2">
                        <h6 class="fw-bold text-dark mb-0 text-truncate" style="max-width: 65%;">
                            ${r.dealerName || 'Неизвестный дилер'}
                        </h6>
                        <div>${statusBadge}</div>
                    </div>
                    
                    <div class="mb-2">
                        <div class="small text-secondary mb-1"><i class="bi bi-box-seam me-1"></i> <span class="fw-bold text-dark">${r.productName}</span></div>
                        <div class="small text-brand fw-bold"><i class="bi bi-cart-check me-1"></i> Куплено: ${r.purchasedVolume || '-'}</div>
                    </div>

                    <div class="small text-muted mb-2 fst-italic border-start border-2 border-danger ps-2" style="font-size: 0.8rem; line-height: 1.3;">
                        "${shortDesc}"
                    </div>

                    <div class="d-flex justify-content-between align-items-end mt-2 pt-2 border-top">
                        <div>${demandTag}</div>
                        <div class="small text-muted">${dateStr} ${imgBadge}</div>
                    </div>
                </div>
            </div>`;
        }).join('');
    }

    searchInput.addEventListener('input', renderList);
    sortSelect.addEventListener('change', renderList);

    window.addBatchInput = function() {
        const container = document.getElementById('batch-list');
        container.insertAdjacentHTML('beforeend', `<input type="text" class="form-control form-control-sm batch-input mt-1" placeholder="Номер партии">`);
    };

    window.openAddModal = () => {
        form.reset();
        document.getElementById('r_id').value = ''; 
        document.getElementById('add-modal-title').textContent = 'Оформление рекламации';
        document.getElementById('r_date').value = new Date().toISOString().slice(0, 10);
        uploadedPhotos = [];
        renderPhotoPreviews();
        document.getElementById('batch-list').innerHTML = `<input type="text" class="form-control form-control-sm batch-input" placeholder="Номер партии">`;
        addModal.show();
    };

    window.openEditModal = () => {
        if(!currentViewId) return;
        const r = allReclamations.find(x => x.id === currentViewId);
        if(!r) return;

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
        const input = document.getElementById('r_photos');
        input.addEventListener('change', async (e) => {
            for (let file of e.target.files) {
                if (file.type.startsWith('image/')) {
                    const base64 = await compressImage(file, 800, 0.7);
                    uploadedPhotos.push({ photo_url: base64, isVideo: false });
                } 
                else if (file.type.startsWith('video/')) {
                    // Ограничение видео в 8 МБ
                    if (file.size > 8 * 1024 * 1024) {
                        alert(`Видео "${file.name}" слишком большое. Максимальный размер 8 МБ.`);
                        continue;
                    }
                    const base64 = await readVideo(file);
                    uploadedPhotos.push({ photo_url: base64, isVideo: true });
                }
            }
            renderPhotoPreviews();
            input.value = '';
        });
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
    window.removePhoto = (index) => { uploadedPhotos.splice(index, 1); renderPhotoPreviews(); };

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
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
        finally { btn.disabled = false; btn.innerHTML = '<i class="bi bi-send me-2"></i>Сохранить'; }
    });

    // --- ПРОСМОТР НА ВЕСЬ ЭКРАН ---
    window.openFullscreen = (url, isVideo) => {
        const viewer = document.getElementById('fullscreen-viewer');
        if (isVideo) {
            viewer.innerHTML = `<video src="${url}" controls autoplay style="max-width:100%; max-height:90vh; border-radius:8px;"></video>`;
        } else {
            viewer.innerHTML = `<img src="${url}" style="max-width:100%; max-height:90vh; object-fit:contain; border-radius:8px;">`;
        }
        fullscreenModal.show();
    };

    window.viewReclamation = (id) => {
        const r = allReclamations.find(x => x.id === id);
        if(!r) return;
        currentViewId = id;

        // Ищем индекс для номера в заголовке
        // Поскольку список фильтруется и сортируется, нужно искать индекс в текущем отсортированном списке
        // Но для простоты акту можно присваивать абсолютный номер по дате создания
        const sortedAll = [...allReclamations].sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
        const absIndex = sortedAll.findIndex(x => x.id === id);
        const seqNumStr = `№${String(absIndex + 1).padStart(3, '0')} - `;

        document.getElementById('v_title').textContent = `Акт ${seqNumStr}${r.dealerName}`;
        
        let photosHtml = '';
        if(r.photos && r.photos.length > 0) {
            const mediaItems = r.photos.map(p => {
                const isVid = p.photo_url.startsWith('data:video');
                const inner = isVid 
                    ? `<video src="${p.photo_url}#t=0.1" preload="metadata" style="width: 100px; height: 100px; object-fit: cover;"></video><i class="bi bi-play-circle play-icon-overlay"></i>`
                    : `<img src="${p.photo_url}" style="width: 100px; height: 100px; object-fit: cover;">`;
                
                return `
                <div class="photo-preview-item cursor-pointer" onclick="openFullscreen('${p.photo_url}', ${isVid})" style="cursor: pointer; border-radius: 8px; overflow: hidden; border: 1px solid #ccc; position: relative; width: 100px; height: 100px; display: flex; align-items: center; justify-content: center; background: #000;">
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
        if(!currentViewId) return;
        if(!confirm("Удалить эту рекламацию навсегда?")) return;
        try {
            await fetch(`/api/reclamations/${currentViewId}`, { method: 'DELETE' });
            viewModal.hide();
            await fetchReclamations();
            renderList();
        } catch(e) { alert("Ошибка удаления"); }
    };

    // ==========================================
    // ЛОГИКА ПЕЧАТИ
    // ==========================================
    function generatePrintHTML(data) {
        const d = data || {};
        
        const val = (v) => v ? `<div class="print-value">${v}</div>` : `<div class="print-value empty"></div>`;
        const blockVal = (v) => v ? `<div class="print-block-value">${v}</div>` : `<div class="print-block-value empty"></div>`;
        
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
                    <div class="print-value" style="flex-grow: 0; width: 250px;">${d.clientPhone || ''}</div>
                </div>
                <div class="print-row">
                    <div class="print-label">Адрес объекта:</div>
                    ${val(d.address)}
                </div>
                <div class="print-row">
                    <div class="print-label">Тип помещения:</div>
                    <div class="print-value" style="flex-grow: 0; width: 250px;">${d.houseType || ''}</div>
                    <div class="print-label" style="margin-left: 20px;">Этаж:</div>
                    <div class="print-value" style="flex-grow: 0; width: 100px;">${d.floor || ''}</div>
                </div>
                <div class="print-row">
                    <div class="print-label">Общая площадь помещения:</div>
                    <div class="print-value" style="flex-grow: 0; width: 150px;">${d.totalArea ? d.totalArea + ' м²' : ''}</div>
                    <div class="print-label" style="margin-left: 20px;">Купленный объем товара:</div>
                    <div class="print-value" style="flex-grow: 0; width: 150px;">${d.purchasedVolume || ''}</div>
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
                    <div class="print-value" style="flex-grow: 0; width: 200px;">${d.dryingTime || ''}</div>
                </div>
                
                <div class="print-row">
                    <div class="print-label">Ровность пола (перепад на 1м):</div>
                    ${val(d.floorFlatness)}
                    <div class="print-label" style="margin-left: 20px;">Акклиматизация:</div>
                    <div class="print-value" style="flex-grow: 0; width: 200px;">${d.acclimatization || ''}</div>
                </div>
                
                <div class="print-row">
                    <div class="print-label">Способ хранения до укладки:</div>
                    ${val(d.storageMethod)}
                    <div class="print-label" style="margin-left: 20px;">Подложка:</div>
                    <div class="print-value" style="flex-grow: 0; width: 200px;">${d.underlayment || ''}</div>
                </div>

                <div class="print-row">
                    <div class="print-label">Система "Теплый пол":</div>
                    ${val(d.warmFloor)}
                    <div class="print-label" style="margin-left: 20px;">Кто производил монтаж:</div>
                    <div class="print-value" style="flex-grow: 0; width: 250px;">${d.installer || ''}</div>
                </div>
            </div>

            <div class="print-section">
                <div class="print-section-title">4. Суть претензии и требования</div>
                <div class="print-row">
                    <div class="print-label">Момент выявления дефекта:</div>
                    ${val(d.defectMoment)}
                    <div class="print-label" style="margin-left: 20px;">Объем заявленного брака:</div>
                    <div class="print-value" style="flex-grow: 0; width: 150px;">${d.defectVolume || ''}</div>
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
