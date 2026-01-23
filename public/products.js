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
    
    // Характеристики
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
    
    // НАСТРОЙКИ СОРТИРОВКИ И ФИЛЬТРА
    let sortMode = 'sku'; // 'sku', 'stock_desc', 'stock_asc'
    let filterMode = 'all'; // 'all', 'liquid', 'illiquid'

    // --- ВНЕДРЕНИЕ ПРОСТОГО МЕНЮ (Сортировка + Фильтр) ---
    function injectSimpleControls() {
        const searchBlock = searchInput.closest('.sticky-filters');
        if(!searchBlock || document.getElementById('simple-controls')) return;

        const controls = document.createElement('div');
        controls.id = 'simple-controls';
        controls.className = 'mt-2 d-flex gap-2';
        
        controls.innerHTML = `
            <select id="sort-select" class="form-select form-select-sm border-secondary-subtle" style="width: 50%">
                <option value="sku">🔤 По артикулу (А-Я)</option>
                <option value="stock_desc">📉 По остатку (Много &rarr; Мало)</option>
                <option value="stock_asc">📈 По остатку (Мало &rarr; Много)</option>
            </select>
            <select id="filter-select" class="form-select form-select-sm border-secondary-subtle" style="width: 50%">
                <option value="all">👁️ Все товары</option>
                <option value="liquid">✅ Только Ликвид</option>
                <option value="illiquid">❌ Только Неликвид</option>
            </select>
        `;
        searchBlock.appendChild(controls);

        // Слушатели событий
        document.getElementById('sort-select').onchange = (e) => {
            sortMode = e.target.value;
            applyLogic();
        };
        document.getElementById('filter-select').onchange = (e) => {
            filterMode = e.target.value;
            applyLogic();
        };
    }

    async function loadProducts() {
        try {
            listContainer.innerHTML = '<p class="text-center text-muted p-5">Загрузка...</p>';
            const res = await fetch(API_URL);
            if (!res.ok) throw new Error('Ошибка');
            allProducts = await res.json();
            
            injectSimpleControls();
            applyLogic();
        } catch (e) {
            console.error(e);
            listContainer.innerHTML = '<p class="text-center text-danger mt-4">Ошибка загрузки</p>';
        }
    }

    // --- ГЛАВНАЯ ЛОГИКА (Фильтр + Сортировка) ---
    function applyLogic() {
        const term = searchInput.value.toLowerCase();
        
        // 1. Фильтрация
        let filtered = allProducts.filter(p => {
            // Поиск
            const matchSearch = (p.name && p.name.toLowerCase().includes(term)) || 
                                (p.sku && p.sku.toLowerCase().includes(term));
            if(!matchSearch) return false;

            // Фильтр ликвидности
            if (filterMode === 'liquid' && p.is_liquid === false) return false;
            if (filterMode === 'illiquid' && p.is_liquid !== false) return false;

            return true;
        });

        // 2. Сортировка
        filtered.sort((a, b) => {
            if (sortMode === 'sku') {
                return (a.sku || '').localeCompare(b.sku || '');
            } else if (sortMode === 'stock_desc') {
                return (b.stock_qty || 0) - (a.stock_qty || 0);
            } else if (sortMode === 'stock_asc') {
                return (a.stock_qty || 0) - (b.stock_qty || 0);
            }
        });

        renderList(filtered);
    }

    // --- ОТРИСОВКА СПИСКА (КРАСИВАЯ, как просили) ---
    function renderList(products) {
        totalLabel.textContent = `Найдено: ${products.length}`;
        if (products.length === 0) {
            listContainer.innerHTML = '<p class="text-center text-muted mt-4">Список пуст</p>';
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

    // --- МОДАЛКА ---
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
            try { await fetch(`${API_URL}/${id}`, { method: 'DELETE' }); loadProducts(); modal.hide(); } catch(e) { alert('Ошибка удаления'); }
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

    // --- IMPORT EXCEL ---
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

    searchInput.addEventListener('input', applyLogic);
    addBtn.onclick = () => openModal();
    if(resetBtn) resetBtn.onclick = () => { if(!confirm('Очистить весь каталог?')) return; alert('Функция временно отключена'); };

    loadProducts();
});
