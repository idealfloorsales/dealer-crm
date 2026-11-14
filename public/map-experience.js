/* IDEAL FLOOR CRM · map address search and interactive point editor.
   Network address searches happen ONLY on an explicit button press / Enter,
   never automatically while typing. */
(function(root){
  'use strict';
  function install(opts){
    const {map,getDealers,refresh,focus,hasPoint,canEdit,escapeHtml,toast,closeMobileList,setUnmappedOnly}=opts;
    const el=id=>document.getElementById(id);
    const mainSearch=el('map-search'),suggestions=el('map-search-suggestions');
    const findButton=el('map-find-address'),panel=el('map-pin-editor');
    const pinName=el('map-pin-dealer-name'),pinQuery=el('map-pin-query');
    const pinFind=el('map-pin-find'),pinResults=el('map-pin-results');
    const pinStatus=el('map-pin-status'),pinSave=el('map-pin-save');
    let searchVersion=0,editVersion=0,editDealerId=null,draft=null,marker=null;
    let lastSuggested=[];
    let foundAddressMarker=null;

    async function findAddresses(q,city=''){
      const query=String(q||'').trim();
      if(query.length<3)throw Error('Введите улицу, номер дома или населённый пункт.');
      const params=new URLSearchParams({q:query});
      if(city)params.set('city',city);
      const response=await fetch('/api/map/geocode?'+params.toString());
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw Error(data.error||'Адресный поиск временно недоступен');
      return Array.isArray(data.results)?data.results:[];
    }
    async function lookupAddress(){
      if(!mainSearch||!suggestions)return;
      const q=mainSearch.value.trim();
      if(q.length<3){toast('Введите адрес перед поиском','info');mainSearch.focus();return;}
      const version=++searchVersion;
      if(findButton)findButton.disabled=true;
      suggestions.classList.add('show');
      suggestions.innerHTML='<div class="map-suggestion-label">Ищем адрес по Казахстану…</div>';
      try {
        const results=await findAddresses(q,el('map-filter-city')?.value||'');
        if(version!==searchVersion)return;
        lastSuggested=results;
        suggestions.innerHTML=results.length
          ? '<div class="map-suggestion-label">Адреса OpenStreetMap · выберите подходящий</div>'+
            results.map((x,i)=>'<button type="button" data-address-index="'+i+'"><i class="bi bi-geo-alt"></i><span>'+escapeHtml(x.name)+'</span></button>').join('')
          : '<div class="map-suggestion-label">Адрес не найден. Укажите город и номер дома либо поставьте точку вручную.</div>';
      }catch(error){
        if(version!==searchVersion)return;
        suggestions.innerHTML='<div class="map-suggestion-label">'+escapeHtml(error.message)+'</div>';
      }finally{if(version===searchVersion && findButton)findButton.disabled=false;}
    }
    function suggestionsFor(dealers,query){
      ++searchVersion;
      if(findButton)findButton.disabled=false;
      if(!suggestions||!query){suggestions?.classList.remove('show');return;}
      const items=dealers.slice(0,7);
      if(!items.length){suggestions.classList.remove('show');return;}
      suggestions.innerHTML='<div class="map-suggestion-label">Дилеры CRM · '+dealers.length+' совпадений</div>'+
        items.map(d=>'<button type="button" data-map-dealer="'+escapeHtml(d.id)+'"><i class="bi '+(hasPoint(d)?'bi-shop':'bi-geo')+'"></i><span>'+
        escapeHtml(d.name||'Без названия')+' · '+escapeHtml(d.city||'')+(hasPoint(d)?'':' · Без точки')+'</span></button>').join('');
      suggestions.classList.add('show');
    }
    suggestions?.addEventListener('click',e=>{
      const dealer=e.target.closest('[data-map-dealer]');
      if(dealer){suggestions.classList.remove('show');focus(dealer.dataset.mapDealer);return;}
      const address=e.target.closest('[data-address-index]');
      if(!address)return;
      const d=lastSuggested[Number(address.dataset.addressIndex)];
      if(!d)return;
      const pos=[Number(d.lat),Number(d.lon)];
      map.flyTo(pos,16,{duration:.5});
      if(foundAddressMarker)map.removeLayer(foundAddressMarker);
      foundAddressMarker=L.marker(pos).addTo(map).bindPopup('<strong>Найденный адрес</strong><br>'+escapeHtml(d.name)).openPopup();
      suggestions.classList.remove('show');
      closeMobileList();
    });
    findButton?.addEventListener('click',lookupAddress);

    function selectDraft(lat,lon){
      const a=Number(lat),b=Number(lon);
      if(!Number.isFinite(a)||!Number.isFinite(b)||a<40||a>56.5||b<45||b>88.5){
        toast('Выберите точку в пределах Казахстана','warning');return;
      }
      draft={latitude:a,longitude:b};
      if(!marker){
        marker=L.marker([a,b],{draggable:true}).addTo(map);
        marker.on('dragend',event=>{const p=event.target.getLatLng();selectDraft(p.lat,p.lng);});
      } else marker.setLatLng([a,b]);
      if(pinSave)pinSave.disabled=false;
      if(pinStatus)pinStatus.innerHTML='<i class="bi bi-check-circle-fill"></i> Точка выбрана';
      map.flyTo([a,b],Math.max(15,map.getZoom()),{duration:.35});
    }
    function closeEditor(){
      editDealerId=null;draft=null;++editVersion;
      if(marker){map.removeLayer(marker);marker=null;}
      if(panel)panel.hidden=true;
      if(pinResults){pinResults.hidden=true;pinResults.innerHTML='';}
    }
    function openEditor(id){
      if(!canEdit()){toast('Нет права изменять местоположение дилера','error');return;}
      const dealer=getDealers().find(d=>String(d.id)===String(id));
      if(!dealer)return;
      closeEditor();editDealerId=String(dealer.id);
      if(panel)panel.hidden=false;
      if(pinName)pinName.textContent=dealer.name||'Дилер';
      if(pinQuery)pinQuery.value=dealer.address||'';
      if(pinSave)pinSave.disabled=true;
      if(pinStatus)pinStatus.innerHTML='<i class="bi bi-cursor"></i> Выберите точку';
      if(hasPoint(dealer))selectDraft(dealer.latitude,dealer.longitude);
      closeMobileList();
    }
    map.on('click',e=>{if(editDealerId)selectDraft(e.latlng.lat,e.latlng.lng);});
    el('map-pin-cancel')?.addEventListener('click',closeEditor);
    pinQuery?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();pinFind?.click();}});
    pinFind?.addEventListener('click',async()=>{
      if(!editDealerId)return;
      const dealer=getDealers().find(d=>String(d.id)===editDealerId);
      const version=++editVersion;
      pinFind.disabled=true;
      if(pinResults){pinResults.hidden=false;pinResults.innerHTML='<div class="map-pin-search-note">Ищем адрес…</div>';}
      try{
        const results=await findAddresses(pinQuery?.value||'',dealer?.city||'');
        if(version!==editVersion)return;
        if(pinResults){
          pinResults.dataset.candidates=JSON.stringify(results);
          pinResults.innerHTML=results.length
            ? results.map((p,i)=>'<button type="button" data-pin-option="'+i+'"><i class="bi bi-geo-alt"></i><span>'+escapeHtml(p.name)+'</span></button>').join('')
            : '<div class="map-pin-search-note">Не найдено. Поставьте точку вручную на карте.</div>';
        }
      }catch(error){
        if(version===editVersion && pinResults)pinResults.innerHTML='<div class="map-pin-search-note">'+escapeHtml(error.message)+'</div>';
      }finally{if(version===editVersion)pinFind.disabled=false;}
    });
    pinResults?.addEventListener('click',e=>{
      const target=e.target.closest('[data-pin-option]');
      if(!target)return;
      let results=[];try{results=JSON.parse(pinResults.dataset.candidates||'[]');}catch(_){}
      const p=results[Number(target.dataset.pinOption)];
      if(p){selectDraft(p.lat,p.lon);pinResults.hidden=true;}
    });
    pinSave?.addEventListener('click',async()=>{
      if(!editDealerId||!draft||!canEdit())return;
      const id=editDealerId;
      pinSave.disabled=true;
      const original=pinSave.innerHTML;
      pinSave.innerHTML='<span class="spinner-border spinner-border-sm"></span> Сохраняем';
      try{
        const response=await fetch('/api/dealers/'+encodeURIComponent(id)+'/location',{
          method:'PATCH',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({...draft,confirmed:true})
        });
        const data=await response.json().catch(()=>({}));
        if(!response.ok)throw Error(data.error||'Не удалось сохранить метку');
        const dealer=getDealers().find(d=>String(d.id)===id);
        if(dealer){dealer.latitude=data.latitude;dealer.longitude=data.longitude;dealer.geoUpdatedAt=data.geoUpdatedAt;}
        closeEditor();
        setUnmappedOnly(false);
        refresh();
        focus(id);
        toast('Местоположение дилера сохранено','success');
      }catch(error){pinSave.disabled=false;toast(error.message||'Ошибка сохранения','error');}
      finally{pinSave.innerHTML=original;}
    });
    return {lookupAddress,suggestionsFor,openEditor,closeEditor,cancelSearch:()=>{
      ++searchVersion;
      if(findButton)findButton.disabled=false;
      suggestions?.classList.remove('show');
      if(foundAddressMarker){map.removeLayer(foundAddressMarker);foundAddressMarker=null;}
    }};
  }
  root.CRMMapExperience={install};
})(window);
