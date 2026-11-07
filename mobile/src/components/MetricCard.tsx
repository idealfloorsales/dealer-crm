import { StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '@/theme';

export function MetricCard({
  label,
  value,
  note,
  accent = false,
}: {
  label: string;
  value: string;
  note?: string;
  accent?: boolean;
}) {
  return (
    <View style={[styles.card, accent && styles.accent]}>
      <Text style={[styles.label, accent && styles.accentLabel]}>{label}</Text>
      <Text style={[styles.value, accent && styles.accentValue]}>{value}</Text>
      {!!note && <Text style={[styles.note, accent && styles.accentNote]}>{note}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 145,
    padding: 15,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  accent: { backgroundColor: colors.ink, borderColor: colors.ink },
  label: { color: colors.muted, fontSize: 10, fontWeight: '800' },
  value: { marginTop: 6, color: colors.ink, fontSize: 22, fontWeight: '900' },
  note: { marginTop: 4, color: colors.muted, fontSize: 10, lineHeight: 14 },
  accentLabel: { color: '#B9BBC0' },
  accentValue: { color: '#FFFFFF' },
  accentNote: { color: '#B9BBC0' },
});
