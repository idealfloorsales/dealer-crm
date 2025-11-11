// knowledge.js
document.addEventListener('DOMContentLoaded', () => {

    const API_URL = '/api/knowledge';
    
    // --- Элементы страницы ---
    const articleList = document.getElementById('article-list');
    const noDataMsg = document.getElementById('no-data-msg');
    const searchBar = document.getElementById('search-bar');
    
    // --- Модальное окно (Bootstrap) ---
    const modalEl = document.getElementById('article-modal');
    const modal = new bootstrap.Modal(modalEl);
    const modalTitle = document.getElementById('article-modal-title');
    const openAddBtn = document.getElementById('open-add-article-btn');
    const articleForm = document.getElementById('article-form');
    
    let allArticles = []; // Кэш

    // --- Функция: Загрузка статей ---
    async function fetchArticles(searchTerm = '') {
        try {
            const response = await fetch(`${API_URL}?search=${encodeURIComponent(searchTerm)}`);
            if (!response.ok) throw new Error('Ошибка сети при загрузке статей');
            
            allArticles = await response.json();
            allArticles.sort((a, b) => a.title.localeCompare(b.title, 'ru'));
            renderArticles(allArticles); 

        } catch (error) {
            console.error(error);
            articleList.innerHTML = `<p class="text-danger">${error.message}</p>`;
        }
    }
    
    // --- Функция: Отрисовка Аккордеона ---
    function renderArticles(articles) {
        const safeText = (text) => text ? text.replace(/</g, "&lt;").replace(/>/g, "&gt;") : '---';

        if (articles.length === 0) {
            articleList.innerHTML = '';
            noDataMsg.style.display = 'block';
            noDataMsg.textContent = 'Статьи не найдены.';
            return;
        }

        noDataMsg.style.display = 'none';

        articleList.innerHTML = articles.map((article, index) => {
            const articleId = article.id;
            const collapseId = `collapse-${articleId}`;
            const headerId = `header-${articleId}`;

            const date = new Date(article.createdAt).toLocaleDateString('ru-RU', {
                day: '2-digit', month: '2-digit', year: 'numeric'
            });

            return `
                <div class="accordion-item knowledge-item">
                    <h2 class="accordion-header" id="${headerId}">
                        <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#${collapseId}">
                            ${safeText(article.title)}
                        </button>
                    </h2>
                    <div id="${collapseId}" class="accordion-collapse collapse" data-bs-parent="#article-list">
                        <div class="accordion-body knowledge-item-content">
                            <div class="d-flex justify-content-between align-items-center mb-3">
                                <small class="text-muted">Создано: ${date}</small>
                                <div>
                                    <button class="btn btn-warning btn-sm btn-edit" data-id="${articleId}">
                                        <i class="bi bi-pencil me-1"></i> Редактировать
                                    </button>
                                    <button class="btn btn-danger btn-sm btn-delete" data-id="${articleId}" data-name="${safeText(article.title)}">
                                        <i class="bi bi-trash me-1"></i> Удалить
                                    </button>
                                </div>
                            </div>
                            <div class="knowledge-content-display" id="content-${articleId}">
                                Загрузка...
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // --- Поиск (с задержкой) ---
    let debounceTimer;
    searchBar.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        const searchTerm = e.target.value;
        debounceTimer = setTimeout(() => {
            fetchArticles(searchTerm);
        }, 300);
    });
    
    // --- (ИСПРАВЛЕНО) Загрузка полного текста статьи при открытии ---
    articleList.addEventListener('show.bs.collapse', async (event) => {
        const articleId = event.target.id.replace('collapse-', '');
        const contentDisplay = document.getElementById(`content-${articleId}`);
        
        // (ИСПРАВЛЕНО) Проверяем textContent и trim()
        if (contentDisplay.textContent.trim() !== 'Загрузка...') {
            return; // Уже загружено
        }
        
        try {
            const response = await fetch(`${API_URL}/${articleId}`); 
            if (!response.ok) throw new Error('Не удалось загрузить статью');
            const article = await response.json();
            // (ИСПРАВЛЕНО) Используем <pre> и safeText
            const safeContent = article.content ? safeText(article.content) : '<i>Нет содержимого</i>';
            contentDisplay.innerHTML = `<pre class="products-display">${safeContent}</pre>`;
        } catch (error) {
            contentDisplay.innerHTML = `<p class="text-danger">${error.message}</p>`;
        }
    });

    // --- Логика модального окна "Добавить" ---
    openAddBtn.onclick = () => {
        articleForm.reset();
        document.getElementById('article_id').value = ''; 
        modalTitle.textContent = 'Добавить статью';
        modal.show();
    };
    
    // --- Логика "Редактировать" и "Удалить" ---
    articleList.addEventListener('click', async (e) => {
        const target = e.target;
        
        // Нажали "Редактировать"
        const editButton = target.closest('.btn-edit');
        if (editButton) {
            e.stopPropagation(); 
            const id = editButton.dataset.id;
            
            try {
                const response = await fetch(`${API_URL}/${id}`);
                if (!response.ok) throw new Error('Не удалось загрузить статью для редактирования');
                const article = await response.json();
                
                document.getElementById('article_id').value = article.id;
                document.getElementById('article_title').value = article.title;
                document.getElementById('article_content').value = article.content;
                modalTitle.textContent = 'Редактировать статью';
                modal.show();
                
            } catch (error) {
                alert(error.message);
            }
        }
        
        // Нажали "Удалить"
        const deleteButton = target.closest('.btn-delete');
        if (deleteButton) {
            e.stopPropagation(); 
            const id = deleteButton.dataset.id;
            const name = deleteButton.dataset.name;
            if (confirm(`Вы уверены, что хотите удалить статью "${name}"?`)) {
                try {
                    await fetch(`${API_URL}/${id}`, { method: 'DELETE' });
                    await fetchArticles(searchBar.value); 
                } catch (error) {
                    alert('Ошибка при удалении.');
                }
            }
        }
    });
    
    // --- Обработчик: Сохранение (Добавление/Редактирование) ---
    articleForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const id = document.getElementById('article_id').value;
        const title = document.getElementById('article_title').value;
        const content = document.getElementById('article_content').value;
        
        const url = id ? `${API_URL}/${id}` : API_URL;
        const method = id ? 'PUT' : 'POST';
        
        try {
            const response = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, content })
            });
            
            if (response.ok) {
                modal.hide();
                await fetchArticles(searchBar.value); 
            } else {
                 const result = await response.json();
                alert(`Ошибка: ${result.error}`);
            }
        } catch (error) {
            alert(`Ошибка сети: ${error.message}`);
        }
    });

    // --- Первоначальная загрузка ---
    fetchArticles();
});
