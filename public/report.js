// report.js
document.addEventListener('DOMContentLoaded', () => {
    
    const API_MATRIX_URL = '/api/matrix';
    const API_PRODUCTS_URL = '/api/products';
    
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
    let allProducts = [];
    
    let selectedDealerIds = new Set();
    let selectedProductSkus = new Set();

    const safeText = (text) => (text || '').toString().replace(/</g, "&lt;");

    // === ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ ФИЛЬТРАЦИИ ===
    function getFilteredData() {
        const city = filterCity.value;
        const responsible = filterResponsible.value;

        // 1. Фильтруем Колонки (Дилеров)
        const filteredHeaders = fullData.headers.filter(h => {
            const matchFilters = (!city || h.city === city) && 
                                 (!responsible || h.responsible === responsible);
            const matchCheckboxes = (selectedDealerIds.size === 0) || selectedDealerIds.has(h.id);
            return matchFilters && matchCheckboxes;
        });

        // 2. Фильтруем Строки (Товары)
        const filteredMatrix = fullData.matrix.filter(p => {
            // Стенды фильтруем по имени, товары по SKU
            const key = p.type === 'pos' ? p.name : p.sku;
            return (selectedProductSkus.size === 0) || selectedProductSkus.has(key);
        });

        return { headers: filteredHeaders, matrix: filteredMatrix };
    }

    // --- 1. Рендер Таблицы ---
    function renderMatrix() {
        const data = getFilteredData();
        
        // Индексы оригинальных колонок
        const visibleOriginalIndices = data.headers.map(h => fullData.headers.indexOf(h));

        if (!matrixHeader || !matrixBody) return;

        // Шапка
        matrixHeader.innerHTML = `
            <tr>
                <th>Артикул</th>
                <th>Название</th>
                ${data.headers.map(h => `<th>${safeText(h.name)}<br><small class="fw-normal text-muted" style="font-size:10px">${safeText(h.city)}</small></th>`).join('')}
            </tr>
        `;
        
        // Тело
        matrixBody.innerHTML = data.matrix.map(row => `
            <tr class="${row.type === 'pos' ? 'table-info' : ''}">
                <td title="${safeText(row.sku)}">${safeText(row.sku)}</td>
                <td title="${safeText(row.name)}">${safeText(row.name)}</td>
                ${visibleOriginalIndices.map(index => {
                    const cell = row.dealers[index];
                    
                    if (cell.is_pos) {
                        // Стенды: просто цифра (черная) или пусто
                        return cell.value > 0 ? `<td class="text-center fw-bold" style="color:#333;">${cell.value}</td>` : '<td></td>';
                    } else {
                        // Товары: Зеленая галочка или серая точка
                        if (cell.value === 1) {
                            return '<td><span class="matrix-check">✔</span></td>';
                        } else {
                            return '<td><span class="matrix-empty">·</span></td>';
                        }
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
            
            const [matrixRes, prodRes] = await Promise.all([
                fetch(API_MATRIX_URL),
                fetch(API_PRODUCTS_URL)
            ]);

            if (!matrixRes.ok || !prodRes.ok) throw new Error('Ошибка сети');
            fullData = await matrixRes.json(); 
            allProducts = await prodRes.json();
            
            populateGlobalFilters();
            updateDealerListOptions(); 
            populateProductList();
            
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

    function updateDealerListOptions() {
        const city = filterCity.value;
        const responsible = filterResponsible.value;
        const term = dealerSearch.value.toLowerCase();

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
        
        document.querySelectorAll('.dealer-checkbox').forEach(cb => cb.addEventListener('change', (e) => {
            if (e.target.checked) selectedDealerIds.add(e.target.value); 
            else selectedDealerIds.delete(e.target.value);
            renderMatrix();
        }));
    }

    function populateProductList() {
        // Товары берем из МАТРИЦЫ (там уже есть и товары, и стенды)
        productListContainer.innerHTML = fullData.matrix.map(p => {
            const id = p.type === 'pos' ? p.name : p.sku;
            return `
            <div class="multi-select-item">
                <div class="form-check">
                    <input class="form-check-input product-checkbox" type="checkbox" value="${id}" id="p-${id}">
                    <label class="form-check-label" for="p-${id}">
                        <strong>${safeText(p.sku)}</strong> ${safeText(p.name)}
                    </label>
                </div>
            </div>`;
        }).join('');

        productSearch.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            productListContainer.querySelectorAll('.multi-select-item').forEach(item => {
                item.style.display = item.textContent.toLowerCase().includes(term) ? 'block' : 'none';
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

    // --- UI ---
    function toggleMenu(menu) { menu.classList.toggle('show'); }
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#dealer-dropdown')) dealerMenu.classList.remove('show');
        if (!e.target.closest('#product-dropdown')) productMenu.classList.remove('show');
    });
    dealerBtn.onclick = () => toggleMenu(dealerMenu);
    productBtn.onclick = () => toggleMenu(productMenu);

    dealerSearch.addEventListener('input', () => updateDealerListOptions());

    const bulkAction = (container, className, set, action) => {
        container.querySelectorAll(`.${className}`).forEach(cb => {
            if (cb.closest('.multi-select-item').style.display !== 'none') {
                cb.checked = action;
                if (action) set.add(cb.value); else set.delete(cb.value);
            }
        });
        renderMatrix();
    };

    dealerSelectAll.onclick = () => {
        document.querySelectorAll('.dealer-checkbox').forEach(cb => { cb.checked = true; selectedDealerIds.add(cb.value); });
        renderMatrix();
    };
    dealerClear.onclick = () => {
        document.querySelectorAll('.dealer-checkbox').forEach(cb => { cb.checked = false; selectedDealerIds.delete(cb.value); });
        renderMatrix();
    };

    productSelectAll.onclick = () => bulkAction(productListContainer, 'product-checkbox', selectedProductSkus, true);
    productClear.onclick = () => bulkAction(productListContainer, 'product-checkbox', selectedProductSkus, false);

    if(filterCity) filterCity.onchange = () => { updateDealerListOptions(); renderMatrix(); };
    if(filterResponsible) filterResponsible.onchange = () => { updateDealerListOptions(); renderMatrix(); };

    // --- ЭКСПОРТ ---
    if(exportBtn) exportBtn.onclick = () => {
        if (!fullData.matrix.length) return alert("Нет данных для экспорта");
        
        const data = getFilteredData();
        const visibleOriginalIndices = data.headers.map(h => fullData.headers.indexOf(h));

        const clean = (text) => `"${String(text || '').replace(/"/g, '""')}"`;
        
        let csv = "\uFEFFАртикул;Название;";
        csv += data.headers.map(h => clean(`${h.name} (${h.city})`)).join(";") + "\r\n";

        data.matrix.forEach(row => {
            csv += `${clean(row.sku)};${clean(row.name)};`;
            const cells = visibleOriginalIndices.map(index => {
                const cell = row.dealers[index];
                if (cell.is_pos) return cell.value > 0 ? cell.value : "";
                return cell.value === 1 ? "1" : "";
            });
            csv += cells.join(";") + "\r\n";
        });

        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
        const date = new Date().toISOString().slice(0,10);
        a.download = `Matrix_Export_${date}.csv`;
        
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    initPage();
});
