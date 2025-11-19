// report.js
document.addEventListener('DOMContentLoaded', () => {
    
    const API_MATRIX_URL = '/api/matrix';
    
    // Элементы UI
    const matrixHeader = document.getElementById('matrix-header');
    const matrixBody = document.getElementById('matrix-body');
    const matrixContainer = document.getElementById('matrix-container');
    const loadingMsg = document.getElementById('loading-msg');
    const exportBtn = document.getElementById('export-csv-btn');
    const buildBtn = document.getElementById('btn-build-report');
    const statsLabel = document.getElementById('stats-label');

    // Dropdowns
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
    
    // Состояние выбранных (Set для скорости)
    let selectedDealerIds = new Set();
    let selectedProductSkus = new Set();

    const safeText = (text) => (text || '').toString().replace(/</g, "&lt;");

    // --- 1. Инициализация ---
    async function initPage() {
        try {
            loadingMsg.style.display = 'block';
            const response = await fetch(API_MATRIX_URL);
            if (!response.ok) throw new Error('Ошибка сети');
            fullData = await response.json();
            
            // Заполняем списки
            populateDealerList(fullData.headers);
            populateProductList(fullData.matrix);

            // По умолчанию ничего не выбрано (или можно выбрать всё)
            updateStats();
            
            loadingMsg.style.display = 'none';
            dealerBtn.textContent = 'Выберите дилеров...';
            productBtn.textContent = 'Выберите товары...';

        } catch (error) {
            loadingMsg.textContent = 'Ошибка: ' + error.message;
            loadingMsg.className = 'alert alert-danger';
        }
    }

    // --- 2. Заполнение списков (Конструктор) ---
    function populateDealerList(dealers) {
        dealerListContainer.innerHTML = dealers.map(d => `
            <div class="multi-select-item">
                <div class="form-check">
                    <input class="form-check-input dealer-checkbox" type="checkbox" value="${d.id}" id="d-${d.id}">
                    <label class="form-check-label" for="d-${d.id}">
                        ${safeText(d.name)} <small class="text-muted">(${safeText(d.city)})</small>
                    </label>
                </div>
            </div>
        `).join('');
        
        // Слушатели на чекбоксы
        document.querySelectorAll('.dealer-checkbox').forEach(cb => {
            cb.addEventListener('change', (e) => {
                if (e.target.checked) selectedDealerIds.add(e.target.value);
                else selectedDealerIds.delete(e.target.value);
                updateStats();
            });
        });
    }

    function populateProductList(products) {
        productListContainer.innerHTML = products.map(p => `
            <div class="multi-select-item">
                <div class="form-check">
                    <input class="form-check-input product-checkbox" type="checkbox" value="${p.sku}" id="p-${p.sku}">
                    <label class="form-check-label" for="p-${p.sku}">
                        <strong>${safeText(p.sku)}</strong> - ${safeText(p.name)}
                    </label>
                </div>
            </div>
        `).join('');

        document.querySelectorAll('.product-checkbox').forEach(cb => {
            cb.addEventListener('change', (e) => {
                if (e.target.checked) selectedProductSkus.add(e.target.value);
                else selectedProductSkus.delete(e.target.value);
                updateStats();
            });
        });
    }

    // --- 3. Логика интерфейса (Открытие/Поиск/Выбрать все) ---
    function toggleMenu(menu) {
        menu.classList.toggle('show');
    }
    
    // Закрытие при клике вне
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#dealer-dropdown')) dealerMenu.classList.remove('show');
        if (!e.target.closest('#product-dropdown')) productMenu.classList.remove('show');
    });

    dealerBtn.onclick = () => toggleMenu(dealerMenu);
    productBtn.onclick = () => toggleMenu(productMenu);

    // Поиск внутри выпадающего списка
    const setupSearch = (input, container) => {
        input.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            const items = container.querySelectorAll('.multi-select-item');
            items.forEach(item => {
                const text = item.textContent.toLowerCase();
                item.style.display = text.includes(term) ? 'block' : 'none';
            });
        });
    };
    setupSearch(dealerSearch, dealerListContainer);
    setupSearch(productSearch, productListContainer);

    // Кнопки "Все" / "Сброс"
    const bulkAction = (container, className, set, action) => {
        const checkboxes = container.querySelectorAll(`.${className}`);
        checkboxes.forEach(cb => {
            // Учитываем только видимые (отфильтрованные поиском)
            if (cb.closest('.multi-select-item').style.display !== 'none') {
                cb.checked = action;
                if (action) set.add(cb.value); else set.delete(cb.value);
            }
        });
        updateStats();
    };

    dealerSelectAll.onclick = () => bulkAction(dealerListContainer, 'dealer-checkbox', selectedDealerIds, true);
    dealerClear.onclick = () => bulkAction(dealerListContainer, 'dealer-checkbox', selectedDealerIds, false);
    productSelectAll.onclick = () => bulkAction(productListContainer, 'product-checkbox', selectedProductSkus, true);
    productClear.onclick = () => bulkAction(productListContainer, 'product-checkbox', selectedProductSkus, false);

    function updateStats() {
        statsLabel.textContent = `Выбрано: ${selectedDealerIds.size} дилеров, ${selectedProductSkus.size} товаров`;
        dealerBtn.textContent = selectedDealerIds.size > 0 ? `Выбрано: ${selectedDealerIds.size}` : 'Выберите дилеров...';
        productBtn.textContent = selectedProductSkus.size > 0 ? `Выбрано: ${selectedProductSkus.size}` : 'Выберите товары...';
    }

    // --- 4. Построение таблицы (Рендер) ---
    buildBtn.onclick = () => {
        if (selectedDealerIds.size === 0 || selectedProductSkus.size === 0) {
            alert("Выберите хотя бы одного дилера и один товар.");
            return;
        }

        // Фильтруем данные
        const filteredHeaders = fullData.headers.filter(h => selectedDealerIds.has(h.id));
        const visibleColumnIndices = new Set(filteredHeaders.map(h => fullData.headers.indexOf(h)));
        const filteredMatrix = fullData.matrix.filter(p => selectedProductSkus.has(p.sku));

        // Рендер
        matrixHeader.innerHTML = `
            <tr>
                <th class="matrix-product-cell">Артикул</th>
                <th class="matrix-product-cell">Название</th>
                ${filteredHeaders.map(h => `<th>${safeText(h.name)}<br><small class="fw-normal">${safeText(h.city)}</small></th>`).join('')}
            </tr>
        `;

        matrixBody.innerHTML = filteredMatrix.map(row => `
            <tr>
                <td class="matrix-product-cell">${safeText(row.sku)}</td>
                <td class="matrix-product-cell">${safeText(row.name)}</td>
                ${row.dealers.map((cell, index) => {
                    return visibleColumnIndices.has(index) ? (cell.has_product ? '<td class="matrix-cell-yes">✔</td>' : '<td></td>') : '';
                }).join('')}
            </tr>
        `).join('');

        matrixContainer.style.display = 'block';
    };

    // Экспорт того, что на экране
    exportBtn.onclick = () => {
        if (selectedDealerIds.size === 0 || selectedProductSkus.size === 0) {
             alert("Сначала постройте таблицу."); return;
        }
        
        const filteredHeaders = fullData.headers.filter(h => selectedDealerIds.has(h.id));
        const visibleColumnIndices = new Set(filteredHeaders.map(h => fullData.headers.indexOf(h)));
        const filteredMatrix = fullData.matrix.filter(p => selectedProductSkus.has(p.sku));

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
        a.download = 'custom_matrix.csv';
        a.click();
    };

    initPage();
});
