(async()=>{
 if(window.CRMAuth?.ready)await CRMAuth.ready;if(!window.CRMAuth?.user||!CRMAuth.can('can_view_knowledge'))return;
 try{const r=await fetch('/assistant-guide.json');if(!r.ok)return;const data=await r.json(),tabs=document.querySelector('.training-tabs'),shell=document.querySelector('.training-shell');if(!tabs||!shell)return;
 const tab=document.createElement('button');tab.type='button';tab.className='training-tab';tab.dataset.trainingView='assistant-guide';tab.textContent='Рабочие чек-листы';tabs.appendChild(tab);
 const panel=document.createElement('section');panel.className='training-view';panel.dataset.trainingPanel='assistant-guide';
 for(const topic of data.topics){const card=document.createElement('article');card.className='installation-collection';card.id='assistant-guide-'+topic.id;const title=document.createElement('h3');title.textContent=topic.title;const text=document.createElement('p');text.textContent=topic.text;const source=document.createElement('small');source.textContent=data.source+' · '+data.version;card.append(title,text,source);panel.appendChild(card);}shell.appendChild(panel);
 const catalogCollection=new URLSearchParams(location.search).get('catalogCollection');const catalog=document.getElementById('catalog-collection');if(catalogCollection&&[...catalog.options].some(o=>o.value===catalogCollection)){document.querySelector('[data-training-view=\"catalog\"]').click();catalog.value=catalogCollection;catalog.dispatchEvent(new Event('change',{bubbles:true}));}
 const selected=new URLSearchParams(location.search).get('assistantGuide');if(data.topics.some(t=>t.id===selected)){tab.click();document.getElementById('assistant-guide-'+selected).scrollIntoView({block:'start'});}
 }catch(_){/* Existing training remains available if the optional guide cannot load. */}
})();
