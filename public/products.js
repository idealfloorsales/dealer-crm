// products.js
document.addEventListener('DOMContentLoaded', () => {

    const API_URL = '/api/products';
    
    const productListBody = document.getElementById('product-list-body');
    const productsTable = document.getElementById('products-table');
    const noDataMsg = document.getElementById('no-data-msg');
    const searchBar = document.getElementById('search-bar');
    
    const addModalEl = document.getElementById('add-product-modal');
    const addModal = new bootstrap.Modal(addModalEl);
    const openAddBtn = document.getElementById('open-add-product-btn');
    const addForm = document.getElementById('add-product-form');
    
    const editModalEl = document.getElementById('edit-product-modal');
    const editModal = new bootstrap.Modal(editModalEl);
    const editForm = document.getElementById('edit-product-form');

    let allProducts = []; 
    let currentSort = { column: 'sku', direction: 'asc' }; 

    const safeText = (text) => text ? text.replace(/</g, "&lt;").replace(/>/g, "&gt;") : '---';

    // (ИСПРАВЛЕНО) fetchProducts
    async function fetchProducts(searchTerm = '') {
        try {
            const response = await fetch(`${API_URL}?search=${encodeURIComponent(searchTerm)}`);
            if (!response.ok) throw new Error('Ошибка сети');
            allProducts = await response.json(); 
            renderProducts(); 
        } catch (error) {
            console.error(error);
            if(productListBody) productListBody.innerHTML = `<tr><td colspan="3" class="text-danger">${error.message}</td></tr>`;
        }
    }
    
    function renderProducts() {
        // (ИСПРАВЛЕНО) Проверка на существование allProducts
        if (!allProducts) allProducts = [];
        
        const sortedProducts = allProducts.sort((a, b) => {
            const col = currentSort.column;
            let valA = (a[col] || '').toString(); 
            let valB = (b[col] || '').toString();
            let comparison = valA.localeCompare(valB, 'ru', { numeric: true });
            return currentSort.direction === 'asc' ? comparison : -comparison;
        });
        
        if(!productListBody) return;
        productListBody.innerHTML = '';
        
        if (sortedProducts.length === 0) {
            if(productsTable) productsTable.style.display = 'none';
            if(noDataMsg) { noDataMsg.style.display = 'block'; noDataMsg.textContent = 'Товары не найдены.'; }
            return;
        }
        if(productsTable) productsTable.style.display = 'table';
        if(noDataMsg) noDataMsg.style.display = 'none';

        sortedProducts.forEach(product => {
            const row = productListBody.insertRow();
            row.innerHTML = `
                <td class="sku-cell">${safeText(product.sku)}</td>
                <td>${safeText(product.name)}</td>
                <td class="actions-cell">
                    <div class="dropdown">
                        <button class="btn btn-light btn-sm" type="button" data-bs-toggle="dropdown"><i class="bi bi-three-dots-vertical"></i></button>
                        <ul class="dropdown-menu dropdown-menu-end">
                            <li><a class="dropdown-item btn-edit" data-id="${product.id}" data-sku="${safeAttr(product.sku)}" data-name="${safeAttr(product.name)}" href="#"><i class="bi bi-pencil me-2"></i>Редактировать</a></li>
                            <li><a class="dropdown-item text-danger btn-delete" data-id="${product.id}" data-name="${safeAttr(product.name)}" href="#"><i class="bi bi-trash me-2"></i>Удалить</a></li>
                        </ul>
                    </div>
                </td>`;
        });
    }

    let debounceTimer;
    if(searchBar) searchBar.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => fetchProducts(e.target.value), 300);
    });

    if(openAddBtn) openAddBtn.onclick = () => { addForm.reset(); addModal.show(); };
    
    if(addForm) addForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            const response = await fetch(API_URL, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sku: document.getElementById('add_sku').value, name: document.getElementById('add_name').value })
            });
            if (response.ok) { addModal.hide(); await fetchProducts(searchBar.value); }
            else { alert(`Ошибка: ${(await response.json()).error}`); }
        } catch (error) { alert('Ошибка сети.'); }
    });

    if(productListBody) productListBody.addEventListener('click', (e) => {
        if (e.target.closest('.btn-edit')) {
            e.preventDefault();
            const btn = e.target.closest('.btn-edit');
            document.getElementById('edit_product_id').value = btn.dataset.id;
            document.getElementById('edit_sku').value = btn.dataset.sku;
            document.getElementById('edit_name').value = btn.dataset.name;
            editModal.show();
        }
        if (e.target.closest('.btn-delete')) {
            e.preventDefault();
            const btn = e.target.closest('.btn-delete');
            if (confirm(`Удалить "${btn.dataset.name}"?`)) {
                fetch(`${API_URL}/${btn.dataset.id}`, { method: 'DELETE' }).then(() => fetchProducts(searchBar.value));
            }
        }
    });

    if(editForm) editForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            const response = await fetch(`${API_URL}/${document.getElementById('edit_product_id').value}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sku: document.getElementById('edit_sku').value, name: document.getElementById('edit_name').value })
            });
            if (response.ok) { editModal.hide(); await fetchProducts(searchBar.value); }
            else { alert('Ошибка.'); }
        } catch (error) { alert('Ошибка сети.'); }
    });

    document.querySelectorAll('#products-table th[data-sort]').forEach(th => {
        th.addEventListener('click', () => {
            const column = th.dataset.sort;
            if (currentSort.column === column) {
                currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
            } else {
                currentSort.column = column;
                currentSort.direction = 'asc';
            }
            renderProducts(); 
        });
    });

    fetchProducts();
});
