import {Linking,Pressable,StyleSheet,Text,View} from 'react-native';
import {useEffect,useState} from 'react';
import Constants from 'expo-constants';
import {apiFetch,API_BASE_URL} from '@/lib/api';
import {router} from 'expo-router';
import {Page} from '@/components/Page';
import {useAuth} from '@/context/auth';
import {colors,radius} from '@/theme';
import {modules} from '@/lib/modules';

const installedVersion=Constants.expoConfig?.version||'0.2.0';
function isNewer(latest:string,current:string){
 const a=latest.split('.').map(Number),b=current.split('.').map(Number);
 for(let i=0;i<3;i++){
  if((a[i]||0)>(b[i]||0))return true;
  if((a[i]||0)<(b[i]||0))return false;
 }
 return false;
}
export default function MoreScreen(){
 const {user,signOut,can}=useAuth();
 const [latestVersion,setLatestVersion]=useState('');
 useEffect(()=>{
  let live=true;
  void apiFetch<{version:string}>('/api/mobile/latest')
   .then(data=>{if(live&&/^\d+\.\d+\.\d+$/.test(data.version))setLatestVersion(data.version);})
   .catch(()=>{});
  return ()=>{live=false;};
 },[]);
 return (
  <Page eyebrow="IDEAL FLOOR · ВСЕ ВОЗМОЖНОСТИ" title="Ещё">
   <View style={styles.profile}>
    <View style={styles.avatar}><Text style={styles.avatarText}>
     {user?.fullName?.[0]?.toUpperCase()||user?.username?.[0]?.toUpperCase()||'U'}
    </Text></View>
    <View style={styles.profileCopy}>
     <Text style={styles.name}>{user?.fullName||user?.username}</Text>
     <Text style={styles.meta}>{[user?.role,user?.scope].filter(Boolean).join(' · ')}</Text>
    </View>
    <View style={styles.online}><Text style={styles.onlineText}>CRM</Text></View>
   </View>
   <View style={styles.sectionHead}>
    <Text style={styles.sectionTitle}>Остальные разделы</Text>
    <Text style={styles.sectionCount}>{modules.filter(m=>m.key!=='dealer'&&can(m.permission)).length}</Text>
   </View>
   <Text style={styles.intro}>Работайте с актуальными модулями веб-CRM прямо внутри приложения — без перехода в другой браузер.</Text>
   <View style={styles.moduleList}>
    {modules.filter(m=>m.key!=='dealer'&&can(m.permission)).map(module=>
     <Pressable key={module.key} onPress={()=>router.push({pathname:'/module/[key]',params:{key:module.key}})}
       style={({pressed})=>[styles.moduleRow,pressed&&styles.pressed]}>
      <View style={styles.moduleIcon}><Text style={styles.moduleGlyph}>{module.icon}</Text></View>
      <View style={styles.moduleCopy}>
       <Text style={styles.moduleTitle}>{module.title}</Text>
       <Text style={styles.moduleMeta} numberOfLines={2}>{module.subtitle}</Text>
      </View>
      <Text style={styles.arrow}>›</Text>
     </Pressable>)}
   </View>
   {!!latestVersion&&isNewer(latestVersion,installedVersion)&&
    <Pressable style={styles.update} onPress={()=>
      void Linking.openURL(API_BASE_URL+'/download/android').catch(()=>{})}>
      <View style={styles.updateCopy}>
       <Text style={styles.updateTitle}>Доступна версия {latestVersion}</Text>
       <Text style={styles.updateHint}>Скачать обновление через веб-CRM</Text>
      </View>
      <Text style={styles.updateIcon}>↓</Text>
    </Pressable>}
   <Pressable onPress={()=>void signOut()} style={styles.logout}>
    <Text style={styles.logoutText}>Выйти из аккаунта</Text>
   </Pressable>
   <Text style={styles.version}>IDEAL FLOOR CRM · Android {installedVersion}</Text>
  </Page>
 );
}
const styles=StyleSheet.create({
 profile:{padding:16,borderRadius:radius.lg,backgroundColor:colors.ink,flexDirection:'row',
  alignItems:'center',gap:12},
 avatar:{width:47,height:47,borderRadius:15,backgroundColor:colors.brand,alignItems:'center',justifyContent:'center'},
 avatarText:{color:'#fff',fontSize:18,fontWeight:'900'},
 profileCopy:{flex:1},
 name:{color:'#fff',fontSize:15,fontWeight:'900'},
 meta:{marginTop:4,color:'#BEC0C6',fontSize:11},
 online:{paddingHorizontal:9,paddingVertical:6,borderRadius:8,backgroundColor:'#414147'},
 onlineText:{color:'#fff',fontSize:9,fontWeight:'900'},
 sectionHead:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:20},
 sectionTitle:{color:colors.ink,fontSize:18,fontWeight:'900'},
 sectionCount:{color:colors.brand,fontSize:12,fontWeight:'900'},
 intro:{color:colors.muted,fontSize:11,lineHeight:16,marginTop:6,marginBottom:12},
 moduleList:{gap:8},
 moduleRow:{minHeight:62,flexDirection:'row',gap:11,alignItems:'center',paddingHorizontal:11,
  borderRadius:14,borderWidth:1,borderColor:colors.border,backgroundColor:'#fff'},
 moduleIcon:{width:37,height:37,alignItems:'center',justifyContent:'center',
  borderRadius:11,backgroundColor:'#FFF1F1'},
 moduleGlyph:{color:colors.brand,fontSize:18,fontWeight:'900'},
 moduleCopy:{flex:1,minWidth:0},
 moduleTitle:{fontSize:13,fontWeight:'900',color:colors.ink},
 moduleMeta:{fontSize:10,lineHeight:14,color:colors.muted,marginTop:3},
 arrow:{color:'#A0A2A9',fontSize:25},
 pressed:{opacity:.7,transform:[{scale:.995}]},
 update:{marginTop:18,padding:14,borderRadius:14,backgroundColor:'#25262C',
  flexDirection:'row',alignItems:'center',gap:8},
 updateCopy:{flex:1},
 updateTitle:{fontSize:12,fontWeight:'900',color:'#fff'},
 updateHint:{fontSize:10,color:'#CED0D6',marginTop:3},
 updateIcon:{fontSize:23,fontWeight:'900',color:'#fff'},
 logout:{height:46,borderRadius:12,borderWidth:1,borderColor:'#EBCBCE',
   backgroundColor:'#FFF4F4',alignItems:'center',justifyContent:'center',marginTop:20},
 logoutText:{color:colors.brand,fontSize:12,fontWeight:'900'},
 version:{fontSize:10,color:'#9C9EA5',textAlign:'center',marginTop:18}
});
