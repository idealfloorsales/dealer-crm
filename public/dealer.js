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
    const visitsListContainer = document.getElementById('dealer-visits-list'); // (НОВОЕ)
    
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
            renderDealerVisits(dealer.visits || []); // (НОВОЕ)
            renderDealerContacts(dealer.contacts || []);
            renderDealerAddresses(dealer.additional_addresses || []); 
            renderDealerPos(dealer.pos_materials || []); 
            renderDealerPhotos(dealer.photos || []); 
            
            deliveryContainer.textContent = safeText(dealer.delivery) || 'Нет данных';
            bonusesContainer.textContent = safeText(dealer.bonuses) || 'Нет данных';
            document.title = `Дилер: ${dealer.name}`;
        } catch (error) { detailsContainer.innerHTML = `<h2 class="text-danger">${error.message}</h2>`; }
    }
    
    // ... (renderDealerLinks, renderDealerPhotos, renderDealerContacts - без изменений) ...
    // Вставьте их сюда из предыдущего ответа

    // (НОВАЯ ФУНКЦИЯ)
    function renderDealerVisits(visits) {
        if (!visits || visits.length === 0) { visitsListContainer.innerHTML = '<p><i>Нет записей.</i></p>'; return; }
        
        // Сортируем: новые сверху
        visits.sort((a, b) => new Date(b.date) - new Date(a.date));

        let html = '<table class="table table-bordered table-striped" style="margin-top:0"><thead><tr><th style="width:120px">Дата</th><th>Комментарий</th></tr></thead><tbody>';
        visits.forEach(v => {
            // Форматируем дату YYYY-MM-DD -> DD.MM.YYYY
            const dateStr = v.date ? new Date(v.date).toLocaleDateString('ru-RU') : '-';
            html += `<tr><td>${dateStr}</td><td>${safeText(v.comment)}</td></tr>`;
        });
        visitsListContainer.innerHTML = html + '</tbody></table>';
    }

    // ... (остальные функции и вызовы) ...
    // ...
    
    fetchDealerDetails();
    fetchDealerProducts();
});
