/**
 * Sandbox guard — runtime enforcement for plugin permission boundaries.
 *
 * Uses AsyncLocalStorage to track which plugin is currently executing.
 * This enables enforcement even when plugins bypass the provided `ctx` and
 * call global APIs directly (e.g. `globalThis.fetch`).
 *
 * Two layers:
 * 1. **Global fetch guard** — intercepts all `fetch()` calls and enforces
 *    network domain allowlists when running inside a plugin context.
 * 2. **Deep-freeze** — prevents plugins from mutating the PluginContext.
 */

import { PluginPermissionError, type PluginPermissions } from "@tokentop/plugin-sdk";
import { AsyncLocalStorage } from "async_hooks";
import { createPluginLogger } from "./sandbox.ts";

// ---------------------------------------------------------------------------
// Plugin execution context (AsyncLocalStorage)
// ---------------------------------------------------------------------------

export interface PluginGuardContext {
  readonly pluginId: string;
  readonly permissions: PluginPermissions;
}

const pluginGuardStorage = new AsyncLocalStorage<PluginGuardContext>();

/**
 * Get the currently-executing plugin context, if any.
 * Returns undefined when called outside of a plugin method invocation.
 */
export function getActivePluginGuard(): PluginGuardContext | undefined {
  return pluginGuardStorage.getStore();
}

/**
 * Run a function within a plugin's guard context.
 * All code executed within `fn` (including async continuations) will
 * have the plugin's permissions available via `getActivePluginGuard()`.
 */
export function runInPluginGuard<T>(
  pluginId: string,
  permissions: PluginPermissions,
  fn: () => T,
): T {
  return pluginGuardStorage.run({ pluginId, permissions }, fn);
}

/**
 * Run trusted host code outside the active plugin permission context.
 *
 * @internal Only call from application-owned code; never expose this to plugins.
 */
export function runOutsidePluginGuard<T>(fn: () => T): T {
  return pluginGuardStorage.exit(fn);
}

// ---------------------------------------------------------------------------
// Global fetch guard
// ---------------------------------------------------------------------------

let fetchGuardInstalled = false;

/**
 * Install a global fetch interceptor that enforces plugin network permissions.
 *
 * When code runs inside `runInPluginGuard()`, all `fetch()` calls are checked
 * against the plugin's `permissions.network.allowedDomains`. Calls outside of
 * a plugin context pass through unmodified.
 *
 * This is idempotent — calling it multiple times is safe.
 */
export function installGlobalFetchGuard(): void {
  if (fetchGuardInstalled) return;

  const originalFetch = globalThis.fetch;

  const guardedFetch: typeof fetch = Object.assign(
    function guardedFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
      const guard = pluginGuardStorage.getStore();

      if (!guard) {
        return originalFetch(input, init);
      }

      const { pluginId, permissions } = guard;

      if (!permissions.network?.enabled) {
        const log = createPluginLogger(pluginId);
        log.error("Network access blocked — plugin has not declared network permissions");
        throw new PluginPermissionError(pluginId, "network", "Network access not permitted");
      }

      const allowedDomains = permissions.network.allowedDomains;
      if (allowedDomains && allowedDomains.length > 0) {
        const url =
          typeof input === "string"
            ? new URL(input)
            : input instanceof URL
              ? input
              : new URL(input.url);

        const isAllowed = allowedDomains.some(
          (domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`),
        );

        if (!isAllowed) {
          const log = createPluginLogger(pluginId);
          log.error(
            `Network blocked: domain "${url.hostname}" not in allowlist [${allowedDomains.join(", ")}]`,
          );
          throw new PluginPermissionError(
            pluginId,
            "network",
            `Domain "${url.hostname}" not in allowlist: ${allowedDomains.join(", ")}`,
          );
        }
      }

      return originalFetch(input, init);
    },
    { preconnect: originalFetch.preconnect },
  );

  globalThis.fetch = guardedFetch;
  fetchGuardInstalled = true;
}

// ---------------------------------------------------------------------------
// Deep freeze
// ---------------------------------------------------------------------------

const frozenObjects = new WeakSet<object>();

/**
 * Recursively freeze an object and all of its enumerable properties.
 * Safe against circular references via WeakSet tracking.
 * Skips functions (they may need internal state) and already-frozen objects.
 */
export function deepFreeze<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== "object") return obj;

  const o = obj as object;

  if (frozenObjects.has(o) || Object.isFrozen(o)) return obj;
  frozenObjects.add(o);

  Object.freeze(o);

  for (const value of Object.values(o)) {
    if (value !== null && typeof value === "object") {
      deepFreeze(value);
    }
  }

  return obj;
}
