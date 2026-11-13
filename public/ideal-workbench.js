(async()=>{
 if(window.CRMAuth?.ready)await CRMAuth.ready;
 if(!window.CRMAuth?.user||CRMAuth.user.role==='guest'||!CRMAuth.can('can_view_dealers')||window.__idealWorkbench)return;window.__idealWorkbench=true;
 const sheet=document.createElement('link');sheet.rel='stylesheet';sheet.href='/ideal-workbench.css';document.head.appendChild(sheet);
 function el(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
 const overlay=el('div',undefined,'workbench-overlay');overlay.hidden=true;
 overlay.innerHTML=`<section role="dialog" aria-modal="true" aria-labelledby="workbench-title" class="workbench-dialog"><header><div><small>IDEAL FLOOR · РАБОЧИЙ ПЛАН</small><h2 id="workbench-title">Мой план</h2></div><button type="button" data-wb-close aria-label="Закрыть рабочий план">×</button></header><nav><button type="button" data-wb-day>План на сегодня</button><span data-wb-local>Данные остаются в CRM</span></nav><p class="workbench-status" role="status"></p><div class="workbench-content"></div><footer>Звонки и задачи учитываются отдельно от визитов. Создание — после проверки и подтверждения. Сообщения автоматически не отправляются.</footer></section>`;
 document.body.appendChild(overlay);const content=overlay.querySelector('.workbench-content'),status=overlay.querySelector('[role=status]');let options=null,oldOverflow='',returnFocus=null,currentDealer=null,loading=0;
 async function api(url,body){const r=await fetch('/api/workbench/'+url,{crmTrackLoading:false,...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});const data=await r.json().catch(()=>({}));if(!r.ok)throw Error(data.error||'Не удалось загрузить рабочий план');return data;}
 function button(label,handler){const b=el('button',label);b.type='button';b.addEventListener('click',handler);return b;}
 function open(){if(!overlay.hidden)return;returnFocus=document.activeElement;oldOverflow=document.body.style.overflow;document.body.style.overflow='hidden';overlay.hidden=false;overlay.querySelector('[data-wb-close]').focus();}
 function close(){overlay.hidden=true;document.body.style.overflow=oldOverflow;returnFocus?.focus();}
 overlay.querySelector('[data-wb-close]').addEventListener('click',close);overlay.addEventListener('click',e=>{if(e.target===overlay)close();});overlay.querySelector('[data-wb-day]').addEventListener('click',day);
 overlay.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close();}if(e.key==='Tab'){const items=[...overlay.querySelectorAll('button,input,textarea,select,a')].filter(e=>!e.disabled&&e.getClientRects().length);const first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
 function section(title){const box=el('section',undefined,'workbench-card');box.appendChild(el('h3',title));content.appendChild(box);return box;}
 async function setup(){if(!options)options=await api('options');return options;}
 function taskList(tasks,parent){
  if(!tasks.length){parent.appendChild(el('p','Открытых задач нет.'));return;}
  for(const task of tasks){const row=el('div',undefined,'workbench-row');row.append(el('strong',task.title),el('small',task.dueDate+(task.dealerName?' · '+task.dealerName:'')));
   if(options?.canCreate)row.appendChild(button('Завершить',()=>{const confirm=button('Подтвердить выполнение',async()=>{confirm.disabled=true;try{await api('tasks/'+encodeURIComponent(task.id)+'/complete',{});currentDealer?await prepare(currentDealer):await day();status.textContent='Задача завершена.';}catch(e){status.textContent=e.message;confirm.disabled=false;}});row.appendChild(confirm);}));parent.appendChild(row);
  }
 }
 async function day(){open();currentDealer=null;const request=++loading;status.textContent='Собираю рабочий план…';content.replaceChildren();try{const [d]=await Promise.all([api('day'),setup()]);if(request!==loading)return;overlay.querySelector('h2').textContent='План на '+d.today;
  const tasks=section('Задачи · '+d.taskCount);taskList(d.tasks,tasks);if(d.taskCount>d.tasks.length)tasks.appendChild(el('small','Показаны первые '+d.tasks.length+' задач.'));
  if(d.kpi.length){const k=section('Мой KPI · '+d.month);for(const s of d.kpi)k.appendChild(el('p',s.title+': '+s.fact+' / '+s.plan+' '+s.unit+(s.percent===null?' · нет плана':' · '+s.percent+'%')));}
  const rec=section('Кому уделить внимание · '+d.total);if(!d.recommendations.length)rec.appendChild(el('p','Срочных сигналов не найдено.'));for(const item of d.recommendations){const row=el('article',undefined,'workbench-row');row.append(el('strong',item.name),el('small',item.city));for(const reason of item.reasons)row.appendChild(el('p','• '+reason));row.appendChild(button('Подготовиться к встрече',()=>prepare(item.id)));rec.appendChild(row);}if(d.total>d.recommendations.length)rec.appendChild(el('small','Показаны первые 20 по приоритету; полный список — в дилерах.'));
  status.textContent='Актуально на момент загрузки · только доступная вам зона';
 }catch(e){if(request===loading)status.textContent=e.message;}}
 async function prepare(id){open();currentDealer=id;const request=++loading;status.textContent='Готовлю сводку по дилеру…';content.replaceChildren();try{const [d]=await Promise.all([api('dealer/'+encodeURIComponent(id)),setup()]);if(request!==loading)return;overlay.querySelector('h2').textContent='Подготовка к встрече';const box=section(d.dealer.name);box.appendChild(el('p',d.summary,'workbench-summary'));
 const actions=el('div',undefined,'workbench-actions');const a=el('a','Карточка дилера');a.href='/dealer.html?id='+encodeURIComponent(id);actions.appendChild(a);if(options.canCreate)actions.appendChild(button('Создать задачу',()=>taskForm(d)));box.appendChild(actions);
 const draft=section('Черновик сообщения');draft.appendChild(el('small','Шаблон для редактирования. Отправки из CRM не будет.'));const text=el('textarea');text.value=d.draft;text.rows=5;text.setAttribute('aria-label','Черновик сообщения дилеру');draft.appendChild(text);draft.appendChild(button('Скопировать текст',async()=>{try{await navigator.clipboard.writeText(text.value);status.textContent='Черновик скопирован. Проверьте его перед отправкой.';}catch(_){text.focus();text.select();status.textContent='Выделил текст — скопируйте его вручную.';}}));taskList(d.tasks,section('Открытые задачи'));status.textContent='Сводка рассчитана в CRM · ничего не отправлено в Google';
 }catch(e){if(request===loading)status.textContent=e.message;}}
 function taskForm(d){
  const box=section('Новая задача · '+d.dealer.name),form=el('form');box.appendChild(form);
  const title=el('textarea');title.rows=3;title.maxLength=500;title.required=true;title.value=d.suggestedTask;title.setAttribute('aria-label','Что нужно сделать');
  const date=el('input');date.type='date';date.required=true;const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Almaty',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()),p=Object.fromEntries(parts.map(x=>[x.type,x.value]));date.value=date.min=p.year+'-'+p.month+'-'+p.day;date.setAttribute('aria-label','Срок задачи');
  const user=el('select');user.setAttribute('aria-label','Исполнитель');for(const u of options.users){const o=el('option',u.name);o.value=u.id;user.appendChild(o);}user.value=options.currentUserId;
  form.append(el('label','Что нужно сделать'),title,el('label','Срок'),date,el('label','Исполнитель'),user);const check=el('button','Проверить задачу');check.type='submit';form.appendChild(check);const preview=el('div',undefined,'workbench-preview');form.appendChild(preview);
  form.addEventListener('submit',e=>{e.preventDefault();if(!title.value.trim())return;const payload={dealerId:d.dealer.id,title:title.value.trim(),dueDate:date.value,assigneeId:user.value,requestKey:crypto.randomUUID()};preview.replaceChildren();preview.appendChild(el('p',payload.title+'\nСрок: '+payload.dueDate+'\nИсполнитель: '+user.selectedOptions[0].textContent));[title,date,user,check].forEach(x=>x.disabled=true);
   const save=button('Подтвердить и сохранить',async()=>{save.disabled=true;try{await api('tasks',payload);await prepare(d.dealer.id);status.textContent='Задача сохранена. Она появилась в плане исполнителя.';}catch(error){status.textContent=error.message;save.disabled=false;}});preview.append(save,button('Изменить',()=>{[title,date,user,check].forEach(x=>x.disabled=false);preview.replaceChildren();}));
  });box.scrollIntoView({block:'nearest',behavior:'smooth'});title.focus();
 }
 function addEntries(){
  const head=document.querySelector('#cc-plan-panel .cc-panel-head');if(head&&!head.querySelector('[data-wb-launch]')){const b=button('Открыть мой план',day);b.className='cc-panel-link';b.dataset.wbLaunch='';b.setAttribute('aria-haspopup','dialog');head.appendChild(b);}
  const grid=document.querySelector('.crm-mobile-sheet-grid');if(grid&&!grid.querySelector('[data-wb-launch]')){const b=button('Мой план',()=>{document.querySelector('#crm-mobile-sheet-close')?.click();day();});b.className='crm-mobile-sheet-link';b.dataset.wbLaunch='';grid.prepend(b);}
  const hero=document.querySelector('.dealer-profile-actions'),id=new URLSearchParams(location.search).get('id');if(hero&&/^[a-f\d]{24}$/i.test(id||'')&&!hero.querySelector('[data-wb-prepare]')){const b=button('Подготовиться к визиту',()=>prepare(id));b.className='dealer-hero-action';b.dataset.wbPrepare='';hero.prepend(b);}
 }
 addEntries();const observer=new MutationObserver(addEntries);observer.observe(document.body,{childList:true,subtree:true});
 window.addEventListener('ideal-workbench-open',()=>day());
})();
