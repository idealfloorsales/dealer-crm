const {test}=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const {registerTrainingDownloads}=require('../server/training-downloads');
test('training exports require knowledge permission, allow only fixed formats and return real documents',async()=>{
 const app=express();registerTrainingDownloads({app,requirePermission:permission=>(req,res,next)=>req.headers['x-training-access']==='yes'?next():res.status(403).json({error:permission})});const server=app.listen(0);const base='http://127.0.0.1:'+server.address().port;
 try{
  assert.equal((await fetch(base+'/api/training/download/pdf')).status,403);
  assert.equal((await fetch(base+'/api/training/download/exe',{headers:{'x-training-access':'yes'}})).status,404);
  for(const format of ['docx','pdf']){const response=await fetch(base+'/api/training/download/'+format,{headers:{'x-training-access':'yes'}});assert.equal(response.status,200);assert.match(response.headers.get('content-disposition'),/attachment/);assert.match(response.headers.get('cache-control'),/private/);const bytes=Buffer.from(await response.arrayBuffer());assert.ok(bytes.length>10000);assert.equal(bytes.subarray(0,format==='pdf'?4:2).toString(),format==='pdf'?'%PDF':'PK');}
 }finally{await new Promise(r=>server.close(r));}
});
