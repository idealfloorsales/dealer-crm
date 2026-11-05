document.addEventListener('DOMContentLoaded', async () => {
  await window.CRMAuth?.ready;

  const $ = id => document.getElementById(id);
  const list = $('audit-list');
  const detailModal = new bootstrap.Modal($('audit-detail-modal'));
  const moduleLabels = {
    dealers:'Дилеры',matrix:'Выставленность',visits:'Визиты',products:'Матрица',sales:'Продажи',
    competitors:'Конкуренты',knowledge:'Статьи',reclamations:'Рекламации',workshop:'Цех',
    pricing:'Цены',exports:'Экспорт',users:'Сотрудники',settings:'Настройки',system:'Система'
  };
  const actionLabels = {create:'Добавление',update:'Изменение',delete:'Удаление',execute:'Операция'};
  let page=1,pages=1,items=[],metaLoaded=false;

  const esc = value => String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  const fmtDate = value => {
    const d=new Date(value);
    if(Number.isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('ru-RU',{timeZone:'Asia/Almaty',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(d);
  };
  const initials = name => String(name||'?').split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase();
  const valueText = value => {
    if(value===undefined) return '—';
    if(value===null) return 'null';
    if(typeof value==='string') return value || '""';
    try{return JSON.stringify(value,null,2)}catch(_){return String(value)}
  };

  function params(){
    const p=new URLSearchParams();
    p.set('page',String(page));p.set('limit','50');
    const map={q:$('audit-search').value.trim(),module:$('audit-module').value,action:$('audit-action').value,actorId:$('audit-actor').value,success:$('audit-success').value,from:$('audit-from').value,to:$('audit-to').value};
    Object.entries(map).forEach(([k,v])=>{if(v && v!=='all')p.set(k,v)});
    return p.toString();
  }

  function populateMeta(data){
    if(metaLoaded) return;
    const moduleSelect=$('audit-module');
    const current=moduleSelect.value;
    moduleSelect.innerHTML='<option value="all">Все разделы</option>'+(data.filters?.modules||[]).map(m=>'<option value="'+esc(m)+'">'+esc(moduleLabels[m]||m)+'</option>').join('');
    if([...moduleSelect.options].some(o=>o.value===current)) moduleSelect.value=current;
    const actor=$('audit-actor'),actorCurrent=actor.value;
    actor.innerHTML='<option value="">Все сотрудники</option>'+(data.filters?.actors||[]).map(a=>'<option value="'+esc(a.id)+'">'+esc(a.name)+'</option>').join('');
    if([...actor.options].some(o=>o.value===actorCurrent)) actor.value=actorCurrent;
    metaLoaded=true;
  }

  function render(data){
    items=data.items||[];pages=data.pages||1;page=data.page||1;
    populateMeta(data);
    $('audit-kpi-total').textContent=Number(data.total||0).toLocaleString('ru-RU');
    $('audit-kpi-day').textContent=Number(data.stats?.last24h||0).toLocaleString('ru-RU');
    $('audit-kpi-failed').textContent=Number(data.stats?.failed24h||0).toLocaleString('ru-RU');
    $('audit-kpi-users').textContent=Number(data.filters?.actors?.length||0).toLocaleString('ru-RU');
    $('audit-summary').textContent='Показано '+items.length+' из '+Number(data.total||0).toLocaleString('ru-RU');
    $('audit-page-label').textContent=page+' / '+pages;
    $('audit-prev').disabled=page<=1;$('audit-next').disabled=page>=pages;
    $('audit-search-clear').hidden=!$('audit-search').value.trim();

    if(!items.length){list.innerHTML='<div class="audit-empty"><i class="bi bi-inbox"></i><span>По текущим фильтрам записей нет</span></div>';return}
    list.innerHTML=items.map((item,index)=>{
      const actor=item.actor?.name||item.actor?.username||'Пользователь';
      const changes=Array.isArray(item.changes)?item.changes.length:0;
      return '<article class="audit-row '+(item.success===false?'is-error':'')+'" data-index="'+index+'">'+
        '<div class="audit-time"><strong>'+esc(fmtDate(item.createdAt).split(', ')[0])+'</strong><small>'+esc(fmtDate(item.createdAt).split(', ')[1]||'')+'</small></div>'+
        '<div class="audit-user"><span class="audit-avatar">'+esc(initials(actor))+'</span><strong>'+esc(actor)+'</strong><small>'+esc(item.actor?.username||item.actor?.role||'')+'</small></div>'+
        '<div class="audit-action"><strong>'+esc(item.summary||actionLabels[item.action]||'Действие')+'</strong><small>'+esc(actionLabels[item.action]||item.action||'')+(item.method?' · '+esc(item.method):'')+'</small></div>'+
        '<div><span class="audit-module">'+esc(moduleLabels[item.module]||item.module||'Система')+'</span></div>'+
        '<div class="audit-object"><strong>'+esc(item.entityLabel||item.entityType||'—')+'</strong><small>'+esc(item.path||'')+'</small>'+(changes?'<span class="audit-change-count"><i class="bi bi-pencil-square"></i>'+changes+' изм.</span>':'')+'</div>'+
        '<span class="audit-status '+(item.success===false?'is-error':'')+'">'+(item.success===false?'Ошибка':'Успешно')+'</span>'+
      '</article>';
    }).join('');
    list.querySelectorAll('[data-index]').forEach(row=>row.addEventListener('click',()=>openDetail(items[Number(row.dataset.index)])));
  }

  function openDetail(item){
    $('audit-detail-title').textContent=item.summary||'Действие';
    const actor=item.actor?.name||item.actor?.username||'Пользователь';
    const changes=Array.isArray(item.changes)?item.changes:[];
    $('audit-detail-body').innerHTML=
      '<div class="audit-detail-grid">'+
        '<div class="audit-detail-card"><small>Дата и время</small><strong>'+esc(fmtDate(item.createdAt))+'</strong></div>'+
        '<div class="audit-detail-card"><small>Сотрудник</small><strong>'+esc(actor)+'</strong></div>'+
        '<div class="audit-detail-card"><small>Раздел</small><strong>'+esc(moduleLabels[item.module]||item.module||'—')+'</strong></div>'+
        '<div class="audit-detail-card"><small>Результат</small><strong>'+(item.success===false?'Ошибка · '+esc(item.statusCode):'Успешно')+'</strong></div>'+
      '</div>'+
      (changes.length?'<div class="audit-changes"><div class="audit-changes-head">Изменённые поля · '+changes.length+'</div>'+changes.map(ch=>'<div class="audit-change"><strong>'+esc(ch.field||'поле')+'</strong><div class="audit-value">'+esc(valueText(ch.before))+'</div><div class="audit-value is-after">'+esc(valueText(ch.after))+'</div></div>').join('')+'</div>':'<div class="audit-changes"><div class="audit-changes-head">Изменённых полей не определено</div></div>')+
      '<div class="audit-json">'+
        '<details><summary>Запрос / введённые данные</summary><pre>'+esc(valueText(item.requestData))+'</pre></details>'+
        (item.before?'<details><summary>Снимок до действия</summary><pre>'+esc(valueText(item.before))+'</pre></details>':'')+
        (item.after?'<details><summary>Снимок после действия</summary><pre>'+esc(valueText(item.after))+'</pre></details>':'')+
        '<details><summary>Технические данные</summary><pre>'+esc(valueText({method:item.method,path:item.path,entityType:item.entityType,entityId:item.entityId,statusCode:item.statusCode,meta:item.meta}))+'</pre></details>'+
      '</div>';
    detailModal.show();
  }

  async function load(){
    list.innerHTML='<div class="audit-empty"><span class="spinner-border spinner-border-sm"></span>Загрузка журнала…</div>';
    try{
      const res=await fetch('/api/audit?'+params());
      const data=await res.json();
      if(!res.ok)throw new Error(data.error||'Не удалось загрузить журнал');
      render(data);
    }catch(e){
      list.innerHTML='<div class="audit-empty text-danger"><i class="bi bi-exclamation-triangle"></i><span>'+esc(e.message)+'</span></div>';
    }
  }

  let timer=null;
  $('audit-search').addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>{page=1;load()},260)});
  $('audit-search-clear').addEventListener('click',()=>{$('audit-search').value='';page=1;load();$('audit-search').focus()});
  ['audit-module','audit-action','audit-actor','audit-success','audit-from','audit-to'].forEach(id=>$(id).addEventListener('change',()=>{page=1;load()}));
  $('audit-reset').addEventListener('click',()=>{['audit-search','audit-actor','audit-success','audit-from','audit-to'].forEach(id=>$(id).value='');$('audit-module').value='all';$('audit-action').value='all';page=1;load()});
  $('audit-refresh').addEventListener('click',()=>{metaLoaded=false;load()});
  $('audit-prev').addEventListener('click',()=>{if(page>1){page--;load();window.scrollTo({top:0,behavior:'smooth'})}});
  $('audit-next').addEventListener('click',()=>{if(page<pages){page++;load();window.scrollTo({top:0,behavior:'smooth'})}});
  load();
});