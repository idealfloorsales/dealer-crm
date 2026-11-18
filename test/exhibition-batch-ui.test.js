'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const report=fs.readFileSync(path.join(__dirname,'../public/report.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../public/report.html'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'../public/report.css'),'utf8');

const dealerA='507f191e810c19729de860ea';
const dealerB='507f191e810c19729de860eb';
const productA='507f1f77bcf86cd799439011';
const productB='507f1f77bcf86cd799439012';

function setup({failure=false}={}){
 const first=report.indexOf('    const presenceKey=');
 const last=report.indexOf('    function cellState(cell)',first);
 assert.ok(first>0&&last>first);
 const nodes=()=>({
  hidden:false,disabled:false,innerHTML:'',textContent:'',
  classList:{toggle(){},add(){},remove(){}},
  setAttribute(){}
 });
 const [editModeButton,editHint,batchBar,batchCount,batchDetails,batchSave,batchUndo,batchDiscard]=
  Array.from({length:8},nodes);
 const fullData={
  headers:[{id:dealerA,name:'Первый'},{id:dealerB,name:'Второй'}],
  matrix:[
   {id:productA,sku:'8EH34-711',name:'Дуб Миндаль',type:'product',dealers:[
    {value:0,sample_qty:2,condition:'damaged',replacementQty:1,priceTag:'replace',priceTagQty:2,note:'Скол'},
    {value:1,sample_qty:1,priceTag:'ok',note:'Ценник новый'}]},
   {id:productB,sku:'8EH34-712',name:'Дуб Эмбер',type:'product',dealers:[
    {value:0,sample_qty:0},{value:0,sample_qty:0}]}
  ]
 };
 const calls=[],toasts=[];
 const fetch=async(url,options)=>{
  assert.equal(url,'/api/exhibition/presence/batch');
  assert.equal(options.method,'PUT');
  const data=JSON.parse(options.body);
  calls.push(data);
  return {ok:!failure,json:async()=>failure?{error:'Дилер изменён другим сотрудником'}:
   {status:'ok',changes:data.changes.map(({dealerId,productId,present})=>({dealerId,productId,present}))}};
 };
 let renders=0;
 const factory=new Function('fullData','idOf','n','canEditMatrix','window',
  'fetch','renderMatrix','editModeButton','editHint','batchBar','batchCount',
  'batchDetails','batchSave','batchUndo','batchDiscard','document',
  'let batchEditMode=false;let batchSaving=false;'+
  'const stagedPresence=new Map();const editHistory=[];\n'+
  report.slice(first,last)+
  '\nreturn {toggleBatchEditMode,toggleStagedPresence,undoStagedPresence,'+
  'discardStagedPresence,saveStagedPresence,previewCell,stagedPresence,updateBatchControls,'+
  'get mode(){return batchEditMode}};');
 const editor=factory(fullData,x=>String(x?.id||x||''),x=>Number(x)||0,
  ()=>true,{showToast:(message)=>toasts.push(message)},fetch,()=>renders++,
  editModeButton,editHint,batchBar,batchCount,batchDetails,batchSave,batchUndo,batchDiscard,
  {body:{classList:{toggle(){}}}});
 return {editor,fullData,calls,toasts,batchBar,batchCount,get renders(){return renders}};
}

test('editor requires explicit mode; clicking a cell only stages the change',()=>{
 const s=setup();
 s.editor.toggleStagedPresence(dealerA,productA);
 assert.equal(s.editor.stagedPresence.size,0);
 s.editor.toggleBatchEditMode();
 assert.equal(s.editor.mode,true);
 s.editor.toggleStagedPresence(dealerA,productA);
 assert.equal(s.calls.length,0,'a click must never write to the server');
 assert.equal(s.fullData.matrix[0].dealers[0].value,0,'original remains unchanged');
 assert.equal(s.editor.previewCell(s.fullData.matrix[0],0).value,1);
 s.editor.updateBatchControls();
 assert.equal(s.batchBar.hidden,false);
 assert.match(s.batchCount.textContent,/1 изменение/);
});

test('undo and reset remove staged edits without any confirmation modal',()=>{
 const s=setup();
 s.editor.toggleBatchEditMode();
 s.editor.toggleStagedPresence(dealerA,productA);
 s.editor.toggleStagedPresence(dealerB,productA);
 assert.equal(s.editor.stagedPresence.size,2);
 s.editor.undoStagedPresence();
 assert.equal(s.editor.stagedPresence.size,1);
 s.editor.discardStagedPresence();
 assert.equal(s.editor.stagedPresence.size,0);
 assert.equal(s.calls.length,0);
});

test('one Save submits all changes, preserves defect and tag data',async()=>{
 const s=setup();
 s.editor.toggleBatchEditMode();
 s.editor.toggleStagedPresence(dealerA,productA);
 s.editor.toggleStagedPresence(dealerB,productA);
 s.editor.toggleStagedPresence(dealerB,productB);
 await s.editor.saveStagedPresence();
 assert.equal(s.calls.length,1);
 assert.equal(s.calls[0].changes.length,3);
 assert.equal(s.calls[0].changes[0].expectedPresent,false);
 assert.equal(s.calls[0].changes[1].expectedPresent,true);
 assert.equal(s.fullData.matrix[0].dealers[0].value,1);
 assert.equal(s.fullData.matrix[0].dealers[1].value,0);
 assert.equal(s.fullData.matrix[0].dealers[0].condition,'damaged');
 assert.equal(s.fullData.matrix[0].dealers[0].priceTag,'replace');
 assert.equal(s.fullData.matrix[0].dealers[0].priceTagQty,2);
 assert.equal(s.fullData.matrix[0].dealers[0].note,'Скол');
 assert.equal(s.editor.stagedPresence.size,0);
 assert.equal(s.editor.mode,false);
});

test('failed Save keeps the staged selection and original data intact',async()=>{
 const s=setup({failure:true});
 s.editor.toggleBatchEditMode();
 s.editor.toggleStagedPresence(dealerA,productA);
 await s.editor.saveStagedPresence();
 assert.equal(s.editor.stagedPresence.size,1);
 assert.equal(s.fullData.matrix[0].dealers[0].value,0);
 assert.ok(s.toasts.some(x=>x.includes('другим сотрудником')));
});

test('a second click on the same cell removes the pending change',()=>{
 const s=setup();
 s.editor.toggleBatchEditMode();
 s.editor.toggleStagedPresence(dealerA,productA);
 s.editor.toggleStagedPresence(dealerA,productA);
 assert.equal(s.editor.stagedPresence.size,0);
 assert.equal(s.fullData.matrix[0].dealers[0].value,0);
});

test('matrix and field modes expose explicit controls with safe preview styles',()=>{
 for(const id of ['exhibition-edit-mode','exhibition-batch-bar','exhibition-batch-save',
  'exhibition-batch-undo','exhibition-batch-discard','exhibition-edit-hint']){
  assert.equal(html.split('id="'+id+'"').length-1,1,id);
 }
 assert.match(report,/data-exhibition-presence/);
 assert.match(report,/class="exhibition-field-quick-toggle"/);
 assert.match(report,/window.addEventListener\('beforeunload'/);
 assert.match(css,/matrix-state-cell\.is-staged/);
 assert.match(css,/exhibition-field-product\.is-staged/);
 assert.match(css,/exhibition-batch-bar\[hidden\]/);
 assert.match(css,/:root\[data-crm-theme="dark"\] \.exhibition-batch-bar/);
});
