(async()=>{
 const assetVersion=new URL(document.currentScript?.src||location.href,location.href).searchParams.get('v')||'20261113';
 if(window.CRMAuth?.ready)await CRMAuth.ready;
 if(!window.CRMAuth?.user||!['can_view_dealers','can_create_dealer','can_edit_dealer'].some(p=>CRMAuth.can(p))||window.CRMDelivery)return;
 const style=document.createElement('link');style.rel='stylesheet';style.href='/delivery-conditions.css?v='+encodeURIComponent(assetVersion);document.head.appendChild(style);
 let items=[],canManage=false,ready=false,filterKeys=new Set(),manager=null,editing=null,originSelect=null,suspended=null,oldOverflow='',focusBefore=null,loading=null;
 const key='crm:delivery-filter:'+String(CRMAuth.user.id||'user');try{const saved=JSON.parse(localStorage.getItem(key)||'[]');if(Array.isArray(saved))filterKeys=new Set(saved.filter(x=>typeof x==='string'));}catch(_){}
 const make=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
 const button=(text,fn)=>{const b=make('button',text);b.type='button';b.addEventListener('click',fn);return b;};
 async function api(path='',body,method='POST'){const r=await fetch('/api/delivery-conditions'+path,{crmTrackLoading:false,...(body?{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});const data=await r.json().catch(()=>({}));if(!r.ok)throw Error(data.error||'Справочник условий недоступен');return data;}
 function notify(){try{localStorage.setItem(key,JSON.stringify([...filterKeys]));}catch(_){}document.dispatchEvent(new CustomEvent('crm:delivery-filter-change'));}
 function matches(value){if(!filterKeys.size)return true;const text=String(value||'');for(const token of filterKeys){if(token==='empty:'&&!text.trim())return true;if(!token.startsWith('value:'))continue;const selected=token.slice(6),item=items.find(r=>r.name===selected||r.aliases.includes(selected));if(text===selected||(item&&[item.name,...item.aliases].includes(text)))return true;}return false;}
 function fillSelect(select){const before=select.value,old=[...select.options].map(o=>({value:o.value,text:o.textContent,disabled:o.disabled}));const options=[{value:'',text:'Не указаны',disabled:false}];const seen=new Set(['']);
  for(const item of items){for(const value of [item.name,...item.aliases]){if(seen.has(value))continue;seen.add(value);const alias=value!==item.name;options.push({value,text:value+(alias?' · прежнее название':!item.active?' · архив':''),disabled:alias||!item.active});}}
  for(const o of old){if(o.value&&!seen.has(o.value)){options.push({...o,disabled:true});seen.add(o.value);}}
  if(before&&!seen.has(before))options.push({value:before,text:before+' · сохранённые условия',disabled:true});
  if(JSON.stringify(old)===JSON.stringify(options))return;
  select.replaceChildren(...options.map(o=>{const e=make('option',o.text);e.value=o.value;e.disabled=o.disabled;return e;}));select.value=before;
 }
 function bindFields(){if(!ready)return;for(const id of ['delivery','edit_delivery','profile-edit-delivery']){let field=document.getElementById(id);if(!field)continue;
  if(field.tagName!=='SELECT'){const select=make('select');select.id=id;select.className=field.className||'form-select';select.disabled=field.disabled;select.required=field.required;if(field.name)select.name=field.name;select.setAttribute('aria-label','Условия доставки');select.dataset.deliverySelect='1';if(field.value){const o=make('option',field.value);o.value=field.value;select.appendChild(o);}field.replaceWith(select);field=select;}
  fillSelect(field);field.title=field.value;if(!field.dataset.deliveryBound){field.addEventListener('change',()=>field.title=field.value);field.dataset.deliveryBound='1';}const parent=field.parentElement;if(!parent.classList.contains('delivery-field')){const wrapper=make('div',undefined,'delivery-field');field.before(wrapper);wrapper.appendChild(field);if(canManage){const gear=button('',()=>openManager(field));gear.innerHTML='<i class="bi bi-gear"></i>';gear.className='motivation-gear-btn delivery-gear';gear.title='Настроить условия доставки';gear.setAttribute('aria-label','Настроить условия доставки');wrapper.appendChild(gear);}}
  const label=field.closest('.col-md-4,.col-md-6,.mb-3')?.querySelector('label');if(label&&/^Доставка$/.test(label.textContent.trim()))label.textContent='Условия доставки';
 }}
 let filterPanel=null;
 function filterUI(){const reset=document.getElementById('dealer-reset-filters');if(!reset)return;
  if(!filterPanel){filterPanel=make('details',undefined,'delivery-filter');filterPanel.id='filter-delivery';const summary=make('summary','Все условия доставки');const popup=make('div',undefined,'delivery-filter-popup');const search=make('input');search.type='search';search.placeholder='Найти условия…';search.setAttribute('aria-label','Поиск условий доставки');const list=make('div',undefined,'delivery-filter-options');popup.append(search,list,button('Сбросить выбор',()=>{filterKeys.clear();renderFilter();notify();}));filterPanel.append(summary,popup);reset.before(filterPanel);search.addEventListener('input',()=>{const query=search.value.trim().toLowerCase();list.querySelectorAll('label').forEach(row=>row.hidden=!row.textContent.toLowerCase().includes(query));});}
  renderFilter();
 }
 function renderFilter(){if(!filterPanel)return;const list=filterPanel.querySelector('.delivery-filter-options'),choices=[{token:'empty:',name:'Не заполнено'},...items.map(i=>({token:'value:'+i.name,name:i.name+(!i.active?' · архив':'')}))];
  list.replaceChildren(...choices.map(c=>{const label=make('label'),check=make('input');check.type='checkbox';check.checked=filterKeys.has(c.token);check.addEventListener('change',()=>{check.checked?filterKeys.add(c.token):filterKeys.delete(c.token);filterPanel.querySelector('summary').textContent=filterKeys.size?'Условия доставки · '+filterKeys.size:'Все условия доставки';notify();});label.append(check,make('span',c.name));return label;}));filterPanel.querySelector('summary').textContent=filterKeys.size?'Условия доставки · '+filterKeys.size:'Все условия доставки';
 }
 async function load(){if(loading)return loading;loading=api().then(data=>{items=data.items.map(i=>({...i,aliases:Array.isArray(i.aliases)?i.aliases:[]}));canManage=data.canManage;ready=true;bindFields();filterUI();notify();return data;}).finally(()=>loading=null);return loading;}

 function ensureManager(){
  if(manager)return manager;
  manager=make('div');
  manager.className='modal fade motivation-manager-modal delivery-manager-modal';
  manager.id='delivery-manager-modal';
  manager.tabIndex=-1;
  manager.dataset.bsBackdrop='static';
  manager.innerHTML='<div class="modal-dialog modal-xl modal-dialog-scrollable modal-dialog-centered">'+
   '<div class="modal-content motivation-manager">'+
    '<div class="motivation-manager-head"><div><span>УСЛОВИЯ ДЛЯ ДИЛЕРОВ</span><h3>Условия доставки</h3><p>Создавайте свои варианты доставки и оплаты. Затем выбирайте их в карточке дилера.</p></div>'+
     '<button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Закрыть"></button></div>'+
    '<div class="motivation-manager-stats">'+
     '<article><small>Всего вариантов</small><strong data-delivery-total>0</strong></article>'+
     '<article><small>Активных</small><strong data-delivery-active>0</strong></article>'+
     '<article><small>Назначено дилерам</small><strong data-delivery-usage>0</strong></article>'+
    '</div>'+
    '<div class="motivation-manager-grid">'+
     '<section class="motivation-scheme-list-panel">'+
      '<div class="motivation-panel-head"><div><strong>Справочник условий</strong><small>Здесь только варианты, которые вы добавите сами.</small></div><button type="button" class="motivation-add-btn" data-delivery-new><i class="bi bi-plus-lg"></i> Новое</button></div>'+
      '<div class="delivery-manager-search"><input type="search" class="form-control" data-delivery-search placeholder="Найти условия…" aria-label="Поиск по условиям"></div>'+
      '<div class="motivation-scheme-list" data-delivery-rows></div>'+
     '</section>'+
     '<section class="motivation-editor-panel">'+
      '<div class="motivation-editor-title"><span data-delivery-kicker>НОВЫЙ ВАРИАНТ</span><h4 data-delivery-editor-title>Условия доставки</h4></div>'+
      '<form data-delivery-form>'+
       '<label><span>Условия доставки и оплаты</span><textarea data-delivery-name class="form-control" rows="5" maxlength="700" required placeholder="Введите ваш вариант условий доставки"></textarea></label>'+
       '<label class="motivation-active-toggle"><span><strong>Активен</strong><small>Доступен для выбора в карточке дилера</small></span><input type="checkbox" data-delivery-active-toggle checked></label>'+
       '<p class="delivery-manager-hint">Уже сохранённые условия дилеров не изменяются при редактировании справочника.</p>'+
       '<div class="motivation-editor-actions"><button type="button" class="btn btn-light border" data-delivery-new>Очистить</button><button type="submit" class="btn btn-dark" data-delivery-save>Сохранить</button></div>'+
       '<p data-delivery-message role="status" aria-live="polite"></p>'+
      '</form>'+
     '</section>'+
    '</div>'+
   '</div></div>';
  document.body.appendChild(manager);
  manager.querySelectorAll('[data-delivery-new]').forEach(b=>b.addEventListener('click',resetEditor));
  manager.querySelector('[data-delivery-search]').addEventListener('input',renderManager);
  manager.querySelector('[data-delivery-form]').addEventListener('submit',async e=>{
   e.preventDefault();if(!canManage)return;
   const name=manager.querySelector('[data-delivery-name]').value.trim();
   if(!name)return;
   const active=manager.querySelector('[data-delivery-active-toggle]').checked;
   const save=manager.querySelector('[data-delivery-save]'),before=save.innerHTML;
   save.disabled=true;save.innerHTML='<span class="spinner-border spinner-border-sm"></span> Сохраняем';
   try{
    await api(editing?.id?'/'+editing.id:'',{name,active},editing?.id?'PATCH':'POST');
    await load();resetEditor();renderManager();
    message('Вариант сохранён. Теперь его можно выбрать в карточке дилера.');
   }catch(err){message(err.message,true);}
   finally{save.disabled=!canManage;save.innerHTML=before;}
  });
  manager.addEventListener('hidden.bs.modal',()=>{
   document.body.classList.remove('motivation-modal-open');
   if(suspended){
    const back=suspended;suspended=null;
    bootstrap.Modal.getOrCreateInstance(back).show();
   }else if(focusBefore?.isConnected){focusBefore.focus();}
   originSelect=null;
  });
  manager.addEventListener('shown.bs.modal',()=>{
   document.body.classList.add('motivation-modal-open');
   manager.querySelector('[data-delivery-name]')?.focus();
  });
  return manager;
 }
 function message(text,error=false){
  const host=manager?.querySelector('[data-delivery-message]');
  if(host){host.textContent=text;host.classList.toggle('text-danger',error);}
 }
 function resetEditor(){
  editing=null;
  if(!manager)return;
  manager.querySelector('[data-delivery-kicker]').textContent='НОВЫЙ ВАРИАНТ';
  manager.querySelector('[data-delivery-editor-title]').textContent='Условия доставки';
  manager.querySelector('[data-delivery-name]').value='';
  manager.querySelector('[data-delivery-active-toggle]').checked=true;
  message('');
 }
 function editCondition(item){
  if(!canManage)return;
  editing=item;
  manager.querySelector('[data-delivery-kicker]').textContent='РЕДАКТИРОВАНИЕ';
  manager.querySelector('[data-delivery-editor-title]').textContent='Изменить условия';
  manager.querySelector('[data-delivery-name]').value=item.name;
  manager.querySelector('[data-delivery-active-toggle]').checked=item.active;
  message('');
  manager.querySelector('[data-delivery-name]').focus();
 }
 async function toggleCondition(item){
  if(!canManage||!item.id)return;
  if(item.active&&!confirm('Переместить условия доставки в архив? Уже назначенные дилерам значения сохранятся.'))return;
  try{
   await api('/'+encodeURIComponent(item.id),{active:!item.active},'PATCH');
   await load();renderManager();
   if(editing?.id===item.id)resetEditor();
   message(item.active?'Вариант архивирован. Данные дилеров сохранены.':'Вариант снова активен.');
  }catch(err){message(err.message,true);}
 }
 function renderManager(){
  if(!manager)return;
  const query=manager.querySelector('[data-delivery-search]').value.trim().toLowerCase();
  const filtered=items.filter(i=>[i.name,...i.aliases].join(' ').toLowerCase().includes(query));
  const list=manager.querySelector('[data-delivery-rows]');
  list.replaceChildren();
  manager.querySelector('[data-delivery-total]').textContent=items.length;
  manager.querySelector('[data-delivery-active]').textContent=items.filter(i=>i.active).length;
  manager.querySelector('[data-delivery-usage]').textContent=items.reduce((sum,i)=>sum+Number(i.usage||0),0);
  if(!filtered.length){
   list.appendChild(make('div',items.length?'По вашему запросу вариантов нет.':'Вариантов пока нет. Добавьте первый справа.','motivation-empty'));
  }
  for(const item of filtered){
   const row=make('article',undefined,'motivation-scheme-card delivery-manager-card');
   if(!item.active)row.classList.add('is-archive');
   const icon=make('div',undefined,'motivation-scheme-icon');icon.innerHTML='<i class="bi bi-truck"></i>';
   const copy=make('div',undefined,'motivation-scheme-copy');
   const heading=make('div'),name=make('strong',item.name);
   heading.appendChild(name);
   if(!item.active)heading.appendChild(make('span','архив','motivation-archive-badge'));
   copy.appendChild(heading,make('small','Дилеров: '+item.usage));
   const actions=make('div',undefined,'motivation-scheme-actions');
   if(item.active&&originSelect){
    const choose=button('',()=>{
     window.CRMDelivery.setSelected(originSelect.id,item.name);
     originSelect.dispatchEvent(new Event('change',{bubbles:true}));
     bootstrap.Modal.getOrCreateInstance(manager).hide();
    });choose.innerHTML='<i class="bi bi-check-lg"></i>';choose.title='Выбрать';choose.setAttribute('aria-label','Выбрать условия');actions.appendChild(choose);
   }
   if(canManage){
    const edit=button('',()=>editCondition(item));edit.innerHTML='<i class="bi bi-pencil"></i>';edit.title='Редактировать';edit.setAttribute('aria-label','Редактировать условия');actions.appendChild(edit);
    const toggle=button('',()=>toggleCondition(item));toggle.innerHTML=item.active?'<i class="bi bi-archive"></i>':'<i class="bi bi-arrow-counterclockwise"></i>';toggle.title=item.active?'В архив':'Восстановить';toggle.setAttribute('aria-label',toggle.title);if(item.active)toggle.classList.add('is-danger');actions.appendChild(toggle);
   }
   row.append(icon,copy,actions);list.appendChild(row);
  }
  manager.querySelectorAll('[data-delivery-form] textarea,[data-delivery-form] input,[data-delivery-form] button,[data-delivery-new]').forEach(control=>control.disabled=!canManage);
  if(!canManage)manager.querySelector('[data-delivery-kicker]').textContent='ТОЛЬКО ПРОСМОТР';
 }
 async function openManager(select){
  if(!canManage)return;
  ensureManager();
  originSelect=select;
  focusBefore=document.activeElement;
  resetEditor();
  const parent=[...document.querySelectorAll('.modal.show')].find(el=>el!==manager);
  if(parent){
   suspended=parent;
   const instance=bootstrap.Modal.getOrCreateInstance(parent);
   const done=new Promise(resolve=>parent.addEventListener('hidden.bs.modal',resolve,{once:true}));
   instance.hide();await done;
  }
  bootstrap.Modal.getOrCreateInstance(manager).show();
  renderManager();
 }
 window.CRMDelivery={matches,setSelected(id,value){const field=document.getElementById(id);if(!field)return;const text=String(value||'');if(field.tagName==='SELECT'&&text&&![...field.options].some(o=>o.value===text)){const option=make('option',text+' · сохранённые условия');option.value=text;option.disabled=true;field.appendChild(option);}field.value=text;field.title=text;},getFilter:()=>[...filterKeys],setFilter(values,dispatch=true){filterKeys=new Set(Array.isArray(values)?values:[]);renderFilter();if(dispatch)notify();},refresh:load};
 try{await load();const observer=new MutationObserver(bindFields);observer.observe(document.body,{childList:true,subtree:true});}catch(_){console.warn('Не удалось загрузить справочник условий доставки; исходные поля сохранены.');}
})();
