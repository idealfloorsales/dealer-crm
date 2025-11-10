// script.js
document.addEventListener('DOMContentLoaded', () => {
    
    const API_DEALERS_URL = '/api/dealers';
    const API_PRODUCTS_URL = '/api/products'; 

    let fullProductCatalog = [];

    // Модальное окно ДОБАВЛЕНИЯ
    const addModal = document.getElementById('add-modal');
    const openAddModalBtn = document.getElementById('open-add-modal-btn');
    const closeAddModalBtn = addModal.querySelector('.close-btn');
    const addForm = document.getElementById('add-dealer-form');
    const addProductChecklist = document.getElementById('add-product-checklist'); 
    
    // Элементы списка
    const dealerListBody = document.getElementById('dealer-list-body');
    const dealerTable = document.getElementById('dealer-table');

    // Элементы ФИЛЬТРОВ
    const filterCity = document.getElementById('filter-city');
    const filterPriceType = document.getElementById('filter-price-type');

    let allDealers = [];
    let currentSort = { column: 'name', direction: 'asc' };

    // Модальное окно РЕДАКТИРОВАНИЯ
    const modal = document.getElementById('edit-modal');
    const closeModalBtn = modal.querySelector('.close-btn');
    const editForm = document.getElementById('edit-dealer-form');
    const editPhotoPreview = document.getElementById('edit_photo_preview');
    const clearPhotoBtn = document.getElementById('clear-photo-btn');
    const editProductChecklist = document.getElementById('edit-product-checklist'); 

    // --- Функция: Конвертер файла в Base64 ---
    const toBase64 = file => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });

    // --- Функция: Загрузка каталога товаров в кэш ---
    async function fetchProductCatalog() {
        if (fullProductCatalog.length > 0) {
            return; 
        }
        try {
            const response = await fetch(API_PRODUCTS_URL);
            fullProductCatalog = await response.json();
            console.log(`Загружено ${fullProductCatalog.length} товаров в каталог.`);
        } catch (error) {
            console.error("Критическая ошибка: не удалось загрузить каталог товаров.", error);
            addProductChecklist.innerHTML = "<p style='color:red'>Ошибка загрузки каталога!</p>";
            editProductChecklist.innerHTML = "<p style='color:red'>Ошибка загрузки каталога!</p>";
        }
    }

    // --- Функция: Отрисовка чек-листа товаров ---
    function renderProductChecklist(container, selectedProductIds = []) {
        // (ИЗМЕНЕНО) MongoDB _id - это строки, а не числа
        const selectedSet = new Set(selectedProductIds); 
        
        if (fullProductCatalog.length === 0) {
            container.innerHTML = "<p>Каталог пуст.</p>";
            return;
        }

        container.innerHTML = fullProductCatalog.map(product => {
            // (ИЗМЕНЕНО) MongoDB использует _id
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
        const container = document.getElementById(containerId);
        const checkboxes = container.querySelectorAll('input[type="checkbox"]:checked');
        return Array.from(checkboxes).map(cb => cb.value);
    }
    
    // --- Функция: Сохранение связей товаров с дилером ---
    async function saveDealerProductLinks(dealerId, productIds) {
        try {
            const response = await fetch(`${API_DEALERS_URL}/${dealerId}/products`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ productIds })
            });
            if (!response.ok) {
                throw new Error('Ошибка при сохранении списка товаров дилера');
            }
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
            // (ИЗМЕНЕНО) MongoDB использует _id, но мы добавили 'id'
            const dealerId = dealer._id || dealer.id; 
            
            const cellPhoto = row.insertCell();
            if (dealer.photo_url) cellPhoto.innerHTML = `<img src="${dealer.photo_url}" alt="Фото" class="table-photo">`;
            else cellPhoto.innerHTML = `<div class="no-photo">Нет фото</div>`;
            
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
        addModal.style.display = 'block';
    };
    closeAddModalBtn.onclick = () => {
        addModal.style.display = 'none';
        addForm.reset();
    };

    // --- Обработчик: Добавление нового дилера ---
    addForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const photoInput = document.getElementById('photo_upload');
        let photoDataUrl = null;

        if (photoInput.files && photoInput.files[0]) {
            try { photoDataUrl = await toBase64(photoInput.files[0]); } 
            catch (error) { return alert("Ошибка при чтении фото."); }
        }
        
        const dealerData = {
            dealer_id: document.getElementById('dealer_id').value,
            name: document.getElementById('name').value,
            organization: document.getElementById('organization').value,
            price_type: document.getElementById('price_type').value,
            city: document.getElementById('city').value,
            address: document.getElementById('address').value,
            contacts: document.getElementById('contacts').value,
            bonuses: document.getElementById('bonuses').value,
            photo_url: photoDataUrl 
        };

        try {
            const response = await fetch(API_DEALERS_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dealerData)
            });
            
            if (!response.ok) throw new Error('Ошибка при создании дилера');
            
            const newDealer = await response.json();
            const newDealerId = newDealer._id; // (ИЗМЕНЕНО) MongoDB использует _id

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
            const id = editButton.dataset.id; // Это _id
            
            editProductChecklist.innerHTML = "<p>Загрузка товаров...</p>";
            
            try {
                const [dealerRes, productsRes] = await Promise.all([
                    fetch(`${API_DEALERS_URL}/${id}`),
                    fetch(`${API_DEALERS_URL}/${id}/products`)
                ]);

                if (!dealerRes.ok) throw new Error("Не удалось загрузить данные дилера");
                if (!productsRes.ok) throw new Error("Не удалось загрузить товары дилера");
                
                const data = await dealerRes.json();
                const selectedProducts = await productsRes.json(); 
                
                const selectedProductIds = selectedProducts.map(p => p._id || p.id); // (ИЗМЕНЕНО)

                document.getElementById('edit_db_id').value = data._id; 
                document.getElementById('edit_dealer_id').value = data.dealer_id;
                document.getElementById('edit_name').value = data.name;
                document.getElementById('edit_organization').value = data.organization;
                document.getElementById('edit_price_type').value = data.price_type;
                document.getElementById('edit_city').value = data.city;
                document.getElementById('edit_address').value = data.address;
                document.getElementById('edit_contacts').value = data.contacts;
                document.getElementById('edit_bonuses').value = data.bonuses;
                document.getElementById('edit_photo_url_old').value = data.photo_url || '';
                document.getElementById('edit_photo_upload').value = null;

                if (data.photo_url) {
                    editPhotoPreview.src = data.photo_url;
                    editPhotoPreview.style.display = 'block';
                } else {
                    editPhotoPreview.src = '';
                    editPhotoPreview.style.display = 'none';
                }
                
                renderProductChecklist(editProductChecklist, selectedProductIds);
                
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
        const id = document.getElementById('edit_db_id').value; // Это _id
        const photoInput = document.getElementById('edit_photo_upload');
        let photoDataUrl = document.getElementById('edit_photo_url_old').value; 

        if (photoInput.files && photoInput.files[0]) {
             try { photoDataUrl = await toBase64(photoInput.files[0]); } 
             catch (error) { return alert("Ошибка при чтении нового фото."); }
        } else if (photoDataUrl === '') {
            photoDataUrl = null;
        }
        photoInput.value = null;

        const updatedData = {
            dealer_id: document.getElementById('edit_dealer_id').value,
            name: document.getElementById('edit_name').value,
            organization: document.getElementById('edit_organization').value,
            price_type: document.getElementById('edit_price_type').value,
            city: document.getElementById('city').value,
            address: document.getElementById('address').value,
            contacts: document.getElementById('edit_contacts').value,
            bonuses: document.getElementById('edit_bonuses').value,
            photo_url: photoDataUrl
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

    // --- Обработчик: "Удалить фото" ---
    clearPhotoBtn.addEventListener('click', () => {
        editPhotoPreview.src = '';
        editPhotoPreview.style.display = 'none';
        document.getElementById('edit_photo_url_old').value = '';
        document.getElementById('edit_photo_upload').value = null;
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

    // --- Инициализация ---
    initApp();
});
