// report.js
document.addEventListener('DOMContentLoaded', () => {

    const API_URL = '/api/matrix';
    
    const tableContainer = document.getElementById('matrix-container');
    const tableHeader = document.getElementById('matrix-header');
    const tableBody = document.getElementById('matrix-body');
    const loadingMsg = document.getElementById('loading-msg');
    const exportBtn = document.getElementById('export-csv-btn');
    
    let matrixData = null; // Кэш для экспорта
    let headerData = null; // Кэш для экспорта

    const safeText = (text) => text ? text.replace(/</g, "&lt;").replace(/>/g, "&gt;") : '---';

    // --- 1. Загрузка данных для Матрицы ---
    async function fetchMatrix() {
        try {
            const response = await fetch(API_URL);
            if (!response.ok) throw new Error('Ошибка сети при загрузке матрицы');
            
            const { headers, matrix } = await response.json();
            
            // Сохраняем в кэш для CSV
            matrixData = matrix;
            headerData = headers;

            if (headers.length === 0 || matrix.length === 0) {
                loadingMsg.textContent = 'Данные отсутствуют. Сначала добавьте дилеров и товары.';
                loadingMsg.classList.replace('alert-info', 'alert-warning');
                return;
            }
            
            renderMatrix(headers, matrix);
            
            loadingMsg.style.display = 'none';
            tableContainer.style.display = 'block';

        } catch (error) {
            console.error(error);
            loadingMsg.textContent = `Критическая ошибка: ${error.message}`;
            loadingMsg.classList.replace('alert-info', 'alert-danger');
        }
    }
    
    // --- 2. Отрисовка Матрицы ---
    function renderMatrix(headers, matrix) {
        
        // --- Рисуем "Шапку" (Дилеры) ---
        let headerHtml = '<tr><th class="matrix-product-cell">Артикул (Товар)</th>';
        headers.forEach(dealer => {
            // (ИЗМЕНЕНО) Делаем дилера кликабельным
            headerHtml += `<th><a href="dealer.html?id=${dealer.id}" target="_blank">${safeText(dealer.name)}</a></th>`;
        });
        headerHtml += '</tr>';
        tableHeader.innerHTML = headerHtml;

        // --- Рисуем "Тело" (Товары и Галочки) ---
        let bodyHtml = '';
        matrix.forEach(productRow => {
            bodyHtml += '<tr>';
            // (ИЗМЕНЕНО) "Замороженная" ячейка с Артикулом
            bodyHtml += `<td class="matrix-product-cell">${safeText(productRow.sku)}</td>`;
            
            productRow.dealers.forEach(dealerStatus => {
                if (dealerStatus.has_product) {
                    bodyHtml += '<td class="matrix-cell-yes"><i class="bi bi-check-lg"></i></td>';
                } else {
                    bodyHtml += '<td class="matrix-cell-no"></td>';
                }
            });
            bodyHtml += '</tr>';
        });
        tableBody.innerHTML = bodyHtml;
    }
    
    // --- 3. (НОВОЕ) Экспорт в CSV ---
    function exportToCSV() {
        if (!matrixData || !headerData) {
            alert("Данные еще не загружены.");
            return;
        }

        let csvContent = "data:text/csv;charset=utf-8,";
        
        // Строка 1: Заголовки (Артикул, Название, ...Дилеры)
        let headerRow = ["Артикул", "Название"];
        headerData.forEach(dealer => {
            // Очищаем имя дилера от кавычек
            const cleanName = dealer.name.replace(/"/g, '""');
            headerRow.push(`"${cleanName}"`);
        });
        csvContent += headerRow.join(",") + "\r\n";

        // Строки 2+: Данные (SKU, Name, 1, 0, 1...)
        matrixData.forEach(productRow => {
            let row = [
                `"${productRow.sku}"`,
                `"${productRow.name.replace(/"/g, '""')}"`
            ];
            productRow.dealers.forEach(dealerStatus => {
                row.push(dealerStatus.has_product ? "1" : "0");
            });
            csvContent += row.join(",") + "\r\n";
        });

        // Создаем ссылку и "кликаем"
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "matrix_export.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
    
    exportBtn.addEventListener('click', exportToCSV);

    // --- Инициализация ---
    fetchMatrix();
});
