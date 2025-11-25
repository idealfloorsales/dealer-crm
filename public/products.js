document.addEventListener('DOMContentLoaded', () => {
    
    const API_URL = '/api/products';
    
    const tableBody = document.getElementById('products-list');
    const searchInput = document.getElementById('product-search');
    const totalLabel = document.getElementById('total-count');
    
    const modalEl = document.getElementById('product-modal');
    // (ИЗМЕНЕНО) backdrop: 'static'
    const modal = new bootstrap.Modal(modalEl, { backdrop: 'static', keyboard: false });
    const form = document.getElementById('product-form');
    const modalTitle = document.getElementById('product-modal-title');
    
    const addBtn = document.getElementById('add-product-btn');
    const resetBtn = document.getElementById('reset-catalog-btn'); 
    
    const inpId = document.getElementById('prod_id');
    const inpSku = document.getElementById('prod_sku');
    const inpName = document.getElementById('prod_name');

    let products = [];

    async function loadProducts() {
        try {
            tableBody.innerHTML = '<tr><td colspan="3" class="text-center py-4 text-muted">Загрузка...</td></tr>';
            const res = await fetch(API_URL);
            if(res.ok) {
                products = await res.json();
                products.sort((a, b) => a.sku.localeCompare(b.sku, undefined, {numeric: true}));
                renderTable();
            }
        } catch(e) {
            tableBody.innerHTML = '<tr><td colspan="3" class="text-center py-4 text-danger">Ошибка загрузки</td></tr>';
        }
    }

    function renderTable() {
        const search = searchInput.value.toLowerCase();
        const filtered = products.filter(p => p.sku.toLowerCase().includes(search) || p.name.toLowerCase().includes(search));

        if (filtered.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="3" class="text-center py-4 text-muted">Ничего не найдено</td></tr>';
            totalLabel.textContent = 'Всего товаров: 0';
            return;
        }

        tableBody.innerHTML = filtered.map(p => `
            <tr>
                <td><span class="badge bg-light text-dark border fw-bold" style="font-size: 0.9rem;">${p.sku}</span></td>
                <td class="fw-medium">${p.name}</td>
                <td class="text-end">
                    <button class="btn btn-sm btn-light border me-1" onclick="editProduct('${p.id}')" title="Редактировать"><i class="bi bi-pencil"></i></button>
                    <button class="btn btn-sm btn-light border text-danger" onclick="deleteProduct('${p.id}')" title="Удалить"><i class="bi bi-trash"></i></button>
                </td>
            </tr>
        `).join('');

        totalLabel.textContent = `Всего товаров: ${filtered.length}`;
    }

    if(resetBtn) {
        resetBtn.onclick = async () => {
            if(confirm("Это загрузит стандартный список из 72 товаров (Ламинат) в базу. \nУже существующие товары не дублируются.\nПродолжить?")) {
                try {
                    resetBtn.disabled = true; 
                    resetBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Загрузка...';
                    const res = await fetch('/api/admin/import-catalog', { method: 'POST' });
                    if (res.ok) { alert('Каталог успешно обновлен!'); loadProducts(); } 
                    else { alert('Ошибка сервера при импорте.'); }
                } catch(e) { alert('Ошибка соединения'); } finally { 
                    resetBtn.disabled = false; 
                    resetBtn.innerHTML = '<i class="bi bi-arrow-clockwise me-2"></i>Загрузить базу';
                }
            }
        };
    }

    if(addBtn) {
        addBtn.onclick = () => {
            inpId.value = '';
            form.reset();
            modalTitle.textContent = 'Добавить товар';
            modal.show();
        };
    }

    window.editProduct = (id) => {
        const p = products.find(x => x.id === id);
        if (!p) return;
        inpId.value = p.id;
        inpSku.value = p.sku;
        inpName.value = p.name;
        modalTitle.textContent = 'Редактировать товар';
        modal.show();
    };

    if(form) {
        form.onsubmit = async (e) => {
            e.preventDefault();
            const data = { sku: inpSku.value.trim(), name: inpName.value.trim() };
            const id = inpId.value;
            let url = API_URL;
            let method = 'POST';
            if (id) { url = `${API_URL}/${id}`; method = 'PUT'; }

            try {
                const btn = form.querySelector('button[type="submit"]');
                const oldText = btn.innerHTML;
                btn.disabled = true; btn.innerHTML = '...';
                const res = await fetch(url, { method: method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) });
                if (res.ok) { await loadProducts(); modal.hide(); } else { alert('Ошибка. Возможно, такой SKU уже есть.'); }
                btn.disabled = false; btn.innerHTML = oldText;
            } catch(e) { alert('Ошибка сети'); }
        };
    }

    window.deleteProduct = async (id) => {
        if(confirm('Удалить этот товар? Он пропадет из матрицы всех дилеров.')) {
            try { await fetch(`${API_URL}/${id}`, { method: 'DELETE' }); loadProducts(); } catch(e) { alert('Ошибка удаления'); }
        }
    };

    if(searchInput) { searchInput.addEventListener('input', renderTable); }
    loadProducts();
});
