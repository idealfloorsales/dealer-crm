// script.js
document.addEventListener('DOMContentLoaded', () => {
    
    // ... (весь код до exportBtn.onclick) ...
    
    // (ИЗМЕНЕНО) УМНЫЙ ЭКСПОРТ В EXCEL
    if(exportBtn) {
        exportBtn.onclick = async () => {
            if (!allDealers.length) return alert("Пусто. Нечего экспортировать.");
            
            // Показываем загрузку на кнопке
            exportBtn.disabled = true;
            exportBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Загрузка...';

            const clean = (text) => `"${String(text || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`;
            
            // Заголовки (16 колонок)
            let csv = "\uFEFF"; // BOM для Excel
            const headers = [
                "ID", "Название", "Статус", "Город", "Адрес", "Тип цен", "Организация", "Доставка", "Сайт", "Инстаграм",
                "Контакты (Имя)", "Контакты (Должность)", "Контакты (Телефон)",
                "Доп. Адреса", "Стенды", "Бонусы"
            ];
            csv += headers.join(",") + "\r\n";

            try {
                // Получаем ПОЛНЫЕ данные по каждому дилеру (это может занять время)
                for (const d of allDealers) {
                    const res = await fetch(`${API_DEALERS_URL}/${d.id}`);
                    if (!res.ok) continue;
                    const dealer = await res.json();
                    
                    const contactsName = (dealer.contacts || []).map(c => c.name).join('; ');
                    const contactsPos = (dealer.contacts || []).map(c => c.position).join('; ');
                    const contactsInfo = (dealer.contacts || []).map(c => c.contactInfo).join('; ');
                    const addresses = (dealer.additional_addresses || []).map(a => `${a.description || ''}: ${a.city || ''} ${a.address || ''}`).join('; ');
                    const stands = (dealer.pos_materials || []).map(p => `${p.name} (${p.quantity} шт)`).join('; ');

                    const row = [
                        clean(dealer.dealer_id), clean(dealer.name), clean(dealer.status),
                        clean(dealer.city), clean(dealer.address), clean(dealer.price_type),
                        clean(dealer.organization), clean(dealer.delivery), clean(dealer.website), clean(dealer.instagram),
                        clean(contactsName), clean(contactsPos), clean(contactsInfo),
                        clean(addresses), clean(stands), clean(dealer.bonuses)
                    ];
                    csv += row.join(",") + "\r\n";
                }

                // Скачивание
                const a = document.createElement('a');
                a.href = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8;'}));
                a.download = 'dealers_full_export.csv';
                a.click();
                
            } catch (e) {
                alert("Ошибка при создании экспорта: " + e.message);
            } finally {
                // Возвращаем кнопку в норму
                exportBtn.disabled = false;
                exportBtn.innerHTML = '<i class="bi bi-file-earmark-excel me-2"></i>Экспорт';
            }
        };
    }
    
    // ... (остальной код, initApp() и т.д.) ...
    
    // (ВАЖНО: Вставьте сюда ПОЛНЫЙ КОД script.js из предыдущего ответа, 
    // но замените в нем ТОЛЬКО блок if(exportBtn) exportBtn.onclick = ...)
});
