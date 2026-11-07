import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/theme';

type Props = {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  right?: ReactNode;
};

export function Page({ title, eyebrow, children, refreshing = false, onRefresh, right }: Props) {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />
          ) : undefined
        }
      >
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            {!!eyebrow && <Text style={styles.eyebrow}>{eyebrow}</Text>}
            <Text style={styles.title}>{title}</Text>
          </View>
          {right}
        </View>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 28 },
  header: {
    minHeight: 66,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerCopy: { flex: 1 },
  eyebrow: { color: colors.brand, fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  title: { marginTop: 3, color: colors.ink, fontSize: 28, fontWeight: '900', letterSpacing: -0.7 },
});
