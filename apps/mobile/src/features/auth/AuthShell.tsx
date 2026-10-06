import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { brand } from '@crm/tokens';
import { BrandLockup, IconButton, Text } from '@/components';
import { useTheme } from '@/providers/ThemeProvider';
import { SUPPORT_NOTE } from '@/lib/config';

/**
 * Branded sign-in chrome: charcoal hero with the F5 mark + "FORCE 5 CRM",
 * then a rounded content sheet. Used by every unauthenticated screen.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  back,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** Show a back arrow in the hero. */
  back?: boolean;
}) {
  const { colors, radius, spacing } = useTheme();
  const router = useRouter();
  return (
    <View style={{ flex: 1, backgroundColor: brand.sidebar }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ flexGrow: 1 }}
          bounces={false}
          style={{ flex: 1 }}
        >
          <SafeAreaView edges={['top']}>
            <View style={{ paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.xxl + 8, gap: spacing.xl }}>
              <View style={{ height: 32, justifyContent: 'center' }}>
                {back ? (
                  <IconButton
                    icon="arrow-back"
                    label="Back"
                    color="#ffffff"
                    onPress={() => (router.canGoBack() ? router.back() : router.replace('/login'))}
                    style={{ alignSelf: 'flex-start', marginLeft: -6 }}
                  />
                ) : null}
              </View>
              <BrandLockup size="lg" onDark />
            </View>
          </SafeAreaView>
          <View
            style={{
              flexGrow: 1,
              backgroundColor: colors.background,
              borderTopLeftRadius: radius.xl * 2,
              borderTopRightRadius: radius.xl * 2,
            }}
          >
            <SafeAreaView edges={['bottom']} style={{ flexGrow: 1 }}>
              <View
                style={{
                  flexGrow: 1,
                  width: '100%',
                  maxWidth: 480,
                  alignSelf: 'center',
                  padding: spacing.xl,
                  paddingTop: spacing.xxl,
                  gap: spacing.lg,
                }}
              >
                <View style={{ gap: 4 }}>
                  <Text variant="h1" accessibilityRole="header">
                    {title}
                  </Text>
                  {subtitle ? <Text tone="muted">{subtitle}</Text> : null}
                </View>
                {children}
                <View style={{ flexGrow: 1 }} />
                <Text variant="caption" tone="subtle" center>
                  {SUPPORT_NOTE}
                </Text>
              </View>
            </SafeAreaView>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
