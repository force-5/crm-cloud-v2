import '@/lib/i18n';
import { useEffect, useMemo } from 'react';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider as NavigationThemeProvider } from 'expo-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { Lato_400Regular, Lato_400Regular_Italic, Lato_700Bold, Lato_900Black } from '@expo-google-fonts/lato';
import { BebasNeue_400Regular } from '@expo-google-fonts/bebas-neue';
import { queryClient, setupFocusManager } from '@/lib/queryClient';
import { ThemeProvider, useTheme } from '@/providers/ThemeProvider';
import { ToastProvider } from '@/providers/ToastProvider';
import { SessionProvider, useSession } from '@/providers/SessionProvider';

// Keep the native splash up until fonts are loaded and the session bootstrap has finished.
SplashScreen.preventAutoHideAsync().catch(() => undefined);
SplashScreen.setOptions({ duration: 250, fade: true });

export { ErrorBoundary } from 'expo-router';

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Lato_400Regular,
    Lato_400Regular_Italic,
    Lato_700Bold,
    Lato_900Black,
    BebasNeue_400Regular,
  });

  useEffect(() => setupFocusManager(), []);

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <ToastProvider>
            <SessionProvider>
              <RootNavigator fontsReady={fontsLoaded || !!fontError} />
            </SessionProvider>
          </ToastProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

function RootNavigator({ fontsReady }: { fontsReady: boolean }) {
  const { status } = useSession();
  const { colors, scheme } = useTheme();
  const ready = fontsReady && status !== 'booting';

  useEffect(() => {
    if (ready) SplashScreen.hide();
  }, [ready]);

  const navTheme = useMemo(() => {
    const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: colors.primary,
        background: colors.background,
        card: colors.surface,
        text: colors.text,
        border: colors.border,
        notification: colors.primary,
      },
    };
  }, [scheme, colors]);

  if (!ready) return null;
  const signedIn = status === 'signedIn';

  return (
    <NavigationThemeProvider value={navTheme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
      </Stack>
    </NavigationThemeProvider>
  );
}
