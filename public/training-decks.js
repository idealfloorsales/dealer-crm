document.addEventListener('DOMContentLoaded', async function () {
    const API_URL = '/api/knowledge';
    const DECK_PREFIX = '[IDEAL-КУРС] ';
    const BASE_ID = 'ideal-holding-blitz';
    const SCHEMA = 'ideal.training.deck.v1';
    const root = document.getElementById('training-decks-root');
    if (!root) return;

    const esc = value => String(value == null ? '' : value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
    const clone = value => JSON.parse(JSON.stringify(value));
    const splitLines = value => String(value || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    let canManage = false;
    let recordsByDeckId = {};
    let decks = [];
    let baseDeleted = false;
    let currentDeck = null;
    let currentSlideIndex = 0;
    let editingDeck = null;
    let editingRecord = null;
    let noticeText = '';
    let completedDecks = new Set();

    try {
        const saved = JSON.parse(localStorage.getItem('ideal_training_decks_done') || '[]');
        if (Array.isArray(saved)) completedDecks = new Set(saved.filter(item => typeof item === 'string'));
    } catch (_) {}

    const defaultDeck = {
        id: BASE_ID,
        category: 'Блиц-обучение',
        title: 'Блиц-обучение по продукции IDEAL HOLDING',
        description: 'За один день — от знакомства с ассортиментом к уверенной консультации, подбору комплекта и практическому блиц-экзамену.',
        slides: [
            {kicker:'БЛИЦ-ОБУЧЕНИЕ · IDEAL HOLDING',title:'От продукта — к уверенной консультации',subtitle:'Шоурум • один учебный день • 6 часов',bullets:['30% теории и 70% работы с образцами.','Цель — не заучить весь каталог, а научиться подбирать решение под задачу клиента.','На финише сотрудник умеет объяснить разницу, собрать комплект и уверенно провести консультацию.'],diagram:{type:'steps',items:[{label:'6 часов',detail:'практического обучения'},{label:'30%',detail:'теория'},{label:'70%',detail:'работа с образцами'}]}},
            {kicker:'МАРШРУТ ДНЯ',title:'Шесть этапов — от брендов к практике',subtitle:'Темы идут по нарастающей: сначала ассортимент, затем подбор и продажа.',bullets:['10:00–10:20 — бренды IDEAL, DECONIKA и IDEAL PROFIL.','10:20–11:20 — плинтусы и комплектующие.','11:20–12:40 — пороги и профили.','12:40–13:20 — алюминиевые профили IDEAL PROFIL.','14:00–15:30 — консультация и комплексная продажа.','15:30–16:00 — блиц-экзамен по практическим кейсам.'],diagram:{type:'flow',items:[{label:'Бренды',detail:'20 мин'},{label:'Плинтусы',detail:'60 мин'},{label:'Пороги и профили',detail:'80 мин'},{label:'IDEAL PROFIL',detail:'40 мин'},{label:'Продажа',detail:'90 мин'},{label:'Блиц-экзамен',detail:'30 мин'}]}},
            {kicker:'01 · ВВЕДЕНИЕ',title:'Три бренда — одна система решений',subtitle:'Начинайте с задачи клиента и подбирайте подходящий продукт из нужной линейки.',bullets:['IDEAL — широкий ассортимент ПВХ: плинтусы, пороги, наличники, обводы и профили.','DECONIKA — современные ПВХ-плинтусы, углы и профили для плитки, кабель-каналы.','IDEAL PROFIL — алюминиевые профили и пороги для стыков и защиты.'],diagram:{type:'grid',items:[{label:'IDEAL',detail:'ПВХ · широкий ассортимент'},{label:'DECONIKA',detail:'ПВХ · дизайн и монтажные решения'},{label:'IDEAL PROFIL',detail:'Алюминий · стыки и защита'}]}},
            {kicker:'02 · ПЛИНТУСЫ IDEAL',title:'Сначала форма и система — потом артикул',subtitle:'Подбор начинается с интерьера и способа монтажа, а не со списка кодов.',bullets:['Покажите разницу между фигурной, прямоугольной и округлой формой.','Обратите внимание на мягкие края и прилегание к стене и полу.','Спросите, какие углы, соединители, торцы и крепёж нужны на объекте.','Продавайте готовую систему, а не только планки плинтуса.'],diagram:{type:'flow',items:[{label:'Плинтус',detail:'форма и высота'},{label:'Углы',detail:'внутренние и наружные'},{label:'Соединители',detail:'стыки'},{label:'Торцы',detail:'левый и правый'},{label:'Крепёж',detail:'под монтаж'}]}},
            {kicker:'03 · ПЛИНТУСЫ DECONIKA',title:'Плинтус как современная монтажная система',subtitle:'Покажите конструкцию, декор и комплектующие на реальном образце.',bullets:['Высоты: 55, 70, 85 и 100 мм; длина планки — 2,2 м.','Монтажный профиль имеет перфорацию для установки.','В комплект входят внутренний и наружный угол, соединитель и торцевая.','Практика: сотрудник должен самостоятельно собрать монтажный узел.'],diagram:{type:'grid',items:[{label:'55 мм',detail:'компактный формат'},{label:'70 мм',detail:'универсальная высота'},{label:'85 мм',detail:'выразительный профиль'},{label:'100 мм',detail:'акцентный формат'}]}},
            {kicker:'04 · ЗАВЕРШЕНИЕ ИНТЕРЬЕРА',title:'Пороги, наличники и обводы — часть законченного решения',subtitle:'Уточняйте весь узел: материал, размеры, место монтажа и комплектующие.',bullets:['Пороги: Изи 30/36 мм; монтажный канал 36/42 мм; длина 0,9 или 1,6 м.','Наличники подбирают по ширине проёма и стилю оформления.','Обводы закрывают места выхода труб из пола, стены или потолка.','Спросите клиента о диаметре труб и количестве точек.'],diagram:{type:'grid',items:[{label:'Порог',detail:'закрывает стык покрытий'},{label:'Наличник',detail:'оформляет дверной проём'},{label:'Обвод трубы',detail:'закрывает место выхода'}]}},
            {kicker:'05 · УГЛЫ И ПЛИТКА',title:'Размер профиля выбирают по задаче и толщине материала',subtitle:'Главный уточняющий вопрос: «Какая фактическая толщина плитки?»',bullets:['Углы DECONIKA: 15×15, 22×22 и 30×30 мм; длина 2,7 м.','Профили для плитки: 8, 10 и 12 мм; длина 2,7 м.','Сверьте выбранный размер с толщиной плитки и типом угла.'],diagram:{type:'flow',items:[{label:'Толщина плитки',detail:'уточнить у клиента'},{label:'Тип угла',detail:'внешний или внутренний'},{label:'Высота профиля',detail:'8 / 10 / 12 мм'},{label:'Цвет и отделка',detail:'согласовать с интерьером'}]}},
            {kicker:'06 · IDEAL PROFIL',title:'Алюминиевые профили: учим по форме и назначению',subtitle:'Дайте сотруднику образец в руки: назвать профиль и показать, какую задачу он решает.',bullets:['T-профили: T20 20×7, T13 13×8 и T10 10×8 мм; длина 2,7 м.','L / TL: L 16×6, TL 15×26, L10 / L15 / L20; длина 2,7 м.','Пороги S09 и S18 — 37×3,3 мм, длина 0,9 м.','SR40 — 40×20 мм, алюминий с резиновой вставкой, длина 2,7 м.'],diagram:{type:'grid',items:[{label:'T',detail:'профиль для стыка'},{label:'L / TL',detail:'край и переход'},{label:'S09 / S18',detail:'алюминиевый порог'},{label:'SR40',detail:'алюминий + резина'}]}},
            {kicker:'07 · ДОПОЛНИТЕЛЬНЫЙ АССОРТИМЕНТ',title:'Не учим каждый артикул — учим распознавать задачу',subtitle:'Важно знать, что решение существует, и быстро найти его в ассортименте.',bullets:['SPC «Керама» — стеновая отделка с соединением шип-паз; форматы 185×580 и 310×580 мм.','Кабель-каналы: 15×10, 22×10 и 30×10 мм; длина 2,2 м.','В ассортименте также есть Ламини, плинтусы столешницы, бордюры, штукатурные профили и Fixus.'],diagram:{type:'grid',items:[{label:'SPC «Керама»',detail:'стеновая отделка'},{label:'Кабель-каналы',detail:'подбор по размеру'},{label:'Дополнительный ассортимент',detail:'Ламини · профили · Fixus'}]}},
            {kicker:'08 · ПРОДАЖА В ШОУРУМЕ',title:'Пять вопросов превращают каталог в консультацию',subtitle:'Не начинайте с артикула — сначала поймите задачу клиента.',bullets:['Что ремонтируете: пол, стены, дверь или кухню?','Какой материал уже выбран: ламинат, плитка, линолеум или другое?','Где будет использоваться: сухая, влажная или проходная зона?','Какие размеры важны: толщина плитки, высота плинтуса, длина стыка?','Какой стиль и цвет нужны: в тон, контраст, белый или металл?','После уточнения покажите до трёх вариантов: оптимальный, доступнее и дизайнерский.'],diagram:{type:'steps',items:[{label:'Задача',detail:'что ремонтируют'},{label:'Материал',detail:'что уже выбрано'},{label:'Условия',detail:'где будет использоваться'},{label:'Размеры',detail:'что нужно измерить'},{label:'Стиль',detail:'какой цвет и эффект'}]}},
            {kicker:'09 · КОМПЛЕКСНАЯ ПРОДАЖА',title:'Продаём не позицию — продаём законченный узел',subtitle:'Три практических сценария для отработки вслух.',bullets:['Плинтус: плинтус + углы + соединители + торцы + крепёж.','Плитка: толщина плитки + тип угла + профиль + цвет.','Стык пола: покрытия + перепад высоты + длина + порог.','Уточняющие вопросы: сколько углов; какая толщина плитки; есть ли перепад по высоте?'],diagram:{type:'flow',items:[{label:'Задача клиента',detail:'что требуется завершить'},{label:'Уточнение',detail:'материал · размер · условия'},{label:'Комплект',detail:'основа + комплектующие'},{label:'Проверка',detail:'всё ли нужно для монтажа'}]}},
            {kicker:'10 · ФИНАЛ',title:'Блиц-экзамен: пять практических кейсов',subtitle:'Проверяем не память, а умение подобрать решение и объяснить выбор.',bullets:['Плинтус 70 мм — собрать полный комплект.','Соединить ламинат и плитку — предложить подходящий порог.','Плитка 10 мм — подобрать профиль и объяснить выбор.','Защитить внешний угол стены — предложить два варианта.','Спрятать провод — выбрать кабель-канал и размер.','Сотрудник готов к работе, если задаёт правильные вопросы, подбирает комплект и уверенно объясняет выбор.'],diagram:{type:'grid',items:[{label:'Подобрать',detail:'товар под задачу'},{label:'Собрать',detail:'полный комплект'},{label:'Объяснить',detail:'почему это решение подходит'}]}}
        ]
    };

    function parseDeck(content) {
        try {
            const value = JSON.parse(String(content || ''));
            if (!value || value.schema !== SCHEMA || typeof value.deckId !== 'string') return null;
            return value;
        } catch (_) { return null; }
    }

    function sortStamp(article) {
        const value = new Date(article.updatedAt || article.createdAt || 0).getTime();
        return Number.isFinite(value) ? value : 0;
    }

    async function requestJson(url, options) {
        const response = await fetch(url, Object.assign({credentials:'same-origin',cache:'no-store'}, options || {}));
        if (!response.ok) {
            const problem = await response.json().catch(() => ({}));
            throw new Error(problem.error || 'Не удалось выполнить действие');
        }
        if (response.status === 204) return null;
        return response.json().catch(() => null);
    }

    async function loadDecks() {
        noticeText = '';
        try {
            const list = await requestJson(API_URL + '?search=');
            const candidates = Array.isArray(list) ? list.filter(article => String(article.title || '').startsWith(DECK_PREFIX)) : [];
            const full = await Promise.all(candidates.map(async article => {
                if (article.content) return article;
                try { return await requestJson(API_URL + '/' + encodeURIComponent(article.id)); }
                catch (_) { return null; }
            }));
            recordsByDeckId = {};
            full.filter(Boolean).forEach(article => {
                const payload = parseDeck(article.content);
                if (!payload) return;
                const previous = recordsByDeckId[payload.deckId];
                if (!previous || sortStamp(article) >= sortStamp(previous.article)) recordsByDeckId[payload.deckId] = {article:article,payload:payload};
            });
        } catch (error) {
            noticeText = 'Не удалось загрузить сохранённые уроки. Проверьте соединение и обновите страницу.';
            recordsByDeckId = {};
        }

        const baseRecord = recordsByDeckId[BASE_ID];
        baseDeleted = Boolean(baseRecord && baseRecord.payload.kind === 'tombstone');
        const nextDecks = [];
        if (!baseDeleted) {
            nextDecks.push(baseRecord && baseRecord.payload.kind === 'deck' ? Object.assign({}, baseRecord.payload.deck, {id:BASE_ID}) : clone(defaultDeck));
        }
        Object.keys(recordsByDeckId).forEach(id => {
            const record = recordsByDeckId[id];
            if (id === BASE_ID || record.payload.kind !== 'deck' || !record.payload.deck) return;
            nextDecks.push(Object.assign({}, record.payload.deck, {id:id}));
        });
        decks = nextDecks.sort((a,b) => a.id === BASE_ID ? -1 : b.id === BASE_ID ? 1 : a.title.localeCompare(b.title,'ru'));
        renderRoot();
    }

    function deckCard(deck) {
        const saved = completedDecks.has(deck.id);
        const record = recordsByDeckId[deck.id];
        const controls = canManage ? '<div class="ideal-deck-card-actions"><button type="button" data-deck-edit="' + esc(deck.id) + '"><i class="bi bi-pencil"></i><span>Редактировать</span></button><button type="button" class="is-danger" data-deck-delete="' + esc(deck.id) + '"><i class="bi bi-trash3"></i><span>Удалить</span></button></div>' : '';
        const slideCount = Array.isArray(deck.slides) ? deck.slides.length : 0;
        return '<article class="ideal-deck-card ' + (saved ? 'is-complete' : '') + '"><div class="ideal-deck-card-icon"><i class="bi bi-easel2"></i></div><div class="ideal-deck-card-content"><div class="ideal-deck-card-meta"><span>' + esc(deck.category || 'Обучение') + '</span><span><i class="bi bi-file-slides"></i> ' + slideCount + ' слайдов</span>' + (saved ? '<span class="ideal-deck-done"><i class="bi bi-check-circle-fill"></i> Пройдено</span>' : '') + '</div><h3>' + esc(deck.title) + '</h3><p>' + esc(deck.description || '') + '</p><div class="ideal-deck-card-bottom"><button type="button" class="ideal-deck-open-btn" data-deck-open="' + esc(deck.id) + '"><span>Начать обучение</span><i class="bi bi-arrow-up-right"></i></button>' + controls + '</div></div></article>';
    }

    function renderRoot() {
        const restore = canManage && baseDeleted ? '<button type="button" class="ideal-deck-restore" data-deck-restore><i class="bi bi-arrow-counterclockwise"></i><span>Восстановить исходную презентацию</span></button>' : '';
        const add = canManage ? '<button type="button" class="ideal-deck-create" data-deck-add><i class="bi bi-plus-lg"></i><span>Новый урок</span></button>' : '';
        const message = noticeText ? '<div class="ideal-deck-notice" role="status"><i class="bi bi-wifi-off"></i><span>' + esc(noticeText) + '</span></div>' : '';
        const cards = decks.length ? '<div class="ideal-deck-grid">' + decks.map(deckCard).join('') + '</div>' : '<div class="ideal-deck-empty"><i class="bi bi-easel"></i><strong>Пока нет учебных презентаций</strong><span>Добавьте урок, чтобы команда могла пройти его по шагам.</span></div>';
        root.innerHTML = '<section class="ideal-deck-library"><div class="ideal-deck-library-head"><div><span class="ideal-deck-eyebrow">УЧЕБНЫЕ ПРЕЗЕНТАЦИИ</span><h2>Уроки по шагам</h2><p>Короткие объяснения, наглядные схемы и практические кейсы для работы в шоуруме.</p></div><div class="ideal-deck-head-actions">' + restore + add + '</div></div>' + message + cards + '</section>';
    }

    function diagramItemsText(items) {
        return (Array.isArray(items) ? items : []).map(item => {
            if (typeof item === 'string') return item;
            return String(item.label || '') + (item.detail ? ' | ' + item.detail : '');
        }).join('\n');
    }

    function parseDiagramItems(value) {
        return splitLines(value).map(line => {
            const divider = line.indexOf('|');
            return {label:(divider < 0 ? line : line.slice(0,divider)).trim(),detail:divider < 0 ? '' : line.slice(divider + 1).trim()};
        }).filter(item => item.label);
    }

    function closeEditor() {
        const editor = document.getElementById('ideal-deck-editor');
        if (editor) editor.classList.remove('is-open');
        document.body.classList.remove('ideal-deck-editor-open');
        editingDeck = null;
        editingRecord = null;
    }

    function editorSlide(slide, index, total) {
        const diagram = slide.diagram || {type:'flow',items:[]};
        const options = [['flow','Последовательность'],['steps','Шаги'],['grid','Карточки'],['none','Без схемы']];
        return '<section class="ideal-deck-edit-slide" data-slide-index="' + index + '"><header><div><span>СЛАЙД ' + String(index + 1).padStart(2,'0') + '</span><strong>' + esc(slide.title || 'Новый слайд') + '</strong></div><div class="ideal-deck-slide-tools"><button type="button" data-slide-up="' + index + '" aria-label="Переместить выше" ' + (index === 0 ? 'disabled' : '') + '><i class="bi bi-arrow-up"></i></button><button type="button" data-slide-down="' + index + '" aria-label="Переместить ниже" ' + (index === total - 1 ? 'disabled' : '') + '><i class="bi bi-arrow-down"></i></button><button type="button" class="is-danger" data-slide-remove="' + index + '" aria-label="Удалить слайд"><i class="bi bi-trash3"></i></button></div></header><div class="ideal-deck-edit-grid"><label>Номер / раздел<input class="form-control" data-field="kicker" value="' + esc(slide.kicker || '') + '" placeholder="Например: 02 · Плинтусы"></label><label>Заголовок слайда<input class="form-control" data-field="title" value="' + esc(slide.title || '') + '" required placeholder="Короткий и понятный заголовок"></label><label class="is-wide">Объяснение<textarea class="form-control" data-field="subtitle" rows="2" placeholder="Одна мысль, которую менеджер должен понять">' + esc(slide.subtitle || '') + '</textarea></label><label class="is-wide">Ключевые пункты<textarea class="form-control" data-field="bullets" rows="4" placeholder="Каждый пункт — с новой строки">' + esc((slide.bullets || []).join('\n')) + '</textarea><small>Добавляйте один тезис на строку — в уроке они станут отдельными пунктами.</small></label><label>Вид схемы<select class="form-select" data-field="diagramType">' + options.map(option => '<option value="' + option[0] + '" ' + ((diagram.type || 'flow') === option[0] ? 'selected' : '') + '>' + option[1] + '</option>').join('') + '</select></label><label class="is-wide">Элементы схемы<textarea class="form-control" data-field="diagramItems" rows="3" placeholder="Один элемент на строку. Для пояснения используйте: Название | Короткое пояснение">' + esc(diagramItemsText(diagram.items)) + '</textarea><small>Например: Плинтус | основа → Углы | комплектующие → Готовый узел</small></label></div></section>';
    }

    function renderEditor() {
        const editor = document.getElementById('ideal-deck-editor');
        if (!editor || !editingDeck) return;
        editor.innerHTML = '<div class="ideal-deck-editor-backdrop" data-editor-close></div><section class="ideal-deck-editor-panel" role="dialog" aria-modal="true" aria-labelledby="ideal-deck-editor-title"><header class="ideal-deck-editor-head"><div><span class="ideal-deck-eyebrow">КОНСТРУКТОР ОБУЧЕНИЯ</span><h2 id="ideal-deck-editor-title">' + (editingRecord || editingDeck.id === BASE_ID ? 'Редактировать урок' : 'Новый урок') + '</h2></div><button type="button" class="ideal-deck-close" data-editor-close aria-label="Закрыть"><i class="bi bi-x-lg"></i></button></header><form id="ideal-deck-editor-form"><div class="ideal-deck-editor-body"><div class="ideal-deck-edit-basics"><label>Название урока<input class="form-control" name="deckTitle" value="' + esc(editingDeck.title || '') + '" required maxlength="120" placeholder="Например: Подбор плинтуса"></label><label>Короткое описание<textarea class="form-control" name="deckDescription" rows="2" maxlength="500" placeholder="Для кого этот урок и чему он научит">' + esc(editingDeck.description || '') + '</textarea></label></div><div class="ideal-deck-editor-slides" id="ideal-deck-editor-slides">' + (editingDeck.slides || []).map((slide,index)=>editorSlide(slide,index,editingDeck.slides.length)).join('') + '</div><button type="button" class="ideal-deck-add-slide" data-slide-add><i class="bi bi-plus-lg"></i><span>Добавить слайд</span></button></div><footer class="ideal-deck-editor-footer"><button type="button" class="ideal-deck-cancel" data-editor-close>Отмена</button><button type="submit" class="ideal-deck-save"><i class="bi bi-check2"></i><span>Сохранить урок</span></button></footer></form></section>';
        editor.classList.add('is-open');
        document.body.classList.add('ideal-deck-editor-open');
    }

    function captureEditor() {
        const editor = document.getElementById('ideal-deck-editor');
        if (!editor || !editingDeck) return;
        const titleInput = editor.querySelector('[name="deckTitle"]');
        const descriptionInput = editor.querySelector('[name="deckDescription"]');
        editingDeck.title = titleInput ? titleInput.value.trim() : editingDeck.title;
        editingDeck.description = descriptionInput ? descriptionInput.value.trim() : editingDeck.description;
        editingDeck.slides = Array.from(editor.querySelectorAll('.ideal-deck-edit-slide')).map((card,index) => {
            const field = name => card.querySelector('[data-field="' + name + '"]');
            const diagramType = field('diagramType');
            return {
                kicker:field('kicker').value.trim(),
                title:field('title').value.trim(),
                subtitle:field('subtitle').value.trim(),
                bullets:splitLines(field('bullets').value),
                diagram:{type:diagramType.value,items:parseDiagramItems(field('diagramItems').value)}
            };
        });
    }

    function openEditor(deck, record) {
        editingDeck = clone(deck);
        editingRecord = record || null;
        renderEditor();
        const panel = document.querySelector('.ideal-deck-editor-panel');
        if (panel) panel.scrollTop = 0;
    }

    function openNewDeck() {
        openEditor({id:'deck-' + Date.now().toString(36),category:'Обучение',title:'',description:'',slides:[{kicker:'01 · ТЕМА',title:'',subtitle:'',bullets:[],diagram:{type:'flow',items:[]}}]},null);
    }

    function renderDiagram(slide) {
        const diagram = slide.diagram || {};
        const type = ['flow','steps','grid'].includes(diagram.type) ? diagram.type : 'none';
        const items = Array.isArray(diagram.items) ? diagram.items : [];
        if (type === 'none' || !items.length) return '';
        return '<div class="ideal-deck-diagram ideal-deck-diagram-' + type + '" role="list">' + items.map((item,index) => '<div class="ideal-deck-diagram-item" role="listitem"><span class="ideal-deck-diagram-index">' + String(index + 1).padStart(2,'0') + '</span><strong>' + esc(item.label || '') + '</strong>' + (item.detail ? '<small>' + esc(item.detail) + '</small>' : '') + '</div>').join('') + '</div>';
    }

    function renderPresenter() {
        if (!currentDeck) return;
        const slides = Array.isArray(currentDeck.slides) ? currentDeck.slides : [];
        const total = slides.length;
        if (!total) { closePresenter(false); return; }
        currentSlideIndex = Math.max(0,Math.min(currentSlideIndex,total - 1));
        const slide = slides[currentSlideIndex];
        const progress = Math.round(((currentSlideIndex + 1) / total) * 100);
        const bullets = Array.isArray(slide.bullets) && slide.bullets.length ? '<ul class="ideal-deck-slide-bullets">' + slide.bullets.map(text => '<li>' + esc(text) + '</li>').join('') + '</ul>' : '';
        const presenter = document.getElementById('ideal-deck-presenter');
        presenter.innerHTML = '<header class="ideal-deck-presenter-head"><div class="ideal-deck-presenter-brand"><span class="ideal-deck-presenter-mark">IF</span><div><strong>IDEAL FLOOR · ОБУЧЕНИЕ</strong><small>' + esc(currentDeck.title) + '</small></div></div><div class="ideal-deck-presenter-actions">' + (canManage ? '<button type="button" data-presenter-edit><i class="bi bi-pencil"></i><span>Редактировать</span></button>' : '') + '<button type="button" class="ideal-deck-presenter-close" data-presenter-close aria-label="Закрыть"><i class="bi bi-x-lg"></i></button></div></header><div class="ideal-deck-presenter-progress"><span style="width:' + progress + '%"></span></div><main class="ideal-deck-presenter-stage"><article class="ideal-deck-slide"><div class="ideal-deck-slide-copy"><div class="ideal-deck-slide-kicker"><span>' + esc(slide.kicker || 'IDEAL HOLDING · ОБУЧЕНИЕ') + '</span><b>' + String(currentSlideIndex + 1).padStart(2,'0') + '</b></div><h1>' + esc(slide.title || '') + '</h1><p class="ideal-deck-slide-subtitle">' + esc(slide.subtitle || '') + '</p>' + bullets + '</div><div class="ideal-deck-slide-visual">' + renderDiagram(slide) + '<div class="ideal-deck-slide-note"><i class="bi bi-lightbulb"></i><span>Главная мысль слайда: обсудите её с сотрудником и покажите подходящий образец.</span></div></div></article></main><footer class="ideal-deck-presenter-footer"><button type="button" data-presenter-prev ' + (currentSlideIndex === 0 ? 'disabled' : '') + '><i class="bi bi-arrow-left"></i><span>Назад</span></button><div class="ideal-deck-presenter-counter"><strong>' + String(currentSlideIndex + 1).padStart(2,'0') + '</strong><span> / ' + String(total).padStart(2,'0') + '</span><div class="ideal-deck-presenter-dots">' + slides.map((_,index)=>'<button type="button" data-presenter-go="' + index + '" class="' + (index === currentSlideIndex ? 'is-active' : '') + '" aria-label="Перейти к слайду ' + (index + 1) + '"></button>').join('') + '</div></div><button type="button" class="is-primary" data-presenter-next><span>' + (currentSlideIndex === total - 1 ? 'Завершить урок' : 'Далее') + '</span><i class="bi ' + (currentSlideIndex === total - 1 ? 'bi-check2' : 'bi-arrow-right') + '"></i></button></footer>';
        presenter.classList.add('is-open');
        presenter.setAttribute('aria-hidden','false');
    }

    function openPresenter(deck) {
        currentDeck = deck;
        currentSlideIndex = 0;
        document.body.classList.add('ideal-deck-presenter-open');
        renderPresenter();
    }

    function closePresenter(markComplete) {
        if (markComplete && currentDeck) {
            completedDecks.add(currentDeck.id);
            try { localStorage.setItem('ideal_training_decks_done',JSON.stringify(Array.from(completedDecks))); } catch (_) {}
            renderRoot();
        }
        const presenter = document.getElementById('ideal-deck-presenter');
        if (presenter) {
            presenter.classList.remove('is-open');
            presenter.setAttribute('aria-hidden','true');
        }
        document.body.classList.remove('ideal-deck-presenter-open');
        currentDeck = null;
    }

    function moveSlide(delta) {
        if (!currentDeck) return;
        const target = currentSlideIndex + delta;
        if (target < 0) return;
        if (target >= currentDeck.slides.length) { closePresenter(true); return; }
        currentSlideIndex = target;
        renderPresenter();
    }

    async function saveDeck(deck, record) {
        const payload = {schema:SCHEMA,kind:'deck',deckId:deck.id,deck:{id:deck.id,category:deck.category || 'Обучение',title:deck.title,description:deck.description || '',slides:deck.slides}};
        const article = {title:DECK_PREFIX + deck.title,content:JSON.stringify(payload)};
        const url = API_URL + (record ? '/' + encodeURIComponent(record.article.id) : '');
        const method = record ? 'PUT' : 'POST';
        await requestJson(url,{method:method,headers:{'Content-Type':'application/json'},body:JSON.stringify(article)});
    }

    async function saveTombstone(record) {
        const title = record && record.payload.deck ? record.payload.deck.title : defaultDeck.title;
        const body = {title:DECK_PREFIX + title,content:JSON.stringify({schema:SCHEMA,kind:'tombstone',deckId:BASE_ID})};
        if (record) {
            await requestJson(API_URL + '/' + encodeURIComponent(record.article.id),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
        } else {
            await requestJson(API_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
        }
    }

    const editor = document.createElement('div');
    editor.id = 'ideal-deck-editor';
    editor.className = 'ideal-deck-editor';
    editor.setAttribute('aria-hidden','true');
    document.body.appendChild(editor);

    const presenter = document.createElement('div');
    presenter.id = 'ideal-deck-presenter';
    presenter.className = 'ideal-deck-presenter';
    presenter.setAttribute('aria-hidden','true');
    document.body.appendChild(presenter);

    root.addEventListener('click', async function(event) {
        const open = event.target.closest('[data-deck-open]');
        if (open) {
            const deck = decks.find(item => item.id === open.dataset.deckOpen);
            if (deck) openPresenter(deck);
            return;
        }
        const add = event.target.closest('[data-deck-add]');
        if (add && canManage) { openNewDeck(); return; }
        const restore = event.target.closest('[data-deck-restore]');
        if (restore && canManage) {
            try {
                const record = recordsByDeckId[BASE_ID];
                await saveDeck(clone(defaultDeck),record || null);
                await loadDecks();
            } catch (error) { noticeText = error.message; renderRoot(); }
            return;
        }
        const edit = event.target.closest('[data-deck-edit]');
        if (edit && canManage) {
            const deck = decks.find(item => item.id === edit.dataset.deckEdit);
            const record = recordsByDeckId[edit.dataset.deckEdit];
            if (deck) openEditor(deck,record || null);
            return;
        }
        const remove = event.target.closest('[data-deck-delete]');
        if (remove && canManage) {
            const id = remove.dataset.deckDelete;
            const deck = decks.find(item => item.id === id);
            if (!deck || !window.confirm('Удалить урок «' + deck.title + '»?')) return;
            try {
                const record = recordsByDeckId[id];
                if (id === BASE_ID) await saveTombstone(record || null);
                else if (record) await requestJson(API_URL + '/' + encodeURIComponent(record.article.id),{method:'DELETE'});
                completedDecks.delete(id);
                await loadDecks();
            } catch (error) { noticeText = error.message; renderRoot(); }
        }
    });

    editor.addEventListener('click', async function(event) {
        if (event.target.closest('[data-editor-close]')) { closeEditor(); return; }
        if (event.target.closest('[data-slide-add]')) {
            captureEditor();
            editingDeck.slides.push({kicker:String(editingDeck.slides.length + 1).padStart(2,'0') + ' · НОВАЯ ТЕМА',title:'',subtitle:'',bullets:[],diagram:{type:'flow',items:[]}});
            renderEditor();
            const body = document.querySelector('.ideal-deck-editor-body');
            if (body) body.scrollTop = body.scrollHeight;
            return;
        }
        const up = event.target.closest('[data-slide-up]');
        const down = event.target.closest('[data-slide-down]');
        const remove = event.target.closest('[data-slide-remove]');
        if (!up && !down && !remove) return;
        captureEditor();
        const index = Number((up || down || remove).dataset.slideUp || (up || down || remove).dataset.slideDown || (up || down || remove).dataset.slideRemove);
        if (!Number.isInteger(index) || index < 0 || index >= editingDeck.slides.length) return;
        if (remove) {
            if (editingDeck.slides.length <= 1) { window.alert('В уроке должен остаться хотя бы один слайд.'); return; }
            if (!window.confirm('Удалить этот слайд из урока?')) return;
            editingDeck.slides.splice(index,1);
        } else {
            const target = index + (up ? -1 : 1);
            if (target < 0 || target >= editingDeck.slides.length) return;
            const current = editingDeck.slides[index];
            editingDeck.slides[index] = editingDeck.slides[target];
            editingDeck.slides[target] = current;
        }
        renderEditor();
    });

    editor.addEventListener('submit', async function(event) {
        if (event.target.id !== 'ideal-deck-editor-form') return;
        event.preventDefault();
        if (!canManage) return;
        captureEditor();
        if (!editingDeck.title) { window.alert('Укажите название урока.'); return; }
        if (!editingDeck.slides.length || editingDeck.slides.some(slide => !slide.title)) { window.alert('Добавьте заголовок каждому слайду.'); return; }
        const saveButton = event.target.querySelector('.ideal-deck-save');
        if (saveButton) { saveButton.disabled = true; saveButton.innerHTML = '<span class="spinner-border spinner-border-sm"></span><span>Сохраняем…</span>'; }
        try {
            await saveDeck(editingDeck,editingRecord);
            closeEditor();
            await loadDecks();
        } catch (error) {
            window.alert(error.message || 'Не удалось сохранить урок.');
            if (saveButton) { saveButton.disabled = false; saveButton.innerHTML = '<i class="bi bi-check2"></i><span>Сохранить урок</span>'; }
        }
    });

    presenter.addEventListener('click', function(event) {
        if (event.target.closest('[data-presenter-close]')) { closePresenter(false); return; }
        if (event.target.closest('[data-presenter-prev]')) { moveSlide(-1); return; }
        if (event.target.closest('[data-presenter-next]')) { moveSlide(1); return; }
        const jump = event.target.closest('[data-presenter-go]');
        if (jump && currentDeck) { currentSlideIndex = Number(jump.dataset.presenterGo); renderPresenter(); return; }
        if (event.target.closest('[data-presenter-edit]') && currentDeck && canManage) {
            const deck = currentDeck;
            const record = recordsByDeckId[deck.id];
            closePresenter(false);
            openEditor(deck,record || null);
        }
    });

    document.addEventListener('keydown',function(event) {
        if (!currentDeck) {
            if (event.key === 'Escape' && editor.classList.contains('is-open')) closeEditor();
            return;
        }
        if (event.key === 'Escape') { closePresenter(false); return; }
        if (event.target && /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
        if (event.key === 'ArrowRight' || event.key === 'PageDown') { event.preventDefault(); moveSlide(1); }
        if (event.key === 'ArrowLeft' || event.key === 'PageUp') { event.preventDefault(); moveSlide(-1); }
    });

    if (window.CRMAuth && CRMAuth.ready) await CRMAuth.ready;
    canManage = Boolean(window.CRMAuth && CRMAuth.can('can_manage_knowledge'));
    await loadDecks();
});