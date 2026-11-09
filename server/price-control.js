'use strict';
const clean = (v, max = 2000) => String(v ?? '').trim().slice(0, max);
const dateKey = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v)) && !Number.isNaN(Date.parse(v+'T00:00:00Z')) && new Date(v+'T00:00:00Z').toISOString().slice(0,10) === v;
const fail = (message, status = 400) => { const e = new Error(message); e.status = status; throw e; };
const confirmed = n => (n.cases || []).filter(c => c.status === 'confirmed');
function summary(n, today) {
    const rows = confirmed(n);
    const surcharge = n.surcharge?.active && n.surcharge.startDate <= today && rows.some(c => String(c._id) === String(n.surcharge.caseId)) ? Number(n.surcharge.percent) : 0;
    const repeat=Boolean(n.warning?.date && rows.some(c=>String(c._id)!==String(n.warning.caseId)&&c.observedDate>=n.warning.date));
    return {count:rows.length, surchargePercent:surcharge, warningDate:n.warning?.date || '', terminated:Boolean(n.closure?.terminatedDate), samplesRemovedDate:n.closure?.samplesRemovedDate || '', stage:n.closure?.terminatedDate?'terminated':repeat?'repeat':n.warning?.date?'warned':rows.length?'confirmed':'clear'};
}
function finalPrice(base, discount, surcharge) {
    return Math.round(Math.max(0, Number(base)||0) * (1-Math.min(100,Math.max(0,Number(discount)||0))/100) * (1+Math.max(0,Number(surcharge)||0)/100)*100)/100;
}
function caseFields(body, today) {
    if (!dateKey(body.observedDate) || body.observedDate > today) fail('Укажите корректную дату фиксации, не позднее сегодня');
    const price = Number(body.offeredPrice);
    if (!Number.isFinite(price) || price <= 0 || price > 100000000) fail('Укажите предложенную цену за м²');
    if (!clean(body.productName,200)) fail('Укажите декор');
    const volume = body.volume === '' || body.volume == null ? null : Number(body.volume);
    if (volume !== null && (!Number.isFinite(volume) || volume <= 0)) fail('Объём должен быть больше нуля');
    return {observedDate:body.observedDate, productName:clean(body.productName,200), sku:clean(body.sku,80), offeredPrice:price, volume, comment:clean(body.comment)};
}
function install({app,mongoose,Dealer,requireAnyPermission,requirePermission,getDealerFilter,isGlobalViewer,hasPermission,today}) {
    const mixed = mongoose.Schema.Types.Mixed;
    const caseSchema = new mongoose.Schema({dealerId:{type:mongoose.Schema.Types.ObjectId,required:true},dealerName:String,observedDate:String,productName:String,sku:String,offeredPrice:Number,volume:Number,comment:String,status:{type:String,enum:['draft','confirmed','cancelled'],default:'draft'},evidence:[String],createdAt:Date,createdBy:mixed,confirmedAt:Date,confirmedBy:mixed});
    const schema = new mongoose.Schema({name:String,members:[{type:mongoose.Schema.Types.ObjectId,ref:'Dealer'}],cases:[caseSchema],warning:mixed,surcharge:mixed,closure:mixed,history:[mixed]}, {timestamps:true,optimisticConcurrency:true});
    schema.index({members:1},{unique:true});
    const Network = mongoose.model('PriceControlNetwork',schema);
    const Evidence = mongoose.model('PriceControlEvidence',new mongoose.Schema({network:{type:mongoose.Schema.Types.ObjectId,required:true,index:true},dealerId:mongoose.Schema.Types.ObjectId,name:String,mime:String,data:String,createdAt:{type:Date,default:Date.now}}));
    const actor = req => ({id:String(req.user?.id || ''),name:clean(req.user?.fullName || req.user?.username,150)});
    const globalManage = req => isGlobalViewer(req) && hasPermission(req,'can_manage_pricing');
    const canReport = req => hasPermission(req,'can_edit_dealer') || hasPermission(req,'can_manage_pricing');
    const accessible = async (req,id) => {
        if(!mongoose.isValidObjectId(id)) fail('Дилер не найден',404);
        const d=await Dealer.findOne({$and:[{_id:id},getDealerFilter(req)]}).select('_id name city dealer_id').lean();
        if(!d) fail('Дилер не найден',404);return d;
    };
    const view = async (req,n,d) => {
        if(!n) return {network:null,cases:[],history:[],members:[d],summary:summary({},today()),version:0,canManage:globalManage(req),canReport:canReport(req)};
        const members=await Dealer.find({$and:[{_id:{$in:n.members}},getDealerFilter(req)]}).select('_id name city dealer_id').lean();
        const ids=new Set(members.map(x=>String(x._id)));
        return {network:{id:String(n._id),name:n.name},version:n.__v,members,cases:n.cases.filter(c=>ids.has(String(c.dealerId))),history:globalManage(req)?n.history:[],summary:summary(n,today()),warning:n.warning,surcharge:n.surcharge,closure:n.closure,canManage:globalManage(req),canReport:canReport(req)};
    };
    const snapshot = n => JSON.parse(JSON.stringify({name:n.name,members:n.members,cases:n.cases,warning:n.warning,surcharge:n.surcharge,closure:n.closure}));
    const writeHistory = (n,req,action,before,reason) => {
        const after=snapshot(n), oldCases=new Map(before.cases.map(c=>[String(c._id),c]));
        const changed=after.cases.filter(c=>JSON.stringify(c)!==JSON.stringify(oldCases.get(String(c._id))));
        before.cases=changed.map(c=>oldCases.get(String(c._id))).filter(Boolean);after.cases=changed;
        n.history.push({at:new Date(),actor:actor(req),action,reason:clean(reason),before,after});
    };
    // One document per network serializes confirmations, sanctions and corrections.
    const save = async n => {try{await n.save();}catch(e){if(e.name==='VersionError'||e.code===11000)fail('Данные сети изменились. Обновите страницу и повторите действие',409);throw e;}};
    const read = requireAnyPermission('can_view_dealers','can_view_pricing');
    const route = fn => async(req,res)=>{try{res.set('Cache-Control','no-store');await fn(req,res);}catch(e){res.status(e.status || 500).json({error:e.status?e.message:'Не удалось сохранить контроль цен'});if(!e.status) console.error('Price control:',e);}};
    const load = async req => {
        const d=await accessible(req,req.params.dealerId);
        const n=await Network.findOne({members:d._id});
        if(n && Number(req.body.version)!==n.__v)fail('Данные изменились. Обновите страницу',409);
        if(!n && req.body.version && Number(req.body.version)!==0)fail('Данные изменились. Обновите страницу',409);
        return {d,n};
    };
    app.get('/api/price-control/dealers/:dealerId',read,route(async(req,res)=>{
        const d=await accessible(req,req.params.dealerId),n=await Network.findOne({members:d._id}).lean();res.json(await view(req,n,d));
    }));
    app.get('/api/price-control',read,route(async(req,res)=>{
        const dealers=await Dealer.find(getDealerFilter(req)).select('_id name city dealer_id').lean();
        const ids=new Set(dealers.map(d=>String(d._id)));
        const networks=await Network.find({members:{$in:dealers.map(d=>d._id)}}).select('-history').lean();
        res.json({dealers,rows:networks.flatMap(n=>n.cases.filter(c=>ids.has(String(c.dealerId))).map(c=>({...c,networkId:String(n._id),networkName:n.name,summary:summary(n,today())})))});
    }));
    app.put('/api/price-control/dealers/:dealerId/network',requirePermission('can_manage_pricing'),route(async(req,res)=>{
        if(!globalManage(req))fail('Изменять состав сети может администратор или маркетинг с правом управления ценами',403);
        const {d,n:existing}=await load(req);
        const ids=[...new Set([String(d._id),...(Array.isArray(req.body.members)?req.body.members:[])].map(String))];
        if(ids.length>500 || ids.some(id=>!mongoose.isValidObjectId(id)))fail('Некорректный состав сети');
        if(await Dealer.countDocuments({_id:{$in:ids}})!==ids.length)fail('Одна из торговых точек не найдена');
        if(await Network.exists({_id:{$ne:existing?._id || new mongoose.Types.ObjectId()},members:{$in:ids}}))fail('Одна из точек уже входит в другую сеть контроля цен. Её историю нельзя объединить автоматически');
        const n=existing || new Network({name:d.name,members:[d._id],cases:[],history:[]});
        const removed=n.members.filter(id=>!ids.includes(String(id)));
        if(removed.length && (n.cases.length || n.warning || n.surcharge?.active || n.closure))fail('После фиксации случаев исключать точки нельзя: это изменит общую историю сети');
        const before=snapshot(n);n.name=clean(req.body.name,150)||d.name;n.members=ids;
        writeHistory(n,req,'Состав сети',before,req.body.reason);await save(n);res.json(await view(req,n,d));
    }));
    app.post('/api/price-control/dealers/:dealerId/cases',read,route(async(req,res)=>{
        if(!canReport(req))fail('Недостаточно прав для фиксации',403);
        let {d,n}=await load(req);const fields=caseFields(req.body,today());
        if(!n)n=new Network({name:d.name,members:[d._id],cases:[],history:[]});
        const before=snapshot(n), evidence=await upload(req,n,d);
        n.cases.push({...fields,dealerId:d._id,dealerName:d.name,evidence,createdAt:new Date(),createdBy:actor(req)});
        writeHistory(n,req,'Добавлена фиксация',before,'');
        try{await save(n);}catch(e){await Evidence.deleteMany({_id:{$in:evidence}});throw e;}
        res.json(await view(req,n,d));
    }));
    async function upload(req,n,d) {
        const files=Array.isArray(req.body.attachments)?req.body.attachments:[];
        if(files.length>5)fail('Можно приложить до 5 изображений');
        const valid=files.map(f=>{
            const m=String(f.data || '').match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/);
            if(!m || Buffer.byteLength(m[2],'base64')>1500000)fail('Фото должно быть JPG, PNG или WebP размером до 1,5 МБ');
            const bytes=Buffer.from(m[2],'base64');
            const magic=m[1]==='image/jpeg'?bytes[0]===255&&bytes[1]===216:m[1]==='image/png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
            if(!magic)fail('Файл не является изображением указанного формата');
            return {network:n._id,dealerId:d._id,name:clean(f.name,150),mime:m[1],data:m[2]};
        });
        return (await Evidence.insertMany(valid)).map(f=>String(f._id));
    }
    app.put('/api/price-control/dealers/:dealerId/cases/:caseId',read,route(async(req,res)=>{
        const {d,n}=await load(req),c=n?.cases.id(req.params.caseId);
        if(!c || String(c.dealerId)!==String(d._id))fail('Фиксация не найдена',404);
        if(c.status==='cancelled')fail('Удалённую фиксацию нельзя редактировать');
        if(!canReport(req) || (c.status==='confirmed' && !globalManage(req)))fail('Недостаточно прав',403);
        if(!clean(req.body.reason))fail('Укажите причину исправления');
        const before=snapshot(n),fields=caseFields(req.body,today());
        if(c.status==='confirmed' && (n.surcharge?.active&&n.surcharge?.caseId===String(c._id) || n.warning?.caseId===String(c._id) || !n.closure?.needsReview&&n.closure?.caseId===String(c._id)))fail('Сначала отмените связанное решение, затем исправьте фиксацию');
        const keep=Array.isArray(req.body.keepEvidence)?req.body.keepEvidence:c.evidence;
        if(keep.some(id=>!c.evidence.includes(id)))fail('Некорректное вложение');
        if(keep.length+(req.body.attachments?.length || 0)>5)fail('Можно приложить до 5 изображений');
        const added=await upload(req,n,d);Object.assign(c,fields,{evidence:[...keep,...added]});
        // Changes to confirmed evidence require a fresh review.
        if(c.status==='confirmed'){c.status='draft';c.confirmedAt=undefined;c.confirmedBy=undefined;}
        writeHistory(n,req,'Исправлена фиксация',before,req.body.reason);
        try{await save(n);}catch(e){await Evidence.deleteMany({_id:{$in:added}});throw e;}
        res.json(await view(req,n,d));
    }));
    app.post('/api/price-control/dealers/:dealerId/actions',read,route(async(req,res)=>{
        const {d,n}=await load(req);if(!n)fail('Сначала добавьте фиксацию');
        const action=req.body.action,c=n.cases.id(req.body.caseId);
        const before=snapshot(n),reason=clean(req.body.reason);
        if(action==='delete'){
            if(!c || String(c.dealerId)!==String(d._id))fail('Фиксация не найдена',404);
            if(!canReport(req) || (c.status!=='draft'&&!globalManage(req)))fail('Недостаточно прав',403);
            if(c.status==='cancelled')fail('Фиксация уже удалена');
            if(!reason)fail('Укажите причину удаления');
            const linked=n.surcharge?.active&&n.surcharge?.caseId===String(c._id)||n.warning?.caseId===String(c._id)||!n.closure?.needsReview&&n.closure?.caseId===String(c._id);
            if(linked&&!req.body.cancelDecision)fail('Подтвердите отмену связанного решения');
            c.status='cancelled';
            if(n.surcharge?.caseId===String(c._id))n.surcharge={...n.surcharge,active:false,cancelledAt:new Date(),reason};
            if(n.warning?.caseId===String(c._id))n.warning=null;
            if(linked&&n.closure)n.closure={...n.closure,terminatedDate:'',needsReview:true};
        }else{
            if(!globalManage(req))fail('Подтверждать случаи и решения может администратор или маркетинг с правом управления ценами',403);
            if(action==='confirm'){
                if(!c || c.status!=='draft')fail('Можно подтвердить только черновик');c.status='confirmed';c.confirmedAt=new Date();c.confirmedBy=actor(req);
            }else if(action==='warning'){
                if(n.warning?.date)fail('Предупреждение уже зафиксировано');
                if(!c || c.status!=='confirmed')fail('Выберите подтверждённый случай');
                if(!dateKey(req.body.date)||req.body.date>today()||req.body.date<c.observedDate)fail('Дата предупреждения должна быть не раньше фиксации и не позднее сегодня');
                const percent=Number(req.body.percent);
                if(!Number.isFinite(percent)||percent<=0||percent>100)fail('Введите надбавку больше 0 и не более 100%');
                if(!dateKey(req.body.startDate)||req.body.startDate<today()||req.body.startDate<req.body.date)fail('Начало надбавки — не ранее сегодня и даты предупреждения');
                n.warning={caseId:String(c._id),date:req.body.date,by:actor(req),at:new Date()};
                n.surcharge={caseId:String(c._id),percent,startDate:req.body.startDate,active:true,by:actor(req),at:new Date()};
            }else if(action==='cancel-decision'){
                if(!reason)fail('Укажите причину отмены решения');
                n.warning=null;if(n.surcharge)n.surcharge={...n.surcharge,active:false,cancelledAt:new Date()};
                if(n.closure)n.closure={...n.closure,terminatedDate:'',needsReview:true};
            }else if(action==='closure'){
                if(!n.warning?.date)fail('Сначала зафиксируйте предупреждение');
                if(!c||c.status!=='confirmed'||String(c._id)===n.warning.caseId||c.observedDate<n.warning.date)fail('Нужен отдельный подтверждённый случай после предупреждения');
                for(const k of ['samplesRemovedDate','terminatedDate'])if(req.body[k]&&(!dateKey(req.body[k])||req.body[k]>today()||req.body[k]<c.observedDate))fail('Проверьте даты завершения работы');
                if(!req.body.samplesRemovedDate&&!req.body.terminatedDate)fail('Укажите дату снятия образцов или расторжения договора');
                n.closure={caseId:String(c._id),samplesRemovedDate:req.body.samplesRemovedDate||n.closure?.samplesRemovedDate||'',terminatedDate:req.body.terminatedDate||n.closure?.terminatedDate||'',by:actor(req),at:new Date(),comment:reason};
            }else fail('Неизвестное действие');
        }
        writeHistory(n,req,({delete:'Удалена фиксация',confirm:'Подтверждён случай',warning:'Предупреждение и надбавка',closure:'Прекращение сотрудничества','cancel-decision':'Отменено решение'})[action],before,reason);
        await save(n);res.json(await view(req,n,d));
    }));
    app.get('/api/price-control/evidence/:id',read,route(async(req,res)=>{
        if(!mongoose.isValidObjectId(req.params.id))fail('Фото не найдено',404);
        const file=await Evidence.findById(req.params.id).lean();if(!file)fail('Фото не найдено',404);
        await accessible(req,file.dealerId);
        res.type(file.mime).set('Cache-Control','private, no-store').set('X-Content-Type-Options','nosniff').send(Buffer.from(file.data,'base64'));
    }));
    return {Network,summary:n=>summary(n,today()), async forDealer(id){const n=await Network.findOne({members:id}).select('-cases.evidence -history').lean();return n?summary(n,today()):summary({},today());}};
}
module.exports={install,summary,finalPrice,caseFields,dateKey};
