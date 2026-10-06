import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { themeNameSchema, type ThemeName } from '@crm/contracts';

export const THEME_STORAGE_KEY = 'crm-theme';

/** Reads the stored theme; anything invalid (e.g. the legacy "null" string) means "system". */
export function readStoredTheme(): ThemeName {
  try {
    const parsed = themeNameSchema.safeParse(window.localStorage.getItem(THEME_STORAGE_KEY));
    return parsed.success ? parsed.data : 'system';
  } catch {
    return 'system';
  }
}

function writeStoredTheme(theme: ThemeName): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* storage unavailable — the theme still applies for this page view */
  }
}

function systemPrefersDark(): boolean {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}

export function applyThemeClass(theme: ThemeName): 'light' | 'dark' {
  const resolved = theme === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : theme;
  const root = document.documentElement;
  root.classList.toggle('dark', resolved === 'dark');
  root.style.colorScheme = resolved;
  return resolved;
}

type ThemeContextValue = {
  theme: ThemeName;
  resolved: 'light' | 'dark';
  /** Applies instantly and caches in localStorage. Server persistence is the caller's job. */
  setTheme: (theme: ThemeName) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>(() => readStoredTheme());
  const [resolved, setResolved] = useState<'light' | 'dark'>(() => applyThemeClass(readStoredTheme()));

  const setTheme = useCallback((next: ThemeName) => {
    const valid = themeNameSchema.safeParse(next);
    const value = valid.success ? valid.data : 'system';
    writeStoredTheme(value);
    setThemeState(value);
    setResolved(applyThemeClass(value));
  }, []);

  // Follow OS changes while on "system".
  useEffect(() => {
    if (theme !== 'system') return;
    let mql: MediaQueryList;
    try {
      mql = window.matchMedia('(prefers-color-scheme: dark)');
    } catch {
      return;
    }
    const onChange = () => setResolved(applyThemeClass('system'));
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [theme]);

  const value = useMemo(() => ({ theme, resolved, setTheme }), [theme, resolved, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
