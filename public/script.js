// script.js
document.addEventListener('DOMContentLoaded', () => {
    
    const API_DEALERS_URL = '/api/dealers';
    const API_PRODUCTS_URL = '/api/products'; 

    let fullProductCatalog = [];
    let allDealers = [];
    let currentSort = { column: 'name', direction: 'asc' };

    const posMaterialsList = [
        "Н600 - 600мм наклейка", "Н800 - 800мм наклейка", "РФ-2 - Расческа из фанеры",
        "РФС-1 - Расческа их фанеры старая", "С600 - 600мм задняя стенка",
        "С800 - 800мм задняя стенка", "Табличка - Табличка орг.стекло"
    ];

    // --- (ИСПРАВЛЕНО ЗДЕСЬ) Объявляем элементы модальных окон ---
    const addModalEl = document.getElementById('add-modal'); // Вот переменная, которой не хватало
    const editModalEl = document.getElementById('edit-modal'); // И эта тоже

    // Инициализация Bootstrap
    const addModal = new bootstrap.Modal(addModalEl);
    const editModal = new bootstrap.Modal(editModalEl);

    const openAddModalBtn = document.getElementById('open-add-modal-btn');
    const addForm = document.getElementById('add-dealer-form');
    const addProductChecklist = document.getElementById('add-product-checklist'); 
    const addContactList = document.getElementById('add-contact-list'); 
    const addAddressList = document.getElementById('add-address-list'); 
    const addPosList = document.getElementById('add-pos-list'); 
    const addPhotoList = document.getElementById('add-photo-list'); 
    const addPhotoInput = document.getElementById('add-photo-input');
    const addPhotoPreviewContainer = document.getElementById('add-photo-preview-container');
    
    const dealerListBody = document.getElementById('dealer-list-body');
    const dealerTable = document.getElementById('dealer-table');
    const noDataMsg = document.getElementById('no-data-msg');
    const filterCity = document.getElementById('filter-city');
    const filterPriceType = document.getElementById('filter-price-type');
    const searchBar = document.getElementById('search-bar'); 
    const exportBtn = document.getElementById('export-dealers-btn'); 

    const editForm = document.getElementById('edit-dealer-form');
    const editProductChecklist = document.getElementById('edit-product-checklist'); 
    const editContactList = document.getElementById('edit-contact-list'); 
    const editAddressList = document.getElementById('edit-address-list'); 
    const editPosList = document.getElementById('edit-pos-list'); 
    const editPhotoList = document.getElementById('edit-photo-list'); 
    const editPhotoInput = document.getElementById('edit-photo-input');
    const editPhotoPreviewContainer = document.getElementById('edit-photo-preview-container');

    let addPhotosData = []; 
    let editPhotosData = [];

    const safeText = (text) => text ? text.replace(/</g, "&lt;").replace(/>/g, "&gt;") : '---';

    const compressImage = (file, maxWidth = 1000, quality = 0.7) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = event => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const elem = document.createElement('canvas');
                let width = img.width; let height = img.height;
                if (width > maxWidth) { height *= maxWidth / width; width = maxWidth; }
                elem.width = width; elem.height = height;
                const ctx = elem.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(elem.toDataURL('image/jpeg', quality));
            };
            img.onerror = error => reject(error);
        };
        reader.onerror = error => reject(error);
    });

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

    function createContactEntryHTML(c={}) { return `<div class="contact-entry input-group mb-2"><input type="text" class="form-control contact-name" placeholder="Имя" value="${c.name||''}"><input type="text" class="form-control contact-position" placeholder="Должность" value="${c.position||''}"><input type="text" class="form-control contact-info" placeholder="Телефон" value="${c.contactInfo||''}"><button type="button" class="btn btn-outline-danger btn-remove-entry"><i class="bi bi-trash"></i></button></div>`; }
    function createAddressEntryHTML(a={}) { return `<div class="address-entry input-group mb-2"><input type="text" class="form-control address-description" placeholder="Описание" value="${a.description||''}"><input type="text" class="form-control address-city" placeholder="Город" value="${a.city||''}"><input type="text" class="form-control address-address" placeholder="Адрес" value="${a.address||''}"><button type="button" class="btn btn-outline-danger btn-remove-entry"><i class="bi bi-trash"></i></button></div>`; }
    function createPosEntryHTML(p={}) { 
        const opts = posMaterialsList.map(n => `<option value="${n}" ${n===p.name?'selected':''}>${n}</option>`).join('');
        return `<div class="pos-entry input-group mb-2"><select class="form-select pos-name"><option value="">-- Выбор --</option>${opts}</select><input type="number" class="form-control pos-quantity" value="${p.quantity||1}" min="1"><button type="button" class="btn btn-outline-danger btn-remove-entry"><i class="bi bi-trash"></i></button></div>`; 
    }

    function renderPhotoPreviews(container, photosArray) {
        container.innerHTML = photosArray.map((p, index) => `
            <div class="photo-preview-item">
                <img src="${p.photo_url}">
                <button type="button" class="btn-remove-photo" data-index="${index}">×</button>
            </div>
        `).join('');
    }

    addPhotoInput.addEventListener('change', async (e) => {
        for (let file of e.target.files) addPhotosData.push({ photo_url: await compressImage(file) });
        renderPhotoPreviews(addPhotoPreviewContainer, addPhotosData);
        addPhotoInput.value = '';
    });
    addPhotoPreviewContainer.addEventListener('click', (e) => { if(e.target.classList.contains('btn-remove-photo')) { addPhotosData.splice(e.target.dataset.index, 1); renderPhotoPreviews(addPhotoPreviewContainer, addPhotosData); }});

    editPhotoInput.addEventListener('change', async (e) => {
        for (let file of e.target.files) editPhotosData.push({ photo_url: await compressImage(file) });
        renderPhotoPreviews(editPhotoPreviewContainer, editPhotosData);
        editPhotoInput.value = '';
    });
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
    async function collectPhotos(container) {
        const promises = [];
        // Старые фото просто сохраняем
        // (Функция renderExistingPhotos не используется в новой логике для UI, но массив данных есть)
        // Мы берем данные из глобальных массивов addPhotosData / editPhotosData, так что collectPhotos больше не нужен для сбора из DOM
        // Но оставим для совместимости, если вы не используете массивы напрямую в submit
        return Promise.resolve([]); 
    }
    // В новой логике мы используем глобальные массивы addPhotosData и editPhotosData напрямую в submit!

    function renderList(container, data, htmlGen) { container.innerHTML = (data && data.length > 0) ? data.map(htmlGen).join('') : htmlGen(); }
    function renderProductChecklist(container, selectedIds=[]) { 
        const set = new Set(selectedIds); 
        if (fullProductCatalog.length === 0) {
            container.innerHTML = "<p>Каталог пуст (ошибка загрузки).</p>";
            return;
        }
        container.innerHTML = fullProductCatalog.map(p => `<div class="checklist-item form-check"><input type="checkbox" class="form-check-input" id="prod-${container.id}-${p.id}" value="${p.id}" ${set.has(p.id)?'checked':''}><label class="form-check-label" for="prod-${container.id}-${p.id}"><strong>${p.sku}</strong> - ${p.name}</label></div>`).join(''); 
    }
    function getSelectedProductIds(containerId) { return Array.from(document.getElementById(containerId).querySelectorAll('input:checked')).map(cb=>cb.value); }
    async function saveProducts(dealerId, ids) { await fetch(`${API_DEALERS_URL}/${dealerId}/products`, {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({productIds: ids})}); }

    function renderDealerList() {
        const city = filterCity.value; const type = filterPriceType.value; const search = searchBar.value.toLowerCase();
        const filtered = allDealers.filter(d => {
            return (!city || d.city === city) && (!type || d.price_type === type) &&
                   (!search || (d.name && d.name.toLowerCase().includes(search)) || (d.dealer_id && d.dealer_id.toLowerCase().includes(search)) || (d.organization && d.organization.toLowerCase().includes(search)));
        });
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
    document.getElementById('add-contact-btn-edit-modal').onclick = () => editContactList.insertAdjacentHTML('beforeend', createContactEntryHTML());
    document.getElementById('add-address-btn-edit-modal').onclick = () => editAddressList.insertAdjacentHTML('beforeend', createAddressEntryHTML());
    document.getElementById('add-pos-btn-edit-modal').onclick = () => editPosList.insertAdjacentHTML('beforeend', createPosEntryHTML());

    openAddModalBtn.onclick = () => {
        addForm.reset();
        renderProductChecklist(addProductChecklist);
        renderList(addContactList, [], createContactEntryHTML);
        renderList(addAddressList, [], createAddressEntryHTML);
        renderList(addPosList, [], createPosEntryHTML);
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
            bonuses: document.getElementById('bonuses').value,
            contacts: collectData(addContactList, '.contact-entry', [{key:'name',class:'.contact-name'},{key:'position',class:'.contact-position'},{key:'contactInfo',class:'.contact-info'}]),
            additional_addresses: collectData(addAddressList, '.address-entry', [{key:'description',class:'.address-description'},{key:'city',class:'.address-city'},{key:'address',class:'.address-address'}]),
            pos_materials: collectData(addPosList, '.pos-entry', [{key:'name',class:'.pos-name'},{key:'quantity',class:'.pos-quantity'}]),
            photos: addPhotosData // Используем глобальный массив фото
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
            if(!res.ok) throw new Error("Ошибка загрузки дилера");
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
            document.getElementById('edit_bonuses').value = d.bonuses;
            renderList(editContactList, d.contacts, createContactEntryHTML);
            renderList(editAddressList, d.additional_addresses, createAddressEntryHTML);
            renderList(editPosList, d.pos_materials, createPosEntryHTML);
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
            bonuses: document.getElementById('edit_bonuses').value,
            contacts: collectData(editContactList, '.contact-entry', [{key:'name',class:'.contact-name'},{key:'position',class:'.contact-position'},{key:'contactInfo',class:'.contact-info'}]),
            additional_addresses: collectData(editAddressList, '.address-entry', [{key:'description',class:'.address-description'},{key:'city',class:'.address-city'},{key:'address',class:'.address-address'}]),
            pos_materials: collectData(editPosList, '.pos-entry', [{key:'name',class:'.pos-name'},{key:'quantity',class:'.pos-quantity'}]),
            photos: editPhotosData // Используем глобальный массив фото
        };
        try {
            await fetch(`${API_DEALERS_URL}/${id}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data)});
            await saveProducts(id, getSelectedProductIds('edit-product-checklist'));
            editModal.hide(); initApp();
        } catch (e) { alert("Ошибка при сохранении."); }
    });

    dealerListBody.addEventListener('click', (e) => {
        const t = e.target;
        if (t.closest('.btn-view')) window.open(`dealer.html?id=${t.closest('.btn-view').dataset.id}`, '_blank');
        if (t.closest('.btn-edit')) openEditModal(t.closest('.btn-edit').dataset.id);
        if (t.closest('.btn-delete')) {
            const btn = t.closest('.btn-delete');
            if(confirm(`Удалить?`)) fetch(`${API_DEALERS_URL}/${btn.dataset.id}`, {method:'DELETE'}).then(initApp);
        }
    });

    // (ВАЖНО) Здесь мы используем addModalEl и editModalEl, которые теперь определены в начале
    const removeHandler = (e) => {
        if(e.target.closest('.btn-remove-entry')) e.target.closest('.contact-entry, .address-entry, .pos-entry').remove();
    };
    addModalEl.addEventListener('click', removeHandler);
    editModalEl.addEventListener('click', removeHandler);

    filterCity.onchange = renderDealerList;
    filterPriceType.onchange = renderDealerList;
    searchBar.oninput = renderDealerList;
    
    document.querySelectorAll('th[data-sort]').forEach(th => {
        th.onclick = () => {
            if (currentSort.column === th.dataset.sort) currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
            else { currentSort.column = th.dataset.sort; currentSort.direction = 'asc'; }
            renderDealerList();
        }
    });

    if (exportBtn) {
        exportBtn.onclick = () => {
            if (!allDealers.length) return alert("Пусто.");
            let csv = "\uFEFFID,Название,Орг,Город,Адрес,Тип,Контакты\n";
            allDealers.forEach(d => {
                const c = (d.contacts||[]).map(x=>x.name).join('; ');
                const clean = t => `"${String(t||'').replace(/"/g,'""')}"`;
                csv += `${clean(d.dealer_id)},${clean(d.name)},${clean(d.organization)},${clean(d.city)},${clean(d.address)},${clean(d.price_type)},${clean(c)}\n`;
            });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8;'}));
            a.download = 'dealers.csv';
            a.click();
        };
    }

    initApp();
});
