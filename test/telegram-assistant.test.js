const {test}=require('node:test');const assert=require('node:assert/strict');
const {createAssistant,dealerScope,literal,today}=require('../server/telegram-assistant');
function harness(){
 const uid='aaaaaaaaaaaaaaaaaaaaaaaa',did='dddddddddddddddddddddddd';let session=null;
 const user={_id:uid,id:uid,fullName:'Manager',role:'manager',scope:'astana',permissions:{can_view_dealers:true,can_manage_visits:true,can_view_products:true,can_view_sales:true}};
 const link={userId:uid,enabled:true,botId:'123',chatId:'42',preferences:{}};const messages=[],writes=[],audits=[];
 const dealer={_id:did,name:'Дилер Астана',city:'Астана',responsible:'regional_astana',contacts:[{name:'Контакт',contactInfo:'+77000000000'}],visits:[]};
 const query=value=>({select(){return this},sort(){return this},skip(){return this},limit(){return this},lean:async()=>structuredClone(value)});
 const matches=f=>session&&Object.entries(f).every(([key,value])=>value?.$gt?session[key]>value.$gt:session[key]===value);
 const collection={findOne:async f=>matches(f)?structuredClone(session):null,updateOne:async(f,u,o)=>{if(matches(f)||o?.upsert){session={...(session||{}),...f,...u.$set};return {modifiedCount:1};}return {modifiedCount:0};},findOneAndUpdate:async(f,u)=>{if(!matches(f))return null;Object.assign(session,u.$set);return structuredClone(session);}};
 const plan={sections:[{id:'manual',kind:'manual',title:'Встречи',unit:'шт.',target:5},{id:'open',kind:'opening',title:'Новые дилеры',unit:'шт.',target:8,restrictSelection:true,dealerTargets:[{dealerId:did,dealerName:'Дилер Астана'}]},{id:'stock',kind:'product_sales',title:'Неликвид',unit:'м²',restrictSelection:true,productTargets:[{productId:'cccccccccccccccccccccccc',productName:'Дуб',sku:'SKU',plan:10}]}]};
 const service=createAssistant({api:async(method,body)=>{if(method==='sendMessage')messages.push(body);return true;},Link:{findOne:()=>query(link.enabled?link:null),updateOne:async(f,u)=>{for(const [k,v] of Object.entries(u.$set)){if(k.startsWith('preferences.'))link.preferences[k.slice(12)]=v;}}},User:{findById:()=>query(user)},Dealer:{find:()=>query([dealer]),findOne:filter=>{const parts=filter.$and;return query(parts[0]._id===did&&(!parts[1].responsible||parts[1].responsible===dealer.responsible)?dealer:null);},updateOne:async(f,u)=>{writes.push({f,u});return {modifiedCount:1};}},Product:{findById:()=>query({_id:'p',name:'Дуб',sku:'SKU',stock_qty:12.5}),find:()=>query([])},StockImportMeta:{findOne:()=>query({importedAt:new Date()})},Sales:{find:()=>query([{dealerId:did,fact:120},{dealerId:'other',fact:900},{dealerId:'PLAN_astana_all',plan:200}])},employeeKpi:{Plan:{findOne:()=>query(plan)},Entry:{find:()=>query([])},options:async()=>({openingDealers:[dealer]}),addEntry:async(req,id)=>{writes.push({req,id});}},AuditLog:{create:async r=>audits.push(r)},connection:{collection:()=>collection},origin:'https://crm.example',currentBot:()=>({id:123})});
 const message=text=>service.handle({message:{text,chat:{id:42,type:'private'},from:{id:42}}});
 const callback=data=>service.handle({callback_query:{id:'callback',data,from:{id:42},message:{chat:{id:42,type:'private'}}}});
 const button=label=>{const b=messages.at(-1).reply_markup.inline_keyboard.flat().find(x=>x.text.includes(label));assert.ok(b,'button '+label);return b.callback_data;};
 return {user,link,messages,writes,audits,plan,dealer,message,callback,button,service,get session(){return session;}};
}
test('literal searches cannot become regular expressions and dealer scope is restrictive',()=>{for(const value of ['.*','[a]','a+b','a\\b'])assert.ok(new RegExp(literal(value)).test(value));assert.deepEqual(dealerScope({role:'manager',scope:'unknown'}),{_id:null});assert.deepEqual(dealerScope({role:'manager',scope:'regions'}),{responsible:'regional_regions'});});
test('bot ignores groups and forged identities, rejects stale and foreign-session callbacks',async()=>{
 const h=harness();await h.service.handle({message:{text:'/menu',chat:{id:-1,type:'group'},from:{id:42}}});assert.equal(h.messages.length,0);
 await h.service.handle({callback_query:{id:'x',data:'menu',from:{id:43},message:{chat:{id:42,type:'private'}}}});assert.equal(h.messages.length,0);
 await h.message('/menu');const old=h.button('KPI');await h.message('/menu');await h.callback(old);assert.match(h.messages.at(-1).text,/устарела/);
 await h.message('/menu');h.session.userId='another';await h.callback(h.button('KPI'));assert.match(h.messages.at(-1).text,/устарела/);
});
test('manual KPI wizard validates quantity, requires confirmation and saves once on concurrent replay',async()=>{
 const h=harness();await h.message('/kpi');await h.callback(h.button('➕ Встречи'));await h.message('-2');assert.match(h.messages.at(-1).text,/Некорректное/);assert.equal(h.writes.length,0);
 await h.message('2,5');await h.message('Встреча с дилером');assert.equal(h.writes.length,0);const save=h.button('Сохранить');await Promise.all([h.callback(save),h.callback(save)]);assert.equal(h.writes.length,1);assert.equal(h.writes[0].req.body.quantity,2.5);assert.equal(h.writes[0].req.body.employeeId,h.user.id);assert.match(h.writes[0].id,/^tg_[a-f0-9]{64}$/);
});
test('product and selected dealer KPI facts preserve assigned identities',async()=>{
 const h=harness();await h.message('/kpi');await h.callback(h.button('➕ Неликвид'));await h.callback(h.button('SKU'));await h.message('12');await h.message('-');await h.callback(h.button('Сохранить'));assert.equal(h.writes[0].req.body.productId,'cccccccccccccccccccccccc');assert.equal(h.writes[0].req.body.note,'');
 await h.message('/kpi');await h.callback(h.button('➕ Новые'));await h.callback(h.button('Дилер'));await h.message('Открыли');await h.callback(h.button('Сохранить'));assert.equal(h.writes[1].req.body.dealerId,h.dealer._id);assert.equal(h.writes[1].req.body.quantity,1);
});
test('dealer permission and zone are rechecked when an old button is pressed',async()=>{
 const h=harness();await h.message('/dealers Дилер');const selected=h.button('Дилер');h.user.scope='regions';await h.callback(selected);assert.match(h.messages.at(-1).text,/недоступен/);assert.ok(!h.messages.at(-1).text.includes('+7700'));
 h.user.scope='astana';await h.message('/dealers Дилер');h.user.permissions.can_view_dealers=false;await h.callback(h.button('Дилер'));assert.match(h.messages.at(-1).text,/нет прав/);
 h.user.isBlocked=true;await h.message('/menu');assert.match(h.messages.at(-1).text,/Подключите/);
});
test('visit wizard rejects invalid dates, audits reports, and prevents writes after permission revocation',async()=>{
 const h=harness();await h.message('/dealers Дилер');await h.callback(h.button('Дилер'));assert.match(h.messages.at(-1).text,/77000000000/);await h.callback(h.button('Запланировать'));await h.message('2026-02-31');assert.match(h.messages.at(-1).text,/Дата/);await h.message(today());await h.message('Проверить стенд');const save=h.button('Сохранить');h.user.permissions.can_manage_visits=false;await h.callback(save);assert.equal(h.writes.length,0);assert.match(h.messages.at(-1).text,/нет прав/);
 h.user.permissions.can_manage_visits=true;await h.message('/dealers Дилер');await h.callback(h.button('Дилер'));await h.callback(h.button('Отчёт'));await h.message('Стенд проверен');const confirmed=h.button('Сохранить');await Promise.all([h.callback(confirmed),h.callback(confirmed)]);assert.equal(h.writes.length,1);assert.equal(h.audits.length,1);assert.equal(h.audits[0].actor.id,h.user.id);assert.equal(h.writes[0].u.$push.visits.isCompleted,true);assert.match(h.writes[0].u.$push.visits.telegramEventId,/tg_/);
});
test('planned visit completion compares original date and index before saving',async()=>{
 const h=harness();h.dealer.visits=[{date:today(),comment:'Проверить',isCompleted:false}];await h.message('/visits');await h.callback(h.button('Дилер'));await h.callback(h.button('Выполнить'));await h.message('Выполнено');await h.callback(h.button('Сохранить'));assert.equal(h.writes[0].u.$set['visits.0.isCompleted'],true);assert.match(h.writes[0].u.$set['visits.0.comment'],/Проверить\nОтчёт: Выполнено/);
});
test('sales summary excludes another zone and settings toggle only the linked employee',async()=>{
 const h=harness();await h.message('/summary');assert.match(h.messages.at(-1).text,/120/);assert.ok(!h.messages.at(-1).text.includes('900'));await h.message('/settings');assert.ok(!h.messages.at(-1).reply_markup.inline_keyboard.flat().some(b=>b.text.includes('Ошибки')));await h.callback(h.button('Напоминания'));assert.equal(h.link.preferences.visits,false);
 await h.message('/stock SKU');assert.match(h.messages.at(-1).text,/Ничего не найдено/);await h.message('/unknown');assert.match(h.messages.at(-1).text,/Неизвестная/);assert.equal(h.writes.length,0);
});
