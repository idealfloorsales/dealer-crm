const {test}=require('node:test');const assert=require('node:assert/strict');
const {coverageOf,latestActivity,salesForCoverage}=require('../server/employee-profile-stats');
test('profile uses the employee work area, never the administrator viewing the card',()=>{
 assert.deepEqual(coverageOf({role:'manager',scope:'astana'}).filter,{responsible:'regional_astana'});
 assert.equal(coverageOf({role:'manager',scope:'regions'}).label,'Регионы');
 assert.equal(coverageOf({role:'admin',scope:'astana'}).scope,'all');
});
test('sales follow dealer membership rather than who entered sales and avoid hierarchy double counting',()=>{
 const rows=[{dealerId:'a',ownerUserId:'different-user',fact:125,plan:10},{dealerId:'b',fact:75,plan:20},{dealerId:'foreign',fact:900},{dealerId:'PLAN_astana_all',plan:500,fact:999},{dealerId:'PLAN_astana_north',plan:300},{dealerId:'PLAN_vip_a',plan:200},{isCustom:true,group:'astana_north',fact:30},{isCustom:true,group:'sector_west',fact:70}];
 const result=salesForCoverage(rows,[{_id:'a'},{_id:'b'}],'astana');assert.equal(result.fact,230);assert.equal(result.plan,500);assert.equal(result.percent,46);
 assert.equal(salesForCoverage([{dealerId:'PLAN_astana_all',plan:0},{dealerId:'PLAN_vip_a',plan:200}],[{_id:'a'}],'astana').hasPlan,false);
});
test('old login cannot hide more recent audited activity',()=>{
 assert.equal(latestActivity({lastLoginAt:'2026-11-09T09:15:00Z'},'2026-11-09T10:23:00Z').toISOString(),'2026-11-09T10:23:00.000Z');
 assert.equal(latestActivity({lastSeenAt:'2026-11-10T10:00:00Z',lastLoginAt:'2026-11-09T09:15:00Z'},'2026-11-09T10:23:00Z').toISOString(),'2026-11-10T10:00:00.000Z');
 assert.equal(latestActivity({},null),null);
});
