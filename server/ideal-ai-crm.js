'use strict';

const monthKey = value => String(value || '').slice(0, 7);
function almatyMonth(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Almaty',year:'numeric',month:'2-digit'}).formatToParts(date);
  const p = Object.fromEntries(parts.map(x => [x.type,x.value]));
  return p.year + '-' + p.month;
}
function monthList(count = 12) {
  const [y,m] = almatyMonth().split('-').map(Number);
  const d = new Date(Date.UTC(y,m-1,1));
  const result = [];
  for (let i=0;i<count;i++) {
    result.unshift(d.toISOString().slice(0,7));
    d.setUTCMonth(d.getUTCMonth()-1);
  }
  return result;
}
function allowed(req, permission) {
  return req.user?.permissions?.is_admin === true || req.user?.permissions?.[permission] === true;
}
function visibleDealerFilter(req) {
  const u=req.user;
  if (!u) return {_id:null};
  if (u.role==='marketing' || u.permissions?.is_admin===true || u.scope==='all') return {};
  if (u.scope==='astana') return {responsible:'regional_astana'};
  if (u.scope==='regions') return {responsible:'regional_regions'};
  return {_id:null};
}
function compact(value, max=500) {
  return String(value ?? '').replace(/[\u0000-\u001f]+/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
}
function redactPii(value,max=500){return compact(value,max).replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,'[скрытая почта]').replace(/\+?\d[\d\s()\-]{7,}\d/g,'[скрытый номер]');}
function dealerRelated(message) { return /(дилер|партнер|партнёр|магазин|салон|точк|клиент)/i.test(message); }
function detectSections(message, matchedDealer) {
  const q=String(message||'');
  const all=/(вся база|всю доступную.*баз|по базе|по всей базе|полный анализ|общий анализ|что происходит|проблемы сети|аналитик[аи] базы|анализируй.*баз|по всем разделам)/i.test(q);
  const sections=new Set();
  if (all) return new Set(['dealers','sales','products','competitors','claims','pricing','workshop','tasks','kpi']);
  if (/(продаж|выруч|заказ|спрос|просел|падени|рост|план|темп|объ[её]м)/i.test(q)) sections.add('sales');
  if (dealerRelated(q)||matchedDealer) sections.add('dealers');
  if (/(товар|ассортимент|коллекц|декор|остат|налич|склад|артикул)/i.test(q)) sections.add('products');
  if (/(конкур|бренд|рынок|инстаграм|instagram|соцсет|упоминан|охват|подписчик|узнаваем)/i.test(q)) sections.add('competitors');
  if (/(инстаграм|instagram|соцсет|упоминан|охват|подписчик|узнаваем)/i.test(q)) sections.add('dealers');
  if (/(рекламац|брак|дефект|претензи)/i.test(q)) sections.add('claims');
  if (/(цен|прайс|скид|ррц|опт|мотивац|услови[яе] оплаты|доставк)/i.test(q)) sections.add('pricing');
  if (/(цех|образц|стенд|плинтус|оборудовани|производств|служебк)/i.test(q)) sections.add('workshop');
  if (/(задач|визит|встреч|план на сегодня|просроч)/i.test(q)) sections.add('tasks');
  if (/(kpi|кипи|сотрудник|менеджер|команд|мотиваци[яи] сотрудник)/i.test(q)) sections.add('kpi');
  if (matchedDealer && /(анализ|почему|что делать|решени|проблем|полная информация|вся информация|состояние)/i.test(q)) ['sales','products','competitors','claims','pricing','tasks'].forEach(x=>sections.add(x));
  if (!sections.size) { sections.add('dealers'); sections.add('sales'); }
  return sections;
}
async function findRows(model, query, projection, limit=500) {
  if (!model) return [];
  return model.find(query).select(projection).limit(limit+1).maxTimeMS(5000).lean();
}
function latestVisit(dealer) {
  const visits=Array.isArray(dealer.visits)?dealer.visits:[];
  const done=visits.filter(v=>v?.isCompleted&&/^\d{4}-\d{2}-\d{2}/.test(String(v.date||'')))
    .map(v=>String(v.date).slice(0,10)).sort();
  return done.at(-1)||null;
}
function matchDealer(dealers,message) {
  const q=String(message||'').toLocaleLowerCase('ru');
  return dealers.filter(d=>{
    const name=compact(d.name,150).toLocaleLowerCase('ru');
    return name.length>=3&&q.includes(name);
  }).sort((a,b)=>String(b.name||'').length-String(a.name||'').length)[0]||null;
}
function source(title,url) { return {title,url}; }

async function buildCrmContext({connection,req,message}) {
  const perm=req.user?.permissions||{};
  const admin=perm.is_admin===true;
  const can=key=>admin||perm[key]===true;
  const context={},sources=[],sections=new Set();
  const Dealer=connection.models.Dealer;
  const dealers=(can('can_view_dealers')||can('can_view_sales'))
    ? await findRows(Dealer,visibleDealerFilter(req),'_id name dealer_id status city region_sector website instagram visits products competitors delivery price_list motivation_scheme hasPersonalPlan responsible responsibleUserId',5000)
    : [];
  if (dealers.length>5000) throw Object.assign(new Error('Слишком много карточек для безопасного анализа. Уточните вопрос или выберите дилера.'),{status:413});
  const matched=matchDealer(dealers,message);
  const wanted=detectSections(message,matched);
  wanted.forEach(x=>sections.add(x));
  const selectedDealers=matched?[matched]:dealers;
  const dealerIndex=new Map(dealers.map(d=>[String(d._id),d]));
  const dealerIds=selectedDealers.map(d=>String(d._id));
  const monthKeys=monthList(15);
  const latest=monthKeys.at(-1);
  const cutoff=monthKeys[0];
  const rowsByName=name=>connection.models[name]||null;
  const put=(key,value,sourceTitle,url)=>{context[key]=value;sources.push(source(sourceTitle,url));};

  if (wanted.has('dealers') && can('can_view_dealers')) {
    const sourceRows=matched?[matched]:dealers;
    const byCity=new Map();for(const d of dealers){const city=compact(d.city,80)||'Город не указан';byCity.set(city,(byCity.get(city)||0)+1);}
    put('dealers',{totalVisible:dealers.length,dealersByCity:[...byCity.entries()].sort((a,b)=>b[1]-a[1]).slice(0,12).map(([city,count])=>({city,count})),records:sourceRows.slice(0,matched?1:10).map(d=>({
      name:compact(d.name,120),city:compact(d.city,80),sector:compact(d.region_sector,80),
      status:compact(d.status,50),responsible:admin?compact(d.responsible,80):undefined,
      website:compact(d.website,160),instagram:compact(d.instagram,160),
      delivery:can('can_view_pricing')&&wanted.has('pricing')?compact(d.delivery,180):undefined,hasPersonalPlan:!!d.hasPersonalPlan,
      assortmentCount:Array.isArray(d.products)?d.products.length:0,
      
      lastCompletedVisit:latestVisit(d),visitCount:Array.isArray(d.visits)?d.visits.length:0,visitNotes:matched&&Array.isArray(d.visits)?d.visits.filter(v=>v?.isCompleted).slice(-3).map(v=>({date:compact(v.date,40),comment:redactPii(v.comment,350)})):[]
    })),matched?'Карточка выбранного дилера':'Краткая сводка доступных дилеров','/');
  }

  if (wanted.has('sales') && can('can_view_sales')) {
    const Sales=rowsByName('Sales');
    const ids=matched?dealers.map(d=>String(d._id)):dealerIds;
    const planIds=ids.map(id=>'PLAN_vip_'+id);
    const sales=ids.length?await findRows(Sales,{month:{$gte:cutoff,$lte:latest},dealerId:{$in:[...ids,...planIds]}},'month dealerId fact plan isCustom',12000):[];
    if (sales.length>12000) throw Object.assign(new Error('Слишком много продаж для безопасного анализа. Уточните период или дилера.'),{status:413});
    const byDealer=new Map(),presentByDealer=new Map(),plansByDealerMonth=new Map();
    for(const row of sales){
      const id=String(row.dealerId||''),month=monthKey(row.month);
      if(!dealerIndex.has(id)&&!id.startsWith('PLAN_vip_'))continue;
      if(id.startsWith('PLAN_vip_')){
        plansByDealerMonth.set(id.slice('PLAN_vip_'.length)+'|'+month,Number(row.plan)||0);
        continue;
      }
      if(row.isCustom||!dealerIndex.has(id))continue;
      const key=id+'|'+month;
      byDealer.set(key,(byDealer.get(key)||0)+(Number(row.fact)||0));
      if(!presentByDealer.has(id))presentByDealer.set(id,new Set());
      presentByDealer.get(id).add(month);
    }
    const series=monthKeys.map(month=>{
      const keys=[...byDealer.keys()].filter(k=>k.endsWith('|'+month));
      return {month,fact:keys.reduce((n,k)=>n+(byDealer.get(k)||0),0),dealerRecords:keys.length,closed:month<latest};
    });
    const recentKeys=monthKeys.slice(-4,-1),previousKeys=monthKeys.slice(-7,-4),yearAgoKeys=recentKeys.map(m=>String(Number(m.slice(0,4))-1)+m.slice(4));
    const allTrends=dealers.filter(d=>!['potential','archive'].includes(String(d.status||'').toLowerCase())).map((d,index)=>{
      const id=String(d._id),present=presentByDealer.get(id)||new Set();
      const values=monthKeys.map(m=>byDealer.get(id+'|'+m)||0);
      const recentCoverage=recentKeys.filter(m=>present.has(m)).length,previousCoverage=previousKeys.filter(m=>present.has(m)).length;
      const recent=recentKeys.reduce((n,m)=>n+(present.has(m)?byDealer.get(id+'|'+m)||0:0),0);
      const previous=previousKeys.reduce((n,m)=>n+(present.has(m)?byDealer.get(id+'|'+m)||0:0),0);
      const recentAverage=recentCoverage?recent/recentCoverage:null,previousAverage=previousCoverage?previous/previousCoverage:null;
      const change=recentCoverage>=2&&previousCoverage>=2&&previousAverage>0?Math.round((recentAverage-previousAverage)/previousAverage*100):null;
      const yearCoverage=yearAgoKeys.filter(m=>present.has(m)).length,yearTotal=yearAgoKeys.reduce((n,m)=>n+(present.has(m)?byDealer.get(id+'|'+m)||0:0),0),yearAverage=yearCoverage?yearTotal/yearCoverage:null;
      const yearChange=recentCoverage>=2&&yearCoverage>=2&&yearAverage>0?Math.round((recentAverage-yearAverage)/yearAverage*100):null;
      return {id,city:compact(d.city,80),sector:compact(d.region_sector,80),dealer:can('can_view_dealers')?compact(d.name,120):'Дилер '+(index+1),monthly:monthKeys.map((m,i)=>({month:m,fact:present.has(m)?values[i]:null,recorded:present.has(m),plan:plansByDealerMonth.get(id+'|'+m)??null,closed:m<latest})),recent3m:recent,recentMonthsRecorded:recentCoverage,previous3m:previous,previousMonthsRecorded:previousCoverage,changePct:change,sameMonthsLastYearPct:yearChange,yearMonthsRecorded:yearCoverage};
    }).sort((a,b)=>(a.changePct??Number.POSITIVE_INFINITY)-(b.changePct??Number.POSITIVE_INFINITY));
    const focus=matched?allTrends.find(x=>x.id===String(matched._id)):null;
    const peers=focus?allTrends.filter(x=>x.id!==focus.id&&((focus.city&&x.city===focus.city)||(focus.sector&&x.sector===focus.sector))).slice(0,8):[];
    const dealerTrends=focus?[focus,...peers].map(({id,...x})=>x):allTrends.slice(0,20).map(({id,monthly,...x})=>x);
    const topAtRisk=allTrends.filter(x=>x.changePct!==null&&x.changePct<=-10).slice(0,12).map(x=>({dealer:x.dealer,city:x.city,changePct:x.changePct,recent3m:x.recent3m,previous3m:x.previous3m,sameMonthsLastYearPct:x.sameMonthsLastYearPct,recentMonthsRecorded:x.recentMonthsRecorded,previousMonthsRecorded:x.previousMonthsRecorded}));
    put('sales',{months:series,dealers:dealerTrends.slice(0,20),decliningDealers:topAtRisk,comparison:'Сравниваются последние три закрытых месяца с предыдущими тремя и с теми же месяцами прошлого года, если записи есть. Пропущенный месяц отмечен как незаписанный, а не как нулевые продажи. Продажи CRM — отгрузки дилерам, не розничные продажи покупателей.'},'Продажи CRM · последние 12 месяцев','/sales.html');
  }

  if(wanted.has('products')&&can('can_view_products')){
    const Product=rowsByName('Product');
    const products=await findRows(Product,{},'_id sku name product_type collection is_liquid stock_qty characteristics is_archived',1200);
    const active=products.filter(p=>!p.is_archived);
    const byId=new Map(active.map(p=>[String(p._id),p]));
    const assortment=matched?(matched.products||[]).map(id=>byId.get(String(id))).filter(Boolean).map(p=>({sku:compact(p.sku,40),name:compact(p.name,120),collection:compact(p.collection,80),stock:Number(p.stock_qty)||0})):[];
    const meta=await findRows(rowsByName('StockImportMeta'),{key:'free_stock'},'importedAt fileName matched updated',1);
    put('products',{count:active.length,assortment,outOfStock:active.filter(p=>Number(p.stock_qty||0)<=0).slice(0,25).map(p=>({sku:compact(p.sku,40),name:compact(p.name,120),collection:compact(p.collection,80)})),items:active.slice(0,30).map(p=>({sku:compact(p.sku,40),name:compact(p.name,120),collection:compact(p.collection,80),type:compact(p.product_type,30),stock:Number(p.stock_qty)||0,characteristics:p.characteristics||{}})),stockUpdatedAt:meta[0]?.importedAt||null,stockFile:compact(meta[0]?.fileName,100)},'Каталог и остатки','/products.html');
  }

  if(wanted.has('competitors')&&can('can_view_competitors')){
    const refs=await findRows(rowsByName('CompRef'),{},'name country supplier website instagram status priority segment strengths weaknesses price_positioning last_monitoring_date next_monitoring_date collections observations',100);
    const linked=matched?(matched.competitors||[]):[];
    put('competitors',{references:refs.slice(0,10).map(c=>({name:compact(c.name,120),country:compact(c.country,80),website:compact(c.website,160),instagram:compact(c.instagram,160),status:compact(c.status,40),priority:compact(c.priority,30),segment:compact(c.segment,80),strengths:compact(c.strengths,220),weaknesses:compact(c.weaknesses,220),pricePositioning:compact(c.price_positioning,120),lastMonitoring:compact(c.last_monitoring_date,40),nextMonitoring:compact(c.next_monitoring_date,40),collections:(c.collections||[]).slice(0,8).map(x=>({name:compact(x.name,80),type:compact(x.type,30),class:compact(x.class,20),thickness:compact(x.thickness,20),format:compact(x.format,50),opt:compact(x.price_opt,40),retail:compact(x.price_retail,40),note:compact(x.note,100)})),observations:(c.observations||[]).slice(-2).map(o=>({date:compact(o.date,40),topic:compact(o.topic,40),source:compact(o.source,120),dealer:compact(o.dealer,100),product:compact(o.product,100),detail:compact(o.detail,300)}))})),dealerNotes:linked.slice(0,10).map(c=>({brand:compact(c.brand,100),collection:compact(c.collection,100),opt:compact(c.price_opt,60),retail:compact(c.price_retail,60)}))},'Конкуренты и наблюдения','/competitors.html');
  }

  if(wanted.has('claims')&&can('can_view_reclamations')){
    const ids=dealerIds;
    const rows=ids.length?await findRows(rowsByName('Reclamation'),{dealerId:{$in:ids}},'dealerId dealerName date productName description resolution status createdAt',300):[];
    put('claims',rows.sort((a,b)=>String(b.date||b.createdAt||'').localeCompare(String(a.date||a.createdAt||''))).slice(0,10).map(c=>({dealer:compact(c.dealerName,120),date:compact(c.date||c.createdAt,40),product:compact(c.productName,120),description:redactPii(c.description,500),resolution:compact(c.resolution,350)})),'Рекламации доступных дилеров','/reclamations.html');
  }

  if(wanted.has('pricing')&&can('can_view_pricing')){
    const PriceList=rowsByName('PriceList');
    const ids=[...new Set(selectedDealers.map(d=>String(d.price_list||'' )).filter(Boolean))];
    const askPrices=/(цена|сколько стоит|опт|ррц|ценник|скидк|прайс)/i.test(message);
    const includeConditions=askPrices||wanted.has('sales')||wanted.has('dealers');
    const projection=askPrices?'name code versionDate validFrom validTo active rows':'name code versionDate validFrom validTo active';
    const listLimit=matched?1:4;
    const lists=ids.length?await findRows(PriceList,{_id:{$in:ids},active:{$ne:false}},projection,listLimit):[];
    const current=matched?[{dealer:compact(matched.name,120),list:compact(lists.find(p=>String(p._id)===String(matched.price_list))?.name,120),delivery:compact(matched.delivery,180)}]:[];
    const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Almaty',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const conditionQuery={$and:[{cancelledAt:null,paused:{$ne:true}},{$or:[{endDate:''},{endDate:{$gte:today}}]},{$or:[{startDate:''},{startDate:{$lte:today}}]},{$or:[{scopeType:'all'},{dealer:{$in:dealerIds}},{dealers:{$in:dealerIds}},{scopeType:'city',scopeValue:{$in:selectedDealers.map(d=>d.city).filter(Boolean)}},{scopeType:'sector',scopeValue:{$in:selectedDealers.map(d=>d.region_sector).filter(Boolean)}}]}]};
    const conditions=includeConditions?await findRows(rowsByName('PricingCondition'),conditionQuery,'name kind scopeType scopeValue discountPercent deliveryText priceListName startDate endDate reasonType requirementTarget requirementCurrent requirementUnit requirementDueDate requirementVerified note',120):[];
    const deliveryConditions=can('can_view_dealers')?await findRows(rowsByName('DeliveryCondition'),{active:{$ne:false}},'name deliveryPart paymentPart aliases',80):[];
    const schemes=/(мотивац)/i.test(message)||wanted.has('sales')?await findRows(rowsByName('MotivationScheme'),{active:{$ne:false}},'name ratePerM2 validFrom validTo active note',80):[];
    put('pricing',{dealerPriceList:current,lists:lists.map(p=>({name:compact(p.name,120),code:compact(p.code,50),versionDate:compact(p.versionDate,30),validFrom:compact(p.validFrom,30),validTo:compact(p.validTo,30),active:p.active!==false,...(askPrices?{rows:(p.rows||[]).slice(0,matched?120:30).map(row=>({sku:compact(row.sku,40),name:compact(row.name,120),collection:compact(row.collection,80),opt:Number(row.opt)||0,rrp:Number(row.rrp)||0,displayPrice:Number(row.displayPrice)||0,currency:compact(row.currency,10)}))}:{})})),conditions:conditions.slice(0,30).map(x=>({...(askPrices?{name:compact(x.name,120)}:{}),kind:compact(x.kind,30),scope:compact(x.scopeType==='dealer'?dealerIndexName(dealers,x.dealer):x.scopeValue,100),...(askPrices?{discountPercent:Number(x.discountPercent)||0,delivery:compact(x.deliveryText,180),priceList:compact(x.priceListName,100),requirementTarget:Number(x.requirementTarget)||0,requirementCurrent:Number(x.requirementCurrent)||0,requirementVerified:!!x.requirementVerified,note:compact(x.note,250)}:{}),startDate:compact(x.startDate,30),endDate:compact(x.endDate,30),reason:compact(x.reasonType,50)})),deliveryConditions:deliveryConditions.slice(0,50).map(x=>({name:compact(x.name,150),delivery:compact(x.deliveryPart,150),payment:compact(x.paymentPart,150)})),motivation:schemes.map(x=>({name:compact(x.name,120),ratePerM2:Number(x.ratePerM2)||0,validFrom:compact(x.validFrom,30),validTo:compact(x.validTo,30)}))},'Прайс дилера, скидки и условия','/pricing.html');
  }

  if(wanted.has('workshop')&&can('can_view_workshop')){
    const materials=await findRows(rowsByName('WorkshopMaterial'),{active:{$ne:false}},'name unit stockQty minQty',100);
    const recipes=await findRows(rowsByName('WorkshopRecipe'),{active:{$ne:false}},'name sku stockQty minStockQty matrixPosName outputType',100);
    const memos=await findRows(rowsByName('WorkshopMemo'),{status:{$in:['created','mismatch']}},'number status createdAt',60);
    const assets=await findRows(rowsByName('WorkshopDealerAsset'),{dealer:{$in:selectedDealers.map(d=>d._id)}},'dealer recipe qty',500);
    const recipeById=new Map(recipes.map(r=>[String(r._id),r]));
    put('workshop',{materials:materials.slice(0,40).map(m=>({name:compact(m.name,100),unit:compact(m.unit,20),stock:Number(m.stockQty)||0,minimum:Number(m.minQty)||0})),finishedSamples:recipes.slice(0,40).map(r=>({name:compact(r.name,100),sku:compact(r.sku,40),stock:Number(r.stockQty)||0,minimum:Number(r.minStockQty)||0,pos:compact(r.matrixPosName,100)})),dealerAssets:assets.slice(0,40).map(a=>({dealer:compact(dealerIndexName(dealers,a.dealer),120),asset:compact(recipeById.get(String(a.recipe))?.name,100),quantity:Number(a.qty)||0})),openMemos:memos.slice(0,20).map(m=>({number:compact(m.number,40),status:compact(m.status,30),createdAt:compact(m.createdAt,40)}))},'Остатки и заявки цеха','/workshop.html');
  }

  if(wanted.has('tasks')&&can('can_view_dealers')){
    const Task=rowsByName('IdealWorkTask');
    if(Task){
      const q={dealerId:{$in:dealerIds},createdAt:{$gte:new Date(Date.now()-180*86400000)}};
      if(!admin)q.assigneeId=String(req.user.id);
      const tasks=await findRows(Task,q,'dealerId title dueDate assigneeId status createdAt completedAt',160);
      put('tasks',tasks.slice(0,30).map(t=>({dealer:compact(dealerIndexName(dealers,t.dealerId),120),title:compact(t.title,200),dueDate:compact(t.dueDate,30),status:t.status,createdAt:compact(t.createdAt,40),completedAt:compact(t.completedAt,40)})), 'Рабочие задачи','/');
    }
  }

  if(wanted.has('kpi')&&can('can_manage_users')){
    const User=rowsByName('User');
    const users=await findRows(User,{isBlocked:{$ne:true},employmentStatus:{$ne:'dismissed'},role:{$nin:['guest','workshop']}},'fullName role scope',100);
    const month=almatyMonth();
    const plans=connection.models.EmployeeKpiPlan?await findRows(connection.models.EmployeeKpiPlan,{month},'employeeId month sections newDealerTarget illiquidTarget salesTargets',100):[];
    const entries=connection.models.EmployeeKpiEntry?await findRows(connection.models.EmployeeKpiEntry,{month},'employeeId month type sectionId date dealerName productName quantity',300):[];
    const userById=new Map(users.slice(0,50).map(u=>[String(u._id),u]));
    put('team',{month,employees:users.map(u=>({name:compact(u.fullName,100),role:compact(u.role,40),scope:compact(u.scope,30)})),kpiPlans:plans.slice(0,30).map(p=>({employee:compact(userById.get(String(p.employeeId))?.fullName,100),sections:p.sections||[],newDealerTarget:Number(p.newDealerTarget)||0,illiquidTarget:Number(p.illiquidTarget)||0,salesTargets:p.salesTargets||[]})),kpiEntries:entries.slice(0,50).map(e=>({employee:compact(userById.get(String(e.employeeId))?.fullName,100),type:compact(e.type,30),section:compact(e.sectionId,60),date:compact(e.date,30),dealer:compact(e.dealerName,100),product:compact(e.productName,100),quantity:Number(e.quantity)||0}))},'Сотрудники и KPI','/users.html');
  }

  const permissionBySection={dealers:'can_view_dealers',sales:'can_view_sales',products:'can_view_products',competitors:'can_view_competitors',claims:'can_view_reclamations',pricing:'can_view_pricing',workshop:'can_view_workshop',tasks:'can_view_dealers',kpi:'can_manage_users'};
  const visibleSections=[...wanted].filter(section=>permissionBySection[section]&&can(permissionBySection[section]));
  return {context,sections:visibleSections,sources};
}
function dealerIndexName(dealers,id) { return dealers.find(d=>String(d._id)===String(id))?.name||'Дилер'; }
module.exports={buildCrmContext};
