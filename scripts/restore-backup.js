#!/usr/bin/env node
'use strict';
// This tool only restores to a NEW, EMPTY database whose name starts ideal_crm_restore_.
// Production restores are deliberately not exposed through HTTP.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const readline = require('node:readline');
const {verifyArchive, keyOf} = require('../server/backup-archive');
async function restoreRecords({file, db, EJSON}) {
    if (!/^ideal_crm_restore_[a-zA-Z0-9_]+$/.test(db.databaseName)) throw Error('Destination must be a new ideal_crm_restore_* database.');
    if ((await db.listCollections().toArray()).length) throw Error('Destination is not empty. No records changed.');
    const definitions = [], counts = {}, views = [];
    let current, batch = [];
    async function flush() {
        if (batch.length) { await db.collection(current).insertMany(batch, {ordered:true}); batch = []; }
    }
    for await (const line of readline.createInterface({input:fs.createReadStream(file),crlfDelay:Infinity})) {
        const row = EJSON.parse(line, {relaxed:false});
        if (row.type === 'collection') {
            await flush();current = row.name;counts[current] = 0;definitions.push(row);
            if(row.kind === 'view') views.push(row);
            else await db.createCollection(row.name,row.options);
        } else if(row.type === 'document') {
            if (row.name !== current) throw Error('Invalid document order.');
            batch.push(row.document);counts[current]++;
            if(batch.length >= 100) await flush();
        } else if(row.type === 'footer') {await flush();}
    }
    for(const def of definitions) {
        for(const index of def.indexes || []) {
            if(index.name === '_id_') continue;
            const {key,name,ns,v,background,...options} = index;
            await db.collection(def.name).createIndex(key,{...options,name});
        }
    }
    // Views can depend on other views; MongoDB validates cycles itself.
    for(const view of views) await db.createCollection(view.name,view.options);
    for(const def of definitions.filter(row=>row.kind!=='view')) {
        const count = await db.collection(def.name).countDocuments();
        if(count !== counts[def.name]) throw Error('Restored document count mismatch.');
    }
    return counts;
}
async function main() {
    const [file,keyFile,database] = process.argv.slice(2);
    if(!file||!keyFile||!database||!process.env.RESTORE_MONGODB_URI) throw Error('Usage: set RESTORE_MONGODB_URI securely, then node scripts/restore-backup.js ARCHIVE KEY_FILE ideal_crm_restore_NAME');
    const mongoose = require('mongoose'), EJSON = mongoose.mongo.BSON.EJSON;
    const recovery = JSON.parse(await fs.promises.readFile(keyFile,'utf8'));
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(),'ideal-restore-'));
    const client = new mongoose.mongo.MongoClient(process.env.RESTORE_MONGODB_URI);
    try {
        const verified = await verifyArchive({file,dir,EJSON,key:keyOf(recovery.key)});
        // Authentication and content checksum verification complete BEFORE connecting to the destination.
        await client.connect();
        const counts = await restoreRecords({file:verified.plaintext,db:client.db(database),EJSON});
        console.log('Restore rehearsal complete. Collection counts:',JSON.stringify(counts));
        console.log('Validate representative records and app behavior separately. Production was not modified.');
    } finally {await client.close();await fs.promises.rm(dir,{recursive:true,force:true});}
}
if(require.main === module) main().catch(() => {console.error('Restore failed. Verify destination, credentials, archive and recovery key. No credentials are printed. Inspect the isolated destination before retrying.');process.exitCode=1;});
module.exports = {restoreRecords};
