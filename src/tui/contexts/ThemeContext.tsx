import type {
  ColorScheme,
  ColorSchemePreference,
  ThemeColors,
  ThemeComponents,
  ThemePlugin,
} from "@tokentop/plugin-sdk";
import { createContext, type ReactNode, useContext, useState } from "react";
import { tokyoNightTheme } from "@/plugins/themes/tokyo-night.ts";

interface ThemeContextValue {
  theme: ThemePlugin;
  colors: ThemeColors;
  components: ThemeComponents;
  colorScheme: ColorScheme;
  setTheme: (theme: ThemePlugin) => void;
  previewTheme: ThemePlugin | null;
  setPreviewTheme: (theme: ThemePlugin | null) => void;
  cliTheme: string | undefined;
}

const defaultComponents: ThemeComponents = {
  header: {},
  statusBar: {},
  gauge: { height: 1, borderRadius: 0 },
  commandPalette: {},
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

interface ThemeProviderProps {
  initialTheme?: ThemePlugin;
  cliTheme?: string;
  children: ReactNode;
}

export function ThemeProvider({ initialTheme, cliTheme, children }: ThemeProviderProps) {
  const [theme, setTheme] = useState<ThemePlugin>(initialTheme ?? tokyoNightTheme);
  const [previewTheme, setPreviewTheme] = useState<ThemePlugin | null>(null);

  const active = previewTheme ?? theme;

  const value: ThemeContextValue = {
    theme,
    colors: active.colors,
    components: { ...defaultComponents, ...active.components },
    colorScheme: active.colorScheme,
    setTheme,
    previewTheme,
    setPreviewTheme,
    cliTheme,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}

export function useColors(): ThemeColors {
  return useTheme().colors;
}

export function resolveTheme(
  themeId: string,
  schemePref: ColorSchemePreference,
  themes: ThemePlugin[],
  detectedMode: ColorScheme | null,
): ThemePlugin {
  if (themes.length === 0) return tokyoNightTheme;

  const targetScheme: ColorScheme | null =
    schemePref === "auto"
      ? detectedMode
      : schemePref === "light"
        ? "light"
        : schemePref === "dark"
          ? "dark"
          : null;

  const stored = themes.find((t) => t.id === themeId);

  if (!stored) {
    if (targetScheme) {
      return themes.find((t) => t.colorScheme === targetScheme) ?? themes[0]!;
    }
    return themes[0]!;
  }

  if (!targetScheme || stored.colorScheme === targetScheme) {
    return stored;
  }

  const familySibling = themes.find(
    (t) => t.family === stored.family && t.colorScheme === targetScheme && t.id !== stored.id,
  );
  return familySibling ?? stored;
}
