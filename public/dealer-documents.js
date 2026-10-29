
(() => {
    'use strict';

    const state = {
        dealer: null,
        user: null,
        templates: {},
        qrPromise: null,
        catalog: [],
        selectedEntityIndex: 0
    };

    const templatePaths = {
        supply: '/document-templates/supply.html',
        storage: '/document-templates/storage.html',
        passport: '/document-templates/passport.html'
    };

    const monthNames = [
        'января','февраля','марта','апреля','мая','июня',
        'июля','августа','сентября','октября','ноября','декабря'
    ];

    const escapeHtml = (value) => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const safeFileName = (value) => String(value || 'Дилер')
        .replace(/[\\/:*?"<>|]+/g, '_')
        .replace(/\s+/g, ' ')
        .trim();

    const valueOrLine = (value, line = '____________________') =>
        value ? escapeHtml(value) : line;

    function getDealer() {
        if (!state.dealer) throw new Error('Данные дилера еще не загружены');
        return state.dealer;
    }

    function inferEntityType(type, name='') {
        const explicit = String(type || '').trim();
        if (explicit) return explicit;
        const value = String(name || '').trim();
        if (/^ИП\b/i.test(value)) return 'ИП';
        if (/^(ЧС|ФЛ|Физ|частн)/i.test(value)) return 'Частное лицо';
        return 'ТОО';
    }

    function getLegalEntities(dealer) {
        if (Array.isArray(dealer.legal_entities) && dealer.legal_entities.length) {
            return dealer.legal_entities.filter(entity => entity && (entity.organizationName || entity.bin || entity.iik));
        }

        const r = dealer.requisites || {};
        const orgs = Array.isArray(dealer.organizations) ? dealer.organizations.filter(Boolean) : [];
        const contacts = Array.isArray(dealer.contacts) ? dealer.contacts : [];
        const leader = contacts.find(c => /директор|руководител|владел/i.test(String(c?.position || ''))) || contacts[0] || {};
        const primaryName = r.organizationName || orgs[0] || dealer.organization || dealer.name || '';
        const entities = [];

        if (primaryName || Object.values(r).some(Boolean)) {
            entities.push({
                type: inferEntityType('', primaryName),
                organizationName: primaryName,
                director: r.director || leader.name || '',
                legalAddress: r.legalAddress || dealer.address || '',
                bin: r.bin || '',
                iik: r.iik || '',
                bank: r.bank || '',
                bik: r.bik || '',
                kbe: r.kbe || '',
                email: r.email || ''
            });
        }

        orgs.slice(1).forEach(name => entities.push({
            type: inferEntityType('', name),
            organizationName: name,
            director: '',
            legalAddress: dealer.address || '',
            bin: '',
            iik: '',
            bank: '',
            bik: '',
            kbe: '',
            email: ''
        }));

        return entities;
    }

    function getRequisites(dealer) {
        const entities = getLegalEntities(dealer);
        const index = Math.max(0, Math.min(state.selectedEntityIndex, Math.max(0, entities.length - 1)));
        const selected = entities[index] || {};
        return {
            type: inferEntityType(selected.type, selected.organizationName),
            organizationName: selected.organizationName || dealer.name || '',
            director: selected.director || '',
            legalAddress: selected.legalAddress || dealer.address || '',
            bin: selected.bin || '',
            iik: selected.iik || '',
            bank: selected.bank || '',
            bik: selected.bik || '',
            kbe: selected.kbe || '',
            email: selected.email || ''
        };
    }

    function legalEntityStorageKey(dealer) {
        return `dealer_doc_entity_${dealer?.id || dealer?._id || dealer?.dealer_id || 'current'}`;
    }

    function updateEntityPickerSummary() {
        if (!state.dealer) return;
        const req = getRequisites(state.dealer);
        const currentEl = document.getElementById('dealer-doc-entity-current');
        const metaEl = document.getElementById('dealer-doc-entity-meta');
        if (currentEl) currentEl.textContent = req.organizationName || 'Организация не заполнена';
        if (metaEl) {
            const details = [req.type, req.bin ? `БИН/ИИН ${req.bin}` : '', req.bank || ''].filter(Boolean);
            metaEl.textContent = details.length
                ? details.join(' · ')
                : 'Заполните реквизиты организации, чтобы документы формировались полностью.';
        }
    }

    function populateEntitySelector() {
        const select = document.getElementById('dealer-doc-entity-select');
        if (!select || !state.dealer) return;

        const entities = getLegalEntities(state.dealer);
        select.innerHTML = '';

        if (!entities.length) {
            select.innerHTML = '<option value="0">Организация не заполнена</option>';
            select.disabled = true;
            state.selectedEntityIndex = 0;
            updateEntityPickerSummary();
            return;
        }

        select.disabled = false;
        entities.forEach((entity, index) => {
            const type = inferEntityType(entity.type, entity.organizationName);
            const name = entity.organizationName || `Организация ${index + 1}`;
            const option = new Option(`${type} · ${name}`, String(index));
            select.add(option);
        });

        const saved = Number(localStorage.getItem(legalEntityStorageKey(state.dealer)));
        if (Number.isInteger(saved) && saved >= 0 && saved < entities.length) state.selectedEntityIndex = saved;
        if (state.selectedEntityIndex >= entities.length) state.selectedEntityIndex = 0;
        select.value = String(state.selectedEntityIndex);

        select.onchange = () => {
            state.selectedEntityIndex = Number(select.value) || 0;
            localStorage.setItem(legalEntityStorageKey(state.dealer), String(state.selectedEntityIndex));
            updateEntityPickerSummary();
            render();
        };

        updateEntityPickerSummary();
    }

    function getContact(dealer) {
        const contacts = Array.isArray(dealer.contacts) ? dealer.contacts : [];
        const c = contacts.find(x => x?.name || x?.contactInfo) || {};
        return {
            name: c.name || '',
            position: c.position || '',
            phone: c.contactInfo || ''
        };
    }

    function dateInfo(dealer) {
        const source = dealer.contract?.date;
        const d = source && !Number.isNaN(new Date(source).getTime())
            ? new Date(source + (source.length === 10 ? 'T12:00:00' : ''))
            : new Date();
        const year = d.getFullYear();
        const month = d.getMonth();
        const day = d.getDate();
        const dd = String(day).padStart(2, '0');
        const mm = String(month + 1).padStart(2, '0');
        return {
            year,
            day,
            dd,
            mm,
            monthName: monthNames[month],
            long: `${day} ${monthNames[month]} ${year} года`,
            short: `${dd}.${mm}.${year}`,
            slash: `${dd}/${mm}/${year}`
        };
    }

    function contractNumber(dealer) {
        const explicit = String(dealer.contract?.number || '').trim();
        if (explicit) return explicit;
        const raw = String(dealer.dealer_id || '').trim();
        if (!raw) return 'IF000';
        if (/^IF/i.test(raw)) return raw.toUpperCase();
        return `IF${raw}`;
    }

    function yandexLocation(dealer) {
        const lat = Number(dealer.latitude);
        const lng = Number(dealer.longitude);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
            return `https://yandex.kz/maps/?pt=${lng},${lat}&z=17&l=map`;
        }
        return dealer.website || '';
    }

    function normalizeCode(value) {
        return String(value || '').toLowerCase().replace(/[^a-zа-я0-9]/gi, '');
    }

    function productIsPresent(dealer, code) {
        const products = Array.isArray(dealer.products) ? dealer.products : [];
        const target = normalizeCode(code);
        const prefix = (String(code).match(/[A-Za-z]+/) || [''])[0].toLowerCase();
        const match = String(code).match(/(\d+)$/);
        const digits = match ? match[1] : '';

        return products.some(p => {
            const sku = normalizeCode(p?.sku || '');
            const name = normalizeCode(p?.name || '');
            if (sku.includes(target) || name.includes(target)) return true;
            if (prefix && digits && sku.includes(prefix) && sku.endsWith(digits)) return true;
            return false;
        });
    }

    function checkboxLine(dealer, code, name) {
        const checked = productIsPresent(dealer, code);
        return `<div class="passport-check ${checked ? 'is-checked' : ''}"><span class="passport-box">${checked ? '✓' : ''}</span><b>${escapeHtml(code)}</b> ${escapeHtml(name)}</div>`;
    }

    function inferProductGroup(product) {
        const raw = String(product?.sku || '') + ' ' + String(product?.name || '');
        const normalized = normalizeCode(raw);
        if (normalized.includes('eh')) return 'ENGLAND HERRINGBONE';
        if (normalized.includes('hp')) return 'HERRINGBONE PARQUET';
        if (normalized.includes('fp')) return 'FRENCH PARQUET';
        if (normalized.includes('mc')) return 'MAGIC COLLECTION';
        if (normalized.includes('ic')) return 'IDEAL CLASSIC';
        if (normalized.includes('rwn') || normalized.includes('rwz') || /real\s*wood/i.test(raw)) return 'REAL WOOD';
        return 'ДРУГИЕ КОЛЛЕКЦИИ';
    }

    function checkboxProduct(dealer, product) {
        const code = product?.sku || '—';
        const name = product?.name || 'Без названия';
        const checked = productIsPresent(dealer, code);
        return `<div class="passport-check ${checked ? 'is-checked' : ''}"><span class="passport-box">${checked ? '✓' : ''}</span><b>${escapeHtml(code)}</b> ${escapeHtml(name)}</div>`;
    }

    function buildPassportMatrix(dealer) {
        const catalog = Array.isArray(state.catalog) ? state.catalog.filter(p => p && (p.sku || p.name)) : [];

        if (catalog.length) {
            const groups = new Map();
            catalog.forEach(product => {
                const group = inferProductGroup(product);
                if (!groups.has(group)) groups.set(group, []);
                groups.get(group).push(product);
            });

            const englandProducts = groups.get('ENGLAND HERRINGBONE') || [];
            groups.delete('ENGLAND HERRINGBONE');

            const left = englandProducts.length
                ? englandProducts.map(p => checkboxProduct(dealer, p)).join('')
                : '<span class="passport-muted">Нет позиций в каталоге</span>';

            const preferredOrder = ['HERRINGBONE PARQUET','FRENCH PARQUET','MAGIC COLLECTION','IDEAL CLASSIC','REAL WOOD','ДРУГИЕ КОЛЛЕКЦИИ'];
            const middle = preferredOrder
                .filter(group => groups.has(group))
                .map(group => `<div class="passport-group-title">${escapeHtml(group)}</div>` + groups.get(group).map(p => checkboxProduct(dealer, p)).join(''))
                .join('') || '<span class="passport-muted">Нет позиций в каталоге</span>';

            return `<table class="passport-matrix"><thead><tr><th>ENGLAND HERRINGBONE</th><th>PARQUET / MAGIC / CLASSIC / ДРУГИЕ</th><th>ОБОРУДОВАНИЕ И POSM</th></tr></thead><tbody><tr><td>${left}</td><td>${middle}</td><td>${buildPassportEquipment(dealer)}</td></tr></tbody></table>`;
        }

        const england = [
            ['EH-702','Дуб Арабика'],['EH-703','Дуб Мокко'],['EH-704','Дуб Капучино'],
            ['EH-705','Дуб Голд'],['EH-706','Орех Кедровый'],['EH-707','Дуб Натур'],
            ['EH-708','Дуб Робуста'],['EH-709','Дуб Паркетный'],['EH-710','Дуб Блэквуд'],
            ['EH-711','Дуб Миндаль'],['EH-712','Дуб Эмбер'],['EH-713','Дуб Бурбон'],
            ['EH-714','Дуб Твин'],['EH-715','Дуб Флорвуд'],['EH-716','Дуб Лайт'],
            ['EH-717','Дуб Натур светлый'],['EH-718','Дуб Хайвуд'],['EH-719','Дуб Стоун'],
            ['EH-720','Дуб Крафтовый'],['EH-721','Дуб Медовый'],['EH-722','Дуб Медовый'],
            ['EH-723','Дуб Грейвуд'],['EH-724','Дуб Рокс'],['EH-725','Дуб Ванильный'],
            ['EH-726','Дуб Либерти'],['EH-727','Дуб Хэннеси'],['EH-728','Дуб Джерси'],
            ['EH-729','Дуб Артвуд']
        ];

        const otherGroups = [
            ['HERRINGBONE PARQUET', [['HP-31','Дуб Лоредо'],['HP-32','Дуб Родос'],['HP-91','Дуб Браун'],['HP-92','Дуб Латте'],['HP-94','Дуб Аланда'],['HP-95','Дуб Сантана'],['HP-96','Дуб Алор'],['HP-97','Дуб Айленд']]],
            ['FRENCH PARQUET', [['FP-43','Paris Натур'],['FP-44','Paris Рустик'],['FP-45','Версаль Светлый'],['FP-46','Версаль Капучино']]],
            ['MAGIC COLLECTION', [['MC-101','Орех Испанский'],['MC-102','Орех Венгерский'],['MC-103','Дуб Австрийский']]],
            ['IDEAL CLASSIC', [['IC-01','Дуб Натуральный'],['IC-02','Дуб Светлый'],['IC-03','Камешки'],['IC-04','Аллюминий']]]
        ];

        const left = england.map(([code,name]) => checkboxLine(dealer, code, name)).join('');
        const middle = otherGroups.map(([title, items]) =>
            `<div class="passport-group-title">${escapeHtml(title)}</div>` +
            items.map(([code,name]) => checkboxLine(dealer, code, name)).join('')
        ).join('');

        return `<table class="passport-matrix"><thead><tr><th>ENGLAND HERRINGBONE</th><th>PARQUET / MAGIC / CLASSIC</th><th>ОБОРУДОВАНИЕ И POSM</th></tr></thead><tbody><tr><td>${left}</td><td>${middle}</td><td>${buildPassportEquipment(dealer)}</td></tr></tbody></table>`;
    }

    function sumPos(dealer, matcher) {
        const list = Array.isArray(dealer.pos_materials) ? dealer.pos_materials : [];
        return list.reduce((sum, item) => matcher(String(item?.name || '').toLowerCase()) ? sum + (Number(item?.quantity) || 0) : sum, 0);
    }

    function buildPassportEquipment(dealer) {
        const items = Array.isArray(dealer.pos_materials)
            ? dealer.pos_materials.filter(item => item && (item.name || Number(item.quantity) > 0))
            : [];

        if (!items.length) {
            return '<div class="passport-eq-empty">Стенды и POS не указаны</div>';
        }

        return items.map(item => {
            const qty = Number(item.quantity) || 0;
            return `<div class="passport-eq-row"><span>${escapeHtml(item.name || 'Оборудование')}</span><b>${qty} шт.</b></div>`;
        }).join('');
    }

    function passportPosTotal(dealer) {
        return (dealer.pos_materials || []).reduce((sum, item) => sum + (Number(item?.quantity) || 0), 0);
    }

    function formatMoney(value) {
        const number = Number(value) || 0;
        return number.toLocaleString('ru-RU').replace(/\u00a0/g, ' ');
    }

    function storagePosUnitPrice(name) {
        const n = String(name || '').toLowerCase().replace(/ё/g, 'е');
        if (n.includes('расчес')) return 5600;
        if (n.includes('таблич') || n.includes('орг.стек') || n.includes('орг стек')) return 800;
        if ((n.includes('стенк') || n.includes('задн')) && (n.includes('600') || n.includes('800'))) return 8000;
        if (n.includes('наклей') && (n.includes('600') || n.includes('800'))) return 2000;
        return 0;
    }

    function buildStorageItems(dealer) {
        const rows = [];
        let total = 0;

        const products = Array.isArray(dealer.products) ? dealer.products.filter(Boolean) : [];
        products.forEach((product, index) => {
            const price = Number(product.sample_price) || 4500;
            total += price;
            rows.push(`<tr class="storage-product-row"><td class="num">${index + 1}</td><td class="sku">${escapeHtml(product.sku || '—')}</td><td>${escapeHtml(product.name || 'Без названия')}</td><td class="qty">1 планшет</td><td class="price">${formatMoney(price)}</td></tr>`);
        });

        const posItems = Array.isArray(dealer.pos_materials)
            ? dealer.pos_materials.filter(item => item && (item.name || Number(item.quantity) > 0))
            : [];

        if (posItems.length) {
            rows.push('<tr class="storage-section-row"><td colspan="5">ТОРГОВОЕ ОБОРУДОВАНИЕ И POSM</td></tr>');
            posItems.forEach((item, index) => {
                const quantity = Number(item.quantity) || 0;
                const unitPrice = storagePosUnitPrice(item.name);
                const lineTotal = unitPrice * quantity;
                total += lineTotal;
                rows.push(`<tr class="storage-pos-row"><td class="num">${index + 1}</td><td class="sku">—</td><td>${escapeHtml(item.name || 'Оборудование')}</td><td class="qty">${quantity} шт.</td><td class="price">${unitPrice ? formatMoney(lineTotal) : '—'}</td></tr>`);
            });
        }

        if (!rows.length) {
            rows.push('<tr><td class="num">1</td><td class="sku">—</td><td>Выставленный ассортимент и оборудование не указаны</td><td class="qty">—</td><td class="price">—</td></tr>');
        }

        return { rows: rows.join(''), total, products: products.length, pos: posItems.length };
    }

    function buildCompetitorChips(dealer) {
        const current = [...new Set((dealer.competitors || []).map(x => String(x?.brand || '').trim()).filter(Boolean))];
        const defaults = ['Tarkett','Kastamonu','Kronopol','Egger','Classen','Alpine Floor','EBM','ASTfloor'];
        const brands = [...defaults, ...current.filter(x => !defaults.some(d => d.toLowerCase() === x.toLowerCase()))];
        if (!brands.length) return '<span class="passport-muted">Нет данных</span>';
        return brands.map(brand => {
            const active = current.some(x => x.toLowerCase() === brand.toLowerCase());
            return `<span class="passport-chip ${active ? 'active' : ''}">${escapeHtml(brand)}</span>`;
        }).join('');
    }

    function buildPassportPhotos(dealer) {
        const photos = Array.isArray(dealer.photos) ? dealer.photos.slice(0, 3) : [];
        return [0,1,2].map(i => {
            const photo = photos[i]?.photo_url;
            return photo
                ? `<div class="passport-photo"><img src="${escapeHtml(photo)}" alt="Фото ${i + 1}"></div>`
                : `<div class="passport-photo empty">Фото ${i + 1}</div>`;
        }).join('');
    }

    function exhibitedCount(dealer) {
        return Array.isArray(dealer.products) ? dealer.products.length : 0;
    }

    async function ensureQrLibrary() {
        if (window.QRious) return window.QRious;
        if (state.qrPromise) return state.qrPromise;
        state.qrPromise = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrious/4.0.2/qrious.min.js';
            s.async = true;
            s.onload = () => window.QRious ? resolve(window.QRious) : reject(new Error('QR-библиотека не загрузилась'));
            s.onerror = () => reject(new Error('QR-библиотека не загрузилась'));
            document.head.appendChild(s);
        }).catch(() => null);
        return state.qrPromise;
    }

    async function qrDataUrl(value) {
        const v = String(value || '').trim();
        if (!v) return '';
        const Q = await ensureQrLibrary();
        if (!Q) return '';
        const canvas = document.createElement('canvas');
        new Q({ element: canvas, value: v, size: 180, level: 'M' });
        return canvas.toDataURL('image/png');
    }

    async function loadTemplate(type) {
        if (state.templates[type]) return state.templates[type];
        const path = templatePaths[type];
        if (!path) throw new Error('Неизвестный тип документа');
        const res = await fetch(path, { cache: 'no-store' });
        if (!res.ok) throw new Error('Не удалось загрузить шаблон документа');
        const html = await res.text();
        state.templates[type] = html;
        return html;
    }

    async function buildMap(type) {
        const dealer = getDealer();
        const req = getRequisites(dealer);
        const contact = getContact(dealer);
        const date = dateInfo(dealer);
        const number = contractNumber(dealer);
        const location = yandexLocation(dealer);
        const storageItems = buildStorageItems(dealer);

        let instagramUrl = String(dealer.instagram || '').trim();
        if (instagramUrl && !/^https?:\/\//i.test(instagramUrl)) {
            instagramUrl = 'https://instagram.com/' + instagramUrl.replace(/^@/, '');
        }

        const map = {
            DOC_NUMBER: escapeHtml(number),
            DOC_YEAR: escapeHtml(date.year),
            DOC_DAY: escapeHtml(date.day),
            DOC_DD: escapeHtml(date.dd),
            DOC_MM: escapeHtml(date.mm),
            DOC_MONTH: escapeHtml(date.monthName),
            DOC_DATE_LONG: escapeHtml(date.long),
            DOC_DATE_SHORT: escapeHtml(date.short),
            DOC_DATE_SLASH: escapeHtml(date.slash),
            CITY: valueOrLine(dealer.city, 'Астана'),
            DEALER_NAME: valueOrLine(dealer.name),
            DEALER_ORG: valueOrLine(req.organizationName),
            DEALER_DIRECTOR: valueOrLine(req.director),
            LEGAL_ADDRESS: valueOrLine(req.legalAddress),
            BIN: valueOrLine(req.bin),
            IIK: valueOrLine(req.iik),
            BANK: valueOrLine(req.bank),
            BIK: valueOrLine(req.bik),
            KBE: valueOrLine(req.kbe),
            EMAIL: valueOrLine(req.email),
            ACTUAL_ADDRESS: valueOrLine(dealer.address),
            CONTACT_NAME: valueOrLine(contact.name),
            CONTACT_POSITION: valueOrLine(contact.position),
            CONTACT_PHONE: valueOrLine(contact.phone),
            WEBSITE: valueOrLine(dealer.website),
            INSTAGRAM: valueOrLine(dealer.instagram),
            LOCATION_URL: valueOrLine(location),
            AUDITOR: valueOrLine(state.user?.fullName || state.user?.username || ''),
            NOTES: escapeHtml(dealer.bonuses || '').replace(/\n/g, '<br>') || '—',
            STORAGE_ITEMS_ROWS: storageItems.rows,
            STORAGE_TOTAL: formatMoney(storageItems.total),
            STORAGE_PRODUCT_COUNT: escapeHtml(storageItems.products),
            STORAGE_POS_COUNT: escapeHtml(storageItems.pos),
            PASSPORT_COMPETITORS: buildCompetitorChips(dealer),
            PASSPORT_MATRIX: buildPassportMatrix(dealer),
            PASSPORT_PHOTOS: buildPassportPhotos(dealer),
            PASSPORT_EXHIBITED_COUNT: escapeHtml(exhibitedCount(dealer)),
            PASSPORT_POS_TOTAL: escapeHtml(passportPosTotal(dealer))
        };

        if (type === 'passport') {
            map.QR_INSTAGRAM = await qrDataUrl(instagramUrl);
            map.QR_LOCATION = await qrDataUrl(location);
            map.QR_INSTAGRAM_BLOCK = map.QR_INSTAGRAM
                ? `<img class="passport-qr" src="${map.QR_INSTAGRAM}" alt="Instagram QR">`
                : '<div class="passport-qr-empty">QR</div>';
            map.QR_LOCATION_BLOCK = map.QR_LOCATION
                ? `<img class="passport-qr" src="${map.QR_LOCATION}" alt="Location QR">`
                : '<div class="passport-qr-empty">QR</div>';
        }

        return map;
    }

    function replaceTokens(template, map) {
        return template.replace(/\{\{([A-Z0-9_]+)\}\}/g, (match, key) =>
            Object.prototype.hasOwnProperty.call(map, key) ? String(map[key]) : ''
        );
    }

    async function build(type) {
        const [template, map] = await Promise.all([loadTemplate(type), buildMap(type)]);
        return replaceTokens(template, map);
    }

    function documentTitle(type) {
        if (type === 'supply') return 'Договор поставки';
        if (type === 'storage') return 'Договор ответственного хранения';
        return 'Паспорт салона';
    }

    function fileName(type) {
        const dealer = getDealer();
        const title = type === 'supply'
            ? 'Договор поставки'
            : type === 'storage'
                ? 'Договор ответственного хранения'
                : 'Паспорт салона';
        return `${safeFileName(title)} - ${safeFileName(dealer.name)}.doc`;
    }

    function withPreviewControls(html) {
        const controls = `
            <style>
                #crm-doc-controls{position:fixed;right:18px;top:18px;z-index:999999;display:flex;gap:8px;padding:8px;border-radius:12px;background:rgba(25,25,27,.92);box-shadow:0 10px 30px rgba(0,0,0,.22)}
                #crm-doc-controls button{border:0;border-radius:8px;padding:9px 12px;font:700 12px Arial;cursor:pointer}
                #crm-doc-controls .primary{background:#b9040a;color:#fff}
                #crm-doc-controls .secondary{background:#fff;color:#222}
                @media print{#crm-doc-controls{display:none!important}}
            </style>
            <div id="crm-doc-controls">
                <button class="primary" onclick="window.print()">Печать / PDF</button>
                <button class="secondary" onclick="window.close()">Закрыть</button>
            </div>`;
        return html.replace(/<body([^>]*)>/i, `<body$1>${controls}`);
    }

    async function preview(type) {
        try {
            const popup = window.open('', '_blank');
            if (!popup) {
                alert('Браузер заблокировал окно предпросмотра');
                return;
            }
            popup.document.write('<div style="font-family:Arial;padding:30px">Формируем документ...</div>');
            const html = await build(type);
            popup.document.open();
            popup.document.write(withPreviewControls(html));
            popup.document.close();
            popup.document.title = documentTitle(type);
        } catch (error) {
            console.error(error);
            alert(error.message || 'Не удалось сформировать документ');
        }
    }

    async function download(type) {
        try {
            const html = await build(type);
            const blob = new Blob(['\ufeff' + html], { type: 'application/msword;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName(type);
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1500);
        } catch (error) {
            console.error(error);
            alert(error.message || 'Не удалось скачать документ');
        }
    }

    function contractMissing(dealer) {
        const r = getRequisites(dealer);
        const checks = [
            ['юридическое лицо', r.organizationName],
            ['ФИО директора', r.director],
            ['юридический адрес', r.legalAddress],
            ['БИН/ИИН', r.bin],
            ['ИИК', r.iik],
            ['банк', r.bank],
            ['БИК', r.bik],
            ['КБе', r.kbe]
        ];
        return checks.filter(([, value]) => !String(value || '').trim()).map(([label]) => label);
    }

    function passportMissing(dealer) {
        const r = getRequisites(dealer);
        const c = getContact(dealer);
        const checks = [
            ['юридическое лицо', r.organizationName],
            ['фактический адрес', dealer.address],
            ['контактное лицо', c.name],
            ['телефон', c.phone]
        ];
        return checks.filter(([, value]) => !String(value || '').trim()).map(([label]) => label);
    }

    function setStatus(id, missing, extraText = '') {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.remove('is-ready','is-warning');
        if (!missing.length) {
            el.classList.add('is-ready');
            el.innerHTML = `<i class="bi bi-check2-circle me-1"></i>Готов к формированию${extraText ? ' · ' + escapeHtml(extraText) : ''}`;
        } else {
            el.classList.add('is-warning');
            el.innerHTML = `<i class="bi bi-exclamation-circle me-1"></i>Не заполнено: ${missing.length}`;
        }
    }

    function render() {
        if (!state.dealer) return;
        const contract = contractMissing(state.dealer);
        const passport = passportMissing(state.dealer);
        const posCount = (state.dealer.pos_materials || []).filter(x => Number(x?.quantity) > 0).length;

        setStatus('doc-status-supply', contract);
        setStatus('doc-status-storage', contract, posCount ? `POS: ${posCount}` : 'POS не указан');
        setStatus('doc-status-passport', passport);

        const allMissing = [...new Set([...contract, ...passport])];
        const alertEl = document.getElementById('dealer-docs-missing');
        if (alertEl) {
            if (allMissing.length) {
                alertEl.classList.remove('d-none');
                alertEl.innerHTML = `<i class="bi bi-info-circle me-1"></i><strong>Для полностью заполненных документов:</strong> ${allMissing.map(escapeHtml).join(', ')}. Пустые поля в скачанном документе будут оставлены линиями для ручного заполнения.`;
            } else {
                alertEl.classList.add('d-none');
                alertEl.innerHTML = '';
            }
        }

        const editBtn = document.getElementById('dealer-docs-edit-requisites');
        if (editBtn && window.CRMAuth && !CRMAuth.can('can_edit_dealer')) {
            editBtn.style.display = 'none';
        }
    }

    function setDealer(dealer, user) {
        state.dealer = dealer || null;
        state.user = user || null;
        state.selectedEntityIndex = 0;
        populateEntitySelector();
        render();
    }

    function setCatalog(products) {
        state.catalog = Array.isArray(products) ? products : [];
        if (state.dealer) render();
    }

    window.DealerDocuments = {
        setDealer,
        setCatalog,
        render,
        preview,
        download,
        build
    };
})();
