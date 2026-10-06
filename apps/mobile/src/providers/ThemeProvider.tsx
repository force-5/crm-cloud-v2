import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import * as SystemUI from 'expo-system-ui';
import { dark, light, radius, spacing, type ColorScheme } from '@crm/tokens';
import type { ThemeName } from '@crm/contracts';
import { getPref, setPref } from '@/lib/storage';

export const fontFamily = {
  regular: 'Lato_400Regular',
  italic: 'Lato_400Regular_Italic',
  bold: 'Lato_700Bold',
  black: 'Lato_900Black',
  display: 'BebasNeue_400Regular',
} as const;

export type Theme = {
  colors: ColorScheme;
  scheme: 'light' | 'dark';
  preference: ThemeName;
  setPreference: (pref: ThemeName) => void;
  radius: typeof radius;
  spacing: typeof spacing;
  fonts: typeof fontFamily;
};

const THEME_KEY = 'f5crm.themeName';
const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemeName>('system');

  // Applied before the first screen renders (the splash screen is held until fonts + this load).
  useEffect(() => {
    getPref(THEME_KEY).then((v) => {
      if (v === 'light' || v === 'dark' || v === 'system') setPreferenceState(v);
    });
  }, []);

  const setPreference = useCallback((pref: ThemeName) => {
    setPreferenceState(pref);
    void setPref(THEME_KEY, pref);
  }, []);

  const scheme: 'light' | 'dark' = preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference;
  const colors = scheme === 'dark' ? dark : light;

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.background).catch(() => undefined);
  }, [colors.background]);

  const value = useMemo<Theme>(
    () => ({ colors, scheme, preference, setPreference, radius, spacing, fonts: fontFamily }),
    [colors, scheme, preference, setPreference],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
