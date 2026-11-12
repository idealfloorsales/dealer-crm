const {test}=require('node:test');const assert=require('node:assert/strict');
const {measureDatabase}=require('../server/storage-audit');
test('storage audit returns metadata only and distinguishes index sizes, views and restricted commands',async()=>{
 const db={async *listCollections(){yield {name:'dealers',type:'collection'};yield {name:'products',type:'collection'};yield {name:'view',type:'view'};yield {name:'system.hidden',type:'collection'};},command:async cmd=>{if(cmd.collStats==='products')throw Error('restricted');return {size:100,count:2,totalIndexSize:40,storageSize:80};},collection:()=>({aggregate:pipeline=>{assert.deepEqual(pipeline,[{$group:{_id:null,documents:{$sum:1},dataBytes:{$sum:{$bsonSize:'$$ROOT'}}}}]);return {toArray:async()=>[{documents:3,dataBytes:120}]};}})};
 const r=await measureDatabase(db);assert.equal(r.dataBytes,220);assert.equal(r.documents,5);assert.equal(r.collections.length,2);assert.equal(r.indexBytes,40);assert.equal(r.indexBytesComplete,false);assert.equal(r.complete,true);assert.equal(JSON.stringify(r).includes('password'),false);
});
