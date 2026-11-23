'use strict';

/** Store dealer-side display inspections separately from workshop inventory.
 * POS quantity checks are observations and never create workshop stock movements.
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
    const posQuantity=kind==='pos'&&body.posQuantity!==undefined?integer(body.posQuantity,'оборудование'):undefined;
    return {
        kind,key,condition,priceTag,priceTagQty,replacementQty,posQuantity,
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
        posQuantity:Number.isInteger(row?.posQuantity)?row.posQuantity:null,
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
        posQuantity:{type:Number,default:null,min:0,max:1000},
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
    // Explicitly staged presence edits from the exhibition page. This endpoint
    // changes ONLY Dealer.products: inspection flags, price tags and workshop
    // inventory remain untouched. Validate the entire selection before writing.
    app.put('/api/exhibition/presence/batch',requirePermission('can_edit_matrix'),async(req,res)=>{
        try {
            const raw=req.body?.changes;
            if(!Array.isArray(raw)||raw.length<1||raw.length>250)
                return res.status(400).json({error:'Выберите от 1 до 250 изменений для сохранения'});
            const seen=new Set();
            const changes=raw.map(item=>{
                const dealerId=clean(item?.dealerId,40).toLowerCase();
                const productId=clean(item?.productId,40).toLowerCase();
                if(!/^[a-f0-9]{24}$/.test(dealerId)||!/^[a-f0-9]{24}$/.test(productId)||
                    !mongoose.isValidObjectId(dealerId)||!mongoose.isValidObjectId(productId)||
                    typeof item?.present!=='boolean'||typeof item?.expectedPresent!=='boolean')
                    throw Object.assign(new Error('Некорректная отметка выставленности'),{status:400});
                const identity=dealerId+'|'+productId;
                if(seen.has(identity))throw Object.assign(new Error('В запросе повторяется одна позиция'),{status:400});
                seen.add(identity);
                return {dealerId,productId,present:item.present,expectedPresent:item.expectedPresent};
            });
            const dealerIds=[...new Set(changes.map(c=>c.dealerId))];
            const productIds=[...new Set(changes.map(c=>c.productId))];
            const dealers=await Dealer.find({$and:[
                scopedDealer(req),{_id:{$in:dealerIds}}
            ]}).select('_id name products').lean();
            if(dealers.length!==dealerIds.length)
                return res.status(403).json({error:'Один из дилеров недоступен для редактирования'});
            const products=await Product.find(activeProductFilter({
                _id:{$in:productIds},product_type:{$ne:'equipment'}
            })).select('_id').lean();
            if(products.length!==productIds.length)
                return res.status(400).json({error:'Одна из позиций отсутствует в рабочей матрице ламината'});
            const dealerMap=new Map(dealers.map(d=>[String(d._id),d]));
            for(const c of changes){
                const dealer=dealerMap.get(c.dealerId);
                const actual=(dealer.products||[]).some(id=>String(id)===c.productId);
                if(actual!==c.expectedPresent)
                    return res.status(409).json({error:'Выставленность изменилась у другого сотрудника. Обновите страницу и повторите выбор.'});
                if(actual===c.present)
                    return res.status(400).json({error:'В запросе есть позиция без изменений'});
            }
            const operations=changes.map(c=>({
                updateOne:{
                    filter:{$and:[
                        scopedDealer(req),{_id:c.dealerId},
                        {products:c.expectedPresent?c.productId:{$ne:c.productId}}
                    ]},
                    update:c.present?{$addToSet:{products:c.productId}}:{$pull:{products:c.productId}}
                }
            }));
            const result=await Dealer.bulkWrite(operations,{ordered:true});
            if(result.matchedCount!==operations.length)
                return res.status(409).json({
                    error:'Не все изменения применились из-за параллельной правки. Обновите страницу.',
                    reloadRequired:true
                });
            const actor={id:String(req.user?.id||''),name:String(req.user?.fullName||req.user?.username||'Сотрудник'),
                role:req.user?.role||''};
            const byDealer=new Map();
            changes.forEach(c=>{
                if(!byDealer.has(c.dealerId))byDealer.set(c.dealerId,[]);
                byDealer.get(c.dealerId).push(c);
            });
            await Promise.all([...byDealer].map(async([dealerId,items])=>{
                await AuditLog.create({
                    actor,module:'matrix',action:'exhibition_batch',method:'PUT',
                    path:req.originalUrl,entityType:'dealer',entityId:dealerId,
                    entityLabel:dealerMap.get(dealerId)?.name||'Дилер',
                    summary:'Изменил выставленность в матрице: '+items.length+' поз.',
                    success:true,
                    before:items.map(({productId,expectedPresent})=>({productId,present:expectedPresent})),
                    after:items.map(({productId,present})=>({productId,present})),
                    meta:{kind:'laminate',count:items.length,source:'exhibition_matrix'}
                }).catch(err=>console.warn('Exhibition batch audit:',err.message));
            }));
            res.set('Cache-Control','no-store');
            return res.json({status:'ok',updated:changes.length,changes:changes.map(
                ({dealerId,productId,present})=>({dealerId,productId,present})
            )});
        }catch(error){
            res.status(error.status||500).json({error:error.message||'Не удалось сохранить выставленность'});
        }
    });
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
            const posQuantity=data.kind==='pos'
                ? (data.posQuantity!==undefined?data.posQuantity:(Number.isInteger(current?.posQuantity)?current.posQuantity:null))
                : null;
            const changes={
                condition:data.condition,
                priceTag:data.priceTag,
                priceTagQty:data.priceTagQty,
                replacementQty:data.replacementQty,
                note:data.note,
                checkedBy:actor
            };
            if(data.kind==='pos'&&data.posQuantity!==undefined)changes.posQuantity=data.posQuantity;
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
                success:true,before,after:{...normalizeInspection(saved),present:data.present,posQuantity},
                meta:{kind:data.kind,key:data.key,posQuantity}
            }).catch(err=>console.warn('Exhibition inspection audit:',err.message));
            res.set('Cache-Control','no-store');
            return res.json({status:'ok',dealerId:String(dealer._id),kind:data.kind,key:data.key,
                inspection:normalizeInspection(saved),present:data.present??null,posQuantity});
        }catch(error){
            res.status(error.status||500).json({error:error.message||'Не удалось сохранить выставленность'});
        }
    });
    return {Check,getChecks,getCheck,STANDARD_POS_NAMES};
}
module.exports={register,parsePayload,normalizeInspection,STANDARD_POS_NAMES};
