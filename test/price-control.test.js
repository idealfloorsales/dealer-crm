'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {summary,finalPrice,caseFields,dateKey,install}=require('../server/price-control');
const today='2026-11-09';
test('price is increased after discounts without changing base or RRP',()=>{
    assert.equal(finalPrice(8000,10,3),7416);
    assert.equal(finalPrice(8000,0,3),8240);
    assert.equal(finalPrice(8000,10,0),7200);
    assert.equal(finalPrice(0,10,5),0);
    assert.equal(finalPrice(100,100,10),0);
});
test('drafts and cancelled reports do not count; history has no age limit',()=>{
    const n={cases:[{_id:'a',status:'confirmed',observedDate:'2017-01-01'},{_id:'b',status:'draft'},{_id:'c',status:'cancelled'}]};
    assert.equal(summary(n,today).count,1);
    n.cases[1].status='confirmed';assert.equal(summary(n,today).stage,'confirmed');
});
test('planned surcharge becomes effective on its date and requires a live confirmed source',()=>{
    const n={cases:[{_id:'a',status:'confirmed'}],surcharge:{active:true,percent:7,startDate:'2026-11-10',caseId:'a'}};
    assert.equal(summary(n,today).surchargePercent,0);
    assert.equal(summary(n,'2026-11-10').surchargePercent,7);
    n.cases[0].status='cancelled';assert.equal(summary(n,'2026-11-10').surchargePercent,0);
});
test('date, offered price and decor validation',()=>{
    assert.equal(dateKey('2026-02-30'),false);assert.equal(dateKey('2024-02-29'),true);
    const base={observedDate:today,productName:'Дуб Миндаль',offeredPrice:6800,volume:''};
    assert.equal(caseFields(base,today).offeredPrice,6800);
    for(const patch of [{observedDate:'2026-11-10'},{offeredPrice:-1},{offeredPrice:'bad'},{productName:''},{volume:-5}])assert.throws(()=>caseFields({...base,...patch},today));
});
function fixture(){
    const id='111111111111111111111111',other='222222222222222222222222';
    const dealer={_id:id,name:'Дилер А',city:'Астана'};
    const c1={_id:'aaaaaaaaaaaaaaaaaaaaaaaa',dealerId:id,dealerName:'Дилер А',status:'draft',observedDate:'2026-11-01',productName:'Дуб',offeredPrice:6800,evidence:[]};
    const n={_id:'999999999999999999999999',__v:0,members:[id,other],name:'Сеть',cases:[c1],history:[],async save(){this.__v++;}};
    n.cases.id=id=>n.cases.find(c=>String(c._id)===String(id));
    const query=value=>({select(){return this;},lean:async()=>value,then(resolve,reject){return Promise.resolve(value).then(resolve,reject);}});
    class Schema{static Types={Mixed:Object,ObjectId:String};index(){}}
    class Network{}Network.findOne=()=>query(n);Network.find=()=>query([n]);
    const Evidence={insertMany:async()=>[],deleteMany:async()=>{}};
    const mongoose={Schema,isValidObjectId:id=>/^[a-f0-9]{24}$/.test(String(id)),Types:{ObjectId:class{}},model:name=>name==='PriceControlNetwork'?Network:Evidence};
    const Dealer={findOne:q=>query(q.$and[1].denied?null:dealer),find:()=>query([dealer,{_id:other,name:'Дилер Б'}])};
    const routes=new Map();const app={get:(p,...f)=>routes.set('GET '+p,f),post:(p,...f)=>routes.set('POST '+p,f),put:(p,...f)=>routes.set('PUT '+p,f)};
    const perm=()=>((_req,_res,next)=>next());
    install({app,mongoose,Dealer,requireAnyPermission:perm,requirePermission:perm,getDealerFilter:req=>req.denied?{denied:true}:{},isGlobalViewer:req=>req.global,hasPermission:req=>req.edit,today:()=>today});
    async function call(action,body={},options={}){
        const req={params:{dealerId:id},body:{action,version:n.__v,...body},user:{id:'user',fullName:'Проверяющий'},global:true,edit:true,...options};
        const result={code:200,set(){return this;},status(c){this.code=c;return this;},json(body){this.body=body;return this;}};
        await routes.get('POST /api/price-control/dealers/:dealerId/actions').at(-1)(req,result);return result;
    }
    return {n,c1,id,other,call};
}
test('network workflow: confirm, warn, repeat, record closure, undo mistaken case',async()=>{
    const {n,c1,other,call}=fixture();
    assert.equal((await call('warning',{caseId:c1._id,date:today,percent:3,startDate:today})).code,400);
    assert.equal((await call('confirm',{caseId:c1._id})).code,200);
    assert.equal((await call('warning',{caseId:c1._id,date:'2026-11-02',percent:3,startDate:today})).code,200);
    assert.equal(summary(n,today).surchargePercent,3);
    const c2={...c1,_id:'bbbbbbbbbbbbbbbbbbbbbbbb',dealerId:other,observedDate:'2026-11-08',status:'confirmed'};n.cases.push(c2);
    assert.equal((await call('closure',{caseId:c1._id,terminatedDate:today})).code,400,'same visit is not a repeat');
    assert.equal((await call('closure',{caseId:c2._id,terminatedDate:today,samplesRemovedDate:today})).code,200);
    assert.equal(summary(n,today).terminated,true);
    assert.equal((await call('delete',{caseId:c1._id,reason:'Ошибка'})).code,400,'linked decisions require explicit reversal');
    assert.equal((await call('delete',{caseId:c1._id,reason:'Ошибка',cancelDecision:true})).code,200);
    assert.equal(summary(n,today).surchargePercent,0);assert.equal(summary(n,today).terminated,false);assert.equal(summary(n,today).count,1);
    assert.equal(n.closure.samplesRemovedDate,today,'physical removal is retained for review');assert.equal(n.closure.needsReview,true);
    assert.equal(n.history.length,4);assert.equal(n.history.at(-1).reason,'Ошибка');
});
test('managers cannot confirm, stale versions cannot write, inaccessible dealers stay inaccessible',async()=>{
    const {n,c1,call}=fixture();
    assert.equal((await call('confirm',{caseId:c1._id},{global:false})).code,403);
    assert.equal((await call('confirm',{caseId:c1._id,version:9})).code,409);
    assert.equal((await call('confirm',{caseId:c1._id},{denied:true})).code,404);
    assert.equal(n.cases[0].status,'draft');assert.equal(n.history.length,0);
});
test('repeat before warning and invalid surcharge cannot start closure or change prices',async()=>{
    const {n,c1,call}=fixture();await call('confirm',{caseId:c1._id});
    assert.equal((await call('warning',{caseId:c1._id,date:today,percent:-5,startDate:today})).code,400);
    await call('warning',{caseId:c1._id,date:today,percent:5,startDate:today});
    n.cases.push({...c1,_id:'bbbbbbbbbbbbbbbbbbbbbbbb',status:'confirmed',observedDate:'2026-11-02'});
    assert.equal((await call('closure',{caseId:'bbbbbbbbbbbbbbbbbbbbbbbb',terminatedDate:today})).code,400);
    assert.equal(summary(n,today).terminated,false);
});
