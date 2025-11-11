// dealer.js
document.addEventListener('DOMContentLoaded', () => {
    
    const detailsContainer = document.getElementById('dealer-details');
    const productsListContainer = document.getElementById('dealer-products-list');
    const contactsListContainer = document.getElementById('dealer-contacts-list'); 
    const bonusesContainer = document.getElementById('dealer-bonuses');
    const photoGalleryContainer = document.getElementById('dealer-photo-gallery'); 
    const deliveryContainer = document.getElementById('dealer-delivery'); 
    const linksContainer = document.getElementById('dealer-links'); 
    const addressesListContainer = document.getElementById('dealer-addresses-list'); 
    
    const deleteBtn = document.getElementById('delete-dealer-btn'); 
    const editBtn = document.getElementById('edit-dealer-btn'); 
    
    const API_URL = '/api/dealers';

    const params = new URLSearchParams(window.location.search);
    const dealerId = params.get('id');

    if (!dealerId) {
        detailsContainer.innerHTML = '<h2 class="text-danger">Ошибка: ID дилера не указан в URL.</h2>';
        deleteBtn.style.display = 'none'; 
        editBtn.style.display = 'none'; 
        return;
    }

    // (ВОТ ЭТА ФУНКЦИЯ, КОТОРУЮ МЫ ВЕРНУЛИ)
    const safeText = (text) => text ? text.replace(/</g, "&lt;").replace(/>/g, "&gt;") : '---';
    
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
                <h1 class="display-6">${safeText(dealer.name)}</h1>
                <p class="lead"><strong>ID точки:</strong> ${safeText(dealer.dealer_id)}</p>
                <p><strong>Организация:</strong> ${safeText(dealer.organization)}</p>
                <p><strong>Главный город:</strong> ${safeText(dealer.city)}</p>
                <p><strong>Главный адрес:</strong> ${safeText(dealer.address)}</p>
                <p><strong>Тип цен:</strong> ${safeText(dealer.price_type)}</p>
            `;
            
            renderDealerLinks(dealer.website, dealer.instagram); 
            renderDealerContacts(dealer.contacts);
            renderDealerAddresses(dealer.additional_addresses); 
            renderDealerPhotos(dealer.photos); 
            
            deliveryContainer.textContent = safeText(dealer.delivery) || '<i>Нет данных о доставке</i>';
            bonusesContainer.textContent = safeText(dealer.bonuses) || '<i>Нет данных о бонусах</i>';

            document.title = `Дилер: ${dealer.name}`;

        } catch (error) {
            console.error('Ошибка:', error);
            detailsContainer.innerHTML = `<h2 class="text-danger">${error.message}</h2>`;
            deleteBtn.style.display = 'none';
            editBtn.style.display = 'none';
        }
    }
    
    // --- Отрисовка Кнопок-Ссылок ---
    function renderDealerLinks(website, instagram) {
        let html = '';
        const safeWebsite = formatUrl(website);
        const safeInstagram = formatUrl(instagram);

        if (safeWebsite) {
            html += `<a href="${safeWebsite}" target="_blank" class="btn btn-secondary"><i class="bi bi-box-arrow-up-right me-2"></i>Перейти на сайт</a>`;
        }
        if (safeInstagram) {
            html += `<a href="${safeInstagram}" target="_blank" class="btn btn-secondary"><i class="bi bi-instagram me-2"></i>Перейти на Инстаграм</a>`;
        }
        if (!safeWebsite && !safeInstagram) {
            linksContainer.style.display = 'none'; 
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
        
        let html = '<table class="table table-bordered table-striped" style="margin-top: 0;"><thead><tr><th>Имя</th><th>Должность</th><th>Контакт</th></tr></thead><tbody>';
        
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
    
    // --- Отрисовка таблицы Доп. Адресов ---
    function renderDealerAddresses(addresses) {
        if (!addresses || addresses.length === 0) {
            addressesListContainer.innerHTML = '<p><i>Нет дополнительных адресов.</i></p>';
            return;
        }
        
        let html = '<table class="table table-bordered table-striped" style="margin-top: 0;"><thead><tr><th>Описание</th><th>Город</th><th>Адрес</th></tr></thead><tbody>';
        
        addresses.forEach(addr => {
            html += `
                <tr>
                    <td>${safeText(addr.description)}</td>
                    <td>${safeText(addr.city)}</td>
                    <td>${safeText(addr.address)}</td>
                </tr>
            `;
        });
        
        html += '</tbody></table>';
        addressesListContainer.innerHTML = html;
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
            productsListContainer.innerHTML = `<p class="text-danger">${error.message}</p>`;
        }
    }

    // --- Обработчик: Редактирование дилера ---
    editBtn.addEventListener('click', () => {
        localStorage.setItem('pendingEditDealerId', dealerId);
        window.location.href = 'index.html';
    });

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
