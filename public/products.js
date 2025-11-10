// products.js
document.addEventListener('DOMContentLoaded', () => {

    // (ИЗМЕНЕНО) Используем относительный путь
    const API_URL = '/api/products';
    
    const productListBody = document.getElementById('product-list-body');
    const searchBar = document.getElementById('search-bar');
    
    const addModal = document.getElementById('add-product-modal');
    const openAddBtn = document.getElementById('open-add-product-btn');
    const closeAddBtn = addModal.querySelector('.close-btn');
    const addForm = document.getElementById('add-product-form');
    
    const editModal = document.getElementById('edit-product-modal');
    const closeEditBtn = editModal.querySelector('.close-btn');
    const editForm = document.getElementById('edit-product-form');

    let allProducts = []; 
    let currentSort = { column: 'name', direction: 'asc' };

    // --- Функция: Загрузка товаров ---
    async function fetchProducts(searchTerm = '') {
        try {
            const response = await fetch(`${API_URL}?search=${encodeURIComponent(searchTerm)}`);
            if (!response.ok) throw new Error('Ошибка сети при загрузке товаров');
            
            allProducts = await response.json(); 
            renderProducts(); 

        } catch (error) {
            console.error(error);
            productListBody.innerHTML = `<tr><td colspan="3" style="color: red;">${error.message}</td></tr>`;
        }
    }
    
    // --- Функция: Отрисовка таблицы (с Сортировкой) ---
    function renderProducts() {
        const safeText = (text) => text ? text.replace(/</g, "&lt;").replace(/>/g, "&gt;") : '---';
        
        const sortedProducts = allProducts.sort((a, b) => {
            const col = currentSort.column;
            let valA = (a[col] || '').toString().toLowerCase(); 
            let valB = (b[col] || '').toString().toLowerCase();
            let comparison = 0;
            if (valA > valB) comparison = 1;
            else if (valA < valB) comparison = -1;
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
            productListBody.innerHTML = '<tr><td colspan="3">Товары не найдены.</td></tr>';
            return;
        }

        sortedProducts.forEach(product => {
            const row = productListBody.insertRow();
            row.dataset.id = product._id; // (ИЗМЕНЕНО) MongoDB использует _id
            
            row.innerHTML = `
                <td class="sku-cell">${safeText(product.sku)}</td>
                <td>${safeText(product.name)}</td>
                <td class="actions-cell">
                    <button class="edit-btn" 
                        data-id="${product._id}" 
                        data-sku="${safeText(product.sku)}" 
                        data-name="${safeText(product.name)}">✏️ Ред.</button>
                    <button class="delete-btn" data-id="${product._id}">X</button>
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
    openAddBtn.onclick = () => addModal.style.display = 'block';
    closeAddBtn.onclick = () => {
        addModal.style.display = 'none';
        addForm.reset();
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
                addModal.style.display = 'none';
                addForm.reset();
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

        if (target.classList.contains('edit-btn')) {
            document.getElementById('edit_product_id').value = target.dataset.id;
            document.getElementById('edit_sku').value = target.dataset.sku;
            document.getElementById('edit_name').value = target.dataset.name;
            editModal.style.display = 'block';
        }
        
        if (target.classList.contains('delete-btn')) {
            const id = target.dataset.id;
            if (confirm(`Вы уверены, что хотите удалить этот товар? (ID: ${id})`)) {
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

    closeEditBtn.onclick = () => {
        editModal.style.display = 'none';
        editForm.reset();
    };

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
                editModal.style.display = 'none';
                editForm.reset();
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

    // --- Закрытие модальных окон по клику снаружи ---
    window.onclick = (event) => {
        if (event.target == addModal) {
            addModal.style.display = 'none';
            addForm.reset();
        }
        if (event.target == editModal) {
            editModal.style.display = 'none';
            editForm.reset();
        }
    };

    // --- Первоначальная загрузка ---
    fetchProducts();
});