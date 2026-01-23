import type { ThemePlugin } from '../types/theme.ts';

export const draculaTheme: ThemePlugin = {
  id: 'dracula',
  type: 'theme',
  name: 'Dracula',
  version: '1.0.0',
  permissions: {},

  colorScheme: 'dark',

  colors: {
    background: '#282a36',
    foreground: '#44475a',
    text: '#f8f8f2',
    textMuted: '#bfbfbf',
    textSubtle: '#6272a4',
    primary: '#bd93f9',
    secondary: '#ff79c6',
    accent: '#8be9fd',
    success: '#50fa7b',
    warning: '#ffb86c',
    error: '#ff5555',
    info: '#8be9fd',
    border: '#44475a',
    borderMuted: '#383a46',
    selection: '#44475a',
    highlight: '#383a46',
    gaugeBackground: '#44475a',
    gaugeFill: '#bd93f9',
    gaugeWarning: '#ffb86c',
    gaugeDanger: '#ff5555',
  },

  components: {
    header: {
      background: '#21222c',
    },
    statusBar: {
      background: '#191a21',
    },
  },
};
