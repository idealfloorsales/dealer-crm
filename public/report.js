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
        
        let headerHtml = '<tr><th class="matrix-product-cell">Артикул (Товар)</th>';
        headers.forEach(dealer => {
            headerHtml += `<th><a href="dealer.html?id=${dealer.id}" target="_blank">${safeText(dealer.name)}</a></th>`;
        });
        headerHtml += '</tr>';
        tableHeader.innerHTML = headerHtml;

        let bodyHtml = '';
        matrix.forEach(productRow => {
            bodyHtml += '<tr>';
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
    
    // --- 3. (ИСПРАВЛЕНО) Экспорт в CSV с UTF-8 BOM ---
    function exportToCSV() {
        if (!matrixData || !headerData) {
            alert("Данные еще не загружены.");
            return;
        }

        // Функция для очистки ячейки (удаляет кавычки и запятые)
        const cleanCell = (text) => {
            let str = String(text || '');
            str = str.replace(/"/g, '""'); // Экранируем кавычки
            str = str.replace(/,/g, ';'); // Заменяем запятые на точки с запятой
            str = str.replace(/\n/g, ' '); // Убираем переносы строк
            return `"${str}"`;
        };
        
        // (ИСПРАВЛЕНО) \uFEFF - это BOM-маркер для Excel
        let csvContent = "\uFEFF"; 
        
        // Строка 1: Заголовки
        let headerRow = ["Артикул", "Название"];
        headerData.forEach(dealer => {
            headerRow.push(cleanCell(dealer.name));
        });
        csvContent += headerRow.join(",") + "\r\n";

        // Строки 2+: Данные
        matrixData.forEach(productRow => {
            let row = [
                cleanCell(productRow.sku),
                cleanCell(productRow.name)
            ];
            productRow.dealers.forEach(dealerStatus => {
                row.push(dealerStatus.has_product ? "1" : "0");
            });
            csvContent += row.join(",") + "\r\n";
        });

        // Создаем Blob (вместо data:uri) для лучшей совместимости
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        
        const link = document.createElement("a");
        if (link.download !== undefined) { // Проверка, что браузер поддерживает 'download'
            const url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            link.setAttribute("download", "matrix_export.csv");
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }
    
    exportBtn.addEventListener('click', exportToCSV);

    // --- Инициализация ---
    fetchMatrix();
});
