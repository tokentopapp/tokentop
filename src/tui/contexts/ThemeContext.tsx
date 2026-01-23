import { createContext, useContext, useState, type ReactNode } from 'react';
import type { ThemePlugin, ThemeColors, ThemeComponents, ColorScheme } from '@/plugins/types/theme.ts';
import { tokyoNightTheme } from '@/plugins/themes/tokyo-night.ts';

interface ThemeContextValue {
  theme: ThemePlugin;
  colors: ThemeColors;
  components: ThemeComponents;
  colorScheme: ColorScheme;
  setTheme: (theme: ThemePlugin) => void;
}

const defaultComponents: ThemeComponents = {
  header: {},
  statusBar: {},
  gauge: { height: 1, borderRadius: 0 },
  commandPalette: {},
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

interface ThemeProviderProps {
  children: ReactNode;
  initialTheme?: ThemePlugin;
}

export function ThemeProvider({ children, initialTheme }: ThemeProviderProps) {
  const [theme, setTheme] = useState<ThemePlugin>(initialTheme ?? tokyoNightTheme);

  const value: ThemeContextValue = {
    theme,
    colors: theme.colors,
    components: { ...defaultComponents, ...theme.components },
    colorScheme: theme.colorScheme,
    setTheme,
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}

export function useColors(): ThemeColors {
  return useTheme().colors;
}
