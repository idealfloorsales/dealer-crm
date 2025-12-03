document.addEventListener('DOMContentLoaded', () => {
    
    // Элементы страницы
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
    const salesHistoryContainer = document.getElementById('dealer-sales-history');
    
    const dealerNameEl = document.getElementById('dealer-name');
    const dealerIdEl = document.getElementById('dealer-id-subtitle');
    const dealerCityEl = document.getElementById('dealer-city-badge');
    const dealerStatusEl = document.getElementById('dealer-status-badge');
    const dealerAvatarImg = document.getElementById('dealer-avatar-img');
    
    const deleteBtn = document.getElementById('delete-dealer-btn'); 
    const editBtn = document.getElementById('edit-dealer-btn'); 
    const navigateBtn = document.getElementById('navigate-btn'); 
    const carouselInner = document.getElementById('carousel-inner');

    // API
    const API_DEALERS_URL = '/api/dealers';
    const API_PRODUCTS_URL = '/api/products'; 
    const API_SALES_URL = '/api/sales';

    const params = new URLSearchParams(window.location.search);
    const dealerId = params.get('id');

    let dealerLat = null;
    let dealerLng = null;
    let galleryCarouselContent = '';
    let currentDealerName = '';

    if (!dealerId) { 
        if(dealerNameEl) dealerNameEl.textContent = 'Ошибка: ID не указан'; 
        return; 
    }

    // Вспомогательные функции
    const safeText = (text) => text ? text.replace(/</g, "&lt;").replace(/>/g, "&gt;") : '---';
    const formatUrl = (url) => { if (!url) return null; if (!url.startsWith('http')) return 'https://' + url; return url; }
    
    const formatResponsible = (val) => {
        if (val === 'regional_astana') return 'Региональный Астана';
        if (val === 'regional_regions') return 'Региональный Регионы';
        return val || '---';
    };

    // --- ГЛАВНАЯ ФУНКЦИЯ ЗАГРУЗКИ ---
    async function fetchDealerDetails() {
        try {
            const dealerRes = await fetch(`${API_DEALERS_URL}/${dealerId}`);
            if (!dealerRes.ok) throw new Error(`Дилер не найден.`);
            const dealer = await dealerRes.json();
            currentDealerName = dealer.name;

            const productsRes = await fetch(API_PRODUCTS_URL);
            const allProducts = await productsRes.json();
            const totalProductsCount = allProducts.length;
            const dealerProductsCount = dealer.products ? dealer.products.length : 0;
            const percent = totalProductsCount > 0 ? Math.round((dealerProductsCount / totalProductsCount) * 100) : 0;

            dealerLat = dealer.latitude;
            dealerLng = dealer.longitude;
            
            // Заполнение Шапки
            dealerNameEl.textContent = safeText(dealer.name);
            dealerIdEl.innerHTML = `<i class="bi bi-hash"></i> ${safeText(dealer.dealer_id)}`;
            dealerCityEl.innerHTML = `<i class="bi bi-geo-alt"></i> ${safeText(dealer.city)}`;
            dealerStatusEl.textContent = (dealer.status || 'standard').toUpperCase();
            
            // Аватар
            if (dealer.avatarUrl) {
                dealerAvatarImg.src = dealer.avatarUrl;
                dealerAvatarImg.onclick = () => { openAvatarModal(dealer.avatarUrl); };
            } else { 
                // Заглушка, если нет фото
                dealerAvatarImg.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23f1f5f9'/%3E%3Ctext x='50' y='50' font-family='Arial' font-size='40' fill='%23cbd5e1' text-anchor='middle' dy='.3em'%3ESHOP%3C/text%3E%3C/svg%3E";
            }
            document.title = `${dealer.name}`;
            
            // Блок "Основное"
            document.getElementById('dealer-info-main').innerHTML = `
                <div class="info-row"><span class="info-label">Ответственный</span><span class="info-val text-primary">${formatResponsible(dealer.responsible)}</span></div>
                <div class="info-row"><span class="info-label">Организация</span><span class="info-val">${safeText(dealer.organization)}</span></div>
                <div class="info-row"><span class="info-label">Тип цен</span><span class="info-val">${safeText(dealer.price_type)}</span></div>
                <div class="info-row"><span class="info-label">Адрес (Юр.)</span><span class="info-val">${safeText(dealer.address)}</span></div>
            `;

            // Статистика матрицы (Прогресс бар)
            if (productsStatsContainer) {
                productsStatsContainer.innerHTML = `<div class="p-3 bg-light rounded border"><div class="d-flex justify-content-between mb-1"><strong>Загрузка матрицы</strong><span>${dealerProductsCount} / ${totalProductsCount}</span></div><div class="progress" style="height: 8px;"><div class="progress-bar bg-success" role="progressbar" style="width: ${percent}%"></div></div></div>`;
            }

            document.getElementById('dealer-delivery').textContent = safeText(dealer.delivery) || 'Не указано';
            document.getElementById('dealer-bonuses').textContent = safeText(dealer.bonuses) || 'Нет примечаний';
            
            // Рендер списков
            renderDealerAddresses(dealer.additional_addresses || []); 
            renderDealerPos(dealer.pos_materials || []); 
            renderDealerLinks(dealer.website, dealer.instagram); 
            renderDealerVisits(dealer.visits || []);
            renderDealerContacts(dealer.contacts || []);
            renderDealerCompetitors(dealer.competitors || []); 
            renderDealerPhotos(dealer.photos || []); 
            fetchDealerProducts(dealer.products); 
            fetchDealerSales();

        } catch (error) { 
            dealerNameEl.textContent = 'Ошибка загрузки'; 
            console.error(error); 
        }
    }

    // --- ФУНКЦИИ ОТРИСОВКИ (MODERN) ---

    // 1. КОНТАКТЫ (Карточки)
    function renderDealerContacts(contacts) {
        if (!contactsListContainer) return;
        if (!contacts || contacts.length === 0) { contactsListContainer.innerHTML = '<p class="text-muted">Нет контактов.</p>'; return; }
        
        let html = '';
        contacts.forEach(contact => {
            const phoneClean = contact.contactInfo ? contact.contactInfo.replace(/[^0-9]/g, '') : '';
            const hasPhone = phoneClean.length >= 10;
            
            let btns = '';
            if (hasPhone) {
                btns = `
                <div class="d-flex gap-2">
                    <a href="tel:+${phoneClean}" class="btn btn-sm btn-white border"><i class="bi bi-telephone-fill text-primary"></i></a>
                    <a href="https://wa.me/${phoneClean}" target="_blank" class="btn btn-sm btn-white border"><i class="bi bi-whatsapp text-success"></i></a>
                </div>`;
            }

            html += `
            <div class="col-md-6">
                <div class="contact-card-modern">
                    <div class="contact-card-info">
                        <h6>${safeText(contact.name)}</h6>
                        <p>${safeText(contact.position)}</p>
                        <p class="text-primary mt-1">${safeText(contact.contactInfo)}</p>
                    </div>
                    ${btns}
                </div>
            </div>`;
        });
        contactsListContainer.innerHTML = html;
    }

    // 2. ВИЗИТЫ (Таймлайн)
    function renderDealerVisits(visits) {
        if (!visitsListContainer) return;
        if (!visits || visits.length === 0) { visitsListContainer.innerHTML = '<p class="text-muted">История пуста.</p>'; return; }
        
        visits.sort((a, b) => new Date(b.date) - new Date(a.date)); // Свежие сверху
        
        let html = '';
        visits.forEach(v => {
            const dateStr = v.date ? new Date(v.date).toLocaleDateString('ru-RU', {weekday:'short', year:'numeric', month:'long', day:'numeric'}) : '-';
            const statusIcon = v.isCompleted ? '<span class="text-success ms-2"><i class="bi bi-check-circle-fill"></i></span>' : '<span class="text-warning ms-2"><i class="bi bi-hourglass-split"></i></span>';
            
            html += `
            <div class="timeline-item">
                <div class="timeline-date">${dateStr} ${statusIcon}</div>
                <div class="timeline-text">${safeText(v.comment)}</div>
            </div>`;
        });
        visitsListContainer.innerHTML = html;
    }

    // 3. АДРЕСА (Список)
    function renderDealerAddresses(addresses) {
        if (!addressesListContainer) return;
        if (!addresses || addresses.length === 0) { addressesListContainer.innerHTML = '<div class="text-muted small">Нет доп. адресов</div>'; return; }
        
        let html = '';
        addresses.forEach(addr => {
            html += `
            <div class="p-2 bg-light border rounded mb-2">
                <div class="fw-bold small">${safeText(addr.description)}</div>
                <div class="text-muted small"><i class="bi bi-geo-alt me-1"></i>${safeText(addr.city)}, ${safeText(addr.address)}</div>
            </div>`;
        });
        addressesListContainer.innerHTML = html;
    }

    // 4. ТОВАРЫ (НОВАЯ СОРТИРОВКА + GRID)
    function fetchDealerProducts(products) {
        const c = document.getElementById('dealer-products-list'); 
        if (!c) return;
        
        if (!products || products.length === 0) { 
            c.innerHTML = '<div class="p-3 text-center text-muted border rounded bg-light small">Нет выставленных товаров</div>'; 
            return; 
        }
        
        // УМНАЯ СОРТИРОВКА (цифровая)
        products.sort((a, b) => {
            return a.sku.localeCompare(b.sku, undefined, { numeric: true, sensitivity: 'base' });
        });

        let html = '<div class="products-grid">';
        html += products.map(p => `
            <div class="product-grid-item" title="${safeText(p.name)}">
                <i class="bi bi-check-circle-fill"></i>
                <div class="product-info">
                    <span class="product-sku">${safeText(p.sku)}</span>
                    <span class="product-name">${safeText(p.name)}</span>
                </div>
            </div>`
        ).join('');
        html += '</div>';
        
        c.innerHTML = html;
    }

    // 5. ПРОДАЖИ
    async function fetchDealerSales() {
        if (!salesHistoryContainer) return;
        try {
            const res = await fetch(`${API_SALES_URL}?dealerId=${dealerId}`);
            if (!res.ok) throw new Error();
            const sales = await res.json();
            if (!sales || sales.length === 0) { salesHistoryContainer.innerHTML = '<p class="text-muted text-center">Нет данных о продажах.</p>'; return; }
            sales.sort((a, b) => b.month.localeCompare(a.month));
            let html = `<table class="table table-bordered table-sm"><thead><tr class="table-light"><th>Месяц</th><th>Факт (м²)</th></tr></thead><tbody>`;
            sales.forEach(s => {
                const date = new Date(s.month + '-01');
                const monthName = date.toLocaleString('ru-RU', { month: 'long', year: 'numeric' });
                html += `<tr><td class="fw-bold">${monthName.charAt(0).toUpperCase() + monthName.slice(1)}</td><td class="text-success fw-bold text-end">${s.fact}</td></tr>`;
            });
            html += `</tbody></table>`;
            salesHistoryContainer.innerHTML = html;
        } catch (e) { salesHistoryContainer.innerHTML = `<p class="text-danger">Ошибка загрузки продаж</p>`; }
    }

    // 6. ССЫЛКИ
    function renderDealerLinks(website, instagram) { 
        if (!linksContainer) return; 
        let html = ''; 
        const safeWebsite = formatUrl(website); 
        const safeInstagram = formatUrl(instagram); 
        if (safeWebsite) html += `<a href="${safeWebsite}" target="_blank" class="btn btn-sm btn-white border text-primary"><i class="bi bi-globe me-1"></i>Сайт</a>`; 
        if (safeInstagram) html += `<a href="${safeInstagram}" target="_blank" class="btn btn-sm btn-white border text-danger"><i class="bi bi-instagram me-1"></i>Instagram</a>`; 
        linksContainer.innerHTML = html; 
    }

    // 7. ФОТО (ГАЛЕРЕЯ)
    function renderDealerPhotos(photos) { 
        if (!photoGalleryContainer) return; 
        if (!photos || photos.length === 0) { photoGalleryContainer.innerHTML = '<p class="text-muted">Нет фотографий.</p>'; return; } 
        
        photos.sort((a, b) => new Date(b.date||0) - new Date(a.date||0)); 
        
        let html = ''; 
        let slideIndex = 0; 
        galleryCarouselContent = ''; 
        const groups = {}; 
        
        photos.forEach(p => { 
            const d = p.date ? new Date(p.date).toLocaleDateString('ru-RU') : "Ранее"; 
            if(!groups[d]) groups[d]=[]; 
            groups[d].push(p); 
        }); 
        
        for (const [date, group] of Object.entries(groups)) { 
            html += `<h6 class="mt-4 mb-2 text-muted small fw-bold border-bottom pb-1">${date}</h6><div class="gallery-grid">`; 
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

    // Lightbox Logic
    window.openLightbox = function(index) { 
        const modalEl = document.getElementById('imageModal'); 
        const carouselEl = document.querySelector('#photoCarousel'); 
        if (modalEl && carouselEl && carouselInner) { 
            carouselInner.innerHTML = galleryCarouselContent; 
            const myModal = new bootstrap.Modal(modalEl); 
            const carousel = new bootstrap.Carousel(carouselEl); 
            carousel.to(index); 
            myModal.show(); 
        } 
    }
    
    function openAvatarModal(url) { 
        const modalEl = document.getElementById('imageModal'); 
        if (modalEl && carouselInner) { 
            carouselInner.innerHTML = `<div class="carousel-item active" style="height: 100%;"><div class="d-flex justify-content-center align-items-center h-100"><img src="${url}" style="max-height: 100%; max-width: 100%; object-fit: contain;"></div></div>`; 
            const myModal = new bootstrap.Modal(modalEl); 
            myModal.show(); 
        } 
    }

    // 8. POS (СТЕНДЫ)
    function renderDealerPos(posItems) {
        if (!posListContainer) return;
        if (!posItems || posItems.length === 0) { posListContainer.innerHTML = '<p class="text-muted small">Нет оборудования.</p>'; return; }
        let html = '<div class="table-responsive"><table class="table table-bordered table-sm"><thead><tr><th>Оборудование</th><th>Кол-во</th></tr></thead><tbody>';
        posItems.forEach(item => { html += `<tr><td>${safeText(item.name)}</td><td class="text-center fw-bold">${item.quantity || 1}</td></tr>`; });
        posListContainer.innerHTML = html + '</tbody></table></div>';
    }

    // 9. КОНКУРЕНТЫ
    function renderDealerCompetitors(competitors) {
        if (!competitorsListContainer) return;
        if (!competitors || competitors.length === 0) { competitorsListContainer.innerHTML = '<p class="text-muted">Нет данных.</p>'; return; }
        let html = '<div class="table-responsive"><table class="table table-hover table-sm border"><thead><tr class="table-light"><th>Бренд</th><th>Коллекция</th><th>ОПТ</th><th>Розница</th></tr></thead><tbody>';
        competitors.forEach(c => { html += `<tr><td class="fw-bold">${safeText(c.brand)}</td><td>${safeText(c.collection)}</td><td>${safeText(c.price_opt)}</td><td>${safeText(c.price_retail)}</td></tr>`; });
        competitorsListContainer.innerHTML = html + '</tbody></table></div>';
    }

    // BUTTON LISTENERS
    if(editBtn) editBtn.addEventListener('click', () => { localStorage.setItem('pendingEditDealerId', dealerId); window.location.href = 'index.html'; });
    if(navigateBtn) navigateBtn.addEventListener('click', () => { if (dealerLat && dealerLng) window.open(`http://googleusercontent.com/maps/google.com/?q=${dealerLat},${dealerLng}`, '_blank'); else alert("Координаты не заданы."); });
    if(deleteBtn) deleteBtn.addEventListener('click', async () => { if (confirm(`Удалить дилера ${currentDealerName}?`)) { try { const response = await fetch(`${API_DEALERS_URL}/${dealerId}`, { method: 'DELETE' }); if (response.ok) window.location.href = 'index.html'; } catch (error) { alert('Ошибка.'); } } });

    // EXPORT & PRINT
    window.printDiv = (divId, title) => {
        const content = document.getElementById(divId).innerHTML;
        const win = window.open('', '', 'height=600,width=800');
        win.document.write(`<html><head><title>${title}</title><link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet"></head><body class="p-4"><h3>${currentDealerName} - ${title}</h3>${content}</body></html>`);
        setTimeout(() => { win.print(); }, 1000);
    };

    window.exportData = (type) => {
        const clean = (text) => `"${String(text || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`;
        let csv = ""; let filename = `${currentDealerName}_${type}.csv`;
        if (type === 'sales') {
            const table = document.querySelector('#dealer-sales-history table'); if(!table) return alert("Нет данных");
            csv = "\uFEFFМесяц;Факт\n";
            table.querySelectorAll('tbody tr').forEach(tr => { const tds = tr.querySelectorAll('td'); if(tds.length > 1) csv += `${clean(tds[0].innerText)};${clean(tds[1].innerText)}\n`; });
        } else if (type === 'competitors') {
            const table = document.querySelector('#dealer-competitors-list table'); if(!table) return alert("Нет данных");
            csv = "\uFEFFБренд;Коллекция;ОПТ;Розница\n";
            table.querySelectorAll('tbody tr').forEach(tr => { const tds = tr.querySelectorAll('td'); csv += `${clean(tds[0].innerText)};${clean(tds[1].innerText)};${clean(tds[2].innerText)};${clean(tds[3].innerText)}\n`; });
        } else if (type === 'products') {
            csv = "\uFEFFТип;Артикул/Название;Значение\n";
            const posTable = document.querySelector('#dealer-pos-list table');
            if(posTable) posTable.querySelectorAll('tbody tr').forEach(tr => { const tds = tr.querySelectorAll('td'); csv += `Стенд;${clean(tds[0].innerText)};${clean(tds[1].innerText)}\n`; });
            const items = document.querySelectorAll('.product-grid-item');
            items.forEach(item => { const sku = item.querySelector('.product-sku')?.innerText || ''; const name = item.querySelector('.product-name')?.innerText || ''; csv += `Товар;${clean(sku)};${clean(name)}\n`; });
        }
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); document.body.removeChild(a);
    };

    // Запуск
    fetchDealerDetails();
});
