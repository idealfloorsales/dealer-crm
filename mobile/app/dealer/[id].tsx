import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/context/auth';
import { colors, radius, shadow } from '@/theme';
import type { Dealer, MotivationScheme } from '@/types';

function formatDate(value?: string) {
  if (!value) return 'без ограничения';
  return value.split('-').reverse().join('.');
}

function cleanPhone(value?: string) {
  if (!value) return '';
  const match = value.match(/\+?[\d\s()\-]{7,}/);
  return match ? match[0].replace(/[^+\d]/g, '') : '';
}

export default function DealerDetailsScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = String(params.id || '');
  const { can } = useAuth();
  const [dealer, setDealer] = useState<Dealer | null>(null);
  const [loading, setLoading] = useState(true);
  const [visitOpen, setVisitOpen] = useState(false);
  const [visitComment, setVisitComment] = useState('');
  const [visitSaving, setVisitSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    setError('');
    try {
      setDealer(await apiFetch<Dealer>('/api/dealers/' + encodeURIComponent(id) + '?view=profile'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить дилера');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const motivation =
    dealer?.motivation_scheme && typeof dealer.motivation_scheme === 'object'
      ? (dealer.motivation_scheme as MotivationScheme)
      : null;

  const phone = cleanPhone(dealer?.contacts?.[0]?.contactInfo);

  const saveVisit = async () => {
    if (!visitComment.trim()) return;
    setVisitSaving(true);
    try {
      await apiFetch('/api/dealers/' + encodeURIComponent(id) + '/visits', {
        method: 'POST',
        body: JSON.stringify({
          date: new Date().toISOString().slice(0, 10),
          comment: visitComment.trim(),
          isCompleted: true,
        }),
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setVisitOpen(false);
      setVisitComment('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить визит');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setVisitSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator color={colors.brand} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <View style={styles.topCopy}>
          <Text style={styles.topEyebrow}>КАРТОЧКА ДИЛЕРА</Text>
          <Text numberOfLines={1} style={styles.topTitle}>{dealer?.name || 'Дилер'}</Text>
        </View>
        <Pressable
          onPress={() => router.push({pathname:'/module/[key]',params:{key:'dealer',id}})}
          style={styles.webButton}
        >
          <Text style={styles.webText}>Все разделы</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {!!error && <Text style={styles.error}>{error}</Text>}

        <View style={styles.hero}>
          <View style={styles.heroAvatar}>
            <Text style={styles.heroAvatarText}>{dealer?.name?.[0]?.toUpperCase() || 'D'}</Text>
          </View>
          <View style={styles.heroCopy}>
            <Text style={styles.heroName}>{dealer?.name}</Text>
            <Text style={styles.heroMeta}>
              {[dealer?.dealer_id, dealer?.city, dealer?.status].filter(Boolean).join(' · ')}
            </Text>
            <Text style={styles.heroAddress}>{dealer?.address || 'Адрес не указан'}</Text>
          </View>
        </View>

        <View style={styles.actions}>
          {phone ? (
            <Pressable onPress={() => Linking.openURL('tel:' + phone)} style={styles.action}>
              <Text style={styles.actionIcon}>☎</Text>
              <Text style={styles.actionText}>Позвонить</Text>
            </Pressable>
          ) : null}

          {dealer?.address ? (
            <Pressable
              onPress={() =>
                Linking.openURL('https://2gis.kz/search/' + encodeURIComponent([dealer.city,dealer.address,dealer.name].filter(Boolean).join(' ')))
              }
              style={styles.action}
            >
              <Text style={styles.actionIcon}>⌖</Text>
              <Text style={styles.actionText}>Маршрут</Text>
            </Pressable>
          ) : null}

          {can('can_manage_visits') ? (
            <Pressable onPress={() => setVisitOpen(true)} style={[styles.action, styles.actionAccent]}>
              <Text style={[styles.actionIcon, styles.actionAccentText]}>✓</Text>
              <Text style={[styles.actionText, styles.actionAccentText]}>Визит</Text>
            </Pressable>
          ) : null}
        </View>

        <Section title="Контакты">
          {dealer?.contacts?.length ? (
            dealer.contacts.map((contact, index) => (
              <View key={index} style={styles.lineItem}>
                <View style={styles.lineCopy}>
                  <Text style={styles.lineTitle}>{contact.name || 'Контакт'}</Text>
                  <Text style={styles.lineMeta}>{contact.position || '—'}</Text>
                </View>
                <Text style={styles.lineValue}>{contact.contactInfo || '—'}</Text>
              </View>
            ))
          ) : (
            <Empty text="Контакты не заполнены" />
          )}
        </Section>

        <Section title="Мотивация">
          {motivation ? (
            <View style={styles.motivation}>
              <View>
                <Text style={styles.motivationLabel}>СХЕМА</Text>
                <Text style={styles.motivationName}>{motivation.name || 'Мотивация'}</Text>
                <Text style={styles.motivationDates}>
                  {formatDate(motivation.validFrom)} — {formatDate(motivation.validTo)}
                </Text>
              </View>
              <Text style={styles.motivationRate}>
                {Number(motivation.ratePerM2 || 0).toLocaleString('ru-RU')} ₸/м²
              </Text>
            </View>
          ) : (
            <Empty text="Мотивация не назначена" />
          )}
        </Section>

        <Section title="Рабочая информация">
          <View style={styles.infoGrid}>
            <Info label="Ответственный" value={dealer?.responsible || '—'} />
            <Info label="Сектор" value={dealer?.region_sector || '—'} />
          </View>
          {!!dealer?.bonuses && (
            <View style={styles.note}>
              <Text style={styles.noteLabel}>ЗАМЕТКИ</Text>
              <Text style={styles.noteText}>{dealer.bonuses}</Text>
            </View>
          )}
        </Section>
      </ScrollView>

      <Modal
        visible={visitOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setVisitOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.visitSheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetEyebrow}>БЫСТРЫЙ ВИЗИТ</Text>
            <Text style={styles.sheetTitle}>{dealer?.name}</Text>
            <Text style={styles.sheetText}>Что было сделано во время визита?</Text>
            <TextInput
              value={visitComment}
              onChangeText={setVisitComment}
              multiline
              autoFocus
              placeholder="Например: обновили ценники, проверили стенд…"
              placeholderTextColor="#A0A3A9"
              style={styles.visitInput}
            />
            <View style={styles.sheetActions}>
              <Pressable onPress={() => setVisitOpen(false)} style={styles.cancelButton}>
                <Text style={styles.cancelText}>Отмена</Text>
              </Pressable>
              <Pressable
                onPress={saveVisit}
                disabled={visitSaving || !visitComment.trim()}
                style={[styles.saveButton, (visitSaving || !visitComment.trim()) && styles.disabled]}
              >
                {visitSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Сохранить визит</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

function Empty({ text }: { text: string }) {
  return <Text style={styles.empty}>{text}</Text>;
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.info}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  loading: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  topbar: {
    height: 66,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backButton: { width: 40, height: 40, borderRadius: 13, backgroundColor: colors.surfaceSoft, alignItems: 'center', justifyContent: 'center' },
  backText: { color: colors.ink, fontSize: 30, lineHeight: 30 },
  topCopy: { flex: 1, minWidth: 0 },
  topEyebrow: { color: colors.brand, fontSize: 8, fontWeight: '900', letterSpacing: 1.1 },
  topTitle: { marginTop: 2, color: colors.ink, fontSize: 15, fontWeight: '900' },
  webButton: { paddingHorizontal: 11, height: 36, borderRadius: 12, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  webText: { color: '#fff', fontSize: 10, fontWeight: '900' },
  content: { padding: 16, paddingBottom: 30 },
  error: { marginBottom: 10, color: colors.danger, fontSize: 12, fontWeight: '700' },
  hero: {
    padding: 16,
    borderRadius: radius.xl,
    backgroundColor: colors.ink,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    ...shadow,
  },
  heroAvatar: { width: 58, height: 58, borderRadius: 20, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  heroAvatarText: { color: '#fff', fontSize: 21, fontWeight: '900' },
  heroCopy: { flex: 1 },
  heroName: { color: '#fff', fontSize: 18, fontWeight: '900' },
  heroMeta: { marginTop: 3, color: '#B7BBC2', fontSize: 10, fontWeight: '700' },
  heroAddress: { marginTop: 6, color: '#D0D2D6', fontSize: 11, lineHeight: 15 },
  actions: { marginTop: 10, flexDirection: 'row', gap: 8 },
  action: {
    flex: 1,
    minHeight: 58,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionAccent: { backgroundColor: colors.brand, borderColor: colors.brand },
  actionIcon: { color: colors.ink, fontSize: 18, fontWeight: '900' },
  actionText: { marginTop: 2, color: colors.ink, fontSize: 10, fontWeight: '900' },
  actionAccentText: { color: '#fff' },
  section: { marginTop: 20 },
  sectionTitle: { marginBottom: 7, color: colors.ink, fontSize: 16, fontWeight: '900' },
  sectionCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  lineItem: { minHeight: 58, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  lineCopy: { flex: 1 },
  lineTitle: { color: colors.ink, fontSize: 12, fontWeight: '900' },
  lineMeta: { marginTop: 2, color: colors.muted, fontSize: 9 },
  lineValue: { maxWidth: '47%', color: colors.text, fontSize: 11, fontWeight: '700', textAlign: 'right' },
  empty: { padding: 18, color: colors.muted, fontSize: 11, textAlign: 'center' },
  motivation: { padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  motivationLabel: { color: colors.brand, fontSize: 8, fontWeight: '900', letterSpacing: 1.1 },
  motivationName: { marginTop: 2, color: colors.ink, fontSize: 13, fontWeight: '900' },
  motivationDates: { marginTop: 3, color: colors.muted, fontSize: 9 },
  motivationRate: { color: colors.brand, fontSize: 15, fontWeight: '900' },
  infoGrid: { flexDirection: 'row' },
  info: { flex: 1, padding: 14 },
  infoLabel: { color: colors.muted, fontSize: 9, fontWeight: '700' },
  infoValue: { marginTop: 3, color: colors.ink, fontSize: 12, fontWeight: '900' },
  note: { borderTopWidth: 1, borderTopColor: colors.border, padding: 14 },
  noteLabel: { color: colors.muted, fontSize: 8, fontWeight: '900', letterSpacing: 1.1 },
  noteText: { marginTop: 4, color: colors.text, fontSize: 11, lineHeight: 16 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(10,10,12,0.48)' },
  visitSheet: { padding: 18, paddingBottom: 26, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: colors.surface },
  sheetHandle: { alignSelf: 'center', width: 42, height: 4, borderRadius: 99, backgroundColor: '#D5D6D8', marginBottom: 16 },
  sheetEyebrow: { color: colors.brand, fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  sheetTitle: { marginTop: 3, color: colors.ink, fontSize: 20, fontWeight: '900' },
  sheetText: { marginTop: 4, color: colors.muted, fontSize: 11 },
  visitInput: { marginTop: 14, minHeight: 120, borderWidth: 1, borderColor: '#D9DBDF', borderRadius: radius.md, padding: 13, textAlignVertical: 'top', color: colors.ink, fontSize: 14, backgroundColor: '#FBFBFC' },
  sheetActions: { marginTop: 12, flexDirection: 'row', gap: 8 },
  cancelButton: { flex: 0.42, height: 50, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  cancelText: { color: colors.text, fontSize: 12, fontWeight: '900' },
  saveButton: { flex: 1, height: 50, borderRadius: radius.md, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  saveText: { color: '#fff', fontSize: 12, fontWeight: '900' },
  disabled: { opacity: 0.45 },
});
