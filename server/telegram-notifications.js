const crypto=require('crypto');
const {coverageOf}=require('./employee-profile-stats');
const digest=value=>crypto.createHash('sha256').update(String(value)).digest('hex');
function secretMatches(expected,actual){const a=Buffer.from(String(expected||'')),b=Buffer.from(String(actual||''));return a.length>0&&a.length===b.length&&crypto.timingSafeEqual(a,b);}
function mayReceive(user,kind,dealer){
 if(!user||user.isBlocked||user.employmentStatus==='dismissed')return false;
 const admin=user.role==='admin'&&user.permissions?.is_admin===true;
 if(kind==='stockErrors')return admin;
 if(kind==='reclamations'&&!admin&&!user.permissions?.can_view_reclamations)return false;
 if(kind==='visits'&&!admin&&!user.permissions?.can_view_dealers)return false;
 if(dealer){const scope=coverageOf(user).scope;return scope==='all'||dealer.responsible===(scope==='astana'?'regional_astana':'regional_regions');}
 return kind==='kpi'||kind==='visits'||kind==='reclamations'||admin;
}
function registerTelegram({app,mongoose,User,Dealer,AuditLog,connection,ready,origin,env=process.env,fetcher=fetch}){
 const Link=mongoose.model('TelegramEmployeeLink',new mongoose.Schema({userId:{type:String,unique:true,required:true},chatId:{type:String,unique:true,sparse:true},botId:String,username:String,displayName:String,enabled:{type:Boolean,default:true},preferences:{kpi:{type:Boolean,default:true},visits:{type:Boolean,default:true},reclamations:{type:Boolean,default:true},stockErrors:{type:Boolean,default:true}},tokenHash:String,tokenExpiresAt:Date},{timestamps:true}));
 const queueSchema=new mongoose.Schema({_id:String,userId:String,kind:String,text:String,path:String,dealerId:String,status:{type:String,default:'pending'},attempts:{type:Number,default:0},nextAt:{type:Date,default:Date.now},leaseUntil:Date,expiresAt:Date,lastError:String},{timestamps:true});queueSchema.index({expiresAt:1},{expireAfterSeconds:0});queueSchema.index({status:1,nextAt:1});const Queue=mongoose.model('TelegramNotification',queueSchema);
 let bot=null,secret='',timer,running=false,lastSetup=0,setupError=null;
 const config=()=>connection.collection('telegram_integration');const configured=()=>!!String(env.TELEGRAM_BOT_TOKEN||'').trim();
 async function api(method,body={}){
  let response;try{response=await fetcher(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN.trim()}/${method}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});}catch(_){throw Error('Telegram временно недоступен');}
  const result=await response.json().catch(()=>({}));if(!response.ok||!result.ok){const e=Error('Telegram API: '+(result.error_code||response.status));e.code=result.error_code||response.status;e.retryAfter=Math.max(1,Number(result.parameters?.retry_after)||60);throw e;}return result.result;
 }
 async function setup(){if(!configured())return false;if(bot)return true;if(Date.now()-lastSetup<60000)return false;lastSetup=Date.now();try{
  const current=await api('getMe');if(!current.is_bot||!current.username)throw Error('Не удалось определить Telegram-бота');
  await config().updateOne({_id:'bot'},{$setOnInsert:{secret:crypto.randomBytes(32).toString('hex')}},{upsert:true});const stored=await config().findOne({_id:'bot'});secret=stored.secret;
  await api('setWebhook',{url:origin+'/api/public/telegram',secret_token:secret,allowed_updates:['message']});bot=current;setupError=null;return true;
 }catch(error){setupError=error.message;console.error('Telegram setup:',setupError);return false;}}
 async function queue(userId,kind,text,path,eventKey,dealer=null){if(!mongoose.isValidObjectId(userId))return;const user=await User.findById(userId).select('role scope permissions isBlocked employmentStatus').lean();if(!mayReceive(user,kind,dealer))return;const link=await Link.findOne({userId:String(userId),enabled:true}).lean();if(!link?.chatId||link.botId!==String(bot?.id)||link.preferences?.[kind]===false)return;
  await Queue.updateOne({_id:digest(userId+':'+eventKey)},{$setOnInsert:{userId:String(userId),kind,text,path,dealerId:dealer?String(dealer._id):'',status:'pending',attempts:0,nextAt:new Date(),expiresAt:new Date(Date.now()+7*86400000)}},{upsert:true});
 }
 async function recipients(kind,dealer,text,path,key){const links=await Link.find({enabled:true,chatId:{$exists:true},botId:String(bot.id)}).lean();for(const link of links){if(link.preferences?.[kind]===false)continue;const user=await User.findById(link.userId).select('role scope permissions isBlocked employmentStatus').lean();if(!dealer&&kind==='reclamations'&&!(user?.role==='admin'&&user.permissions?.is_admin===true))continue;if(mayReceive(user,kind,dealer))await queue(link.userId,kind,text,path,key,dealer);}}
 async function scan(){
  const state=await config().findOne({_id:'events'});if(!state){await config().updateOne({_id:'events'},{$setOnInsert:{afterAt:new Date()}},{upsert:true});return;}
  const after=state.afterAt||new Date();const until=new Date(Date.now()-2000);
  const filter={createdAt:{$gte:after,$lte:until},$or:[{action:'kpi_assign'},{entityType:'reclamation',success:true}]};
  if(state.afterId)filter.$and=[{$or:[{createdAt:{$gt:after}},{createdAt:after,_id:{$gt:state.afterId}}]}];
  const events=await AuditLog.find(filter).sort({createdAt:1,_id:1}).limit(200).lean();
  for(const event of events){
   if(event.action==='kpi_assign'&&event.requestData?.employeeId)await queue(event.requestData.employeeId,'kpi','В CRM назначен или обновлён KPI на '+String(event.requestData.month||'месяц')+'.','/users.html','audit:'+event._id);
   else if(event.entityType==='reclamation'&&event.method!=='DELETE'){
    const record=event.after||event.requestData||{};const dealerId=record.dealerId;const dealer=mongoose.isValidObjectId(dealerId)?await Dealer.findById(dealerId).select('responsible').lean():null;
    await recipients('reclamations',dealer,event.method==='POST'?'В CRM появилась новая рекламация.':'В CRM обновлена рекламация.','/reclamations.html','audit:'+event._id);
   }
  }
  // Inclusive cursor + stable event key: retries and equal timestamps cannot duplicate queue rows.
  const next=events.length>=200?events[events.length-1].createdAt:until;
  await config().updateOne({_id:'events'},events.length>=200?{$set:{afterAt:next,afterId:events[events.length-1]._id}}:{$set:{afterAt:next},$unset:{afterId:''}});
  const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Almaty',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const tomorrow=new Date(Date.parse(date+'T00:00:00+05:00')+86400000).toLocaleDateString('en-CA',{timeZone:'Asia/Almaty'});
  const dealers=await Dealer.find({visits:{$elemMatch:{date:{$gte:date,$lte:tomorrow+'T23:59:59'},isCompleted:{$ne:true}}}}).select('_id name responsible visits').lean();
  for(const dealer of dealers)for(const [index,visit] of (dealer.visits||[]).entries())if(!visit.isCompleted&&[date,tomorrow].includes(String(visit.date).slice(0,10)))await recipients('visits',dealer,'Запланирован визит: '+dealer.name+' · '+String(visit.date).slice(0,10),'/dealer.html?id='+dealer._id,'visit:'+dealer._id+':'+index+':'+visit.date);
  const stock=await connection.collection('gmail_stock_sync').findOne({_id:'free_stock'});
  if(stock?.lastError)await recipients('stockErrors',null,'Не удалось обновить остатки из почты. Проверьте статус импорта в матрице.','/products.html','stock:'+date+':'+digest(stock.lastError));
 }
 async function deliver(){for(let i=0;i<15&&ready();i++){
  const row=await Queue.findOneAndUpdate({$or:[{status:'pending'},{status:'processing',leaseUntil:{$lt:new Date()}}],nextAt:{$lte:new Date()},expiresAt:{$gt:new Date()},attempts:{$lt:5}},{$set:{status:'processing',leaseUntil:new Date(Date.now()+60000)},$inc:{attempts:1}},{new:true,sort:{createdAt:1}}).lean();if(!row)break;
  const [user,link]=await Promise.all([User.findById(row.userId).select('role scope permissions isBlocked employmentStatus').lean(),Link.findOne({userId:row.userId,enabled:true,botId:String(bot.id)}).lean()]);
  const dealer=row.dealerId&&mongoose.isValidObjectId(row.dealerId)?await Dealer.findById(row.dealerId).select('responsible').lean():null;
  if((row.dealerId&&!dealer)||!mayReceive(user,row.kind,dealer)||!link?.chatId||link.preferences?.[row.kind]===false){await Queue.updateOne({_id:row._id},{$set:{status:'cancelled'}});continue;}
  try{await api('sendMessage',{chat_id:link.chatId,text:row.text,reply_markup:{inline_keyboard:[[{text:'Открыть CRM',url:origin+row.path}]]}});await Queue.updateOne({_id:row._id},{$set:{status:'sent',lastError:''}});}
  catch(error){if(error.code===403)await Link.updateOne({_id:link._id},{$set:{enabled:false}});await Queue.updateOne({_id:row._id},{$set:{status:row.attempts>=5||error.code===403?'failed':'pending',nextAt:new Date(Date.now()+Math.max(error.retryAfter||0,30*row.attempts)*1000),lastError:error.message}});}
  await new Promise(r=>setTimeout(r,100));
 }}
 async function run(){if(running||!ready()||!configured())return;running=true;try{if(await setup()){await scan();await deliver();}}catch(e){console.error('Telegram notifications:',e.message);}finally{running=false;}}
 app.get('/api/telegram/status',async(req,res)=>{try{const link=await Link.findOne({userId:String(req.user.id)}).lean();res.json({configured:configured(),ready:!!bot,botUsername:bot?.username||'',setupError:req.user.role==='admin'?setupError:null,connected:!!(link?.enabled&&link.chatId&&link.botId===String(bot?.id)),username:link?.username||'',displayName:link?.displayName||'',preferences:link?.preferences||{kpi:true,visits:true,reclamations:true,stockErrors:true},isAdmin:req.user.role==='admin'&&req.user.permissions?.is_admin===true});}catch(_){res.status(503).json({error:'Не удалось проверить подключение Telegram'});}});
 app.post('/api/telegram/link',async(req,res)=>{try{if(!bot)return res.status(503).json({error:configured()?'Бот ещё запускается. Попробуйте через минуту.':'Администратор должен добавить TELEGRAM_BOT_TOKEN в Render'});const token=crypto.randomBytes(24).toString('base64url');await Link.findOneAndUpdate({userId:String(req.user.id)},{$set:{tokenHash:digest(token),tokenExpiresAt:new Date(Date.now()+10*60000)}},{upsert:true,setDefaultsOnInsert:true});res.json({url:'https://t.me/'+bot.username+'?start='+token,expiresMinutes:10});}catch(_){res.status(500).json({error:'Не удалось создать ссылку привязки'});}});
 app.put('/api/telegram/preferences',async(req,res)=>{const prefs={};for(const kind of ['kpi','visits','reclamations','stockErrors'])if(typeof req.body?.[kind]==='boolean')prefs['preferences.'+kind]=req.body[kind];try{await Link.findOneAndUpdate({userId:String(req.user.id)},{$set:prefs},{upsert:true,setDefaultsOnInsert:true});res.json({ok:true});}catch(_){res.status(400).json({error:'Не удалось сохранить настройки'});}});
 app.delete('/api/telegram/link',async(req,res)=>{try{await Link.updateOne({userId:String(req.user.id)},{$set:{enabled:false},$unset:{chatId:'',botId:'',username:'',displayName:'',tokenHash:'',tokenExpiresAt:''}});res.json({ok:true});}catch(_){res.status(500).json({error:'Не удалось отключить Telegram'});}});
 app.post('/api/telegram/test',async(req,res)=>{try{if(!bot)throw Error('Бот не настроен');const link=await Link.findOne({userId:String(req.user.id),enabled:true,botId:String(bot.id)}).lean();if(!link?.chatId)throw Error('Сначала подключите Telegram');await api('sendMessage',{chat_id:link.chatId,text:'IDEAL FLOOR CRM: уведомления подключены. Это проверочное сообщение.',reply_markup:{inline_keyboard:[[{text:'Открыть CRM',url:origin+'/users.html'}]]}});res.json({ok:true});}catch(e){res.status(400).json({error:e.message});}});
 app.post('/api/public/telegram',async(req,res)=>{
  if(!secretMatches(secret,req.headers['x-telegram-bot-api-secret-token']))return res.sendStatus(403);
  const message=req.body?.message;if(!message||message.chat?.type!=='private'||String(message.chat.id)!==String(message.from?.id))return res.json({ok:true});
  const text=String(message.text||'').trim(),chatId=String(message.chat.id);try{
   if(text==='/stop'){await Link.updateOne({chatId},{$set:{enabled:false},$unset:{tokenHash:'',tokenExpiresAt:''}});await api('sendMessage',{chat_id:chatId,text:'Уведомления отключены. Повторно подключить Telegram можно в CRM.'});}
   else if(/^\/start\s+[A-Za-z0-9_-]{32}$/.test(text)){
    const token=text.split(/\s+/)[1],candidate=await Link.findOne({tokenHash:digest(token),tokenExpiresAt:{$gt:new Date()}}).lean();const user=candidate?await User.findById(candidate.userId).select('isBlocked employmentStatus').lean():null;
    if(!user||user.isBlocked||user.employmentStatus==='dismissed'){await api('sendMessage',{chat_id:chatId,text:'Ссылка недействительна или истекла. Создайте новую ссылку в своей CRM.'});return res.json({ok:true});}
    const link=await Link.findOneAndUpdate({_id:candidate._id,tokenHash:digest(token),tokenExpiresAt:{$gt:new Date()}},{$set:{chatId,botId:String(bot.id),username:message.from.username||'',displayName:[message.from.first_name,message.from.last_name].filter(Boolean).join(' '),enabled:true},$unset:{tokenHash:'',tokenExpiresAt:''}},{new:true});
    if(link)await api('sendMessage',{chat_id:chatId,text:'Telegram подключён к вашей учётной записи IDEAL FLOOR CRM. Настройте нужные уведомления в разделе «Сотрудники → Мой Telegram». Отключение: /stop',reply_markup:{inline_keyboard:[[{text:'Открыть CRM',url:origin+'/users.html'}]]}});
   }else if(text.startsWith('/start')||text==='/help')await api('sendMessage',{chat_id:chatId,text:'Откройте CRM → Сотрудники → Мой Telegram → Подключить. Затем перейдите по персональной ссылке. Отключение уведомлений: /stop'});
   return res.json({ok:true});
  }catch(error){if(error.code===11000){await api('sendMessage',{chat_id:chatId,text:'Этот Telegram уже связан с другой учётной записью CRM. Сначала отключите прежнюю привязку.'}).catch(()=>{});return res.json({ok:true});}console.error('Telegram webhook:',error.message);return res.sendStatus(503);}
 });
 return {start(){if(timer||!configured())return;timer=setInterval(()=>{void run();},60000);timer.unref?.();void run();},stop(){clearInterval(timer);timer=null;},run};
}
module.exports={registerTelegram,secretMatches,mayReceive,digest};
