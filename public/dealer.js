// dealer.js
document.addEventListener('DOMContentLoaded', () => {
    
    const detailsContainer = document.getElementById('dealer-details');
    const productsListContainer = document.getElementById('dealer-products-list');
    const contactsListContainer = document.getElementById('dealer-contacts-list'); 
    const bonusesContainer = document.getElementById('dealer-bonuses');
    const photoGalleryContainer = document.getElementById('dealer-photo-gallery'); 
    const deliveryContainer = document.getElementById('dealer-delivery'); 
    const linksContainer = document.getElementById('dealer-links'); // (НОВОЕ)
    
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
    // (НОВАЯ ФУНКЦИЯ) Проверяем, есть ли 'http'
    const formatUrl = (url) => {
        if (!url) return null;
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            return 'https://' + url;
        }
        return url;
    }

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
                <p><strong>Тип цен:</strong> ${safeText(dealer.price_type)}</p>
            `;
            
            renderDealerLinks(dealer.website, dealer.instagram); // (НОВОЕ)
            renderDealerContacts(dealer.contacts);
            renderDealerPhotos(dealer.photos); 
            
            deliveryContainer.textContent = safeText(dealer.delivery) || '<i>Нет данных о доставке</i>';
            bonusesContainer.textContent = safeText(dealer.bonuses) || '<i>Нет данных о бонусах</i>';

            document.title = `Дилер: ${dealer.name}`;

        } catch (error) {
            console.error('Ошибка:', error);
            detailsContainer.innerHTML = `<p style="color: red;">${error.message}</p>`;
            deleteBtn.style.display = 'none';
        }
    }
    
    // --- (НОВАЯ ФУНКЦИЯ) Отрисовка Кнопок-Ссылок ---
    function renderDealerLinks(website, instagram) {
        let html = '';
        const safeWebsite = formatUrl(website);
        const safeInstagram = formatUrl(instagram);

        if (safeWebsite) {
            html += `<a href="${safeWebsite}" target="_blank" class="btn-secondary">Перейти на сайт</a>`;
        }
        if (safeInstagram) {
            html += `<a href="${safeInstagram}" target="_blank" class="btn-secondary">Перейти на Инстаграм</a>`;
        }
        if (!safeWebsite && !safeInstagram) {
            linksContainer.style.display = 'none'; // Скрываем блок, если ссылок нет
        }
        
        linksContainer.innerHTML = html;
    }

    // --- Отрисовка Галереи Фото ---
    function renderDealerPhotos(photos) {
        if (!photos || photos.length === 0) {
            photoGalleryContainer.innerHTML = '<p><i>Нет фотографий.</i></p>';
            return;
        }
        
        photoGalleryContainer.innerHTML = photos.map(photo => `
            <div class="gallery-item">
                <a href="${photo.photo_url}" target="_blank">
                    <img src="${photo.photo_url}" alt="${safeText(photo.description)}">
                </a>
                <p>${safeText(photo.description) || 'Без описания'}</p>
            </div>
        `).join('');
    }

    // --- Отрисовка таблицы контактов ---
    function renderDealerContacts(contacts) {
        if (!contacts || contacts.length === 0) {
            contactsListContainer.innerHTML = '<p><i>Нет контактных лиц.</i></p>';
            return;
        }
        
        let html = '<table id="report-table" style="margin-top: 0;"><thead><tr><th>Имя</th><th>Должность</th><th>Контакт</th></tr></thead><tbody>';
        
        contacts.forEach(contact => {
            html += `
                <tr>
                    <td>${safeText(contact.name)}</td>
                    <td>${safeText(contact.position)}</td>
                    <td>${safeText(contact.contactInfo)}</td>
                </tr>
            `;
        });
        
        html += '</tbody></table>';
        contactsListContainer.innerHTML = html;
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
