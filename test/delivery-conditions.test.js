'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const {install,combine,cleanName}=require('../server/delivery-conditions');
test('delivery catalogue keeps original wording, counts legacy uses, and maps renamed archived conditions without rewriting dealers',()=>{
 const old='Самовывоз отсрочка 14 дней',name='Самовывоз · отсрочка 14 дней';
 const values=[old,old,'самовывоз отсрочка 14 дней',' '+old+' ',''];const before=JSON.stringify(values);
 const rows=combine([{_id:'a',name,aliases:[old],active:false}],values);
 assert.equal(rows.length,3);assert.equal(rows.find(r=>r.name===name).usage,2);assert.equal(rows.find(r=>r.name===name).active,false);assert.ok(rows.some(r=>r.name===' '+old+' '));assert.equal(JSON.stringify(values),before);assert.equal(cleanName(' Самовывоз '),'Самовывоз');assert.throws(()=>cleanName(' '));assert.throws(()=>cleanName('x'.repeat(701)));
});
function matches(row,q){return Object.entries(q).every(([k,v])=>k==='$and'?v.every(x=>matches(row,x)):k==='$or'?v.some(x=>matches(row,x)):v&&typeof v==='object'?(v.$in?[row[k]].flat().some(x=>v.$in.includes(x)):v.$ne!==undefined?String(row[k])!==String(v.$ne):true):Array.isArray(row[k])?row[k].includes(v):String(row[k])===String(v));}
const query=value=>({select(){return this;},limit(){return this;},lean:async()=>structuredClone(value)});
test('delivery read is scoped; management is admin-only; legacy archive and rename preserve saved text and prevent alias duplication',async()=>{
 const dealers=[{_id:'1',zone:'a',delivery:'Самовывоз 100% оплата'},{_id:'2',zone:'b',delivery:'Доставка 50/50'}],records=[];let writes=0,identity={id:'staff',role:'manager',zone:'a',permissions:{can_view_dealers:true}},audits=[];
 class Schema{index(){}}const Condition={find:()=>query(records),findOne:q=>query(records.find(r=>matches(r,q))||null),findById:id=>query(records.find(r=>r._id===id)||null),async create(value){const row={...value,_id:String(records.length+10).padStart(24,'0'),updatedAt:'v1'};records.push(row);writes++;return row;},findOneAndUpdate(q,u){const row=records.find(r=>matches(r,q));if(!row)return query(null);Object.assign(row,u.$set,{updatedAt:'v'+(++writes+1)});return query(row);}};
 const app=express();app.use(express.json());app.use((req,res,next)=>{req.user=identity;next();});install({app,mongoose:{Schema,model:()=>Condition,isValidObjectId:id=>/^[a-f0-9]{24}$/.test(id)},Dealer:{find:q=>query(dealers.filter(d=>matches(d,q))),findOne:q=>query(dealers.find(d=>matches(d,q))||null)},AuditLog:{create:async e=>audits.push(e)},getDealerFilter:req=>req.user.role==='admin'?{}:{zone:req.user.zone},hasPermission:(req,p)=>req.user.role==='admin'||req.user.permissions?.[p],isAdminUser:req=>req.user.role==='admin'&&req.user.permissions?.is_admin===true});
 const server=app.listen(0),base='http://127.0.0.1:'+server.address().port+'/api/delivery-conditions';const call=(path='',body,method='POST')=>fetch(base+path,{...(body?{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
 try{
  let r=await(await call()).json();assert.equal(r.canManage,false);assert.equal(r.items.length,1);assert.equal(writes,0);assert.equal((await call('',{name:'New'})).status,403);
  identity={id:'admin',role:'admin',permissions:{is_admin:true}};
  assert.equal((await call('',{name:'Самовывоз 100% оплата',legacyName:'Самовывоз 100% оплата',active:false})).status,201);assert.equal(dealers[0].delivery,'Самовывоз 100% оплата');r=await(await call()).json();assert.equal(r.items.find(i=>i.name===dealers[0].delivery).active,false);
  const id=records[0]._id;assert.equal((await call('/'+id,{name:'Самовывоз · 100% предоплата',active:true},'PATCH')).status,200);assert.deepEqual(records[0].aliases,['Самовывоз 100% оплата']);assert.equal(dealers[0].delivery,'Самовывоз 100% оплата');assert.equal((await call('',{name:'Самовывоз 100% оплата'})).status,409);
  assert.equal((await call('',{name:'New',active:'false'})).status,400);assert.equal((await call('',{name:'New',legacyName:'Does not exist'})).status,409);assert.ok(audits.some(a=>a.action==='delivery_archive'));assert.ok(audits.every(a=>!JSON.stringify(a).includes('Самовывоз')));
 }finally{await new Promise(r=>server.close(r));}
});
