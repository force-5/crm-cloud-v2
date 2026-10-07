import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/providers/ThemeProvider';
import { haptics } from '@/lib/haptics';
import { Text } from './Text';
import { Button, type ButtonVariant, type IconName } from './Button';
import { MAX_CONTENT_WIDTH } from './Screen';

/** Bottom sheet over a dimmed backdrop. Tapping the backdrop or Android back closes it. */
export function BottomSheet({
  visible,
  onClose,
  title,
  children,
  dismissable = true,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  dismissable?: boolean;
}) {
  const { colors, radius, spacing } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => dismissable && onClose()}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <Pressable
          accessibilityLabel={t('actions.close')}
          style={{ flex: 1, backgroundColor: colors.overlay }}
          onPress={() => dismissable && onClose()}
        />
        <View
          accessibilityViewIsModal
          style={{
            backgroundColor: colors.surface,
            borderTopLeftRadius: radius.xl + 4,
            borderTopRightRadius: radius.xl + 4,
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.sm,
            paddingBottom: insets.bottom + spacing.lg,
            width: '100%',
            maxWidth: MAX_CONTENT_WIDTH,
            alignSelf: 'center',
            gap: spacing.md,
          }}
        >
          <View
            style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.borderStrong }}
          />
          {title ? <Text variant="h2">{title}</Text> : null}
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Confirmation sheet for impactful or destructive actions. */
export function ConfirmSheet({
  visible,
  title,
  message,
  children,
  confirmLabel,
  cancelLabel,
  destructive,
  loading,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  message?: ReactNode;
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const variant: ButtonVariant = destructive ? 'danger' : 'primary';
  return (
    <BottomSheet visible={visible} onClose={onCancel} title={title} dismissable={!loading}>
      {typeof message === 'string' ? <Text tone="muted">{message}</Text> : message}
      {children}
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
        <Button title={cancelLabel ?? t('actions.cancel')} variant="secondary" onPress={onCancel} disabled={loading} flex />
        <Button
          title={confirmLabel ?? t('actions.confirm')}
          variant={variant}
          loading={loading}
          onPress={() => {
            if (destructive) haptics.warning();
            onConfirm();
          }}
          flex
        />
      </View>
    </BottomSheet>
  );
}

export type SheetAction = {
  label: string;
  icon?: IconName;
  destructive?: boolean;
  onPress: () => void;
};

/** Cross-platform action sheet (the row "⋯" menu). */
export function ActionSheet({
  visible,
  title,
  actions,
  onClose,
}: {
  visible: boolean;
  title?: string;
  actions: SheetAction[];
  onClose: () => void;
}) {
  const { colors, radius } = useTheme();
  const { t } = useTranslation();
  return (
    <BottomSheet visible={visible} onClose={onClose} title={title}>
      <View style={{ borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.border }}>
        {actions.map((a, i) => (
          <Pressable
            key={a.label}
            accessibilityRole="button"
            onPress={() => {
              onClose();
              // Let the sheet close before the next modal/alert opens.
              setTimeout(a.onPress, 250);
            }}
            android_ripple={{ color: colors.surfaceMuted }}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              paddingHorizontal: 16,
              minHeight: 52,
              backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
              borderTopWidth: i === 0 ? 0 : 1,
              borderTopColor: colors.border,
            })}
          >
            {a.icon ? (
              <Ionicons name={a.icon} size={20} color={a.destructive ? colors.danger : colors.textMuted} />
            ) : null}
            <Text weight="bold" tone={a.destructive ? 'danger' : 'default'}>
              {a.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <Button title={t('actions.cancel')} variant="secondary" onPress={onClose} full />
    </BottomSheet>
  );
}
