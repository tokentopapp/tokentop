import { createCliRenderer } from '@opentui/core';
import { createRoot } from '@opentui/react';
import { App } from './App.tsx';
import type { ThemePlugin } from '@/plugins/types/theme.ts';

export interface TuiOptions {
  theme?: ThemePlugin;
  refreshInterval?: number;
  debug?: boolean;
}

export async function startTui(options: TuiOptions = {}) {
  const renderer = await createCliRenderer({
    exitOnCtrlC: false,
  });

  const root = createRoot(renderer);

  const appProps = {
    ...(options.theme ? { initialTheme: options.theme } : {}),
    refreshInterval: options.refreshInterval ?? 60000,
    debug: options.debug ?? false,
  };

  root.render(<App {...appProps} />);

  return renderer;
}

export { App } from './App.tsx';
