'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const {install,dealerBrief,priorities,validDate,lastVisit}=require('../server/ideal-workbench');
const A='a'.repeat(24),B='b'.repeat(24),U='1'.repeat(24),V='2'.repeat(24),ADM='3'.repeat(24);
test('preparation uses selected month plan, completed visits and no inferred illiquid sales; hides restricted data',()=>{
 const now=new Date('2026-11-13T05:00:00Z'),d={_id:A,name:'Dealer',visits:[{date:'2026-11-12',isCompleted:false},{date:'2026-10-10',isCompleted:true},{date:'2026-12-10',isCompleted:true}]};
 const sales=[{month:'2026-10',dealerId:'PLAN_vip_'+A,plan:9999},{month:'2026-11',dealerId:'PLAN_vip_'+A,plan:100},{month:'2026-11',dealerId:A,fact:20}];
 const r=dealerBrief(d,sales,[],[],now);assert.match(r.summary,/Индивидуальный план: 100 м²/);assert.equal(r.lastVisit,'2026-10-10');assert.match(r.summary,/Продажи 2026-11: 20 м²/);
 const hidden=dealerBrief(d,sales,null,[],now,false);assert.ok(!hidden.summary.includes('20 м²'));assert.ok(!hidden.summary.includes('рекламации:'));assert.ok(!hidden.draft.includes('20'));
 assert.equal(validDate('2026-02-31'),false);assert.equal(validDate('2026-11-13'),true);assert.equal(lastVisit({visits:[]},'2026-11-13'),null);
});
test('daily priority orders overdue tasks first and does not fabricate sales signals without sales permission',()=>{
 const d=[{_id:A,name:'A',visits:[{date:'2026-11-12',isCompleted:true}]},{_id:B,name:'B',visits:[]}],t=[{dealerId:A,dueDate:'2026-11-12'}],now=new Date('2026-11-13T05:00:00Z');
 const r=priorities(d,[],t,now,false);assert.equal(r[0].id,A);assert.ok(r.every(x=>!x.reasons.some(s=>s.includes('продаж'))));assert.equal(priorities(d,[],[],now,true).length,2);
});
function matches(row,q){return Object.entries(q).every(([k,v])=>k==='$and'?v.every(x=>matches(row,x)):k==='$or'?v.some(x=>matches(row,x)):v&&typeof v==='object'?(v.$in? v.$in.map(String).includes(String(row[k])):v.$nin?!v.$nin.includes(row[k]):v.$ne!==undefined?row[k]!==v.$ne:v.$exists!==undefined?(row[k]!==undefined)===v.$exists:true):String(row[k])===String(v));}
const query=value=>({select(){return this;},limit(){return this;},maxTimeMS(){return this;},lean:async()=>structuredClone(value)});
test('task create is scoped, confirmed payload is idempotent, stale access cannot complete and staff cannot assign another employee',async()=>{
 const users=[{_id:U,role:'manager',scope:'a',permissions:{can_view_dealers:true,can_manage_visits:true}},{_id:V,role:'manager',scope:'b',permissions:{can_view_dealers:true,can_manage_visits:true}}];
 const dealers=[{_id:A,name:'A',zone:'a',status:'standard',visits:[]},{_id:B,name:'B',zone:'b',status:'standard',visits:[]}],tasks=[];let identity={...users[0],id:U},audit=[];
 const model=rows=>({find:q=>query(rows.filter(r=>matches(r,q))),findOne:q=>query(rows.find(r=>matches(r,q))||null)});
 const Task={...model(tasks),findOneAndUpdate(q,u){let row=tasks.find(r=>matches(r,q));if(!row){row={_id:'4'.repeat(24),...u.$setOnInsert};tasks.push(row);}return query(row);},async updateOne(q,u){const row=tasks.find(r=>matches(r,q));if(!row)return{modifiedCount:0};Object.assign(row,u.$set);return{modifiedCount:1};}};
 class Schema{index(){}}const mongoose={Schema,isValidObjectId:id=>/^[a-f0-9]{24}$/.test(String(id)),model:()=>Task};
 const scope=req=>req.user.role==='admin'?{}:{zone:req.user.scope};const hasPermission=(req,key)=>req.user.role==='admin'||req.user.permissions?.[key]===true;
 const app=express();app.use(express.json());app.use((req,res,next)=>{req.user=identity;next();});install({app,mongoose,Dealer:model(dealers),Sales:model([]),User:model(users),Reclamation:model([]),AuditLog:{create:async e=>audit.push(e)},employeeKpi:{Plan:model([]),Entry:model([])},getDealerFilter:scope,getWorkingDealerFilter:q=>q,hasPermission});
 const server=app.listen(0),base='http://127.0.0.1:'+server.address().port+'/api/workbench/';const call=(path,body)=>fetch(base+path,{...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
 const payload={dealerId:A,title:'Позвонить дилеру',dueDate:'2099-11-13',assigneeId:U,requestKey:'abcdefff-1234-1234-1234-123456789abc'};
 try{
  assert.equal((await call('dealer/'+B)).status,404);assert.equal((await call('tasks',{...payload,assigneeId:V})).status,403);assert.equal(tasks.length,0);
  assert.equal((await call('tasks',payload)).status,200);assert.equal((await call('tasks',payload)).status,200);assert.equal(tasks.length,1);
  assert.equal((await call('tasks',{...payload,title:'Другой текст'})).status,409);
  const day=await(await call('day')).json();assert.equal(day.tasks.length,1);assert.ok(day.recommendations.every(d=>d.id===A));
  identity={...identity,scope:'b'};assert.equal((await call('tasks/'+tasks[0]._id+'/complete',{})).status,404);assert.equal(tasks[0].status,'open');
  identity={...identity,scope:'a',permissions:{can_view_dealers:true,can_manage_visits:false}};assert.equal((await call('tasks/'+tasks[0]._id+'/complete',{})).status,403);
  identity={...users[0],id:U};assert.equal((await call('tasks/'+tasks[0]._id+'/complete',{})).status,200);assert.equal(tasks[0].status,'done');assert.ok(audit.some(x=>x.action==='task_complete'));
  identity={id:ADM,role:'admin',permissions:{is_admin:true}};assert.equal((await call('tasks',{...payload,requestKey:'bbcdefff-1234-1234-1234-123456789abc',assigneeId:V})).status,403);
 }finally{await new Promise(r=>server.close(r));}
});
