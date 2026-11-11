'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const {BSON} = require('mongoose').mongo;
const {createArchive,verifyArchive,keyOf,seal,unseal} = require('../server/backup-archive');
const {restoreRecords} = require('../scripts/restore-backup');
const {registerBackups} = require('../server/backups');
const express = require('express');
const key = keyOf('12'.repeat(32));
const documents = [{_id:new BSON.ObjectId(),date:new Date('2026-11-11'),amount:BSON.Decimal128.fromString('123.45'),binary:new BSON.Binary(Buffer.from([1,2,3])),counter:BSON.Long.fromString('9007199254740993'),number:new BSON.Int32(8),nested:{text:'Дилер IDEAL'}}];
function source(fail=false) {
    const definitions=[{name:'dealers',type:'collection',options:{}},{name:'empty',type:'collection',options:{validator:{active:{$type:'bool'}}}},{name:'dealer_view',type:'view',options:{viewOn:'dealers',pipeline:[]}}];
    return {databaseName:'production',async *listCollections(){yield* definitions;},collection(name){return {listIndexes:()=>({toArray:async()=>[{name:'_id_',key:{_id:1}},{name:'date_1',key:{date:1},unique:true}]}),find(){return {async *[Symbol.asyncIterator](){if(fail)throw Error('database-read-failed');if(name==='dealers')yield* documents;},close:async()=>{}};}};}};
}
test('encrypted archive authenticates, preserves BSON, empty collections, indexes and views; isolated restore preserves records',async()=>{
    const a=await createArchive({db:source(),EJSON:BSON.EJSON,key});
    try {
        const raw=await fs.promises.readFile(a.file);assert.equal(raw.includes(Buffer.from('Дилер IDEAL')),false);
        const verified=await verifyArchive({file:a.file,dir:a.dir,EJSON:BSON.EJSON,key});
        assert.deepEqual(verified.counts,{dealers:1,empty:0,dealer_view:0});
        const records={},indexes={},options={};
        const db={databaseName:'ideal_crm_restore_test',listCollections:()=>({toArray:async()=>[]}),createCollection:async(n,o)=>{records[n]=[];options[n]=o;},collection:n=>({insertMany:async docs=>records[n].push(...docs),createIndex:async(k,o)=>{indexes[n]={k,o};},countDocuments:async()=>records[n].length})};
        const counts=await restoreRecords({file:verified.plaintext,db,EJSON:BSON.EJSON});
        assert.equal(counts.dealers,1);assert.equal(records.dealers[0]._id.toHexString(),documents[0]._id.toHexString());
        assert.equal(records.dealers[0].amount.toString(),'123.45');assert.equal(records.dealers[0].counter.toString(),'9007199254740993');
        assert.equal(records.dealers[0].date.toISOString(),documents[0].date.toISOString());assert.deepEqual(records.dealers[0].binary.value(),documents[0].binary.value());
        assert.equal(indexes.dealers.o.unique,true);assert.equal(options.dealer_view.viewOn,'dealers');assert.equal(options.empty.validator.active.$type,'bool');
        await assert.rejects(()=>restoreRecords({file:verified.plaintext,db:{...db,databaseName:'production'},EJSON:BSON.EJSON}),/new ideal_crm_restore/);
        await assert.rejects(()=>restoreRecords({file:verified.plaintext,db:{...db,listCollections:()=>({toArray:async()=>[{name:'existing'}]})},EJSON:BSON.EJSON}),/not empty/);
    } finally {await a.cleanup();}
});
test('wrong key, damaged ciphertext and truncated archives are rejected',async()=>{
    const a=await createArchive({db:source(),EJSON:BSON.EJSON,key});
    const dir=await fs.promises.mkdtemp(path.join(os.tmpdir(),'backup-test-'));
    try {
        await assert.rejects(()=>verifyArchive({file:a.file,dir,EJSON:BSON.EJSON,key:crypto.randomBytes(32)}));
        const bytes=await fs.promises.readFile(a.file);bytes[35]^=1;const file=path.join(dir,'tampered');await fs.promises.writeFile(file,bytes);
        await assert.rejects(()=>verifyArchive({file,dir,EJSON:BSON.EJSON,key}));
        await fs.promises.writeFile(file,bytes.subarray(0,20));await assert.rejects(()=>verifyArchive({file,dir,EJSON:BSON.EJSON,key}),/INVALID_ARCHIVE/);
    } finally {await a.cleanup();await fs.promises.rm(dir,{recursive:true,force:true});}
});
test('failed database reads cannot yield a successful backup',async()=>{await assert.rejects(()=>createArchive({db:source(true),EJSON:BSON.EJSON,key}),/database-read-failed/);});
test('Google refresh tokens are authenticated and encrypted separately from archives',()=>{
    const secret=seal('example-refresh-token',key);assert.equal(secret.includes('example-refresh-token'),false);assert.equal(unseal(secret,key),'example-refresh-token');assert.throws(()=>unseal(secret,crypto.randomBytes(32)));assert.throws(()=>keyOf('short'));
});
test('backup endpoints require administrator; Google callback rejects missing state; unconfigured keys fail closed',async()=>{
    const app=express();app.use(express.json());let admin=false;
    const collection={findOne:async()=>null,updateOne:async()=>({modifiedCount:1})};
    const service=registerBackups({app,connection:{collection:()=>collection},EJSON:BSON.EJSON,User:{},AuditLog:{},requireAdmin:(req,res,next)=>admin?next():res.sendStatus(403),origin:'https://crm.example',env:{},ready:()=>true});
    const server=app.listen(0),base='http://127.0.0.1:'+server.address().port;
    try {
        for(const [route,method] of [['status','GET'],['recovery-key','GET'],['download','POST'],['drive','POST'],['automatic','PUT'],['google/connect','POST']]) assert.equal((await fetch(base+'/api/admin/backups/'+route,{method})).status,403);
        assert.equal((await fetch(base+'/backup-google/callback?state=invalid')).status,400);
        admin=true;const status=await (await fetch(base+'/api/admin/backups/status')).json();assert.equal(status.configured,false);assert.equal(status.connected,false);
        assert.equal((await fetch(base+'/api/admin/backups/recovery-key')).status,503);
        assert.equal((await fetch(base+'/api/admin/backups/download',{method:'POST'})).status,409);
        assert.equal((await fetch(base+'/api/admin/backups/automatic',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled:true})})).status,409);
    } finally {service.stop();await new Promise(r=>server.close(r));}
});
test('Google consent binds single-use state, stores encrypted token, and verifies private Drive upload before success',async()=>{
    const nativeFetch=global.fetch, rows=new Map(), audits=[];let uploaded;
    const collection={
        findOne:async q=>rows.get(q._id)||null,
        insertOne:async d=>{rows.set(d._id,{...d});},
        findOneAndDelete:async q=>{const row=rows.get(q._id);if(!row||row.expiresAt<=new Date())return null;rows.delete(q._id);return row;},
        updateOne:async(q,u)=>{let row=rows.get(q._id);if(!row){row={_id:q._id,...u.$setOnInsert};rows.set(q._id,row);}if(q.until&&!(row.until<new Date()))return {modifiedCount:0};Object.assign(row,u.$set);for(const k of Object.keys(u.$unset||{}))delete row[k];return {modifiedCount:1};}
    };
    global.fetch=async(url,options={})=>{
        if(!String(url).startsWith('https://'))return nativeFetch(url,options);
        const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json',...headers}});
        if(String(url)==='https://oauth2.googleapis.com/token')return json(options.body.get('grant_type')==='authorization_code'?{access_token:'access',refresh_token:'private-refresh',scope:'https://www.googleapis.com/auth/drive.file'}:{access_token:'access'});
        if(String(url).includes('/upload/drive/v3/files?uploadType=resumable'))return json({},200,{location:'https://www.googleapis.com/upload/drive/v3/files?upload_id=test'});
        if(String(url).includes('upload_id=test')){const chunks=[];for await(const chunk of options.body)chunks.push(chunk);uploaded=Buffer.concat(chunks);return json({id:'archive'});}
        if(String(url).includes('/drive/v3/files/archive?'))return json({id:'archive',shared:false,size:String(uploaded.length),md5Checksum:crypto.createHash('md5').update(uploaded).digest('hex')});
        if(String(url).includes('/drive/v3/files?fields=id,shared'))return json({id:'folder',shared:false});
        throw Error('Unexpected Google request');
    };
    const app=express();app.use(express.json());app.use((req,res,next)=>{req.user={id:'admin',role:'admin'};next();});
    const service=registerBackups({app,connection:{db:source(),collection:()=>collection},EJSON:BSON.EJSON,User:{findById:()=>({lean:async()=>({permissions:{is_admin:true}})})},AuditLog:{create:async d=>audits.push(d)},requireAdmin:(req,res,next)=>next(),origin:'https://crm.example',env:{BACKUP_ENCRYPTION_KEY:'12'.repeat(32),GMAIL_CLIENT_ID:'client',GMAIL_CLIENT_SECRET:'secret'},ready:()=>true});
    const server=app.listen(0),base='http://127.0.0.1:'+server.address().port;
    try {
        const start=await nativeFetch(base+'/api/admin/backups/google/connect',{method:'POST'}),data=await start.json();
        const state=new URL(data.url).searchParams.get('state');assert.ok(state);assert.equal(new URL(data.url).searchParams.get('scope'),'https://www.googleapis.com/auth/drive.file');
        assert.equal((await nativeFetch(base+'/backup-google/callback?state='+state+'&code=code',{redirect:'manual'})).status,400);
        const cookie='ideal_backup_oauth='+state;
        assert.equal((await nativeFetch(base+'/backup-google/callback?state='+state+'&code=code',{headers:{cookie},redirect:'manual'})).status,302);
        assert.equal((await nativeFetch(base+'/backup-google/callback?state='+state+'&code=code',{headers:{cookie},redirect:'manual'})).status,400);
        assert.notEqual(rows.get('drive').refreshTokenSecret,'private-refresh');assert.equal(unseal(rows.get('drive').refreshTokenSecret,key),'private-refresh');
        await nativeFetch(base+'/api/admin/backups/recovery-key');
        const result=await nativeFetch(base+'/api/admin/backups/drive',{method:'POST'});assert.equal(result.status,200,await result.text());
        assert.equal(rows.get('drive').lastFileId,'archive');assert.equal(rows.get('drive').lastCounts.dealers,1);assert.ok(rows.get('drive').lastDriveAt);
        assert.equal(uploaded.includes(Buffer.from('Дилер IDEAL')),false);assert.equal(JSON.stringify(audits).includes('private-refresh'),false);
    } finally {service.stop();await new Promise(r=>server.close(r));global.fetch=nativeFetch;}
});
