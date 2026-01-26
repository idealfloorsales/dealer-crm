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
    let filterMode = 'all'; 
    
    // Текущий товар в калькуляторе
    let calcCurrentProduct = null;

    // --- ВНЕДРЕНИЕ КОНТРОЛОВ ---
    function injectSimpleControls() {
        const searchBlock = searchInput.closest('.sticky-filters');
        if(!searchBlock || document.getElementById('simple-controls')) return;

        const controls = document.createElement('div');
        controls.id = 'simple-controls';
        controls.className = 'mt-2 d-flex gap-2';
        
        controls.innerHTML = `
            <select id="sort-select" class="form-select form-select-sm text-secondary bg-light border-0" style="font-weight: 500;">
                <option value="sku">Сортировка: Артикул (А-Я)</option>
                <option value="stock_desc">По остатку (Убывание)</option>
                <option value="stock_asc">По остатку (Возрастание)</option>
            </select>
            <select id="filter-select" class="form-select form-select-sm text-secondary bg-light border-0" style="font-weight: 500;">
                <option value="all">Все товары</option>
                <option value="liquid">Только Ликвид</option>
                <option value="illiquid">Только Неликвид</option>
            </select>
        `;
        searchBlock.appendChild(controls);

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
            listContainer.innerHTML = '<div class="text-center text-muted py-5">Загрузка...</div>';
            const res = await fetch(API_URL);
            if (!res.ok) throw new Error('Ошибка');
            allProducts = await res.json();
            
            injectSimpleControls();
            applyLogic();
        } catch (e) {
            listContainer.innerHTML = '<div class="text-center text-danger py-4">Ошибка загрузки данных</div>';
        }
    }

    function applyLogic() {
        const term = searchInput.value.toLowerCase();
        
        let filtered = allProducts.filter(p => {
            const matchSearch = (p.name && p.name.toLowerCase().includes(term)) || 
                                (p.sku && p.sku.toLowerCase().includes(term));
            if(!matchSearch) return false;

            if (filterMode === 'liquid' && p.is_liquid === false) return false;
            if (filterMode === 'illiquid' && p.is_liquid !== false) return false;

            return true;
        });

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

    // --- ОТРИСОВКА (С ОБЩИМ ОСТАТКОМ) ---
    function renderList(products) {
        // 1. Считаем сумму остатков
        const totalStock = products.reduce((sum, p) => sum + (parseFloat(p.stock_qty) || 0), 0);
        
        // 2. Красиво форматируем число (например: 1 200.50)
        const formattedStock = totalStock.toLocaleString('ru-RU', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });

        // 3. Обновляем верхнюю надпись
        if (products.length === 0) {
            totalLabel.innerHTML = '<span class="text-muted">Ничего не найдено</span>';
            listContainer.innerHTML = '<div class="text-center text-muted py-4">Список пуст</div>';
            return;
        } else {
            totalLabel.innerHTML = `
                <span class="text-secondary">Позиций:</span> <span class="fw-bold text-dark">${products.length}</span>
                <span class="mx-2 text-muted opacity-25">|</span>
                <span class="text-secondary">Общий остаток:</span> <span class="fw-bold text-success">${formattedStock} м²</span>
            `;
        }

        // 4. Рисуем сам список
        listContainer.innerHTML = products.map(p => {
            const isLiquid = p.is_liquid !== false; 
            const bgClass = isLiquid ? 'bg-white' : 'bg-light';
            const textOpacity = isLiquid ? '' : 'text-muted';

            let details = [];
            let packArea = 0; 

            if(p.characteristics) {
                const c = p.characteristics;
                if(c.class) details.push(`${c.class} кл`);
                if(c.thickness) details.push(`${c.thickness} мм`);
                if(c.size) details.push(c.size);
                if(c.bevel) details.push(c.bevel);
                
                let pack = [];
                if(c.package_area) {
                    pack.push(`${c.package_area} м²`);
                    packArea = parseFloat(c.package_area);
                }
                if(c.package_qty) pack.push(`${c.package_qty} шт`);
                if(pack.length > 0) details.push(`(${pack.join('/')})`);
                
                if(c.weight) details.push(`${c.weight} кг`);
            }
            const detailsStr = details.join(', ');

            let stockHtml = '';
            if (p.stock_qty !== undefined && p.stock_qty !== null) {
                const qty = parseFloat(p.stock_qty);
                const colorClass = qty > 20 ? 'text-success' : (qty > 0 ? 'text-warning' : 'text-secondary');
                stockHtml = `<span class="${colorClass} fw-bold" style="font-size: 0.9rem;">${qty.toFixed(2)} м²</span>`;
            }

            // Кнопка калькулятора (только если есть м2 упаковки)
            const calcBtn = packArea > 0 
                ? `<button class="btn btn-sm btn-light border ms-2 text-primary" onclick="openCalc(event, '${p.id}')" title="Калькулятор"><i class="bi bi-calculator"></i></button>`
                : '';

            return `
            <div class="${bgClass} p-3 rounded-4 shadow-sm border border-light mb-2 d-flex align-items-center justify-content-between" onclick="openModal('${p.id}')" style="cursor:pointer; min-height: 60px;">
                <div style="overflow: hidden; flex-grow: 1;">
                    <div class="d-flex align-items-center gap-2 mb-1">
                        <span class="badge bg-light text-secondary border border-secondary-subtle fw-normal font-monospace">${p.sku || '---'}</span>
                        <span class="fw-bold text-dark text-truncate ${textOpacity}">${p.name || 'Без названия'}</span>
                        ${!isLiquid ? '<span class="badge bg-danger bg-opacity-10 text-danger border border-danger-subtle" style="font-size:0.65rem">НЕЛИКВИД</span>' : ''}
                    </div>
                    <div class="text-muted small text-truncate" style="font-size: 0.85rem;">
                        ${detailsStr || 'Нет характеристик'}
                    </div>
                </div>

                <div class="d-flex align-items-center ps-2">
                    <div class="d-flex flex-column align-items-end">
                       ${stockHtml}
                    </div>
                    ${calcBtn}
                </div>
            </div>`;
        }).join('');
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
            (p.name && p.name.toLowerCase().includes(val)) || 
            (p.sku && p.sku.toLowerCase().includes(val))
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

                modalTitle.textContent = 'Редактирование';
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
        if(confirm('Удалить товар?')) {
            try { await fetch(`${API_URL}/${id}`, { method: 'DELETE' }); loadProducts(); modal.hide(); } catch(e) { alert('Ошибка'); }
        }
    };

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
                sku: inpSku.value.trim(), name: inpName.value.trim(),
                is_liquid: inpLiquid ? inpLiquid.checked : true,
                excel_alias: inpAlias ? inpAlias.value.trim() : '',
                characteristics: chars
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

    searchInput.addEventListener('input', applyLogic);
    addBtn.onclick = () => openModal();
    if(resetBtn) resetBtn.onclick = () => { if(!confirm('Очистить весь каталог?')) return; alert('Функция временно отключена'); };

    loadProducts();
});

