const {withGradleProperties}=require('expo/config-plugins');
// AndroidX WorkManager's reflected Room implementation was removed by R8 in
// the generated release build. Keep native code intact until shrinking has
// explicit compatibility coverage; this does not enable development mode.
module.exports=config=>withGradleProperties(config,config=>{
 for(const key of ['android.enableMinifyInReleaseBuilds','android.enableShrinkResourcesInReleaseBuilds']){
  config.modResults=config.modResults.filter(item=>item.key!==key);
  config.modResults.push({type:'property',key,value:'false'});
 }
 return config;
});
