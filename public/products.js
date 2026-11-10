document.addEventListener('DOMContentLoaded', () => {
    
    const API_URL = '/api/products';
    
    // Элементы
    const listContainer = document.getElementById('products-list-container'); 
    const searchInput = document.getElementById('product-search');
    const searchClear = document.getElementById('product-search-clear');
    const totalLabel = document.getElementById('total-count');
    const kpiHost = document.getElementById('product-kpis');
    const typeFilter = document.getElementById('type-filter');
    const filterSelect = document.getElementById('filter-select');
    const stockFilter = document.getElementById('stock-filter');
    const classFilter = document.getElementById('class-filter');
    const thicknessFilter = document.getElementById('thickness-filter');
    const completenessFilter = document.getElementById('completeness-filter');
    const sortSelect = document.getElementById('sort-select');
    const resetFiltersBtn = document.getElementById('product-reset-filters');
    const activeFilterSummary = document.getElementById('active-filter-summary');
    const filteredSummary = document.getElementById('filtered-summary');
    const stockLastUpdated = document.getElementById('stock-last-updated');
    
    // Модалки
    const modalEl = document.getElementById('product-modal');
    const modal = new bootstrap.Modal(modalEl, { backdrop: 'static', keyboard: false });
    const form = document.getElementById('product-form');
    const modalTitle = document.getElementById('product-modal-title');
    
    const addBtn = document.getElementById('add-product-btn');
    const resetBtn = document.getElementById('reset-catalog-btn'); 
    
    // Поля формы
    const inpId = document.getElementById('prod_id');
    const inpSku = document.getElementById('prod_sku');
    const inpName = document.getElementById('prod_name');
    const inpCollection = document.getElementById('prod_collection');
    const collectionOptions = document.getElementById('product-collection-options');
    const productTypeInputs = [...document.querySelectorAll('input[name="product_type"]')];
    const laminateFields = [...document.querySelectorAll('.product-laminate-field')];
    const btnDelete = document.getElementById('btn-delete-prod');
    const inpLiquid = document.getElementById('prod_is_liquid');
    const inpAlias = document.getElementById('prod_alias');
    const inpPhotoId = document.getElementById('prod_photo_id');
    const photoPreview = document.getElementById('prod-photo-preview');
    const photoGallery = document.getElementById('prod-photo-gallery');
    const photoGalleryToggle = document.getElementById('prod-photo-gallery-toggle');
    const photoFolderLink = document.getElementById('prod-photo-folder-link');
    const photoClear = document.getElementById('prod-photo-clear');
    const photoGalleryMeta = document.getElementById('prod-photo-gallery-meta');
    
    const charClass = document.getElementById('char_class');
    const charThick = document.getElementById('char_thick');
    const charBevel = document.getElementById('char_bevel');
    const charSize = document.getElementById('char_size');
    const pkgArea = document.getElementById('pkg_area');
    const pkgQty = document.getElementById('pkg_qty');
    const pkgWeight = document.getElementById('pkg_weight');

    // Excel
    const btnImport = document.getElementById('btn-import');
    const fileInput = document.getElementById('excel-input');
    const stockImportModalEl = document.getElementById('stock-import-modal');
    const stockImportModal = stockImportModalEl ? new bootstrap.Modal(stockImportModalEl, { backdrop:'static' }) : null;
    const stockImportChoose = document.getElementById('stock-import-choose');
    const stockImportFileName = document.getElementById('stock-import-file-name');
    const stockImportResult = document.getElementById('stock-import-result');
    const mapModalEl = document.getElementById('mapping-modal');
    const mapModal = new bootstrap.Modal(mapModalEl);
    const mapList = document.getElementById('mapping-list');
    const btnSaveMapping = document.getElementById('btn-save-mapping');

    // Калькулятор
    const calcModalEl = document.getElementById('global-calc-modal');
    const calcModal = new bootstrap.Modal(calcModalEl);
    const calcSearch = document.getElementById('calc-search-input');
    const calcResults = document.getElementById('calc-search-results');
    const calcInSqm = document.getElementById('calc-input-sqm');
    const calcInMargin = document.getElementById('calc-input-margin');
    
    let allProducts = [];
    let unmappedItems = [];
    let sortMode = 'sku';
    let typeMode = 'laminate';
    let filterMode = 'liquid';
    let stockMode = 'all';
    let completenessMode = 'all';
    let canManageProducts = false; 
    let xlsxLoadPromise = null;
    let photoCatalog = null;
    let photoCatalogPromise = null;

    function ensureXlsxLoaded() {
        if (window.XLSX) return Promise.resolve(window.XLSX);
        if (xlsxLoadPromise) return xlsxLoadPromise;

        xlsxLoadPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js';
            script.async = true;
            script.onload = () => window.XLSX ? resolve(window.XLSX) : reject(new Error('Excel-библиотека не загрузилась'));
            script.onerror = () => reject(new Error('Не удалось загрузить Excel-библиотеку'));
            document.head.appendChild(script);
        }).catch(err => {
            xlsxLoadPromise = null;
            throw err;
        });

        return xlsxLoadPromise;
    }
    
    // Текущий товар в калькуляторе
    let calcCurrentProduct = null;

    // --- РАБОЧАЯ ЛОГИКА МАТРИЦЫ ---
    const esc = value => String(value ?? '')
        .replace(/&/g,'&amp;')
        .replace(/</g,'&lt;')
        .replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;')
        .replace(/'/g,'&#039;');

    const normalize = value => String(value ?? '').trim().toLowerCase().replace(/\s+/g,' ');

    const driveThumb = (id,size=520) => id ? 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(id) + '&sz=w' + size : '';

    function normalizeProductPhotoSku(value) {
        let sku=String(value || '').trim().toUpperCase()
            .replace(/[–—−]/g,'-')
            .replace(/[\s_./\\]+/g,'')
            .replace(/[АВЕКМНОРСТХ]/g,ch=>({
                'А':'A','В':'B','Е':'E','К':'K','М':'M','Н':'H','О':'O','Р':'P','С':'C','Т':'T','Х':'X'
            }[ch] || ch));
        const rules=[
            [/^8?EH(?:34)?-?(\d{3})$/,m=>'EH-'+m[1]],
            [/^8?MC(?:33|34)?-?(\d{3})$/,m=>'MC-'+m[1]],
            [/^8?HP(?:33|34)?-?(\d{2})$/,m=>'HP-'+m[1]],
            [/^8?FP(?:33|34)?-?(\d{2})$/,m=>'FP-'+m[1]],
            [/^8?AS(?:33|34)?-?(\d{2})$/,m=>'AS-'+m[1]],
            [/^8?RPL(?:33|34)?-?0?(\d{1,2})$/,m=>'RPL-'+Number(m[1])],
            [/^8?RWN(?:33|34)?-?(\d{2})$/,m=>'RWN-'+m[1]],
            [/^8?RWE(?:33|34)?-?(\d{2})$/,m=>'RWE-'+m[1]],
            [/^8?RWZ(?:33|34)?-?(\d{2})$/,m=>'RWZ-'+m[1]]
        ];
        for(const [pattern,formatter] of rules){
            const match=sku.match(pattern);
            if(match) return formatter(match);
        }
        return sku.replace(/-/g,'');
    }

    function extractDriveId(value) {
        const raw=String(value || '').trim();
        if(!raw) return '';
        const patterns=[
            /\/file\/d\/([a-zA-Z0-9_-]+)/,
            /[?&]id=([a-zA-Z0-9_-]+)/,
            /\/thumbnail\?id=([a-zA-Z0-9_-]+)/
        ];
        for(const pattern of patterns){
            const match=raw.match(pattern);
            if(match?.[1]) return match[1];
        }
        return /^[a-zA-Z0-9_-]{15,}$/.test(raw) ? raw : '';
    }

    async function loadPhotoCatalog() {
        if(photoCatalog) return photoCatalog;
        if(photoCatalogPromise) return photoCatalogPromise;
        photoCatalogPromise=fetch('/drive-photo-catalog.json',{cache:'no-store'})
            .then(async response=>{
                if(!response.ok) throw new Error('Каталог фото недоступен');
                const data=await response.json();
                photoCatalog=data && typeof data==='object' ? data : {};
                return photoCatalog;
            })
            .catch(error=>{
                console.warn(error);
                photoCatalog={};
                return photoCatalog;
            })
            .finally(()=>{ photoCatalogPromise=null; });
        return photoCatalogPromise;
    }

    function setPrimaryPhoto(value,{normalizeInput=true}={}) {
        const id=extractDriveId(value);
        if(inpPhotoId && normalizeInput) inpPhotoId.value=id;
        if(photoPreview){
            photoPreview.innerHTML=id
                ? '<img src="' + esc(driveThumb(id,700)) + '" alt="Основное фото товара" referrerpolicy="no-referrer" onerror="this.parentElement.innerHTML=\'<span><i class=&quot;bi bi-image&quot;></i><small>Фото недоступно</small></span>\'">'
                : '<span><i class="bi bi-image"></i><small>Фото не выбрано</small></span>';
        }
        photoGallery?.querySelectorAll('[data-product-photo]').forEach(btn=>{
            btn.classList.toggle('is-selected',btn.dataset.productPhoto===id);
        });
        return id;
    }

    async function renderPhotoGallery(product={}) {
        if(!photoGallery || !photoGalleryMeta || !photoGalleryToggle) return;
        const sku=String(product.sku || inpSku?.value || '').trim().toUpperCase();
        const selected=setPrimaryPhoto(product.photo_id || inpPhotoId?.value || '');
        photoGallery.innerHTML='<div class="text-muted small py-2">Загрузка фотографий…</div>';
        photoGallery.classList.add('d-none');
        photoGalleryToggle.disabled=true;
        if(photoFolderLink) photoFolderLink.classList.add('d-none');

        const catalog=await loadPhotoCatalog();
        const canonical=normalizeProductPhotoSku(sku);
        const catalogKey=Object.keys(catalog || {}).find(key=>normalizeProductPhotoSku(key)===canonical);
        const entry=catalogKey ? catalog[catalogKey] : null;
        const files=Array.isArray(entry?.files) ? entry.files : [];
        photoGalleryToggle.disabled=false;

        if(entry?.folderUrl && photoFolderLink){
            photoFolderLink.href=entry.folderUrl;
            photoFolderLink.classList.remove('d-none');
        }

        if(!files.length){
            photoGallery.innerHTML='<div class="product-photo-empty"><i class="bi bi-images"></i><span>Для этого артикула галерея пока не найдена. Можно вставить ссылку Google Drive вручную.</span></div>';
            photoGalleryMeta.textContent=selected ? 'Основное фото выбрано вручную.' : 'Галерея не найдена — вставьте ссылку Google Drive или ID файла.';
            return;
        }

        photoGalleryMeta.textContent=files.length + ' фото в папке декора · выберите одно основным';
        photoGallery.innerHTML=files.map(file=>{
            const id=String(file.id || '');
            const active=id===selected;
            return '<button type="button" class="product-photo-option ' + (active?'is-selected':'') + '" data-product-photo="' + esc(id) + '" title="' + esc(file.name || 'Фото') + '">' +
                '<img loading="lazy" src="' + esc(driveThumb(id,320)) + '" alt="' + esc(file.name || 'Фото') + '" referrerpolicy="no-referrer">' +
                '<span class="product-photo-check"><i class="bi bi-check-lg"></i></span></button>';
        }).join('');
        photoGallery.querySelectorAll('[data-product-photo]').forEach(btn=>{
            btn.addEventListener('click',()=>{
                setPrimaryPhoto(btn.dataset.productPhoto);
            });
        });
    }

    function stockValue(product) {
        const raw = product?.stock_qty;
        if (raw === undefined || raw === null || raw === '') return null;
        const value = Number(raw);
        return Number.isFinite(value) ? value : null;
    }

    function stockImportDateText(value) {
        if (!value) return '';
        const dateValue = new Date(value);
        if (Number.isNaN(dateValue.getTime())) return '';
        return dateValue.toLocaleString('ru-RU',{
            timeZone:'Asia/Almaty',
            day:'2-digit',
            month:'2-digit',
            year:'numeric',
            hour:'2-digit',
            minute:'2-digit'
        });
    }

    function renderStockImportMeta(meta = {}) {
        if (!stockLastUpdated) return;
        const text = stockImportDateText(meta.importedAt);
        if (!text) {
            stockLastUpdated.classList.add('is-empty');
            stockLastUpdated.innerHTML = '<i class="bi bi-clock-history"></i><span>Остатки ещё не загружались</span>';
            return;
        }
        stockLastUpdated.classList.remove('is-empty');
        const who = String(meta?.importedBy?.name || '').trim();
        stockLastUpdated.innerHTML =
            '<i class="bi bi-clock-history"></i><span><small>Остатки обновлены</small><strong>' + esc(text) + '</strong>' +
            (who ? '<em>' + esc(who) + '</em>' : '') + '</span>';
    }

    async function loadStockImportMeta() {
        try {
            const response = await fetch(API_URL + '/stock-import-meta', { crmTrackLoading:false });
            const data = await response.json().catch(()=>({}));
            if (!response.ok) throw new Error(data.error || 'Не удалось загрузить дату остатков');
            renderStockImportMeta(data);
            if (canManageProducts && stockLastUpdated) {
                const statusResponse = await fetch(API_URL + '/gmail-stock-status', {crmTrackLoading:false});
                if (statusResponse.ok) {
                    const status = await statusResponse.json();
                    if (status.configured) {
                        const label = status.lastError ? 'Автоимпорт Gmail: ' + status.lastError :
                            (status.lastCheckedAt ? 'Gmail проверен: ' + stockImportDateText(status.lastCheckedAt) : 'Автоимпорт Gmail: ожидается первая проверка');
                        stockLastUpdated.insertAdjacentHTML('beforeend', '<span><small>' + esc(label) + '</small></span>');
                    }
                }
            }
            return data;
        } catch (error) {
            console.warn(error);
            return null;
        }
    }

    async function saveStockImportMeta({source='',fileName='',matched=0,updated=0} = {}) {
        const response = await fetch(API_URL + '/stock-import-meta', {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({ source,fileName,matched,updated })
        });
        const data = await response.json().catch(()=>({}));
        if (!response.ok) throw new Error(data.error || 'Не удалось сохранить дату загрузки остатков');
        renderStockImportMeta(data);
        return data;
    }

    function productType(product) {
        return String(product?.product_type || 'laminate') === 'equipment' ? 'equipment' : 'laminate';
    }

    function missingProductFields(product) {
        const c = product?.characteristics || {};
        const fields = [
            ['артикул', product?.sku],
            ['название', product?.name]
        ];

        if (productType(product) === 'laminate') {
            fields.push(
                ['коллекция', product?.collection],
                ['класс', c.class],
                ['толщина', c.thickness],
                ['размер', c.size],
                ['м²/уп', c.package_area],
                ['шт/уп', c.package_qty],
                ['фото', product?.photo_id]
            );
        }

        return fields.filter(([,value]) => !String(value ?? '').trim()).map(([label]) => label);
    }

    function selectedProductType() {
        return productTypeInputs.find(input => input.checked)?.value === 'equipment' ? 'equipment' : 'laminate';
    }

    function syncProductTypeFields() {
        const type = selectedProductType();
        laminateFields.forEach(field => field.classList.toggle('d-none', type === 'equipment'));
    }

    function isProductComplete(product) {
        return missingProductFields(product).length === 0;
    }

    function populateDynamicFilters() {
        const selectedClass = classFilter?.value || '';
        const selectedThickness = thicknessFilter?.value || '';

        const laminateProducts = allProducts.filter(p => productType(p) === 'laminate');
        const classes = [...new Set(laminateProducts.map(p => String(p.characteristics?.class || '').trim()).filter(Boolean))]
            .sort((a,b)=>a.localeCompare(b,'ru',{numeric:true}));
        const thicknesses = [...new Set(laminateProducts.map(p => String(p.characteristics?.thickness || '').trim()).filter(Boolean))]
            .sort((a,b)=>a.localeCompare(b,'ru',{numeric:true}));
        const collections = [...new Set(laminateProducts.map(p => String(p.collection || '').trim()).filter(Boolean))]
            .sort((a,b)=>a.localeCompare(b,'ru',{numeric:true}));

        if (collectionOptions) {
            collectionOptions.innerHTML = collections.map(value => '<option value="' + esc(value) + '"></option>').join('');
        }

        if (classFilter) {
            classFilter.innerHTML = '<option value="">Все классы</option>' +
                classes.map(v=>`<option value="${esc(v)}">${esc(v)} класс</option>`).join('');
            if (classes.includes(selectedClass)) classFilter.value = selectedClass;
        }
        if (thicknessFilter) {
            thicknessFilter.innerHTML = '<option value="">Любая</option>' +
                thicknesses.map(v=>`<option value="${esc(v)}">${esc(v)} мм</option>`).join('');
            if (thicknesses.includes(selectedThickness)) thicknessFilter.value = selectedThickness;
        }
    }

    function resetWorkingFilters({showAll=false} = {}) {
        typeMode = showAll ? 'all' : 'laminate';
        filterMode = showAll ? 'all' : 'liquid';
        stockMode = 'all';
        completenessMode = 'all';
        sortMode = 'sku';
        if (typeFilter) typeFilter.value = typeMode;
        if (filterSelect) filterSelect.value = filterMode;
        if (stockFilter) stockFilter.value = stockMode;
        if (classFilter) classFilter.value = '';
        if (thicknessFilter) thicknessFilter.value = '';
        if (completenessFilter) completenessFilter.value = completenessMode;
        if (sortSelect) sortSelect.value = sortMode;
        if (searchInput) searchInput.value = '';
        if (searchClear) searchClear.hidden = true;
    }

    function applyQuickFilter(kind) {
        resetWorkingFilters({showAll:kind==='all'});
        if (kind === 'laminate') { typeMode = 'laminate'; filterMode = 'all'; }
        if (kind === 'equipment') { typeMode = 'equipment'; filterMode = 'all'; }
        if (kind === 'liquid') { typeMode = 'laminate'; filterMode = 'liquid'; }
        if (kind === 'illiquid') { typeMode = 'laminate'; filterMode = 'illiquid'; }
        if (kind === 'stock') { typeMode = 'laminate'; filterMode = 'liquid'; stockMode = 'positive'; }
        if (kind === 'zero') { typeMode = 'laminate'; filterMode = 'liquid'; stockMode = 'zero'; }
        if (kind === 'incomplete') { typeMode = 'laminate'; filterMode = 'liquid'; completenessMode = 'incomplete'; }

        if (typeFilter) typeFilter.value = typeMode;
        if (filterSelect) filterSelect.value = filterMode;
        if (stockFilter) stockFilter.value = stockMode;
        if (completenessFilter) completenessFilter.value = completenessMode;
        applyLogic();
    }

    function renderKpis() {
        if (!kpiHost) return;
        const laminate = allProducts.filter(p => productType(p) === 'laminate');
        const equipment = allProducts.filter(p => productType(p) === 'equipment');
        const liquid = laminate.filter(p => p.is_liquid !== false);
        const illiquid = laminate.filter(p => p.is_liquid === false);
        const liquidStock = liquid.reduce((sum,p) => sum + Math.max(0, stockValue(p) ?? 0), 0);
        const zeroStock = liquid.filter(p => {
            const value = stockValue(p);
            return value !== null && value <= 0;
        }).length;
        const incomplete = allProducts.filter(p => !isProductComplete(p)).length;

        const cleanState = !normalize(searchInput?.value) &&
            !classFilter?.value && !thicknessFilter?.value &&
            stockMode === 'all' && completenessMode === 'all';

        const cards = [
            {key:'all',icon:'bi-grid',label:'Всего в базе',value:allProducts.length,foot:`${laminate.length} ламинат · ${equipment.length} оборудование`,tone:'',active:cleanState&&typeMode==='all'},
            {key:'laminate',icon:'bi-layers',label:'Ламинат',value:laminate.length,foot:`${illiquid.length} неликвид`,tone:'good',active:cleanState&&typeMode==='laminate'&&filterMode==='all'},
            {key:'equipment',icon:'bi-display',label:'Торговое оборудование',value:equipment.length,foot:'отдельный тип позиции',tone:'',active:cleanState&&typeMode==='equipment'},
            {key:'liquid',icon:'bi-check2-circle',label:'Ликвид',value:liquid.length,foot:'ламинат',tone:'good',active:cleanState&&typeMode==='laminate'&&filterMode==='liquid'},
            {key:'illiquid',icon:'bi-archive',label:'Неликвид',value:illiquid.length,foot:'ламинат',tone:'risk',active:cleanState&&typeMode==='laminate'&&filterMode==='illiquid'},
            {key:'incomplete',icon:'bi-exclamation-diamond',label:'Нужно заполнить',value:incomplete,foot:'неполных карточек',tone:incomplete?'warn':'',active:completenessMode==='incomplete'}
        ];

        kpiHost.innerHTML = cards.map(card=>`
            <button type="button" class="product-kpi ${card.tone?'is-'+card.tone:''} ${card.active?'active':''}" data-product-kpi="${card.key}">
                <span class="product-kpi-icon"><i class="bi ${card.icon}"></i></span>
                <span class="product-kpi-copy">
                    <small>${esc(card.label)}</small>
                    <strong>${esc(card.value)}</strong>
                    <em>${esc(card.foot)}</em>
                </span>
            </button>
        `).join('');

        kpiHost.querySelectorAll('[data-product-kpi]').forEach(btn=>{
            btn.addEventListener('click',()=>applyQuickFilter(btn.dataset.productKpi));
        });
    }

    async function loadProducts() {
        try {
            listContainer.innerHTML = '<div class="text-center text-muted py-5">Загрузка...</div>';
            const [res] = await Promise.all([
                fetch(API_URL),
                loadStockImportMeta()
            ]);
            if (!res.ok) throw new Error('Ошибка');
            allProducts = await res.json();
            populateDynamicFilters();
            applyLogic();
        } catch (e) {
            listContainer.innerHTML = '<div class="text-center text-danger py-4">Ошибка загрузки данных</div>';
        }
    }

    function applyLogic() {
        const term = normalize(searchInput?.value);
        if (searchClear) searchClear.hidden = !term;

        typeMode = typeFilter?.value || typeMode || 'laminate';
        filterMode = filterSelect?.value || filterMode || 'liquid';
        stockMode = stockFilter?.value || stockMode || 'all';
        completenessMode = completenessFilter?.value || completenessMode || 'all';
        sortMode = sortSelect?.value || sortMode || 'sku';
        const classValue = classFilter?.value || '';
        const thicknessValue = thicknessFilter?.value || '';

        let filtered = allProducts.filter(product => {
            const c = product.characteristics || {};
            const searchBlob = normalize([
                product.sku, product.name, product.collection, product.excel_alias,
                c.class, c.thickness, c.bevel, c.size, c.package_area, c.package_qty
            ].filter(Boolean).join(' '));

            if (term && !searchBlob.includes(term)) return false;
            if (typeMode !== 'all' && productType(product) !== typeMode) return false;
            if (filterMode === 'liquid' && productType(product) === 'laminate' && product.is_liquid === false) return false;
            if (filterMode === 'illiquid' && (productType(product) !== 'laminate' || product.is_liquid !== false)) return false;
            if (classValue && String(c.class || '') !== classValue) return false;
            if (thicknessValue && String(c.thickness || '') !== thicknessValue) return false;

            const stock = stockValue(product);
            if (stockMode === 'positive' && !(stock !== null && stock > 0)) return false;
            if (stockMode === 'low' && !(stock !== null && stock > 0 && stock <= 20)) return false;
            if (stockMode === 'zero' && !(stock !== null && stock <= 0)) return false;
            if (stockMode === 'unknown' && stock !== null) return false;

            const complete = isProductComplete(product);
            if (completenessMode === 'complete' && !complete) return false;
            if (completenessMode === 'incomplete' && complete) return false;
            return true;
        });

        filtered.sort((a,b) => {
            const aStock = stockValue(a);
            const bStock = stockValue(b);
            const bySku = () => String(a.sku || '').localeCompare(String(b.sku || ''),'ru',{numeric:true});
            if (sortMode === 'name') return String(a.name || '').localeCompare(String(b.name || ''),'ru') || bySku();
            if (sortMode === 'stock_desc') return (bStock ?? -Infinity) - (aStock ?? -Infinity) || bySku();
            if (sortMode === 'stock_asc') {
                if (aStock === null && bStock !== null) return 1;
                if (bStock === null && aStock !== null) return -1;
                return (aStock ?? 0) - (bStock ?? 0) || bySku();
            }
            if (sortMode === 'incomplete') {
                return Number(isProductComplete(a)) - Number(isProductComplete(b)) || bySku();
            }
            return bySku();
        });

        renderList(filtered);
        renderKpis();
        renderFilterMeta(filtered);
    }

    function renderFilterMeta(products) {
        const labels = [];
        labels.push(typeMode === 'laminate' ? 'Ламинат' : typeMode === 'equipment' ? 'Торговое оборудование' : 'Все типы');
        if (typeMode !== 'equipment') {
            labels.push(filterMode === 'liquid' ? 'ликвидные' : filterMode === 'illiquid' ? 'неликвидные' : 'все по актуальности');
        }
        if (stockMode !== 'all') {
            labels.push(({positive:'есть на складе',low:'низкий остаток',zero:'без остатка',unknown:'остаток не загружен'})[stockMode] || stockMode);
        }
        if (classFilter?.value) labels.push(`${classFilter.value} класс`);
        if (thicknessFilter?.value) labels.push(`${thicknessFilter.value} мм`);
        if (completenessMode === 'complete') labels.push('карточки заполнены');
        if (completenessMode === 'incomplete') labels.push('нужно заполнить');
        if (normalize(searchInput?.value)) labels.push(`поиск: «${searchInput.value.trim()}»`);

        const knownStock = products.filter(p=>stockValue(p)!==null).length;
        const laminate = products.filter(p=>productType(p)==='laminate');
        const equipment = products.filter(p=>productType(p)==='equipment');
        let stockText = `остаток загружен у ${knownStock}`;
        if (typeMode === 'laminate') {
            const total = laminate.reduce((sum,p)=>sum + Math.max(0,stockValue(p) ?? 0),0);
            stockText = `${total.toLocaleString('ru-RU',{maximumFractionDigits:2})} м² · ${stockText}`;
        } else if (typeMode === 'equipment') {
            const total = equipment.reduce((sum,p)=>sum + Math.max(0,stockValue(p) ?? 0),0);
            stockText = `${total.toLocaleString('ru-RU',{maximumFractionDigits:2})} шт · ${stockText}`;
        }

        if (activeFilterSummary) activeFilterSummary.textContent = labels.join(' · ');
        if (filteredSummary) filteredSummary.textContent = `${products.length} позиций · ${stockText}`;
    }

    function renderList(products) {
        if (totalLabel) {
            if (!products.length) totalLabel.textContent = 'По текущим фильтрам позиций нет';
            else if (typeMode === 'laminate') {
                const total = products.reduce((sum,p)=>sum + Math.max(0,stockValue(p) ?? 0),0);
                totalLabel.textContent = `Показано ${products.length} из ${allProducts.length} · ${total.toLocaleString('ru-RU',{maximumFractionDigits:2})} м²`;
            } else if (typeMode === 'equipment') {
                const total = products.reduce((sum,p)=>sum + Math.max(0,stockValue(p) ?? 0),0);
                totalLabel.textContent = `Показано ${products.length} из ${allProducts.length} · ${total.toLocaleString('ru-RU',{maximumFractionDigits:2})} шт`;
            } else {
                totalLabel.textContent = `Показано ${products.length} из ${allProducts.length}`;
            }
        }

        if (!products.length) {
            listContainer.innerHTML = `
                <div class="product-empty-state">
                    <i class="bi bi-search"></i>
                    <span>По текущим фильтрам ничего не найдено</span>
                </div>`;
            return;
        }

        listContainer.innerHTML = products.map(product => {
            const c = product.characteristics || {};
            const type = productType(product);
            const isEquipment = type === 'equipment';
            const isLiquid = product.is_liquid !== false;
            const missing = missingProductFields(product);
            const stock = stockValue(product);
            const stockClass = stock === null ? 'is-unknown' : stock <= 0 ? 'is-zero' : stock <= 20 ? 'is-low' : 'is-good';
            const unit = isEquipment ? 'шт' : 'м²';
            const stockText = stock === null ? 'Не загружен' : `${stock.toLocaleString('ru-RU',{minimumFractionDigits:0,maximumFractionDigits:2})} ${unit}`;
            const stockFoot = stock === null ? 'нет данных' : stock <= 0 ? 'нет на складе' : stock <= 20 ? 'низкий остаток' : 'в наличии';

            const chars = isEquipment ? [
                '<span class="product-tag is-equipment"><i class="bi bi-display"></i> Торговое оборудование</span>'
            ] : [
                c.class ? `${esc(c.class)} класс` : '',
                c.thickness ? `${esc(c.thickness)} мм` : '',
                c.size ? esc(c.size) : '',
                c.bevel ? esc(c.bevel) : ''
            ].filter(Boolean).map(value=>`<span class="product-tag">${value}</span>`);

            const packageMain = isEquipment ? 'Не требуется' : [
                c.package_area ? `${esc(c.package_area)} м²/уп` : '',
                c.package_qty ? `${esc(c.package_qty)} шт/уп` : ''
            ].filter(Boolean).join(' · ');
            const packageFoot = isEquipment ? 'учёт ведётся поштучно' : (c.weight ? `Вес упаковки: ${esc(c.weight)} кг` : 'Вес упаковки не указан');
            const rowPhoto = product.photo_id
                ? '<img class="product-row-photo" loading="lazy" src="' + esc(driveThumb(product.photo_id,160)) + '" alt="' + esc(product.name || '') + '" referrerpolicy="no-referrer">'
                : '<span class="product-row-photo is-empty"><i class="bi bi-image"></i></span>';

            return `
                <article class="product-row ${!isEquipment && !isLiquid?'is-illiquid':''} ${isEquipment?'is-equipment':''}" ${canManageProducts?`data-edit-product="${esc(product.id)}"`:''}>
                    <div class="product-position">
                        <div class="product-position-top">
                            ${rowPhoto}
                            <span class="product-sku">${esc(product.sku || '—')}</span>
                            <span class="product-name" title="${esc(product.name || 'Без названия')}">${esc(product.name || 'Без названия')}</span>
                        </div>
                        ${!isEquipment ? (product.collection ? `<small class="product-collection" title="${esc(product.collection)}"><i class="bi bi-collection me-1"></i>${esc(product.collection)}</small>` : '<small class="product-collection is-empty"><i class="bi bi-collection me-1"></i>Коллекция не указана</small>') : '<small class="product-collection is-equipment"><i class="bi bi-display me-1"></i>Торговое оборудование</small>'}
                        ${product.excel_alias ? `<small class="product-alias" title="${esc(product.excel_alias)}">Excel: ${esc(product.excel_alias)}</small>` : ''}
                        ${missing.length ? `<span class="product-alert"><i class="bi bi-exclamation-circle"></i>Не заполнено: ${esc(missing.slice(0,3).join(', '))}${missing.length>3?'…':''}</span>` : ''}
                    </div>
                    <div class="product-characteristics">
                        ${chars.length ? chars.join('') : '<span class="product-tag is-empty">Характеристики не заполнены</span>'}
                    </div>
                    <div class="product-package">
                        <div class="product-package-main">
                            <strong>${packageMain || 'Упаковка не заполнена'}</strong>
                            <small>${packageFoot}</small>
                        </div>
                    </div>
                    <div class="product-stock ${stockClass}">
                        <strong>${esc(stockText)}</strong>
                        <small>${esc(stockFoot)}</small>
                    </div>
                    <div class="product-status-stack">
                        <span class="product-type-badge ${isEquipment?'is-equipment':'is-laminate'}">${isEquipment?'Оборудование':'Ламинат'}</span>
                        ${!isEquipment ? `<span class="product-status ${isLiquid?'':'is-illiquid'}">${isLiquid?'Ликвид':'Неликвид'}</span>` : ''}
                    </div>
                    <div>
                        ${canManageProducts?'<button type="button" class="product-edit-btn" title="Редактировать"><i class="bi bi-pencil"></i></button>':''}
                    </div>
                </article>
            `;
        }).join('');

        if (canManageProducts) {
            listContainer.querySelectorAll('[data-edit-product]').forEach(row=>{
                row.addEventListener('click',event=>{
                    if (event.target.closest('button')) event.preventDefault();
                    openModal(row.dataset.editProduct);
                });
            });
        }
    }

    // --- ЛОГИКА КАЛЬКУЛЯТОРА ---
    window.openGlobalCalc = () => {
        calcSearch.value = '';
        calcResults.classList.add('d-none');
        document.getElementById('calc-selected-info').classList.add('d-none');
        calcInSqm.value = '';
        resetCalcDisplay();
        calcCurrentProduct = null;
        calcModal.show();
        setTimeout(() => calcSearch.focus(), 500);
    };

    // Поиск в калькуляторе
    calcSearch.addEventListener('input', (e) => {
        const val = e.target.value.toLowerCase();
        if(val.length < 2) {
            calcResults.classList.add('d-none');
            return;
        }
        
        const matches = allProducts.filter(p => 
            productType(p) === 'laminate' && (
                (p.name && p.name.toLowerCase().includes(val)) || 
                (p.sku && p.sku.toLowerCase().includes(val))
            )
        ).slice(0, 10); // Максимум 10 подсказок

        if(matches.length > 0) {
            calcResults.innerHTML = matches.map(p => `
                <div class="search-item" onclick="selectCalcProduct('${p.id}')">
                    <div class="fw-bold small">${p.name}</div>
                    <div class="text-muted small font-monospace">${p.sku}</div>
                </div>
            `).join('');
            calcResults.classList.remove('d-none');
        } else {
            calcResults.innerHTML = '<div class="p-2 text-muted small text-center">Ничего не найдено</div>';
            calcResults.classList.remove('d-none');
        }
    });

    window.selectCalcProduct = (id) => {
        const p = allProducts.find(x => String(x.id) === String(id));
        if(!p) return;

        calcCurrentProduct = p;
        calcSearch.value = p.name;
        calcResults.classList.add('d-none');

        // Отображение данных
        const area = p.characteristics?.package_area || 0;
        const weight = p.characteristics?.weight || 0;

        if(!area) {
            alert('Внимание! У товара не заполнен метраж упаковки. Расчет невозможен.');
            return;
        }

        document.getElementById('calc-sel-name').textContent = `${p.sku} - ${p.name}`;
        document.getElementById('calc-sel-area').textContent = area;
        document.getElementById('calc-sel-weight').textContent = weight;
        document.getElementById('calc-selected-info').classList.remove('d-none');
        
        doCalculation();
    };

    function resetCalcDisplay() {
        document.getElementById('res-packs').textContent = '0';
        document.getElementById('res-total-sqm').textContent = '0';
        document.getElementById('res-total-weight').textContent = '0';
        document.getElementById('calc-formula-hint').textContent = '';
    }

    function doCalculation() {
        if(!calcCurrentProduct) return;
        
        const reqSqm = parseFloat(calcInSqm.value);
        if(!reqSqm || reqSqm <= 0) {
            resetCalcDisplay();
            return;
        }

        const margin = parseInt(calcInSqm.value ? calcInMargin.value : 0);
        const packArea = parseFloat(calcCurrentProduct.characteristics.package_area);
        const packWeight = parseFloat(calcCurrentProduct.characteristics.weight) || 0;

        // 1. Добавляем запас
        const withMargin = reqSqm * (1 + margin / 100);
        
        // 2. Считаем пачки (округляем вверх)
        const packs = Math.ceil(withMargin / packArea);
        
        // 3. Итоговые цифры
        const finalSqm = packs * packArea;
        const finalWeight = packs * packWeight;

        document.getElementById('res-packs').textContent = packs;
        document.getElementById('res-total-sqm').textContent = finalSqm.toFixed(3);
        document.getElementById('res-total-weight').textContent = finalWeight.toFixed(1);
        
        document.getElementById('calc-formula-hint').textContent = 
            `Клиент: ${reqSqm} м² + ${margin}% = ${withMargin.toFixed(2)} м² (нужно)`;
    }

    // Слушатели ввода для пересчета
    calcInSqm.addEventListener('input', doCalculation);
    calcInMargin.addEventListener('change', doCalculation);


    // --- ОБЫЧНЫЕ ФУНКЦИИ ---
    window.openModal = (id) => {
        if (!canManageProducts) return;
        form.reset();
        productTypeInputs.forEach(input => { input.checked = input.value === 'laminate'; });
        if(btnDelete) btnDelete.style.display = 'none';

        if (id) {
            const p = allProducts.find(x => String(x.id) === String(id));
            if(p) {
                const type = productType(p);
                productTypeInputs.forEach(input => { input.checked = input.value === type; });
                inpId.value = p.id;
                inpSku.value = p.sku || '';
                inpName.value = p.name || '';
                if(inpCollection) inpCollection.value = p.collection || '';
                if(inpLiquid) inpLiquid.checked = p.is_liquid !== false;
                if(inpAlias) inpAlias.value = p.excel_alias || '';
                if(inpPhotoId) inpPhotoId.value = p.photo_id || '';
                setPrimaryPhoto(p.photo_id || '');
                renderPhotoGallery(p);

                if(p.characteristics) {
                    const c = p.characteristics;
                    if(charClass) charClass.value = c.class || '';
                    if(charThick) charThick.value = c.thickness || '';
                    if(charBevel) charBevel.value = c.bevel || '';
                    if(charSize) charSize.value = c.size || '';
                    if(pkgArea) pkgArea.value = c.package_area || '';
                    if(pkgQty) pkgQty.value = c.package_qty || '';
                    if(pkgWeight) pkgWeight.value = c.weight || '';
                }

                modalTitle.textContent = type === 'equipment' ? 'Торговое оборудование' : 'Ламинат';
                if(btnDelete) {
                    btnDelete.style.display = 'block';
                    btnDelete.onclick = () => deleteProduct(p.id);
                }
            }
        } else {
            inpId.value = '';
            modalTitle.textContent = 'Новая позиция';
            if(inpLiquid) inpLiquid.checked = true;
            if(inpPhotoId) inpPhotoId.value='';
            setPrimaryPhoto('');
            renderPhotoGallery({sku:inpSku?.value || '',photo_id:''});
        }

        syncProductTypeFields();
        modal.show();
    };

    window.deleteProduct = async (id) => {
        if (!canManageProducts) return;
        if(confirm('Удалить товар?')) {
            try { await fetch(`${API_URL}/${id}`, { method: 'DELETE' }); loadProducts(); modal.hide(); } catch(e) { alert('Ошибка'); }
        }
    };

    if(form) {
        form.onsubmit = async (e) => {
            e.preventDefault();
            if (!canManageProducts) return;
            const chars = {
                class: charClass ? charClass.value.trim() : '',
                thickness: charThick ? charThick.value.trim() : '',
                bevel: charBevel ? charBevel.value.trim() : '',
                size: charSize ? charSize.value.trim() : '',
                package_area: pkgArea ? pkgArea.value.trim() : '',
                package_qty: pkgQty ? pkgQty.value.trim() : '',
                weight: pkgWeight ? pkgWeight.value.trim() : ''
            };
            const type = selectedProductType();
            const data = { 
                sku: inpSku.value.trim(),
                name: inpName.value.trim(),
                product_type: type,
                collection: type === 'laminate' && inpCollection ? inpCollection.value.trim() : '',
                is_liquid: type === 'laminate' ? (inpLiquid ? inpLiquid.checked : true) : true,
                excel_alias: inpAlias ? inpAlias.value.trim() : '',
                photo_id: inpPhotoId ? extractDriveId(inpPhotoId.value) : '',
                characteristics: type === 'laminate' ? chars : {
                    class:'', thickness:'', bevel:'', size:'', package_area:'', package_qty:'', weight:''
                }
            };
            const id = inpId.value;
            let url = API_URL; let method = 'POST';
            if (id) { url = `${API_URL}/${id}`; method = 'PUT'; }

            try {
                const btn = form.querySelector('button[type="submit"]');
                const oldText = btn.innerHTML;
                btn.disabled = true; btn.innerHTML = 'Сохранение...';
                const res = await fetch(url, { method: method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) });
                if (res.ok) { await loadProducts(); modal.hide(); } else { alert('Ошибка сохранения.'); }
                btn.disabled = false; btn.innerHTML = oldText;
            } catch (e) { alert('Ошибка сети'); }
        };
    }

    function normalizeExcelText(value) {
        return normalize(String(value ?? '').replace(/ё/g,'е'));
    }

    function normalizeExcelSku(value) {
        return String(value ?? '').trim().toLowerCase().replace(/\s+/g,'');
    }

    function parseStockNumber(value) {
        const clean = String(value ?? '').replace(/\s+/g,'').replace(',','.');
        const number = Number(clean);
        return Number.isFinite(number) ? number : null;
    }

    function showStockImportResult({updated=0, matched=0, zeroedMissing=0, unmapped=0, total=0, error='', source=''}) {
        if (!stockImportResult) return;
        stockImportResult.classList.remove('d-none','is-error','is-success');
        stockImportResult.classList.add(error ? 'is-error' : 'is-success');
        stockImportResult.innerHTML = error
            ? `<i class="bi bi-exclamation-circle"></i><div><strong>Не удалось загрузить остатки</strong><span>${esc(error)}</span></div>`
            : `<i class="bi bi-check2-circle"></i><div><strong>Файл обработан</strong><span>Источник: ${esc(source || 'Свободный остаток')} · строк: ${total} · найдено: ${matched} · обновлено: ${updated}${zeroedMissing ? ' · отсутствовали в файле → 0: '+zeroedMissing : ''}${unmapped ? ' · требуют привязки: '+unmapped : ''}</span></div>`;
    }

    if(btnImport) btnImport.onclick = () => {
        if (!canManageProducts || !stockImportModal) return;
        if (stockImportFileName) stockImportFileName.textContent = 'Выберите Excel-файл';
        if (stockImportResult) stockImportResult.classList.add('d-none');
        stockImportModal.show();
    };

    stockImportChoose?.addEventListener('click', () => {
        if (canManageProducts && fileInput) fileInput.click();
    });

    if(fileInput) fileInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (stockImportFileName) stockImportFileName.textContent = file.name;

        try {
            await ensureXlsxLoaded();
            const buffer = await file.arrayBuffer();
            const wb = XLSX.read(new Uint8Array(buffer), {type:'array'});
            const ws = wb.Sheets[wb.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(ws, {header:1, defval:''});
            await processExcel(rows, file.name);
        } catch (err) {
            showStockImportResult({error:err.message || 'Ошибка чтения Excel'});
        } finally {
            fileInput.value = '';
        }
    };

    async function processExcel(rows, fileName = '') {
        let cSku = -1, cName = -1, cFreeStock = -1;
        let skuHeaderRow = -1, nameHeaderRow = -1, stockHeaderRow = -1;
        let freeStockHeaderLabel = '';
        const freeStockCandidates = [];

        // В выгрузках 1С заголовки могут быть на разных строках.
        // Общий «Остаток» намеренно игнорируем: в CRM загружается только «Свободный остаток».
        for(let i=0; i<Math.min(rows.length, 40); i++) {
            const row = Array.isArray(rows[i]) ? rows[i] : [];
            row.forEach((cell,j) => {
                const raw = String(cell ?? '').trim();
                const v = normalizeExcelText(cell).replace(/[^a-zа-я0-9]+/g,'');

                if (v === 'свободныйостаток' || v === 'свободно') {
                    freeStockCandidates.push({column:j,row:i,label:raw || 'Свободный остаток',score:3});
                } else if (v.includes('свободныйостаток') && !v.includes('общийостаток')) {
                    freeStockCandidates.push({column:j,row:i,label:raw || 'Свободный остаток',score:2});
                }

                if (cSku < 0 && (
                    v === 'артикул' ||
                    v === 'sku' ||
                    v === 'кодтовара' ||
                    v === 'кодноменклатуры' ||
                    v === 'номенклатураартикул'
                )) {
                    cSku = j;
                    skuHeaderRow = i;
                }

                if (cName < 0 && (
                    v === 'номенклатура' ||
                    v.includes('наименован') ||
                    v === 'товар'
                )) {
                    cName = j;
                    nameHeaderRow = i;
                }
            });
        }

        if (freeStockCandidates.length) {
            freeStockCandidates.sort((a,b) => b.score-a.score || a.row-b.row || a.column-b.column);
            const picked = freeStockCandidates[0];
            cFreeStock = picked.column;
            stockHeaderRow = picked.row;
            freeStockHeaderLabel = picked.label || 'Свободный остаток';
        }

        if (cFreeStock < 0) {
            throw new Error('В файле не найдена колонка «Свободный остаток». Общий «Остаток» CRM намеренно не использует.');
        }
        if (cSku < 0 && cName < 0) {
            throw new Error('Не найдена колонка с артикулом или наименованием товара.');
        }

        const hIdx = Math.max(stockHeaderRow, skuHeaderRow, nameHeaderRow);

        const bySku = new Map();
        const byAlias = new Map();
        const byName = new Map();

        allProducts.forEach(product => {
            const sku = normalizeExcelSku(product.sku);
            const alias = normalizeExcelText(product.excel_alias);
            const name = normalizeExcelText(product.name);
            if (sku && !bySku.has(sku)) bySku.set(sku, product);
            if (alias && !byAlias.has(alias)) byAlias.set(alias, product);
            if (name && !byName.has(name)) byName.set(name, product);
        });

        unmappedItems = [];
        const matchedProductIds = new Set();
        let updated = 0;
        let matched = 0;
        let zeroedMissing = 0;
        let total = 0;

        for(let i=hIdx+1; i<rows.length; i++) {
            const row = Array.isArray(rows[i]) ? rows[i] : [];
            const skuRaw = cSku >= 0 ? String(row[cSku] || '').trim() : '';
            const nameRaw = cName >= 0 ? String(row[cName] || '').trim() : '';
            const stock = parseStockNumber(row[cFreeStock]);

            if (stock === null || (!skuRaw && !nameRaw)) continue;

            const skuKey = normalizeExcelSku(skuRaw);
            const nameKey = normalizeExcelText(nameRaw);
            let product = skuKey ? bySku.get(skuKey) : null;
            if (!product && nameKey) product = byAlias.get(nameKey);
            if (!product && nameKey) product = byName.get(nameKey);

            // В типовой выгрузке артикул часто находится внутри длинного наименования.
            if (!product) {
                const sourceText = [skuRaw,nameRaw].filter(Boolean).join(' ').toLowerCase();
                product = allProducts.find(item => {
                    const sku = String(item.sku || '').trim().toLowerCase();
                    return sku.length > 3 && sourceText.includes(sku);
                }) || null;
            }

            // Строки организации / склада / итогов / названия коллекций не считаем ошибкой сопоставления.
            if (!product) {
                const source = nameRaw || skuRaw;
                const looksLikeProduct = /\d+[a-zа-я]*[-_][a-zа-я0-9-]+/i.test(source) ||
                    /ламинат|плинтус|стенд|табличк|профил|порог/i.test(source);
                if (looksLikeProduct) {
                    unmappedItems.push({
                        sku:skuRaw,
                        name:nameRaw,
                        qty:stock,
                        sourceLabel:source
                    });
                }
                continue;
            }

            total++;
            matched++;
            matchedProductIds.add(String(product.id));
            if (Number(product.stock_qty) !== stock) {
                const response = await fetch(`${API_URL}/${product.id}`, {
                    method:'PUT',
                    headers:{'Content-Type':'application/json'},
                    body:JSON.stringify({ stock_qty:stock })
                });
                if (response.ok) {
                    product.stock_qty = stock;
                    updated++;
                }
            }
        }

        // Новый файл остатков — источник истины.
        // Если позиция есть в Матрице, но отсутствует в свежем файле, её свободный остаток = 0.
        // Это не позволяет старым остаткам "зависать" после следующего импорта.
        if (matched > 0) {
            for (const product of allProducts) {
                if (matchedProductIds.has(String(product.id))) continue;
                const previousStock = stockValue(product);
                if (previousStock === null || previousStock === 0) continue;

                const response = await fetch(`${API_URL}/${product.id}`, {
                    method:'PUT',
                    headers:{'Content-Type':'application/json'},
                    body:JSON.stringify({ stock_qty:0 })
                });
                if (response.ok) {
                    product.stock_qty = 0;
                    updated++;
                    zeroedMissing++;
                }
            }

            await saveStockImportMeta({
                source:freeStockHeaderLabel || 'Свободный остаток',
                fileName,
                matched,
                updated
            });
        }
        await loadProducts();
        showStockImportResult({
            updated,
            matched,
            zeroedMissing,
            unmapped:unmappedItems.length,
            total,
            source:freeStockHeaderLabel || 'Свободный остаток'
        });

        if(unmappedItems.length > 0) {
            setTimeout(() => {
                stockImportModal?.hide();
                showMapping();
            }, 350);
        }
    }

    function showMapping() {
        mapList.innerHTML = '';
        const items = unmappedItems.slice(0, 60);
        if(!items.length) return;

        const opts = '<option value="">-- Пропустить --</option>' + allProducts
            .map(p => `<option value="${p.id}">${esc(p.sku || '—')} · ${esc(p.name || '')}</option>`)
            .join('');

        items.forEach((item,index) => {
            const div = document.createElement('div');
            div.className = 'stock-mapping-row';
            div.innerHTML = `
                <div class="stock-mapping-source">
                    <strong title="${esc(item.sourceLabel)}">${esc(item.sourceLabel)}</strong>
                    <small>${item.sku ? 'Артикул в Excel: '+esc(item.sku)+' · ' : ''}остаток: ${esc(item.qty)}</small>
                </div>
                <select class="form-select form-select-sm map-select" data-index="${index}">${opts}</select>`;
            mapList.appendChild(div);
        });
        mapModal.show();
    }

    if(btnSaveMapping) btnSaveMapping.onclick = async () => {
        const selects = [...document.querySelectorAll('.map-select')];
        btnSaveMapping.disabled = true;
        let saved = 0;

        try {
            for(const sel of selects) {
                if(!sel.value) continue;
                const item = unmappedItems[Number(sel.dataset.index)];
                const product = allProducts.find(x => String(x.id) === String(sel.value));
                if(!item || !product) continue;

                const payload = {
                    excel_alias: item.name || item.sku || '',
                    stock_qty: item.qty
                };
                const response = await fetch(`${API_URL}/${product.id}`, {
                    method:'PUT',
                    headers:{'Content-Type':'application/json'},
                    body:JSON.stringify(payload)
                });
                if(response.ok) saved++;
            }

            mapModal.hide();
            await loadProducts();
            if (stockImportModal) stockImportModal.show();
            showStockImportResult({
                updated:saved,
                matched:saved,
                unmapped:Math.max(0,unmappedItems.length-saved),
                total:unmappedItems.length
            });
        } finally {
            btnSaveMapping.disabled = false;
        }
    };

    function syncMatrixTypeFilters() {
        const equipmentOnly = (typeFilter?.value || typeMode) === 'equipment';
        if (equipmentOnly) {
            if (filterSelect) filterSelect.value = 'all';
            if (classFilter) classFilter.value = '';
            if (thicknessFilter) thicknessFilter.value = '';
        }
        if (filterSelect) filterSelect.disabled = equipmentOnly;
        if (classFilter) classFilter.disabled = equipmentOnly;
        if (thicknessFilter) thicknessFilter.disabled = equipmentOnly;
    }

    productTypeInputs.forEach(input => input.addEventListener('change', syncProductTypeFields));

    photoGalleryToggle?.addEventListener('click',()=>{
        if(!photoGallery) return;
        photoGallery.classList.toggle('d-none');
        photoGalleryToggle.innerHTML=photoGallery.classList.contains('d-none')
            ? '<i class="bi bi-images"></i> Выбрать из галереи'
            : '<i class="bi bi-chevron-up"></i> Скрыть галерею';
    });
    photoClear?.addEventListener('click',()=>setPrimaryPhoto(''));
    inpPhotoId?.addEventListener('change',()=>setPrimaryPhoto(inpPhotoId.value));
    inpPhotoId?.addEventListener('blur',()=>setPrimaryPhoto(inpPhotoId.value));
    inpSku?.addEventListener('change',()=>{
        renderPhotoGallery({sku:inpSku.value,photo_id:extractDriveId(inpPhotoId?.value || '')});
    });

    searchInput?.addEventListener('input', applyLogic);
    searchClear?.addEventListener('click',()=>{
        searchInput.value='';
        searchClear.hidden=true;
        applyLogic();
        searchInput.focus();
    });
    typeFilter?.addEventListener('change',()=>{
        syncMatrixTypeFilters();
        applyLogic();
    });
    filterSelect?.addEventListener('change',applyLogic);
    stockFilter?.addEventListener('change',applyLogic);
    classFilter?.addEventListener('change',applyLogic);
    thicknessFilter?.addEventListener('change',applyLogic);
    completenessFilter?.addEventListener('change',applyLogic);
    sortSelect?.addEventListener('change',applyLogic);
    resetFiltersBtn?.addEventListener('click',()=>{
        resetWorkingFilters();
        applyLogic();
    });

    async function initPermissionsAndLoad() {
        if (window.CRMAuth && CRMAuth.ready) await CRMAuth.ready;
        canManageProducts = window.CRMAuth ? CRMAuth.can('can_manage_products') : false;

        if (addBtn) addBtn.style.display = canManageProducts ? '' : 'none';
        if (btnImport) btnImport.style.display = canManageProducts ? '' : 'none';
        if (resetBtn) resetBtn.style.display = 'none';
        if (form) {
            form.querySelectorAll('input, select, textarea, button[type="submit"]').forEach(el => {
                if (!canManageProducts) el.disabled = true;
            });
        }

        syncMatrixTypeFilters();
        syncProductTypeFields();
        await loadProducts();
    }

    if (addBtn) addBtn.onclick = () => openModal();
    initPermissionsAndLoad();
});


