document.addEventListener('DOMContentLoaded', () => {
    
    // API
    const API_MATRIX = '/api/matrix';
    const API_DEALERS = '/api/dealers';
    const API_PRODUCTS = '/api/products';

    // UI
    const filterCity = document.getElementById('filter-city');
    const filterResponsible = document.getElementById('filter-responsible');
    const btnExport = document.getElementById('export-csv-btn');
    
    // Multi-select Dealers
    const dealerDropdownBtn = document.getElementById('dealer-dropdown-btn');
    const dealerMenu = document.getElementById('dealer-menu');
    const dealerSearch = document.getElementById('dealer-search');
    const dealerListContainer = document.getElementById('dealer-list-container');
    const dealerSelectAll = document.getElementById('dealer-select-all');
    const dealerClear = document.getElementById('dealer-clear');

    // Multi-select Products
    const productDropdownBtn = document.getElementById('product-dropdown-btn');
    const productMenu = document.getElementById('product-menu');
    const productSearch = document.getElementById('product-search');
    const productListContainer = document.getElementById('product-list-container');
    const productSelectAll = document.getElementById('product-select-all');
    const productClear = document.getElementById('product-clear');

    // Table
    const loadingMsg = document.getElementById('loading-msg');
    const matrixContainer = document.getElementById('matrix-container');
    const thead = document.getElementById('matrix-header');
    const tbody = document.getElementById('matrix-body');

    // Data State
    let rawData = null; // { headers: [], matrix: [] }
    let allDealers = [];
    let allProducts = [];
    
    let selectedDealerIds = new Set();
    let selectedProductIds = new Set();

    // --- INIT ---
    async function init() {
        try {
            // Load base lists for filters
            const [dRes, pRes] = await Promise.all([
                fetch(API_DEALERS + '?scope=all'),
                fetch(API_PRODUCTS)
            ]);
            
            if(dRes.ok) allDealers = await dRes.json();
            if(pRes.ok) allProducts = await pRes.json();

            // Setup Filters
            setupCityFilter();
            renderMultiSelects();
            
            // Initial Load of Matrix
            await loadMatrix();

        } catch (e) { console.error(e); }
    }

    async function loadMatrix() {
        loadingMsg.style.display = 'block';
        matrixContainer.style.display = 'none';
        try {
            const res = await fetch(API_MATRIX);
            if(!res.ok) throw new Error("Ошибка загрузки матрицы");
            rawData = await res.json();
            renderTable();
        } catch(e) {
            loadingMsg.textContent = "Ошибка: " + e.message;
            loadingMsg.classList.add('text-danger');
        } finally {
            loadingMsg.style.display = 'none';
            matrixContainer.style.display = 'block';
        }
    }

    // --- RENDERING TABLE ---
    function renderTable() {
        if (!rawData) return;

        // 1. Filter Dealers (Columns)
        let dealers = rawData.headers; // headers = [{id, name, city, responsible}, ...]
        
        const cityVal = filterCity.value;
        const respVal = filterResponsible.value;

        dealers = dealers.filter(d => {
            const matchCity = !cityVal || d.city === cityVal;
            const matchResp = !respVal || d.responsible === respVal;
            const matchId = selectedDealerIds.size === 0 || selectedDealerIds.has(d.id);
            return matchCity && matchResp && matchId;
        });

        // 2. Filter Products (Rows)
        let products = rawData.matrix; // matrix = [{sku, name, dealers: [{value...}, ...]}, ...]
        
        products = products.filter(p => {
            // Find product ID in allProducts to match with selection
            // Note: API Matrix usually returns SKU/Name. Let's assume we filter by SKU or just display all if no selection
            // For simplicity, we check if selectedProductIds contains the product ID found in allProducts list
            if (selectedProductIds.size === 0) return true;
            const prodRef = allProducts.find(x => x.sku === p.sku);
            return prodRef && selectedProductIds.has(prodRef.id);
        });

        // 3. Render Header
        let headerHTML = `<tr><th class="sticky-col" style="min-width: 200px;">Товар / Декор</th>`;
        dealers.forEach(d => {
            // ВОТ ЗДЕСЬ ДОБАВЛЕНА ССЫЛКА НА ДИЛЕРА
            headerHTML += `<th style="min-width: 100px; text-align: center;">
                <a href="/dealer.html?id=${d.id}" target="_blank" class="text-decoration-none fw-bold text-dark dealer-link">
                    ${d.name} <i class="bi bi-box-arrow-up-right small text-muted" style="font-size: 0.7em;"></i>
                </a>
                <div class="small text-muted fw-normal">${d.city || ''}</div>
            </th>`;
        });
        headerHTML += `</tr>`;
        thead.innerHTML = headerHTML;

        // 4. Render Body
        // Map original dealer indices to new filtered indices
        const dealerIndices = dealers.map(d => rawData.headers.findIndex(h => h.id === d.id));

        let bodyHTML = '';
        products.forEach(p => {
            let rowHTML = `<tr><td class="sticky-col fw-bold text-secondary">${p.name}<br><span class="small fw-normal text-muted">${p.sku}</span></td>`;
            
            dealerIndices.forEach(idx => {
                const cellData = p.dealers[idx];
                const val = cellData ? cellData.value : 0;
                const isPos = cellData ? cellData.is_pos : false;
                
                let content = '';
                let bgClass = '';

                if (val > 0) {
                    content = isPos ? `<span class="badge bg-info text-dark">${val}</span>` : `<i class="bi bi-check-lg text-success fs-5"></i>`;
                    bgClass = isPos ? '' : 'bg-success-subtle';
                } else {
                    content = `<span class="text-muted opacity-25">&bull;</span>`;
                }

                rowHTML += `<td class="text-center ${bgClass}">${content}</td>`;
            });
            rowHTML += `</tr>`;
            bodyHTML += rowHTML;
        });
        tbody.innerHTML = bodyHTML;
    }

    // --- FILTERS & UI LOGIC ---
    function setupCityFilter() {
        const cities = [...new Set(allDealers.map(d => d.city).filter(Boolean))].sort();
        filterCity.innerHTML = '<option value="">-- Все --</option>' + cities.map(c => `<option value="${c}">${c}</option>`).join('');
        
        filterCity.addEventListener('change', renderTable);
        filterResponsible.addEventListener('change', renderTable);
    }

    function renderMultiSelects() {
        // Render Dealer List
        renderCheckboxList(dealerListContainer, allDealers, 'dealer', selectedDealerIds);
        // Render Product List
        renderCheckboxList(productListContainer, allProducts, 'product', selectedProductIds);
    }

    function renderCheckboxList(container, items, type, set) {
        // Sort items
        const sorted = [...items].sort((a,b) => (a.name || '').localeCompare(b.name || ''));
        
        container.innerHTML = sorted.map(item => `
            <div class="form-check border-bottom py-2 mx-2">
                <input class="form-check-input ${type}-checkbox" type="checkbox" value="${item.id}" id="${type}-${item.id}">
                <label class="form-check-label w-100 stretched-link" for="${type}-${item.id}">
                    ${item.name} <span class="text-muted small">${item.sku || item.city || ''}</span>
                </label>
            </div>
        `).join('');

        // Listeners
        container.querySelectorAll(`.${type}-checkbox`).forEach(cb => {
            cb.addEventListener('change', (e) => {
                if(e.target.checked) set.add(e.target.value);
                else set.delete(e.target.value);
                
                updateDropdownLabel(type, set.size, items.length);
                renderTable();
            });
        });
    }

    function updateDropdownLabel(type, count, total) {
        const btn = document.getElementById(`${type}-dropdown-btn`);
        if(count === 0) btn.textContent = type === 'dealer' ? 'Все дилеры' : 'Все товары';
        else btn.textContent = `Выбрано: ${count}`;
        
        // Highlight active filter
        if(count > 0) btn.classList.add('text-primary', 'fw-bold');
        else btn.classList.remove('text-primary', 'fw-bold');
    }

    // Dropdown Logic
    function setupDropdown(type, searchInputId, clearBtnId, selectAllBtnId, containerId, items, set) {
        const btn = document.getElementById(`${type}-dropdown-btn`);
        const menu = document.getElementById(`${type}-menu`);
        const search = document.getElementById(searchInputId);
        
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            // Close others
            document.querySelectorAll('.multi-select-menu').forEach(m => { if(m !== menu) m.style.display = 'none'; });
            menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
        });

        // Search
        search.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            const checkboxes = document.getElementById(containerId).querySelectorAll('.form-check');
            checkboxes.forEach(div => {
                const text = div.innerText.toLowerCase();
                div.style.display = text.includes(term) ? 'block' : 'none';
            });
        });

        // Clear
        document.getElementById(clearBtnId).addEventListener('click', () => {
            set.clear();
            document.getElementById(containerId).querySelectorAll('input').forEach(i => i.checked = false);
            updateDropdownLabel(type, 0, items.length);
            renderTable();
        });

        // Select All
        document.getElementById(selectAllBtnId).addEventListener('click', () => {
            // Select visible items only (if searching)
            const checkboxes = document.getElementById(containerId).querySelectorAll('.form-check');
            checkboxes.forEach(div => {
                if(div.style.display !== 'none') {
                    const inp = div.querySelector('input');
                    inp.checked = true;
                    set.add(inp.value);
                }
            });
            updateDropdownLabel(type, set.size, items.length);
            renderTable();
        });
    }

    setupDropdown('dealer', 'dealer-search', 'dealer-clear', 'dealer-select-all', 'dealer-list-container', allDealers, selectedDealerIds);
    setupDropdown('product', 'product-search', 'product-clear', 'product-select-all', 'product-list-container', allProducts, selectedProductIds);

    // Close dropdowns on click outside
    document.addEventListener('click', (e) => {
        if(!e.target.closest('.multi-select-dropdown')) {
            document.querySelectorAll('.multi-select-menu').forEach(m => m.style.display = 'none');
        }
    });

    // Export CSV
    if(btnExport) {
        btnExport.onclick = () => {
            if(!rawData) return;
            // Generate basic CSV
            let csv = '\uFEFFТовар;';
            const headers = rawData.headers; // Assuming no filters for simple export, or use filtered state
            headers.forEach(h => csv += `"${h.name} (${h.city})";`);
            csv += '\n';
            
            rawData.matrix.forEach(p => {
                csv += `"${p.name}";`;
                p.dealers.forEach(d => csv += `"${d.value > 0 ? (d.is_pos ? d.value : 1) : 0}";`);
                csv += '\n';
            });

            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Report_Matrix_${new Date().toISOString().slice(0,10)}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        };
    }

    init();
});
