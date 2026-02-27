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
    let uploadedPhotos = [];
    let currentViewId = null;

    const listEl = document.getElementById('reclamations-list');
    const searchInput = document.getElementById('search-input');
    const addModal = new bootstrap.Modal(document.getElementById('add-modal'));
    const viewModal = new bootstrap.Modal(document.getElementById('view-modal'));
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

    function renderList() {
        const query = searchInput.value.toLowerCase();
        const filtered = allReclamations.filter(r => 
            (r.dealerName || '').toLowerCase().includes(query) || 
            (r.productName || '').toLowerCase().includes(query)
        );

        if (filtered.length === 0) {
            listEl.innerHTML = '<div class="text-center text-muted p-5"><i class="bi bi-inbox display-4 d-block mb-3"></i>Нет рекламаций</div>';
            return;
        }

        listEl.innerHTML = filtered.map(r => {
            const dateStr = new Date(r.createdAt || r.date).toLocaleDateString('ru-RU');
            const imgBadge = r.photos && r.photos.length > 0 ? `<i class="bi bi-image text-primary ms-2"></i> ${r.photos.length}` : '';
            return `
            <div class="card border-0 shadow-sm rounded-4 cursor-pointer" onclick="viewReclamation('${r.id}')" style="cursor: pointer;">
                <div class="card-body p-3">
                    <div class="d-flex justify-content-between align-items-start mb-2">
                        <h6 class="fw-bold text-dark mb-0 text-truncate" style="max-width: 70%;">${r.dealerName || 'Неизвестный дилер'}</h6>
                        <small class="text-muted">${dateStr}</small>
                    </div>
                    <div class="small text-secondary mb-2">
                        <i class="bi bi-box-seam me-1"></i> <span class="fw-bold">${r.productName}</span>
                    </div>
                    <div class="d-flex justify-content-between align-items-end mt-2 pt-2 border-top">
                        <div class="small text-danger fw-bold"><i class="bi bi-exclamation-triangle"></i> Брак: ${r.defectVolume}</div>
                        <div class="small text-muted">${imgBadge}</div>
                    </div>
                </div>
            </div>`;
        }).join('');
    }

    searchInput.addEventListener('input', renderList);

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
        document.getElementById('r_house_type').value = r.houseType || 'Многоэтажный';
        document.getElementById('r_total_area').value = r.totalArea || '';
        document.getElementById('r_defect_volume').value = r.defectVolume || '';
        document.getElementById('r_base_type').value = r.baseType || 'Стяжка';
        document.getElementById('r_underlayment').value = r.underlayment || '';
        document.getElementById('r_warm_floor').value = r.warmFloor || 'Нет';
        document.getElementById('r_installer').value = r.installer || 'Сам клиент';
        document.getElementById('r_description').value = r.description || '';
        document.getElementById('r_client_demand').value = r.clientDemand || 'Замена товара';

        const batchContainer = document.getElementById('batch-list');
        batchContainer.innerHTML = '';
        if(r.batchNumbers && r.batchNumbers.length > 0) {
            r.batchNumbers.forEach(bn => {
                batchContainer.insertAdjacentHTML('beforeend', `<input type="text" class="form-control form-control-sm batch-input mt-1" value="${bn}">`);
            });
        } else {
            batchContainer.innerHTML = `<input type="text" class="form-control form-control-sm batch-input" placeholder="Номер партии">`;
        }

        uploadedPhotos = [...(r.photos || [])];
        renderPhotoPreviews();
        addModal.show();
    };

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

    function setupPhotoUpload() {
        const input = document.getElementById('r_photos');
        input.addEventListener('change', async (e) => {
            for (let file of e.target.files) {
                if(file.type.startsWith('image/')) {
                    const base64 = await compressImage(file, 800, 0.7);
                    uploadedPhotos.push({ photo_url: base64 });
                }
            }
            renderPhotoPreviews();
            input.value = '';
        });
    }

    function renderPhotoPreviews() {
        const container = document.getElementById('r_photos_preview');
        container.innerHTML = uploadedPhotos.map((p, index) => `
            <div class="photo-preview-item">
                <img src="${p.photo_url}">
                <button type="button" class="btn-remove-photo" onclick="removePhoto(${index})"><i class="bi bi-x"></i></button>
            </div>
        `).join('');
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
            defectVolume: document.getElementById('r_defect_volume').value,
            batchNumbers: batchInputs,
            baseType: document.getElementById('r_base_type').value,
            underlayment: document.getElementById('r_underlayment').value,
            warmFloor: document.getElementById('r_warm_floor').value,
            installer: document.getElementById('r_installer').value,
            description: document.getElementById('r_description').value,
            clientDemand: document.getElementById('r_client_demand').value,
            photos: uploadedPhotos
        };

        const method = id ? 'PUT' : 'POST';
        const url = id ? `/api/reclamations/${id}` : '/api/reclamations';

        try {
            const res = await fetch(url, { method: method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) });
            if(res.ok) {
                await fetchReclamations();
                renderList();
                addModal.hide();
            } else { alert("Ошибка сохранения"); }
        } catch(err) { alert(err.message); }
        finally { btn.disabled = false; btn.innerHTML = '<i class="bi bi-send me-2"></i>Сохранить'; }
    });

    window.viewReclamation = (id) => {
        const r = allReclamations.find(x => x.id === id);
        if(!r) return;
        currentViewId = id;

        document.getElementById('v_title').textContent = `Рекламация: ${r.dealerName}`;
        
        let photosHtml = '';
        if(r.photos && r.photos.length > 0) {
            photosHtml = `<div class="mt-3 border-top pt-3"><h6 class="fw-bold">Фотографии:</h6><div class="d-flex flex-wrap gap-2">` + 
                r.photos.map(p => `<a href="${p.photo_url}" target="_blank"><img src="${p.photo_url}" style="width: 100px; height: 100px; object-fit: cover; border-radius: 8px; border: 1px solid #ccc;"></a>`).join('') + 
                `</div></div>`;
        }

        document.getElementById('view-body').innerHTML = `
            <div class="card border-0 mb-3"><div class="card-body p-3">
                <p class="mb-1 small text-muted">Товар / Артикул</p>
                <h6 class="fw-bold text-dark">${r.productName}</h6>
                <div class="d-flex gap-3 mt-2">
                    <div><small class="text-muted d-block">Общая площадь:</small><span class="fw-bold">${r.totalArea || '-'}</span></div>
                    <div><small class="text-danger d-block">Объем брака:</small><span class="fw-bold text-danger">${r.defectVolume}</span></div>
                </div>
            </div></div>

            <div class="card border-0 mb-3"><div class="card-body p-3">
                <h6 class="fw-bold border-bottom pb-2 mb-2">Технические данные</h6>
                <div class="row g-2 small">
                    <div class="col-6"><span class="text-muted">Тип дома:</span> <br><b>${r.houseType || '-'}</b></div>
                    <div class="col-6"><span class="text-muted">Монтаж:</span> <br><b>${r.installer || '-'}</b></div>
                    <div class="col-6"><span class="text-muted">Основание:</span> <br><b>${r.baseType || '-'}</b></div>
                    <div class="col-6"><span class="text-muted">Теплый пол:</span> <br><b class="${r.warmFloor !== 'Нет' ? 'text-danger' : ''}">${r.warmFloor || '-'}</b></div>
                    <div class="col-12"><span class="text-muted">Подложка:</span> <b>${r.underlayment || '-'}</b></div>
                    <div class="col-12"><span class="text-muted">Партии:</span> <b>${(r.batchNumbers||[]).join(', ') || '-'}</b></div>
                </div>
            </div></div>

            <div class="card border-0 mb-3"><div class="card-body p-3">
                <h6 class="fw-bold border-bottom pb-2 mb-2">Суть проблемы</h6>
                <p class="small mb-2">${r.description}</p>
                <div class="p-2 bg-warning-subtle rounded text-dark small fw-bold">Требование: ${r.clientDemand}</div>
            </div></div>

            ${photosHtml}
        `;
        viewModal.show();
    };

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
    // ЛОГИКА ПЕЧАТИ (ОФИЦИАЛЬНЫЙ БЛАНК)
    // ==========================================
    function generatePrintHTML(data) {
        const d = data || {};
        const val = (v) => v ? `<b>${v}</b>` : '';
        
        // ВЫЧИСЛЕНИЕ ПОРЯДКОВОГО НОМЕРА
        let seqNumStr = '___';
        if (d.id && allReclamations.length > 0) {
            // Поскольку массив отсортирован по убыванию даты,
            // индекс 0 - это последняя (самая новая) рекламация.
            const idx = allReclamations.findIndex(x => x.id === d.id);
            if (idx !== -1) {
                const num = allReclamations.length - idx;
                seqNumStr = String(num).padStart(3, '0'); // Формат 001, 002...
            }
        }

        return `
            <div class="print-title">Акт рекламации № ${seqNumStr}</div>
            
            <div class="print-flex" style="margin-bottom: 25px; font-size: 15px;">
                <div><strong>Дата составления:</strong> ${d.date ? new Date(d.date).toLocaleDateString('ru-RU') : '«___» ___________ 202_ г.'}</div>
                <div><strong>Дилер (Магазин):</strong> ${d.dealerName ? `<u><b>${d.dealerName}</b></u>` : '____________________________________'}</div>
            </div>
            
            <div class="print-section-title">1. Общая информация</div>
            <table class="print-table">
                <tr><td width="40%">Товар (Название / Артикул)</td><td>${val(d.productName)}</td></tr>
                <tr><td>Номер накладной отгрузки</td><td>${val(d.invoiceNumber)}</td></tr>
                <tr><td>Дата покупки клиентом</td><td>${d.purchaseDate ? `<b>${new Date(d.purchaseDate).toLocaleDateString('ru-RU')}</b>` : ''}</td></tr>
            </table>

            <div class="print-section-title">2. Данные объекта и клиента</div>
            <table class="print-table">
                <tr><td width="40%">ФИО конечного клиента</td><td>${val(d.clientName)}</td></tr>
                <tr><td>Телефон клиента</td><td>${val(d.clientPhone)}</td></tr>
                <tr><td>Адрес объекта</td><td>${val(d.address)}</td></tr>
                <tr><td>Тип помещения и Этаж</td><td>${d.houseType || ''} ${d.floor ? ', этаж ' + d.floor : ''}</td></tr>
                <tr><td>Общая квадратура (м²)</td><td>${val(d.totalArea)}</td></tr>
                <tr><td>Объем брака (шт / м²)</td><td>${val(d.defectVolume)}</td></tr>
                <tr><td>Номера партий</td><td>${d.batchNumbers && d.batchNumbers.length ? `<b>${d.batchNumbers.join(', ')}</b>` : ''}</td></tr>
            </table>

            <div class="print-section-title">3. Технические условия монтажа</div>
            <table class="print-table">
                <tr><td width="40%">Тип основания</td><td>${val(d.baseType)}</td></tr>
                <tr><td>Используемая подложка</td><td>${val(d.underlayment)}</td></tr>
                <tr><td>Система "Теплый пол"</td><td>${val(d.warmFloor)}</td></tr>
                <tr><td>Кто производил монтаж</td><td>${val(d.installer)}</td></tr>
            </table>

            <div class="print-section-title">4. Суть претензии и требования</div>
            <table class="print-table">
                <tr>
                    <td style="padding: 15px; vertical-align: top; height: 120px;">
                        <div style="margin-bottom: 10px; color: #555; font-size: 12px; font-weight: bold;">Описание проблемы:</div>
                        ${val(d.description)}
                    </td>
                </tr>
                <tr>
                    <td style="padding: 15px; vertical-align: top; height: 60px;">
                        <div style="margin-bottom: 5px; color: #555; font-size: 12px; font-weight: bold;">Требование клиента:</div>
                        ${val(d.clientDemand)}
                    </td>
                </tr>
            </table>

            <div class="print-flex" style="margin-top: 50px;">
                <div class="signature-block">
                    <div class="signature-line"></div>
                    <div class="signature-label">Подпись клиента (ФИО)</div>
                </div>
                <div class="signature-block">
                    <div class="signature-line"></div>
                    <div class="signature-label">Представитель дилера (ФИО)</div>
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
