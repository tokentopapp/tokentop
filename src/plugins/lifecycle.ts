/**
 * Plugin lifecycle manager — orchestrates initialize/start/stop/destroy hooks.
 *
 * Maintains per-plugin state and ensures hooks are called in order, wrapped
 * with safeInvoke for error isolation and circuit breaker protection.
 */

import type { BasePlugin, PluginLifecycleContext, PluginLogger } from "@tokentop/plugin-sdk";
import { safeInvoke } from "./plugin-host.ts";
import { pluginRegistry } from "./registry.ts";
import { createPluginLogger } from "./sandbox.ts";
import { runInPluginGuard } from "./sandbox-guard.ts";

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

export type PluginLifecycleState =
  | "loaded"
  | "initialized"
  | "started"
  | "stopped"
  | "destroyed"
  | "failed";

interface PluginLifecycleEntry {
  pluginId: string;
  state: PluginLifecycleState;
  config: Record<string, unknown>;
  logger: PluginLogger;
}

const HOOK_TIMEOUT_MS = 5_000;

// ---------------------------------------------------------------------------
// Manager
// ---------------------------------------------------------------------------

class PluginLifecycleManager {
  private entries = new Map<string, PluginLifecycleEntry>();

  private getOrCreate(plugin: BasePlugin): PluginLifecycleEntry {
    let entry = this.entries.get(plugin.id);
    if (!entry) {
      entry = {
        pluginId: plugin.id,
        state: "loaded",
        config: { ...(plugin.defaultConfig ?? {}) },
        logger: createPluginLogger(plugin.id),
      };
      this.entries.set(plugin.id, entry);
    }
    return entry;
  }

  private makeCtx(entry: PluginLifecycleEntry): PluginLifecycleContext {
    return { config: entry.config, logger: entry.logger };
  }

  private async invokeHook(
    plugin: BasePlugin,
    hook: "initialize" | "start" | "stop" | "destroy",
  ): Promise<boolean> {
    const fn = plugin[hook];
    if (!fn) return true;

    const entry = this.getOrCreate(plugin);
    const ctx = this.makeCtx(entry);

    const result = await safeInvoke(plugin.id, hook, () =>
      runInPluginGuard(plugin.id, plugin.permissions, () =>
        Promise.race([
          fn.call(plugin, ctx),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error(`${hook} timed out after ${HOOK_TIMEOUT_MS}ms`)),
              HOOK_TIMEOUT_MS,
            ),
          ),
        ]),
      ),
    );

    if (!result.ok) {
      entry.logger.error(`Lifecycle hook "${hook}" failed: ${result.error.message}`);
      return false;
    }
    return true;
  }

  async initializeAll(): Promise<void> {
    const plugins = pluginRegistry.getAllPlugins();

    await Promise.all(
      plugins.map(async (plugin) => {
        const entry = this.getOrCreate(plugin);
        if (entry.state !== "loaded") return;

        const ok = await this.invokeHook(plugin, "initialize");
        entry.state = ok ? "initialized" : "failed";
      }),
    );
  }

  async startAll(): Promise<void> {
    const plugins = pluginRegistry.getAllPlugins();

    await Promise.all(
      plugins.map(async (plugin) => {
        const entry = this.getOrCreate(plugin);
        if (entry.state !== "initialized") return;

        const ok = await this.invokeHook(plugin, "start");
        entry.state = ok ? "started" : "failed";
      }),
    );
  }

  async stopAll(): Promise<void> {
    const plugins = [...pluginRegistry.getAllPlugins()].reverse();

    for (const plugin of plugins) {
      const entry = this.entries.get(plugin.id);
      if (!entry || entry.state !== "started") continue;

      const ok = await this.invokeHook(plugin, "stop");
      entry.state = ok ? "stopped" : "failed";
    }
  }

  async destroyAll(): Promise<void> {
    const plugins = [...pluginRegistry.getAllPlugins()].reverse();

    for (const plugin of plugins) {
      const entry = this.entries.get(plugin.id);
      if (!entry) continue;
      if (entry.state === "destroyed") continue;

      await this.invokeHook(plugin, "destroy");
      entry.state = "destroyed";
    }
  }

  async notifyConfigChange(pluginId: string, newConfig: Record<string, unknown>): Promise<void> {
    const plugin = pluginRegistry.getAllPlugins().find((p) => p.id === pluginId);
    if (!plugin?.onConfigChange) return;

    const entry = this.entries.get(pluginId);
    if (!entry || entry.state === "destroyed" || entry.state === "failed") return;

    entry.config = { ...newConfig };

    const ctx = this.makeCtx(entry);
    await safeInvoke(pluginId, "onConfigChange", () =>
      runInPluginGuard(pluginId, plugin.permissions, () =>
        Promise.resolve(plugin.onConfigChange?.(newConfig, ctx)),
      ),
    );
  }

  getState(pluginId: string): PluginLifecycleState | undefined {
    return this.entries.get(pluginId)?.state;
  }

  /**
   * Update the stored config for a plugin (e.g. from user settings).
   * Does NOT fire onConfigChange — call notifyConfigChange for that.
   */
  setPluginConfig(pluginId: string, config: Record<string, unknown>): void {
    const entry = this.entries.get(pluginId);
    if (entry) {
      entry.config = { ...config };
    }
  }

  reset(): void {
    this.entries.clear();
  }
}

export const pluginLifecycle = new PluginLifecycleManager();
