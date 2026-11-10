const crypto=require('crypto');
const {sectionsOf,customSummary,number,entryDate}=require('./employee-kpi');
const {salesForCoverage}=require('./employee-profile-stats');
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Almaty',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const literal=value=>String(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const fmt=value=>Number(value||0).toLocaleString('ru-RU',{maximumFractionDigits:2});
const admin=user=>user.role==='admin'&&user.permissions?.is_admin===true;
function dealerScope(user){if(user.role==='marketing'||user.permissions?.is_admin||user.scope==='all')return {};if(user.scope==='astana')return {responsible:'regional_astana'};if(user.scope==='regions')return {responsible:'regional_regions'};return {_id:null};}
function permitted(user,key){return admin(user)||user.permissions?.[key]===true;}
const commands=[['menu','Главное меню'],['kpi','Мой KPI и внесение факта'],['visits','Визиты и отчёты'],['dealers','Поиск дилеров'],['stock','Поиск остатков'],['summary','Сводка продаж'],['settings','Уведомления'],['cancel','Отменить ввод'],['help','Помощь'],['stop','Отключить Telegram']].map(([command,description])=>({command,description}));
function createAssistant({api,Link,User,Dealer,Product,Sales,StockImportMeta,employeeKpi,AuditLog,connection,origin,currentBot}){
 const sessions=()=>connection.collection('telegram_bot_sessions');
 const send=(chat,text,rows=[])=>api('sendMessage',{chat_id:chat,text:String(text).slice(0,4000),disable_web_page_preview:true,reply_markup:{inline_keyboard:[...rows,[{text:'☰ Меню',callback_data:'menu'},{text:'Отмена',callback_data:'cancel'}]]}});
 async function identify(chat){const link=await Link.findOne({chatId:chat,enabled:true,botId:String(currentBot()?.id)}).lean();if(!link)return null;const user=await User.findById(link.userId).select('_id fullName username role scope permissions isBlocked employmentStatus').lean();if(!user||user.isBlocked||user.employmentStatus==='dismissed')return null;return {...user,id:String(user._id||link.userId),link};}
 const reqFor=(user,body={})=>({user,query:{},body});
 async function view(chat,user,text,buttons=[],step='',data={}){
  const nonce=crypto.randomBytes(8).toString('hex'),actions=[];
  const rows=buttons.map(row=>row.map(button=>{if(button.url)return {text:button.text,url:button.url};const index=actions.push(button.action)-1;return {text:button.text.slice(0,64),callback_data:`cb:${nonce}:${index}`};}));
  await sessions().updateOne({_id:chat},{$set:{userId:user.id,nonce,actions,step,data,expiresAt:new Date(Date.now()+30*60000)}},{upsert:true});
  await send(chat,text,rows);
 }
 async function getSession(chat,user){return sessions().findOne({_id:chat,userId:user.id,expiresAt:{$gt:new Date()}});}
 async function menu(chat,user){const rows=[[{text:'🎯 Мой KPI',action:{kind:'kpi'}}]];
  if(permitted(user,'can_view_dealers'))rows.push([{text:'📍 Визиты',action:{kind:'visits'}},{text:'🔎 Дилеры',action:{kind:'dealers'}}]);
  if(permitted(user,'can_view_products'))rows.push([{text:'📦 Остатки',action:{kind:'stock'}}]);
  if(admin(user)||permitted(user,'can_view_sales'))rows.push([{text:'📊 Продажи',action:{kind:'summary'}}]);
  rows.push([{text:'🔔 Уведомления',action:{kind:'settings'}},{text:'Открыть CRM',url:origin}]);
  return view(chat,user,`IDEAL FLOOR CRM\n${user.fullName||user.username||'Сотрудник'}\n\nВыберите действие. Для поиска можно использовать /dealers название или /stock артикул.`,rows);
 }
 function requirePermission(user,key){if(!permitted(user,key))throw Error('В CRM нет прав на этот раздел.');}
 async function scopedDealer(user,id){requirePermission(user,'can_view_dealers');const dealer=await Dealer.findOne({$and:[{_id:id},dealerScope(user)]}).lean();if(!dealer)throw Error('Дилер недоступен.');return dealer;}
 async function search(chat,user,kind,query='',page=0){const stock=kind==='stock';requirePermission(user,stock?'can_view_products':'can_view_dealers');
  if(!query.trim())return view(chat,user,stock?'Введите артикул или название позиции.':'Введите название дилера, IF-код или город.',[],kind+'_query');
  query=query.trim().slice(0,100);page=Math.min(100,Math.max(0,Number(page)||0));const re=new RegExp(literal(query),'i');
  const filter=stock?{$or:[{sku:re},{name:re}]}:{$and:[dealerScope(user),{$or:[{name:re},{dealer_id:re},{city:re}]}]};
  const rows=await (stock?Product:Dealer).find(filter).select(stock?'_id sku name stock_qty':'_id name dealer_id city status').sort({name:1}).skip(page*8).limit(9).lean();
  const buttons=rows.slice(0,8).map(row=>[{text:(stock?`${row.sku||''} ${row.name} · ${fmt(row.stock_qty)}`:`${row.dealer_id||''} ${row.name} · ${row.city||''}`).slice(0,64),action:{kind:stock?'product':'dealer',id:String(row._id)}}]);
  const nav=[];if(page)nav.push({text:'← Назад',action:{kind,query,page:page-1}});if(rows.length>8)nav.push({text:'Далее →',action:{kind,query,page:page+1}});if(nav.length)buttons.push(nav);
  buttons.push([{text:'Другой поиск',action:{kind}}]);return view(chat,user,`${stock?'Остатки':'Дилеры'} · ${query}\n${rows.length?'Выберите из списка:':'Ничего не найдено.'}`,buttons);
 }
 async function product(chat,user,id){requirePermission(user,'can_view_products');const p=await Product.findById(id).select('name sku stock_qty collection characteristics').lean();if(!p)throw Error('Позиция не найдена.');const meta=await StockImportMeta.findOne({key:'free_stock'}).lean();
  return view(chat,user,`${p.name}\nАртикул: ${p.sku||'—'}\nКоллекция: ${p.collection||'—'}\nСвободный остаток: ${p.stock_qty==null?'нет данных':fmt(p.stock_qty)}\nОбновление остатков: ${meta?.importedAt?new Date(meta.importedAt).toLocaleString('ru-RU',{timeZone:'Asia/Almaty'}):'нет данных'}`,[[{text:'Матрица в CRM',url:origin+'/products.html'},{text:'Другой поиск',action:{kind:'stock'}}]]);
 }
 async function dealer(chat,user,id){const d=await scopedDealer(user,id);const contacts=(d.contacts||[]).slice(0,5).map(c=>[c.name,c.contactInfo||c.phone||c.value].filter(Boolean).join(' · ')).filter(Boolean);
  const buttons=[[{text:'Карточка в CRM',url:origin+'/dealer.html?id='+d._id}]];
  if(d.address||d.city)buttons.push([{text:'Открыть в 2ГИС',url:'https://2gis.kz/search/'+encodeURIComponent([d.city,d.address].filter(Boolean).join(', '))}]);
  if(permitted(user,'can_manage_visits'))buttons.push([{text:'✅ Отчёт о визите',action:{kind:'visit_new',id:String(d._id),completed:true}},{text:'📅 Запланировать',action:{kind:'visit_new',id:String(d._id),completed:false}}]);
  return view(chat,user,`${d.name}\n${d.dealer_id||''} · ${d.city||'Город не указан'}\n${d.address||'Адрес не указан'}\n${d.status==='potential'?'Потенциальный дилер':d.status==='archive'?'Архив':'Действующий дилер'}\n${contacts.join('\n')||'Контакты не указаны'}`,buttons);
 }
 async function kpi(chat,user){const month=today().slice(0,7),plan=await employeeKpi.Plan.findOne({employeeId:user.id,month}).lean();if(!plan)return view(chat,user,`Мой KPI · ${month}\nПлан ещё не назначен администратором.`);
  const entries=await employeeKpi.Entry.find({employeeId:user.id,month}).lean();const ids=sectionsOf(plan).filter(s=>s.kind==='dealer_sales').flatMap(s=>(s.dealerTargets||[]).map(t=>t.dealerId));
  const sales=ids.length?await Sales.find({month,dealerId:{$in:ids},isCustom:{$ne:true}}).lean():[];
  const sections=customSummary(plan,sales,entries);const text=sections.map(s=>`${s.title}\n${fmt(s.fact)} / ${fmt(s.plan)} ${s.unit} · ${s.percent==null?'план не задан':fmt(s.percent)+'%'}${s.items?.length?'\n'+s.items.slice(0,8).map(t=>`  ${t.dealerName||t.productName||t.sku}: ${fmt(t.fact)} / ${fmt(t.plan)}`).join('\n')+(s.items.length>8?'\n  … остальное в CRM':''):''}`).join('\n\n');
  const buttons=sections.filter(s=>s.kind!=='dealer_sales').map(s=>[{text:'➕ '+s.title,action:{kind:'kpi_add',sectionId:s.id}}]);buttons.push([{text:'KPI в CRM',url:origin+'/users.html'}]);return view(chat,user,`Мой KPI · ${month}\n\n${text}\n\nПродажи дилеров учитываются автоматически.${plan.note?'\nКомментарий: '+String(plan.note).slice(0,300):''}`,buttons);
 }
 async function kpiAdd(chat,user,sectionId,page=0){const month=today().slice(0,7),plan=await employeeKpi.Plan.findOne({employeeId:user.id,month}).lean(),section=sectionsOf(plan).find(s=>s.id===sectionId);if(!section||section.kind==='dealer_sales')throw Error('Пункт KPI изменён или недоступен. Откройте /kpi.');
  const data={employeeId:user.id,month,sectionId,date:today(),title:section.title};
  if(section.kind==='manual')return view(chat,user,`${section.title}\nВведите количество (${section.unit}).`,[],'kpi_quantity',data);
  let choices;if(section.kind==='opening'){
   const options=await employeeKpi.options(reqFor(user),user.id);const used=await employeeKpi.Entry.find({type:'opening',dealerId:{$in:options.openingDealers.map(d=>String(d._id))}}).select('dealerId').lean();const taken=new Set(used.map(e=>e.dealerId));
   choices=options.openingDealers.filter(d=>!taken.has(String(d._id))&&(!section.restrictSelection||(section.dealerTargets||[]).some(t=>t.dealerId===String(d._id)))).map(d=>({id:String(d._id),name:d.name}));
  }else choices=section.restrictSelection?(section.productTargets||[]).map(p=>({id:p.productId,name:[p.sku,p.productName].filter(Boolean).join(' ')})):(await Product.find({is_liquid:false,product_type:{$ne:'equipment'}}).select('_id sku name').sort({sku:1}).lean()).map(p=>({id:String(p._id),name:p.sku+' '+p.name}));
  page=Math.max(0,Math.min(Number(page)||0,Math.ceil(choices.length/8)));const buttons=choices.slice(page*8,page*8+8).map(c=>[{text:c.name,action:{kind:'kpi_pick',data:{...data,[section.kind==='opening'?'dealerId':'productId']:c.id,itemName:c.name},opening:section.kind==='opening'}}]);
  const nav=[];if(page)nav.push({text:'← Назад',action:{kind:'kpi_add',sectionId,page:page-1}});if(choices.length>(page+1)*8)nav.push({text:'Далее →',action:{kind:'kpi_add',sectionId,page:page+1}});if(nav.length)buttons.push(nav);
  return view(chat,user,`${section.title}\n${choices.length?'Выберите '+(section.kind==='opening'?'дилера':'позицию')+':':'Нет доступных позиций. Проверьте назначение в CRM.'}`,buttons);
 }
 async function confirm(chat,user,type,data){return view(chat,user,`Проверьте перед сохранением\n\n${data.title||'Визит'}\n${data.itemName||data.dealerName||''}\nДата: ${data.date}\n${type==='kpi'?'Факт: '+fmt(data.quantity):data.isCompleted?'Выполненный визит':'Запланированный визит'}\nКомментарий: ${data.note||data.comment||'—'}`,[[{text:'✅ Сохранить',action:{kind:'save',type}}]],'confirm',{type,payload:data});}
 async function visits(chat,user,page=0){requirePermission(user,'can_view_dealers');const dealers=await Dealer.find({$and:[dealerScope(user),{visits:{$elemMatch:{isCompleted:{$ne:true},date:{$lte:today()+'T23:59:59'}}}}]}).select('_id name visits').lean();
  const pending=dealers.flatMap(d=>(d.visits||[]).map((v,index)=>({d,v,index})).filter(({v})=>!v.isCompleted&&String(v.date).slice(0,10)<=today())).sort((a,b)=>String(a.v.date).localeCompare(String(b.v.date)));
  page=Math.max(0,Number(page)||0);const buttons=pending.slice(page*8,page*8+8).map(({d,v,index})=>[{text:`${String(v.date).slice(0,10)} · ${d.name}`,action:{kind:'visit_open',id:String(d._id),index,date:v.date}}]);
  const nav=[];if(page)nav.push({text:'← Назад',action:{kind:'visits',page:page-1}});if(pending.length>(page+1)*8)nav.push({text:'Далее →',action:{kind:'visits',page:page+1}});if(nav.length)buttons.push(nav);
  buttons.push([{text:'Найти дилера / новый визит',action:{kind:'dealers'}}]);return view(chat,user,`Визиты на сегодня и просроченные: ${pending.length}\nВыберите визит, чтобы посмотреть задачу и внести отчёт. Будущие визиты — в карточке дилера CRM.`,buttons);
 }
 async function visitOpen(chat,user,a){const d=await scopedDealer(user,a.id),v=d.visits?.[a.index];if(!v||v.date!==a.date||v.isCompleted)throw Error('Визит уже изменён. Обновите /visits.');return view(chat,user,`${d.name}\n${v.date}\n${v.comment||''}`,[[{text:'Карточка дилера',action:{kind:'dealer',id:a.id}}],...(permitted(user,'can_manage_visits')?[[{text:'✅ Выполнить и оставить отчёт',action:{kind:'visit_complete',id:a.id,index:a.index,date:a.date}}]]:[])]);}
 async function save(chat,user,session){
  const claimed=await sessions().findOneAndUpdate({_id:chat,userId:user.id,nonce:session.nonce,step:'confirm',expiresAt:{$gt:new Date()}},{$set:{step:'saving'}},{returnDocument:'after'});if(!claimed||('value' in claimed&&!claimed.value))throw Error('Запись уже обрабатывается. Откройте нужный раздел заново.');
  const {type,payload:data}=session.data;const op='tg_'+crypto.createHash('sha256').update(chat+':'+session.nonce).digest('hex');
  try{
   if(type==='kpi'){await employeeKpi.addEntry(reqFor(user,data),op);}
   else {
    requirePermission(user,'can_manage_visits');const d=await scopedDealer(user,data.dealerId);let filter={$and:[{_id:d._id},dealerScope(user)]},update;
    const visit={date:data.date,comment:data.comment,isCompleted:data.isCompleted,telegramEventId:op};
    if(data.index!=null){const v=d.visits?.[data.index];if(!v||v.date!==data.originalDate||v.isCompleted)throw Error('Визит уже изменён. Обновите список.');filter.$and.push({[`visits.${data.index}.date`]:data.originalDate,[`visits.${data.index}.isCompleted`]:{$ne:true}});update={$set:{[`visits.${data.index}.isCompleted`]:true,[`visits.${data.index}.comment`]:[v.comment,'Отчёт: '+data.comment].filter(Boolean).join('\n'),[`visits.${data.index}.telegramEventId`]:op}};}
    else {filter.$and.push({'visits.telegramEventId':{$ne:op}});update={$push:{visits:visit}};}
    const result=await Dealer.updateOne(filter,update);if(!result.modifiedCount)throw Error('Визит уже сохранён или изменён. Обновите список.');
    await AuditLog.create({actor:{id:user.id,name:user.fullName||user.username||''},module:'dealers',action:'telegram_visit',entityType:'dealer',entityId:String(d._id),summary:(data.isCompleted?'Внёс отчёт о визите: ':'Запланировал визит: ')+d.name,requestData:visit,success:true});
   }
   await sessions().updateOne({_id:chat,nonce:session.nonce},{$set:{step:'done'}});return send(chat,'✅ Сохранено в CRM.');
  }catch(error){await sessions().updateOne({_id:chat,nonce:session.nonce,step:'saving'},{$set:{step:'failed'}});throw error;}
 }
 async function settings(chat,user){const link=await Link.findOne({userId:user.id,enabled:true,botId:String(currentBot()?.id)}).lean();const labels={kpi:'Назначение KPI',visits:'Напоминания о визитах',reclamations:'Рекламации',stockErrors:'Ошибки импорта остатков'};return view(chat,user,'Уведомления\nНажмите на пункт, чтобы включить или выключить.',Object.entries(labels).filter(([key])=>key!=='stockErrors'||admin(user)).map(([key,label])=>[{text:(link?.preferences?.[key]===false?'🔕 ':'🔔 ')+label,action:{kind:'pref',key,value:link?.preferences?.[key]===false}}]));}
 async function summary(chat,user){requirePermission(user,'can_view_sales');const month=today().slice(0,7),scope=dealerScope(user);const dealers=await Dealer.find({$and:[scope,{status:{$nin:['potential','archive']}}]}).select('_id').lean();const zone=scope.responsible==='regional_astana'?'astana':scope.responsible==='regional_regions'?'regions':scope._id===null?'none':'all';if(zone==='none')throw Error('Нет доступной зоны продаж.');const rows=await Sales.find({month}).select('dealerId plan fact isCustom group').lean();const s=salesForCoverage(rows,dealers,zone);return view(chat,user,`Продажи · ${month}\n${zone==='all'?'Вся компания':zone==='astana'?'Астана':'Регионы'}\n\nДействующих дилеров: ${dealers.length}\nПлан: ${fmt(s.plan)} м²\nФакт: ${fmt(s.fact)} м²\nВыполнение: ${s.hasPlan?fmt(s.percent)+'%':'план не задан'}\nДо плана: ${fmt(Math.max(0,s.plan-s.fact))} м²`,[[{text:'Продажи в CRM',url:origin+'/sales.html'}]]);}
 async function action(chat,user,a,session){switch(a.kind){
  case 'kpi':return kpi(chat,user);case 'kpi_add':return kpiAdd(chat,user,a.sectionId,a.page);
  case 'kpi_pick':return view(chat,user,`${a.data.title}\n${a.data.itemName}\n${a.opening?'Введите комментарий или «-», чтобы пропустить.':'Введите количество.'}`,[],a.opening?'kpi_note':'kpi_quantity',{...a.data,quantity:a.opening?1:undefined});
  case 'dealers':case 'stock':return search(chat,user,a.kind,a.query,a.page);case 'dealer':return dealer(chat,user,a.id);case 'product':return product(chat,user,a.id);
  case 'visits':return visits(chat,user,a.page);case 'visit_open':return visitOpen(chat,user,a);
  case 'visit_new':case 'visit_complete':{requirePermission(user,'can_manage_visits');const d=await scopedDealer(user,a.id);const data={dealerId:a.id,dealerName:d.name,isCompleted:a.kind==='visit_complete'||a.completed,date:today(),...(a.kind==='visit_complete'?{index:a.index,originalDate:a.date}:{})};return view(chat,user,`${d.name}\n${data.isCompleted?'Введите отчёт о визите.':'Введите дату визита в формате ГГГГ-ММ-ДД.'}`,[],data.isCompleted?'visit_note':'visit_date',data);}
  case 'save':if(session?.step!=='confirm'||session.data.type!==a.type)throw Error('Подтверждение устарело.');return save(chat,user,session);
  case 'settings':return settings(chat,user);case 'pref':if(!['kpi','visits','reclamations','stockErrors'].includes(a.key)||(a.key==='stockErrors'&&!admin(user)))throw Error('Настройка недоступна.');await Link.updateOne({userId:user.id,enabled:true},{$set:{['preferences.'+a.key]:a.value===true}});return settings(chat,user);
  case 'summary':return summary(chat,user);default:return menu(chat,user);
 }}
 async function handle(update){const cb=update.callback_query,message=cb?.message||update.message;if(!message||message.chat?.type!=='private'||String(message.chat.id)!==String((cb?.from||message.from)?.id))return;
  const chat=String(message.chat.id);if(cb)await api('answerCallbackQuery',{callback_query_id:cb.id}).catch(()=>{});const user=await identify(chat);if(!user)return send(chat,'Подключите свою учётную запись: CRM → Сотрудники → Мой Telegram → Подключить.');
  try{
   const text=String(message.text||'').trim();
   if(cb){if(['menu','cancel'].includes(cb.data))return await menu(chat,user);const match=/^cb:([a-f0-9]{16}):(\d{1,3})$/.exec(cb.data||''),session=await getSession(chat,user);if(!match||!session||session.nonce!==match[1]||!session.actions?.[Number(match[2])])throw Error('Кнопка устарела. Откройте /menu.');return await action(chat,user,session.actions[Number(match[2])],session);}
   const command=/^\/(\w+)(?:@\w+)?(?:\s+([\s\S]*))?$/.exec(text);
   if(command){const kind=command[1];if(['menu','start','cancel'].includes(kind))return await menu(chat,user);if(kind==='help')return await view(chat,user,'Бот IDEAL FLOOR CRM\n\n/kpi — выполнение и внесение факта\n/visits — визиты и отчёты\n/dealers название — поиск дилера\n/stock артикул — свободные остатки\n/summary — план и факт продаж\n/settings — уведомления\n/cancel — отменить ввод\n/stop — отключить Telegram\n\nЗаписи сохраняются после подтверждения. Права и доступные данные берутся из CRM.');if(['kpi','visits','summary','settings','dealers','stock'].includes(kind))return await action(chat,user,{kind,query:command[2]||''});return send(chat,'Неизвестная команда. Откройте /menu.');}
   const session=await getSession(chat,user);if(!session?.step)return send(chat,'Выберите действие в /menu.');const data=session.data||{};
   if(['dealers_query','stock_query'].includes(session.step))return await search(chat,user,session.step.split('_')[0],text);
   if(session.step==='kpi_quantity'){const quantity=number(text,'количество');if(quantity<=0)throw Error('Введите количество больше нуля.');return await view(chat,user,'Введите комментарий или «-», чтобы пропустить.',[],'kpi_note',{...data,quantity});}
   if(session.step==='kpi_note')return await confirm(chat,user,'kpi',{...data,note:text==='-'?'':text.slice(0,2000)});
   if(session.step==='visit_date'){const date=entryDate(text,text.slice(0,7));if(date<today())throw Error('Для планирования выберите сегодня или будущую дату.');return await view(chat,user,'Что нужно сделать во время визита?',[],'visit_note',{...data,date});}
   if(session.step==='visit_note'){if(!text||text.length>2000)throw Error('Введите отчёт или задачу до 2000 символов.');return await confirm(chat,user,'visit',{...data,comment:text});}
   return send(chat,'Используйте кнопку подтверждения или /cancel.');
  }catch(error){const text=error.code===11000?'Этот дилер уже засчитан в KPI.':error.name==='CastError'?'Запись недоступна.':error.message;await send(chat,'Не удалось выполнить: '+text);}
 }
 return {handle,menu};
}
module.exports={createAssistant,dealerScope,permitted,literal,today,commands};
