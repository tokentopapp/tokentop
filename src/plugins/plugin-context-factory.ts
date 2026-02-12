import type { PluginPermissions } from './types/base.ts';
import type { PluginContext, PluginStorage } from './types/provider.ts';
import { createAuthSources } from './auth-sources.ts';
import { createSandboxedHttpClient, createPluginLogger } from './sandbox.ts';

// TODO: Implement persistent storage backed by SQLite or filesystem.
// For now this is an in-memory no-op stub.
function createNoopStorage(): PluginStorage {
  return {
    async get(_key: string): Promise<string | null> {
      return null;
    },
    async set(_key: string, _value: string): Promise<void> {},
    async delete(_key: string): Promise<void> {},
    async has(_key: string): Promise<boolean> {
      return false;
    },
  };
}

export function createPluginContext(
  pluginId: string,
  permissions: PluginPermissions,
  signal?: AbortSignal
): PluginContext {
  return {
    config: {},
    logger: createPluginLogger(pluginId),
    http: createSandboxedHttpClient(pluginId, permissions),
    authSources: createAuthSources(pluginId, permissions),
    storage: createNoopStorage(),
    signal: signal ?? AbortSignal.timeout(30_000),
  };
}
