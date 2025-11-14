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
    const visitsListContainer = document.getElementById('dealer-visits-list'); 
    
    const deleteBtn = document.getElementById('delete-dealer-btn'); 
    const editBtn = document.getElementById('edit-dealer-btn'); 
    const navigateBtn = document.getElementById('navigate-btn'); // (НОВАЯ КНОПКА)
    const carouselInner = document.getElementById('carousel-inner');

    const API_URL = '/api/dealers';
    const params = new URLSearchParams(window.location.search);
    const dealerId = params.get('id');

    // Переменные для координат
    let dealerLat = null;
    let dealerLng = null;

    if (!dealerId) {
        detailsContainer.innerHTML = '<h2 class="text-danger">Ошибка: ID дилера не указан в URL.</h2>';
        if(deleteBtn) deleteBtn.style.display = 'none'; 
        if(editBtn) editBtn.style.display = 'none'; 
        if(navigateBtn) navigateBtn.style.display = 'none';
        return;
    }

    const safeText = (text) => text ? text.replace(/</g, "&lt;").replace(/>/g, "&gt;") : '---';
    const formatUrl = (url) => { if (!url) return null; if (!url.startsWith('http')) return 'https://' + url; return url; }

    async function fetchDealerDetails() {
        try {
            const response = await fetch(`${API_URL}/${dealerId}`);
            if (!response.ok) throw new Error(`Дилер с ID ${dealerId} не найден.`);
            const dealer = await response.json();

            // Сохраняем координаты
            dealerLat = dealer.latitude;
            dealerLng = dealer.longitude;

            // Если координат нет, скрываем кнопку "Поехать"
            if (!dealerLat || !dealerLng) {
                if(navigateBtn) navigateBtn.style.display = 'none';
            }

            detailsContainer.innerHTML = `
                <h1 class="display-6">${safeText(dealer.name)}</h1>
                <p class="lead"><strong>ID точки:</strong> ${safeText(dealer.dealer_id)}</p>
                <p><strong>Организация:</strong> ${safeText(dealer.organization)}</p>
                <p><strong>Город:</strong> ${safeText(dealer.city)}</p>
                <p><strong>Адрес:</strong> ${safeText(dealer.address)}</p>
                <p><strong>Тип цен:</strong> ${safeText(dealer.price_type)}</p>
            `;
            
            renderDealerLinks(dealer.website, dealer.instagram); 
            renderDealerVisits(dealer.visits || []);
            renderDealerContacts(dealer.contacts || []);
            renderDealerAddresses(dealer.additional_addresses || []); 
            renderDealerPos(dealer.pos_materials || []); 
            renderDealerPhotos(dealer.photos || []); 
            
            if(deliveryContainer) deliveryContainer.textContent = safeText(dealer.delivery) || 'Нет данных';
            if(bonusesContainer) bonusesContainer.textContent = safeText(dealer.bonuses) || 'Нет данных';

            document.title = `Дилер: ${dealer.name}`;

        } catch (error) {
            console.error('Ошибка:', error);
            detailsContainer.innerHTML = `<h2 class="text-danger">${error.message}</h2>`;
            if(deleteBtn) deleteBtn.style.display = 'none';
            if(editBtn) editBtn.style.display = 'none';
            if(navigateBtn) navigateBtn.style.display = 'none';
        }
    }
    
    function renderDealerLinks(website, instagram) {
        if (!linksContainer) return;
        let html = '';
        const safeWebsite = formatUrl(website);
        const safeInstagram = formatUrl(instagram);
        if (safeWebsite) html += `<a href="${safeWebsite}" target="_blank" class="btn btn-secondary me-2"><i class="bi bi-globe me-2"></i>Сайт</a>`;
        if (safeInstagram) html += `<a href="${safeInstagram}" target="_blank" class="btn btn-secondary"><i class="bi bi-instagram me-2"></i>Instagram</a>`;
        if (!safeWebsite && !safeInstagram) linksContainer.style.display = 'none'; 
        else { linksContainer.innerHTML = html; linksContainer.style.display = 'flex'; }
    }

    function renderDealerPhotos(photos) {
        const photoGalleryContainer = document.getElementById('dealer-photo-gallery');
        if (!photoGalleryContainer) return;
        if (!photos || photos.length === 0) { photoGalleryContainer.innerHTML = '<p><i>Нет фотографий.</i></p>'; return; }
        photos.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
        let html = '<div class="gallery-grid">';
        let carouselHtml = '';
        photos.forEach((photo, index) => {
            let dateString = "Ранее";
            if (photo.date) {
                const dateObj = new Date(photo.date);
                dateString = dateObj.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
            }
            html += `<div class="gallery-card" onclick="openLightbox(${index})"><div class="gallery-date">${dateString}</div><div class="gallery-img-wrapper"><img src="${photo.photo_url}" loading="lazy" alt="Фото"></div></div>`;
            carouselHtml += `<div class="carousel-item ${index === 0 ? 'active' : ''}" style="height: 100%;"><div class="d-flex justify-content-center align-items-center h-100"><img src="${photo.photo_url}" style="max-height: 100%; max-width: 100%; object-fit: contain;"><div class="carousel-caption d-none d-md-block bg-dark bg-opacity-50 rounded p-2"><p class="mb-0">${dateString}</p></div></div></div>`;
        });
        html += '</div>';
        photoGalleryContainer.innerHTML = html;
        if (carouselInner) carouselInner.innerHTML = carouselHtml;
    }

    window.openLightbox = function(index) {
        const modalEl = document.getElementById('imageModal');
        const carouselEl = document.querySelector('#photoCarousel');
        if (modalEl && carouselEl) {
            const myModal = new bootstrap.Modal(modalEl);
            const carousel = new bootstrap.Carousel(carouselEl);
            carousel.to(index); 
            myModal.show();
        }
    }

    function renderDealerVisits(visits) {
        if (!visitsListContainer) return;
        if (!visits || visits.length === 0) { visitsListContainer.innerHTML = '<p><i>Нет записей.</i></p>'; return; }
        visits.sort((a, b) => new Date(b.date) - new Date(a.date));
        let html = '<table class="table table-bordered table-striped" style="margin-top:0"><thead><tr><th style="width:120px">Дата</th><th>Комментарий</th></tr></thead><tbody>';
        visits.forEach(v => {
            const dateStr = v.date ? new Date(v.date).toLocaleDateString('ru-RU') : '-';
            html += `<tr><td>${dateStr}</td><td>${safeText(v.comment)}</td></tr>`;
        });
        visitsListContainer.innerHTML = html + '</tbody></table>';
    }

    // --- (ИЗМЕНЕНО) Умные контакты ---
    function renderDealerContacts(contacts) {
        if (!contactsListContainer) return;
        if (!contacts || contacts.length === 0) { contactsListContainer.innerHTML = '<p><i>Нет данных.</i></p>'; return; }
        
        let html = '<div class="table-responsive"><table class="table table-bordered table-striped" style="margin-top: 0;"><thead><tr><th>Имя</th><th>Должность</th><th>Действия</th></tr></thead><tbody>';
        
        contacts.forEach(contact => {
            const phoneClean = contact.contactInfo ? contact.contactInfo.replace(/[^0-9]/g, '') : '';
            const hasPhone = phoneClean.length >= 10; // Хотя бы 10 цифр
            
            let actions = safeText(contact.contactInfo); // По умолчанию просто текст
            
            if (hasPhone) {
                // Если есть телефон, делаем кнопки
                actions = `
                    <div class="d-flex align-items-center gap-2">
                        <span>${safeText(contact.contactInfo)}</span>
                        <a href="tel:+${phoneClean}" class="btn btn-sm btn-outline-primary btn-contact-call" title="Позвонить"><i class="bi bi-telephone-fill"></i></a>
                        <a href="https://wa.me/${phoneClean}" target="_blank" class="btn btn-sm btn-outline-success btn-contact-wa" title="WhatsApp"><i class="bi bi-whatsapp"></i></a>
                    </div>
                `;
            }

            html += `
                <tr>
                    <td>${safeText(contact.name)}</td>
                    <td>${safeText(contact.position)}</td>
                    <td>${actions}</td>
                </tr>
            `;
        });
        contactsListContainer.innerHTML = html + '</tbody></table></div>';
    }
    
    function renderDealerAddresses(addresses) {
        if (!addressesListContainer) return;
        if (!addresses || addresses.length === 0) { addressesListContainer.innerHTML = '<p><i>Нет данных.</i></p>'; return; }
        let html = '<table class="table table-bordered table-striped" style="margin-top: 0;"><thead><tr><th>Описание</th><th>Город</th><th>Адрес</th></tr></thead><tbody>';
        addresses.forEach(addr => {
            html += `<tr><td>${safeText(addr.description)}</td><td>${safeText(addr.city)}</td><td>${safeText(addr.address)}</td></tr>`;
        });
        addressesListContainer.innerHTML = html + '</tbody></table>';
    }

    function renderDealerPos(posItems) {
        if (!posListContainer) return;
        if (!posItems || posItems.length === 0) { posListContainer.innerHTML = '<p><i>Нет оборудования.</i></p>'; return; }
        let html = '<table class="table table-bordered table-striped" style="margin-top: 0;"><thead><tr><th>Оборудование</th><th>Количество</th></tr></thead><tbody>';
        posItems.forEach(item => {
            html += `<tr><td>${safeText(item.name)}</td><td>${item.quantity || 1}</td></tr>`;
        });
        posListContainer.innerHTML = html + '</tbody></table>';
    }

    async function fetchDealerProducts() {
        if (!productsListContainer) return;
        try {
            const response = await fetch(`${API_URL}/${dealerId}/products`);
            if (!response.ok) throw new Error('');
            const products = await response.json(); 
            if (products.length === 0) { productsListContainer.innerHTML = '<p><i>Нет выставленных товаров.</i></p>'; return; }
            productsListContainer.innerHTML = `<ul class="products-list-detailed">${products.map(p => `<li><strong>${safeText(p.sku)}</strong> - ${safeText(p.name)}</li>`).join('')}</ul>`;
        } catch (error) { productsListContainer.innerHTML = `<p class="text-danger">${error.message}</p>`; }
    }

    if(editBtn) editBtn.addEventListener('click', () => {
        localStorage.setItem('pendingEditDealerId', dealerId);
        window.location.href = 'index.html';
    });

    // --- (НОВОЕ) Кнопка "Поехать" ---
    if (navigateBtn) {
        navigateBtn.addEventListener('click', () => {
            if (dealerLat && dealerLng) {
                // Универсальная ссылка, которая открывает выбор карт на телефоне (Google/Apple/Yandex)
                const url = `https://www.google.com/maps/dir/?api=1&destination=${dealerLat},${dealerLng}`;
                window.open(url, '_blank');
            } else {
                alert("У этого дилера не заданы координаты.");
            }
        });
    }

    if(deleteBtn) deleteBtn.addEventListener('click', async () => {
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
                alert('Сетевая ошибка при удалении.');
            }
        }
    });

    fetchDealerDetails();
    fetchDealerProducts();
});
