import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { apiFetch } from '@/lib/api';
import { colors, radius } from '@/theme';
import type { Dealer } from '@/types';

function statusLabel(status?: string) {
  const map: Record<string, string> = {
    active: 'Активный',
    standard: 'Стандарт',
    potential: 'Потенциальный',
    problem: 'Проблемный',
    archive: 'Архив',
  };
  return map[String(status || '').toLowerCase()] || status || 'Без статуса';
}

export default function DealersScreen() {
  const [rows, setRows] = useState<Dealer[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setRows(await apiFetch<Dealer[]>('/api/dealers'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки дилеров');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return rows;
    return rows.filter(d =>
      [d.name, d.city, d.address, d.dealer_id]
        .filter(Boolean)
        .some(part => String(part).toLowerCase().includes(value)),
    );
  }, [rows, query]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.head}>
        <View>
          <Text style={styles.eyebrow}>БАЗА CRM</Text>
          <Text style={styles.title}>Дилеры</Text>
        </View>
        <View style={styles.countBadge}>
          <Text style={styles.count}>{filtered.length}</Text>
        </View>
      </View>

      <View style={styles.searchWrap}>
        <Text style={styles.searchIcon}>⌕</Text>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Название, город, ID…"
          placeholderTextColor="#9B9EA5"
          style={styles.search}
          autoCorrect={false}
        />
      </View>

      {!!error && <Text style={styles.error}>{error}</Text>}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          refreshing={refreshing}
          onRefresh={refresh}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable
              onPress={async () => {
                await Haptics.selectionAsync();
                router.push({ pathname: '/dealer/[id]', params: { id: item.id } });
              }}
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{item.name?.trim()?.[0]?.toUpperCase() || 'D'}</Text>
              </View>
              <View style={styles.copy}>
                <View style={styles.nameRow}>
                  <Text numberOfLines={1} style={styles.name}>{item.name}</Text>
                  <Text style={styles.arrow}>›</Text>
                </View>
                <Text numberOfLines={1} style={styles.meta}>
                  {[item.dealer_id, item.city].filter(Boolean).join(' · ') || '—'}
                </Text>
                <View style={styles.bottomRow}>
                  <Text numberOfLines={1} style={styles.address}>{item.address || 'Адрес не указан'}</Text>
                  <Text style={styles.status}>{statusLabel(item.status)}</Text>
                </View>
              </View>
            </Pressable>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Ничего не найдено</Text>
              <Text style={styles.emptyText}>Измените поисковый запрос.</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  head: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  eyebrow: { color: colors.brand, fontSize: 10, fontWeight: '900', letterSpacing: 1.3 },
  title: { marginTop: 2, color: colors.ink, fontSize: 28, fontWeight: '900' },
  countBadge: {
    minWidth: 42,
    height: 34,
    borderRadius: 12,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  count: { color: '#fff', fontWeight: '900' },
  searchWrap: {
    marginHorizontal: 16,
    height: 50,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
  },
  searchIcon: { fontSize: 20, color: colors.muted, marginRight: 8 },
  search: { flex: 1, fontSize: 15, color: colors.ink },
  error: { margin: 16, color: colors.danger, fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 16, gap: 9, paddingBottom: 30 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 13,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  cardPressed: { opacity: 0.82, transform: [{ scale: 0.995 }] },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#F4E9EA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.brand, fontSize: 18, fontWeight: '900' },
  copy: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flex: 1, color: colors.ink, fontSize: 15, fontWeight: '900' },
  arrow: { color: '#A0A3A9', fontSize: 24, lineHeight: 22 },
  meta: { marginTop: 2, color: colors.muted, fontSize: 11, fontWeight: '700' },
  bottomRow: { marginTop: 7, flexDirection: 'row', alignItems: 'center', gap: 8 },
  address: { flex: 1, color: '#858990', fontSize: 11 },
  status: {
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: '#F3F3F4',
    color: '#676A70',
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 9,
    fontWeight: '800',
  },
  empty: { padding: 40, alignItems: 'center' },
  emptyTitle: { color: colors.ink, fontWeight: '900' },
  emptyText: { marginTop: 4, color: colors.muted, fontSize: 12 },
});
