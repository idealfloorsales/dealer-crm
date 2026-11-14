import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Page } from '@/components/Page';
import { MetricCard } from '@/components/MetricCard';
import { useAuth } from '@/context/auth';
import { apiFetch } from '@/lib/api';
import { colors, radius } from '@/theme';
import type { Dealer, SaleRow } from '@/types';

const currentMonth = () => {
  const date = new Date();
  return String(date.getFullYear()) + '-' + String(date.getMonth() + 1).padStart(2, '0');
};

export default function DashboardScreen() {
  const { user, can } = useAuth();
  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const [dealerRows, saleRows] = await Promise.all([
        can('can_view_dealers')
          ? apiFetch<Dealer[]>('/api/dealers')
          : Promise.resolve([]),
        can('can_view_sales')
          ? apiFetch<SaleRow[]>('/api/sales?month=' + currentMonth())
          : Promise.resolve([]),
      ]);
      setDealers(dealerRows);
      setSales(saleRows);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить данные');
    }
  }, [can]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const refresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  const summary = useMemo(() => {
    const fact = sales
      .filter(row => !String(row.dealerId || '').startsWith('PLAN_'))
      .reduce((sum, row) => sum + (Number(row.fact) || 0), 0);

    const planRows = sales.filter(row => String(row.dealerId || '').startsWith('PLAN_'));
    const preferredPlan =
      planRows.find(row => /_all$/.test(String(row.dealerId || ''))) ||
      planRows[0];
    const plan = Number(preferredPlan?.plan || 0);

    const active = dealers.filter(d => !['archive', 'potential'].includes(String(d.status || '').toLowerCase())).length;
    const potential = dealers.filter(d => String(d.status || '').toLowerCase() === 'potential').length;

    return {
      fact,
      plan,
      progress: plan > 0 ? Math.round((fact / plan) * 100) : 0,
      active,
      potential,
    };
  }, [dealers, sales]);

  return (
    <Page
      eyebrow="IDEAL FLOOR CRM"
      title={user?.fullName ? `Здравствуйте, ${user.fullName.split(' ')[0]}` : 'Главная'}
      refreshing={refreshing}
      onRefresh={refresh}
    >
      {!!error && <Text style={styles.error}>{error}</Text>}

      <View style={styles.metrics}>
        <MetricCard
          label="ПРОДАЖИ ЗА МЕСЯЦ"
          value={can('can_view_sales') ? `${summary.fact.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} м²` : '—'}
          note="Фактический объём"
          accent
        />
        <MetricCard
          label="ВЫПОЛНЕНИЕ ПЛАНА"
          value={summary.plan > 0 ? `${summary.progress}%` : '—'}
          note={summary.plan > 0 ? `План: ${summary.plan.toLocaleString('ru-RU')} м²` : 'План не задан'}
        />
        <MetricCard
          label="РАБОЧИЕ ДИЛЕРЫ"
          value={String(summary.active)}
          note="Без потенциальных и архива"
        />
        <MetricCard
          label="ПОТЕНЦИАЛЬНЫЕ"
          value={String(summary.potential)}
          note="В базе CRM"
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionEyebrow}>СЕГОДНЯ</Text>
        <Text style={styles.sectionTitle}>Работа в поле</Text>
        <Pressable style={({pressed}) => [styles.fieldCard, pressed && {opacity:.84}]} onPress={() => router.navigate('/(tabs)/map')}>
          <View style={styles.fieldIcon}>
            <Text style={styles.fieldIconText}>↗</Text>
          </View>
          <View style={styles.fieldCopy}>
            <Text style={styles.fieldTitle}>Дилеры, карта и визиты</Text>
            <Text style={styles.fieldText}>
              Найдите ближайший магазин, проверьте адрес или отметьте новую точку на карте.
            </Text>
          </View>
          <Text style={styles.fieldChevron}>›</Text>
        </Pressable>
        <View style={styles.quickRow}>
          <Pressable onPress={() => router.navigate('/(tabs)/dealers')} style={styles.quickButton}>
            <Text style={styles.quickIcon}>▦</Text><Text style={styles.quickText}>Все дилеры</Text>
          </Pressable>
          <Pressable onPress={() => router.navigate('/(tabs)/sales')} style={styles.quickButton}>
            <Text style={styles.quickIcon}>↗</Text><Text style={styles.quickText}>Продажи</Text>
          </Pressable>
        </View>
      </View>
    </Page>
  );
}

const styles = StyleSheet.create({
  error: {
    marginBottom: 10,
    padding: 10,
    borderRadius: radius.md,
    backgroundColor: '#FCECEE',
    color: colors.danger,
    fontSize: 12,
    fontWeight: '700',
  },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  section: { marginTop: 22 },
  sectionEyebrow: { color: colors.brand, fontSize: 10, fontWeight: '900', letterSpacing: 1.3 },
  sectionTitle: { marginTop: 3, color: colors.ink, fontSize: 19, fontWeight: '900' },
  fieldCard: {
    marginTop: 10,
    padding: 16,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  fieldIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#F6EDEE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldIconText: { color: colors.brand, fontSize: 22, fontWeight: '900' },
  fieldCopy: { flex: 1 },
  fieldTitle: { color: colors.ink, fontSize: 14, fontWeight: '900' },
  fieldText: { marginTop: 3, color: colors.muted, fontSize: 12, lineHeight: 17 },
  fieldChevron:{color:'#A3A4AB',fontSize:24,marginLeft:3},
  quickRow:{flexDirection:'row',gap:9,marginTop:10},
  quickButton:{flex:1,minHeight:51,borderRadius:13,borderWidth:1,borderColor:colors.border,
    backgroundColor:'#fff',alignItems:'center',justifyContent:'center',flexDirection:'row',gap:8},
  quickIcon:{color:colors.brand,fontSize:20,fontWeight:'900'},
  quickText:{color:colors.ink,fontSize:12,fontWeight:'800'},
});
