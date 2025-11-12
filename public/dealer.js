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
    const carouselInner = document.getElementById('carousel-inner');
    const API_URL = '/api/dealers';
    const params = new URLSearchParams(window.location.search);
    const dealerId = params.get('id');

    if (!dealerId) { detailsContainer.innerHTML = '<h2 class="text-danger">Ошибка: ID не указан.</h2>'; return; }
    const safeText = (text) => text ? text.replace(/</g, "&lt;") : '---';
    const formatUrl = (url) => { if (!url) return null; if (!url.startsWith('http')) return 'https://' + url; return url; }

    async function fetchDealerDetails() {
        try {
            const response = await fetch(`${API_URL}/${dealerId}`);
            if (!response.ok) throw new Error(`Дилер не найден.`);
            const dealer = await response.json();

            detailsContainer.innerHTML = `
                <h1 class="display-6">${safeText(dealer.name)}</h1>
                <p class="lead"><strong>ID точки:</strong> ${safeText(dealer.dealer_id)}</p>
                <p><strong>Организация:</strong> ${safeText(dealer.organization)}</p>
                <p><strong>Город:</strong> ${safeText(dealer.city)}</p>
                <p><strong>Адрес:</strong> ${safeText(dealer.address)}</p>
                <p><strong>Тип цен:</strong> ${safeText(dealer.price_type)}</p>
            `;
            
            renderDealerLinks(dealer.website, dealer.instagram); 
            renderDealerContacts(dealer.contacts);
            renderDealerAddresses(dealer.additional_addresses); 
            renderDealerPos(dealer.pos_materials); 
            renderDealerPhotos(dealer.photos); 
            
            deliveryContainer.textContent = safeText(dealer.delivery) || 'Нет данных';
            bonusesContainer.textContent = safeText(dealer.bonuses) || 'Нет данных';
            document.title = `Дилер: ${dealer.name}`;
        } catch (error) { detailsContainer.innerHTML = `<h2 class="text-danger">${error.message}</h2>`; }
    }
    
    function renderDealerLinks(website, instagram) {
        let html = '';
        const safeWebsite = formatUrl(website);
        const safeInstagram = formatUrl(instagram);
        if (safeWebsite) html += `<a href="${safeWebsite}" target="_blank" class="btn btn-secondary me-2"><i class="bi bi-globe me-2"></i>Сайт</a>`;
        if (safeInstagram) html += `<a href="${safeInstagram}" target="_blank" class="btn btn-secondary"><i class="bi bi-instagram me-2"></i>Instagram</a>`;
        if (!safeWebsite && !safeInstagram) linksContainer.style.display = 'none'; 
        else linksContainer.innerHTML = html;
    }

    function renderDealerPhotos(photos) {
        if (!photos || photos.length === 0) { photoGalleryContainer.innerHTML = '<p><i>Нет фотографий.</i></p>'; return; }
        photos.sort((a, b) => new Date(b.date||0) - new Date(a.date||0));
        const groups = {};
        photos.forEach(p => { const d = p.date ? new Date(p.date).toLocaleDateString('ru-RU') : "Ранее"; if(!groups[d]) groups[d]=[]; groups[d].push(p); });

        let html = ''; let slideIndex = 0; let carouselHtml = '';
        for (const [date, group] of Object.entries(groups)) {
            html += `<h5 class="mt-4 border-bottom pb-2">${date}</h5><div class="gallery-grid">`;
            group.forEach(p => {
                html += `<div class="gallery-item" onclick="openLightbox(${slideIndex})"><img src="${p.photo_url}" loading="lazy"></div>`;
                carouselHtml += `<div class="carousel-item ${slideIndex===0?'active':''}" style="height: 100%;"><div class="d-flex justify-content-center align-items-center h-100"><img src="${p.photo_url}" style="max-height: 100%; max-width: 100%; object-fit: contain;"></div></div>`;
                slideIndex++;
            });
            html += `</div>`;
        }
        photoGalleryContainer.innerHTML = html;
        carouselInner.innerHTML = carouselHtml;
    }

    window.openLightbox = function(index) {
        const myModal = new bootstrap.Modal(document.getElementById('imageModal'));
        const carousel = new bootstrap.Carousel(document.querySelector('#photoCarousel'));
        carousel.to(index);
        myModal.show();
    }

    function renderDealerContacts(contacts) {
        if (!contacts || contacts.length === 0) { contactsListContainer.innerHTML = '<p><i>Нет данных.</i></p>'; return; }
        let html = '<table class="table table-bordered table-striped" style="margin-top:0"><thead><tr><th>Имя</th><th>Должность</th><th>Контакт</th></tr></thead><tbody>';
        contacts.forEach(c => html += `<tr><td>${safeText(c.name)}</td><td>${safeText(c.position)}</td><td>${safeText(c.contactInfo)}</td></tr>`);
        contactsListContainer.innerHTML = html + '</tbody></table>';
    }
    
    function renderDealerAddresses(addresses) {
        if (!addresses || addresses.length === 0) { addressesListContainer.innerHTML = '<p><i>Нет данных.</i></p>'; return; }
        let html = '<table class="table table-bordered table-striped" style="margin-top:0"><thead><tr><th>Описание</th><th>Город</th><th>Адрес</th></tr></thead><tbody>';
        addresses.forEach(a => html += `<tr><td>${safeText(a.description)}</td><td>${safeText(a.city)}</td><td>${safeText(a.address)}</td></tr>`);
        addressesListContainer.innerHTML = html + '</tbody></table>';
    }

    function renderDealerPos(posItems) {
        if (!posItems || posItems.length === 0) { posListContainer.innerHTML = '<p><i>Нет оборудования.</i></p>'; return; }
        let html = '<table class="table table-bordered table-striped" style="margin-top:0"><thead><tr><th>Оборудование</th><th>Кол-во</th></tr></thead><tbody>';
        posItems.forEach(item => html += `<tr><td>${safeText(item.name)}</td><td>${item.quantity||1}</td></tr>`);
        posListContainer.innerHTML = html + '</tbody></table>';
    }

    async function fetchDealerProducts() {
        try {
            const response = await fetch(`${API_URL}/${dealerId}/products`);
            if (!response.ok) throw new Error('');
            const products = await response.json(); 
            if (products.length === 0) { productsListContainer.innerHTML = '<p><i>Нет товаров.</i></p>'; return; }
            productsListContainer.innerHTML = `<ul class="products-list-detailed">${products.map(p => `<li><strong>${safeText(p.sku)}</strong> - ${safeText(p.name)}</li>`).join('')}</ul>`;
        } catch (error) { productsListContainer.innerHTML = `<p class="text-danger">Ошибка.</p>`; }
    }

    editBtn.addEventListener('click', () => { localStorage.setItem('pendingEditDealerId', dealerId); window.location.href = 'index.html'; });
    deleteBtn.addEventListener('click', async () => {
        if (confirm(`Удалить?`)) {
            try { const response = await fetch(`${API_URL}/${dealerId}`, { method: 'DELETE' }); if (response.ok) window.location.href = 'index.html'; } catch (error) { alert('Ошибка.'); }
        }
    });

    fetchDealerDetails();
    fetchDealerProducts();
});
