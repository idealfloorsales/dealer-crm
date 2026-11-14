'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const path=require('node:path');
function read(file){return readFileSync(path.join(__dirname,'..',file),'utf8');}

test('Android app version, package and native build number are coordinated',()=>{
 const pkg=JSON.parse(read('package.json'));
 const app=JSON.parse(read('app.json')).expo;
 assert.equal(pkg.version,app.version);
 assert.equal(pkg.version,'0.2.0');
 assert.ok(app.android.versionCode>=4);
 assert.ok(pkg.dependencies['react-native-webview']);
});
test('mobile map reuses the complete authenticated Leaflet CRM map',()=>{
 const map=read('app/(tabs)/map.tsx');
 const web=read('src/components/CRMWebView.tsx');
 assert.match(map,/CRMWebView/);
 assert.match(map,/map\.html/);
 assert.match(web,/crm-native-embedded/);
 assert.match(web,/localStorage\.setItem/);
 assert.doesNotMatch(map,/react-native-maps/);
});
test('embedded CRM web modules are permission guarded and keep JWT off URLs',()=>{
 const page=read('app/module/[key].tsx');
 const bridge=read('src/components/CRMWebView.tsx');
 assert.match(page,/if\(!module\|\|!token\|\|!can\(module.permission\)\)/);
 assert.match(page,/CRMWebView/);
 assert.match(bridge,/localStorage\.setItem\("crm_token"/);
 assert.match(bridge,/onShouldStartLoadWithRequest/);
 assert.match(bridge,/url\.startsWith\(BASE\+'\/'\)/);
 assert.doesNotMatch(bridge,/Bearer.*\+.*path/);
});
test('APK optimizer retains Room and WorkManager reflected implementations',()=>{
 const plugin=read('plugins/with-stable-release.cjs');
 assert.match(plugin,/android\.enableMinifyInReleaseBuilds/);
 assert.match(plugin,/android\.enableShrinkResourcesInReleaseBuilds/);
 assert.match(plugin,/-keep class androidx\.work/);
 assert.match(plugin,/-keep class androidx\.room/);
});

test('APK does not bundle the redundant native Google Maps SDK',()=>{
 const pkg=JSON.parse(read('package.json'));
 assert.equal(pkg.dependencies['react-native-maps'],undefined);
 assert.ok(pkg.dependencies['react-native-webview']);
});
