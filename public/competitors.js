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

    // Поля формы
    const inpId = document.getElementById('comp_id');
    const inpName = document.getElementById('comp_name');
    const inpSupplier = document.getElementById('comp_supplier');
    const inpWarehouse = document.getElementById('comp_warehouse');
    const inpInfo = document.getElementById('comp_info');
    const inpColl = document.getElementById('comp_collections');
    const cbHerringbone = document.getElementById('comp_herringbone');
    const cbArtistic = document.getElementById('comp_artistic');

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
            listContainer.innerHTML = '<p class="text-danger p-3">Ошибка загрузки</p>';
        }
    }

    function renderList() {
        if (competitors.length === 0) {
            listContainer.innerHTML = '<p class="text-center text-muted p-3">Список пуст</p>';
            return;
        }

        listContainer.innerHTML = competitors.map(c => {
            // Значки
            let badges = '';
            if(c.hasHerringbone) badges += '<span class="badge bg-success me-1" title="Елочка">🌲</span>';
            if(c.hasArtistic) badges += '<span class="badge bg-info text-dark" title="Художественный">🎨</span>';

            return `
            <button class="list-group-item list-group-item-action ${c.id === selectedId ? 'active' : ''}" 
                    onclick="selectComp('${c.id}')">
                <div class="d-flex w-100 justify-content-between align-items-center">
                    <h6 class="mb-1 fw-bold">${c.name}</h6>
                    <div>${badges}</div>
                </div>
                <div class="d-flex justify-content-between">
                    <small class="${c.id === selectedId ? 'text-light' : 'text-muted'}">${c.supplier || '-'}</small>
                    <small class="${c.id === selectedId ? 'text-light' : 'text-muted'}">${c.warehouse || '-'}</small>
                </div>
            </button>`;
        }).join('');
    }

    // Сделаем функцию глобальной, чтобы onclick в HTML работал
    window.selectComp = (id) => {
        selectedId = id;
        const c = competitors.find(x => x.id === id);
        if (!c) return;

        inpId.value = c.id;
        document.getElementById('comp_title').textContent = c.name;
        
        inpName.value = c.name;
        inpSupplier.value = c.supplier || '';
        inpWarehouse.value = c.warehouse || '';
        inpInfo.value = c.info || '';
        inpColl.value = (c.collections || []).join('\n');
        
        // (НОВОЕ) Галочки
        cbHerringbone.checked = c.hasHerringbone || false;
        cbArtistic.checked = c.hasArtistic || false;

        detailsCard.style.display = 'block';
        emptyMsg.style.display = 'none';
        renderList();
    };

    // (ИСПРАВЛЕНО) Логика кнопки Добавить
    if (addBtn) {
        addBtn.onclick = () => {
            selectedId = null;
            inpId.value = '';
            form.reset(); // Очищаем форму
            
            document.getElementById('comp_title').textContent = 'Новый бренд';
            
            detailsCard.style.display = 'block';
            emptyMsg.style.display = 'none';
            renderList(); // Чтобы снять выделение с других
        };
    }

    // Сохранение
    if (form) {
        form.onsubmit = async (e) => {
            e.preventDefault();
            
            const collections = inpColl.value.split('\n').map(s => s.trim()).filter(s => s);

            const data = {
                name: inpName.value,
                supplier: inpSupplier.value,
                warehouse: inpWarehouse.value,
                info: inpInfo.value,
                collections: collections,
                hasHerringbone: cbHerringbone.checked, // (НОВОЕ)
                hasArtistic: cbArtistic.checked       // (НОВОЕ)
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
                    await loadList(); // Перезагружаем список
                    
                    // Если создавали нового - скрываем форму, чтобы не создать дубль
                    if (!id) {
                        detailsCard.style.display = 'none';
                        emptyMsg.style.display = 'block';
                        emptyMsg.textContent = 'Бренд добавлен!';
                    } else {
                        // Если редактировали - оставляем открытым и обновляем заголовок
                        document.getElementById('comp_title').textContent = data.name;
                    }
                }
            } catch (e) { alert('Ошибка сохранения'); }
        };
    }

    // Удаление
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
