(function(){
    'use strict';

    const root = document.getElementById('employee-page-templates');
    if (!root) return;

    const frame = document.getElementById('document-template-frame');
    const notice = document.getElementById('template-editor-notice');
    const versionStatus = document.getElementById('template-version-status');
    const saveButton = document.getElementById('template-save');
    const resetButton = document.getElementById('template-reset');
    const historyButton = document.getElementById('template-history-toggle');
    const historyPanel = document.getElementById('template-history-panel');
    const historyList = document.getElementById('template-history-list');
    const previewButton = document.getElementById('template-preview-toggle');
    const blockFormat = document.getElementById('template-block-format');
    const documentTabs = Array.from(document.querySelectorAll('[data-template-key]'));

    let activeKey = 'supply';
    let activeHtml = '';
    let version = 1;
    let revisions = [];
    let dirty = false;
    let previewMode = false;
    let frameReady = false;
    let frameLoadResolve = null;
    let loading = false;

    const documentNames = {
        supply: 'Договор поставки',
        storage: 'Договор ответственного хранения'
    };

    function escapeHtml(value){
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function showNotice(message, isError){
        notice.textContent = message;
        notice.classList.toggle('is-error', Boolean(isError));
        notice.hidden = false;
    }

    function clearNotice(){
        notice.textContent = '';
        notice.classList.remove('is-error');
        notice.hidden = true;
    }

    function apiError(data, fallback){
        return data && data.error ? data.error : fallback;
    }

    async function requestJson(url, options){
        const response = await fetch(url, options || { cache: 'no-store' });
        const data = await response.json().catch(function(){ return {}; });
        if (!response.ok) throw new Error(apiError(data, 'Не удалось выполнить запрос'));
        return data;
    }

    function replaceTokensWithChips(doc){
        const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
        const nodes = [];
        while (walker.nextNode()) {
            if (/\{\{[A-Z0-9_]+\}\}/.test(walker.currentNode.nodeValue || '')) nodes.push(walker.currentNode);
        }
        nodes.forEach(function(node){
            const value = node.nodeValue || '';
            const pattern = /\{\{([A-Z0-9_]+)\}\}/g;
            const fragment = doc.createDocumentFragment();
            let lastIndex = 0;
            let match;
            while ((match = pattern.exec(value))) {
                const before = value.slice(lastIndex, match.index);
                if (before) fragment.appendChild(doc.createTextNode(before));
                const token = match[1];
                if (token === 'STORAGE_ITEMS_ROWS' && node.parentElement && node.parentElement.tagName === 'TBODY') {
                    const row = doc.createElement('tr');
                    row.className = 'crm-template-dynamic-row';
                    row.dataset.crmTemplateToken = token;
                    row.contentEditable = 'false';
                    const cell = doc.createElement('td');
                    cell.colSpan = 5;
                    cell.textContent = 'Позиции и цены автоматически подставляются из CRM';
                    row.appendChild(cell);
                    fragment.appendChild(row);
                } else {
                    const chip = doc.createElement('span');
                    chip.className = 'crm-template-token';
                    chip.dataset.crmTemplateToken = token;
                    chip.contentEditable = 'false';
                    chip.textContent = token.replace(/_/g, ' ');
                    chip.title = 'Заполняется автоматически';
                    fragment.appendChild(chip);
                }
                lastIndex = pattern.lastIndex;
            }
            const after = value.slice(lastIndex);
            if (after) fragment.appendChild(doc.createTextNode(after));
            node.parentNode.replaceChild(fragment, node);
        });
    }

    function injectEditorStyles(doc){
        const style = doc.createElement('style');
        style.setAttribute('data-template-editor-style', 'true');
        style.textContent = [
            '.crm-template-token{display:inline-block;padding:1px 5px;border-radius:4px;background:#fff0ba;color:#765413;font:700 8pt Arial,sans-serif;line-height:1.35;white-space:nowrap;vertical-align:baseline;cursor:default;-webkit-user-select:none;user-select:none}',
            '.crm-template-dynamic-row td{padding:8px!important;background:#fff0ba!important;color:#765413!important;border:1px dashed #d4ad4c!important;text-align:center!important;font:700 8pt Arial,sans-serif!important}',
            'body[contenteditable="true"]{outline:0;caret-color:#b9040a}',
            'body[contenteditable="true"] .crm-template-token,body[contenteditable="true"] .crm-template-dynamic-row{cursor:not-allowed}',
            'body.template-editor-preview .crm-template-token{background:#fff0ba;color:#765413}'
        ].join('');
        doc.head.appendChild(style);
    }

    function setFrameMode(){
        if (!frame.contentDocument || !frame.contentDocument.body) return;
        const body = frame.contentDocument.body;
        body.contentEditable = previewMode ? 'false' : 'true';
        body.classList.toggle('template-editor-preview', previewMode);
        previewButton.innerHTML = previewMode
            ? '<i class="bi bi-pencil-square"></i><span>Вернуться к редактированию</span>'
            : '<i class="bi bi-eye"></i><span>Предпросмотр</span>';
        document.querySelectorAll('[data-template-command]').forEach(function(button){
            button.disabled = previewMode || !frameReady;
        });
        if (blockFormat) blockFormat.disabled = previewMode || !frameReady;
    }

    function renderFrame(html){
        frameReady = false;
        saveButton.disabled = true;
        frameLoadResolve = null;
        const ready = new Promise(function(resolve){ frameLoadResolve = resolve; });
        frame.onload = function(){
            const doc = frame.contentDocument;
            if (!doc || !doc.body) {
                if (frameLoadResolve) frameLoadResolve();
                return;
            }
            injectEditorStyles(doc);
            replaceTokensWithChips(doc);
            doc.body.addEventListener('input', function(){ dirty = true; });
            doc.body.addEventListener('beforeinput', function(event){
                if (event.inputType !== 'deleteContentBackward' && event.inputType !== 'deleteContentForward') return;
                const selection = doc.getSelection();
                if (!selection || !selection.rangeCount) return;
                const range = selection.getRangeAt(0);
                const selected = range.cloneContents();
                if (selected.querySelector && selected.querySelector('[data-crm-template-token]')) {
                    event.preventDefault();
                    return;
                }
                const anchor = selection.anchorNode;
                const anchorElement = anchor && (anchor.nodeType === 1 ? anchor : anchor.parentElement);
                if (anchorElement && anchorElement.closest('[data-crm-template-token]')) {
                    event.preventDefault();
                    return;
                }
                if (!range.collapsed) return;
                let adjacent = null;
                if (anchor && anchor.nodeType === 3) {
                    if (event.inputType === 'deleteContentBackward' && selection.anchorOffset === 0) adjacent = anchor.previousSibling;
                    if (event.inputType === 'deleteContentForward' && selection.anchorOffset === anchor.nodeValue.length) adjacent = anchor.nextSibling;
                } else if (anchor && anchor.nodeType === 1) {
                    adjacent = event.inputType === 'deleteContentBackward'
                        ? anchor.childNodes[selection.anchorOffset - 1]
                        : anchor.childNodes[selection.anchorOffset];
                }
                if (adjacent && adjacent.nodeType === 1 && adjacent.matches('[data-crm-template-token]')) event.preventDefault();
            });
            frameReady = true;
            setFrameMode();
            saveButton.disabled = false;
            if (frameLoadResolve) frameLoadResolve();
        };
        frame.srcdoc = html;
        return ready;
    }

    function formatDate(value){
        if (!value) return '—';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return String(value);
        return date.toLocaleString('ru-RU', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
    }

    function renderHistory(){
        if (!revisions.length) {
            historyList.innerHTML = '<div class="template-history-empty">Для этого шаблона пока нет сохранённых редакций.</div>';
            return;
        }
        historyList.innerHTML = revisions.map(function(item){
            return '<article class="template-history-row"><div class="template-history-row-copy"><strong>Редакция '+
                escapeHtml(item.version)+' · '+escapeHtml(item.savedBy && item.savedBy.name || 'Администратор')+
                '</strong><small>'+escapeHtml(formatDate(item.savedAt))+'</small></div><button type="button" data-template-revision="'+
                escapeHtml(item.version)+'"><i class="bi bi-arrow-return-left"></i> Загрузить в редактор</button></article>';
        }).join('');
    }

    function updateVersionStatus(data){
        resetButton.disabled = !data.hasCustom;
        const stateText = data.hasCustom ? 'Сохранённый шаблон' : 'Системный шаблон';
        const changedAt = data.updatedAt ? ' · изменён ' + formatDate(data.updatedAt) : '';
        versionStatus.textContent = stateText + ' · версия ' + (data.version || 1) + changedAt;
    }

    async function loadTemplate(key){
        loading = true;
        clearNotice();
        versionStatus.textContent = 'Загрузка шаблона…';
        try{
            const data = await requestJson('/api/admin/document-templates/' + encodeURIComponent(key), { cache:'no-store' });
            activeKey = key;
            activeHtml = String(data.html || '');
            version = Number(data.version) || 1;
            revisions = Array.isArray(data.revisions) ? data.revisions : [];
            dirty = false;
            documentTabs.forEach(function(button){
                const active = button.dataset.templateKey === key;
                button.classList.toggle('active', active);
                button.setAttribute('aria-selected', active ? 'true' : 'false');
            });
            updateVersionStatus(data);
            renderHistory();
            await renderFrame(activeHtml);
        }catch(error){
            versionStatus.textContent = 'Шаблон недоступен';
            showNotice(error.message, true);
        }finally{
            loading = false;
        }
    }

    function serializeFrame(){
        if (!frameReady || !frame.contentDocument || !frame.contentDocument.body) throw new Error('Редактор ещё загружается');
        const body = frame.contentDocument.body.cloneNode(true);
        body.removeAttribute('contenteditable');
        body.classList.remove('template-editor-preview');
        body.querySelectorAll('style[data-template-editor-style]').forEach(function(style){ style.remove(); });
        body.querySelectorAll('[data-crm-template-token]').forEach(function(marker){
            const token = marker.dataset.crmTemplateToken;
            if (!/^[A-Z0-9_]+$/.test(token || '')) throw new Error('В шаблоне найден некорректный маркер поля');
            marker.replaceWith(frame.contentDocument.createTextNode('{{' + token + '}}'));
        });
        const bodyHtml = body.innerHTML;
        const withBody = activeHtml.replace(/(<body\b[^>]*>)[\s\S]*?(<\/body>)/i, function(_, open, close){
            return open + '\n' + bodyHtml + '\n' + close;
        });
        if (withBody === activeHtml && !/<body\b[^>]*>[\s\S]*?<\/body>/i.test(activeHtml)) {
            throw new Error('В шаблоне не найден блок документа');
        }
        return withBody;
    }

    async function saveTemplate(){
        if (loading) return;
        saveButton.disabled = true;
        clearNotice();
        try{
            const html = serializeFrame();
            const data = await requestJson('/api/admin/document-templates/' + encodeURIComponent(activeKey), {
                method:'PUT',
                headers:{ 'Content-Type':'application/json' },
                body:JSON.stringify({ html:html, expectedVersion:version })
            });
            activeHtml = String(data.html || html);
            version = Number(data.version) || version + 1;
            revisions = Array.isArray(data.revisions) ? data.revisions : revisions;
            dirty = false;
            updateVersionStatus(data);
            renderHistory();
            await renderFrame(activeHtml);
            showNotice('Шаблон сохранён. Новые документы будут формироваться по версии ' + version + '.', false);
        }catch(error){
            showNotice(error.message, true);
        }finally{
            saveButton.disabled = false;
        }
    }

    async function resetTemplate(){
        if (loading) return;
        if (!window.confirm('Вернуть системный шаблон для документа «' + documentNames[activeKey] + '»? Текущий вариант останется в истории версий.')) return;
        resetButton.disabled = true;
        clearNotice();
        try{
            const data = await requestJson('/api/admin/document-templates/' + encodeURIComponent(activeKey), {
                method:'DELETE',
                headers:{ 'Content-Type':'application/json' },
                body:JSON.stringify({ expectedVersion:version })
            });
            activeHtml = String(data.html || '');
            version = Number(data.version) || version;
            revisions = Array.isArray(data.revisions) ? data.revisions : revisions;
            dirty = false;
            updateVersionStatus(data);
            renderHistory();
            await renderFrame(activeHtml);
            showNotice('Для этого документа восстановлен системный шаблон.', false);
        }catch(error){
            showNotice(error.message, true);
        }finally{
            resetButton.disabled = false;
        }
    }

    async function loadRevision(revisionVersion){
        if (dirty && !window.confirm('Загрузить прежнюю редакцию? Несохранённые изменения текущего черновика будут заменены.')) return;
        clearNotice();
        try{
            const data = await requestJson('/api/admin/document-templates/' + encodeURIComponent(activeKey) + '/revisions/' + encodeURIComponent(revisionVersion), { cache:'no-store' });
            activeHtml = String(data.html || '');
            dirty = true;
            await renderFrame(activeHtml);
            showNotice('Редакция ' + revisionVersion + ' загружена в черновик. Нажмите «Сохранить», чтобы применить её как новую версию.', false);
        }catch(error){
            showNotice(error.message, true);
        }
    }

    document.addEventListener('crm:employee-section-change', function(event){
        if (event.detail && event.detail.section === 'templates' && !activeHtml && !loading) loadTemplate(activeKey);
    });

    documentTabs.forEach(function(button){
        button.addEventListener('click', function(){
            const key = button.dataset.templateKey;
            if (!key || key === activeKey) return;
            if (dirty && !window.confirm('Переключить документ? Несохранённые изменения текущего черновика будут потеряны.')) return;
            activeHtml = '';
            loadTemplate(key);
        });
    });

    document.querySelectorAll('[data-template-command]').forEach(function(button){
        button.addEventListener('click', function(){
            if (!frameReady || previewMode) return;
            const command = button.dataset.templateCommand;
            frame.contentDocument.execCommand(command, false, null);
            frame.contentWindow.focus();
            dirty = true;
        });
    });

    if (blockFormat) {
        blockFormat.addEventListener('change', function(){
            if (!frameReady || previewMode) return;
            frame.contentDocument.execCommand('formatBlock', false, blockFormat.value);
            frame.contentWindow.focus();
            dirty = true;
        });
    }

    previewButton.addEventListener('click', function(){
        if (!frameReady) return;
        previewMode = !previewMode;
        setFrameMode();
    });

    saveButton.addEventListener('click', saveTemplate);
    resetButton.addEventListener('click', resetTemplate);
    historyButton.addEventListener('click', function(){
        historyPanel.hidden = !historyPanel.hidden;
        historyButton.setAttribute('aria-expanded', historyPanel.hidden ? 'false' : 'true');
        if (!historyPanel.hidden) historyPanel.scrollIntoView({ behavior:'smooth', block:'nearest' });
    });
    historyList.addEventListener('click', function(event){
        const button = event.target.closest('[data-template-revision]');
        if (button) loadRevision(button.dataset.templateRevision);
    });

})();