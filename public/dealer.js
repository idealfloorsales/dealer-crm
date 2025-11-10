// dealer.js
document.addEventListener('DOMContentLoaded', () => {
    
    const detailsContainer = document.getElementById('dealer-details');
    const productsListContainer = document.getElementById('dealer-products-list');
    const bonusesContainer = document.getElementById('dealer-bonuses');
    const photoContainer = document.getElementById('dealer-photo');
    
    const deleteBtn = document.getElementById('delete-dealer-btn'); 
    const API_URL = '/api/dealers';

    const params = new URLSearchParams(window.location.search);
    const dealerId = params.get('id');

    if (!dealerId) {
        detailsContainer.innerHTML = '<p style="color: red;">Ошибка: ID дилера не указан в URL.</p>';
        deleteBtn.style.display = 'none'; 
        return;
    }

    const safeText = (text) => text ? text.replace(/</g, "&lt;").replace(/>/g, "&gt;") : '---';

    // --- Функция 1: Загрузка инфо о дилере ---
    async function fetchDealerDetails() {
        try {
            const response = await fetch(`${API_URL}/${dealerId}`);
            if (!response.ok) throw new Error(`Дилер с ID ${dealerId} не найден.`);
            
            const dealer = await response.json();

            detailsContainer.innerHTML = `
                <h2>${safeText(dealer.name)}</h2>
                <p><strong>ID точки:</strong> ${safeText(dealer.dealer_id)}</p>
                <p><strong>Организация:</strong> ${safeText(dealer.organization)}</p>
                <p><strong>Город:</strong> ${safeText(dealer.city)}</p>
                <p><strong>Адрес:</strong> ${safeText(dealer.address)}</p>
                <p><strong>Контакты:</strong> ${safeText(dealer.contacts)}</p>
                <p><strong>Тип цен:</strong> ${safeText(dealer.price_type)}</p>
            `;
            bonusesContainer.textContent = safeText(dealer.bonuses) || '<i>Нет данных о бонусах</i>';
            photoContainer.innerHTML = dealer.photo_url ? 
                `<img src="${dealer.photo_url}" alt="Фото ${safeText(dealer.name)}">` : 
                '<p><i>Нет фото</i></p>';

            document.title = `Дилер: ${dealer.name}`;

        } catch (error) {
            console.error('Ошибка:', error);
            detailsContainer.innerHTML = `<p style="color: red;">${error.message}</p>`;
            deleteBtn.style.display = 'none';
        }
    }

    // --- Функция 2: Загрузка товаров дилера ---
    async function fetchDealerProducts() {
        try {
            const response = await fetch(`${API_URL}/${dealerId}/products`);
            if (!response.ok) throw new Error('Ошибка загрузки товаров дилера');

            const products = await response.json(); 

            if (products.length === 0) {
                productsListContainer.innerHTML = '<p><i>Нет выставленных товаров.</i></p>';
                return;
            }
            
            productsListContainer.innerHTML = `
                <ul class="products-list-detailed">
                    ${products.map(p => `<li><strong>${safeText(p.sku)}</strong> - ${safeText(p.name)}</li>`).join('')}
                </ul>
            `;

        } catch (error) {
            console.error('Ошибка:', error);
            productsListContainer.innerHTML = `<p style="color: red;">${error.message}</p>`;
        }
    }


    // --- Обработчик: Удаление дилера ---
    deleteBtn.addEventListener('click', async () => {
        if (confirm(`Вы уверены, что хотите НАВСЕГДА удалить этого дилера?\nЭто действие нельзя отменить.`)) {
            try {
                const response = await fetch(`${API_URL}/${dealerId}`, {
                    method: 'DELETE'
                });
                if (response.ok) {
                    alert('Дилер успешно удален.');
                    window.location.href = 'index.html'; 
                } else {
                    alert('Ошибка при удалении дилера.');
                }
            } catch (error) {
                console.error('Ошибка при удалении:', error);
                alert('Сетевая ошибка при удалении.');
            }
        }
    });

    // --- Запускаем обе загрузки ---
    fetchDealerDetails();
    fetchDealerProducts();
});
