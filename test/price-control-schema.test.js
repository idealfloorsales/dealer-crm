'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),mongoose=require('mongoose');
const {install}=require('../server/price-control');
test('real Mongoose schema supports embedded case IDs, tracked decisions and unique membership',()=>{
    const app={get(){},put(){},post(){}};
    const {Network,summary}=install({app,mongoose,Dealer:{},requirePermission:()=>()=>{},requireAnyPermission:()=>()=>{},getDealerFilter:()=>({}),isGlobalViewer:()=>true,hasPermission:()=>true,today:()=> '2026-11-09'});
    const n=new Network({members:['111111111111111111111111'],name:'Сеть',cases:[{dealerId:'111111111111111111111111',productName:'Дуб',offeredPrice:6800,status:'confirmed'}],history:[]});
    assert.equal(n.validateSync(),undefined);assert(n.cases.id(n.cases[0]._id));assert.equal(summary(n).count,1);
    n.surcharge={active:true,percent:3,startDate:'2026-11-09',caseId:String(n.cases[0]._id)};
    assert.equal(summary(n).surchargePercent,3);assert(n.isModified('surcharge'));
    assert.equal(Network.schema.options.optimisticConcurrency,true);
    assert(Network.schema.indexes().some(([keys,opts])=>keys.members===1&&opts.unique));
});
