// report.js
document.addEventListener('DOMContentLoaded', () => {

    const API_URL = '/api/matrix';
    
    const tableContainer = document.getElementById('matrix-container');
    const tableHeader = document.getElementById('matrix-header');
    const tableBody = document.getElementById('matrix-body');
    const loadingMsg = document.getElementById('loading-msg');
    const exportBtn = document.getElementById('export-csv-btn');
    
    let matrixData = null;
    let headerData = null;

    const safeText = (text) => text ? text.replace(/</g, "&lt;").replace(/>/g, "&gt;") : '---';

    async function fetchMatrix() {
        try {
            const response = await fetch(API_URL);
            if (!response.ok) throw new Error('Ошибка загрузки');
            
            const { headers, matrix } = await response.json();
            matrixData = matrix;
            headerData = headers;

            if (headers.length === 0 || matrix.length === 0) {
                loadingMsg.textContent = 'Данные отсутствуют.';
                loadingMsg.classList.replace('alert-info', 'alert-warning');
                return;
            }
            renderMatrix(headers, matrix);
            loadingMsg.style.display = 'none';
            tableContainer.style.display = 'block';
        } catch (error) {
            loadingMsg.textContent = `Ошибка: ${error.message}`;
            loadingMsg.classList.replace('alert-info', 'alert-danger');
        }
    }
    
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
                bodyHtml += dealerStatus.has_product ? '<td class="matrix-cell-yes"><i class="bi bi-check-lg"></i></td>' : '<td class="matrix-cell-no"></td>';
            });
            bodyHtml += '</tr>';
        });
        tableBody.innerHTML = bodyHtml;
    }
    
    function exportToCSV() {
        if (!matrixData || !headerData) return alert("Нет данных.");

        const cleanCell = (text) => `"${String(text || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`;
        
        // (ИСПРАВЛЕНО) Добавляем BOM для Excel
        let csvContent = "\uFEFF"; 
        
        let headerRow = ["Артикул", "Название"];
        headerData.forEach(dealer => headerRow.push(cleanCell(dealer.name)));
        csvContent += headerRow.join(",") + "\r\n";

        matrixData.forEach(productRow => {
            let row = [cleanCell(productRow.sku), cleanCell(productRow.name)];
            productRow.dealers.forEach(ds => row.push(ds.has_product ? "1" : "0"));
            csvContent += row.join(",") + "\r\n";
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        if (link.download !== undefined) { 
            const url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            link.setAttribute("download", "matrix_export.csv");
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }
    
    exportBtn.addEventListener('click', exportToCSV);
    fetchMatrix();
});
