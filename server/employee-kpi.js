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
function registerEmployeeKpi({app,mongoose,User,Dealer,Product,Sales,AuditLog,isAdminUser,getWorkingDealerFilter,almatyMonthKey}) {
    const planSchema=new mongoose.Schema({employeeId:{type:String,required:true},month:{type:String,required:true},newDealerTarget:{type:Number,min:0,default:8},illiquidTarget:{type:Number,min:0,default:0},salesTargets:[{_id:false,dealerId:String,dealerName:String,city:String,plan:Number}],note:String,assignedBy:{id:String,name:String},revision:{type:Number,default:0}},{timestamps:true});
    planSchema.index({employeeId:1,month:1},{unique:true});
    const entrySchema=new mongoose.Schema({_id:{type:String,default:()=>crypto.randomUUID()},employeeId:{type:String,required:true},month:{type:String,required:true},type:{type:String,enum:['opening','illiquid'],required:true},date:String,dealerId:String,dealerName:String,productId:String,sku:String,productName:String,quantity:Number,note:String,createdBy:{id:String,name:String}},{timestamps:true});
    entrySchema.index({dealerId:1},{unique:true,partialFilterExpression:{type:'opening'}});
    entrySchema.index({employeeId:1,month:1});
    const Plan=mongoose.model('EmployeeKpiPlan',planSchema), Entry=mongoose.model('EmployeeKpiEntry',entrySchema);
    const actor=req=>({id:String(req.user.id),name:req.user.fullName||req.user.username||''});
    const fail=(res,error)=>res.status(error.status || (error.code===11000?409:400)).json({error:error.code===11000?'Этот дилер уже засчитан в открытие либо KPI на месяц уже создан. Обновите страницу.':error.message});
    function employee(req) { const id=String(req.query.employeeId || req.body?.employeeId || req.user.id); if(!mongoose.isValidObjectId(id)) throw new Error('Некорректный сотрудник'); if(!canRead(req.user,id,isAdminUser(req))) throw Object.assign(new Error('Доступ только к своему KPI'),{status:403}); return id; }
    async function options(req,id) {
        const user=await User.findById(id).select('_id fullName username').lean();if(!user)throw new Error('Сотрудник не найден');
        const assigned=await Plan.find({employeeId:id}).select('salesTargets.dealerId').lean();
        const assignedIds=assigned.flatMap(p=>p.salesTargets.map(t=>t.dealerId));
        const filter=isAdminUser(req)?{}:{$or:[{responsibleUserId:id},...(user.fullName?[{responsible:user.fullName}]:[]),{_id:{$in:assignedIds.filter(v=>mongoose.isValidObjectId(v))}}]};
        const dealers=await Dealer.find(getWorkingDealerFilter(filter)).select('_id dealer_id name city responsibleUserId').sort({name:1}).lean();
        return {user,dealers};
    }
    async function log(req,action,summary,data,before) {await AuditLog.create({actor:actor(req),module:'users',action,entityType:'employee_kpi',entityId:String(data.employeeId),summary,requestData:data,before,success:true});}
    app.get('/api/kpi/options',async(req,res)=>{try{const id=employee(req);const {dealers}=await options(req,id);const products=await Product.find({is_liquid:false,product_type:{$ne:'equipment'}}).select('_id sku name collection').sort({sku:1}).lean();res.json({dealers,products});}catch(e){fail(res,e);}});
    app.get('/api/kpi',async(req,res)=>{try{
        const id=employee(req),month=monthKey(req.query.month||almatyMonthKey());
        const user=await User.findById(id).select('_id fullName username').lean();if(!user)return res.status(404).json({error:'Сотрудник не найден'});
        const plan=await Plan.findOne({employeeId:id,month}).lean();
        const entries=await Entry.find({employeeId:id,month}).sort({date:-1,createdAt:-1}).lean();
        const ids=(plan?.salesTargets||[]).map(t=>t.dealerId);
        const sales=ids.length?await Sales.find({month,dealerId:{$in:ids},isCustom:{$ne:true}}).select('dealerId fact isCustom').lean():[];
        res.json({month,employee:user,canAssign:isAdminUser(req),plan,entries,summary:summarize(plan,sales,entries.filter(e=>e.type==='opening'),entries.filter(e=>e.type==='illiquid'))});
    }catch(e){fail(res,e);}});
    app.put('/api/kpi/plan',async(req,res)=>{try{
        if(!isAdminUser(req))return res.status(403).json({error:'Назначать и менять планы KPI может только администратор'});
        const id=employee(req),month=monthKey(req.body.month);const {user,dealers}=await options(req,id);
        const source=req.body.salesTargets;if(!Array.isArray(source)||source.length>300)throw new Error('Некорректный список дилеров');
        const seen=new Set(),byId=new Map(dealers.map(d=>[String(d._id),d]));
        const salesTargets=source.map(t=>{const key=String(t.dealerId);if(seen.has(key)||!byId.has(key))throw new Error('Повторный или недоступный дилер');seen.add(key);const d=byId.get(key);return {dealerId:key,dealerName:d.name,city:d.city||'',plan:number(t.plan,'план дилера')};});
        const payload={newDealerTarget:number(req.body.newDealerTarget,'план открытий',true),illiquidTarget:number(req.body.illiquidTarget,'план неликвида'),salesTargets,note:String(req.body.note||'').trim().slice(0,2000),assignedBy:actor(req)};
        const before=await Plan.findOne({employeeId:id,month}).lean();
        if(before){const revision=number(req.body.revision,'версию',true);const updated=await Plan.findOneAndUpdate({_id:before._id,revision},{$set:payload,$inc:{revision:1}},{new:true,runValidators:true});if(!updated)return res.status(409).json({error:'План уже изменён. Обновите KPI перед сохранением.'});}
        else {if(req.body.revision!==null&&req.body.revision!==undefined)return res.status(409).json({error:'План изменился. Обновите KPI.'});await Plan.create({employeeId:id,month,...payload});}
        await log(req,'kpi_assign',`Назначил KPI: ${user.fullName||user.username}, ${month}`,{employeeId:id,month,...payload},before);res.json({ok:true});
    }catch(e){fail(res,e);}});
    app.post('/api/kpi/entries',async(req,res)=>{try{
        const id=employee(req),month=monthKey(req.body.month),type=req.body.type;
        if(!['opening','illiquid'].includes(type))throw new Error('Неизвестный пункт KPI');
        if(!await Plan.exists({employeeId:id,month}))throw new Error('Сначала администратор должен назначить KPI на этот месяц');
        const date=entryDate(req.body.date,month),{dealers}=await options(req,id);
        const dealer=dealers.find(d=>String(d._id)===String(req.body.dealerId));
        if(type==='opening'&&!dealer)throw new Error('Выберите действующего дилера');
        if(req.body.dealerId&&!dealer)throw new Error('Дилер недоступен');
        let product=null,quantity=1;
        if(type==='illiquid'){if(!mongoose.isValidObjectId(req.body.productId))throw new Error('Выберите неликвидную позицию');product=await Product.findOne({_id:req.body.productId,is_liquid:false,product_type:{$ne:'equipment'}}).select('_id sku name').lean();if(!product)throw new Error('Позиция не найдена в неликвиде');quantity=number(req.body.quantity,'продажу в м²');if(quantity<=0)throw new Error('Количество должно быть больше нуля');}
        const data={employeeId:id,month,type,date,dealerId:dealer?String(dealer._id):undefined,dealerName:dealer?.name||'',productId:product?String(product._id):undefined,sku:product?.sku||'',productName:product?.name||'',quantity,note:String(req.body.note||'').trim().slice(0,2000),createdBy:actor(req)};
        const record=await Entry.create(data);await log(req,'kpi_result',type==='opening'?'Отметил открытие дилера':'Внёс продажи неликвида',{...data,id:record._id});res.status(201).json({ok:true});
    }catch(e){fail(res,e);}});
    app.delete('/api/kpi/entries/:id',async(req,res)=>{try{
        const record=await Entry.findById(String(req.params.id)).lean();if(!record)return res.status(404).json({error:'Запись не найдена'});
        if(!canRead(req.user,record.employeeId,isAdminUser(req)))return res.status(403).json({error:'Нельзя менять чужой KPI'});
        await Entry.deleteOne({_id:record._id,employeeId:record.employeeId});await log(req,'kpi_correction','Удалил ошибочную запись KPI',record);res.json({ok:true});
    }catch(e){fail(res,e);}});
    return {Plan,Entry};
}
module.exports={registerEmployeeKpi,monthKey,number,entryDate,canRead,summarize};
