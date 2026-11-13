'use strict';
const {calendar}=require('./ideal-ai-reports');
const {customSummary}=require('./employee-kpi');
const fmt=v=>Number(v||0).toLocaleString('ru-RU',{maximumFractionDigits:2});
const admin=u=>u?.role==='admin'&&u.permissions?.is_admin===true;
function validDate(value){return typeof value==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;}
function lastVisit(dealer,today){return(dealer.visits||[]).filter(v=>v.isCompleted&&validDate(String(v.date||'').slice(0,10))&&String(v.date).slice(0,10)<=today).map(v=>String(v.date).slice(0,10)).sort().at(-1)||null;}
function dealerBrief(dealer,sales,complaints,tasks,now=new Date(),salesAllowed=true){
 const {month,today,day}=calendar(now),id=String(dealer._id);const plan=sales.find(s=>s.month===month&&s.dealerId==='PLAN_vip_'+id)?.plan||0;
 const fact=sales.filter(s=>s.month===month&&!s.isCustom&&s.dealerId===id).reduce((n,s)=>n+(Number(s.fact)||0),0);
 const days=new Date(Number(month.slice(0,4)),Number(month.slice(5)),0).getDate(),last=lastVisit(dealer,today);
 const lines=[dealer.name+(dealer.city?' · '+dealer.city:''),'Сводка на '+today,'Последний завершённый визит: '+(last||'не зарегистрирован')];
 if(salesAllowed){lines.push('Продажи '+month+': '+fmt(fact)+' м²','Индивидуальный план: '+(plan>0?fmt(plan)+' м²':'не задан'));if(plan>0)lines.push('Отклонение от темпа: '+fmt(fact-plan*day/days)+' м²');const prior=[...new Set(sales.filter(s=>s.dealerId===id&&s.month<month).map(s=>s.month))].sort().reverse();for(const m of prior.slice(0,2))lines.push('Продажи '+m+': '+fmt(sales.filter(s=>s.month===m&&s.dealerId===id&&!s.isCustom).reduce((n,s)=>n+(Number(s.fact)||0),0))+' м²');}
 else lines.push('Продажи скрыты: нет права просмотра.');
 const planned=(dealer.visits||[]).filter(v=>!v.isCompleted&&validDate(String(v.date||'').slice(0,10))).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
 lines.push('Запланированные визиты: '+planned.length,...planned.slice(0,4).map(v=>'• '+String(v.date).slice(0,10)+' · '+String(v.comment||'Без комментария').slice(0,300)),'Открытые задачи: '+tasks.length,...tasks.slice(0,8).map(t=>'• '+t.dueDate+' · '+t.title));
 if(complaints!==null)lines.push('Нерешённые рекламации: '+complaints.length,...complaints.slice(0,3).map(c=>'• '+String(c.productName||'Товар не указан')+' · '+String(c.description||'').slice(0,200)));
 lines.push('\nОбсудить на встрече:','• Что мешает продажам и какие декоры спрашивают покупатели?','• Достаточно ли образцов, стендов и актуальных материалов?','• Нужны ли обучение продавцов и предложение по неликвиду?','• Зафиксировать договорённости, ответственного и срок.');
 return{summary:lines.join('\n'),draft:'Здравствуйте! Хотим согласовать удобное время для встречи с '+dealer.name+'. Предлагаю обсудить продажи, востребованные декоры, образцы и обучение команды. Какие вопросы с вашей стороны включить в повестку?',suggestedTask:salesAllowed&&fact===0?'Связаться с дилером: выяснить причины отсутствия продаж':'Согласовать встречу и потребности дилера',lastVisit:last};
}
function priorities(dealers,sales,tasks,now=new Date(),salesAllowed=true){
 const {month,today}=calendar(now),fact=new Map();for(const s of sales)if(s.month===month&&!s.isCustom&&!String(s.dealerId||'').startsWith('PLAN_'))fact.set(s.dealerId,(fact.get(s.dealerId)||0)+(Number(s.fact)||0));
 return dealers.map(d=>{const reasons=[],id=String(d._id),last=lastVisit(d,today);let score=0;
 const due=tasks.filter(t=>t.dealerId===id&&t.dueDate<=today);if(due.length){score+=100;reasons.push('Задач на сегодня и просроченных: '+due.length);}
 const visits=(d.visits||[]).filter(v=>!v.isCompleted&&validDate(String(v.date||'').slice(0,10))&&String(v.date).slice(0,10)<=today);if(visits.length){score+=50;reasons.push('Ожидает визит: '+visits.length);}
 if(!last||Date.parse(today+'T00:00:00Z')-Date.parse(last+'T00:00:00Z')>=30*864e5){score+=20;reasons.push(last?'Визита не было 30 дней':'Нет завершённых визитов');}
 if(salesAllowed&&!(fact.get(id)>0)){score+=10;reasons.push('Нет продаж в '+month);}
 return{id,name:d.name,city:d.city||'',reasons,score};}).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name,'ru'));
}
async function list(model,query,select){const data=await model.find(query).select(select).limit(10001).maxTimeMS(5000).lean();if(data.length>10000)throw Error('Too many rows');return data;}
function install({app,mongoose,Dealer,Sales,User,Reclamation,AuditLog,employeeKpi,getDealerFilter,getWorkingDealerFilter,hasPermission}){
 const schema=new mongoose.Schema({dealerId:{type:String,required:true},title:{type:String,required:true},dueDate:{type:String,required:true},assigneeId:{type:String,required:true},createdBy:String,status:{type:String,enum:['open','done'],default:'open'},completedAt:Date,requestKey:{type:String,required:true}},{timestamps:true});
 schema.index({createdBy:1,requestKey:1},{unique:true});schema.index({assigneeId:1,status:1,dueDate:1});const Task=mongoose.model('IdealWorkTask',schema);
 const guard=(req,res,next)=>!req.user?.id?res.status(401).json({error:'Требуется вход'}):req.user.role==='guest'||!hasPermission(req,'can_view_dealers')?res.status(403).json({error:'Нет доступа к рабочему плану'}):(res.set('Cache-Control','no-store'),next());
 const scope=req=>getWorkingDealerFilter(getDealerFilter(req));
 async function dealer(req,id){if(!mongoose.isValidObjectId(id))throw Object.assign(Error('Некорректный дилер'),{status:400});const d=await Dealer.findOne({$and:[scope(req),{_id:id}]}).select('_id name city visits status responsible responsibleUserId').lean();if(!d)throw Object.assign(Error('Дилер недоступен'),{status:404});return d;}
 const fail=(res,e)=>res.status(e.status||503).json({error:e.status?e.message:'Не удалось выполнить действие. Повторите позже.'});
 const taskScope=(req,ids)=>({dealerId:{$in:ids},...(!admin(req.user)?{assigneeId:String(req.user.id)}:{})});
 async function salesFor(req,ids,months){if(!hasPermission(req,'can_view_sales'))return[];return list(Sales,{month:{$in:months},dealerId:{$in:[...ids,...ids.map(id=>'PLAN_vip_'+id)]}},'month dealerId fact plan isCustom');}
 function months(){const month=calendar().month,date=new Date(month+'-01T00:00:00Z'),result=[];for(let i=0;i<3;i++){result.push(date.toISOString().slice(0,7));date.setUTCMonth(date.getUTCMonth()-1);}return result;}
 app.get('/api/workbench/options',guard,async(req,res)=>{try{const users=admin(req.user)?await list(User,{isBlocked:{$ne:true},employmentStatus:{$ne:'dismissed'},role:{$nin:['guest','workshop']}},'_id fullName username'): [{_id:req.user.id,fullName:req.user.fullName||req.user.username}];res.json({canCreate:hasPermission(req,'can_manage_visits'),users:users.map(u=>({id:String(u._id),name:u.fullName||u.username})),currentUserId:String(req.user.id)});}catch(e){fail(res,e);}});
 app.get('/api/workbench/dealer/:id',guard,async(req,res)=>{try{const d=await dealer(req,req.params.id),id=String(d._id),[sales,tasks,complaints]=await Promise.all([salesFor(req,[id],months()),list(Task,{...taskScope(req,[id]),status:'open'},'_id title dueDate assigneeId'),hasPermission(req,'can_view_reclamations')?list(Reclamation,{dealerId:id,$or:[{resolution:{$exists:false}},{resolution:null},{resolution:''}]},'productName description'):null]);res.json({...dealerBrief(d,sales,complaints,tasks,new Date(),hasPermission(req,'can_view_sales')),dealer:{id,name:d.name},tasks:tasks.map(t=>({...t,id:String(t._id)})),externalProcessing:false});}catch(e){fail(res,e);}});
 app.get('/api/workbench/day',guard,async(req,res)=>{try{const d=await list(Dealer,scope(req),'_id name city visits status'),ids=d.map(d=>String(d._id)),month=calendar().month,[sales,tasks]=await Promise.all([salesFor(req,ids,[month]),list(Task,{...taskScope(req,ids),status:'open'},'_id dealerId title dueDate assigneeId')]);const recommended=priorities(d,sales,tasks,new Date(),hasPermission(req,'can_view_sales'));let kpi=[];if(hasPermission(req,'can_view_sales')){const [plans,entries]=await Promise.all([list(employeeKpi.Plan,{employeeId:String(req.user.id),month},'sections newDealerTarget salesTargets illiquidTarget'),list(employeeKpi.Entry,{employeeId:String(req.user.id),month},'sectionId type dealerId productId quantity')]);if(plans[0])kpi=customSummary(plans[0],sales,entries).map(s=>({title:s.title,fact:s.fact,plan:s.plan,unit:s.unit,percent:s.percent}));}res.json({today:calendar().today,month,total:recommended.length,recommendations:recommended.slice(0,20),tasks:tasks.sort((a,b)=>a.dueDate.localeCompare(b.dueDate)).slice(0,100).map(t=>({...t,id:String(t._id),dealerName:d.find(x=>String(x._id)===t.dealerId)?.name||''})),taskCount:tasks.length,kpi,externalProcessing:false});}catch(e){fail(res,e);}});
 app.post('/api/workbench/tasks',guard,async(req,res)=>{try{
  if(!hasPermission(req,'can_manage_visits'))return res.status(403).json({error:'Нет права создавать задачи'});
  const b=req.body||{},title=typeof b.title==='string'?b.title.trim():'';if(!title||title.length>500||!validDate(b.dueDate)||b.dueDate<calendar().today||typeof b.requestKey!=='string'||!/^[a-f0-9-]{36}$/.test(b.requestKey))return res.status(400).json({error:'Укажите задачу до 500 символов и срок не раньше сегодня'});
  const d=await dealer(req,b.dealerId),assigneeId=String(b.assigneeId||req.user.id);if(!admin(req.user)&&assigneeId!==String(req.user.id))return res.status(403).json({error:'Можно создавать задачи только себе'});
  if(!mongoose.isValidObjectId(assigneeId))return res.status(400).json({error:'Некорректный исполнитель'});
  const u=await User.findOne({_id:assigneeId,isBlocked:{$ne:true},employmentStatus:{$ne:'dismissed'}}).select('_id fullName username role scope permissions').lean();
  if(!u||u.role==='guest'||!hasPermission({user:{...u,id:String(u._id)}},'can_view_dealers'))return res.status(403).json({error:'Исполнитель недоступен'});
  const coverage=await Dealer.findOne({$and:[getDealerFilter({user:{...u,id:String(u._id)}}),{_id:d._id}]}).select('_id').lean();if(!coverage)return res.status(403).json({error:'Дилер вне зоны исполнителя'});
  const key={createdBy:String(req.user.id),requestKey:b.requestKey};let task;try{task=await Task.findOneAndUpdate(key,{$setOnInsert:{...key,dealerId:String(d._id),title,dueDate:b.dueDate,assigneeId,status:'open'}},{upsert:true,new:true,setDefaultsOnInsert:true}).lean();}catch(e){if(e.code!==11000)throw e;task=await Task.findOne(key).lean();}
  if(task.dealerId!==String(d._id)||task.title!==title||task.dueDate!==b.dueDate||task.assigneeId!==assigneeId)return res.status(409).json({error:'Этот запрос уже сохранён с другими параметрами. Обновите сводку.'});
  await AuditLog.create({actor:{id:req.user.id,name:req.user.fullName||req.user.username,role:req.user.role},module:'workbench',action:'task_create',entityType:'work_task',entityId:String(task._id),summary:'Сохранил задачу по дилеру',success:true,meta:{dealerId:String(d._id),assigneeId}}).catch(()=>{});
  res.json({ok:true,id:String(task._id)});
 }catch(e){fail(res,e);}});
 app.post('/api/workbench/tasks/:id/complete',guard,async(req,res)=>{try{
  if(!hasPermission(req,'can_manage_visits'))return res.status(403).json({error:'Нет права завершать задачи'});if(!mongoose.isValidObjectId(req.params.id))return res.status(400).json({error:'Некорректная задача'});
  const task=await Task.findOne({_id:req.params.id,...(!admin(req.user)?{assigneeId:String(req.user.id)}:{})}).lean();if(!task)return res.status(404).json({error:'Задача недоступна'});await dealer(req,task.dealerId);
  const result=await Task.updateOne({_id:task._id,status:'open'},{$set:{status:'done',completedAt:new Date()}});if(result.modifiedCount)await AuditLog.create({actor:{id:req.user.id,name:req.user.fullName||req.user.username,role:req.user.role},module:'workbench',action:'task_complete',entityType:'work_task',entityId:String(task._id),summary:'Завершил задачу',success:true}).catch(()=>{});res.json({ok:true});
 }catch(e){fail(res,e);}});
 return{Task};
}
module.exports={install,dealerBrief,priorities,validDate,lastVisit};
