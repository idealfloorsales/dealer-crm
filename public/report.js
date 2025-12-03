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

    // === ФИЛЬТРАЦИЯ ===
    function getFilteredData() {
        const city = filterCity.value;
        const responsible = filterResponsible.value;

        // 1. Фильтруем Колонки (Дилеров)
        const filteredHeaders = fullData.headers.filter(h => {
            const matchFilters = (!city || h.city === city) && (!responsible || h.responsible === responsible);
            const matchCheckboxes = (selectedDealerIds.size === 0) || selectedDealerIds.has(h.id);
            return matchFilters && matchCheckboxes;
        });

        // 2. Фильтруем Строки (Товары)
        const filteredMatrix = fullData.matrix.filter(p => {
            const key = p.type === 'pos' ? p.name : p.sku;
            return (selectedProductSkus.size === 0) || selectedProductSkus.has(key);
        });

        return { headers: filteredHeaders, matrix: filteredMatrix };
    }

    // --- 1. RENDER MATRIX (MODERN TABLE) ---
    function renderMatrix() {
        const data = getFilteredData();
        const visibleOriginalIndices = data.headers.map(h => fullData.headers.indexOf(h));

        if (!matrixHeader || !matrixBody) return;

        // Шапка с красивым форматированием
        matrixHeader.innerHTML = `
            <tr>
                <th>Артикул</th>
                <th>Название</th>
                ${data.headers.map(h => `
                    <th class="text-center" title="${safeText(h.name)}">
                        <div style="font-size:0.9rem; line-height:1.2; margin-bottom:2px;">${safeText(h.name)}</div>
                        <span class="badge bg-light text-secondary border fw-normal" style="font-size:0.7rem">${safeText(h.city)}</span>
                    </th>
                `).join('')}
            </tr>
        `;
        
        // Тело таблицы
        matrixBody.innerHTML = data.matrix.map(row => {
            const isPos = row.type === 'pos';
            const rowClass = isPos ? 'row-pos' : '';
            const skuBadge = isPos ? '<span class="badge bg-warning text-dark">POS</span>' : `<span class="fw-bold text-dark">${safeText(row.sku)}</span>`;
            
            return `
            <tr class="${rowClass}">
                <td>${skuBadge}</td>
                <td title="${safeText(row.name)}">${safeText(row.name)}</td>
                ${visibleOriginalIndices.map(index => {
                    const cell = row.dealers[index];
                    
                    if (cell.is_pos) {
                        // Стенды (Цифра)
                        return cell.value > 0 ? `<td class="text-center"><span class="pos-value">${cell.value}</span></td>` : '<td></td>';
                    } else {
                        // Товары (Галочка или точка)
                        if (cell.value === 1) {
                            return '<td class="text-center"><i class="bi bi-check-circle-fill matrix-check"></i></td>';
                        } else {
                            return '<td class="text-center"><span class="matrix-empty"></span></td>';
                        }
                    }
                }).join('')}
            </tr>`;
        }).join('');

        updateDropdownLabels();
    }

    // --- 2. INIT ---
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
                    <label class="form-check-label w-100" for="d-${d.id}" style="cursor:pointer">
                        ${safeText(d.name)} <small class="text-muted ms-1">${safeText(d.city)}</small>
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
        productListContainer.innerHTML = fullData.matrix.map(p => {
            const id = p.type === 'pos' ? p.name : p.sku;
            return `
            <div class="multi-select-item">
                <div class="form-check">
                    <input class="form-check-input product-checkbox" type="checkbox" value="${id}" id="p-${id}">
                    <label class="form-check-label w-100" for="p-${id}" style="cursor:pointer">
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
        dealerBtn.textContent = selectedDealerIds.size > 0 ? `Дилеров: ${selectedDealerIds.size}` : 'Все дилеры';
        productBtn.textContent = selectedProductSkus.size > 0 ? `Товаров: ${selectedProductSkus.size}` : 'Все товары';
    }

    // --- UI HELPERS ---
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

    dealerSelectAll.onclick = () => { document.querySelectorAll('.dealer-checkbox').forEach(cb => { cb.checked = true; selectedDealerIds.add(cb.value); }); renderMatrix(); };
    dealerClear.onclick = () => { document.querySelectorAll('.dealer-checkbox').forEach(cb => { cb.checked = false; selectedDealerIds.delete(cb.value); }); renderMatrix(); };

    productSelectAll.onclick = () => bulkAction(productListContainer, 'product-checkbox', selectedProductSkus, true);
    productClear.onclick = () => bulkAction(productListContainer, 'product-checkbox', selectedProductSkus, false);

    if(filterCity) filterCity.onchange = () => { updateDealerListOptions(); renderMatrix(); };
    if(filterResponsible) filterResponsible.onchange = () => { updateDealerListOptions(); renderMatrix(); };

    // --- EXPORT ---
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
        a.download = `Matrix_Report.csv`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
    };

    initPage();
});
