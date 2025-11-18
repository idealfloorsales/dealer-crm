// script.js
document.addEventListener('DOMContentLoaded', () => {
    // ... (весь код выше без изменений) ...

    // --- (ИЗМЕНЕНО) Рендер списка с логикой Потенциальных ---
    function renderDealerList() {
        if (!dealerListBody) return;
        const city = filterCity ? filterCity.value : ''; 
        const type = filterPriceType ? filterPriceType.value : ''; 
        const status = filterStatus ? filterStatus.value : ''; 
        const search = searchBar ? searchBar.value.toLowerCase() : '';
        
        const filtered = allDealers.filter(d => {
            // Логика статуса:
            let statusMatch = false;
            const currentStatus = d.status || 'standard';
            
            if (status) {
                // Если фильтр выбран, показываем ТОЛЬКО этот статус
                statusMatch = currentStatus === status;
            } else {
                // Если фильтр НЕ выбран ("Все"), показываем всех, КРОМЕ потенциальных
                statusMatch = currentStatus !== 'potential';
            }

            return (!city || d.city === city) && 
                   (!type || d.price_type === type) && 
                   statusMatch && 
                   (!search || ((d.name || '').toLowerCase().includes(search) || (d.dealer_id || '').toLowerCase().includes(search) || (d.organization || '').toLowerCase().includes(search)));
        });
        
        filtered.sort((a, b) => {
            let valA = (a[currentSort.column] || '').toString(); let valB = (b[currentSort.column] || '').toString();
            let res = currentSort.column === 'dealer_id' ? valA.localeCompare(valB, undefined, {numeric:true}) : valA.toLowerCase().localeCompare(valB.toLowerCase(), 'ru');
            return currentSort.direction === 'asc' ? res : -res;
        });
        
        dealerListBody.innerHTML = filtered.length ? filtered.map((d, idx) => {
            let rowClass = 'row-status-standard';
            if (d.status === 'active') rowClass = 'row-status-active';
            else if (d.status === 'problem') rowClass = 'row-status-problem';
            else if (d.status === 'archive') rowClass = 'row-status-archive';
            else if (d.status === 'potential') rowClass = 'row-status-potential'; // (НОВОЕ)

            return `
            <tr class="${rowClass}">
                <td class="cell-number">${idx+1}</td>
                <td>${d.photo_url ? `<img src="${d.photo_url}" class="table-photo">` : `<div class="no-photo">Нет</div>`}</td>
                <td>${safeText(d.dealer_id)}</td><td>${safeText(d.name)}</td><td>${safeText(d.city)}</td><td>${safeText(d.price_type)}</td><td>${safeText(d.organization)}</td>
                <td class="actions-cell"><div class="dropdown"><button class="btn btn-light btn-sm" data-bs-toggle="dropdown"><i class="bi bi-three-dots-vertical"></i></button><ul class="dropdown-menu dropdown-menu-end">
                <li><a class="dropdown-item btn-view" data-id="${d.id}" href="#"><i class="bi bi-eye me-2"></i>Подробнее</a></li>
                <li><a class="dropdown-item btn-edit" data-id="${d.id}" href="#"><i class="bi bi-pencil me-2"></i>Редактировать</a></li>
                <li><hr class="dropdown-divider"></li>
                <li><a class="dropdown-item text-danger btn-delete" data-id="${d.id}" data-name="${safeText(d.name)}" href="#"><i class="bi bi-trash me-2"></i>Удалить</a></li>
                </ul></div></td></tr>`;
        }).join('') : '';
        
        if(dealerTable) dealerTable.style.display = filtered.length ? 'table' : 'none';
        if(noDataMsg) { noDataMsg.style.display = filtered.length ? 'none' : 'block'; noDataMsg.textContent = allDealers.length === 0 ? 'Список пуст.' : 'Не найдено.'; }
    }
    
    // ... (остальной код без изменений) ...
});
