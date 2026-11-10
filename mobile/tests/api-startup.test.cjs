const {test}=require('node:test');
const assert=require('node:assert/strict');
const {stripTypeScriptTypes}=require('node:module');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function api(fetcher){
 let timeout,cleared=false;
 const source=stripTypeScriptTypes(fs.readFileSync(path.join(__dirname,'../src/lib/api.ts'),'utf8')).replace(/import \* as SecureStore from 'expo-secure-store';/,'const SecureStore=storage;').replace(/export /g,'');
 const context=vm.createContext({storage:{getItemAsync:async()=> 'stored-token'},fetch:fetcher,process:{env:{}},AbortController,setTimeout:fn=>{timeout=fn;return 1;},clearTimeout:()=>{cleared=true;}});
 vm.runInContext(source+'; globalThis.callApi=apiFetch;',context);
 return {call:context.callApi,expire:()=>timeout(),get cleared(){return cleared;}};
}
test('authenticated startup request and successful cleanup',async()=>{
 let request;const a=api(async(url,options)=>{request={url,options};return {ok:true,json:async()=>({user:{id:'employee'}})};});
 const result=await a.call('/api/auth/me',{},'test-token');assert.equal(result.user.id,'employee');assert.equal(request.options.headers.Authorization,'Bearer test-token');assert.equal(a.cleared,true);
});
test('unreachable backend times out rather than blocking startup forever',async()=>{
 const a=api((url,options)=>new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(Error('aborted')))));
 const pending=a.call('/api/auth/me',{},'token');a.expire();await assert.rejects(pending,/не ответил вовремя/);assert.equal(a.cleared,true);
});
test('expired session returns HTTP status for the login flow',async()=>{
 const a=api(async()=>({ok:false,status:401,json:async()=>({error:'Сессия истекла'})}));await assert.rejects(()=>a.call('/api/auth/me',{},'expired'),e=>e.status===401);assert.equal(a.cleared,true);
});
