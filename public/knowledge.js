document.addEventListener('DOMContentLoaded', () => {
    const API_URL = '/api/knowledge';
    const $ = id => document.getElementById(id);
    const esc = value => String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
    const modules = [
        {id:'brand-basics',category:'Основы',icon:'bi-house-check',title:'Знакомство с IDEALfloor',lead:'База, которую менеджер должен знать перед разговором о продукте.',metrics:[['Класс','33 / 34'],['Толщина','8 мм'],['Текстура','EIR'],['Замки','воск']],bullets:['IDEALfloor производит ламинат с 2010 года. Производство расположено в Китае и использует оборудование Homag и европейские технологии.','Основные классы износостойкости в учебном материале — 33 и 34.','Базовая толщина — 8 мм.','Ключевые особенности: U- и V-фаска, 3D-текстура с синхронным тиснением EIR, восковая пропитка замков.']},
        {id:'structure',category:'Основы',icon:'bi-layers',title:'Как устроен ламинат',lead:'Четыре слоя и назначение каждого.',metrics:[['Слоёв','4'],['HDF','860 кг/м³'],['Основа','HDF'],['Декор','бумага']],bullets:['Верхний защитный слой — меламиновая плёнка, устойчивая к давлению и физическим воздействиям.','Декоративный слой — бумага с рисунком декора.','Несущий слой — HDF-плита с замком; в материале указана плотность 860 кг/м³.','Нижний стабилизирующий слой имеет фирменный оттиск.']},
        {id:'installation',category:'Монтаж',icon:'bi-tools',title:'Подготовка и укладка',lead:'Что нужно объяснить до начала монтажа.',metrics:[['Акклиматизация','48 ч'],['Температура','18–24°C'],['Влажность','40–60%'],['Зазор','8–10 мм']],bullets:['Основание должно быть чистым, сухим, прочным и стабильным.','Ровность основания: в пределах 2 мм на 1 м; допустимые отклонения по высоте — до 3 мм на 1 м.','Подложка — не менее 2 мм, с влагозащитой при укладке на бетон.','Акклиматизация — 48 часов при 18–24°C и влажности 40–60%.','Компенсационный зазор между ламинатом и стенами — 8–10 мм.','Рекомендуемое направление — вдоль источника света или по длинной стороне помещения.']},
        {id:'england',category:'Коллекции',icon:'bi-grid-3x3-gap',title:'ENGLAND HERRINGBONE',lead:'Английская ёлочка отдельными планками.',metrics:[['Размер','600×100×8'],['Класс','34 / AC6'],['Упаковка','1,8 м²'],['Планок','30']],bullets:['Размер планки: 600×100×8 мм.','Класс: 34 / AC6.','Упаковка: 1,8 м²; 30 планок — 15 A + 15 B.','SingleClick, фаска 4V, EIR, HDF 860 кг/м³, E1.','В учебном материале показаны разные схемы укладки: прямая ёлка, тройная, квадрат, 2+1, кирпич и палуба.']},
        {id:'royal',category:'Коллекции',icon:'bi-gem',title:'ROYAL PARQUET',lead:'Модульный художественный ламинат с эффектом классического паркета.',metrics:[['Размер','1205×402×8'],['Класс','33 / AC5'],['Упаковка','2,91 м²'],['Фаска','4U']],bullets:['Размер: 1205×402×8 мм.','Класс: 33 / AC5.','Упаковка: 2,91 м²; 6 планок.','SingleClick, фаска 4U, EIR, HDF 860 кг/м³, E1.','Коллекция рассчитана на выразительный паркетный эффект в жилых и коммерческих интерьерах.']},
        {id:'herringbone',category:'Коллекции',icon:'bi-grid',title:'HERRINGBONE PARQUET',lead:'Модульные форматы английской ёлочки.',metrics:[['Класс','33 / AC5'],['Толщина','8 мм'],['Замок','SingleClick'],['HDF','860 кг/м³']],bullets:['В учебном материале представлены форматы 1206×402×8 мм и 1214×301×8 мм.','Класс: 33 / AC5.','SingleClick, EIR, HDF 860 кг/м³, E1.','В зависимости от формата используются фаски 4U или 2U.']},
        {id:'magic',category:'Коллекции',icon:'bi-stars',title:'MAGIC COLLECTION',lead:'Художественная коллекция на стыке английского и французского дизайна.',metrics:[['Размер','1206×402×8'],['Класс','33 / AC5'],['Упаковка','2,91 м²'],['Текстура','матовая']],bullets:['Размер: 1206×402×8 мм.','Класс: 33 / AC5.','Упаковка: 2,91 м²; 6 планок.','SingleClick, фаска 4U, матовая текстура, HDF 860 кг/м³, E1.']},
        {id:'french',category:'Коллекции',icon:'bi-bezier2',title:'FRENCH PARQUET',lead:'Французская ёлочка в двух модульных форматах.',metrics:[['Класс','33 / AC5'],['Толщина','8 мм'],['Фаска','4U'],['Текстура','EIR']],bullets:['Формат 1215×302×8 мм: 2,94 м², 8 планок — 4 A + 4 B.','Формат 1206×402×8 мм: 2,91 м².','Класс: 33 / AC5.','SingleClick, фаска 4U, EIR, HDF 860 кг/м³, E1.']},
        {id:'advantages',category:'Продажи',icon:'bi-patch-check',title:'Преимущества IDEALfloor',lead:'Как переводить технические характеристики в понятные аргументы.',metrics:[['Тёплый пол','до 28°C'],['Экокласс','E1'],['Текстура','EIR'],['Гарантия','до 30 лет']],bullets:['Восковая пропитка замков — дополнительная защита от влаги, упрощение монтажа и снижение риска скрипов.','EIR повторяет рельеф древесины и повышает реалистичность декора.','Эффект ручной обработки делает поверхность визуально более натуральной.','U-фаска имеет более плавную форму.','Совместимость с тёплым полом — до 28°C.','Экологический класс — E1.','В учебном материале указана гарантия до 30 лет для бытового и 15 лет для коммерческого применения.']},
        {id:'benefits',category:'Продажи',icon:'bi-chat-heart',title:'Язык выгод для покупателя',lead:'Говорим не только о характеристике, а о том, что получает клиент.',metrics:[['Формула','характеристика → выгода'],['Акцент','дизайн'],['Акцент','практичность'],['Акцент','срок службы']],bullets:['Художественный ламинат — визуальный эффект паркета.','3D-текстура и глубокое тиснение — красивый и тактильно приятный пол.','Восковая пропитка замков — дополнительная защита от влаги для кухни и входной зоны.','Стоимость — акцент на сроке службы и ценности качественного покрытия.']}
    ];
    const nomenclature = window.IDEAL_NOMENCLATURE || {products:[],collections:[],stats:{}};
    let catalogProducts = []; // Nothing is shown until the server confirms the product is active.
    let catalogCollections = [];
    let catalogLoadError = '';
    let catalogLoading = true;
    const completedKey = 'ideal_training_completed_v2';
    let completed = new Set(CRMUI.readStoredJSON(completedKey, [], Array.isArray).filter(value => typeof value === 'string'));
    let trainingCategory = 'Все';
    let trainingQuery = '';
    let allArticles = [];
    let canManageKnowledge = false;

    const articleList = $('article-list');
    const noDataMsg = $('no-data-msg');
    const searchBar = $('search-bar');
    const modalEl = $('article-modal');
    const modal = modalEl ? new bootstrap.Modal(modalEl) : null;
    const modalTitle = $('article-modal-title');
    const openAddBtn = $('open-add-article-btn');
    const articleForm = $('article-form');

    function updateHeroStats(){
        $('training-topics-count').textContent = modules.length;
        $('training-products-count').textContent = catalogLoading ? '…' : catalogProducts.length;
        $('training-collections-count').textContent = catalogLoading ? '…' : catalogCollections.length;
        $('catalog-count-badge').textContent = catalogLoading ? '…' : catalogProducts.length;
        const introCount=$('catalog-intro-count');
        if(introCount) introCount.textContent=catalogLoading ? 'Проверяем номенклатуру' : catalogProducts.length + ' позиций';
        const done = modules.filter(item => completed.has(item.id)).length;
        const percent = modules.length ? Math.round(done / modules.length * 100) : 0;
        $('training-progress-value').textContent = percent + '%';
        $('training-progress-label').textContent = done + ' из ' + modules.length + ' тем пройдено';
        $('training-progress-bar').style.width = percent + '%';
    }

    function renderCategories(){
        const categories = ['Все'].concat(Array.from(new Set(modules.map(item => item.category))));
        $('training-category-row').innerHTML = categories.map(category => '<button type="button" class="' + (category === trainingCategory ? 'is-active' : '') + '" data-training-category="' + esc(category) + '">' + esc(category) + '</button>').join('');
    }

    function trainingCard(item){
        const done = completed.has(item.id);
        return '<button class="training-card ' + (done ? 'is-complete' : '') + '" type="button" data-training-open="' + esc(item.id) + '">' +
            '<div class="training-card-top"><span class="training-card-icon"><i class="bi ' + esc(item.icon) + '"></i></span><span class="training-card-status">' + (done ? '<i class="bi bi-check2"></i> Пройдено' : esc(item.category)) + '</span></div>' +
            '<h3>' + esc(item.title) + '</h3><p>' + esc(item.lead) + '</p>' +
            '<div class="training-card-metrics">' + item.metrics.map(metric => '<span><small>' + esc(metric[0]) + '</small><strong>' + esc(metric[1]) + '</strong></span>').join('') + '</div>' +
            '<div class="training-card-footer"><span>Открыть тему</span><i class="bi bi-arrow-right"></i></div></button>';
    }

    function renderTraining(){
        const q = trainingQuery.trim().toLowerCase();
        const list = modules.filter(item => {
            const categoryOk = trainingCategory === 'Все' || item.category === trainingCategory;
            const haystack = [item.title,item.lead,item.category].concat(item.bullets).join(' ').toLowerCase();
            return categoryOk && (!q || haystack.includes(q));
        });
        $('training-grid').innerHTML = list.length ? list.map(trainingCard).join('') : '<div class="training-empty"><i class="bi bi-search"></i><strong>Ничего не найдено</strong><span>Измените фильтр или запрос.</span></div>';
    }

    function openTrainingTopic(id){
        const item = modules.find(module => module.id === id);
        if (!item) return;
        const done = completed.has(id);
        $('training-topic-body').innerHTML = '<div class="training-topic-kicker">' + esc(item.category) + '</div>' +
            '<h2 id="training-topic-title">' + esc(item.title) + '</h2><p class="training-topic-lead">' + esc(item.lead) + '</p>' +
            '<div class="training-topic-metrics">' + item.metrics.map(metric => '<div><small>' + esc(metric[0]) + '</small><strong>' + esc(metric[1]) + '</strong></div>').join('') + '</div>' +
            '<section class="training-topic-section"><h3>Что нужно запомнить</h3><ul>' + item.bullets.map(text => '<li>' + esc(text) + '</li>').join('') + '</ul></section>' +
            '<div class="training-topic-source"><i class="bi bi-file-earmark-text"></i><span>Источник: внутренний учебный материал IDEALfloor</span></div>' +
            '<button type="button" class="training-complete-btn ' + (done ? 'is-done' : '') + '" data-training-complete="' + esc(id) + '">' + (done ? '<i class="bi bi-check-circle-fill"></i> Тема пройдена' : '<i class="bi bi-check-circle"></i> Отметить как пройденную') + '</button>';
        $('training-topic-modal').classList.add('is-open');
        $('training-topic-modal').setAttribute('aria-hidden','false');
        document.body.classList.add('training-modal-open');
    }

    function closeTrainingTopic(){
        $('training-topic-modal').classList.remove('is-open');
        $('training-topic-modal').setAttribute('aria-hidden','true');
        document.body.classList.remove('training-modal-open');
    }

    async function setupCatalog(){
        const select=$('catalog-collection');
        const skuKey = value => String(value||'').trim().toUpperCase().replace(/Ё/g,'Е').replace(/\s+/g,'');
        $('catalog-grid').innerHTML='<div class="training-empty"><i class="bi bi-hourglass-split"></i><strong>Проверяем актуальные позиции…</strong></div>';
        try{
            if(window.CRMAuth?.ready) await CRMAuth.ready;
            const response=await fetch('/api/training/active-catalog',{cache:'no-store'});
            if(!response.ok)throw new Error('Не удалось загрузить актуальную номенклатуру');
            const data=await response.json();
            if(!Array.isArray(data.skus))throw new Error('Некорректный ответ справочника');
            const active=new Set(data.skus.map(skuKey));
            catalogProducts=(nomenclature.products || []).filter(row=>active.has(skuKey(row.s)));
            catalogCollections=[...new Set(catalogProducts.map(p=>String(p.c||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru'));
            catalogLoadError='';
        }catch(e){
            catalogProducts=[];
            catalogCollections=[];
            catalogLoadError='Не удалось проверить актуальность каталога. Позиции скрыты до восстановления соединения.';
        }finally{
            catalogLoading=false;
            select.innerHTML='<option value="">Все коллекции</option>'+catalogCollections.map(name=>'<option value="'+esc(name)+'">'+esc(name)+'</option>').join('');
            updateHeroStats();
            renderCatalog();
        }
    }

    function renderCatalog(){
        const query = $('catalog-search').value.trim().toLowerCase();
        const collection = $('catalog-collection').value;
        if(catalogLoading)return;
        if(catalogLoadError){
            $('catalog-summary').textContent=catalogLoadError;
            $('catalog-grid').innerHTML='<div class="training-empty"><i class="bi bi-wifi-off"></i><strong>Номенклатура пока недоступна</strong><span>'+esc(catalogLoadError)+'</span></div>';
            return;
        }
        const products = catalogProducts.filter(item => {
            if (collection && item.c !== collection) return false;
            const haystack = [item.c,item.s,item.n,item.d,item.p,item.q,item.k,item.b,item.t,item.ean,item.ntin].join(' ').toLowerCase();
            return !query || haystack.includes(query);
        });
        $('catalog-summary').textContent = 'Показано ' + products.length + ' из ' + catalogProducts.length + ' позиций';
        $('catalog-grid').innerHTML = products.length ? products.map(item => '<article class="catalog-card">' +
            '<div class="catalog-card-head"><span class="catalog-card-sku">' + esc(item.s) + '</span><span class="catalog-card-class">' + esc(item.k || '—') + '</span></div>' +
            '<h3>' + esc(item.n) + '</h3><div class="catalog-card-collection">' + esc(item.c) + '</div>' +
            '<div class="catalog-card-specs"><div><small>Размер</small><strong>' + esc(item.d) + ' мм</strong></div><div><small>Упаковка</small><strong>' + esc(item.p || '—') + '</strong></div><div><small>В упаковке</small><strong>' + esc(item.q || '—') + '</strong></div><div><small>Фаска / текстура</small><strong>' + esc((item.b || '—') + ' · ' + (item.t || '—')) + '</strong></div></div>' +
            '<div class="catalog-card-codes">EAN: ' + esc(item.ean || '—') + (item.ntin ? '<br>NTIN: ' + esc(item.ntin) : '') + '</div></article>').join('') : '<div class="training-empty"><i class="bi bi-search"></i><strong>Позиции не найдены</strong><span>Измените коллекцию или запрос.</span></div>';
    }

    function switchView(view){
        const available = [...document.querySelectorAll('[data-training-view]')];
        if (!available.some(button => button.dataset.trainingView === view)) return;
        available.forEach(button => {
            const selected = button.dataset.trainingView === view;
            button.classList.toggle('is-active', selected);
            button.setAttribute('aria-selected', String(selected));
            button.tabIndex = selected ? 0 : -1;
        });
        document.querySelectorAll('[data-training-panel]').forEach(panel => {
            panel.classList.toggle('is-active', panel.dataset.trainingPanel === view);
        });
    }

    async function fetchArticles(searchTerm = ''){
        if (!articleList) return;
        try{
            const response = await fetch(API_URL + '?search=' + encodeURIComponent(searchTerm));
            if (!response.ok) throw new Error('Ошибка сети при загрузке материалов');
            allArticles = await response.json();
            allArticles.sort((a,b) => a.title.localeCompare(b.title,'ru'));
            renderArticles(allArticles);
        }catch(error){
            articleList.innerHTML = '<p class="text-danger">' + esc(error.message) + '</p>';
        }
    }

    function renderArticles(articles){
        if (!articles.length){
            articleList.innerHTML = '';
            noDataMsg.style.display = 'block';
            noDataMsg.textContent = 'Материалы не найдены.';
            return;
        }
        noDataMsg.style.display = 'none';
        articleList.innerHTML = articles.map(article => {
            const articleId = article.id;
            const collapseId = 'collapse-' + articleId;
            const headerId = 'header-' + articleId;
            const date = new Date(article.createdAt).toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric'});
            return '<div class="accordion-item knowledge-item"><h2 class="accordion-header" id="' + esc(headerId) + '"><button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#' + esc(collapseId) + '">' + esc(article.title) + '</button></h2>' +
                '<div id="' + esc(collapseId) + '" class="accordion-collapse collapse" data-bs-parent="#article-list"><div class="accordion-body knowledge-item-content"><div class="d-flex justify-content-between align-items-center gap-2 flex-wrap mb-3"><small class="text-muted">Создано: ' + esc(date) + '</small>' +
                (canManageKnowledge ? '<div><button class="btn btn-warning btn-sm btn-edit me-1" data-id="' + esc(articleId) + '"><i class="bi bi-pencil me-1"></i>Редактировать</button><button class="btn btn-danger btn-sm btn-delete" data-id="' + esc(articleId) + '" data-name="' + esc(article.title) + '"><i class="bi bi-trash me-1"></i>Удалить</button></div>' : '') +
                '</div><div class="knowledge-content-display" id="content-' + esc(articleId) + '">Загрузка...</div></div></div></div>';
        }).join('');
    }

    document.addEventListener('click', async event => {
        const tab = event.target.closest('[data-training-view]');
        if (tab){
            const view = tab.dataset.trainingView;
            switchView(view);
            try { history.replaceState(null, '', location.pathname + location.search + '#' + view); } catch (_) {}
            return;
        }
        const category = event.target.closest('[data-training-category]');
        if (category){ trainingCategory = category.dataset.trainingCategory; renderCategories(); renderTraining(); return; }
        const openTopic = event.target.closest('[data-training-open]');
        if (openTopic){ openTrainingTopic(openTopic.dataset.trainingOpen); return; }
        if (event.target.closest('[data-training-close]')){ closeTrainingTopic(); return; }
        const complete = event.target.closest('[data-training-complete]');
        if (complete){
            const id = complete.dataset.trainingComplete;
            if (completed.has(id)) completed.delete(id); else completed.add(id);
            localStorage.setItem(completedKey, JSON.stringify(Array.from(completed)));
            updateHeroStats(); renderTraining(); openTrainingTopic(id); return;
        }
    });

    $('training-search').addEventListener('input', event => { trainingQuery = event.target.value; renderTraining(); });
    $('catalog-search').addEventListener('input', renderCatalog);
    $('catalog-collection').addEventListener('change', renderCatalog);
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') { closeTrainingTopic(); return; }
        const tab = event.target.closest?.('[data-training-view][role="tab"]');
        if (!tab || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
        const tabs = [...document.querySelectorAll('[data-training-view][role="tab"]')];
        const index = tabs.indexOf(tab);
        if (index < 0 || !tabs.length) return;
        const target = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
            : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
        event.preventDefault();
        switchView(tabs[target].dataset.trainingView);
        tabs[target].focus();
    });

    if (articleList){
        articleList.addEventListener('show.bs.collapse', async event => {
            const articleId = event.target.id.replace('collapse-','');
            const contentDisplay = $('content-' + articleId);
            if (!contentDisplay || contentDisplay.textContent.trim() !== 'Загрузка...') return;
            try{
                const response = await fetch(API_URL + '/' + articleId);
                if (!response.ok) throw new Error('Не удалось загрузить материал');
                const article = await response.json();
                contentDisplay.textContent = article.content || 'Нет содержимого';
            }catch(error){ contentDisplay.innerHTML = '<p class="text-danger">' + esc(error.message) + '</p>'; }
        });

        articleList.addEventListener('click', async event => {
            const editButton = event.target.closest('.btn-edit');
            if (editButton){
                event.stopPropagation(); if (!canManageKnowledge) return;
                try{
                    const response = await fetch(API_URL + '/' + editButton.dataset.id);
                    if (!response.ok) throw new Error('Не удалось загрузить материал для редактирования');
                    const article = await response.json();
                    $('article_id').value = article.id;
                    $('article_title').value = article.title;
                    $('article_content').value = article.content;
                    modalTitle.textContent = 'Редактировать материал';
                    modal.show();
                }catch(error){ alert(error.message); }
                return;
            }
            const deleteButton = event.target.closest('.btn-delete');
            if (deleteButton){
                event.stopPropagation(); if (!canManageKnowledge) return;
                if (!confirm('Удалить материал «' + deleteButton.dataset.name + '»?')) return;
                try{
                    const response = await fetch(API_URL + '/' + deleteButton.dataset.id,{method:'DELETE'});
                    if (!response.ok) throw new Error('Не удалось удалить материал');
                    await fetchArticles(searchBar.value);
                }catch(error){ alert(error.message); }
            }
        });
    }

    if (searchBar){
        let debounceTimer;
        searchBar.addEventListener('input', event => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => fetchArticles(event.target.value), 300);
        });
    }

    if (openAddBtn){
        openAddBtn.onclick = () => {
            if (!canManageKnowledge) return;
            articleForm.reset(); $('article_id').value = '';
            modalTitle.textContent = 'Добавить материал'; modal.show();
        };
    }

    if (articleForm){
        articleForm.addEventListener('submit', async event => {
            event.preventDefault(); if (!canManageKnowledge) return;
            const id = $('article_id').value;
            const url = id ? API_URL + '/' + id : API_URL;
            const method = id ? 'PUT' : 'POST';
            try{
                const response = await fetch(url,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify({title:$('article_title').value,content:$('article_content').value})});
                if (!response.ok){ const result = await response.json().catch(() => ({})); throw new Error(result.error || 'Не удалось сохранить материал'); }
                modal.hide(); await fetchArticles(searchBar.value);
            }catch(error){ alert(error.message); }
        });
    }

    renderCategories();
    renderTraining();
    setupCatalog();
    updateHeroStats();
    // Allow direct links like /knowledge.html#sales without changing the main navigation.
    const requestedView = String(window.location.hash || '').replace(/^#/, '');
    if (requestedView) switchView(requestedView);

    (async () => {
        if (window.CRMAuth && CRMAuth.ready) await CRMAuth.ready;
        canManageKnowledge = window.CRMAuth ? CRMAuth.can('can_manage_knowledge') : false;
        if (openAddBtn) openAddBtn.style.display = canManageKnowledge ? '' : 'none';
        await fetchArticles();
    })();
});
