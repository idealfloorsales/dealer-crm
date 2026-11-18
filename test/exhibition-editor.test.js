'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const report=fs.readFileSync(path.join(__dirname,'../public/report.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../public/report.html'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'../public/report.css'),'utf8');
const dealerId='507f191e810c19729de860ea', productId='507f1f77bcf86cd799439011';

function setup(){
 const start=report.indexOf('    function openInspectionEditor(');
 const end=report.indexOf('    function resetFilters()',start);
 assert.ok(start>0&&end>start);
 const nodes=new Map();
 function $(id){
  if(!nodes.has(id))nodes.set(id,{
    value:'',textContent:'',innerHTML:'',hidden:false,checked:false,disabled:false,
    querySelector:()=>({textContent:''})
  });
  return nodes.get(id);
 }
 const product={id:productId,sku:'8EH34-711',name:'Дуб Миндаль',type:'product',
  dealers:[{value:1,sample_qty:2,condition:'damaged',priceTag:'replace',
   priceTagQty:2,replacementQty:1,note:'Скол'}]};
 const pos={type:'pos',name:'С600 - 600мм задняя стенка',sku:'POS',
  dealers:[{value:3,condition:'damaged',replacementQty:1,priceTag:'unknown'}]};
 const fullData={headers:[{id:dealerId,name:'Тестовый дилер',city:'Астана'}],matrix:[product,pos]};
 let requests=[],visible=0,closed=0,rendered=0,responseOK=true;
 const inspectionModal={show(){visible++},hide(){closed++}};
 const fetch=async(url,options)=>{
  const body=JSON.parse(options.body);requests.push({url,body});
  return {ok:responseOK,json:async()=>responseOK?{
   status:'ok',present:body.present??null,
   inspection:{...body,checkedAt:new Date().toISOString(),checkedBy:'Тест'}
  }:{error:'Сохранение отклонено'}};
 };
 const factory=new Function('fullData','
  'let inspectionContext=null;\n'+report.slice(start,end)+
  '\nreturn {openInspectionEditor,saveInspection};');
 const obj=factory(fullData,$,inspectionModal,$('exhibition-inspection-save'),
  $('exhibition-inspection-feedback'),String,String,
  v=>Number(v)||0,v=>String(v?.id||v),()=>true,fetch,()=>rendered++,
  {showToast(){}},
  cell=>['damaged','missing'].includes(cell?.condition),
  cell=>['replace','missing'].includes(cell?.priceTag),new Map());
 return {obj,$,fullData,product,pos,requests,
  get counts(){return {visible,closed,rendered}},
  fail(){responseOK=false}
 };
}
test('exhibition screen has inline sample and equipment editor and accessible tags',()=>{
 for(const id of ['exhibition-inspection-modal','exhibition-inspection-condition',
  'exhibition-inspection-tag','exhibition-inspection-tag-qty',
  'exhibition-inspection-present','exhibition-inspection-complete-sample',
  'exhibition-inspection-complete-tag','excel-sheet-inspection']){
   assert.equal(html.split('id="'+id+'"').length-1,1,id);
 }
 assert.match(report,/data-exhibition-edit/);
 assert.match(report,/data-field-status/);
 assert.match(report,/addInspectionSheet/);
 assert.match(css,/has-inspection-issue/);
});
test('changing an existing sample preserves workshop stock and tracks price tags',async()=>{
 const s=setup();
 s.obj.openInspectionEditor({dealerId,kind:'laminate',key:productId});
 assert.equal(s.$('exhibition-inspection-present').checked,true);
 assert.equal(s.$('exhibition-inspection-condition').value,'damaged');
 assert.equal(s.$('exhibition-inspection-tag').value,'replace');
 s.$('exhibition-inspection-condition').value='ok';
 s.$('exhibition-inspection-replace-qty').value='0';
 s.$('exhibition-inspection-tag').value='ok';
 await s.obj.saveInspection({preventDefault(){}});
 assert.equal(s.requests.length,1);
 assert.equal(s.requests[0].body.present,true);
 assert.equal(s.product.dealers[0].sample_qty,2);
 assert.equal(s.product.dealers[0].priceTag,'ok');
 assert.equal(s.counts.closed,1);
 assert.equal(s.counts.rendered,1);
});
test('equipment defect status does not overwrite workshop POS quantity',async()=>{
 const s=setup();
 s.obj.openInspectionEditor({dealerId,kind:'pos',key:s.pos.name});
 assert.equal(s.$('exhibition-inspection-tags').hidden,true);
 assert.equal(s.$('exhibition-inspection-presence-row').hidden,true);
 s.$('exhibition-inspection-condition').value='missing';
 s.$('exhibition-inspection-replace-qty').value='2';
 await s.obj.saveInspection({preventDefault(){}});
 assert.equal(s.requests[0].body.present,undefined);
 assert.equal(s.requests[0].body.priceTag,'unknown');
 assert.equal(s.pos.dealers[0].value,3);
});
test('failed save shows message and keeps inspection editor open',async()=>{
 const s=setup();s.fail();
 s.obj.openInspectionEditor({dealerId,kind:'laminate',key:productId});
 await s.obj.saveInspection({preventDefault(){}});
 assert.equal(s.counts.visible,1);
 assert.equal(s.counts.closed,0);
 assert.equal(s.$('exhibition-inspection-feedback').hidden,false);
 assert.equal(s.$('exhibition-inspection-save').disabled,false);
});
test('invalid replacement quantities do not send network writes',async()=>{
 const s=setup();
 s.obj.openInspectionEditor({dealerId,kind:'laminate',key:productId});
 s.$('exhibition-inspection-replace-qty').value='-1';
 await s.obj.saveInspection({preventDefault(){}});
 assert.equal(s.requests.length,0);
 assert.equal(s.$('exhibition-inspection-feedback').hidden,false);
});
,'inspectionModal','inspectionSave',
  'inspectionFeedback','safeText','fmt','n','idOf','canEditMatrix',
  'fetch','renderMatrix','window','needsSampleReplace','needsTagAttention','stagedPresence',
  'let inspectionContext=null;\n'+report.slice(start,end)+
  '\nreturn {openInspectionEditor,saveInspection};');
 const obj=factory(fullData,$,inspectionModal,$('exhibition-inspection-save'),
  $('exhibition-inspection-feedback'),String,String,
  v=>Number(v)||0,v=>String(v?.id||v),()=>true,fetch,()=>rendered++,
  {showToast(){}},
  cell=>['damaged','missing'].includes(cell?.condition),
  cell=>['replace','missing'].includes(cell?.priceTag));
 return {obj,$,fullData,product,pos,requests,
  get counts(){return {visible,closed,rendered}},
  fail(){responseOK=false}
 };
}
test('exhibition screen has inline sample and equipment editor and accessible tags',()=>{
 for(const id of ['exhibition-inspection-modal','exhibition-inspection-condition',
  'exhibition-inspection-tag','exhibition-inspection-tag-qty',
  'exhibition-inspection-present','exhibition-inspection-complete-sample',
  'exhibition-inspection-complete-tag','excel-sheet-inspection']){
   assert.equal(html.split('id="'+id+'"').length-1,1,id);
 }
 assert.match(report,/data-exhibition-edit/);
 assert.match(report,/data-field-status/);
 assert.match(report,/addInspectionSheet/);
 assert.match(css,/has-inspection-issue/);
});
test('changing an existing sample preserves workshop stock and tracks price tags',async()=>{
 const s=setup();
 s.obj.openInspectionEditor({dealerId,kind:'laminate',key:productId});
 assert.equal(s.$('exhibition-inspection-present').checked,true);
 assert.equal(s.$('exhibition-inspection-condition').value,'damaged');
 assert.equal(s.$('exhibition-inspection-tag').value,'replace');
 s.$('exhibition-inspection-condition').value='ok';
 s.$('exhibition-inspection-replace-qty').value='0';
 s.$('exhibition-inspection-tag').value='ok';
 await s.obj.saveInspection({preventDefault(){}});
 assert.equal(s.requests.length,1);
 assert.equal(s.requests[0].body.present,true);
 assert.equal(s.product.dealers[0].sample_qty,2);
 assert.equal(s.product.dealers[0].priceTag,'ok');
 assert.equal(s.counts.closed,1);
 assert.equal(s.counts.rendered,1);
});
test('equipment defect status does not overwrite workshop POS quantity',async()=>{
 const s=setup();
 s.obj.openInspectionEditor({dealerId,kind:'pos',key:s.pos.name});
 assert.equal(s.$('exhibition-inspection-tags').hidden,true);
 assert.equal(s.$('exhibition-inspection-presence-row').hidden,true);
 s.$('exhibition-inspection-condition').value='missing';
 s.$('exhibition-inspection-replace-qty').value='2';
 await s.obj.saveInspection({preventDefault(){}});
 assert.equal(s.requests[0].body.present,undefined);
 assert.equal(s.requests[0].body.priceTag,'unknown');
 assert.equal(s.pos.dealers[0].value,3);
});
test('failed save shows message and keeps inspection editor open',async()=>{
 const s=setup();s.fail();
 s.obj.openInspectionEditor({dealerId,kind:'laminate',key:productId});
 await s.obj.saveInspection({preventDefault(){}});
 assert.equal(s.counts.visible,1);
 assert.equal(s.counts.closed,0);
 assert.equal(s.$('exhibition-inspection-feedback').hidden,false);
 assert.equal(s.$('exhibition-inspection-save').disabled,false);
});
test('invalid replacement quantities do not send network writes',async()=>{
 const s=setup();
 s.obj.openInspectionEditor({dealerId,kind:'laminate',key:productId});
 s.$('exhibition-inspection-replace-qty').value='-1';
 await s.obj.saveInspection({preventDefault(){}});
 assert.equal(s.requests.length,0);
 assert.equal(s.$('exhibition-inspection-feedback').hidden,false);
});
