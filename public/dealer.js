// --- АВТОРИЗАЦИЯ (ВСТАВИТЬ В НАЧАЛО ФАЙЛА) ---
const originalFetch = window.fetch;
window.fetch = async function (url, options) {
    options = options || {};
    options.headers = options.headers || {};
    const token = localStorage.getItem('crm_token');
    if (token) options.headers['Authorization'] = 'Bearer ' + token;
    const response = await originalFetch(url, options);
    if (response.status === 401) window.location.href = '/login.html';
    return response;
};
// -------------------------------------------

document.addEventListener('DOMContentLoaded', async () => {
    
    // Получаем ID дилера из адресной строки (?id=...)
    const params = new URLSearchParams(window.location.search);
    const dealerId = params.get('id');

    if (!dealerId) {
        alert("Не указан ID дилера");
        window.location.href = '/';
        return;
    }

    // Элементы DOM
    const headerName = document.getElementById('d-name');
    const headerId = document.getElementById('d-id');
    const statusBadge = document.getElementById('d-status');
    const responsibleBadge = document.getElementById('d-responsible');
    
    const infoAddress = document.getElementById('info-address');
    const infoPhone = document.getElementById('info-phone');
    const infoCity = document.getElementById('info-city');
    const infoType = document.getElementById('info-price-type');
    
    const contactsList = document.getElementById('contacts-list');
    const visitsList = document.getElementById('visits-list');
    const photosContainer = document.getElementById('photos-container');
    const productsContainer = document.getElementById('products-container');
    const competitorsContainer = document.getElementById('competitors-list');
    const posContainer = document.getElementById('pos-list');

    // Кнопки действий
    const btnCall = document.getElementById('btn-action-call');
    const btnWa = document.getElementById('btn-action-wa');
    const btnMap = document.getElementById('btn-action-map');
    const btnEdit = document.getElementById('btn-edit-dealer');
    
    const btnAddVisit = document.getElementById('btn-add-visit');
    const visitModalEl = document.getElementById('visit-modal');
    const visitModal = visitModalEl ? new bootstrap.Modal(visitModalEl) : null;
    const visitForm = document.getElementById('visit-form');

    let dealerData = null;
    let map = null;

    // --- ЗАГРУЗКА ДАННЫХ ---
    async function loadDealer() {
        try {
            const res = await fetch(`/api/dealers/${dealerId}`);
            if (!res.ok) throw new Error("Дилер не найден или нет доступа");
            dealerData = await res.json();
            renderDealer();
        } catch (e) {
            console.error(e);
            document.body.innerHTML = `<div class="container py-5 text-center">
                <h3 class="text-danger">Ошибка загрузки</h3>
                <p class="text-muted">${e.message}</p>
                <a href="/" class="btn btn-outline-primary">На главную</a>
            </div>`;
        }
    }

    // --- ОТРИСОВКА ---
    function renderDealer() {
        document.title = dealerData.name;
        
        // Шапка
        headerName.textContent = dealerData.name;
        headerId.textContent = `#${dealerData.dealer_id}`;
        
        // Статус
        const statusMap = {
            'active': { label: 'Активный', class: 'bg-success' },
            'standard': { label: 'Стандарт', class: 'bg-warning text-dark' },
            'problem': { label: 'Проблемный', class: 'bg-danger' },
            'potential': { label: 'Потенциальный', class: 'bg-primary' },
            'archive': { label: 'Архив', class: 'bg-secondary' }
        };
        const st = statusMap[dealerData.status] || { label: dealerData.status, class: 'bg-secondary' };
        statusBadge.className = `badge ${st.class}`;
        statusBadge.textContent = st.label;

        // Ответственный
        if (responsibleBadge) {
            const respNames = {
                'regional_astana': 'Астана',
                'regional_regions': 'Регионы'
            };
            responsibleBadge.textContent = respNames[dealerData.responsible] || dealerData.responsible || '-';
        }

        // Инфо
        infoAddress.textContent = dealerData.address || '-';
        infoCity.textContent = dealerData.city || '-';
        infoType.textContent = dealerData.price_type || '-';

        // Контакты (Телефон для шапки берем первый)
        let mainPhone = null;
        if (dealerData.contacts && dealerData.contacts.length > 0) {
            const c = dealerData.contacts[0];
            mainPhone = c.contactInfo;
            infoPhone.textContent = mainPhone;
            
            contactsList.innerHTML = dealerData.contacts.map(c => `
                <div class="list-group-item">
                    <div class="fw-bold">${c.name || 'Без имени'}</div>
                    <div class="small text-muted">${c.position || ''}</div>
                    <div class="text-primary mt-1"><a href="tel:${c.contactInfo}" class="text-decoration-none">${c.contactInfo}</a></div>
                </div>
            `).join('');
        } else {
            infoPhone.textContent = '-';
            contactsList.innerHTML = '<div class="text-muted p-2 small">Нет контактов</div>';
        }

        // Кнопки
        if (mainPhone) {
            const cleanPhone = mainPhone.replace(/[^0-9]/g, '');
            btnCall.href = `tel:+${cleanPhone}`;
            btnWa.href = `https://wa.me/${cleanPhone}`;
            btnCall.classList.remove('disabled');
            btnWa.classList.remove('disabled');
        } else {
            btnCall.classList.add('disabled');
            btnWa.classList.add('disabled');
        }

        if (dealerData.latitude && dealerData.longitude) {
            const lat = dealerData.latitude;
            const lng = dealerData.longitude;
            btnMap.href = `https://yandex.kz/maps/?pt=${lng},${lat}&z=17&l=map`;
            btnMap.classList.remove('disabled');
            initMiniMap(lat, lng);
        } else {
            btnMap.classList.add('disabled');
            document.getElementById('mini-map').innerHTML = '<div class="d-flex align-items-center justify-content-center h-100 bg-light text-muted small">Нет координат</div>';
        }

        // История визитов
        if (dealerData.visits && dealerData.visits.length > 0) {
            // Сортируем: новые сверху
            const sortedVisits = [...dealerData.visits].sort((a, b) => new Date(b.date) - new Date(a.date));
            visitsList.innerHTML = sortedVisits.map(v => {
                const date = new Date(v.date).toLocaleDateString('ru-RU');
                const isDone = v.isCompleted ? '<span class="text-success"><i class="bi bi-check-circle-fill"></i></span>' : '<span class="text-warning"><i class="bi bi-clock"></i></span>';
                return `
                <div class="list-group-item">
                    <div class="d-flex justify-content-between align-items-center mb-1">
                        <small class="text-muted fw-bold">${date}</small>
                        ${isDone}
                    </div>
                    <div class="small text-dark">${v.comment || 'Без комментария'}</div>
                </div>`;
            }).join('');
        } else {
            visitsList.innerHTML = '<div class="text-center text-muted p-3 small">История пуста</div>';
        }

        // Фото
        if (dealerData.photos && dealerData.photos.length > 0) {
            photosContainer.innerHTML = dealerData.photos.map(p => `
                <div class="col-6 col-md-4 col-lg-3">
                    <a href="${p.photo_url}" target="_blank" class="d-block mb-3">
                        <img src="${p.photo_url}" class="img-fluid rounded shadow-sm" style="object-fit: cover; aspect-ratio: 1/1; width: 100%;">
                    </a>
                </div>
            `).join('');
        } else {
            photosContainer.innerHTML = '<div class="col-12 text-muted small">Фотографий нет</div>';
        }

        // Товары (Матрица)
        if (dealerData.products && dealerData.products.length > 0) {
            productsContainer.innerHTML = dealerData.products.map(p => 
                `<span class="badge bg-light text-dark border me-1 mb-1">${p.sku} ${p.name}</span>`
            ).join('');
        } else {
            productsContainer.innerHTML = '<div class="text-muted small">Товары не привязаны</div>';
        }

        // POS материалы
        if (dealerData.pos_materials && dealerData.pos_materials.length > 0) {
            posContainer.innerHTML = dealerData.pos_materials.map(p => 
                `<div class="d-flex justify-content-between border-bottom py-1 small"><span>${p.name}</span><strong>${p.quantity} шт.</strong></div>`
            ).join('');
        } else {
            posContainer.innerHTML = '<div class="text-muted small">Нет материалов</div>';
        }

        // Конкуренты
        if (dealerData.competitors && dealerData.competitors.length > 0) {
            competitorsContainer.innerHTML = dealerData.competitors.map(c => `
                <div class="card card-body bg-light border-0 p-2 mb-2">
                    <div class="fw-bold small">${c.brand} <span class="fw-normal text-muted">/ ${c.collection}</span></div>
                    <div class="d-flex justify-content-between mt-1 small">
                        <span>Опт: <b>${c.price_opt || '-'}</b></span>
                        <span>Розн: <b>${c.price_retail || '-'}</b></span>
                    </div>
                </div>
            `).join('');
        } else {
            competitorsContainer.innerHTML = '<div class="text-muted small">Нет данных о конкурентах</div>';
        }
        
        // Кнопка редактирования (Доступна только если есть права)
        // Проверяем права из токена (упрощенно)
        // Но лучше просто перекинуть на главную и там открыть модалку.
        if (btnEdit) {
            btnEdit.onclick = () => {
                // Сохраняем ID, чтобы главная страница знала, кого открыть
                localStorage.setItem('pendingEditDealerId', dealerId);
                window.location.href = '/';
            };
        }
    }

    function initMiniMap(lat, lng) {
        if (map) return;
        map = L.map('mini-map', { zoomControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false }).setView([lat, lng], 15);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
        L.marker([lat, lng]).addTo(map);
        
        // Клик по карте открывает Яндекс карты
        document.getElementById('mini-map').style.cursor = 'pointer';
        document.getElementById('mini-map').onclick = () => {
            window.open(`https://yandex.kz/maps/?pt=${lng},${lat}&z=17&l=map`, '_blank');
        };
    }

    // --- ДОБАВЛЕНИЕ ВИЗИТА ---
    if (btnAddVisit) {
        btnAddVisit.onclick = () => {
            document.getElementById('v-comment').value = '';
            document.getElementById('v-date').value = new Date().toISOString().slice(0, 10);
            visitModal.show();
        };
    }

    if (visitForm) {
        visitForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = visitForm.querySelector('button[type="submit"]');
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';

            const newVisit = {
                date: document.getElementById('v-date').value,
                comment: document.getElementById('v-comment').value,
                isCompleted: true
            };

            // Добавляем к текущим визитам
            const updatedVisits = [...(dealerData.visits || []), newVisit];

            try {
                const res = await fetch(`/api/dealers/${dealerId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ visits: updatedVisits })
                });
                
                if (!res.ok) throw new Error('Ошибка сохранения');

                visitModal.hide();
                loadDealer(); // Перезагрузить данные
                alert('Визит добавлен');
            } catch (e) {
                alert(e.message);
            } finally {
                btn.disabled = false;
                btn.innerHTML = 'Сохранить';
            }
        });
    }

    loadDealer();
});
