const {test}=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const mongoose=require('mongoose');
const {monthKey,number,entryDate,canRead,summarize,registerEmployeeKpi}=require('../server/employee-kpi');
test('validates month, quantity and real calendar dates',()=>{
 assert.equal(monthKey('2026-11'),'2026-11');assert.throws(()=>monthKey('2026-13'));assert.throws(()=>monthKey('2026-1'));
 assert.equal(number('12,5','qty'),12.5);for(const v of [-1,Infinity,'bad','',null])assert.throws(()=>number(v,'qty'));
 assert.throws(()=>number(1.5,'openings',true));assert.equal(entryDate('2026-11-10','2026-11'),'2026-11-10');assert.throws(()=>entryDate('2026-11-31','2026-11'));assert.throws(()=>entryDate('2026-10-10','2026-11'));
});
test('KPI combines only assigned dealer facts and manual illiquid entries',()=>{
 const p={newDealerTarget:8,illiquidTarget:20,salesTargets:[{dealerId:'a',plan:100},{dealerId:'b',plan:200}]};
 const s=summarize(p,[{dealerId:'a',fact:30},{dealerId:'a',fact:20},{dealerId:'b',fact:250},{dealerId:'PLAN_total_all',fact:3000},{dealerId:'other',fact:999},{dealerId:'a',isCustom:true,fact:88}], [{},{}],[{quantity:12.5},{quantity:7.5}]);
 assert.deepEqual([s.newDealers.fact,s.newDealers.percent,s.sales.plan,s.sales.fact,s.sales.percent,s.illiquid.fact,s.illiquid.percent],[2,25,300,300,100,20,100]);
 assert.equal(summarize(null,[],[],[]).sales.percent,null);
});
test('self access cannot read another employee',()=>{assert.equal(canRead({id:'a'},'a',false),true);assert.equal(canRead({id:'a'},'b',false),false);assert.equal(canRead({id:'a'},'b',true),true);});
test('real routes reject plan changes and foreign KPI reads/deletes for employees',async()=>{
 const app=express();app.use(express.json());app.use((req,res,next)=>{req.user={id:'aaaaaaaaaaaaaaaaaaaaaaaa',fullName:'Manager',role:'manager'};next();});
 const models={};const fakeMongoose={Schema:mongoose.Schema,isValidObjectId:mongoose.isValidObjectId,model(name,schema){const m=name==='EmployeeKpiEntry'?{findById:()=>({lean:async()=>({employeeId:'bbbbbbbbbbbbbbbbbbbbbbbb',_id:'entry'})})}:{};models[name]={schema,m};return m;}};
 registerEmployeeKpi({app,mongoose:fakeMongoose,User:{},Dealer:{},Product:{},Sales:{},AuditLog:{},isAdminUser:()=>false,getWorkingDealerFilter:x=>x,almatyMonthKey:()=> '2026-11'});
 const server=app.listen(0);const base='http://127.0.0.1:'+server.address().port;
 try{
  assert.equal((await fetch(base+'/api/kpi/plan',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({employeeId:'aaaaaaaaaaaaaaaaaaaaaaaa',month:'2026-11',newDealerTarget:999})})).status,403);
  assert.equal((await fetch(base+'/api/kpi?employeeId=bbbbbbbbbbbbbbbbbbbbbbbb&month=2026-11')).status,403);
  assert.equal((await fetch(base+'/api/kpi/entries/entry',{method:'DELETE'})).status,403);
  const indexes=models.EmployeeKpiEntry.schema.indexes();assert.ok(indexes.some(([fields,options])=>fields.dealerId&&options.unique&&options.partialFilterExpression.type==='opening'));
  assert.ok(models.EmployeeKpiPlan.schema.indexes().some(([fields,options])=>fields.employeeId&&fields.month&&options.unique));
 }finally{await new Promise(r=>server.close(r));}
});
test('assignment, automatic dealer sales and separate manual results work end to end',async()=>{
 const adminId='aaaaaaaaaaaaaaaaaaaaaaaa',employeeId='bbbbbbbbbbbbbbbbbbbbbbbb',dealerId='dddddddddddddddddddddddd',productId='cccccccccccccccccccccccc';
 let plan=null;const entries=[],audits=[];const query=value=>({select(){return this},sort(){return this},lean:async()=>structuredClone(value)});
 const Plan={find:()=>query(plan?[plan]:[]),findOne:()=>query(plan),exists:async()=>!!plan,create:async p=>{plan={...p,_id:'plan',revision:0};return plan;},findOneAndUpdate:async(filter,update)=>{if(plan.revision!==filter.revision)return null;Object.assign(plan,update.$set);plan.revision++;return plan;}};
 const Entry={find:filter=>query(entries.filter(e=>e.employeeId===filter.employeeId&&e.month===filter.month)),create:async e=>{if(e.type==='opening'&&entries.some(x=>x.type==='opening'&&x.dealerId===e.dealerId))throw Object.assign(Error('duplicate'),{code:11000});const x={...e,_id:'record'+entries.length};entries.push(x);return x;},findById:id=>query(entries.find(e=>e._id===id)),deleteOne:async filter=>{const i=entries.findIndex(e=>e._id===filter._id);if(i>=0)entries.splice(i,1);}};
 const app=express();app.use(express.json());app.use((req,res,next)=>{req.user={id:req.headers['x-admin']?adminId:employeeId,fullName:'Test',role:req.headers['x-admin']?'admin':'manager'};next();});
 registerEmployeeKpi({app,mongoose:{Schema:mongoose.Schema,isValidObjectId:mongoose.isValidObjectId,model:name=>name==='EmployeeKpiPlan'?Plan:Entry},User:{findById:()=>query({_id:employeeId,fullName:'Test'})},Dealer:{find:()=>query([{_id:dealerId,name:'Dealer',city:'Astana'}])},Product:{find:()=>query([{_id:productId,sku:'SKU-1',name:'Product'}]),findOne:filter=>query(filter._id===productId?{_id:productId,sku:'SKU-1',name:'Product'}:null)},Sales:{find:()=>query([{dealerId,fact:120}])},AuditLog:{create:async row=>audits.push(row)},isAdminUser:req=>req.user.role==='admin',getWorkingDealerFilter:x=>x,almatyMonthKey:()=> '2026-11'});
 const server=app.listen(0),base='http://127.0.0.1:'+server.address().port;
 async function call(path,body,admin=false,method='POST'){const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(admin?{'x-admin':'1'}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,data:await response.json()};}
 try{
 const payload={employeeId,month:'2026-11',revision:null,newDealerTarget:8,illiquidTarget:50,salesTargets:[{dealerId,plan:200}],note:'Month target'};
 assert.equal((await call('/api/kpi/plan',payload,true,'PUT')).status,200);
 assert.equal((await call('/api/kpi/entries',{month:'2026-11',type:'opening',date:'2026-11-10',dealerId})).status,201);
 assert.equal((await call('/api/kpi/entries',{month:'2026-11',type:'opening',date:'2026-11-10',dealerId})).status,409);
 assert.equal((await call('/api/kpi/entries',{month:'2026-11',type:'illiquid',date:'2026-11-10',dealerId,productId,quantity:12.5})).status,201);
 const result=await call('/api/kpi?month=2026-11',null,false,'GET');assert.equal(result.data.summary.sales.fact,120);assert.equal(result.data.summary.illiquid.fact,12.5);assert.equal(result.data.summary.newDealers.fact,1);
 assert.equal((await call('/api/kpi/plan',{...payload,revision:99},true,'PUT')).status,409);
 assert.equal((await call('/api/kpi/entries/record1',null,false,'DELETE')).status,200);assert.equal(entries.length,1);assert.ok(audits.length>=4);
 }finally{await new Promise(r=>server.close(r));}
});
