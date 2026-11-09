/* Control visits and network-wide commercial decisions. */
document.addEventListener('DOMContentLoaded',async()=>{
    const root=document.getElementById('dealer-price-control')||document.getElementById('pricing-price-control');
    if(!root)return;
    if(window.CRMAuth?.ready)try{await CRMAuth.ready;}catch(_){return;}
    if(!window.CRMAuth?.can('can_view_dealers')&&!window.CRMAuth?.can('can_view_pricing')){root.remove();return;}
    const profile=root.id==='dealer-price-control',dealerId=new URLSearchParams(location.search).get('id');
    const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const fmt=v=>Number(v||0).toLocaleString('ru-RU',{maximumFractionDigits:2});
    const day=v=>v?String(v).slice(0,10).split('-').reverse().join('.'):'—';
    const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Almaty',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const stage=s=>({clear:'Без случаев',confirmed:'Ожидает решения',warned:'Предупреждение',repeat:'Повторный случай',terminated:'Работа прекращена'})[s]||s;
    const stateLabel=s=>({draft:'На проверке',confirmed:'Подтверждено',cancelled:'Удалено'})[s]||s;
    let state=null,overview=null,products=null,modal=null,modalEl=null,submitAction=null;
    const urls=new Map();let photoEpoch=0;
    const api=async(path,method='GET',body)=>{const r=await fetch('/api/price-control'+path,{method,cache:'no-store',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});const d=await r.json();if(!r.ok)throw new Error(d.error||'Не удалось выполнить действие');return d;};
    const notify=(msg,type='success')=>window.CRMUI?.toast?CRMUI.toast(msg,type):console.log(msg);
    const version=()=>state?.version||0;
    const controlPath=id=>'/dealers/'+encodeURIComponent(id);
    function ensureModal(){
        if(modal)return;
        modalEl=document.createElement('div');modalEl.className='modal fade pc-modal pc-root';modalEl.tabIndex=-1;
        modalEl.innerHTML='<div class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable"><form class="modal-content"><div class="modal-header"><h3 class="modal-title"></h3><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Закрыть"></button></div><div class="modal-body"><div class="pc-form"></div><p class="pc-error mt-3 mb-0" role="alert"></p></div><div class="modal-footer"><button type="button" class="pc-btn" data-bs-dismiss="modal">Закрыть</button><button type="submit" class="pc-btn is-primary" id="pc-submit">Сохранить</button></div></form></div>';
        document.body.appendChild(modalEl);modal=new bootstrap.Modal(modalEl);
        modalEl.querySelector('form').addEventListener('submit',async e=>{
            e.preventDefault();if(!submitAction)return;const button=modalEl.querySelector('[type=submit]');button.disabled=true;modalEl.querySelector('.pc-error').textContent='';
            try{await submitAction(new FormData(e.target));modal.hide();await reload();notify('Сохранено');}
            catch(error){modalEl.querySelector('.pc-error').textContent=error.message;if(/изменились|изменились|Обновите/.test(error.message)){submitAction=null;button.hidden=true;const refresh=document.createElement('button');refresh.type='button';refresh.className='pc-btn';refresh.textContent='Обновить данные';refresh.onclick=async()=>{modal.hide();await reload();};modalEl.querySelector('.pc-error').append(' ',refresh);}}
            finally{button.disabled=false;}
        });
    }
    function dialog(title,html,submit,label='Сохранить'){
        ensureModal();modalEl.querySelector('.modal-title').textContent=title;modalEl.querySelector('.pc-form').innerHTML=html;modalEl.querySelector('.pc-error').textContent='';submitAction=submit;
        const button=modalEl.querySelector('[type=submit]');button.hidden=!submit;button.textContent=label;modal.show();
    }
    const input=(label,name,value='',type='text',extra='')=>'<label><span>'+label+'</span><input name="'+name+'" type="'+type+'" value="'+esc(value)+'" '+extra+'></label>';
    const reasonField=()=>'<label><span>Причина / комментарий</span><textarea name="reason" maxlength="2000" required></textarea></label>';
    function caseCard(c,canManage=false,canReport=false){
        const owner=profile?(state.members.find(d=>String(d._id)===String(c.dealerId))):overview.dealers.find(d=>String(d._id)===String(c.dealerId));
        return '<article class="pc-case '+(c.status==='cancelled'?'is-cancelled':'')+'" data-case="'+esc(c._id)+'"><div class="pc-case-head"><h4>'+esc(c.productName)+'</h4><time>'+day(c.observedDate)+'</time></div><div class="pc-case-meta"><span class="pc-status is-'+esc(c.status)+'">'+stateLabel(c.status)+'</span><span>'+esc(c.sku)+'</span><a href="/dealer.html?id='+encodeURIComponent(c.dealerId)+'#price-control-pane">'+esc(c.dealerName||owner?.name)+'</a><span>'+esc(owner?.city||'')+'</span>'+(!profile?'<span>Сеть: '+esc(c.networkName)+'</span>':'')+'</div><div class="pc-case-price"><div><small>Предложенная цена, ₸/м²</small><strong>'+fmt(c.offeredPrice)+' ₸</strong></div><div><small>Объём покупки</small><span>'+ (c.volume?fmt(c.volume)+' м²':'Не указан')+'</span></div></div>'+(c.comment?'<p class="pc-comment">'+esc(c.comment)+'</p>':'')+'<div class="pc-evidence">'+(c.evidence||[]).map((id,i)=>'<button type="button" class="pc-thumb" data-photo="'+esc(id)+'" aria-label="Открыть фото '+(i+1)+'"><img alt="Подтверждение '+(i+1)+'" data-evidence="'+esc(id)+'"></button>').join('')+'</div><p class="pc-sub">Добавил: '+esc(c.createdBy?.name||'—')+' · '+day(c.createdAt)+(c.confirmedBy?' · Подтвердил: '+esc(c.confirmedBy.name):'')+'</p>'+(profile&&c.status!=='cancelled'?'<div class="pc-actions mt-3">'+(canManage&&c.status==='draft'?'<button class="pc-btn" data-action="confirm">Подтвердить</button>':'')+((canManage||canReport&&c.status==='draft')?'<button class="pc-btn" data-action="edit">Изменить</button><button class="pc-btn is-danger" data-action="delete">Удалить</button>':'')+'</div>':'')+'</article>';
    }
    function releasePhotos(){photoEpoch++;for(const u of urls.values())URL.revokeObjectURL(u);urls.clear();}
    async function photos(){
        const epoch=photoEpoch;
        await Promise.allSettled([...root.querySelectorAll('[data-evidence]')].map(async img=>{
            const id=img.dataset.evidence;if(urls.has(id)){img.src=urls.get(id);return;}
            const r=await fetch('/api/price-control/evidence/'+encodeURIComponent(id),{cache:'no-store',crmTrackLoading:false});if(!r.ok)return;
            const u=URL.createObjectURL(await r.blob());if(epoch!==photoEpoch){URL.revokeObjectURL(u);return;}urls.set(id,u);img.src=u;
        }));
    }
    function historyText(h){
        const describe=s=>{if(!s)return '—';return [
            ...(s.cases||[]).map(c=>c.productName+' · '+day(c.observedDate)+' · '+fmt(c.offeredPrice)+' ₸/м² · '+stateLabel(c.status)),
            s.warning?.date?'Предупреждение: '+day(s.warning.date):'Предупреждения нет',
            s.surcharge?.active?'Надбавка: +'+fmt(s.surcharge.percent)+'% с '+day(s.surcharge.startDate):'Надбавки нет',
            s.closure?.samplesRemovedDate?'Образцы сняты: '+day(s.closure.samplesRemovedDate):'',
            s.closure?.terminatedDate?'Договор расторгнут: '+day(s.closure.terminatedDate):'',
            s.name?'Сеть: '+s.name+' · точек: '+(s.members||[]).length:''
        ].filter(Boolean).join('\n');};
        return 'До изменения\n'+describe(h.before)+'\n\nПосле изменения\n'+describe(h.after);
    }
    function renderProfile(){
        const s=state.summary;
        const count=s.count||0;
        root.innerHTML='<section class="pc-panel"><div class="pc-head"><div><span class="pc-eyebrow">КОНТРОЛЬ ЦЕН</span><h3>'+esc(state.network?.name||state.members[0]?.name||'Дилер')+'</h3><p class="pc-sub">'+state.members.length+' торговых точек · история за всё время</p></div><div class="pc-actions">'+(state.canManage?'<button class="pc-btn" data-top="network"><i class="bi bi-diagram-3"></i>Состав сети</button>':'')+(state.canReport?'<button class="pc-btn is-primary" data-top="new"><i class="bi bi-plus-lg"></i>Фиксация</button>':'')+'</div></div><div class="pc-metrics"><article><small>Подтверждённые случаи</small><strong>'+count+'</strong></article><article><small>Надбавка сети</small><strong class="pc-accent">'+(s.surchargePercent?'+'+fmt(s.surchargePercent)+'%':state.surcharge?.active?'Запланирована +'+fmt(state.surcharge.percent)+'%':'Не установлена')+'</strong></article><article><small>Текущий этап</small><strong>'+stage(s.stage)+'</strong></article></div>'+(state.warning?.date?'<p class="pc-sub">Предупреждение: '+day(state.warning.date)+(state.surcharge?.active?' · начало надбавки: '+day(state.surcharge.startDate):'')+'</p>':'')+(state.closure?'<p class="pc-sub">Образцы сняты: '+day(state.closure.samplesRemovedDate)+' · договор расторгнут: '+day(state.closure.terminatedDate)+'</p>':'')+(state.closure?.needsReview?'<p class="pc-note">Связанное решение отменено. Проверьте фактическое состояние образцов и документов.</p>':'')+'<div class="pc-actions mt-3">'+(state.canManage&&count&&!state.warning?.date?'<button class="pc-btn" data-top="warning">Предупреждение и надбавка</button>':'')+(state.canManage&&(s.stage==='repeat'||state.closure?.caseId)&&state.warning?.date?'<button class="pc-btn is-danger" data-top="closure">Прекращение работы</button>':'')+(state.canManage&&state.warning?.date?'<button class="pc-btn" data-top="cancel-decision">Отменить решение</button>':'')+'</div><p class="pc-note">Одна фиксация — одно контрольное обращение. Фото и дополнительные сведения одного обращения добавляйте в эту же запись. Решения действуют на все точки сети.</p><div class="pc-list">'+[...state.cases].sort((a,b)=>String(b.observedDate).localeCompare(String(a.observedDate))||String(b.createdAt).localeCompare(String(a.createdAt))).map(c=>caseCard(c,state.canManage,state.canReport)).join('')+'</div>'+(!state.cases.length?'<div class="pc-empty"><i class="bi bi-shield-check"></i><p>Фиксаций пока нет</p></div>':'')+(state.history?.length?'<details class="pc-history"><summary>История действий · '+state.history.length+'</summary>'+[...state.history].reverse().map(h=>'<article><strong>'+esc(h.action)+'</strong><small>'+esc(h.actor?.name)+' · '+new Date(h.at).toLocaleString('ru-RU',{timeZone:'Asia/Almaty'})+'</small>'+esc(h.reason||'')+'<details><summary>Изменения</summary><pre class="pc-comment">'+esc(historyText(h))+'</pre></details></article>').join('')+'</details>':'')+'</section>';
        root.querySelectorAll('[data-top]').forEach(b=>b.onclick=()=>topAction(b.dataset.top));
        root.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>caseAction(b.dataset.action,b.closest('[data-case]').dataset.case));
        root.querySelectorAll('[data-photo]').forEach(b=>b.onclick=()=>showPhoto(b.dataset.photo));
        const name=document.getElementById('dealer-name');document.getElementById('pc-profile-badge')?.remove();
        if(name&&count){const badge=document.createElement('button');badge.id='pc-profile-badge';badge.className='pc-inline-badge border-0';badge.innerHTML='<i class="bi bi-shield-exclamation"></i> '+count+' · '+esc(stage(s.stage));badge.onclick=openTab;name.after(badge);}
        photos();
    }
    function openTab(){const button=document.querySelector('[data-bs-target="#price-control-pane"]');if(button){bootstrap.Tab.getOrCreateInstance(button).show();button.scrollIntoView({block:'nearest',inline:'center'});}}
    async function reload(){
        releasePhotos();
        if(profile){state=await api(controlPath(dealerId));renderProfile();}
        else{overview=await api('');renderOverview();}
    }
    function renderOverview(){
        const filters={q:root.querySelector('[name=q]')?.value||'',status:root.querySelector('[name=status]')?.value||'active',from:root.querySelector('[name=from]')?.value||'',to:root.querySelector('[name=to]')?.value||''};
        root.innerHTML='<section class="pc-panel"><div class="pc-head"><div><span class="pc-eyebrow">КОНТРОЛЬ ЦЕН</span><h3>Контрольные обращения</h3><p class="pc-sub">Дата, предложенная цена и подтверждения · общая история по сетям</p></div><button type="button" class="pc-btn" data-refresh><i class="bi bi-arrow-clockwise"></i>Обновить</button></div><div class="pc-filters mt-3"><input name="q" type="search" placeholder="Дилер, сеть, город или декор" aria-label="Поиск" value="'+esc(filters.q)+'"><select name="status" aria-label="Статус"><option value="active">Без удалённых</option><option value="draft">На проверке</option><option value="confirmed">Подтверждено</option><option value="cancelled">Удалённые</option><option value="all">Все</option></select><input name="from" type="date" aria-label="Дата с" value="'+esc(filters.from)+'"><input name="to" type="date" aria-label="Дата по" value="'+esc(filters.to)+'"></div><div class="pc-overview-list pc-list"></div><p class="pc-sub mt-3">Добавить фиксацию и принять решение можно в карточке дилера → «Контроль цен».</p></section>';
        root.querySelector('[name=status]').value=filters.status;
        root.querySelectorAll('.pc-filters input,.pc-filters select').forEach(el=>el.addEventListener('input',filterOverview));root.querySelector('[data-refresh]').onclick=()=>reload().catch(e=>notify(e.message,'error'));filterOverview();
    }
    function filterOverview(){
        releasePhotos();const q=root.querySelector('[name=q]').value.trim().toLowerCase(),status=root.querySelector('[name=status]').value,from=root.querySelector('[name=from]').value,to=root.querySelector('[name=to]').value;
        const rows=overview.rows.filter(c=>{const d=overview.dealers.find(d=>String(d._id)===String(c.dealerId));return (!q||[c.dealerName,c.networkName,c.productName,c.sku,d?.city].join(' ').toLowerCase().includes(q))&&(!from||c.observedDate>=from)&&(!to||c.observedDate<=to)&&(status==='all'||status==='active'&&c.status!=='cancelled'||c.status===status);}).sort((a,b)=>String(b.observedDate).localeCompare(String(a.observedDate)));
        root.querySelector('.pc-overview-list').innerHTML=rows.length?rows.map(c=>caseCard(c)).join(''):'<div class="pc-empty">По выбранным условиям фиксаций нет</div>';
        root.querySelectorAll('[data-photo]').forEach(b=>b.onclick=()=>showPhoto(b.dataset.photo));photos();
    }
    function showPhoto(id){const u=urls.get(id);if(!u){notify('Фото ещё загружается','error');return;}dialog('Подтверждение','<img class="pc-photo-view" alt="Фото фиксации" src="'+u+'">',null);}
    async function attachments(input){
        const list=[...input.files];if(list.length>5)throw new Error('Можно приложить до 5 фото');
        return Promise.all(list.map(file=>new Promise((resolve,reject)=>{
            if(!/^image\/(jpeg|png|webp)$/.test(file.type)){reject(new Error('Выберите JPG, PNG или WebP'));return;}
            const reader=new FileReader();reader.onerror=()=>reject(new Error('Не удалось прочитать фото'));reader.onload=()=>{const img=new Image();img.onerror=()=>reject(new Error('Не удалось открыть фото'));img.onload=()=>{const scale=Math.min(1,1400/Math.max(img.width,img.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);const data=canvas.toDataURL('image/jpeg',.84);if(data.length>2000000){reject(new Error('Фото слишком большое. Выберите изображение меньшего размера'));return;}resolve({name:file.name,data});};img.src=reader.result;};reader.readAsDataURL(file);
        })));
    }
    async function editor(c=null){
        dialog(c?'Изменить фиксацию':'Новая фиксация','<label><span>Торговая точка</span><select name="dealer" '+(c?'disabled':'')+'>'+state.members.map(d=>'<option value="'+esc(d._id)+'" '+(String(d._id)===String(c?.dealerId||dealerId)?'selected':'')+'>'+esc(d.name)+' · '+esc(d.city||'')+'</option>').join('')+'</select></label><div class="pc-form-grid">'+input('Дата фиксации','observedDate',c?.observedDate||today(),'date','required max="'+today()+'"')+input('Цена, ₸/м²','offeredPrice',c?.offeredPrice||'','number','required min="0.01" step="0.01"')+'</div>'+input('Декор','productName',c?.productName||'','text','required maxlength="200" list="pc-products" autocomplete="off"')+'<datalist id="pc-products"></datalist><div class="pc-form-grid">'+input('Артикул','sku',c?.sku||'','text','maxlength="80"')+input('Объём покупки, м² · необязательно','volume',c?.volume||'','number','min="0.01" step="0.01"')+'</div><label><span>Комментарий</span><textarea name="comment" maxlength="2000">'+esc(c?.comment||'')+'</textarea></label><label><span>Фото и скриншоты</span><input type="file" name="photos" accept="image/jpeg,image/png,image/webp" multiple><small>До 5 изображений. Фото будут уменьшены для удобной загрузки с телефона.</small></label>'+(c?.evidence?.length?'<div>'+c.evidence.map((id,i)=>'<label class="pc-photo-check"><input type="checkbox" name="keepEvidence" value="'+esc(id)+'" checked> Оставить фото '+(i+1)+'</label>').join('')+'</div>':'')+(c?reasonField():'')+'<p class="pc-note">Сначала запись сохраняется на проверку. Она учитывается в нарушениях после подтверждения ответственным сотрудником.</p>',async f=>{
            const at=await attachments(modalEl.querySelector('[name=photos]'));const keep=f.getAll('keepEvidence');if(keep.length+at.length>5)throw new Error('Всего можно оставить до 5 фото');
            const id=c?.dealerId||f.get('dealer');await api(controlPath(id)+'/cases'+(c?'/'+encodeURIComponent(c._id):''),c?'PUT':'POST',{version:version(),observedDate:f.get('observedDate'),offeredPrice:f.get('offeredPrice'),productName:f.get('productName'),sku:f.get('sku'),volume:f.get('volume'),comment:f.get('comment'),attachments:at,keepEvidence:keep,reason:f.get('reason')});
        });
        try{if(!products){const r=await fetch('/api/products');if(r.ok)products=await r.json();}const dl=modalEl.querySelector('#pc-products');if(dl&&Array.isArray(products)){dl.innerHTML=products.filter(p=>p.product_type!=='equipment').map(p=>'<option value="'+esc(p.name)+'">'+esc(p.sku)+'</option>').join('');modalEl.querySelector('[name=productName]').addEventListener('change',e=>{const p=products.find(p=>p.name===e.target.value);if(p)modalEl.querySelector('[name=sku]').value=p.sku||'';});}}catch(_){}
    }
    function caseAction(action,id){const c=state.cases.find(c=>String(c._id)===id);if(!c)return;if(action==='edit'){editor(c);return;}
        const linked=state.surcharge?.active&&state.surcharge.caseId===id||state.warning?.caseId===id||!state.closure?.needsReview&&state.closure?.caseId===id;
        dialog(action==='delete'?'Удалить фиксацию':'Подтвердить случай','<p class="pc-sub">'+esc(c.productName)+' · '+day(c.observedDate)+' · '+fmt(c.offeredPrice)+' ₸/м²</p>'+(action==='delete'?reasonField()+(linked?'<label class="pc-photo-check"><input type="checkbox" name="cancelDecision" required> Отменить связанное решение и надбавку. Фактическое состояние образцов и договора проверить отдельно.</label>':''):'<p class="pc-note">Случай войдёт в общую историю сети. Подтверждение не применяет надбавку и не расторгает договор.</p>'),async f=>api(controlPath(c.dealerId)+'/actions','POST',{version:version(),action,caseId:id,reason:f.get('reason'),cancelDecision:f.get('cancelDecision')==='on'}),action==='delete'?'Удалить':'Подтвердить');
    }
    async function topAction(action){
        if(action==='new'){editor();return;}
        if(action==='network'){
            try{const all=await api('');const ids=new Set(state.members.map(d=>String(d._id)));dialog('Состав сети',input('Название сети','name',state.network?.name||state.members[0]?.name||'','text','required maxlength="150"')+input('Поиск торговой точки','memberSearch','','search','placeholder="Название, ID или город"')+'<div class="pc-member-list">'+all.dealers.map(d=>'<label class="pc-member" data-search="'+esc([d.name,d.dealer_id,d.city].join(' ').toLowerCase())+'"><input type="checkbox" name="members" value="'+esc(d._id)+'" '+(ids.has(String(d._id))?'checked ':'')+(String(d._id)===dealerId?'disabled':'')+'><span>'+esc(d.name)+'<small>'+esc(d.dealer_id)+' · '+esc(d.city||'')+'</small></span></label>').join('')+'</div><p class="pc-note">Выбранные точки получают общую историю и надбавку. После появления фиксаций исключать точки нельзя. Точки с самостоятельной историей автоматически не объединяются.</p>',async f=>api(controlPath(dealerId)+'/network','PUT',{version:version(),name:f.get('name'),members:f.getAll('members')}));modalEl.querySelector('[name=memberSearch]').oninput=e=>{const q=e.target.value.toLowerCase();modalEl.querySelectorAll('.pc-member').forEach(el=>el.hidden=!el.dataset.search.includes(q));};}catch(e){notify(e.message,'error');}return;
        }
        if(action==='cancel-decision'){dialog('Отменить решение',reasonField()+'<p class="pc-note">Предупреждение и надбавка будут отменены. Фиксации останутся в истории. Если работа уже прекращена, отдельно проверьте образцы и документы.</p>',async f=>api(controlPath(dealerId)+'/actions','POST',{version:version(),action,reason:f.get('reason')}),'Отменить решение');return;}
        let cases=state.cases.filter(c=>c.status==='confirmed');if(action==='closure')cases=cases.filter(c=>String(c._id)!==state.warning?.caseId&&c.observedDate>=state.warning?.date);
        if(!cases.length){notify('Нужен отдельный подтверждённый случай после предупреждения','error');return;}
        const select='<label><span>Основание — подтверждённый случай</span><select name="caseId" required>'+cases.map(c=>'<option value="'+esc(c._id)+'">'+day(c.observedDate)+' · '+esc(c.dealerName)+' · '+esc(c.productName)+' · '+fmt(c.offeredPrice)+' ₸</option>').join('')+'</select></label>';
        if(action==='warning')dialog('Предупреждение и повышение прайса',select+input('Дата предупреждения','date',today(),'date','required max="'+today()+'"')+'<div class="pc-form-grid">'+input('Надбавка, %','percent','','number','required min="0.01" max="100" step="0.01"')+input('Начало действия','startDate',today(),'date','required min="'+today()+'"')+'</div><p class="pc-note">Надбавка действует бессрочно на закупочные цены всех точек сети, после действующих скидок, включая временные прайсы. Например, итоговые 5 000 ₸ при +3% станут 5 150 ₸. РРЦ не меняется.</p>',async f=>api(controlPath(dealerId)+'/actions','POST',{version:version(),action,caseId:f.get('caseId'),date:f.get('date'),percent:f.get('percent'),startDate:f.get('startDate')}),'Применить ко всей сети');
        if(action==='closure')dialog('Прекращение работы с сетью',select+input('Дата снятия образцов · если уже сняты','samplesRemovedDate',state.closure?.samplesRemovedDate||'','date','max="'+today()+'"')+input('Дата расторжения договора · если уже расторгнут','terminatedDate',state.closure?.terminatedDate||'','date','max="'+today()+'"')+reasonField()+'<p class="pc-note">Отмечайте фактически выполненные действия. Сохранение даты расторжения заблокирует создание новых прайсов и КП для всех точек сети. Движение образцов в цехе и оформление документов выполняются отдельно.</p>',async f=>api(controlPath(dealerId)+'/actions','POST',{version:version(),action,caseId:f.get('caseId'),samplesRemovedDate:f.get('samplesRemovedDate'),terminatedDate:f.get('terminatedDate'),reason:f.get('reason')}),'Зафиксировать');
    }
    try{await reload();if(profile&&location.hash==='#price-control-pane')openTab();}catch(e){root.innerHTML='<section class="pc-panel"><p class="pc-error">'+esc(e.message)+'</p><button class="pc-btn" id="pc-retry">Повторить</button></section>';root.querySelector('#pc-retry').onclick=()=>location.reload();}
    window.addEventListener('pagehide',releasePhotos);
});
