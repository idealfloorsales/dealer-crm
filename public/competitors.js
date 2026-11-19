document.addEventListener('DOMContentLoaded', () => {
    const API_URL = '/api/competitors-ref';
    const API_DEALERS = '/api/dealers';
    const $ = id => document.getElementById(id);

    const grid = $('competitors-grid');
    const dashboard = $('comp-dashboard');
    const searchInput = $('search-input');
    const filtersToggle = $('filters-toggle');
    const filtersPanel = $('competitors-filters');
    const activeFilterCount = $('active-filter-count');
    const resultCount = $('result-count');
    const addBtn = $('add-comp-btn');
    const exportBtn = $('export-comp-btn');
    const manageTypesBtn = $('btn-manage-types');

    const filterIds = ['filter-type','filter-country','filter-segment','filter-priority','filter-status','filter-presence','filter-monitoring','filter-prices'];
    const filters = Object.fromEntries(filterIds.map(id => [id, $(id)]));
    const sortBy = $('sort-by');
    const resetFiltersBtn = $('reset-filters');

    const modal = bootstrap.Modal.getOrCreateInstance($('comp-modal'), { backdrop:'static', keyboard:false });
    const typesModal = bootstrap.Modal.getOrCreateInstance($('types-manager-modal'));
    const dealersModal = bootstrap.Modal.getOrCreateInstance($('dealers-list-modal'));
    const presenceTools = $('dealer-presence-tools');
    const presenceSearch = $('dealer-presence-search');
    const presenceFilter = $('dealer-presence-filter');
    const presenceContainer = $('dealers-list-container');
    const observationModal = bootstrap.Modal.getOrCreateInstance($('observation-modal'));

    const form = $('comp-form');
    const saveBtn = $('btn-save-comp');
    const deleteBtn = $('btn-delete-comp');
    const modalTitle = $('comp-modal-title');

    const fields = {
        id:$('comp_id'),
        name:$('comp_name'),
        country:$('comp_country'),
        status:$('comp_status'),
        priority:$('comp_priority'),
        isMain:$('comp-is-main'),
        segment:$('comp_segment'),
        tags:$('comp_tags'),
        supplier:$('comp_supplier'),
        warehouse:$('comp_warehouse'),
        website:$('comp_website'),
        instagram:$('comp_instagram'),
        storage:$('comp_storage'),
        stock:$('comp_stock'),
        reserve:$('comp_reserve'),
        pricePositioning:$('comp_price_positioning'),
        lastMonitoring:$('comp_last_monitoring'),
        nextMonitoring:$('comp_next_monitoring'),
        monitoringOwner:$('comp_monitoring_owner'),
        strengths:$('comp_strengths'),
        weaknesses:$('comp_weaknesses'),
        info:$('comp_info')
    };

    const logoInput = $('comp_logo_input');
    const logoPreview = $('comp_logo_preview');
    const logoPlaceholder = $('comp_logo_placeholder');
    const collectionsContainer = $('collections-container');
    const contactsContainer = $('comp-contacts-list');
    const addressesContainer = $('comp-addresses-list');
    const observationsContainer = $('comp-observations-list');

    const defaultTypes = [
        { val:'std', label:'Стандарт', color:'#94a3b8' },
        { val:'eng', label:'Англ. ёлка', color:'#10b981' },
        { val:'fr', label:'Фр. ёлка', color:'#3b82f6' },
        { val:'art', label:'Художественный', color:'#f59e0b' },
        { val:'mix', label:'Худ. микс', color:'#ef4444' }
    ];
    const typeColors = ['#8b5cf6','#06b6d4','#ec4899','#84cc16','#f97316','#6366f1'];
    const MAIN_COMPETITOR_TAG = 'Главный конкурент';

    let competitors = [];
    let allDealers = [];
    let dynamicTypes = [];
    let currentLogo = '';
    let currentObservations = [];
    let canManage = false;
    let canObserve = false;
    let canEditDealers = false;
    let currentPresenceCompetitorId = '';
    const dealerPresenceDrafts = new Map();
    const savingPresence = new Set();
    let selectedCompetitorId = '';
    let canExport = false;
    let viewMode = localStorage.getItem('competitors_view') || 'cards';
    let quickFilter = 'all';
    let isSaving = false;

    const esc = value => String(value ?? '')
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;').replace(/'/g,'&#039;');

    const idOf = value => String(value?.id || value?._id || value || '');
    const norm = value => String(value || '').trim().toLowerCase();
    function isMainCompetitor(competitor) {
        return Array.isArray(competitor?.tags) && competitor.tags.some(tag=>norm(tag)===norm(MAIN_COMPETITOR_TAG));
    }
    const fmt = value => Number(value || 0).toLocaleString('ru-RU');
    const dateKeyToday = () => {
        const f = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Almaty',year:'numeric',month:'2-digit',day:'2-digit'});
        const parts = Object.fromEntries(f.formatToParts(new Date()).map(p=>[p.type,p.value]));
        return `${parts.year}-${parts.month}-${parts.day}`;
    };
    const dateText = value => {
        if (!value) return 'не задана';
        const [y,m,d] = String(value).slice(0,10).split('-');
        return y && m && d ? `${d}.${m}.${y}` : value;
    };
    const plusDays = (value, days) => {
        if (!value) return '';
        const d = new Date(value + 'T00:00:00Z');
        d.setUTCDate(d.getUTCDate()+days);
        return d.toISOString().slice(0,10);
    };

    function toast(message, type='success') {
        if (window.CRMUI?.toast) return CRMUI.toast(message, type);
        const box = document.createElement('div');
        box.className = 'position-fixed top-0 end-0 p-3';
        box.style.zIndex = '3000';
        box.innerHTML = `<div class="toast show border-0 shadow"><div class="toast-body">${esc(message)}</div></div>`;
        document.body.appendChild(box);
        setTimeout(()=>box.remove(),2600);
    }

    const observationTopics = {price:'Цена',assortment:'Ассортимент',promotion:'Акция',dealer:'Дилер / выкладка',stock:'Наличие',logistics:'Доставка / склад',quality:'Качество',reviews:'Отзывы',marketing:'Реклама',other:'Другое'};
    const observationSources = {website:'Сайт',instagram:'Instagram',marketplace:'Маркетплейс',dealer:'Дилер',visit:'Визит',offer:'Коммерческое предложение',review:'Отзыв',other:'Другое'};
    const observationConfidence = {verified:'Подтверждено',observed:'Видел лично',reported:'Со слов дилера',estimate:'Оценка'};
    const orderedObservations = rows => [...(Array.isArray(rows)?rows:[])].sort((a,b)=>String(b.date||b.createdAt||'').localeCompare(String(a.date||a.createdAt||'')));

    function statusLabel(value) {
        return ({active:'Активный',watch:'Наблюдение',inactive:'Неактивный'})[value] || 'Активный';
    }
    function priorityLabel(value) {
        return ({critical:'Критический',high:'Высокий',medium:'Средний',low:'Низкий'})[value] || 'Средний';
    }
    const normalizeType = value => {
        const type = String(value || 'std').trim();
        return type === 'standard' ? 'std' : (type || 'std');
    };
    function getAllTypes() { return [...defaultTypes, ...dynamicTypes]; }
    function typeInfo(type) {
        const normalized = normalizeType(type);
        return getAllTypes().find(item => item.val === normalized) || { val:normalized, label:normalized || 'Стандарт', color:'#8b5cf6' };
    }

    function dealerCount(competitor) {
        const target = norm(competitor.name);
        return allDealers.filter(dealer =>
            Array.isArray(dealer.competitors) && dealer.competitors.some(item => norm(item.brand) === target)
        ).length;
    }
    function dealersFor(competitor) {
        const target = norm(competitor.name);
        return allDealers.filter(dealer =>
            Array.isArray(dealer.competitors) && dealer.competitors.some(item => norm(item.brand) === target)
        );
    }
    function pricedCollectionCount(competitor) {
        return (competitor.collections || []).filter(col => {
            if (typeof col === 'string') return false;
            return String(col.price_opt || '').trim() || String(col.price_retail || '').trim();
        }).length;
    }
    function monitoringState(competitor) {
        const today = dateKeyToday();
        const next = competitor.next_monitoring_date || '';
        if (!next) return {key:'none',label:'Дата не задана',className:''};
        if (next < today) return {key:'overdue',label:`Просрочен · ${dateText(next)}`,className:'is-overdue'};
        if (next <= plusDays(today,7)) return {key:'due7',label:`До ${dateText(next)}`,className:'is-due'};
        return {key:'future',label:`До ${dateText(next)}`,className:''};
    }

    async function loadData() {
        try {
            const [compRes, dealerRes] = await Promise.all([
                fetch(API_URL),
                (window.CRMAuth?.can('can_view_dealers') || window.CRMAuth?.can('can_view_competitors')) ? fetch(`${API_DEALERS}?view=main`) : Promise.resolve(null)
            ]);
            if (!compRes.ok) throw new Error('Не удалось загрузить конкурентов');
            competitors = await compRes.json();
            allDealers = dealerRes?.ok ? await dealerRes.json() : [];

            competitors = Array.isArray(competitors) ? competitors : [];
            allDealers = Array.isArray(allDealers) ? allDealers : [];
            populateObservationDealers();
            refreshDynamicTypes();
            populateFilters();
            renderAll();
        } catch (error) {
            console.error(error);
            grid.innerHTML = `<div class="competitors-empty text-danger"><i class="bi bi-exclamation-circle me-1"></i>${esc(error.message)}</div>`;
        }
    }

    function refreshDynamicTypes() {
        const found = new Set();
        competitors.forEach(item => (item.collections || []).forEach(col => {
            const type = typeof col === 'string' ? 'std' : normalizeType(col.type);
            if (!defaultTypes.some(x => x.val === type)) found.add(type);
        }));
        dynamicTypes = [...found].sort((a,b)=>a.localeCompare(b,'ru')).map((value,index)=>({
            val:value,label:value,color:typeColors[index % typeColors.length]
        }));
    }

    function populateSelect(select, values, allLabel) {
        if (!select) return;
        const current = select.value || 'all';
        select.innerHTML = `<option value="all">${esc(allLabel)}</option>` +
            values.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
        select.value = values.includes(current) ? current : 'all';
    }

    function populateFilters() {
        const typeSelect = filters['filter-type'];
        if (typeSelect) {
            const current = typeSelect.value || 'all';
            typeSelect.innerHTML = '<option value="all">Все типы</option>' +
                getAllTypes().map(t => `<option value="${esc(t.val)}">${esc(t.label)}</option>`).join('');
            typeSelect.value = getAllTypes().some(t=>t.val===current) ? current : 'all';
        }
        const countries = [...new Set(competitors.map(c=>String(c.country||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru'));
        const segments = [...new Set(competitors.map(c=>String(c.segment||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru'));
        populateSelect(filters['filter-country'],countries,'Все страны');
        populateSelect(filters['filter-segment'],segments,'Все сегменты');
    }

    function renderAll() {
        renderDashboard();
        renderGrid();
        updateViewButtons();
    }

    function renderDashboard() {
        const totalBrands = competitors.length;
        const totalCollections = competitors.reduce((sum,item)=>sum+(item.collections||[]).length,0);
        const important = competitors.filter(c=>['critical','high'].includes(c.priority)).length;
        const withDealers = competitors.filter(c=>dealerCount(c)>0).length;
        const overdue = competitors.filter(c=>monitoringState(c).key==='overdue').length;
        const pricePositions = competitors.reduce((sum,c)=>sum+pricedCollectionCount(c),0);
        const observationsTotal = competitors.reduce((sum,c)=>sum+(Array.isArray(c.observations)?c.observations.length:0),0);
        const stale = competitors.filter(c=>{ const latest=orderedObservations(c.observations)[0]?.date || c.last_monitoring_date || ''; return !latest || latest < plusDays(dateKeyToday(),-30); }).length;

        dashboard.innerHTML = [
            ['bi-shop','Брендов',totalBrands,'шт',''],
            ['bi-collection','Коллекций',totalCollections,'позиций',''],
            ['bi-exclamation-diamond','Высокий приоритет',important,'брендов',important?'is-danger':''],
            ['bi-buildings','Есть у дилеров',withDealers,'брендов',''],
            ['bi-clock-history','Просрочен мониторинг',overdue,'брендов',overdue?'is-warning':''],
            ['bi-cash-stack','Цены заполнены',pricePositions,'коллекций',''],
            ['bi-journal-text','Наблюдения',observationsTotal,'записей',''],
            ['bi-hourglass-split','Нет свежих данных',stale,'брендов',stale?'is-warning':'']
        ].map(([icon,label,value,unit,cls])=>`
            <article class="competitor-kpi ${cls}">
                <span class="competitor-kpi-icon"><i class="bi ${icon}"></i></span>
                <div><small>${label}</small><strong>${fmt(value)}</strong><em>${unit}</em></div>
            </article>`).join('');
    }

    function searchBlob(c) {
        const collections = (c.collections||[]).map(col=>typeof col==='string'?col:[col.name,col.type,col.class,col.thickness,col.format,col.note].join(' ')).join(' ');
        const contacts = (c.contacts||[]).map(x=>[x.name,x.position,x.phone].join(' ')).join(' ');
        const addresses = (c.addresses||[]).map(x=>[x.description,x.city,x.address].join(' ')).join(' ');
        return norm([
            c.name,c.country,c.supplier,c.warehouse,c.segment,(c.tags||[]).join(' '),
            c.strengths,c.weaknesses,c.info,c.monitoring_owner,c.price_positioning,
            (c.observations||[]).map(o=>[o.topic,o.city,o.dealer,o.product,o.detail,o.source,o.source_url].join(' ')).join(' '),
            collections,contacts,addresses
        ].join(' '));
    }

    function matchesFilters(c) {
        const search = norm(searchInput?.value);
        if (search && !searchBlob(c).includes(search)) return false;

        const type = filters['filter-type']?.value || 'all';
        if (type !== 'all' && !(c.collections||[]).some(col => (typeof col==='string'?'std':normalizeType(col.type))===type)) return false;

        const country = filters['filter-country']?.value || 'all';
        if (country !== 'all' && String(c.country||'') !== country) return false;

        const segment = filters['filter-segment']?.value || 'all';
        if (segment !== 'all' && String(c.segment||'') !== segment) return false;

        const priority = filters['filter-priority']?.value || 'all';
        if (priority !== 'all' && (c.priority||'medium') !== priority) return false;

        const status = filters['filter-status']?.value || 'all';
        if (status !== 'all' && (c.status||'active') !== status) return false;

        const presence = filters['filter-presence']?.value || 'all';
        const dc = dealerCount(c);
        if (presence === 'yes' && dc<=0) return false;
        if (presence === 'no' && dc>0) return false;

        const mon = filters['filter-monitoring']?.value || 'all';
        const ms = monitoringState(c).key;
        if (mon === 'overdue' && ms !== 'overdue') return false;
        if (mon === 'due7' && ms !== 'due7') return false;
        if (mon === 'no-date' && ms !== 'none') return false;

        const prices = filters['filter-prices']?.value || 'all';
        const pc = pricedCollectionCount(c);
        if (prices === 'yes' && pc<=0) return false;
        if (prices === 'no' && pc>0) return false;

        if (quickFilter === 'important' && !['critical','high'].includes(c.priority||'medium')) return false;
        if (quickFilter === 'main' && !isMainCompetitor(c)) return false;
        if (quickFilter === 'overdue' && ms !== 'overdue') return false;
        if (quickFilter === 'dealers' && dc<=0) return false;
        if (quickFilter === 'no-prices' && pc>0) return false;

        return true;
    }

    function priorityRank(value) {
        return ({critical:4,high:3,medium:2,low:1})[value] || 2;
    }

    function sortRows(rows) {
        const sort = sortBy?.value || 'priority';
        return rows.sort((a,b)=>{
            if (sort === 'name') return String(a.name||'').localeCompare(String(b.name||''),'ru');
            if (sort === 'dealers') return dealerCount(b)-dealerCount(a) || String(a.name||'').localeCompare(String(b.name||''),'ru');
            if (sort === 'collections') return (b.collections||[]).length-(a.collections||[]).length || String(a.name||'').localeCompare(String(b.name||''),'ru');
            if (sort === 'monitoring') {
                const aa=a.next_monitoring_date||'9999-12-31', bb=b.next_monitoring_date||'9999-12-31';
                return aa.localeCompare(bb);
            }
            if (sort === 'updated') return String(b.updatedAt||'').localeCompare(String(a.updatedAt||''));
            return priorityRank(b.priority)-priorityRank(a.priority) || String(a.name||'').localeCompare(String(b.name||''),'ru');
        });
    }

    function collectionPriceText(col) {
        if (typeof col === 'string') return '';
        const opt = String(col.price_opt||'').trim();
        const retail = String(col.price_retail||'').trim();
        if (opt && retail) return `опт ${esc(opt)} ₸/м² · розн. ${esc(retail)} ₸/м²`;
        if (opt) return `опт ${esc(opt)} ₸/м²`;
        if (retail) return `розн. ${esc(retail)} ₸/м²`;
        return '';
    }

    function safeUrl(value, type='web') {
        const raw=String(value||'').trim();
        if(!raw) return '';
        if(/^https?:\/\//i.test(raw)) return raw;
        if(type==='instagram') return 'https://instagram.com/'+raw.replace(/^@/,'');
        return 'https://'+raw;
    }

    function cardHtml(c) {
        const types = [...new Set((c.collections||[]).map(col=>typeof col==='string'?'std':normalizeType(col.type)))];
        const tags = Array.isArray(c.tags) ? c.tags.filter(tag=>tag&&norm(tag)!==norm(MAIN_COMPETITOR_TAG)) : [];
        const dealers = dealerCount(c);
        const priced = pricedCollectionCount(c);
        const mon = monitoringState(c);
        const observations = orderedObservations(c.observations);
        const collections = c.collections || [];
        const preview = collections.slice(0,3).map(col=>{
            const obj = typeof col==='string' ? {name:col,type:'std'} : col;
            const details=[obj.class,obj.thickness,obj.format].filter(Boolean).join(' · ');
            const price=collectionPriceText(obj);
            return `<div class="competitor-collection-line">
                <div><strong>${esc(obj.name||'Без названия')}</strong><small>${esc(details || typeInfo(obj.type).label)}</small></div>
                <span class="competitor-price">${price || 'цена —'}</span>
            </div>`;
        }).join('');

        const logo = c.logoUrl
            ? `<img src="${esc(c.logoUrl)}" alt="${esc(c.name)}">`
            : `<span>${esc(String(c.name||'?').slice(0,2).toUpperCase())}</span>`;

        const socialLinks = [
            c.website ? `<a href="${esc(safeUrl(c.website))}" target="_blank" rel="noopener" title="Сайт"><i class="bi bi-globe"></i></a>` : '',
            c.instagram ? `<a href="${esc(safeUrl(c.instagram,'instagram'))}" target="_blank" rel="noopener" title="Instagram"><i class="bi bi-instagram"></i></a>` : ''
        ].join('');

        const typeBadges = (types.length?types:['std']).slice(0,4).map(type=>{
            const info=typeInfo(type);
            return `<span class="competitor-type-badge"><i class="bi bi-circle-fill" style="color:${esc(info.color)}"></i>${esc(info.label)}</span>`;
        }).join('');
        const tagBadges = tags.slice(0,3).map(tag=>`<span class="competitor-tag">#${esc(tag)}</span>`).join('');

        const supplierLine = c.supplier || c.warehouse
            ? `<div class="competitor-info-row"><i class="bi bi-box-seam"></i><div><strong>${esc(c.supplier||'Поставщик не указан')}</strong><small>${esc(c.warehouse ? 'Склад: '+c.warehouse : 'Склад не указан')}</small></div></div>`
            : '';
        const segmentLine = c.segment || c.price_positioning
            ? `<div class="competitor-info-row"><i class="bi bi-tags"></i><div><strong>${esc(c.segment||'Сегмент не задан')}</strong><small>${esc(c.price_positioning||'Ценовое позиционирование не задано')}</small></div></div>`
            : '';

        return `<article class="competitor-card ${(c.priority||'medium')==='critical'?'is-critical':''}" data-card-id="${esc(idOf(c))}">
            <div class="competitor-card-head">
                <div class="competitor-card-logo">${logo}</div>
                <div class="competitor-card-title">
                    <h3>${esc(c.name||'Без названия')}</h3>
                    <p>${esc(c.country||'Страна не указана')}${c.segment?' · '+esc(c.segment):''}</p>
                    <div class="competitor-card-statuses">
                        <span class="comp-status is-${esc(c.status||'active')}">${statusLabel(c.status||'active')}</span>
                        <span class="comp-priority is-${esc(c.priority||'medium')}">${priorityLabel(c.priority||'medium')}</span>
                        ${isMainCompetitor(c)?'<span class="competitor-main-badge"><i class="bi bi-star-fill"></i>Главный конкурент</span>':''}
                    </div>
                </div>
                <div class="competitor-card-actions">
                    ${canObserve?`<button type="button" class="comp-icon-btn" data-observe-id="${esc(idOf(c))}" title="Добавить наблюдение"><i class="bi bi-journal-plus"></i></button>`:''}
                    ${canManage?`<button type="button" class="comp-icon-btn" data-edit-id="${esc(idOf(c))}" title="Редактировать"><i class="bi bi-pencil"></i></button>`:''}
                </div>
            </div>

            <div class="competitor-card-metrics">
                <div class="competitor-card-metric"><small>Коллекций</small><strong>${fmt(collections.length)}</strong></div>
                <button type="button" class="competitor-card-metric competitor-card-metric-action" data-dealers-id="${esc(idOf(c))}" aria-label="Показать дилеров с конкурентом ${esc(c.name||'')}" title="Открыть дилеров с этим конкурентом"><small>У дилеров</small><strong>${fmt(dealers)}</strong></button>
                <div class="competitor-card-metric"><small>С ценами</small><strong>${fmt(priced)}/${fmt(collections.length)}</strong></div>
                <div class="competitor-card-metric"><small>Наблюдений</small><strong>${fmt(observations.length)}</strong></div>
            </div>

            <div class="competitor-card-info">${supplierLine}${segmentLine}</div>
            <div class="competitor-badge-row">${typeBadges}${tagBadges}</div>

            <div class="competitor-monitoring ${mon.className}">
                <div class="competitor-monitoring-top"><strong><i class="bi bi-radar me-1"></i>Мониторинг</strong><span>${esc(mon.label)}</span></div>
                <small>Последняя проверка: ${dateText(c.last_monitoring_date)}${c.monitoring_owner?' · '+esc(c.monitoring_owner):''}</small>
            </div>

            <div class="competitor-collections-preview">
                <div class="competitor-collections-preview-head"><strong>Ассортимент</strong><button type="button" data-expand-id="${esc(idOf(c))}">Подробнее <i class="bi bi-chevron-down"></i></button></div>
                ${preview || '<div class="text-muted small py-2">Коллекции не заполнены</div>'}
                ${collections.length>3?`<small class="text-muted">+ ещё ${collections.length-3}</small>`:''}
            </div>

            <div class="competitor-card-more">
                <div class="competitor-analysis-grid">
                    <div class="competitor-analysis-box is-good"><strong><i class="bi bi-plus-circle me-1"></i>Сильные стороны</strong><p>${esc(c.strengths||'Не заполнено')}</p></div>
                    <div class="competitor-analysis-box is-bad"><strong><i class="bi bi-dash-circle me-1"></i>Слабые стороны</strong><p>${esc(c.weaknesses||'Не заполнено')}</p></div>
                </div>
                <div class="competitor-observation-preview">
                    <div class="competitor-observation-preview-head"><strong><i class="bi bi-journal-text me-1"></i>Последние наблюдения</strong><span>${fmt(observations.length)}</span></div>
                    ${observations.slice(0,3).map(o=>`<article><div><strong>${esc(observationTopics[o.topic]||'Наблюдение')}</strong><small>${dateText(o.date)} · ${esc(observationSources[o.source_type]||'Источник не указан')} · ${esc(observationConfidence[o.confidence]||'Не проверено')}</small></div><p>${esc(o.detail||'')}</p>${o.dealer_id?`<a class="observation-context observation-context-link" href="/dealer.html?id=${encodeURIComponent(o.dealer_id)}">${esc([o.city,o.dealer].filter(Boolean).join(' · ')||'Открыть дилера')}</a>`:o.city||o.dealer||o.product?`<small class="observation-context">${esc([o.city,o.dealer,o.product].filter(Boolean).join(' · '))}</small>`:''}</article>`).join('') || '<div class="competitor-observation-empty">Пока нет записей. Добавьте наблюдение в карточке бренда.</div>'}
                </div>
                ${c.info?`<div class="competitor-note">${esc(c.info)}</div>`:''}
            </div>

            <div class="competitor-card-footer">
                <button type="button" class="comp-dealers-btn ${dealers?'is-active':''}" data-dealers-id="${esc(idOf(c))}"><i class="bi bi-shop"></i>Дилеры ${dealers?'<b>'+dealers+'</b>':''}</button>
                ${socialLinks}
                <button type="button" data-expand-id="${esc(idOf(c))}" title="Развернуть"><i class="bi bi-arrows-angle-expand"></i></button>
            </div>
        </article>`;
    }

    function renderGrid() {
        const rows = sortRows(competitors.filter(matchesFilters));
        resultCount.textContent = fmt(rows.length);
        updateActiveFilterCount();

        grid.classList.toggle('is-list',viewMode==='list');
        if (!rows.length) {
            grid.innerHTML = '<div class="competitors-empty"><i class="bi bi-search me-1"></i>По текущим фильтрам ничего не найдено</div>';
            return;
        }

        grid.innerHTML = rows.map(cardHtml).join('');
        grid.querySelectorAll('[data-edit-id]').forEach(btn=>btn.addEventListener('click',()=>openEdit(btn.dataset.editId)));
        grid.querySelectorAll('[data-observe-id]').forEach(btn=>btn.addEventListener('click',()=>openObservation(btn.dataset.observeId)));
        grid.querySelectorAll('[data-expand-id]').forEach(btn=>btn.addEventListener('click',()=>toggleExpand(btn.dataset.expandId)));
        grid.querySelectorAll('[data-dealers-id]').forEach(btn=>btn.addEventListener('click',()=>openDealers(btn.dataset.dealersId)));
    }

    function updateActiveFilterCount() {
        let count = 0;
        filterIds.forEach(id=>{ if(filters[id]?.value && filters[id].value!=='all') count++; });
        if (quickFilter!=='all') count++;
        activeFilterCount.textContent = count;
        filtersToggle.classList.toggle('is-active',count>0);
    }

    function toggleExpand(id) {
        const card=grid.querySelector(`[data-card-id="${CSS.escape(String(id))}"]`);
        if(!card) return;
        card.classList.toggle('is-expanded');
        card.querySelectorAll('[data-expand-id]').forEach(btn=>{
            const icon=btn.querySelector('i');
            if(icon && btn.closest('.competitor-collections-preview-head')) {
                icon.className=card.classList.contains('is-expanded')?'bi bi-chevron-up':'bi bi-chevron-down';
            }
        });
    }

    function updateViewButtons() {
        document.querySelectorAll('[data-view]').forEach(btn=>btn.classList.toggle('active',btn.dataset.view===viewMode));
        grid?.classList.toggle('is-list',viewMode==='list');
    }

    function resetFilters() {
        searchInput.value='';
        filterIds.forEach(id=>{ if(filters[id]) filters[id].value='all'; });
        if(sortBy) sortBy.value='priority';
        quickFilter='all';
        document.querySelectorAll('[data-quick]').forEach(btn=>btn.classList.toggle('active',btn.dataset.quick==='all'));
        renderGrid();
    }

    function dealerCompetitorEntries(dealer, competitorName) {
        return (Array.isArray(dealer?.competitors) ? dealer.competitors : [])
            .filter(item=>norm(item?.brand)===norm(competitorName))
            .map(item=>({
                collection:String(item.collection||''),
                price_opt:String(item.price_opt||''),
                price_retail:String(item.price_retail||'')
            }));
    }

    function presenceKey(dealerId) {
        return `${currentPresenceCompetitorId}::${dealerId}`;
    }

    function dealerPresenceState(dealer, competitor) {
        const key=presenceKey(idOf(dealer));
        if(dealerPresenceDrafts.has(key)) return dealerPresenceDrafts.get(key);
        const entries=dealerCompetitorEntries(dealer,competitor.name);
        return {present:entries.length>0,entries};
    }

    function presencePriceText(item) {
        const parts=[];
        if(item.price_opt) parts.push(`опт ${esc(item.price_opt)} ₸/м²`);
        if(item.price_retail) parts.push(`розница ${esc(item.price_retail)} ₸/м²`);
        return parts.join(' · ');
    }

    function renderDealerPresence() {
        const competitor=competitors.find(item=>idOf(item)===currentPresenceCompetitorId);
        if(!competitor||!presenceContainer) return;
        if(presenceTools) presenceTools.hidden=!canEditDealers;

        const query=norm(presenceSearch?.value);
        const filter=presenceFilter?.value||'all';
        const dealers=[...allDealers].sort((a,b)=>
            String(a.name||'').localeCompare(String(b.name||''),'ru')
        );
        const filtered=dealers.filter(dealer=>{
            const state=dealerPresenceState(dealer,competitor);
            const storedPresent=dealerCompetitorEntries(dealer,competitor.name).length>0;
            if(!canEditDealers&&!state.present) return false;
            if(filter==='present'&&!storedPresent) return false;
            if(filter==='missing'&&storedPresent) return false;
            const searchable=norm([dealer.name,dealer.city,dealer.sector].filter(Boolean).join(' '));
            return !query||searchable.includes(query);
        });

        if(!canEditDealers&&!allDealers.length) {
            presenceContainer.innerHTML='<div class="competitors-empty">Нет доступа к списку дилеров</div>';
            return;
        }
        if(!filtered.length) {
            const message=canEditDealers
                ? (query?'По запросу ничего не найдено':'Нет дилеров для отображения')
                : 'У дилеров этот бренд не отмечен';
            presenceContainer.innerHTML=`<div class="competitors-empty">${esc(message)}</div>`;
            return;
        }

        const visible=filtered;
        const collectionNames=[...new Set((competitor.collections||[])
            .map(item=>typeof item==='string'?item:item?.name)
            .map(name=>String(name||'').trim())
            .filter(Boolean))];
        const items=visible.map(dealer=>{
            const dealerId=idOf(dealer);
            const key=presenceKey(dealerId);
            const state=dealerPresenceState(dealer,competitor);
            const dirty=dealerPresenceDrafts.has(key);
            const entries=state.entries||[];
            const profileHref=`/dealer.html?id=${encodeURIComponent(dealerId)}`;
            if(!canEditDealers) {
                const chips=entries.map(item=>{
                    const label=[item.collection,presencePriceText(item)].filter(Boolean).join(' · ');
                    return label?`<span class="dealer-presence-price-chip">${label}</span>`:'';
                }).filter(Boolean).join('');
                return `<article class="dealer-presence-card">
                    <div class="dealer-presence-card-head"><div><a class="dealer-presence-name" href="${profileHref}"><strong>${esc(dealer.name||'Дилер')}</strong></a><small><i class="bi bi-geo-alt me-1"></i>${esc(dealer.city||'Город не указан')}</small></div></div>
                    ${chips?`<div class="dealer-presence-readonly-prices">${chips}</div>`:''}
                </article>`;
            }

            const lineRows=state.present?entries.map((item,index)=>{
                const available=collectionNames.some(name=>norm(name)===norm(item.collection));
                const options=[
                    `<option value="" ${item.collection?'':'selected'}>${collectionNames.length?'Выберите коллекцию':'Коллекции не добавлены у конкурента'}</option>`,
                    ...collectionNames.map(name=>`<option value="${esc(name)}" ${norm(name)===norm(item.collection)?'selected':''}>${esc(name)}</option>`),
                    ...(!available&&item.collection?[`<option value="${esc(item.collection)}" selected>${esc(item.collection)} (ранее отмечена)</option>`]:[])
                ].join('');
                return `<div class="dealer-presence-line">
                    <label class="collection-name"><span>Коллекция</span><select class="form-select" data-presence-field="collection" data-dealer-id="${esc(dealerId)}" data-row-index="${index}" ${!collectionNames.length&&!item.collection?'disabled':''}>${options}</select></label>
                    <label><span>Опт, ₸/м²</span><input class="form-control" inputmode="decimal" data-presence-field="price_opt" data-dealer-id="${esc(dealerId)}" data-row-index="${index}" value="${esc(item.price_opt)}" placeholder="Цена"></label>
                    <label><span>Розница, ₸/м²</span><input class="form-control" inputmode="decimal" data-presence-field="price_retail" data-dealer-id="${esc(dealerId)}" data-row-index="${index}" value="${esc(item.price_retail)}" placeholder="Цена"></label>
                    <button type="button" class="remove-line" data-presence-remove="${esc(dealerId)}" data-row-index="${index}" title="Удалить коллекцию"><i class="bi bi-x-lg"></i></button>
                </div>`;
            }).join(''):'';
            return `<article class="dealer-presence-card">
                <div class="dealer-presence-card-head">
                    <div><a class="dealer-presence-name" href="${profileHref}"><strong>${esc(dealer.name||'Дилер')}</strong></a><small><i class="bi bi-geo-alt me-1"></i>${esc(dealer.city||'Город не указан')}</small></div>
                    <label class="dealer-presence-toggle"><input type="checkbox" data-presence-toggle="${esc(dealerId)}" ${state.present?'checked':''}> Есть конкурент</label>
                </div>
                ${state.present?`<div class="dealer-presence-lines">${lineRows||'<div class="dealer-presence-empty">Коллекции пока не указаны</div>'}</div>`:''}
                ${state.present||dirty?`<div class="dealer-presence-actions">${state.present?`<button type="button" class="btn btn-sm btn-outline-secondary" data-presence-add="${esc(dealerId)}"><i class="bi bi-plus-lg me-1"></i>Добавить коллекцию</button>`:''}<button type="button" class="btn btn-sm btn-danger" data-presence-save="${esc(dealerId)}" ${!dirty||savingPresence.has(key)?'disabled':''}>${savingPresence.has(key)?'Сохраняем…':'Сохранить'}</button></div>`:''}
            </article>`;
        }).join('');
        presenceContainer.innerHTML=items;
    }

    function openDealers(id) {
        const competitor=competitors.find(x=>idOf(x)===String(id));
        if(!competitor) return;
        currentPresenceCompetitorId=idOf(competitor);
        $('dl-brand-name').textContent=competitor.name||'';
        if(presenceSearch) presenceSearch.value='';
        if(presenceFilter) presenceFilter.value='all';
        renderDealerPresence();
        dealersModal.show();
    }

    async function saveDealerPresence(dealerId) {
        const competitor=competitors.find(item=>idOf(item)===currentPresenceCompetitorId);
        const dealer=allDealers.find(item=>idOf(item)===String(dealerId));
        if(!competitor||!dealer||!canEditDealers) return;
        const key=presenceKey(idOf(dealer));
        const state=dealerPresenceDrafts.get(key);
        if(!state||savingPresence.has(key)) return;

        const otherEntries=(Array.isArray(dealer.competitors)?dealer.competitors:[])
            .filter(item=>norm(item?.brand)!==norm(competitor.name));
        const markedEntries=state.present
            ? (state.entries.length?state.entries:[{}]).map(item=>({
                brand:competitor.name,
                collection:String(item.collection||'').trim(),
                price_opt:String(item.price_opt||'').trim(),
                price_retail:String(item.price_retail||'').trim()
            }))
            : [];
        const next=[...otherEntries,...markedEntries];

        savingPresence.add(key);
        renderDealerPresence();
        try {
            const response=await fetch(`${API_DEALERS}/${encodeURIComponent(idOf(dealer))}`,{
                method:'PATCH',
                headers:{'Content-Type':'application/json'},
                body:JSON.stringify({competitors:next})
            });
            if(!response.ok) throw new Error('Не удалось сохранить присутствие конкурента');
            dealer.competitors=next;
            dealerPresenceDrafts.delete(key);
            toast('Данные о конкуренте у дилера сохранены');
        } catch(error) {
            toast(error.message||'Не удалось сохранить данные','error');
        } finally {
            savingPresence.delete(key);
            renderDealerPresence();
        }
    }

    function renderTypesManager() {
        const host=$('types-manager-list');
        if(!dynamicTypes.length) {
            host.innerHTML='<div class="competitors-empty">Пользовательских типов пока нет</div>';
            return;
        }
        host.innerHTML=dynamicTypes.map(type=>`<div class="competitor-type-row">
            <span class="competitor-type-badge"><i class="bi bi-circle-fill" style="color:${type.color}"></i>${esc(type.label)}</span>
            <div>
                <button type="button" class="comp-icon-btn" data-rename-type="${esc(type.val)}"><i class="bi bi-pencil"></i></button>
                <button type="button" class="comp-icon-btn is-danger" data-delete-type="${esc(type.val)}"><i class="bi bi-trash3"></i></button>
            </div>
        </div>`).join('');
        host.querySelectorAll('[data-rename-type]').forEach(btn=>btn.addEventListener('click',()=>renameType(btn.dataset.renameType)));
        host.querySelectorAll('[data-delete-type]').forEach(btn=>btn.addEventListener('click',()=>deleteType(btn.dataset.deleteType)));
    }

    async function renameType(oldType) {
        const next=prompt(`Новое название для «${oldType}»:`,oldType);
        if(!next||next.trim()===oldType) return;
        const clean=next.trim();
        if(defaultTypes.some(t=>t.val===clean)) return toast('Такой системный тип уже существует','warning');
        if(!confirm('Переименовать этот тип во всех брендах?')) return;
        await bulkUpdateType(oldType,clean);
        typesModal.hide();
    }

    async function deleteType(type) {
        if(!confirm(`Заменить тип «${type}» на «Стандарт» во всех брендах?`)) return;
        await bulkUpdateType(type,'std');
        typesModal.hide();
    }

    async function bulkUpdateType(from,to) {
        try {
            const jobs=competitors.map(c=>{
                let changed=false;
                const collections=(c.collections||[]).map(col=>{
                    const obj=typeof col==='string'?{name:col,type:'std'}:{...col};
                    if(normalizeType(obj.type)===from){obj.type=to;changed=true;}
                    return obj;
                });
                if(!changed) return null;
                return fetch(`${API_URL}/${encodeURIComponent(idOf(c))}`,{
                    method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...c,collections})
                });
            }).filter(Boolean);
            await Promise.all(jobs);
            await loadData();
            toast('Типы обновлены');
        } catch(error){toast('Не удалось обновить типы','error');}
    }

    function renderObservations() {
        if(!observationsContainer) return;
        const rows=orderedObservations(currentObservations);
        observationsContainer.innerHTML=rows.length?rows.map(o=>{
            const link=String(o.source_url||'').trim();
            const safeLink=/^https?:\/\//i.test(link)?link:'';
            const context=[o.city,o.dealer,o.product].filter(Boolean).join(' · ');
            const dealerLink=o.dealer_id?`<a href="/dealer.html?id=${encodeURIComponent(o.dealer_id)}"><i class="bi bi-shop"></i>${esc([o.city,o.dealer].filter(Boolean).join(' · ')||'Карточка дилера')}</a>`:'';
            return `<article class="competitor-observation-row">
                <div class="competitor-observation-row-top"><strong>${esc(observationTopics[o.topic]||'Наблюдение')}</strong><span>${dateText(o.date)} · ${esc(observationConfidence[o.confidence]||'Не проверено')}</span></div>
                <p>${esc(o.detail||'')}</p>
                <div class="competitor-observation-row-meta">${dealerLink|| (context?`<span><i class="bi bi-geo-alt"></i>${esc(context)}</span>`:'')}<span><i class="bi bi-link-45deg"></i>${esc(observationSources[o.source_type]||'Источник')}${o.source?` · ${esc(o.source)}`:''}</span>${safeLink?`<a href="${esc(safeLink)}" target="_blank" rel="noopener noreferrer">Открыть источник <i class="bi bi-box-arrow-up-right"></i></a>`:''}</div>
            </article>`;
        }).join(''):'<div class="competitor-observation-empty">Записей пока нет. Добавьте первое наблюдение с датой и источником.</div>';
    }

    function populateObservationDealers() {
        const select=$('obs-dealer-id');
        if(!select) return;
        const current=select.value||'';
        const rows=[...allDealers].sort((a,b)=>String(a.city||'').localeCompare(String(b.city||''),'ru')||String(a.name||'').localeCompare(String(b.name||''),'ru'));
        select.innerHTML='<option value="">Общее наблюдение, без дилера</option>'+rows.map(dealer=>{
            const label=[dealer.city,dealer.name,dealer.dealer_id].filter(Boolean).join(' · ');
            return `<option value="${esc(idOf(dealer))}">${esc(label||dealer.name||'Дилер')}</option>`;
        }).join('');
        if(rows.some(dealer=>idOf(dealer)===current)) select.value=current;
    }

    function openObservation(id) {
        if(!canObserve) return;
        const competitor=competitors.find(item=>idOf(item)===String(id));
        if(!competitor) return;
        selectedCompetitorId=idOf(competitor);
        $('obs-competitor-name').textContent=competitor.name||'';
        $('obs-topic').value='price';
        $('obs-source-type').value='visit';
        $('obs-detail').value='';
        $('obs-url').value='';
        $('obs-dealer-id').value='';
        observationModal.show();
        setTimeout(()=>$('obs-detail')?.focus(),180);
    }

    async function saveObservation() {
        if(!canObserve||!selectedCompetitorId) return;
        const detail=$('obs-detail')?.value.trim()||'';
        if(!detail) return toast('Напишите, что заметили','warning');
        const sourceUrl=$('obs-url')?.value.trim()||'';
        if(sourceUrl&&!/^https?:\/\//i.test(sourceUrl)) return toast('Ссылка должна начинаться с http:// или https://','warning');
        const saveBtn=$('obs-save-btn');
        const old=saveBtn.innerHTML;
        saveBtn.disabled=true;
        saveBtn.innerHTML='<span class="spinner-border spinner-border-sm"></span> Сохраняем…';
        const sourceType=$('obs-source-type')?.value||'visit';
        try{
            const response=await fetch(`${API_URL}/${encodeURIComponent(selectedCompetitorId)}/observations`,{
                method:'POST',headers:{'Content-Type':'application/json'},
                body:JSON.stringify({
                    date:dateKeyToday(),
                    topic:$('obs-topic')?.value||'other',
                    source_type:sourceType,
                    source_url:sourceUrl,
                    dealer_id:$('obs-dealer-id')?.value||'',
                    detail
                })
            });
            const data=await response.json().catch(()=>({}));
            if(!response.ok) throw new Error(data.error||'Не удалось сохранить наблюдение');
            observationModal.hide();
            toast('Наблюдение сохранено в досье конкурента');
            await loadData();
        }catch(error){toast(error.message||'Ошибка сохранения','error');}
        finally{saveBtn.disabled=false;saveBtn.innerHTML=old;}
    }

    function resetForm() {
        form.reset();
        currentObservations=[];
        renderObservations();
        fields.id.value='';
        fields.status.value='active';
        fields.priority.value='medium';
        currentLogo='';
        logoPreview.hidden=true;
        logoPreview.src='';
        logoPlaceholder.hidden=false;
        logoInput.value='';
        collectionsContainer.innerHTML='';
        contactsContainer.innerHTML='';
        addressesContainer.innerHTML='';
        addCollectionRow();
        addContactRow();
        addAddressRow();
        deleteBtn.hidden=true;
    }

    function setLogo(value) {
        currentLogo=value||'';
        if(currentLogo){
            logoPreview.src=currentLogo;
            logoPreview.hidden=false;
            logoPlaceholder.hidden=true;
        } else {
            logoPreview.hidden=true;
            logoPreview.src='';
            logoPlaceholder.hidden=false;
        }
    }

    function openCreate() {
        if(!canManage) return;
        resetForm();
        modalTitle.textContent='Новый конкурент';
        modal.show();
    }

    function openEdit(id) {
        if(!canManage) return;
        const c=competitors.find(x=>idOf(x)===String(id));
        if(!c) return;
        resetForm();
        fields.id.value=idOf(c);
        fields.name.value=c.name||'';
        fields.country.value=c.country||'';
        fields.status.value=c.status||'active';
        fields.priority.value=c.priority||'medium';
        fields.segment.value=c.segment||'';
        fields.tags.value=(c.tags||[]).filter(tag=>norm(tag)!==norm(MAIN_COMPETITOR_TAG)).join(', ');
        fields.isMain.checked=isMainCompetitor(c);
        fields.supplier.value=c.supplier||'';
        fields.warehouse.value=c.warehouse||'';
        fields.website.value=c.website||'';
        fields.instagram.value=c.instagram||'';
        fields.storage.value=c.storage_days||'';
        fields.stock.value=c.stock_info||'';
        fields.reserve.value=c.reserve_days||'';
        fields.pricePositioning.value=c.price_positioning||'';
        fields.lastMonitoring.value=c.last_monitoring_date||'';
        fields.nextMonitoring.value=c.next_monitoring_date||'';
        fields.monitoringOwner.value=c.monitoring_owner||'';
        fields.strengths.value=c.strengths||'';
        fields.weaknesses.value=c.weaknesses||'';
        fields.info.value=c.info||'';
        setLogo(c.logoUrl||'');
        currentObservations=Array.isArray(c.observations)?[...c.observations]:[];
        renderObservations();

        collectionsContainer.innerHTML='';
        (c.collections||[]).length
            ? (c.collections||[]).forEach(col=>addCollectionRow(typeof col==='string'?{name:col,type:'std'}:col))
            : addCollectionRow();
        contactsContainer.innerHTML='';
        (c.contacts||[]).length ? c.contacts.forEach(addContactRow) : addContactRow();
        addressesContainer.innerHTML='';
        (c.addresses||[]).length ? c.addresses.forEach(addAddressRow) : addAddressRow();

        modalTitle.textContent=`Редактирование · ${c.name||''}`;
        deleteBtn.hidden=false;
        modal.show();
    }

    function typeOptions(selected='std') {
        const options=getAllTypes().map(t=>`<option value="${esc(t.val)}" ${t.val===selected?'selected':''}>${esc(t.label)}</option>`).join('');
        return options+'<option value="__NEW__">+ Свой тип…</option>';
    }

    function addCollectionRow(data={}) {
        const row=document.createElement('div');
        row.className='competitor-collection-edit';
        row.innerHTML=`
            <div class="competitor-collection-edit-top">
                <input class="form-control coll-name" placeholder="Название коллекции" value="${esc(data.name||'')}">
                <select class="form-select collection-type-select">${typeOptions(data.type||'std')}</select>
                <button type="button" class="comp-entry-remove"><i class="bi bi-x-lg"></i></button>
            </div>
            <div class="competitor-collection-edit-details">
                <label><span>Класс</span><input class="form-control coll-class" value="${esc(data.class||'')}" placeholder="33 / 34"></label>
                <label><span>Толщина</span><input class="form-control coll-thickness" value="${esc(data.thickness||'')}" placeholder="8 мм"></label>
                <label><span>Формат</span><input class="form-control coll-format" value="${esc(data.format||'')}" placeholder="600×100"></label>
                <label><span>Опт, ₸/м²</span><input class="form-control coll-opt" value="${esc(data.price_opt||'')}" placeholder="Например, 8 500"></label>
                <label><span>Розница, ₸/м²</span><input class="form-control coll-retail" value="${esc(data.price_retail||'')}" placeholder="Например, 11 900"></label>
                <label class="wide"><span>Заметка</span><input class="form-control coll-note" value="${esc(data.note||'')}" placeholder="Акция, фаска, замок, особенности…"></label>
            </div>`;
        row.querySelector('.comp-entry-remove').addEventListener('click',()=>row.remove());
        row.querySelector('.collection-type-select').addEventListener('change',event=>{
            if(event.target.value!=='__NEW__') return;
            const name=prompt('Название нового типа коллекции:');
            if(name&&name.trim()){
                const clean=name.trim();
                const opt=document.createElement('option');
                opt.value=clean;opt.textContent=clean;opt.selected=true;
                event.target.insertBefore(opt,event.target.lastElementChild);
            } else event.target.value='std';
        });
        collectionsContainer.appendChild(row);
    }

    function addContactRow(data={}) {
        const row=document.createElement('div');
        row.className='competitor-entry contact';
        row.innerHTML=`
            <input class="form-control cnt-name" placeholder="Имя" value="${esc(data.name||'')}">
            <input class="form-control cnt-position" placeholder="Должность" value="${esc(data.position||'')}">
            <input class="form-control cnt-phone" placeholder="Телефон" value="${esc(data.phone||'')}">
            <button type="button" class="comp-entry-remove"><i class="bi bi-x-lg"></i></button>`;
        row.querySelector('.comp-entry-remove').addEventListener('click',()=>row.remove());
        contactsContainer.appendChild(row);
    }

    function addAddressRow(data={}) {
        const row=document.createElement('div');
        row.className='competitor-entry address';
        row.innerHTML=`
            <input class="form-control addr-desc" placeholder="Описание" value="${esc(data.description||'')}">
            <input class="form-control addr-city" placeholder="Город" value="${esc(data.city||'')}">
            <input class="form-control addr-address" placeholder="Адрес" value="${esc(data.address||'')}">
            <button type="button" class="comp-entry-remove"><i class="bi bi-x-lg"></i></button>`;
        row.querySelector('.comp-entry-remove').addEventListener('click',()=>row.remove());
        addressesContainer.appendChild(row);
    }

    function collectCollections() {
        return [...collectionsContainer.querySelectorAll('.competitor-collection-edit')].map(row=>({
            name:row.querySelector('.coll-name').value.trim(),
            type:row.querySelector('.collection-type-select').value==='__NEW__'?'std':row.querySelector('.collection-type-select').value,
            class:row.querySelector('.coll-class').value.trim(),
            thickness:row.querySelector('.coll-thickness').value.trim(),
            format:row.querySelector('.coll-format').value.trim(),
            price_opt:row.querySelector('.coll-opt').value.trim(),
            price_retail:row.querySelector('.coll-retail').value.trim(),
            note:row.querySelector('.coll-note').value.trim()
        })).filter(item=>item.name);
    }
    function collectContacts() {
        return [...contactsContainer.querySelectorAll('.competitor-entry')].map(row=>({
            name:row.querySelector('.cnt-name').value.trim(),
            position:row.querySelector('.cnt-position').value.trim(),
            phone:row.querySelector('.cnt-phone').value.trim()
        })).filter(item=>item.name||item.phone);
    }
    function collectAddresses() {
        return [...addressesContainer.querySelectorAll('.competitor-entry')].map(row=>({
            description:row.querySelector('.addr-desc').value.trim(),
            city:row.querySelector('.addr-city').value.trim(),
            address:row.querySelector('.addr-address').value.trim()
        })).filter(item=>item.city||item.address);
    }

    function formPayload() {
        return {
            name:fields.name.value.trim(),
            country:fields.country.value.trim(),
            status:fields.status.value,
            priority:fields.priority.value,
            segment:fields.segment.value.trim(),
            tags:(()=>{
                const tags=fields.tags.value.split(',').map(x=>x.trim()).filter(x=>x&&norm(x)!==norm(MAIN_COMPETITOR_TAG));
                if(fields.isMain.checked) tags.push(MAIN_COMPETITOR_TAG);
                return tags;
            })(),
            supplier:fields.supplier.value.trim(),
            warehouse:fields.warehouse.value.trim(),
            website:fields.website.value.trim(),
            instagram:fields.instagram.value.trim(),
            storage_days:fields.storage.value.trim(),
            stock_info:fields.stock.value.trim(),
            reserve_days:fields.reserve.value.trim(),
            price_positioning:fields.pricePositioning.value.trim(),
            last_monitoring_date:fields.lastMonitoring.value,
            next_monitoring_date:fields.nextMonitoring.value,
            monitoring_owner:fields.monitoringOwner.value.trim(),
            strengths:fields.strengths.value.trim(),
            weaknesses:fields.weaknesses.value.trim(),
            info:fields.info.value.trim(),
            logoUrl:currentLogo,
            collections:collectCollections(),
            contacts:collectContacts(),
            addresses:collectAddresses()
        };
    }

    async function saveCompetitor(event) {
        event.preventDefault();
        if(!canManage||isSaving) return;
        const payload=formPayload();
        if(!payload.name) return toast('Укажите название бренда','warning');
        if(payload.last_monitoring_date&&payload.next_monitoring_date&&payload.next_monitoring_date<payload.last_monitoring_date) {
            return toast('Следующая проверка не может быть раньше последней','warning');
        }
        isSaving=true;
        saveBtn.disabled=true;
        const old=saveBtn.innerHTML;
        saveBtn.innerHTML='<span class="spinner-border spinner-border-sm"></span> Сохраняем…';
        try{
            const id=fields.id.value;
            const response=await fetch(id?`${API_URL}/${encodeURIComponent(id)}`:API_URL,{
                method:id?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)
            });
            const data=await response.json().catch(()=>({}));
            if(!response.ok) throw new Error(data.error||'Не удалось сохранить');
            modal.hide();
            toast(id?'Конкурент обновлён':'Конкурент добавлен');
            await loadData();
        }catch(error){toast(error.message||'Ошибка сохранения','error');}
        finally{isSaving=false;saveBtn.disabled=false;saveBtn.innerHTML=old;}
    }

    async function deleteCompetitor() {
        if(!canManage) return;
        const id=fields.id.value;
        if(!id) return;
        const c=competitors.find(x=>idOf(x)===id);
        if(!confirm(`Удалить бренд «${c?.name||''}» из справочника?`)) return;
        try{
            const res=await fetch(`${API_URL}/${encodeURIComponent(id)}`,{method:'DELETE'});
            if(!res.ok) throw new Error('Не удалось удалить');
            modal.hide();
            toast('Конкурент удалён');
            await loadData();
        }catch(error){toast(error.message,'error');}
    }

    async function exportCsv() {
        if(!competitors.length) return toast('Нет данных для экспорта','warning');
        const clean=value=>`"${String(value??'').replace(/"/g,'""')}"`;
        let csv='\uFEFFБренд;Страна;Статус;Приоритет;Сегмент;Поставщик;Склад;Коллекция;Тип;Класс;Толщина;Формат;Опт, ₸/м²;Розница, ₸/м²;Дилеров;Последний мониторинг;Следующий мониторинг;Ответственный;Сильные стороны;Слабые стороны;Теги;Сайт;Instagram;Заметки;История наблюдений\n';
        competitors.forEach(c=>{
            const base=[
                c.name,c.country,statusLabel(c.status||'active'),priorityLabel(c.priority||'medium'),c.segment,c.supplier,c.warehouse
            ].map(clean).join(';');
            const tail=[
                dealerCount(c),c.last_monitoring_date,c.next_monitoring_date,c.monitoring_owner,c.strengths,c.weaknesses,(c.tags||[]).join(', '),c.website,c.instagram,c.info,
                orderedObservations(c.observations).map(o=>[`${dateText(o.date)} ${observationTopics[o.topic]||'Наблюдение'}: ${o.detail}`,o.city,o.dealer,o.source,o.source_url,observationConfidence[o.confidence]||''].filter(Boolean).join(' · ')).join(' | ')
            ].map(clean).join(';');
            const collections=(c.collections||[]).length?c.collections:[{}];
            collections.forEach(raw=>{
                const col=typeof raw==='string'?{name:raw,type:'std'}:raw;
                csv+=base+';'+[col.name,typeInfo(col.type).label,col.class,col.thickness,col.format,col.price_opt,col.price_retail].map(clean).join(';')+';'+tail+'\n';
            });
        });
        const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
        const url=URL.createObjectURL(blob);
        const a=document.createElement('a');
        a.href=url;a.download='IDEAL_FLOOR_Competitors.csv';document.body.appendChild(a);a.click();a.remove();
        setTimeout(()=>URL.revokeObjectURL(url),500);
    }

    async function init() {
        if(window.CRMAuth?.ready) await CRMAuth.ready;
        canManage=Boolean(window.CRMAuth?.can('can_manage_competitors'));
        canObserve=Boolean(window.CRMAuth?.can('can_view_competitors'));
        canEditDealers=Boolean(window.CRMAuth?.can('can_edit_dealer'));
        canExport=Boolean(window.CRMAuth?.can('can_export_prices'));
        if(addBtn) addBtn.style.display=canManage?'':'none';
        if(manageTypesBtn) manageTypesBtn.style.display=canManage?'':'none';
        if(exportBtn) exportBtn.style.display=canExport?'':'none';
        await loadData();
    }

    $('comp-logo-btn')?.addEventListener('click',()=>logoInput.click());
    logoInput?.addEventListener('change',event=>{
        const file=event.target.files?.[0];
        if(!file) return;
        if(file.size>2*1024*1024) return toast('Логотип больше 2 МБ','warning');
        const reader=new FileReader();
        reader.onload=()=>setLogo(reader.result);
        reader.onerror=()=>toast('Не удалось прочитать изображение','error');
        reader.readAsDataURL(file);
    });

    addBtn?.addEventListener('click',openCreate);
    exportBtn?.addEventListener('click',exportCsv);
    form?.addEventListener('submit',saveCompetitor);
    deleteBtn?.addEventListener('click',deleteCompetitor);
    $('add-coll-row-btn')?.addEventListener('click',()=>addCollectionRow());
    $('btn-add-contact')?.addEventListener('click',()=>addContactRow());
    $('btn-add-address')?.addEventListener('click',()=>addAddressRow());
    $('obs-save-btn')?.addEventListener('click',saveObservation);

    searchInput?.addEventListener('input',renderGrid);
    filterIds.forEach(id=>filters[id]?.addEventListener('change',renderGrid));
    sortBy?.addEventListener('change',renderGrid);
    resetFiltersBtn?.addEventListener('click',resetFilters);
    filtersToggle?.addEventListener('click',()=>{
        document.querySelector('.competitors-toolbar')?.classList.toggle('filters-open');
    });
    manageTypesBtn?.addEventListener('click',()=>{
        if(!canManage) return;
        renderTypesManager();typesModal.show();
    });

    document.querySelectorAll('[data-view]').forEach(btn=>btn.addEventListener('click',()=>{
        viewMode=btn.dataset.view;
        localStorage.setItem('competitors_view',viewMode);
        updateViewButtons();renderGrid();
    }));
    document.querySelectorAll('[data-quick]').forEach(btn=>btn.addEventListener('click',()=>{
        quickFilter=btn.dataset.quick||'all';
        document.querySelectorAll('[data-quick]').forEach(x=>x.classList.toggle('active',x===btn));
        renderGrid();
    }));

    presenceSearch?.addEventListener('input',renderDealerPresence);
    presenceFilter?.addEventListener('change',renderDealerPresence);

    function updateDealerPresenceField(input) {
        if(!input||!canEditDealers) return;
        const dealer=allDealers.find(item=>idOf(item)===input.dataset.dealerId);
        const competitor=competitors.find(item=>idOf(item)===currentPresenceCompetitorId);
        if(!dealer||!competitor) return;
        const field=input.dataset.presenceField;
        if(!['collection','price_opt','price_retail'].includes(field)) return;
        const key=presenceKey(idOf(dealer));
        const current=dealerPresenceState(dealer,competitor);
        const state={present:true,entries:(current.entries||[]).map(item=>({...item}))};
        const index=Number(input.dataset.rowIndex);
        if(!Number.isInteger(index)||index<0) return;
        while(state.entries.length<=index) state.entries.push({collection:'',price_opt:'',price_retail:''});
        state.entries[index][field]=input.value;
        dealerPresenceDrafts.set(key,state);
        const save=[...presenceContainer.querySelectorAll('[data-presence-save]')].find(button=>button.dataset.presenceSave===idOf(dealer));
        if(save) save.disabled=savingPresence.has(key);
    }

    presenceContainer?.addEventListener('change',event=>{
        const field=event.target.closest('[data-presence-field]');
        if(field&&field.tagName==='SELECT') {
            updateDealerPresenceField(field);
            return;
        }
        const toggle=event.target.closest('[data-presence-toggle]');
        if(!toggle||!canEditDealers) return;
        const dealer=allDealers.find(item=>idOf(item)===toggle.dataset.presenceToggle);
        const competitor=competitors.find(item=>idOf(item)===currentPresenceCompetitorId);
        if(!dealer||!competitor) return;
        const key=presenceKey(idOf(dealer));
        const current=dealerPresenceState(dealer,competitor);
        const entries=(current.entries||[]).map(item=>({...item}));
        if(toggle.checked&&!entries.length) entries.push({collection:'',price_opt:'',price_retail:''});
        dealerPresenceDrafts.set(key,{present:toggle.checked,entries});
        renderDealerPresence();
    });

    presenceContainer?.addEventListener('input',event=>{
        const input=event.target.closest('[data-presence-field]');
        if(input) updateDealerPresenceField(input);
    });

    presenceContainer?.addEventListener('click',event=>{
        const add=event.target.closest('[data-presence-add]');
        if(add&&canEditDealers) {
            const dealer=allDealers.find(item=>idOf(item)===add.dataset.presenceAdd);
            const competitor=competitors.find(item=>idOf(item)===currentPresenceCompetitorId);
            if(!dealer||!competitor) return;
            const key=presenceKey(idOf(dealer));
            const current=dealerPresenceState(dealer,competitor);
            const entries=(current.entries||[]).map(item=>({...item}));
            entries.push({collection:'',price_opt:'',price_retail:''});
            dealerPresenceDrafts.set(key,{present:true,entries});
            renderDealerPresence();
            return;
        }

        const remove=event.target.closest('[data-presence-remove]');
        if(remove&&canEditDealers) {
            const dealer=allDealers.find(item=>idOf(item)===remove.dataset.presenceRemove);
            const competitor=competitors.find(item=>idOf(item)===currentPresenceCompetitorId);
            if(!dealer||!competitor) return;
            const key=presenceKey(idOf(dealer));
            const current=dealerPresenceState(dealer,competitor);
            const entries=(current.entries||[]).map(item=>({...item}));
            entries.splice(Number(remove.dataset.rowIndex),1);
            dealerPresenceDrafts.set(key,{present:true,entries});
            renderDealerPresence();
            return;
        }

        const save=event.target.closest('[data-presence-save]');
        if(save&&canEditDealers) saveDealerPresence(save.dataset.presenceSave);
    });

    dealersModal._element?.addEventListener('hidden.bs.modal',()=>{
        currentPresenceCompetitorId='';
        if(presenceContainer) presenceContainer.innerHTML='';
    });

    init();
});