'use strict';
const {handle, handles: dealerHandles} = require('../public/instagram-accounts');

const localDate = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Almaty', year: 'numeric', month: '2-digit', day: '2-digit'
});
const dayOf = value => localDate.format(new Date(value));
const normalize = value => String(value || '').normalize('NFKC').toLowerCase()
    .replace(/[‐‑‒–—−]/g, '-').replace(/ё/g, 'е');
const escapePattern = value => value.replace(/[.*+?^{}$()|[\]\\]/g, '\\$&');
function matcher(value) {
    const escaped = escapePattern(normalize(value).trim());
    return escaped ? new RegExp('(?:^|[^\\p{L}\\p{N}])' + escaped + '(?![\\p{L}\\p{N}])','u') : null;
}

function competitorDirectory(records) {
    const byName = new Map();
    for (const record of records) {
        const name = String(record.name || '').trim().replace(/\s+/g,' ');
        if (!name) continue;
        const key = normalize(name);
        if (!byName.has(key)) byName.set(key,{name,pattern:matcher(name),accounts:new Set()});
        const accounts = byName.get(key).accounts;
        if (handle(name) === key) accounts.add(key);
        const account = handle(record.instagram);
        if (account) accounts.add(account);
    }
    return [...byName.values()];
}

function skuPattern(sku) {
    const parts = normalize(sku).trim().split(/\s*-\s*/u);
    const pattern = parts.map(escapePattern).join('\\s*-\\s*');
    return new RegExp('(?:^|[^\\p{L}\\p{N}_-])' + pattern + '(?![\\p{L}\\p{N}_]|-[\\p{L}\\p{N}])','u');
}

// A name without a SKU identifies a decor only when unique in the catalogue
// and explicitly paired with IDEAL FLOOR in the caption.
function productDirectory(catalog) {
    const key = p => normalize(p.name).trim().replace(/\s+/g,' ');
    const codesByName = new Map();
    const suffixes = new Set();
    for (const p of catalog) {
        const name = key(p);
        if (!codesByName.has(name)) codesByName.set(name,new Set());
        codesByName.get(name).add(p.sku);
        const parts = name.split(' ');
        for (let i=1; i<parts.length; i++) suffixes.add(parts.slice(i).join(' '));
    }
    const brand = '(?:ideal[ ._-]?floor(?:\\.kz)?|ideafloor\\.kz|идеал[ -]?флор)';
    const join = '[ \\t«»"“”„:,-]+';
    const start = '(?:^|[^\\p{L}\\p{N}._@])';
    return catalog.filter(p=>String(p.sku || '').trim()).map(p=>{
        const name = key(p);
        let namePattern = null;
        if (name.length >= 5 && /\p{L}/u.test(name) && codesByName.get(name).size === 1) {
            const words = name.split(' ').map(escapePattern).join('[ \\t]+');
            const brandFirst = '@?' + brand + join + words + '(?=[ \\t]*(?:$|[»"”.,;!?#()\\n]))';
            const nameFirst = words + join + '(?:от[ \\t]+)?@?' + brand + '(?![\\p{L}\\p{N}_]|\\.[\\p{L}\\p{N}_])';
            const nameStart = suffixes.has(name) ? '(?:^|[\\n:;,.!?«(])[ \\t"«]*' : start;
            namePattern = new RegExp(start + brandFirst + '|' + nameStart + nameFirst,'u');
        }
        return {sku:p.sku,pattern:skuPattern(p.sku),namePattern};
    });
}

function previous(month) {
    const date = new Date(month + '-01T12:00:00Z');
    date.setUTCMonth(date.getUTCMonth() - 1);
    return date.toISOString().slice(0, 7);
}
function classify(posts, products, competitors) {
    return posts.filter(p => p.timestamp && Number.isFinite(+new Date(p.timestamp))).map(post => {
        const caption = normalize(post.caption);
        const accounts = [];
        const prose = caption.replace(/(^|[^\p{L}\p{N}._])@([a-z0-9._]+)/gu, (_,prefix,account) => {
            accounts.push(account.replace(/\.+$/,''));
            return prefix + ' ';
        });
        const codes = new Set(), names = new Set();
        for (const p of products) {
            if (p.pattern?.test(prose)) codes.add(p.sku);
            else if (post.textMatch && p.namePattern?.test(caption)) names.add(p.sku);
        }
        const namedSkus = [...names].filter(sku=>!codes.has(sku));
        const skus = [...codes,...namedSkus];
        const brands = competitors.filter(c=>c.pattern?.test(prose) || accounts.some(a=>c.accounts?.has(a))).map(c=>c.name);
        const interactions = [post.likeCount, post.commentsCount].every(Number.isFinite)
            ? post.likeCount + post.commentsCount : null;
        return { id: post.id, username: post.username, day: dayOf(post.timestamp), skus, namedSkus, brands, ideal: Boolean(post.textMatch || skus.length),
            interactions, url: /^https:\/\/(?:www\.)?instagram\.com\//i.test(post.permalink) ? post.permalink : '' };
    });
}
function install(options) {
    const { mongoose, app, Dealer, Product, Sales, CompRef, Snapshot,
        getDealerFilter, getWorkingDealerFilter, hasPermission, requirePermission, syncDealer, getConnection } = options;
    const schema = new mongoose.Schema({ username: String, id: String, timestamp: Date, caption: String,
        permalink: String, textMatch: Boolean, likeCount: Number, commentsCount: Number });
    schema.index({ username: 1, id: 1 }, { unique: true });
    schema.index({ username: 1, timestamp: 1 });
    const History = mongoose.model('InstagramPostHistory', schema);
    const dailySchema = new mongoose.Schema({ dealer: String, day: String, sku: String, sqm: Number });
    dailySchema.index({ dealer: 1, day: 1, sku: 1 }, { unique: true });
    const Daily = mongoose.model('InstagramReportDailySales', dailySchema);

    async function archive(username, posts) {
        const writes = posts.filter(p => p.id && p.timestamp).map(p => {
            const filter = { username: username.toLowerCase(), id: p.id };
            return { updateOne: { filter, update: { $set: { ...filter, timestamp: p.timestamp,
                caption: p.caption, permalink: p.permalink, textMatch: p.textMatch,
                likeCount: p.likeCount, commentsCount: p.commentsCount } }, upsert: true } };
        });
        if (writes.length) await History.bulkWrite(writes);
    }

    // Advance even after an inaccessible profile; retry on the next rotation.
    const Rotation = mongoose.model('InstagramReportRotation', new mongoose.Schema({
        _id: String, lastDealer: mongoose.Schema.Types.ObjectId
    }));
    let running = false;
    let pausedUntil = 0;
    let migrated = false;
    async function tick() {
        if (running || Date.now() < pausedUntil || mongoose.connection.readyState !== 1) return;
        running = true;
        try {
            if (!migrated) {
                for await (const row of Snapshot.find({}).select('username posts').lean().cursor()) {
                    // Existing history takes priority over older cached counters.
                    const missing = await History.distinct('id', { username: row.username, id: { $in: row.posts.map(p => p.id) } });
                    await archive(row.username, row.posts.filter(p => !missing.includes(p.id)));
                }
                migrated = true;
            }
            if (!(await getConnection())?.selectedPageId) return;
            const filter = getWorkingDealerFilter({ $or: [
                { instagram: { $type:'string', $ne:'' } }, { 'instagram_extra.0': { $exists:true } }
            ] });
            const cursor = (await Rotation.findById('dealers').lean())?.lastDealer;
            const query = cursor ? { $and: [filter, { _id: { $gt: cursor } }] } : filter;
            const dealer = await Dealer.findOne(query).select('instagram instagram_extra').sort({ _id: 1 }).lean();
            await Rotation.updateOne({ _id: 'dealers' }, { $set: { lastDealer: dealer?._id || null } }, { upsert: true });
            if (!dealer) return;
            for (const username of dealerHandles(dealer)) {
                const fresh = await Snapshot.exists({ username, fetchedAt: { $gt: new Date(Date.now() - 6 * 3600000) } });
                if (fresh) continue;
                try { await syncDealer(dealer, username); }
                catch (error) {
                    if ([4, 17, 32, 613, 190].includes(error.metaCode) || error.status === 429) throw error;
                    console.warn('Instagram profile update failed', error.metaCode || error.name);
                }
            }
        } catch (error) {
            if ([4, 17, 32, 613, 190].includes(error.metaCode) || error.status === 429) pausedUntil = Date.now() + 3600000;
            console.warn('Instagram background update failed', error.metaCode || error.name);
        } finally { running = false; }
    }
    setInterval(tick, 60000).unref();

    app.get('/api/instagram/report', requirePermission('can_view_dealers'), async (req, res) => {
        const month = req.query.month || dayOf(Date.now()).slice(0, 7);
        if (!/^20\d\d-(0[1-9]|1[0-2])$/.test(month)) return res.status(400).json({error:'Некорректный месяц'});
        try {
            const canSales = hasPermission(req, 'can_view_sales');
            const canMatrix = ['can_view_products','can_view_report'].some(p => hasPermission(req,p));
            const canCompetitors = hasPermission(req,'can_view_competitors');
            const before = previous(month);
            // Use a UTC midday anchor so month transitions cannot roll back a month.
            const next = new Date(month + '-01T12:00:00Z');
            next.setUTCMonth(next.getUTCMonth() + 1);
            const [dealers, catalog, rivals] = await Promise.all([
                Dealer.find(getWorkingDealerFilter(getDealerFilter(req))).select('dealer_id name city region_sector responsible instagram instagram_extra products').sort({name:1}).lean(),
                canMatrix ? Product.find({ product_type: { $ne: 'equipment' } }).select('sku name collection is_archived').lean() : [],
                canCompetitors ? CompRef.find({}).select('name instagram').lean() : []
            ]);
            const handles = [...new Set(dealers.flatMap(dealerHandles))];
            const ids = dealers.map(d => String(d._id));
            const [posts, snapshots, sales, daily] = await Promise.all([
                History.find({ username: { $in: handles }, timestamp: { $gte: new Date(before+'-01T00:00:00+05:00'), $lt: new Date(next.toISOString().slice(0,7)+'-01T00:00:00+05:00') } }).lean(),
                Snapshot.find({username:{$in:handles}}).select('username fetchedAt').lean(),
                canSales ? Sales.find({ dealerId:{$in:ids}, month, isCustom:{$ne:true} }).select('dealerId fact').lean() : [],
                canSales ? Daily.find({ dealer:{$in:ids},day:{$gte:month+'-01',$lte:month+'-31'} }).lean() : []
            ]);
            const products = productDirectory(catalog);
            const brands = competitorDirectory(rivals);
            const grouped = new Map();
            for (const post of posts) {
                if (!grouped.has(post.username)) grouped.set(post.username, []);
                grouped.get(post.username).push(post);
            }
            const checked = new Map(snapshots.map(s => [s.username,s.fetchedAt]));
            const rows = dealers.map(d => {
                const usernames = dealerHandles(d);
                const dates = usernames.map(name => checked.get(name)).filter(Boolean);
                const id = String(d._id);
                const facts = sales.filter(s => s.dealerId === id && Number.isFinite(s.fact));
                return { id, name:d.name, code:d.dealer_id, city:d.city, sector:d.region_sector, manager:d.responsible,
                    username:usernames[0], usernames, checkedProfiles:dates.length, hasMonthCheck:dates.some(date=>dayOf(date).startsWith(month)),
                    checked:dates.length === usernames.length && dates.length ? new Date(Math.min(...dates.map(Number))) : null, displayed:canMatrix ? (d.products || []).map(String) : [],
                    posts:classify(usernames.flatMap(name=>grouped.get(name)||[]),products,brands), daily:daily.filter(s => s.dealer === id).map(s => ({day:s.day,sku:s.sku,sqm:s.sqm})),
                    sales:facts.length ? facts.reduce((a,s)=>a+s.fact,0) : null };
            });
            res.json({month, rows, canSales, canMatrix, canCompetitors, hasCompetitorBrands:brands.length > 0,
                canImport:canSales && hasPermission(req,'can_edit_sales_fact'),
                catalog:catalog.map(p => ({id:String(p._id),sku:p.sku,name:p.name,collection:p.collection,archived:p.is_archived}))});
        } catch (err) { res.status(500).json({error:'Не удалось загрузить отчёт Instagram'}); }
    });

    app.post('/api/instagram/report/daily-sales', requirePermission('can_edit_sales_fact'), requirePermission('can_view_sales'), requirePermission('can_view_dealers'), async (req,res) => {
        const rows = req.body?.rows;
        if (!Array.isArray(rows) || !rows.length || rows.length > 10000) return res.status(400).json({error:'Допустимо от 1 до 10 000 строк'});
        try {
            const [dealers, products] = await Promise.all([
                Dealer.find(getWorkingDealerFilter(getDealerFilter(req))).select('dealer_id').lean(),
                Product.distinct('sku',{product_type:{$ne:'equipment'}})
            ]);
            const ids = new Map(dealers.map(d => [d.dealer_id,String(d._id)]));
            const skus = new Set(products);
            const keys = new Set();
            const writes = [];
            for (const [i, row] of rows.entries()) {
                const [day,code,sku,raw] = Array.isArray(row) ? row : [];
                const dealer = ids.get(code);
                const sqm = Number(String(raw).replace(',','.'));
                const key = JSON.stringify([dealer,day,sku]);
                if (!dealer || !skus.has(sku) || !/^20\d\d-\d\d-\d\d$/.test(day) || !Number.isFinite(Date.parse(day)) ||
                    new Date(day).toISOString().slice(0,10)!==day || !/^-?\d+(?:[.,]\d+)?$/.test(raw) || !Number.isFinite(sqm) || keys.has(key) || row.length !== 4) {
                    return res.status(400).json({error:'Строка '+(i+2)+': проверьте дату, код дилера, артикул, метры и повторы'});
                }
                keys.add(key);
                const filter = {dealer,day,sku};
                writes.push({updateOne:{filter,update:{$set:{...filter,sqm}},upsert:true}});
            }
            await Daily.bulkWrite(writes);
            res.json({count:writes.length});
        } catch (_) { res.status(500).json({error:'Импорт прерван. Повторите загрузку того же файла.'}); }
    });
    return { archive };
}
module.exports = { install, classify, matcher, previous, competitorDirectory, productDirectory };
