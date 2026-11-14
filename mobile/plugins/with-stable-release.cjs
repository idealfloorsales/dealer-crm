const {withGradleProperties,withDangerousMod}=require('expo/config-plugins');
const fs=require('fs');
const path=require('path');
// R8 shrinks the APK. Native Room and WorkManager use reflected generated
// database classes: without these rules the 0.1.x APK crashed on startup.
// A release is published ONLY after the Android 13 emulator check passes.
const keepRules=`
# IDEAL FLOOR CRM: WorkManager/Room reflective initialization
-keep class androidx.work.** { *; }
-keep class androidx.room.** { *; }
-keep class androidx.sqlite.** { *; }
-keep class androidx.startup.** { *; }
-keep class * extends androidx.room.RoomDatabase { *; }
-keep class * extends androidx.work.ListenableWorker { *; }
`;
module.exports=config=>{
 config=withGradleProperties(config,config=>{
  for(const key of ['android.enableMinifyInReleaseBuilds','android.enableShrinkResourcesInReleaseBuilds']){
   config.modResults=config.modResults.filter(item=>item.key!==key);
   config.modResults.push({type:'property',key,value:'true'});
  }
  return config;
 });
 return withDangerousMod(config,['android',async config=>{
  const rules=path.join(config.modRequest.platformProjectRoot,'app','proguard-rules.pro');
  const previous=await fs.promises.readFile(rules,'utf8');
  if(!previous.includes('# IDEAL FLOOR CRM: WorkManager/Room reflective initialization')){
   await fs.promises.appendFile(rules,'\n'+keepRules+'\n');
  }
  return config;
 }]);
};
