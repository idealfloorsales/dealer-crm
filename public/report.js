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
    const filterStatus = document.getElementById('filter-status');
    const filterCity = document.getElementById('filter-city');
    const filterProductFrom = document.getElementById('filter-product-from');
    const filterProductTo = document.getElementById('filter-product-to');
    const searchBar = document.getElementById('search-bar');
    const btnApplyFilters = document.getElementById('btn-apply-filters');
    
    // Хранилища данных
    let fullData = { headers: [], matrix: [] };
    let allProducts = [];

    const safeText = (text) => (text || '').toString().replace(/</g, "&lt;");

    // --- 1. Главная функция отрисовки ---
    function renderMatrix() {
        const status = filterStatus.value;
        const city = filterCity.value;
        const search = searchBar.value.toLowerCase();
        
        const skuFrom = filterProductFrom.value;
        const skuTo = filterProductTo.value;

        // --- A. Фильтруем Колонки (Дилеров) ---
        const filteredHeaders = fullData.headers.filter(h => 
            (!status || h.status === status) &&
            (!city || h.city === city) &&
            (!search || h.name.toLowerCase().includes(search))
        );
        const visibleColumnIndices = new Set(filteredHeaders.map(h => fullData.headers.indexOf(h)));

        // --- B. Фильтруем Строки (Товары) ---
        let filteredMatrix = fullData.matrix;
        
        if (skuFrom || skuTo) {
            // Находим индексы в оригинальном (отсортированном) списке
            let fromIndex = 0;
            let toIndex = fullData.matrix.length - 1;

            if (skuFrom) {
                fromIndex = fullData.matrix.findIndex(p => p.sku === skuFrom);
                if (fromIndex === -1) fromIndex = 0;
            }
            if (skuTo) {
                toIndex = fullData.matrix.findIndex(p => p.sku === skuTo);
                if (toIndex === -1) toIndex = fullData.matrix.length - 1;
            }
            
            // Гарантируем, что "От" < "До"
            if (fromIndex > toIndex) {
                [fromIndex, toIndex] = [toIndex, fromIndex];
            }
            
            filteredMatrix = fullData.matrix.slice(fromIndex, toIndex + 1);
        }

        // --- C. Рендеринг ---
        if (!matrixHeader || !matrixBody) return;

        // Рендерим Заголовок
        matrixHeader.innerHTML = `
            <tr>
                <th class="matrix-product-cell">Артикул</th>
                <th class="matrix-product-cell">Название</th>
                ${filteredHeaders.map(h => `<th>${safeText(h.name)}</th>`).join('')}
            </tr>
        `;
        
        // Рендерим Тело
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

    // --- 2. Заполнение фильтров ---
    function populateFilters() {
        // Фильтр Городов (из Матрицы)
        const cities = [...new Set(fullData.headers.map(h => h.city).filter(Boolean))].sort();
        filterCity.innerHTML = '<option value="">-- Все города --</option>';
        cities.forEach(c => filterCity.add(new Option(c, c)));

        // Фильтр Товаров (из /api/products)
        filterProductFrom.innerHTML = '<option value="">-- Начало --</option>';
        filterProductTo.innerHTML = '<option value="">-- Конец --</option>';
        allProducts.forEach(p => {
            filterProductFrom.add(new Option(`${p.sku} - ${p.name}`, p.sku));
            filterProductTo.add(new Option(`${p.sku} - ${p.name}`, p.sku));
        });
    }

    // --- 3. Инициализация страницы ---
    async function initPage() {
        try {
            loadingMsg.style.display = 'block';
            matrixContainer.style.display = 'none';

            // Запускаем оба запроса параллельно
            const [matrixRes, productsRes] = await Promise.all([
                fetch(API_MATRIX_URL),
                fetch(API_PRODUCTS_URL)
            ]);

            if (!matrixRes.ok) throw new Error('Ошибка загрузки матрицы');
            if (!productsRes.ok) throw new Error('Ошибка загрузки каталога');

            fullData = await matrixRes.json(); 
            allProducts = await productsRes.json();
            
            populateFilters(); // Заполняем фильтры
            renderMatrix();    // Рисуем (сначала всё)

            loadingMsg.style.display = 'none';
            matrixContainer.style.display = 'block';

        } catch (error) {
            loadingMsg.textContent = 'Ошибка загрузки: ' + error.message;
            loadingMsg.className = 'alert alert-danger';
        }
    }

    // --- 4. Обработчики ---
    if(btnApplyFilters) btnApplyFilters.onclick = renderMatrix;

    if(exportBtn) exportBtn.onclick = () => {
        if (!fullData.matrix.length) return;
        
        // Берем отфильтрованные данные
        const status = filterStatus.value;
        const city = filterCity.value;
        const search = searchBar.value.toLowerCase();
        const skuFrom = filterProductFrom.value;
        const skuTo = filterProductTo.value;

        // A. Фильтруем Колонки (Дилеров)
        const visibleHeaders = fullData.headers.filter(h => 
            (!status || h.status === status) &&
            (!city || h.city === city) &&
            (!search || h.name.toLowerCase().includes(search))
        );
        const visibleColumnIndices = new Set(visibleHeaders.map(h => fullData.headers.indexOf(h)));

        // B. Фильтруем Строки (Товары)
        let filteredMatrix = fullData.matrix;
        if (skuFrom || skuTo) {
            let fromIndex = 0;
            let toIndex = fullData.matrix.length - 1;
            if (skuFrom) fromIndex = fullData.matrix.findIndex(p => p.sku === skuFrom);
            if (skuTo) toIndex = fullData.matrix.findIndex(p => p.sku === skuTo);
            if (fromIndex === -1) fromIndex = 0;
            if (toIndex === -1) toIndex = fullData.matrix.length - 1;
            if (fromIndex > toIndex) [fromIndex, toIndex] = [toIndex, fromIndex];
            filteredMatrix = fullData.matrix.slice(fromIndex, toIndex + 1);
        }

        // C. Генерируем CSV
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
