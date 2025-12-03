document.addEventListener('DOMContentLoaded', () => {
    const API_URL = '/api/competitors-ref';
    
    // Элементы
    const gridContainer = document.getElementById('competitors-grid');
    const searchInput = document.getElementById('search-input');
    const filterType = document.getElementById('filter-type');
    const addBtn = document.getElementById('add-comp-btn');
    const exportBtn = document.getElementById('export-comp-btn');
    const dashboardContainer = document.getElementById('comp-dashboard');

    // Модалка
    const modalEl = document.getElementById('comp-modal');
    const modal = new bootstrap.Modal(modalEl, { backdrop: 'static', keyboard: false });
    const form = document.getElementById('comp-form');
    const modalTitle = document.getElementById('comp-modal-title');
    const delBtn = document.getElementById('btn-delete-comp');
    const saveBtn = document.getElementById('btn-save-comp'); // НОВАЯ КНОПКА

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

    // Настройки
    const collectionTypes = [
        { val: 'std', label: 'Стандарт', css: 'cb-std', dot: '#94a3b8' },
        { val: 'eng', label: 'Англ. Елка', css: 'cb-eng', dot: '#10b981' },
        { val: 'fr', label: 'Фр. Елка', css: 'cb-fr', dot: '#3b82f6' },
        { val: 'art', label: 'Художественный', css: 'cb-art', dot: '#f59e0b' },
        { val: 'art_eng', label: 'Худ. Англ.', css: 'cb-art', dot: '#d97706' },
        { val: 'art_fr', label: 'Худ. Фр.', css: 'cb-art', dot: '#7c3aed' },
        { val: 'mix', label: 'Худ. Микс', css: 'cb-art', dot: '#ef4444' }
    ];

    let competitors = [];
    let isSaving = false;

    // --- 1. ЗАГРУЗКА ---
    async function loadList() {
        try {
            const res = await fetch(API_URL);
            if(res.ok) {
                competitors = await res.json();
                competitors.sort((a, b) => a.name.localeCompare(b.name));
                renderDashboard();
                renderGrid();
            }
        } catch(e) { if(gridContainer) gridContainer.innerHTML = '<p class="text-danger p-5 text-center">Ошибка загрузки</p>'; }
    }

    // --- 2. ДАШБОРД ---
    function renderDashboard() {
        if (!dashboardContainer) return;
        const totalBrands = competitors.length;
        let totalCols = 0; let countEng = 0; let countFr = 0; let countArt = 0;
        competitors.forEach(c => {
            (c.collections || []).forEach(col => {
                totalCols++;
                const t = (typeof col === 'string') ? 'std' : (col.type || 'std');
                if (t.includes('eng')) countEng++;
                if (t.includes('fr') || t.includes('french')) countFr++;
                if (t.includes('art') || t.includes('mix')) countArt++;
            });
        });
        dashboardContainer.innerHTML = `
            <div class="col-xl-3 col-md-6"><div class="stat-card-modern"><div class="stat-icon-box bg-primary-subtle text-primary"><i class="bi bi-shop"></i></div><div class="stat-info"><h3>${totalBrands}</h3><p>Брендов</p></div></div></div>
            <div class="col-xl-3 col-md-6"><div class="stat-card-modern"><div class="stat-icon-box bg-secondary-subtle text-secondary"><i class="bi bi-collection"></i></div><div class="stat-info"><h3>${totalCols}</h3><p>Коллекций</p></div></div></div>
            <div class="col-xl-3 col-md-6"><div class="stat-card-modern"><div class="stat-icon-box bg-success-subtle text-success"><i class="bi bi-chevron-double-up"></i></div><div class="stat-info"><h3>${countEng + countFr}</h3><p>Елочка</p></div></div></div>
            <div class="col-xl-3 col-md-6"><div class="stat-card-modern"><div class="stat-icon-box bg-warning-subtle text-warning"><i class="bi bi-gem"></i></div><div class="stat-info"><h3>${countArt}</h3><p>Арт / Модуль</p></div></div></div>
        `;
    }

    // --- 3. РЕНДЕР СЕТКИ ---
    function renderGrid() {
        const search = searchInput ? searchInput.value.toLowerCase() : '';
        const filter = filterType ? filterType.value : 'all';
        const filtered = competitors.filter(c => {
            const matchSearch = !search || c.name.toLowerCase().includes(search) || (c.supplier || '').toLowerCase().includes(search) || (c.country || '').toLowerCase().includes(search);
            let matchFilter = true;
            if (filter !== 'all') { const typeKey = (filter === 'art') ? 'art' : filter; matchFilter = c.collections && c.collections.some(col => (col.type || 'std').includes(typeKey)); }
            return matchSearch && matchFilter;
        });

        if (filtered.length === 0) { gridContainer.innerHTML = '<div class="col-12 text-center text-muted mt-5">Ничего не найдено</div>'; return; }

        gridContainer.innerHTML = filtered.map(c => {
            const typesSet = new Set();
            (c.collections || []).forEach(col => {
                const t = (typeof col === 'string') ? 'std' : (col.type || 'std');
                if (t !== 'std') { if(t.includes('eng')) typesSet.add('eng'); else if(t.includes('fr')) typesSet.add('fr'); else if(t.includes('art') || t.includes('mix')) typesSet.add('art'); }
            });
            let badgesHtml = ''; typesSet.forEach(t => { const info = collectionTypes.find(x => x.val === t); if(info) badgesHtml += `<span class="c-badge ${info.css}">${info.label}</span>`; });
            if(!badgesHtml) badgesHtml = `<span class="c-badge cb-std">Стандарт</span>`;

            const listHtml = (c.collections || []).map(col => {
                const name = (typeof col === 'string') ? col : col.name;
                const type = (typeof col === 'string') ? 'std' : (col.type || 'std');
                let dotColor = '#94a3b8'; 
                if(type.includes('eng')) dotColor = '#10b981'; else if(type.includes('fr')) dotColor = '#3b82f6'; else if(type.includes('art')) dotColor = '#f59e0b';
                return `<div class="comp-list-item"><span><span class="comp-dot" style="background:${dotColor}"></span> ${name}</span></div>`;
            }).join('');

            return `<div class="col-xl-3 col-lg-4 col-md-6"><div class="comp-card-modern" id="card-${c.id}"><button class="btn-card-edit-abs" onclick="openEditModal('${c.id}')"><i class="bi bi-pencil-fill"></i></button><div class="comp-front"><span class="comp-flag">${c.country || 'Страна не указана'}</span><div class="comp-title">${c.name}</div><div class="comp-meta"><i class="bi bi-box-seam"></i> <span>${c.supplier || '-'}</span></div><div class="comp-meta"><i class="bi bi-geo-alt"></i> <span>${c.warehouse || '-'}</span></div><div class="comp-badges">${badgesHtml}</div><button class="btn-flip" onclick="toggleCard('${c.id}')">Коллекции (${(c.collections||[]).length}) <i class="bi bi-chevron-down ms-1"></i></button></div><div class="comp-back"><div class="d-flex justify-content-between align-items-center mb-2"><h6 class="fw-bold mb-0">Коллекции</h6><button class="btn-close-flip" onclick="toggleCard('${c.id}')"><i class="bi bi-x"></i></button></div><div class="comp-list-scroll">${listHtml || '<div class="text-center text-muted small mt-4">Пусто</div>'}</div></div></div></div>`;
        }).join('');
    }

    window.toggleCard = (id) => { const card = document.getElementById(`card-${id}`); if (card) { document.querySelectorAll('.comp-card-modern.is-flipped').forEach(c => { if(c !== card) c.classList.remove('is-flipped'); }); card.classList.toggle('is-flipped'); } };

    // --- 4. OPEN MODAL ---
    window.openEditModal = (id) => {
        const c = competitors.find(x => x.id === id); if (!c) return;
        inpId.value = c.id; modalTitle.textContent = `Редактировать: ${c.name}`; if(delBtn) delBtn.style.display = 'block';
        inpName.value = c.name; inpCountry.value = c.country || ''; inpSupplier.value = c.supplier || ''; inpWarehouse.value = c.warehouse || ''; inpInfo.value = c.info || ''; inpStorage.value = c.storage_days || ''; inpStock.value = c.stock_info || ''; inpReserve.value = c.reserve_days || '';
        collectionsContainer.innerHTML = ''; if (c.collections && c.collections.length > 0) { c.collections.forEach(col => { if (typeof col === 'string') addCollectionRow(col, 'std'); else addCollectionRow(col.name, col.type); }); } else { addCollectionRow(); }
        contactsContainer.innerHTML = ''; if (c.contacts && c.contacts.length > 0) { c.contacts.forEach(cnt => addContactRow(cnt.name, cnt.position, cnt.phone)); } else { addContactRow(); }
        modal.show();
    };

    if(addBtn) {
        addBtn.onclick = () => { inpId.value = ''; form.reset(); modalTitle.textContent = 'Новый Бренд'; if(delBtn) delBtn.style.display = 'none'; collectionsContainer.innerHTML = ''; contactsContainer.innerHTML = ''; addCollectionRow(); addContactRow(); modal.show(); };
    }

    // --- 5. ROWS ---
    function addCollectionRow(name = '', type = 'std') {
        const div = document.createElement('div'); div.className = 'competitor-entry'; div.style.gridTemplateColumns = "2fr 1.5fr auto"; 
        let options = collectionTypes.map(t => `<option value="${t.val}" ${t.val === type ? 'selected' : ''}>${t.label}</option>`).join('');
        div.innerHTML = `<input type="text" class="form-control" placeholder="Название коллекции" value="${name}" required><select class="form-select">${options}</select><button type="button" class="btn-remove-entry" onclick="this.closest('.competitor-entry').remove()"><i class="bi bi-x-lg"></i></button>`;
        collectionsContainer.appendChild(div);
    }
    function addContactRow(name='', pos='', phone='') {
        const div = document.createElement('div'); div.className = 'competitor-entry'; div.style.gridTemplateColumns = "1fr 1fr 1fr auto"; 
        div.innerHTML = `<input type="text" class="form-control" placeholder="Имя" value="${name}"><input type="text" class="form-control" placeholder="Должность" value="${pos}"><input type="text" class="form-control" placeholder="Телефон" value="${phone}"><button type="button" class="btn-remove-entry" onclick="this.closest('.competitor-entry').remove()"><i class="bi bi-x-lg"></i></button>`;
        contactsContainer.appendChild(div);
    }
    if(addCollRowBtn) addCollRowBtn.onclick = () => addCollectionRow();
    if(addContactBtn) addContactBtn.onclick = () => addContactRow();

    // --- 6. SAVE LOGIC (DIRECT CLICK FIX) ---
    if(saveBtn) {
        saveBtn.onclick = async () => {
            if(isSaving) return; 
            
            // Ручная валидация
            if(!inpName.value.trim()) { alert("Введите название бренда!"); return; }

            isSaving = true;
            const oldText = saveBtn.innerHTML; saveBtn.disabled = true; saveBtn.innerHTML = '...';

            const collectionsData = [];
            collectionsContainer.querySelectorAll('.competitor-entry').forEach(row => { const inputs = row.querySelectorAll('input, select'); const name = inputs[0].value.trim(); const type = inputs[1].value; if (name) collectionsData.push({ name, type }); });
            const contactsData = [];
            contactsContainer.querySelectorAll('.competitor-entry').forEach(row => { const inputs = row.querySelectorAll('input'); const name = inputs[0].value.trim(); const pos = inputs[1].value.trim(); const phone = inputs[2].value.trim(); if (name || phone) contactsData.push({ name, position: pos, phone }); });

            const data = {
                name: inpName.value, country: inpCountry ? inpCountry.value : '', supplier: inpSupplier.value, warehouse: inpWarehouse.value, info: inpInfo.value, storage_days: inpStorage.value, stock_info: inpStock.value, reserve_days: inpReserve.value,
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
            let csv = "\uFEFFБренд;Страна;Коллекция;Вид (Тип);Поставщик;Склад;Контакты;Инфо\n";
            competitors.forEach(c => {
                const contactsStr = (c.contacts || []).map(cnt => `${cnt.name} (${cnt.phone})`).join(', ');
                const brandPart = `${clean(c.name)};${clean(c.country)}`;
                const tailPart = `${clean(c.supplier)};${clean(c.warehouse)};${clean(contactsStr)};${clean(c.info)}`;
                if (c.collections && c.collections.length > 0) { c.collections.forEach(col => { const colName = (typeof col === 'string') ? col : col.name; const colTypeVal = (typeof col === 'string') ? 'std' : col.type; csv += `${brandPart};${clean(colName)};${clean(colTypeVal)};${tailPart}\n`; }); } else { csv += `${brandPart};;;${tailPart}\n`; }
            });
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `Competitors_Ref.csv`; document.body.appendChild(a); a.click(); document.body.removeChild(a);
        };
    }

    loadList();
});
