const {test} = require('node:test');
const assert = require('node:assert/strict');
const {planStockImport} = require('../server/stock-file');
const {stockAttachments,senderOf,createGmailStockSync} = require('../server/gmail-stock');
const products = [{_id:'a',sku:'8EH34-711',name:'Дуб Миндаль',stock_qty:7},{_id:'b',sku:'RWN-37',name:'Ниагара',stock_qty:10}];
test('free stock only, decimal comma, SKU in name, missing products zeroed', () => {
 const plan = planStockImport([['Номенклатура','Остаток','Свободный остаток'],['Ламинат 8EH34-711 Дуб Миндаль',999,'12,6']], products);
 assert.equal(plan.matched,1); assert.deepEqual(plan.operations.map(o => o.updateOne.update.$set.stock_qty),[12.6,0]);
});
test('invalid or unrelated file never zeros matrix', () => {
 assert.throws(() => planStockImport([['Артикул','Остаток'],['8EH34-711',42]],products),/Свободный остаток/);
 assert.throws(() => planStockImport([['Артикул','Свободный остаток'],['unknown',42]],products),/ни одной/);
});
test('nested attachment filtering and exact sender', () => {
 assert.equal(stockAttachments({parts:[{parts:[{filename:'Остатки на 10.11.2026.xls'},{filename:'Цены.xlsx'},{filename:'Остатки на 10.pdf'}]}]}).length,1);
 assert.equal(senderOf({payload:{headers:[{name:'From',value:'Sales <idealfloor.sale@mail.ru>'}]}}),'idealfloor.sale@mail.ru');
});
test('latest message chosen despite list order, checkpoint prevents repeat and secrets stay private', async () => {
 const XLSX = require('xlsx'); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Артикул','Свободный остаток'],['8EH34-711',31]]),'Остатки');
 const data=XLSX.write(wb,{type:'buffer',bookType:'xlsx'}).toString('base64url');
 const doc={}; const writes=[]; let downloads=0;
 const collection={async updateOne(filter,update) {
   if(filter.owner && doc.owner!==filter.owner) return {matchedCount:0,modifiedCount:0};
   if(filter.$or && doc.leaseUntil && doc.leaseUntil>new Date()) return {matchedCount:0,modifiedCount:0};
   if(!doc._id) Object.assign(doc,{_id:'free_stock'},update.$setOnInsert);
   Object.assign(doc,update.$set); for(const k of Object.keys(update.$unset||{})) delete doc[k]; return {matchedCount:1,modifiedCount:1};
 },async findOne(filter){if(filter.owner&&filter.owner!==doc.owner)return null;return {...doc};}};
 const original=global.fetch;
 global.fetch=async url=>({ok:true,json:async()=>{
   if(url.includes('oauth2')) return {access_token:'PRIVATE'};
   if(url.includes('attachments/')){downloads++;return {data};}
   if(url.includes('messages?'))return {messages:[{id:'old'},{id:'new'}]};
   const isNew=url.includes('/new?');return {id:isNew?'new':'old',internalDate:isNew?'2000':'1000',payload:{headers:[{name:'From',value:'idealfloor.sales@gmail.com'}],parts:[{filename:'Остатки на 10.xlsx',body:{attachmentId:'file',size:100}}]}};
 }});
 try {
 const sync=createGmailStockSync({pause:async()=>{},Product:{find:()=>({select:()=>({lean:async()=>products})}),bulkWrite:async ops=>writes.push(ops)},StockImportMeta:{findOneAndUpdate:async()=>{}},AuditLog:{create:async()=>{}},connection:{collection:()=>collection},ready:()=>true,env:{GMAIL_CLIENT_ID:'id',GMAIL_CLIENT_SECRET:'secret',GMAIL_REFRESH_TOKEN:'refresh'}});
 await sync.run();await sync.run();assert.equal(downloads,1);assert.equal(writes.length,1);assert.equal(doc.lastMessageId,'new');assert.equal(writes[0][0].updateOne.update.$set.stock_qty,31);assert.ok(!JSON.stringify(await sync.status()).includes('PRIVATE'));
 }finally{global.fetch=original;}
});
