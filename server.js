// script.js
document.addEventListener('DOMContentLoaded', () => {
    
    const API_DEALERS_URL = '/api/dealers';
    const API_PRODUCTS_URL = '/api/products'; 

    let fullProductCatalog = [];

    // --- Модальное окно ДОБАВЛЕНИЯ ---
    const addModal = document.getElementById('add-modal');
    const openAddModalBtn = document.getElementById('open-add-modal-btn');
    const closeAddModalBtn = addModal.querySelector('.close-btn');
    const addForm = document.getElementById('add-dealer-form');
    const addProductChecklist = document.getElementById('add-product-checklist'); 
    const addContactList = document.getElementById('add-contact-list'); 
    const addContactBtnAdd = document.getElementById('add-contact-btn-add-modal'); 
    const addPhotoList = document.getElementById('add-photo-list'); 
    const addPhotoBtnAdd = document.getElementById('add-photo-btn-add-modal'); 
    const addAddressList = document.getElementById('add-address-list'); 
    const addAddressBtnAdd = document.getElementById('add-address-btn-add-modal'); 
    
    // --- Элементы списка ---
    const dealerListBody = document.getElementById('dealer-list-body');
    const dealerTable = document.getElementById('dealer-table');
    const noDataMsg = document.getElementById('no-data-msg');

    // --- Элементы ФИЛЬТРОВ ---
    const filterCity = document.getElementById('filter-city');
    const filterPriceType = document.getElementById('filter-price-type');

    let allDealers = [];
    let currentSort = { column: 'name', direction: 'asc' };

    // --- Модальное окно РЕДАКТИРОВАНИЯ ---
    const modal = document.getElementById('edit-modal');
    const closeModalBtn = modal.querySelector('.close-btn');
    const editForm = document.getElementById('edit-dealer-form');
    const editProductChecklist = document.getElementById('edit-product-checklist'); 
    const editContactList = document.getElementById('edit-contact-list'); 
    const addContactBtnEdit = document.getElementById('add-contact-btn-edit-modal'); 
    const editPhotoList = document.getElementById('edit-photo-list'); 
    const addPhotoBtnEdit = document.getElementById('add-photo-btn-edit-modal'); 
    const editAddressList = document.getElementById('edit-address-list'); 
    const addAddressBtnEdit = document.getElementById('add-address-btn-edit-modal'); 

    // --- Функция: Конвертер файла в Base64 ---
    const toBase64 = file => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });

    // --- (ИЗМЕНЕНО) Функция: Загрузка каталога товаров в кэш ---
    async function fetchProductCatalog() {
        if (fullProductCatalog.length > 0) return; 
        try {
            const response = await fetch(API_PRODUCTS_URL);
            if (!response.ok) throw new Error('Ошибка сети при загрузке каталога');
            fullProductCatalog = await response.json();
            
            // (НОВОЕ) Гарантируем сортировку по имени (на всякий случай)
            fullProductCatalog.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
            
            console.log(`Загружено ${fullProductCatalog.length} товаров в каталог.`);
        } catch (error) {
            console.error("Критическая ошибка: не удалось загрузить каталог товаров.", error);
            addProductChecklist.innerHTML = `<p style='color:red'>${error.message}</p>`;
            editProductChecklist.innerHTML = `<p style='color:red'>${error.message}</p>`;
        }
    }

    // --- Функции Управления Контактами ---
    function createContactEntryHTML(contact = {}) {
        const safeName = contact.name || '';
        const safePosition = contact.position || '';
        const safeContactInfo = contact.contactInfo || '';
        return `
            <div class="contact-entry">
                <input type="text" class="contact-name" placeholder="Имя" value="${safeName}">
                <input type="text" class="contact-position" placeholder="Должность" value="${safePosition}">
                <input type="text" class="contact-info" placeholder="Телефон / Email" value="${safeContactInfo}">
                <button type="button" class="btn-remove-entry">X</button>
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
            <div class="address-entry">
                <input type="text" class="address-description" placeholder="Описание (н-р, Склад)" value="${safeDesc}">
                <input type="text" class="address-city" placeholder="Город" value="${safeCity}">
                <input type="text" class="address-address" placeholder="Адрес" value="${safeAddress}">
                <button type="button" class="btn-remove-entry">X</button>
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
    
    // --- Функции Управления Фото ---
    function createNewPhotoEntryHTML() {
        return `
            <div class="photo-entry new">
                <input type="text" class="photo-description" placeholder="Описание (н-р, Фасад)">
                <input type="file" class="photo-file" accept="image/*">
                <button type="button" class="btn-remove-entry">X</button>
            </div>
        `;
    }
    function renderExistingPhotos(containerElement, photos = []) {
        containerElement.innerHTML = (photos && photos.length > 0) ? photos.map(photo => `
            <div class="photo-entry existing">
                <img src="${photo.photo_url}" class="preview-thumb">
                <input type="text" class="photo-description" value="${photo.description || ''}">
                <button type="button" class="btn-remove-entry">X</button>
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
            <div class="checklist-item">
                <input type="checkbox" 
                       id="prod-${container.id}-${productId}" 
                       value="${productId}"
                       ${selectedSet.has(productId) ? 'checked' : ''}>
                <label for="prod-${container.id}-${productId}">
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
        const filteredDealers = allDealers.filter(dealer => {
            const cityMatch = !selectedCity || dealer.city === selectedCity;
            const priceTypeMatch = !selectedPriceType || dealer.price_type === selectedPriceType;
            return cityMatch && priceTypeMatch;
        });

        const sortedDealers = filteredDealers.sort((a, b) => {
            const col = currentSort.column;
            let valA = (a[col] || '').toString().toLowerCase(); 
            let valB = (b[col] || '').toString().toLowerCase();
            let comparison = 0;
            if (valA > valB) comparison = 1;
            else if (valA < valB) comparison = -1;
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

        sortedDealers.forEach(dealer => {
            const row = dealerListBody.insertRow();
            const dealerId = dealer.id; 
            
            const cellPhoto = row.insertCell();
            if (dealer.photo_url) {
                cellPhoto.innerHTML = `<img src="${dealer.photo_url}" alt="Фото" class="table-photo">`;
            } else {
                cellPhoto.innerHTML = `<div class="no-photo">Нет фото</div>`;
            }
            
            row.insertCell().textContent = safeText(dealer.dealer_id);
            const cellName = row.insertCell();
            cellName.innerHTML = `<a href="dealer.html?id=${dealerId}" target="_blank">${safeText(dealer.name)}</a>`;
            row.insertCell().textContent = safeText(dealer.city);
            row.insertCell().textContent = safeText(dealer.price_type);
            row.insertCell().textContent = safeText(dealer.organization);
            const cellActions = row.insertCell();
            cellActions.className = 'actions-cell';
            cellActions.innerHTML = `<button class="edit-btn" data-id="${dealerId}">✏️ Ред.</button>`;
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
            dealerListBody.innerHTML = `<tr><td colspan="7" style="color: red; text-align: center;">Не удалось загрузить список дилеров.</td></tr>`;
        }
    }

    // --- Обработчики: Модальное окно "Добавить" ---
    openAddModalBtn.onclick = () => {
        renderProductChecklist(addProductChecklist);
        renderContactList(addContactList);
        renderAddressList(addAddressList);
        addPhotoList.innerHTML = createNewPhotoEntryHTML(); 
        addModal.style.display = 'block';
    };
    closeAddModalBtn.onclick = () => {
        addModal.style.display = 'none';
        addForm.reset();
    };

    // --- Обработчик: Добавление нового дилера ---
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
            addModal.style.display = 'none';
            addForm.reset();
            await initApp(); 
        } catch (error) {
            console.error('Ошибка при добавлении:', error);
            alert('Ошибка при добавлении дилера.');
        }
    });

    // --- Обработчик: Клик по СПИСКУ (Редактирование) ---
    dealerListBody.addEventListener('click', async (e) => {
        const target = e.target;
        const editButton = target.closest('.edit-btn');
        if (editButton) {
            const id = editButton.dataset.id;
            editProductChecklist.innerHTML = "<p>Загрузка товаров...</p>";
            editContactList.innerHTML = "<p>Загрузка контактов...</p>";
            editPhotoList.innerHTML = "<p>Загрузка фото...</p>"; 
            editAddressList.innerHTML = "<p>Загрузка адресов...</p>";
            
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
                renderProductChecklist(editProductChecklist, selectedProductIds);
                renderExistingPhotos(editPhotoList, data.photos); 
                
                modal.style.display = 'block';
                
            } catch (error) {
                console.error("Ошибка при открытии редактора:", error);
                alert("Не удалось загрузить данные для редактирования.");
            }
        }
    });

    // --- Обработчик: Закрытие модальных окон (Оба) ---
    closeModalBtn.onclick = () => {
        modal.style.display = 'none';
        editForm.reset();
    };
    window.onclick = (event) => {
        if (event.target == modal) {
            modal.style.display = 'none';
            editForm.reset();
        }
        if (event.target == addModal) {
            addModal.style.display = 'none';
            addForm.reset();
        }
    };

    // --- Обработчик: Сохранение изменений (Редактирование) ---
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
            
            modal.style.display = 'none';
            editForm.reset();
            await initApp(); 
            
        } catch (error) {
            console.error('Ошибка при обновлении:', error);
            alert('Ошибка при сохранении изменений.');
        }
    });

    // --- Обработчики: Изменение фильтров ---
    filterCity.addEventListener('change', renderDealerList);
    filterPriceType.addEventListener('change', renderDealerList);

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

    // --- Обработчики: Кнопки "Добавить" (Контакты, Фото, Адреса) ---
    addContactBtnAdd.onclick = () => addContactField(addContactList);
    addContactBtnEdit.onclick = () => addContactField(editContactList);
    addPhotoBtnAdd.onclick = () => addPhotoList.insertAdjacentHTML('beforeend', createNewPhotoEntryHTML());
    addPhotoBtnEdit.onclick = () => editPhotoList.insertAdjacentHTML('beforeend', createNewPhotoEntryHTML());
    addAddressBtnAdd.onclick = () => addAddressField(addAddressList);
    addAddressBtnEdit.onclick = () => addAddressField(editAddressList);

    // --- Обработчики: Кнопки "Удалить" (X) ---
    function handleListClick(e) {
        if (e.target.classList.contains('btn-remove-entry')) {
            e.target.closest('.contact-entry, .photo-entry, .address-entry').remove();
        }
    }
    addModal.addEventListener('click', handleListClick);
    modal.addEventListener('click', handleListClick);
    
    // --- Инициализация ---
    initApp();
});
