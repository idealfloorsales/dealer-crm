// script.js
document.addEventListener('DOMContentLoaded', () => {
    const API_DEALERS_URL = '/api/dealers';
    const API_PRODUCTS_URL = '/api/products'; 
    let fullProductCatalog = [];
    let allDealers = [];
    let currentSort = { column: 'name', direction: 'asc' };
    const posMaterialsList = ["Н600 - 600мм наклейка", "Н800 - 800мм наклейка", "РФ-2 - Расческа из фанеры", "РФС-1 - Расческа их фанеры старая", "С600 - 600мм задняя стенка", "С800 - 800мм задняя стенка", "Табличка - Табличка орг.стекло"];

    const addModalEl = document.getElementById('add-modal'); const addModal = new bootstrap.Modal(addModalEl);
    const editModalEl = document.getElementById('edit-modal'); const editModal = new bootstrap.Modal(editModalEl);
    const openAddModalBtn = document.getElementById('open-add-modal-btn');
    const addForm = document.getElementById('add-dealer-form');
    const addProductChecklist = document.getElementById('add-product-checklist'); 
    const addContactList = document.getElementById('add-contact-list'); 
    const addAddressList = document.getElementById('add-address-list'); 
    const addPosList = document.getElementById('add-pos-list'); 
    const addVisitsList = document.getElementById('add-visits-list');
    const addPhotoInput = document.getElementById('add-photo-input');
    const addPhotoPreviewContainer = document.getElementById('add-photo-preview-container');
    const dealerListBody = document.getElementById('dealer-list-body');
    const dealerTable = document.getElementById('dealer-table');
    const noDataMsg = document.getElementById('no-data-msg');
    const filterCity = document.getElementById('filter-city');
    const filterPriceType = document.getElementById('filter-price-type');
    const searchBar = document.getElementById('search-bar'); 
    const exportBtn = document.getElementById('export-dealers-btn'); 
    const dashboardContainer = document.getElementById('dashboard-container'); 
    const tasksList = document.getElementById('tasks-list'); 
    const editForm = document.getElementById('edit-dealer-form');
    const editProductChecklist = document.getElementById('edit-product-checklist'); 
    const editContactList = document.getElementById('edit-contact-list'); 
    const editAddressList = document.getElementById('edit-address-list'); 
    const editPosList = document.getElementById('edit-pos-list'); 
    const editVisitsList = document.getElementById('edit-visits-list');
    const editPhotoList = document.getElementById('edit-photo-list'); 
    const editPhotoInput = document.getElementById('edit-photo-input');
    const editPhotoPreviewContainer = document.getElementById('edit-photo-preview-container');
    let addPhotosData = []; let editPhotosData = [];
    
    const DEFAULT_LAT = 51.1605; const DEFAULT_LNG = 71.4704;
    let addMap, editMap;

    function initMap(mapId) {
        const map = L.map(mapId).setView([DEFAULT_LAT, DEFAULT_LNG], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: 'OSM' }).addTo(map);
        return map;
    }
    function setupMapClick(map, latId, lngId, markerRef) {
        map.on('click', function(e) {
            const lat = e.latlng.lat; const lng = e.latlng.lng;
            document.getElementById(latId).value = lat; document.getElementById(lngId).value = lng;
            if (markerRef.current) markerRef.current.setLatLng([lat, lng]); else markerRef.current = L.marker([lat, lng]).addTo(map);
        });
    }
    addModalEl.addEventListener('shown.bs.modal', () => {
        if (!addMap) { addMap = initMap('add-map'); addModalEl.markerRef = { current: null }; setupMapClick(addMap, 'add_latitude', 'add_longitude', addModalEl.markerRef); } else { addMap.invalidateSize(); }
        if (addModalEl.markerRef && addModalEl.markerRef.current) { addMap.removeLayer(addModalEl.markerRef.current); addModalEl.markerRef.current = null; }
        addMap.setView([DEFAULT_LAT, DEFAULT_LNG], 13);
    });
    editModalEl.addEventListener('shown.bs.modal', () => {
        if (!editMap) { editMap = initMap('edit-map'); editModalEl.markerRef = { current: null }; setupMapClick(editMap, 'edit_latitude', 'edit_longitude', editModalEl.markerRef); } else { editMap.invalidateSize(); }
        const lat = parseFloat(document.getElementById('edit_latitude').value); const lng = parseFloat(document.getElementById('edit_longitude').value);
        if (editModalEl.markerRef.current) editMap.removeLayer(editModalEl.markerRef.current);
        if (!isNaN(lat) && !isNaN(lng)) { editModalEl.markerRef.current = L.marker([lat, lng]).addTo(editMap); editMap.setView([lat, lng], 15); } else { editMap.setView([DEFAULT_LAT, DEFAULT_LNG], 13); }
    });

    const safeText = (text) => text ? text.replace(/</g, "&lt;").replace(/>/g, "&gt;") : '---';
    const toBase64 = file => new Promise((resolve, reject) => { const reader = new FileReader(); reader.readAsDataURL(file); reader.onload = () => resolve(reader.result); reader.onerror = error => reject(error); });
    const compressImage = (file, maxWidth = 1000, quality = 0.7) => new Promise((resolve, reject) => { const reader = new FileReader(); reader.readAsDataURL(file); reader.onload = event => { const img = new Image(); img.src = event.target.result; img.onload = () => { const elem = document.createElement('canvas'); let width = img.width; let height = img.height; if (width > maxWidth) { height *= maxWidth / width; width = maxWidth; } elem.width = width; elem.height = height; const ctx = elem.getContext('2d'); ctx.drawImage(img, 0, 0, width, height); resolve(elem.toDataURL('image/jpeg', quality)); }; img.onerror = error => reject(error); }; reader.onerror = error => reject(error); });

    async function fetchProductCatalog() {
        if (fullProductCatalog.length > 0) return; 
        try {
            const response = await fetch(API_PRODUCTS_URL);
            if (!response.ok) throw new Error(`Ошибка: ${response.status}`);
            fullProductCatalog = await response.json();
            fullProductCatalog.sort((a, b) => a.sku.localeCompare(b.sku, 'ru', { numeric: true }));
        } catch (error) {
            console.error("Ошибка каталога:", error);
            addProductChecklist.innerHTML = `<p class='text-danger'>Ошибка каталога.</p>`;
            editProductChecklist.innerHTML = `<p class='text-danger'>Ошибка каталога.</p>`;
        }
    }

    // --- (ИЗМЕНЕНО) ВЫПОЛНЕНИЕ ЗАДАЧИ ПО ИНДЕКСУ ---
    async function completeTask(btn, dealerId, visitIndex) {
        try {
            btn.disabled = true; 
            btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>'; 

            const res = await fetch(`${API_DEALERS_URL}/${dealerId}`);
            if(!res.ok) throw new Error('Не удалось загрузить данные');
            const dealer = await res.json();

            // Используем индекс массива для точного попадания
            if (dealer.visits && dealer.visits[visitIndex]) {
                dealer.visits[visitIndex].isCompleted = true;
            } else {
                btn.disabled = false; btn.innerHTML = '<i class="bi bi-check-lg"></i>';
                return alert("Ошибка: Задача не найдена (возможно, список изменился). Обновите страницу.");
            }

            await fetch(`${API_DEALERS_URL}/${dealerId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dealer)
            });

            initApp(); 

        } catch (e) {
            alert("Ошибка: " + e.message);
            btn.disabled = false; btn.innerHTML = '<i class="bi bi-check-lg"></i>';
        }
    }

    function renderDashboard() {
        if (!allDealers || allDealers.length === 0) { dashboardContainer.innerHTML = ''; return; }
        
        const totalDealers = allDealers.length;
        const noPhotosCount = allDealers.filter(d => !d.has_photos).length;
        const posCount = allDealers.filter(d => d.has_pos).length;
        const cityCounts = {}; let topCity = "-"; let maxCount = 0;
        allDealers.forEach(d => { if (d.city) { cityCounts[d.city] = (cityCounts[d.city] || 0) + 1; if (cityCounts[d.city] > maxCount) { maxCount = cityCounts[d.city]; topCity = d.city; } } });

        dashboardContainer.innerHTML = `
            <div class="col-md-6 col-lg-3"><div class="stat-card"><i class="bi bi-shop stat-icon text-primary"></i><span class="stat-number">${totalDealers}</span><span class="stat-label">Всего дилеров</span></div></div>
            <div class="col-md-6 col-lg-3"><div class="stat-card ${noPhotosCount > 0 ? 'border-danger' : ''}"><i class="bi bi-camera-fill stat-icon ${noPhotosCount > 0 ? 'text-danger' : 'text-secondary'}"></i><span class="stat-number ${noPhotosCount > 0 ? 'text-danger' : ''}">${noPhotosCount}</span><span class="stat-label">Без фото</span></div></div>
            <div class="col-md-6 col-lg-3"><div class="stat-card"><i class="bi bi-easel stat-icon text-success"></i><span class="stat-number text-success">${posCount}</span><span class="stat-label">С оборудованием</span></div></div>
             <div class="col-md-6 col-lg-3"><div class="stat-card"><i class="bi bi-geo-alt-fill stat-icon text-info"></i><span class="stat-number text-info" style="font-size: 1.5rem;">${topCity}</span><span class="stat-label">Топ регион</span></div></div>
        `;

        if (!tasksList) return;
        const today = new Date(); today.setHours(0,0,0,0);
        const tasks = [];
        
        allDealers.forEach(d => {
            if (d.visits && Array.isArray(d.visits)) {
                d.visits.forEach((v, index) => { // Берем индекс!
                    if (!v.isCompleted) {
                        const vDate = new Date(v.date);
                        const vDateMidnight = new Date(vDate); vDateMidnight.setHours(0,0,0,0);
                        let isOverdue = vDateMidnight < today;
                        let isToday = vDateMidnight.getTime() === today.getTime();
                        
                        // Добавляем задачу только если она сегодня или позже, ИЛИ просрочена
                        if (vDate >= today || isOverdue) {
                            tasks.push({
                                dealerName: d.name,
                                dealerId: d.id,
                                date: vDate,
                                comment: v.comment || "",
                                isOverdue: isOverdue,
                                isToday: isToday,
                                visitIndex: index // (НОВОЕ) Сохраняем индекс визита
                            });
                        }
                    }
                });
            }
        });

        tasks.sort((a, b) => a.date - b.date);

        if (tasks.length === 0) {
            tasksList.innerHTML = `<div class="text-center py-4 text-muted"><i class="bi bi-check2-circle fs-3 d-block mb-2"></i>Задач нет</div>`;
        } else {
            tasksList.innerHTML = tasks.map(t => {
                const dateStr = t.date.toLocaleDateString('ru-RU');
                let itemClass = 'list-group-item-action'; let badgeClass = 'bg-primary'; let badgeText = dateStr;
                if (t.isOverdue) { itemClass += ' list-group-item-danger'; badgeClass = 'bg-danger'; badgeText = `Просрочено: ${dateStr}`; } 
                else if (t.isToday) { itemClass += ' list-group-item-warning'; badgeClass = 'bg-warning text-dark'; badgeText = 'Сегодня'; }
                
                return `
                    <div class="list-group-item ${itemClass} task-item d-flex justify-content-between align-items-center">
                        <div class="me-auto">
                            <div class="d-flex align-items-center mb-1"><span class="badge ${badgeClass} rounded-pill me-2">${badgeText}</span><a href="dealer.html?id=${t.dealerId}" target="_blank" class="fw-bold text-decoration-none text-dark">${t.dealerName}</a></div>
                            <small class="text-muted" style="white-space: pre-wrap;">${safeText(t.comment)}</small>
                        </div>
                        <button class="btn btn-sm btn-success btn-complete-task ms-2" title="Выполнено" 
                                data-id="${t.dealerId}" 
                                data-index="${t.visitIndex}">
                            <i class="bi bi-check-lg"></i>
                        </button>
                    </div>`;
            }).join('');
        }
    }

    if(tasksList) {
        tasksList.addEventListener('click', (e) => {
            const btn = e.target.closest('.btn-complete-task');
            if (btn) {
                completeTask(btn, btn.dataset.id, btn.dataset.index);
            }
        });
    }

    function createContactEntryHTML(c={}) { return `<div class="contact-entry input-group mb-2"><input type="text" class="form-control contact-name" placeholder="Имя" value="${c.name||''}"><input type="text" class="form-control contact-position" placeholder="Должность" value="${c.position||''}"><input type="text" class="form-control contact-info" placeholder="Телефон" value="${c.contactInfo||''}"><button type="button" class="btn btn-outline-danger btn-remove-entry"><i class="bi bi-trash"></i></button></div>`; }
    function createAddressEntryHTML(a={}) { return `<div class="address-entry input-group mb-2"><input type="text" class="form-control address-description" placeholder="Описание" value="${a.description||''}"><input type="text" class="form-control address-city" placeholder="Город" value="${a.city||''}"><input type="text" class="form-control address-address" placeholder="Адрес" value="${a.address||''}"><button type="button" class="btn btn-outline-danger btn-remove-entry"><i class="bi bi-trash"></i></button></div>`; }
    function createPosEntryHTML(p={}) { const opts = posMaterialsList.map(n => `<option value="${n}" ${n===p.name?'selected':''}>${n}</option>`).join(''); return `<div class="pos-entry input-group mb-2"><select class="form-select pos-name"><option value="">-- Выбор --</option>${opts}</select><input type="number" class="form-control pos-quantity" value="${p.quantity||1}" min="1"><button type="button" class="btn btn-outline-danger btn-remove-entry"><i class="bi bi-trash"></i></button></div>`; }
    function createVisitEntryHTML(v={}) { 
        return `<div class="visit-entry input-group mb-2">
            <input type="date" class="form-control visit-date" value="${v.date||''}">
            <input type="text" class="form-control visit-comment w-50" placeholder="Результат визита..." value="${v.comment||''}">
            <input type="hidden" class="visit-completed" value="${v.isCompleted || 'false'}">
            <button type="button" class="btn btn-outline-danger btn-remove-entry"><i class="bi bi-trash"></i></button>
        </div>`; 
    }
    
    function renderPhotoPreviews(container, photosArray) { container.innerHTML = photosArray.map((p, index) => `<div class="photo-preview-item"><img src="${p.photo_url}"><button type="button" class="btn-remove-photo" data-index="${index}">×</button></div>`).join(''); }
    addPhotoInput.addEventListener('change', async (e) => { for (let file of e.target.files) addPhotosData.push({ photo_url: await compressImage(file) }); renderPhotoPreviews(addPhotoPreviewContainer, addPhotosData); addPhotoInput.value = ''; });
    addPhotoPreviewContainer.addEventListener('click', (e) => { if(e.target.classList.contains('btn-remove-photo')) { addPhotosData.splice(e.target.dataset.index, 1); renderPhotoPreviews(addPhotoPreviewContainer, addPhotosData); }});
    editPhotoInput.addEventListener('change', async (e) => { for (let file of e.target.files) editPhotosData.push({ photo_url: await compressImage(file) }); renderPhotoPreviews(editPhotoPreviewContainer, editPhotosData); editPhotoInput.value = ''; });
    editPhotoPreviewContainer.addEventListener('click', (e) => { if(e.target.classList.contains('btn-remove-photo')) { editPhotosData.splice(e.target.dataset.index, 1); renderPhotoPreviews(editPhotoPreviewContainer, editPhotosData); }});

    function collectData(container, selector, fields) {
        const data = [];
        container.querySelectorAll(selector).forEach(entry => {
            const item = {}; let hasData = false;
            fields.forEach(f => { item[f.key] = entry.querySelector(f.class).value; if(item[f.key]) hasData=true; });
            if(hasData) data.push(item);
        });
        return data;
    }
    async function collectPhotos(container) { return Promise.resolve([]); }
    function renderList(container, data, htmlGen) { container.innerHTML = (data && data.length > 0) ? data.map(htmlGen).join('') : htmlGen(); }
    function renderProductChecklist(container, selectedIds=[]) { const set = new Set(selectedIds); container.innerHTML = fullProductCatalog.map(p => `<div class="checklist-item form-check"><input type="checkbox" class="form-check-input" id="prod-${container.id}-${p.id}" value="${p.id}" ${set.has(p.id)?'checked':''}><label class="form-check-label" for="prod-${container.id}-${p.id}"><strong>${p.sku}</strong> - ${p.name}</label></div>`).join(''); }
    function getSelectedProductIds(containerId) { return Array.from(document.getElementById(containerId).querySelectorAll('input:checked')).map(cb=>cb.value); }
    async function saveProducts(dealerId, ids) { await fetch(`${API_DEALERS_URL}/${dealerId}/products`, {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({productIds: ids})}); }

    function renderDealerList() {
        const city = filterCity.value; const type = filterPriceType.value; const search = searchBar.value.toLowerCase();
        const filtered = allDealers.filter(d => (!city||d.city===city) && (!type||d.price_type===type) && (!search || (d.name.toLowerCase().includes(search)||d.dealer_id.toLowerCase().includes(search)||d.organization.toLowerCase().includes(search))));
        filtered.sort((a, b) => {
            let valA = (a[currentSort.column] || '').toString(); let valB = (b[currentSort.column] || '').toString();
            let res = currentSort.column === 'dealer_id' ? valA.localeCompare(valB, undefined, {numeric:true}) : valA.toLowerCase().localeCompare(valB.toLowerCase(), 'ru');
            return currentSort.direction === 'asc' ? res : -res;
        });
        dealerListBody.innerHTML = filtered.length ? filtered.map((d, idx) => `
            <tr><td class="cell-number">${idx+1}</td>
            <td>${d.photo_url ? `<img src="${d.photo_url}" class="table-photo">` : `<div class="no-photo">Нет</div>`}</td>
            <td>${safeText(d.dealer_id)}</td><td>${safeText(d.name)}</td><td>${safeText(d.city)}</td><td>${safeText(d.price_type)}</td><td>${safeText(d.organization)}</td>
            <td class="actions-cell"><div class="dropdown"><button class="btn btn-light btn-sm" data-bs-toggle="dropdown"><i class="bi bi-three-dots-vertical"></i></button><ul class="dropdown-menu dropdown-menu-end">
            <li><a class="dropdown-item btn-view" data-id="${d.id}" href="#"><i class="bi bi-eye me-2"></i>Просмотр</a></li>
            <li><a class="dropdown-item btn-edit" data-id="${d.id}" href="#"><i class="bi bi-pencil me-2"></i>Ред.</a></li>
            <li><hr class="dropdown-divider"></li>
            <li><a class="dropdown-item text-danger btn-delete" data-id="${d.id}" data-name="${safeText(d.name)}" href="#"><i class="bi bi-trash me-2"></i>Удалить</a></li>
            </ul></div></td></tr>`).join('') : '';
        dealerTable.style.display = filtered.length ? 'table' : 'none';
        noDataMsg.style.display = filtered.length ? 'none' : 'block';
        noDataMsg.textContent = allDealers.length === 0 ? 'Список пуст.' : 'Не найдено.';
    }

    function populateFilters(dealers) {
        const cities = [...new Set(dealers.map(d => d.city).filter(Boolean))].sort();
        const types = [...new Set(dealers.map(d => d.price_type).filter(Boolean))].sort();
        const selCity = filterCity.value; const selType = filterPriceType.value;
        filterCity.innerHTML = '<option value="">-- Все города --</option>'; filterPriceType.innerHTML = '<option value="">-- Все типы --</option>';
        cities.forEach(c => filterCity.add(new Option(c, c))); types.forEach(t => filterPriceType.add(new Option(t, t)));
        filterCity.value = selCity; filterPriceType.value = selType;
    }

    async function initApp() {
        await fetchProductCatalog();
        try {
            const response = await fetch(API_DEALERS_URL);
            if (!response.ok) throw new Error(response.statusText);
            allDealers = await response.json();
            populateFilters(allDealers);
            renderDealerList();
            renderDashboard(); 
        } catch (error) {
            console.error(error);
            dealerListBody.innerHTML = `<tr><td colspan="8" class="text-danger text-center">Ошибка загрузки.</td></tr>`;
        }
        const pendingId = localStorage.getItem('pendingEditDealerId');
        if (pendingId) { localStorage.removeItem('pendingEditDealerId'); openEditModal(pendingId); }
    }

    document.getElementById('add-contact-btn-add-modal').onclick = () => addContactList.insertAdjacentHTML('beforeend', createContactEntryHTML());
    document.getElementById('add-address-btn-add-modal').onclick = () => addAddressList.insertAdjacentHTML('beforeend', createAddressEntryHTML());
    document.getElementById('add-pos-btn-add-modal').onclick = () => addPosList.insertAdjacentHTML('beforeend', createPosEntryHTML());
    document.getElementById('add-visits-btn-add-modal').onclick = () => addVisitsList.insertAdjacentHTML('beforeend', createVisitEntryHTML());

    document.getElementById('add-contact-btn-edit-modal').onclick = () => editContactList.insertAdjacentHTML('beforeend', createContactEntryHTML());
    document.getElementById('add-address-btn-edit-modal').onclick = () => editAddressList.insertAdjacentHTML('beforeend', createAddressEntryHTML());
    document.getElementById('add-pos-btn-edit-modal').onclick = () => editPosList.insertAdjacentHTML('beforeend', createPosEntryHTML());
    document.getElementById('add-visits-btn-edit-modal').onclick = () => editVisitsList.insertAdjacentHTML('beforeend', createVisitEntryHTML());

    openAddModalBtn.onclick = () => {
        addForm.reset(); renderProductChecklist(addProductChecklist);
        renderList(addContactList, [], createContactEntryHTML);
        renderList(addAddressList, [], createAddressEntryHTML);
        renderList(addPosList, [], createPosEntryHTML);
        renderList(addVisitsList, [], createVisitEntryHTML);
        document.getElementById('add_latitude').value = ''; document.getElementById('add_longitude').value = '';
        addPhotosData = []; renderPhotoPreviews(addPhotoPreviewContainer, []);
        addModal.show();
    };

    addForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = {
            dealer_id: document.getElementById('dealer_id').value, name: document.getElementById('name').value,
            organization: document.getElementById('organization').value, price_type: document.getElementById('price_type').value,
            city: document.getElementById('city').value, address: document.getElementById('address').value,
            delivery: document.getElementById('delivery').value, website: document.getElementById('website').value, instagram: document.getElementById('instagram').value,
            latitude: document.getElementById('add_latitude').value, longitude: document.getElementById('add_longitude').value,
            bonuses: document.getElementById('bonuses').value,
            contacts: collectData(addContactList, '.contact-entry', [{key:'name',class:'.contact-name'},{key:'position',class:'.contact-position'},{key:'contactInfo',class:'.contact-info'}]),
            additional_addresses: collectData(addAddressList, '.address-entry', [{key:'description',class:'.address-description'},{key:'city',class:'.address-city'},{key:'address',class:'.address-address'}]),
            pos_materials: collectData(addPosList, '.pos-entry', [{key:'name',class:'.pos-name'},{key:'quantity',class:'.pos-quantity'}]),
            visits: collectData(addVisitsList, '.visit-entry', [{key:'date',class:'.visit-date'},{key:'comment',class:'.visit-comment'}]),
            photos: addPhotosData
        };
        try {
            const res = await fetch(API_DEALERS_URL, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data)});
            if (!res.ok) throw new Error(await res.text());
            const newD = await res.json();
            const pIds = getSelectedProductIds('add-product-checklist');
            if(pIds.length) await saveProducts(newD.id, pIds);
            addModal.hide(); initApp();
        } catch (e) { alert("Ошибка при добавлении."); }
    });

    async function openEditModal(id) {
        try {
            const res = await fetch(`${API_DEALERS_URL}/${id}`);
            if(!res.ok) throw new Error("Ошибка");
            const d = await res.json();
            document.getElementById('edit_db_id').value = d.id;
            document.getElementById('edit_dealer_id').value = d.dealer_id;
            document.getElementById('edit_name').value = d.name;
            document.getElementById('edit_organization').value = d.organization;
            document.getElementById('edit_price_type').value = d.price_type;
            document.getElementById('edit_city').value = d.city;
            document.getElementById('edit_address').value = d.address;
            document.getElementById('edit_delivery').value = d.delivery;
            document.getElementById('edit_website').value = d.website;
            document.getElementById('edit_instagram').value = d.instagram;
            document.getElementById('edit_latitude').value = d.latitude || '';
            document.getElementById('edit_longitude').value = d.longitude || '';
            document.getElementById('edit_bonuses').value = d.bonuses;
            renderList(editContactList, d.contacts, createContactEntryHTML);
            renderList(editAddressList, d.additional_addresses, createAddressEntryHTML);
            renderList(editPosList, d.pos_materials, createPosEntryHTML);
            renderList(editVisitsList, d.visits, createVisitEntryHTML);
            renderProductChecklist(editProductChecklist, (d.products||[]).map(p=>p.id));
            editPhotosData = d.photos || [];
            renderPhotoPreviews(editPhotoPreviewContainer, editPhotosData);
            editModal.show();
        } catch(e) { alert("Ошибка загрузки."); }
    }

    editForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('edit_db_id').value;
        const data = {
            dealer_id: document.getElementById('edit_dealer_id').value, name: document.getElementById('edit_name').value,
            organization: document.getElementById('edit_organization').value, price_type: document.getElementById('edit_price_type').value,
            city: document.getElementById('edit_city').value, address: document.getElementById('edit_address').value,
            delivery: document.getElementById('edit_delivery').value, website: document.getElementById('edit_website').value, instagram: document.getElementById('edit_instagram').value,
            latitude: document.getElementById('edit_latitude').value, longitude: document.getElementById('edit_longitude').value,
            bonuses: document.getElementById('edit_bonuses').value,
            contacts: collectData(editContactList, '.contact-entry', [{key:'name',class:'.contact-name'},{key:'position',class:'.contact-position'},{key:'contactInfo',class:'.contact-info'}]),
            additional_addresses: collectData(editAddressList, '.address-entry', [{key:'description',class:'.address-description'},{key:'city',class:'.address-city'},{key:'address',class:'.address-address'}]),
            pos_materials: collectData(editPosList, '.pos-entry', [{key:'name',class:'.pos-name'},{key:'quantity',class:'.pos-quantity'}]),
            // (ВАЖНО) Сохраняем isCompleted
            visits: collectData(editVisitsList, '.visit-entry', [{key:'date',class:'.visit-date'},{key:'comment',class:'.visit-comment'},{key:'isCompleted',class:'.visit-completed'}]),
            photos: editPhotosData
        };
        try {
            await fetch(`${API_DEALERS_URL}/${id}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data)});
            await saveProducts(id, getSelectedProductIds('edit-product-checklist'));
            editModal.hide(); initApp();
        } catch (e) { alert("Ошибка при сохранении."); }
    });

    dealerListBody.addEventListener('click', (e) => { const t=e.target; if(t.closest('.btn-view')) window.open(`dealer.html?id=${t.closest('.btn-view').dataset.id}`,'_blank'); if(t.closest('.btn-edit')) openEditModal(t.closest('.btn-edit').dataset.id); if(t.closest('.btn-delete') && confirm("Удалить?")) fetch(`${API_DEALERS_URL}/${t.closest('.btn-delete').dataset.id}`, {method:'DELETE'}).then(initApp); });
    const removeHandler = (e) => { if(e.target.closest('.btn-remove-entry')) e.target.closest('.contact-entry, .address-entry, .pos-entry, .photo-entry, .visit-entry').remove(); };
    addModalEl.addEventListener('click', removeHandler); editModalEl.addEventListener('click', removeHandler);
    filterCity.onchange = renderDealerList; filterPriceType.onchange = renderDealerList; searchBar.oninput = renderDealerList;
    document.querySelectorAll('th[data-sort]').forEach(th => th.onclick = () => { if(currentSort.column===th.dataset.sort) currentSort.direction=(currentSort.direction==='asc'?'desc':'asc'); else {currentSort.column=th.dataset.sort;currentSort.direction='asc';} renderDealerList(); });
    if(exportBtn) exportBtn.onclick = () => { if(!allDealers.length) return alert("Пусто"); let csv="\uFEFFID,Название,Орг,Город,Адрес,Тип,Контакты\n"+allDealers.map(d=>`"${d.dealer_id}","${d.name}","${d.organization}","${d.city}","${d.address}","${d.price_type}","${(d.contacts||[]).map(x=>x.name).join('; ')}"`).join('\n'); const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'})); a.download='dealers.csv'; a.click(); };

    initApp();
});
