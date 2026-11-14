/* Address → building query. Keep floor/office/boutique in CRM but not geocoding. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.CRMAddressSearch=api;
})(typeof window!=='undefined'?window:null,function(){
  'use strict';
  const clean=v=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim();
  const accessoryStart=/^(?:(?:\d+[-\s]?(?:й|ый|ой|го)?\s*|первый\s+|второй\s+|третий\s+|четвертый\s+|четвёртый\s+)?(?:этаж|эт\.?)(?:\s*\d+)?|(?:на\s+)?(?:\d+[-\s]?(?:м|ом|ем|й)?\s*)?этаже?|(?:офис|оф\.|кабинет|каб\.|бутик|павильон|пав\.|помещение|пом\.|квартира|кв\.|отдел|секция|подъезд|вход|торговое\s+место|рабочее\s+место|стол|ряд)(?:\s|\.|№|#|\d|$))/iu;
  const inlineDetail=/(?:^|\s)(?:(?:\d+[-\s]?(?:й|ый|ой)?\s*|первый\s+|второй\s+|третий\s+)?(?:этаж|эт\.)(?=\s|\d|$)|(?:офис|бутик|павильон|помещение|квартира|кабинет|подъезд|вход)(?=\s|\d|№|$))/iu;
  function prepare(address,city=''){
    const original=clean(address),town=clean(city);
    const kept=[],extras=[];
    for(const raw of original.split(/[,;\n]+/)){
      const part=clean(raw);if(!part)continue;
      if(accessoryStart.test(part)){extras.push(part);continue;}
      const index=part.search(inlineDetail);
      if(index>0){kept.push(part.slice(0,index).trim());extras.push(part.slice(index).trim());}
      else if(index===0&&accessoryStart.test(part))extras.push(part);
      else kept.push(part);
    }
    return {address:kept.filter(Boolean).join(', ').trim(),city:town,details:extras.join(', '),original};
  }
  function extractHouseNumber(input){
    const value=prepare(input).address;
    const explicit=value.match(/(?:^|[,\s])(?:дом|д\.)\s*№?\s*(\d+[а-яa-z]?(?:[/-]\d+[а-яa-z]?)?)/iu);
    if(explicit)return explicit[1].toLowerCase();
    const matches=[...value.matchAll(/(?:^|[\s,])(?:№\s*)?(\d+[а-яa-z]?(?:[/-]\d+[а-яa-z]?)?)(?=\s|,|$)/giu)];
    return matches.length?matches[matches.length-1][1].toLowerCase():'';
  }
  function sameHouse(a,b){return String(a||'').toLowerCase().replace(/[\s№]/g,'')===String(b||'').toLowerCase().replace(/[\s№]/g,'');}
  return {prepare,extractHouseNumber,sameHouse};
});
