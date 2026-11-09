(() => {
    const API = '/api/motivation';
    const state = { schemes: [], loaded:false, loading:null, manager:null, editingId:'', payoutMonth:'', payoutData:null, suspendedModal:null };

    const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
    const n = value => Number(value) || 0;
    const money = value => n(value).toLocaleString('ru-RU',{maximumFractionDigits:2}) + ' ₸';
    const sqm = value => n(value).toLocaleString('ru-RU',{maximumFractionDigits:2}) + ' м²';
    const date = value => value ? String(value).split('-').reverse().join('.') : 'без ограничения';
    const toast = (message,type='success') => window.showToast ? window.showToast(message,type) : (window.CRMUI?.toast ? CRMUI.toast(message,type) : alert(message));
    const canManage = () => Boolean(window.CRMAuth && (CRMAuth.can('can_manage_pricing') || CRMAuth.can('can_edit_sales_fact')));

    async function request(url, options={}) {
        if (window.CRMAuth?.ready) await CRMAuth.ready;
        const response = await fetch(url, { crmTrackLoading:false, ...options });
        const data = await response.json().catch(()=>({}));
        if (!response.ok) throw new Error(data.error || 'Ошибка запроса');
        return data;
    }

    async function loadSchemes(force=false, includeArchive=false) {
        if (state.loaded && !force && !includeArchive) return state.schemes;
        if (state.loading && !force && !includeArchive) return state.loading;
        const promise = request(API + '/schemes' + (includeArchive ? '?all=1' : '')).then(items => {
            const list = Array.isArray(items) ? items : [];
            if (!includeArchive) {
                state.schemes = list;
                state.loaded = true;
            }
            return list;
        }).finally(()=>{ if(!includeArchive) state.loading=null; });
        if (!includeArchive) state.loading = promise;
        return promise;
    }

    function schemeLabel(item) {
        if (!item) return 'Без мотивации';
        const period = [item.validFrom ? date(item.validFrom) : '∞', item.validTo ? date(item.validTo) : '∞'].join(' — ');
        return `${item.name} · ${n(item.ratePerM2).toLocaleString('ru-RU')} ₸/м² · ${period}`;
    }

    async function refreshSelects() {
        let schemes = [];
        try { schemes = await loadSchemes(); } catch (e) { console.warn(e); }
        document.querySelectorAll('[data-motivation-select], #motivation_scheme, #edit_motivation_scheme, #profile-edit-motivation-scheme').forEach(select => {
            if (!(select instanceof HTMLSelectElement)) return;

            if (select.dataset.motivationBound !== '1') {
                select.addEventListener('change', () => {
                    select.dataset.selected = select.value || '';
                });
                select.dataset.motivationBound = '1';
            }

            const hasExplicitSelection = select.hasAttribute('data-selected');
            const current = String(hasExplicitSelection ? (select.dataset.selected || '') : (select.value || ''));

            select.innerHTML = '<option value="">Без мотивации</option>' + schemes.map(item =>
                '<option value="' + esc(item.id) + '">' + esc(schemeLabel(item)) + '</option>'
            ).join('');

            select.value = [...select.options].some(option => option.value === current) ? current : '';
            select.dataset.selected = select.value || '';
        });
    }

    function ensureManagerModal() {
        let el = document.getElementById('motivation-manager-modal');
        if (el) return el;
        const wrapper = document.createElement('div');
        wrapper.innerHTML = `
        <div class="modal fade motivation-manager-modal" id="motivation-manager-modal" tabindex="-1" data-bs-backdrop="static">
          <div class="modal-dialog modal-xl modal-dialog-scrollable modal-dialog-centered">
            <div class="modal-content motivation-manager">
              <div class="motivation-manager-head">
                <div><span>МОТИВАЦИЯ ДИЛЕРОВ</span><h3>Схемы выплат</h3><p>Ставка за 1 м² и период действия. Схему затем можно назначить любому дилеру.</p></div>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
              </div>
              <div class="motivation-manager-stats">
                <article><small>Всего схем</small><strong id="motivation-stat-total">0</strong></article>
                <article><small>Активных</small><strong id="motivation-stat-active">0</strong></article>
                <article><small>Средняя ставка</small><strong id="motivation-stat-rate">0 ₸</strong></article>
              </div>
              <div class="motivation-manager-grid">
                <section class="motivation-scheme-list-panel">
                  <div class="motivation-panel-head"><div><strong>Справочник мотиваций</strong><small>Архивные схемы сохраняются для истории выплат.</small></div><button id="motivation-new-btn" class="motivation-add-btn" type="button"><i class="bi bi-plus-lg"></i> Новая</button></div>
                  <div id="motivation-scheme-list" class="motivation-scheme-list"><div class="motivation-empty">Загрузка…</div></div>
                </section>
                <section class="motivation-editor-panel">
                  <div class="motivation-editor-title"><span id="motivation-editor-kicker">НОВАЯ СХЕМА</span><h4 id="motivation-editor-title">Мотивация дилера</h4></div>
                  <form id="motivation-scheme-form">
                    <label><span>Название</span><input id="motivation-name" class="form-control" placeholder="Например: 100 ₸ за м²" required></label>
                    <label><span>Ставка, ₸ за 1 м²</span><input id="motivation-rate" type="number" min="0" step="1" class="form-control" placeholder="100" required></label>
                    <div class="motivation-date-grid">
                      <label><span>Действует с</span><input id="motivation-from" type="date" class="form-control"></label>
                      <label><span>Действует по</span><input id="motivation-to" type="date" class="form-control"></label>
                    </div>
                    <label><span>Комментарий</span><textarea id="motivation-note" class="form-control" rows="3" placeholder="Для какой программы или группы дилеров"></textarea></label>
                    <label class="motivation-active-toggle"><span><strong>Активна</strong><small>Можно назначать дилерам и использовать в расчёте</small></span><input id="motivation-active" type="checkbox" checked></label>
                    <div class="motivation-editor-actions"><button type="button" id="motivation-reset-btn" class="btn btn-light border">Очистить</button><button type="submit" id="motivation-save-btn" class="btn btn-dark">Сохранить</button></div>
                  </form>
                </section>
              </div>
            </div>
          </div>
        </div>`;
        el = wrapper.firstElementChild;
        document.body.appendChild(el);
        state.manager = bootstrap.Modal.getOrCreateInstance(el);
        el.querySelector('#motivation-new-btn')?.addEventListener('click', resetEditor);
        el.querySelector('#motivation-reset-btn')?.addEventListener('click', resetEditor);
        el.querySelector('#motivation-scheme-form')?.addEventListener('submit', saveScheme);
        el.querySelector('#motivation-scheme-list')?.addEventListener('click', event => {
            const edit = event.target.closest('[data-motivation-edit]');
            const archive = event.target.closest('[data-motivation-archive]');
            if (edit) editScheme(edit.dataset.motivationEdit);
            if (archive) archiveScheme(archive.dataset.motivationArchive);
        });
        el.addEventListener('hidden.bs.modal', () => {
            document.body.classList.remove('motivation-modal-open');
            if (state.suspendedModal) {
                const suspended = state.suspendedModal;
                state.suspendedModal = null;
                bootstrap.Modal.getOrCreateInstance(suspended).show();
            }
        });
        el.addEventListener('shown.bs.modal', () => {
            document.body.classList.add('motivation-modal-open');
            const grid = el.querySelector('.motivation-manager-grid');
            if (grid) grid.scrollTop = 0;
        });
        return el;
    }

    function resetEditor() {
        state.editingId = '';
        const el = ensureManagerModal();
        el.querySelector('#motivation-editor-kicker').textContent = 'НОВАЯ СХЕМА';
        el.querySelector('#motivation-editor-title').textContent = 'Мотивация дилера';
        el.querySelector('#motivation-name').value = '';
        el.querySelector('#motivation-rate').value = '';
        el.querySelector('#motivation-from').value = '';
        el.querySelector('#motivation-to').value = '';
        el.querySelector('#motivation-note').value = '';
        el.querySelector('#motivation-active').checked = true;
    }

    async function renderManager() {
        const el = ensureManagerModal();
        const listHost = el.querySelector('#motivation-scheme-list');
        listHost.innerHTML = '<div class="motivation-empty"><span class="spinner-border spinner-border-sm"></span> Загрузка…</div>';
        try {
            const items = await loadSchemes(true,true);
            el.querySelector('#motivation-stat-total').textContent = items.length;
            el.querySelector('#motivation-stat-active').textContent = items.filter(x=>x.active !== false).length;
            const rates = items.filter(x=>x.active !== false).map(x=>n(x.ratePerM2)).filter(Boolean);
            el.querySelector('#motivation-stat-rate').textContent = rates.length ? Math.round(rates.reduce((a,b)=>a+b,0)/rates.length).toLocaleString('ru-RU')+' ₸' : '0 ₸';
            if (!items.length) {
                listHost.innerHTML = '<div class="motivation-empty">Схем пока нет. Создайте первую мотивацию справа.</div>';
            } else {
                listHost.innerHTML = items.map(item => `
                  <article class="motivation-scheme-card ${item.active === false ? 'is-archive':''}">
                    <div class="motivation-scheme-icon"><i class="bi bi-cash-coin"></i></div>
                    <div class="motivation-scheme-copy"><div><strong>${esc(item.name)}</strong>${item.active === false ? '<span class="motivation-archive-badge">архив</span>':''}</div><b>${n(item.ratePerM2).toLocaleString('ru-RU')} ₸/м²</b><small>${esc(item.validFrom ? date(item.validFrom) : 'без даты начала')} — ${esc(item.validTo ? date(item.validTo) : 'без даты окончания')}</small>${item.note ? '<em>'+esc(item.note)+'</em>':''}</div>
                    <div class="motivation-scheme-actions"><button type="button" data-motivation-edit="${esc(item.id)}" title="Изменить"><i class="bi bi-pencil"></i></button>${item.active !== false ? '<button type="button" class="is-danger" data-motivation-archive="'+esc(item.id)+'" title="В архив"><i class="bi bi-archive"></i></button>':''}</div>
                  </article>`).join('');
            }
            const controls = el.querySelectorAll('#motivation-scheme-form input,#motivation-scheme-form textarea,#motivation-scheme-form button,#motivation-new-btn');
            controls.forEach(control => control.disabled = !canManage());
            if (!canManage()) el.querySelector('#motivation-editor-kicker').textContent = 'ТОЛЬКО ПРОСМОТР';
        } catch (e) {
            listHost.innerHTML = '<div class="motivation-empty text-danger">'+esc(e.message)+'</div>';
        }
    }

    async function openManager() {
        const managerEl = ensureManagerModal();
        resetEditor();

        const visibleModal = [...document.querySelectorAll('.modal.show')]
            .find(modal => modal !== managerEl);
        if (visibleModal) {
            state.suspendedModal = visibleModal;
            const instance = bootstrap.Modal.getInstance(visibleModal) || bootstrap.Modal.getOrCreateInstance(visibleModal);
            instance.hide();
            await new Promise(resolve => {
                if (!visibleModal.classList.contains('show')) return resolve();
                visibleModal.addEventListener('hidden.bs.modal', resolve, { once:true });
            });
        }

        state.manager = bootstrap.Modal.getOrCreateInstance(managerEl);
        state.manager.show();
        await renderManager();
    }

    async function editScheme(id) {
        const items = await loadSchemes(true,true);
        const item = items.find(x=>String(x.id)===String(id));
        if (!item) return;
        state.editingId = item.id;
        const el = ensureManagerModal();
        el.querySelector('#motivation-editor-kicker').textContent = 'РЕДАКТИРОВАНИЕ';
        el.querySelector('#motivation-editor-title').textContent = item.name;
        el.querySelector('#motivation-name').value = item.name || '';
        el.querySelector('#motivation-rate').value = n(item.ratePerM2) || '';
        el.querySelector('#motivation-from').value = item.validFrom || '';
        el.querySelector('#motivation-to').value = item.validTo || '';
        el.querySelector('#motivation-note').value = item.note || '';
        el.querySelector('#motivation-active').checked = item.active !== false;
    }

    async function saveScheme(event) {
        event.preventDefault();
        if (!canManage()) return;
        const el = ensureManagerModal();
        const body = {
            name:el.querySelector('#motivation-name').value.trim(),
            ratePerM2:Number(el.querySelector('#motivation-rate').value || 0),
            validFrom:el.querySelector('#motivation-from').value,
            validTo:el.querySelector('#motivation-to').value,
            note:el.querySelector('#motivation-note').value.trim(),
            active:el.querySelector('#motivation-active').checked
        };
        const button=el.querySelector('#motivation-save-btn'), old=button.innerHTML;
        try {
            button.disabled=true; button.innerHTML='<span class="spinner-border spinner-border-sm"></span> Сохраняем';
            await request(API+'/schemes'+(state.editingId?'/'+encodeURIComponent(state.editingId):''),{
                method:state.editingId?'PUT':'POST',
                headers:{'Content-Type':'application/json'},
                body:JSON.stringify(body)
            });
            state.loaded=false;
            toast(state.editingId?'Мотивация обновлена':'Мотивация создана');
            resetEditor();
            await Promise.all([renderManager(),refreshSelects()]);
        } catch(e){ toast(e.message,'error'); }
        finally{button.disabled=false;button.innerHTML=old;}
    }

    async function archiveScheme(id) {
        if (!canManage() || !confirm('Переместить эту мотивацию в архив? История выплат сохранится.')) return;
        try {
            const result=await request(API+'/schemes/'+encodeURIComponent(id),{method:'DELETE'});
            state.loaded=false;
            toast(result.assigned ? 'Мотивация архивирована. У назначенных дилеров она останется в карточке до смены схемы.' : 'Мотивация архивирована');
            await Promise.all([renderManager(),refreshSelects()]);
        } catch(e){toast(e.message,'error');}
    }

    function currentMonth() { return new Date().toISOString().slice(0,7); }
    function previousMonth() {
        const d=new Date();
        d.setDate(1);
        d.setMonth(d.getMonth()-1);
        return d.toISOString().slice(0,7);
    }

    function payoutStatusLabel(status) {
        return status==='paid'?'Выплачено':status==='skipped'?'Пропущено':'К выплате';
    }

    async function recalculatePayouts(month, silent=false) {
        if (!canManage()) return;
        const btn=document.getElementById('motivation-payout-recalc');
        const old=btn?.innerHTML;
        try {
            if(btn){btn.disabled=true;btn.innerHTML='<span class="spinner-border spinner-border-sm"></span> Считаем';}
            await request(API+'/payouts/recalculate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({month})});
            if(!silent) toast('Выплаты пересчитаны за предыдущий месяц продаж');
        } catch(e){if(!silent)toast(e.message,'error');}
        finally{if(btn){btn.disabled=false;btn.innerHTML=old;}}
    }

    async function loadPayouts(autoRecalc=false) {
        const panel=document.getElementById('motivation-payouts-panel');
        if(!panel) return;
        const picker=document.getElementById('motivation-payout-month');
        const month=picker?.value || currentMonth();
        state.payoutMonth=month;
        const host=document.getElementById('motivation-payout-list');
        if(host) host.innerHTML='<div class="motivation-payout-empty"><span class="spinner-border spinner-border-sm"></span> Загрузка…</div>';
        try {
            if(canManage()) await recalculatePayouts(month,true);
            const data=await request(API+'/payouts?month='+encodeURIComponent(month));
            state.payoutData=data;
            renderPayouts(data);
        } catch(e){
            if(host) host.innerHTML='<div class="motivation-payout-empty text-danger">'+esc(e.message)+'</div>';
        }
    }

    function renderPayouts(data) {
        const summary=data?.summary || {};
        const rows=Array.isArray(data?.rows)?data.rows:[];
        const set=(id,value)=>{const el=document.getElementById(id);if(el)el.textContent=value;};
        set('motivation-payout-count',String(rows.length));
        set('motivation-payout-sales',sqm(summary.salesM2||0));
        set('motivation-payout-pending',money(summary.pendingAmount||0));
        set('motivation-payout-paid',money(summary.paidAmount||0));
        const host=document.getElementById('motivation-payout-list');
        if(!host) return;
        if(!rows.length){
            const diag=data?.diagnostics || {};
            let detail='В список попадают только дилеры с назначенной мотивацией и фактическими продажами.';
            if(Number(diag.assigned||0)===0) {
                detail='Ни одному доступному дилеру не назначена схема мотивации.';
            } else if(Number(diag.eligible||0)===0 && Number(diag.outsidePeriod||0)>0) {
                detail='Мотивации назначены, но их сроки действия не попадают в выбранный месяц.';
            } else if(Number(diag.withSales||0)===0 && Number(diag.eligible||0)>0) {
                detail='Мотивации действовали в этом месяце, но у этих дилеров нет фактических продаж.';
            }
            host.innerHTML='<div class="motivation-payout-empty"><i class="bi bi-check2-circle"></i><strong>Выплат за этот месяц нет</strong><span>'+esc(detail)+'</span><small>Назначено мотиваций: '+Number(diag.assigned||0)+' · Действовали: '+Number(diag.eligible||0)+' · С продажами: '+Number(diag.withSales||0)+'</small></div>';
            return;
        }
        host.innerHTML=rows.map(row=>`
          <article class="motivation-payout-row status-${esc(row.status)}">
            <div class="motivation-payout-dealer"><span class="motivation-payout-status-dot"></span><div><strong>${esc(row.dealerName || 'Дилер')}</strong><small>${esc([row.dealerId,row.dealerCity].filter(Boolean).join(' · '))}</small></div></div>
            <div class="motivation-payout-cell"><small>Продажи</small><strong>${sqm(row.salesM2)}</strong></div>
            <div class="motivation-payout-cell"><small>Ставка</small><strong>${n(row.ratePerM2).toLocaleString('ru-RU')} ₸/м²</strong><span>${esc(row.schemeName||'')}</span></div>
            <div class="motivation-payout-cell is-amount"><small>К выплате</small><strong>${money(row.amount)}</strong>${row.partialPeriod?'<span class="motivation-partial">частичный период</span>':''}</div>
            <div class="motivation-payout-state"><span class="motivation-status-badge status-${esc(row.status)}">${payoutStatusLabel(row.status)}</span>${row.paidAt?'<small>'+new Date(row.paidAt).toLocaleDateString('ru-RU')+'</small>':''}</div>
            <div class="motivation-payout-actions">
              ${row.status!=='paid'?'<button type="button" class="is-paid" data-payout-status="paid" data-payout-id="'+esc(row.id)+'" title="Отметить выплаченным"><i class="bi bi-check2"></i></button>':''}
              ${row.status!=='skipped'?'<button type="button" data-payout-status="skipped" data-payout-id="'+esc(row.id)+'" title="Пропустить"><i class="bi bi-dash-circle"></i></button>':''}
              ${row.status!=='pending'?'<button type="button" data-payout-status="pending" data-payout-id="'+esc(row.id)+'" title="Вернуть к выплате"><i class="bi bi-arrow-counterclockwise"></i></button>':''}
            </div>
          </article>`).join('');
        if(!canManage()) host.querySelectorAll('button').forEach(btn=>btn.disabled=true);
    }

    function payoutMonthLabel(value) {
        const match=String(value||'').match(/^(\d{4})-(\d{2})$/);
        if(!match) return String(value||'');
        const dateValue=new Date(Number(match[1]),Number(match[2])-1,1);
        return dateValue.toLocaleDateString('ru-RU',{month:'long',year:'numeric'});
    }

    function printPayoutList() {
        const data=state.payoutData || {};
        const rows=Array.isArray(data.rows) ? data.rows : [];
        if(!rows.length){
            toast('За выбранный месяц нет мотиваций для печати','error');
            return;
        }

        const summary=data.summary || {};
        const month=state.payoutMonth || document.getElementById('motivation-payout-month')?.value || currentMonth();
        const printedAt=new Date().toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
        const statusClass=status => status==='paid'?'paid':status==='skipped'?'skipped':'pending';
        const rowsHtml=rows.map((row,index)=>`
            <tr>
                <td class="num">${index+1}</td>
                <td><strong>${esc(row.dealerName || 'Дилер')}</strong><small>${esc([row.dealerId,row.dealerCity].filter(Boolean).join(' · '))}</small></td>
                <td><strong>${esc(row.schemeName || '—')}</strong><small>${n(row.ratePerM2).toLocaleString('ru-RU',{maximumFractionDigits:2})} ₸/м²</small></td>
                <td class="right">${n(row.salesM2).toLocaleString('ru-RU',{maximumFractionDigits:2})} м²</td>
                <td class="right amount">${n(row.amount).toLocaleString('ru-RU',{maximumFractionDigits:2})} ₸</td>
                <td><span class="status ${statusClass(row.status)}">${payoutStatusLabel(row.status)}</span>${row.paidAt?'<small>'+new Date(row.paidAt).toLocaleDateString('ru-RU')+'</small>':''}</td>
            </tr>`).join('');

        const popup=window.open('','_blank','width=1120,height=800');
        if(!popup){
            toast('Браузер заблокировал окно печати. Разрешите всплывающие окна для CRM.','error');
            return;
        }
        popup.opener=null;
        popup.document.open();
        popup.document.write(`<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>Список мотивации — ${esc(payoutMonthLabel(month))}</title>
<style>
@page{size:A4 landscape;margin:10mm}
*{box-sizing:border-box}
body{margin:0;font-family:Arial,sans-serif;color:#242529;background:#fff;font-size:10px}
.header{display:flex;justify-content:space-between;gap:24px;align-items:flex-end;padding-bottom:12px;border-bottom:2px solid #a7070d}
.brand{color:#a7070d;font-size:12px;font-weight:900;letter-spacing:.08em}
h1{margin:4px 0 2px;font-size:23px;line-height:1}
.period{color:#666;font-size:11px;font-weight:700;text-transform:capitalize}
.meta{text-align:right;color:#777;line-height:1.5}
.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:12px 0}
.summary div{padding:9px 10px;border:1px solid #ddd;border-radius:8px}
.summary small,.summary strong{display:block}
.summary small{color:#888;font-size:8px;text-transform:uppercase;letter-spacing:.04em}
.summary strong{margin-top:3px;font-size:14px}
table{width:100%;border-collapse:collapse}
thead{display:table-header-group}
th{padding:7px 6px;background:#f2f0ee;border:1px solid #ddd;color:#555;text-align:left;font-size:8px;text-transform:uppercase;letter-spacing:.03em}
td{padding:7px 6px;border:1px solid #ddd;vertical-align:middle}
tr{break-inside:avoid;page-break-inside:avoid}
td strong,td small{display:block}
td small{margin-top:2px;color:#888;font-size:8px}
.num{width:30px;text-align:center;color:#888}
.right{text-align:right;white-space:nowrap}
.amount{font-weight:800}
.status{display:inline-block;padding:3px 6px;border-radius:99px;font-size:8px;font-weight:800;white-space:nowrap}
.status.pending{background:#fff3d8;color:#8a6314}
.status.paid{background:#e8f6ef;color:#20714e}
.status.skipped{background:#f0f1f2;color:#777}
.footer{display:flex;justify-content:space-between;margin-top:12px;padding-top:8px;border-top:1px solid #ddd;color:#888;font-size:8px}
@media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
</style>
</head>
<body>
<div class="header">
  <div><div class="brand">IDEAL FLOOR CRM</div><h1>Список мотивации дилеров</h1><div class="period">${esc(payoutMonthLabel(month))}</div></div>
  <div class="meta">Сформировано: ${esc(printedAt)}<br>Расчёт: ставка за 1 м² × продажи</div>
</div>
<div class="summary">
  <div><small>Дилеров</small><strong>${rows.length}</strong></div>
  <div><small>Продажи</small><strong>${n(summary.salesM2).toLocaleString('ru-RU',{maximumFractionDigits:2})} м²</strong></div>
  <div><small>К выплате</small><strong>${n(summary.pendingAmount).toLocaleString('ru-RU',{maximumFractionDigits:2})} ₸</strong></div>
  <div><small>Выплачено</small><strong>${n(summary.paidAmount).toLocaleString('ru-RU',{maximumFractionDigits:2})} ₸</strong></div>
</div>
<table>
<thead><tr><th>№</th><th>Дилер</th><th>Мотивация / ставка</th><th style="text-align:right">Продажи</th><th style="text-align:right">Сумма</th><th>Статус</th></tr></thead>
<tbody>${rowsHtml}</tbody>
</table>
<div class="footer"><span>IDEAL FLOOR · Мотивация дилеров</span><span>${esc(payoutMonthLabel(month))}</span></div>
<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),120));window.addEventListener('afterprint',()=>window.close());<\/script>
</body></html>`);
        popup.document.close();
    }

    async function setPayoutStatus(id,status) {
        if(!canManage()) return;
        let note='';
        if(status==='skipped') note=prompt('Причина, почему выплату пропускаем:','') || '';
        if(status==='paid' && !confirm('Отметить выплату как выплаченную? Сумма будет зафиксирована в истории.')) return;
        try {
            await request(API+'/payouts/'+encodeURIComponent(id),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status,note})});
            toast(status==='paid'?'Выплата отмечена как выплаченная':status==='skipped'?'Выплата пропущена':'Выплата возвращена в список');
            await loadPayouts(false);
        } catch(e){toast(e.message,'error');}
    }

    function initPayoutPanel() {
        const panel=document.getElementById('motivation-payouts-panel');
        if(!panel) return;
        const picker=document.getElementById('motivation-payout-month');
        if(picker && !picker.value) picker.value=currentMonth();
        picker?.addEventListener('change',()=>loadPayouts(canManage()));
        document.getElementById('motivation-payout-recalc')?.addEventListener('click',()=>loadPayouts(true));
        document.getElementById('motivation-payout-print')?.addEventListener('click',printPayoutList);
        document.getElementById('motivation-payout-settings')?.addEventListener('click',openManager);
        document.getElementById('motivation-payout-list')?.addEventListener('click',event=>{
            const btn=event.target.closest('[data-payout-status]');
            if(btn) setPayoutStatus(btn.dataset.payoutId,btn.dataset.payoutStatus);
        });
        loadPayouts(true);
    }

    function observeDynamicSelects() {
        const observer=new MutationObserver(mutations=>{
            if(mutations.some(m=>[...m.addedNodes].some(node=>node.nodeType===1 && (node.matches?.('[data-motivation-select],#profile-edit-motivation-scheme') || node.querySelector?.('[data-motivation-select],#profile-edit-motivation-scheme'))))) {
                refreshSelects();
            }
        });
        observer.observe(document.documentElement,{childList:true,subtree:true});
    }

    document.addEventListener('click',event=>{
        if(event.target.closest('.motivation-manager-open')) openManager();
    });

    document.addEventListener('DOMContentLoaded', async ()=>{
        await refreshSelects();
        observeDynamicSelects();
        initPayoutPanel();
    });

    window.CRMMotivation = {
        refreshSelects,
        openManager,
        loadSchemes,
        setSelected(id,value){
            const el=document.getElementById(id);
            if(!el) return;
            el.dataset.selected=String(value||'');
            refreshSelects();
        }
    };
})();