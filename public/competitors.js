// --- АВТОРИЗАЦИЯ ---
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

document.addEventListener('DOMContentLoaded', () => {
    const API_URL = '/api/competitors-ref';
    const API_DEALERS = '/api/dealers';
    
    // --- ВСЕ СТИЛИ (Карточки, Лого, Адреса, Лифт, Список) ---
    const styleFix = document.createElement('style');
    styleFix.innerHTML = `
        /* Карточка (Стандартный вид) */
        .comp-card-modern { min-height: 480px !important; transition: all 0.3s ease; }
        .comp-front { display: flex; flex-direction: column; padding-bottom: 10px; }
        .comp-front .btn-flip { margin-top: auto; }
        .btn-dealers-hover:hover { background-color: #6c757d !important; color: #ffffff !important; border-color: #6c757d !important; }
        .comp-card-modern.is-flipped .btn-card-edit-abs { display: none !important; }
        .cb-custom { background-color: #e0cffc; color: #5b21b6; border: 1px solid #d8b4fe; }
        .dealer-link-item:hover { background: #f8f9fa; }
        
        /* Логотип */
        .comp-logo-box { height: 60px; display: flex; align-items: center; margin-bottom: 10px; }
        .comp-logo-img { max-height: 100%; max-width: 100%; object-fit: contain; }

        /* Адреса в карточке */
        .address-row { display: flex; gap: 6px; font-size: 0.85rem; color: #555; margin-bottom: 4px; align-items: baseline; }
        .address-icon { color: #dc3545; font-size: 0.9rem; }

        /* --- ЛИФТ УПРАВЛЕНИЯ --- */
        .elevator-capsule {
            position: fixed; bottom: 100px; right: 15px; z-index: 1060;
            display: flex; flex-direction: column; gap: 5px;
            background: rgba(255, 255, 255, 0.9); backdrop-filter: blur(4px);
            padding: 5px; border-radius: 50px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.1); border: 1px solid rgba(0,0,0,0.05);
            transition: opacity 0.3s;
        }
        @media (min-width: 992px) { .elevator-capsule { bottom: 30px; right: 25px; } }

        .elevator-btn {
            width: 40px; height: 40px; border-radius: 50%; border: none;
            background: transparent; color: #555; display: flex; align-items: center; justify-content: center;
            transition: all 0.2s; font-size: 1.1rem;
        }
        .elevator-btn:hover { background: #f8f9fa; color: #b9040a; transform: scale(1.1); }

        /* --- РЕЖИМ СПИСКА (СТРОГИЙ ВИД) --- */
        .comp-list-mode .col-xl-3, .comp-list-mode .col-lg-4, .comp-list-mode .col-md-6 { 
            width: 100% !important; flex: 0 0 100%; padding: 0 8px;
        }
        
        .comp-list-mode .comp-card-modern {
            min-height: 50px !important; height: 50px !important;
            flex-direction: row; padding: 0 15px; align-items: center; gap: 15px;
            margin-bottom: -1px; border-radius: 0; border: 1px solid #eee; box-shadow: none !important;
        }
        .comp-list-mode .col-xl-3:first-child .comp-card-modern { border-top-left-radius: 8px; border-top-right-radius: 8px; }
        .comp-list-mode .col-xl-3:last-child .comp-card-modern { border-bottom-left-radius: 8px; border-bottom-right-radius: 8px; }

        .comp-list-mode .comp-front { flex-direction: row; width: 100%; padding: 0; align-items: center; flex-wrap: nowrap; }

        /* Настройка колонок в списке */
        .comp-list-mode .comp-logo-box { height: 32px; width: 32px; margin: 0 15px 0 0; min-width: 32px; }
        .comp-list-mode .comp-title { font-size: 0.95rem; font-weight: 700; margin: 0; white-space: nowrap; width: 25%; overflow: hidden; text-overflow: ellipsis; text-align: left; }
        .comp-list-mode .comp-flag { display: block; position: static; background: none; color: #666; font-size: 0.9rem; font-weight: 400; padding: 0; width: 20%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        
        /* Поставщик (первый meta) */
        .comp-list-mode .comp-meta { display: flex !important; font-size: 0.85rem; color: #888; width: 25%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 0; }
        .comp-list-mode .comp-meta i { display: none; } 
        /* Скрываем склад (второй meta) и все остальное */
        .comp-list-mode .comp-meta:nth-of-type(n+3) { display: none !important; } 

        /* Скрываем лишнее */
        .comp-list-mode .mt-2, .comp-list-mode .comp-badges, .comp-list-mode .btn-flip, .comp-list-mode .w-100.btn-outline-secondary, .comp-list-mode .address-row { display: none !important; }
        
        /* Карандаш справа */
        .comp-list-mode .btn-card-edit-abs {
            position: static; margin-left: auto; opacity: 1; box-shadow: none; 
            border: none; background: transparent; color: #adb5bd; width: auto; height: auto;
        }
        .comp-list-mode .btn-card-edit-abs:hover { color: #0d6efd; background: transparent; }
    `;
    document.head.appendChild(styleFix);

    // Элементы DOM
    const gridContainer = document.getElementById('competitors-grid');
    const searchInput = document.getElementById('search-input');
    const filterType = document.getElementById('filter-type');
    const addBtn = document.getElementById('add-comp-btn');
    const exportBtn = document.getElementById('export-comp-btn');
    const dashboardContainer = document.getElementById('comp-dashboard');
    const btnManageTypes = document.getElementById('btn-manage-types');

    // Модалки
    const modalEl = document.getElementById('comp-modal');
    const modal = new bootstrap.Modal(modalEl, { backdrop: 'static', keyboard: false });
    const typesModalEl = document.getElementById('types-manager-modal');
    const typesModal = new bootstrap.Modal(typesModalEl);
    const typesListContainer = document.getElementById('types-manager-list');
    const dealersModalEl = document.getElementById('dealers-list-modal');
    const dealersModal = new bootstrap.Modal(dealersModalEl);
    const dealersListContainer = document.getElementById('dealers-list-container');
    const dealersBrandNameSpan = document.getElementById('dl-brand-name');

    // Форма и поля
    const form = document.getElementById('comp-form');
    const modalTitle = document.getElementById('comp-modal-title');
    const delBtn = document.getElementById('btn-delete-comp');
    const saveBtn = document.getElementById('btn-save-comp');
    
    // Контейнеры списков
    const collectionsContainer = document.getElementById('collections-container');
    const addCollRowBtn = document.getElementById('add-coll-row-btn');
    const contactsContainer = document.getElementById('comp-contacts-list');
    const addContactBtn = document.getElementById('btn-add-contact');
    const addressesContainer = document.getElementById('comp-addresses-list');
    const addAddressBtn = document.getElementById('btn-add-address');

    // Инпуты данных
    const inpId = document.getElementById('comp_id');
    const inpName = document.getElementById('comp_name');
    const inpCountry = document.getElementById('comp_country');
    const inpSupplier = document.getElementById('comp_supplier');
    const inpWarehouse = document.getElementById('comp_warehouse');
    const inpInfo = document.getElementById('comp_info');
    const inpStorage = document.getElementById('comp_storage');
    const inpStock = document.getElementById('comp_stock');
    const inpReserve = document.getElementById('comp_reserve');
    const inpWebsite = document.getElementById('comp_website');      
    const inpInstagram = document.getElementById('comp_instagram'); 
    const inpAddress = document.getElementById('comp_address'); // Если вдруг остался старый ID
    
    // Логотип
    const inpLogoFile = document.getElementById('comp_logo_input');
    const imgPreview = document.getElementById('comp_logo_preview');
    const imgPlaceholder = document.getElementById('comp_logo_placeholder');
    let currentLogoBase64 = "";

    const defaultTypes = [
        { val: 'std', label: 'Стандарт', css: 'cb-std', dot: '#94a3b8' },
        { val: 'eng', label: 'Англ. Елка', css: 'cb-eng', dot: '#10b981' },
        { val: 'fr', label: 'Фр. Елка', css: 'cb-fr', dot: '#3b82f6' },
        { val: 'art', label: 'Художественный', css: 'cb-art', dot: '#f59e0b' },
        { val: 'mix', label: 'Худ. Микс', css: 'cb-art', dot: '#ef4444' }
    ];

    let competitors = [];
    let allDealers = [];
    let isSaving = false;
    let dynamicTypes = [];

    // --- ФУНКЦИЯ КОНВЕРТАЦИИ ФАЙЛА В BASE64 ---
    const toBase64 = file => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });

    if(inpLogoFile) {
        inpLogoFile.onchange = async (e) => {
            const file = e.target.files[0];
            if(file) {
                if(file.size > 2 * 1024 * 1024) return alert('Файл слишком большой! Максимум 2Мб.');
                try {
                    const b64 = await toBase64(file);
                    currentLogoBase64 = b64;
                    imgPreview.src = b64; imgPreview.classList.remove('d-none'); imgPlaceholder.classList.add('d-none');
                } catch(err) { alert('Ошибка чтения файла'); }
            }
        };
    }

    // --- ЗАГРУЗКА ДАННЫХ ---
    async function loadList() {
        try {
            const [compRes, dealersRes] = await Promise.all([ fetch(API_URL), fetch(API_DEALERS) ]);
            if(!compRes.ok || !dealersRes.ok) throw new Error(`Ошибка загрузки`);
            competitors = await compRes.json();
            allDealers = await dealersRes.json();
            competitors.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            refreshDynamicTypes(); updateFilterOptions(); renderDashboard(); renderGrid();
        } catch(e) { gridContainer.innerHTML = `<p class="text-danger text-center m-5">Ошибка: ${e.message}</p>`; }
    }

    function refreshDynamicTypes() {
        const found = new Set();
        competitors.forEach(c => { (c.collections || []).forEach(col => { const t = (typeof col === 'string') ? 'std' : (col.type || 'std'); if (!defaultTypes.find(x => x.val === t)) { found.add(t); } }); });
        dynamicTypes = Array.from(found).map(t => ({ val: t, label: t, css: 'cb-custom', dot: '#8b5cf6' }));
        dynamicTypes.sort((a,b) => a.label.localeCompare(b.label));
    }
    function getAllTypes() { return [...defaultTypes, ...dynamicTypes]; }
    function updateFilterOptions() {
        if(!filterType) return; const currentVal = filterType.value;
        let html = `<option value="all">Все типы коллекций</option>`;
        defaultTypes.forEach(t => { if(t.val !== 'std') html += `<option value="${t.val}">${t.label}</option>`; });
        if(dynamicTypes.length > 0) { html += `<optgroup label="Пользовательские">`; dynamicTypes.forEach(t => html += `<option value="${t.val}">${t.label}</option>`); html += `</optgroup>`; }
        filterType.innerHTML = html; filterType.value = (currentVal !== 'all' && !getAllTypes().find(t => t.val === currentVal)) ? 'all' : currentVal;
    }
    function renderDashboard() {
        if (!dashboardContainer) return;
        const totalBrands = competitors.length; let totalCols = 0; let countEng = 0; let countFr = 0; let countArt = 0; let countCustom = 0;
        competitors.forEach(c => { (c.collections || []).forEach(col => { totalCols++; const t = (typeof col === 'string') ? 'std' : (col.type || 'std'); if (t.includes('eng')) countEng++; else if (t.includes('fr')) countFr++; else if (t.includes('art') || t.includes('mix')) countArt++; else if (t !== 'std') countCustom++; }); });
        dashboardContainer.innerHTML = `<div class="col-xl-3 col-md-6"><div class="stat-card-modern"><div class="stat-icon-box bg-primary-subtle text-primary"><i class="bi bi-shop"></i></div><div class="stat-info"><h3>${totalBrands}</h3><p>Брендов</p></div></div></div><div class="col-xl-3 col-md-6"><div class="stat-card-modern"><div class="stat-icon-box bg-secondary-subtle text-secondary"><i class="bi bi-collection"></i></div><div class="stat-info"><h3>${totalCols}</h3><p>Коллекций</p></div></div></div><div class="col-xl-3 col-md-6"><div class="stat-card-modern"><div class="stat-icon-box bg-success-subtle text-success"><i class="bi bi-chevron-double-up"></i></div><div class="stat-info"><h3>${countEng + countFr}</h3><p>Елочка</p></div></div></div><div class="col-xl-3 col-md-6"><div class="stat-card-modern"><div class="stat-icon-box bg-info-subtle text-info"><i class="bi bi-stars"></i></div><div class="stat-info"><h3>${countCustom + countArt}</h3><p>Арт / Другое</p></div></div></div>`;
    }
    if(btnManageTypes) btnManageTypes.onclick = () => { renderTypesManager(); typesModal.show(); };
    function renderTypesManager() {
        if(!typesListContainer) return; if(dynamicTypes.length === 0) { typesListContainer.innerHTML = '<div class="text-center text-muted py-4">Нет пользовательских типов.</div>'; return; }
        typesListContainer.innerHTML = dynamicTypes.map(t => `<div class="list-group-item d-flex justify-content-between align-items-center"><span class="badge ${t.css} fs-6">${t.label}</span><div><button class="btn btn-sm btn-light border me-1" onclick="renameCustomType('${t.val}')"><i class="bi bi-pencil"></i></button><button class="btn btn-sm btn-light text-danger border" onclick="deleteCustomType('${t.val}')"><i class="bi bi-trash"></i></button></div></div>`).join('');
    }
    window.renameCustomType = async (oldName) => { const newName = prompt(`Новое название для "${oldName}":`, oldName); if (!newName || newName === oldName) return; const clean = newName.trim(); if (defaultTypes.find(t => t.val === clean)) return alert("Занято."); if(!confirm("Переименовать везде?")) return; const p = []; competitors.forEach(c => { let ch = false; const nc = (c.collections||[]).map(col => { const t = (typeof col === 'string')?'std':(col.type||'std'); if(t===oldName){ch=true; return {name:(typeof col==='string'?col:col.name), type:clean};} return col; }); if(ch) p.push(fetch(`${API_URL}/${c.id}`, {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({...c, collections:nc})})); }); if(p.length){typesModal.hide(); await Promise.all(p); await loadList(); alert("Готово");} };
    window.deleteCustomType = async (typeName) => { if(!confirm(`Удалить тип "${typeName}"?`)) return; const p = []; competitors.forEach(c => { let ch = false; const nc = (c.collections||[]).map(col => { const t = (typeof col === 'string')?'std':(col.type||'std'); if(t===typeName){ch=true; return {name:(typeof col==='string'?col:col.name), type:'std'};} return col; }); if(ch) p.push(fetch(`${API_URL}/${c.id}`, {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({...c, collections:nc})})); }); if(p.length){typesModal.hide(); await Promise.all(p); await loadList(); alert("Удалено");} else await loadList(); };

    window.showDealersModal = (brandName) => {
        const dealersWithBrand = allDealers.filter(d => d.competitors && d.competitors.some(c => c.brand === brandName));
        dealersBrandNameSpan.textContent = brandName;
        dealersListContainer.innerHTML = dealersWithBrand.length === 0 ? '<div class="text-center py-4 text-muted">Нет дилеров.</div>' : dealersWithBrand.map(d => `<a href="dealer.html?id=${d.id}" target="_blank" class="list-group-item list-group-item-action dealer-link-item d-flex justify-content-between align-items-center"><div><div class="fw-bold text-primary">${d.name}</div><small class="text-muted"><i class="bi bi-geo-alt me-1"></i>${d.city || 'Город не указан'}</small></div><i class="bi bi-chevron-right text-muted small"></i></a>`).join('');
        dealersModal.show();
    };

    // --- РЕНДЕР СЕТКИ ---
    function renderGrid() {
        const search = searchInput ? searchInput.value.toLowerCase() : '';
        const filter = filterType ? filterType.value : 'all';
        const allTypesList = getAllTypes();

        const filtered = competitors.filter(c => {
            const matchSearch = !search || c.name.toLowerCase().includes(search) || (c.supplier || '').toLowerCase().includes(search) || (c.country || '').toLowerCase().includes(search);
            let matchFilter = true;
            if (filter !== 'all') { matchFilter = c.collections && c.collections.some(col => { const t = col.type || 'std'; return t === filter; }); }
            return matchSearch && matchFilter;
        });

        if (filtered.length === 0) { gridContainer.innerHTML = '<div class="col-12 text-center text-muted mt-5">Ничего не найдено</div>'; return; }

        gridContainer.innerHTML = filtered.map(c => {
            const typesSet = new Set();
            (c.collections || []).forEach(col => { const t = (typeof col === 'string') ? 'std' : (col.type || 'std'); if (t !== 'std') typesSet.add(t); });
            
            let badgesHtml = ''; typesSet.forEach(t => { const info = allTypesList.find(x => x.val === t) || { label: t, css: 'cb-custom' }; badgesHtml += `<span class="c-badge ${info.css}">${info.label}</span>`; });
            if(!badgesHtml) badgesHtml = `<span class="c-badge cb-std">Стандарт</span>`;

            let socialHtml = '';
            if(c.website) {
                let webUrl = c.website; if(!webUrl.startsWith('http')) webUrl = 'http://' + webUrl;
                socialHtml += `<a href="${webUrl}" target="_blank" class="btn btn-sm btn-light text-primary border me-1" title="Сайт" onclick="event.stopPropagation()"><i class="bi bi-globe"></i></a>`;
            }
            if(c.instagram) {
                let instaUrl = c.instagram; if(!instaUrl.startsWith('http')) instaUrl = 'https://instagram.com/' + instaUrl.replace('@','').trim();
                socialHtml += `<a href="${instaUrl}" target="_blank" class="btn btn-sm btn-light text-danger border" title="Instagram" onclick="event.stopPropagation()"><i class="bi bi-instagram"></i></a>`;
            }
            const socialBlock = socialHtml ? `<div class="mt-2 pt-2 border-top mb-2">${socialHtml}</div>` : '';

            const dealersCount = allDealers.filter(d => d.competitors && d.competitors.some(comp => comp.brand === c.name)).length;
            const dealersBtn = dealersCount > 0 
                ? `<button class="btn btn-sm w-100 btn-outline-secondary mt-2 border-0 bg-light btn-dealers-hover" onclick="event.stopPropagation(); showDealersModal('${c.name}')"><i class="bi bi-shop me-1"></i> Дилеры: <strong>${dealersCount}</strong></button>`
                : `<div class="text-center mt-2 text-muted small py-1 bg-light rounded"><small>Нет у дилеров</small></div>`;

            const listHtml = (c.collections || []).map(col => {
                const name = (typeof col === 'string') ? col : col.name;
                const type = (typeof col === 'string') ? 'std' : (col.type || 'std');
                const info = allTypesList.find(x => x.val === type) || { dot: '#8b5cf6' };
                return `<div class="comp-list-item"><span><span class="comp-dot" style="background:${info.dot}"></span> ${name}</span></div>`;
            }).join('');

            // Логотип
            let headerContent = c.logoUrl 
                ? `<div class="comp-logo-box"><img src="${c.logoUrl}" class="comp-logo-img" alt="${c.name}"></div><div class="comp-title" style="font-size: 1.1rem;">${c.name}</div>`
                : `<div class="comp-title">${c.name}</div>`;
            
            // Адреса
            let addressHtml = '';
            if(c.addresses && c.addresses.length > 0) {
                addressHtml = '<div class="mt-2 mb-2">';
                c.addresses.forEach(a => {
                    const desc = a.description ? `<span class="text-muted">(${a.description})</span>` : '';
                    addressHtml += `
                        <div class="address-row" title="${a.address}">
                            <i class="bi bi-geo-alt-fill address-icon"></i>
                            <div class="text-truncate">
                                <span class="fw-bold text-dark">${a.city}:</span> 
                                <span>${a.address}</span> ${desc}
                            </div>
                        </div>`;
                });
                addressHtml += '</div>';
            }

            return `<div class="col-xl-3 col-lg-4 col-md-6"><div class="comp-card-modern" id="card-${c.id}"><button class="btn-card-edit-abs" onclick="openEditModal('${c.id}')"><i class="bi bi-pencil-fill"></i></button><div class="comp-front"><span class="comp-flag">${c.country || ''}</span>${headerContent}${addressHtml}<div class="comp-meta"><i class="bi bi-box-seam"></i> <span>${c.supplier || '-'}</span></div><div class="comp-meta"><i class="bi bi-building"></i> <span>${c.warehouse || '-'}</span></div>${socialBlock}<div class="comp-badges">${badgesHtml}</div>${dealersBtn}<button class="btn-flip" onclick="toggleCard('${c.id}')">Коллекции (${(c.collections||[]).length}) <i class="bi bi-chevron-down ms-1"></i></button></div><div class="comp-back"><div class="d-flex justify-content-between align-items-center mb-2"><h6 class="fw-bold mb-0">Коллекции</h6><button class="btn-close-flip" onclick="toggleCard('${c.id}')"><i class="bi bi-x"></i></button></div><div class="comp-list-scroll">${listHtml || '<div class="text-center text-muted small mt-4">Пусто</div>'}</div></div></div></div>`;
        }).join('');
    }

    window.toggleCard = (id) => { const card = document.getElementById(`card-${id}`); if (card) { document.querySelectorAll('.comp-card-modern.is-flipped').forEach(c => { if(c !== card) c.classList.remove('is-flipped'); }); card.classList.toggle('is-flipped'); } };

    // --- ОТКРЫТИЕ МОДАЛКИ (Заполняем данные) ---
    window.openEditModal = (id) => {
        const c = competitors.find(x => x.id === id); if (!c) return;
        inpId.value = c.id; modalTitle.textContent = `Редактировать: ${c.name}`; if(delBtn) delBtn.style.display = 'block';
        inpName.value = c.name; inpCountry.value = c.country || ''; 
        inpSupplier.value = c.supplier || ''; inpWarehouse.value = c.warehouse || ''; inpInfo.value = c.info || ''; inpStorage.value = c.storage_days || ''; inpStock.value = c.stock_info || ''; inpReserve.value = c.reserve_days || '';
        if(inpWebsite) inpWebsite.value = c.website || ''; if(inpInstagram) inpInstagram.value = c.instagram || '';
        
        // Лого
        currentLogoBase64 = c.logoUrl || "";
        if(currentLogoBase64) { imgPreview.src = currentLogoBase64; imgPreview.classList.remove('d-none'); imgPlaceholder.classList.add('d-none'); } 
        else { imgPreview.classList.add('d-none'); imgPlaceholder.classList.remove('d-none'); inpLogoFile.value = ''; }

        // Коллекции, Контакты, Адреса
        collectionsContainer.innerHTML = ''; if (c.collections && c.collections.length > 0) { c.collections.forEach(col => { if (typeof col === 'string') addCollectionRow(col, 'std'); else addCollectionRow(col.name, col.type); }); } else { addCollectionRow(); }
        contactsContainer.innerHTML = ''; if (c.contacts && c.contacts.length > 0) { c.contacts.forEach(cnt => addContactRow(cnt.name, cnt.position, cnt.phone)); } else { addContactRow(); }
        addressesContainer.innerHTML = ''; if (c.addresses && c.addresses.length > 0) { c.addresses.forEach(a => addAddressRow(a.description, a.city, a.address)); } else { addAddressRow(); }

        modal.show();
    };

    if(addBtn) addBtn.onclick = () => { 
        inpId.value = ''; form.reset(); modalTitle.textContent = 'Новый Бренд'; if(delBtn) delBtn.style.display = 'none'; 
        currentLogoBase64 = ""; imgPreview.classList.add('d-none'); imgPlaceholder.classList.remove('d-none'); inpLogoFile.value = '';
        collectionsContainer.innerHTML = ''; contactsContainer.innerHTML = ''; addressesContainer.innerHTML = ''; 
        addCollectionRow(); addContactRow(); addAddressRow(); 
        modal.show(); 
    };

    // --- ФУНКЦИИ ДОБАВЛЕНИЯ СТРОК ---
    function addCollectionRow(name = '', type = 'std') {
        const div = document.createElement('div'); div.className = 'competitor-entry'; div.style.gridTemplateColumns = "2fr 1.5fr auto"; 
        const allTypes = getAllTypes(); let options = allTypes.map(t => `<option value="${t.val}" ${t.val === type ? 'selected' : ''}>${t.label}</option>`).join(''); options += `<option value="__NEW__" class="fw-bold text-primary">+ Свой тип...</option>`;
        div.innerHTML = `<input type="text" class="form-control" placeholder="Название коллекции" value="${name}" required><select class="form-select collection-type-select">${options}</select><button type="button" class="btn-remove-entry" onclick="this.closest('.competitor-entry').remove()"><i class="bi bi-x-lg"></i></button>`;
        const select = div.querySelector('select'); select.onchange = function() { if (this.value === '__NEW__') { const newName = prompt("Название нового типа:"); if (newName && newName.trim()) { const clean = newName.trim(); const newOpt = document.createElement('option'); newOpt.value = clean; newOpt.text = clean; newOpt.selected = true; this.insertBefore(newOpt, this.lastElementChild); this.value = clean; } else { this.value = 'std'; } } };
        collectionsContainer.appendChild(div);
    }
    function addContactRow(name='', pos='', phone='') {
        const div = document.createElement('div'); div.className = 'competitor-entry'; div.style.gridTemplateColumns = "1fr 1fr 1fr auto"; 
        div.innerHTML = `<input type="text" class="form-control" placeholder="Имя" value="${name}"><input type="text" class="form-control" placeholder="Должность" value="${pos}"><input type="text" class="form-control" placeholder="Телефон" value="${phone}"><button type="button" class="btn-remove-entry" onclick="this.closest('.competitor-entry').remove()"><i class="bi bi-x-lg"></i></button>`;
        contactsContainer.appendChild(div);
    }
    function addAddressRow(desc='', city='', addr='') {
        const div = document.createElement('div'); div.className = 'competitor-entry'; div.style.gridTemplateColumns = "1fr 1fr 2fr auto"; 
        div.innerHTML = `<input type="text" class="form-control" placeholder="Описание" value="${desc}"><input type="text" class="form-control" placeholder="Город" value="${city}"><input type="text" class="form-control" placeholder="Улица, дом" value="${addr}"><button type="button" class="btn-remove-entry" onclick="this.closest('.competitor-entry').remove()"><i class="bi bi-x-lg"></i></button>`;
        addressesContainer.appendChild(div);
    }
    
    if(addCollRowBtn) addCollRowBtn.onclick = () => addCollectionRow();
    if(addContactBtn) addContactBtn.onclick = () => addContactRow();
    if(addAddressBtn) addAddressBtn.onclick = () => addAddressRow();

    // --- SAVE ---
    if(saveBtn) saveBtn.onclick = async () => {
        if(isSaving) return; if(!inpName.value.trim()) return alert("Введите название!");
        isSaving = true; const oldText = saveBtn.innerHTML; saveBtn.disabled = true; saveBtn.innerHTML = '...';
        
        const collectionsData = []; collectionsContainer.querySelectorAll('.competitor-entry').forEach(row => { const inputs = row.querySelectorAll('input, select'); const name = inputs[0].value.trim(); const type = inputs[1].value; if (name) collectionsData.push({ name, type }); });
        const contactsData = []; contactsContainer.querySelectorAll('.competitor-entry').forEach(row => { const inputs = row.querySelectorAll('input'); const name = inputs[0].value.trim(); const pos = inputs[1].value.trim(); const phone = inputs[2].value.trim(); if (name || phone) contactsData.push({ name, position: pos, phone }); });
        const addressesData = []; addressesContainer.querySelectorAll('.competitor-entry').forEach(row => { const inputs = row.querySelectorAll('input'); const desc = inputs[0].value.trim(); const city = inputs[1].value.trim(); const addr = inputs[2].value.trim(); if (city || addr) addressesData.push({ description: desc, city, address: addr }); });

        const data = { 
            name: inpName.value, country: inpCountry ? inpCountry.value : '', 
            supplier: inpSupplier.value, warehouse: inpWarehouse.value, 
            logoUrl: currentLogoBase64, 
            website: inpWebsite ? inpWebsite.value : '', instagram: inpInstagram ? inpInstagram.value : '', 
            info: inpInfo.value, storage_days: inpStorage.value, stock_info: inpStock.value, reserve_days: inpReserve.value, 
            collections: collectionsData, contacts: contactsData, addresses: addressesData
        };

        const id = inpId.value; let url = API_URL; let method = 'POST'; if (id) { url = `${API_URL}/${id}`; method = 'PUT'; }
        try { const res = await fetch(url, { method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) }); if (res.ok) { await loadList(); modal.hide(); } else alert("Ошибка"); } catch (e) { alert("Ошибка сети"); } finally { isSaving = false; saveBtn.disabled = false; saveBtn.innerHTML = oldText; }
    };

    if(delBtn) delBtn.onclick = async () => { const id = inpId.value; if (!id) return; if (confirm('Удалить?')) { await fetch(`${API_URL}/${id}`, { method: 'DELETE' }); modal.hide(); loadList(); } };
    if(searchInput) searchInput.addEventListener('input', renderGrid);
    if(filterType) filterType.addEventListener('change', renderGrid);
    if(exportBtn) exportBtn.onclick = () => { if (!competitors.length) return alert("Пусто"); const clean = (text) => `"${String(text || '').replace(/"/g, '""')}"`; let csv = "\uFEFFБренд;Страна;Коллекция;Тип;Поставщик;Склад;Контакты;Адреса;Сайт;Instagram;Инфо\n"; competitors.forEach(c => { const contactsStr = (c.contacts || []).map(cnt => `${cnt.name} (${cnt.phone})`).join(', '); const addrStr = (c.addresses || []).map(a => `${a.city}: ${a.address}`).join(' | '); const bp = `${clean(c.name)};${clean(c.country)}`; const tp = `${clean(c.supplier)};${clean(c.warehouse)};${clean(contactsStr)};${clean(addrStr)};${clean(c.website)};${clean(c.instagram)};${clean(c.info)}`; if (c.collections && c.collections.length > 0) { c.collections.forEach(col => { const cn = (typeof col === 'string') ? col : col.name; const ct = (typeof col === 'string') ? 'std' : col.type; csv += `${bp};${clean(cn)};${clean(ct)};${tp}\n`; }); } else { csv += `${bp};;;${tp}\n`; } }); const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `Competitors_Ref.csv`; document.body.appendChild(a); a.click(); document.body.removeChild(a); };

    // --- ФУНКЦИИ ЛИФТА ---
    window.scrollToTop = () => { window.scrollTo({ top: 0, behavior: 'smooth' }); };
    window.scrollToBottom = () => { window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); };
    
    let isListView = false;
    const viewIcon = document.getElementById('view-mode-icon');
    window.toggleViewMode = () => {
        isListView = !isListView;
        const container = document.getElementById('competitors-grid');
        if (isListView) {
            container.classList.add('comp-list-mode');
            if(viewIcon) { viewIcon.classList.remove('bi-list-ul'); viewIcon.classList.add('bi-grid-fill'); }
        } else {
            container.classList.remove('comp-list-mode');
            if(viewIcon) { viewIcon.classList.remove('bi-grid-fill'); viewIcon.classList.add('bi-list-ul'); }
        }
    };

    loadList();
});
