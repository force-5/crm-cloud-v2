import type { ReactNode } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '@/providers/ThemeProvider';
import { Text } from './Text';

type CardProps = {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  right?: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
  accessibilityLabel?: string;
};

export function Card({
  children,
  title,
  subtitle,
  right,
  onPress,
  onLongPress,
  style,
  padded = true,
  accessibilityLabel,
}: CardProps) {
  const { colors, radius, spacing } = useTheme();
  const base: ViewStyle = {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: padded ? spacing.lg : 0,
    gap: spacing.md,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  };
  const header =
    title || right ? (
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
        <View style={{ flexShrink: 1 }}>
          {title ? <Text variant="h2">{title}</Text> : null}
          {subtitle ? (
            <Text variant="small" tone="muted">
              {subtitle}
            </Text>
          ) : null}
        </View>
        {right}
      </View>
    ) : null;

  if (onPress || onLongPress) {
    return (
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={350}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        android_ripple={{ color: colors.surfaceMuted }}
        style={({ pressed }) => [base, pressed && { opacity: 0.85 }, style]}
      >
        {header}
        {children}
      </Pressable>
    );
  }
  return (
    <View style={[base, style]}>
      {header}
      {children}
    </View>
  );
}
