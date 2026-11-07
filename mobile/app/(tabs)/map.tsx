import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiFetch } from '@/lib/api';
import { colors, radius, shadow } from '@/theme';
import type { Dealer } from '@/types';

const ASTANA: Region = {
  latitude: 51.1694,
  longitude: 71.4491,
  latitudeDelta: 0.22,
  longitudeDelta: 0.22,
};

export default function MapScreen() {
  const map = useRef<MapView>(null);
  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [loading, setLoading] = useState(true);
  const [locationBusy, setLocationBusy] = useState(false);

  useEffect(() => {
    apiFetch<Dealer[]>('/api/dealers?view=map')
      .then(setDealers)
      .finally(() => setLoading(false));
  }, []);

  const points = useMemo(
    () => dealers.filter(d => Number.isFinite(Number(d.latitude)) && Number.isFinite(Number(d.longitude))),
    [dealers],
  );

  const goToMe = async () => {
    setLocationBusy(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') return;
      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      map.current?.animateToRegion(
        {
          latitude: current.coords.latitude,
          longitude: current.coords.longitude,
          latitudeDelta: 0.045,
          longitudeDelta: 0.045,
        },
        450,
      );
      await Haptics.selectionAsync();
    } finally {
      setLocationBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topCard}>
        <View>
          <Text style={styles.eyebrow}>РАБОТА В ПОЛЕ</Text>
          <Text style={styles.title}>Карта дилеров</Text>
          <Text style={styles.meta}>{points.length} точек с координатами</Text>
        </View>
        <Pressable onPress={goToMe} style={styles.locationButton}>
          {locationBusy ? <ActivityIndicator size="small" color={colors.brand} /> : <Text style={styles.locationIcon}>⌖</Text>}
        </Pressable>
      </View>

      <MapView ref={map} style={styles.map} initialRegion={ASTANA} showsUserLocation>
        {points.map(dealer => (
          <Marker
            key={dealer.id}
            coordinate={{ latitude: Number(dealer.latitude), longitude: Number(dealer.longitude) }}
            title={dealer.name}
            description={[dealer.city, dealer.address].filter(Boolean).join(' · ')}
            pinColor={String(dealer.status || '').toLowerCase() === 'potential' ? '#777777' : colors.brand}
            onCalloutPress={() =>
              router.push({ pathname: '/dealer/[id]', params: { id: dealer.id } })
            }
          />
        ))}
      </MapView>

      {loading && (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.brand} />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  map: { flex: 1 },
  topCard: {
    position: 'absolute',
    zIndex: 5,
    top: 12,
    left: 14,
    right: 14,
    padding: 15,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...shadow,
  },
  eyebrow: { color: colors.brand, fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  title: { marginTop: 2, color: colors.ink, fontSize: 18, fontWeight: '900' },
  meta: { marginTop: 2, color: colors.muted, fontSize: 10 },
  locationButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#F5ECEC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationIcon: { color: colors.brand, fontSize: 23, fontWeight: '900' },
  loading: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(245,245,245,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
