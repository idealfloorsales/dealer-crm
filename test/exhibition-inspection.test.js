'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {parsePayload,normalizeInspection,STANDARD_POS_NAMES,register}=require('../server/exhibition-inspection');

const productId='507f1f77bcf86cd799439011';
const dealerId='507f191e810c19729de860ea';
test('sample damage, replacements and price tags are stored separately',()=>{
 const row=parsePayload({kind:'laminate',key:productId,present:true,
  condition:'damaged',replacementQty:2,priceTag:'replace',priceTagQty:3,
  note:'Повреждён образец, заменить старый ценник'});
 assert.equal(row.kind,'laminate');
 assert.equal(row.present,true);
 assert.equal(row.condition,'damaged');
 assert.equal(row.replacementQty,2);
 assert.equal(row.priceTag,'replace');
 assert.equal(row.priceTagQty,3);
 assert.match(row.note,/заменить/);
});
test('equipment cannot silently edit the price-tag state or physical quantity',()=>{
 const row=parsePayload({kind:'pos',key:STANDARD_POS_NAMES[0],condition:'damaged',
  replacementQty:1,priceTag:'replace',priceTagQty:99,present:true});
 assert.equal(row.priceTag,'unknown');
 assert.equal(row.priceTagQty,0);
 assert.equal(row.present,undefined);
});
test('replace quantity is cleared on a resolved inspection',()=>{
 const row=parsePayload({kind:'laminate',key:productId,condition:'ok',replacementQty:9});
 assert.equal(row.replacementQty,0);
});
test('invalid quantities, kind and condition are rejected',()=>{
 for(const input of [
  {kind:'laminate',key:'wrong'},
  {kind:'laminate',key:productId,condition:'needs_paint'},
  {kind:'pos',key:'X'},
  {kind:'laminate',key:productId,replacementQty:-1,condition:'damaged'},
  {kind:'laminate',key:productId,priceTagQty:2.5},
  {kind:'laminate',key:productId,present:'false'},
 ]){
   assert.throws(()=>parsePayload(input));
 }
});
test('inspection defaults are stable for older matrix rows',()=>{
 assert.deepEqual(normalizeInspection(null),{
  condition:'ok',priceTag:'unknown',priceTagQty:0,replacementQty:0,
  note:'',checkedAt:null,checkedBy:''
 });
});
test('scoped sample edit toggles only dealer products and logs the inspection',async()=>{
 let handler=null,permission='',saveCalls=0,productChanges=[],audit=[];
 class Schema {
   constructor(){} index(){}
 }
 Schema.Types={ObjectId:String};
 const records=[];
 const Check={
   find(){return {lean:async()=>records}},
   findOne(){return {lean:async()=>null}},
   findOneAndUpdate(where,update){
     const doc={...where,...update.$set,updatedAt:new Date()};
     records.push(doc);saveCalls++;
     return {lean:async()=>doc};
   }
 };
 const mongoose={Schema,models:{},model:()=>Check,isValidObjectId:id=>id===dealerId};
 const dealer={_id:dealerId,name:'Тестовый дилер',products:[],pos_materials:[]};
 const Dealer={
   findOne(filter){
     if(filter._id!==dealerId||filter.status?.$nin?.includes('standard'))throw Error('Dealer scope lost');
     return {select(){return {lean:async()=>dealer}}};
   },
   updateOne(filter,update){
     productChanges.push(update);
     if(update.$addToSet)dealer.products.push(productId);
     return {matchedCount:1};
   }
 };
 const Product={findOne:()=>({select:()=>({lean:async()=>({_id:productId,sku:'8EH34-711',name:'Дуб Миндаль'})})})};
 const app={put(path,guard,fn){if(path==='/api/exhibition/dealers/:id/item')handler=fn;else assert.equal(path,'/api/exhibition/presence/batch')}};
 const AuditLog={create:async entry=>{audit.push(entry)}};
 const io=register({app,mongoose,Dealer,Product,AuditLog,
  requirePermission:can=>{permission=can;return ()=>{};},
  getDealerFilter:()=>({}),
  getWorkingDealerFilter:()=>({status:{$nin:['potential','archive']}}),
  activeProductFilter:x=>x});
 assert.equal(permission,'can_edit_matrix');
 assert.equal(typeof handler,'function');
 const req={params:{id:dealerId},user:{id:'u',username:'Test',role:'manager',permissions:{can_edit_matrix:true}},
  body:{kind:'laminate',key:productId,present:true,
   condition:'damaged',replacementQty:1,priceTag:'replace',priceTagQty:2,note:'Скол'}};
 let status=200,body=null;
 const res={set(){return this},status(value){status=value;return this},json(data){body=data;return this}};
 await handler(req,res);
 assert.equal(status,200);
 assert.equal(body.status,'ok');
 assert.equal(body.present,true);
 assert.equal(body.inspection.priceTag,'replace');
 assert.equal(productChanges.length,1);
 assert.equal(saveCalls,1);
 assert.equal(audit.length,1);
 assert.equal(audit[0].module,'matrix');
 assert.equal(io.getCheck(await io.getChecks([dealerId]),dealerId,'laminate',productId).condition,'damaged');
});

test('batch edit saves multiple presence marks without erasing inspection data',async()=>{
 const routes={};
 const dealerId2='507f191e810c19729de860eb';
 const productId2='507f1f77bcf86cd799439012';
 const ids=[dealerId,dealerId2],pids=[productId,productId2];
 const dealers=[
  {_id:dealerId,name:'Астана',products:[]},
  {_id:dealerId2,name:'Караганда',products:[productId]}
 ];
 const stocks={samples:19,tags:8,inspectionNote:'Скол на планке'};
 const audit=[],ops=[];
 class Schema{constructor(){}index(){}}
 Schema.Types={ObjectId:String};
 const mongoose={Schema,models:{},model:()=>({find:()=>({lean:async()=>[]})}),
  isValidObjectId:id=>/^[a-f0-9]{24}$/.test(id)};
 const Dealer={
  find(filter){
   assert.ok(filter.$and.some(x=>x.status));
   return {select:()=>({lean:async()=>dealers})};
  },
  async bulkWrite(writes){
   ops.push(...writes);
   for(const op of writes){
    const filter=op.updateOne.filter.$and;
    const d=dealers.find(x=>x._id===filter.find(y=>y._id)?._id);
    const changing=op.updateOne.update;
    if(changing.$addToSet && !d.products.includes(changing.$addToSet.products))
     d.products.push(changing.$addToSet.products);
    if(changing.$pull)d.products=d.products.filter(x=>x!==changing.$pull.products);
   }
   return {matchedCount:writes.length};
  }
 };
 const Product={find:()=>({select:()=>({lean:async()=>pids.map(_id=>({_id}))})})};
 const app={put(path,guard,fn){routes[path]=fn}};
 const AuditLog={create:async entry=>{audit.push(entry)}};
 register({app,mongoose,Dealer,Product,AuditLog,
  requirePermission:permission=>{assert.equal(permission,'can_edit_matrix');return ()=>{}},
  getDealerFilter:()=>({}),
  getWorkingDealerFilter:()=>({status:{$ne:'potential'}}),
  activeProductFilter:x=>x});
 const req={body:{changes:[
  {dealerId,productId,present:true,expectedPresent:false},
  {dealerId:dealerId2,productId,present:false,expectedPresent:true},
  {dealerId:dealerId2,productId:productId2,present:true,expectedPresent:false}
 ]},user:{id:'a',role:'admin',username:'Test'},originalUrl:'/api/exhibition/presence/batch'};
 let status=200,response=null;
 const res={set(){return this},status(s){status=s;return this},json(v){response=v;return this}};
 await routes['/api/exhibition/presence/batch'](req,res);
 assert.equal(status,200);
 assert.equal(response.updated,3);
 assert.deepEqual(dealers[0].products,[productId]);
 assert.deepEqual(dealers[1].products,[productId2]);
 assert.equal(ops.length,3);
 assert.equal(audit.length,2);
 assert.equal(stocks.samples,19);
 assert.equal(stocks.tags,8);
 assert.equal(stocks.inspectionNote,'Скол на планке');
});
test('batch rejects stale or invalid selections before any DB update',async()=>{
 const routes={};
 let writes=0;
 class Schema{constructor(){}index(){}}
 Schema.Types={ObjectId:String};
 const mongoose={Schema,models:{},model:()=>({}),isValidObjectId:id=>/^[a-f0-9]{24}$/.test(id)};
 const Dealer={
  find:()=>({select:()=>({lean:async()=>[{
   _id:dealerId,name:'Дилер',products:[productId]
  }]})}),
  async bulkWrite(){writes++;return {matchedCount:1}}
 };
 const Product={find:()=>({select:()=>({lean:async()=>[{_id:productId}]})})};
 register({app:{put(path,guard,fn){routes[path]=fn}},mongoose,Dealer,Product,
  AuditLog:{create:async()=>{}},requirePermission:()=>()=>{},
  getDealerFilter:()=>({}),getWorkingDealerFilter:()=>({}),activeProductFilter:x=>x});
 const run=async(changes)=>{
  let code=200,value=null;
  await routes['/api/exhibition/presence/batch']({
   body:{changes},user:{},originalUrl:'/api/exhibition/presence/batch'
  },{status(s){code=s;return this},json(v){value=v;return this},set(){return this}});
  return {code,value};
 };
 const stale=await run([{dealerId,productId,present:true,expectedPresent:false}]);
 assert.equal(stale.code,409);
 const duplicate=await run([
  {dealerId,productId,present:false,expectedPresent:true},
  {dealerId,productId,present:false,expectedPresent:true}
 ]);
 assert.equal(duplicate.code,400);
 const invalid=await run([{dealerId,productId,present:'true',expectedPresent:false}]);
 assert.equal(invalid.code,400);
 assert.equal(writes,0);
});
