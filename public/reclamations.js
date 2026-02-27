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
    let currentViewId = null; // Для удаления и печати

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

    // Рендер списка
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
        document.getElementById('r_date').value = new Date().toISOString().slice(0, 10);
        uploadedPhotos = [];
        renderPhotoPreviews();
        document.getElementById('batch-list').innerHTML = `<input type="text" class="form-control form-control-sm batch-input" placeholder="Номер партии">`;
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

        try {
            const res = await fetch('/api/reclamations', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) });
            if(res.ok) {
                await fetchReclamations();
                renderList();
                addModal.hide();
            } else { alert("Ошибка сохранения"); }
        } catch(err) { alert(err.message); }
        finally { btn.disabled = false; btn.innerHTML = '<i class="bi bi-send me-2"></i>Отправить'; }
    });

    // Просмотр карточки
    window.viewReclamation = (id) => {
        const r = allReclamations.find(x => x.id === id);
        if(!r) return;
        currentViewId = id; // Сохраняем ID для печати и удаления

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
    // ЛОГИКА ПЕЧАТИ
    // ==========================================
    
    // Генератор HTML для печатного листа
    function generatePrintHTML(data) {
        const d = data || {};
        // Если значения нет, оставляем пустое место для ручного заполнения
        const val = (v) => v ? `<b>${v}</b>` : '';
        
        return `
            <div class="print-title">АКТ РЕКЛАМАЦИИ ${d.id ? '№ ' + d.id.slice(-6).toUpperCase() : ''}</div>
            <div class="print-flex" style="margin-bottom: 20px;">
                <div><strong>Дата:</strong> ${d.date ? new Date(d.date).toLocaleDateString('ru-RU') : '«___» ___________ 202_ г.'}</div>
                <div><strong>Дилер (Магазин):</strong> ${val(d.dealerName)}</div>
            </div>
            
            <table class="print-table">
                <tr><td width="35%"><strong>Товар (Название / Артикул)</strong></td><td>${val(d.productName)}</td></tr>
                <tr><td><strong>Номер накладной отгрузки</strong></td><td>${val(d.invoiceNumber)}</td></tr>
                <tr><td><strong>Дата покупки клиентом</strong></td><td>${d.purchaseDate ? `<b>${new Date(d.purchaseDate).toLocaleDateString('ru-RU')}</b>` : ''}</td></tr>
                <tr><td><strong>ФИО конечного клиента</strong></td><td>${val(d.clientName)}</td></tr>
                <tr><td><strong>Телефон клиента</strong></td><td>${val(d.clientPhone)}</td></tr>
                <tr><td><strong>Адрес объекта</strong></td><td>${val(d.address)}</td></tr>
                <tr><td><strong>Тип дома и Этаж</strong></td><td>${d.houseType || ''} ${d.floor ? ', этаж ' + d.floor : ''}</td></tr>
                <tr><td><strong>Общая квадратура (м²)</strong></td><td>${val(d.totalArea)}</td></tr>
                <tr><td><strong>Объем брака (шт/м²)</strong></td><td>${val(d.defectVolume)}</td></tr>
                <tr><td><strong>Номера партий</strong></td><td>${d.batchNumbers && d.batchNumbers.length ? `<b>${d.batchNumbers.join(', ')}</b>` : ''}</td></tr>
            </table>

            <div style="margin-top: 20px; margin-bottom: 5px; font-weight: bold; text-transform: uppercase;">Технические условия монтажа:</div>
            <table class="print-table">
                <tr><td width="35%"><strong>Тип основания</strong></td><td>${val(d.baseType)}</td></tr>
                <tr><td><strong>Используемая подложка</strong></td><td>${val(d.underlayment)}</td></tr>
                <tr><td><strong>Система "Теплый пол"</strong></td><td>${val(d.warmFloor)}</td></tr>
                <tr><td><strong>Кто производил монтаж</strong></td><td>${val(d.installer)}</td></tr>
            </table>

            <div style="margin-top: 20px; margin-bottom: 5px; font-weight: bold; text-transform: uppercase;">Описание проблемы (Суть претензии):</div>
            <div style="min-height: 100px; border: 1px solid #000; padding: 10px;">${val(d.description)}</div>

            <div style="margin-top: 20px; margin-bottom: 5px; font-weight: bold; text-transform: uppercase;">Требование клиента:</div>
            <div style="min-height: 40px; border: 1px solid #000; padding: 10px;">${val(d.clientDemand)}</div>

            <div class="print-flex" style="margin-top: 60px;">
                <div>Подпись клиента: ___________________</div>
                <div>Представитель дилера: ___________________</div>
            </div>
        `;
    }

    // Печать пустого бланка
    window.printBlankForm = () => {
        const area = document.getElementById('printable-area');
        area.innerHTML = generatePrintHTML(null); // Передаем null = пустые поля
        document.body.classList.add('printing');
        window.print();
        document.body.classList.remove('printing');
    };

    // Печать заполненного акта
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
