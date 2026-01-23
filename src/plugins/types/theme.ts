import { z } from 'zod';
import type { BasePlugin } from './base.ts';

export const ThemeColorsSchema = z.object({
  background: z.string(),
  foreground: z.string(),
  text: z.string(),
  textMuted: z.string(),
  textSubtle: z.string(),
  primary: z.string(),
  secondary: z.string(),
  accent: z.string(),
  success: z.string(),
  warning: z.string(),
  error: z.string(),
  info: z.string(),
  border: z.string(),
  borderMuted: z.string(),
  selection: z.string(),
  highlight: z.string(),
  gaugeBackground: z.string(),
  gaugeFill: z.string(),
  gaugeWarning: z.string(),
  gaugeDanger: z.string(),
});

export type ThemeColors = z.infer<typeof ThemeColorsSchema>;

export const ThemeComponentsSchema = z.object({
  header: z.object({
    background: z.string().optional(),
    foreground: z.string().optional(),
  }).optional(),
  statusBar: z.object({
    background: z.string().optional(),
    foreground: z.string().optional(),
  }).optional(),
  commandPalette: z.object({
    background: z.string().optional(),
    border: z.string().optional(),
  }).optional(),
  gauge: z.object({
    height: z.number().optional(),
    borderRadius: z.number().optional(),
  }).optional(),
});

export type ThemeComponents = z.infer<typeof ThemeComponentsSchema>;

export type ColorScheme = 'light' | 'dark';

export interface ThemePlugin extends BasePlugin {
  readonly type: 'theme';
  readonly colorScheme: ColorScheme;
  readonly colors: ThemeColors;
  readonly components?: ThemeComponents;
}

export interface ResolvedTheme {
  id: string;
  name: string;
  colorScheme: ColorScheme;
  colors: ThemeColors;
  components: ThemeComponents;
}
