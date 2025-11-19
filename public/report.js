// report.js
document.addEventListener('DOMContentLoaded', () => {
    
    const API_MATRIX_URL = '/api/matrix';
    
    const matrixHeader = document.getElementById('matrix-header');
    const matrixBody = document.getElementById('matrix-body');
    const matrixContainer = document.getElementById('matrix-container');
    const loadingMsg = document.getElementById('loading-msg');
    const exportBtn = document.getElementById('export-csv-btn');
    
    const filterStatus = document.getElementById('filter-status');
    const filterCity = document.getElementById('filter-city');
    const filterResponsible = document.getElementById('filter-responsible'); // (НОВОЕ)
    const searchDealer = document.getElementById('search-dealer');
    const searchProduct = document.getElementById('search-product');
    
    let fullData = { headers: [], matrix: [] };

    const safeText = (text) => (text || '').toString().replace(/</g, "&lt;");

    function renderMatrix() {
        const status = filterStatus.value;
        const city = filterCity.value;
        const responsible = filterResponsible ? filterResponsible.value : ''; // (НОВОЕ)
        const dealerSearch = searchDealer.value.toLowerCase();
        const productSearchRaw = searchProduct.value.toLowerCase();
        
        const productSearchTerms = productSearchRaw.split(/[ ,]+/).filter(term => term.length > 0);

        // --- A. Фильтруем Колонки (Дилеров) ---
        const filteredHeaders = fullData.headers.filter(h => 
            (!status || h.status === status) &&
            (!city || h.city === city) &&
            (!responsible || h.responsible === responsible) && // (НОВОЕ)
            (!dealerSearch || h.name.toLowerCase().includes(dealerSearch))
        );
        const visibleColumnIndices = new Set(filteredHeaders.map(h => fullData.headers.indexOf(h)));

        // --- B. Фильтруем Строки (Товары) ---
        const filteredMatrix = fullData.matrix.filter(p => {
            if (productSearchTerms.length === 0) return true;
            const sku = (p.sku || '').toLowerCase();
            const name = (p.name || '').toLowerCase();
            return productSearchTerms.some(term => sku.includes(term) || name.includes(term));
        });

        // --- C. Рендеринг ---
        if (!matrixHeader || !matrixBody) return;

        matrixHeader.innerHTML = `
            <tr>
                <th class="matrix-product-cell">Артикул</th>
                <th class="matrix-product-cell">Название</th>
                ${filteredHeaders.map(h => `<th>${safeText(h.name)}</th>`).join('')}
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
    }

    function populateFilters() {
        const cities = [...new Set(fullData.headers.map(h => h.city).filter(Boolean))].sort();
        filterCity.innerHTML = '<option value="">-- Все города --</option>';
        cities.forEach(c => filterCity.add(new Option(c, c)));
    }

    async function initPage() {
        try {
            loadingMsg.style.display = 'block';
            matrixContainer.style.display = 'none';

            const response = await fetch(API_MATRIX_URL);
            if (!response.ok) throw new Error('Ошибка сети');
            
            fullData = await response.json(); 
            
            populateFilters(); 
            renderMatrix();    

            loadingMsg.style.display = 'none';
            matrixContainer.style.display = 'block';

        } catch (error) {
            loadingMsg.textContent = 'Ошибка загрузки: ' + error.message;
            loadingMsg.className = 'alert alert-danger';
        }
    }

    let debounceTimer;
    function setupDebouncedFiltering() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => renderMatrix(), 300);
    }

    if(filterStatus) filterStatus.onchange = renderMatrix;
    if(filterCity) filterCity.onchange = renderMatrix;
    if(filterResponsible) filterResponsible.onchange = renderMatrix; // (НОВОЕ)
    if(searchDealer) searchDealer.addEventListener('input', setupDebouncedFiltering);
    if(searchProduct) searchProduct.addEventListener('input', setupDebouncedFiltering);

    if(exportBtn) exportBtn.onclick = () => {
        if (!fullData.matrix.length) return;
        
        const status = filterStatus.value;
        const city = filterCity.value;
        const responsible = filterResponsible ? filterResponsible.value : ''; // (НОВОЕ)
        const dealerSearch = searchDealer.value.toLowerCase();
        const productSearchRaw = searchProduct.value.toLowerCase();
        const productSearchTerms = productSearchRaw.split(/[ ,]+/).filter(term => term.length > 0);

        const visibleHeaders = fullData.headers.filter(h => 
            (!status || h.status === status) &&
            (!city || h.city === city) &&
            (!responsible || h.responsible === responsible) && // (НОВОЕ)
            (!dealerSearch || h.name.toLowerCase().includes(dealerSearch))
        );
        const visibleColumnIndices = new Set(visibleHeaders.map(h => fullData.headers.indexOf(h)));

        const filteredMatrix = fullData.matrix.filter(p => {
            if (productSearchTerms.length === 0) return true;
            const sku = (p.sku || '').toLowerCase();
            const name = (p.name || '').toLowerCase();
            return productSearchTerms.some(term => sku.includes(term) || name.includes(term));
        });

        const clean = (text) => `"${String(text || '').replace(/"/g, '""')}"`;
        let csv = "\uFEFFАртикул,Название,";
        csv += visibleHeaders.map(h => clean(h.name)).join(",") + "\r\n";

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
