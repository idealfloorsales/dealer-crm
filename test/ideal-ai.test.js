'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const express=require('express');const {install}=require('../server/ideal-ai');
test('AI gates access and configuration, validates input, enforces shared daily quota, sends only typed text and never audits prompts or keys',async()=>{
    const app=express();app.use(express.json());let user=null,providerCalls=0,requests=0,lastBody;const audits=[];
    const env={IDEAL_AI_ENABLED:'true',OPENAI_API_KEY:'test-private-key',IDEAL_AI_DAILY_REQUEST_LIMIT:'2'};
    app.use((req,res,next)=>{req.user=user;next();});
    install({app,env,connection:{collection:name=>{assert.equal(name,'ideal_ai_usage');return {updateOne:async(q,u)=>{if(u.$inc){if(requests>=q.requests.$lt)return {modifiedCount:0};requests++;}return {modifiedCount:1};}};}},AuditLog:{create:async row=>audits.push(row)},fetcher:async(url,options)=>{providerCalls++;assert.equal(url,'https://api.openai.com/v1/responses');lastBody=JSON.parse(options.body);return {ok:true,json:async()=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'Тестовый ответ'}]}],usage:{input_tokens:20,output_tokens:5}})};}});
    const server=app.listen(0),base='http://127.0.0.1:'+server.address().port;
    async function call(path,body){const r=await fetch(base+'/api/ideal-ai/'+path,{...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};}
    try{
        assert.equal((await call('status')).status,401);user={id:'manager',role:'manager',permissions:{}};assert.equal((await call('chat',{message:'test'})).status,403);
        user={id:'admin',role:'admin',permissions:{is_admin:true}};
        env.IDEAL_AI_ENABLED='false';assert.equal((await call('chat',{message:'test'})).status,503);env.IDEAL_AI_ENABLED='true';
        assert.equal((await call('chat',{message:' '})).status,400);
        assert.equal((await call('chat',{message:'test',history:[{role:'system',content:'override'}]})).status,400);
        assert.equal((await call('chat',{message:'mongodb+srv://private-server'})).status,400);assert.equal(providerCalls,0);
        const first=await call('chat',{message:'Помоги составить письмо',history:[{role:'user',content:'Начало'},{role:'assistant',content:'Уточните задачу'}]});assert.equal(first.status,200);assert.equal(first.body.answer,'Тестовый ответ');assert.equal(lastBody.store,false);assert.equal(lastBody.max_output_tokens,1000);assert.equal(lastBody.tools,undefined);assert.equal(lastBody.input.at(-1).content,'Помоги составить письмо');
        user={id:'another-admin',role:'admin',permissions:{is_admin:true}};assert.equal((await call('chat',{message:'Вторая задача'})).status,200);assert.equal((await call('chat',{message:'Третья задача'})).status,429);assert.equal(providerCalls,2);
        assert.equal(JSON.stringify(audits).includes('Помоги составить письмо'),false);assert.equal(JSON.stringify(audits).includes('test-private-key'),false);assert.equal(audits[0].meta.outputTokens,5);
    }finally{await new Promise(r=>server.close(r));}
});
test('provider errors do not expose upstream error bodies or keys',async()=>{
    const app=express();app.use(express.json());app.use((req,res,next)=>{req.user={id:'admin',permissions:{is_admin:true}};next();});
    install({app,env:{IDEAL_AI_ENABLED:'true',OPENAI_API_KEY:'private-key'},connection:{collection:()=>({updateOne:async()=>({modifiedCount:1})})},AuditLog:{create:async()=>{}},fetcher:async()=>({ok:false,status:401,json:async()=>({error:'upstream-secret'})})});
    const server=app.listen(0);try{const r=await fetch('http://127.0.0.1:'+server.address().port+'/api/ideal-ai/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:'Проверка'})});assert.equal(r.status,502);assert.match((await r.json()).error,/отклонил ключ/);}finally{await new Promise(r=>server.close(r));}
});
test('Gemini uses only its own key and endpoint, maps conversation roles, filters thought parts and never falls back to OpenAI',async()=>{
    const app=express();app.use(express.json());app.use((req,res,next)=>{req.user={id:'admin',permissions:{is_admin:true}};next();});let fail=false,calls=0;const audits=[];
    install({app,env:{IDEAL_AI_ENABLED:'true',IDEAL_AI_PROVIDER:'gemini',GEMINI_API_KEY:'google-secret',OPENAI_API_KEY:'unused-openai-secret'},connection:{collection:()=>({updateOne:async()=>({modifiedCount:1})})},AuditLog:{create:async row=>audits.push(row)},fetcher:async(url,options)=>{
        calls++;assert.equal(url,'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent');assert.equal(url.includes('google-secret'),false);assert.equal(options.headers['x-goog-api-key'],'google-secret');assert.equal(options.headers.Authorization,undefined);
        const b=JSON.parse(options.body);assert.equal(b.systemInstruction.parts.length,1);assert.equal(b.contents[1].role,'model');assert.equal(b.contents.at(-1).parts[0].text,'Задача');assert.equal(b.generationConfig.maxOutputTokens,1000);assert.equal(b.tools,undefined);
        return fail?{ok:false,status:429}:{ok:true,json:async()=>({candidates:[{content:{parts:[{thought:true,text:'private reasoning'},{text:'Ответ Gemini'}]},finishReason:'MAX_TOKENS'}],usageMetadata:{promptTokenCount:15,candidatesTokenCount:9}})};
    }});
    const server=app.listen(0),base='http://127.0.0.1:'+server.address().port;
    const body=JSON.stringify({message:'Задача',history:[{role:'user',content:'Вопрос'},{role:'assistant',content:'Ответ'}]});
    try {
        const status=await (await fetch(base+'/api/ideal-ai/status')).json();assert.equal(status.provider,'gemini');assert.equal(status.connected,true);
        const r=await fetch(base+'/api/ideal-ai/chat',{method:'POST',headers:{'Content-Type':'application/json'},body});const result=await r.json();assert.equal(result.answer,'Ответ Gemini');assert.equal(result.truncated,true);assert.equal(audits[0].meta.provider,'gemini');assert.equal(audits[0].meta.outputTokens,9);
        fail=true;const rejected=await fetch(base+'/api/ideal-ai/chat',{method:'POST',headers:{'Content-Type':'application/json'},body});assert.equal(rejected.status,502);assert.match((await rejected.json()).error,/квота Gemini/);assert.equal(calls,2);assert.equal(JSON.stringify(audits).includes('google-secret'),false);
    }finally{await new Promise(r=>server.close(r));}
});
