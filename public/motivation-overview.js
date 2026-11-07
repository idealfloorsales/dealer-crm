// Motivation payouts on dashboard and dealer profile. Payment month follows sales month.
document.addEventListener('DOMContentLoaded', async () => {
  const dashboard = document.getElementById('monthly-motivation-reminder');
  const profile = document.getElementById('dealer-motivation-history');
  if (!dashboard && !profile) return;
  if (window.CRMAuth?.ready) { try { await CRMAuth.ready; } catch (_) {} }
  if (window.CRMAuth && !CRMAuth.can('can_view_sales')) return;
  const escape = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt = v => Number(v || 0).toLocaleString('ru-RU',{maximumFractionDigits:2});
  const money = v => fmt(v) + ' ₸';
  const months = ['январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'];
  const month = new Date().getFullYear() + '-' + String(new Date().getMonth()+1).padStart(2,'0');
  const prev = new Date(new Date().getFullYear(),new Date().getMonth()-1,1);
  const salesLabel = months[prev.getMonth()];
  const status = s => s === 'paid' ? 'Выплачено' : s === 'skipped' ? 'Пропущено' : 'К выплате';
  const get = async m => {
    const response = await fetch('/api/motivation/payouts?month='+encodeURIComponent(m),{credentials:'same-origin',cache:'no-store'});
    if(!response.ok) throw new Error('Не удалось загрузить выплаты');
    return response.json();
  };
  const refresh = async m => {
    if (!window.CRMAuth || !(CRMAuth.can('can_edit_sales_fact') || CRMAuth.can('can_manage_pricing'))) return;
    const response = await fetch('/api/motivation/payouts/recalculate',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({month:m})});
    if(!response.ok) throw new Error('Не удалось пересчитать мотивацию');
  };
  if(dashboard) {
    let settings={enabled:true,startDay:1,endDay:5,hideWhenEmpty:true};
    try {const response=await fetch('/api/motivation/reminder-settings',{cache:'no-store'});if(response.ok)settings=await response.json();}catch(e){console.warn(e);}
    const canConfigure=Boolean(window.CRMAuth && (CRMAuth.can('can_manage_pricing')||CRMAuth.can('can_edit_sales_fact')));
    const day=new Date().getDate();
    if(!settings.enabled||day<settings.startDay||day>settings.endDay) { dashboard.remove(); }
    else {
      dashboard.innerHTML='<div class="cc-panel p-3"><h3 class="h5 mb-2">Мотивация к выплате</h3><p class="text-muted small">Загрузка…</p></div>';
      try {
        await refresh(month);
        const data=await get(month);
        const pending=(data.rows||[]).filter(r=>r.status==='pending');
        if(!pending.length && settings.hideWhenEmpty) dashboard.remove();
        else {
          const total=pending.reduce((s,r)=>s+Number(r.amount||0),0);
          const sqm=pending.reduce((s,r)=>s+Number(r.salesM2||0),0);
          dashboard.innerHTML='<div class="cc-panel p-3"><div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2"><div><h3 class="h5 mb-1">Мотивация к выплате</h3><small class="text-muted">Продажи за '+salesLabel+' · выплата в текущем месяце</small></div><a href="/sales.html#motivation-payouts-panel" class="btn btn-sm btn-outline-primary">Все выплаты</a></div><div class="table-responsive"><table class="table table-sm align-middle"><thead><tr><th>Дилер</th><th class="text-end">Продажи, м²</th><th class="text-end">К выплате</th></tr></thead><tbody>'+pending.map(r=>'<tr><td><strong>'+escape(r.dealerName)+'</strong><small class="d-block text-muted">'+escape(r.dealerId)+'</small></td><td class="text-end">'+fmt(r.salesM2)+'</td><td class="text-end">'+money(r.amount)+'</td></tr>').join('')+'</tbody><tfoot><tr><th>Итого ('+pending.length+')</th><th class="text-end">'+fmt(sqm)+' м²</th><th class="text-end">'+money(total)+'</th></tr></tfoot></table></div></div>';
          if(canConfigure) {
            const panel=dashboard.querySelector('.cc-panel');
            const button=document.createElement('button');
            button.className='btn btn-sm btn-outline-secondary mt-2';
            button.textContent='Настроить напоминание';
            panel.appendChild(button);
            const form=document.createElement('div');
            form.className='border rounded p-3 mt-2';
            form.hidden=true;
            form.innerHTML='<label class="form-check"><input id="mr-enabled" type="checkbox" class="form-check-input"> Показывать напоминание</label><div class="d-flex gap-2 my-2"><label>С числа<input id="mr-start" type="number" min="1" max="31" class="form-control"></label><label>По число<input id="mr-end" type="number" min="1" max="31" class="form-control"></label></div><label class="form-check"><input id="mr-empty" type="checkbox" class="form-check-input"> Скрывать, если выплат нет</label><button id="mr-save" type="button" class="btn btn-primary btn-sm mt-2">Сохранить</button><span id="mr-message" class="small ms-2"></span>';
            panel.appendChild(form);
            form.querySelector('#mr-enabled').checked=settings.enabled;
            form.querySelector('#mr-start').value=settings.startDay;
            form.querySelector('#mr-end').value=settings.endDay;
            form.querySelector('#mr-empty').checked=settings.hideWhenEmpty;
            button.addEventListener('click',()=>form.hidden=!form.hidden);
            form.querySelector('#mr-save').addEventListener('click',async()=>{
              const payload={enabled:form.querySelector('#mr-enabled').checked,startDay:Number(form.querySelector('#mr-start').value),endDay:Number(form.querySelector('#mr-end').value),hideWhenEmpty:form.querySelector('#mr-empty').checked};
              const message=form.querySelector('#mr-message');
              try {const response=await fetch('/api/motivation/reminder-settings',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const result=await response.json();if(!response.ok)throw new Error(result.error||'Ошибка');settings=result;message.textContent='Сохранено для всех пользователей';}catch(e){message.textContent=e.message;}
            });
          }
        }
      } catch(e) { dashboard.innerHTML='<div class="cc-panel p-3 text-muted small">Не удалось загрузить мотивацию. <a href="/sales.html">Открыть выплаты</a></div>'; }
    }
  }
  if(profile) document.addEventListener('crm:dealer-motivation-ready', async () => {
    const dealerId = new URLSearchParams(location.search).get('id');
    if(!dealerId) return;
    profile.innerHTML='<p class="text-muted small">Загрузка истории мотивации…</p>';
    try {
      const now=new Date();
      const periods=Array.from({length:12},(_,i)=>{const d=new Date(now.getFullYear(),now.getMonth()-i,1);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');});
      const data=await Promise.all(periods.map(get));
      const rows=data.flatMap((d,i)=>(d.rows||[]).filter(r=>String(r.dealerId)===String(profile.dataset.dealerCode || '')).map(r=>({...r,month:periods[i]})));
      if(!rows.length) {profile.innerHTML='<p class="text-muted small mb-0">Начислений и выплат за последние 12 месяцев нет.</p>';return;}
      const total=rows.reduce((s,r)=>s+Number(r.amount||0),0);
      profile.innerHTML='<div class="table-responsive"><table class="table table-sm align-middle"><thead><tr><th>Месяц выплаты</th><th class="text-end">Продажи, м²</th><th class="text-end">Мотивация</th><th>Статус</th></tr></thead><tbody>'+rows.map(r=>'<tr><td>'+escape(r.month)+'</td><td class="text-end">'+fmt(r.salesM2)+'</td><td class="text-end">'+money(r.amount)+'</td><td>'+status(r.status)+'</td></tr>').join('')+'</tbody><tfoot><tr><th>Всего</th><th></th><th class="text-end">'+money(total)+'</th><th></th></tr></tfoot></table></div>';
    } catch(e) {profile.innerHTML='<p class="text-muted small">История мотивации сейчас недоступна.</p>';}
  });
});
