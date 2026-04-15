import type { PluginContext, PluginPermissions, PluginStorage } from "@tokentop/plugin-sdk";
import { isDatabaseInitialized } from "@/storage/db.ts";
import {
  pluginStorageDelete,
  pluginStorageGet,
  pluginStorageHas,
  pluginStorageSet,
} from "@/storage/repos/pluginStorage.ts";
import { createAuthSources } from "./auth-sources.ts";
import { createPluginLogger, createSandboxedHttpClient } from "./sandbox.ts";
import { deepFreeze } from "./sandbox-guard.ts";

function isDbAvailable(): boolean {
  return isDatabaseInitialized();
}

function createPluginStorage(pluginId: string): PluginStorage {
  return {
    async get(key: string): Promise<string | null> {
      if (!isDbAvailable()) return null;
      return pluginStorageGet(pluginId, key);
    },
    async set(key: string, value: string): Promise<void> {
      if (!isDbAvailable()) return;
      pluginStorageSet(pluginId, key, value);
    },
    async delete(key: string): Promise<void> {
      if (!isDbAvailable()) return;
      pluginStorageDelete(pluginId, key);
    },
    async has(key: string): Promise<boolean> {
      if (!isDbAvailable()) return false;
      return pluginStorageHas(pluginId, key);
    },
  };
}
export function createPluginContext(
  pluginId: string,
  permissions: PluginPermissions,
  signal?: AbortSignal,
): PluginContext {
  // Lazily create the AbortSignal only when accessed to avoid accumulating
  // dangling 30s timers from AbortSignal.timeout() on every context creation.
  let _signal = signal;
  const ctx: PluginContext = {
    config: {},
    logger: createPluginLogger(pluginId),
    http: createSandboxedHttpClient(pluginId, permissions),
    authSources: createAuthSources(pluginId, permissions),
    storage: createPluginStorage(pluginId),
    get signal() {
      if (!_signal) {
        _signal = AbortSignal.timeout(30_000);
      }
      return _signal;
    },
  };
  deepFreeze(ctx.config);
  return ctx;
}
