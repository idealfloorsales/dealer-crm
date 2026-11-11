'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const {Readable, Transform} = require('node:stream');
const {pipeline} = require('node:stream/promises');
const readline = require('node:readline');
const MAGIC = Buffer.from('IDEALBK1\n');
const MAX_BYTES = 1024 * 1024 * 1024;
function keyOf(value) {
    if (!/^[a-f0-9]{64}$/i.test(String(value || ''))) throw Error('BACKUP_KEY_MISSING');
    return Buffer.from(value, 'hex');
}
function secretKey(key) { return crypto.createHmac('sha256', key).update('ideal-crm-oauth-v1').digest(); }
function seal(value, key) {
    const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', secretKey(key), iv);
    return Buffer.concat([iv, cipher.update(value, 'utf8'), cipher.final(), cipher.getAuthTag()]).toString('base64');
}
function unseal(value, key) {
    const bytes = Buffer.from(value, 'base64'), cipher = crypto.createDecipheriv('aes-256-gcm', secretKey(key), bytes.subarray(0,12));
    cipher.setAuthTag(bytes.subarray(-16));
    return Buffer.concat([cipher.update(bytes.subarray(12,-16)),cipher.final()]).toString('utf8');
}
async function createArchive({db, EJSON, key, signal}) {
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ideal-backup-'));
    const file = path.join(dir, 'backup.idealbak');
    const cleanup = () => fs.promises.rm(dir, {recursive:true, force:true});
    const counts = {}, createdAt = new Date().toISOString();
    const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(MAGIC);
    const digest = crypto.createHash('sha256');
    const encode = value => {
        const line = EJSON.stringify(value, {relaxed:false}) + '\n';
        digest.update(line);
        return line;
    };
    async function* records() {
        yield encode({type:'header', format:'ideal-crm-ejson-v1', createdAt, database:db.databaseName, consistency:'online-sequential', externalFiles:'references-only'});
        for await (const info of db.listCollections({}, {nameOnly:false})) {
            signal?.throwIfAborted();
            if (info.name.startsWith('system.')) continue;
            if (info.type !== 'collection' && info.type !== 'view') throw Error('UNSUPPORTED_COLLECTION');
            const collection = db.collection(info.name);
            const indexes = info.type === 'view' ? [] : await collection.listIndexes().toArray();
            yield encode({type:'collection', name:info.name, kind:info.type, options:info.options || {}, indexes});
            counts[info.name] = 0;
            if (info.type === 'view') continue;
            const cursor = collection.find({}, {promoteValues:false, promoteLongs:false, batchSize:100, maxTimeMS:300000});
            try {
                for await (const document of cursor) {
                    signal?.throwIfAborted();
                    counts[info.name]++;
                    yield encode({type:'document', name:info.name, document});
                }
            } finally { await cursor.close(); }
        }
        yield EJSON.stringify({type:'footer', counts, sha256:digest.digest('hex')}, {relaxed:false}) + '\n';
    }
    try {
        await fs.promises.writeFile(file, Buffer.concat([MAGIC, iv]), {mode:0o600, flag:'wx'});
        let size = 0;
        const limit = new Transform({transform(chunk, encoding, callback) {
            size += chunk.length;
            callback(size > MAX_BYTES ? Error('BACKUP_TOO_LARGE') : null, chunk);
        }});
        await pipeline(Readable.from(records()), zlib.createGzip(), cipher, limit, fs.createWriteStream(file, {flags:'a', mode:0o600}), {signal});
        await fs.promises.appendFile(file, cipher.getAuthTag());
        const verified = await verifyArchive({file, dir, EJSON, key});
        await fs.promises.unlink(verified.plaintext);
        const hash = crypto.createHash('md5');
        for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
        return {file, dir, counts, createdAt, size:(await fs.promises.stat(file)).size, md5:hash.digest('hex'), cleanup};
    } catch (error) { await cleanup(); throw error; }
}
async function verifyArchive({file, dir, EJSON, key}) {
    const size = (await fs.promises.stat(file)).size;
    if (size < MAGIC.length + 28 || size > MAX_BYTES + 100) throw Error('INVALID_ARCHIVE');
    const handle = await fs.promises.open(file, 'r');
    const header = Buffer.alloc(MAGIC.length + 12), tag = Buffer.alloc(16);
    try { await handle.read(header, 0, header.length, 0); await handle.read(tag, 0, 16, size - 16); }
    finally { await handle.close(); }
    if (!header.subarray(0,MAGIC.length).equals(MAGIC)) throw Error('INVALID_ARCHIVE');
    const cipher = crypto.createDecipheriv('aes-256-gcm', key, header.subarray(MAGIC.length));
    cipher.setAAD(MAGIC); cipher.setAuthTag(tag);
    const plaintext = path.join(dir, 'verified.jsonl');
    try {
        // Authenticate the whole archive before making it available for any restoration.
        await pipeline(fs.createReadStream(file, {start:header.length, end:size - 17}), cipher, zlib.createGunzip(), fs.createWriteStream(plaintext, {mode:0o600, flags:'wx'}));
        const counts = {}, names = new Set(), digest = crypto.createHash('sha256');
        let headerSeen = false, footer = null;
        const lines = readline.createInterface({input:fs.createReadStream(plaintext), crlfDelay:Infinity});
        for await (const line of lines) {
            if (footer) throw Error('INVALID_ARCHIVE');
            const row = EJSON.parse(line, {relaxed:false});
            if (row.type === 'footer') { footer = row; continue; }
            digest.update(line + '\n');
            if (!headerSeen) {
                if (row.type !== 'header' || row.format !== 'ideal-crm-ejson-v1') throw Error('INVALID_ARCHIVE');
                headerSeen = true;
            } else if (row.type === 'collection' && typeof row.name === 'string' && !names.has(row.name)) {
                names.add(row.name); counts[row.name] = 0;
            } else if (row.type === 'document' && names.has(row.name)) { counts[row.name]++; }
            else throw Error('INVALID_ARCHIVE');
        }
        if (!footer || digest.digest('hex') !== footer.sha256 || JSON.stringify(counts) !== JSON.stringify(footer.counts)) throw Error('INVALID_ARCHIVE');
        return {plaintext, counts};
    } catch (error) { await fs.promises.rm(plaintext, {force:true}); throw error; }
}
module.exports = {createArchive, verifyArchive, keyOf, seal, unseal};
