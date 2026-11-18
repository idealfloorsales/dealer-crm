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
  assert.match(style,/--crm-top-size:44px/);
  assert.match(style,/--crm-top-size:42px/);
  assert.match(style,/:root\[data-crm-theme="dark"\] #crm-scroll-to-top/);
  assert.match(style,/@media\(prefers-reduced-motion:reduce\)/);
  assert.doesNotMatch(style,/animation:crmTopReveal/);
});
