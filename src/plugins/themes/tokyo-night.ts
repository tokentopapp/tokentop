import type { ThemePlugin } from '../types/theme.ts';

export const tokyoNightTheme: ThemePlugin = {
  id: 'tokyo-night',
  type: 'theme',
  name: 'Tokyo Night',
  version: '1.0.0',
  permissions: {},

  colorScheme: 'dark',

  colors: {
    background: '#1a1b26',
    foreground: '#24283b',
    text: '#c0caf5',
    textMuted: '#737aa2',
    textSubtle: '#565f89',
    primary: '#7aa2f7',
    secondary: '#bb9af7',
    accent: '#7dcfff',
    success: '#9ece6a',
    warning: '#e0af68',
    error: '#f7768e',
    info: '#7aa2f7',
    border: '#414868',
    borderMuted: '#292e42',
    selection: '#33467c',
    highlight: '#2f3549',
    gaugeBackground: '#24283b',
    gaugeFill: '#7aa2f7',
    gaugeWarning: '#e0af68',
    gaugeDanger: '#f7768e',
  },

  components: {
    header: {
      background: '#16161e',
    },
    statusBar: {
      background: '#1f2335',
    },
    gauge: {
      height: 1,
      borderRadius: 0,
    },
  },
};
