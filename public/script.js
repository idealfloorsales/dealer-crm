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
    const addPhotoList = document.getElementById('add-photo-list'); // (НОВОЕ)
    const addPhotoBtnAdd = document.getElementById('add-photo-btn-add-modal'); // (НОВОЕ)
    
    // --- Элементы списка ---
    const dealerListBody = document.getElementById('dealer-list-body');
    const dealerTable = document.getElementById('dealer-table');

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
    const editPhotoList = document.getElementById('edit-photo-list'); // (НОВОЕ)
    const addPhotoBtnEdit = document.getElementById('add-photo-btn-edit-modal'); // (НОВОЕ)

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
            fullProductCatalog = await response.json();
            console.log(`Загружено ${fullProductCatalog.length} товаров в каталог.`);
        } catch (error) {
            console.error("Критическая ошибка: не удалось загрузить каталог товаров.", error);
            // ... (сообщения об ошибках) ...
        }
    }

    // --- Функции Управления Контактами ---
    function createContactEntryHTML(contact = {}) {
        return `
            <div class="contact-entry">
                <input type="text" class="contact-name" placeholder="Имя" value="${contact.name || ''}">
                <input type="text" class="contact-position" placeholder="Должность" value="${contact.position || ''}">
                <input type="text" class="contact-info" placeholder="Телефон / Email" value="${contact.contactInfo || ''}">
                <button type="button" class="btn-remove-entry">X</button>
            </div>
        `;
    }
    function renderContactList(containerElement, contacts = []) {
        containerElement.innerHTML = (contacts.length > 0) ? contacts.map(createContactEntryHTML).join('') : createContactEntryHTML();
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
    
    // --- (НОВЫЕ ФУНКЦИИ) Управление Фото ---
    
    // Создает HTML для НОВОГО (пустого) поля загрузки фото
    function createNewPhotoEntryHTML() {
        return `
            <div class="photo-entry new">
                <input type="text" class="photo-description" placeholder="Описание (н-р, Фасад)">
                <input type="file" class="photo-file" accept="image/*">
                <button type="button" class="btn-remove-entry">X</button>
            </div>
        `;
    }
    
    // Отрисовывает СУЩЕСТВУЮЩИЕ фото (для режима Редактирования)
    function renderExistingPhotos(containerElement, photos = []) {
        containerElement.innerHTML = photos.map(photo => `
            <div class="photo-entry existing">
                <img src="${photo.photo_url}" class="preview-thumb">
                <input type="text" class="photo-description" value="${photo.description || ''}">
                <button type="button" class="btn-remove-entry">X</button>
                <input type="hidden" class="photo-url" value="${photo.photo_url}"> 
            </div>
        `).join('');
    }

    // Собирает данные из полей фото (САМАЯ СЛОЖНАЯ ЧАСТЬ)
    async function collectPhotos(containerElement) {
        const photoPromises = [];
        
        // 1. Обрабатываем существующие фото (только в режиме Редактирования)
        containerElement.querySelectorAll('.photo-entry.existing').forEach(entry => {
            const description = entry.querySelector('.photo-description').value;
            const photo_url = entry.querySelector('.photo-url').value;
            // Это не Promise, но мы "заворачиваем" его для Promise.all
            photoPromises.push(Promise.resolve({ description, photo_url }));
        });

        // 2. Обрабатываем НОВЫЕ добавленные фото
        containerElement.querySelectorAll('.photo-entry.new').forEach(entry => {
            const description = entry.querySelector('.photo-description').value;
            const file = entry.querySelector('.photo-file').files[0];
            
            if (file) {
                // Это асинхронная операция!
                photoPromises.push(
                    toBase64(file).then(base64Url => {
                        return { description, photo_url: base64Url };
                    })
                );
            }
        });

        // Ждем, пока ВСЕ файлы (новые) будут сконвертированы
        return await Promise.all(photoPromises);
    }
    // --- Конец функций Фото ---


    // --- Функция: Отрисовка чек-листа товаров ---
    function renderProductChecklist(container, selectedProductIds = []) {
        // ... (код без изменений) ...
        const selectedSet = new Set(selectedProductIds); 
        if (fullProductCatalog.length === 0) {
            container.innerHTML = "<p>Каталог пуст.</p>";
            return;
        }
        container.innerHTML = fullProductCatalog.map(product => {
            const productId = product._id || product.id; 
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
        // ... (код без изменений) ...
        const container = document.getElementById(containerId);
        const checkboxes = container.querySelectorAll('input[type="checkbox"]:checked');
        return Array.from(checkboxes).map(cb => cb.value);
    }
    
    // --- Функция: Сохранение связей товаров с дилером ---
    async function saveDealerProductLinks(dealerId, productIds) {
        // ... (код без изменений) ...
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
        // ... (код без изменений) ...
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

    // --- (ИЗМЕНЕНО) Функция: Отрисовка списка дилеров ---
    function renderDealerList() {
        // ... (код фильтрации и сортировки без изменений) ...
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
            let noDataMsg = document.getElementById('no-data-msg');
            if (!noDataMsg) {
                noDataMsg = document.createElement('p');
                noDataMsg.id = 'no-data-msg';
                dealerTable.after(noDataMsg);
            }
            noDataMsg.textContent = allDealers.length === 0 ? 'Список дилеров пока пуст. Добавьте первого!' : 'По вашим фильтрам дилеры не найдены.';
            return;
        }
        dealerTable.style.display = 'table';
        let noDataMsg = document.getElementById('no-data-msg');
        if (noDataMsg) noDataMsg.textContent = '';
        
        sortedDealers.forEach(dealer => {
            const row = dealerListBody.insertRow();
            const dealerId = dealer._id || dealer.id; 
            
            const cellPhoto = row.insertCell();
            // (ИЗМЕНЕНО) Показываем первое фото (photo_url прилетает из API)
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
        addPhotoList.innerHTML = createNewPhotoEntryHTML(); // (НОВОЕ) Отрисовываем одно пустое поле фото
        addModal.style.display = 'block';
    };
    closeAddModalBtn.onclick = () => {
        addModal.style.display = 'none';
        addForm.reset();
    };

    // --- (ИЗМЕНЕНО) Обработчик: Добавление нового дилера ---
    addForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // (НОВОЕ) Запускаем сбор фото (асинхронно)
        let photosPromise = collectPhotos(addPhotoList);
        
        const dealerData = {
            dealer_id: document.getElementById('dealer_id').value,
            name: document.getElementById('name').value,
            organization: document.getElementById('organization').value,
            price_type: document.getElementById('price_type').value,
            city: document.getElementById('city').value,
            address: document.getElementById('address').value,
            contacts: collectContacts(addContactList), 
            bonuses: document.getElementById('bonuses').value,
            photos: await photosPromise // (НОВОЕ) Ждем завершения загрузки фото
        };

        try {
            const response = await fetch(API_DEALERS_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dealerData)
            });
            if (!response.ok) throw new Error('Ошибка при создании дилера');
            const newDealer = await response.json();
            const newDealerId = newDealer._id; 
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

    // --- (ИЗМЕНЕНО) Обработчик: Клик по СПИСКУ (Редактирование) ---
    dealerListBody.addEventListener('click', async (e) => {
        const target = e.target;
        const editButton = target.closest('.edit-btn');
        if (editButton) {
            const id = editButton.dataset.id; // Это _id
            editProductChecklist.innerHTML = "<p>Загрузка товаров...</p>";
            editContactList.innerHTML = "<p>Загрузка контактов...</p>";
            editPhotoList.innerHTML = "<p>Загрузка фото...</p>"; // (НОВОЕ)
            
            try {
                const [dealerRes, productsRes] = await Promise.all([
                    fetch(`${API_DEALERS_URL}/${id}`),
                    fetch(`${API_DEALERS_URL}/${id}/products`)
                ]);

                if (!dealerRes.ok) throw new Error("Не удалось загрузить данные дилера");
                if (!productsRes.ok) throw new Error("Не удалось загрузить товары дилера");
                
                const data = await dealerRes.json();
                const selectedProducts = await productsRes.json(); 
                const selectedProductIds = selectedProducts.map(p => p._id || p.id); 

                document.getElementById('edit_db_id').value = data._id; 
                document.getElementById('edit_dealer_id').value = data.dealer_id;
                document.getElementById('edit_name').value = data.name;
                document.getElementById('edit_organization').value = data.organization;
                document.getElementById('edit_price_type').value = data.price_type;
                document.getElementById('edit_city').value = data.city;
                document.getElementById('edit_address').value = data.address;
                document.getElementById('edit_bonuses').value = data.bonuses;
                
                renderContactList(editContactList, data.contacts);
                renderProductChecklist(editProductChecklist, selectedProductIds);
                renderExistingPhotos(editPhotoList, data.photos); // (НОВОЕ)
                
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

    // --- (ИЗМЕНЕНО) Обработчик: Сохранение изменений (Редактирование) ---
    editForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('edit_db_id').value; // Это _id

        // (НОВОЕ) Запускаем сбор фото (асинхронно)
        let photosPromise = collectPhotos(editPhotoList);

        const updatedData = {
            dealer_id: document.getElementById('edit_dealer_id').value,
            name: document.getElementById('edit_name').value,
            organization: document.getElementById('edit_organization').value,
            price_type: document.getElementById('edit_price_type').value,
            city: document.getElementById('edit_city').value,
            address: document.getElementById('edit_address').value,
            contacts: collectContacts(editContactList),
            bonuses: document.getElementById('edit_bonuses').value,
            photos: await photosPromise // (НОВОЕ) Ждем завершения
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

    // --- (УДАЛЕНО) Обработчик: "Удалить фото" (теперь это "btn-remove-entry") ---
    // clearPhotoBtn.addEventListener('click', ...); // Этот код больше не нужен

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

    // --- (НОВЫЕ) Обработчики: Кнопки "Добавить контакт" ---
    addContactBtnAdd.onclick = () => addContactField(addContactList);
    addContactBtnEdit.onclick = () => addContactField(editContactList);

    // --- (НОВЫЕ) Обработчики: Кнопки "Добавить фото" ---
    addPhotoBtnAdd.onclick = () => addPhotoList.insertAdjacentHTML('beforeend', createNewPhotoEntryHTML());
    addPhotoBtnEdit.onclick = () => editPhotoList.insertAdjacentHTML('beforeend', createNewPhotoEntryHTML());

    // --- (НОВЫЕ) Обработчики: Кнопки "Удалить" (X) для Контактов и Фото ---
    function handleListClick(e) {
        if (e.target.classList.contains('btn-remove-entry')) {
            e.target.closest('.contact-entry, .photo-entry').remove();
        }
    }
    addModal.addEventListener('click', handleListClick);
    modal.addEventListener('click', handleListClick);
    

    // --- Инициализация ---
    initApp();
});
