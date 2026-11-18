'use strict';

/** Store actual display inspections separately from workshop inventory.
 * A status on a sample / POS unit must never change workshop stock.
 */
const STANDARD_POS_NAMES=Object.freeze([
    'С600 - 600мм задняя стенка',
    'С800 - 800мм задняя стенка',
    'РФ-2 - Расческа из фанеры',
    'Н600 - 600мм наклейка',
    'Н800 - 800мм наклейка',
    'Табличка - Табличка орг.стекло'
]);
const CONDITION_VALUES=new Set(['ok','damaged','missing']);
const TAG_VALUES=new Set(['unknown','ok','replace','missing']);
const clean=(value,max=450)=>String(value??'').trim().slice(0,max);
function parsePayload(body) {
    const kind=body?.kind==='pos'?'pos':body?.kind==='laminate'?'laminate':'';
    const key=clean(body?.key,170);
    if(!kind||!key)throw Object.assign(new Error('Укажите допустимый тип и позицию'),{status:400});
    if(kind==='laminate'&&!/^[a-f0-9]{24}$/i.test(key))throw Object.assign(new Error('Некорректная позиция ламината'),{status:400});
    if(kind==='pos'&&(key.length<3||key.includes('$')))throw Object.assign(new Error('Некорректное название оборудования'),{status:400});
    const condition=clean(body.condition||'ok',24);
    const priceTag=kind==='laminate'?clean(body.priceTag||'unknown',24):'unknown';
    if(!CONDITION_VALUES.has(condition)||!TAG_VALUES.has(priceTag))throw Object.assign(new Error('Некорректное состояние образца или ценника'),{status:400});
    const integer=(value,label)=>{
        const x=Number(value??0);
        if(!Number.isSafeInteger(x)||x<0||x>1000)throw Object.assign(new Error('Некорректное количество: '+label),{status:400});
        return x;
    };
    const replacementQty=condition==='ok'?0:integer(body.replacementQty,'замена');
    const priceTagQty=kind==='laminate'?integer(body.priceTagQty,'ценники'):0;
    if(body.present!==undefined && typeof body.present!=='boolean')throw Object.assign(new Error('Наличие образца должно быть Да/Нет'),{status:400});
    return {
        kind,key,condition,priceTag,priceTagQty,replacementQty,
        note:clean(body.note,500),
        present:kind==='laminate'?body.present:undefined
    };
}
function normalizeInspection(row){
    return {
        condition:row?.condition||'ok',
        priceTag:row?.priceTag||'unknown',
        priceTagQty:Number(row?.priceTagQty)||0,
        replacementQty:Number(row?.replacementQty)||0,
        note:row?.note||'',
        checkedAt:row?.updatedAt||null,
        checkedBy:row?.checkedBy?.name||''
    };
}
function register({app,mongoose,Dealer,Product,AuditLog,requirePermission,getDealerFilter,getWorkingDealerFilter,activeProductFilter}){
    const schema=new mongoose.Schema({
        dealer:{type:mongoose.Schema.Types.ObjectId,ref:'Dealer',required:true,index:true},
        kind:{type:String,enum:['laminate','pos'],required:true},
        key:{type:String,required:true,trim:true},
        condition:{type:String,enum:['ok','damaged','missing'],default:'ok'},
        priceTag:{type:String,enum:['unknown','ok','replace','missing'],default:'unknown'},
        priceTagQty:{type:Number,default:0,min:0,max:1000},
        replacementQty:{type:Number,default:0,min:0,max:1000},
        note:{type:String,default:'',maxlength:500},
        checkedBy:{id:String,name:String}
    },{timestamps:true});
    schema.index({dealer:1,kind:1,key:1},{unique:true});
    const Check=mongoose.models.DealerExhibitionCheck||mongoose.model('DealerExhibitionCheck',schema);

    const scopedDealer=req=>getWorkingDealerFilter(getDealerFilter(req));
    async function getChecks(ids){
        if(!ids.length)return new Map();
        const rows=await Check.find({dealer:{$in:ids}}).lean();
        return new Map(rows.map(row=>[
            String(row.dealer)+'|'+row.kind+'|'+row.key,
            normalizeInspection(row)
        ]));
    }
    function getCheck(map,dealerId,kind,key){
        return map.get(String(dealerId)+'|'+kind+'|'+key)||normalizeInspection(null);
    }
    app.put('/api/exhibition/dealers/:id/item',requirePermission('can_edit_matrix'),async(req,res)=>{
        try {
            if(!mongoose.isValidObjectId(req.params.id))return res.status(400).json({error:'Некорректный ID дилера'});
            const data=parsePayload(req.body);
            const dealerFilter={_id:req.params.id,...scopedDealer(req)};
            const dealer=await Dealer.findOne(dealerFilter).select('_id name products pos_materials').lean();
            if(!dealer)return res.status(404).json({error:'Дилер не найден или недоступен'});
            let label=data.key;
            let productId=null;
            if(data.kind==='laminate'){
                const product=await Product.findOne(activeProductFilter({_id:data.key,product_type:{$ne:'equipment'}}))
                    .select('_id sku name').lean();
                if(!product)return res.status(404).json({error:'Позиция отсутствует в рабочей матрице ламината'});
                productId=product._id;
                label=[product.sku,product.name].filter(Boolean).join(' · ');
                const present=Boolean((dealer.products||[]).some(id=>String(id)===data.key));
                if(data.present!==undefined && present!==data.present){
                    const update=data.present?{$addToSet:{products:productId}}:{$pull:{products:productId}};
                    const outcome=await Dealer.updateOne(dealerFilter,update);
                    if(!outcome.matchedCount)return res.status(404).json({error:'Дилер недоступен'});
                }
            }else{
                const allowed=new Set([
                    ...STANDARD_POS_NAMES,
                    ...(dealer.pos_materials||[]).map(item=>clean(item.name,170)).filter(Boolean)
                ]);
                if(!allowed.has(data.key))return res.status(400).json({error:'Оборудование отсутствует в списке дилера'});
            }
            const actor={id:String(req.user?.id||''),name:String(req.user?.fullName||req.user?.username||'Сотрудник')};
            const current=await Check.findOne({dealer:dealer._id,kind:data.kind,key:data.key}).lean();
            const before=current?normalizeInspection(current):normalizeInspection(null);
            const changes={
                condition:data.condition,
                priceTag:data.priceTag,
                priceTagQty:data.priceTagQty,
                replacementQty:data.replacementQty,
                note:data.note,
                checkedBy:actor
            };
            const saved=await Check.findOneAndUpdate(
                {dealer:dealer._id,kind:data.kind,key:data.key},
                {$set:changes},
                {new:true,upsert:true,runValidators:true,setDefaultsOnInsert:true}
            ).lean();
            await AuditLog.create({
                actor:{...actor,role:req.user?.role||''},
                module:'matrix',action:'exhibition_inspection',method:'PUT',
                path:req.originalUrl,entityType:'dealer',entityId:String(dealer._id),
                entityLabel:dealer.name||'Дилер',summary:'Изменил выставленность / состояние: '+label,
                success:true,before,after:{...normalizeInspection(saved),present:data.present},
                meta:{kind:data.kind,key:data.key}
            }).catch(err=>console.warn('Exhibition inspection audit:',err.message));
            res.set('Cache-Control','no-store');
            return res.json({status:'ok',dealerId:String(dealer._id),kind:data.kind,key:data.key,
                inspection:normalizeInspection(saved),present:data.present??null});
        }catch(error){
            res.status(error.status||500).json({error:error.message||'Не удалось сохранить выставленность'});
        }
    });
    return {Check,getChecks,getCheck,STANDARD_POS_NAMES};
}
module.exports={register,parsePayload,normalizeInspection,STANDARD_POS_NAMES};
