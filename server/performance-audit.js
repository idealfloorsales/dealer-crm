'use strict';
const {previewDataUrl}=require('./image-preview');
async function fieldSizes(db,name){
 return db.collection(name).aggregate([
  {$project:{fields:{$objectToArray:'$$ROOT'}}},{$unwind:'$fields'},
  {$group:{_id:'$fields.k',valueBytes:{$sum:{$subtract:[{$bsonSize:{v:'$fields.v'}},8]}},documents:{$sum:1}}},
  {$sort:{valueBytes:-1}},{$limit:8}
 ],{maxTimeMS:30000}).toArray();
}
async function count(db,name,filter){return db.collection(name).countDocuments(filter,{maxTimeMS:10000});}
async function links(db){
 const dealers=await db.collection('dealers').find({},{projection:{_id:1,dealer_id:1}}).toArray();
 const products=await db.collection('products').distinct('_id'),users=await db.collection('users').distinct('_id'),lists=await db.collection('pricelists').distinct('_id');
 const dealerKeys=dealers.flatMap(d=>[String(d._id),String(d.dealer_id||'')]).filter(Boolean);
 const productKeys=[...products,...products.map(String)],listKeys=[...lists,...lists.map(String)];
 const invalidProducts=await db.collection('dealers').aggregate([{$unwind:'$products'},{$match:{products:{$nin:productKeys}}},{$count:'count'}],{maxTimeMS:10000}).toArray();
 const repeatedCodes=await db.collection('dealers').aggregate([{$match:{dealer_id:{$type:'string',$ne:''}}},{$group:{_id:{$toUpper:'$dealer_id'},count:{$sum:1}}},{$match:{count:{$gt:1}}},{$count:'groups'}],{maxTimeMS:10000}).toArray();
 return {
  dealerProductReferencesWithoutTarget:invalidProducts[0]?.count||0,
  dealerPriceListReferencesWithoutTarget:await count(db,'dealers',{price_list:{$exists:true,$nin:[null,'',...listKeys]}}),
  responsibleUserReferencesWithoutTarget:await count(db,'dealers',{responsibleUserId:{$exists:true,$nin:[null,'',...users.map(String)]}}),
  nonCustomSalesWithoutDealer:await count(db,'sales',{isCustom:{$ne:true},dealerId:{$exists:true,$nin:[null,'',...dealerKeys]}}),
  reclamationsWithoutDealer:await count(db,'reclamations',{dealerId:{$exists:true,$nin:[null,'',...dealerKeys]}}),
  repeatedDealerCodeGroupsForReviewOnly:repeatedCodes[0]?.groups||0
 };
}
async function previewSamples(db){
 const sample=await db.collection('dealers').aggregate([{$project:{photos:1,avatarUrl:1,photoBytes:{$bsonSize:{v:{$ifNull:['$photos',[]]}}}}},{$sort:{photoBytes:-1}},{$limit:1}],{maxTimeMS:10000}).toArray();
 const photos=sample[0]?.photos||[],limited=photos.slice(0,20),previews=[];
 for(const photo of limited)previews.push({...photo,photo_url:await previewDataUrl(photo.photo_url,320)});
 const avatar=sample[0]?.avatarUrl||'',small=await previewDataUrl(avatar,320);
 return {galleryPhotoCount:photos.length,gallerySampleCount:limited.length,galleryOriginalJsonBytes:Buffer.byteLength(JSON.stringify(limited)),galleryPreviewJsonBytes:Buffer.byteLength(JSON.stringify(previews)),avatarOriginalBytes:Buffer.byteLength(avatar),avatarPreviewBytes:Buffer.byteLength(small)};
}
async function queryPlan(db){
 const month=new Date().toISOString().slice(0,7),collection=db.collection('sales');
 const plan=await collection.find({month,isCustom:{$ne:true}},{projection:{_id:1},maxTimeMS:10000}).explain('executionStats');
 const scan=await collection.find({month,isCustom:{$ne:true}},{projection:{_id:1},maxTimeMS:10000}).hint({$natural:1}).explain('executionStats');
 const stats=p=>({returned:p.executionStats?.nReturned,documentsExamined:p.executionStats?.totalDocsExamined,keysExamined:p.executionStats?.totalKeysExamined,millis:p.executionStats?.executionTimeMillis});
 return {month,currentPlan:stats(plan),forcedCollectionScan:stats(scan),indexes:(await collection.listIndexes().toArray()).map(i=>({name:i.name,key:i.key}))};
}
async function runPerformanceAudit({db,runId,log=console.log}){
 const emit=(kind,result)=>log('CRM_PERFORMANCE_AUDIT '+JSON.stringify({runId,kind,...result}));
 for(const name of ['dealers','reclamations','comprefs']){
  try{emit('fields',{collection:name,fields:await fieldSizes(db,name)});}catch(_){emit('fields',{collection:name,unavailable:true});}
 }
 for(const [kind,fn] of [['links',links],['preview-samples',previewSamples],['sales-query-plan',queryPlan]]){
  try{emit(kind,await fn(db));}catch(_){emit(kind,{unavailable:true});}
 }
 emit('complete',{measuredAt:new Date().toISOString(),writesPerformed:0});
}
module.exports={runPerformanceAudit,fieldSizes,links,previewSamples,queryPlan};
