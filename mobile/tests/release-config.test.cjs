const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
test('release plugin disables native shrinking even when generated defaults enable it',()=>{
 const module={exports:{}};const context={module,require:name=>{assert.equal(name,'expo/config-plugins');return {withGradleProperties:(config,update)=>update(config)};}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../plugins/with-stable-release.cjs'),'utf8'),context);
 const config={modResults:[{type:'property',key:'android.enableMinifyInReleaseBuilds',value:'true'},{type:'property',key:'android.enableShrinkResourcesInReleaseBuilds',value:'true'},{type:'property',key:'hermesEnabled',value:'true'}]};
 module.exports(config);module.exports(config);
 for(const key of ['android.enableMinifyInReleaseBuilds','android.enableShrinkResourcesInReleaseBuilds']){const values=config.modResults.filter(p=>p.key===key);assert.equal(values.length,1);assert.equal(values[0].value,'false');}
 assert.equal(config.modResults.find(p=>p.key==='hermesEnabled').value,'true');
});
