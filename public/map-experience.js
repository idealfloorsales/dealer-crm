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
    const sourceAddress=el('map-pin-source-address');
    const sourceExtras=el('map-pin-source-extras');
    const editQueryButton=el('map-pin-edit-query');
    const editorSearch=el('map-pin-editor-search');
    const addressTools=window.CRMAddressSearch;
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
      if(panel){panel.hidden=true;panel.setAttribute('aria-hidden','true');}
      if(pinResults){pinResults.hidden=true;pinResults.innerHTML='';}
      if(editorSearch)editorSearch.hidden=true;
      if(editQueryButton)editQueryButton.setAttribute('aria-expanded','false');
    }
    function placeError(text){
      if(pinResults){pinResults.hidden=false;pinResults.innerHTML='<div class="map-pin-search-note">'+escapeHtml(text)+'</div>';}
    }
    async function runPinSearch({automatic=false}={}){
      if(!editDealerId)return;
      const dealer=getDealers().find(d=>String(d.id)===editDealerId);
      if(!dealer)return;
      const prepared=addressTools?.prepare(dealer.address||'',dealer.city||'')
        || {address:String(dealer.address||'').trim(),city:String(dealer.city||'').trim(),details:''};
      const query=automatic?prepared.address:String(pinQuery?.value||'').trim();
      if(query.length<3){
        placeError('В карточке нет адреса здания. Укажите адрес дилера или нажмите на нужное место на карте.');
        return;
      }
      const version=++editVersion;
      if(pinFind)pinFind.disabled=true;
      if(pinResults){pinResults.hidden=false;pinResults.innerHTML='<div class="map-pin-search-note"><span class="spinner-border spinner-border-sm"></span> Ищем здание по адресу из карточки…</div>';}
      if(pinStatus)pinStatus.innerHTML='<i class="bi bi-search"></i> Поиск здания';
      try{
        const results=await findAddresses(query,prepared.city);
        if(version!==editVersion||String(dealer.id)!==editDealerId)return;
        if(pinResults){
          pinResults.dataset.candidates=JSON.stringify(results);
          if(!results.length){
            placeError('По этому адресу здание не найдено. Уточните запрос или укажите точку вручную.');
          }else{
            const known=results.filter(p=>p.precision==='house');
            const intro=known.length
              ? '<div class="map-pin-search-note">Нашли '+known.length+' вариант(а) с совпадающим номером дома. Выберите и проверьте на карте.</div>'
              : '<div class="map-pin-search-note">Варианты требуют проверки: карта не подтвердила точный номер дома.</div>';
            pinResults.innerHTML=intro+results.map((p,i)=>
              '<button type="button" data-pin-option="'+i+'"><i class="bi bi-geo-alt"></i><span>'+escapeHtml(p.name)+
              '<small class="map-pin-accuracy '+(p.precision==='house'?'is-house':'')+'">'+
              (p.precision==='house'?'Номер дома совпадает':'Уточните здание на карте')+'</small></span></button>'
            ).join('');
            if(results.length===1&&results[0].precision==='house'){
              // Preview a unique house-level result; employee still confirms Save.
              selectDraft(results[0].lat,results[0].lon);
              if(pinStatus)pinStatus.innerHTML='<i class="bi bi-check-circle"></i> Проверьте точку и сохраните';
            }else if(pinStatus)pinStatus.innerHTML='<i class="bi bi-list-check"></i> Выберите результат';
          }
        }
      }catch(error){
        if(version===editVersion){
          placeError(error.message||'Сервис поиска временно недоступен. Можно выбрать точку вручную.');
          if(pinStatus)pinStatus.innerHTML='<i class="bi bi-exclamation-circle"></i> Найдите точку на карте';
        }
      }finally{
        if(version===editVersion&&pinFind)pinFind.disabled=false;
      }
    }
    function openEditor(id){
      if(!canEdit()){toast('Нет права изменять местоположение дилера','error');return false;}
      const dealer=getDealers().find(d=>String(d.id)===String(id));
      if(!dealer){toast('Дилер не найден в текущем списке','warning');return false;}
      if(!panel){toast('Панель установки метки недоступна. Обновите карту.','error');return false;}
      closeEditor();
      editDealerId=String(dealer.id);
      panel.hidden=false;
      panel.setAttribute('aria-hidden','false');
      const prepared=addressTools?.prepare(dealer.address||'',dealer.city||'')
        || {address:String(dealer.address||'').trim(),city:String(dealer.city||'').trim(),details:''};
      if(pinName)pinName.textContent=dealer.name||'Дилер';
      if(sourceAddress)sourceAddress.textContent=[prepared.city,prepared.original].filter(Boolean).join(' · ')||'Адрес не указан';
      if(sourceExtras){
        sourceExtras.textContent=prepared.details?'Не используем в поиске здания: '+prepared.details:'';
        sourceExtras.hidden=!prepared.details;
      }
      if(pinQuery)pinQuery.value=prepared.address;
      if(editorSearch)editorSearch.hidden=true;
      if(editQueryButton)editQueryButton.setAttribute('aria-expanded','false');
      if(pinSave)pinSave.disabled=true;
      if(pinStatus)pinStatus.innerHTML='<i class="bi bi-cursor"></i> Поиск по адресу';
      if(hasPoint(dealer))selectDraft(dealer.latitude,dealer.longitude);
      closeMobileList();
      if(typeof requestAnimationFrame==='function')requestAnimationFrame(()=>map.invalidateSize?.());
      // Only after an employee explicitly opens an unmarked dealer:
      // no bulk lookup, background scanning or autocomplete.
      // Never replace an existing verified point with a guessed address.
      if(!hasPoint(dealer))void runPinSearch({automatic:true});
      else if(pinStatus)pinStatus.innerHTML='<i class="bi bi-check-circle"></i> Метка сохранена · при необходимости уточните поиск';
      return true;
    }
    editQueryButton?.addEventListener('click',()=>{
      if(!editorSearch)return;
      const show=editorSearch.hidden;
      editorSearch.hidden=!show;
      editQueryButton.setAttribute('aria-expanded',String(show));
      if(show)pinQuery?.focus?.({preventScroll:true});
    });

    map.on('click',e=>{if(editDealerId)selectDraft(e.latlng.lat,e.latlng.lng);});
    el('map-pin-cancel')?.addEventListener('click',closeEditor);
    pinQuery?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();pinFind?.click();}});
    pinFind?.addEventListener('click',()=>runPinSearch({automatic:false}));
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
