'use strict';
// IDEAL AI: isolated text chat, no CRM database tools or mutations.
const rateLimit = require('express-rate-limit');
const SYSTEM = 'Ты IDEAL AI, помощник сотрудников IDEAL FLOOR. Отвечай по-русски, кратко и точно. Ты не подключён к данным CRM и не можешь знать актуальные продажи, остатки, цены, персональные данные или внутренние документы. Не выдумывай эти сведения. Ты не можешь изменять данные CRM.';
const limiter = rateLimit({windowMs:15*60*1000,limit:20,standardHeaders:'draft-7',legacyHeaders:false,message:{error:'Лимит запросов IDEAL AI. Попробуйте позже.'}});
function install({app}) {
  const configured=()=>process.env.IDEAL_AI_ENABLED==='true' && !!process.env.OPENAI_API_KEY;
  app.get('/api/ideal-ai/status',limiter,(req,res)=>{
    if(!req.user?.id)return res.status(401).json({error:'Требуется авторизация'});
    res.json({enabled:process.env.IDEAL_AI_ENABLED==='true',connected:configured(),mode:'isolated-read-only',availableTools:[],model:configured()?(process.env.IDEAL_AI_MODEL||'gpt-4.1-mini'):null});
  });
  app.post('/api/ideal-ai/chat',limiter,async(req,res)=>{
    if(!req.user?.id)return res.status(401).json({error:'Требуется авторизация'});
    if(!configured())return res.status(503).json({error:'IDEAL AI не настроен: требуется серверный ключ и включение функции'});
    const message=req.body?.message;
    if(typeof message!=='string'||!message.trim()||message.length>3000)return res.status(400).json({error:'Сообщение должно содержать от 1 до 3000 символов'});
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),25000);
    try{
      const response=await fetch('https://api.openai.com/v1/chat/completions',{
        method:'POST',signal:controller.signal,
        headers:{'Content-Type':'application/json',Authorization:'Bearer '+process.env.OPENAI_API_KEY},
        body:JSON.stringify({model:process.env.IDEAL_AI_MODEL||'gpt-4.1-mini',messages:[{role:'system',content:SYSTEM},{role:'user',content:message.trim()}],max_completion_tokens:600,store:false})
      });
      if(!response.ok){console.error('IDEAL AI provider error status:',response.status);return res.status(502).json({error:'Сервис IDEAL AI временно недоступен'});}
      const data=await response.json();
      const answer=data.choices?.[0]?.message?.content;
      if(typeof answer!=='string'||!answer.trim())return res.status(502).json({error:'ИИ не вернул ответ'});
      res.set('Cache-Control','no-store');
      res.json({answer,mode:'isolated-read-only'});
    }catch(e){
      console.error('IDEAL AI request failed:',e.name);
      res.status(503).json({error:'Не удалось получить ответ IDEAL AI'});
    }finally{clearTimeout(timer);}
  });
}
module.exports={install};
