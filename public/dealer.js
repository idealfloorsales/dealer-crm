// dealer.js
document.addEventListener('DOMContentLoaded', () => {
    
    // Получаем ID дилера из URL
    const params = new URLSearchParams(window.location.search);
    const dealerId = params.get('id');
    const API_URL = '/api/dealers';

    // Элементы управления
    const deleteBtn = document.getElementById('delete-dealer-btn'); 
    const editBtn = document.getElementById('edit-dealer-btn'); 
    const navigateBtn = document.getElementById('navigate-btn'); 
    const carouselInner = document.getElementById('carousel-inner');
    
    // Глобальные переменные для координат
    let dealerLat = null;
    let dealerLng = null;

    if (!dealerId) {
        document.getElementById('dealer-name').textContent = 'Ошибка';
        document.getElementById('dealer-id-subtitle').textContent = 'ID дилера не найден';
        if(deleteBtn) deleteBtn.style.display = 'none'; 
        if(editBtn) editBtn.style.display = 'none'; 
        if(navigateBtn) navigateBtn.style.display = 'none';
        return;
    }

    const safeText = (text) => text ? text.replace(/</g, "&lt;").replace(/>/g, "&gt;") : '---';
    const formatUrl = (url) => { if (!url) return null; if (!url.startsWith('http')) return 'https://' + url; return url; }

    // --- 1. ОСНОВНАЯ ФУНКЦИЯ ЗАГРУЗКИ ---
    async function fetchDealerDetails() {
        try {
            const response = await fetch(`${API_URL}/${dealerId}`);
            if (!response.ok) throw new Error(`Дилер не найден.`);
            
            const dealer = await response.json();
            
            // Сохраняем координаты
            dealerLat = dealer.latitude;
            dealerLng = dealer.longitude;
            if (!dealerLat || !dealerLng) { if(navigateBtn) navigateBtn.style.display = 'none'; }

            // --- ЗАГОЛОВОК СТРАНИЦЫ (с Аватаром) ---
            document.getElementById('dealer-name').textContent = safeText(dealer.name);
            document.getElementById('dealer-id-subtitle').textContent = `ID: ${safeText(dealer.dealer_id)}`;
            const avatarImg = document.getElementById('dealer-avatar-img');
            if (dealer.avatarUrl) {
                avatarImg.src = dealer.avatarUrl;
            } else {
                avatarImg.src = ""; // Пусто, если нет аватара
            }
            document.title = `Дилер: ${dealer.name}`;
            
            // --- ВКЛАДКА "ИНФО" ---
            document.getElementById('dealer-info-main').innerHTML = `
                <p><strong>Организация:</strong> ${safeText(dealer.organization)}</p>
                <p><strong>Город:</strong> ${safeText(dealer.city)}</p>
                <p><strong>Адрес:</strong> ${safeText(dealer.address)}</p>
                <p><strong>Тип цен:</strong> ${safeText(dealer.price_type)}</p>
                <p><strong>Статус:</strong> ${safeText(dealer.status)}</p>
            `;
            document.getElementById('dealer-delivery').textContent = safeText(dealer.delivery) || 'Нет данных';
            document.getElementById('dealer-bonuses').textContent = safeText(dealer.bonuses) || 'Нет данных';

            // --- ОТДЕЛЬНЫЕ ФУНКЦИИ ДЛЯ КАЖДОЙ ВКЛАДКИ ---
            renderDealerLinks(dealer.website, dealer.instagram); 
            renderDealerVisits(dealer.visits || []);
            renderDealerContacts(dealer.contacts || []);
            renderDealerAddresses(dealer.additional_addresses || []); 
            renderDealerPos(dealer.pos_materials || []); // (ВОЗВРАЩЕНО)
            renderDealerPhotos(dealer.photos || []); 
            fetchDealerProducts(); // Товары грузим отдельно

        } catch (error) {
            document.getElementById('dealer-name').textContent = 'Ошибка';
            document.getElementById('dealer-id-subtitle').textContent = error.message;
        }
    }
    
    function renderDealerLinks(website, instagram) {
        const c = document.getElementById('dealer-links'); if (!c) return;
        let html = '';
        const safeWebsite = formatUrl(website); const safeInstagram = formatUrl(instagram);
        if (safeWebsite) html += `<a href="${safeWebsite}" target="_blank" class="btn btn-secondary me-2"><i class="bi bi-globe me-2"></i>Сайт</a>`;
        if (safeInstagram) html += `<a href="${safeInstagram}" target="_blank" class="btn btn-secondary"><i class="bi bi-instagram me-2"></i>Instagram</a>`;
        if (!safeWebsite && !safeInstagram) c.style.display = 'none'; else { c.innerHTML = html; c.style.display = 'flex'; }
    }

    function renderDealerPhotos(photos) {
        const c = document.getElementById('dealer-photo-gallery'); if (!c) return;
        if (!photos || photos.length === 0) { c.innerHTML = '<p><i>Нет фотографий.</i></p>'; return; }
        photos.sort((a, b) => new Date(b.date||0) - new Date(a.date||0));
        let html = ''; let slideIndex = 0; let carouselHtml = '';
        const groups = {};
        photos.forEach(p => { const d = p.date ? new Date(p.date).toLocaleDateString('ru-RU') : "Ранее"; if(!groups[d]) groups[d]=[]; groups[d].push(p); });
        
        for (const [date, group] of Object.entries(groups)) {
            html += `<h5 class="mt-4 border-bottom pb-2 text-secondary">${date}</h5><div class="gallery-grid">`;
            group.forEach(p => {
                html += `<div class="gallery-item" onclick="openLightbox(${slideIndex})"><img src="${p.photo_url}" loading="lazy"></div>`;
                carouselHtml += `<div class="carousel-item ${slideIndex===0?'active':''}" style="height: 100%;"><div class="d-flex justify-content-center align-items-center h-100"><img src="${p.photo_url}" style="max-height: 100%; max-width: 100%; object-fit: contain;"></div></div>`;
                slideIndex++;
            });
            html += `</div>`;
        }
        c.innerHTML = html;
        if (carouselInner) carouselInner.innerHTML = carouselHtml;
    }

    window.openLightbox = function(index) {
        const modalEl = document.getElementById('imageModal');
        const carouselEl = document.querySelector('#photoCarousel');
        if (modalEl && carouselEl) {
            const myModal = new bootstrap.Modal(modalEl);
            const carousel = new bootstrap.Carousel(carouselEl);
            carousel.to(index); myModal.show();
        }
    }

    // (ИСПРАВЛЕНО) Все таблицы обернуты в .table-responsive
    function renderDealerVisits(visits) {
        const c = document.getElementById('dealer-visits-list'); if (!c) return;
        if (!visits || visits.length === 0) { c.innerHTML = '<p><i>Нет записей.</i></p>'; return; }
        visits.sort((a, b) => new Date(b.date) - new Date(a.date));
        let html = '<div class="table-responsive"><table class="table table-bordered table-striped" style="margin-top:0"><thead><tr><th style="width:120px">Дата</th><th>Комментарий</th><th style="width:100px">Статус</th></tr></thead><tbody>';
        visits.forEach(v => { 
            const dateStr = v.date ? new Date(v.date).toLocaleDateString('ru-RU') : '-'; 
            const status = v.isCompleted ? '<span class="badge bg-success">Выполнено</span>' : '<span class="badge bg-warning">В плане</span>';
            html += `<tr><td>${dateStr}</td><td style="white-space: pre-wrap;">${safeText(v.comment)}</td><td>${status}</td></tr>`; 
        });
        c.innerHTML = html + '</tbody></table></div>';
    }

    function renderDealerContacts(contacts) {
        const c = document.getElementById('dealer-contacts-list'); if (!c) return;
        if (!contacts || contacts.length === 0) { c.innerHTML = '<p><i>Нет данных.</i></p>'; return; }
        let html = '<div class="table-responsive"><table class="table table-bordered table-striped" style="margin-top: 0;"><thead><tr><th>Имя</th><th>Должность</th><th>Действия</th></tr></thead><tbody>';
        contacts.forEach(contact => {
            const phoneClean = contact.contactInfo ? contact.contactInfo.replace(/[^0-9]/g, '') : '';
            const hasPhone = phoneClean.length >= 10; 
            let actions = safeText(contact.contactInfo); 
            if (hasPhone) { actions = `<div class="d-flex align-items-center gap-2"><span>${safeText(contact.contactInfo)}</span><a href="tel:+${phoneClean}" class="btn btn-sm btn-outline-primary btn-contact-call" title="Позвонить"><i class="bi bi-telephone-fill"></i></a><a href="https://wa.me/${phoneClean}" target="_blank" class="btn btn-sm btn-outline-success btn-contact-wa" title="WhatsApp"><i class="bi bi-whatsapp"></i></a></div>`; }
            html += `<tr><td>${safeText(contact.name)}</td><td>${safeText(contact.position)}</td><td>${actions}</td></tr>`;
        });
        c.innerHTML = html + '</tbody></table></div>';
    }
    
    function renderDealerAddresses(addresses) {
        const c = document.getElementById('dealer-addresses-list'); if (!c) return;
        if (!addresses || addresses.length === 0) { c.innerHTML = '<p><i>Нет данных.</i></p>'; return; }
        let html = '<div class="table-responsive"><table class="table table-bordered table-striped" style="margin-top: 0;"><thead><tr><th>Описание</th><th>Город</th><th>Адрес</th></tr></thead><tbody>';
        addresses.forEach(addr => { html += `<tr><td>${safeText(addr.description)}</td><td>${safeText(addr.city)}</td><td>${safeText(addr.address)}</td></tr>`; });
        c.innerHTML = html + '</tbody></table></div>';
    }

    // (ВОЗВРАЩЕНО)
    function renderDealerPos(posItems) {
        const c = document.getElementById('dealer-pos-list'); if (!c) return;
        if (!posItems || posItems.length === 0) { c.innerHTML = '<p><i>Нет оборудования.</i></p>'; return; }
        let html = '<div class="table-responsive"><table class="table table-bordered table-striped" style="margin-top: 0;"><thead><tr><th>Оборудование</th><th>Количество</th></tr></thead><tbody>';
        posItems.forEach(item => { html += `<tr><td>${safeText(item.name)}</td><td>${item.quantity || 1}</td></tr>`; });
        c.innerHTML = html + '</tbody></table></div>';
    }

    async function fetchDealerProducts() {
        const c = document.getElementById('dealer-products-list'); if (!c) return;
        try {
            const response = await fetch(`${API_URL}/${dealerId}/products`);
            if (!response.ok) throw new Error('');
            const products = await response.json(); 
            if (products.length === 0) { c.innerHTML = '<p><i>Нет выставленных товаров.</i></p>'; return; }
            c.innerHTML = `<ul class="products-list-detailed">${products.map(p => `<li><strong>${safeText(p.sku)}</strong> - ${safeText(p.name)}</li>`).join('')}</ul>`;
        } catch (error) { c.innerHTML = `<p class="text-danger">${error.message}</p>`; }
    }

    if(editBtn) editBtn.addEventListener('click', () => { localStorage.setItem('pendingEditDealerId', dealerId); window.location.href = 'index.html'; });
    if(navigateBtn) navigateBtn.addEventListener('click', () => { if (dealerLat && dealerLng) window.open(`http://googleusercontent.com/maps/google.com/?q=${dealerLat},${dealerLng}`, '_blank'); else alert("Координаты не заданы."); });
    if(deleteBtn) deleteBtn.addEventListener('click', async () => { if (confirm(`Удалить?`)) { try { const response = await fetch(`${API_URL}/${dealerId}`, { method: 'DELETE' }); if (response.ok) window.location.href = 'index.html'; } catch (error) { alert('Ошибка.'); } } });

    fetchDealerDetails();
});
