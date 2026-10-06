import { View } from 'react-native';
import { statusTone, toneColors, type Tone } from '@crm/tokens';
import { useTheme } from '@/providers/ThemeProvider';
import { Text } from './Text';

/** Pill badge (prototype `.badge`). */
export function Badge({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
  const { colors, radius } = useTheme();
  const { bg, fg } = toneColors(colors, tone);
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        backgroundColor: bg,
        borderRadius: radius.full,
        paddingHorizontal: 9,
        paddingVertical: 3,
      }}
    >
      <Text variant="caption" weight="black" style={{ color: fg }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const STATUS_LABEL: Record<string, string> = { active: 'Active', inactive: 'Inactive', draft: 'Draft' };

/** Account / product / license status badge using the shared `statusTone` map. */
export function StatusBadge({ status }: { status: string }) {
  return <Badge label={STATUS_LABEL[status] ?? status} tone={statusTone[status] ?? 'neutral'} />;
}
