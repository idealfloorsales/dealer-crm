// dealer.js
document.addEventListener('DOMContentLoaded', () => {
    
    // Элементы
    const contactsListContainer = document.getElementById('dealer-contacts-list'); 
    const bonusesContainer = document.getElementById('dealer-bonuses');
    const photoGalleryContainer = document.getElementById('dealer-photo-gallery'); 
    const deliveryContainer = document.getElementById('dealer-delivery'); 
    const linksContainer = document.getElementById('dealer-links'); 
    const addressesListContainer = document.getElementById('dealer-addresses-list'); 
    const posListContainer = document.getElementById('dealer-pos-list'); 
    const visitsListContainer = document.getElementById('dealer-visits-list'); 
    const competitorsListContainer = document.getElementById('dealer-competitors-list'); 
    const productsListContainer = document.getElementById('dealer-products-list');
    const productsStatsContainer = document.getElementById('dealer-products-stats');
    
    // Заголовок
    const dealerNameEl = document.getElementById('dealer-name');
    const dealerIdEl = document.getElementById('dealer-id-subtitle');
    const dealerAvatarImg = document.getElementById('dealer-avatar-img');
    
    // Кнопки
    const deleteBtn = document.getElementById('delete-dealer-btn'); 
    const editBtn = document.getElementById('edit-dealer-btn'); 
    const navigateBtn = document.getElementById('navigate-btn'); 
    const carouselInner = document.getElementById('carousel-inner');

    const API_DEALERS_URL = '/api/dealers';
    const API_PRODUCTS_URL = '/api/products'; 
    const params = new URLSearchParams(window.location.search);
    const dealerId = params.get('id');

    let dealerLat = null;
    let dealerLng = null;
    let galleryCarouselContent = '';

    if (!dealerId) {
        if(dealerNameEl) dealerNameEl.textContent = 'Ошибка';
        if(dealerIdEl) dealerIdEl.textContent = 'ID дилера не найден';
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
            // 1. Загружаем дилера
            const dealerRes = await fetch(`${API_DEALERS_URL}/${dealerId}`);
            if (!dealerRes.ok) throw new Error(`Дилер не найден.`);
            const dealer = await dealerRes.json();

            // 2. Загружаем ВСЕ товары для статистики
            const productsRes = await fetch(API_PRODUCTS_URL);
            const allProducts = await productsRes.json();
            const totalProductsCount = allProducts.length;
            
            const dealerProductsCount = dealer.products ? dealer.products.length : 0;
            const percent = totalProductsCount > 0 ? Math.round((dealerProductsCount / totalProductsCount) * 100) : 0;

            dealerLat = dealer.latitude;
            dealerLng = dealer.longitude;
            if (!dealerLat || !dealerLng) { if(navigateBtn) navigateBtn.style.display = 'none'; }

            // --- ЗАГОЛОВОК ---
            dealerNameEl.textContent = safeText(dealer.name);
            dealerIdEl.textContent = `ID: ${safeText(dealer.dealer_id)}`;
            if (dealer.avatarUrl) {
                dealerAvatarImg.src = dealer.avatarUrl;
                dealerAvatarImg.style.display = 'block';
                
                dealerAvatarImg.onclick = () => {
                    openAvatarModal(dealer.avatarUrl);
                };
            } else {
                dealerAvatarImg.style.display = 'none'; 
            }
            document.title = `Дилер: ${dealer.name}`;
            
            // --- ВКЛАДКА ИНФО ---
            document.getElementById('dealer-info-main').innerHTML = `
                <p><strong>Организация:</strong> ${safeText(dealer.organization)}</p>
                <p><strong>Город:</strong> ${safeText(dealer.city)}</p>
                <p><strong>Адрес:</strong> ${safeText(dealer.address)}</p>
                <p><strong>Тип цен:</strong> ${safeText(dealer.price_type)}</p>
                <p><strong>Статус:</strong> ${safeText(dealer.status)}</p>
            `;

            // --- ВКЛАДКА ВЫСТАВЛЕННОСТЬ (Статистика) ---
            if (productsStatsContainer) {
                productsStatsContainer.innerHTML = `
                    <div class="alert alert-light border mb-3">
                        <p class="mb-1"><strong>Загрузка матрицы:</strong> ${dealerProductsCount} из ${totalProductsCount} (${percent}%)</p>
                        <div class="progress" style="height: 6px;">
                            <div class="progress-bar bg-success" role="progressbar" style="width: ${percent}%"></div>
                        </div>
                    </div>
                `;
            }

            document.getElementById('dealer-delivery').textContent = safeText(dealer.delivery) || 'Нет данных';
            document.getElementById('dealer-bonuses').textContent = safeText(dealer.bonuses) || 'Нет данных';
            
            renderDealerAddresses(dealer.additional_addresses || []); 
            renderDealerPos(dealer.pos_materials || []); 

            renderDealerLinks(dealer.website, dealer.instagram); 
            renderDealerVisits(dealer.visits || []);
            renderDealerContacts(dealer.contacts || []);
            renderDealerCompetitors(dealer.competitors || []); 
            renderDealerPhotos(dealer.photos || []); 
            
            // Загружаем товары (плиткой) - передаем ID дилера
            fetchDealerProducts(dealer.products); 

        } catch (error) {
            dealerNameEl.textContent = 'Ошибка';
            dealerIdEl.textContent = error.message;
        }
    }
    
    function renderDealerLinks(website, instagram) {
        if (!linksContainer) return;
        let html = '';
        const safeWebsite = formatUrl(website); const safeInstagram = formatUrl(instagram);
        if (safeWebsite) html += `<a href="${safeWebsite}" target="_blank" class="btn btn-secondary me-2"><i class="bi bi-globe me-2"></i>Сайт</a>`;
        if (safeInstagram) html += `<a href="${safeInstagram}" target="_blank" class="btn btn-secondary"><i class="bi bi-instagram me-2"></i>Instagram</a>`;
        if (!safeWebsite && !safeInstagram) linksContainer.style.display = 'none'; else { linksContainer.innerHTML = html; linksContainer.style.display = 'flex'; }
    }

    function renderDealerPhotos(photos) {
        if (!photoGalleryContainer) return;
        if (!photos || photos.length === 0) { photoGalleryContainer.innerHTML = '<p><i>Нет фотографий.</i></p>'; return; }
        photos.sort((a, b) => new Date(b.date||0) - new Date(a.date||0));
        let html = ''; let slideIndex = 0; 
        galleryCarouselContent = ''; // Сброс
        
        const groups = {};
        photos.forEach(p => { const d = p.date ? new Date(p.date).toLocaleDateString('ru-RU') : "Ранее"; if(!groups[d]) groups[d]=[]; groups[d].push(p); });
        
        for (const [date, group] of Object.entries(groups)) {
            html += `<h5 class="mt-4 border-bottom pb-2 text-secondary">${date}</h5><div class="gallery-grid">`;
            group.forEach(p => {
                html += `<div class="gallery-item" onclick="openLightbox(${slideIndex})"><img src="${p.photo_url}" loading="lazy"></div>`;
                galleryCarouselContent += `<div class="carousel-item ${slideIndex===0?'active':''}" style="height: 100%;"><div class="d-flex justify-content-center align-items-center h-100"><img src="${p.photo_url}" style="max-height: 100%; max-width: 100%; object-fit: contain;"></div></div>`;
                slideIndex++;
            });
            html += `</div>`;
        }
        photoGalleryContainer.innerHTML = html;
        if (carouselInner) carouselInner.innerHTML = galleryCarouselContent;
    }

    window.openLightbox = function(index) {
        const modalEl = document.getElementById('imageModal');
        const carouselEl = document.querySelector('#photoCarousel');
        if (modalEl && carouselEl && carouselInner) {
            carouselInner.innerHTML = galleryCarouselContent;
            toggleArrows(true);
            const myModal = new bootstrap.Modal(modalEl);
            const carousel = new bootstrap.Carousel(carouselEl);
            carousel.to(index); 
            myModal.show();
        }
    }

    function openAvatarModal(url) {
        const modalEl = document.getElementById('imageModal');
        if (modalEl && carouselInner) {
            carouselInner.innerHTML = `
                <div class="carousel-item active" style="height: 100%;">
                    <div class="d-flex justify-content-center align-items-center h-100">
                        <img src="${url}" style="max-height: 100%; max-width: 100%; object-fit: contain;">
                    </div>
                </div>`;
            toggleArrows(false);
            const myModal = new bootstrap.Modal(modalEl);
            myModal.show();
        }
    }

    function toggleArrows(show) {
        const prevBtn = document.querySelector('.carousel-control-prev');
        const nextBtn = document.querySelector('.carousel-control-next');
        if (prevBtn && nextBtn) {
            prevBtn.style.display = show ? 'flex' : 'none';
            nextBtn.style.display = show ? 'flex' : 'none';
        }
    }

    function renderDealerVisits(visits) {
        if (!visitsListContainer) return;
        if (!visits || visits.length === 0) { visitsListContainer.innerHTML = '<p><i>Нет записей.</i></p>'; return; }
        visits.sort((a, b) => new Date(b.date) - new Date(a.date));
        let html = '<div class="table-responsive"><table class="table table-bordered table-striped" style="margin-top:0"><thead><tr><th style="width:120px">Дата</th><th>Комментарий</th><th style="width:100px">Статус</th></tr></thead><tbody>';
        visits.forEach(v => { 
            const dateStr = v.date ? new Date(v.date).toLocaleDateString('ru-RU') : '-'; 
            const status = v.isCompleted ? '<span class="badge bg-success">Выполнено</span>' : '<span class="badge bg-warning">В плане</span>';
            html += `<tr><td>${dateStr}</td><td style="white-space: pre-wrap;">${safeText(v.comment)}</td><td>${status}</td></tr>`; 
        });
        visitsListContainer.innerHTML = html + '</tbody></table></div>';
    }

    function renderDealerContacts(contacts) {
        if (!contactsListContainer) return;
        if (!contacts || contacts.length === 0) { contactsListContainer.innerHTML = '<p><i>Нет данных.</i></p>'; return; }
        let html = '<div class="table-responsive"><table class="table table-bordered table-striped" style="margin-top: 0;"><thead><tr><th>Имя</th><th>Должность</th><th>Действия</th></tr></thead><tbody>';
        contacts.forEach(contact => {
            const phoneClean = contact.contactInfo ? contact.contactInfo.replace(/[^0-9]/g, '') : '';
            const hasPhone = phoneClean.length >= 10; 
            let actions = safeText(contact.contactInfo); 
            if (hasPhone) { actions = `<div class="d-flex align-items-center gap-2"><span>${safeText(contact.contactInfo)}</span><a href="tel:+${phoneClean}" class="btn btn-sm btn-outline-primary btn-contact-call" title="Позвонить"><i class="bi bi-telephone-fill"></i></a><a href="https://wa.me/${phoneClean}" target="_blank" class="btn btn-sm btn-outline-success btn-contact-wa" title="WhatsApp"><i class="bi bi-whatsapp"></i></a></div>`; }
            html += `<tr><td>${safeText(contact.name)}</td><td>${safeText(contact.position)}</td><td>${actions}</td></tr>`;
        });
        contactsListContainer.innerHTML = html + '</tbody></table></div>';
    }
    
    function renderDealerAddresses(addresses) {
        if (!addressesListContainer) return;
        if (!addresses || addresses.length === 0) { addressesListContainer.innerHTML = '<p><i>Нет данных.</i></p>'; return; }
        let html = '<div class="table-responsive"><table class="table table-bordered table-striped" style="margin-top: 0;"><thead><tr><th>Описание</th><th>Город</th><th>Адрес</th></tr></thead><tbody>';
        addresses.forEach(addr => { html += `<tr><td>${safeText(addr.description)}</td><td>${safeText(addr.city)}</td><td>${safeText(addr.address)}</td></tr>`; });
        addressesListContainer.innerHTML = html + '</tbody></table></div>';
    }

    function renderDealerPos(posItems) {
        if (!posListContainer) return;
        if (!posItems || posItems.length === 0) { posListContainer.innerHTML = '<p><i>Нет оборудования.</i></p>'; return; }
        let html = '<div class="table-responsive"><table class="table table-bordered table-striped" style="margin-top: 0;"><thead><tr><th>Оборудование</th><th>Количество</th></tr></thead><tbody>';
        posItems.forEach(item => { html += `<tr><td>${safeText(item.name)}</td><td>${item.quantity || 1}</td></tr>`; });
        posListContainer.innerHTML = html + '</tbody></table></div>';
    }

    function renderDealerCompetitors(competitors) {
        if (!competitorsListContainer) return;
        if (!competitors || competitors.length === 0) { competitorsListContainer.innerHTML = '<p><i>Нет данных о конкурентах.</i></p>'; return; }
        let html = '<div class="table-responsive"><table class="table table-bordered table-striped" style="margin-top: 0;"><thead><tr><th>Бренд</th><th>Коллекция</th><th>Цена ОПТ</th><th>Цена Розница</th></tr></thead><tbody>';
        competitors.forEach(c => {
            html += `<tr><td>${safeText(c.brand)}</td><td>${safeText(c.collection)}</td><td>${safeText(c.price_opt)}</td><td>${safeText(c.price_retail)}</td></tr>`;
        });
        competitorsListContainer.innerHTML = html + '</tbody></table></div>';
    }

    // (ИЗМЕНЕНО) Теперь принимаем products сразу из объекта дилера
    function fetchDealerProducts(products) {
        const c = document.getElementById('dealer-products-list'); if (!c) return;
        
        if (!products || products.length === 0) { 
            c.innerHTML = '<p class="text-muted"><i>Нет выставленных товаров.</i></p>'; 
            return; 
        }

        // Сортировка по артикулу
        products.sort((a, b) => a.sku.localeCompare(b.sku, undefined, {numeric: true}));

        // Генерация сетки
        let html = '<div class="products-grid">';
        html += products.map(p => `
            <div class="product-grid-item">
                <i class="bi bi-check-circle-fill"></i>
                <div class="product-info">
                    <span class="product-sku">${safeText(p.sku)}</span>
                    <span class="product-name">${safeText(p.name)}</span>
                </div>
            </div>
        `).join('');
        html += '</div>';
        
        c.innerHTML = html;
    }

    if(editBtn) editBtn.addEventListener('click', () => { localStorage.setItem('pendingEditDealerId', dealerId); window.location.href = 'index.html'; });
    if(navigateBtn) navigateBtn.addEventListener('click', () => { if (dealerLat && dealerLng) window.open(`http://googleusercontent.com/maps/google.com/?q=${dealerLat},${dealerLng}`, '_blank'); else alert("Координаты не заданы."); });
    if(deleteBtn) deleteBtn.addEventListener('click', async () => { if (confirm(`Удалить?`)) { try { const response = await fetch(`${API_DEALERS_URL}/${dealerId}`, { method: 'DELETE' }); if (response.ok) window.location.href = 'index.html'; } catch (error) { alert('Ошибка.'); } } });

    fetchDealerDetails();
});
