import type { ReactNode } from "react";
import type { DemoPreset } from "@/demo/simulator.ts";
import { App } from "./App.tsx";
import { TestModeContext } from "./hooks/useSafeRenderer.ts";

export { App };

export interface CreateAppOptions {
  debug?: boolean;
  refreshInterval?: number;
  testMode?: boolean;
  demoMode?: boolean;
  demoSeed?: number;
  demoPreset?: DemoPreset;
  cliPlugins?: string[];
  cliTheme?: string;
}

export const DEFAULT_APP_OPTIONS = {
  debug: false,
  refreshInterval: 60000,
  testMode: false,
  demoMode: false,
} as const;

export function createAppElement(options: CreateAppOptions = {}): ReactNode {
  const isTestMode = options.testMode ?? DEFAULT_APP_OPTIONS.testMode;

  const appElement = (
    <App
      debug={options.debug ?? DEFAULT_APP_OPTIONS.debug}
      demoMode={options.demoMode ?? DEFAULT_APP_OPTIONS.demoMode}
      {...(options.demoSeed !== undefined ? { demoSeed: options.demoSeed } : {})}
      {...(options.demoPreset !== undefined ? { demoPreset: options.demoPreset } : {})}
      {...(options.cliPlugins ? { cliPlugins: options.cliPlugins } : {})}
      {...(options.cliTheme ? { cliTheme: options.cliTheme } : {})}
    />
  );

  if (isTestMode) {
    return <TestModeContext.Provider value={true}>{appElement}</TestModeContext.Provider>;
  }

  return appElement;
}
