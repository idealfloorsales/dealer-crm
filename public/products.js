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

    // --- Функция: Загрузка товаров ---
    async function fetchProducts(searchTerm = '') {
        try {
            const response = await fetch(`${API_URL}?search=${encodeURIComponent(searchTerm)}`);
            if (!response.ok) throw new Error('Ошибка сети при загрузке товаров');
            
            allProducts = await response.json(); 
            renderProducts(); 

        } catch (error) {
            console.error(error);
            productListBody.innerHTML = `<tr><td colspan="3" class="text-danger">${error.message}</td></tr>`;
        }
    }
    
    // --- Функция: Отрисовка таблицы (с Сортировкой) ---
    function renderProducts() {
        const safeText = (text) => text ? text.replace(/</g, "&lt;").replace(/>/g, "&gt;") : '---';
        
        const sortedProducts = allProducts.sort((a, b) => {
            const col = currentSort.column;
            let valA = (a[col] || '').toString(); 
            let valB = (b[col] || '').toString();
            let comparison = valA.localeCompare(valB, 'ru', { numeric: true });
            return currentSort.direction === 'asc' ? comparison : -comparison;
        });
        
         document.querySelectorAll('#products-table th[data-sort]').forEach(th => {
            th.classList.remove('sort-asc', 'sort-desc');
            if (th.dataset.sort === currentSort.column) {
                th.classList.add(currentSort.direction === 'asc' ? 'sort-asc' : 'sort-desc');
            }
        });

        productListBody.innerHTML = '';
        if (sortedProducts.length === 0) {
            productsTable.style.display = 'none';
            noDataMsg.style.display = 'block';
            noDataMsg.textContent = 'Товары не найдены.';
            return;
        }

        productsTable.style.display = 'table';
        noDataMsg.style.display = 'none';

        sortedProducts.forEach(product => {
            const row = productListBody.insertRow();
            const productId = product.id; 
            row.dataset.id = productId; 
            
            row.innerHTML = `
                <td class="sku-cell">${safeText(product.sku)}</td>
                <td>${safeText(product.name)}</td>
                <td class="actions-cell">
                    <div class="dropdown">
                        <button class="btn btn-light btn-sm" type="button" data-bs-toggle="dropdown">
                            <i class="bi bi-three-dots-vertical"></i>
                        </button>
                        <ul class="dropdown-menu dropdown-menu-end">
                            <li><a class="dropdown-item btn-edit" 
                                data-id="${productId}" 
                                data-sku="${safeText(product.sku)}" 
                                data-name="${safeText(product.name)}" href="#">
                                <i class="bi bi-pencil me-2"></i>Редактировать
                            </a></li>
                            <li><a class="dropdown-item text-danger btn-delete" data-id="${productId}" data-name="${safeText(product.name)}" href="#">
                                <i class="bi bi-trash me-2"></i>Удалить
                            </a></li>
                        </ul>
                    </div>
                </td>
            `;
        });
    }

    // --- Поиск (с задержкой) ---
    let debounceTimer;
    searchBar.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        const searchTerm = e.target.value;
        debounceTimer = setTimeout(() => {
            fetchProducts(searchTerm);
        }, 300);
    });

    // --- Логика модального окна "Добавить" ---
    openAddBtn.onclick = () => {
        addForm.reset();
        addModal.show();
    };
    
    addForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const sku = document.getElementById('add_sku').value;
        const name = document.getElementById('add_name').value;
        
        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sku, name })
            });
            const result = await response.json();
            
            if (response.ok) {
                addModal.hide();
                await fetchProducts(searchBar.value); 
            } else {
                alert(`Ошибка: ${result.error}`);
            }
        } catch (error) {
            alert(`Ошибка сети: ${error.message}`);
        }
    });

    // --- Логика модального окна "Редактировать" и "Удалить" ---
    productListBody.addEventListener('click', (e) => {
        const target = e.target;
        
        if (target.classList.contains('btn-edit')) {
            e.preventDefault();
            document.getElementById('edit_product_id').value = target.dataset.id;
            document.getElementById('edit_sku').value = target.dataset.sku;
            document.getElementById('edit_name').value = target.dataset.name;
            editModal.show();
        }
        
        if (target.classList.contains('btn-delete')) {
            e.preventDefault();
            const id = target.dataset.id;
            const name = target.dataset.name;
            if (confirm(`Вы уверены, что хотите удалить товар "${name}"?`)) {
                deleteProduct(id);
            }
        }
    });
    
    async function deleteProduct(id) {
         try {
            const response = await fetch(`${API_URL}/${id}`, { method: 'DELETE' });
            if (response.ok) {
                await fetchProducts(searchBar.value); 
            } else {
                const result = await response.json();
                alert(`Ошибка удаления: ${result.error}`);
            }
        } catch (error) {
             alert(`Ошибка сети: ${error.message}`);
        }
    }

    editForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('edit_product_id').value;
        const sku = document.getElementById('edit_sku').value;
        const name = document.getElementById('edit_name').value;

        try {
            const response = await fetch(`${API_URL}/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sku, name })
            });
            const result = await response.json();
            
            if (response.ok) {
                editModal.hide();
                await fetchProducts(searchBar.value);
            } else {
                alert(`Ошибка: ${result.error}`);
            }
        } catch (error) {
            alert(`Ошибка сети: ${error.message}`);
        }
    });

    // --- Обработчики: СОРТИРОВКА ---
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

    // --- Первоначальная загрузка ---
    fetchProducts();
});
