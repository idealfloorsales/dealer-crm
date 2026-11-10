const {test}=require('node:test');const assert=require('node:assert/strict');const express=require('express');const mongoose=require('mongoose');
const {secretMatches,mayReceive,digest,registerTelegram}=require('../server/telegram-notifications');
test('Telegram webhook secret is compared exactly and safely',()=>{assert.equal(secretMatches('abc','abc'),true);assert.equal(secretMatches('abc','abd'),false);assert.equal(secretMatches('abc',''),false);assert.equal(secretMatches('',''),false);assert.notEqual(digest('a'),digest('b'));});
test('notifications respect blocks, permissions, scope and administrator-only stock errors',()=>{
 const user={role:'manager',scope:'astana',permissions:{can_view_reclamations:true,can_view_dealers:true}};
 assert.equal(mayReceive(user,'kpi'),true);assert.equal(mayReceive(user,'reclamations',{responsible:'regional_astana'}),true);assert.equal(mayReceive(user,'reclamations',{responsible:'regional_regions'}),false);assert.equal(mayReceive(user,'visits',{responsible:'regional_astana'}),true);assert.equal(mayReceive(user,'stockErrors'),false);assert.equal(mayReceive({...user,isBlocked:true},'kpi'),false);assert.equal(mayReceive({...user,employmentStatus:'dismissed'},'kpi'),false);assert.equal(mayReceive({...user,permissions:{}},'reclamations'),false);
 assert.equal(mayReceive({role:'admin',permissions:{is_admin:true}},'stockErrors'),true);
});
test('secure link is single use and chat binding rejects groups, spoofed webhooks and stale tokens',async()=>{
 const userId='aaaaaaaaaaaaaaaaaaaaaaaa';let link=null,botConfig=null;const messages=[];const routesApp=express();routesApp.use(express.json());routesApp.use((req,res,next)=>{req.user={id:userId,role:'admin',permissions:{is_admin:true}};next();});
 const q=value=>({lean:async()=>value});
 const Link={findOne:filter=>q(link&&(!filter.tokenHash||link.tokenHash===filter.tokenHash)&&(!filter.chatId||link.chatId===filter.chatId)&&(!filter.enabled||link.enabled)?link:null),find:()=>q([]),findOneAndUpdate:async(filter,update)=>{
  if(filter.tokenHash&&(!link||link.tokenHash!==filter.tokenHash||link.tokenExpiresAt<=new Date()))return null;
  if(!link)link={_id:'link',userId,preferences:{},enabled:true};Object.assign(link,update.$set);for(const key of Object.keys(update.$unset||{}))delete link[key];return {...link};
 },updateOne:async(filter,update)=>{if(link){Object.assign(link,update.$set);for(const key of Object.keys(update.$unset||{}))delete link[key];}}};
 const Queue={updateOne:async()=>{},findOneAndUpdate:()=>q(null)};
 const collection={updateOne:async(filter,update)=>{if(filter._id==='bot'&&!botConfig)botConfig={...update.$setOnInsert};},findOne:async filter=>filter._id==='bot'?botConfig:{afterAt:new Date()}};
 const fakeMongoose={Schema:mongoose.Schema,isValidObjectId:mongoose.isValidObjectId,model:name=>name==='TelegramEmployeeLink'?Link:Queue};
 const service=registerTelegram({app:routesApp,mongoose:fakeMongoose,User:{findById:()=>({select:()=>q({role:'admin',permissions:{is_admin:true}})})},Dealer:{find:()=>({select:()=>q([])})},AuditLog:{find:()=>({sort:()=>({limit:()=>q([])})})},connection:{collection:()=>collection},ready:()=>true,origin:'https://crm.example',env:{TELEGRAM_BOT_TOKEN:'test-token'},fetcher:async(url,options)=>{
  const method=url.split('/').pop(),body=JSON.parse(options.body);if(method==='sendMessage')messages.push(body);return {ok:true,json:async()=>({ok:true,result:method==='getMe'?{id:123,is_bot:true,username:'ideal_test_bot'}:true})};
 }});
 await service.run();const server=routesApp.listen(0),base='http://127.0.0.1:'+server.address().port;
 async function call(path,body,secret,method='POST'){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(secret?{'x-telegram-bot-api-secret-token':secret}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json().catch(()=>null)};}
 try{
  assert.equal((await call('/api/public/telegram',{message:{}},'wrong')).status,403);
  const response=await call('/api/telegram/link',{});assert.equal(response.status,200);const token=new URL(response.data.url).searchParams.get('start');assert.equal(token.length,32);assert.equal(link.tokenHash,digest(token));assert.notEqual(link.tokenHash,token);
  const group={message:{chat:{id:-100,type:'group'},from:{id:5},text:'/start '+token}};assert.equal((await call('/api/public/telegram',group,botConfig.secret)).status,200);assert.equal(link.chatId,undefined);
  const msg={message:{chat:{id:5,type:'private'},from:{id:5,username:'employee'},text:'/start '+token}};assert.equal((await call('/api/public/telegram',msg,botConfig.secret)).status,200);assert.equal(link.chatId,'5');assert.equal(link.tokenHash,undefined);assert.equal(messages.length,1);
  await call('/api/public/telegram',msg,botConfig.secret);assert.equal(messages.length,2);assert.match(messages[1].text,/недействительна/);
  await call('/api/public/telegram',{message:{chat:{id:5,type:'private'},from:{id:5},text:'/stop'}},botConfig.secret);assert.equal(link.enabled,false);
 }finally{await new Promise(r=>server.close(r));service.stop();}
});
test('KPI outbox sends only to the linked employee and deduplicates repeat audit events',async()=>{
 const userId='aaaaaaaaaaaaaaaaaaaaaaaa',rows=new Map(),sent=[];let botConfig=null;
 const link={userId,chatId:'42',botId:'123',enabled:true,preferences:{kpi:true}};
 const q=value=>({lean:async()=>value});
 const Link={find:()=>q([link]),findOne:filter=>q(link.enabled?link:null)};
 const Queue={updateOne:async(filter,update)=>{if(!rows.has(filter._id)&&update.$setOnInsert)rows.set(filter._id,{_id:filter._id,...update.$setOnInsert});if(rows.has(filter._id))Object.assign(rows.get(filter._id),update.$set);},findOneAndUpdate:(filter,update)=>{const row=[...rows.values()].find(r=>r.status==='pending');if(!row)return q(null);Object.assign(row,update.$set);row.attempts++;return q({...row});}};
 const event={_id:'event-1',action:'kpi_assign',createdAt:new Date(),requestData:{employeeId:userId,month:'2026-11'}};
 const service=registerTelegram({app:express(),mongoose:{Schema:mongoose.Schema,isValidObjectId:mongoose.isValidObjectId,model:name=>name==='TelegramEmployeeLink'?Link:Queue},User:{findById:()=>({select:()=>q({role:'manager',permissions:{}})})},Dealer:{find:()=>({select:()=>q([])})},AuditLog:{find:()=>({sort:()=>({limit:()=>q([event])})})},connection:{collection:()=>({updateOne:async(filter,update)=>{if(filter._id==='bot')botConfig={...update.$setOnInsert};},findOne:async filter=>filter._id==='bot'?botConfig:filter._id==='events'?{afterAt:new Date(Date.now()-10000)}:null})},ready:()=>true,origin:'https://crm.example',env:{TELEGRAM_BOT_TOKEN:'test-token'},fetcher:async(url,options)=>{if(url.endsWith('/sendMessage'))sent.push(JSON.parse(options.body));return {ok:true,json:async()=>({ok:true,result:url.endsWith('/getMe')?{id:123,is_bot:true,username:'ideal_bot'}:true})};}});
 await service.run();await service.run();assert.equal(sent.length,1);assert.equal(sent[0].chat_id,'42');assert.match(sent[0].text,/KPI/);assert.equal(rows.size,1);assert.ok(!JSON.stringify(sent).includes('test-token'));service.stop();
});
