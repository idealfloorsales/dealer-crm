// script.js
document.addEventListener('DOMContentLoaded', () => {
    
    // Используем относительные пути (это правильно для Render)
    const API_DEALERS_URL = '/api/dealers';
    const API_PRODUCTS_URL = '/api/products'; 

    let fullProductCatalog = [];
    let allDealers = [];
    let currentSort = { column: 'name', direction: 'asc' };

    const posMaterialsList = [
        "Н600 - 600мм наклейка", "Н800 - 800мм наклейка", "РФ-2 - Расческа из фанеры",
        "РФС-1 - Расческа их фанеры старая", "С600 - 600мм задняя стенка",
        "С800 - 800мм задняя стенка", "Табличка - Табличка орг.стекло"
    ];

    const addModalEl = document.getElementById('add-modal');
    const addModal = new bootstrap.Modal(addModalEl);
    const editModalEl = document.getElementById('edit-modal');
    const editModal = new bootstrap.Modal(editModalEl);

    const openAddModalBtn = document.getElementById('open-add-modal-btn');
    const addForm = document.getElementById('add-dealer-form');
    const addProductChecklist = document.getElementById('add-product-checklist'); 
    const addContactList = document.getElementById('add-contact-list'); 
    const addPhotoList = document.getElementById('add-photo-list'); 
    const addAddressList = document.getElementById('add-address-list'); 
    const addPosList = document.getElementById('add-pos-list'); 
    
    const dealerListBody = document.getElementById('dealer-list-body');
    const noDataMsg = document.getElementById('no-data-msg');
    const filterCity = document.getElementById('filter-city');
    const filterPriceType = document.getElementById('filter-price-type');
    const searchBar = document.getElementById('search-bar'); 
    const exportBtn = document.getElementById('export-dealers-btn'); // Кнопка экспорта

    const editForm = document.getElementById('edit-dealer-form');
    const editProductChecklist = document.getElementById('edit-product-checklist'); 
    const editContactList = document.getElementById('edit-contact-list'); 
    const editPhotoList = document.getElementById('edit-photo-list'); 
    const editAddressList = document.getElementById('edit-address-list'); 
    const editPosList = document.getElementById('edit-pos-list'); 

    // --- Конвертер в Base64 ---
    const toBase64 = file => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });

    // --- Загрузка каталога ---
    async function fetchProductCatalog() {
        if (fullProductCatalog.length > 0) return; 
        try {
            const response = await fetch(API_PRODUCTS_URL);
            if (!response.ok) throw new Error(`Ошибка товаров: ${response.status}`);
            fullProductCatalog = await response.json();
            fullProductCatalog.sort((a, b) => a.sku.localeCompare(b.sku, 'ru', { numeric: true }));
        } catch (error) {
            console.error(error);
            addProductChecklist.innerHTML = `<p class='text-danger'>${error.message}</p>`;
        }
    }

    // --- Вспомогательные функции (HTML генераторы) ---
    function createContactEntryHTML(c={}) {
        return `<div class="contact-entry input-group mb-2">
            <input type="text" class="form-control contact-name" placeholder="Имя" value="${c.name||''}">
            <input type="text" class="form-control contact-position" placeholder="Должность" value="${c.position||''}">
            <input type="text" class="form-control contact-info" placeholder="Телефон" value="${c.contactInfo||''}">
            <button type="button" class="btn btn-outline-danger btn-remove-entry"><i class="bi bi-trash"></i></button>
        </div>`;
    }
    function createAddressEntryHTML(a={}) {
        return `<div class="address-entry input-group mb-2">
            <input type="text" class="form-control address-description" placeholder="Описание" value="${a.description||''}">
            <input type="text" class="form-control address-city" placeholder="Город" value="${a.city||''}">
            <input type="text" class="form-control address-address" placeholder="Адрес" value="${a.address||''}">
            <button type="button" class="btn btn-outline-danger btn-remove-entry"><i class="bi bi-trash"></i></button>
        </div>`;
    }
    function createPosEntryHTML(p={}) {
        const opts = posMaterialsList.map(n => `<option value="${n}" ${n===p.name?'selected':''}>${n}</option>`).join('');
        return `<div class="pos-entry input-group mb-2">
            <select class="form-select pos-name"><option value="">-- Выбор --</option>${opts}</select>
            <input type="number" class="form-control pos-quantity" value="${p.quantity||1}" min="1">
            <button type="button" class="btn btn-outline-danger btn-remove-entry"><i class="bi bi-trash"></i></button>
        </div>`;
    }
    function createNewPhotoEntryHTML() {
        return `<div class="photo-entry new input-group mb-2">
            <input type="text" class="form-control photo-description" placeholder="Описание фото">
            <input type="file" class="form-control photo-file" accept="image/*">
            <button type="button" class="btn btn-outline-danger btn-remove-entry"><i class="bi bi-trash"></i></button>
        </div>`;
    }
    function renderExistingPhotos(container, photos=[]) {
        container.innerHTML = (photos && photos.length > 0) ? photos.map(p => `
            <div class="photo-entry existing input-group mb-2">
                <img src="${p.photo_url}" class="preview-thumb">
                <input type="text" class="form-control photo-description" value="${p.description||''}">
                <button type="button" class="btn btn-outline-danger btn-remove-entry"><i class="bi bi-trash"></i></button>
                <input type="hidden" class="photo-url" value="${p.photo_url}">
            </div>`).join('') : '';
    }

    // --- Сбор данных из форм ---
    function collectData(container, selector, fields) {
        const data = [];
        container.querySelectorAll(selector).forEach(entry => {
            const item = {};
            let hasData = false;
            fields.forEach(f => {
                const val = entry.querySelector(f.class).value;
                item[f.key] = val;
                if(val) hasData = true;
            });
            if(hasData) data.push(item);
        });
        return data;
    }
    
    async function collectPhotos(container) {
        const promises = [];
        container.querySelectorAll('.photo-entry.existing').forEach(e => {
            promises.push(Promise.resolve({
                description: e.querySelector('.photo-description').value,
                photo_url: e.querySelector('.photo-url').value
            }));
        });
        container.querySelectorAll('.photo-entry.new').forEach(e => {
            const file = e.querySelector('.photo-file').files[0];
            const desc = e.querySelector('.photo-description').value;
            if(file) promises.push(toBase64(file).then(url => ({ description: desc, photo_url: url })));
        });
        return Promise.all(promises);
    }

    function renderList(container, data, htmlGen) {
        container.innerHTML = (data && data.length > 0) ? data.map(htmlGen).join('') : htmlGen();
    }

    // --- Работа с товарами ---
    function renderProductChecklist(container, selectedIds=[]) {
        const set = new Set(selectedIds);
        container.innerHTML = fullProductCatalog.map(p => {
            const pid = p.id || p._id;
            return `<div class="checklist-item form-check">
                <input type="checkbox" class="form-check-input" value="${pid}" ${set.has(pid)?'checked':''}>
                <label class="form-check-label"><strong>${p.sku}</strong> - ${p.name}</label>
            </div>`;
        }).join('');
    }
    function getSelectedProductIds(containerId) {
        return Array.from(document.getElementById(containerId).querySelectorAll('input:checked')).map(cb=>cb.value);
    }
    async function saveProducts(dealerId, ids) {
        await fetch(`${API_DEALERS_URL}/${dealerId}/products`, {
            method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({productIds: ids})
        });
    }

    // --- Главный рендер ---
    function renderDealerList() {
        const city = filterCity.value;
        const type = filterPriceType.value;
        const search = searchBar.value.toLowerCase();

        const filtered = allDealers.filter(d => {
            const matchCity = !city || d.city === city;
            const matchType = !type || d.price_type === type;
            const matchSearch = !search || 
                (d.name && d.name.toLowerCase().includes(search)) ||
                (d.dealer_id && d.dealer_id.toLowerCase().includes(search)) ||
                (d.organization && d.organization.toLowerCase().includes(search));
            return matchCity && matchType && matchSearch;
        });

        filtered.sort((a, b) => {
            let valA = (a[currentSort.column] || '').toString();
            let valB = (b[currentSort.column] || '').toString();
            let res = currentSort.column === 'dealer_id' 
                ? valA.localeCompare(valB, undefined, {numeric:true})
                : valA.toLowerCase().localeCompare(valB.toLowerCase(), 'ru');
            return currentSort.direction === 'asc' ? res : -res;
        });

        dealerListBody.innerHTML = '';
        if (filtered.length === 0) {
            dealerTable.style.display = 'none';
            noDataMsg.style.display = 'block';
            noDataMsg.textContent = allDealers.length === 0 ? 'Список пуст. Добавьте первого дилера!' : 'Ничего не найдено.';
            return;
        }
        dealerTable.style.display = 'table';
        noDataMsg.style.display = 'none';

        filtered.forEach((d, idx) => {
            const row = dealerListBody.insertRow();
            const safe = (t) => t ? t.replace(/</g,"&lt;") : '';
            row.innerHTML = `
                <td class="cell-number">${idx+1}</td>
                <td>${d.photo_url ? `<img src="${d.photo_url}" class="table-photo">` : `<div class="no-photo">Нет</div>`}</td>
                <td>${safe(d.dealer_id)}</td>
                <td>${safe(d.name)}</td>
                <td>${safe(d.city)}</td>
                <td>${safe(d.price_type)}</td>
                <td>${safe(d.organization)}</td>
                <td class="actions-cell">
                    <div class="dropdown">
                        <button class="btn btn-light btn-sm" data-bs-toggle="dropdown"><i class="bi bi-three-dots-vertical"></i></button>
                        <ul class="dropdown-menu dropdown-menu-end">
                            <li><a class="dropdown-item btn-view" data-id="${d.id}" href="#"><i class="bi bi-eye me-2"></i>Просмотр</a></li>
                            <li><a class="dropdown-item btn-edit" data-id="${d.id}" href="#"><i class="bi bi-pencil me-2"></i>Ред.</a></li>
                            <li><hr class="dropdown-divider"></li>
                            <li><a class="dropdown-item text-danger btn-delete" data-id="${d.id}" data-name="${safe(d.name)}" href="#"><i class="bi bi-trash me-2"></i>Удалить</a></li>
                        </ul>
                    </div>
                </td>`;
        });
    }

    function populateFilters(dealers) {
        const cities = [...new Set(dealers.map(d => d.city).filter(Boolean))].sort();
        const types = [...new Set(dealers.map(d => d.price_type).filter(Boolean))].sort();
        
        // Сохраняем текущий выбор
        const selCity = filterCity.value;
        const selType = filterPriceType.value;

        filterCity.innerHTML = '<option value="">-- Все города --</option>';
        filterPriceType.innerHTML = '<option value="">-- Все типы --</option>';
        
        cities.forEach(c => filterCity.add(new Option(c, c)));
        types.forEach(t => filterPriceType.add(new Option(t, t)));
        
        filterCity.value = selCity;
        filterPriceType.value = selType;
    }

    // --- ИНИЦИАЛИЗАЦИЯ (Самое важное) ---
    async function initApp() {
        await fetchProductCatalog();
        try {
            // (ВАЖНО) Пытаемся загрузить
            const response = await fetch(API_DEALERS_URL);
            
            if (!response.ok) {
                // Если ошибка (401, 500), читаем текст ошибки
                const text = await response.text();
                throw new Error(`Ошибка сервера (${response.status}): ${text}`);
            }
            
            allDealers = await response.json();
            populateFilters(allDealers);
            renderDealerList();
            
        } catch (error) {
            console.error('CRITICAL INIT ERROR:', error);
            // Показываем РЕАЛЬНУЮ ошибку на экране
            dealerListBody.innerHTML = '';
            dealerTable.style.display = 'none';
            noDataMsg.style.display = 'block';
            noDataMsg.className = 'alert alert-danger';
            noDataMsg.innerHTML = `<strong>Не удалось загрузить список:</strong><br>${error.message}`;
        }

        const pendingId = localStorage.getItem('pendingEditDealerId');
        if (pendingId) {
            localStorage.removeItem('pendingEditDealerId');
            openEditModal(pendingId);
        }
    }

    // --- КНОПКИ ДОБАВЛЕНИЯ ПОЛЕЙ ---
    document.getElementById('add-contact-btn-add-modal').onclick = () => addContactList.insertAdjacentHTML('beforeend', createContactEntryHTML());
    document.getElementById('add-address-btn-add-modal').onclick = () => addAddressList.insertAdjacentHTML('beforeend', createAddressEntryHTML());
    document.getElementById('add-photo-btn-add-modal').onclick = () => addPhotoList.insertAdjacentHTML('beforeend', createNewPhotoEntryHTML());
    document.getElementById('add-pos-btn-add-modal').onclick = () => addPosList.insertAdjacentHTML('beforeend', createPosEntryHTML());

    document.getElementById('add-contact-btn-edit-modal').onclick = () => editContactList.insertAdjacentHTML('beforeend', createContactEntryHTML());
    document.getElementById('add-address-btn-edit-modal').onclick = () => editAddressList.insertAdjacentHTML('beforeend', createAddressEntryHTML());
    document.getElementById('add-photo-btn-edit-modal').onclick = () => editPhotoList.insertAdjacentHTML('beforeend', createNewPhotoEntryHTML());
    document.getElementById('add-pos-btn-edit-modal').onclick = () => editPosList.insertAdjacentHTML('beforeend', createPosEntryHTML());

    // --- ОТКРЫТИЕ МОДАЛОК ---
    openAddModalBtn.onclick = () => {
        addForm.reset();
        renderProductChecklist(addProductChecklist);
        renderList(addContactList, [], createContactEntryHTML);
        renderList(addAddressList, [], createAddressEntryHTML);
        renderList(addPosList, [], createPosEntryHTML);
        addPhotoList.innerHTML = createNewPhotoEntryHTML();
        addModal.show();
    };

    // --- СОХРАНЕНИЕ НОВОГО ---
    addForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = {
            dealer_id: document.getElementById('dealer_id').value,
            name: document.getElementById('name').value,
            organization: document.getElementById('organization').value,
            price_type: document.getElementById('price_type').value,
            city: document.getElementById('city').value,
            address: document.getElementById('address').value,
            delivery: document.getElementById('delivery').value,
            website: document.getElementById('website').value,
            instagram: document.getElementById('instagram').value,
            bonuses: document.getElementById('bonuses').value,
            contacts: collectData(addContactList, '.contact-entry', [{key:'name',class:'.contact-name'},{key:'position',class:'.contact-position'},{key:'contactInfo',class:'.contact-info'}]),
            additional_addresses: collectData(addAddressList, '.address-entry', [{key:'description',class:'.address-description'},{key:'city',class:'.address-city'},{key:'address',class:'.address-address'}]),
            pos_materials: collectData(addPosList, '.pos-entry', [{key:'name',class:'.pos-name'},{key:'quantity',class:'.pos-quantity'}]),
            photos: await collectPhotos(addPhotoList)
        };

        try {
            const res = await fetch(API_DEALERS_URL, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data)});
            if (!res.ok) throw new Error(await res.text());
            const newD = await res.json();
            const pIds = getSelectedProductIds('add-product-checklist');
            if(pIds.length) await saveProducts(newD.id, pIds);
            addModal.hide();
            initApp();
        } catch (e) { alert("Ошибка: " + e.message); }
    });

    // --- РЕДАКТИРОВАНИЕ ---
    async function openEditModal(id) {
        try {
            const res = await fetch(`${API_DEALERS_URL}/${id}`);
            if(!res.ok) throw new Error("Ошибка загрузки дилера");
            const d = await res.json();
            
            // Заполняем поля
            document.getElementById('edit_db_id').value = d.id;
            document.getElementById('edit_dealer_id').value = d.dealer_id;
            document.getElementById('edit_name').value = d.name;
            document.getElementById('edit_organization').value = d.organization;
            document.getElementById('edit_price_type').value = d.price_type;
            document.getElementById('edit_city').value = d.city;
            document.getElementById('edit_address').value = d.address;
            document.getElementById('edit_delivery').value = d.delivery;
            document.getElementById('edit_website').value = d.website;
            document.getElementById('edit_instagram').value = d.instagram;
            document.getElementById('edit_bonuses').value = d.bonuses;

            renderList(editContactList, d.contacts, createContactEntryHTML);
            renderList(editAddressList, d.additional_addresses, createAddressEntryHTML);
            renderList(editPosList, d.pos_materials, createPosEntryHTML);
            renderExistingPhotos(editPhotoList, d.photos);
            renderProductChecklist(editProductChecklist, (d.products||[]).map(p=>p.id));
            
            editModal.show();
        } catch(e) { alert(e.message); }
    }

    // --- СОХРАНЕНИЕ ИЗМЕНЕНИЙ ---
    editForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('edit_db_id').value;
        const data = {
            dealer_id: document.getElementById('edit_dealer_id').value,
            name: document.getElementById('edit_name').value,
            organization: document.getElementById('edit_organization').value,
            price_type: document.getElementById('edit_price_type').value,
            city: document.getElementById('edit_city').value,
            address: document.getElementById('edit_address').value,
            delivery: document.getElementById('edit_delivery').value,
            website: document.getElementById('edit_website').value,
            instagram: document.getElementById('edit_instagram').value,
            bonuses: document.getElementById('edit_bonuses').value,
            contacts: collectData(editContactList, '.contact-entry', [{key:'name',class:'.contact-name'},{key:'position',class:'.contact-position'},{key:'contactInfo',class:'.contact-info'}]),
            additional_addresses: collectData(editAddressList, '.address-entry', [{key:'description',class:'.address-description'},{key:'city',class:'.address-city'},{key:'address',class:'.address-address'}]),
            pos_materials: collectData(editPosList, '.pos-entry', [{key:'name',class:'.pos-name'},{key:'quantity',class:'.pos-quantity'}]),
            photos: await collectPhotos(editPhotoList)
        };

        try {
            const res = await fetch(`${API_DEALERS_URL}/${id}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data)});
            if (!res.ok) throw new Error(await res.text());
            await saveProducts(id, getSelectedProductIds('edit-product-checklist'));
            editModal.hide();
            initApp();
        } catch (e) { alert("Ошибка: " + e.message); }
    });

    // --- КЛИКИ В СПИСКЕ ---
    dealerListBody.addEventListener('click', (e) => {
        const t = e.target;
        if (t.closest('.btn-view')) window.open(`dealer.html?id=${t.closest('.btn-view').dataset.id}`, '_blank');
        if (t.closest('.btn-edit')) openEditModal(t.closest('.btn-edit').dataset.id);
        if (t.closest('.btn-delete')) {
            const btn = t.closest('.btn-delete');
            if(confirm(`Удалить "${btn.dataset.name}"?`)) fetch(`${API_DEALERS_URL}/${btn.dataset.id}`, {method:'DELETE'}).then(initApp);
        }
    });

    // --- УДАЛЕНИЕ СТРОК ---
    const removeHandler = (e) => {
        if(e.target.closest('.btn-remove-entry')) e.target.closest('.input-group').remove();
    };
    addModalEl.addEventListener('click', removeHandler);
    editModalEl.addEventListener('click', removeHandler);

    // --- ФИЛЬТРЫ И СОРТИРОВКА ---
    filterCity.onchange = renderDealerList;
    filterPriceType.onchange = renderDealerList;
    searchBar.oninput = renderDealerList;
    
    document.querySelectorAll('th[data-sort]').forEach(th => {
        th.onclick = () => {
            if (currentSort.column === th.dataset.sort) currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
            else { currentSort.column = th.dataset.sort; currentSort.direction = 'asc'; }
            renderDealerList();
        }
    });

    // --- ЭКСПОРТ ---
    if (exportBtn) {
        exportBtn.onclick = () => {
            if (!allDealers.length) return alert("Пусто.");
            let csv = "\uFEFFID,Название,Орг,Город,Адрес,Тип,Контакты\n";
            allDealers.forEach(d => {
                const c = (d.contacts||[]).map(x=>x.name).join('; ');
                csv += `"${d.dealer_id}","${d.name}","${d.organization}","${d.city}","${d.address}","${d.price_type}","${c}"\n`;
            });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8;'}));
            a.download = 'dealers.csv';
            a.click();
        };
    }

    // ЗАПУСК
    initApp();
});
