import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  View,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { useTheme } from '@/providers/ThemeProvider';

/** Content never stretches wider than this on tablets. */
export const MAX_CONTENT_WIDTH = 760;

type ScreenProps = {
  children: ReactNode;
  /** Wrap in a ScrollView (forms, detail pages). Lists pass `scroll={false}` and use FlatList. */
  scroll?: boolean;
  /** Safe-area edges to pad. Tab screens without a native header want `['top']`. */
  edges?: Edge[];
  /** Pull-to-refresh for scrolling screens. */
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Avoid the keyboard (forms). */
  keyboard?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  /** Sticky footer below the scroll view (form actions). */
  footer?: ReactNode;
  scrollProps?: ScrollViewProps;
};

export function Screen({
  children,
  scroll = true,
  edges = [],
  refreshing,
  onRefresh,
  keyboard = false,
  contentStyle,
  footer,
  scrollProps,
}: ScreenProps) {
  const { colors, spacing } = useTheme();
  const inner = scroll ? (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      contentContainerStyle={{ paddingBottom: spacing.xxl * 2 }}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={!!refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
            progressBackgroundColor={colors.surface}
          />
        ) : undefined
      }
      {...scrollProps}
    >
      <Centered style={[{ padding: spacing.lg, gap: spacing.lg }, contentStyle]}>{children}</Centered>
    </ScrollView>
  ) : (
    <View style={[{ flex: 1 }, contentStyle]}>{children}</View>
  );

  const body = (
    <>
      {inner}
      {footer}
    </>
  );

  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: colors.background }}>
      {keyboard ? (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
        >
          {body}
        </KeyboardAvoidingView>
      ) : (
        body
      )}
    </SafeAreaView>
  );
}

/** Centres content with a tablet-friendly max width. */
export function Centered({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center' }, style]}>{children}</View>;
}

/** Sticky bottom action bar (respects the home indicator). */
export function ActionBar({ children }: { children: ReactNode }) {
  const { colors, spacing } = useTheme();
  return (
    <SafeAreaView
      edges={['bottom']}
      style={{ backgroundColor: colors.surface, borderTopColor: colors.border, borderTopWidth: 1 }}
    >
      <Centered style={{ flexDirection: 'row', gap: spacing.sm, padding: spacing.md }}>{children}</Centered>
    </SafeAreaView>
  );
}
