// report.js
document.addEventListener('DOMContentLoaded', () => {
    
    const API_MATRIX_URL = '/api/matrix';
    
    // Элементы
    const matrixHeader = document.getElementById('matrix-header');
    const matrixBody = document.getElementById('matrix-body');
    const matrixContainer = document.getElementById('matrix-container');
    const loadingMsg = document.getElementById('loading-msg');
    const exportBtn = document.getElementById('export-csv-btn');
    
    // Фильтры (Глобальные)
    const filterCity = document.getElementById('filter-city');
    const filterResponsible = document.getElementById('filter-responsible');

    // Мульти-селекты (Точечные)
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
    let selectedDealerIds = new Set();
    let selectedProductSkus = new Set();

    const safeText = (text) => (text || '').toString().replace(/</g, "&lt;");

    // --- 1. Рендер Таблицы ---
    function renderMatrix() {
        const city = filterCity.value;
        const responsible = filterResponsible.value;
        
        // A. Фильтр КОЛОНОК (Дилеры)
        // Дилер должен:
        // 1. Совпадать по Городу (если выбран)
        // 2. Совпадать по Ответственному (если выбран)
        // 3. Быть отмечен галочкой (или галочки не стоят вообще)
        const filteredHeaders = fullData.headers.filter(h => {
            const matchCity = !city || h.city === city;
            const matchResp = !responsible || h.responsible === responsible;
            const matchCheck = (selectedDealerIds.size === 0) || selectedDealerIds.has(h.id);
            return matchCity && matchResp && matchCheck;
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
        
        matrixBody.innerHTML = filteredMatrix.map(row => `
            <tr>
                <td class="matrix-product-cell">${safeText(row.sku)}</td>
                <td class="matrix-product-cell">${safeText(row.name)}</td>
                ${row.dealers.map((cell, index) => {
                    return visibleColumnIndices.has(index) ? (cell.has_product ? '<td class="matrix-cell-yes">✔</td>' : '<td></td>') : '';
                }).join('')}
            </tr>
        `).join('');

        updateDropdownLabels();
    }

    // --- 2. Инициализация ---
    async function initPage() {
        try {
            loadingMsg.style.display = 'block';
            const response = await fetch(API_MATRIX_URL);
            if (!response.ok) throw new Error('Ошибка сети');
            fullData = await response.json(); 
            
            populateFilters(); 
            populateMultiSelects();
            renderMatrix();    

            loadingMsg.style.display = 'none';
            matrixContainer.style.display = 'block';
        } catch (error) {
            loadingMsg.textContent = 'Ошибка загрузки: ' + error.message;
            loadingMsg.className = 'alert alert-danger';
        }
    }

    function populateFilters() {
        const cities = [...new Set(fullData.headers.map(h => h.city).filter(Boolean))].sort();
        filterCity.innerHTML = '<option value="">-- Все города --</option>';
        cities.forEach(c => filterCity.add(new Option(c, c)));
    }

    function populateMultiSelects() {
        // Дилеры
        dealerListContainer.innerHTML = fullData.headers.map(d => `
            <div class="multi-select-item">
                <div class="form-check">
                    <input class="form-check-input dealer-checkbox" type="checkbox" value="${d.id}" id="d-${d.id}">
                    <label class="form-check-label" for="d-${d.id}">${safeText(d.name)}</label>
                </div>
            </div>
        `).join('');
        // Товары
        productListContainer.innerHTML = fullData.matrix.map(p => `
            <div class="multi-select-item">
                <div class="form-check">
                    <input class="form-check-input product-checkbox" type="checkbox" value="${p.sku}" id="p-${p.sku}">
                    <label class="form-check-label" for="p-${p.sku}"><strong>${safeText(p.sku)}</strong> ${safeText(p.name)}</label>
                </div>
            </div>
        `).join('');

        // Слушатели чекбоксов
        document.querySelectorAll('.dealer-checkbox').forEach(cb => cb.addEventListener('change', (e) => {
            if (e.target.checked) selectedDealerIds.add(e.target.value); else selectedDealerIds.delete(e.target.value);
            renderMatrix();
        }));
        document.querySelectorAll('.product-checkbox').forEach(cb => cb.addEventListener('change', (e) => {
            if (e.target.checked) selectedProductSkus.add(e.target.value); else selectedProductSkus.delete(e.target.value);
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

    const setupSearch = (input, container) => {
        input.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            container.querySelectorAll('.multi-select-item').forEach(item => {
                item.style.display = item.textContent.toLowerCase().includes(term) ? 'block' : 'none';
            });
        });
    };
    setupSearch(dealerSearch, dealerListContainer);
    setupSearch(productSearch, productListContainer);

    const bulkAction = (container, className, set, action) => {
        container.querySelectorAll(`.${className}`).forEach(cb => {
            if (cb.closest('.multi-select-item').style.display !== 'none') {
                cb.checked = action;
                if (action) set.add(cb.value); else set.delete(cb.value);
            }
        });
        renderMatrix();
    };
    dealerSelectAll.onclick = () => bulkAction(dealerListContainer, 'dealer-checkbox', selectedDealerIds, true);
    dealerClear.onclick = () => bulkAction(dealerListContainer, 'dealer-checkbox', selectedDealerIds, false);
    productSelectAll.onclick = () => bulkAction(productListContainer, 'product-checkbox', selectedProductSkus, true);
    productClear.onclick = () => bulkAction(productListContainer, 'product-checkbox', selectedProductSkus, false);

    // --- 4. Обработчики Глобальных Фильтров ---
    if(filterCity) filterCity.onchange = renderMatrix;
    if(filterResponsible) filterResponsible.onchange = renderMatrix;

    // --- 5. Экспорт ---
    if(exportBtn) exportBtn.onclick = () => {
        if (!fullData.matrix.length) return;
        
        // Повтор логики фильтрации
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
