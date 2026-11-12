'use strict';
const sharp=require('sharp');const crypto=require('node:crypto');
sharp.cache({memory:8,files:0,items:32});sharp.concurrency(1);
const cache=new Map(),pending=new Map();let bytes=0,active=false;const queue=[];
const LIMIT=16*1024*1024;
async function serial(task){
 if(active){if(queue.length>=8)return null;await new Promise(resolve=>queue.push(resolve));}
 active=true;try{return await task();}finally{const next=queue.shift();if(next)next();else active=false;}
}
async function previewBuffer(source,type='image/jpeg',size=320){
 if(!Buffer.isBuffer(source)||source.length>24*1024*1024||!['image/jpeg','image/png','image/webp','image/avif','image/gif'].includes(type))return {body:source,type};
 const width=[160,320,700,1200,2200].includes(size)?size:320;
 const key=width+':'+type+':'+crypto.createHash('sha256').update(source).digest('hex');
 if(cache.has(key)){const value=cache.get(key);cache.delete(key);cache.set(key,value);return value;}
 if(pending.has(key))return pending.get(key);
 const promise=serial(async()=>{
  try{
   const output=await sharp(source,{limitInputPixels:32000000,failOn:'error'}).rotate().resize({width,height:width,fit:'inside',withoutEnlargement:true}).flatten({background:'#fff'}).jpeg({quality:width>1200?86:76}).toBuffer();
   const result=output.length<source.length?{body:output,type:'image/jpeg'}:{body:source,type};
   if(result.body.length<=2*1024*1024){while(bytes+result.body.length>LIMIT&&cache.size){const first=cache.keys().next().value;bytes-=cache.get(first).body.length;cache.delete(first);}cache.set(key,result);bytes+=result.body.length;}
   return result;
  }catch(_){return {body:source,type};}
 });
 pending.set(key,promise);
 try{return await promise||{body:source,type};}finally{pending.delete(key);}
}
async function previewDataUrl(value,size=320){
 if(typeof value!=='string')return value;
 const match=/^data:(image\/(?:jpeg|png|webp|avif|gif));base64,([A-Za-z0-9+/=\s]+)$/.exec(value);
 if(!match||value.length>34*1024*1024)return value;
 const result=await previewBuffer(Buffer.from(match[2],'base64'),match[1],size);
 const next='data:'+result.type+';base64,'+result.body.toString('base64');return next.length<value.length?next:value;
}
module.exports={previewBuffer,previewDataUrl};
