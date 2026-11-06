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

    function stockValue(product) {
        const raw = product?.stock_qty;
        if (raw === undefined || raw === null || raw === '') return null;
        const value = Number(raw);
        return Number.isFinite(value) ? value : null;
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
                ['шт/уп', c.package_qty]
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
        if (type === 'equipment') {
            if (inpCollection) inpCollection.value = '';
            if (inpLiquid) inpLiquid.checked = true;
        }
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
            const res = await fetch(API_URL);
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

            return `
                <article class="product-row ${!isEquipment && !isLiquid?'is-illiquid':''} ${isEquipment?'is-equipment':''}" ${canManageProducts?`data-edit-product="${esc(product.id)}"`:''}>
                    <div class="product-position">
                        <div class="product-position-top">
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

    if(btnImport) btnImport.onclick = () => { if(canManageProducts && fileInput) fileInput.click(); };
    if(fileInput) fileInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            await ensureXlsxLoaded();
        } catch (err) {
            alert(err.message);
            fileInput.value = '';
            return;
        }
        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const data = new Uint8Array(evt.target.result);
                const wb = XLSX.read(data, {type: 'array'});
                const ws = wb.Sheets[wb.SheetNames[0]];
                const json = XLSX.utils.sheet_to_json(ws, {header: 1});
                processExcel(json);
            } catch (err) { alert("Ошибка чтения: " + err.message); }
            fileInput.value = '';
        };
        reader.readAsArrayBuffer(file);
    };

    async function processExcel(rows) {
        let hIdx = -1, cName = -1, cStock = -1;
        for(let i=0; i<Math.min(rows.length, 25); i++) {
            const r = rows[i];
            for(let j=0; j<r.length; j++) {
                const v = String(r[j]).toLowerCase();
                if(v.includes('номенклатура') || v.includes('наименование')) cName = j;
                if(v === 'остаток' || v.includes('свободный')) cStock = j;
            }
            if(cName > -1 && cStock > -1) { hIdx = i; break; }
        }

        if(hIdx === -1) return alert('Не найдены колонки "Номенклатура" и "Остаток"');
        unmappedItems = []; let updated = 0;
        for(let i=hIdx+1; i<rows.length; i++) {
            const name = String(rows[i][cName] || '').trim();
            const stock = parseFloat(rows[i][cStock]);
            if(!name || isNaN(stock)) continue;
            let p = allProducts.find(x => x.excel_alias === name);
            if(!p) p = allProducts.find(x => x.name.toLowerCase() === name.toLowerCase());
            if(!p) p = allProducts.find(x => x.sku && x.sku.length > 3 && name.includes(x.sku));
            if(p) {
                if(p.stock_qty !== stock) {
                    p.stock_qty = stock;
                    await fetch(`${API_URL}/${p.id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(p) });
                    updated++;
                }
            } else { unmappedItems.push({ name, qty: stock }); }
        }
        await loadProducts();
        if(unmappedItems.length > 0) showMapping(); else alert(`Обновлено: ${updated} шт.`);
    }

    function showMapping() {
        mapList.innerHTML = '';
        const names = [...new Set(unmappedItems.map(x => x.name))].slice(0, 10);
        if(names.length === 0) return;
        const opts = `<option value="">-- Пропустить --</option>` + allProducts.map(p => `<option value="${p.id}">${p.sku} ${p.name}</option>`).join('');
        names.forEach(n => {
            const item = unmappedItems.find(x => x.name === n);
            const div = document.createElement('div');
            div.className = 'p-2 bg-light border rounded';
            div.innerHTML = `<div class="fw-bold text-truncate" title="${n}">${n}</div>
                <div class="d-flex gap-2 align-items-center mt-1"><span class="badge bg-secondary">${item.qty}</span>
                <select class="form-select form-select-sm map-select" data-name="${n}">${opts}</select></div>`;
            mapList.appendChild(div);
        });
        mapModal.show();
    }

    if(btnSaveMapping) btnSaveMapping.onclick = async () => {
        const selects = document.querySelectorAll('.map-select');
        btnSaveMapping.disabled = true;
        for(const sel of selects) {
            if(sel.value) {
                const p = allProducts.find(x => String(x.id) === sel.value);
                const n = sel.dataset.name;
                if(p) {
                    p.excel_alias = n;
                    const it = unmappedItems.find(x => x.name === n);
                    if(it) p.stock_qty = it.qty;
                    await fetch(`${API_URL}/${p.id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(p) });
                }
            }
        }
        btnSaveMapping.disabled = false;
        mapModal.hide();
        await loadProducts();
        alert('Сохранено');
    };

    searchInput?.addEventListener('input', applyLogic);
    searchClear?.addEventListener('click',()=>{
        searchInput.value='';
        searchClear.hidden=true;
        applyLogic();
        searchInput.focus();
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

        await loadProducts();
    }

    if (addBtn) addBtn.onclick = () => openModal();
    initPermissionsAndLoad();
});


