/**
 * Plugin host — error isolation and circuit breaker for plugin method calls.
 *
 * Every plugin method invocation should go through `safeInvoke` to ensure:
 * 1. Unhandled errors never crash the app
 * 2. Plugins that fail repeatedly are temporarily disabled (circuit breaker)
 * 3. All errors are logged through the scoped plugin logger
 */

import { createPluginLogger } from "./sandbox.ts";

// ---------------------------------------------------------------------------
// Circuit breaker state
// ---------------------------------------------------------------------------

interface CircuitState {
  consecutiveFailures: number;
  lastFailureAt: number;
  disabledUntil: number;
  totalFailures: number;
  totalCalls: number;
}

/** How many consecutive failures before disabling a plugin. */
const MAX_CONSECUTIVE_FAILURES = 5;

/** How long (ms) a tripped plugin stays disabled before retrying. */
const COOLDOWN_MS = 60_000; // 1 minute

const circuits = new Map<string, CircuitState>();

function getCircuit(pluginId: string): CircuitState {
  let state = circuits.get(pluginId);
  if (!state) {
    state = {
      consecutiveFailures: 0,
      lastFailureAt: 0,
      disabledUntil: 0,
      totalFailures: 0,
      totalCalls: 0,
    };
    circuits.set(pluginId, state);
  }
  return state;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type SafeInvokeResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: Error; circuitOpen: boolean };

/**
 * Options for `safeInvoke`.
 *
 * @template T  The return type of the plugin method.
 */
export interface SafeInvokeOptions<T> {
  /**
   * Optional predicate that inspects a *successful* return value and decides
   * whether it should count as a logical failure for the circuit breaker.
   *
   * Use this when plugins return error-carrying objects instead of throwing
   * (e.g. `{ error: "429 Too Many Requests" }`).
   *
   * When the predicate returns `true`:
   *   - The circuit breaker's failure counter is incremented
   *   - The value is still returned as `{ ok: true, value }` so the caller
   *     can inspect the error details
   */
  isFailure?: (value: T) => boolean;
}

/**
 * Safely invoke a plugin method with circuit breaker protection.
 *
 * @param pluginId  Unique plugin identifier (for circuit tracking + logging)
 * @param method    Human-readable method name (for logging, e.g. "fetchUsage")
 * @param fn        The actual async function to call
 * @param options   Optional configuration (e.g. `isFailure` predicate)
 * @returns         `{ ok: true, value }` or `{ ok: false, error, circuitOpen }`
 */
export async function safeInvoke<T>(
  pluginId: string,
  method: string,
  fn: () => Promise<T>,
  options?: SafeInvokeOptions<T>,
): Promise<SafeInvokeResult<T>> {
  const circuit = getCircuit(pluginId);
  const log = createPluginLogger(pluginId);
  circuit.totalCalls++;

  // Check if circuit is open (plugin disabled)
  if (circuit.disabledUntil > Date.now()) {
    log.warn(
      `Circuit open — skipping ${method} (disabled until ${new Date(circuit.disabledUntil).toISOString()})`,
    );
    return {
      ok: false,
      error: new Error(
        `Plugin "${pluginId}" is temporarily disabled after ${circuit.consecutiveFailures} consecutive failures`,
      ),
      circuitOpen: true,
    };
  }

  // If we were disabled but cooldown expired, allow a retry (half-open)
  if (circuit.disabledUntil > 0 && circuit.disabledUntil <= Date.now()) {
    log.info(`Circuit half-open — retrying ${method}`);
  }

  try {
    const value = await fn();

    // Check for logical failures (e.g. provider returned { error: "..." })
    if (options?.isFailure?.(value)) {
      circuit.consecutiveFailures++;
      circuit.totalFailures++;
      circuit.lastFailureAt = Date.now();

      log.warn(
        `${method} returned logical failure (${circuit.consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES})`,
      );

      if (circuit.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        circuit.disabledUntil = Date.now() + COOLDOWN_MS;
        log.error(
          `Circuit OPEN — plugin disabled for ${COOLDOWN_MS / 1000}s after ${circuit.consecutiveFailures} consecutive failures`,
        );
      }

      // Still return the value — caller needs the error details
      return { ok: true, value };
    }

    // True success — reset consecutive failures
    if (circuit.consecutiveFailures > 0) {
      log.info(
        `${method} succeeded — resetting circuit breaker (was at ${circuit.consecutiveFailures} failures)`,
      );
    }
    circuit.consecutiveFailures = 0;
    circuit.disabledUntil = 0;

    return { ok: true, value };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));

    circuit.consecutiveFailures++;
    circuit.totalFailures++;
    circuit.lastFailureAt = Date.now();

    log.error(`${method} failed (${circuit.consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES})`, {
      error: error.message,
    });

    // Trip the circuit if threshold reached
    if (circuit.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      circuit.disabledUntil = Date.now() + COOLDOWN_MS;
      log.error(
        `Circuit OPEN — plugin disabled for ${COOLDOWN_MS / 1000}s after ${circuit.consecutiveFailures} consecutive failures`,
      );
    }

    return { ok: false, error, circuitOpen: false };
  }
}

/**
 * Synchronous version of safeInvoke for non-async plugin methods.
 */
export function safeInvokeSync<T>(
  pluginId: string,
  method: string,
  fn: () => T,
): SafeInvokeResult<T> {
  const circuit = getCircuit(pluginId);
  const log = createPluginLogger(pluginId);
  circuit.totalCalls++;

  if (circuit.disabledUntil > Date.now()) {
    log.warn(`Circuit open — skipping ${method}`);
    return {
      ok: false,
      error: new Error(`Plugin "${pluginId}" is temporarily disabled`),
      circuitOpen: true,
    };
  }

  try {
    const value = fn();
    circuit.consecutiveFailures = 0;
    circuit.disabledUntil = 0;
    return { ok: true, value };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    circuit.consecutiveFailures++;
    circuit.totalFailures++;
    circuit.lastFailureAt = Date.now();

    log.error(`${method} failed (${circuit.consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES})`, {
      error: error.message,
    });

    if (circuit.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      circuit.disabledUntil = Date.now() + COOLDOWN_MS;
      log.error(`Circuit OPEN — plugin disabled for ${COOLDOWN_MS / 1000}s`);
    }

    return { ok: false, error, circuitOpen: false };
  }
}

// ---------------------------------------------------------------------------
// Health inspection
// ---------------------------------------------------------------------------

export interface PluginHealth {
  pluginId: string;
  healthy: boolean;
  consecutiveFailures: number;
  totalFailures: number;
  totalCalls: number;
  disabledUntil: number | null;
}

/** Get health status for a specific plugin. */
export function getPluginHealth(pluginId: string): PluginHealth {
  const circuit = getCircuit(pluginId);
  return {
    pluginId,
    healthy:
      circuit.disabledUntil < Date.now() && circuit.consecutiveFailures < MAX_CONSECUTIVE_FAILURES,
    consecutiveFailures: circuit.consecutiveFailures,
    totalFailures: circuit.totalFailures,
    totalCalls: circuit.totalCalls,
    disabledUntil: circuit.disabledUntil > Date.now() ? circuit.disabledUntil : null,
  };
}

/** Get health status for all tracked plugins. */
export function getAllPluginHealth(): PluginHealth[] {
  return [...circuits.keys()].map(getPluginHealth);
}

/** Reset circuit breaker for a specific plugin (manual recovery). */
export function resetCircuit(pluginId: string): void {
  circuits.delete(pluginId);
}

/** Reset all circuit breakers. */
export function resetAllCircuits(): void {
  circuits.clear();
}
