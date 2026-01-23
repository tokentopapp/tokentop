import type { ThemePlugin } from '../types/theme.ts';

export const nordTheme: ThemePlugin = {
  id: 'nord',
  type: 'theme',
  name: 'Nord',
  version: '1.0.0',
  permissions: {},

  colorScheme: 'dark',

  colors: {
    background: '#2e3440',
    foreground: '#3b4252',
    text: '#eceff4',
    textMuted: '#d8dee9',
    textSubtle: '#4c566a',
    primary: '#88c0d0',
    secondary: '#81a1c1',
    accent: '#5e81ac',
    success: '#a3be8c',
    warning: '#ebcb8b',
    error: '#bf616a',
    info: '#88c0d0',
    border: '#4c566a',
    borderMuted: '#434c5e',
    selection: '#434c5e',
    highlight: '#3b4252',
    gaugeBackground: '#3b4252',
    gaugeFill: '#88c0d0',
    gaugeWarning: '#ebcb8b',
    gaugeDanger: '#bf616a',
  },

  components: {
    header: {
      background: '#242933',
    },
    statusBar: {
      background: '#242933',
    },
  },
};
