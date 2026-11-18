const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const asset = file => fs.readFileSync(path.join(__dirname,'../public',file),'utf8');
const script = asset('map.js');
const html = asset('map.html');
const css = asset('map-controls.css');

function createMapFilterFold(isMobile, previous) {
  const values = {...(previous || {})};
  const classes = new Set();
  const attributes = {};
  const span = {textContent:''};
  const chevron = {className:''};
  const fold = {
    setAttribute(name,value){attributes[name]=value;},
    querySelector(selector){return selector==='span'?span:chevron;},
    addEventListener(event,listener){this[event]=listener;}
  };
  const header = {
    classList:{toggle(name,active){if(active)classes.add(name);else classes.delete(name);}}
  };
  const document = {
    getElementById: id => id==='map-toggle-filters'?fold:null,
    querySelector: selector => selector==='.map-workspace-header'?header:null
  };
  const window = {matchMedia:()=>({matches:isMobile})};
  const localStorage = {
    getItem:key=>values[key]??null,
    setItem:(key,value)=>{values[key]=value;}
  };
  // Exercise the real initialization and fold handler, not a rewritten copy.
  const begin = script.indexOf('    const API_DEALERS_URL =');
  const end = script.indexOf('    const toast =',begin);
  assert.ok(begin>0&&end>begin);
  const init = new Function('window','document','localStorage',
    script.slice(begin,end)+'\nreturn {collapsed:()=>filtersCollapsed, foldKey};');
  const state = init(window,document,localStorage);
  return {state,classes,attributes,span,fold,values};
}

test('mobile map has visible filter and dealer entry buttons',()=>{
  assert.match(html,/id="btn-show-filters-mobile"/);
  assert.match(html,/id="btn-show-list-mobile"/);
  assert.match(html,/id="map-mobile-filters-count" hidden/);
  assert.match(html,/class="map-mobile-action-dock d-md-none"/);
  assert.match(css,/@media \(max-width:767\.98px\)/);
  assert.match(css,/\.map-mobile-action-dock/);
});

test('mobile filter sheet defaults expanded and desktop stays compact',()=>{
  const mobile=createMapFilterFold(true);
  assert.equal(mobile.state.collapsed(),false);
  assert.equal(mobile.attributes['aria-expanded'],'true');
  assert.equal(mobile.classes.has('is-collapsed'),false);
  const desktop=createMapFilterFold(false);
  assert.equal(desktop.state.collapsed(),true);
  assert.equal(desktop.attributes['aria-expanded'],'false');
});

test('mobile fold preference is separate and persists explicit choices',()=>{
  const first=createMapFilterFold(true);
  first.fold.click();
  assert.equal(first.state.collapsed(),true);
  assert.equal(first.values[first.state.foldKey],'1');
  const restored=createMapFilterFold(true,first.values);
  assert.equal(restored.state.collapsed(),true);
  restored.fold.click();
  assert.equal(restored.state.collapsed(),false);
  assert.equal(restored.values[restored.state.foldKey],'0');
});

test('mobile Filters button explicitly opens drawer and reveals filters',()=>{
  const start=script.indexOf('    function openMobileList(');
  const end=script.indexOf('    function resetFilters()',start);
  assert.ok(start>0&&end>start);
  const state = {saved:{},expanded:{},sheet:new Set(),body:new Set(),collapsed:true,renders:0};
  const el={
    classList:{add:name=>state.sheet.add(name),remove:name=>state.sheet.delete(name)}
  };
  const button=name=>({
    setAttribute:(attr,val)=>{state.expanded[name+':'+attr]=val;}
  });
  const setup=new Function('sidebar','document','btnShowListMobile','btnShowFiltersMobile',
    'renderMapFilterFold','localStorage','foldKey','getState',
    'let filtersCollapsed = true;\n'+script.slice(start,end)+'\nreturn {openMobileList,closeMobileList};');
  const mobile=setup(el,{body:{classList:{
      add:name=>state.body.add(name),remove:name=>state.body.delete(name)
    }}},button('list'),button('filters'),()=>{state.renders++;state.collapsed=false;},
    {setItem:(k,v)=>{state.saved[k]=v;}},'mobile-fold',()=>state);
  // The fold variable belongs to the real map initializer; simulate it via the
  // dedicated local state captured by the extracted functions.
  mobile.openMobileList({showFilters:true});
  assert.ok(state.sheet.has('open'));
  assert.ok(state.body.has('map-list-open'));
  assert.equal(state.expanded['filters:aria-expanded'],'true');
  assert.equal(state.saved['mobile-fold'],'0');
  mobile.closeMobileList();
  assert.equal(state.sheet.has('open'),false);
  assert.equal(state.expanded['filters:aria-expanded'],'false');
});

test('mobile drawer and selectors remain usable on short screens',()=>{
  assert.match(css,/height:min\(78dvh,calc\(100% - 12px\)\)!important/);
  assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
  assert.match(css,/body\.map-list-open \.map-mobile-action-dock/);
  assert.match(script,/activeFilterCount/);
  assert.match(script,/mobileFiltersCount\.hidden=activeFilterCount===0/);
});
