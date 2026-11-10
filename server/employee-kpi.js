const crypto = require('crypto');
function monthKey(value) {
    if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(String(value || ''))) throw new Error('Выберите месяц KPI');
    return String(value);
}
function number(value, label, integer = false) {
    if (value === '' || value === null || value === undefined) throw new Error(`Укажите ${label}`);
    const n = Number(String(value).replace(',','.'));
    if (!Number.isFinite(n) || n < 0 || n > 1e9 || (integer && !Number.isInteger(n))) throw new Error(`Некорректное значение: ${label}`);
    return n;
}
function entryDate(value, month) {
    const date=String(value || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !date.startsWith(month+'-') || Number.isNaN(Date.parse(date+'T00:00:00Z')) || new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date) throw new Error('Дата должна существовать и входить в месяц KPI');
    return date;
}
function canRead(user, employeeId, admin) { return admin || String(user.id) === String(employeeId); }
function summarize(plan, rows, openings, illiquid) {
    const facts = new Map();
    for (const row of rows) {
        if (row.isCustom || String(row.dealerId || '').startsWith('PLAN_')) continue;
        facts.set(String(row.dealerId), (facts.get(String(row.dealerId)) || 0) + Math.max(0,Number(row.fact)||0));
    }
    const sales = (plan?.salesTargets || []).map(t=>({...t,fact:facts.get(String(t.dealerId))||0}));
    const total = sales.reduce((a,t)=>({plan:a.plan+t.plan,fact:a.fact+t.fact}),{plan:0,fact:0});
    const percent=(fact,target)=>target>0 ? Math.round(fact/target*1000)/10 : null;
    return {newDealers:{plan:plan?.newDealerTarget||0,fact:openings.length,percent:percent(openings.length,plan?.newDealerTarget)},sales:{...total,percent:percent(total.fact,total.plan),dealers:sales},illiquid:{plan:plan?.illiquidTarget||0,fact:illiquid.reduce((s,e)=>s+e.quantity,0),percent:percent(illiquid.reduce((s,e)=>s+e.quantity,0),plan?.illiquidTarget)}};
}
function sectionsOf(plan) {
    if (Array.isArray(plan?.sections)) return plan.sections;
    if (!plan) return [];
    return [
        {id:'opening',title:'Открытие новых дилеров',kind:'opening',unit:'шт.',target:plan.newDealerTarget||0,dealerTargets:[],restrictSelection:false},
        {id:'sales',title:'Продажи по дилерам',kind:'dealer_sales',unit:'м²',dealerTargets:plan.salesTargets||[]},
        {id:'illiquid',title:'Продажи неликвида',kind:'product_sales',unit:'м²',target:plan.illiquidTarget||0,productTargets:[],restrictSelection:false}
    ];
}
function entrySection(entry) { return entry.sectionId || (entry.type==='opening'?'opening':entry.type==='illiquid'?'illiquid':'manual'); }
function customSummary(plan, rows, entries) {
    const facts=new Map();
    for(const row of rows){if(row.isCustom||String(row.dealerId||'').startsWith('PLAN_'))continue;facts.set(String(row.dealerId),(facts.get(String(row.dealerId))||0)+Math.max(0,Number(row.fact)||0));}
    return sectionsOf(plan).map(section=>{
        const records=entries.filter(e=>entrySection(e)===section.id);
        let target=Number(section.target)||0,fact=0,items=[];
        if(section.kind==='dealer_sales'){
            items=(section.dealerTargets||[]).map(t=>({...t,fact:facts.get(String(t.dealerId))||0}));
            target=items.reduce((n,t)=>n+t.plan,0);fact=items.reduce((n,t)=>n+t.fact,0);
        }else if(section.kind==='product_sales'&&(section.productTargets||[]).length){
            items=section.productTargets.map(t=>({...t,fact:records.filter(e=>e.productId===t.productId).reduce((n,e)=>n+e.quantity,0)}));
            target=items.reduce((n,t)=>n+t.plan,0);fact=items.reduce((n,t)=>n+t.fact,0);
        }else if(section.kind==='opening'){
            const ids=new Set((section.dealerTargets||[]).map(t=>t.dealerId));
            fact=records.filter(e=>!section.restrictSelection||ids.has(e.dealerId)).length;
            items=(section.dealerTargets||[]).map(t=>({...t,fact:records.some(e=>e.dealerId===t.dealerId)?1:0}));
        }else fact=records.reduce((n,e)=>n+e.quantity,0);
        return {...section,plan:target,fact,items,percent:target>0?Math.round(fact/target*1000)/10:null};
    });
}
function validateSections(input,{dealers,openingDealers,products},before=null) {
    if(!Array.isArray(input)||!input.length||input.length>30)throw new Error('Добавьте от 1 до 30 пунктов KPI');
    const ids=new Set();const old=new Map(sectionsOf(before).map(s=>[s.id,s]));
    return input.map(raw=>{
        const id=String(raw.id||'');if(!/^[a-zA-Z0-9_-]{1,80}$/.test(id)||ids.has(id))throw new Error('Некорректный или повторный пункт KPI');ids.add(id);
        const title=String(raw.title||'').trim();if(!title||title.length>160)throw new Error('Укажите название пункта KPI (до 160 символов)');
        const kind=raw.kind;if(!['opening','dealer_sales','product_sales','manual'].includes(kind))throw new Error('Выберите способ учёта KPI');
        if(old.has(id)&&old.get(id).kind!==kind)throw new Error('Для другого способа учёта создайте новый пункт: история старого сохранится');
        const unit=String(raw.unit||'').trim().slice(0,30)||'шт.';
        const section={id,title,kind,unit,target:number(raw.target??0,'план пункта',kind==='opening'),restrictSelection:true,dealerTargets:[],productTargets:[]};
        function selected(list,choices,key){if(!Array.isArray(list)||list.length>500)throw new Error('Некорректный список целей');const seen=new Set();const available=new Map(choices.map(v=>[String(v._id),v]));return list.map(t=>{const itemId=String(t[key]);if(seen.has(itemId))throw new Error('Повторная позиция в пункте KPI');seen.add(itemId);const choice=available.get(itemId);const previous=(old.get(id)?.[key==='productId'?'productTargets':'dealerTargets']||[]).find(v=>v[key]===itemId);if(!choice&&!previous)throw new Error('Выбранная позиция или дилер недоступны');const item=choice||{name:previous.productName||previous.dealerName,sku:previous.sku,city:previous.city};return key==='productId'?{productId:itemId,productName:item.name,sku:item.sku||'',plan:number(t.plan,'план по позиции')}:{dealerId:itemId,dealerName:item.name,city:item.city||'',plan:kind==='opening'?1:number(t.plan,'план дилера')};});}
        if(kind==='opening'||kind==='dealer_sales')section.dealerTargets=selected(raw.dealerTargets||[],kind==='opening'?openingDealers:dealers,'dealerId');
        if(kind==='product_sales')section.productTargets=selected(raw.productTargets||[],products,'productId');
        return section;
    });
}
function registerEmployeeKpi({app,mongoose,User,Dealer,Product,Sales,AuditLog,isAdminUser,getWorkingDealerFilter,almatyMonthKey}) {
    const planSchema=new mongoose.Schema({employeeId:{type:String,required:true},month:{type:String,required:true},sections:{type:[mongoose.Schema.Types.Mixed],default:undefined},newDealerTarget:{type:Number,min:0,default:8},illiquidTarget:{type:Number,min:0,default:0},salesTargets:[{_id:false,dealerId:String,dealerName:String,city:String,plan:Number}],note:String,assignedBy:{id:String,name:String},revision:{type:Number,default:0}},{timestamps:true});
    planSchema.index({employeeId:1,month:1},{unique:true});
    const entrySchema=new mongoose.Schema({_id:{type:String,default:()=>crypto.randomUUID()},employeeId:{type:String,required:true},month:{type:String,required:true},type:{type:String,enum:['opening','illiquid','manual'],required:true},sectionId:String,date:String,dealerId:String,dealerName:String,productId:String,sku:String,productName:String,quantity:Number,note:String,createdBy:{id:String,name:String}},{timestamps:true});
    entrySchema.index({dealerId:1},{unique:true,partialFilterExpression:{type:'opening'}});
    entrySchema.index({employeeId:1,month:1});
    const Plan=mongoose.model('EmployeeKpiPlan',planSchema), Entry=mongoose.model('EmployeeKpiEntry',entrySchema);
    const actor=req=>({id:String(req.user.id),name:req.user.fullName||req.user.username||''});
    const fail=(res,error)=>res.status(error.status || (error.code===11000?409:400)).json({error:error.code===11000?'Этот дилер уже засчитан в открытие либо KPI на месяц уже создан. Обновите страницу.':error.message});
    function employee(req) { const id=String(req.query.employeeId || req.body?.employeeId || req.user.id); if(!mongoose.isValidObjectId(id)) throw new Error('Некорректный сотрудник'); if(!canRead(req.user,id,isAdminUser(req))) throw Object.assign(new Error('Доступ только к своему KPI'),{status:403}); return id; }
    async function options(req,id) {
        const user=await User.findById(id).select('_id fullName username').lean();if(!user)throw new Error('Сотрудник не найден');
        const assigned=await Plan.find({employeeId:id}).select('salesTargets sections').lean();
        const assignedIds=assigned.flatMap(p=>sectionsOf(p).flatMap(s=>(s.dealerTargets||[]).map(t=>t.dealerId)));
        const filter=isAdminUser(req)?{}:{$or:[{responsibleUserId:id},...(user.fullName?[{responsible:user.fullName}]:[]),{_id:{$in:assignedIds.filter(v=>mongoose.isValidObjectId(v))}}]};
        const dealers=await Dealer.find(getWorkingDealerFilter(filter)).select('_id dealer_id name city responsibleUserId').sort({name:1}).lean();
        const openingDealers=await Dealer.find(filter).select('_id dealer_id name city status responsibleUserId').sort({name:1}).lean();
        return {user,dealers,openingDealers};
    }
    async function log(req,action,summary,data,before) {await AuditLog.create({actor:actor(req),module:'users',action,entityType:'employee_kpi',entityId:String(data.employeeId),summary,requestData:data,before,success:true});}
    app.get('/api/kpi/options',async(req,res)=>{try{const id=employee(req);const {dealers,openingDealers}=await options(req,id);const products=await Product.find({is_liquid:false,product_type:{$ne:'equipment'}}).select('_id sku name collection').sort({sku:1}).lean();res.json({dealers,openingDealers,products});}catch(e){fail(res,e);}});
    app.get('/api/kpi',async(req,res)=>{try{
        const id=employee(req),month=monthKey(req.query.month||almatyMonthKey());
        const user=await User.findById(id).select('_id fullName username').lean();if(!user)return res.status(404).json({error:'Сотрудник не найден'});
        const plan=await Plan.findOne({employeeId:id,month}).lean();
        const entries=await Entry.find({employeeId:id,month}).sort({date:-1,createdAt:-1}).lean();
        const ids=sectionsOf(plan).filter(s=>s.kind==='dealer_sales').flatMap(s=>(s.dealerTargets||[]).map(t=>t.dealerId));
        const sales=ids.length?await Sales.find({month,dealerId:{$in:ids},isCustom:{$ne:true}}).select('dealerId fact isCustom').lean():[];
        res.json({month,employee:user,canAssign:isAdminUser(req),plan:plan?{...plan,sections:sectionsOf(plan)}:null,entries,sections:customSummary(plan,sales,entries),summary:summarize(plan,sales,entries.filter(e=>e.type==='opening'),entries.filter(e=>e.type==='illiquid'))});
    }catch(e){fail(res,e);}});
    app.put('/api/kpi/plan',async(req,res)=>{try{
        if(!isAdminUser(req))return res.status(403).json({error:'Назначать и менять планы KPI может только администратор'});
        const id=employee(req),month=monthKey(req.body.month);const {user,dealers,openingDealers}=await options(req,id);
        const before=await Plan.findOne({employeeId:id,month}).lean();
        let payload;
        if(Array.isArray(req.body.sections)){
            const products=await Product.find({is_liquid:false,product_type:{$ne:'equipment'}}).select('_id sku name').lean();
            payload={sections:validateSections(req.body.sections,{dealers,openingDealers,products},before),note:String(req.body.note||'').trim().slice(0,2000),assignedBy:actor(req)};
        }else{
        const source=req.body.salesTargets;if(!Array.isArray(source)||source.length>300)throw new Error('Некорректный список дилеров');
        const seen=new Set(),byId=new Map(dealers.map(d=>[String(d._id),d]));
        const salesTargets=source.map(t=>{const key=String(t.dealerId);if(seen.has(key)||!byId.has(key))throw new Error('Повторный или недоступный дилер');seen.add(key);const d=byId.get(key);return {dealerId:key,dealerName:d.name,city:d.city||'',plan:number(t.plan,'план дилера')};});
        payload={newDealerTarget:number(req.body.newDealerTarget,'план открытий',true),illiquidTarget:number(req.body.illiquidTarget,'план неликвида'),salesTargets,note:String(req.body.note||'').trim().slice(0,2000),assignedBy:actor(req)};
        }
        if(before){const revision=number(req.body.revision,'версию',true);const updated=await Plan.findOneAndUpdate({_id:before._id,revision},{$set:payload,$inc:{revision:1}},{new:true,runValidators:true});if(!updated)return res.status(409).json({error:'План уже изменён. Обновите KPI перед сохранением.'});}
        else {if(req.body.revision!==null&&req.body.revision!==undefined)return res.status(409).json({error:'План изменился. Обновите KPI.'});await Plan.create({employeeId:id,month,...payload});}
        await log(req,'kpi_assign',`Назначил KPI: ${user.fullName||user.username}, ${month}`,{employeeId:id,month,...payload},before);res.json({ok:true});
    }catch(e){fail(res,e);}});
    async function addEntry(req,operationId) {
        const id=employee(req),month=monthKey(req.body.month);
        if(operationId){const existing=await Entry.findById(operationId).lean();if(existing){if(existing.employeeId!==id)throw new Error('Недоступная операция');return existing;}}
        const plan=await Plan.findOne({employeeId:id,month}).lean();
        if(!plan)throw new Error('Сначала администратор должен назначить KPI на этот месяц');
        const sectionId=String(req.body.sectionId|| (req.body.type==='opening'?'opening':'illiquid'));
        const section=sectionsOf(plan).find(s=>s.id===sectionId);
        if(!section||section.kind==='dealer_sales')throw new Error('В этот пункт нельзя вручную добавлять факт');
        const type=section.kind==='opening'?'opening':section.kind==='product_sales'?'illiquid':'manual';
        const date=entryDate(req.body.date,month),{dealers,openingDealers}=await options(req,id);
        const dealer=(type==='opening'?openingDealers:dealers).find(d=>String(d._id)===String(req.body.dealerId));
        if(type==='opening'&&!dealer)throw new Error('Выберите дилера');
        if(type==='opening'&&section.restrictSelection&&!(section.dealerTargets||[]).some(t=>t.dealerId===String(req.body.dealerId)))throw new Error('Этот дилер не назначен в данном пункте KPI');
        if(req.body.dealerId&&!dealer)throw new Error('Дилер недоступен');
        let product=null,quantity=1;
        if(type==='manual'){quantity=number(req.body.quantity,'факт');if(quantity<=0)throw new Error('Факт должен быть больше нуля');}
        if(type==='illiquid'){if(section.restrictSelection&&!(section.productTargets||[]).some(t=>t.productId===String(req.body.productId)))throw new Error('Эта позиция не назначена в данном пункте KPI');if(!mongoose.isValidObjectId(req.body.productId))throw new Error('Выберите неликвидную позицию');product=await Product.findOne({_id:req.body.productId,...(section.restrictSelection?{}:{is_liquid:false}),product_type:{$ne:'equipment'}}).select('_id sku name').lean();if(!product){const assigned=(section.productTargets||[]).find(t=>t.productId===String(req.body.productId));if(section.restrictSelection&&assigned)product={_id:assigned.productId,sku:assigned.sku,name:assigned.productName};else throw new Error('Позиция не найдена в неликвиде');}quantity=number(req.body.quantity,'продажу в м²');if(quantity<=0)throw new Error('Количество должно быть больше нуля');}
        const data={employeeId:id,month,type,sectionId,date,dealerId:dealer?String(dealer._id):undefined,dealerName:dealer?.name||'',productId:product?String(product._id):undefined,sku:product?.sku||'',productName:product?.name||'',quantity,note:String(req.body.note||'').trim().slice(0,2000),createdBy:actor(req)};
        const record=await Entry.create({...data,...(operationId?{_id:operationId}:{})});await log(req,'kpi_result',type==='opening'?'Отметил открытие дилера':`Внёс результат KPI: ${section.title}`,{...data,id:record._id});return record;
    }
    app.post('/api/kpi/entries',async(req,res)=>{try{await addEntry(req);res.status(201).json({ok:true});}catch(e){fail(res,e);}});
    app.delete('/api/kpi/entries/:id',async(req,res)=>{try{
        const record=await Entry.findById(String(req.params.id)).lean();if(!record)return res.status(404).json({error:'Запись не найдена'});
        if(!canRead(req.user,record.employeeId,isAdminUser(req)))return res.status(403).json({error:'Нельзя менять чужой KPI'});
        await Entry.deleteOne({_id:record._id,employeeId:record.employeeId});await log(req,'kpi_correction','Удалил ошибочную запись KPI',record);res.json({ok:true});
    }catch(e){fail(res,e);}});
    return {Plan,Entry,addEntry,options};
}
module.exports={registerEmployeeKpi,monthKey,number,entryDate,canRead,summarize,sectionsOf,customSummary,validateSections};
