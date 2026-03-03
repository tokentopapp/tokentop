import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import type { DemoPreset } from "@/demo/simulator.ts";
import { pluginLifecycle } from "@/plugins/lifecycle.ts";
import { notificationBus } from "@/plugins/notification-bus.ts";
import { type CreateAppOptions, createAppElement } from "./createApp.tsx";
import { registerShutdown } from "./shutdown.ts";

export interface TuiOptions {
  refreshInterval?: number;
  debug?: boolean;
  demo?: boolean;
  demoSeed?: number;
  demoPreset?: DemoPreset;
  cliPlugins?: string[];
  cliTheme?: string;
}

const FORCE_EXIT_GRACE_MS = 1_000;

export async function startTui(options: TuiOptions = {}) {
  const renderer = await createCliRenderer({
    exitOnCtrlC: false,
    autoFocus: true,
  });

  const root = createRoot(renderer);

  const appOptions: CreateAppOptions = {};

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
  if (options.cliPlugins !== undefined) {
    appOptions.cliPlugins = options.cliPlugins;
  }
  if (options.cliTheme !== undefined) {
    appOptions.cliTheme = options.cliTheme;
  }

  root.render(createAppElement(appOptions));

  const shutdown = async () => {
    try {
      await pluginLifecycle.stopAll();
      await pluginLifecycle.destroyAll();
    } catch {
      /* best-effort */
    }
    notificationBus.destroy();
    renderer.destroy();

    const forceExit = setTimeout(() => process.exit(0), FORCE_EXIT_GRACE_MS);
    if (typeof forceExit === "object" && "unref" in forceExit) {
      forceExit.unref();
    }
  };

  registerShutdown(shutdown);

  return renderer;
}

export { App } from "./App.tsx";
export { type CreateAppOptions, createAppElement } from "./createApp.tsx";
