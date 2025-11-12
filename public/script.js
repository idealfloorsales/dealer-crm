// script.js
document.addEventListener('DOMContentLoaded', () => {
    // ... (константы) ...
    const API_DEALERS_URL = '/api/dealers';
    const API_PRODUCTS_URL = '/api/products'; 
    let fullProductCatalog = [];
    let allDealers = [];
    let currentSort = { column: 'name', direction: 'asc' };
    const posMaterialsList = ["Н600 - 600мм наклейка", "Н800 - 800мм наклейка", "РФ-2 - Расческа из фанеры", "РФС-1 - Расческа их фанеры старая", "С600 - 600мм задняя стенка", "С800 - 800мм задняя стенка", "Табличка - Табличка орг.стекло"];

    const addModalEl = document.getElementById('add-modal');
    const addModal = new bootstrap.Modal(addModalEl);
    const editModalEl = document.getElementById('edit-modal');
    const editModal = new bootstrap.Modal(editModalEl);
    // ... (все кнопки и формы) ...
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
                let width = img.width;
                let height = img.height;
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
            fullProductCatalog = await response.json();
            fullProductCatalog.sort((a, b) => a.sku.localeCompare(b.sku, 'ru', { numeric: true }));
        } catch (error) { console.error(error); }
    }

    // --- HTML Helpers ---
    function createContactEntryHTML(c={}) { return `<div class="contact-entry input-group mb-2"><input type="text" class="form-control contact-name" value="${c.name||''}"><input type="text" class="form-control contact-position" value="${c.position||''}"><input type="text" class="form-control contact-info" value="${c.contactInfo||''}"><button type="button" class="btn btn-outline-danger btn-remove-entry">X</button></div>`; }
    function createAddressEntryHTML(a={}) { return `<div class="address-entry input-group mb-2"><input type="text" class="form-control address-description" value="${a.description||''}"><input type="text" class="form-control address-city" value="${a.city||''}"><input type="text" class="form-control address-address" value="${a.address||''}"><button type="button" class="btn btn-outline-danger btn-remove-entry">X</button></div>`; }
    function createPosEntryHTML(p={}) { 
        const opts = posMaterialsList.map(n => `<option value="${n}" ${n===p.name?'selected':''}>${n}</option>`).join('');
        return `<div class="pos-entry input-group mb-2"><select class="form-select pos-name"><option value="">--</option>${opts}</select><input type="number" class="form-control pos-quantity" value="${p.quantity||1}"><button type="button" class="btn btn-outline-danger btn-remove-entry">X</button></div>`; 
    }

    // --- ФОТО (С УЧЕТОМ ДАТЫ) ---
    function renderPhotoPreviews(container, photosArray) {
        container.innerHTML = photosArray.map((p, index) => `
            <div class="photo-preview-item">
                <img src="${p.photo_url}">
                <button type="button" class="btn-remove-photo" data-index="${index}">×</button>
            </div>
        `).join('');
    }

    addPhotoInput.addEventListener('change', async (e) => {
        for (let file of e.target.files) addPhotosData.push({ photo_url: await compressImage(file) }); // Дата добавится сервером
        renderPhotoPreviews(addPhotoPreviewContainer, addPhotosData);
        addPhotoInput.value = '';
    });
    addPhotoPreviewContainer.addEventListener('click', (e) => { if(e.target.classList.contains('btn-remove-photo')) { addPhotosData.splice(e.target.dataset.index, 1); renderPhotoPreviews(addPhotoPreviewContainer, addPhotosData); }});

    editPhotoInput.addEventListener('change', async (e) => {
        for (let file of e.target.files) editPhotosData.push({ photo_url: await compressImage(file) }); // Дата добавится сервером
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
    function renderList(container, data, htmlGen) { container.innerHTML = (data && data.length > 0) ? data.map(htmlGen).join('') : htmlGen(); }
    function renderProductChecklist(container, selectedIds=[]) { const set = new Set(selectedIds); container.innerHTML = fullProductCatalog.map(p => `<div class="checklist-item form-check"><input type="checkbox" class="form-check-input" value="${p.id}" ${set.has(p.id)?'checked':''}><label>${p.sku} ${p.name}</label></div>`).join(''); }
    function getSelectedProductIds(containerId) { return Array.from(document.getElementById(containerId).querySelectorAll('input:checked')).map(cb=>cb.value); }
    async function saveProducts(dealerId, ids) { await fetch(`${API_DEALERS_URL}/${dealerId}/products`, {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({productIds: ids})}); }

    function renderDealerList() { /* ... (стандартный рендер списка) ... */
        const search = searchBar.value.toLowerCase();
        const filtered = allDealers.filter(d => !search || (d.name && d.name.toLowerCase().includes(search)));
        // ... (сортировка) ...
        dealerListBody.innerHTML = filtered.map((d,i)=>`
            <tr><td class="cell-number">${i+1}</td>
            <td>${d.photo_url ? `<img src="${d.photo_url}" class="table-photo">` : `<div class="no-photo"></div>`}</td>
            <td>${safeText(d.dealer_id)}</td><td>${safeText(d.name)}</td><td>${safeText(d.city)}</td><td>${safeText(d.price_type)}</td><td>${safeText(d.organization)}</td>
            <td class="actions-cell"><button class="btn btn-sm btn-light btn-edit" data-id="${d.id}">...</button></td></tr>
        `).join('');
        // (Для краткости я не пишу весь HTML таблицы, он у вас уже есть)
    }

    // ... (populateFilters, initApp, кнопки Add...) ...
    
    // ЗАГРУЗКА ДАННЫХ В EDIT MODAL
    async function openEditModal(id) {
        const res = await fetch(`${API_DEALERS_URL}/${id}`);
        const d = await res.json();
        // ... (заполнение полей) ...
        document.getElementById('edit_db_id').value = d.id;
        // ... 
        renderList(editContactList, d.contacts, createContactEntryHTML);
        renderList(editAddressList, d.additional_addresses, createAddressEntryHTML);
        renderList(editPosList, d.pos_materials, createPosEntryHTML);
        
        // ФОТО: Загружаем и сохраняем дату!
        editPhotosData = d.photos || [];
        renderPhotoPreviews(editPhotoPreviewContainer, editPhotosData);
        
        renderProductChecklist(editProductChecklist, (d.products||[]).map(p=>p.id));
        editModal.show();
    }

    // ... (остальные обработчики) ...
    // Вставьте сюда полную версию script.js из предыдущего ответа, 
    // но замените только логику с фото, как показано выше.
    
    // Чтобы вы не запутались, лучше возьмите script.js из МОЕГО ПРЕДЫДУЩЕГО СООБЩЕНИЯ (где я давал 13 файлов),
    // он уже содержит эту логику. Здесь я показал суть изменений.
    
    initApp();
});
