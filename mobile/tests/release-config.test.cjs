'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

test('release plugin enables shrinking, keeps Room/WorkManager and is idempotent', async()=>{
  const module={exports:{}};
  let dangerous=null;
  let rules='-dontwarn java.**\n';
  let appendCount=0;
  const fakeFs={promises:{
    readFile:async()=>rules,
    appendFile:async(file,content)=>{assert.ok(file.endsWith('proguard-rules.pro'));rules+=content;appendCount++;}
  }};
  const fakeRequire=name=>{
    if(name==='expo/config-plugins')return{
      withGradleProperties:(config,update)=>update(config),
      withDangerousMod:(config,[platform,action])=>{
        assert.equal(platform,'android');
        dangerous=action;
        return config;
      }
    };
    if(name==='fs')return fakeFs;
    if(name==='path')return path;
    throw new Error('Unexpected native plugin require: '+name);
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname,'../plugins/with-stable-release.cjs'),'utf8'),
    {module,require:fakeRequire}
  );
  const config={
    modResults:[
      {type:'property',key:'android.enableMinifyInReleaseBuilds',value:'false'},
      {type:'property',key:'android.enableShrinkResourcesInReleaseBuilds',value:'false'},
      {type:'property',key:'hermesEnabled',value:'true'}
    ],
    modRequest:{platformProjectRoot:'/tmp/ideal-floor-android'}
  };
  module.exports(config);
  module.exports(config);
  for(const key of ['android.enableMinifyInReleaseBuilds','android.enableShrinkResourcesInReleaseBuilds']){
    const items=config.modResults.filter(item=>item.key===key);
    assert.equal(items.length,1,'should not duplicate '+key);
    assert.equal(items[0].value,'true');
  }
  assert.equal(config.modResults.find(item=>item.key==='hermesEnabled').value,'true');
  assert.equal(typeof dangerous,'function');
  await dangerous(config);
  await dangerous(config);
  assert.equal(appendCount,1,'should add native keep rules only once');
  assert.ok(rules.includes('-keep class androidx.room.**'));
  assert.ok(rules.includes('-keep class androidx.work.**'));
  assert.ok(rules.includes('-keep class androidx.sqlite.**'));
});
