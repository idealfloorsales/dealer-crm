'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const search=require('../public/map-search-core');
const geo=require('../server/map-geocoding');

test('dealer search matches ID, partial address and mixed city/name tokens without coordinates',()=>{
 const dealers=[
  {id:'1',dealer_id:'IF001',name:'Ламинат Центр',city:'Астана',address:'улица Мәскеу, дом 9',latitude:null,longitude:null},
  {id:'2',dealer_id:'IF002',name:'Альфа',city:'Алматы',address:'Абая 57',latitude:43.1,longitude:76.9}
 ];
 assert.equal(search.rankDealers(dealers,'if001')[0].id,'1');
 assert.equal(search.rankDealers(dealers,'Мәскеу 9')[0].id,'1');
 assert.equal(search.rankDealers(dealers,'ламнат центр')[0].id,'1');
 assert.equal(search.rankDealers(dealers,'Астана Ламинат')[0].id,'1');
 assert.equal(search.rankDealers(dealers,'Нур-Султан')[0].id,'1');
 assert.equal(search.rankDealers(dealers,'нет такого').length,0);
 assert.equal(search.hasCoordinates(dealers[0]),false);
 assert.equal(search.hasCoordinates({...dealers[0],latitude:'',longitude:''}),false);
 assert.equal(search.hasCoordinates(dealers[1]),true);
});
test('search rejects invalid map coordinates and accepts verified Kazakh points',()=>{
 assert.equal(geo.validKazakhstanPoint(51.16,71.47),true);
 assert.equal(geo.validKazakhstanPoint(0,0),false);
 assert.equal(geo.validKazakhstanPoint(NaN,71),false);
 assert.deepEqual(geo.parseResults([{lat:'51.16',lon:'71.47',display_name:'Astana, Kazakhstan'},{lat:'0',lon:'0',display_name:'Wrong'},{lat:'51.16',lon:'71.47',display_name:'duplicate'}]),[{lat:51.16,lon:71.47,name:'Astana, Kazakhstan'}]);
});
test('geocoder is explicit, country-scoped and caches repeated address requests',async()=>{
 let calls=0,lastUrl;
 const lookup=geo.createLookup({clock:()=>10000,sleep:async()=>{},fetchImpl:async(url,options)=>{
  calls++;lastUrl=url;
  assert.match(options.headers['User-Agent'],/IDEALFloorCRM/);
  return {ok:true,json:async()=>[{lat:'51.15',lon:'71.46',display_name:'Астана, 9'}]};
 }});
 const first=await lookup('Мәскеу 9','Астана');
 const second=await lookup('Мәскеу 9','Астана');
 assert.equal(calls,1);
 assert.deepEqual(first,second);
 assert.equal(new URL(lastUrl).searchParams.get('countrycodes'),'kz');
 assert.match(new URL(lastUrl).searchParams.get('q'),/Астана/);
 await assert.rejects(lookup('x'),/трёх символов/);
});

test('geocoder removes floor, boutique and office while preserving house',()=>{
 const a=require('../public/address-search');
 const examples=[
  ['Астана','ул. Мәскеу 9, 2 этаж, офис 301','ул. Мәскеу 9','2 этаж, офис 301'],
  ['Алматы','Абая 57, бутик №17','Абая 57','бутик №17'],
  ['Астана','ТРЦ Хан Шатыр, 3-й этаж, павильон 16','ТРЦ Хан Шатыр','3-й этаж, павильон 16'],
  ['Караганда','мкр 12, дом 9, корпус 2, этаж 1','мкр 12, дом 9, корпус 2','этаж 1'],
  ['Астана','Мангилик Ел 55/7 2 этаж офис 15','Мангилик Ел 55/7','2 этаж офис 15']
 ];
 for(const [city,raw,want,details] of examples){
  const parsed=a.prepare(raw,city);
  assert.equal(parsed.address,want);
  assert.equal(parsed.details,details);
  assert.equal(parsed.city,city);
 }
 assert.equal(a.extractHouseNumber('Мангилик Ел 55/7, 2 этаж'),'55/7');
 assert.equal(a.extractHouseNumber('мкр 12, дом 9'),'9');
 assert.equal(a.prepare('2 этаж, офис 301','Астана').address,'');
});
test('Nominatim request contains building and city but never floor or office',async()=>{
 let lastUrl;
 const lookup=geo.createLookup({clock:()=>10000,sleep:async()=>{},fetchImpl:async(url)=>{
  lastUrl=url;
  return {ok:true,json:async()=>[{
   lat:'51.2',lon:'71.4',display_name:'Мәскеу 9, Астана',
   address:{house_number:'9',city:'Астана',road:'улица Мәскеу'}
  }]};
 }});
 const rows=await lookup('Мәскеу 9, 2 этаж, офис 301','Астана');
 const query=new URL(lastUrl).searchParams.get('q');
 assert.match(query,/Мәскеу 9/);
 assert.doesNotMatch(query,/офис|этаж/i);
 assert.equal(rows[0].precision,'house');
});
test('street-level and different-city matches are not claimed as verified buildings',async()=>{
 const lookup=geo.createLookup({clock:()=>10000,sleep:async()=>{},fetchImpl:async()=>({
  ok:true,json:async()=>[
   {lat:'51.2',lon:'71.4',display_name:'Мәскеу 9, Алматы',address:{house_number:'9',city:'Алматы'}},
   {lat:'51.3',lon:'71.5',display_name:'улица Мәскеу, Астана',address:{road:'Мәскеу',city:'Астана'}}
  ]
 })});
 const rows=await lookup('Мәскеу 9','Астана');
 assert.equal(rows.every(r=>r.precision==='review'),true);
});

test('matching house number in a different street does not produce automatic location',async()=>{
 const lookup=geo.createLookup({clock:()=>10000,sleep:async()=>{},fetchImpl:async()=>({
  ok:true,json:async()=>[
   {lat:'51.2',lon:'71.4',display_name:'ул Сатпаева 9, Астана',
    address:{house_number:'9',city:'Астана',road:'Сатпаева'}}
  ]
 })});
 const result=await lookup('Мәскеу 9','Астана');
 assert.equal(result[0].precision,'review');
});

test('a house without a city remains an unverified candidate',async()=>{
 const lookup=geo.createLookup({clock:()=>10000,sleep:async()=>{},fetchImpl:async()=>({
  ok:true,json:async()=>[{lat:'51.2',lon:'71.4',display_name:'Мәскеу 9',
    address:{house_number:'9',road:'Мәскеу',city:'Астана'}}]
 })});
 const rows=await lookup('Мәскеу 9','');
 assert.equal(rows[0].precision,'review');
});
