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

function monthOffset(month,offset){
 const parts=String(month||'').split('-').map(Number);if(parts.length!==2||!parts[0]||!parts[1])return '';
 const d=new Date(Date.UTC(parts[0],parts[1]-1+offset,1));return d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0');
}
function salesAnalysisReport(dealers,sales,requestedMonth,now){
 const cal=calendar(now),anchor=requestedMonth>cal.month?cal.month:requestedMonth;
 const endOffset=anchor===cal.month?-1:0;
 const recentKeys=[endOffset-2,endOffset-1,endOffset].map(n=>monthOffset(anchor,n));
 const previousKeys=recentKeys.map(key=>monthOffset(key,-3));
 const yearAgoKeys=recentKeys.map(key=>monthOffset(key,-12));
 const active=dealers.filter(d=>!['potential','archive'].includes(d.status));
 const activeIds=new Set(active.map(d=>String(d._id)));
 const data=new Map();
 for(const row of sales){
  const id=String(row.dealerId||''),m=String(row.month||'');
  if(row.isCustom||id.startsWith('PLAN_')||!activeIds.has(id))continue;
  if(!data.has(id))data.set(id,{values:new Map(),present:new Set()});
  const item=data.get(id);item.present.add(m);item.values.set(m,(item.values.get(m)||0)+num(row.fact));
 }
 const avg=(map,keys)=>keys.reduce((sum,key)=>sum+(map.get(key)||0),0)/keys.length;
 const amount=values=>fmt(values);
 const eligible=[],growth=[];
 let insufficient=0,totalRecent=0,totalPrevious=0;
 for(const d of active){
  const id=String(d._id),record=data.get(id);
  if(!record){insufficient++;continue;}
  const rc=recentKeys.filter(m=>record.present.has(m)).length,pc=previousKeys.filter(m=>record.present.has(m)).length;
  if(rc<2||pc<2){insufficient++;continue;}
  const recent=avg(record.values,recentKeys),previous=avg(record.values,previousKeys);
  if(previous<=0){insufficient++;continue;}
  const change=(recent-previous)/previous*100;
  totalRecent+=recent;totalPrevious+=previous;
  const yc=yearAgoKeys.filter(m=>record.present.has(m)).length,yearAvg=avg(record.values,yearAgoKeys);
  const yearChange=yc>=2&&yearAvg>0?(recent-yearAvg)/yearAvg*100:null;
  if(change>=15)growth.push({d,change,recent});
  const severity=change<=-40?'КРИТИЧНО':change<=-20?'ПАДЕНИЕ':change<=-10?'НАБЛЮДЕНИЕ':'';
  if(!severity)continue;
  const competitors=Array.isArray(d.competitors)?d.competitors:[];
  const products=Array.isArray(d.products)?d.products:[];
  const visits=(Array.isArray(d.visits)?d.visits:[]).filter(v=>v&&v.isCompleted&&/^\\d{4}-\\d{2}-\\d{2}/.test(v.date||'')).map(v=>String(v.date).slice(0,10)).filter(v=>v<=cal.today&&!Number.isNaN(Date.parse(v+'T00:00:00Z'))).sort();
  const lastVisit=visits[visits.length-1]||null;
  const daysSince=lastVisit?Math.floor((Date.parse(cal.today+'T00:00:00Z')-Date.parse(lastVisit+'T00:00:00Z'))/86400000):null;
  const facts=[];
  const actions=[];
  if(yearChange!==null)facts.push('тот же период год назад '+(yearChange>0?'+':'')+Math.round(yearChange)+'%'+(yearChange>=-8?' (возможна сезонность)':''));
  if(competitors.length){facts.push('в карточке отмечено конкурентов: '+competitors.length);actions.push('На встрече уточнить, какие товары и условия конкурента сейчас выигрывают.');}
  if(daysSince===null||daysSince>45){facts.push(daysSince===null?'нет завершённого визита в CRM':'последний визит '+daysSince+' дн. назад');actions.push('Запланировать визит: продажи, выкладка, ценники, обратная связь продавцов.');}
  if(products.length===0){facts.push('в матрице не отмечены товары IDEAL FLOOR');actions.push('Сверить фактическую выкладку и подобрать ассортимент под магазин.');}
  if(!actions.length)actions.push('Уточнить у дилера, что изменилось в спросе, заказах, ценах и работе продавцов.');
  actions.push('Сверить условия и наличие ходовых позиций; при необходимости подготовить адресное предложение.');
  actions.push('После контакта проверить динамику заказов в следующем месяце.');
  eligible.push({d,change,recent,previous,severity,facts,actions,yearChange});
 }
 eligible.sort((a,b)=>a.change-b.change);
 growth.sort((a,b)=>b.change-a.change);
 const networkChange=totalPrevious>0?(totalRecent-totalPrevious)/totalPrevious*100:null;
 const lines=[
  'АНАЛИТИКА ПРОДАЖ IDEAL FLOOR · период до '+anchor,
  'Сравнение: последние 3 закрытых месяца ('+recentKeys[0]+'—'+recentKeys[2]+') и предыдущие 3 ('+previousKeys[0]+'—'+previousKeys[2]+').',
  'Дилеров в сети: '+active.length+' · достаточно истории для сравнения: '+(active.length-insufficient)+' · пока недостаточно истории: '+insufficient+'.',
  'Общий объём по дилерам за последние 3 месяца: '+amount(totalRecent*3)+' м²; за предыдущие 3: '+amount(totalPrevious*3)+' м²'+(networkChange===null?'':'; динамика '+(networkChange>0?'+':'')+Math.round(networkChange)+'%.'),
  'Падение от 20%: '+eligible.filter(x=>x.change<=-20).length+' · критическое от 40%: '+eligible.filter(x=>x.change<=-40).length+' · рост от 15%: '+growth.length+'.',
  '',
  'ДИЛЕРЫ, ТРЕБУЮЩИЕ ВНИМАНИЯ'
 ];
 if(!eligible.length)lines.push('Снижение от 10% не обнаружено у дилеров с достаточной историей.');
 for(const x of eligible.slice(0,20)){
  lines.push('\n• '+x.severity+' · '+x.d.name+(x.d.city?' · '+x.d.city:'')+(x.d.responsible?' · менеджер: '+x.d.responsible:''));
  lines.push('  Последние 3 месяца: '+amount(x.recent*3)+' м²; предыдущие 3: '+amount(x.previous*3)+' м²; изменение '+Math.round(x.change)+'%'+(x.yearChange===null?'':'; к тем же месяцам прошлого года '+(x.yearChange>0?'+':'')+Math.round(x.yearChange)+'%')+'.');
  if(x.facts.length)lines.push('  Сигналы CRM: '+x.facts.join('; ')+'.');
  lines.push('  План: '+x.actions.join(' '));
 }
 if(eligible.length>20)lines.push('\nПоказаны первые 20 дилеров с наибольшим снижением.');
 const groups=new Map();
 eligible.filter(x=>x.change<=-20).forEach(x=>{
  const label=[String(x.d.city||'').trim(),String(x.d.region_sector||'').trim()].filter(Boolean).join(' · ')||'Регион не указан';
  if(!groups.has(label))groups.set(label,[]);
  groups.get(label).push(x);
 });
 const regional=[...groups.entries()].filter(([,list])=>list.length>=2).sort((a,b)=>b[1].length-a[1].length);
 if(regional.length){
  lines.push('\nЛОКАЛЬНЫЕ СИГНАЛЫ');
  for(const [label,list] of regional.slice(0,8))lines.push('• '+label+': '+list.length+' дилера снизили продажи на 20% и более. Проверить общий спрос, условия конкурентов и доступность ассортимента.');
 }
 if(growth.length){
  lines.push('\nТОЧКИ РОСТА');
  for(const x of growth.slice(0,5))lines.push('• '+x.d.name+(x.d.city?' · '+x.d.city:'')+': '+(x.change>0?'+':'')+Math.round(x.change)+'%, последние 3 месяца '+amount(x.recent*3)+' м². Узнать, что сработало, и проверить, можно ли повторить подход у похожих дилеров.');
 }
 if(anchor===cal.month&&cal.day>=10){
  const currentFacts=sales.filter(row=>!row.isCustom&&!String(row.dealerId||'').startsWith('PLAN_')&&row.month===cal.month&&activeIds.has(String(row.dealerId||''))).reduce((sum,row)=>sum+num(row.fact),0);
  lines.push('\nТекущий месяц: внесено '+amount(currentFacts)+' м² на '+cal.day+' число. Темп — ориентир, не закрытый итог.');
 }
 lines.push('\nВАЖНО: падение и совпавшие сигналы не доказывают причину. Конкурент в карточке означает только его присутствие; фактическую причину должен подтвердить разговор с дилером. Разовые продажи без привязки к дилеру не входят в сетевой анализ. Продажи по артикулам не выводятся, если они не ведутся в CRM.');
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
  if(!['sales','sales-analysis','visits','kpi'].includes(kind)||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month))return res.status(400).json({error:'Выберите отчёт и корректный месяц'});
  if(!Dealer||!Sales||!User||!employeeKpi)return res.status(503).json({error:'Отчёты ещё не настроены'});
  try{
   const now=new Date();let answer,sources;
   if(kind==='sales'){const [d,s]=await Promise.all([rows(Dealer,{},'_id name city status'),rows(Sales,{month},'dealerId fact plan isCustom')]);answer=salesReport(d,s,month,now);sources=[{title:'Продажи · '+month,url:'/sales.html'}];}
   else if(kind==='sales-analysis'){const cal=calendar(now),anchor=month>cal.month?cal.month:month;const from=monthOffset(anchor,anchor===cal.month?-15:-15);const [d,s]=await Promise.all([rows(Dealer,{},'_id name city status region_sector responsible competitors visits products'),rows(Sales,{month:{$gte:from,$lte:anchor}},'month dealerId fact isCustom')]);answer=salesAnalysisReport(d,s,month,now);sources=[{title:'Аналитика продаж и карточки дилеров',url:'/sales.html'}];}
   else if(kind==='visits'){answer=visitsReport(await rows(Dealer,{},'_id name city status visits'),now);sources=[{title:'Карточки дилеров · завершённые визиты',url:'/'}];}
   else{const [p,e,s,u]=await Promise.all([rows(employeeKpi.Plan,{month},'employeeId sections newDealerTarget illiquidTarget salesTargets'),rows(employeeKpi.Entry,{month},'employeeId sectionId type dealerId productId quantity'),rows(Sales,{month},'dealerId fact isCustom'),rows(User,{},'_id fullName username')]);answer=kpiReport(p,e,s,u,month);sources=[{title:'Сотрудники · KPI · '+month,url:'/users.html'}];}
   res.json({answer,sources,mode:'local-report',generatedAt:now.toISOString(),period:kind==='visits'?calendar(now).today:month,externalProcessing:false});
  }catch(_){res.status(503).json({error:'Не удалось рассчитать полный отчёт. Рабочие данные не изменены; повторите позже.'});}
 });
}
module.exports={installReports,salesReport,salesAnalysisReport,visitsReport,kpiReport,calendar};
