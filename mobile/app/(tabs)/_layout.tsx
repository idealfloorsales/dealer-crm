import { Redirect, Tabs } from 'expo-router';
import { Text } from 'react-native';
import { colors } from '@/theme';
import { useAuth } from '@/context/auth';

const TabIcon = ({ symbol, focused }: { symbol: string; focused: boolean }) => (
  <Text style={{ fontSize: focused ? 21 : 19, opacity: focused ? 1 : 0.58 }}>{symbol}</Text>
);

export default function TabsLayout() {
  const { ready, user } = useAuth();
  if (!ready) return null;
  if (!user) return <Redirect href="/login" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: '#969AA1',
        tabBarLabelStyle: { fontSize: 10, fontWeight: '800', marginTop: 1 },
        tabBarStyle: {
          height: 70,
          paddingTop: 8,
          paddingBottom: 9,
          borderTopColor: colors.border,
          backgroundColor: '#FFFFFF',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Главная',
          tabBarIcon: ({ focused }) => <TabIcon symbol="⌂" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="dealers"
        options={{
          title: 'Дилеры',
          tabBarIcon: ({ focused }) => <TabIcon symbol="▦" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: 'Карта',
          tabBarIcon: ({ focused }) => <TabIcon symbol="⌖" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="sales"
        options={{
          title: 'Продажи',
          tabBarIcon: ({ focused }) => <TabIcon symbol="↗" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'Ещё',
          tabBarIcon: ({ focused }) => <TabIcon symbol="•••" focused={focused} />,
        }}
      />
    </Tabs>
  );
}
