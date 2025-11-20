// competitors.js
document.addEventListener('DOMContentLoaded', () => {
    const API_URL = '/api/competitors-ref';
    const listContainer = document.getElementById('competitors-list');
    const detailsCard = document.getElementById('comp-details-card');
    const emptyMsg = document.getElementById('empty-msg');
    const addBtn = document.getElementById('add-comp-btn');
    const delBtn = document.getElementById('btn-delete-comp');
    const form = document.getElementById('comp-form');
 
    let competitors = [];
    let selectedId = null;

    async function loadList() {
        const res = await fetch(API_URL);
        competitors = await res.json();
        renderList();
    }

    function renderList() {
        listContainer.innerHTML = competitors.map(c => `
            <button class="list-group-item list-group-item-action ${c.id === selectedId ? 'active' : ''}" 
                    onclick="selectComp('${c.id}')">
                <div class="d-flex w-100 justify-content-between">
                    <h6 class="mb-1">${c.name}</h6>
                </div>
                <small>${c.supplier || ''}</small>
            </button>
        `).join('');
    }

    window.selectComp = (id) => {
        selectedId = id;
        const c = competitors.find(x => x.id === id);
        if (!c) return;

        document.getElementById('comp_id').value = c.id;
        document.getElementById('comp_title').textContent = c.name;
        document.getElementById('comp_name').value = c.name;
        document.getElementById('comp_supplier').value = c.supplier || '';
        document.getElementById('comp_warehouse').value = c.warehouse || '';
        document.getElementById('comp_info').value = c.info || '';
        document.getElementById('comp_collections').value = (c.collections || []).join('\n');

        detailsCard.style.display = 'block';
        emptyMsg.style.display = 'none';
        renderList(); // Обновить подсветку
    };

    addBtn.onclick = () => {
        selectedId = null;
        document.getElementById('comp_id').value = '';
        document.getElementById('comp_title').textContent = 'Новый бренд';
        form.reset();
        detailsCard.style.display = 'block';
        emptyMsg.style.display = 'none';
        renderList();
    };

    form.onsubmit = async (e) => {
        e.preventDefault();
        const id = document.getElementById('comp_id').value;
        const collections = document.getElementById('comp_collections').value
            .split('\n').map(s => s.trim()).filter(s => s);

        const data = {
            name: document.getElementById('comp_name').value,
            supplier: document.getElementById('comp_supplier').value,
            warehouse: document.getElementById('comp_warehouse').value,
            info: document.getElementById('comp_info').value,
            collections: collections
        };

        if (id) {
            await fetch(`${API_URL}/${id}`, { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) });
        } else {
            await fetch(API_URL, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) });
        }
        loadList();
        if(!id) {
            // Если создали нового - сбрасываем форму
            emptyMsg.style.display = 'block';
            detailsCard.style.display = 'none';
        }
    };

    delBtn.onclick = async () => {
        const id = document.getElementById('comp_id').value;
        if (!id) return;
        if (confirm('Удалить этот бренд?')) {
            await fetch(`${API_URL}/${id}`, { method: 'DELETE' });
            selectedId = null;
            detailsCard.style.display = 'none';
            emptyMsg.style.display = 'block';
            loadList();
        }
    };

    loadList();
});competitors.js
