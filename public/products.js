// --- АВТОРИЗАЦИЯ ---
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
// -------------------

document.addEventListener('DOMContentLoaded', () => {
    
    const API_URL = '/api/products';
    
    // Элементы
    const listContainer = document.getElementById('products-list-container'); 
    const searchInput = document.getElementById('product-search');
    const totalLabel = document.getElementById('total-count');
    
    // Импорт Excel
    const btnImport = document.getElementById('btn-import-excel');
    const fileInput = document.getElementById('excel-upload-input');
    
    // Модалка товара
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
    const inpIsLiquid = document.getElementById('prod_is_liquid');
    const inpExcelAlias = document.getElementById('excel_alias');
    
    // Характеристики
    const inpClass = document.getElementById('char_class');
    const inpThickness = document.getElementById('char_thickness');
    const inpBevel = document.getElementById('char_bevel');
    const inpSize = document.getElementById('char_size');
    const inpWeight = document.getElementById('package_weight');
    const inpPkgArea = document.getElementById('package_area');
    const inpPkgQty = document.getElementById('package_qty');

    // Модалка маппинга
    const mapModalEl = document.getElementById('mapping-modal');
    const mapModal = new bootstrap.Modal(mapModalEl);
    const mapContainer = document.getElementById('mapping-container');
    const btnSaveMap = document.getElementById('btn-save-mapping');

    let allProducts = [];
    let unmappedItems = []; // Очередь на привязку

    async function loadProducts() {
        try {
            const res = await fetch(API_URL);
            if (!res.ok) throw new Error('Ошибка загрузки');
            allProducts = await res.json();
            
            // Сортировка: сначала ликвидные, потом по имени
            allProducts.sort((a, b) => {
                if (a.is_liquid !== false && b.is_liquid === false) return -1;
                if (a.is_liquid === false && b.is_liquid !== false) return 1;
                return (a.name || '').localeCompare(b.name || '');
            });

            renderList(allProducts);
        } catch (e) {
            console.error(e);
            listContainer.innerHTML = '<div class="text-danger text-center p-3">Не удалось загрузить товары</div>';
        }
    }

    function renderList(products) {
        totalLabel.textContent = products.length;
        if (products.length === 0) {
            listContainer.innerHTML = '<div class="text-center text-muted p-4">Каталог пуст</div>';
            return;
        }

        listContainer.innerHTML = products.map(p => {
            // Классы для цвета (зеленый/красный)
            const isLiquid = p.is_liquid !== false; // по умолчанию true
            const rowClass = isLiquid ? 'product-liquid' : 'product-illiquid';
            const icon = isLiquid ? '<i class="bi bi-check-circle-fill text-success"></i>' : '<i class="bi bi-x-circle-fill text-danger"></i>';
            
            // Сборка строки характеристик
            const chars = [];
            if(p.characteristics) {
                const c = p.characteristics;
                if(c.class) chars.push(`${c.class} кл`);
                if(c.thickness) chars.push(`${c.thickness} мм`);
                if(c.bevel) chars.push(`${c.bevel}`);
                if(c.package_area) chars.push(`Уп: ${c.package_area} м²`);
            }
            const charHtml = chars.map(t => `<span class="char-tag">${t}</span>`).join('');

            // Остаток
            let stockHtml = '';
            if (p.stock_qty !== undefined && p.stock_qty !== null) {
                const qty = parseFloat(p.stock_qty);
                const color = qty > 20 ? 'bg-success' : (qty > 0 ? 'bg-warning text-dark' : 'bg-secondary');
                stockHtml = `<span class="badge ${color} rounded-pill stock-badge">${qty.toFixed(2)} м²</span>`;
            }

            return `
            <div class="card shadow-sm border-0 ${rowClass}" onclick="openModal('${p.id}')" style="cursor:pointer; transition: transform 0.1s;">
                <div class="card-body p-2 d-flex justify-content-between align-items-center">
                    <div class="flex-grow-1" style="min-width: 0;">
                        <div class="d-flex align-items-center gap-2 mb-1">
                            <span class="fw-bold text-truncate" style="font-size: 1rem;">${safe(p.name)}</span>
                            ${!isLiquid ? '<span class="badge bg-danger-subtle text-danger" style="font-size:0.6rem">НЕЛИКВИД</span>' : ''}
                        </div>
                        
                        <div class="text-muted small mb-1" style="font-size: 0.8rem; font-family: monospace;">
                            ${safe(p.sku)}
                        </div>

                        <div>${charHtml}</div>
                    </div>
                    
                    <div class="ms-2 d-flex flex-column align-items-end gap-1">
                       ${stockHtml}
                       <i class="bi bi-chevron-right text-muted small"></i>
                    </div>
                </div>
            </div>`;
        }).join('');
    }

    // --- МОДАЛКА И ФОРМА ---
    window.openModal = (id) => {
        form.reset();
        btnDelete.style.display = 'none';
        
        if (id) {
            const p = allProducts.find(x => String(x.id) === String(id));
            if (!p) return;
            
            inpId.value = p.id;
            inpSku.value = p.sku || '';
            inpName.value = p.name || '';
            inpIsLiquid.checked = p.is_liquid !== false;
            inpExcelAlias.value = p.excel_alias || '';
            
            // Характеристики
            if (p.characteristics) {
                const c = p.characteristics;
                inpClass.value = c.class || '';
                inpThickness.value = c.thickness || '';
                inpBevel.value = c.bevel || '';
                inpSize.value = c.size || '';
                inpWeight.value = c.weight || '';
                inpPkgArea.value = c.package_area || '';
                inpPkgQty.value = c.package_qty || '';
            }

            modalTitle.textContent = 'Редактировать товар';
            btnDelete.style.display = 'block';
            btnDelete.onclick = () => deleteProduct(p.id);
        } else {
            inpId.value = '';
            modalTitle.textContent = 'Новый товар';
            inpIsLiquid.checked = true;
        }
        modal.show();
    };

    // --- СОХРАНЕНИЕ ---
    form.onsubmit = async (e) => {
        e.preventDefault();
        
        const characteristics = {
            class: inpClass.value.trim(),
            thickness: inpThickness.value.trim(),
            bevel: inpBevel.value.trim(),
            size: inpSize.value.trim(),
            weight: inpWeight.value.trim(),
            package_area: inpPkgArea.value.trim(),
            package_qty: inpPkgQty.value.trim()
        };

        const data = { 
            sku: inpSku.value.trim(), 
            name: inpName.value.trim(),
            is_liquid: inpIsLiquid.checked,
            excel_alias: inpExcelAlias.value.trim(),
            characteristics: characteristics
        };

        const id = inpId.value;
        let url = API_URL;
        let method = 'POST';
        if (id) { url = `${API_URL}/${id}`; method = 'PUT'; }

        try {
            const btn = form.querySelector('button[type="submit"]');
            btn.disabled = true; 
            
            const res = await fetch(url, { method: method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) });
            if (res.ok) { await loadProducts(); modal.hide(); } else { alert('Ошибка сохранения'); }
            
            btn.disabled = false;
        } catch (e) { alert(e.message); }
    };

    window.deleteProduct = async (id) => {
        if(confirm('Удалить этот товар?')) {
            try { await fetch(`${API_URL}/${id}`, { method: 'DELETE' }); loadProducts(); modal.hide(); } catch(e) { alert('Ошибка'); }
        }
    };

    // --- ИМПОРТ EXCEL (ОСТАТКИ) ---
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
                const worksheet = workbook.Sheets[sheetName];
                const json = XLSX.utils.sheet_to_json(worksheet, {header: 1}); // Массив массивов
                processExcelData(json);
            } catch (err) {
                alert("Ошибка чтения файла: " + err.message);
            }
            fileInput.value = ''; // сброс
        };
        reader.readAsArrayBuffer(file);
    };

    async function processExcelData(rows) {
        // 1. Ищем заголовки
        let headerRowIdx = -1;
        let colNameIdx = -1;
        let colStockIdx = -1;

        for (let i = 0; i < Math.min(rows.length, 10); i++) {
            const row = rows[i];
            for (let j = 0; j < row.length; j++) {
                const cell = String(row[j]).toLowerCase();
                if (cell.includes('номенклатура') || cell.includes('наименование')) colNameIdx = j;
                if (cell.includes('остаток') || cell.includes('свободный')) colStockIdx = j;
            }
            if (colNameIdx !== -1 && colStockIdx !== -1) {
                headerRowIdx = i;
                break;
            }
        }

        if (headerRowIdx === -1) return alert("Не найдены колонки 'Номенклатура' и 'Остаток'");

        unmappedItems = [];
        let updatesCount = 0;

        // 2. Проходим по данным
        for (let i = headerRowIdx + 1; i < rows.length; i++) {
            const row = rows[i];
            const nameRaw = String(row[colNameIdx] || '').trim();
            const stockRaw = parseFloat(row[colStockIdx]);

            if (!nameRaw || isNaN(stockRaw)) continue;

            // Поиск товара в CRM
            // Приоритет: 1. excel_alias (точное), 2. name (точное), 3. SKU входит в название Excel (опасно, но эффективно)
            let product = allProducts.find(p => p.excel_alias === nameRaw);
            
            if (!product) {
                product = allProducts.find(p => p.name.toLowerCase() === nameRaw.toLowerCase());
            }
            
            if (!product && nameRaw.length > 5) {
                // Попытка найти по артикулу внутри длинного названия
                product = allProducts.find(p => p.sku && p.sku.length > 2 && nameRaw.includes(p.sku));
            }

            if (product) {
                // Нашли -> обновляем остаток
                if (product.stock_qty !== stockRaw) {
                    await updateStock(product.id, stockRaw);
                    updatesCount++;
                }
            } else {
                // Не нашли -> в очередь на маппинг
                unmappedItems.push({ name: nameRaw, qty: stockRaw });
            }
        }

        await loadProducts(); // Обновить интерфейс

        if (unmappedItems.length > 0) {
            showMappingModal();
        } else {
            alert(`Готово! Обновлено товаров: ${updatesCount}`);
        }
    }

    async function updateStock(id, qty) {
        // Отправляем на сервер только остаток (оптимизация)
        // Если API не умеет PATCH, шлем весь объект (тут упрощено, предполагаем что API умный или мы шлем только stock_qty)
        // Для надежности читаем текущий объект, меняем qty и шлем PUT
        const p = allProducts.find(x => x.id === id);
        if(p) {
            p.stock_qty = qty;
            await fetch(`${API_URL}/${id}`, { 
                method: 'PUT', 
                headers: {'Content-Type': 'application/json'}, 
                body: JSON.stringify(p) 
            });
        }
    }

    // --- ПРИВЯЗКА (MAPPING) ---
    function showMappingModal() {
        mapContainer.innerHTML = '';
        // Берем только уникальные названия, чтобы не дублировать
        const uniqueNames = [...new Set(unmappedItems.map(i => i.name))];
        
        // Ограничим 10 штук за раз, чтобы не зависало
        const chunk = uniqueNames.slice(0, 10); 
        
        if (chunk.length === 0) return;

        // Генерация списка опций для Select
        const optionsHtml = `<option value="">-- Не выбрано (Пропустить) --</option>` + 
            allProducts.map(p => `<option value="${p.id}">${p.sku} - ${p.name}</option>`).join('');

        chunk.forEach((excelName, idx) => {
            // Найдем примерное кол-во для справки
            const sampleItem = unmappedItems.find(i => i.name === excelName);
            
            const div = document.createElement('div');
            div.className = 'p-2 border rounded bg-light';
            div.innerHTML = `
                <div class="mb-1 fw-bold text-truncate" title="${excelName}">${excelName}</div>
                <div class="d-flex gap-2 align-items-center">
                    <span class="badge bg-secondary">${sampleItem.qty}</span>
                    <select class="form-select form-select-sm map-select" data-excel-name="${excelName}">
                        ${optionsHtml}
                    </select>
                </div>
            `;
            mapContainer.appendChild(div);
        });

        // Если осталось больше, пишем "и еще X..."
        if (uniqueNames.length > 10) {
            mapContainer.innerHTML += `<div class="text-center text-muted small mt-2">...и еще ${uniqueNames.length - 10} позиций (загрузите их следующим этапом)</div>`;
        }

        mapModal.show();
    }

    btnSaveMap.onclick = async () => {
        const selects = document.querySelectorAll('.map-select');
        let savedCount = 0;
        
        btnSaveMap.disabled = true;
        btnSaveMap.innerHTML = 'Сохранение...';

        for (const sel of selects) {
            const prodId = sel.value;
            const excelName = sel.dataset.excelName;
            
            if (prodId) {
                const p = allProducts.find(x => String(x.id) === String(prodId));
                if (p) {
                    // 1. Сохраняем Alias
                    p.excel_alias = excelName;
                    
                    // 2. Ищем правильный остаток для этого имени
                    const item = unmappedItems.find(i => i.name === excelName);
                    if (item) p.stock_qty = item.qty;

                    await fetch(`${API_URL}/${p.id}`, { 
                        method: 'PUT', 
                        headers: {'Content-Type': 'application/json'}, 
                        body: JSON.stringify(p) 
                    });
                    savedCount++;
                }
            }
        }

        btnSaveMap.disabled = false;
        btnSaveMap.innerHTML = 'Сохранить связи';
        mapModal.hide();
        await loadProducts();
        alert(`Привязано товаров: ${savedCount}. Попробуйте загрузить файл еще раз, чтобы обновить остальные.`);
    };

    // --- Search ---
    searchInput.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        const filtered = allProducts.filter(p => 
            (p.name && p.name.toLowerCase().includes(term)) || 
            (p.sku && p.sku.toLowerCase().includes(term))
        );
        renderList(filtered);
    });

    addBtn.onclick = () => openModal();
    if(resetBtn) resetBtn.onclick = async () => {
        if(!confirm('Очистить ВЕСЬ каталог?')) return;
        // Тут логика очистки, если API позволяет, или заглушка
        alert('Функция отключена для безопасности');
    };

    function safe(str) { return (str || '').replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

    loadProducts();
});
