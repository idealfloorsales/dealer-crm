'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const {retrieve,loadKnowledge}=require('../server/ideal-ai-knowledge');
const {salesReport,visitsReport,kpiReport}=require('../server/ideal-ai-reports');
const {install}=require('../server/ideal-ai');
test('knowledge uses the current training source, distinguishes formats, links to fixed training routes and flags inconsistent packs',()=>{
 const k=retrieve('ENGLAND HERRINGBONE 600');assert.equal(k.sources[0].title,'ENGLAND HERRINGBONE · 600×100×8 мм');assert.match(k.context,/30 \(15 A \+ 15 B\)/);assert.match(k.context,/1,8 м²/);
 const data=loadKnowledge();assert.ok(data.documents.length>5);assert.ok(data.documents.every(d=>d.url.startsWith('/knowledge.html?trainingCollection=')));
 const french=retrieve('французская елочка');assert.ok(french.sources.some(s=>/FRENCH/.test(s.title)));
 const conflict=data.documents.filter(d=>d.text.includes('не согласуются'));assert.ok(conflict.length>0);for(const d of conflict){assert.ok(!d.text.includes('Планок:'));assert.ok(!d.text.includes('Упаковка:'));}
});
test('local sales totals ignore plan pseudo rows, inactive dealers and unmatched sales, preserve custom sales, and distinguish missing plans',()=>{
 const dealers=[{_id:'a',name:'A'},{_id:'b',name:'B'},{_id:'p',name:'Potential',status:'potential'}];
 const sales=[{dealerId:'a',fact:50},{dealerId:'a',fact:10},{dealerId:'PLAN_total_all',plan:300,fact:999},{dealerId:'PLAN_vip_a',plan:300},{isCustom:true,fact:5},{dealerId:'p',fact:100}];
 const report=salesReport(dealers,sales,'2026-11',new Date('2026-11-10T06:00:00Z'));
 assert.match(report,/Факт: 65 м²/);assert.match(report,/Отклонение на дату отчёта: -35 м²/);assert.match(report,/Дилеров без продаж: 1 из 2/);assert.match(report,/записей вне текущего списка/);assert.match(report,/индивидуального плана: 1/);
 assert.match(salesReport(dealers,[],'2026-11',new Date()),/План компании: не задан/);
});
test('visit report counts only completed past visits and includes dealers never visited',()=>{
 const result=visitsReport([{name:'Never',visits:[]},{name:'Planned',visits:[{date:'2026-11-12',isCompleted:false}]},{name:'Recent',visits:[{date:'2026-11-12',isCompleted:true}]},{name:'Future',visits:[{date:'2026-12-12',isCompleted:true}]},{name:'Old',visits:[{date:'2026-10-01',isCompleted:true}]}],new Date('2026-11-13T06:00:00Z'));
 assert.match(result,/30 дней: 4/);assert.ok(!result.includes('• Recent'));assert.match(result,/Old: 43 дн./);assert.match(result,/Never: нет завершённых визитов/);
});
test('KPI report uses employee KPI calculation, never infers illiquid facts from dealer totals',()=>{
 const result=kpiReport([{employeeId:'u',sections:[{id:'sale',title:'Продажи',kind:'dealer_sales',unit:'м²',dealerTargets:[{dealerId:'a',plan:100}]},{id:'liq',title:'Неликвид',kind:'product_sales',unit:'м²',productTargets:[{productId:'p',plan:20}]}]}],[{employeeId:'u',sectionId:'liq',productId:'p',quantity:3}],[{dealerId:'a',fact:50}],[{_id:'u',fullName:'Employee'}],'2026-11');
 assert.match(result,/Продажи: 50 \/ 100 м² · 50%/);assert.match(result,/Неликвид: 3 \/ 20 м² · 15%/);
});
test('local reports reject non-admins and invalid input, do not call a provider or quota and never write CRM data',async()=>{
 const app=express();app.use(express.json());let user={id:'u',role:'manager',permissions:{}};app.use((req,res,next)=>{req.user=user;next();});let queries=0;
 const model={find(q){queries++;assert.ok(q&&typeof q==='object');return{select(){return this;},limit(){return this;},maxTimeMS(){return this;},lean:async()=>[]};}};
 install({app,env:{IDEAL_AI_ALLOW_STAFF:'true'},Dealer:model,Sales:model,User:model,employeeKpi:{Plan:model,Entry:model},connection:{collection(){throw Error('Quota accessed');}},AuditLog:{create(){throw Error('Unexpected write');}},fetcher(){throw Error('External transmission');}});
 const server=app.listen(0),base='http://127.0.0.1:'+server.address().port+'/api/ideal-ai/report';
 try{
  assert.equal((await fetch(base+'?kind=sales&month=2026-11')).status,403);assert.equal(queries,0);
  user={id:'admin',permissions:{is_admin:true}};assert.equal((await fetch(base+'?kind=sales&month[$ne]=x')).status,400);assert.equal((await fetch(base+'?kind=unknown&month=2026-11')).status,400);assert.equal(queries,0);
  for(const kind of ['sales','visits','kpi']){const r=await fetch(base+'?kind='+kind+'&month=2026-11');assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');const b=await r.json();assert.equal(b.externalProcessing,false);assert.equal(b.mode,'local-report');assert.ok(b.sources.length);}
 }finally{await new Promise(r=>server.close(r));}
});
