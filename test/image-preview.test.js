const {test}=require('node:test');const assert=require('node:assert/strict');const sharp=require('sharp');const crypto=require('node:crypto');
const {previewBuffer,previewDataUrl}=require('../server/image-preview');
const {previewPhotoRows,registerDealerMedia,version}=require('../server/dealer-media');const express=require('express');
test('preview resizes both portrait dimensions, reduces bytes, shares cached work, and leaves original buffers unchanged',async()=>{
 const original=await sharp({create:{width:1800,height:3200,channels:3,background:'#bd7541'}}).png().toBuffer();const before=crypto.createHash('sha256').update(original).digest('hex');
 const [a,b]=await Promise.all([previewBuffer(original,'image/png',320),previewBuffer(original,'image/png',320)]);assert.equal(a,b);assert.ok(a.body.length<original.length);const m=await sharp(a.body).metadata();assert.ok(m.width<=320&&m.height<=320);assert.equal(m.height,320);assert.equal(before,crypto.createHash('sha256').update(original).digest('hex'));
 const url='data:image/png;base64,'+original.toString('base64');const small=await previewDataUrl(url);assert.ok(small.length<url.length);assert.equal(await previewDataUrl('https://example.test/image.png'),'https://example.test/image.png');
});
test('corrupt, non-image and unsupported data remain available unchanged instead of breaking the page',async()=>{
 const bad=Buffer.from('not an image');assert.deepEqual((await previewBuffer(bad,'image/png',320)).body,bad);assert.equal(await previewDataUrl('data:video/mp4;base64,YWJj'),'data:video/mp4;base64,YWJj');assert.equal(await previewDataUrl('data:image/svg+xml;base64,YWJj'),'data:image/svg+xml;base64,YWJj');
});
test('photo preview descriptors do not mutate originals; video payload is omitted from read-only previews',async()=>{
 const photo='data:video/mp4;base64,YWJj',rows=[{photo_url:photo,description:'Original'}];const result=await previewPhotoRows(rows,true);assert.equal(rows[0].photo_url,photo);assert.equal(result[0].photo_url,'');assert.equal(result[0].isVideo,true);assert.equal(result[0].originalIndex,0);assert.equal(result[0].originalVersion,version(photo));
});
test('original image routes enforce permissions, dealer scope and stale gallery version',async()=>{
 const app=express();let allowed=false,seen=[];const photo={photo_url:'data:image/png;base64,YWJj'};
 const Model={findOne:q=>{seen.push(q);return {select:p=>{assert.ok(p.photos.$slice);return {lean:async()=>q.scope==='own'||q.dealerId?.$in?.includes('own')?{photos:[photo]}:null};}};}};
 registerDealerMedia({app,Dealer:Model,Reclamation:Model,requirePermission:permission=>(req,res,next)=>allowed?next():res.sendStatus(403),getDealerFilter:()=>({scope:'own'}),getScopedDealerIds:async()=>['own']});
 const server=app.listen(0),base='http://127.0.0.1:'+server.address().port;
 try{
  assert.equal((await fetch(base+'/api/dealers/x/photos/0')).status,403);allowed=true;
  assert.equal((await fetch(base+'/api/dealers/x/photos/-1')).status,400);
  assert.equal((await fetch(base+'/api/dealers/x/photos/0?v=old')).status,409);
  const r=await fetch(base+'/api/dealers/x/photos/0?v='+version(photo.photo_url));assert.equal(r.status,200);assert.equal((await r.json()).photo_url,photo.photo_url);assert.equal(seen.at(-1).scope,'own');
  const claim=await fetch(base+'/api/reclamations/x/photos/0?v='+version(photo.photo_url));assert.equal(claim.status,200);assert.deepEqual(seen.at(-1).dealerId,{$in:['own']});
 }finally{await new Promise(r=>server.close(r));}
});
