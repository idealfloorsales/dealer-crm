const {test}=require('node:test');
const assert=require('node:assert/strict');
const {employeePresence,ONLINE_WINDOW_MS}=require('../server/employee-presence');
const now=Date.parse('2026-11-10T08:00:00Z');
test('online presence expires after two minutes and blocked users are offline',()=>{
 assert.equal(ONLINE_WINDOW_MS,120000);
 assert.equal(employeePresence({lastSeenAt:new Date(now-45000)},now).isOnline,true);
 assert.equal(employeePresence({lastSeenAt:new Date(now-120001)},now).isOnline,false);
 assert.equal(employeePresence({lastSeenAt:new Date(now),isBlocked:true},now).isOnline,false);
 assert.equal(employeePresence({lastSeenAt:new Date(now+60000)},now).isOnline,false);
});
test('last login is a display fallback and does not imply current presence',()=>{
 const login=new Date(now-30000);const result=employeePresence({lastLoginAt:login},now);
 assert.equal(result.isOnline,false);assert.equal(result.lastSeenAt,login);
 assert.deepEqual(employeePresence({},now),{isOnline:false,lastSeenAt:null});
});
test('heartbeat only runs for authenticated visible pages and never sends another user id',async()=>{
 const vm=require('vm'),fs=require('fs');let interval,sent=0;
 const listeners={};const context={window:{CRMAuth:{ready:Promise.resolve(),user:{id:'employee'}},addEventListener:(name,fn)=>listeners[name]=fn},document:{visibilityState:'visible',addEventListener:(name,fn)=>listeners[name]=fn},localStorage:{getItem:()=> 'token'},fetch:async(url,opts)=>{assert.equal(url,'/api/auth/presence');assert.equal(opts.body,undefined);sent++;return {ok:true};},setInterval:fn=>{interval=fn;},Date:{now:()=>now}};
 context.CRMAuth=context.window.CRMAuth;
 vm.runInNewContext(fs.readFileSync(require.resolve('../public/employee-presence.js'),'utf8'),context);await new Promise(r=>setImmediate(r));assert.equal(sent,1);
 context.document.visibilityState='hidden';await interval();assert.equal(sent,1);
 context.document.visibilityState='visible';context.Date.now=()=>now+45000;await interval();assert.equal(sent,2);
 context.localStorage.getItem=()=>null;context.Date.now=()=>now+90000;await interval();assert.equal(sent,2);
});
