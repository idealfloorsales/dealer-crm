// competitors.js
document.addEventListener('DOMContentLoaded', () => {
    const API_URL = '/api/competitors-ref';
    
    const listContainer = document.getElementById('competitors-list');
    const detailsCard = document.getElementById('comp-details-card');
    const emptyMsg = document.getElementById('empty-msg');
    const addBtn = document.getElementById('add-comp-btn');
    const delBtn = document.getElementById('btn-delete-comp');
    const form = document.getElementById('comp-form');
    
    const collectionsContainer = document.getElementById('collections-container');
    const addCollRowBtn = document.getElementById('add-coll-row-btn');

    const inpId = document.getElementById('comp_id');
    const inpName = document.getElementById('comp_name');
    const inpSupplier = document.getElementById('comp_supplier');
    const inpWarehouse = document.getElementById('comp_warehouse');
    const inpInfo = document.getElementById('comp_info');

    // ТИПЫ КОЛЛЕКЦИЙ (Ваши цвета)
    const collectionTypes = [
        { val: 'standard', label: 'Стандарт (обычный)', class: 'type-standard' },
        { val: 'english', label: 'Английская Елочка', class: 'type-english' },
        { val: 'french', label: 'Французская Елочка', class: 'type-french' },
        { val: 'artistic', label: 'Художественный', class: 'type-artistic' },
        { val: 'art_eng', label: 'Худ. Английская', class: 'type-art-eng' },
        { val: 'art_french', label: 'Худ. Французская', class: 'type-art-french' },
        { val: 'art_mix', label: 'Худ. Англ-Франц', class: 'type-art-mix' }
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
        } catch(e) {
            listContainer.innerHTML = '<p class="text-danger p-3">Ошибка</p>';
        }
    }

    function renderList() {
        if (competitors.length === 0) {
            listContainer.innerHTML = '<p class="text-center text-muted p-3">Список пуст</p>';
            return;
        }

        listContainer.innerHTML = competitors.map(c => {
            // Генерируем цветные плашки для предпросмотра
            const badges = (c.collections || [])
                .filter(col => col.type !== 'standard') // Показываем только "особенные"
                .map(col => {
                    const typeInfo = collectionTypes.find(t => t.val === col.type) || {};
                    return `<span class="badge-type ${typeInfo.class || ''}">${typeInfo.label || col.type}</span>`;
                }).join('');

            return `
            <button class="list-group-item list-group-item-action ${c.id === selectedId ? 'active' : ''}" 
                    onclick="selectComp('${c.id}')">
                <div class="d-flex w-100 justify-content-between align-items-center">
                    <h6 class="mb-1 fw-bold">${c.name}</h6>
                </div>
                <div class="mb-1">${badges}</div>
                <div class="d-flex justify-content-between">
                    <small class="${c.id === selectedId ? 'text-light' : 'text-muted'}">${c.supplier || '-'}</small>
                    <small class="${c.id === selectedId ? 'text-light' : 'text-muted'}">${c.warehouse || '-'}</small>
                </div>
            </button>`;
        }).join('');
    }

    // --- Управление строками коллекций ---
    function addCollectionRow(name = '', type = 'standard') {
        const div = document.createElement('div');
        div.className = 'input-group mb-2 collection-row';
        
        let options = collectionTypes.map(t => 
            `<option value="${t.val}" ${t.val === type ? 'selected' : ''}>${t.label}</option>`
        ).join('');

        div.innerHTML = `
            <input type="text" class="form-control coll-name" placeholder="Название коллекции" value="${name}" required>
            <select class="form-select coll-type" style="max-width: 200px;">
                ${options}
            </select>
            <button type="button" class="btn btn-outline-danger" onclick="this.parentElement.remove()">×</button>
        `;
        collectionsContainer.appendChild(div);
    }

    addCollRowBtn.onclick = () => addCollectionRow();

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

        // Заполняем коллекции
        collectionsContainer.innerHTML = '';
        if (c.collections && c.collections.length > 0) {
            c.collections.forEach(col => {
                // Поддержка старого формата (если было просто строкой)
                if (typeof col === 'string') addCollectionRow(col, 'standard');
                else addCollectionRow(col.name, col.type);
            });
        } else {
            // Пусто
        }

        detailsCard.style.display = 'block';
        emptyMsg.style.display = 'none';
        renderList();
    };

    if (addBtn) {
        addBtn.onclick = () => {
            selectedId = null;
            inpId.value = '';
            form.reset();
            collectionsContainer.innerHTML = ''; // Очищаем строки
            addCollectionRow(); // Добавляем одну пустую для удобства
            
            document.getElementById('comp_title').textContent = 'Новый бренд';
            detailsCard.style.display = 'block';
            emptyMsg.style.display = 'none';
            renderList();
        };
    }

    // Сохранение
    if (form) {
        form.onsubmit = async (e) => {
            e.preventDefault();
            
            // Собираем коллекции из строк
            const collectionsData = [];
            document.querySelectorAll('.collection-row').forEach(row => {
                const name = row.querySelector('.coll-name').value.trim();
                const type = row.querySelector('.coll-type').value;
                if (name) {
                    collectionsData.push({ name, type });
                }
            });

            const data = {
                name: inpName.value,
                supplier: inpSupplier.value,
                warehouse: inpWarehouse.value,
                info: inpInfo.value,
                collections: collectionsData
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
                        detailsCard.style.display = 'none';
                        emptyMsg.style.display = 'block';
                    } else {
                        document.getElementById('comp_title').textContent = data.name;
                    }
                }
            } catch (e) { alert('Ошибка сохранения'); }
        };
    }

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
