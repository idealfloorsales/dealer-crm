import { Redirect, Tabs } from 'expo-router';
import { Text, View, StyleSheet } from 'react-native';
import { colors } from '@/theme';
import { useAuth } from '@/context/auth';

function TabIcon({ symbol, focused }: { symbol: string; focused: boolean }) {
  return (
    <View style={[styles.icon,focused&&styles.selected]}>
      <Text style={[styles.symbol,focused&&styles.symbolSelected]}>{symbol}</Text>
    </View>
  );
}
export default function TabsLayout() {
  const { ready,user }=useAuth();
  if(!ready)return null;
  if(!user)return <Redirect href="/login" />;
  return (
    <Tabs screenOptions={{
      headerShown:false,
      tabBarHideOnKeyboard:true,
      tabBarActiveTintColor:colors.brand,
      tabBarInactiveTintColor:'#8A8E96',
      tabBarLabelStyle:{fontSize:10,fontWeight:'800',marginTop:1},
      tabBarItemStyle:{paddingTop:2},
      tabBarStyle:{
        height:72,paddingTop:5,paddingBottom:9,
        backgroundColor:'#FFFFFF',borderTopWidth:1,borderTopColor:'#E8E6E3',
        elevation:14,shadowColor:'#17181B',shadowOpacity:.08,shadowRadius:15
      }
    }}>
      <Tabs.Screen name="index" options={{title:'Главная',tabBarIcon:({focused})=><TabIcon symbol="⌂" focused={focused}/>}}/>
      <Tabs.Screen name="dealers" options={{title:'Дилеры',tabBarIcon:({focused})=><TabIcon symbol="▦" focused={focused}/>}}/>
      <Tabs.Screen name="map" options={{title:'Карта',tabBarIcon:({focused})=><TabIcon symbol="⌖" focused={focused}/>}}/>
      <Tabs.Screen name="sales" options={{title:'Продажи',tabBarIcon:({focused})=><TabIcon symbol="↗" focused={focused}/>}}/>
      <Tabs.Screen name="more" options={{title:'Ещё',tabBarIcon:({focused})=><TabIcon symbol="···" focused={focused}/>}}/>
    </Tabs>
  );
}
const styles=StyleSheet.create({
  icon:{width:50,height:30,borderRadius:12,alignItems:'center',justifyContent:'center'},
  selected:{backgroundColor:'#FFF0F0'},
  symbol:{fontSize:21,color:'#969AA2',fontWeight:'800'},
  symbolSelected:{color:colors.brand}
});
