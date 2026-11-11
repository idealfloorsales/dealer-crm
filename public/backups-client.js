(async () => {
    if (window.CRMAuth?.ready) await CRMAuth.ready;
    if (!window.CRMAuth?.user || !CRMAuth.can('can_manage_users')) return;
    const main = document.querySelector('main'), tabs = main?.querySelector('.employee-section-tabs');
    if (!tabs) return;
    const tab = document.createElement('button');
    tab.type = 'button'; tab.dataset.section = 'backups'; tab.setAttribute('aria-pressed','false');
    tab.innerHTML = '<i class="bi bi-shield-check"></i> Резервные копии'; tabs.appendChild(tab);
    const panel = document.createElement('section'); panel.dataset.employeePage = 'backups'; panel.hidden = true; panel.className = 'backup-panel'; main.appendChild(panel);
    let busy = false, state;
    const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const date = value => value ? new Date(value).toLocaleString('ru-RU') : 'Ещё не создана';
    async function api(path, method='GET', body) {
        const response = await fetch('/api/admin/backups/'+path,{method,crmTrackLoading:false,...(body ? {headers:{'Content-Type':'application/json'},body:JSON.stringify(body)} : {})});
        if (!response.ok) throw Error((await response.json().catch(()=>({}))).error || 'Не удалось выполнить действие.');
        return response;
    }
    async function load() {
        state = await (await api('status')).json();
        panel.innerHTML = '<div class="team-section-heading"><div><span class="team-overline">Только для администратора</span><h2>Резервные копии</h2><p>Копия базы вне MongoDB, с проверкой целостности и шифрованием.</p></div></div>'+
            '<div class="backup-grid"><section class="backup-card"><h3><i class="bi bi-shield-lock"></i> Ключ восстановления</h3><p>Сохраните ключ отдельно от архивов — например, на защищённую флешку. Без него открыть копию невозможно.</p><button class="team-secondary" data-backup="key" '+(!state.configured?'disabled':'')+'>Скачать ключ</button><small>'+(state.recoveryKeySaved?'Ключ уже скачивали. Убедитесь, что файл сохранён.':'Начните с сохранения ключа.')+'</small></section>'+
            '<section class="backup-card"><h3><i class="bi bi-download"></i> Копия на компьютер</h3><p>Зашифрованный архив всех коллекций базы, включая сотрудников, продажи, цех и настройки. Внешние фото и файлы сохраняются как ссылки.</p><button class="team-primary" data-backup="download" '+(!state.recoveryKeySaved||!state.configured||state.busy?'disabled':'')+'>Скачать копию базы</button><small>Последнее скачивание: '+esc(date(state.lastDownloadAt))+'</small></section>'+
            '<section class="backup-card backup-wide"><div class="backup-heading"><h3><i class="bi bi-google"></i> Google Диск</h3><span class="backup-badge">'+(state.connected?'Подключён':'Не подключён')+'</span></div><p>Отдельное разрешение только на файлы CRM. Новые копии сохраняются в закрытой папке приложения; старые автоматически не удаляются.</p><div class="backup-actions"><button class="team-secondary" data-backup="connect" '+(!state.googleConfigured||!state.configured?'disabled':'')+'>'+(state.connected?'Переподключить':'Подключить Google Диск')+'</button>'+(state.connected?'<button class="team-primary" data-backup="drive" '+(!state.recoveryKeySaved||state.busy?'disabled':'')+'>Создать копию на Диске</button><a class="team-secondary" target="_blank" rel="noopener" href="'+esc(state.folderUrl)+'">Открыть папку</a>':'')+'</div>'+
            (!state.connected?'<details class="backup-setup"><summary>Если Google показывает ошибку подключения</summary><p>Включите Google Drive API в проекте CRM. В OAuth-клиенте добавьте адрес перенаправления:</p><code>'+esc(state.redirectUri)+'</code><p>При запросе Google разрешите создание файлов приложением.</p></details>':'')+
            '<div class="backup-status '+(state.overdue?'is-overdue':'')+'"><strong>Последняя проверенная копия на Диске</strong><span>'+esc(date(state.lastDriveAt))+'</span>'+(state.overdue?'<small>Свежая копия ещё не подтверждена.</small>':'<small>Размер: '+(state.lastBytes/1024/1024).toFixed(2)+' МБ</small>')+'</div>'+
            '<label class="backup-auto"><input type="checkbox" data-backup-auto '+(state.automatic?'checked':'')+' '+(!state.connected||!state.recoveryKeySaved?'disabled':'')+'> Создавать копию раз в сутки</label><p class="backup-note">'+esc(state.schedule)+'</p></section></div>'+
            '<div class="backup-note">Копирование идёт последовательно при работающей CRM. Изменения во время выгрузки могут попасть в разные моменты. Восстановление проверяется отдельно в изолированной базе; эта страница не изменяет рабочие данные.</div>'+
            '<p class="backup-message" role="status" aria-live="polite">'+esc(!state.configured?'Серверный ключ ещё настраивается. Обновите статус чуть позже.':state.lastError||'')+'</p><button class="team-secondary" data-backup="refresh">Обновить статус</button>';
    }
    function tell(text) { const el=panel.querySelector('.backup-message'); if(el) el.textContent=text; }
    async function download(path, name, method) {
        const response = await api(path,method);
        const blob = await response.blob(), url = URL.createObjectURL(blob), link = document.createElement('a');
        link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
    }
    panel.addEventListener('click',async event => {
        const button=event.target.closest('[data-backup]');if(!button||busy)return;
        busy=true;panel.querySelectorAll('button').forEach(b=>b.disabled=true);tell('Выполняется… Не закрывайте страницу.');
        try {
            const action=button.dataset.backup;
            if(action==='key') await download('recovery-key','IDEAL-CRM-recovery-key.json','GET');
            if(action==='download') await download('download','IDEAL-CRM-'+new Date().toISOString().replace(/[:.]/g,'-')+'.idealbak','POST');
            if(action==='connect') {const result=await (await api('google/connect','POST')).json();location.assign(result.url);return;}
            if(action==='drive') await api('drive','POST');
            await load();
            if(action==='download') tell('Архив передан браузеру. Проверьте, что файл появился в загрузках.');
            if(action==='key') tell('Ключ передан браузеру. Сохраните файл отдельно от архивов.');
            if(action==='drive') tell('Копия загружена на Google Диск и проверена.');
        } catch(error) {await load().catch(()=>{});tell(error.message);}
        finally {busy=false;}
    });
    panel.addEventListener('change',async event => {
        if(!event.target.matches('[data-backup-auto]')||busy)return;busy=true;
        try {await api('automatic','PUT',{enabled:event.target.checked});await load();}
        catch(error){tell(error.message);event.target.checked=!event.target.checked;}finally{busy=false;}
    });
    tab.addEventListener('click',()=>{if(!busy)load().catch(error=>{panel.textContent=error.message;});});
    if(new URLSearchParams(location.search).has('backup')) tab.click();
})();
