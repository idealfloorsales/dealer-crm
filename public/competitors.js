```javascript
// competitors.js
document.addEventListener('DOMContentLoaded', () => {
    const API_URL = '/api/competitors-ref';
    
    // Элементы
    const listContainer = document.getElementById('competitors-list');
    const detailsCard = document.getElementById('comp-details-card');
    const emptyMsg = document.getElementById('empty-msg');
    const addBtn = document.getElementById('add-comp-btn');
    const delBtn = document.getElementById('btn-delete-comp');
    const exportBtn = document.getElementById('export-comp-btn'); // (НОВОЕ)
    const form = document.getElementById('comp-form');

    // Элементы поиска
    const searchInput = document.getElementById('search-input');
    const filterType = document.getElementById('filter-type');
    const gridContainer = document.getElementById('competitors-grid');

    // Модалка
    const modalEl = document.getElementById('comp-modal');
    const modal = new bootstrap.Modal(modalEl);
    const modalTitle = document.getElementById('comp-modal-title');

    // Поля формы
    const inpId = document.getElementById('comp_id');
    const inpName = document.getElementById('comp_name');
    const inpSupplier = document.getElementById('comp_supplier');
    const inpWarehouse = document.getElementById('comp_warehouse');
    const inpInfo = document.getElementById('comp_info');
    const inpStorage = document.getElementById('comp_storage');
    const inpStock = document.getElementById('comp_stock');
    const inpReserve = document.getElementById('comp_reserve');
    
    const collectionsContainer = document.getElementById('collections-container');
    const addCollRowBtn = document.getElementById('add-coll-row-btn');
    const contactsContainer = document.getElementById('comp-contacts-list');
    const addContactBtn = document.getElementById('btn-add-contact');

    // Словарь типов для перевода
    const collectionTypesMap = {
        'std': 'Стандарт',
        'eng': 'Англ. Елка',
        'fr': 'Фр. Елка',
        'art': 'Художественный',
        'art_eng': 'Худ. Англ.',
        'art_fr': 'Худ. Фр.',
        'mix': 'Худ. Микс'
    };

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

    async function loadList() {
        try {
            const res = await fetch(API_URL);
            if(res.ok) {
                competitors = await res.json();
                renderGrid(); // Используем функцию рендера для страницы картотеки
            }
        } catch(e) { console.error(e); }
    }

    function renderGrid() {
        if(!gridContainer) return; // Защита если мы на другой странице

        const search = searchInput ? searchInput.value.toLowerCase() : '';
        const filter = filterType ? filterType.value : 'all';

        const filtered = competitors.filter(c => {
            const matchSearch = !search || 
                c.name.toLowerCase().includes(search) || 
                (c.supplier || '').toLowerCase().includes(search);
            
            let matchFilter = true;
            if (filter !== 'all') {
                matchFilter = c.collections && c.collections.some(col => {
                    const type = (typeof col === 'string') ? 'std' : (col.type || 'std');
                    return type === filter;
                });
            }
            return matchSearch && matchFilter;
        });

        if (filtered.length === 0) {
            gridContainer.innerHTML = '<div class="col-12 text-center text-muted mt-5">Ничего не найдено</div>';
            return;
        }

        gridContainer.innerHTML = filtered.map(c => {
            // Бейджи
            const typesSet = new Set();
            (c.collections || []).forEach(col => {
                const t = (typeof col === 'string') ? 'std' : (col.type || 'std');
                if (t !== 'std') typesSet.add(t);
            });
            let badgesHtml = '';
            typesSet.forEach(type => {
                const typeInfo = collectionTypes.find(x => x.val === type);
                if (typeInfo) badgesHtml += `<span class="col-badge ${typeInfo.class}" style="font-size: 0.7rem;">${typeInfo.label}</span>`;
            });

            return `
            <div class="col-md-6 col-lg-4 col-xl-3">
                <div class="comp-card" id="card-${c.id}" onclick="toggleCard('${c.id}')">
                    <button class="btn-card-edit" onclick="event.stopPropagation(); openEditModal('${c.id}')" title="Редактировать"><i class="bi bi-pencil"></i></button>
                    <div class="comp-card-front">
                        <h5 class="comp-card-title text-truncate">${c.name}</h5>
                        <div class="comp-card-supplier text-muted mb-2">
                            <i class="bi bi-box-seam me-1"></i> ${c.supplier || '-'}<br>
                            <i class="bi bi-geo-alt me-1"></i> ${c.warehouse || '-'}
                        </div>
                        <div class="mt-auto">${badgesHtml}<div class="text-primary small mt-2 fw-bold"><i class="bi bi-list-ul"></i> Показать коллекции (${(c.collections || []).length})</div></div>
                    </div>
                    <div class="comp-card-back">
                        <div class="d-flex justify-content-between align-items-center mb-2">
                            <h6 class="mb-0 fw-bold text-truncate">${c.name}</h6>
                            <button class="btn btn-sm btn-close" onclick="event.stopPropagation(); toggleCard('${c.id}')"></button>
                        </div>
                        <div class="comp-card-list">
                            ${(c.collections || []).map(col => {
                                const name = (typeof col === 'string') ? col : col.name;
                                const type = (typeof col === 'string') ? 'std' : (col.type || 'std');
                                const typeInfo = collectionTypes.find(x => x.val === type) || collectionTypes[0];
                                return `<div class="comp-collection-item"><span>${name}</span><span class="badge rounded-pill text-dark" style="font-size:0.65rem; border:1px solid #eee; background-color:#f8f9fa">${typeInfo.label}</span></div>`;
                            }).join('') || '<p class="text-center small text-muted">Пусто</p>'}
                        </div>
                    </div>
                </div>
            </div>`;
        }).join('');
    }

    window.toggleCard = (id) => {
        const card = document.getElementById(`card-${id}`);
        if (card) {
            document.querySelectorAll('.comp-card.show-collections').forEach(c => { if(c !== card) c.classList.remove('show-collections'); });
            card.classList.toggle('show-collections');
        }
    };

    window.openEditModal = (id) => {
        const c = competitors.find(x => x.id === id);
        if (!c) return;

        inpId.value = c.id;
        modalTitle.textContent = `${c.name}`;
        delBtn.style.display = 'block';
        
        inpName.value = c.name;
        inpSupplier.value = c.supplier || '';
        inpWarehouse.value = c.warehouse || '';
        inpInfo.value = c.info || '';
        inpStorage.value = c.storage_days || '';
        inpStock.value = c.stock_info || '';
        inpReserve.value = c.reserve_days || '';

        collectionsContainer.innerHTML = '';
        if (c.collections && c.collections.length > 0) {
            c.collections.forEach(col => {
                if (typeof col === 'string') addCollectionRow(col, 'std');
                else addCollectionRow(col.name, col.type);
            });
        } else { addCollectionRow(); }

        contactsContainer.innerHTML = '';
        if (c.contacts && c.contacts.length > 0) {
            c.contacts.forEach(cnt => addContactRow(cnt.name, cnt.position, cnt.phone));
        } else { addContactRow(); }

        modal.show();
    };

    if(addBtn) addBtn.onclick = () => {
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

    function addCollectionRow(name = '', type = 'std') {
        const div = document.createElement('div');
        div.className = 'input-group mb-2 collection-row';
        let options = collectionTypes.map(t => `<option value="${t.val}" ${t.val === type ? 'selected' : ''}>${t.label}</option>`).join('');
        div.innerHTML = `
            <input type="text" class="form-control coll-name" placeholder="Коллекция" value="${name}" required>
            <select class="form-select coll-type" style="max-width: 160px;">${options}</select>
            <button type="button" class="btn btn-outline-danger" onclick="this.parentElement.remove()"><i class="bi bi-x-lg"></i></button>
        `;
        collectionsContainer.appendChild(div);
    }

    function addContactRow(name='', pos='', phone='') {
        const div = document.createElement('div');
        div.className = 'comp-contact-row mb-2'; 
        div.style.display = 'grid';
        div.style.gridTemplateColumns = '1fr 1fr 1fr auto';
        div.style.gap = '5px';
        div.innerHTML = `
            <input type="text" class="form-control cont-name" placeholder="Имя" value="${name}">
            <input type="text" class="form-control cont-pos" placeholder="Должность" value="${pos}">
            <input type="text" class="form-control cont-phone" placeholder="Телефон" value="${phone}">
            <button type="button" class="btn btn-outline-danger" onclick="this.parentElement.remove()"><i class="bi bi-x-lg"></i></button>
        `;
        contactsContainer.appendChild(div);
    }

    if(addCollRowBtn) addCollRowBtn.onclick = () => addCollectionRow();
    if(addContactBtn) addContactBtn.onclick = () => addContactRow();

    if(form) form.onsubmit = async (e) => {
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
            name: inpName.value, supplier: inpSupplier.value, warehouse: inpWarehouse.value, info: inpInfo.value,
            storage_days: inpStorage.value, stock_info: inpStock.value, reserve_days: inpReserve.value,
            collections: collectionsData, contacts: contactsData
        };
        const id = inpId.value;
        let url = API_URL; let method = 'POST'; if (id) { url = `${API_URL}/${id}`; method = 'PUT'; }
        try {
            const res = await fetch(url, { method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) });
            if (res.ok) { await loadList(); modal.hide(); }
        } catch (e) { alert('Ошибка сохранения'); }
    };

    if(delBtn) delBtn.onclick = async () => {
        const id = inpId.value; if (!id) return;
        if (confirm('Удалить этот бренд?')) {
            await fetch(`${API_URL}/${id}`, { method: 'DELETE' });
            modal.hide(); loadList();
        }
    };

    if(searchInput) searchInput.addEventListener('input', renderGrid);
    if(filterType) filterType.addEventListener('change', renderGrid);

    // --- (НОВОЕ) ЭКСПОРТ В EXCEL (CSV) ---
    if(exportBtn) {
        exportBtn.onclick = () => {
            if (!competitors.length) return alert("Список пуст");

            // Функция экранирования для CSV
            const clean = (text) => `"${String(text || '').replace(/"/g, '""')}"`;

            // Заголовки
            let csv = "\uFEFFБренд;Коллекция;Вид;Поставщик;Контакты\n";

            competitors.forEach(c => {
                // 1. Строка Бренда
                const contactsStr = (c.contacts || []).map(cnt => `${cnt.name} (${cnt.phone})`).join(', ');
                csv += `${clean(c.name)};;;${clean(c.supplier)};${clean(contactsStr)}\n`;

                // 2. Строки Коллекций (под брендом)
                if (c.collections && c.collections.length > 0) {
                    c.collections.forEach(col => {
                        const colName = (typeof col === 'string') ? col : col.name;
                        const colTypeVal = (typeof col === 'string') ? 'std' : col.type;
                        const colTypeLabel = collectionTypesMap[colTypeVal] || colTypeVal;

                        // Структура: Пусто; Имя коллекции; Тип; Пусто; Пусто
                        csv += `;${clean(colName)};${clean(colTypeLabel)};;\n`;
                    });
                }
            });

            // Скачивание
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Competitors_Export_${new Date().toISOString().slice(0,10)}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        };
    }

    loadList();
});
