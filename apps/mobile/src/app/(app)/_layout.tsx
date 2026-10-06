import { Stack } from 'expo-router';
import { useTheme } from '@/providers/ThemeProvider';

export const unstable_settings = { initialRouteName: '(tabs)' };

export default function AppLayout() {
  const { colors, fonts } = useTheme();
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
      <Stack.Screen name="accounts/[id]" options={{ title: 'Account' }} />
      <Stack.Screen name="products/[id]" options={{ title: 'Product' }} />
    </Stack>
  );
}
