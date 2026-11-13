'use strict';
function cleanName(value){if(typeof value!=='string'||!value.trim()||value.trim().length>700)throw Object.assign(Error('Укажите условия доставки, до 700 символов'),{status:400});return value.trim();}
function combine(records,values){
 const rows=records.map(r=>({id:String(r._id),name:r.name,active:r.active!==false,aliases:r.aliases||[],usage:0,legacy:false}));
 const byValue=new Map();for(const r of rows)for(const value of [r.name,...r.aliases])byValue.set(value,r);
 // Existing dealer text is preserved in dealer cards, not imported as catalog options.
 for(const value of values){if(typeof value!=='string'||!value.trim())continue;const existing=byValue.get(value);if(existing)existing.usage++;}
 return rows.sort((a,b)=>Number(b.active)-Number(a.active)||a.name.localeCompare(b.name,'ru'));
}
function install({app,mongoose,Dealer,AuditLog,hasPermission,isAdminUser,getDealerFilter}){
 const schema=new mongoose.Schema({name:{type:String,required:true,unique:true},aliases:{type:[String],default:[]},active:{type:Boolean,default:true},keys:{type:[String],default:undefined}},{timestamps:true});schema.index({keys:1},{unique:true,sparse:true});const Condition=mongoose.model('DeliveryCondition',schema);
 const read=(req,res,next)=>!req.user?.id?res.status(401).json({error:'Требуется вход'}):!['can_view_dealers','can_create_dealer','can_edit_dealer','can_view_pricing','can_manage_pricing'].some(p=>hasPermission(req,p))?res.status(403).json({error:'Нет доступа к условиям доставки'}):(res.set('Cache-Control','no-store'),next());
 const manage=(req,res,next)=>isAdminUser(req)?next():res.status(403).json({error:'Справочник условий изменяет администратор'});
 const fail=(res,e)=>res.status(e.status|| (e.code===11000?409:503)).json({error:e.code===11000?'Такой вариант уже существует':e.status?e.message:'Не удалось сохранить справочник. Повторите позже.'});
 async function log(req,item,action){await AuditLog.create({actor:{id:req.user.id,name:req.user.fullName||req.user.username,role:req.user.role},module:'delivery-conditions',action,entityType:'delivery_condition',entityId:String(item._id),summary:action==='delivery_archive'?'Архивировал условия доставки':action==='delivery_restore'?'Вернул условия доставки из архива':'Сохранил условия доставки',success:true}).catch(()=>{});}
 app.get('/api/delivery-conditions',read,async(req,res)=>{try{const [records,dealers]=await Promise.all([Condition.find().select('name aliases active').limit(2001).lean(),Dealer.find(getDealerFilter(req)).select('delivery').limit(20001).lean()]);if(records.length>2000||dealers.length>20000)return res.status(503).json({error:'Справочник слишком большой для полной загрузки'});res.json({canManage:isAdminUser(req),items:combine(records,dealers.map(d=>d.delivery))});}catch(e){fail(res,e);}});
 app.post('/api/delivery-conditions',read,manage,async(req,res)=>{try{const name=cleanName(req.body?.name);if(req.body?.active!==undefined&&typeof req.body.active!=='boolean')return res.status(400).json({error:'Некорректное состояние архива'});const legacyName=req.body?.legacyName;if(legacyName!==undefined&&(typeof legacyName!=='string'||legacyName.length>2000||!await Dealer.findOne({$and:[getDealerFilter(req),{delivery:legacyName}]}).select('_id').lean()))return res.status(409).json({error:'Исходные условия больше не найдены. Обновите справочник.'});const reserved=[name,...(legacyName?[legacyName]:[])];const existing=await Condition.findOne({$or:[{name:{$in:reserved}},{aliases:{$in:reserved}}]}).lean();if(existing)return res.status(409).json({error:'Такой вариант уже есть в справочнике, включая архив и прежние названия'});const item=await Condition.create({name,aliases:legacyName&&legacyName!==name?[legacyName]:[],keys:[...new Set([name,...(legacyName?[legacyName]:[])])],active:req.body?.active!==false});await log(req,item,item.active?'delivery_save':'delivery_archive');res.status(201).json({id:String(item._id)});}catch(e){fail(res,e);}});
 app.patch('/api/delivery-conditions/:id',read,manage,async(req,res)=>{try{
  if(!mongoose.isValidObjectId(req.params.id))return res.status(400).json({error:'Некорректный вариант'});
  const before=await Condition.findById(req.params.id).lean();if(!before)return res.status(404).json({error:'Вариант не найден'});
  const name=req.body?.name===undefined?before.name:cleanName(req.body.name),active=req.body?.active===undefined?before.active:req.body.active;
  if(typeof active!=='boolean')return res.status(400).json({error:'Некорректное состояние архива'});
  if(name!==before.name){const conflict=await Condition.findOne({_id:{$ne:before._id},$or:[{name},{aliases:name}]}).lean();if(conflict)return res.status(409).json({error:'Это название уже используется другим вариантом'});}
  const aliases=[...new Set([...(before.aliases||[]),...(name!==before.name?[before.name]:[])])].filter(x=>x!==name);
  const item=await Condition.findOneAndUpdate({_id:before._id,name:before.name,updatedAt:before.updatedAt},{$set:{name,active,aliases,keys:[name,...aliases]}},{new:true}).lean();if(!item)return res.status(409).json({error:'Вариант уже изменён. Обновите справочник.'});
  await log(req,item,active===before.active?'delivery_save':active?'delivery_restore':'delivery_archive');res.json({id:String(item._id)});
 }catch(e){fail(res,e);}});
 return{Condition};
}
module.exports={install,combine,cleanName};
