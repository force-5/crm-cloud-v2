import type { ComponentProps } from 'react';
import { ActivityIndicator, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/providers/ThemeProvider';
import { haptics } from '@/lib/haptics';
import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type IconName = ComponentProps<typeof Ionicons>['name'];

type ButtonProps = {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  icon?: IconName;
  size?: 'sm' | 'md' | 'lg';
  /** Stretch to the parent's width. */
  full?: boolean;
  /** Grow inside a row (action bars). */
  flex?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  icon,
  size = 'md',
  full,
  flex,
  style,
  accessibilityHint,
}: ButtonProps) {
  const { colors, radius } = useTheme();
  const palette = {
    primary: { bg: colors.primary, fg: colors.primaryText, border: colors.primary },
    secondary: { bg: colors.surface, fg: colors.text, border: colors.borderStrong },
    danger: { bg: colors.dangerSoft, fg: colors.danger, border: colors.dangerSoft },
    ghost: { bg: 'transparent', fg: colors.primary, border: 'transparent' },
  }[variant];
  const height = size === 'sm' ? 36 : size === 'lg' ? 52 : 46;
  const isDisabled = !!disabled || !!loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled, busy: !!loading }}
      disabled={isDisabled}
      onPress={() => {
        haptics.tap();
        onPress?.();
      }}
      hitSlop={size === 'sm' ? 6 : 0}
      style={({ pressed }) => [
        {
          minHeight: height,
          paddingHorizontal: size === 'sm' ? 12 : 18,
          borderRadius: radius.md,
          backgroundColor: palette.bg,
          borderColor: palette.border,
          borderWidth: 1,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: isDisabled ? 0.55 : pressed ? 0.85 : 1,
          alignSelf: full ? 'stretch' : 'auto',
          flex: flex ? 1 : undefined,
        },
        style,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {loading ? (
          <ActivityIndicator size="small" color={palette.fg} />
        ) : icon ? (
          <Ionicons name={icon} size={size === 'sm' ? 16 : 18} color={palette.fg} />
        ) : null}
        <Text weight="bold" variant={size === 'sm' ? 'small' : 'body'} style={{ color: palette.fg }} numberOfLines={1}>
          {title}
        </Text>
      </View>
    </Pressable>
  );
}

export function IconButton({
  icon,
  onPress,
  label,
  color,
  size = 22,
  style,
}: {
  icon: IconName;
  onPress: () => void;
  label: string;
  color?: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={10}
      style={({ pressed }) => [{ padding: 6, borderRadius: 999, opacity: pressed ? 0.6 : 1 }, style]}
    >
      <Ionicons name={icon} size={size} color={color ?? colors.textMuted} />
    </Pressable>
  );
}

/** Orange floating action button (bottom-right). */
export function Fab({ icon = 'add', label, onPress }: { icon?: IconName; label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        haptics.impact();
        onPress();
      }}
      style={({ pressed }) => ({
        position: 'absolute',
        right: 20,
        bottom: 20,
        height: 54,
        paddingHorizontal: 20,
        borderRadius: 27,
        backgroundColor: colors.primary,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        opacity: pressed ? 0.9 : 1,
        shadowColor: '#000',
        shadowOpacity: 0.25,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
        elevation: 6,
      })}
    >
      <Ionicons name={icon} size={22} color={colors.primaryText} />
      <Text weight="bold" style={{ color: colors.primaryText }}>
        {label}
      </Text>
    </Pressable>
  );
}
