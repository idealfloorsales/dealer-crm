document.addEventListener('DOMContentLoaded', () => {
    const API_URL = '/api/competitors-ref';
    
    // Элементы страницы
    const gridContainer = document.getElementById('competitors-grid');
    const searchInput = document.getElementById('search-input');
    const filterType = document.getElementById('filter-type');
    const addBtn = document.getElementById('add-comp-btn');
    const exportBtn = document.getElementById('export-comp-btn');
    const dashboardContainer = document.getElementById('comp-dashboard');

    // Модалка и Форма
    const modalEl = document.getElementById('comp-modal');
    // Используем static backdrop, чтобы не закрывалось случайно
    const modal = new bootstrap.Modal(modalEl, { backdrop: 'static', keyboard: false });
    const form = document.getElementById('comp-form');
    const modalTitle = document.getElementById('comp-modal-title');
    const delBtn = document.getElementById('btn-delete-comp');

    // Поля внутри модалки (Контейнеры списков)
    const collectionsContainer = document.getElementById('collections-container');
    const addCollRowBtn = document.getElementById('add-coll-row-btn');
    const contactsContainer = document.getElementById('comp-contacts-list');
    const addContactBtn = document.getElementById('btn-add-contact');

    // Инпуты
    const inpId = document.getElementById('comp_id');
    const inpName = document.getElementById('comp_name');
    const inpCountry = document.getElementById('comp_country');
    const inpSupplier = document.getElementById('comp_supplier');
    const inpWarehouse = document.getElementById('comp_warehouse');
    const inpInfo = document.getElementById('comp_info');
    const inpStorage = document.getElementById('comp_storage');
    const inpStock = document.getElementById('comp_stock');
    const inpReserve = document.getElementById('comp_reserve');

    // Типы коллекций (цвета)
    const collectionTypes = [
        { val: 'std', label: 'Стандарт', badgeClass: 'type-std' },
        { val: 'eng', label: 'Англ. Елка', badgeClass: 'type-eng' },
        { val: 'fr', label: 'Фр. Елка', badgeClass: 'type-fr' },
        { val: 'art', label: 'Художественный', badgeClass: 'type-art' },
        { val: 'art_eng', label: 'Худ. Англ.', badgeClass: 'type-art-eng' },
        { val: 'art_fr', label: 'Худ. Фр.', badgeClass: 'type-art-fr' },
        { val: 'mix', label: 'Худ. Микс', badgeClass: 'type-mix' }
    ];

    // Словарь для экспорта
    const typeLabels = {
        'std': 'Стандарт', 'eng': 'Англ. Елка', 'fr': 'Фр. Елка',
        'art': 'Художественный', 'art_eng': 'Худ. Английская', 'art_fr': 'Худ. Французская', 'mix': 'Худ. Микс'
    };

    let competitors = [];
    let isSaving = false; // Защита от дублей

    // --- 1. ЗАГРУЗКА ---
    async function loadList() {
        try {
            const res = await fetch(API_URL);
            if(res.ok) {
                competitors = await res.json();
                renderDashboard();
                renderGrid();
            }
        } catch(e) { 
            if(gridContainer) gridContainer.innerHTML = '<p class="text-danger p-5 text-center">Ошибка загрузки</p>'; 
        }
    }

    // --- 2. ДАШБОРД ---
    function renderDashboard() {
        if (!dashboardContainer) return;

        const totalBrands = competitors.length;
        let totalCols = 0;
        let countEng = 0;
        let countFr = 0;
        let countArt = 0;

        competitors.forEach(c => {
            (c.collections || []).forEach(col => {
                totalCols++;
                const t = (typeof col === 'string') ? 'std' : (col.type || 'std');
                if (t.includes('eng')) countEng++;
                if (t.includes('fr') || t.includes('french')) countFr++;
                if (t.includes('art') || t.includes('mix')) countArt++;
            });
        });

        dashboardContainer.innerHTML = `
            <div class="col-md-3 col-6">
                <div class="stat-card h-100 py-3">
                    <span class="stat-number">${totalBrands}</span>
                    <span class="stat-label">Брендов</span>
                </div>
            </div>
            <div class="col-md-3 col-6">
                <div class="stat-card h-100 py-3">
                    <span class="stat-number">${totalCols}</span>
                    <span class="stat-label">Коллекций</span>
                </div>
            </div>
            <div class="col-md-3 col-6">
                <div class="stat-card h-100 py-3 border-success" style="border-bottom-width: 3px;">
                    <span class="stat-number text-success">${countEng + countFr}</span>
                    <span class="stat-label">Елочка</span>
                    <small class="text-muted" style="font-size:0.75em; font-weight:500;">Англ: ${countEng} | Фр: ${countFr}</small>
                </div>
            </div>
            <div class="col-md-3 col-6">
                <div class="stat-card h-100 py-3 border-warning" style="border-bottom-width: 3px;">
                    <span class="stat-number text-warning text-dark">${countArt}</span>
                    <span class="stat-label">Художественный</span>
                </div>
            </div>
        `;
    }

    // --- 3. РЕНДЕР СЕТКИ (С ПОИСКОМ) ---
    function renderGrid() {
        const search = searchInput ? searchInput.value.toLowerCase() : '';
        const filter = filterType ? filterType.value : 'all';

        const filtered = competitors.filter(c => {
            const matchSearch = !search || 
                c.name.toLowerCase().includes(search) || 
                (c.supplier || '').toLowerCase().includes(search) ||
                (c.warehouse || '').toLowerCase().includes(search) ||
                (c.country || '').toLowerCase().includes(search);
            
            let matchFilter = true;
            if (filter === 'eng' || filter === 'fr') { 
                 matchFilter = c.collections && c.collections.some(col => (col.type || 'std').includes(filter));
            } else if (filter === 'art') {
                 matchFilter = c.collections && c.collections.some(col => (col.type || 'std').includes('art'));
            }

            return matchSearch && matchFilter;
        });

        if (filtered.length === 0) {
            if(gridContainer) gridContainer.innerHTML = '<div class="col-12 text-center text-muted mt-5">Ничего не найдено</div>';
            return;
        }

        if(gridContainer) {
            gridContainer.innerHTML = filtered.map(c => {
                // Бейджи для лицевой стороны
                const typesSet = new Set();
                (c.collections || []).forEach(col => {
                    const t = (typeof col === 'string') ? 'std' : (col.type || 'std');
                    if (t !== 'std') typesSet.add(t);
                });
                
                let frontBadges = '';
                typesSet.forEach(type => {
                    const typeInfo = collectionTypes.find(x => x.val === type);
                    if (typeInfo) frontBadges += `<span class="col-badge ${typeInfo.badgeClass}" style="font-size: 0.7rem;">${typeInfo.label}</span>`;
                });

                // Список для обратной стороны
                const listHtml = (c.collections || []).map(col => {
                    const name = (typeof col === 'string') ? col : col.name;
                    const type = (typeof col === 'string') ? 'std' : (col.type || 'std');
                    const typeInfo = collectionTypes.find(x => x.val === type) || collectionTypes[0];
                    
                    let dotColor = '#ccc';
                    if(type.includes('eng')) dotColor = '#198754';
                    else if(type.includes('fr')) dotColor = '#0d6efd';
                    else if(type.includes('art')) dotColor = '#ffc107';

                    return `
                    <div class="comp-collection-item">
                        <span>${name}</span>
                        <span class="badge rounded-pill text-dark" style="font-size:0.65rem; border:1px solid #eee; background-color:rgba(0,0,0,0.05)">
                            <span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:${dotColor}; margin-right:4px;"></span>
                            ${typeInfo.label}
                        </span>
                    </div>`;
                }).join('');

                return `
                <div class="col-md-6 col-lg-4 col-xl-3">
                    <div class="comp-card" id="card-${c.id}" onclick="toggleCard('${c.id}')">
                        <button class="btn-card-edit" onclick="event.stopPropagation(); openEditModal('${c.id}')" title="Редактировать"><i class="bi bi-pencil"></i></button>
                        
                        <div class="comp-card-front">
                            <div class="comp-card-header">
                                <div class="comp-card-title">${c.name}</div>
                                ${c.country ? `<span class="badge bg-light text-dark border fw-normal">${c.country}</span>` : ''}
                            </div>

                            <div class="comp-card-supplier text-muted mb-2">
                                <i class="bi bi-box-seam me-1"></i> ${c.supplier || '-'}<br>
                                <i class="bi bi-geo-alt me-1"></i> ${c.warehouse || '-'}
                            </div>
                            <div class="mt-auto">
                                ${frontBadges}
                                <div class="text-primary small mt-2 fw-bold">
                                    <i class="bi bi-list-ul"></i> Показать коллекции (${(c.collections || []).length})
                                </div>
                            </div>
                        </div>

                        <div class="comp-card-back">
                            <div class="d-flex justify-content-between align-items-center mb-2">
                                <h6 class="mb-0 fw-bold text-truncate">${c.name}</h6>
                                <button class="btn btn-sm btn-close" onclick="event.stopPropagation(); toggleCard('${c.id}')"></button>
                            </div>
                            <div class="comp-card-list">
                                ${listHtml || '<p class="text-muted text-center my-3">Нет коллекций</p>'}
                            </div>
                        </div>
                    </div>
                </div>`;
            }).join('');
        }
    }

    window.toggleCard = (id) => {
        const card = document.getElementById(`card-${id}`);
        if (card) {
            document.querySelectorAll('.comp-card.show-collections').forEach(c => { if(c !== card) c.classList.remove('show-collections'); });
            card.classList.toggle('show-collections');
        }
    };

    // --- 4. МОДАЛЬНОЕ ОКНО ---
    window.openEditModal = (id) => {
        const c = competitors.find(x => x.id === id);
        if (!c) return;

        inpId.value = c.id;
        modalTitle.textContent = `${c.name}`;
        if(delBtn) delBtn.style.display = 'block';
        
        inpName.value = c.name;
        if(inpCountry) inpCountry.value = c.country || '';
        inpSupplier.value = c.supplier || '';
        inpWarehouse.value = c.warehouse || '';
        inpInfo.value = c.info || '';
        inpStorage.value = c.storage_days || '';
        inpStock.value = c.stock_info || '';
        inpReserve.value = c.reserve_days || '';

        collectionsContainer.innerHTML = '';
        if (c.collections && c.collections.length > 0) {
            c.collections.forEach(col => {
                if (typeof col === 'string') addCollectionRow(col, 'std');
                else addCollectionRow(col.name, col.type);
            });
        } else { addCollectionRow(); }

        contactsContainer.innerHTML = '';
        if (c.contacts && c.contacts.length > 0) {
            c.contacts.forEach(cnt => addContactRow(cnt.name, cnt.position, cnt.phone));
        } else { addContactRow(); }

        modal.show();
    };

    if(addBtn) {
        addBtn.onclick = () => {
            inpId.value = '';
            form.reset();
            modalTitle.textContent = 'Новый Бренд';
            if(delBtn) delBtn.style.display = 'none';
            
            collectionsContainer.innerHTML = '';
            contactsContainer.innerHTML = '';
            addCollectionRow();
            addContactRow();
            
            modal.show();
        };
    }

    // --- 5. КОНСТРУКТОРЫ СТРОК (С РАБОЧИМ УДАЛЕНИЕМ) ---
    
    function addCollectionRow(name = '', type = 'std') {
        const div = document.createElement('div');
        div.className = 'input-group mb-2 collection-row';
        let options = collectionTypes.map(t => `<option value="${t.val}" ${t.val === type ? 'selected' : ''}>${t.label}</option>`).join('');
        // ВАЖНО: onclick="this.closest(...) remove()"
        div.innerHTML = `
            <input type="text" class="form-control coll-name" placeholder="Название" value="${name}" required>
            <select class="form-select coll-type" style="max-width: 160px;">${options}</select>
            <button type="button" class="btn btn-outline-danger" onclick="this.closest('.collection-row').remove()">×</button>
        `;
        collectionsContainer.appendChild(div);
    }

    function addContactRow(name='', pos='', phone='') {
        const div = document.createElement('div');
        div.className = 'comp-contact-row mb-2'; 
        div.style.display = 'grid';
        div.style.gridTemplateColumns = '1fr 1fr 1fr auto';
        div.style.gap = '5px';
        // ВАЖНО: onclick="this.closest(...) remove()"
        div.innerHTML = `
            <input type="text" class="form-control cont-name" placeholder="Имя" value="${name}">
            <input type="text" class="form-control cont-pos" placeholder="Должность" value="${pos}">
            <input type="text" class="form-control cont-phone" placeholder="Телефон" value="${phone}">
            <button type="button" class="btn btn-outline-danger" onclick="this.closest('.comp-contact-row').remove()">×</button>
        `;
        contactsContainer.appendChild(div);
    }

    if(addCollRowBtn) addCollRowBtn.onclick = () => addCollectionRow();
    if(addContactBtn) addContactBtn.onclick = () => addContactRow();

    // --- 6. СОХРАНЕНИЕ (С ЗАЩИТОЙ) ---
    if(form) {
        form.onsubmit = async (e) => {
            e.preventDefault();
            
            if(isSaving) return;
            isSaving = true;
            
            // Ищем кнопку через форму
            const submitBtn = form.querySelector('button[type="submit"]');
            const oldText = submitBtn.innerHTML;
            submitBtn.disabled = true; 
            submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';

            const collectionsData = [];
            document.querySelectorAll('.collection-row').forEach(row => {
                const name = row.querySelector('.coll-name').value.trim();
                const type = row.querySelector('.coll-type').value;
                if (name) collectionsData.push({ name, type });
            });

            const contactsData = [];
            document.querySelectorAll('.comp-contact-row').forEach(row => {
                const name = row.querySelector('.cont-name').value.trim();
                const pos = row.querySelector('.cont-pos').value.trim();
                const phone = row.querySelector('.cont-phone').value.trim();
                if (name || phone) contactsData.push({ name, position: pos, phone });
            });

            const data = {
                name: inpName.value,
                country: inpCountry ? inpCountry.value : '',
                supplier: inpSupplier.value,
                warehouse: inpWarehouse.value,
                info: inpInfo.value,
                storage_days: inpStorage.value,
                stock_info: inpStock.value,
                reserve_days: inpReserve.value,
                collections: collectionsData,
                contacts: contactsData
            };

            const id = inpId.value;
            let url = API_URL;
            let method = 'POST';
            if (id) { url = `${API_URL}/${id}`; method = 'PUT'; }

            try {
                const res = await fetch(url, { method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) });
                if (res.ok) { 
                    await loadList(); 
                    if(!id) {
                        modal.hide(); 
                        alert('Бренд добавлен!');
                    } else {
                        document.getElementById('comp-modal-title').textContent = data.name;
                        modal.hide();
                    }
                }
            } catch (e) { alert('Ошибка сохранения'); }
            finally {
                isSaving = false;
                submitBtn.disabled = false;
                submitBtn.innerHTML = oldText;
            }
        };
    }

    // --- УДАЛЕНИЕ ---
    if(delBtn) {
        delBtn.onclick = async () => {
            const id = inpId.value;
            if (!id) return;
            if (confirm('Удалить этот бренд?')) {
                await fetch(`${API_URL}/${id}`, { method: 'DELETE' });
                modal.hide();
                loadList();
            }
        };
    }

    if(searchInput) searchInput.addEventListener('input', renderGrid);
    if(filterType) filterType.addEventListener('change', renderGrid);

    // --- 7. ЭКСПОРТ (ПЛОСКИЙ ФОРМАТ) ---
    if(exportBtn) {
        exportBtn.onclick = () => {
            if (!competitors.length) return alert("Список пуст");

            const clean = (text) => `"${String(text || '').replace(/"/g, '""')}"`;
            let csv = "\uFEFFБренд;Страна;Коллекция;Вид (Тип);Поставщик;Склад;Контакты;Инфо\n";

            competitors.forEach(c => {
                const contactsStr = (c.contacts || []).map(cnt => `${cnt.name} (${cnt.phone})`).join(', ');
                
                const brandPart = `${clean(c.name)};${clean(c.country)}`;
                const tailPart = `${clean(c.supplier)};${clean(c.warehouse)};${clean(contactsStr)};${clean(c.info)}`;

                if (c.collections && c.collections.length > 0) {
                    c.collections.forEach(col => {
                        const colName = (typeof col === 'string') ? col : col.name;
                        const colTypeVal = (typeof col === 'string') ? 'std' : col.type;
                        const colTypeLabel = typeLabels[colTypeVal] || colTypeVal;

                        csv += `${brandPart};${clean(colName)};${clean(colTypeLabel)};${tailPart}\n`;
                    });
                } else {
                    // Если коллекций нет, просто бренд
                    csv += `${brandPart};;;${tailPart}\n`;
                }
            });

            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Competitors_Ref_${new Date().toISOString().slice(0,10)}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        };
    }

    loadList();
});
