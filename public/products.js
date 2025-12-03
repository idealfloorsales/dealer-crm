document.addEventListener('DOMContentLoaded', () => {
    
    const API_URL = '/api/products';
    
    // Элементы
    const listContainer = document.getElementById('products-list-container'); // Новый контейнер
    const searchInput = document.getElementById('product-search');
    const totalLabel = document.getElementById('total-count');
    
    // Модалка
    const modalEl = document.getElementById('product-modal');
    const modal = new bootstrap.Modal(modalEl, { backdrop: 'static', keyboard: false });
    const form = document.getElementById('product-form');
    const modalTitle = document.getElementById('product-modal-title');
    
    const addBtn = document.getElementById('add-product-btn');
    const resetBtn = document.getElementById('reset-catalog-btn'); 
    
    const inpId = document.getElementById('prod_id');
    const inpSku = document.getElementById('prod_sku');
    const inpName = document.getElementById('prod_name');

    let products = [];

    // --- ЗАГРУЗКА ---
    async function loadProducts() {
        try {
            listContainer.innerHTML = '<p class="text-center mt-5 text-muted">Загрузка...</p>';
            const res = await fetch(API_URL);
            if(res.ok) {
                products = await res.json();
                
                // Умная сортировка (SKU)
                products.sort((a, b) => a.sku.localeCompare(b.sku, undefined, {numeric: true, sensitivity: 'base'}));
                
                renderList();
            }
        } catch(e) {
            listContainer.innerHTML = '<p class="text-center mt-5 text-danger">Ошибка загрузки данных</p>';
        }
    }

    // --- РЕНДЕР СПИСКА (MODERN) ---
    function renderList() {
        const search = searchInput.value.toLowerCase();
        const filtered = products.filter(p => p.sku.toLowerCase().includes(search) || p.name.toLowerCase().includes(search));

        if (filtered.length === 0) {
            listContainer.innerHTML = `
                <div class="empty-state">
                    <i class="bi bi-box-seam empty-state-icon"></i>
                    <h5 class="text-muted">Ничего не найдено</h5>
                </div>`;
            totalLabel.textContent = 'Всего товаров: 0';
            return;
        }

        listContainer.innerHTML = filtered.map(p => `
            <div class="product-item-modern">
                <div class="product-content">
                    <span class="product-sku-badge">${safeText(p.sku)}</span>
                    <span class="product-title">${safeText(p.name)}</span>
                </div>
                <div class="product-actions">
                    <button class="btn-circle" onclick="editProduct('${p.id}')" title="Редактировать">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn-circle text-danger" onclick="deleteProduct('${p.id}')" title="Удалить">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');

        totalLabel.textContent = `Всего товаров: ${filtered.length}`;
    }

    // --- ВСПОМОГАТЕЛЬНЫЕ ---
    const safeText = (text) => (text || '').toString().replace(/</g, "&lt;");

    // --- КНОПКИ ---
    if(resetBtn) {
        resetBtn.onclick = async () => {
            if(confirm("Это загрузит стандартный список товаров (Ламинат) в базу. \nУже существующие товары не дублируются.\nПродолжить?")) {
                try {
                    resetBtn.disabled = true; 
                    resetBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
                    const res = await fetch('/api/admin/import-catalog', { method: 'POST' });
                    if (res.ok) { await loadProducts(); } 
                    else { alert('Ошибка сервера при импорте.'); }
                } catch(e) { alert('Ошибка соединения'); } finally { 
                    resetBtn.disabled = false; 
                    resetBtn.innerHTML = '<i class="bi bi-arrow-clockwise me-2"></i>Сброс';
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

    window.deleteProduct = async (id) => {
        if(confirm('Удалить этот товар? Он пропадет из матрицы всех дилеров.')) {
            try { await fetch(`${API_URL}/${id}`, { method: 'DELETE' }); loadProducts(); } catch(e) { alert('Ошибка удаления'); }
        }
    };

    // --- СОХРАНЕНИЕ ---
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

    if(searchInput) { searchInput.addEventListener('input', renderList); }
    
    loadProducts();
});
