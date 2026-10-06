import { Stack } from 'expo-router';
import { useTheme } from '@/providers/ThemeProvider';

export const unstable_settings = { initialRouteName: 'login' };

export default function AuthLayout() {
  const { colors } = useTheme();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="select-account" />
      <Stack.Screen name="mfa" />
      <Stack.Screen name="forgot-password" />
    </Stack>
  );
}
