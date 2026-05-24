import { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type AppTheme = 'studio' | 'ink';

const themeStorageKey = 'photo-sys-theme';

const themeLabels: Record<AppTheme, string> = {
  studio: '影像工作室感',
  ink: '东方纸墨科技感'
};

interface ThemeContextValue {
  theme: AppTheme;
  setTheme: (theme: AppTheme) => void;
  themeLabels: Record<AppTheme, string>;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredTheme(): AppTheme {
  if (typeof window === 'undefined') return 'studio';
  return window.localStorage.getItem(themeStorageKey) === 'ink' ? 'ink' : 'studio';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<AppTheme>(() => readStoredTheme());

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(themeStorageKey, theme);
  }, [theme]);

  const value = useMemo<ThemeContextValue>(() => ({
    theme,
    setTheme: setThemeState,
    themeLabels
  }), [theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
}
