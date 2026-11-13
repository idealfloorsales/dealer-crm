'use strict';
const fs=require('node:fs');
const path=require('node:path');
// The same versioned teaching material used by the training page; no database content.
function loadKnowledge(){
 const raw=fs.readFileSync(path.join(__dirname,'../public/training-data.js'),'utf8').trim();
 const prefix='window.IDEAL_TRAINING=';
 if(!raw.startsWith(prefix))throw Error('Invalid training data');
 const data=JSON.parse(raw.slice(prefix.length).replace(/;\s*$/,''));
 const common={id:'preparation',title:'Общая подготовка к укладке',url:'/knowledge.html?trainingCollection=all',text:data.common.map(x=>x.title+': '+x.text).join('\n')};
 const collections=data.collections.map(c=>{
  let specs=c.specs||[],warning='';
  const dimensions=c.format.match(/(\d+)×(\d+)×/),pack=specs.find(s=>s[0]==='Упаковка'),boards=specs.find(s=>s[0]==='Планок');
  if(dimensions&&pack&&boards){
   const area=Number(dimensions[1])*Number(dimensions[2])/1e6*parseFloat(boards[1]);
   const declared=parseFloat(pack[1].replace(',','.'));
   if(declared>0&&Math.abs(area-declared)/declared>.03){specs=specs.filter(s=>!['Упаковка','Планок'].includes(s[0]));warning='В учебном документе площадь упаковки и количество планок не согласуются с геометрией. Эти значения требуют сверки по упаковке; не называй их подтверждёнными.';}
  }
  return{id:c.id,title:c.collection+' · '+c.format,url:'/knowledge.html?trainingCollection='+encodeURIComponent(c.collection),text:c.collection+' '+c.format+'\n'+specs.map(s=>s.join(': ')).join('\n')+'\n'+c.description.slice(0,900)+'\n'+c.note+'\n'+warning+'\n'+(c.schemes||[]).map(s=>'Схема: '+s.caption).join('\n')};
 });
 const guide=JSON.parse(fs.readFileSync(path.join(__dirname,'../public/assistant-guide.json'),'utf8'));
 const topics=guide.topics.map(t=>({id:'guide-'+t.id,title:t.title,url:'/knowledge.html?assistantGuide='+encodeURIComponent(t.id),text:t.text+'\nИсточник: '+guide.source,version:guide.version}));
 const rawCatalog=fs.readFileSync(path.join(__dirname,'../public/nomenclature-data.js'),'utf8').trim();
 const catalog=JSON.parse(rawCatalog.slice('window.IDEAL_NOMENCLATURE='.length).replace(/;\s*$/,''));
 const catalogDocs=catalog.collections.map((name,i)=>{
  const products=catalog.products.filter(p=>p.c===name);
  const text=products.map(p=>{const dimensions=String(p.d).match(/(\d+)×(\d+)×/),count=parseFloat(p.q),area=parseFloat(String(p.p).replace(',','.'));const mismatch=dimensions&&count&&area&&Math.abs(Number(dimensions[1])*Number(dimensions[2])/1e6*count-area)/area>.03;
   return p.s+' '+p.n+' · '+p.d+' мм · класс '+p.k+' · фаска '+p.b+' · текстура '+p.t+(mismatch?' · данные упаковки требуют сверки':' · упаковка '+p.p+'; '+p.q);}).join('\n');
  return{id:'catalog-'+i,title:name+' · декоры и номенклатура',url:'/knowledge.html?catalogCollection='+encodeURIComponent(name),version:catalog.version,text:'Источник: номенклатура IDEAL FLOOR версии '+catalog.version+'.\n'+text+'\nУсловия монтажа и гарантия в номенклатуре не определены. Не переносить их с других коллекций.'};
 });
 return{version:data.version,source:data.source,documents:[common,...collections,...topics,...catalogDocs]};
}
const normalize=s=>String(s).toLowerCase().replace(/ё/g,'е');
function retrieve(message,history=[]){
 const data=loadKnowledge(),query=normalize(message+' '+history.filter(m=>m.role==='user').slice(-2).map(m=>m.content).join(' '));
 const words=[...new Set(query.match(/[\p{L}\p{N}]{3,}/gu)||[])].filter(w=>!['как','для','что','это','или','при','мне','про','какие'].includes(w));
 for(const [pattern,term] of [[/английск/, 'herringbone'],[/француз/, 'french'],[/королев/, 'royal']])if(pattern.test(query))words.push(term);
 const ranked=data.documents.map(d=>({d,score:words.reduce((n,w)=>n+(normalize(d.title).includes(w)?6:normalize(d.text).includes(w)?1:0),0)})).sort((a,b)=>b.score-a.score);
 let selected=ranked.filter(r=>r.score>0).slice(0,4).map(r=>r.d);
 if(!selected.length)selected=[data.documents[0]];
 const context='Учебный материал IDEAL FLOOR. Версия '+data.version+'. Источник: '+data.source+'.\n'+selected.map((d,i)=>'['+(i+1)+'] '+d.title+'\n'+d.text).join('\n\n')+'\nДоступные материалы: '+data.documents.slice(1).map(d=>d.title).join('; ');
 return{context,sources:selected.map((d,i)=>({number:i+1,title:d.title,url:d.url,version:d.version||data.version}))};
}
module.exports={retrieve,loadKnowledge};
