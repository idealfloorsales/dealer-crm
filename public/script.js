// script.js
document.addEventListener('DOMContentLoaded', () => {
    
    const API_DEALERS_URL = '/api/dealers';
    const API_PRODUCTS_URL = '/api/products'; 

    let fullProductCatalog = [];
    let allDealers = [];
    let currentSort = { column: 'name', direction: 'asc' };

    // (НОВЫЙ) Список POS-материалов
    const posMaterialsList = [
        "Н600 - 600мм наклейка",
        "Н800 - 800мм наклейка",
        "РФ-2 - Расческа из фанеры",
        "РФС-1 - Расческа их фанеры старая",
        "С600 - 600мм задняя стенка",
        "С800 - 800мм задняя стенка",
        "Табличка - Табличка орг.стекло"
    ];

    // --- Инициализация модальных окон Bootstrap ---
    const addModalEl = document.getElementById('add-modal');
    const addModal = new bootstrap.Modal(addModalEl);
    const editModalEl = document.getElementById('edit-modal');
    const editModal = new bootstrap.Modal(editModalEl);

    // --- Элементы Модального окна ДОБАВЛЕНИЯ ---
    const openAddModalBtn = document.getElementById('open-add-modal-btn');
    const addForm = document.getElementById('add-dealer-form');
    const addProductChecklist = document.getElementById('add-product-checklist'); 
    const addContactList = document.getElementById('add-contact-list'); 
    const addContactBtnAdd = document.getElementById('add-contact-btn-add-modal'); 
    const addPhotoList = document.getElementById('add-photo-list'); 
    const addPhotoBtnAdd = document.getElementById('add-photo-btn-add-modal'); 
    const addAddressList = document.getElementById('add-address-list'); 
    const addAddressBtnAdd = document.getElementById('add-address-btn-add-modal'); 
    const addPosList = document.getElementById('add-pos-list'); // (НОВОЕ)
    const addPosBtnAdd = document.getElementById('add-pos-btn-add-modal'); // (НОВОЕ)
    
    // --- Элементы списка ---
    const dealerListBody = document.getElementById('dealer-list-body');
    const dealerTable = document.getElementById('dealer-table');
    const noDataMsg = document.getElementById('no-data-msg');

    // --- Элементы ФИЛЬТРОВ и ПОИСКА ---
    const filterCity = document.getElementById('filter-city');
    const filterPriceType = document.getElementById('filter-price-type');
    const searchBar = document.getElementById('search-bar'); 

    // --- Элементы Модального окна РЕДАКТИРОВАНИЯ ---
    const editForm = document.getElementById('edit-dealer-form');
    const editProductChecklist = document.getElementById('edit-product-checklist'); 
    const editContactList = document.getElementById('edit-contact-list'); 
    const addContactBtnEdit = document.getElementById('add-contact-btn-edit-modal'); 
    const editPhotoList = document.getElementById('edit-photo-list'); 
    const addPhotoBtnEdit = document.getElementById('add-photo-btn-edit-modal'); 
    const editAddressList = document.getElementById('edit-address-list'); 
    const addAddressBtnEdit = document.getElementById('add-address-btn-edit-modal'); 
    const editPosList = document.getElementById('edit-pos-list'); // (НОВОЕ)
    const addPosBtnEdit = document.getElementById('add-pos-btn-edit-modal'); // (НОВОЕ)

    // --- Функция: Конвертер файла в Base64 ---
    const toBase64 = file => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });

    // --- Функция: Загрузка каталога товаров в кэш ---
    async function fetchProductCatalog() {
        if (fullProductCatalog.length > 0) return; 
        try {
            const response = await fetch(API_PRODUCTS_URL);
            if (!response.ok) throw new Error('Ошибка сети при загрузке каталога');
            fullProductCatalog = await response.json();
            fullProductCatalog.sort((a, b) => a.sku.localeCompare(b.sku, 'ru', { numeric: true }));
            console.log(`Загружено ${fullProductCatalog.length} товаров в каталог.`);
        } catch (error) {
            console.error("Критическая ошибка: не удалось загрузить каталог товаров.", error);
            addProductChecklist.innerHTML = `<p class='text-danger'>${error.message}</p>`;
            editProductChecklist.innerHTML = `<p class='text-danger'>${error.message}</p>`;
        }
    }

    // --- Функции Управления Контактами ---
    function createContactEntryHTML(contact = {}) {
        const safeName = contact.name || '';
        const safePosition = contact.position || '';
        const safeContactInfo = contact.contactInfo || '';
        return `
            <div class="contact-entry input-group mb-2">
                <input type="text" class="form-control contact-name" placeholder="Имя" value="${safeName}">
                <input type="text" class="form-control contact-position" placeholder="Должность" value="${safePosition}">
                <input type="text" class="form-control contact-info" placeholder="Телефон / Email" value="${safeContactInfo}">
                <button type="button" class="btn btn-outline-danger btn-remove-entry">
                    <i class="bi bi-trash"></i>
                </button>
            </div>
        `;
    }
    function renderContactList(containerElement, contacts = []) {
        containerElement.innerHTML = (contacts && contacts.length > 0) ? contacts.map(createContactEntryHTML).join('') : createContactEntryHTML();
    }
    function addContactField(containerElement) {
        containerElement.insertAdjacentHTML('beforeend', createContactEntryHTML());
    }
    function collectContacts(containerElement) {
        const contacts = [];
        containerElement.querySelectorAll('.contact-entry').forEach(entry => {
            const name = entry.querySelector('.contact-name').value;
            const position = entry.querySelector('.contact-position').value;
            const contactInfo = entry.querySelector('.contact-info').value;
            if (name || position || contactInfo) {
                contacts.push({ name, position, contactInfo });
            }
        });
        return contacts;
    }
    // --- Конец функций Контактов ---
    
    // --- Функции Управления Доп. Адресами ---
    function createAddressEntryHTML(address = {}) {
        const safeDesc = address.description || '';
        const safeCity = address.city || '';
        const safeAddress = address.address || '';
        return `
            <div class="address-entry input-group mb-2">
                <input type="text" class="form-control address-description" placeholder="Описание (н-р, Склад)" value="${safeDesc}">
                <input type="text" class="form-control address-city" placeholder="Город" value="${safeCity}">
                <input type="text" class="form-control address-address" placeholder="Адрес" value="${safeAddress}">
                <button type="button" class="btn btn-outline-danger btn-remove-entry">
                    <i class="bi bi-trash"></i>
                </button>
            </div>
        `;
    }
    function renderAddressList(containerElement, addresses = []) {
        containerElement.innerHTML = (addresses && addresses.length > 0) ? addresses.map(createAddressEntryHTML).join('') : createAddressEntryHTML();
    }
    function addAddressField(containerElement) {
        containerElement.insertAdjacentHTML('beforeend', createAddressEntryHTML());
    }
    function collectAddresses(containerElement) {
        const addresses = [];
        containerElement.querySelectorAll('.address-entry').forEach(entry => {
            const description = entry.querySelector('.address-description').value;
            const city = entry.querySelector('.address-city').value;
            const address = entry.querySelector('.address-address').value;
            if (description || city || address) {
                addresses.push({ description, city, address });
            }
        });
        return addresses;
    }
    // --- Конец функций Доп. Адресов ---

    // --- (НОВЫЕ ФУНКЦИИ) Управление POS-материалами ---
    function createPosEntryHTML(pos = {}) {
        const safeName = pos.name || '';
        const safeQuantity = pos.quantity || 1;
        
        // Создаем выпадающий список
        const options = posMaterialsList.map(name => 
            `<option value="${name}" ${name === safeName ? 'selected' : ''}>${name}</option>`
        ).join('');
        
        return `
            <div class="pos-entry input-group mb-2">
                <select class="form-select pos-name">
                    <option value="">-- Выберите оборудование --</option>
                    ${options}
                </select>
                <input type="number" class="form-control pos-quantity" placeholder="Кол-во" value="${safeQuantity}" min="1">
                <button type="button" class="btn btn-outline-danger btn-remove-entry">
                    <i class="bi bi-trash"></i>
                </button>
            </div>
        `;
    }
    function renderPosList(containerElement, posItems = []) {
        containerElement.innerHTML = (posItems && posItems.length > 0) ? posItems.map(createPosEntryHTML).join('') : createPosEntryHTML();
    }
    function addPosField(containerElement) {
        containerElement.insertAdjacentHTML('beforeend', createPosEntryHTML());
    }
    function collectPos(containerElement) {
        const posItems = [];
        containerElement.querySelectorAll('.pos-entry').forEach(entry => {
            const name = entry.querySelector('.pos-name').value;
            const quantity = entry.querySelector('.pos-quantity').value;
            // Сохраняем, только если выбрано название
            if (name) {
                posItems.push({ name, quantity: Number(quantity) || 1 });
            }
        });
        return posItems;
    }
    // --- Конец функций POS ---
    
    // --- Функции Управления Фото ---
    function createNewPhotoEntryHTML() {
        return `
            <div class="photo-entry new input-group mb-2">
                <input type="text" class="form-control photo-description" placeholder="Описание (н-р, Фасад)">
                <input type="file" class="form-control photo-file" accept="image/*">
                <button type="button" class="btn btn-outline-danger btn-remove-entry">
                    <i class="bi bi-trash"></i>
                </button>
            </div>
        `;
    }
    function renderExistingPhotos(containerElement, photos = []) {
        containerElement.innerHTML = (photos && photos.length > 0) ? photos.map(photo => `
            <div class="photo-entry existing input-group mb-2">
                <img src="${photo.photo_url}" class="preview-thumb">
                <input type="text" class="form-control photo-description" value="${photo.description || ''}">
                <button type="button" class="btn btn-outline-danger btn-remove-entry">
                    <i class="bi bi-trash"></i>
                </button>
                <input type="hidden" class="photo-url" value="${photo.photo_url}"> 
            </div>
        `).join('') : ''; 
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
                photoPromises.push(
                    toBase64(file).then(base64Url => {
                        return { description, photo_url: base64Url };
                    })
                );
            }
        });

        return await Promise.all(photoPromises);
    }
    // --- Конец функций Фото ---

    // --- Функция: Отрисовка чек-листа товаров ---
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
                <input type="checkbox" 
                       class="form-check-input"
                       id="prod-${container.id}-${productId}" 
                       value="${productId}"
                       ${selectedSet.has(productId) ? 'checked' : ''}>
                <label class="form-check-label" for="prod-${container.id}-${productId}">
                    <strong>${product.sku}</strong> - ${product.name}
                </label>
            </div>
        `}).join('');
    }

    // --- Функция: Сбор ID из чек-листа ---
    function getSelectedProductIds(containerId) {
        const container = document.getElementById(containerId);
        const checkboxes = container.querySelectorAll('input[type="checkbox"]:checked');
        return Array.from(checkboxes).map(cb => cb.value);
    }
    
    // --- Функция: Сохранение связей товаров с дилером ---
    async function saveDealerProductLinks(dealerId, productIds) {
        try {
            await fetch(`${API_DEALERS_URL}/${dealerId}/products`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ productIds })
            });
        } catch (error) {
            console.error(error);
            alert("Ошибка: Не удалось сохранить список товаров.");
        }
    }

    // --- Функция: Заполнение фильтров ---
    function populateFilters(dealers) {
        const cities = [...new Set(dealers.map(d => d.city).filter(Boolean))]; 
        const priceTypes = [...new Set(dealers.map(d => d.price_type).filter(Boolean))];
        cities.sort();
        priceTypes.sort();
        const currentCity = filterCity.value;
        const currentPriceType = filterPriceType.value;
        filterCity.innerHTML = '<option value="">-- Все города --</option>';
        filterPriceType.innerHTML = '<option value="">-- Все типы --</option>';
        cities.forEach(city => filterCity.add(new Option(city, city)));
        priceTypes.forEach(type => filterPriceType.add(new Option(type, type)));
        filterCity.value = currentCity;
        filterPriceType.value = currentPriceType;
    }

    // --- Функция: Отрисовка списка дилеров ---
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
        const safeText = (text) => text ? text.replace(/</g, "&lt;").replace(/>/g, "&gt;") : '---';

        if (sortedDealers.length === 0) {
            dealerTable.style.display = 'none';
            noDataMsg.style.display = 'block';
            noDataMsg.textContent = allDealers.length === 0 ? 'Список дилеров пока пуст. Добавьте первого!' : 'По вашим фильтрам дилеры не найдены.';
            return;
        }

        dealerTable.style.display = 'table';
        noDataMsg.style.display = 'none';

        sortedDealers.forEach((dealer, index) => { 
            const row = dealerListBody.insertRow();
            const dealerId = dealer.id; 
            
            row.innerHTML = `
                <td class="cell-number">${index + 1}</td>
                <td>
                    ${dealer.photo_url ? 
                        `<img src="${dealer.photo_url}" alt="Фото" class="table-photo">` : 
                        `<div class="no-photo">Нет фото</div>`
                    }
                </td>
                <td>${safeText(dealer.dealer_id)}</td>
                <td>${safeText(dealer.name)}</td>
                <td>${safeText(dealer.city)}</td>
                <td>${safeText(dealer.price_type)}</td>
                <td>${safeText(dealer.organization)}</td>
                <td class="actions-cell">
                    <div class="dropdown">
                        <button class="btn btn-light btn-sm" type="button" data-bs-toggle="dropdown">
                            <i class="bi bi-three-dots-vertical"></i>
                        </button>
                        <ul class="dropdown-menu dropdown-menu-end">
                            <li><a class="dropdown-item btn-view" data-id="${dealerId}" href="#">
                                <i class="bi bi-eye me-2"></i>Просмотреть
                            </a></li>
                            <li><a class="dropdown-item btn-edit" data-id="${dealerId}" href="#">
                                <i class="bi bi-pencil me-2"></i>Редактировать
                            </a></li>
                            <li><hr class="dropdown-divider"></li>
                            <li><a class="dropdown-item text-danger btn-delete" data-id="${dealerId}" data-name="${safeText(dealer.name)}" href="#">
                                <i class="bi bi-trash me-2"></i>Удалить
                            </a></li>
                        </ul>
                    </div>
                </td>
            `;
        });
    }

    // --- Функция: Инициализация ---
    async function initApp() {
        await fetchProductCatalog(); 
        try {
            const response = await fetch(API_DEALERS_URL);
            if (!response.ok) throw new Error('Network response was not ok');
            allDealers = await response.json(); 
            populateFilters(allDealers); 
            renderDealerList(); 
        } catch (error) {
            console.error('Ошибка при загрузке дилеров:', error);
            dealerListBody.innerHTML = `<tr><td colspan="8" style="color: red; text-align: center;">Не удалось загрузить список дилеров.</td></tr>`;
        }
        
        const pendingEditId = localStorage.getItem('pendingEditDealerId');
        if (pendingEditId) {
            localStorage.removeItem('pendingEditDealerId');
            openEditModal(pendingEditId); 
        }
    }

    // --- (ИЗМЕНЕНО) Обработчики: Модальное окно "Добавить" ---
    openAddModalBtn.onclick = () => {
        addForm.reset(); // Сбрасываем форму
        renderProductChecklist(addProductChecklist);
        renderContactList(addContactList);
        renderAddressList(addAddressList);
        renderPosList(addPosList); // (НОВОЕ)
        addPhotoList.innerHTML = createNewPhotoEntryHTML(); 
        addModal.show();
    };

    // --- (ИЗМЕНЕНО) Обработчик: Добавление нового дилера ---
    addForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        let photosPromise = collectPhotos(addPhotoList);
        
        const dealerData = {
            dealer_id: document.getElementById('dealer_id').value,
            name: document.getElementById('name').value,
            organization: document.getElementById('organization').value,
            price_type: document.getElementById('price_type').value,
            city: document.getElementById('city').value,
            address: document.getElementById('address').value,
            delivery: document.getElementById('delivery').value, 
            website: document.getElementById('website').value, 
            instagram: document.getElementById('instagram').value, 
            contacts: collectContacts(addContactList), 
            additional_addresses: collectAddresses(addAddressList),
            pos_materials: collectPos(addPosList), // (НОВОЕ)
            bonuses: document.getElementById('bonuses').value,
            photos: await photosPromise 
        };

        try {
            const response = await fetch(API_DEALERS_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dealerData)
            });
            if (!response.ok) throw new Error('Ошибка при создании дилера');
            const newDealer = await response.json();
            const newDealerId = newDealer.id; 
            const selectedProductIds = getSelectedProductIds('add-product-checklist');
            if (selectedProductIds.length > 0) {
                await saveDealerProductLinks(newDealerId, selectedProductIds);
            }
            addModal.hide();
            await initApp(); 
        } catch (error) {
            console.error('Ошибка при добавлении:', error);
            alert('Ошибка при добавлении дилера.');
        }
    });

    // --- (ИЗМЕНЕНО) Функция: Открытие и загрузка модального окна "Редактировать" ---
    async function openEditModal(id) {
        editProductChecklist.innerHTML = "<p>Загрузка товаров...</p>";
        editContactList.innerHTML = "<p>Загрузка контактов...</p>";
        editPhotoList.innerHTML = "<p>Загрузка фото...</p>"; 
        editAddressList.innerHTML = "<p>Загрузка адресов...</p>";
        editPosList.innerHTML = "<p>Загрузка оборудования...</p>"; // (НОВОЕ)
        editModal.show();
        
        try {
            const dealerRes = await fetch(`${API_DEALERS_URL}/${id}`);
            if (!dealerRes.ok) throw new Error("Не удалось загрузить данные дилера");
            
            const data = await dealerRes.json();
            const selectedProducts = data.products || []; 
            const selectedProductIds = selectedProducts.map(p => p.id); 

            document.getElementById('edit_db_id').value = data.id; 
            document.getElementById('edit_dealer_id').value = data.dealer_id;
            document.getElementById('edit_name').value = data.name;
            document.getElementById('edit_organization').value = data.organization;
            document.getElementById('edit_price_type').value = data.price_type;
            document.getElementById('edit_city').value = data.city;
            document.getElementById('edit_address').value = data.address;
            document.getElementById('edit_delivery').value = data.delivery; 
            document.getElementById('edit_website').value = data.website; 
            document.getElementById('edit_instagram').value = data.instagram; 
            document.getElementById('edit_bonuses').value = data.bonuses;
            
            renderContactList(editContactList, data.contacts);
            renderAddressList(editAddressList, data.additional_addresses);
            renderPosList(editPosList, data.pos_materials); // (НОВОЕ)
            renderProductChecklist(editProductChecklist, selectedProductIds);
            renderExistingPhotos(editPhotoList, data.photos); 
            
        } catch (error) {
            console.error("Ошибка при открытии редактора:", error);
            editModal.hide();
            alert("Не удалось загрузить данные для редактирования.");
        }
    }
    
    // --- Обработчик: Клик по СПИСКУ (Меню "...") ---
    dealerListBody.addEventListener('click', async (e) => {
        const target = e.target;
        
        const viewButton = target.closest('.btn-view');
        if (viewButton) {
            e.preventDefault();
            const id = viewButton.dataset.id;
            window.open(`dealer.html?id=${id}`, '_blank');
        }

        const editButton = target.closest('.btn-edit');
        if (editButton) {
            e.preventDefault();
            const id = editButton.dataset.id;
            openEditModal(id); 
        }
        
        const deleteButton = target.closest('.btn-delete');
        if (deleteButton) {
            e.preventDefault();
            const id = deleteButton.dataset.id;
            const name = deleteButton.dataset.name;
            if (confirm(`Вы уверены, что хотите удалить дилера "${name}"?`)) {
                try {
                    await fetch(`${API_DEALERS_URL}/${id}`, { method: 'DELETE' });
                    await initApp(); 
                } catch (error) {
                    alert('Ошибка при удалении дилера.');
                }
            }
        }
    });

    // --- (ИЗМЕНЕНО) Обработчик: Сохранение изменений (Редактирование) ---
    editForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('edit_db_id').value; 

        let photosPromise = collectPhotos(editPhotoList);

        const updatedData = {
            dealer_id: document.getElementById('edit_dealer_id').value,
            name: document.getElementById('edit_name').value,
            organization: document.getElementById('edit_organization').value,
            price_type: document.getElementById('edit_price_type').value,
            city: document.getElementById('edit_city').value,
            address: document.getElementById('edit_address').value,
            delivery: document.getElementById('edit_delivery').value, 
            website: document.getElementById('edit_website').value, 
            instagram: document.getElementById('edit_instagram').value, 
            contacts: collectContacts(editContactList),
            additional_addresses: collectAddresses(editAddressList),
            pos_materials: collectPos(editPosList), // (НОВОЕ)
            bonuses: document.getElementById('edit_bonuses').value,
            photos: await photosPromise 
        };
        
        const selectedProductIds = getSelectedProductIds('edit-product-checklist');

        try {
            const response = await fetch(`${API_DEALERS_URL}/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedData)
            });
            if (!response.ok) throw new Error('Ошибка при сохранении данных дилера');
            
            await saveDealerProductLinks(id, selectedProductIds);
            
            editModal.hide();
            await initApp(); 
            
        } catch (error) {
            console.error('Ошибка при обновлении:', error);
            alert('Ошибка при сохранении изменений.');
        }
    });

    // --- Обработчики: Фильтры и Поиск ---
    filterCity.addEventListener('change', renderDealerList);
    filterPriceType.addEventListener('change', renderDealerList);
    searchBar.addEventListener('input', renderDealerList);

    // --- Обработчики: СОРТИРОВКА ---
    document.querySelectorAll('#dealer-table th[data-sort]').forEach(th => {
        th.addEventListener('click', () => {
            const column = th.dataset.sort;
            if (currentSort.column === column) {
                currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
            } else {
                currentSort.column = column;
                currentSort.direction = 'asc';
            }
            renderDealerList(); 
        });
    });

    // --- (ИЗМЕНЕНО) Обработчики: Кнопки "Добавить" (Контакты, Фото, Адреса, POS) ---
    addContactBtnAdd.onclick = () => addContactField(addContactList);
    addContactBtnEdit.onclick = () => addContactField(editContactList);
    addPhotoBtnAdd.onclick = () => addPhotoList.insertAdjacentHTML('beforeend', createNewPhotoEntryHTML());
    addPhotoBtnEdit.onclick = () => editPhotoList.insertAdjacentHTML('beforeend', createNewPhotoEntryHTML());
    addAddressBtnAdd.onclick = () => addAddressField(addAddressList);
    addAddressBtnEdit.onclick = () => addAddressField(editAddressList);
    addPosBtnAdd.onclick = () => addPosField(addPosList); // (НОВОЕ)
    addPosBtnEdit.onclick = () => addPosField(editPosList); // (НОВОЕ)


    // --- (ИЗМЕНЕНО) Обработчики: Кнопки "Удалить" (X) ---
    function handleListClick(e) {
        if (e.target.classList.contains('btn-remove-entry')) {
            e.target.closest('.contact-entry, .photo-entry, .address-entry, .pos-entry').remove();
        }
    }
    addModalEl.addEventListener('click', handleListClick);
    editModalEl.addEventListener('click', handleListClick);
    
    // --- Инициализация ---
    initApp();
});
