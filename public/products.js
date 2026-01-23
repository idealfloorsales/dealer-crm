// --- АВТОРИЗАЦИЯ (ВСТАВИТЬ В НАЧАЛО ФАЙЛА) ---
const originalFetch = window.fetch;
window.fetch = async function (url, options) {
    options = options || {};
    options.headers = options.headers || {};
    const token = localStorage.getItem('crm_token');
    if (token) options.headers['Authorization'] = 'Bearer ' + token;
    const response = await originalFetch(url, options);
    if (response.status === 401) window.location.href = '/login.html';
    return response;
};
// -------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
    
    const API_URL = '/api/products';
    
    // Элементы
    const listContainer = document.getElementById('products-list-container'); 
    const searchInput = document.getElementById('product-search');
    const totalLabel = document.getElementById('total-count');
    
    // Импорт
    const btnImport = document.getElementById('btn-import');
    const fileInput = document.getElementById('excel-input');
    
    // Модалка
    const modalEl = document.getElementById('product-modal');
    const modal = new bootstrap.Modal(modalEl, { backdrop: 'static', keyboard: false });
    const form = document.getElementById('product-form');
    const modalTitle = document.getElementById('product-modal-title');
    const btnDelete = document.getElementById('btn-delete-prod');
    
    const addBtn = document.getElementById('add-product-btn');
    const resetBtn = document.getElementById('reset-catalog-btn'); 
    
    // Поля формы
    const inpId = document.getElementById('prod_id');
    const inpSku = document.getElementById('prod_sku');
    const inpName = document.getElementById('prod_name');
    const inpLiquid = document.getElementById('prod_liquid');
    const inpAlias = document.getElementById('prod_alias');
    
    // Характеристики
    const charClass = document.getElementById('char_class');
    const charThick = document.getElementById('char_thick');
    const charBevel = document.getElementById('char_bevel');
    const charSize = document.getElementById('char_size');
    const pkgArea = document.getElementById('pkg_area');
    const pkgQty = document.getElementById('pkg_qty');
    const pkgWeight = document.getElementById('pkg_weight');

    // Маппинг
    const mapModalEl = document.getElementById('mapping-modal');
    const mapModal = new bootstrap.Modal(mapModalEl);
    const mapList = document.getElementById('mapping-list');
    const btnSaveMap = document.getElementById('btn-save-mapping');

    let allProducts = [];
    let unmappedItems = [];

    async function loadProducts() {
        try {
            const res = await fetch(API_URL);
            if (!res.ok) throw new Error('Ошибка загрузки');
            allProducts = await res.json();
            
            // Сортировка: Ликвидные сверху, потом по имени
            allProducts.sort((a, b) => {
                if (a.is_liquid !== false && b.is_liquid === false) return -1;
                if (a.is_liquid === false && b.is_liquid !== false) return 1;
                return a.name.localeCompare(b.name);
            });

            renderList(allProducts);
        } catch (e) {
            listContainer.innerHTML = '<div class="text-danger text-center p-3">Ошибка сети</div>';
        }
    }

    function renderList(products) {
        totalLabel.textContent = products.length;
        if (products.length === 0) {
            listContainer.innerHTML = '<div class="text-center text-muted p-4">Нет товаров</div>';
            return;
        }

        listContainer.innerHTML = products.map(p => {
            const isLiquid = p.is_liquid !== false; 
            const cssClass = isLiquid ? 'prod-liquid' : 'prod-illiquid';
            
            // Сборка характеристик
            let charsHtml = '';
            if (p.characteristics) {
                const c = p.characteristics;
                if(c.class) charsHtml += `<span class="char-tag">${c.class} кл</span>`;
                if(c.thickness) charsHtml += `<span class="char-tag">${c.thickness} мм</span>`;
                if(c.bevel) charsHtml += `<span class="char-tag">${c.bevel}</span>`;
                if(c.package_area) charsHtml += `<span class="char-tag">Уп: ${c.package_area}</span>`;
            }

            // Остаток
            let stockHtml = '';
            if (p.stock_qty !== undefined && p.stock_qty !== null) {
                const qty = parseFloat(p.stock_qty);
                const color = qty > 20 ? 'text-success' : (qty > 0 ? 'text-warning' : 'text-muted');
                stockHtml = `<div class="${color} stock-display">${qty.toFixed(2)} м²</div>`;
            }

            return `
            <div class="card shadow-sm border-0 mb-0 ${cssClass}" onclick="openModal('${p.id}')" style="cursor:pointer;">
                <div class="card-body p-2 d-flex justify-content-between align-items-center">
                    <div style="min-width: 0;">
                        <div class="d-flex align-items-center gap-2">
                            <span class="fw-bold text-truncate" style="font-size: 0.95rem;">${safe(p.name)}</span>
                            ${!isLiquid ? '<span class="badge bg-danger" style="font-size:0.6rem">СТОП</span>' : ''}
                        </div>
                        <div class="text-muted small font-monospace mb-1">${safe(p.sku)}</div>
                        <div class="d-flex flex-wrap">${charsHtml}</div>
                    </div>
                    <div class="d-flex flex-column align-items-end ps-2">
                        ${stockHtml}
                        <i class="bi bi-chevron-right text-muted small mt-1"></i>
                    </div>
                </div>
            </div>`;
        }).join('');
    }

    // --- МОДАЛКА ---
    window.openModal = (id) => {
        form.reset();
        btnDelete.style.display = 'none';
        document.getElementById('alias-block').classList.remove('show');
        
        if (id) {
            const p = allProducts.find(x => String(x.id) === String(id));
            if (!p) return;
            
            inpId.value = p.id;
            inpSku.value = p.sku || '';
            inpName.value = p.name || '';
            inpLiquid.checked = p.is_liquid !== false;
            inpAlias.value = p.excel_alias || '';
            if(p.excel_alias) document.getElementById('alias-block').classList.add('show');

            if (p.characteristics) {
                const c = p.characteristics;
                charClass.value = c.class || '';
                charThick.value = c.thickness || '';
                charBevel.value = c.bevel || '';
                charSize.value = c.size || '';
                pkgArea.value = c.package_area || '';
                pkgQty.value = c.package_qty || '';
                pkgWeight.value = c.weight || '';
            }

            modalTitle.textContent = 'Редактировать';
            btnDelete.style.display = 'block';
            btnDelete.onclick = () => deleteProduct(p.id);
        } else {
            inpId.value = '';
            modalTitle.textContent = 'Новый товар';
            inpLiquid.checked = true;
        }
        modal.show();
    };

    window.deleteProduct = async (id) => {
        if(confirm('Удалить этот товар?')) {
            try { await fetch(`${API_URL}/${id}`, { method: 'DELETE' }); loadProducts(); modal.hide(); } catch(e) { alert('Ошибка'); }
        }
    };

    // --- СОХРАНЕНИЕ ---
    if(form) {
        form.onsubmit = async (e) => {
            e.preventDefault();
            
            const chars = {
                class: charClass.value.trim(),
                thickness: charThick.value.trim(),
                bevel: charBevel.value.trim(),
                size: charSize.value.trim(),
                package_area: pkgArea.value.trim(),
                package_qty: pkgQty.value.trim(),
                weight: pkgWeight.value.trim()
            };

            const data = { 
                sku: inpSku.value.trim(), 
                name: inpName.value.trim(),
                is_liquid: inpLiquid.checked,
                excel_alias: inpAlias.value.trim(),
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
                if (res.ok) { await loadProducts(); modal.hide(); } else { alert('Ошибка сохранения'); }
                
                btn.disabled = false; btn.innerHTML = oldText;
            } catch (e) { alert(e.message); }
        };
    }

    // --- ЛОГИКА EXCEL ---
    btnImport.onclick = () => fileInput.click();

    fileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const data = new Uint8Array(evt.target.result);
                const workbook = XLSX.read(data, {type: 'array'});
                const sheetName = workbook.SheetNames[0];
                const sheet = workbook.Sheets[sheetName];
                const json = XLSX.utils.sheet_to_json(sheet, {header: 1});
                processExcel(json);
            } catch (err) { alert("Ошибка чтения: " + err.message); }
            fileInput.value = '';
        };
        reader.readAsArrayBuffer(file);
    };

    async function processExcel(rows) {
        let headerIdx = -1;
        let colName = -1;
        let colStock = -1;

        // Поиск заголовков
        for (let i = 0; i < Math.min(rows.length, 20); i++) {
            const row = rows[i];
            for (let j = 0; j < row.length; j++) {
                const val = String(row[j]).toLowerCase();
                if (val.includes('номенклатура') || val.includes('наименование')) colName = j;
                if (val === 'остаток' || val.includes('свободный')) colStock = j;
            }
            if (colName !== -1 && colStock !== -1) {
                headerIdx = i;
                break;
            }
        }

        if (headerIdx === -1) return alert('Не найдены колонки "Номенклатура" и "Остаток"');

        unmappedItems = [];
        let updatedCount = 0;

        for (let i = headerIdx + 1; i < rows.length; i++) {
            const row = rows[i];
            const nameRaw = String(row[colName] || '').trim();
            const stockVal = parseFloat(row[colStock]);

            if (!nameRaw || isNaN(stockVal)) continue;

            // 1. Ищем по Alias (ранее сохраненная связь)
            let product = allProducts.find(p => p.excel_alias === nameRaw);
            // 2. Ищем по точному имени
            if (!product) product = allProducts.find(p => p.name.toLowerCase() === nameRaw.toLowerCase());
            // 3. Ищем по SKU внутри строки (если SKU > 3 символов)
            if (!product) product = allProducts.find(p => p.sku && p.sku.length > 3 && nameRaw.includes(p.sku));

            if (product) {
                if (product.stock_qty !== stockVal) {
                    product.stock_qty = stockVal;
                    // Обновляем в базе
                    await fetch(`${API_URL}/${product.id}`, { 
                        method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(product) 
                    });
                    updatedCount++;
                }
            } else {
                unmappedItems.push({ name: nameRaw, qty: stockVal });
            }
        }

        await loadProducts();

        if (unmappedItems.length > 0) {
            showMappingModal();
        } else {
            alert(`Успешно! Обновлено: ${updatedCount} товаров.`);
        }
    }

    function showMappingModal() {
        mapList.innerHTML = '';
        const uniqueNames = [...new Set(unmappedItems.map(i => i.name))];
        // Ограничим вывод, чтобы не тормозило
        const chunk = uniqueNames.slice(0, 10);

        if (chunk.length === 0) return;

        const opts = `<option value="">-- Пропустить --</option>` + 
            allProducts.map(p => `<option value="${p.id}">${p.sku} - ${p.name}</option>`).join('');

        chunk.forEach(excelName => {
            const item = unmappedItems.find(i => i.name === excelName);
            const div = document.createElement('div');
            div.className = 'p-2 bg-light border rounded';
            div.innerHTML = `
                <div class="fw-bold text-truncate mb-1" title="${excelName}">${excelName}</div>
                <div class="d-flex align-items-center gap-2">
                    <span class="badge bg-secondary">${item.qty}</span>
                    <select class="form-select form-select-sm map-select" data-excel-name="${excelName}">
                        ${opts}
                    </select>
                </div>
            `;
            mapList.appendChild(div);
        });

        if(uniqueNames.length > 10) mapList.innerHTML += `<div class="text-center text-muted small">...и еще ${uniqueNames.length - 10} шт.</div>`;
        mapModal.show();
    }

    btnSaveMap.onclick = async () => {
        const selects = document.querySelectorAll('.map-select');
        btnSaveMap.disabled = true; btnSaveMap.innerHTML = '...';

        for (const sel of selects) {
            const prodId = sel.value;
            const excelName = sel.dataset.excelName;
            if (prodId) {
                const product = allProducts.find(p => String(p.id) === String(prodId));
                if (product) {
                    product.excel_alias = excelName; // Запоминаем связь
                    const item = unmappedItems.find(i => i.name === excelName);
                    if(item) product.stock_qty = item.qty; // И ставим остаток
                    
                    await fetch(`${API_URL}/${product.id}`, { 
                        method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(product) 
                    });
                }
            }
        }

        btnSaveMap.disabled = false; btnSaveMap.innerHTML = 'Сохранить';
        mapModal.hide();
        await loadProducts();
        alert('Связи сохранены! Если остались непривязанные, загрузите файл снова.');
    };

    // --- ПОИСК ---
    searchInput.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        const filtered = allProducts.filter(p => 
            p.name.toLowerCase().includes(term) || (p.sku && p.sku.toLowerCase().includes(term))
        );
        renderList(filtered);
    });

    addBtn.onclick = () => openModal();
    if(resetBtn) resetBtn.onclick = () => { if(confirm('Сбросить весь каталог?')) alert('Функция отключена'); };

    function safe(str) { return (str || '').replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

    loadProducts();
});
