// competitors.js
document.addEventListener('DOMContentLoaded', () => {
    const API_URL = '/api/competitors-ref';
    
    // Элементы
    const listContainer = document.getElementById('competitors-list');
    const detailsCard = document.getElementById('comp-details-card');
    const emptyMsg = document.getElementById('empty-msg');
    const addBtn = document.getElementById('add-comp-btn');
    const delBtn = document.getElementById('btn-delete-comp');
    const form = document.getElementById('comp-form');
    
    // Контейнеры списков
    const collectionsContainer = document.getElementById('collections-container');
    const addCollRowBtn = document.getElementById('add-coll-row-btn');
    const contactsContainer = document.getElementById('comp-contacts-list');
    const addContactBtn = document.getElementById('btn-add-contact');

    // Поля
    const inpId = document.getElementById('comp_id');
    const inpName = document.getElementById('comp_name');
    const inpSupplier = document.getElementById('comp_supplier');
    const inpWarehouse = document.getElementById('comp_warehouse');
    const inpInfo = document.getElementById('comp_info');
    
    // (НОВЫЕ ПОЛЯ)
    const inpStorage = document.getElementById('comp_storage');
    const inpStock = document.getElementById('comp_stock');
    const inpReserve = document.getElementById('comp_reserve');

    // Типы коллекций
    const collectionTypes = [
        { val: 'standard', label: 'Стандарт', class: 'type-standard' },
        { val: 'english', label: 'Английская Елка', class: 'type-english' },
        { val: 'french', label: 'Французская Елка', class: 'type-french' },
        { val: 'artistic', label: 'Художественный', class: 'type-artistic' },
        { val: 'art_eng', label: 'Худ. Английская', class: 'type-art-eng' },
        { val: 'art_french', label: 'Худ. Французская', class: 'type-art-french' },
        { val: 'art_mix', label: 'Худ. Микс', class: 'type-art-mix' }
    ];

    let competitors = [];
    let selectedId = null;

    async function loadList() {
        try {
            const res = await fetch(API_URL);
            if(res.ok) {
                competitors = await res.json();
                renderList();
            }
        } catch(e) { listContainer.innerHTML = '<p class="text-danger p-3">Ошибка</p>'; }
    }

    function renderList() {
        if (competitors.length === 0) {
            listContainer.innerHTML = '<p class="text-center text-muted p-3">Список пуст</p>';
            return;
        }

        listContainer.innerHTML = competitors.map(c => {
            // Баджи для закрытого вида (только важные)
            const hasHerringbone = (c.collections||[]).some(col => col.type && col.type.includes('eng') || col.type.includes('french'));
            const hasArtistic = (c.collections||[]).some(col => col.type && col.type.includes('art'));
            
            let topBadges = '';
            if(hasHerringbone) topBadges += '🌲 ';
            if(hasArtistic) topBadges += '🎨 ';

            // Список коллекций для развернутого вида
            const collectionsHtml = (c.collections || []).map(col => {
                const typeInfo = collectionTypes.find(t => t.val === col.type) || {};
                const typeLabel = typeInfo.val !== 'standard' ? `<span class="badge-type ${typeInfo.class}">${typeInfo.label}</span>` : '';
                return `<div class="d-flex justify-content-between align-items-center mb-1"><span>${col.name}</span>${typeLabel}</div>`;
            }).join('');

            return `
            <div class="list-group-item list-group-item-action ${c.id === selectedId ? 'active' : ''}" 
                 onclick="selectComp('${c.id}')">
                <div class="comp-item-header">
                    <div>
                        <h6 class="mb-0 fw-bold">${c.name} <small>${topBadges}</small></h6>
                        <small class="${c.id === selectedId ? 'text-light' : 'text-muted'}">${c.supplier || ''}</small>
                    </div>
                    <i class="bi bi-chevron-right"></i>
                </div>
                
                <div class="comp-item-body">
                    ${collectionsHtml || '<em class="text-muted">Нет коллекций</em>'}
                </div>
            </div>`;
        }).join('');
    }

    // --- Управление КОЛЛЕКЦИЯМИ ---
    function addCollectionRow(name = '', type = 'standard') {
        const div = document.createElement('div');
        div.className = 'input-group mb-2 collection-row';
        let options = collectionTypes.map(t => `<option value="${t.val}" ${t.val === type ? 'selected' : ''}>${t.label}</option>`).join('');
        div.innerHTML = `
            <input type="text" class="form-control coll-name" placeholder="Название" value="${name}" required>
            <select class="form-select coll-type" style="max-width: 160px;">${options}</select>
            <button type="button" class="btn btn-outline-danger" onclick="this.parentElement.remove()">×</button>
        `;
        collectionsContainer.appendChild(div);
    }

    // --- Управление КОНТАКТАМИ ---
    function addContactRow(name='', pos='', phone='') {
        const div = document.createElement('div');
        div.className = 'comp-contact-row';
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

    // --- Выбор бренда ---
    window.selectComp = (id) => {
        selectedId = id;
        const c = competitors.find(x => x.id === id);
        if (!c) return;

        inpId.value = c.id;
        document.getElementById('comp-title').textContent = c.name;
        
        inpName.value = c.name;
        inpSupplier.value = c.supplier || '';
        inpWarehouse.value = c.warehouse || '';
        inpInfo.value = c.info || '';
        
        // Новые поля
        inpStorage.value = c.storage_days || '';
        inpStock.value = c.stock_info || '';
        inpReserve.value = c.reserve_days || '';

        // Заполняем коллекции
        collectionsContainer.innerHTML = '';
        if (c.collections && c.collections.length > 0) {
            c.collections.forEach(col => {
                if (typeof col === 'string') addCollectionRow(col, 'standard');
                else addCollectionRow(col.name, col.type);
            });
        }

        // Заполняем контакты
        contactsContainer.innerHTML = '';
        if (c.contacts && c.contacts.length > 0) {
            c.contacts.forEach(cnt => addContactRow(cnt.name, cnt.position, cnt.phone));
        }

        detailsCard.style.display = 'block';
        emptyMsg.style.display = 'none';
        renderList(); // Обновляем выделение и раскрытие списка
    };

    // Кнопка ДОБАВИТЬ
    if (addBtn) {
        addBtn.onclick = () => {
            selectedId = null;
            inpId.value = '';
            form.reset();
            
            collectionsContainer.innerHTML = '';
            contactsContainer.innerHTML = '';
            
            addCollectionRow(); // Пустая строка
            addContactRow();    // Пустая строка
            
            document.getElementById('comp_title').textContent = 'Новый бренд';
            detailsCard.style.display = 'block';
            emptyMsg.style.display = 'none';
            renderList();
        };
    }

    // СОХРАНЕНИЕ
    if (form) {
        form.onsubmit = async (e) => {
            e.preventDefault();
            
            // Собираем коллекции
            const collectionsData = [];
            document.querySelectorAll('.collection-row').forEach(row => {
                const name = row.querySelector('.coll-name').value.trim();
                const type = row.querySelector('.coll-type').value;
                if (name) collectionsData.push({ name, type });
            });

            // Собираем контакты
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

            if (id) {
                url = `${API_URL}/${id}`;
                method = 'PUT';
            }

            try {
                const res = await fetch(url, { 
                    method: method, 
                    headers: {'Content-Type': 'application/json'}, 
                    body: JSON.stringify(data) 
                });

                if (res.ok) {
                    await loadList(); 
                    if (!id) {
                        // Если создали - закрываем и уведомляем
                        detailsCard.style.display = 'none';
                        emptyMsg.style.display = 'block';
                        alert('Бренд успешно добавлен!');
                    } else {
                        document.getElementById('comp_title').textContent = data.name;
                    }
                }
            } catch (e) { alert('Ошибка сохранения'); }
        };
    }

    // УДАЛЕНИЕ
    if (delBtn) {
        delBtn.onclick = async () => {
            const id = inpId.value;
            if (!id) return;
            if (confirm('Удалить этот бренд?')) {
                await fetch(`${API_URL}/${id}`, { method: 'DELETE' });
                selectedId = null;
                detailsCard.style.display = 'none';
                emptyMsg.style.display = 'block';
                loadList();
            }
        };
    }

    loadList();
});
