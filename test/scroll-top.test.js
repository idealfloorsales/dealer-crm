const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const script=fs.readFileSync(path.join(__dirname,'../public/permissions.js'),'utf8');
const style=fs.readFileSync(path.join(__dirname,'../public/ui-consistency.css'),'utf8');

function loadDockHelper(){
  const start=script.indexOf('    function pickScrollTopDock(');
  const end=script.indexOf('    // Small edge-docked scroll shortcut.',start);
  assert.ok(start>0&&end>start,'scroll dock helper must be discoverable');
  return new Function(script.slice(start,end)+'\nreturn pickScrollTopDock;')();
}
const pick=loadDockHelper();

test('small 42px mobile control docks beside the mobile navigation',()=>{
  const result=pick(390,844,42,105,[]);
  assert.deepEqual(result,{right:7,bottom:105,side:'right'});
});
test('avoids floating add buttons and moves upward instead of covering them',()=>{
  const add={left:321,top:646,right:390,bottom:795};
  const result=pick(390,844,42,105,[add]);
  assert.ok(result&&result.side==='right');
  const y=844-result.bottom-42;
  assert.ok(y+42+8<=add.top,'scroll dock should clear the floating action');
});
test('chooses the opposite screen edge when the right edge is occupied',()=>{
  const blockedRight={left:309,top:460,right:391,bottom:845};
  const result=pick(390,844,42,105,[blockedRight]);
  assert.ok(result);
  assert.equal(result.side,'left');
  assert.equal(result.right,390-7-42);
});
test('hides when both screen edges are blocked',()=>{
  const left={left:0,top:350,right:86,bottom:850};
  const right={left:310,top:350,right:400,bottom:850};
  assert.equal(pick(390,844,42,105,[left,right]),null);
});
test('preserves a 44px click target on desktop',()=>{
  const result=pick(1280,900,44,21,[]);
  assert.deepEqual(result,{right:12,bottom:21,side:'right'});
});
test('new control is subtle, respects motion preference, and removes the rotating ring',()=>{
  assert.match(script,/class="crm-scroll-top-progress"/);
  assert.match(script,/function findFreeDock\(/);
  assert.match(script,/\.crm-mobile-nav.*#mobile-fab-add/);
  assert.match(script,/blockedByOverlay/);
  assert.doesNotMatch(script,/crm-scroll-top-ring/);
  assert.match(style,/--crm-top-size:40px/);
  assert.match(style,/--crm-top-size:38px/);
  assert.match(style,/:root\[data-crm-theme="dark"\] #crm-scroll-to-top/);
  assert.match(style,/@media\(prefers-reduced-motion:reduce\)/);
  assert.doesNotMatch(style,/animation:crmTopReveal/);
});


function simulateVisibleScrollButton(isMobile){
  const viewportWidth=isMobile?390:1280;
  const height=isMobile?844:900;
  const listeners={};
  const classes=new Set();
  const styles={};
  const attributes={};
  const nav=isMobile?{
    isConnected:true,
    getBoundingClientRect(){return {left:8,right:382,top:766,bottom:830,width:374,height:64};}
  }:null;
  const button={
    isConnected:true,
    tabIndex:-1,
    classList:{
      add:name=>classes.add(name),
      remove:name=>classes.delete(name),
      toggle(name,yes){if(yes)classes.add(name);else classes.delete(name);},
      contains:name=>classes.has(name)
    },
    setAttribute(name,value){attributes[name]=value;},
    style:{setProperty(name,value){styles[name]=value;}},
    contains(){return false;},
    addEventListener(name,cb){listeners['button:'+name]=cb;}
  };
  const page={scrollTop:225,scrollHeight:2400,clientHeight:height,clientWidth:viewportWidth};
  const body={
    scrollHeight:2400,
    classList:{contains(){return false;}},
    appendChild(el){if(el!==button)throw Error('unexpected element');}
  };
  const fakeDocument={
    body,documentElement:page,scrollingElement:page,
    activeElement:{matches:()=>false},
    createElement(name){assert.equal(name,'button');return button;},
    getElementById(){return null;},
    querySelector(query){
      if(query==='.crm-mobile-nav')return nav;
      // The hidden menu exists on every page, but must never hide the button.
      if(query.includes('[role="dialog"]'))return {id:'crm-mobile-sheet',hidden:false};
      return null;
    },
    querySelectorAll(query){
      if(query.includes('.map-page .sidebar-content'))return [];
      // Ordinary actions fill both edges of busy dashboard pages.
      const broad=/(^|,)button(,|$)|(^|,)a(,|$)/.test(query);
      if(broad)return [
        {isConnected:true,getBoundingClientRect:()=>({left:0,top:290,right:100,bottom:height,width:100,height:height-290})},
        {isConnected:true,getBoundingClientRect:()=>({left:viewportWidth-100,top:290,right:viewportWidth,bottom:height,width:100,height:height-290})}
      ];
      return nav?[nav]:[];
    },
    addEventListener(name,cb){listeners['document:'+name]=cb;}
  };
  const fakeWindow={
    innerHeight:height,innerWidth:viewportWidth,scrollY:225,visualViewport:undefined,
    requestAnimationFrame(cb){cb();return 1;},
    addEventListener(name,cb){listeners['window:'+name]=cb;},
    matchMedia(){return {matches:false};},
    scrollTo(value){styles.scrollTo=value;}
  };
  const start=script.indexOf('    function pickScrollTopDock(');
  const end=script.indexOf('    function initInteractionLayer()',start);
  const init=new Function('window','document','ResizeObserver',
    script.slice(start,end)+'\nreturn initAdaptiveScrollTop;'
  )(fakeWindow,fakeDocument,undefined);
  init();
  return {classes,attributes,styles,listeners,button};
}
test('regression: scroll control is visible on desktop even with many buttons and a hidden dialog',()=>{
  const app=simulateVisibleScrollButton(false);
  assert.ok(app.classes.has('is-visible'));
  assert.equal(app.attributes['aria-hidden'],'false');
  assert.equal(app.button.tabIndex,0);
  assert.ok(app.styles['--crm-top-right']);
  app.listeners['button:click']();
  assert.equal(app.styles.scrollTo.top,0);
});
test('regression: scroll control is visible on phones above the actual mobile nav',()=>{
  const app=simulateVisibleScrollButton(true);
  assert.ok(app.classes.has('is-visible'));
  assert.equal(app.attributes['aria-hidden'],'false');
  assert.ok(parseInt(app.styles['--crm-top-bottom'],10)>=85);
});
test('only an open overlay hides the control',()=>{
  assert.doesNotMatch(script,/\[role="dialog"\]\[aria-modal="true"\]:not\(\[hidden\]\)/);
  assert.match(script,/\.crm-mobile-sheet-backdrop\.open/);
  assert.doesNotMatch(script,/'button','a','input','select','textarea'/);
});

test('narrow vertical control fits a wider page gutter instead of covering content',()=>{
  const dock=pick(1600,900,40,21,[],95,74);
  assert.deepEqual(dock,{right:95,bottom:21,side:'right'});
});
test('vertical control clears tall floating panels',()=>{
  const floating={left:1510,right:1600,top:730,bottom:901};
  const dock=pick(1600,900,40,21,[floating],8,74);
  assert.ok(dock);
  const x=1600-dock.right-40;
  const y=900-dock.bottom-74;
  assert.ok(x+40+7<=floating.left || x-7>=floating.right ||
    y+74+8<=floating.top || y-8>=floating.bottom);
});
test('flat vertical UI has a real animation and reduced-motion fallback',()=>{
  assert.match(style,/--crm-top-height:74px/);
  assert.match(style,/--crm-top-height:70px/);
  assert.match(style,/@keyframes crmTopArrowTravel/);
  assert.match(style,/@keyframes crmTopLightRail/);
  assert.match(script,/class="crm-scroll-top-caption"/);
  assert.match(script,/const preferredRight=width>=768&&gutter>size\+20/);
});
