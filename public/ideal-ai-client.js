(async()=>{
 if(window.CRMAuth?.ready)await CRMAuth.ready;
 if(!window.CRMAuth?.user||window.__idealAIInstalled||!CRMAuth.can('can_manage_users'))return;
 window.__idealAIInstalled=true;
 const link=document.createElement('link');link.rel='stylesheet';link.href='/ideal-ai.css';document.head.appendChild(link);
 const launch=document.createElement('button');launch.type='button';launch.className='ideal-ai-launch';launch.innerHTML='<span aria-hidden="true">✦</span> IDEAL AI';launch.setAttribute('aria-haspopup','dialog');document.body.appendChild(launch);
 const overlay=document.createElement('div');overlay.className='ideal-ai-overlay';overlay.hidden=true;
 overlay.innerHTML=`<section class="ideal-ai-dialog" role="dialog" aria-modal="true" aria-labelledby="ideal-ai-title">
 <header><div><small>IDEAL FLOOR · ПОМОЩНИК</small><h2 id="ideal-ai-title">IDEAL AI</h2></div><button type="button" data-ai-close aria-label="Закрыть">×</button></header>
 <nav class="ideal-ai-modes" aria-label="Режим помощника"><button type="button" data-ai-mode="knowledge" aria-pressed="true">Эксперт IDEAL FLOOR</button><button type="button" data-ai-mode="reports" aria-pressed="false">Отчёты CRM</button></nav>
 <p class="ideal-ai-intro">Характеристики, укладка и рабочие тексты по материалам обучения. Источники доступны под ответом.</p>
 <div class="ideal-ai-report-tools" hidden><label>Месяц <input type="month" aria-label="Месяц отчёта" data-ai-month></label><div><button type="button" data-ai-report="sales">Продажи и отклонения</button><button type="button" data-ai-report="visits">Кому нужен визит</button><button type="button" data-ai-report="kpi">Выполнение KPI</button></div><small>Расчёты внутри CRM. База и результаты не отправляются в Gemini.</small></div>
 <div class="ideal-ai-messages" role="log" aria-live="polite"></div>
 <div class="ideal-ai-suggestions"><button type="button">Сравни ENGLAND HERRINGBONE и ROYAL PARQUET</button><button type="button">Как подготовить основание перед укладкой?</button><button type="button">Составь план обучения дилера</button></div>
 <p class="ideal-ai-status" role="status"></p>
 <form><label class="visually-hidden" for="ideal-ai-input">Сообщение</label><textarea id="ideal-ai-input" rows="3" maxlength="3000" placeholder="Спросите о коллекции, монтаже или тексте для дилера…" required></textarea><div class="ideal-ai-form-actions"><button type="button" data-ai-clear>Новый диалог</button><button type="submit">Отправить <span aria-hidden="true">↑</span></button></div></form>
 <footer>Текст запроса отправляется выбранному провайдеру ИИ. Не вводите пароли, конфиденциальные и персональные данные. Ответы проверяйте перед использованием.</footer></section>`;
 document.body.appendChild(overlay);
 const form=overlay.querySelector('form'),input=overlay.querySelector('textarea'),log=overlay.querySelector('[role=log]'),status=overlay.querySelector('.ideal-ai-status'),reportTools=overlay.querySelector('.ideal-ai-report-tools'),suggestions=overlay.querySelector('.ideal-ai-suggestions'),footer=overlay.querySelector('footer');
 let history=[],busy=false,scrollStyle='',mode='knowledge',providerNotice=footer.textContent;
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Almaty',year:'numeric',month:'2-digit'}).formatToParts(new Date());
 overlay.querySelector('[data-ai-month]').value=parts.find(x=>x.type==='year').value+'-'+parts.find(x=>x.type==='month').value;
 async function api(path,body){const r=await fetch('/api/ideal-ai/'+path,{crmTrackLoading:false,...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});const data=await r.json().catch(()=>({}));if(!r.ok)throw Error(data.error||'Не удалось связаться с помощником');return data;}
 function entry(role,text,sources=[],local=false){
  const el=document.createElement('div');el.className='ideal-ai-message '+role;el.dataset.aiMode=local?'reports':'knowledge';
  const label=document.createElement('strong');label.textContent=role==='user'?'Вы':local?'CRM · точный расчёт':'IDEAL AI';const content=document.createElement('div');content.textContent=text;el.append(label,content);
  if(sources.length){const refs=document.createElement('div');refs.className='ideal-ai-sources';const heading=document.createElement('small');heading.textContent=local?'Источник данных':'Материалы для проверки ответа';refs.appendChild(heading);
   const allowed=/^(?:\/knowledge\.html(?:\?(?:trainingCollection|assistantGuide|catalogCollection)=[^#]*)?|\/sales\.html|\/users\.html|\/)$/;
   for(const source of sources){if(!allowed.test(source.url||''))continue;const a=document.createElement('a');a.href=source.url;a.target='_blank';a.rel='noopener';a.textContent=(source.number?'['+source.number+'] ':'')+source.title+(source.version?' · '+source.version:'');refs.appendChild(a);}el.appendChild(refs);
  }
  log.appendChild(el);el.hidden=(local?'reports':'knowledge')!==mode;log.scrollTop=log.scrollHeight;
 }
 function changeMode(next){if(busy)return;mode=next;const local=mode==='reports';reportTools.hidden=!local;form.hidden=local;suggestions.hidden=local;
  overlay.querySelectorAll('[data-ai-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.aiMode===mode)));
  overlay.querySelector('.ideal-ai-intro').textContent=local?'Выберите отчёт и месяц. Визиты проверяются на текущую дату; учитываются только завершённые.':'Характеристики, укладка и рабочие тексты по материалам обучения. Источники доступны под ответом.';
  footer.textContent=local?'Данные обрабатываются внутри CRM. Изменений, отправок и запросов к Google при расчёте отчёта нет.':providerNotice;
  log.querySelectorAll('[data-ai-mode]').forEach(el=>el.hidden=el.dataset.aiMode!==mode);status.textContent=local?'Выберите отчёт выше':'Готов к вопросу';
 }
 function setBusy(value){busy=value;overlay.querySelectorAll('form button,[data-ai-report],[data-ai-mode],[data-ai-month]').forEach(b=>b.disabled=value);input.disabled=value;}
 async function open(){scrollStyle=document.body.style.overflow;document.body.style.overflow='hidden';overlay.hidden=false;if(mode==='knowledge')input.focus();try{const s=await api('status');providerNotice=s.provider==='gemini'?'Вопрос и учебные материалы отправляются в Google Gemini. Бесплатный тариф допускает использование запросов и ответов для улучшения моделей. Не вводите конфиденциальные и персональные данные.':'Вопрос и учебные материалы отправляются в OpenAI. Не вводите пароли и конфиденциальные данные. Ответы проверяйте.';if(mode==='knowledge')footer.textContent=providerNotice;status.textContent=mode==='reports'?'Выберите отчёт выше':s.connected?'Готов к работе · до '+s.dailyRequestLimit+' запросов в сутки на CRM':'ИИ не настроен. Локальные отчёты доступны во вкладке «Отчёты CRM».';}catch(e){status.textContent=e.message;}}
 function close(){overlay.hidden=true;document.body.style.overflow=scrollStyle;launch.focus();}
 launch.addEventListener('click',open);overlay.querySelector('[data-ai-close]').addEventListener('click',close);overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
 overlay.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close();}if(e.key==='Tab'){const focusable=[...overlay.querySelectorAll('button,textarea,input,a')].filter(el=>!el.disabled&&el.getClientRects().length);const first=focusable[0],last=focusable.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
 overlay.querySelectorAll('[data-ai-mode]').forEach(b=>b.addEventListener('click',()=>changeMode(b.dataset.aiMode)));
 suggestions.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{input.value=b.textContent;input.focus();}));
 overlay.querySelector('[data-ai-clear]').addEventListener('click',()=>{if(busy)return;history=[];log.querySelectorAll('[data-ai-mode="knowledge"]').forEach(el=>el.remove());status.textContent='Новый диалог';input.focus();});
 overlay.querySelectorAll('[data-ai-report]').forEach(button=>button.addEventListener('click',async()=>{
  if(busy)return;const month=overlay.querySelector('[data-ai-month]').value;if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)){status.textContent='Выберите месяц отчёта';return;}
  setBusy(true);status.textContent='Рассчитываю внутри CRM…';
  try{const r=await api('report?kind='+button.dataset.aiReport+'&month='+month);entry('assistant',r.answer,r.sources,true);status.textContent='Расчёт на '+new Date(r.generatedAt).toLocaleString('ru-RU')+' · без отправки в Google';}
  catch(e){status.textContent=e.message;}finally{setBusy(false);}
 }));
 form.addEventListener('submit',async e=>{e.preventDefault();if(busy||!input.value.trim())return;const message=input.value.trim();setBusy(true);entry('user',message);status.textContent='Готовлю ответ по материалам обучения…';
  try{const r=await api('chat',{message,history:history.slice(-4)});entry('assistant',r.answer,r.sources||[]);history.push({role:'user',content:message},{role:'assistant',content:r.answer.slice(0,5000)});input.value='';status.textContent=r.truncated?'Ответ достиг ограничения длины. Можно попросить продолжить.':'Ответ готов · проверьте источники';}
  catch(e){status.textContent=e.message;}finally{setBusy(false);if(!overlay.hidden)input.focus();}
 });
})();
