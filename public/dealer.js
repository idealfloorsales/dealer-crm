// dealer.js
document.addEventListener('DOMContentLoaded', () => {
    // ... (переменные и fetchDealerDetails без изменений) ...
    const API_URL = '/api/dealers';
    const params = new URLSearchParams(window.location.search);
    const dealerId = params.get('id');
    const photoGalleryContainer = document.getElementById('dealer-photo-gallery');
    const carouselInner = document.getElementById('carousel-inner'); // (НОВОЕ)

    // ... (fetchDealerDetails вызывает renderDealerPhotos) ...

    // (НОВАЯ) Функция отрисовки фото с группировкой по датам
    function renderDealerPhotos(photos) {
        if (!photos || photos.length === 0) {
            photoGalleryContainer.innerHTML = '<p><i>Нет фотографий.</i></p>';
            return;
        }

        // 1. Сортируем фото (новые сверху)
        photos.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

        // 2. Группируем по дате
        const groups = {};
        photos.forEach(photo => {
            // Если даты нет, пишем "Ранее"
            const dateStr = photo.date ? new Date(photo.date).toLocaleDateString('ru-RU') : "Ранее";
            if (!groups[dateStr]) groups[dateStr] = [];
            groups[dateStr].push(photo);
        });

        // 3. Рисуем HTML
        let html = '';
        let slideIndex = 0; // Глобальный индекс для карусели
        let carouselHtml = '';

        for (const [date, groupPhotos] of Object.entries(groups)) {
            html += `<h5 class="mt-4 border-bottom pb-2">${date}</h5>`;
            html += `<div class="gallery-grid">`;
            
            groupPhotos.forEach(photo => {
                // (Галерея на странице)
                html += `
                    <div class="gallery-item" onclick="openLightbox(${slideIndex})">
                        <img src="${photo.photo_url}" loading="lazy">
                    </div>
                `;

                // (Слайд для Карусели)
                carouselHtml += `
                    <div class="carousel-item ${slideIndex === 0 ? 'active' : ''}" style="height: 100%;">
                        <div class="d-flex justify-content-center align-items-center h-100">
                            <img src="${photo.photo_url}" style="max-height: 100%; max-width: 100%; object-fit: contain;">
                            <div class="carousel-caption d-none d-md-block bg-dark bg-opacity-50 rounded">
                                <p>${date}</p>
                            </div>
                        </div>
                    </div>
                `;
                slideIndex++;
            });
            html += `</div>`;
        }

        photoGalleryContainer.innerHTML = html;
        carouselInner.innerHTML = carouselHtml;
    }

    // (НОВОЕ) Функция открытия лайтбокса
    window.openLightbox = function(index) {
        const myModal = new bootstrap.Modal(document.getElementById('imageModal'));
        const myCarousel = document.querySelector('#photoCarousel');
        const carousel = new bootstrap.Carousel(myCarousel);
        
        carousel.to(index); // Переходим к нужному слайду
        myModal.show();
    }

    // ... (остальной код fetchDealerDetails и др. без изменений) ...
    fetchDealerDetails();
});
