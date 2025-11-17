// report.js
document.addEventListener('DOMContentLoaded', () => {
    
    const API_URL = '/api/matrix';
    const matrixHeader = document.getElementById('matrix-header');
    const matrixBody = document.getElementById('matrix-body');
    const matrixContainer = document.getElementById('matrix-container');
    const loadingMsg = document.getElementById('loading-msg');
    const exportBtn = document.getElementById('export-csv-btn');
    
    // (НОВОЕ) Элементы фильтров
    const filterStatus = document.getElementById('filter-status');
    const filterCity = document.getElementById('filter-city');
    const searchBar = document.getElementById('search-bar');
    
    let fullData = { headers: [], matrix: [] }; // Храним полные данные

    // (НОВОЕ) Безопасный поиск
    const safeText = (text) => (text || '').toString().replace(/</g, "&lt;");

    // --- 1. (НОВОЕ) Функция отрисовки (не загрузки) ---
    function renderMatrix() {
        const status = filterStatus.value;
        const city = filterCity.value;
        const search = searchBar.value.toLowerCase();
        
        // Фильтруем заголовки (дилеров)
        const filteredHeaders = fullData.headers.filter(h => 
            (!status || h.status === status) &&
            (!city || h.city === city) &&
            (!search || h.name.toLowerCase().includes(search))
        );
        
        // Собираем ИНДЕКСЫ колонок, которые нужно показать
        const visibleColumnIndices = new Set(filteredHeaders.map(h => fullData.headers.indexOf(h)));

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
        matrixBody.innerHTML = fullData.matrix.map(row => `
            <tr>
                <td class="matrix-product-cell">${safeText(row.sku)}</td>
                <td class="matrix-product-cell">${safeText(row.name)}</td>
                ${row.dealers.map((cell, index) => {
                    // Показываем ячейку, только если её индекс есть в отфильтрованном списке
                    if (visibleColumnIndices.has(index)) {
                        return cell.has_product ? '<td class="matrix-cell-yes">✔</td>' : '<td></td>';
                    }
                    return ''; // Скрываем колонку
                }).join('')}
            </tr>
        `).join('');
    }

    // --- 2. (НОВОЕ) Функция заполнения фильтров ---
    function populateFilters() {
        const cities = [...new Set(fullData.headers.map(h => h.city).filter(Boolean))].sort();
        const sc = filterCity.value;
        
        filterCity.innerHTML = '<option value="">-- Все города --</option>';
        cities.forEach(c => filterCity.add(new Option(c, c)));
        filterCity.value = sc;
    }

    // --- 3. (ИЗМЕНЕНО) Функция загрузки данных ---
    async function fetchMatrix() {
        try {
            loadingMsg.style.display = 'block';
            matrixContainer.style.display = 'none';

            const response = await fetch(API_URL);
            if (!response.ok) throw new Error('Ошибка сети');
            
            fullData = await response.json(); // Сохраняем в глобальную переменную
            
            populateFilters(); // Заполняем фильтры
            renderMatrix();    // Рисуем (уже с учетом фильтров по умолчанию)

            loadingMsg.style.display = 'none';
            matrixContainer.style.display = 'block';
        } catch (error) {
            loadingMsg.textContent = 'Ошибка загрузки: ' + error.message;
            loadingMsg.className = 'alert alert-danger';
        }
    }

    // --- 4. (НОВОЕ) Обработчики фильтров ---
    if(filterStatus) filterStatus.onchange = renderMatrix;
    if(filterCity) filterCity.onchange = renderMatrix;
    let debounceTimer;
    if(searchBar) searchBar.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => renderMatrix(), 300);
    });

    if(exportBtn) exportBtn.onclick = () => {
        if (!fullData.matrix.length) return;
        
        // (ИСПРАВЛЕНО) Экспорт только отфильтрованных
        const visibleHeaders = fullData.headers.filter(h => 
            (!filterStatus.value || h.status === filterStatus.value) &&
            (!filterCity.value || h.city === filterCity.value) &&
            (!searchBar.value || h.name.toLowerCase().includes(searchBar.value.toLowerCase()))
        );
        const visibleColumnIndices = new Set(visibleHeaders.map(h => fullData.headers.indexOf(h)));

        const clean = (text) => `"${String(text || '').replace(/"/g, '""')}"`;
        let csv = "\uFEFFАртикул,Название,";
        csv += visibleHeaders.map(h => clean(h.name)).join(",") + "\r\n";

        fullData.matrix.forEach(row => {
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

    fetchMatrix();
});
