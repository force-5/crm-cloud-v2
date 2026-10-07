import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/providers/ThemeProvider';

export const unstable_settings = { initialRouteName: '(tabs)' };

export default function AppLayout() {
  const { colors, fonts } = useTheme();
  const { t } = useTranslation(['common', 'accounts', 'products']);
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.primary,
        headerTitleStyle: { fontFamily: fonts.bold, color: colors.text },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="accounts/[id]" options={{ title: t('accounts:detail.crumb') }} />
      <Stack.Screen name="products/[id]" options={{ title: t('products:detail.crumb') }} />
    </Stack>
  );
}
