'use strict';
const {customSummary}=require('./employee-kpi');
const num=v=>Number.isFinite(Number(v))?Number(v):0;
const fmt=v=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(num(v));
function calendar(now=new Date()){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Almaty',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));return{month:p.year+'-'+p.month,today:p.year+'-'+p.month+'-'+p.day,day:Number(p.day)};
}
async function rows(model,query,projection){const result=await model.find(query).select(projection).limit(10001).maxTimeMS(5000).lean();if(result.length>10000)throw Error('REPORT_TOO_LARGE');return result;}
function salesReport(dealers,sales,month,now){
 const active=dealers.filter(d=>!['potential','archive'].includes(d.status));const ids=new Set(active.map(d=>String(d._id)));
 const facts=new Map();let custom=0,unmatched=0;const plans=new Map();
 for(const s of sales){const id=String(s.dealerId||'');if(id.startsWith('PLAN_')){plans.set(id,num(s.plan));continue;}if(s.isCustom){custom+=num(s.fact);continue;}if(ids.has(id))facts.set(id,(facts.get(id)||0)+num(s.fact));else unmatched++;}
 const fact=[...facts.values()].reduce((a,b)=>a+b,0)+custom,plan=plans.get('PLAN_total_all')||0;
 const cal=calendar(now),days=new Date(Number(month.slice(0,4)),Number(month.slice(5)),0).getDate();
 const elapsed=month===cal.month?cal.day:month<cal.month?days:0;
 const expected=plan*elapsed/days;
 const lines=['Продажи · '+month,'Факт: '+fmt(fact)+' м²','План компании: '+(plan>0?fmt(plan)+' м²':'не задан')];
 if(plan>0){lines.push('Выполнение: '+fmt(fact/plan*100)+'%');if(elapsed>0){const diff=fact-expected,forecast=fact/elapsed*days,monthDiff=forecast-plan;lines.push('Отклонение на дату отчёта: '+(diff>0?'+':'')+fmt(diff)+' м²'+(expected>0?' · '+(diff>0?'+':'')+fmt(diff/expected*100)+'%':''),'Прогноз месяца: '+fmt(forecast)+' м²','Отклонение месяца по прогнозу: '+(monthDiff>0?'+':'')+fmt(monthDiff)+' м² · '+(monthDiff>0?'+':'')+fmt(monthDiff/plan*100)+'%');}}
 lines.push('В том числе разовые продажи: '+fmt(custom)+' м²');
 const noSales=active.filter(d=>!(facts.get(String(d._id))>0));lines.push('Дилеров без продаж: '+noSales.length+' из '+active.length);
 lines.push(...noSales.slice(0,12).map(d=>'• '+d.name+(d.city?' · '+d.city:'')));
 if(noSales.length>12)lines.push('Ещё '+(noSales.length-12)+' — в разделе продаж.');
 const behind=active.map(d=>({d,plan:plans.get('PLAN_vip_'+String(d._id))||0,fact:facts.get(String(d._id))||0})).filter(x=>x.plan>0&&elapsed>0&&x.fact<x.plan*elapsed/days);
 lines.push('Отстают от темпа индивидуального плана: '+behind.length,...behind.slice(0,12).map(x=>'• '+x.d.name+': '+fmt(x.fact)+' из '+fmt(x.plan)+' м²'));
 lines.push('Секторальные планы не подменяются индивидуальными планами дилеров.');
 if(unmatched)lines.push('Есть '+unmatched+' записей вне текущего списка действующих дилеров; они не включены в итог, как и на странице продаж.');
 return lines.join('\n');
}
function visitsReport(dealers,now){
 const cal=calendar(now),todayMs=Date.parse(cal.today+'T00:00:00Z');
 const list=dealers.filter(d=>!['potential','archive'].includes(d.status)).map(d=>{
  const dates=(d.visits||[]).filter(v=>v.isCompleted&&/^\d{4}-\d{2}-\d{2}/.test(v.date||'')).map(v=>String(v.date).slice(0,10)).filter(date=>date<=cal.today&&!Number.isNaN(Date.parse(date+'T00:00:00Z'))&&new Date(date+'T00:00:00Z').toISOString().slice(0,10)===date).sort();
  const last=dates.at(-1);return{d,last,days:last?Math.floor((todayMs-Date.parse(last+'T00:00:00Z'))/864e5):null};
 }).filter(x=>x.days===null||x.days>=30).sort((a,b)=>(b.days??Infinity)-(a.days??Infinity));
 return ['Визиты · на '+cal.today,'Нет завершённого визита за последние 30 дней: '+list.length,...list.slice(0,20).map(x=>'• '+x.d.name+(x.d.city?' · '+x.d.city:'')+': '+(x.last?x.days+' дн. назад ('+x.last+')':'нет завершённых визитов')),list.length>20?'Показаны первые 20; полный список — на странице дилеров.':'','Плановые и будущие визиты не считаются выполненными.'].filter(Boolean).join('\n');
}
function kpiReport(plans,entries,sales,users,month){
 const names=new Map(users.map(u=>[String(u._id),u.fullName||u.username]));const lines=['KPI сотрудников · '+month];
 if(!plans.length)lines.push('На этот месяц назначения KPI отсутствуют.');
 for(const p of plans){lines.push('\n'+(names.get(String(p.employeeId))||'Сотрудник без карточки'));const summary=customSummary(p,sales,entries.filter(e=>String(e.employeeId)===String(p.employeeId)));for(const s of summary)lines.push('• '+s.title+': '+fmt(s.fact)+' / '+fmt(s.plan)+' '+s.unit+(s.percent===null?' · план не задан':' · '+fmt(s.percent)+'%'));}
 lines.push('\nНеликвид и ручные показатели учитывают только внесённые записи; из общих продаж дилера они не выводятся.');return lines.join('\n');
}
function installReports({app,guard,Dealer,Sales,User,employeeKpi}){
 app.get('/api/ideal-ai/report',guard,async(req,res)=>{
  // Local reports remain admin-only even if staff chat is enabled later.
  if(req.user?.permissions?.is_admin!==true)return res.status(403).json({error:'Отчёты доступны администратору'});
  res.set('Cache-Control','no-store');
  const kind=req.query.kind,month=req.query.month||calendar().month;
  if(!['sales','visits','kpi'].includes(kind)||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month))return res.status(400).json({error:'Выберите отчёт и корректный месяц'});
  if(!Dealer||!Sales||!User||!employeeKpi)return res.status(503).json({error:'Отчёты ещё не настроены'});
  try{
   const now=new Date();let answer,sources;
   if(kind==='sales'){const [d,s]=await Promise.all([rows(Dealer,{},'_id name city status'),rows(Sales,{month},'dealerId fact plan isCustom')]);answer=salesReport(d,s,month,now);sources=[{title:'Продажи · '+month,url:'/sales.html'}];}
   else if(kind==='visits'){answer=visitsReport(await rows(Dealer,{},'_id name city status visits'),now);sources=[{title:'Карточки дилеров · завершённые визиты',url:'/'}];}
   else{const [p,e,s,u]=await Promise.all([rows(employeeKpi.Plan,{month},'employeeId sections newDealerTarget illiquidTarget salesTargets'),rows(employeeKpi.Entry,{month},'employeeId sectionId type dealerId productId quantity'),rows(Sales,{month},'dealerId fact isCustom'),rows(User,{},'_id fullName username')]);answer=kpiReport(p,e,s,u,month);sources=[{title:'Сотрудники · KPI · '+month,url:'/users.html'}];}
   res.json({answer,sources,mode:'local-report',generatedAt:now.toISOString(),period:kind==='visits'?calendar(now).today:month,externalProcessing:false});
  }catch(_){res.status(503).json({error:'Не удалось рассчитать полный отчёт. Рабочие данные не изменены; повторите позже.'});}
 });
}
module.exports={installReports,salesReport,visitsReport,kpiReport,calendar};
