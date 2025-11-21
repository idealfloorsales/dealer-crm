document.addEventListener('DOMContentLoaded', () => {
    const API_URL = '/api/competitors-ref';
    
    // Элементы страницы
    const gridContainer = document.getElementById('competitors-grid');
    const searchInput = document.getElementById('search-input');
    const filterType = document.getElementById('filter-type');
    const addBtn = document.getElementById('add-comp-btn');

    // Модалка и Форма
    const modalEl = document.getElementById('comp-modal');
    const modal = new bootstrap.Modal(modalEl);
    const form = document.getElementById('comp-form');
    const modalTitle = document.getElementById('comp-modal-title');
    const delBtn = document.getElementById('btn-delete-comp');

    // Поля внутри модалки
    const collectionsContainer = document.getElementById('collections-container');
    const addCollRowBtn = document.getElementById('add-coll-row-btn');
    const contactsContainer = document.getElementById('comp-contacts-list');
    const addContactBtn = document.getElementById('btn-add-contact');

    const inpId = document.getElementById('comp_id');
    const inpName = document.getElementById('comp_name');
    const inpSupplier = document.getElementById('comp_supplier');
    const inpWarehouse = document.getElementById('comp_warehouse');
    const inpInfo = document.getElementById('comp_info');
    const inpStorage = document.getElementById('comp_storage');
    const inpStock = document.getElementById('comp_stock');
    const inpReserve = document.getElementById('comp_reserve');

    // Типы коллекций (Ваши цвета)
    const collectionTypes = [
        { val: 'std', label: 'Стандарт', class: 'type-std' },
        { val: 'eng', label: 'Англ. Елка', class: 'type-eng' },
        { val: 'fr', label: 'Фр. Елка', class: 'type-fr' },
        { val: 'art', label: 'Художественный', class: 'type-art' },
        { val: 'art_eng', label: 'Худ. Англ.', class: 'type-art-eng' },
        { val: 'art_fr', label: 'Худ. Фр.', class: 'type-art-fr' },
        { val: 'mix', label: 'Худ. Микс', class: 'type-mix' }
    ];

    let competitors = [];

    // --- ЗАГРУЗКА ---
    async function loadList() {
        try {
            const res = await fetch(API_URL);
            if(res.ok) {
                competitors = await res.json();
                renderGrid();
            }
        } catch(e) { gridContainer.innerHTML = '<p class="text-danger p-5 text-center">Ошибка загрузки</p>'; }
    }

    // --- РЕНДЕР СЕТКИ (ГЛАВНЫЙ ЭКРАН) ---
    function renderGrid() {
        const search = searchInput.value.toLowerCase();
        const filter = filterType.value;

        const filtered = competitors.filter(c => {
            // 1. Поиск
            const matchSearch = !search || 
                c.name.toLowerCase().includes(search) || 
                (c.supplier || '').toLowerCase().includes(search) ||
                (c.warehouse || '').toLowerCase().includes(search);
            
            // 2. Фильтр по типу (проверяем есть ли в коллекциях нужный тип)
            let matchFilter = true;
            if (filter === 'herringbone') {
                matchFilter = c.collections && c.collections.some(col => 
                    (col.type || '').includes('eng') || (col.type || '').includes('fr')
                );
            } else if (filter === 'artistic') {
                matchFilter = c.collections && c.collections.some(col => 
                    (col.type || '').includes('art')
                );
            }

            return matchSearch && matchFilter;
        });

        if (filtered.length === 0) {
            gridContainer.innerHTML = '<div class="col-12 text-center text-muted mt-5">Ничего не найдено</div>';
            return;
        }

        gridContainer.innerHTML = filtered.map(c => {
            // Подсветка наличия типов
            const hasEng = (c.collections||[]).some(col => (col.type||'').includes('eng'));
            const hasFr = (c.collections||[]).some(col => (col.type||'').includes('fr'));
            const hasArt = (c.collections||[]).some(col => (col.type||'').includes('art'));

            let badgesHtml = '';
            if(hasEng) badgesHtml += `<span class="badge rounded-pill bg-success bg-opacity-10 text-success border border-success me-1">🌲 Англ</span>`;
            if(hasFr) badgesHtml += `<span class="badge rounded-pill bg-primary bg-opacity-10 text-primary border border-primary me-1">🌊 Фр</span>`;
            if(hasArt) badgesHtml += `<span class="badge rounded-pill bg-warning bg-opacity-10 text-dark border border-warning">🎨 Арт</span>`;

            return `
            <div class="col-md-6 col-lg-4">
                <div class="comp-card" onclick="openEditModal('${c.id}')">
                    <div class="comp-card-title">${c.name}</div>
                    <div class="comp-card-supplier">
                        <i class="bi bi-box-seam me-1"></i> ${c.supplier || 'Нет поставщика'} <br>
                        <i class="bi bi-geo-alt me-1"></i> ${c.warehouse || 'Нет склада'}
                    </div>
                    <div class="comp-card-badges">
                        ${badgesHtml}
                    </div>
                </div>
            </div>`;
        }).join('');
    }

    // --- МОДАЛКА: ОТКРЫТИЕ ---
    window.openEditModal = (id) => {
        const c = competitors.find(x => x.id === id);
        if (!c) return;

        inpId.value = c.id;
        modalTitle.textContent = `Редактировать: ${c.name}`;
        delBtn.style.display = 'block';
        
        // Заполнение полей
        inpName.value = c.name;
        inpSupplier.value = c.supplier || '';
        inpWarehouse.value = c.warehouse || '';
        inpInfo.value = c.info || '';
        inpStorage.value = c.storage_days || '';
        inpStock.value = c.stock_info || '';
        inpReserve.value = c.reserve_days || '';

        // Коллекции
        collectionsContainer.innerHTML = '';
        if (c.collections && c.collections.length > 0) {
            c.collections.forEach(col => {
                if (typeof col === 'string') addCollectionRow(col, 'std');
                else addCollectionRow(col.name, col.type);
            });
        } else {
            addCollectionRow(); // Пустая строка если нет
        }

        // Контакты
        contactsContainer.innerHTML = '';
        if (c.contacts && c.contacts.length > 0) {
            c.contacts.forEach(cnt => addContactRow(cnt.name, cnt.position, cnt.phone));
        } else {
            addContactRow(); // Пустая строка
        }

        modal.show();
    };

    // --- МОДАЛКА: ДОБАВЛЕНИЕ ---
    addBtn.onclick = () => {
        inpId.value = '';
        form.reset();
        modalTitle.textContent = 'Новый Бренд';
        delBtn.style.display = 'none';
        
        collectionsContainer.innerHTML = '';
        contactsContainer.innerHTML = '';
        addCollectionRow();
        addContactRow();

        modal.show();
    };

    // --- КОНСТРУКТОР ФОРМ ---
    function addCollectionRow(name = '', type = 'std') {
        const div = document.createElement('div');
        div.className = 'input-group mb-2 collection-row';
        let options = collectionTypes.map(t => `<option value="${t.val}" ${t.val === type ? 'selected' : ''}>${t.label}</option>`).join('');
        div.innerHTML = `
            <input type="text" class="form-control coll-name" placeholder="Название" value="${name}" required>
            <select class="form-select coll-type" style="max-width: 150px;">${options}</select>
            <button type="button" class="btn btn-outline-danger" onclick="this.parentElement.remove()">×</button>
        `;
        collectionsContainer.appendChild(div);
    }

    function addContactRow(name='', pos='', phone='') {
        const div = document.createElement('div');
        div.className = 'comp-contact-row mb-2'; 
        // Используем тот же класс CSS или inline-стиль для грида
        div.style.display = 'grid';
        div.style.gridTemplateColumns = '1fr 1fr 1fr auto';
        div.style.gap = '5px';
        
        div.innerHTML = `
            <input type="text" class="form-control cont-name" placeholder="Имя" value="${name}">
            <input type="text" class="form-control cont-pos" placeholder="Должность" value="${pos}">
            <input type="text" class="form-control cont-phone" placeholder="Телефон" value="${phone}">
            <button type="button" class="btn btn-outline-danger" onclick="this.parentElement.remove()">×</button>
        `;
        contactsContainer.appendChild(div);
    }

    addCollRowBtn.onclick = () => addCollectionRow();
    addContactBtn.onclick = () => addContactRow();

    // --- СОХРАНЕНИЕ ---
    form.onsubmit = async (e) => {
        e.preventDefault();
        
        const collectionsData = [];
        document.querySelectorAll('.collection-row').forEach(row => {
            const name = row.querySelector('.coll-name').value.trim();
            const type = row.querySelector('.coll-type').value;
            if (name) collectionsData.push({ name, type });
        });

        const contactsData = [];
        document.querySelectorAll('.comp-contact-row').forEach(row => {
            const name = row.querySelector('.cont-name').value.trim();
            const pos = row.querySelector('.cont-pos').value.trim();
            const phone = row.querySelector('.cont-phone').value.trim();
            if (name || phone) contactsData.push({ name, position: pos, phone });
        });

        const data = {
            name: inpName.value,
            supplier: inpSupplier.value,
            warehouse: inpWarehouse.value,
            info: inpInfo.value,
            storage_days: inpStorage.value,
            stock_info: inpStock.value,
            reserve_days: inpReserve.value,
            collections: collectionsData,
            contacts: contactsData
        };

        const id = inpId.value;
        let url = API_URL;
        let method = 'POST';
        if (id) { url = `${API_URL}/${id}`; method = 'PUT'; }

        try {
            const res = await fetch(url, { method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) });
            if (res.ok) {
                await loadList();
                modal.hide();
            }
        } catch (e) { alert('Ошибка сохранения'); }
    };

    // --- УДАЛЕНИЕ ---
    delBtn.onclick = async () => {
        const id = inpId.value;
        if (!id) return;
        if (confirm('Удалить этот бренд?')) {
            await fetch(`${API_URL}/${id}`, { method: 'DELETE' });
            modal.hide();
            loadList();
        }
    };

    // --- СОБЫТИЯ ПОИСКА ---
    searchInput.addEventListener('input', renderGrid);
    filterType.addEventListener('change', renderGrid);

    loadList();
});
