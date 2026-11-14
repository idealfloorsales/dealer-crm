/* IDEAL FLOOR CRM — scripts and selling benefits.
   Product claims in training-sales-data.js are grounded in the internal training content. */
document.addEventListener('DOMContentLoaded', () => {
    const source = window.IDEAL_SALES_PLAYBOOK;
    const root = document.querySelector('[data-training-panel="sales"]');
    if (!source || !root) return;

    const $ = id => document.getElementById(id);
    const esc = value => String(value ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    const favoriteKey = 'ideal_training_sales_favorites_v1';
    const allowedIds = new Set(source.scripts.map(item => item.id));
    let favorites = new Set();
    try {
        const stored = JSON.parse(localStorage.getItem(favoriteKey) || '[]');
        if (Array.isArray(stored)) favorites = new Set(stored.filter(id => allowedIds.has(id)));
    } catch (_) {}
    let category = 'Все';
    let query = '';
    let visible = 8;
    let noticeTimeout;

    function saveFavorites() {
        try { localStorage.setItem(favoriteKey, JSON.stringify([...favorites])); } catch (_) {}
    }

    function renderIntro() {
        $('sales-quick-script').textContent = source.quick;
        $('sales-benefits-grid').innerHTML = source.benefits.map(item => {
            return '<article class="sales-benefit-card">' +
                '<span class="sales-benefit-icon"><i class="bi ' + esc(item.icon) + '"></i></span>' +
                '<h3>' + esc(item.title) + '</h3>' +
                '<p>' + esc(item.benefit) + '</p>' +
                '<div class="sales-benefit-fact"><span>О чём рассказать</span><strong>' + esc(item.feature) + '</strong></div>' +
            '</article>';
        }).join('');
        $('sales-guardrails-list').innerHTML = source.limits.map(text => '<li>' + esc(text) + '</li>').join('');
        $('sales-playbook-source').textContent = source.source;
    }

    function filteredScripts() {
        const search = query.trim().toLocaleLowerCase('ru');
        return source.scripts.filter(item => {
            if (category === 'Избранное' && !favorites.has(item.id)) return false;
            if (category !== 'Все' && category !== 'Избранное' && item.category !== category) return false;
            if (!search) return true;
            const content = [item.category, item.title, item.script, item.why, item.after].join(' ').toLocaleLowerCase('ru');
            return content.includes(search);
        });
    }

    function renderFilters() {
        $('sales-category-row').innerHTML = source.categories.map(name => {
            const count = name === 'Все' ? source.scripts.length : name === 'Избранное'
                ? favorites.size : source.scripts.filter(item => item.category === name).length;
            return '<button type="button" class="' + (category === name ? 'is-active' : '') +
                '" data-sales-category="' + esc(name) + '" aria-pressed="' + String(category === name) +
                '">' + (name === 'Избранное' ? '<i class="bi bi-bookmark-heart"></i> ' : '') +
                esc(name) + ' <span class="sales-category-count">' + count + '</span></button>';
        }).join('');
    }

    function scriptCard(item) {
        const favorite = favorites.has(item.id);
        return '<article class="sales-script-card" data-sales-script-card="' + esc(item.id) + '">' +
            '<div class="sales-script-card-top"><span class="sales-script-category">' + esc(item.category) + '</span>' +
            '<button type="button" class="sales-favorite' + (favorite ? ' is-active' : '') +
            '" data-sales-favorite="' + esc(item.id) + '" aria-label="' + (favorite ? 'Убрать из избранного' : 'Добавить в избранное') +
            '" aria-pressed="' + String(favorite) + '" title="' + (favorite ? 'Убрать из избранного' : 'В избранное') +
            '"><i class="bi bi-' + (favorite ? 'bookmark-fill' : 'bookmark') + '"></i></button></div>' +
            '<h3>' + esc(item.title) + '</h3>' +
            '<div class="sales-script-label"><i class="bi bi-chat-quote"></i> Что сказать покупателю</div>' +
            '<blockquote class="sales-script-quote">' + esc(item.script) + '</blockquote>' +
            '<details class="sales-script-notes"><summary>Как использовать этот скрипт <i class="bi bi-chevron-down"></i></summary>' +
            '<div><strong>Почему работает</strong><p>' + esc(item.why) +
            '</p><strong>Следующий вопрос</strong><p>' + esc(item.after) + '</p></div></details>' +
            '<div class="sales-script-actions"><button class="sales-copy-btn" type="button" data-sales-copy="' + esc(item.id) +
            '"><i class="bi bi-copy"></i><span>Копировать скрипт</span></button>' +
            '<span class="sales-copy-hint">Для разговора или WhatsApp</span></div>' +
            '</article>';
    }

    function renderCards() {
        const items = filteredScripts();
        const shown = items.slice(0, visible);
        $('sales-result-count').textContent = 'Показано ' + shown.length + ' из ' + items.length + ' скриптов';
        $('sales-scripts-grid').innerHTML = items.length ? shown.map(scriptCard).join('') :
            '<div class="training-empty sales-empty"><i class="bi bi-search"></i><strong>Скрипты не найдены</strong><span>Измените поиск или категорию.</span></div>';
        $('sales-show-more').hidden = items.length <= visible;
        $('sales-show-more').textContent = 'Показать ещё ' + Math.min(8, items.length - visible) + ' скриптов';
    }

    function toast(message) {
        const host = $('sales-copy-message');
        host.textContent = message;
        host.classList.add('is-visible');
        clearTimeout(noticeTimeout);
        noticeTimeout = setTimeout(() => {
            host.classList.remove('is-visible');
            host.textContent = '';
        }, 2200);
    }

    async function copy(text) {
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(text);
                return true;
            }
            const buffer = document.createElement('textarea');
            buffer.value = text;
            buffer.setAttribute('readonly', '');
            buffer.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
            document.body.appendChild(buffer);
            buffer.select();
            const success = document.execCommand('copy');
            buffer.remove();
            return success;
        } catch (_) {
            return false;
        }
    }

    root.addEventListener('click', async event => {
        const categoryBtn = event.target.closest('[data-sales-category]');
        if (categoryBtn) {
            category = categoryBtn.dataset.salesCategory;
            visible = 8;
            renderFilters();
            renderCards();
            return;
        }

        const favoriteBtn = event.target.closest('[data-sales-favorite]');
        if (favoriteBtn) {
            const id = favoriteBtn.dataset.salesFavorite;
            if (!allowedIds.has(id)) return;
            if (favorites.has(id)) favorites.delete(id);
            else favorites.add(id);
            saveFavorites();
            renderFilters();
            if (category === 'Избранное') renderCards();
            else {
                const active = favorites.has(id);
                favoriteBtn.classList.toggle('is-active', active);
                favoriteBtn.setAttribute('aria-pressed', String(active));
                favoriteBtn.setAttribute('aria-label', active ? 'Убрать из избранного' : 'Добавить в избранное');
                favoriteBtn.title = active ? 'Убрать из избранного' : 'В избранное';
                favoriteBtn.querySelector('i').className = 'bi bi-' + (active ? 'bookmark-fill' : 'bookmark');
            }
            return;
        }

        const copyBtn = event.target.closest('[data-sales-copy]');
        if (copyBtn) {
            const id = copyBtn.dataset.salesCopy;
            const item = source.scripts.find(script => script.id === id);
            const content = id === 'quick' ? source.quick : item?.script;
            if (!content) return;
            const success = await copy(content);
            toast(success ? 'Скрипт скопирован' : 'Не удалось скопировать. Выделите текст вручную.');
            return;
        }

        if (event.target.closest('#sales-show-more')) {
            visible += 8;
            renderCards();
        }
    });

    $('sales-script-search').addEventListener('input', event => {
        query = event.target.value;
        visible = 8;
        renderCards();
    });

    renderIntro();
    renderFilters();
    renderCards();
});
