// dealer.js
document.addEventListener('DOMContentLoaded', () => {
    const detailsContainer = document.getElementById('dealer-details');
    // ... (все остальные элементы) ...
    const photoGalleryContainer = document.getElementById('dealer-photo-gallery');
    const carouselInner = document.getElementById('carousel-inner'); 
    const API_URL = '/api/dealers';
    const params = new URLSearchParams(window.location.search);
    const dealerId = params.get('id');

    // ... (проверки, safeText) ...

    // (ИЗМЕНЕНО) Отрисовка Галереи
    function renderDealerPhotos(photos) {
        if (!photos || photos.length === 0) {
            photoGalleryContainer.innerHTML = '<p><i>Нет фотографий.</i></p>';
            return;
        }

        // 1. Сортировка: новые сверху
        photos.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

        // 2. Группировка по дате
        const groups = {};
        photos.forEach(p => {
            const d = p.date ? new Date(p.date).toLocaleDateString('ru-RU') : "Ранее";
            if (!groups[d]) groups[d] = [];
            groups[d].push(p);
        });

        let html = '';
        let slideIndex = 0;
        let carouselHtml = '';

        for (const [date, group] of Object.entries(groups)) {
            // Заголовок Даты
            html += `<h5 class="mt-4 border-bottom pb-2 text-secondary">${date}</h5>`;
            // Сетка фото
            html += `<div class="gallery-container">`;
            
            group.forEach(p => {
                html += `
                    <div class="gallery-item" onclick="openLightbox(${slideIndex})">
                        <img src="${p.photo_url}" loading="lazy">
                    </div>
                `;
                // Слайд
                carouselHtml += `
                    <div class="carousel-item ${slideIndex===0?'active':''}" style="height: 100%;">
                        <div class="d-flex justify-content-center align-items-center h-100">
                            <img src="${p.photo_url}" style="max-height: 100%; max-width: 100%; object-fit: contain;">
                        </div>
                    </div>
                `;
                slideIndex++;
            });
            html += `</div>`;
        }

        photoGalleryContainer.innerHTML = html;
        if(carouselInner) carouselInner.innerHTML = carouselHtml;
    }

    window.openLightbox = function(index) {
        const myModal = new bootstrap.Modal(document.getElementById('imageModal'));
        const carousel = new bootstrap.Carousel(document.querySelector('#photoCarousel'));
        carousel.to(index);
        myModal.show();
    }

    // ... (fetchDealerDetails, renderDealerLinks, renderContacts, fetchDealerProducts - без изменений) ...
    
    // (Скопируйте их из предыдущего рабочего файла или используйте полную версию ниже)
    async function fetchDealerDetails() {
        try {
            const response = await fetch(`${API_URL}/${dealerId}`);
            if (!response.ok) throw new Error(`Дилер не найден.`);
            const dealer = await response.json();
            // ... (заполнение HTML) ...
            renderDealerPhotos(dealer.photos); // Вызов новой функции
            // ...
        } catch (error) { }
    }
    
    fetchDealerDetails();
});
