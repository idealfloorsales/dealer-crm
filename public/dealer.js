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
    const posListContainer = document.getElementById('dealer-pos-list'); 
    
    const deleteBtn = document.getElementById('delete-dealer-btn'); 
    const editBtn = document.getElementById('edit-dealer-btn'); 
    
    // Элементы лайтбокса (карусели)
    const carouselInner = document.getElementById('carousel-inner');

    const API_URL = '/api/dealers';

    const params = new URLSearchParams(window.location.search);
    const dealerId = params.get('id');

    if (!dealerId) {
        detailsContainer.innerHTML = '<h2 class="text-danger">Ошибка: ID дилера не указан в URL.</h2>';
        deleteBtn.style.display = 'none'; 
        editBtn.style.display = 'none'; 
        return;
    }

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
            renderDealerPos(dealer.pos_materials); 
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
            html += `<a href="${safeWebsite}" target="_blank" class="btn btn-secondary me-2"><i class="bi bi-box-arrow-up-right me-2"></i>Перейти на сайт</a>`;
        }
        if (safeInstagram) {
            html += `<a href="${safeInstagram}" target="_blank" class="btn btn-secondary"><i class="bi bi-instagram me-2"></i>Перейти на Инстаграм</a>`;
        }
        if (!safeWebsite && !safeInstagram) {
            linksContainer.style.display = 'none'; 
        }
        
        linksContainer.innerHTML = html;
    }

    // --- (ИЗМЕНЕНО) Отрисовка Галереи Фото (Дата/Время + Фото) ---
    function renderDealerPhotos(photos) {
        if (!photos || photos.length === 0) {
            photoGalleryContainer.innerHTML = '<p><i>Нет фотографий.</i></p>';
            return;
        }

        // 1. Сортируем: Свежие сверху
        photos.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

        // 2. Генерируем HTML
        let galleryHtml = '';
        let carouselHtml = '';

        photos.forEach((photo, index) => {
            // Форматируем дату и время
            let dateString = "Ранее";
            if (photo.date) {
                const dateObj = new Date(photo.date);
                // Пример: 12.11.2025 14:30
                dateString = dateObj.toLocaleString('ru-RU', {
                    day: '2-digit', month: '2-digit', year: 'numeric',
                    hour: '2-digit', minute: '2-digit'
                });
            }

            // Карточка для галереи
            galleryHtml += `
                <div class="gallery-card" onclick="openLightbox(${index})">
                    <div class="gallery-date">${dateString}</div>
                    <div class="gallery-img-wrapper">
                        <img src="${photo.photo_url}" loading="lazy" alt="Фото">
                    </div>
                </div>
            `;

            // Слайд для лайтбокса (на весь экран)
            carouselHtml += `
                <div class="carousel-item ${index === 0 ? 'active' : ''}" style="height: 100%;">
                    <div class="d-flex justify-content-center align-items-center h-100">
                        <img src="${photo.photo_url}" style="max-height: 100%; max-width: 100%; object-fit: contain;">
                        <div class="carousel-caption d-none d-md-block bg-dark bg-opacity-50 rounded p-2">
                            <p class="mb-0">${dateString}</p>
                        </div>
                    </div>
                </div>
            `;
        });

        photoGalleryContainer.innerHTML = galleryHtml;
        carouselInner.innerHTML = carouselHtml;
    }

    // Функция открытия лайтбокса
    window.openLightbox = function(index) {
        const myModal = new bootstrap.Modal(document.getElementById('imageModal'));
        const myCarousel = document.querySelector('#photoCarousel');
        const carousel = new bootstrap.Carousel(myCarousel);
        
        carousel.to(index); 
        myModal.show();
    }

    // --- Отрисовка таблицы контактов ---
    function renderDealerContacts(contacts) {
        if (!contacts || contacts.length === 0) {
            contactsListContainer.innerHTML = '<p><i>Нет контактных лиц.</i></p>';
            return;
        }
        let html = '<table class="table table-bordered table-striped" style="margin-top: 0;"><thead><tr><th>Имя</th><th>Должность</th><th>Контакт</th></tr></thead><tbody>';
        contacts.forEach(contact => {
            html += `<tr><td>${safeText(contact.name)}</td><td>${safeText(contact.position)}</td><td>${safeText(contact.contactInfo)}</td></tr>`;
        });
        contactsListContainer.innerHTML = html + '</tbody></table>';
    }
    
    // --- Отрисовка таблицы Доп. Адресов ---
    function renderDealerAddresses(addresses) {
        if (!addresses || addresses.length === 0) {
            addressesListContainer.innerHTML = '<p><i>Нет дополнительных адресов.</i></p>';
            return;
        }
        let html = '<table class="table table-bordered table-striped" style="margin-top: 0;"><thead><tr><th>Описание</th><th>Город</th><th>Адрес</th></tr></thead><tbody>';
        addresses.forEach(addr => {
            html += `<tr><td>${safeText(addr.description)}</td><td>${safeText(addr.city)}</td><td>${safeText(addr.address)}</td></tr>`;
        });
        addressesListContainer.innerHTML = html + '</tbody></table>';
    }

    // --- Отрисовка таблицы POS ---
    function renderDealerPos(posItems) {
        if (!posItems || posItems.length === 0) {
            posListContainer.innerHTML = '<p><i>Нет оборудования.</i></p>';
            return;
        }
        let html = '<table class="table table-bordered table-striped" style="margin-top: 0;"><thead><tr><th>Оборудование</th><th>Количество</th></tr></thead><tbody>';
        posItems.forEach(item => {
            html += `<tr><td>${safeText(item.name)}</td><td>${item.quantity || 1}</td></tr>`;
        });
        posListContainer.innerHTML = html + '</tbody></table>';
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

    // --- Обработчики кнопок ---
    editBtn.addEventListener('click', () => {
        localStorage.setItem('pendingEditDealerId', dealerId);
        window.location.href = 'index.html';
    });

    deleteBtn.addEventListener('click', async () => {
        if (confirm(`Вы уверены, что хотите НАВСЕГДА удалить этого дилера?\nЭто действие нельзя отменить.`)) {
            try {
                const response = await fetch(`${API_URL}/${dealerId}`, {
                    method: 'DELETE'
                });
                if (response.ok) {
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
