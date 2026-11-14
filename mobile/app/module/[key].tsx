import {useState} from 'react';
import {Pressable,StyleSheet,Text,View} from 'react-native';
import {router,useLocalSearchParams} from 'expo-router';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useAuth} from '@/context/auth';
import {CRMWebView} from '@/components/CRMWebView';
import {findCRMModule,modulePath} from '@/lib/modules';
import {colors} from '@/theme';

export default function ModuleScreen(){
 const params=useLocalSearchParams<{key:string;id?:string}>();
 const {token,can}=useAuth();
 const module=findCRMModule(String(params.key||''));
 const [retryKey,setRetryKey]=useState(0);
 const [error,setError]=useState('');
 const [progress,setProgress]=useState(0);
 if(!module||!token||!can(module.permission)){
  return <SafeAreaView style={styles.safe}><Text style={styles.denied}>
    Этот раздел не разрешён для вашей учётной записи.
  </Text><Pressable onPress={()=>router.back()} style={styles.backDenied}>
    <Text style={styles.backDeniedText}>Вернуться</Text>
  </Pressable></SafeAreaView>;
 }
 return <SafeAreaView style={styles.safe} edges={['top','bottom']}>
  <View style={styles.top}>
   <Pressable onPress={()=>router.back()} style={styles.back} accessibilityLabel="Назад">
    <Text style={styles.backArrow}>‹</Text>
   </Pressable>
   <View style={styles.copy}>
    <Text style={styles.eyebrow}>IDEAL FLOOR · МОДУЛЬ CRM</Text>
    <Text style={styles.title} numberOfLines={1}>{module.title}</Text>
   </View>
   <Pressable onPress={()=>{setError('');setRetryKey(key=>key+1);}}
     style={styles.reload} accessibilityLabel="Обновить модуль"><Text style={styles.reloadText}>↻</Text>
   </Pressable>
  </View>
  {progress>0&&progress<1&&<View style={styles.progress}>
    <View style={[styles.progressBar,{width:(String(Math.round(progress*100))+'%') as `${number}%`}]}/>
  </View>}
  {!!error&&<Pressable onPress={()=>{setError('');setRetryKey(k=>k+1);}} style={styles.errorBox}>
   <Text style={styles.errorText}>{error} · Нажмите, чтобы обновить</Text>
  </Pressable>}
  <CRMWebView path={modulePath(module.key,String(params.id||''))} reloadKey={retryKey}
    onError={setError} onProgress={setProgress}/>
 </SafeAreaView>;
}
const styles=StyleSheet.create({
 safe:{flex:1,backgroundColor:colors.background},
 top:{height:62,flexDirection:'row',alignItems:'center',paddingHorizontal:12,gap:9,
  backgroundColor:'#fff',borderBottomWidth:1,borderBottomColor:colors.border},
 back:{width:35,height:35,borderRadius:10,backgroundColor:'#F5F3F1',
  alignItems:'center',justifyContent:'center'},
 backArrow:{fontSize:26,color:colors.ink,lineHeight:28},
 copy:{flex:1,minWidth:0},
 eyebrow:{color:colors.brand,fontSize:8,fontWeight:'900',letterSpacing:.9},
 title:{color:colors.ink,fontSize:16,fontWeight:'900',marginTop:2},
 reload:{width:36,height:36,alignItems:'center',justifyContent:'center',
  borderRadius:10,backgroundColor:'#FFF0F0'},
 reloadText:{fontSize:25,color:colors.brand},
 progress:{height:2,backgroundColor:'#F2EEEA'},
 progressBar:{height:2,backgroundColor:colors.brand},
 denied:{fontSize:14,fontWeight:'700',margin:22,textAlign:'center',color:colors.ink},
 backDenied:{alignSelf:'center',paddingHorizontal:14,paddingVertical:10,
  backgroundColor:colors.ink,borderRadius:10},
 backDeniedText:{color:'#fff',fontWeight:'800'},
 errorBox:{padding:12,backgroundColor:'#FFF0F0'},
 errorText:{color:colors.brand,fontSize:10,fontWeight:'700'}
});
