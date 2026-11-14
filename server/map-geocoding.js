'use strict';
// An authenticated, user-triggered address lookup for dealer locations only.
// Nominatim usage: no autocomplete, no batch jobs, <=1 request/second globally,
// attributable User-Agent, caching and conservative per-user quota.
// https://operations.osmfoundation.org/policies/nominatim/
const rateLimit = require('express-rate-limit');
const NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const MAX_CACHE = 400;
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_INTERVAL_MS = 1200;
const USER_AGENT = process.env.CRM_GEOCODER_USER_AGENT ||
    'IDEALFloorCRM/1.0 (+https://dealer-crm.onrender.com; IDEAL FLOOR)';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function cleanQuery(input, maxLength = 140) {
    return String(input == null ? '' : input).replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,maxLength);
}
function validKazakhstanPoint(lat,lng) {
    const a=Number(lat),b=Number(lng);
    return Number.isFinite(a)&&Number.isFinite(b)&&a>=40&&a<=56.5&&b>=45&&b<=88.5;
}
function parseResults(rows) {
    if (!Array.isArray(rows)) return [];
    const used = new Set();
    return rows.slice(0,12).map(row => {
        const lat=Number(row?.lat),lon=Number(row?.lon),name=cleanQuery(row?.display_name,210);
        if (!validKazakhstanPoint(lat,lon) || !name) return null;
        const key=lat.toFixed(5)+':'+lon.toFixed(5);
        if (used.has(key)) return null;
        used.add(key);
        return {lat,lon,name};
    }).filter(Boolean).slice(0,6);
}
function createLookup(options={}) {
    const request=options.fetchImpl || fetch;
    const sleep=options.sleep || delay;
    const clock=options.clock || Date.now;
    const cache=new Map();
    let lastStarted=0;
    let queue=Promise.resolve();
    let pending=0;
    function enqueue(task) {
        if (pending >= 12) {const err=new Error('Поиск загружен. Повторите запрос чуть позже.');err.status=429;throw err;}
        pending++;
        const job=queue.then(async()=>{
            const wait=Math.max(0,lastStarted+MIN_INTERVAL_MS-clock());
            if (wait) await sleep(wait);
            lastStarted=clock();
            try {return await task();} finally {pending--;}
        });
        queue=job.catch(()=>{});
        return job;
    }
    return async function lookup(q,city='') {
        const address=cleanQuery(q), town=cleanQuery(city,70);
        if (address.length<3) {const err=new Error('Введите адрес длиной не менее трёх символов.');err.status=400;throw err;}
        const key=(address+'|'+town).toLocaleLowerCase('ru');
        const fromCache=cache.get(key);
        if (fromCache && clock()-fromCache.time<CACHE_TTL_MS) return fromCache.rows;
        const query = town && !address.toLocaleLowerCase('ru').includes(town.toLocaleLowerCase('ru'))
            ? address+', '+town : address;
        const params=new URLSearchParams({
            q:query,format:'jsonv2',countrycodes:'kz',limit:'6',addressdetails:'1',
            'accept-language':'ru,kk'
        });
        const url=NOMINATIM_ENDPOINT+'?'+params.toString();
        const rows=await enqueue(async()=>{
            const controller=new AbortController();
            const timer=setTimeout(()=>controller.abort(),8500);
            timer.unref?.();
            try {
                const response=await request(url,{headers:{
                    'User-Agent':USER_AGENT,
                    'Accept':'application/json',
                    'Accept-Language':'ru,kk;q=0.8'
                },signal:controller.signal});
                if (!response.ok) {
                    const err=new Error(response.status===429
                        ? 'Картографический поиск временно ограничен. Повторите позже.'
                        : 'Сервис адресного поиска временно недоступен.');
                    err.status=response.status===429?429:503;
                    throw err;
                }
                return parseResults(await response.json());
            } finally { clearTimeout(timer); }
        });
        if (cache.size>=MAX_CACHE) cache.delete(cache.keys().next().value);
        cache.set(key,{time:clock(),rows});
        return rows;
    };
}
function install({app,Dealer,requireAnyPermission,requirePermission,getDealerFilter,mongoose}) {
    const lookup=createLookup();
    const limiter=rateLimit({
        windowMs:60*1000,limit:8,standardHeaders:'draft-7',legacyHeaders:false,
        message:{error:'Слишком много запросов поиска. Повторите через минуту.'}
    });
    app.get('/api/map/geocode',
        requireAnyPermission('can_view_map','can_view_dealers','can_edit_dealer','can_create_dealer'),
        limiter,
        async(req,res)=>{
            try {
                const rows=await lookup(req.query?.q,req.query?.city);
                res.json({results:rows,source:'OpenStreetMap · Nominatim'});
            } catch(error) {
                res.status(error.status||503).json({error:error.message||'Не удалось найти адрес'});
            }
        }
    );
    app.patch('/api/dealers/:id/location',requirePermission('can_edit_dealer'),async(req,res)=>{
        try {
            const id=String(req.params.id||'');
            if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({error:'Некорректный ID дилера'});
            const lat=req.body?.latitude,lon=req.body?.longitude;
            if (lat==null || lon==null || !validKazakhstanPoint(lat,lon)) return res.status(400).json({error:'Выберите точку на карте Казахстана'});
            if (req.body?.confirmed !== true) return res.status(400).json({error:'Подтвердите расположение дилера'});
            const updated=await Dealer.findOneAndUpdate(
                {_id:id,...getDealerFilter(req)},
                {$set:{latitude:Number(lat),longitude:Number(lon),geoUpdatedAt:new Date(),geoSource:'verified-on-map'}},
                {new:true,runValidators:true}
            ).select('_id latitude longitude geoUpdatedAt').lean();
            if (!updated) return res.status(404).json({error:'Дилер не найден или нет доступа'});
            res.json({status:'ok',latitude:updated.latitude,longitude:updated.longitude,geoUpdatedAt:updated.geoUpdatedAt});
        } catch(error) {
            res.status(500).json({error:'Не удалось сохранить точку дилера'});
        }
    });
}
module.exports={install,createLookup,cleanQuery,parseResults,validKazakhstanPoint};
