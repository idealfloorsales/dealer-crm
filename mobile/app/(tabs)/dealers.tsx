import {useCallback,useMemo,useState} from 'react';
import {ActivityIndicator,FlatList,Pressable,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native';
import {router,useFocusEffect} from 'expo-router';
import {SafeAreaView} from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import {apiFetch} from '@/lib/api';
import {colors,radius} from '@/theme';
import {dealerStatus,filterDealers,validDealerPoint} from '@/lib/dealers';
import type {Dealer} from '@/types';
import type {DealerFilter} from '@/lib/dealers';

const filterOptions:Array<{key:DealerFilter;label:string}>=
 [{key:'all',label:'Все'},{key:'active',label:'Рабочие'},
  {key:'potential',label:'Потенциальные'},{key:'unmapped',label:'Без точки'},
  {key:'problem',label:'Проблемные'}];

export default function DealersScreen(){
 const [rows,setRows]=useState<Dealer[]>([]);
 const [query,setQuery]=useState('');
 const [filter,setFilter]=useState<DealerFilter>('all');
 const [loading,setLoading]=useState(true);
 const [refreshing,setRefreshing]=useState(false);
 const [error,setError]=useState('');
 const load=useCallback(async()=>{
  try{
    setError('');
    const data=await apiFetch<Dealer[]>('/api/dealers');
    setRows(Array.isArray(data)?data:[]);
  }catch(err){setError(err instanceof Error?err.message:'Ошибка загрузки дилеров');}
  finally{setLoading(false);}
 },[]);
 useFocusEffect(useCallback(()=>{void load();},[load]));
 const filtered=useMemo(()=>filterDealers(rows,query,filter),[rows,query,filter]);
 const noPin=useMemo(()=>rows.filter(d=>!validDealerPoint(d)).length,[rows]);
 const refresh=async()=>{setRefreshing(true);try{await load();}finally{setRefreshing(false);}};
 return (
  <SafeAreaView style={styles.safe} edges={['top']}>
   <View style={styles.head}>
    <View>
     <Text style={styles.eyebrow}>IDEAL FLOOR · БАЗА ДИЛЕРОВ</Text>
     <Text style={styles.title}>Дилеры</Text>
     <Text style={styles.subtitle}>{rows.length} в базе · {noPin} без отметки</Text>
    </View>
    <View style={styles.counter}><Text style={styles.counterText}>{filtered.length}</Text></View>
   </View>
   <View style={styles.searchWrap}>
    <Text style={styles.searchGlyph}>⌕</Text>
    <TextInput value={query} onChangeText={setQuery} placeholder="Имя, ID, адрес, город…"
      placeholderTextColor="#989AA0" style={styles.search} autoCorrect={false}
      returnKeyType="search" clearButtonMode="while-editing"/>
    {!!query&&<Pressable onPress={()=>setQuery('')} accessibilityLabel="Очистить поиск"
      style={styles.clear}><Text style={styles.clearLabel}>×</Text></Pressable>}
   </View>
   <ScrollView horizontal showsHorizontalScrollIndicator={false}
     contentContainerStyle={styles.filters}>
    {filterOptions.map(item=><Pressable key={item.key}
       onPress={async()=>{setFilter(item.key);await Haptics.selectionAsync();}}
       style={[styles.filter,filter===item.key&&styles.filterActive]}>
      <Text style={[styles.filterText,filter===item.key&&styles.filterTextActive]}>{item.label}</Text>
      {item.key==='unmapped'&&<View style={[styles.miniCount,filter===item.key&&styles.miniCountActive]}>
       <Text style={[styles.miniText,filter===item.key&&styles.miniTextActive]}>{noPin}</Text>
      </View>}
    </Pressable>)}
   </ScrollView>
   {!!error&&<Pressable style={styles.error} onPress={()=>void load()}>
    <Text style={styles.errorText}>{error} · Нажмите, чтобы повторить</Text>
   </Pressable>}
   {loading?<View style={styles.loading}><ActivityIndicator color={colors.brand}/></View>:
   <FlatList data={filtered} keyExtractor={d=>String(d.id||d._id)}
    keyboardShouldPersistTaps="handled"
    contentContainerStyle={styles.list} refreshing={refreshing} onRefresh={refresh}
    removeClippedSubviews maxToRenderPerBatch={12} windowSize={7}
    ListEmptyComponent={<View style={styles.empty}>
      <Text style={styles.emptyIcon}>⌕</Text>
      <Text style={styles.emptyTitle}>Дилеры не найдены</Text>
      <Text style={styles.emptyText}>Проверьте название, ID или уберите фильтры.</Text>
      <Pressable onPress={()=>{setQuery('');setFilter('all');}} style={styles.reset}>
       <Text style={styles.resetText}>Сбросить фильтры</Text>
      </Pressable>
     </View>}
    renderItem={({item})=>{
      const status=String(item.status||'').toLowerCase();
      return (
       <Pressable onPress={()=>router.push({pathname:'/dealer/[id]',params:{id:String(item.id||item._id)}})}
         style={({pressed})=>[styles.card,pressed&&styles.pressed]}>
        <View style={[styles.stripe,status==='problem'&&styles.problemStripe]}/>
        <View style={styles.cardInner}>
         <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={2}>{item.name}</Text>
          <Text style={styles.arrow}>›</Text>
         </View>
         <View style={styles.infoRow}>
          <Text style={styles.idText}>{item.dealer_id||'Дилер'}</Text>
          <Text style={styles.cityText} numberOfLines={1}>{item.city||'Город не указан'}</Text>
         </View>
         <Text style={styles.address} numberOfLines={2}>⌖  {item.address||'Адрес не указан'}</Text>
         <View style={styles.footer}>
          <Text style={[styles.status,status==='problem'&&styles.problemStatus]}>{dealerStatus(item.status)}</Text>
          {!validDealerPoint(item)&&<Text style={styles.unmapped}>○ Без точки</Text>}
         </View>
        </View>
       </Pressable>
      );
    }}
   />}
  </SafeAreaView>
 );
}
const styles=StyleSheet.create({
 safe:{flex:1,backgroundColor:colors.background},
 head:{paddingHorizontal:18,paddingTop:15,paddingBottom:12,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
 eyebrow:{color:colors.brand,fontSize:10,fontWeight:'900',letterSpacing:1.2},
 title:{color:colors.ink,fontSize:30,fontWeight:'900',letterSpacing:-.8,marginTop:3},
 subtitle:{color:colors.muted,fontSize:11,fontWeight:'600',marginTop:3},
 counter:{minWidth:48,height:42,backgroundColor:colors.ink,borderRadius:14,paddingHorizontal:9,alignItems:'center',justifyContent:'center'},
 counterText:{color:'#fff',fontSize:17,fontWeight:'900'},
 searchWrap:{height:48,marginHorizontal:16,flexDirection:'row',alignItems:'center',backgroundColor:'#fff',borderWidth:1,borderColor:colors.border,borderRadius:14,paddingHorizontal:12},
 searchGlyph:{fontSize:24,color:'#93959C',marginRight:8},
 search:{flex:1,fontSize:14,color:colors.ink},
 clear:{width:25,height:25,borderRadius:13,backgroundColor:'#F4F2F1',alignItems:'center',justifyContent:'center'},
 clearLabel:{fontSize:21,color:colors.muted,lineHeight:24},
 filters:{paddingHorizontal:16,paddingVertical:10,gap:7,alignItems:'center'},
 filter:{height:35,flexDirection:'row',gap:5,alignItems:'center',paddingHorizontal:12,borderWidth:1,borderColor:'#E3DFDB',borderRadius:11,backgroundColor:'#fff'},
 filterActive:{backgroundColor:'#27282D',borderColor:'#27282D'},
 filterText:{fontSize:11,fontWeight:'800',color:'#676A71'},
 filterTextActive:{color:'#fff'},
 miniCount:{backgroundColor:'#F0EEEA',paddingHorizontal:5,paddingVertical:2,borderRadius:5},
 miniCountActive:{backgroundColor:'#4D4E54'},
 miniText:{color:'#696B70',fontSize:10,fontWeight:'900'},
 miniTextActive:{color:'#fff'},
 list:{paddingHorizontal:16,paddingBottom:24,gap:9},
 card:{flexDirection:'row',overflow:'hidden',borderWidth:1,borderColor:'#EAE6E2',borderRadius:17,backgroundColor:'#fff'},
 stripe:{width:4,backgroundColor:colors.brand},
 problemStripe:{backgroundColor:'#D59A25'},
 cardInner:{flex:1,minWidth:0,paddingHorizontal:13,paddingVertical:12},
 pressed:{opacity:.82,transform:[{scale:.997}]},
 nameRow:{flexDirection:'row',alignItems:'center',gap:8},
 name:{flex:1,color:colors.ink,fontSize:14,fontWeight:'900'},
 arrow:{color:'#A5A6AD',fontSize:23,lineHeight:22},
 infoRow:{marginTop:5,flexDirection:'row',gap:9,alignItems:'center'},
 idText:{color:colors.brand,fontWeight:'800',fontSize:10},
 cityText:{color:'#777981',fontWeight:'600',fontSize:10,flex:1},
 address:{color:'#747781',fontSize:11,marginTop:6,lineHeight:16},
 footer:{marginTop:9,flexDirection:'row',gap:7,alignItems:'center',justifyContent:'space-between'},
 status:{color:'#56585F',fontSize:10,fontWeight:'800',backgroundColor:'#F5F4F2',paddingHorizontal:8,paddingVertical:4,borderRadius:7},
 problemStatus:{color:'#9F6712',backgroundColor:'#FFF3D9'},
 unmapped:{color:'#A7742E',fontSize:10,fontWeight:'700'},
 loading:{flex:1,alignItems:'center',justifyContent:'center'},
 error:{marginHorizontal:16,marginBottom:6,padding:11,backgroundColor:'#FFF2F2',borderRadius:10},
 errorText:{color:colors.brand,fontSize:11,fontWeight:'700'},
 empty:{padding:36,alignItems:'center',gap:9},
 emptyIcon:{fontSize:35,color:colors.muted},
 emptyTitle:{fontSize:15,fontWeight:'900',color:colors.ink},
 emptyText:{fontSize:11,color:colors.muted,textAlign:'center'},
 reset:{paddingHorizontal:16,paddingVertical:10,borderRadius:10,backgroundColor:colors.ink},
 resetText:{fontSize:11,fontWeight:'800',color:'#fff'}
});
