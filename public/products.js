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
    
    // Модалка
    const modalEl = document.getElementById('product-modal');
    const modal = new bootstrap.Modal(modalEl, { backdrop: 'static', keyboard: false });
    const form = document.getElementById('product-form');
    const modalTitle = document.getElementById('product-modal-title');
    
    const addBtn = document.getElementById('add-product-btn');
    const resetBtn = document.getElementById('reset-catalog-btn'); 
    
    // Поля формы (Старые + Новые)
    const inpId = document.getElementById('prod_id');
    const inpSku = document.getElementById('prod_sku');
    const inpName = document.getElementById('prod_name');
    const btnDelete = document.getElementById('btn-delete-prod'); // Кнопка удаления

    // Новые поля
    const inpLiquid = document.getElementById('prod_liquid');
    const inpAlias = document.getElementById('prod_alias');
    const charClass = document.getElementById('char_class');
    const charThick = document.getElementById('char_thick');
    const charBevel = document.getElementById('char_bevel');
    const charSize = document.getElementById('char_size');
    const pkgArea = document.getElementById('pkg_area');
    const pkgQty = document.getElementById('pkg_qty');
    const pkgWeight = document.getElementById('pkg_weight');

    // Excel элементы
    const btnImport = document.getElementById('btn-import');
    const fileInput = document.getElementById('excel-input');
    const mapModalEl = document.getElementById('mapping-modal');
    const mapModal = new bootstrap.Modal(mapModalEl);
    const mapList = document.getElementById('mapping-list');
    const btnSaveMapping = document.getElementById('btn-save-mapping');

    let allProducts = [];
    let unmappedItems = [];

    async function loadProducts() {
        try {
            listContainer.innerHTML = '<p class="text-center text-muted p-5">Загрузка...</p>';
            const res = await fetch(API_URL);
            if (!res.ok) throw new Error('Ошибка');
            allProducts = await res.json();
            
            // Сортировка: Ликвидные сверху
            allProducts.sort((a, b) => {
                if (a.is_liquid !== false && b.is_liquid === false) return -1;
                if (a.is_liquid === false && b.is_liquid !== false) return 1;
                return (a.name||'').localeCompare(b.name||'');
            });
            renderList(allProducts);
        } catch (e) {
            listContainer.innerHTML = '<p class="text-center text-danger mt-4">Ошибка загрузки</p>';
        }
    }

    function renderList(products) {
        totalLabel.textContent = `Всего товаров: ${products.length}`;
        if (products.length === 0) {
            listContainer.innerHTML = '<p class="text-center text-muted mt-4">Список пуст</p>';
            return;
        }

        listContainer.innerHTML = products.map(p => {
            const isLiquid = p.is_liquid !== false; 
            const rowClass = isLiquid ? 'row-liquid' : 'row-illiquid';
            
            // Сборка характеристик
            let charsHtml = '';
            if(p.characteristics) {
                const c = p.characteristics;
                if(c.class) charsHtml += `<span class="char-tag">${c.class} кл</span>`;
                if(c.thickness) charsHtml += `<span class="char-tag">${c.thickness} мм</span>`;
                if(c.package_area) charsHtml += `<span class="char-tag">Уп: ${c.package_area} м²</span>`;
            }

            // Остаток
            let stockHtml = '';
            if (p.stock_qty !== undefined && p.stock_qty !== null) {
                const qty = parseFloat(p.stock_qty);
                const color = qty > 20 ? 'text-success' : (qty > 0 ? 'text-warning' : 'text-secondary');
                stockHtml = `<div class="ms-2 ${color} stock-badge">${qty.toFixed(2)} м²</div>`;
            }

            return `
            <div class="bg-white p-3 rounded-4 shadow-sm border border-light d-flex justify-content-between align-items-center ${rowClass}" onclick="openModal('${p.id}')" style="cursor:pointer;">
                <div style="overflow: hidden;">
                    <div class="d-flex align-items-center gap-2">
                        <h6 class="mb-0 fw-bold text-truncate">${p.name || ''}</h6>
                        ${!isLiquid ? '<span class="badge bg-danger" style="font-size:0.6rem">СТОП</span>' : ''}
                    </div>
                    <div class="text-muted small mb-1">${p.sku || ''}</div>
                    <div class="d-flex flex-wrap">${charsHtml}</div>
                </div>
                <div class="d-flex align-items-center">
                    ${stockHtml}
                    <i class="bi bi-chevron-right text-muted ms-3"></i>
                </div>
            </div>`;
        }).join('');
    }

    window.openModal = (id) => {
        form.reset();
        if(btnDelete) btnDelete.style.display = 'none';
        document.getElementById('alias-block').classList.remove('show');
        
        if (id) {
            const p = allProducts.find(x => String(x.id) === String(id));
            if(p) {
                inpId.value = p.id;
                inpSku.value = p.sku;
                inpName.value = p.name;
                
                // New Fields Population
                inpLiquid.checked = p.is_liquid !== false;
                inpAlias.value = p.excel_alias || '';
                if(p.excel_alias) document.getElementById('alias-block').classList.add('show');

                if(p.characteristics) {
                    const c = p.characteristics;
                    charClass.value = c.class || '';
                    charThick.value = c.thickness || '';
                    charBevel.value = c.bevel || '';
                    charSize.value = c.size || '';
                    pkgArea.value = c.package_area || '';
                    pkgQty.value = c.package_qty || '';
                    pkgWeight.value = c.weight || '';
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
            inpLiquid.checked = true;
        }
        modal.show();
    };

    window.deleteProduct = async (id) => {
        if(confirm('Удалить этот товар?')) {
            try { await fetch(`${API_URL}/${id}`, { method: 'DELETE' }); loadProducts(); modal.hide(); } catch(e) { alert('Ошибка'); }
        }
    };

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
                if (res.ok) { await loadProducts(); modal.hide(); } else { alert('Ошибка.'); }
                
                btn.disabled = false; btn.innerHTML = oldText;
            } catch (e) { alert('Ошибка сети'); }
        };
    }

    // --- IMPORT EXCEL ---
    if(btnImport) btnImport.onclick = () => fileInput.click();

    if(fileInput) fileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
            const data = new Uint8Array(evt.target.result);
            const wb = XLSX.read(data, {type: 'array'});
            const ws = wb.Sheets[wb.SheetNames[0]];
            const json = XLSX.utils.sheet_to_json(ws, {header: 1});
            processExcel(json);
            fileInput.value = '';
        };
        reader.readAsArrayBuffer(file);
    };

    async function processExcel(rows) {
        let hIdx = -1, cName = -1, cStock = -1;
        for(let i=0; i<Math.min(rows.length, 20); i++) {
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
        else alert(`Обновлено ${updated} товаров`);
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

    btnSaveMapping.onclick = async () => {
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

    // --- Search ---
    searchInput.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        const filtered = allProducts.filter(p => p.name.toLowerCase().includes(term) || (p.sku && p.sku.toLowerCase().includes(term)));
        renderList(filtered);
    });

    addBtn.onclick = () => openModal();
    if(resetBtn) resetBtn.onclick = async () => {
        if(!confirm('Очистить весь каталог?')) return;
        alert('Функция отключена');
    };

    function safe(str) { return (str || '').replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

    loadProducts();
});
