const XLSX = require('xlsx');
const crypto = require('crypto');
const { planStockImport } = require('./stock-file');
const SENDERS = new Set(['idealfloor.sales@gmail.com', 'idealfloor.sale@mail.ru']);
const INTERVAL = 5 * 60 * 1000;
const MAX_BYTES = 20 * 1024 * 1024;
function stockAttachments(payload) {
    const found = [];
    function walk(part) {
        if (/^остатки\s+на(?=\s|\d|[_.-])/iu.test(String(part.filename || '').normalize('NFKC')) && /\.xlsx?$/i.test(part.filename)) found.push(part);
        for (const child of part.parts || []) walk(child);
    }
    walk(payload || {});
    return found;
}
function senderOf(message) {
    const from = (message.payload?.headers || []).find(h => h.name.toLowerCase() === 'from')?.value || '';
    return (from.match(/<([^>]+)>/)?.[1] || from).trim().toLowerCase();
}
async function jsonRequest(url, options = {}) {
    const response = await fetch(url, { ...options, signal:AbortSignal.timeout(30000) });
    if (!response.ok) {
        // Expose only machine-readable Google error reasons, never response text or credentials.
        const payload = await response.json().catch(() => ({}));
        const reasons = [payload.error?.status, ...(payload.error?.errors || []).map(e => e.reason),
            ...(payload.error?.details || []).map(e => e.reason)].filter(v => typeof v === 'string' && /^[A-Za-z_]+$/.test(v));
        throw new Error(`Google API: HTTP ${response.status}${reasons.length ? ' (' + [...new Set(reasons)].join(', ') + ')' : ''}. Проверьте разрешение Gmail и срок действия доступа.`);
    }
    return response.json();
}
function createGmailStockSync({ Product, StockImportMeta, AuditLog, connection, ready, env = process.env, pause = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
    let timer, running = false;
    const configured = () => ['GMAIL_CLIENT_ID','GMAIL_CLIENT_SECRET','GMAIL_REFRESH_TOKEN'].every(k => String(env[k] || '').trim());
    const state = () => connection.collection('gmail_stock_sync');
    async function run() {
        if (running || !configured() || !ready()) return;
        running = true;
        const owner = crypto.randomUUID();
        let locked = false;
        try {
            await state().updateOne({_id:'free_stock'}, {$setOnInsert:{lastMessageAt:0}}, {upsert:true});
            const lock = await state().updateOne({_id:'free_stock', $or:[{leaseUntil:{$lt:new Date()}},{leaseUntil:{$exists:false}}]}, {$set:{owner, leaseUntil:new Date(Date.now()+10*60*1000)}});
            if (!lock.modifiedCount) return;
            locked = true;
            const previous = await state().findOne({_id:'free_stock'});
            const token = await jsonRequest('https://oauth2.googleapis.com/token', {
                method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'},
                body:new URLSearchParams({client_id:env.GMAIL_CLIENT_ID.trim(),client_secret:env.GMAIL_CLIENT_SECRET.trim(),refresh_token:env.GMAIL_REFRESH_TOKEN.trim(),grant_type:'refresh_token'})
            });
            if (!token.access_token) throw new Error('Google не вернул access token');
            const get = endpoint => jsonRequest('https://gmail.googleapis.com/gmail/v1/users/me/' + endpoint, {headers:{Authorization:`Bearer ${token.access_token}`}});
            const q = `{from:idealfloor.sales@gmail.com from:idealfloor.sale@mail.ru} has:attachment filename:остатки` + (previous.lastMessageAt ? ` after:${Math.max(0,Math.floor(previous.lastMessageAt/1000)-1)}` : '');
            let latest = null;
            // Search recent mail first; only widen the window if no stock file is found.
            // Do not exhaust the per-user quota scanning years of duplicated reports.
            for (const days of (previous.lastMessageAt ? [0] : [1,7,30,365,0])) {
            const searchQuery = q + (days ? ` newer_than:${days}d` : '');
            let pageToken = '';
            do {
                // Renew the lease during pagination; a lost lease prevents writes.
                const renewal = await state().updateOne({_id:'free_stock',owner}, {$set:{leaseUntil:new Date(Date.now()+10*60*1000)}});
                if (!renewal.matchedCount) throw new Error('Проверка почты прервана: блокировка потеряна');
                const page = await get('messages?' + new URLSearchParams({q:searchQuery,maxResults:'100',...(pageToken ? {pageToken} : {})}));
                for (const item of page.messages || []) {
                    await pause(800);
                    const message = await get(`messages/${encodeURIComponent(item.id)}?format=full`);
                    const timestamp = Number(message.internalDate);
                    if (!SENDERS.has(senderOf(message)) || !Number.isFinite(timestamp) || timestamp <= (previous.lastMessageAt || 0)) continue;
                    const attachments = stockAttachments(message.payload);
                    if (!attachments.length) continue;
                    if (!latest || timestamp > latest.timestamp) latest = {message,timestamp,attachments};
                }
                pageToken = page.nextPageToken || '';
            } while (pageToken);
            if (latest) break;
            }
            if (latest) {
                if (latest.attachments.length !== 1) throw new Error('В последнем письме несколько файлов остатков; требуется ручная проверка');
                const part = latest.attachments[0];
                if (part.body?.size > MAX_BYTES) throw new Error('Файл остатков превышает 20 МБ');
                const body = part.body?.attachmentId ? await get(`messages/${encodeURIComponent(latest.message.id)}/attachments/${encodeURIComponent(part.body.attachmentId)}`) : part.body;
                if (!body?.data) throw new Error('Вложение остатков пустое');
                const buffer = Buffer.from(body.data, 'base64url');
                if (buffer.length > MAX_BYTES) throw new Error('Файл остатков превышает 20 МБ');
                const workbook = XLSX.read(buffer, {type:'buffer'});
                const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], {header:1,defval:''});
                const products = await Product.find({}).select('_id sku name excel_alias stock_qty').lean();
                const plan = planStockImport(rows, products);
                const lease = await state().findOne({_id:'free_stock',owner,leaseUntil:{$gt:new Date()}});
                if (!lease || !ready()) throw new Error('Импорт прерван до записи остатков');
                if (plan.operations.length) await Product.bulkWrite(plan.operations, {ordered:true});
                const importedAt = new Date();
                await StockImportMeta.findOneAndUpdate({key:'free_stock'}, {$set:{importedAt,importedBy:{id:'gmail-stock',name:'Автоматически из Gmail'},source:plan.source,fileName:part.filename,matched:plan.matched,updated:plan.operations.length}}, {upsert:true});
                await AuditLog.create({actor:{id:'gmail-stock',name:'Автоимпорт Gmail',role:'system'},module:'products',action:'stock_import',entityType:'products',summary:`Импорт остатков из Gmail: ${part.filename}`,success:true,meta:{matched:plan.matched,updated:plan.operations.length,messageAt:new Date(latest.timestamp)}});
                await state().updateOne({_id:'free_stock',owner}, {$set:{lastMessageAt:latest.timestamp,lastMessageId:latest.message.id,lastImportedAt:importedAt,fileName:part.filename,matched:plan.matched,updated:plan.operations.length}});
                console.log('Gmail stock import complete:', plan.matched, 'matched,', plan.operations.length, 'updated');
            }
            await state().updateOne({_id:'free_stock',owner}, {$set:{lastCheckedAt:new Date(),lastError:null}});
        } catch (error) {
            console.error('Gmail stock sync:', error.message);
            if (locked) await state().updateOne({_id:'free_stock',owner}, {$set:{lastCheckedAt:new Date(),lastError:String(error.message).slice(0,400)}}).catch(() => {});
        } finally {
            if (locked) await state().updateOne({_id:'free_stock',owner}, {$unset:{owner:'',leaseUntil:''}}).catch(() => {});
            running = false;
        }
    }
    return {
        start() { if (timer || !configured()) return; timer = setInterval(() => { void run(); }, INTERVAL); timer.unref?.(); void run(); },
        stop() { clearInterval(timer); timer = null; },
        run,
        async status() { const s = await state().findOne({_id:'free_stock'}); return {configured:!!configured(),intervalMinutes:5,lastCheckedAt:s?.lastCheckedAt || null,lastImportedAt:s?.lastImportedAt || null,fileName:s?.fileName || '',matched:s?.matched || 0,updated:s?.updated || 0,lastError:s?.lastError || null}; }
    };
}
module.exports = { createGmailStockSync, stockAttachments, senderOf };
