const {test}=require('node:test');const assert=require('node:assert/strict');const express=require('express');
const {registerOfferPhotos}=require('../server/offer-photos');
test('print photos require live offer membership even for cached images; upstream HTML is rejected',async()=>{
 const app=express();let live=true,valid=true,fetches=0,html=false;
 const token='a'.repeat(48),id='valid_photo_123';
 registerOfferPhotos({app,CommercialOffer:{findOne:query=>({lean:async()=>{assert.equal(query.publicId,token);assert.equal(query.revokedAt,null);assert.ok(query.expiresAt.$gt instanceof Date);return live?{snapshot:{items:[{photoId:id},{photoId:'html_photo_123'}]}}:null;}})},validSnapshot:async()=>valid,fetcher:async url=>{fetches++;assert.ok(url.startsWith('https://drive.google.com/thumbnail?id='));return new Response(Buffer.from([137,80,78,71]),{headers:{'content-type':html?'text/html':'image/png'}});}});
 const server=app.listen(0),base='http://127.0.0.1:'+server.address().port+'/api/public/offers/';
 try{
  assert.equal((await fetch(base+'invalid/photo/'+id)).status,404);
  assert.equal((await fetch(base+token+'/photo/foreign_photo_123')).status,404);assert.equal(fetches,0);
  const r=await fetch(base+token+'/photo/'+id);assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'image/png');assert.match(r.headers.get('cache-control'),/no-store/);assert.equal((await r.arrayBuffer()).byteLength,4);
  assert.equal((await fetch(base+token+'/photo/'+id)).status,200);assert.equal(fetches,1);
  live=false;assert.equal((await fetch(base+token+'/photo/'+id)).status,410);live=true;valid=false;assert.equal((await fetch(base+token+'/photo/'+id)).status,410);valid=true;
  html=true;assert.equal((await fetch(base+token+'/photo/html_photo_123')).status,502);
 }finally{await new Promise(r=>server.close(r));}
});
