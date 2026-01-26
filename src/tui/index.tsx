import { createCliRenderer } from '@opentui/core';
import { createRoot } from '@opentui/react';
import { createAppElement, type CreateAppOptions } from './createApp.tsx';
import type { ThemePlugin } from '@/plugins/types/theme.ts';
import type { DemoPreset } from '@/demo/simulator.ts';

export interface TuiOptions {
  theme?: ThemePlugin;
  refreshInterval?: number;
  debug?: boolean;
  demo?: boolean;
  demoSeed?: number;
  demoPreset?: DemoPreset;
}

export async function startTui(options: TuiOptions = {}) {
  const renderer = await createCliRenderer({
    exitOnCtrlC: false,
  });

  const root = createRoot(renderer);

  const appOptions: CreateAppOptions = {};
  
  if (options.theme) {
    appOptions.initialTheme = options.theme;
  }
  if (options.refreshInterval !== undefined) {
    appOptions.refreshInterval = options.refreshInterval;
  }
  if (options.debug !== undefined) {
    appOptions.debug = options.debug;
  }
  if (options.demo !== undefined) {
    appOptions.demoMode = options.demo;
  }
  if (options.demoSeed !== undefined) {
    appOptions.demoSeed = options.demoSeed;
  }
  if (options.demoPreset !== undefined) {
    appOptions.demoPreset = options.demoPreset;
  }

  root.render(createAppElement(appOptions));

  return renderer;
}

export { App } from './App.tsx';
export { createAppElement, type CreateAppOptions } from './createApp.tsx';
