// script.js
document.addEventListener('DOMContentLoaded', () => {
    
    const API_DEALERS_URL = '/api/dealers';
    const API_PRODUCTS_URL = '/api/products'; 

    let fullProductCatalog = [];
    let allDealers = [];
    let currentSort = { column: 'name', direction: 'asc' };

    const posMaterialsList = [
        "Н600 - 600мм наклейка",
        "Н800 - 800мм наклейка",
        "РФ-2 - Расческа из фанеры",
        "РФС-1 - Расческа их фанеры старая",
        "С600 - 600мм задняя стенка",
        "С800 - 800мм задняя стенка",
        "Табличка - Табличка орг.стекло"
    ];

    const addModalEl = document.getElementById('add-modal');
    const addModal = new bootstrap.Modal(addModalEl);
    const editModalEl = document.getElementById('edit-modal');
    const editModal = new bootstrap.Modal(editModalEl);

    const openAddModalBtn = document.getElementById('open-add-modal-btn');
    const addForm = document.getElementById('add-dealer-form');
    const addProductChecklist = document.getElementById('add-product-checklist'); 
    const addContactList = document.getElementById('add-contact-list'); 
    const addContactBtnAdd = document.getElementById('add-contact-btn-add-modal'); 
    const addPhotoList = document.getElementById('add-photo-list'); 
    const addPhotoBtnAdd = document.getElementById('add-photo-btn-add-modal'); 
    const addAddressList = document.getElementById('add-address-list'); 
    const addAddressBtnAdd = document.getElementById('add-address-btn-add-modal'); 
    const addPosList = document.getElementById('add-pos-list'); 
    const addPosBtnAdd = document.getElementById('add-pos-btn-add-modal'); 
    
    const dealerListBody = document.getElementById('dealer-list-body');
    const dealerTable = document.getElementById('dealer-table');
    const noDataMsg = document.getElementById('no-data-msg');
    const filterCity = document.getElementById('filter-city');
    const filterPriceType = document.getElementById('filter-price-type');
    const searchBar = document.getElementById('search-bar'); 
    const exportBtn = document.getElementById('export-dealers-btn'); 

    const editForm = document.getElementById('edit-dealer-form');
    const editProductChecklist = document.getElementById('edit-product-checklist'); 
    const editContactList = document.getElementById('edit-contact-list'); 
    const addContactBtnEdit = document.getElementById('add-contact-btn-edit-modal'); 
    const editPhotoList = document.getElementById('edit-photo-list'); 
    const addPhotoBtnEdit = document.getElementById('add-photo-btn-edit-modal'); 
    const editAddressList = document.getElementById('edit-address-list'); 
    const addAddressBtnEdit = document.getElementById('add-address-btn-edit-modal'); 
    const editPosList = document.getElementById('edit-pos-list'); 
    const addPosBtnEdit = document.getElementById('add-pos-btn-edit-modal'); 

    const toBase64 = file => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });

    // (ИСПРАВЛЕНО) Добавлена пропущенная функция
    const safeText = (text) => text ? text.replace(/</g, "&lt;").replace(/>/g, "&gt;") : '---';

    async function fetchProductCatalog() {
        if (fullProductCatalog.length > 0) return; 
        try {
            const response = await fetch(API_PRODUCTS_URL);
            if (!response.ok) throw new Error('Ошибка сети при загрузке каталога');
            fullProductCatalog = await response.json();
            fullProductCatalog.sort((a, b) => a.sku.localeCompare(b.sku, 'ru', { numeric: true }));
            console.log(`Загружено ${fullProductCatalog.length} товаров в каталог.`);
        } catch (error) {
            console.error("Критическая ошибка:", error);
            addProductChecklist.innerHTML = `<p class='text-danger'>${error.message}</p>`;
            editProductChecklist.innerHTML = `<p class='text-danger'>${error.message}</p>`;
        }
    }

    function createContactEntryHTML(contact = {}) {
        const safeName = contact.name || '';
        const safePosition = contact.position || '';
        const safeContactInfo = contact.contactInfo || '';
        return `
            <div class="contact-entry input-group mb-2">
                <input type="text" class="form-control contact-name" placeholder="Имя" value="${safeName}">
                <input type="text" class="form-control contact-position" placeholder="Должность" value="${safePosition}">
                <input type="text" class="form-control contact-info" placeholder="Телефон / Email" value="${safeContactInfo}">
                <button type="button" class="btn btn-outline-danger btn-remove-entry"><i class="bi bi-trash"></i></button>
            </div>`;
    }
    function renderContactList(containerElement, contacts = []) {
        containerElement.innerHTML = (contacts && contacts.length > 0) ? contacts.map(createContactEntryHTML).join('') : createContactEntryHTML();
    }
    function collectContacts(containerElement) {
        const contacts = [];
        containerElement.querySelectorAll('.contact-entry').forEach(entry => {
            const name = entry.querySelector('.contact-name').value;
            const position = entry.querySelector('.contact-position').value;
            const contactInfo = entry.querySelector('.contact-info').value;
            if (name || position || contactInfo) contacts.push({ name, position, contactInfo });
        });
        return contacts;
    }
    
    function createAddressEntryHTML(address = {}) {
        const safeDesc = address.description || '';
        const safeCity = address.city || '';
        const safeAddress = address.address || '';
        return `
            <div class="address-entry input-group mb-2">
                <input type="text" class="form-control address-description" placeholder="Описание (н-р, Склад)" value="${safeDesc}">
                <input type="text" class="form-control address-city" placeholder="Город" value="${safeCity}">
                <input type="text" class="form-control address-address" placeholder="Адрес" value="${safeAddress}">
                <button type="button" class="btn btn-outline-danger btn-remove-entry"><i class="bi bi-trash"></i></button>
            </div>`;
    }
    function renderAddressList(containerElement, addresses = []) {
        containerElement.innerHTML = (addresses && addresses.length > 0) ? addresses.map(createAddressEntryHTML).join('') : createAddressEntryHTML();
    }
    function collectAddresses(containerElement) {
        const addresses = [];
        containerElement.querySelectorAll('.address-entry').forEach(entry => {
            const description = entry.querySelector('.address-description').value;
            const city = entry.querySelector('.address-city').value;
            const address = entry.querySelector('.address-address').value;
            if (description || city || address) addresses.push({ description, city, address });
        });
        return addresses;
    }

    function createPosEntryHTML(pos = {}) {
        const safeName = pos.name || '';
        const safeQuantity = pos.quantity || 1;
        const options = posMaterialsList.map(name => 
            `<option value="${name}" ${name === safeName ? 'selected' : ''}>${name}</option>`
        ).join('');
        return `
            <div class="pos-entry input-group mb-2">
                <select class="form-select pos-name"><option value="">-- Выберите --</option>${options}</select>
                <input type="number" class="form-control pos-quantity" placeholder="Кол-во" value="${safeQuantity}" min="1">
                <button type="button" class="btn btn-outline-danger btn-remove-entry"><i class="bi bi-trash"></i></button>
            </div>`;
    }
    function renderPosList(containerElement, posItems = []) {
        containerElement.innerHTML = (posItems && posItems.length > 0) ? posItems.map(createPosEntryHTML).join('') : createPosEntryHTML();
    }
    function collectPos(containerElement) {
        const posItems = [];
        containerElement.querySelectorAll('.pos-entry').forEach(entry => {
            const name = entry.querySelector('.pos-name').value;
            const quantity = entry.querySelector('.pos-quantity').value;
            if (name) posItems.push({ name, quantity: Number(quantity) || 1 });
        });
        return posItems;
    }
    
    function createNewPhotoEntryHTML() {
        return `
            <div class="photo-entry new input-group mb-2">
                <input type="text" class="form-control photo-description" placeholder="Описание (н-р, Фасад)">
                <input type="file" class="form-control photo-file" accept="image/*">
                <button type="button" class="btn btn-outline-danger btn-remove-entry"><i class="bi bi-trash"></i></button>
            </div>`;
    }
    function renderExistingPhotos(containerElement, photos = []) {
        containerElement.innerHTML = (photos && photos.length > 0) ? photos.map(photo => `
            <div class="photo-entry existing input-group mb-2">
                <img src="${photo.photo_url}" class="preview-thumb">
                <input type="text" class="form-control photo-description" value="${photo.description || ''}">
                <button type="button" class="btn btn-outline-danger btn-remove-entry"><i class="bi bi-trash"></i></button>
                <input type="hidden" class="photo-url" value="${photo.photo_url}"> 
            </div>`).join('') : ''; 
    }
    async function collectPhotos(containerElement) {
        const photoPromises = [];
        containerElement.querySelectorAll('.photo-entry.existing').forEach(entry => {
            const description = entry.querySelector('.photo-description').value;
            const photo_url = entry.querySelector('.photo-url').value;
            photoPromises.push(Promise.resolve({ description, photo_url }));
        });
        containerElement.querySelectorAll('.photo-entry.new').forEach(entry => {
            const description = entry.querySelector('.photo-description').value;
            const file = entry.querySelector('.photo-file').files[0];
            if (file) {
                photoPromises.push(toBase64(file).then(base64Url => ({ description, photo_url: base64Url })));
            }
        });
        return await Promise.all(photoPromises);
    }

    function renderProductChecklist(container, selectedProductIds = []) {
        const selectedSet = new Set(selectedProductIds); 
        if (fullProductCatalog.length === 0) {
            container.innerHTML = "<p>Каталог пуст.</p>";
            return;
        }
        container.innerHTML = fullProductCatalog.map(product => {
            const productId = product.id; 
            return `
            <div class="checklist-item form-check">
                <input type="checkbox" class="form-check-input" id="prod-${container.id}-${productId}" value="${productId}" ${selectedSet.has(productId) ? 'checked' : ''}>
                <label class="form-check-label" for="prod-${container.id}-${productId}"><strong>${product.sku}</strong> - ${product.name}</label>
            </div>`;
        }).join('');
    }

    function getSelectedProductIds(containerId) {
        const container = document.getElementById(containerId);
        const checkboxes = container.querySelectorAll('input[type="checkbox"]:checked');
        return Array.from(checkboxes).map(cb => cb.value);
    }
    
    async function saveDealerProductLinks(dealerId, productIds) {
        try {
            await fetch(`${API_DEALERS_URL}/${dealerId}/products`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ productIds })
            });
        } catch (error) { console.error(error); alert("Ошибка: Не удалось сохранить список товаров."); }
    }

    function renderDealerList() {
        const selectedCity = filterCity.value;
        const selectedPriceType = filterPriceType.value;
        const searchTerm = searchBar.value.toLowerCase(); 

        const filteredDealers = allDealers.filter(dealer => {
            const cityMatch = !selectedCity || dealer.city === selectedCity;
            const priceTypeMatch = !selectedPriceType || dealer.price_type === selectedPriceType;
            const searchMatch = !searchTerm || 
                                (dealer.name && dealer.name.toLowerCase().includes(searchTerm)) ||
                                (dealer.dealer_id && dealer.dealer_id.toLowerCase().includes(searchTerm)) ||
                                (dealer.organization && dealer.organization.toLowerCase().includes(searchTerm));
            return cityMatch && priceTypeMatch && searchMatch;
        });

        const sortedDealers = filteredDealers.sort((a, b) => {
            const col = currentSort.column;
            let valA = (a[col] || '').toString(); 
            let valB = (b[col] || '').toString();
            let comparison;
            if (col === 'dealer_id') {
                 comparison = valA.localeCompare(valB, undefined, { numeric: true });
            } else {
                 comparison = valA.toLowerCase().localeCompare(valB.toLowerCase(), 'ru');
            }
            return currentSort.direction === 'asc' ? comparison : -comparison;
        });

        document.querySelectorAll('#dealer-table th[data-sort]').forEach(th => {
            th.classList.remove('sort-asc', 'sort-desc');
            if (th.dataset.sort === currentSort.column) {
                th.classList.add(currentSort.direction === 'asc' ? 'sort-asc' : 'sort-desc');
            }
        });

        dealerListBody.innerHTML = ''; 
        
        if (sortedDealers.length === 0) {
            dealerTable.style.display = 'none';
            noDataMsg.style.display = 'block';
            noDataMsg.textContent = allDealers.length === 0 ? 'Список дилеров пока пуст.' : 'Не найдено.';
            return;
        }

        dealerTable.style.display = 'table';
        noDataMsg.style.display = 'none';

        sortedDealers.forEach((dealer, index) => { 
            const row = dealerListBody.insertRow();
            const dealerId = dealer.id; 
            
            row.innerHTML = `
                <td class="cell-number">${index + 1}</td>
                <td>${dealer.photo_url ? `<img src="${dealer.photo_url}" class="table-photo">` : `<div class="no-photo">Нет</div>`}</td>
                <td>${safeText(dealer.dealer_id)}</td>
                <td>${safeText(dealer.name)}</td>
                <td>${safeText(dealer.city)}</td>
                <td>${safeText(dealer.price_type)}</td>
                <td>${safeText(dealer.organization)}</td>
                <td class="actions-cell">
                    <div class="dropdown">
                        <button class="btn btn-light btn-sm" type="button" data-bs-toggle="dropdown"><i class="bi bi-three-dots-vertical"></i></button>
                        <ul class="dropdown-menu dropdown-menu-end">
                            <li><a class="dropdown-item btn-view" data-id="${dealerId}" href="#"><i class="bi bi-eye me-2"></i>Просмотреть</a></li>
                            <li><a class="dropdown-item btn-edit" data-id="${dealerId}" href="#"><i class="bi bi-pencil me-2"></i>Редактировать</a></li>
                            <li><hr class="dropdown-divider"></li>
                            <li><a class="dropdown-item text-danger btn-delete" data-id="${dealerId}" data-name="${safeText(dealer.name)}" href="#"><i class="bi bi-trash me-2"></i>Удалить</a></li>
                        </ul>
                    </div>
                </td>`;
        });
    }

    function populateFilters(dealers) {
        const cities = [...new Set(dealers.map(d => d.city).filter(Boolean))].sort();
        const types = [...new Set(dealers.map(d => d.price_type).filter(Boolean))].sort();
        
        const selCity = filterCity.value;
        const selType = filterPriceType.value;

        filterCity.innerHTML = '<option value="">-- Все города --</option>';
        filterPriceType.innerHTML = '<option value="">-- Все типы --</option>';
        
        cities.forEach(c => filterCity.add(new Option(c, c)));
        types.forEach(t => filterPriceType.add(new Option(t, t)));
        
        filterCity.value = selCity;
        filterPriceType.value = selType;
    }

    async function initApp() {
        await fetchProductCatalog(); 
        try {
            const response = await fetch(API_DEALERS_URL);
            if (!response.ok) throw new Error('Ошибка загрузки');
            allDealers = await response.json(); 
            populateFilters(allDealers); 
            renderDealerList(); 
        } catch (error) {
            console.error(error);
            dealerListBody.innerHTML = `<tr><td colspan="8" class="text-danger text-center">Ошибка загрузки.</td></tr>`;
        }
        
        const pendingEditId = localStorage.getItem('pendingEditDealerId');
        if (pendingEditId) {
            localStorage.removeItem('pendingEditDealerId');
            openEditModal(pendingEditId); 
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
        renderContactList(addContactList);
        renderAddressList(addAddressList);
        renderPosList(addPosList);
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
            contacts: collectContacts(addContactList),
            additional_addresses: collectAddresses(addAddressList),
            pos_materials: collectPos(addPosList),
            photos: await collectPhotos(addPhotoList)
        };

        try {
            const res = await fetch(API_DEALERS_URL, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data)});
            if (!res.ok) throw new Error(await res.text());
            const newD = await res.json();
            const pIds = getSelectedProductIds('add-product-checklist');
            if(pIds.length) await saveDealerProductLinks(newD.id, pIds);
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

            renderContactList(editContactList, d.contacts);
            renderAddressList(editAddressList, d.additional_addresses);
            renderPosList(editPosList, d.pos_materials);
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
            contacts: collectContacts(editContactList),
            additional_addresses: collectAddresses(editAddressList),
            pos_materials: collectPos(editPosList),
            photos: await collectPhotos(editPhotoList)
        };

        try {
            const res = await fetch(`${API_DEALERS_URL}/${id}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data)});
            if (!res.ok) throw new Error(await res.text());
            await saveDealerProductLinks(id, getSelectedProductIds('edit-product-checklist'));
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
                const clean = t => `"${String(t||'').replace(/"/g,'""')}"`;
                csv += `${clean(d.dealer_id)},${clean(d.name)},${clean(d.organization)},${clean(d.city)},${clean(d.address)},${clean(d.price_type)},${clean(c)}\n`;
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
