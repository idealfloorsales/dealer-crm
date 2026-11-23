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
        category: 'Ламинат IDEALfloor',
        title: 'Обучение IDEALfloor: продукт, монтаж и коллекции',
        description: 'Короткий курс по материалу вашей презентации: устройство ламината, подготовка основания, коллекции, схемы рисунка и язык выгод для покупателя.',
        slides: [
            {kicker:'ОСНОВЫ · IDEALfloor',title:'Знакомство с ламинатом IDEALfloor',subtitle:'Характеристики становятся полезными, когда менеджер умеет объяснить их простыми словами.',bullets:['Бренд IDEALfloor представлен в учебном документе как продукт с 2010 года; производство расположено в Китае, используются оборудование Homag и европейские технологии.','В ассортименте есть ламинат 33 и 34 класса, толщиной 8 мм. Проверяйте характеристики конкретной коллекции перед консультацией.','Цель урока — научиться связывать устройство, монтаж и дизайн с задачей покупателя.'],diagram:{type:'grid',items:[{label:'33 / 34 класс',detail:'сверить по коллекции'},{label:'8 мм',detail:'толщина в материале'},{label:'EIR',detail:'рельеф в регистр'},{label:'SingleClick',detail:'замковая система'}]}},
            {kicker:'01 · УСТРОЙСТВО',title:'Ламинат состоит из четырёх слоёв',subtitle:'Каждый слой выполняет свою функцию — это помогает объяснить, из чего складывается практичность покрытия.',bullets:['Верхний слой — меламиновая защитная плёнка.','Декоративный слой — бумага с рисунком декора.','Несущий слой — HDF-плита с замком; в документе указана плотность 860 кг/м³.','Нижний слой стабилизирует планку.'],diagram:{type:'steps',items:[{label:'Защитный слой',detail:'верхняя поверхность'},{label:'Декор',detail:'рисунок и оттенок'},{label:'HDF',detail:'основа и замок'},{label:'Стабилизирующий слой',detail:'нижняя часть планки'}]}},
            {kicker:'02 · ПОДГОТОВКА И МОНТАЖ',title:'Сначала основание и условия — потом укладка',subtitle:'Пройдите последовательность до начала монтажа и проверьте требования для выбранной коллекции.',bullets:['Основание должно быть чистым, сухим, прочным и ровным: в документе указано до 2 мм на 1 м; допустимое отклонение по высоте — до 3 мм на 1 м.','Подложка — не менее 2 мм; на бетонном основании нужна влагозащита.','Акклиматизация: 48 часов при 18–24°C и влажности 40–60%.','Заранее проверьте направление рисунка и разметку.','Оставьте у стен зазор 8–10 мм и следуйте инструкции производителя на упаковке.'],diagram:{type:'flow',items:[{label:'Основание',detail:'чистое · сухое · ровное'},{label:'Подложка',detail:'от 2 мм · влагозащита'},{label:'Акклиматизация',detail:'48 ч · 18–24°C'},{label:'Разметка',detail:'направление и стартовый ряд'},{label:'Зазор',detail:'8–10 мм у стен'}]}},
            {kicker:'03 · ENGLAND HERRINGBONE',title:'ENGLAND HERRINGBONE: узкая планка и шесть рисунков',subtitle:'Схема помогает показать, как из планок A и B складываются разные варианты укладки.',bullets:['Формат 600×100×8 мм; класс 34 / AC6.','В упаковке 1,8 м² и 30 планок: 15 A + 15 B.','SingleClick, фаска 4V, текстура EIR, плотность HDF 860 кг/м³, экологичность E1.','В документе показаны прямая ёлка, тройная, квадрат, 2+1, кирпич и палубная укладка.'],diagram:{type:'grid',items:[{label:'A + B',detail:'два типа планок'},{label:'30 планок',detail:'15 A + 15 B'},{label:'6 вариантов',detail:'разные рисунки пола'}]},schemes:[{src:'/training-assets/england.png',caption:'Шесть вариантов рисунка ENGLAND HERRINGBONE.'}]},
            {kicker:'04 · ROYAL PARQUET',title:'ROYAL PARQUET: модульный художественный паркет',subtitle:'Сначала покажите готовый рисунок, затем объясните размер модуля и характеристики упаковки.',bullets:['Формат 1205×402×8 мм; класс 33 / AC5.','Упаковка 2,91 м², 6 планок; SingleClick и фаска 4U.','Текстура EIR, HDF 860 кг/м³, экологичность E1.','Перед продажей и монтажом сопоставьте геометрию модулей со схемой.'],diagram:{type:'flow',items:[{label:'Модуль',detail:'1205×402 мм'},{label:'Рисунок',detail:'художественный паркет'},{label:'Комплект',detail:'6 планок · 2,91 м²'}]},schemes:[{src:'/training-assets/royal-module.png',caption:'Геометрия модуля 1205×402 мм.'},{src:'/training-assets/royal-layout.png',caption:'Варианты рисунка ROYAL PARQUET.'}]},
            {kicker:'05 · HERRINGBONE PARQUET',title:'Два формата английской ёлочки — проверьте маркировку',subtitle:'У коллекции есть версии с разной геометрией, площадью упаковки и фаской.',bullets:['1206×402×8 мм: 33 / AC5, упаковка 2,91 м², 6 планок, фаска 4U.','1214×301×8 мм: 33 / AC5, упаковка 2,92 м², 8 планок, фаска 2U.','Для обеих версий в материале указаны SingleClick, EIR, HDF 860 кг/м³ и E1.','Не ориентируйтесь только на название коллекции: сверьте формат на упаковке и используйте соответствующую схему.'],diagram:{type:'grid',items:[{label:'1206×402×8',detail:'2,91 м² · 6 планок · 4U'},{label:'1214×301×8',detail:'2,92 м² · 8 планок · 2U'}]},schemes:[{src:'/training-assets/herringbone-402.png',caption:'Расположение модулей формата 1206×402 мм.'},{src:'/training-assets/herringbone-301.png',caption:'Расположение модулей формата 1214×301 мм.'}]},
            {kicker:'06 · MAGIC COLLECTION',title:'MAGIC COLLECTION: художественный рисунок на модуле',subtitle:'Объясняйте эстетику коллекции через вид пола и фактические характеристики формата.',bullets:['Формат 1206×402×8 мм; класс 33 / AC5.','Упаковка 2,91 м², 6 планок; фаска 4U и матовая текстура.','SingleClick, HDF 860 кг/м³, экологичность E1.','В исходном учебном документе для этой коллекции приведена схема взаимного расположения модулей.'],diagram:{type:'steps',items:[{label:'Художественный рисунок',detail:'эффект паркета'},{label:'Матовая поверхность',detail:'характеристика коллекции'},{label:'Модуль 1206×402',detail:'сверить раскладку'}]},schemes:[{src:'/training-assets/herringbone-402.png',caption:'Схема расположения модулей из исходного документа.'}]},
            {kicker:'07 · FRENCH PARQUET',title:'FRENCH PARQUET: следите за форматом и планками A / B',subtitle:'Французская ёлочка выглядит по-разному в зависимости от формата модуля и раскладки.',bullets:['1215×302×8 мм: упаковка 2,94 м², 8 планок — 4 A + 4 B; класс 33 / AC5.','1206×402×8 мм: упаковка 2,91 м²; класс 33 / AC5.','Для коллекции указаны SingleClick, фаска 4U, EIR, HDF 860 кг/м³ и E1.','Сверяйте формат и схему A/B с маркировкой конкретной упаковки.'],diagram:{type:'flow',items:[{label:'Формат',detail:'302 или 402 мм'},{label:'Планки A / B',detail:'сверить состав упаковки'},{label:'Схема',detail:'подобрать раскладку'},{label:'Монтаж',detail:'следовать инструкции'}]},schemes:[{src:'/training-assets/french-302.png',caption:'Расположение модулей A и B формата 1215×302 мм.'},{src:'/training-assets/french-module.png',caption:'Геометрия модуля FRENCH PARQUET 1206×402 мм.'},{src:'/training-assets/french-402.png',caption:'Схема расположения модулей формата 1206×402 мм.'}]},
            {kicker:'08 · ПРЕИМУЩЕСТВА',title:'Технологию нужно переводить в понятную пользу',subtitle:'В консультации называйте только те характеристики, которые подтверждены для конкретной коллекции.',bullets:['Восковая пропитка замков — дополнительная защита стыков от влаги; порядок ухода и условия применения сверяйте с инструкцией.','EIR — рельеф поверхности повторяет рисунок декора.','Эффект ручной обработки создаёт выразительную фактуру планки.','Для U-фаски в документе отмечена более плавная форма.','В документе указаны совместимость с тёплым полом до 28°C, класс E1 и гарантия до 30 лет бытового / до 15 лет коммерческого применения; проверяйте паспорт и упаковку конкретного товара.'],diagram:{type:'flow',items:[{label:'Характеристика',detail:'EIR · фаска · замок'},{label:'Что меняется',detail:'вид · фактура · монтаж'},{label:'Польза клиенту',detail:'подбор под его задачу'}]}},
            {kicker:'09 · ЯЗЫК ВЫГОД',title:'Говорите о том, что получает покупатель',subtitle:'Свяжите особенность товара с конкретным запросом — и подтвердите примером на образце.',bullets:['Художественный ламинат → выразительный рисунок паркета.','Глубокое тиснение EIR → заметная фактура и тактильное ощущение дерева.','Восковая пропитка замков → дополнительная защита стыков; условия эксплуатации проверяются по инструкции.','Качественное покрытие → ценность и срок службы, подтверждённые гарантийными условиями.','Покажите покупателю максимум два-три подходящих декора и объясните разницу.'],diagram:{type:'steps',items:[{label:'Спросить',detail:'что важно покупателю'},{label:'Показать',detail:'образец и схему'},{label:'Объяснить',detail:'характеристика → польза'},{label:'Подобрать',detail:'2–3 подходящих варианта'}]}}
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

    function schemesText(schemes) {
        return (Array.isArray(schemes) ? schemes : []).map(item => String(item.src || '') + (item.caption ? ' | ' + item.caption : '')).join('\n');
    }

    function parseSchemes(value) {
        return splitLines(value).map(line => {
            const divider = line.indexOf('|');
            return {src:(divider < 0 ? line : line.slice(0,divider)).trim(),caption:divider < 0 ? '' : line.slice(divider + 1).trim()};
        }).filter(item => item.src);
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
        return '<section class="ideal-deck-edit-slide" data-slide-index="' + index + '"><header><div><span>СЛАЙД ' + String(index + 1).padStart(2,'0') + '</span><strong>' + esc(slide.title || 'Новый слайд') + '</strong></div><div class="ideal-deck-slide-tools"><button type="button" data-slide-up="' + index + '" aria-label="Переместить выше" ' + (index === 0 ? 'disabled' : '') + '><i class="bi bi-arrow-up"></i></button><button type="button" data-slide-down="' + index + '" aria-label="Переместить ниже" ' + (index === total - 1 ? 'disabled' : '') + '><i class="bi bi-arrow-down"></i></button><button type="button" class="is-danger" data-slide-remove="' + index + '" aria-label="Удалить слайд"><i class="bi bi-trash3"></i></button></div></header><div class="ideal-deck-edit-grid"><label>Номер / раздел<input class="form-control" data-field="kicker" value="' + esc(slide.kicker || '') + '" placeholder="Например: 02 · Монтаж"></label><label>Заголовок слайда<input class="form-control" data-field="title" value="' + esc(slide.title || '') + '" required placeholder="Короткий и понятный заголовок"></label><label class="is-wide">Объяснение<textarea class="form-control" data-field="subtitle" rows="2" placeholder="Одна мысль, которую менеджер должен понять">' + esc(slide.subtitle || '') + '</textarea></label><label class="is-wide">Ключевые пункты<textarea class="form-control" data-field="bullets" rows="4" placeholder="Каждый пункт — с новой строки">' + esc((slide.bullets || []).join('\n')) + '</textarea><small>Добавляйте один тезис на строку — в уроке они станут отдельными пунктами.</small></label><label>Вид схемы<select class="form-select" data-field="diagramType">' + options.map(option => '<option value="' + option[0] + '" ' + ((diagram.type || 'flow') === option[0] ? 'selected' : '') + '>' + option[1] + '</option>').join('') + '</select></label><label class="is-wide">Элементы схемы<textarea class="form-control" data-field="diagramItems" rows="3" placeholder="Один элемент на строку: Название | пояснение">' + esc(diagramItemsText(diagram.items)) + '</textarea><small>Схему можно оставить пустой — тогда будут показаны только учебные пункты.</small></label><label class="is-wide">Схемы и иллюстрации<textarea class="form-control" data-field="schemes" rows="3" placeholder="/training-assets/england.png | Варианты рисунка">' + esc(schemesText(slide.schemes)) + '</textarea><small>Одна схема на строку: ссылка на изображение | подпись. Можно использовать файлы CRM из /training-assets/.</small></label></div></section>';
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
                diagram:{type:diagramType.value,items:parseDiagramItems(field('diagramItems').value)},
                schemes:parseSchemes(field('schemes').value)
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

    function renderSchemes(slide) {
        const schemes = Array.isArray(slide.schemes) ? slide.schemes.filter(item => item && /^\/|^https:\/\//i.test(String(item.src || ''))) : [];
        if (!schemes.length) return '';
        return '<div class="ideal-deck-schemes">' + schemes.map(item => '<figure><a href="' + esc(item.src) + '" target="_blank" rel="noopener"><img src="' + esc(item.src) + '" loading="lazy" decoding="async" alt="' + esc(item.caption || slide.title || 'Схема урока') + '"></a>' + (item.caption ? '<figcaption>' + esc(item.caption) + '</figcaption>' : '') + '</figure>').join('') + '</div>';
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
        presenter.innerHTML = '<header class="ideal-deck-presenter-head"><div class="ideal-deck-presenter-brand"><span class="ideal-deck-presenter-mark">IF</span><div><strong>IDEAL FLOOR · ОБУЧЕНИЕ</strong><small>' + esc(currentDeck.title) + '</small></div></div><div class="ideal-deck-presenter-actions">' + (canManage ? '<button type="button" data-presenter-edit><i class="bi bi-pencil"></i><span>Редактировать</span></button>' : '') + '<button type="button" class="ideal-deck-presenter-close" data-presenter-close aria-label="Закрыть"><i class="bi bi-x-lg"></i></button></div></header><div class="ideal-deck-presenter-progress"><span style="width:' + progress + '%"></span></div><main class="ideal-deck-presenter-stage"><article class="ideal-deck-slide"><div class="ideal-deck-slide-copy"><div class="ideal-deck-slide-kicker"><span>' + esc(slide.kicker || 'IDEAL HOLDING · ОБУЧЕНИЕ') + '</span><b>' + String(currentSlideIndex + 1).padStart(2,'0') + '</b></div><h1>' + esc(slide.title || '') + '</h1><p class="ideal-deck-slide-subtitle">' + esc(slide.subtitle || '') + '</p>' + bullets + '</div><div class="ideal-deck-slide-visual">' + renderSchemes(slide) + renderDiagram(slide) + '<div class="ideal-deck-slide-note"><i class="bi bi-lightbulb"></i><span>Главная мысль слайда: обсудите её с сотрудником и покажите подходящий образец.</span></div></div></article></main><footer class="ideal-deck-presenter-footer"><button type="button" data-presenter-prev ' + (currentSlideIndex === 0 ? 'disabled' : '') + '><i class="bi bi-arrow-left"></i><span>Назад</span></button><div class="ideal-deck-presenter-counter"><strong>' + String(currentSlideIndex + 1).padStart(2,'0') + '</strong><span> / ' + String(total).padStart(2,'0') + '</span><div class="ideal-deck-presenter-dots">' + slides.map((_,index)=>'<button type="button" data-presenter-go="' + index + '" class="' + (index === currentSlideIndex ? 'is-active' : '') + '" aria-label="Перейти к слайду ' + (index + 1) + '"></button>').join('') + '</div></div><button type="button" class="is-primary" data-presenter-next><span>' + (currentSlideIndex === total - 1 ? 'Завершить урок' : 'Далее') + '</span><i class="bi ' + (currentSlideIndex === total - 1 ? 'bi-check2' : 'bi-arrow-right') + '"></i></button></footer>';
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