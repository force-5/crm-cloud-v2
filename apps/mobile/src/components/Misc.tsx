import type { ReactNode } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/providers/ThemeProvider';
import { haptics } from '@/lib/haptics';
import { Text } from './Text';
import type { IconName } from './Button';

/** Large in-screen title for tab screens (they hide the native header). */
export function ScreenHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <View style={{ flexShrink: 1 }}>
        <Text variant="h1" accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? <Text tone="muted">{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

/** Seats bar: blue when OK, red when over-allocated. */
export function ProgressBar({ value, max, danger }: { value: number; max: number; danger?: boolean }) {
  const { colors } = useTheme();
  const pct = max > 0 ? Math.min(1, value / max) : value > 0 ? 1 : 0;
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: Math.max(max, 1), now: Math.min(value, Math.max(max, 1)) }}
      style={{ height: 6, borderRadius: 4, backgroundColor: colors.surfaceMuted, overflow: 'hidden' }}
    >
      <View
        style={{ width: `${pct * 100}%`, height: '100%', backgroundColor: danger ? colors.danger : colors.info }}
      />
    </View>
  );
}

/** Integer stepper (seat counts). */
export function Stepper({
  value,
  onChange,
  min = 1,
  max = 100000,
  label,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  label: string;
}) {
  const { colors, radius, fonts } = useTheme();
  const btn = (icon: IconName, delta: number, a11y: string) => {
    const disabled = delta < 0 ? value <= min : value >= max;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={a11y}
        disabled={disabled}
        onPress={() => {
          haptics.tap();
          onChange(Math.min(max, Math.max(min, value + delta)));
        }}
        style={({ pressed }) => ({
          width: 46,
          height: 46,
          borderRadius: radius.md,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: pressed ? colors.primarySoft : colors.surfaceMuted,
          opacity: disabled ? 0.4 : 1,
        })}
      >
        <Ionicons name={icon} size={22} color={colors.text} />
      </Pressable>
    );
  };
  return (
    <View style={{ gap: 6 }}>
      <Text variant="label" style={{ color: colors.textMuted }}>
        {label}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {btn('remove', -1, `Decrease ${label}`)}
        <TextInput
          value={String(value)}
          onChangeText={(t) => {
            const n = parseInt(t.replace(/\D/g, ''), 10);
            onChange(Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min);
          }}
          keyboardType="number-pad"
          selectTextOnFocus
          accessibilityLabel={label}
          style={{
            minWidth: 80,
            height: 46,
            textAlign: 'center',
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: colors.borderStrong,
            backgroundColor: colors.surface,
            color: colors.text,
            fontFamily: fonts.black,
            fontSize: 20,
          }}
        />
        {btn('add', 1, `Increase ${label}`)}
      </View>
    </View>
  );
}

/** Label/value line for read-only details. */
export function InfoRow({ icon, label, value, onPress }: { icon?: IconName; label: string; value?: string; onPress?: () => void }) {
  const { colors } = useTheme();
  const content = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 28 }}>
      {icon ? <Ionicons name={icon} size={18} color={onPress ? colors.primary : colors.textMuted} /> : null}
      <Text variant="small" tone="muted" style={{ width: 92 }}>
        {label}
      </Text>
      <Text style={{ flex: 1 }} tone={onPress ? 'primary' : value ? 'default' : 'subtle'} weight={onPress ? 'bold' : 'regular'}>
        {value || '—'}
      </Text>
    </View>
  );
  return onPress && value ? (
    <Pressable onPress={onPress} accessibilityRole="link" accessibilityLabel={`${label} ${value}`} hitSlop={4}>
      {content}
    </Pressable>
  ) : (
    content
  );
}

export function Divider() {
  const { colors } = useTheme();
  return <View style={{ height: 1, backgroundColor: colors.border }} />;
}

/** Info / warning callout (prototype `.notice`). */
export function Notice({ tone = 'info', icon, children }: { tone?: 'info' | 'warning' | 'danger' | 'success'; icon?: IconName; children: ReactNode }) {
  const { colors, radius } = useTheme();
  const map = {
    info: { bg: colors.infoSoft, fg: colors.info, icon: 'information-circle' as IconName },
    warning: { bg: colors.warningSoft, fg: colors.warning, icon: 'warning' as IconName },
    danger: { bg: colors.dangerSoft, fg: colors.danger, icon: 'alert-circle' as IconName },
    success: { bg: colors.successSoft, fg: colors.success, icon: 'checkmark-circle' as IconName },
  }[tone];
  return (
    <View
      accessibilityRole="alert"
      style={{ flexDirection: 'row', gap: 10, padding: 12, borderRadius: radius.md, backgroundColor: map.bg, alignItems: 'flex-start' }}
    >
      <Ionicons name={icon ?? map.icon} size={18} color={map.fg} style={{ marginTop: 1 }} />
      <View style={{ flex: 1 }}>
        {typeof children === 'string' ? (
          <Text variant="small" style={{ color: map.fg }} weight="bold">
            {children}
          </Text>
        ) : (
          children
        )}
      </View>
    </View>
  );
}
