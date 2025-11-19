// report.js
document.addEventListener('DOMContentLoaded', () => {
    
    const API_MATRIX_URL = '/api/matrix';
    const API_PRODUCTS_URL = '/api/products'; // Для списка товаров
    
    // Элементы
    const matrixHeader = document.getElementById('matrix-header');
    const matrixBody = document.getElementById('matrix-body');
    const matrixContainer = document.getElementById('matrix-container');
    const loadingMsg = document.getElementById('loading-msg');
    const exportBtn = document.getElementById('export-csv-btn');
    
    // Фильтры
    const filterCity = document.getElementById('filter-city');
    const filterResponsible = document.getElementById('filter-responsible');

    // Мульти-селекты
    const dealerBtn = document.getElementById('dealer-dropdown-btn');
    const dealerMenu = document.getElementById('dealer-menu');
    const dealerListContainer = document.getElementById('dealer-list-container');
    const dealerSearch = document.getElementById('dealer-search');
    const dealerSelectAll = document.getElementById('dealer-select-all');
    const dealerClear = document.getElementById('dealer-clear');

    const productBtn = document.getElementById('product-dropdown-btn');
    const productMenu = document.getElementById('product-menu');
    const productListContainer = document.getElementById('product-list-container');
    const productSearch = document.getElementById('product-search');
    const productSelectAll = document.getElementById('product-select-all');
    const productClear = document.getElementById('product-clear');
    
    let fullData = { headers: [], matrix: [] };
    let allProducts = []; // Список всех товаров для фильтра
    
    let selectedDealerIds = new Set();
    let selectedProductSkus = new Set();

    const safeText = (text) => (text || '').toString().replace(/</g, "&lt;");

    // --- 1. Рендер Таблицы ---
    function renderMatrix() {
        const city = filterCity.value;
        const responsible = filterResponsible.value;
        
        // A. Фильтр КОЛОНОК (Дилеры)
        const filteredHeaders = fullData.headers.filter(h => {
            const matchFilters = (!city || h.city === city) && 
                                 (!responsible || h.responsible === responsible);
            
            // Если в мульти-селекте выбраны конкретные - показываем их.
            // Если НЕ выбраны - показываем всех, кто прошел фильтры Города/Отв.
            const matchCheckboxes = (selectedDealerIds.size === 0) || selectedDealerIds.has(h.id);
            
            return matchFilters && matchCheckboxes;
        });
        
        const visibleColumnIndices = new Set(filteredHeaders.map(h => fullData.headers.indexOf(h)));

        // B. Фильтр СТРОК (Товары)
        const filteredMatrix = fullData.matrix.filter(p => 
            (selectedProductSkus.size === 0) || selectedProductSkus.has(p.sku)
        );

        // C. Отрисовка
        if (!matrixHeader || !matrixBody) return;

        matrixHeader.innerHTML = `
            <tr>
                <th class="matrix-product-cell">Артикул</th>
                <th class="matrix-product-cell">Название</th>
                ${filteredHeaders.map(h => `<th>${safeText(h.name)}<br><small class="fw-normal text-muted" style="font-size:10px">${safeText(h.city)}</small></th>`).join('')}
            </tr>
        `;
        
       // ... внутри renderMatrix ...
        matrixBody.innerHTML = filteredMatrix.map(row => `
            <tr>
                <td title="${safeText(row.sku)}">${safeText(row.sku)}</td>
                <td title="${safeText(row.name)}">${safeText(row.name)}</td>
                ${row.dealers.map((cell, index) => {
                    if (!visibleColumnIndices.has(index)) return '';
                    
                    // (ИЗМЕНЕНО) Красивая галочка или точка
                    if (cell.has_product) {
                        return '<td><span class="matrix-check">✔</span></td>';
                    } else {
                        return '<td><span class="matrix-empty">·</span></td>';
                    }
                }).join('')}
            </tr>
        `).join('');

        updateDropdownLabels();
    }

    // --- 2. Инициализация ---
    async function initPage() {
        try {
            loadingMsg.style.display = 'block';
            
            // Загружаем матрицу и список товаров
            const [matrixRes, prodRes] = await Promise.all([
                fetch(API_MATRIX_URL),
                fetch(API_PRODUCTS_URL)
            ]);

            if (!matrixRes.ok || !prodRes.ok) throw new Error('Ошибка сети');
            fullData = await matrixRes.json(); 
            allProducts = await prodRes.json();
            
            populateGlobalFilters();  // Заполняем Город и Отв.
            
            // Заполняем списки галочек
            updateDealerListOptions(); // (НОВОЕ) Зависимый список дилеров
            populateProductList();     // Список товаров (он статичный)
            
            renderMatrix();    

            loadingMsg.style.display = 'none';
            matrixContainer.style.display = 'block';
        } catch (error) {
            loadingMsg.textContent = 'Ошибка загрузки: ' + error.message;
            loadingMsg.className = 'alert alert-danger';
        }
    }

    function populateGlobalFilters() {
        const cities = [...new Set(fullData.headers.map(h => h.city).filter(Boolean))].sort();
        filterCity.innerHTML = '<option value="">-- Все города --</option>';
        cities.forEach(c => filterCity.add(new Option(c, c)));
    }

    // --- (НОВОЕ) Умное обновление списка дилеров (3 фильтр) ---
    function updateDealerListOptions() {
        const city = filterCity.value;
        const responsible = filterResponsible.value;
        const term = dealerSearch.value.toLowerCase(); // Учитываем и поиск внутри списка

        // Фильтруем исходный список дилеров на основе 1 и 2 фильтра
        const availableDealers = fullData.headers.filter(d => {
            const matchCity = !city || d.city === city;
            const matchResp = !responsible || d.responsible === responsible;
            const matchSearch = !term || d.name.toLowerCase().includes(term);
            return matchCity && matchResp && matchSearch;
        });

        dealerListContainer.innerHTML = availableDealers.map(d => {
            const isChecked = selectedDealerIds.has(d.id) ? 'checked' : '';
            return `
            <div class="multi-select-item">
                <div class="form-check">
                    <input class="form-check-input dealer-checkbox" type="checkbox" value="${d.id}" id="d-${d.id}" ${isChecked}>
                    <label class="form-check-label" for="d-${d.id}">
                        ${safeText(d.name)} <small class="text-muted">(${safeText(d.city)})</small>
                    </label>
                </div>
            </div>`;
        }).join('');
        
        if (availableDealers.length === 0) {
            dealerListContainer.innerHTML = '<div class="p-2 text-muted small">Нет дилеров с такими параметрами</div>';
        }

        // Вешаем слушатели на новые чекбоксы
        document.querySelectorAll('.dealer-checkbox').forEach(cb => cb.addEventListener('change', (e) => {
            if (e.target.checked) selectedDealerIds.add(e.target.value); 
            else selectedDealerIds.delete(e.target.value);
            renderMatrix();
        }));
    }

    function populateProductList() {
        // Товары берем из allProducts (чтобы был полный список и сортировка)
        // Сортировка по артикулу уже есть с сервера
        productListContainer.innerHTML = allProducts.map(p => `
            <div class="multi-select-item">
                <div class="form-check">
                    <input class="form-check-input product-checkbox" type="checkbox" value="${p.sku}" id="p-${p.sku}">
                    <label class="form-check-label" for="p-${p.sku}">
                        <strong>${safeText(p.sku)}</strong> ${safeText(p.name)}
                    </label>
                </div>
            </div>
        `).join('');

        // Поиск внутри списка товаров
        productSearch.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            const items = productListContainer.querySelectorAll('.multi-select-item');
            items.forEach(item => {
                const text = item.textContent.toLowerCase();
                item.style.display = text.includes(term) ? 'block' : 'none';
            });
        });

        document.querySelectorAll('.product-checkbox').forEach(cb => cb.addEventListener('change', (e) => {
            if (e.target.checked) selectedProductSkus.add(e.target.value); 
            else selectedProductSkus.delete(e.target.value);
            renderMatrix();
        }));
    }

    function updateDropdownLabels() {
        dealerBtn.textContent = selectedDealerIds.size > 0 ? `Выбрано: ${selectedDealerIds.size}` : 'Все дилеры';
        productBtn.textContent = selectedProductSkus.size > 0 ? `Выбрано: ${selectedProductSkus.size}` : 'Все товары';
    }

    // --- 3. Управление UI ---
    function toggleMenu(menu) { menu.classList.toggle('show'); }
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#dealer-dropdown')) dealerMenu.classList.remove('show');
        if (!e.target.closest('#product-dropdown')) productMenu.classList.remove('show');
    });
    dealerBtn.onclick = () => toggleMenu(dealerMenu);
    productBtn.onclick = () => toggleMenu(productMenu);

    // Поиск внутри списка Дилеров (теперь вызывает перерисовку списка)
    dealerSearch.addEventListener('input', () => {
        updateDealerListOptions();
    });

    // Кнопки "Все" / "Сброс"
    const bulkAction = (container, className, set, action) => {
        container.querySelectorAll(`.${className}`).forEach(cb => {
            // Только если элемент видим (не скрыт поиском)
            if (cb.closest('.multi-select-item').style.display !== 'none') {
                cb.checked = action;
                if (action) set.add(cb.value); else set.delete(cb.value);
            }
        });
        renderMatrix();
    };

    dealerSelectAll.onclick = () => {
        // Выбираем только тех, кто сейчас в списке (с учетом фильтров города/отв)
        document.querySelectorAll('.dealer-checkbox').forEach(cb => {
             cb.checked = true;
             selectedDealerIds.add(cb.value);
        });
        renderMatrix();
    };
    dealerClear.onclick = () => {
        // Сбрасываем только видимых
        document.querySelectorAll('.dealer-checkbox').forEach(cb => {
             cb.checked = false;
             selectedDealerIds.delete(cb.value);
        });
        renderMatrix();
    };

    productSelectAll.onclick = () => bulkAction(productListContainer, 'product-checkbox', selectedProductSkus, true);
    productClear.onclick = () => bulkAction(productListContainer, 'product-checkbox', selectedProductSkus, false);

    // --- 4. Обработчики Глобальных Фильтров ---
    // При изменении Города или Ответственного -> обновляем список галочек Дилеров
    if(filterCity) filterCity.onchange = () => {
        updateDealerListOptions(); // Перестроить список галочек
        renderMatrix();            // Перестроить таблицу
    };
    if(filterResponsible) filterResponsible.onchange = () => {
        updateDealerListOptions();
        renderMatrix();
    };

    // --- 5. Экспорт ---
    if(exportBtn) exportBtn.onclick = () => {
        if (!fullData.matrix.length) return;
        
        const city = filterCity.value;
        const responsible = filterResponsible.value;
        
        const filteredHeaders = fullData.headers.filter(h => {
            const matchFilters = (!city || h.city === city) && (!responsible || h.responsible === responsible);
            const matchCheckboxes = (selectedDealerIds.size === 0) || selectedDealerIds.has(h.id);
            return matchFilters && matchCheckboxes;
        });
        
        const visibleColumnIndices = new Set(filteredHeaders.map(h => fullData.headers.indexOf(h)));
        const filteredMatrix = fullData.matrix.filter(p => (selectedProductSkus.size === 0) || selectedProductSkus.has(p.sku));

        const clean = (text) => `"${String(text || '').replace(/"/g, '""')}"`;
        let csv = "\uFEFFАртикул,Название,";
        csv += filteredHeaders.map(h => clean(h.name)).join(",") + "\r\n";

        filteredMatrix.forEach(row => {
            csv += `${clean(row.sku)},${clean(row.name)},`;
            let cells = [];
            row.dealers.forEach((cell, index) => {
                if (visibleColumnIndices.has(index)) {
                    cells.push(cell.has_product ? "1" : "0");
                }
            });
            csv += cells.join(",") + "\r\n";
        });

        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
        a.download = 'matrix_export.csv';
        a.click();
    };

    initPage();
});

