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
    
    // Получаем ID
    const params = new URLSearchParams(window.location.search);
    const dealerId = params.get('id');

    if (!dealerId) {
        alert("Не указан ID");
        window.location.href = '/';
        return;
    }

    let dealer = null;
    let salesData = [];

    // --- DOM Elements (из вашего HTML) ---
    const els = {
        name: document.getElementById('dealer-name'),
        idSub: document.getElementById('dealer-id-subtitle'),
        cityBadge: document.getElementById('dealer-city-badge'),
        statusBadge: document.getElementById('dealer-status-badge'),
        avatar: document.getElementById('dealer-avatar-img'),
        
        infoMain: document.getElementById('dealer-info-main'),
        delivery: document.getElementById('dealer-delivery'),
        addresses: document.getElementById('dealer-addresses-list'),
        bonuses: document.getElementById('dealer-bonuses'),
        
        salesHist: document.getElementById('dealer-sales-history'),
        visitsList: document.getElementById('dealer-visits-list'),
        contactsList: document.getElementById('dealer-contacts-list'),
        compList: document.getElementById('dealer-competitors-list'),
        gallery: document.getElementById('dealer-photo-gallery'),
        
        productsStats: document.getElementById('dealer-products-stats'),
        posList: document.getElementById('dealer-pos-list'),
        prodList: document.getElementById('dealer-products-list'),

        btnNav: document.getElementById('navigate-btn'),
        btnEdit: document.getElementById('edit-dealer-btn'),
        btnDel: document.getElementById('delete-dealer-btn')
    };

    // --- LOAD DATA ---
    async function init() {
        try {
            // 1. Грузим дилера
            const res = await fetch(`/api/dealers/${dealerId}`);
            if(!res.ok) throw new Error("Дилер не найден");
            dealer = await res.json();

            // 2. Грузим продажи (для вкладки Продажи)
            try {
                const sRes = await fetch('/api/sales');
                if(sRes.ok) salesData = await sRes.json();
            } catch(e) {}

            renderHeader();
            renderInfo();
            renderSales();
            renderVisits();
            renderContacts();
            renderCompetitors();
            renderPhotos();
            renderMatrix();
            setupActions();

        } catch (e) {
            console.error(e);
            if(els.name) els.name.innerHTML = `<span class="text-danger">Ошибка: ${e.message}</span>`;
        }
    }

    // --- RENDERERS ---

    function renderHeader() {
        document.title = dealer.name;
        if(els.name) els.name.textContent = dealer.name;
        if(els.idSub) els.idSub.innerHTML = `<i class="bi bi-hash"></i> ${dealer.dealer_id}`;
        if(els.cityBadge) els.cityBadge.innerHTML = `<i class="bi bi-geo-alt"></i> ${dealer.city || 'Нет города'}`;
        
        if(els.statusBadge) {
            const statusMap = { 'active': 'success', 'standard': 'warning', 'problem': 'danger', 'potential': 'primary', 'archive': 'secondary' };
            const color = statusMap[dealer.status] || 'secondary';
            els.statusBadge.className = `badge rounded-pill bg-${color} text-white border-0`;
            els.statusBadge.textContent = dealer.status;
        }

        if(els.avatar) {
            els.avatar.src = dealer.avatarUrl || 'https://placehold.co/100x100?text=IMG';
        }
    }

    function renderInfo() {
        // Основное инфо
        if(els.infoMain) {
            const items = [
                { icon: 'tag', label: 'Тип цен', val: dealer.price_type },
                { icon: 'shop', label: 'Адрес', val: dealer.address },
                { icon: 'globe', label: 'Сайт', val: dealer.website, link: true },
                { icon: 'instagram', label: 'Insta', val: dealer.instagram, link: true },
                { icon: 'person-badge', label: 'Ответственный', val: dealer.responsible }
            ];
            
            els.infoMain.innerHTML = items.map(i => {
                if(!i.val) return '';
                let valHtml = i.val;
                if(i.link && i.val.startsWith('http')) valHtml = `<a href="${i.val}" target="_blank">${i.val}</a>`;
                return `<div class="d-flex justify-content-between py-2 border-bottom small">
                    <span class="text-muted"><i class="bi bi-${i.icon} me-2"></i>${i.label}</span>
                    <span class="fw-bold text-end" style="max-width:60%">${valHtml}</span>
                </div>`;
            }).join('');
        }

        // Логистика
        if(els.delivery && dealer.delivery) els.delivery.textContent = dealer.delivery;
        
        // Адреса
        if(els.addresses) {
            if(dealer.additional_addresses && dealer.additional_addresses.length) {
                els.addresses.innerHTML = dealer.additional_addresses.map(a => 
                    `<div class="p-2 bg-light rounded border"><div class="fw-bold small">${a.city}</div><div class="small text-muted">${a.address}</div></div>`
                ).join('');
            } else {
                els.addresses.innerHTML = '<span class="text-muted small">Нет доп. адресов</span>';
            }
        }

        // Бонусы
        if(els.bonuses && dealer.bonuses) els.bonuses.textContent = dealer.bonuses;
    }

    function renderSales() {
        if(!els.salesHist) return;
        
        // Фильтруем продажи только этого дилера
        const mySales = salesData.filter(s => s.dealerId === dealer.id || s.dealerId === dealer.dealer_id);
        
        // Сортируем по месяцам (новые сверху)
        mySales.sort((a,b) => b.month.localeCompare(a.month));

        if(mySales.length === 0) {
            els.salesHist.innerHTML = '<div class="text-center text-muted py-3">Нет данных о продажах</div>';
            return;
        }

        let html = `<table class="table table-sm table-hover small"><thead><tr><th>Месяц</th><th class="text-end">План</th><th class="text-end">Факт</th><th class="text-end">%</th></tr></thead><tbody>`;
        
        mySales.forEach(s => {
            const plan = parseFloat(s.plan) || 0;
            const fact = parseFloat(s.fact) || 0;
            const pct = plan > 0 ? Math.round((fact/plan)*100) : 0;
            let color = 'text-dark';
            if(pct >= 100) color = 'text-success fw-bold';
            else if(pct < 50) color = 'text-danger';

            html += `<tr>
                <td>${s.month}</td>
                <td class="text-end">${plan}</td>
                <td class="text-end">${fact}</td>
                <td class="text-end ${color}">${pct}%</td>
            </tr>`;
        });
        html += '</tbody></table>';
        els.salesHist.innerHTML = html;
    }

    function renderVisits() {
        if(!els.visitsList) return;
        
        const visits = dealer.visits || [];
        if(visits.length === 0) {
            els.visitsList.innerHTML = '<div class="text-center text-muted py-3">Нет визитов</div>';
            return;
        }

        // Сортировка по дате
        const sorted = [...visits].sort((a,b) => new Date(b.date) - new Date(a.date));

        els.visitsList.innerHTML = sorted.map(v => {
            const date = v.date ? new Date(v.date).toLocaleDateString('ru-RU') : 'Без даты';
            return `
            <div class="d-flex gap-3 mb-3">
                <div class="d-flex flex-column align-items-center">
                    <div class="rounded-circle bg-primary text-white d-flex align-items-center justify-content-center" style="width:32px; height:32px; font-size:0.8rem">
                        <i class="bi bi-calendar-check"></i>
                    </div>
                    <div class="h-100 border-start border-2 mt-1" style="min-height:20px; opacity:0.2"></div>
                </div>
                <div>
                    <div class="fw-bold small text-dark">${date}</div>
                    <div class="bg-white border rounded p-2 shadow-sm mt-1">
                        <p class="mb-0 small text-secondary">${v.comment || 'Без комментария'}</p>
                    </div>
                </div>
            </div>`;
        }).join('');
    }

    function renderContacts() {
        if(!els.contactsList) return;
        const contacts = dealer.contacts || [];
        
        if(contacts.length === 0) {
            els.contactsList.innerHTML = '<div class="col-12 text-center text-muted">Нет контактов</div>';
            return;
        }

        els.contactsList.innerHTML = contacts.map(c => `
            <div class="col-md-6">
                <div class="p-3 bg-white border rounded h-100 shadow-sm position-relative overflow-hidden">
                    <div class="fw-bold text-primary mb-1">${c.name || 'Имя не указано'}</div>
                    <div class="small text-muted mb-2 text-uppercase" style="font-size:0.7rem; letter-spacing:1px">${c.position || 'Должность'}</div>
                    <a href="tel:${c.contactInfo}" class="btn btn-sm btn-outline-success w-100 rounded-pill"><i class="bi bi-telephone-fill me-2"></i>Позвонить</a>
                </div>
            </div>
        `).join('');
    }

    function renderCompetitors() {
        if(!els.compList) return;
        const comps = dealer.competitors || [];
        
        if(comps.length === 0) {
            els.compList.innerHTML = '<div class="text-center text-muted">Нет данных</div>';
            return;
        }

        els.compList.innerHTML = comps.map(c => `
            <div class="d-flex justify-content-between align-items-center border-bottom py-2">
                <div>
                    <div class="fw-bold text-dark">${c.brand}</div>
                    <div class="small text-muted">${c.collection || ''}</div>
                </div>
                <div class="text-end small">
                    <div class="text-nowrap">Опт: <b>${c.price_opt || '-'}</b></div>
                    <div class="text-nowrap">Розн: <b>${c.price_retail || '-'}</b></div>
                </div>
            </div>
        `).join('');
    }

    function renderPhotos() {
        if(!els.gallery) return;
        const photos = dealer.photos || [];
        
        if(photos.length === 0) {
            els.gallery.innerHTML = '<div class="text-center text-muted py-4">Нет фото</div>';
            return;
        }

        els.gallery.innerHTML = `<div class="row g-2">${
            photos.map(p => `
                <div class="col-4 col-sm-3">
                    <a href="${p.photo_url}" target="_blank">
                        <img src="${p.photo_url}" class="img-fluid rounded border shadow-sm" style="aspect-ratio:1; object-fit:cover; width:100%">
                    </a>
                </div>
            `).join('')
        }</div>`;
    }

    function renderMatrix() {
        // POS
        if(els.posList) {
            const pos = dealer.pos_materials || [];
            if(pos.length > 0) {
                els.posList.innerHTML = pos.map(p => `
                    <div class="d-flex justify-content-between border-bottom py-1 small">
                        <span>${p.name}</span>
                        <span class="badge bg-light text-dark border">${p.quantity} шт</span>
                    </div>
                `).join('');
            } else {
                els.posList.innerHTML = '<div class="text-muted small">Нет стендов</div>';
            }
        }

        // Товары
        if(els.prodList && els.productsStats) {
            const prods = dealer.products || [];
            els.productsStats.innerHTML = `<span class="badge bg-primary">Всего SKU: ${prods.length}</span>`;
            
            if(prods.length > 0) {
                els.prodList.innerHTML = `<div class="d-flex flex-wrap gap-1">${
                    prods.map(p => `<span class="badge bg-white text-dark border fw-normal">${p.sku} ${p.name}</span>`).join('')
                }</div>`;
            } else {
                els.prodList.innerHTML = '<div class="text-muted small">Матрица не заполнена</div>';
            }
        }
    }

    function setupActions() {
        // Карта
        if(els.btnNav && dealer.latitude && dealer.longitude) {
            els.btnNav.onclick = () => window.open(`https://yandex.kz/maps/?pt=${dealer.longitude},${dealer.latitude}&z=17&l=map`, '_blank');
        } else if (els.btnNav) {
            els.btnNav.disabled = true;
        }

        // Редактировать
        if(els.btnEdit) {
            els.btnEdit.onclick = () => {
                localStorage.setItem('pendingEditDealerId', dealer.id);
                window.location.href = '/'; // Возврат на главную, там откроется модалка
            };
        }

        // Удалить (Только если есть права)
        if(els.btnDel) {
            els.btnDel.onclick = async () => {
                if(confirm(`Удалить дилера ${dealer.name}? Это действие нельзя отменить.`)) {
                    try {
                        const res = await fetch(`/api/dealers/${dealer.id}`, { method: 'DELETE' });
                        if(res.ok) {
                            alert("Удалено");
                            window.location.href = '/';
                        } else {
                            throw new Error("Ошибка удаления");
                        }
                    } catch(e) { alert(e.message); }
                }
            };
        }
    }

    // Экспорт в глобальную область для кнопок в HTML
    window.printDiv = (divId, title) => {
        const content = document.getElementById(divId).innerHTML;
        const win = window.open('', '', 'height=600,width=800');
        win.document.write(`<html><head><title>${title} - ${dealer.name}</title>`);
        win.document.write('<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">');
        win.document.write('</head><body>');
        win.document.write(`<h3>${dealer.name} - ${title}</h3>`);
        win.document.write(content);
        win.document.write('</body></html>');
        win.document.close();
        win.print();
    };

    window.exportData = (type) => {
        alert("Функция экспорта в разработке");
    };

    init();
});
