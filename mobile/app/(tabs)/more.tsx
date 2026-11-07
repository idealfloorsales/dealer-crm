import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Page } from '@/components/Page';
import { useAuth } from '@/context/auth';
import { API_BASE_URL } from '@/lib/api';
import { colors, radius } from '@/theme';

const modules = [
  { title: 'Цены и КП', path: '/pricing.html', permission: 'can_view_pricing' },
  { title: 'Рекламации', path: '/reclamations.html', permission: 'can_view_reclamations' },
  { title: 'Цех', path: '/workshop.html', permission: 'can_view_workshop' },
  { title: 'Конкуренты', path: '/competitors.html', permission: 'can_view_competitors' },
  { title: 'Отчёты', path: '/report.html', permission: 'can_view_report' },
];

export default function MoreScreen() {
  const { user, signOut, can } = useAuth();

  return (
    <Page eyebrow="АККАУНТ И МОДУЛИ" title="Ещё">
      <View style={styles.profile}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{user?.fullName?.[0]?.toUpperCase() || user?.username?.[0]?.toUpperCase() || 'U'}</Text>
        </View>
        <View style={styles.profileCopy}>
          <Text style={styles.name}>{user?.fullName || user?.username}</Text>
          <Text style={styles.meta}>{[user?.role, user?.scope].filter(Boolean).join(' · ')}</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Остальные модули</Text>
      <View style={styles.moduleList}>
        {modules.filter(item => can(item.permission)).map(item => (
          <Pressable
            key={item.path}
            onPress={() => Linking.openURL(API_BASE_URL + item.path)}
            style={({ pressed }) => [styles.moduleRow, pressed && styles.pressed]}
          >
            <Text style={styles.moduleTitle}>{item.title}</Text>
            <Text style={styles.moduleMeta}>Открыть веб-модуль</Text>
            <Text style={styles.arrow}>›</Text>
          </Pressable>
        ))}
      </View>

      <Pressable onPress={signOut} style={styles.logout}>
        <Text style={styles.logoutText}>Выйти из аккаунта</Text>
      </Pressable>

      <Text style={styles.version}>IDEAL FLOOR CRM Mobile · 0.1.0</Text>
    </Page>
  );
}

const styles = StyleSheet.create({
  profile: {
    padding: 16,
    borderRadius: radius.lg,
    backgroundColor: colors.ink,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 17, fontWeight: '900' },
  profileCopy: { flex: 1 },
  name: { color: '#fff', fontSize: 15, fontWeight: '900' },
  meta: { marginTop: 3, color: '#B7B9BF', fontSize: 11 },
  sectionTitle: { marginTop: 22, marginBottom: 8, color: colors.ink, fontSize: 17, fontWeight: '900' },
  moduleList: { gap: 7 },
  moduleRow: {
    minHeight: 58,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    justifyContent: 'center',
  },
  pressed: { opacity: 0.82 },
  moduleTitle: { color: colors.ink, fontSize: 13, fontWeight: '900' },
  moduleMeta: { marginTop: 2, color: colors.muted, fontSize: 10 },
  arrow: { position: 'absolute', right: 14, top: 15, color: '#A2A5AA', fontSize: 24 },
  logout: {
    marginTop: 22,
    height: 50,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#EACDCF',
    backgroundColor: '#FFF6F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutText: { color: colors.brand, fontWeight: '900', fontSize: 13 },
  version: { marginTop: 18, textAlign: 'center', color: '#A0A3A9', fontSize: 10 },
});
