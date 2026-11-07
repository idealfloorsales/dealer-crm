import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Page } from '@/components/Page';
import { MetricCard } from '@/components/MetricCard';
import { apiFetch } from '@/lib/api';
import { colors, radius } from '@/theme';
import type { SaleRow } from '@/types';

function shiftMonth(month: string, delta: number) {
  const [year, monthNumber] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}

function monthLabel(month: string) {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(year, monthNumber - 1, 1).toLocaleDateString('ru-RU', {
    month: 'long',
    year: 'numeric',
  });
}

export default function SalesScreen() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [rows, setRows] = useState<SaleRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRows(await apiFetch<SaleRow[]>('/api/sales?month=' + encodeURIComponent(month)));
  }, [month]);

  useEffect(() => {
    load().catch(() => setRows([]));
  }, [load]);

  const stats = useMemo(() => {
    const dealerRows = rows.filter(row => !String(row.dealerId || '').startsWith('PLAN_'));
    const fact = dealerRows.reduce((sum, row) => sum + (Number(row.fact) || 0), 0);
    const plans = rows.filter(row => String(row.dealerId || '').startsWith('PLAN_'));
    const plan = Number((plans.find(row => /_all$/.test(String(row.dealerId || ''))) || plans[0])?.plan || 0);
    return {
      fact,
      plan,
      progress: plan > 0 ? Math.round((fact / plan) * 100) : 0,
      dealers: dealerRows
        .filter(row => Number(row.fact) > 0)
        .sort((a, b) => Number(b.fact || 0) - Number(a.fact || 0)),
    };
  }, [rows]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Page eyebrow="ПЛАН · ФАКТ" title="Продажи" refreshing={refreshing} onRefresh={refresh}>
      <View style={styles.monthBar}>
        <Pressable onPress={() => setMonth(value => shiftMonth(value, -1))} style={styles.monthButton}>
          <Text style={styles.monthArrow}>‹</Text>
        </Pressable>
        <Text style={styles.monthText}>{monthLabel(month)}</Text>
        <Pressable onPress={() => setMonth(value => shiftMonth(value, 1))} style={styles.monthButton}>
          <Text style={styles.monthArrow}>›</Text>
        </Pressable>
      </View>

      <View style={styles.metrics}>
        <MetricCard label="ФАКТ" value={stats.fact.toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' м²'} accent />
        <MetricCard label="ПЛАН" value={stats.plan ? stats.plan.toLocaleString('ru-RU') + ' м²' : '—'} />
        <MetricCard label="ВЫПОЛНЕНИЕ" value={stats.plan ? stats.progress + '%' : '—'} />
      </View>

      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>Продажи по дилерам</Text>
        <Text style={styles.sectionCount}>{stats.dealers.length}</Text>
      </View>

      <View style={styles.list}>
        {stats.dealers.length ? (
          stats.dealers.map((row, index) => (
            <View key={row.id || row._id || row.dealerId || String(index)} style={styles.row}>
              <View style={styles.rank}><Text style={styles.rankText}>{index + 1}</Text></View>
              <View style={styles.rowCopy}>
                <Text numberOfLines={1} style={styles.dealer}>{row.dealerName || 'Дилер'}</Text>
                <Text style={styles.group}>{row.group || '—'}</Text>
              </View>
              <Text style={styles.fact}>{Number(row.fact || 0).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} м²</Text>
            </View>
          ))
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Продаж за этот месяц пока нет</Text>
          </View>
        )}
      </View>
    </Page>
  );
}

const styles = StyleSheet.create({
  monthBar: {
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  monthButton: { width: 50, height: '100%', alignItems: 'center', justifyContent: 'center' },
  monthArrow: { color: colors.ink, fontSize: 28, lineHeight: 28 },
  monthText: { color: colors.ink, fontWeight: '900', textTransform: 'capitalize' },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  sectionHead: { marginTop: 22, marginBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { color: colors.ink, fontSize: 18, fontWeight: '900' },
  sectionCount: { color: colors.muted, fontSize: 12, fontWeight: '800' },
  list: { gap: 8 },
  row: {
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rank: { width: 30, height: 30, borderRadius: 10, backgroundColor: '#F5EDEE', alignItems: 'center', justifyContent: 'center' },
  rankText: { color: colors.brand, fontSize: 11, fontWeight: '900' },
  rowCopy: { flex: 1, minWidth: 0 },
  dealer: { color: colors.ink, fontSize: 13, fontWeight: '900' },
  group: { marginTop: 2, color: colors.muted, fontSize: 10 },
  fact: { color: colors.brand, fontSize: 12, fontWeight: '900' },
  empty: { padding: 30, alignItems: 'center' },
  emptyTitle: { color: colors.muted, fontSize: 12, fontWeight: '700' },
});
