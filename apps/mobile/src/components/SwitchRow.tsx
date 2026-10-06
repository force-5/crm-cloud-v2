import { Switch, View } from 'react-native';
import { useTheme } from '@/providers/ThemeProvider';
import { haptics } from '@/lib/haptics';
import { Text } from './Text';

export function SwitchRow({
  label,
  description,
  value,
  onValueChange,
  disabled,
}: {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4, opacity: disabled ? 0.7 : 1 }}>
      <View style={{ flex: 1 }}>
        <Text weight="bold">{label}</Text>
        {description ? (
          <Text variant="small" tone="muted">
            {description}
          </Text>
        ) : null}
      </View>
      <Switch
        accessibilityLabel={label}
        value={value}
        disabled={disabled}
        onValueChange={(v) => {
          haptics.tap();
          onValueChange(v);
        }}
        trackColor={{ false: colors.borderStrong, true: colors.primary }}
        thumbColor="#ffffff"
        ios_backgroundColor={colors.borderStrong}
      />
    </View>
  );
}
