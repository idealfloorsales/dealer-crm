'use strict';
const fs = require('node:fs');
const crypto = require('node:crypto');
const {createArchive, keyOf, seal, unseal} = require('./backup-archive');
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const DAY = 24 * 60 * 60 * 1000;
const errors = {
    BACKUP_KEY_MISSING:'Ключ резервирования ещё не настроен.',
    BACKUP_BUSY:'Копирование уже выполняется. Дождитесь завершения.',
    GOOGLE_NOT_CONNECTED:'Сначала подключите Google Диск.',
    GOOGLE_CLIENT_MISSING:'Не настроен OAuth-клиент Google.',
    GOOGLE_RECONNECT:'Подключите Google Диск заново.',
    GOOGLE_SCOPE:'Google не предоставил право сохранять файлы.',
    GOOGLE_API_DISABLED:'Включите Google Drive API в проекте Google Cloud.',
    GOOGLE_PERMISSION:'Google Диск отклонил запрос. Проверьте разрешение и свободное место.',
    BACKUP_TOO_LARGE:'Архив превышает лимит 1 ГБ. Нужен отдельный сервер резервирования.',
    BACKUP_VERIFY:'Проверка загруженного файла не пройдена. Копия не засчитана.',
    UNSUPPORTED_COLLECTION:'Найден неподдерживаемый тип коллекции. Требуется mongodump.',
    DB_NOT_READY:'База временно недоступна. Повторите позже.'
};
function message(error) { return errors[error?.message] || 'Не удалось завершить копирование. Повторите позже; при повторной ошибке обратитесь к администратору.'; }
function hash(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function registerBackups({app, connection, EJSON, User, AuditLog, requireAdmin, origin, env = process.env, ready}) {
    const config = () => connection.collection('crm_backup_config');
    const key = () => keyOf(env.BACKUP_ENCRYPTION_KEY);
    const client = () => ({id:env.BACKUP_GOOGLE_CLIENT_ID || env.GMAIL_CLIENT_ID, secret:env.BACKUP_GOOGLE_CLIENT_SECRET || env.GMAIL_CLIENT_SECRET});
    const redirect = origin + '/backup-google/callback';
    let running = false, timer;
    async function google(url, options = {}) {
        const response = await fetch(url, {...options, signal:options.signal || AbortSignal.timeout(60000)});
        if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            const reasons = (payload.error?.errors || []).map(e => e.reason);
            if (response.status === 401 || payload.error === 'invalid_grant') throw Error('GOOGLE_RECONNECT');
            if (reasons.includes('accessNotConfigured') || (payload.error?.details || []).some(e => e.reason === 'SERVICE_DISABLED')) throw Error('GOOGLE_API_DISABLED');
            throw Error('GOOGLE_PERMISSION');
        }
        return response;
    }
    async function token() {
        const settings = await config().findOne({_id:'drive'}), c = client();
        if (!settings?.refreshTokenSecret) throw Error('GOOGLE_NOT_CONNECTED');
        if (!c.id || !c.secret) throw Error('GOOGLE_CLIENT_MISSING');
        const response = await google('https://oauth2.googleapis.com/token', {
            method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'},
            body:new URLSearchParams({client_id:c.id, client_secret:c.secret, grant_type:'refresh_token', refresh_token:unseal(settings.refreshTokenSecret, key())})
        });
        const data = await response.json();
        if (!data.access_token) throw Error('GOOGLE_RECONNECT');
        return {access:data.access_token, folderId:settings.folderId};
    }
    async function audit(action, actor, success, meta = {}) {
        await AuditLog.create({module:'backups', action, entityType:'backup', actor:{id:actor?.id || 'backup-scheduler', name:actor?.fullName || 'Резервирование', role:actor?.role || 'system'}, summary:success ? 'Резервная копия проверена' : 'Ошибка резервирования', success, meta}).catch(() => {});
    }
    async function lock() {
        if (!ready()) throw Error('DB_NOT_READY');
        if (running) throw Error('BACKUP_BUSY');
        key(); running = true;
        const owner = crypto.randomUUID();
        try {
            await config().updateOne({_id:'lease'}, {$setOnInsert:{until:new Date(0)}}, {upsert:true});
            const result = await config().updateOne({_id:'lease', until:{$lt:new Date()}}, {$set:{owner, until:new Date(Date.now()+15*60*1000)}});
            if (!result.modifiedCount) throw Error('BACKUP_BUSY');
            return async () => { running = false; await config().updateOne({_id:'lease',owner}, {$set:{until:new Date(0)},$unset:{owner:''}}).catch(() => {}); };
        } catch (error) { running = false; throw error; }
    }
    async function runDrive(actor, automatic = false) {
        const release = await lock(); let archive;
        try {
            const auth = await token();
            const before = await config().findOne({_id:'drive'});
            if (automatic && (!before?.automatic || (before.lastDriveAt && Date.now()-new Date(before.lastDriveAt).getTime()<DAY))) return;
            const signal = AbortSignal.timeout(10*60*1000);
            archive = await createArchive({db:connection.db,EJSON,key:key(),signal});
            const name = 'IDEAL-CRM-' + archive.createdAt.replace(/[:.]/g,'-') + '.idealbak';
            const session = await google('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,size,md5Checksum,webViewLink', {
                method:'POST', signal, headers:{Authorization:'Bearer '+auth.access,'Content-Type':'application/json','X-Upload-Content-Type':'application/octet-stream','X-Upload-Content-Length':String(archive.size)},
                body:JSON.stringify({name, parents:[auth.folderId], mimeType:'application/octet-stream', description:'Encrypted IDEAL CRM backup. Recovery key required.'})
            });
            const location = session.headers.get('location');
            if (!location?.startsWith('https://www.googleapis.com/upload/drive/')) throw Error('BACKUP_VERIFY');
            const upload = await google(location, {method:'PUT',signal, headers:{Authorization:'Bearer '+auth.access,'Content-Type':'application/octet-stream','Content-Length':String(archive.size)},body:fs.createReadStream(archive.file),duplex:'half'});
            const uploaded = await upload.json();
            if (!uploaded.id) throw Error('BACKUP_VERIFY');
            const checked = await (await google('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(uploaded.id)+'?fields=id,size,md5Checksum,shared,trashed', {headers:{Authorization:'Bearer '+auth.access},signal})).json();
            if (checked.trashed || checked.shared || Number(checked.size)!==archive.size || checked.md5Checksum!==archive.md5) throw Error('BACKUP_VERIFY');
            await config().updateOne({_id:'drive'}, {$set:{lastDriveAt:new Date(),lastFileId:checked.id,lastFileName:name,lastBytes:archive.size,lastCounts:archive.counts,lastError:null}});
            await audit('drive_backup',actor,true,{fileId:checked.id,bytes:archive.size,counts:archive.counts});
            return {ok:true};
        } catch (error) {
            await config().updateOne({_id:'drive'}, {$set:{lastError:message(error),lastAttemptAt:new Date()}}, {upsert:true}).catch(() => {});
            await audit('drive_backup',actor,false,{error:message(error)});
            throw error;
        } finally { if (archive) await archive.cleanup(); await release(); }
    }
    app.get('/api/admin/backups/status', requireAdmin, async (req,res) => {
        try {
            const s = await config().findOne({_id:'drive'}) || {}, lease = await config().findOne({_id:'lease'}), c = client();
            const configured = /^[a-f0-9]{64}$/i.test(env.BACKUP_ENCRYPTION_KEY || '');
            res.json({configured, googleConfigured:!!(c.id&&c.secret), connected:!!s.refreshTokenSecret, automatic:!!s.automatic, busy:running||!!(lease?.until>new Date()), redirectUri:redirect,
                lastDriveAt:s.lastDriveAt||null,lastDownloadAt:s.lastDownloadAt||null,lastError:s.lastError||null,lastBytes:s.lastBytes||0,
                folderUrl:s.folderId?'https://drive.google.com/drive/folders/'+s.folderId:null,
                recoveryKeySaved:!!s.keySavedAt,overdue:!s.lastDriveAt || Date.now()-new Date(s.lastDriveAt).getTime()>36*60*60*1000,
                schedule:'Проверка раз в 15 минут, копия раз в сутки при работающем сервере. Строгое время на Free не гарантируется.'});
        } catch (_) {res.status(503).json({error:'Не удалось получить статус резервирования.'});}
    });
    app.get('/api/admin/backups/recovery-key', requireAdmin, async (req,res) => {
        try {
            key();
            await config().updateOne({_id:'drive'}, {$set:{keySavedAt:new Date()}}, {upsert:true});
            res.set('Content-Disposition','attachment; filename="IDEAL-CRM-recovery-key.json"').type('application/json').send(JSON.stringify({format:'ideal-crm-recovery-key-v1',key:env.BACKUP_ENCRYPTION_KEY,note:'Store offline, separately from backups. Do not share or upload into public repositories.'},null,2));
        } catch (e) {res.status(503).json({error:message(e)});}
    });
    app.post('/api/admin/backups/download', requireAdmin, async (req,res) => {
        let release, archive;
        try {
            if (!(await config().findOne({_id:'drive'}))?.keySavedAt) return res.status(409).json({error:'Сначала сохраните ключ восстановления.'});
            release = await lock();
            archive = await createArchive({db:connection.db,EJSON,key:key(),signal:AbortSignal.timeout(10*60*1000)});
            const name = 'IDEAL-CRM-'+archive.createdAt.replace(/[:.]/g,'-')+'.idealbak';
            await new Promise((resolve,reject) => res.download(archive.file,name,error => error?reject(error):resolve()));
            await config().updateOne({_id:'drive'}, {$set:{lastDownloadAt:new Date()}});
            await audit('download_backup',req.user,true,{counts:archive.counts,bytes:archive.size});
        } catch (error) {if (!res.headersSent) res.status(error.message==='BACKUP_BUSY'?409:503).json({error:message(error)});}
        finally {if(archive) await archive.cleanup();if(release) await release();}
    });
    app.post('/api/admin/backups/drive', requireAdmin, async (req,res) => {
        try {
            if (!(await config().findOne({_id:'drive'}))?.keySavedAt) return res.status(409).json({error:'Сначала сохраните ключ восстановления.'});
            await runDrive(req.user);res.json({ok:true});
        } catch (error) {res.status(error.message==='BACKUP_BUSY'?409:503).json({error:message(error)});}
    });
    app.put('/api/admin/backups/automatic', requireAdmin, async (req,res) => {
        try {
            const s = await config().findOne({_id:'drive'});
            if (req.body.enabled === true && (!s?.refreshTokenSecret || !s.keySavedAt)) return res.status(409).json({error:'Сначала сохраните ключ и подключите Google Диск.'});
            await config().updateOne({_id:'drive'}, {$set:{automatic:req.body.enabled===true}}, {upsert:true});res.json({ok:true});
            if (req.body.enabled === true) void tick();
        } catch (_) {res.status(503).json({error:'Не удалось сохранить настройку.'});}
    });
    app.post('/api/admin/backups/google/connect', requireAdmin, async (req,res) => {
        try {
            key(); const c = client(); if(!c.id||!c.secret) throw Error('GOOGLE_CLIENT_MISSING');
            const state = crypto.randomBytes(32).toString('base64url');
            await config().insertOne({_id:'oauth:'+hash(state),actorId:req.user.id,expiresAt:new Date(Date.now()+10*60*1000)});
            res.cookie('ideal_backup_oauth',state,{httpOnly:true,secure:true,sameSite:'lax',path:'/backup-google/callback',maxAge:10*60*1000});
            const query = new URLSearchParams({client_id:c.id,redirect_uri:redirect,response_type:'code',scope:SCOPE,access_type:'offline',prompt:'consent',state});
            res.json({url:'https://accounts.google.com/o/oauth2/v2/auth?'+query});
        } catch (error) {res.status(503).json({error:message(error)});}
    });
    app.get('/backup-google/callback', async (req,res) => {
        res.set('Cache-Control','no-store').set('Referrer-Policy','no-referrer');
        try {
            const state = String(req.query.state || ''), cookie = String(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('ideal_backup_oauth='))?.slice('ideal_backup_oauth='.length);
            if (!/^[A-Za-z0-9_-]{43}$/.test(state) || cookie !== state) throw Error('OAUTH_STATE');
            const pending = await config().findOneAndDelete({_id:'oauth:'+hash(state),expiresAt:{$gt:new Date()}});
            const row = pending?.actorId ? pending : pending?.value;
            if(!row) throw Error('OAUTH_STATE');
            const user = await User.findById(row.actorId).lean();
            if(!user || user.isBlocked || user.permissions?.is_admin !== true) throw Error('OAUTH_STATE');
            if(req.query.error || typeof req.query.code !== 'string') throw Error('GOOGLE_RECONNECT');
            const c = client();
            const grant = await (await google('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code:req.query.code,client_id:c.id,client_secret:c.secret,redirect_uri:redirect,grant_type:'authorization_code'})})).json();
            if(!String(grant.scope||'').split(' ').includes(SCOPE)) throw Error('GOOGLE_SCOPE');
            if(!grant.refresh_token || !grant.access_token) throw Error('GOOGLE_RECONNECT');
            const previous = await config().findOne({_id:'drive'});
            let folderId = previous?.folderId;
            const headers = {Authorization:'Bearer '+grant.access_token,'Content-Type':'application/json'};
            if(folderId) {
                try {
                    const f = await (await google('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(folderId)+'?fields=id,trashed,shared',{headers})).json();
                    if(f.trashed || f.shared) folderId = null;
                } catch (_) {folderId=null;}
            }
            if(!folderId) {
                const folder = await (await google('https://www.googleapis.com/drive/v3/files?fields=id,shared',{method:'POST',headers,body:JSON.stringify({name:'IDEAL CRM — Автоматические копии',mimeType:'application/vnd.google-apps.folder'})})).json();
                if(!folder.id||folder.shared) throw Error('BACKUP_VERIFY');folderId=folder.id;
            }
            await config().updateOne({_id:'drive'},{$set:{folderId,refreshTokenSecret:seal(grant.refresh_token,key()),connectedAt:new Date(),automatic:false,lastError:null}},{upsert:true});
            res.clearCookie('ideal_backup_oauth',{path:'/backup-google/callback',secure:true,sameSite:'lax'});
            res.redirect('/users.html?backup=connected');
        } catch(error) {
            res.status(400).type('html').send('<!doctype html><meta charset="utf-8"><title>Подключение Google Диска</title><p>Не удалось подключить Google Диск. '+message(error)+'</p><a href="/users.html?backup=error">Вернуться в CRM</a>');
        }
    });
    async function tick() {
        if(!ready() || running || !env.BACKUP_ENCRYPTION_KEY) return;
        try {
            const s = await config().findOne({_id:'drive'});
            if(s?.automatic && s.refreshTokenSecret && s.keySavedAt && (!s.lastDriveAt||Date.now()-new Date(s.lastDriveAt).getTime()>=DAY) && (!s.lastAttemptAt||Date.now()-new Date(s.lastAttemptAt).getTime()>60*60*1000)) await runDrive(null,true);
        } catch (_) { /* Safe user-facing error is persisted by runDrive; never log tokens or database data. */ }
    }
    timer = setInterval(tick,15*60*1000);timer.unref?.();
    const initial = setTimeout(tick,60000);initial.unref?.();
    return {stop(){clearInterval(timer);clearTimeout(initial);},runDrive};
}
module.exports = {registerBackups, message};
