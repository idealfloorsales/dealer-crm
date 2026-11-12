'use strict';
const fs=require('node:fs/promises');const path=require('node:path');
let started=false;
const numeric=value=>Number.isFinite(Number(value))?Number(value):null;
async function measureDatabase(db){
 const collections=[];let dataBytes=0,indexBytes=0,documents=0;
 for await(const info of db.listCollections({}, {nameOnly:false})){
  if(info.name.startsWith('system.')||info.type==='view')continue;
  try{
   let row;
   try{const s=await db.command({collStats:info.name,scale:1,maxTimeMS:10000});if(numeric(s.size)===null||numeric(s.count)===null)throw Error('STATS_UNAVAILABLE');row={name:info.name,documents:numeric(s.count),dataBytes:numeric(s.size),indexBytes:numeric(s.totalIndexSize),storageBytes:numeric(s.storageSize),method:'collStats'};}
   catch(_){const r=await db.collection(info.name).aggregate([{$group:{_id:null,documents:{$sum:1},dataBytes:{$sum:{$bsonSize:'$$ROOT'}}}}],{maxTimeMS:30000}).toArray();row={name:info.name,documents:numeric(r[0]?.documents)||0,dataBytes:numeric(r[0]?.dataBytes)||0,indexBytes:null,storageBytes:null,method:'bsonSize'};}
   collections.push(row);dataBytes+=row.dataBytes;documents+=row.documents;indexBytes+=row.indexBytes||0;
  }catch(error){collections.push({name:info.name,error:'measurement_unavailable',code:Number.isInteger(error.code)?error.code:null});}
 }
 return {measuredAt:new Date().toISOString(),collections,documents,dataBytes,indexBytes,indexBytesComplete:collections.every(c=>c.indexBytes!==null&&!c.error),complete:collections.every(c=>!c.error),note:'Source BSON data sizes; not an SQLite or browser-cache size measurement. External files are not included.'};
}
async function measureFiles(root){
 const groups={};
 async function walk(dir){for(const item of await fs.readdir(dir,{withFileTypes:true})){const file=path.join(dir,item.name);if(item.isDirectory())await walk(file);else if(item.isFile()){const ext=path.extname(file).toLowerCase()||'(none)',stat=await fs.stat(file);const group=groups[ext]||(groups[ext]={files:0,bytes:0});group.files++;group.bytes+=stat.size;}}}
 await walk(root);return groups;
}
async function runOnce({db,runId,root,log=console.log}){
 if(started||!runId)return;started=true;
 const report=await measureDatabase(db);
 for(const row of report.collections)log('CRM_STORAGE_AUDIT '+JSON.stringify({runId,kind:'collection',...row}));
 const files=await measureFiles(path.join(root,'public'));
 const training=await measureFiles(path.join(root,'server','training')).catch(()=>({}));
 const {collections,...summary}=report;
 log('CRM_STORAGE_AUDIT '+JSON.stringify({runId,kind:'summary',...summary,publicFiles:files,trainingDownloads:training}));
}
module.exports={measureDatabase,measureFiles,runOnce};
