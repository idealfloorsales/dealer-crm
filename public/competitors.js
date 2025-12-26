document.addEventListener('DOMContentLoaded', () => {
    const API_URL = '/api/competitors-ref';
    
    // --- АВТО-ИСПРАВЛЕНИЕ СТИЛЕЙ (Чтобы не лезть в HTML) ---
    const styleFix = document.createElement('style');
    styleFix.innerHTML = `
        /* Скрываем карандаш, когда карточка перевернута (чтобы не мешал крестику) */
        .comp-card-modern.is-flipped .btn-card-edit-abs { display: none !important; }
        /* Цвета для своих типов коллекций */
        .cb-custom { background-color: #e0cffc; color: #5b21b6; border: 1px solid #d8b4fe; }
    `;
    document.head.appendChild(styleFix);
    // -------------------------------------------------------

    // Элементы
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

    const form = document.getElementById('comp-form');
    const modalTitle = document.getElementById('comp-modal-title');
    const delBtn = document.getElementById('btn-delete-comp');
    const saveBtn = document.getElementById('btn-save-comp');

    // Контейнеры
    const collectionsContainer = document.getElementById('collections-container');
    const addCollRowBtn = document.getElementById('add-coll-row-btn');
    const contactsContainer = document.getElementById('comp-contacts-list');
    const addContactBtn = document.getElementById('btn-add-contact');

    // Инпуты
    const inpId = document.getElementById('comp_id');
    const inpName = document.getElementById('comp_name');
    const inpCountry = document.getElementById('comp_country');
    const inpSupplier = document.getElementById('comp_supplier');
    const inpWarehouse = document.getElementById('comp_warehouse');
    const inpInfo = document.getElementById('comp_info');
    const inpStorage = document.getElementById('comp_storage');
    const inpStock = document.getElementById('comp_stock');
    const inpReserve = document.getElementById('comp_reserve');
    const inpWebsite = document.getElementById('comp_website');     // Новое поле
    const inpInstagram = document.getElementById('comp_instagram'); // Новое поле

    // Базовые типы
    const defaultTypes = [
        { val: 'std', label: 'Стандарт', css: 'cb-std', dot: '#94a3b8' },
        { val: 'eng', label: 'Англ. Елка', css: 'cb-eng', dot: '#10b981' },
        { val: 'fr', label: 'Фр. Елка', css: 'cb-fr', dot: '#3b82f6' },
        { val: 'art', label: 'Художественный', css: 'cb-art', dot: '#f59e0b' },
        { val: 'mix', label: 'Худ. Микс', css: 'cb-art', dot: '#ef4444' }
    ];

    let competitors = [];
    let isSaving = false;
    let dynamicTypes = [];

    // --- 1. ЗАГРУЗКА ---
    async function loadList() {
        try {
            const res = await fetch(API_URL);
            if(!res.ok) throw new Error(`Сервер ответил ошибкой: ${res.status}`);
            
            competitors = await res.json();
            competitors.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            
            refreshDynamicTypes();
            updateFilterOptions();
            renderDashboard();
            renderGrid();
        } catch(e) { 
            console.error("ERROR:", e);
            if(gridContainer) gridContainer.innerHTML = `<div class="alert alert-danger text-center m-5 shadow-sm">
                <h4 class="alert-heading"><i class="bi bi-exclamation-triangle-fill"></i> Ошибка загрузки</h4>
                <p>Не удалось получить данные. ${e.message}</p>
            </div>`; 
        }
    }

    function refreshDynamicTypes() {
        const found = new Set();
        competitors.forEach(c => {
            (c.collections || []).forEach(col => {
                const t = (typeof col === 'string') ? 'std' : (col.type || 'std');
                if (!defaultTypes.find(x => x.val === t)) { found.add(t); }
            });
        });
        
        dynamicTypes = Array.from(found).map(t => ({ val: t, label: t, css: 'cb-custom', dot: '#8b5cf6' }));
        dynamicTypes.sort((a,b) => a.label.localeCompare(b.label));
    }

    function getAllTypes() { return [...defaultTypes, ...dynamicTypes]; }

    function updateFilterOptions() {
        if(!filterType) return;
        const currentVal = filterType.value;
        let html = `<option value="all">Все типы коллекций</option>`;
        defaultTypes.forEach(t => { if(t.val !== 'std') html += `<option value="${t.val}">${t.label}</option>`; });
        if(dynamicTypes.length > 0) {
            html += `<optgroup label="Пользовательские">`;
            dynamicTypes.forEach(t => html += `<option value="${t.val}">${t.label}</option>`);
            html += `</optgroup>`;
        }
        filterType.innerHTML = html;
        if (currentVal !== 'all' && !getAllTypes().find(t => t.val === currentVal)) filterType.value = 'all';
        else filterType.value = currentVal;
    }

    // --- 2. ДАШБОРД ---
    function renderDashboard() {
        if (!dashboardContainer) return;
        const totalBrands = competitors.length;
        let totalCols = 0;
        let countEng = 0; let countFr = 0; let countArt = 0; let countCustom = 0;

        competitors.forEach(c => {
            (c.collections || []).forEach(col => {
                totalCols++;
                const t = (typeof col === 'string') ? 'std' : (col.type || 'std');
                if (t.includes('eng')) countEng++;
                else if (t.includes('fr')) countFr++;
                else if (t.includes('art') || t.includes('mix')) countArt++;
                else if (t !== 'std') countCustom++; 
            });
        });
        
        dashboardContainer.innerHTML = `
            <div class="col-xl-3 col-md-6"><div class="stat-card-modern"><div class="stat-icon-box bg-primary-subtle text-primary"><i class="bi bi-shop"></i></div><div class="stat-info"><h3>${totalBrands}</h3><p>Брендов</p></div></div></div>
            <div class="col-xl-3 col-md-6"><div class="stat-card-modern"><div class="stat-icon-box bg-secondary-subtle text-secondary"><i class="bi bi-collection"></i></div><div class="stat-info"><h3>${totalCols}</h3><p>Коллекций</p></div></div></div>
            <div class="col-xl-3 col-md-6"><div class="stat-card-modern"><div class="stat-icon-box bg-success-subtle text-success"><i class="bi bi-chevron-double-up"></i></div><div class="stat-info"><h3>${countEng + countFr}</h3><p>Елочка</p></div></div></div>
            <div class="col-xl-3 col-md-6"><div class="stat-card-modern"><div class="stat-icon-box bg-info-subtle text-info"><i class="bi bi-stars"></i></div><div class="stat-info"><h3>${countCustom + countArt}</h3><p>Арт / Другое</p></div></div></div>
        `;
    }

    // --- 3. УПРАВЛЕНИЕ ТИПАМИ ---
    if(btnManageTypes) btnManageTypes.onclick = () => { renderTypesManager(); typesModal.show(); };

    function renderTypesManager() {
        if(!typesListContainer) return;
        if(dynamicTypes.length === 0) { typesListContainer.innerHTML = '<div class="text-center text-muted py-4">Нет пользовательских типов.<br>Создайте их при добавлении коллекции.</div>'; return; }
        typesListContainer.innerHTML = dynamicTypes.map(t => `
            <div class="list-group-item d-flex justify-content-between align-items-center">
                <span class="badge ${t.css} fs-6">${t.label}</span>
                <div><button class="btn btn-sm btn-light border me-1" onclick="renameCustomType('${t.val}')"><i class="bi bi-pencil"></i></button><button class="btn btn-sm btn-light text-danger border" onclick="deleteCustomType('${t.val}')"><i class="bi bi-trash"></i></button></div>
            </div>`).join('');
    }

    window.renameCustomType = async (oldName) => {
        const newName = prompt(`Введите новое название для "${oldName}":`, oldName);
        if (!newName || newName.trim() === '' || newName === oldName) return;
        const cleanName = newName.trim();
        if (defaultTypes.find(t => t.val === cleanName)) { alert("Это имя занято системным типом."); return; }
        if(!confirm(`Это изменит тип во всех коллекциях. Продолжить?`)) return;
        const promises = [];
        competitors.forEach(c => {
            let changed = false;
            const newCols = (c.collections || []).map(col => {
                const t = (typeof col === 'string') ? 'std' : (col.type || 'std');
                if (t === oldName) { changed = true; return { name: (typeof col === 'string' ? col : col.name), type: cleanName }; }
                return col;
            });
            if (changed) { const data = { ...c, collections: newCols }; promises.push(fetch(`${API_URL}/${c.id}`, { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) })); }
        });
        if (promises.length > 0) { typesModal.hide(); await Promise.all(promises); await loadList(); alert("Успешно переименовано!"); }
    };

    window.deleteCustomType = async (typeName) => {
        if(!confirm(`Удалить тип "${typeName}"? Он будет заменен на "Стандарт".`)) return;
        const promises = [];
        competitors.forEach(c => {
            let changed = false;
            const newCols = (c.collections || []).map(col => {
                const t = (typeof col === 'string') ? 'std' : (col.type || 'std');
                if (t === typeName) { changed = true; return { name: (typeof col === 'string' ? col : col.name), type: 'std' }; }
                return col;
            });
            if (changed) { const data = { ...c, collections: newCols }; promises.push(fetch(`${API_URL}/${c.id}`, { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) })); }
        });
        if (promises.length > 0) { typesModal.hide(); await Promise.all(promises); await loadList(); alert("Тип удален!"); } else { await loadList(); }
    };

    // --- 4. РЕНДЕР СЕТКИ ---
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

            // SOCIAL ICONS
            let socialHtml = '';
            if(c.website) {
                let webUrl = c.website;
                if(!webUrl.startsWith('http')) webUrl = 'http://' + webUrl;
                socialHtml += `<a href="${webUrl}" target="_blank" class="btn btn-sm btn-light text-primary border me-1" title="Сайт" onclick="event.stopPropagation()"><i class="bi bi-globe"></i></a>`;
            }
            if(c.instagram) {
                let instaUrl = c.instagram;
                if(!instaUrl.startsWith('http')) instaUrl = 'https://instagram.com/' + instaUrl.replace('@','').trim();
                socialHtml += `<a href="${instaUrl}" target="_blank" class="btn btn-sm btn-light text-danger border" title="Instagram" onclick="event.stopPropagation()"><i class="bi bi-instagram"></i></a>`;
            }
            
            // ДОБАВЛЕН КЛАСС mb-2 ДЛЯ ОТСТУПА
            const socialBlock = socialHtml ? `<div class="mt-2 pt-2 border-top mb-2">${socialHtml}</div>` : '';

            const listHtml = (c.collections || []).map(col => {
                const name = (typeof col === 'string') ? col : col.name;
                const type = (typeof col === 'string') ? 'std' : (col.type || 'std');
                const info = allTypesList.find(x => x.val === type) || { dot: '#8b5cf6' };
                return `<div class="comp-list-item"><span><span class="comp-dot" style="background:${info.dot}"></span> ${name}</span></div>`;
            }).join('');

            return `<div class="col-xl-3 col-lg-4 col-md-6"><div class="comp-card-modern" id="card-${c.id}"><button class="btn-card-edit-abs" onclick="openEditModal('${c.id}')"><i class="bi bi-pencil-fill"></i></button><div class="comp-front"><span class="comp-flag">${c.country || 'Страна не указана'}</span><div class="comp-title">${c.name}</div><div class="comp-meta"><i class="bi bi-box-seam"></i> <span>${c.supplier || '-'}</span></div><div class="comp-meta"><i class="bi bi-geo-alt"></i> <span>${c.warehouse || '-'}</span></div>${socialBlock}<div class="comp-badges">${badgesHtml}</div><button class="btn-flip" onclick="toggleCard('${c.id}')">Коллекции (${(c.collections||[]).length}) <i class="bi bi-chevron-down ms-1"></i></button></div><div class="comp-back"><div class="d-flex justify-content-between align-items-center mb-2"><h6 class="fw-bold mb-0">Коллекции</h6><button class="btn-close-flip" onclick="toggleCard('${c.id}')"><i class="bi bi-x"></i></button></div><div class="comp-list-scroll">${listHtml || '<div class="text-center text-muted small mt-4">Пусто</div>'}</div></div></div></div>`;
        }).join('');
    }

    window.toggleCard = (id) => { const card = document.getElementById(`card-${id}`); if (card) { document.querySelectorAll('.comp-card-modern.is-flipped').forEach(c => { if(c !== card) c.classList.remove('is-flipped'); }); card.classList.toggle('is-flipped'); } };

    // --- 5. OPEN MODAL ---
    window.openEditModal = (id) => {
        const c = competitors.find(x => x.id === id); if (!c) return;
        inpId.value = c.id; modalTitle.textContent = `Редактировать: ${c.name}`; if(delBtn) delBtn.style.display = 'block';
        inpName.value = c.name; inpCountry.value = c.country || ''; inpSupplier.value = c.supplier || ''; inpWarehouse.value = c.warehouse || ''; inpInfo.value = c.info || ''; inpStorage.value = c.storage_days || ''; inpStock.value = c.stock_info || ''; inpReserve.value = c.reserve_days || '';
        
        if(inpWebsite) inpWebsite.value = c.website || '';
        if(inpInstagram) inpInstagram.value = c.instagram || '';

        collectionsContainer.innerHTML = ''; if (c.collections && c.collections.length > 0) { c.collections.forEach(col => { if (typeof col === 'string') addCollectionRow(col, 'std'); else addCollectionRow(col.name, col.type); }); } else { addCollectionRow(); }
        contactsContainer.innerHTML = ''; if (c.contacts && c.contacts.length > 0) { c.contacts.forEach(cnt => addContactRow(cnt.name, cnt.position, cnt.phone)); } else { addContactRow(); }
        modal.show();
    };

    if(addBtn) {
        addBtn.onclick = () => { inpId.value = ''; form.reset(); modalTitle.textContent = 'Новый Бренд'; if(delBtn) delBtn.style.display = 'none'; collectionsContainer.innerHTML = ''; contactsContainer.innerHTML = ''; addCollectionRow(); addContactRow(); modal.show(); };
    }

    // --- 6. ROWS ---
    function addCollectionRow(name = '', type = 'std') {
        const div = document.createElement('div'); div.className = 'competitor-entry'; div.style.gridTemplateColumns = "2fr 1.5fr auto"; 
        const allTypes = getAllTypes();
        let options = allTypes.map(t => `<option value="${t.val}" ${t.val === type ? 'selected' : ''}>${t.label}</option>`).join('');
        options += `<option value="__NEW__" class="fw-bold text-primary">+ Свой тип...</option>`;
        div.innerHTML = `<input type="text" class="form-control" placeholder="Название коллекции" value="${name}" required><select class="form-select collection-type-select">${options}</select><button type="button" class="btn-remove-entry" onclick="this.closest('.competitor-entry').remove()"><i class="bi bi-x-lg"></i></button>`;
        const select = div.querySelector('select');
        select.onchange = function() {
            if (this.value === '__NEW__') {
                const newName = prompt("Введите название нового типа (например, Кварцвинил):");
                if (newName && newName.trim()) {
                    const cleanName = newName.trim();
                    const newOpt = document.createElement('option');
                    newOpt.value = cleanName; newOpt.text = cleanName; newOpt.selected = true;
                    this.insertBefore(newOpt, this.lastElementChild);
                    this.value = cleanName; 
                } else { this.value = 'std'; }
            }
        };
        collectionsContainer.appendChild(div);
    }

    function addContactRow(name='', pos='', phone='') {
        const div = document.createElement('div'); div.className = 'competitor-entry'; div.style.gridTemplateColumns = "1fr 1fr 1fr auto"; 
        div.innerHTML = `<input type="text" class="form-control" placeholder="Имя" value="${name}"><input type="text" class="form-control" placeholder="Должность" value="${pos}"><input type="text" class="form-control" placeholder="Телефон" value="${phone}"><button type="button" class="btn-remove-entry" onclick="this.closest('.competitor-entry').remove()"><i class="bi bi-x-lg"></i></button>`;
        contactsContainer.appendChild(div);
    }
    if(addCollRowBtn) addCollRowBtn.onclick = () => addCollectionRow();
    if(addContactBtn) addContactBtn.onclick = () => addContactRow();

    // --- 7. SAVE LOGIC ---
    if(saveBtn) {
        saveBtn.onclick = async () => {
            if(isSaving) return; 
            if(!inpName.value.trim()) { alert("Введите название бренда!"); return; }

            isSaving = true;
            const oldText = saveBtn.innerHTML; saveBtn.disabled = true; saveBtn.innerHTML = '...';

            const collectionsData = [];
            collectionsContainer.querySelectorAll('.competitor-entry').forEach(row => { const inputs = row.querySelectorAll('input, select'); const name = inputs[0].value.trim(); const type = inputs[1].value; if (name) collectionsData.push({ name, type }); });
            const contactsData = [];
            contactsContainer.querySelectorAll('.competitor-entry').forEach(row => { const inputs = row.querySelectorAll('input'); const name = inputs[0].value.trim(); const pos = inputs[1].value.trim(); const phone = inputs[2].value.trim(); if (name || phone) contactsData.push({ name, position: pos, phone }); });

            const data = {
                name: inpName.value, 
                country: inpCountry ? inpCountry.value : '', 
                supplier: inpSupplier.value, 
                warehouse: inpWarehouse.value, 
                website: inpWebsite ? inpWebsite.value : '',     
                instagram: inpInstagram ? inpInstagram.value : '', 
                info: inpInfo.value, 
                storage_days: inpStorage.value, 
                stock_info: inpStock.value, 
                reserve_days: inpReserve.value,
                collections: collectionsData, contacts: contactsData
            };

            const id = inpId.value;
            let url = API_URL; let method = 'POST';
            if (id) { url = `${API_URL}/${id}`; method = 'PUT'; }

            try {
                const res = await fetch(url, { method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) });
                if (res.ok) { await loadList(); modal.hide(); } else { alert("Ошибка сохранения"); }
            } catch (e) { alert('Ошибка сети'); }
            finally { isSaving = false; saveBtn.disabled = false; saveBtn.innerHTML = oldText; }
        };
    }

    if(delBtn) { delBtn.onclick = async () => { const id = inpId.value; if (!id) return; if (confirm('Удалить этот бренд?')) { await fetch(`${API_URL}/${id}`, { method: 'DELETE' }); modal.hide(); loadList(); } }; }
    if(searchInput) searchInput.addEventListener('input', renderGrid);
    if(filterType) filterType.addEventListener('change', renderGrid);

    if(exportBtn) {
        exportBtn.onclick = () => {
            if (!competitors.length) return alert("Список пуст");
            const clean = (text) => `"${String(text || '').replace(/"/g, '""')}"`;
            let csv = "\uFEFFБренд;Страна;Коллекция;Вид (Тип);Поставщик;Склад;Контакты;Сайт;Instagram;Инфо\n";
            competitors.forEach(c => {
                const contactsStr = (c.contacts || []).map(cnt => `${cnt.name} (${cnt.phone})`).join(', ');
                const brandPart = `${clean(c.name)};${clean(c.country)}`;
                const tailPart = `${clean(c.supplier)};${clean(c.warehouse)};${clean(contactsStr)};${clean(c.website)};${clean(c.instagram)};${clean(c.info)}`;
                if (c.collections && c.collections.length > 0) { c.collections.forEach(col => { const colName = (typeof col === 'string') ? col : col.name; const colTypeVal = (typeof col === 'string') ? 'std' : col.type; csv += `${brandPart};${clean(colName)};${clean(colTypeVal)};${tailPart}\n`; }); } else { csv += `${brandPart};;;${tailPart}\n`; }
            });
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `Competitors_Ref.csv`; document.body.appendChild(a); a.click(); document.body.removeChild(a);
        };
    }

    loadList();
});
