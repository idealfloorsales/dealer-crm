// --- АВТОРИЗАЦИЯ ---
const originalFetch = window.fetch;
window.fetch = async function (url, options) {
    options = options || {};
    options.headers = options.headers || {};
    const token = localStorage.getItem('crm_token');
    if (token) options.headers['Authorization'] = 'Bearer ' + token;
    
    const response = await originalFetch(url, options);
    if (response.status === 401 || response.status === 403) {
        window.location.href = '/login.html';
    }
    return response;
};
// -------------------

document.addEventListener('DOMContentLoaded', () => {
    
    const API_URL = '/api/products';
    
    // Элементы
    const listContainer = document.getElementById('products-list-container'); 
    const searchInput = document.getElementById('product-search');
    const totalLabel = document.getElementById('total-count');
    
    // Модалка
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
    const mapModalEl = document.getElementById('mapping-modal');
    const mapModal = new bootstrap.Modal(mapModalEl);
    const mapList = document.getElementById('mapping-list');
    const btnSaveMapping = document.getElementById('btn-save-mapping');

    let allProducts = [];
    let unmappedItems = [];
    
    // Состояние фильтров
    let filterState = {
        liquidOnly: false,
        inStockOnly: false,
        class: '',
        thickness: ''
    };

    // --- ВСТАВКА ФИЛЬТРОВ (ДИНАМИЧЕСКИ) ---
    function injectFilters() {
        const searchBlock = searchInput.closest('.sticky-filters'); // Ищем блок с поиском
        if(!searchBlock) return;
        
        // Создаем контейнер для фильтров, если его нет
        let filterRow = document.getElementById('dynamic-filters');
        if(!filterRow) {
            filterRow = document.createElement('div');
            filterRow.id = 'dynamic-filters';
            filterRow.className = 'd-flex gap-2 overflow-auto pb-2 mt-2';
            filterRow.style.whiteSpace = 'nowrap';
            // Вставляем ПОСЛЕ инпута поиска
            searchBlock.appendChild(filterRow);
        }

        // HTML кнопок фильтров
        filterRow.innerHTML = `
            <button class="btn btn-sm rounded-pill ${filterState.liquidOnly ? 'btn-success' : 'btn-outline-secondary'}" onclick="toggleFilter('liquidOnly')">
                <i class="bi bi-check-circle me-1"></i>Только активные
            </button>
            <button class="btn btn-sm rounded-pill ${filterState.inStockOnly ? 'btn-warning text-dark' : 'btn-outline-secondary'}" onclick="toggleFilter('inStockOnly')">
                <i class="bi bi-box-seam me-1"></i>В наличии
            </button>
            
            <select class="form-select form-select-sm rounded-pill d-inline-block w-auto border-secondary" style="min-width: 100px;" onchange="setFilter('class', this.value)">
                <option value="">Все классы</option>
                <option value="32">32 класс</option>
                <option value="33">33 класс</option>
                <option value="34">34 класс</option>
            </select>

             <select class="form-select form-select-sm rounded-pill d-inline-block w-auto border-secondary" style="min-width: 100px;" onchange="setFilter('thickness', this.value)">
                <option value="">Любая толщина</option>
                <option value="8">8 мм</option>
                <option value="10">10 мм</option>
                <option value="12">12 мм</option>
            </select>
        `;
    }

    // Глобальные функции для онкликов
    window.toggleFilter = (key) => {
        filterState[key] = !filterState[key];
        injectFilters(); // Перерисовать кнопки (чтобы цвет сменился)
        applyFilters();  // Применить логику
    };

    window.setFilter = (key, val) => {
        filterState[key] = val;
        applyFilters();
    };

    // --- ЗАГРУЗКА ---
    async function loadProducts() {
        try {
            listContainer.innerHTML = '<p class="text-center text-muted p-5">Загрузка...</p>';
            const res = await fetch(API_URL);
            if (!res.ok) throw new Error('Ошибка загрузки');
            allProducts = await res.json();
            
            // Первичная сортировка
            allProducts.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            
            injectFilters(); // Рисуем фильтры
            applyFilters();  // Рисуем список
        } catch (e) {
            console.error(e);
            listContainer.innerHTML = '<p class="text-center text-danger mt-4">Не удалось загрузить товары</p>';
        }
    }

    // --- ЛОГИКА ФИЛЬТРАЦИИ ---
    function applyFilters() {
        const term = searchInput.value.toLowerCase();
        
        const filtered = allProducts.filter(p => {
            // 1. Поиск
            const matchSearch = (p.name && p.name.toLowerCase().includes(term)) || 
                                (p.sku && p.sku.toLowerCase().includes(term));
            if(!matchSearch) return false;

            // 2. Ликвидность
            if(filterState.liquidOnly && p.is_liquid === false) return false;

            // 3. Наличие (> 5 м2)
            if(filterState.inStockOnly && (!p.stock_qty || p.stock_qty < 5)) return false;

            // 4. Характеристики (Класс / Толщина)
            if(p.characteristics) {
                const c = p.characteristics;
                if(filterState.class && (!c.class || !c.class.includes(filterState.class))) return false;
                if(filterState.thickness && (!c.thickness || !c.thickness.includes(filterState.thickness))) return false;
            } else {
                // Если характеристик нет вообще, а фильтр включен - скрываем
                if(filterState.class || filterState.thickness) return false;
            }

            return true;
        });

        renderList(filtered);
    }

    // --- ОТРИСОВКА СПИСКА (КРАСИВАЯ) ---
    function renderList(products) {
        totalLabel.textContent = `Найдено: ${products.length} шт`;
        if (products.length === 0) {
            listContainer.innerHTML = '<p class="text-center text-muted mt-4">Ничего не найдено</p>';
            return;
        }

        listContainer.innerHTML = products.map(p => {
            const isLiquid = p.is_liquid !== false; 
            const rowClass = isLiquid ? 'row-liquid' : 'row-illiquid';
            const opacity = isLiquid ? '' : 'opacity-75';

            // Характеристики
            let details = [];
            if(p.characteristics) {
                const c = p.characteristics;
                if(c.class) details.push(`${c.class} кл`);
                if(c.thickness) details.push(`${c.thickness} мм`);
                if(c.size) details.push(c.size);
                if(c.bevel) details.push(c.bevel);
                
                let pack = [];
                if(c.package_area) pack.push(`${c.package_area} м²`);
                if(c.package_qty) pack.push(`${c.package_qty} шт`);
                if(pack.length > 0) details.push(`(${pack.join('/')})`);
                
                if(c.weight) details.push(`${c.weight} кг`);
            }
            const detailsStr = details.join(', ');

            // Остаток
            let stockHtml = '';
            if (p.stock_qty !== undefined && p.stock_qty !== null) {
                const qty = parseFloat(p.stock_qty);
                const color = qty > 20 ? 'text-success' : (qty > 0 ? 'text-warning' : 'text-secondary');
                stockHtml = `<div class="ms-3 ${color} fw-bold text-nowrap fs-6">${qty.toFixed(2)} м²</div>`;
            }

            return `
            <div class="bg-white p-2 rounded-3 shadow-sm border border-light mb-2 d-flex align-items-center justify-content-between ${rowClass} ${opacity}" onclick="openModal('${p.id}')" style="cursor:pointer; min-height: 55px;">
                
                <div style="overflow: hidden; flex-grow: 1;">
                    <div class="d-flex align-items-center gap-2 mb-1">
                        <span class="badge bg-secondary text-white fw-normal font-monospace" style="font-size: 0.85rem;">${p.sku || '???'}</span>
                        <h6 class="mb-0 fw-bold text-dark text-truncate" style="font-size: 0.95rem;">${p.name || 'Без названия'}</h6>
                        ${!isLiquid ? '<span class="badge bg-danger p-1" style="font-size:0.6rem">СТОП</span>' : ''}
                    </div>

                    <div class="text-muted small text-truncate" style="font-size: 0.85rem; padding-left: 2px;">
                        ${detailsStr || '<span class="opacity-50">Нет характеристик</span>'}
                    </div>
                </div>

                <div class="d-flex align-items-center">
                    ${stockHtml}
                    <i class="bi bi-chevron-right text-muted ms-3 small"></i>
                </div>
            </div>`;
        }).join('');
    }

    // --- МОДАЛКА (РЕДАКТИРОВАНИЕ) ---
    window.openModal = (id) => {
        form.reset();
        if(btnDelete) btnDelete.style.display = 'none';
        
        if (id) {
            const p = allProducts.find(x => String(x.id) === String(id));
            if(p) {
                inpId.value = p.id;
                inpSku.value = p.sku || '';
                inpName.value = p.name || '';
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

                modalTitle.textContent = 'Редактировать товар';
                if(btnDelete) {
                    btnDelete.style.display = 'block';
                    btnDelete.onclick = () => deleteProduct(p.id);
                }
            }
        } else {
            inpId.value = '';
            modalTitle.textContent = 'Новый товар';
            if(inpLiquid) inpLiquid.checked = true;
        }
        modal.show();
    };

    window.deleteProduct = async (id) => {
        if(confirm('Удалить этот товар?')) {
            try { 
                await fetch(`${API_URL}/${id}`, { method: 'DELETE' }); 
                loadProducts(); 
                modal.hide(); 
            } catch(e) { alert('Ошибка удаления'); }
        }
    };

    // --- СОХРАНЕНИЕ ---
    if(form) {
        form.onsubmit = async (e) => {
            e.preventDefault();
            
            const chars = {
                class: charClass ? charClass.value.trim() : '',
                thickness: charThick ? charThick.value.trim() : '',
                bevel: charBevel ? charBevel.value.trim() : '',
                size: charSize ? charSize.value.trim() : '',
                package_area: pkgArea ? pkgArea.value.trim() : '',
                package_qty: pkgQty ? pkgQty.value.trim() : '',
                weight: pkgWeight ? pkgWeight.value.trim() : ''
            };

            const data = { 
                sku: inpSku.value.trim(), 
                name: inpName.value.trim(),
                is_liquid: inpLiquid ? inpLiquid.checked : true,
                excel_alias: inpAlias ? inpAlias.value.trim() : '',
                characteristics: chars
            };

            const id = inpId.value;
            let url = API_URL;
            let method = 'POST';
            if (id) { url = `${API_URL}/${id}`; method = 'PUT'; }

            try {
                const btn = form.querySelector('button[type="submit"]');
                const oldText = btn.innerHTML;
                btn.disabled = true; btn.innerHTML = '...';
                
                const res = await fetch(url, { method: method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) });
                if (res.ok) { await loadProducts(); modal.hide(); } else { alert('Ошибка сохранения.'); }
                
                btn.disabled = false; btn.innerHTML = oldText;
            } catch (e) { 
                alert('Ошибка сети'); 
                const btn = form.querySelector('button[type="submit"]');
                if(btn) btn.disabled = false;
            }
        };
    }

    // --- ИМПОРТ EXCEL ---
    if(btnImport) btnImport.onclick = () => { if(fileInput) fileInput.click(); };

    if(fileInput) fileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
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

        unmappedItems = [];
        let updated = 0;

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
            } else {
                unmappedItems.push({ name, qty: stock });
            }
        }

        await loadProducts();
        
        if(unmappedItems.length > 0) showMapping();
        else alert(`Обновлено: ${updated} шт.`);
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
            div.innerHTML = `
                <div class="fw-bold text-truncate" title="${n}">${n}</div>
                <div class="d-flex gap-2 align-items-center mt-1">
                    <span class="badge bg-secondary">${item.qty}</span>
                    <select class="form-select form-select-sm map-select" data-name="${n}">${opts}</select>
                </div>`;
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

    // --- ПОИСК ---
    searchInput.addEventListener('input', applyFilters); // Теперь при вводе сразу фильтруем с учетом кнопок

    addBtn.onclick = () => openModal();
    
    if(resetBtn) resetBtn.onclick = () => {
        if(!confirm('Очистить весь каталог?')) return;
        alert('Функция временно отключена');
    };

    loadProducts();
});
