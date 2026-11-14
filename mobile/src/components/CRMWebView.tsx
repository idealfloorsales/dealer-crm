import {useEffect,useMemo,useRef,type ComponentRef} from 'react';
import {ActivityIndicator,Linking,StyleSheet,View} from 'react-native';
import WebView from 'react-native-webview';
import {API_BASE_URL} from '@/lib/api';
import {useAuth} from '@/context/auth';
import {colors} from '@/theme';

const BASE=API_BASE_URL.replace(/\/+$/,'');
type Props={path:string;reloadKey?:number;onError?:(message:string)=>void;onProgress?:(progress:number)=>void};

/** CRM web content is first-party only: navigation to external sites opens Android apps.
 * Native token is never placed in a URL or sent through third-party links.
 * The same responsive CRM modules (including OSM map) stay up to date without rebuilding APK.
 */
export function CRMWebView({path,reloadKey=0,onError,onProgress}:Props){
 const {token}=useAuth();
 const web=useRef<ComponentRef<typeof WebView>>(null);
 const recovered=useRef(false);
 const safePath=path.startsWith('/')&&!path.startsWith('//')?path:'/';
 const uri=BASE+safePath;
 const injection=useMemo(()=>{
  if(!token)return 'true;';
  return '(function(){try{if(location.origin==='+JSON.stringify(BASE)+
    '){localStorage.setItem("crm_token",'+JSON.stringify(token)+
    ');if(document.documentElement){document.documentElement.classList.add("crm-native-embedded");}}}catch(e){}})();true;';
 },[token]);
 useEffect(()=>()=>{web.current?.injectJavaScript(
  'try{localStorage.removeItem("crm_token");}catch(e){}true;'
 );},[]);
 return <WebView key={safePath+'-'+reloadKey} ref={web} style={styles.web}
   source={{uri}} originWhitelist={[BASE]}
   injectedJavaScriptBeforeContentLoaded={injection}
   injectedJavaScript={injection}
   injectedJavaScriptBeforeContentLoadedForMainFrameOnly
   injectedJavaScriptForMainFrameOnly
   javaScriptEnabled domStorageEnabled
   setSupportMultipleWindows={false}
   thirdPartyCookiesEnabled={false}
   sharedCookiesEnabled={false}
   cacheEnabled={false}
   onShouldStartLoadWithRequest={request=>{
    const url=String(request.url||'');
    if(url===BASE||url.startsWith(BASE+'/')||url==='about:blank')return true;
    if(url.startsWith('https://')||url.startsWith('tel:')||url.startsWith('mailto:'))
      void Linking.openURL(url).catch(()=>{});
    return false;
   }}
   onNavigationStateChange={state=>{
    if(token&&state.url.startsWith(BASE+'/login.html')&&!recovered.current){
      recovered.current=true;
      web.current?.injectJavaScript(injection+'window.location.replace('+JSON.stringify(uri)+');true;');
    }
   }}
   onLoadProgress={event=>onProgress?.(event.nativeEvent.progress)}
   onError={event=>onError?.(event.nativeEvent.description||'Веб-модуль временно недоступен')}
   startInLoadingState
   renderLoading={()=><View style={styles.loading}><ActivityIndicator color={colors.brand}/></View>}
  />;
}
const styles=StyleSheet.create({
 web:{flex:1,backgroundColor:'#fff'},
 loading:{flex:1,alignItems:'center',justifyContent:'center',backgroundColor:'#fff'}
});
