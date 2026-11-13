'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'../public',name),'utf8');
const between=(s,a,b)=>s.slice(s.indexOf(a),s.indexOf(b,s.indexOf(a)));

test('appearance is applied before paint; system changes respect explicit light and tolerate unavailable storage',()=>{
 let listener,mode='system';const root={dataset:{}},meta={content:''},query={matches:true,addEventListener(_event,fn){listener=fn;}};
 const context=vm.createContext({window:{matchMedia:()=>query},document:{documentElement:root,querySelector:()=>meta},localStorage:{getItem:()=>mode}});
 vm.runInContext(read('theme-init.js'),context);assert.equal(root.dataset.crmTheme,'dark');assert.equal(meta.content,'#151619');
 mode='light';listener();assert.equal(root.dataset.crmTheme,'light');query.matches=false;listener();assert.equal(root.dataset.crmTheme,'light');
 mode='unknown';listener();assert.equal(root.dataset.crmThemeMode,'system');assert.equal(root.dataset.crmTheme,'light');
 context.localStorage.getItem=()=>{throw Error('storage unavailable');};listener();assert.equal(root.dataset.crmTheme,'light');
});

test('damaged and wrong-shaped UI settings fall back without stopping the page',()=>{
 let value='{broken';const c=vm.createContext({localStorage:{getItem:()=>value}});
 vm.runInContext(between(read('permissions.js'),'    function readStoredJSON(', '    function currentThemeMode('),c);
 const fallback={showPlan:true},object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
 assert.equal(c.readStoredJSON('dash',fallback,object),fallback);
 for(const bad of ['null','[]','"hello"','4']){value=bad;assert.equal(c.readStoredJSON('dash',fallback,object),fallback);}
 value='{"showPlan":false}';assert.equal(c.readStoredJSON('dash',fallback,object).showPlan,false);
 value='{}';const list=[];assert.equal(c.readStoredJSON('training',list,Array.isArray),list);
 c.localStorage.getItem=()=>{throw Error('blocked');};assert.equal(c.readStoredJSON('dash',fallback,object),fallback);
});

function salesHarness(){
 const pending=[];let renders=0;const c=vm.createContext({monthPicker:{value:'2026-10'},loadRequest:0,isLoading:false,saveBtn:{disabled:false},printBtn:{disabled:false},summaryList:{innerHTML:'old'},performanceCards:{innerHTML:'old'},container:{innerHTML:''},loadedMonth:'',allDealers:[],currentSales:[],API_DEALERS:'/api/dealers',API_SALES:'/api/sales',canEditFact:true,canEditPlan:true,
 cancelScheduledAutoSave(){},clearDirty(){},renderAll(){renders++;},updateLastModifiedText(){},setSaveButtonState(){},escapeHtml:s=>String(s).replace(/[<>]/g,''),fetch(url){return new Promise(resolve=>pending.push({url,resolve}));}});
 vm.runInContext(between(read('sales.js'),'    async function loadData()', '    function updateLastModifiedText()'),c);
 return {c,pending,renders:()=>renders,reply(offset,month){pending[offset].resolve({ok:true,json:async()=>[{id:'d'+month}]});pending[offset+1].resolve({ok:true,json:async()=>[{dealerId:'d'+month,fact:Number(month)}]});}};
}
test('out-of-order monthly responses cannot replace the currently selected sales',async()=>{
 const h=salesHarness(),c=h.c;const first=c.loadData();assert.equal(c.saveBtn.disabled,true);assert.equal(c.summaryList.innerHTML,'');
 c.monthPicker.value='2026-11';const second=c.loadData();h.reply(2,'11');await second;assert.equal(c.loadedMonth,'2026-11');assert.equal(c.currentSales[0].fact,11);assert.equal(c.saveBtn.disabled,false);
 h.reply(0,'10');await first;assert.equal(c.loadedMonth,'2026-11');assert.equal(c.currentSales[0].fact,11);assert.equal(h.renders(),1);
});
test('failed monthly load does not enable saving stale sales; manual saves are blocked while loading',async()=>{
 const h=salesHarness(),c=h.c,p=c.loadData();h.pending[0].resolve({ok:false});h.pending[1].resolve({ok:true});await p;assert.equal(c.loadedMonth,'');assert.equal(c.saveBtn.disabled,true);assert.match(c.container.innerHTML,/Не удалось загрузить/);
 const s=read('sales.js'),fn=between(s,'    async function persistSales(', '    function getProgressLevel(');let notified=false;
 c.window={showToast(){notified=true;}};c.isLoading=true;vm.runInContext(fn,c);assert.equal(await c.persistSales(true),false);assert.equal(notified,true);
});

test('reclamation print treats user-entered markup as text in every text field',()=>{
 const c=vm.createContext({allReclamations:[],escapeHtml:v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))});
 vm.runInContext(between(read('reclamations.js'),'    function generatePrintHTML(data)', '    window.print'),c);
 const payload='<img src=x onerror="bad()">';const input=Object.fromEntries(['dealerName','productName','invoiceNumber','clientName','clientPhone','address','houseType','floor','totalArea','purchasedVolume','layingTime','floorFlatness','acclimatization','storageMethod','underlayment','warmFloor','installer','defectMoment','defectVolume','description','clientDemand','resolution'].map(k=>[k,payload]));input.batchNumbers=[payload];
 const html=c.generatePrintHTML(input);assert.ok(!html.includes('<img'));assert.ok(html.includes('&lt;img'));assert.ok(html.includes('&quot;bad()&quot;'));
});

test('CRM authorization is scoped to its own API; external errors never log the employee out',async()=>{
 const requests=[],events=[];let status=200;
 const c=vm.createContext({URL,Request,Headers,performance:{now:()=>1},navigator:{onLine:true},window:{location:{href:'https://crm.example/map.html',origin:'https://crm.example'},__crmOriginalFetch:async(url,options)=>{requests.push({url,options});return {status};}},getToken:()=> 'private-crm-token',startNetworkActivity(){events.push('start')},stopNetworkActivity(){events.push('stop')},markNetworkSuccess(){events.push('ok')},markNetworkFailure(){events.push('fail')},logout(){events.push('logout')}});
 vm.runInContext(between(read('permissions.js'),'    async function apiFetch(', '    function can(permission)'),c);
 const headers=new Headers({'Content-Type':'application/json'}),opts={headers};await c.apiFetch('/api/dealers',opts);
 assert.equal(requests[0].options.headers.get('Authorization'),'Bearer private-crm-token');assert.equal(headers.get('Authorization'),null);assert.equal(requests[0].options.headers.get('Content-Type'),'application/json');
 status=401;events.length=0;await c.apiFetch('https://nominatim.openstreetmap.org/search?format=json',opts);assert.equal(requests[1].options.headers.get('Authorization'),null);assert.deepEqual(events,[]);
 await c.apiFetch('/drive-photo-map.json');assert.equal(requests[2].options.headers,undefined);
 await assert.rejects(c.apiFetch('/api/auth/me'),/Сессия завершена/);assert.ok(events.includes('logout'));
});

test('rejected product and reclamation deletes keep the dialog and list intact and report the server error',async()=>{
 for(const kind of ['product','reclamation']){
  const events=[],window={};const c=vm.createContext({window,canManageProducts:true,canManageReclamations:true,currentViewId:'r1',API_URL:'/api/products',confirm:()=>true,fetch:async()=>({ok:false,json:async()=>({error:'Действие отклонено'})}),alert:message=>events.push(message),modal:{hide:()=>events.push('hidden')},viewModal:{hide:()=>events.push('hidden')},loadProducts:()=>events.push('reload'),fetchReclamations:()=>events.push('reload'),renderList:()=>events.push('render')});
  const source=kind==='product'?between(read('products.js'),'    window.deleteProduct =', '    if(form)'):between(read('reclamations.js'),'    window.deleteCurrentReclamation =','    // ==========================================');
  vm.runInContext(source,c);await (kind==='product'?window.deleteProduct('p1'):window.deleteCurrentReclamation());assert.deepEqual(events,['Действие отклонено']);
 }
});
test('rejected dealer and sector deletes neither navigate away nor refresh as if successful',async()=>{
 const events=[],window={location:{href:'/dealer.html?id=d1'}};
 const c=vm.createContext({window,CRMAuth:{can:()=>true},deleteBtn:{addEventListener(_event,handler){c.handler=handler;}},currentDealerName:'Дилер',dealerId:'d1',API_DEALERS_URL:'/api/dealers',API_SECTORS_URL:'/api/sectors',confirm:()=>true,fetch:async()=>({ok:false,json:async()=>({error:'Удаление запрещено'})}),alert:message=>events.push(message),fetchSectors:()=>events.push('reload'),renderSectorManagerList:()=>events.push('render')});window.CRMAuth=c.CRMAuth;
 vm.runInContext(between(read('dealer.js'),"    if(deleteBtn) deleteBtn.addEventListener('click'", '    window.printDiv'),c);await c.handler();assert.equal(window.location.href,'/dealer.html?id=d1');assert.deepEqual(events,['Удаление запрещено']);
 const script=read('script.js'),a=script.indexOf('    window.deleteSector ='),b=script.indexOf('\n    };',a)+7;vm.runInContext(script.slice(a,b),c);await window.deleteSector('s1');assert.deepEqual(events,['Удаление запрещено','Удаление запрещено']);
});

test('sales print includes signed deviations using the same calculations as the summary',()=>{
 const source=read('sales.js');
 const c=vm.createContext({monthPicker:{value:'2026-11'},printSalesBody:{innerHTML:''},printOverview:{innerHTML:''},printPeriod:{},printGenerated:{},currentScope:'all',groupsConfig:[],getProgressLevel:()=> 'good',escapeHtml:s=>String(s)});
 vm.runInContext(between(source,'    function fmt(', '    function captureState()'),c);
 vm.runInContext('isCurrentSelectedMonth = () => true;',c);
 vm.runInContext(between(source,'    function renderPrintReport(', '    function renderAll('),c);
 const facts={vip:[]};
 c.renderPrintReport(facts,{total_all:13500},0,0,0,5341.7,30,10);
 let html=c.printSalesBody.innerHTML;
 assert.match(html,/Отклонение/);assert.match(html,/На сегодня/);assert.match(html,/Месяц/);
 assert.match(html,/\+841\.7 м²/);assert.match(html,/\+2525\.1 м²/);assert.match(html,/\+18\.7%/);
 assert.ok(!html.includes('&#xB2;'));assert.ok(html.includes('is-positive'));
 c.renderPrintReport(facts,{total_all:13500},0,0,0,3000,30,10);
 html=c.printSalesBody.innerHTML;assert.match(html,/−1500 м²/);assert.match(html,/−4500 м²/);assert.ok(html.includes('is-negative'));
 vm.runInContext('isCurrentSelectedMonth = () => false;',c);
 c.renderPrintReport(facts,{total_all:13500},0,0,0,15000,30,30);
 html=c.printSalesBody.innerHTML;assert.ok(!html.includes('На сегодня'));assert.match(html,/\+1500 м²/);
 c.renderPrintReport(facts,{},0,0,0,15000,30,30);assert.match(c.printSalesBody.innerHTML,/Нет плана/);
});

test('payout reload honors the recalculation flag and row status save never reloads the list',async()=>{
 const source=read('motivation.js'),calls=[];let recalcs=0;
 const host={innerHTML:''},picker={value:'2026-11'},panel={};
 const c=vm.createContext({document:{getElementById:id=>id==='motivation-payouts-panel'?panel:id==='motivation-payout-month'?picker:id==='motivation-payout-list'?host:null},state:{},payoutPending:new Set(),payoutLoadRevision:0,currentMonth:()=> '2026-11',canManage:()=>true,recalculatePayouts:async()=>{recalcs++;},request:async url=>{calls.push(url);return{rows:[]};},renderPayouts(){},esc:s=>s,API:'/api/motivation'});
 vm.runInContext(between(source,'    async function loadPayouts(', '    function renderPayouts('),c);
 await c.loadPayouts(false);assert.equal(recalcs,0);await c.loadPayouts(true);assert.equal(recalcs,1);assert.equal(calls.length,2);
 const controls=[{disabled:false}],element={dataset:{payoutRow:'one'},querySelectorAll:()=>controls,setAttribute(){},removeAttribute(){},replaceWith(){this.replaced=true;}};let fail=false,notifications=[];
 c.document={getElementById:id=>id==='motivation-payout-list'?{querySelectorAll:()=>[element]}:null,createElement:()=>({innerHTML:'',firstElementChild:{}})};
 c.state.payoutData={rows:[{id:'one',status:'pending',amount:1000,salesM2:10},{id:'two',status:'pending',amount:2000,salesM2:20}]};
 c.request=async(url,options)=>{assert.equal(options.method,'PATCH');assert.equal(url,'/api/motivation/payouts/one');if(fail)throw Error('failed');return{row:{status:'paid',paidAt:'2026-11-13'}};};
 c.n=v=>Number(v)||0;c.money=String;c.sqm=String;c.payoutRowHTML=()=>'<article></article>';c.confirm=()=>true;c.prompt=()=>'';c.toast=(...args)=>notifications.push(args);c.loadPayouts=()=>{throw Error('Unexpected full reload');};
 vm.runInContext(between(source,'    function updatePayoutSummary(', '    function initPayoutPanel('),c);
 const neighbor=c.state.payoutData.rows[1];await c.setPayoutStatus('one','paid');assert.equal(element.replaced,true);assert.equal(c.state.payoutData.rows[1],neighbor);assert.equal(c.state.payoutData.summary.pendingAmount,2000);assert.equal(c.state.payoutData.summary.paidAmount,1000);assert.equal(c.payoutPending.size,0);
 fail=true;element.replaced=false;await c.setPayoutStatus('one','pending');assert.equal(c.state.payoutData.rows[0].status,'paid');assert.equal(element.replaced,false);assert.equal(controls[0].disabled,false);assert.equal(notifications.at(-1)[1],'error');
});
