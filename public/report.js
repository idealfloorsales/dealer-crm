// report.js
document.addEventListener('DOMContentLoaded', () => {

    const API_PRODUCTS_URL = '/api/products';
    
    const productSelect = document.getElementById('product-select');
    const reportTable = document.getElementById('report-table');
    const reportListBody = document.getElementById('report-list-body');
    const reportTitle = document.getElementById('report-title');
    const noDataMsg = document.getElementById('report-no-data-msg');

    const safeText = (text) => text ? text.replace(/</g, "&lt;").replace(/>/g, "&gt;") : '---';

    // --- 1. Загрузка каталога в выпадающий список ---
    async function populateProductSelect() {
        try {
            const response = await fetch(API_PRODUCTS_URL);
            if (!response.ok) throw new Error('Не удалось загрузить каталог');
            const products = await response.json();

            productSelect.innerHTML = '<option value="">-- Выберите товар --</option>'; // Очистка
            
            products.forEach(product => {
                const productId = product.id; 
                const option = new Option(`[${product.sku}] ${product.name}`, productId);
                productSelect.add(option);
            });

        } catch (error) {
            console.error(error);
            productSelect.innerHTML = `<option value="">${error.message}</option>`;
        }
    }

    // --- 2. Загрузка дилеров для выбранного товара ---
    async function fetchDealersForProduct(productId, productName) {
        if (!productId) {
            reportTitle.textContent = '';
            reportTable.style.display = 'none';
            noDataMsg.textContent = '';
            return;
        }

        reportTitle.textContent = `Дилеры, у которых выставлен: ${productName}`;
        reportListBody.innerHTML = '<tr><td colspan="4">Загрузка...</td></tr>';
        reportTable.style.display = 'table';
        noDataMsg.textContent = '';

        try {
            const response = await fetch(`${API_PRODUCTS_URL}/${productId}/dealers`);
            if (!response.ok) throw new Error('Не удалось загрузить список дилеров');
            const dealers = await response.json();

            if (dealers.length === 0) {
                reportTable.style.display = 'none';
                noDataMsg.textContent = 'Этот товар не выставлен ни у одного дилера.';
                return;
            }

            reportListBody.innerHTML = ''; // Очистка
            dealers.forEach(dealer => {
                const dealerId = dealer.id; 
                const row = reportListBody.insertRow();
                row.innerHTML = `
                    <td>${safeText(dealer.dealer_id)}</td>
                    <td>${safeText(dealer.name)}</td>
                    <td>${safeText(dealer.city)}</td>
                    <td>
                        <a href="dealer.html?id=${dealerId}" target="_blank" class="btn-primary" style="text-decoration: none; padding: 5px 10px; margin: 0;">
                            Открыть
                        </a>
                    </td>
                `;
            });

        } catch (error) {
            console.error(error);
            reportTable.style.display = 'none';
            noDataMsg.textContent = error.message;
        }
    }

    // --- 3. Обработчик событий ---
    productSelect.addEventListener('change', (e) => {
        const selectedId = e.target.value;
        const selectedText = e.target.options[e.target.selectedIndex].text;
        fetchDealersForProduct(selectedId, selectedText);
    });

    // --- Инициализация ---
    populateProductSelect();
});
