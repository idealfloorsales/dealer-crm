
(() => {
    'use strict';

    const state = {
        dealer: null,
        user: null,
        templates: {},
        qrPromise: null,
        catalog: [],
        catalogLoaded: false,
        catalogPromise: null,
        passportPhotosLoaded: false,
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
        if (!Array.isArray(dealer?.legal_entities)) return [];
        return dealer.legal_entities.filter(entity =>
            entity && (entity.organizationName || entity.bin || entity.iik || entity.director)
        );
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
            const label = new RegExp('^' + type.replace(/[.*+?^${}()|[\]\\]/g, '\\            const option = new Option(`${type} · ${name}`, String(index));'), 'i').test(name)
                ? name
                : `${type} · ${name}`;
            const option = new Option(label, String(index));
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

    function formatOrganizationForDocument(req) {
        const name = String(req?.organizationName || '').trim();
        const type = String(req?.type || '').trim();
        if (!name) return '';
        if (type === 'ТОО' && !/^ТОО\b/i.test(name)) return `ТОО «${name.replace(/[«»"]/g, '').trim()}»`;
        if (type === 'ИП' && !/^ИП\b/i.test(name)) return `ИП «${name.replace(/[«»"]/g, '').trim()}»`;
        return name;
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
        return String(dealer.dealer_id || '').trim().toUpperCase();
    }

    function twoGisLocation(dealer) {
        const cityKey = String(dealer.city || '').toLowerCase().replace(/ё/g, 'е').trim();
        const cityMap = {
            'астана': 'astana', 'нур-султан': 'astana',
            'алматы': 'almaty', 'шымкент': 'shymkent',
            'караганда': 'karaganda', 'қарағанды': 'karaganda',
            'костанай': 'kostanay', 'қостанай': 'kostanay',
            'павлодар': 'pavlodar',
            'усть-каменогорск': 'ust-kamenogorsk', 'оскемен': 'ust-kamenogorsk', 'өскемен': 'ust-kamenogorsk',
            'семей': 'semey',
            'актобе': 'aktobe', 'ақтөбе': 'aktobe',
            'атырау': 'atyrau',
            'актау': 'aktau', 'ақтау': 'aktau',
            'тараз': 'taraz',
            'кызылорда': 'kyzylorda', 'қызылорда': 'kyzylorda',
            'уральск': 'uralsk', 'орал': 'uralsk',
            'петропавловск': 'petropavlovsk', 'петропавл': 'petropavlovsk',
            'кокшетау': 'kokshetau', 'көкшетау': 'kokshetau',
            'туркестан': 'turkestan', 'түркістан': 'turkestan',
            'талдыкорган': 'taldykorgan', 'талдықорған': 'taldykorgan',
            'экибастуз': 'ekibastuz'
        };
        const slug = cityMap[cityKey] || '';
        const query = [dealer.name, dealer.address].filter(Boolean).join(' ') || dealer.city || 'IDEAL FLOOR';
        const base = slug ? `https://2gis.kz/${slug}` : 'https://2gis.kz';
        const lat = Number(dealer.latitude);
        const lng = Number(dealer.longitude);
        const mapParam = Number.isFinite(lat) && Number.isFinite(lng) ? `?m=${lng},${lat}/17` : '';
        return `${base}/search/${encodeURIComponent(query)}${mapParam}`;
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

        return products.some(product => {
            const sku = normalizeCode(product?.sku || '');
            const name = normalizeCode(product?.name || '');
            const productId = String(product?._id || product?.id || product?.productId || product?.product_id || '');
            const catalogProduct = (Array.isArray(state.catalog) ? state.catalog : []).find(item =>
                productId && productId === String(item?._id || item?.id || '')
            );
            if (sku && (sku === target || sku.includes(target) || name.includes(target))) return true;
            if (name && normalizeCode(code) === name) return true;
            if (prefix && digits && sku.includes(prefix) && sku.endsWith(digits)) return true;
            return Boolean(catalogProduct && normalizeCode(catalogProduct.sku || '') === target);
        });
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

    function isPassportEquipmentProduct(product) {
        return String(product?.product_type || 'laminate').trim().toLowerCase() === 'equipment';
    }

    function selectedPassportProducts(dealer) {
        const catalog = Array.isArray(state.catalog) ? state.catalog.filter(product =>
            product && (product.sku || product.name) && !isPassportEquipmentProduct(product)
        ) : [];
        const selected = catalog.filter(product => productIsPresent(dealer, product.sku || product.name));
        const selectedKeys = new Set(selected.map(product =>
            String(product._id || product.id || normalizeCode(product.sku || product.name))
        ));
        const direct = (Array.isArray(dealer.products) ? dealer.products : [])
            .filter(product => product && typeof product === 'object' && (product.sku || product.name))
            .filter(product => !isPassportEquipmentProduct(product))
            .filter(product => !selectedKeys.has(String(product._id || product.id || normalizeCode(product.sku || product.name))));
        const all = [...selected, ...direct];
        const seen = new Set();
        return all.filter(product => {
            const key = normalizeCode(product.sku || product.name || product._id || product.id);
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
        }).sort((a, b) =>
            String(a.collection || inferProductGroup(a)).localeCompare(String(b.collection || inferProductGroup(b)), 'ru') ||
            String(a.sku || '').localeCompare(String(b.sku || ''), 'ru')
        );
    }

    function buildPassportMatrix(dealer) {
        const products = selectedPassportProducts(dealer);
        if (!products.length) return '';

        const groups = new Map();
        products.forEach(product => {
            const collection = String(product.collection || product.collectionName || inferProductGroup(product) || 'ДРУГИЕ КОЛЛЕКЦИИ').trim();
            if (!groups.has(collection)) groups.set(collection, []);
            groups.get(collection).push(product);
        });

        const columnCount = 3;
        const rows = [...groups.entries()].map(([collection, items]) => {
            const rowCount = Math.ceil(items.length / columnCount);
            const productRows = Array.from({ length: rowCount }, (_, rowIndex) => {
                const cells = Array.from({ length: columnCount }, (_, columnIndex) => {
                    const product = items[columnIndex * rowCount + rowIndex];
                    if (!product) return '<td class="passport-product-cell is-empty"></td>';
                    return '<td class="passport-product-cell"><span class="passport-product-inline"><b class="passport-product-sku">' +
                        escapeHtml(product.sku || '—') + '</b><span class="passport-product-name">' +
                        escapeHtml(product.name || 'Без названия') + '</span></span></td>';
                }).join('');
                return '<tr>' + cells + '</tr>';
            }).join('');

            return '<tr class="passport-collection-row"><th scope="row">' + escapeHtml(collection) +
                '</th><td class="passport-collection-items"><table class="passport-product-columns"><tbody>' +
                productRows + '</tbody></table></td></tr>';
        }).join('');

        return '<table class="passport-selected-table"><colgroup><col style="width:34mm"><col></colgroup><tbody>' + rows + '</tbody></table>';
    }

    function buildPassportEquipment(dealer) {
        const items = Array.isArray(dealer.pos_materials)
            ? dealer.pos_materials.filter(item => item && String(item.name || '').trim() && Number(item.quantity) > 0)
            : [];
        if (!items.length) return '';

        const columnCount = 3;
        const rowCount = Math.ceil(items.length / columnCount);
        const rows = Array.from({ length: rowCount }, (_, rowIndex) => {
            const cells = Array.from({ length: columnCount }, (_, columnIndex) => {
                const item = items[columnIndex * rowCount + rowIndex];
                if (!item) return '<td class="passport-equipment-cell is-empty"></td>';
                return '<td class="passport-equipment-cell"><div class="passport-equipment-card">' +
                    '<span class="passport-equipment-name">' + escapeHtml(item.name) + '</span>' +
                    '<span class="passport-equipment-quantity">' + escapeHtml(Number(item.quantity)) + ' шт.</span>' +
                    '</div></td>';
            }).join('');
            return '<tr>' + cells + '</tr>';
        }).join('');

        return '<table class="passport-equipment-grid"><tbody>' + rows + '</tbody></table>';
    }

    function passportPosTotal(dealer) {
        return (dealer.pos_materials || []).reduce((sum, item) => {
            const quantity = Number(item?.quantity) || 0;
            return quantity > 0 ? sum + quantity : sum;
        }, 0);
    }

    function passportMatrixCount(dealer) {
        const selected = selectedPassportProducts(dealer).length;
        const catalogKeys = new Set((Array.isArray(state.catalog) ? state.catalog : [])
            .filter(product => product && (product.sku || product.name) && !isPassportEquipmentProduct(product))
            .map(product => normalizeCode(product.sku || product.name))
            .filter(Boolean));
        const total = catalogKeys.size;
        return total > 0
            ? selected + ' из ' + Math.max(total, selected) + ' декоров выставлено'
            : selected + ' декоров выставлено';
    }

    function selectedPassportEquipmentTypes(dealer) {
        const seen = new Set();
        return (Array.isArray(dealer.pos_materials) ? dealer.pos_materials : [])
            .filter(item => item && String(item.name || '').trim() && Number(item.quantity) > 0)
            .filter(item => {
                const key = normalizeCode(item.name);
                if (!key || seen.has(key)) return false;
                seen.add(key);
                return true;
            });
    }

    function passportEquipmentMatrixCount(dealer) {
        const selected = selectedPassportEquipmentTypes(dealer).length;
        const totalNames = new Set((Array.isArray(state.catalog) ? state.catalog : [])
            .filter(product => product && isPassportEquipmentProduct(product) && String(product.name || '').trim())
            .map(product => normalizeCode(product.name))
            .filter(Boolean));
        const total = totalNames.size;
        return total > 0
            ? selected + ' из ' + Math.max(total, selected) + ' видов оборудования выставлено'
            : selected + ' видов оборудования выставлено';
    }

    function exhibitedCount(dealer) {
        return selectedPassportProducts(dealer).length;
    }

    function buildPassportContacts(dealer) {
        const contacts = (Array.isArray(dealer.contacts) ? dealer.contacts : [])
            .filter(contact => contact && (contact.name || contact.position || contact.contactInfo));
        if (!contacts.length) return '';
        return contacts.map(contact =>
            '<tr><td>' + escapeHtml(contact.name || '') + '</td>' +
            '<td>' + escapeHtml(contact.position || '') + '</td>' +
            '<td>' + escapeHtml(contact.contactInfo || '') + '</td></tr>'
        ).join('');
    }

    function formatPassportCompetitorPrice(value) {
        const raw = String(value ?? '').trim();
        if (!raw) return '';
        const normalized = raw.replace(/\s/g, '').replace(/[^0-9,.-]/g, '').replace(',', '.');
        const number = Number(normalized);
        if (Number.isFinite(number)) {
            if (number <= 0) return '';
            return number.toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' ₸';
        }
        return escapeHtml(raw);
    }

    function buildPassportCompetitors(dealer) {
        const entries = (Array.isArray(dealer.competitors) ? dealer.competitors : [])
            .filter(item => item && String(item.brand || '').trim());
        if (!entries.length) return '';
        return entries.map(item =>
            '<tr><td><strong>' + escapeHtml(item.brand) + '</strong></td>' +
            '<td>' + escapeHtml(item.collection || '') + '</td>' +
            '<td class="passport-number-cell">' + formatPassportCompetitorPrice(item.price_opt) + '</td>' +
            '<td class="passport-number-cell">' + formatPassportCompetitorPrice(item.price_retail) + '</td></tr>'
        ).join('');
    }

    function buildPassportPhotos(dealer) {
        const photos = Array.isArray(dealer.photos) ? dealer.photos.filter(photo => photo?.photo_url || photo?.url || photo?.src).slice(0, 3) : [];
        if (!photos.length) return '';
        return '<div class="passport-photo-grid">' + photos.map((photo, index) => {
            const url = photo.photo_url || photo.url || photo.src;
            return '<div class="passport-photo-card"><img src="' + escapeHtml(url) + '" alt="Фото объекта ' + (index + 1) + '">' +
                '<small>' + escapeHtml(photo.caption || photo.name || ('Фото ' + (index + 1))) + '</small></div>';
        }).join('') + '</div>';
    }

    async function loadPassportPricingSummary(dealer) {
        const id = String(dealer?._id || dealer?.id || '').trim();
        if (!id) return {};
        try {
            const response = await fetch('/api/pricing/dealers/' + encodeURIComponent(id), { cache: 'no-store' });
            if (response.ok) return await response.json();
        } catch (error) {
            console.info('Для паспорта объекта использованы условия, доступные в карточке дилера.', error);
        }
        return {};
    }

    function formatPassportDate(value) {
        const raw = String(value || '').trim().slice(0, 10);
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
        return match ? match[3] + '.' + match[2] + '.' + match[1] : raw;
    }

    async function ensurePassportPhotosLoaded() {
        const dealer = getDealer();
        if (state.passportPhotosLoaded) return;
        if (Array.isArray(dealer.photos) && dealer.photos.length) { state.passportPhotosLoaded = true; return; }
        const id = String(dealer?._id || dealer?.id || '').trim();
        if (!id) return;
        try {
            const response = await fetch('/api/dealers/' + encodeURIComponent(id) + '/photos?preview=1', { cache: 'no-store' });
            if (response.ok) {
                dealer.photos = await response.json();
                state.passportPhotosLoaded = true;
            }
        } catch (error) {
            console.warn('Не удалось загрузить фото для паспорта объекта', error);
        }
    }

    function formatMoney(value) {
        const number = Number(value) || 0;
        return number.toLocaleString('ru-RU').replace(/\u00a0/g, ' ');
    }

    function storageUnitPrice(product) {
        const value = Number(product?.storage_unit_price);
        return Number.isFinite(value) && value >= 0 ? value : 0;
    }

    function normalizeStorageCatalogValue(value) {
        const latinLookalikes = { a:'а', b:'в', c:'с', e:'е', h:'н', k:'к', m:'м', o:'о', p:'р', t:'т', x:'х', y:'у' };
        return String(value || '')
            .toLowerCase()
            .replace(/ё/g, 'е')
            .normalize('NFKC')
            .replace(/[abcehkmoptyx]/g, letter => latinLookalikes[letter] || letter)
            .replace(/[^a-zа-я0-9]+/gi, '');
    }

    function findStorageCatalogProduct(item, productType) {
        const catalog = (Array.isArray(state.catalog) ? state.catalog : [])
            .filter(product => String(product?.product_type || 'laminate') === productType);
        const itemId = String(item?.productId || item?.product_id || item?.product?.id || item?.product?._id || (typeof item?.product === 'string' ? item.product : ''));
        if (itemId) {
            const byId = catalog.find(product => String(product.id || product._id || '') === itemId);
            if (byId) return byId;
        }

        const itemSku = normalizeStorageCatalogValue(item?.sku);
        if (itemSku) {
            const bySku = catalog.find(product => normalizeStorageCatalogValue(product.sku) === itemSku);
            if (bySku) return bySku;
        }

        const itemName = normalizeStorageCatalogValue(item?.name);
        if (!itemName) return null;
        const productKeys = product => [product.name, product.excel_alias, product.sku]
            .map(normalizeStorageCatalogValue)
            .filter(Boolean);
        const exact = catalog.find(product => productKeys(product).some(value => value === itemName));
        if (exact) return exact;

        // Matrix equipment names can differ by a POS prefix or by Latin/Cyrillic lookalike letters.
        // Accept a partial name only when it identifies exactly one catalog item.
        const partialMatches = catalog.filter(product => productKeys(product)
            .some(value => value.length >= 6 && (value.includes(itemName) || itemName.includes(value))));
        const uniqueIds = new Set(partialMatches.map(product => String(product.id || product._id || product.sku || product.name)));
        return uniqueIds.size === 1 ? partialMatches[0] : null;
    }

    function storageLaminateUnitPrice(item) {
        return storageUnitPrice(findStorageCatalogProduct(item, 'laminate') || item);
    }

    function storageEquipmentUnitPrice(item) {
        return storageUnitPrice(findStorageCatalogProduct(item, 'equipment') || item);
    }

    function buildStorageItems(dealer) {
        const rows = [];
        let total = 0;

        const products = Array.isArray(dealer.products) ? dealer.products.filter(Boolean) : [];
        products.forEach((product, index) => {
            const price = storageLaminateUnitPrice(product);
            total += price;
            rows.push(`<tr class="storage-product-row"><td class="num">${index + 1}</td><td class="sku">${escapeHtml(product.sku || '—')}</td><td>${escapeHtml(product.name || 'Без названия')}</td><td class="qty">1 планшет</td><td class="price">${formatMoney(price)}</td></tr>`);
        });

        const posItems = Array.isArray(dealer.pos_materials)
            ? dealer.pos_materials.filter(item => item && (item.name || Number(item.quantity) > 0))
            : [];

        if (posItems.length) {
            rows.push('<tr class="storage-section-row"><td colspan="5">ТОРГОВОЕ ОБОРУДОВАНИЕ</td></tr>');
            posItems.forEach((item, index) => {
                const quantity = Number(item.quantity) || 0;
                const unitPrice = storageEquipmentUnitPrice(item);
                const lineTotal = unitPrice * quantity;
                total += lineTotal;
                rows.push(`<tr class="storage-pos-row"><td class="num">${index + 1}</td><td class="sku">—</td><td>${escapeHtml(item.name || 'Оборудование')}</td><td class="qty">${quantity} шт.</td><td class="price">${formatMoney(lineTotal)}</td></tr>`);
            });
        }

        if (!rows.length) {
            rows.push('<tr><td class="num">1</td><td class="sku">—</td><td>Выставленный ассортимент и оборудование не указаны</td><td class="qty">—</td><td class="price">—</td></tr>');
        }

        return { rows: rows.join(''), total, products: products.length, pos: posItems.length };
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
        if (type !== 'passport' && state.templates[type]) return state.templates[type];
        const path = templatePaths[type];
        if (!path) throw new Error('Неизвестный тип документа');

        let html = '';
        if (type === 'supply' || type === 'storage') {
            try {
                const custom = await fetch('/api/document-templates/' + encodeURIComponent(type), { cache: 'no-store' });
                if (custom.ok) {
                    const data = await custom.json();
                    html = String(data.html || '');
                }
            } catch (_) {}
        }
        if (!html) {
            const res = await fetch(path, { cache: 'no-store' });
            if (!res.ok) throw new Error('Не удалось загрузить шаблон документа');
            html = await res.text();
        }
        state.templates[type] = html;
        return html;
    }

    async function buildMap(type) {
        const dealer = getDealer();
        const req = getRequisites(dealer);
        const contact = getContact(dealer);
        const date = dateInfo(dealer);
        const number = contractNumber(dealer);
        const location = twoGisLocation(dealer);
        const storageItems = buildStorageItems(dealer);
        const passportPricing = type === 'passport' ? await loadPassportPricingSummary(dealer) : {};
        const passportDiscount = Number(passportPricing.totalDiscountPercent) || 0;
        const passportActiveDiscounts = Array.isArray(passportPricing.activeDiscounts) ? passportPricing.activeDiscounts : [];
        const passportDelivery = passportPricing.effectiveDelivery || dealer.effectiveDelivery || dealer.delivery || '';
        const passportOverride = passportPricing.priceOverride?.active ? passportPricing.priceOverride : null;
        const passportPriceEnd = passportOverride?.endDate || passportPricing.priceListCondition?.endDate || dealer.price_list?.validTo || '';
        const passportProfilePrice = passportPricing.profilePriceList || dealer.price_list?.name || dealer.price_type || '';
        const passportEffectivePrice = passportPricing.effectivePriceList || passportProfilePrice;

        let instagramUrl = String(dealer.instagram || '').trim();
        if (instagramUrl && !/^https?:\/\//i.test(instagramUrl)) {
            instagramUrl = 'https://instagram.com/' + instagramUrl.replace(/^@/, '');
        }

        const map = {
            DOC_NUMBER: escapeHtml(number),
            DEALER_ID: valueOrLine(dealer.dealer_id || number),
            DEALER_TYPE: valueOrLine(req.type),
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
            DEALER_ORG: valueOrLine(formatOrganizationForDocument(req)),
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
            PASSPORT_COMPETITORS: buildPassportCompetitors(dealer),
            PASSPORT_CONTACTS: buildPassportContacts(dealer),
            PASSPORT_EQUIPMENT: buildPassportEquipment(dealer),
            PASSPORT_PHOTOS: buildPassportPhotos(dealer),
            PASSPORT_PRICE_LIST: valueOrLine(passportEffectivePrice, 'Не назначен'),
            PASSPORT_PROFILE_PRICE: valueOrLine(passportProfilePrice, 'Не назначен'),
            PASSPORT_DISCOUNT: passportDiscount > 0 ? '−' + escapeHtml(passportDiscount) + '%' + (passportActiveDiscounts.length ? ' · ' + escapeHtml(passportActiveDiscounts.map(item => item.name || ('скидка ' + (Number(item.discountPercent) || 0) + '%')).join(', ')) : '') : 'Нет активной скидки',
            PASSPORT_PRICE_SOURCE: passportOverride ? 'Действует специальное условие' : 'По условиям профиля дилера',
            PASSPORT_PRICE_PERIOD: passportPriceEnd ? 'до ' + escapeHtml(formatPassportDate(passportPriceEnd)) : (passportOverride ? 'Срок не ограничен' : '—'),
            PASSPORT_DELIVERY_TERMS: valueOrLine(passportDelivery, 'Не указаны'),
            PASSPORT_MATRIX: buildPassportMatrix(dealer),
            PASSPORT_MATRIX_COUNT: escapeHtml(passportMatrixCount(dealer)),
            PASSPORT_EQUIPMENT_COUNT: escapeHtml(passportEquipmentMatrixCount(dealer)),
            PASSPORT_EXHIBITED_COUNT: escapeHtml(exhibitedCount(dealer)),
            PASSPORT_POS_TOTAL: escapeHtml(passportPosTotal(dealer))
        };

        if (type === 'passport') {
            const passportText = value => String(value ?? '').trim();
            const selectedProducts = selectedPassportProducts(dealer).length;
            const selectedEquipmentTypes = selectedPassportEquipmentTypes(dealer).length;
            const equipmentCount = passportPosTotal(dealer);
            const organization = formatOrganizationForDocument(req);
            const bankDetails = [
                req.bank,
                req.bik ? 'БИК ' + req.bik : '',
                req.kbe ? 'КБЕ ' + req.kbe : '',
                req.iik ? 'ИИК ' + req.iik : ''
            ].map(passportText).filter(Boolean);

            map.DEALER_TYPE = passportText(req.type) ? escapeHtml(req.type) : '';
            map.DEALER_NAME = passportText(dealer.name) ? escapeHtml(dealer.name) : '';
            map.DEALER_ORG = organization ? escapeHtml(organization) : '';
            map.CITY = passportText(dealer.city) ? escapeHtml(dealer.city) : '';
            map.ACTUAL_ADDRESS = passportText(dealer.address) ? escapeHtml(dealer.address) : '';
            map.PASSPORT_ADDRESS = [dealer.city, dealer.address].map(passportText).filter(Boolean).map(escapeHtml).join(' · ');
            map.DEALER_DIRECTOR = passportText(req.director) ? escapeHtml(req.director) : '';
            map.LEGAL_ADDRESS = passportText(req.legalAddress) ? escapeHtml(req.legalAddress) : '';
            map.BIN = passportText(req.bin) ? escapeHtml(req.bin) : '';
            map.EMAIL = passportText(req.email) ? escapeHtml(req.email) : '';
            map.BANK_DETAILS = bankDetails.map(escapeHtml).join(' · ');
            map.WEBSITE = passportText(dealer.website) ? escapeHtml(dealer.website) : '';
            map.INSTAGRAM = passportText(dealer.instagram) ? escapeHtml(dealer.instagram) : '';
            map.LOCATION_URL = location ? escapeHtml(location) : '';
            map.AUDITOR = passportText(state.user?.fullName || state.user?.username || '')
                ? escapeHtml(state.user.fullName || state.user.username) : '';
            map.NOTES = passportText(dealer.bonuses)
                ? escapeHtml(dealer.bonuses).replace(/\n/g, '<br>') : '';
            map.PASSPORT_PRICE_LIST = passportText(passportEffectivePrice) ? escapeHtml(passportEffectivePrice) : '';
            map.PASSPORT_PROFILE_PRICE = passportText(passportProfilePrice) ? escapeHtml(passportProfilePrice) : '';
            map.PASSPORT_DISCOUNT = passportDiscount > 0
                ? '−' + escapeHtml(passportDiscount) + '%' + (passportActiveDiscounts.length ? ' · ' + escapeHtml(passportActiveDiscounts.map(item => item.name || ('скидка ' + (Number(item.discountPercent) || 0) + '%')).join(', ')) : '')
                : '';
            map.PASSPORT_PRICE_SOURCE = (passportEffectivePrice || passportOverride)
                ? (passportOverride ? 'Действует специальное условие' : 'По условиям профиля дилера') : '';
            map.PASSPORT_PRICE_PERIOD = passportPriceEnd
                ? 'до ' + escapeHtml(formatPassportDate(passportPriceEnd))
                : (passportOverride ? 'Срок не ограничен' : '');
            map.PASSPORT_DELIVERY_TERMS = passportText(passportDelivery) ? escapeHtml(passportDelivery) : '';
            map.PASSPORT_MATRIX_COUNT = selectedProducts ? escapeHtml(passportMatrixCount(dealer)) : '';
            map.PASSPORT_EQUIPMENT_COUNT = selectedEquipmentTypes ? escapeHtml(passportEquipmentMatrixCount(dealer)) : '';
            map.PASSPORT_EXHIBITED_COUNT = selectedProducts ? escapeHtml(selectedProducts) : '';
            map.PASSPORT_POS_TOTAL = equipmentCount ? escapeHtml(equipmentCount) : '';
            map.QR_INSTAGRAM = instagramUrl ? await qrDataUrl(instagramUrl) : '';
            map.QR_LOCATION = location ? await qrDataUrl(location) : '';
            map.QR_INSTAGRAM_BLOCK = map.QR_INSTAGRAM
                ? `<img class="passport-qr" src="${map.QR_INSTAGRAM}" alt="Instagram QR">` : '';
            map.QR_LOCATION_BLOCK = map.QR_LOCATION
                ? `<img class="passport-qr" src="${map.QR_LOCATION}" alt="Location QR">` : '';
        }

        return map;
    }

    function replaceTokens(template, map) {
        return template.replace(/\{\{([A-Z0-9_]+)\}\}/g, (match, key) =>
            Object.prototype.hasOwnProperty.call(map, key) ? String(map[key]) : ''
        );
    }

    function renderPassportTemplate(template, map) {
        const parsed = new DOMParser().parseFromString(replaceTokens(template, map), 'text/html');
        const isEmpty = value => {
            const text = String(value || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('ru');
            return !text || /^[_—–\-·.\s]+$/.test(text) ||
                /^(не назначен|не указаны?|не задан|не заполнено|нет данных|нет активной скидки)$/.test(text);
        };

        parsed.querySelectorAll('.passport-field').forEach(field => {
            const value = field.querySelector('.passport-value');
            if (!value || isEmpty(value.textContent)) field.remove();
        });
        parsed.querySelectorAll('.passport-meta-table td').forEach(cell => {
            const value = cell.querySelector('.passport-value');
            if (!value || isEmpty(value.textContent)) cell.remove();
        });
        parsed.querySelectorAll('.passport-address,.passport-org-badge').forEach(node => {
            if (isEmpty(node.textContent)) node.remove();
        });
        parsed.querySelectorAll('.passport-kicker').forEach(node => {
            if (isEmpty(node.parentElement?.querySelector('.passport-dealer-name')?.textContent)) node.remove();
        });
        parsed.querySelectorAll('.passport-notes').forEach(block => {
            if (isEmpty(block.textContent)) block.remove();
        });
        parsed.querySelectorAll('.passport-kpi-card').forEach(card => {
            const value = card.querySelector('strong');
            const text = value?.textContent.trim() || '';
            if (isEmpty(text) || /^0(?:[,.]0+)?(?:\s*шт\.?)?$/i.test(text)) {
                card.closest('td')?.remove();
            }
        });
        parsed.querySelectorAll('.passport-section-count').forEach(count => {
            if (isEmpty(count.textContent)) count.remove();
        });
        parsed.querySelectorAll('.passport-qr-table td').forEach(cell => {
            const link = cell.querySelector('.passport-link')?.textContent;
            if (!cell.querySelector('img') && isEmpty(link)) cell.remove();
        });

        parsed.querySelectorAll('.passport-grid tr').forEach(row => {
            const cells = [...row.querySelectorAll(':scope > td')];
            cells.forEach(cell => {
                if (!cell.querySelector('.passport-field')) cell.remove();
            });
            const remaining = [...row.querySelectorAll(':scope > td')];
            if (!remaining.length) row.remove();
            else if (remaining.length === 1) remaining[0].colSpan = 2;
        });
        parsed.querySelectorAll('.passport-meta-table tr,.passport-kpis tr').forEach(row => {
            [...row.querySelectorAll(':scope > td')].forEach(cell => {
                if (row.closest('.passport-kpis') && !cell.querySelector('.passport-kpi-card')) cell.remove();
                if (!cell.textContent.trim() && !cell.querySelector('*')) cell.remove();
            });
            const cells = [...row.querySelectorAll(':scope > td')];
            if (!cells.length) row.remove();
            else cells.forEach(cell => { cell.style.width = (100 / cells.length) + '%'; });
        });
        parsed.querySelectorAll('.passport-meta-table,.passport-kpis,.passport-grid').forEach(table => {
            if (!table.querySelector('tr')) table.remove();
        });

        parsed.querySelectorAll('.passport-contact-table,.passport-competitor-table').forEach(table => {
            if (!table.querySelector('tbody tr')) table.remove();
        });
        parsed.querySelectorAll('.passport-qr-table').forEach(table => {
            const cells = [...table.querySelectorAll('tr > td')];
            if (!cells.length) table.remove();
            else if (cells.length === 1) cells[0].style.width = '100%';
        });
        parsed.querySelectorAll('.passport-hero td').forEach(cell => {
            if (!cell.textContent.trim() && !cell.querySelector('img')) cell.remove();
        });
        parsed.querySelectorAll('.passport-section').forEach(section => {
            const content = section.cloneNode(true);
            content.querySelector('.passport-section-title')?.remove();
            const hasContent = Boolean(content.querySelector('img,.passport-field,.passport-notes,.passport-table,.passport-selected-table,.passport-equipment-grid,.passport-photo-grid,.passport-qr-table')) ||
                !isEmpty(content.textContent);
            if (!hasContent) section.remove();
        });
        parsed.querySelectorAll('.passport-section').forEach((section, index) => {
            const number = section.querySelector('.passport-section-number');
            if (number) number.textContent = String(index + 1).padStart(2, '0');
        });

        return '<!DOCTYPE html>\n' + parsed.documentElement.outerHTML;
    }

    async function ensureStorageCatalogLoaded() {
        if (state.catalogLoaded) return true;
        if (state.catalogPromise) return state.catalogPromise;
        state.catalogPromise = (async () => {
            try {
                const response = await fetch('/api/products');
                if (!response.ok) throw new Error('catalog');
                const products = await response.json();
                state.catalog = Array.isArray(products) ? products : [];
                state.catalogLoaded = true;
                return true;
            } catch (error) {
                console.warn('Не удалось загрузить каталог для договора хранения', error);
                return false;
            } finally {
                state.catalogPromise = null;
            }
        })();
        return state.catalogPromise;
    }

    async function build(type) {
        if (type === 'storage' || type === 'passport') await ensureStorageCatalogLoaded();
        if (type === 'passport') await ensurePassportPhotosLoaded();
        const [template, map] = await Promise.all([loadTemplate(type), buildMap(type)]);
        return type === 'passport'
            ? renderPassportTemplate(template, map)
            : replaceTokens(template, map);
    }

    function documentTitle(type) {
        if (type === 'supply') return 'Договор поставки';
        if (type === 'storage') return 'Договор ответственного хранения';
        return 'Паспорт объекта';
    }

    function fileName(type) {
        const dealer = getDealer();
        const title = type === 'supply'
            ? 'Договор поставки'
            : type === 'storage'
                ? 'Договор ответственного хранения'
                : 'Паспорт объекта';
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
        state.passportPhotosLoaded = false;
        state.dealer = dealer || null;
        state.user = user || null;
        state.selectedEntityIndex = 0;
        populateEntitySelector();
        render();
    }

    function setCatalog(products) {
        state.catalog = Array.isArray(products) ? products : [];
        state.catalogLoaded = true;
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
