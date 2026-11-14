import {useState} from 'react';
import {Pressable,StyleSheet,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useAuth} from '@/context/auth';
import {CRMWebView} from '@/components/CRMWebView';
import {colors} from '@/theme';

/** Use our existing Leaflet/OpenStreetMap CRM map directly.
 * It has address search, dealer clustering, no-pin lists, map editing and 2GIS links.
 * A native Google Maps SDK would require a separate paid/API key configuration.
 */
export default function MapScreen(){
 const {can}=useAuth();
 const [reloadKey,setReloadKey]=useState(0);
 const [error,setError]=useState('');
 if(!can('can_view_map')){
  return <SafeAreaView style={styles.safe} edges={['top']}>
   <View style={styles.denied}><Text style={styles.deniedTitle}>Карта недоступна</Text>
    <Text style={styles.deniedText}>Нет разрешения просматривать карту дилеров.</Text>
   </View>
  </SafeAreaView>;
 }
 return <SafeAreaView style={styles.safe} edges={['top']}>
   <CRMWebView path="/map.html" reloadKey={reloadKey} onError={setError}/>
   {!!error&&<Pressable style={styles.retry} onPress={()=>{setError('');setReloadKey(n=>n+1);}}>
    <Text style={styles.retryText}>Карта не загрузилась · Повторить</Text>
   </Pressable>}
  </SafeAreaView>;
}
const styles=StyleSheet.create({
 safe:{flex:1,backgroundColor:colors.background},
 denied:{flex:1,alignItems:'center',justifyContent:'center',padding:22},
 deniedTitle:{color:colors.ink,fontSize:18,fontWeight:'900'},
 deniedText:{color:colors.muted,fontSize:12,marginTop:6},
 retry:{position:'absolute',left:18,right:18,bottom:20,padding:14,
  backgroundColor:colors.ink,borderRadius:12,alignItems:'center'},
 retryText:{color:'#fff',fontSize:12,fontWeight:'800'}
});
