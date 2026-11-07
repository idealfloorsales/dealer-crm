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
    // Reminder is intentionally visible only on days 1-5. Full payout history remains on Sales.
    if(new Date().getDate() > 5) { dashboard.remove(); }
    else {
      dashboard.innerHTML='<div class="cc-panel p-3"><h3 class="h5 mb-2">Мотивация к выплате</h3><p class="text-muted small">Загрузка…</p></div>';
      try {
        await refresh(month);
        const data=await get(month);
        const pending=(data.rows||[]).filter(r=>r.status==='pending');
        if(!pending.length) dashboard.remove();
        else {
          const total=pending.reduce((s,r)=>s+Number(r.amount||0),0);
          const sqm=pending.reduce((s,r)=>s+Number(r.salesM2||0),0);
          dashboard.innerHTML='<div class="cc-panel p-3"><div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2"><div><h3 class="h5 mb-1">Мотивация к выплате</h3><small class="text-muted">Продажи за '+salesLabel+' · выплата в текущем месяце</small></div><a href="/sales.html#motivation-payouts-panel" class="btn btn-sm btn-outline-primary">Все выплаты</a></div><div class="table-responsive"><table class="table table-sm align-middle"><thead><tr><th>Дилер</th><th class="text-end">Продажи, м²</th><th class="text-end">К выплате</th></tr></thead><tbody>'+pending.map(r=>'<tr><td><strong>'+escape(r.dealerName)+'</strong><small class="d-block text-muted">'+escape(r.dealerId)+'</small></td><td class="text-end">'+fmt(r.salesM2)+'</td><td class="text-end">'+money(r.amount)+'</td></tr>').join('')+'</tbody><tfoot><tr><th>Итого ('+pending.length+')</th><th class="text-end">'+fmt(sqm)+' м²</th><th class="text-end">'+money(total)+'</th></tr></tfoot></table></div></div>';
        }
      } catch(e) { dashboard.innerHTML='<div class="cc-panel p-3 text-muted small">Не удалось загрузить мотивацию. <a href="/sales.html">Открыть выплаты</a></div>'; }
    }
  }
  if(profile) {
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
  }
});
