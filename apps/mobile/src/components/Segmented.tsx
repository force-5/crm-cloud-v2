import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '@/providers/ThemeProvider';
import { haptics } from '@/lib/haptics';
import { Text } from './Text';

export type SegmentOption<T extends string> = { value: T; label: string; disabled?: boolean };

/** Prototype-style segmented control: muted track with a raised "on" pill. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  style,
  disabled,
}: {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
}) {
  const { colors, radius, scheme } = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      style={[
        {
          flexDirection: 'row',
          backgroundColor: colors.surfaceMuted,
          borderRadius: radius.md,
          padding: 3,
          opacity: disabled ? 0.6 : 1,
        },
        style,
      ]}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on, disabled: disabled || o.disabled }}
            disabled={disabled || o.disabled}
            onPress={() => {
              if (!on) {
                haptics.tap();
                onChange(o.value);
              }
            }}
            style={{
              flex: 1,
              minHeight: 34,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: radius.sm,
              paddingHorizontal: 8,
              backgroundColor: on ? (scheme === 'dark' ? colors.borderStrong : colors.surface) : 'transparent',
              shadowColor: '#000',
              shadowOpacity: on ? 0.08 : 0,
              shadowRadius: 3,
              shadowOffset: { width: 0, height: 1 },
              elevation: on ? 1 : 0,
              opacity: o.disabled ? 0.5 : 1,
            }}
          >
            <Text variant="small" weight={on ? 'bold' : 'regular'} tone={on ? 'default' : 'muted'} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
