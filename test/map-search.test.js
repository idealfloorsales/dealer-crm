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
