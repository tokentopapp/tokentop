import type {
  AgentPlugin,
  Credentials,
  NotificationPlugin,
  ProviderPlugin,
  ProviderUsageData,
  ThemePlugin,
} from "@tokentop/plugin-sdk";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { pluginLifecycle } from "@/plugins/lifecycle.ts";
import { notificationBus } from "@/plugins/notification-bus.ts";
import { createPluginContext } from "@/plugins/plugin-context-factory.ts";
import { safeInvoke, safeInvokeSync } from "@/plugins/plugin-host.ts";
import { pluginRegistry } from "@/plugins/registry.ts";
import { createPluginLogger, createSandboxedHttpClient } from "@/plugins/sandbox.ts";
import { installGlobalFetchGuard, runInPluginGuard } from "@/plugins/sandbox-guard.ts";
import { initPricingFromPlugins } from "@/pricing/index.ts";
import type { ProviderSnapshotInsert } from "@/storage/types.ts";
import { useConfig } from "./ConfigContext.tsx";
import { useDemoMode } from "./DemoModeContext.tsx";
import { useLogs } from "./LogContext.tsx";
import { useStorage } from "./StorageContext.tsx";

export interface UsageSnapshot {
  timestamp: number;
  usedPercent: number | null;
  limitReached?: boolean | undefined;
}

const HISTORY_SIZE = 30; // Keep last 30 snapshots per provider

export interface ProviderState {
  plugin: ProviderPlugin;
  configured: boolean;
  usage: ProviderUsageData | null;
  loading: boolean;
  lastFetchAt: number | null;
  history: UsageSnapshot[];
  /** Timestamp (ms) until which this provider should be skipped due to rate limiting. 0 = not rate limited. */
  rateLimitUntil: number;
}

interface PluginContextValue {
  providers: Map<string, ProviderState>;
  agents: AgentPlugin[];
  themes: ThemePlugin[];
  notifications: NotificationPlugin[];
  isInitialized: boolean;
  refreshProvider: (providerId: string) => Promise<void>;
  refreshAllProviders: () => Promise<void>;
}

const PluginContext = createContext<PluginContextValue | null>(null);

function getMaxUsagePercent(usage: ProviderUsageData): number | null {
  if (!usage.limits) return null;

  const items = usage.limits.items ?? [];
  if (items.length > 0) {
    const percents = items.map((item) => item.usedPercent).filter((p): p is number => p !== null);
    return percents.length > 0 ? Math.max(...percents) : null;
  }

  const primary = usage.limits.primary?.usedPercent;
  const secondary = usage.limits.secondary?.usedPercent;

  if (primary !== null && primary !== undefined && secondary !== null && secondary !== undefined) {
    return Math.max(primary, secondary);
  }
  return primary ?? secondary ?? null;
}

function addToHistory(history: UsageSnapshot[], snapshot: UsageSnapshot): UsageSnapshot[] {
  const newHistory = [...history, snapshot];
  if (newHistory.length > HISTORY_SIZE) {
    return newHistory.slice(-HISTORY_SIZE);
  }
  return newHistory;
}

interface PluginProviderProps {
  children: ReactNode;
  cliPlugins?: string[];
}

export function PluginProvider({ children, cliPlugins }: PluginProviderProps) {
  const [isInitialized, setIsInitialized] = useState(false);
  const [providers, setProviders] = useState<Map<string, ProviderState>>(new Map());
  const [themes, setThemes] = useState<ThemePlugin[]>([]);
  const [agents, setAgents] = useState<AgentPlugin[]>([]);
  const [notifications, setNotifications] = useState<NotificationPlugin[]>([]);
  const { demoMode, simulator } = useDemoMode();
  const { debug, info, warn, error: logError } = useLogs();
  const { isReady: storageReady, recordProviderSnapshots } = useStorage();
  const { config } = useConfig();

  useEffect(() => {
    async function initialize() {
      installGlobalFetchGuard();
      debug("Initializing plugin registry...", undefined, "plugins");

      try {
        if (!demoMode) {
          const initConfig: { plugins?: typeof config.plugins; cliPlugins?: string[] } = {
            plugins: config.plugins,
          };
          if (cliPlugins) {
            initConfig.cliPlugins = cliPlugins;
          }
          await pluginRegistry.initialize(initConfig);
        } else {
          await pluginRegistry.loadBuiltinPlugins();
        }
        info("Plugin registry initialized", undefined, "plugins");
      } catch (err) {
        logError("Failed to initialize plugin registry", { error: String(err) }, "plugins");
      }

      const providerPlugins = pluginRegistry.getAll("provider");
      const agentPlugins = pluginRegistry.getAll("agent");
      const themePlugins = pluginRegistry.getAll("theme");
      const notificationPlugins = pluginRegistry.getAll("notification");

      initPricingFromPlugins(providerPlugins, {
        "google-gemini": "google",
      });

      info(
        `Loaded plugins`,
        {
          providers: providerPlugins.length,
          themes: themePlugins.length,
          notifications: notificationPlugins.length,
        },
        "plugins",
      );

      await pluginLifecycle.initializeAll();
      await pluginLifecycle.startAll();
      debug("Plugin lifecycle: all plugins initialized and started", undefined, "plugins");

      debug("Discovering credentials...", undefined, "credentials");

      const credentials = new Map<string, Credentials>();
      if (!demoMode) {
        await Promise.all(
          providerPlugins.map(async (p) => {
            const ctx = createPluginContext(p.id, p.permissions);
            const result = await safeInvoke(p.id, "auth.discover", () =>
              runInPluginGuard(p.id, p.permissions, () => p.auth.discover(ctx)),
            );
            if (result.ok && result.value.ok && result.value.credentials) {
              credentials.set(p.id, result.value.credentials);
            } else if (!result.ok) {
              logError(
                `Credential discovery failed for ${p.id}`,
                { error: result.error.message },
                "credentials",
              );
            }
          }),
        );
      }

      const providerStates = new Map<string, ProviderState>();
      const configuredIds: string[] = [];
      const unconfiguredIds: string[] = [];

      for (const plugin of providerPlugins) {
        const creds = credentials.get(plugin.id);
        let configured = false;
        if (demoMode) {
          configured = true;
        } else if (creds) {
          const check = safeInvokeSync(plugin.id, "auth.isConfigured", () =>
            plugin.auth.isConfigured(creds),
          );
          configured = check.ok ? check.value : false;
        }
        providerStates.set(plugin.id, {
          plugin,
          configured,
          usage: null,
          loading: false,
          lastFetchAt: null,
          history: [],
          rateLimitUntil: 0,
        });

        if (configured) {
          configuredIds.push(plugin.id);
        } else {
          unconfiguredIds.push(plugin.id);
        }
      }

      info(
        "Credential discovery complete",
        {
          configured: configuredIds,
          unconfigured: unconfiguredIds,
        },
        "credentials",
      );

      if (demoMode && simulator) {
        const snapshot = simulator.tick();
        for (const [providerId, usage] of snapshot.providerUsage.entries()) {
          const state = providerStates.get(providerId);
          if (!state) continue;
          providerStates.set(providerId, {
            ...state,
            usage,
            lastFetchAt: Date.now(),
            history: addToHistory(state.history, {
              timestamp: Date.now(),
              usedPercent: getMaxUsagePercent(usage),
              limitReached: usage.limitReached,
            }),
          });
        }
      }

      notificationBus.registerPlugins(notificationPlugins);

      setProviders(providerStates);
      setAgents(agentPlugins);
      setThemes(themePlugins);
      setNotifications(notificationPlugins);
      setIsInitialized(true);
    }

    initialize();
  }, []);

  useEffect(() => {
    if (!isInitialized) return;
    notificationBus.setPluginConfig("terminal-bell", {
      ...((config.pluginConfig ?? {})["terminal-bell"] ?? {}),
      enabled: config.notifications.soundEnabled,
    });
  }, [config.notifications.soundEnabled, isInitialized]);

  const prevPluginConfigRef = useRef<Record<string, Record<string, unknown>>>({});
  useEffect(() => {
    if (!isInitialized) return;
    const prev = prevPluginConfigRef.current;
    const next = config.pluginConfig ?? {};
    const allIds = new Set([...Object.keys(prev), ...Object.keys(next)]);

    for (const pluginId of allIds) {
      const prevStr = JSON.stringify(prev[pluginId] ?? {});
      const nextStr = JSON.stringify(next[pluginId] ?? {});
      if (prevStr !== nextStr) {
        debug(`Plugin config changed for ${pluginId}`, undefined, "plugins");
        pluginLifecycle.notifyConfigChange(pluginId, next[pluginId] ?? {});
      }
    }
    prevPluginConfigRef.current = { ...next };
  }, [config.pluginConfig, isInitialized]);

  const refreshProvider = useCallback(
    async (providerId: string) => {
      const state = providers.get(providerId);
      if (!state || !state.configured) {
        debug(`Skipping refresh for ${providerId}: not configured`, undefined, "refresh");
        return;
      }

      if (state.loading) {
        debug(`Skipping refresh for ${providerId}: already in flight`, undefined, "refresh");
        return;
      }

      const now = Date.now();
      if (state.rateLimitUntil > now) {
        const remainingSec = Math.round((state.rateLimitUntil - now) / 1000);
        debug(
          `Skipping ${providerId}: rate limited for ${remainingSec}s more`,
          undefined,
          "refresh",
        );
        return;
      }

      info(`Refreshing ${providerId}...`, undefined, "refresh");

      setProviders((prev) => {
        const next = new Map(prev);
        const current = next.get(providerId);
        if (current) {
          next.set(providerId, { ...current, loading: true });
        }
        return next;
      });

      try {
        if (demoMode && simulator) {
          const snapshot = simulator.tick();
          const usage = snapshot.providerUsage.get(providerId) ?? {
            fetchedAt: Date.now(),
            error: "Demo provider data missing",
          };

          if (storageReady) {
            recordProviderSnapshots([
              {
                timestamp: Date.now(),
                provider: providerId,
                usedPercent: getMaxUsagePercent(usage),
                limitReached: usage.limitReached ?? false,
                resetsAt: usage.limits?.primary?.resetsAt ?? null,
                rawJson: JSON.stringify(usage),
              },
            ]);
          }

          setProviders((prev) => {
            const next = new Map(prev);
            const current = next.get(providerId);
            const currentHistory = current?.history ?? [];
            const snapshotEntry: UsageSnapshot = {
              timestamp: Date.now(),
              usedPercent: getMaxUsagePercent(usage),
              limitReached: usage.limitReached,
            };
            next.set(providerId, {
              ...state,
              usage,
              loading: false,
              lastFetchAt: Date.now(),
              rateLimitUntil: 0,
              history: addToHistory(currentHistory, snapshotEntry),
            });
            return next;
          });

          return;
        }

        const ctx = createPluginContext(providerId, state.plugin.permissions);
        const discoverResult = await safeInvoke(providerId, "auth.discover", () =>
          runInPluginGuard(providerId, state.plugin.permissions, () =>
            state.plugin.auth.discover(ctx),
          ),
        );

        if (!discoverResult.ok) {
          throw discoverResult.error;
        }
        const creds = discoverResult.value.ok ? discoverResult.value.credentials : undefined;

        if (!creds) {
          throw new Error("Credentials not found");
        }

        const http = createSandboxedHttpClient(providerId, state.plugin.permissions);
        const logger = createPluginLogger(providerId);
        // Lazy signal: only create the 30s timer if a plugin actually reads ctx.signal.
        let fetchSignal: AbortSignal | undefined;
        const fetchCtx = {
          credentials: creds,
          http,
          logger,
          config: {},
          get signal(): AbortSignal {
            if (!fetchSignal) fetchSignal = AbortSignal.timeout(30_000);
            return fetchSignal;
          },
        };

        const fetchResult = await safeInvoke(
          providerId,
          "fetchUsage",
          () =>
            runInPluginGuard(providerId, state.plugin.permissions, () =>
              state.plugin.fetchUsage(fetchCtx),
            ),
          {
            // Count non-rate-limit errors as circuit breaker failures.
            // Rate limits are handled separately via backoff scheduling.
            isFailure: (usage) => !!usage.error && !usage.rateLimited,
          },
        );

        if (!fetchResult.ok) {
          throw fetchResult.error;
        }

        const usage = fetchResult.value;

        // Handle rate-limited responses: set backoff, preserve last good data
        if (usage.rateLimited) {
          const backoffMs = usage.retryAfterMs ?? 300_000; // default 5 min
          const backoffUntil = Date.now() + backoffMs;
          warn(
            `${providerId} rate limited, backing off for ${Math.round(backoffMs / 1000)}s`,
            { retryAfterMs: backoffMs, until: new Date(backoffUntil).toISOString() },
            "refresh",
          );

          setProviders((prev) => {
            const next = new Map(prev);
            const current = next.get(providerId);
            // Preserve the last successful usage data if we have it
            const preservedUsage = current?.usage && !current.usage.error ? current.usage : usage;
            next.set(providerId, {
              ...state,
              usage: preservedUsage,
              loading: false,
              lastFetchAt: Date.now(),
              rateLimitUntil: backoffUntil,
              history: current?.history ?? [],
            });
            return next;
          });
          return;
        }

        if (usage.error) {
          warn(`${providerId} returned error: ${usage.error}`, undefined, "refresh");
        } else {
          info(
            `${providerId} refreshed successfully`,
            {
              limitReached: usage.limitReached,
              primaryUsage: usage.limits?.primary?.usedPercent,
            },
            "refresh",
          );

          if (storageReady) {
            const now = Date.now();
            const snapshotInsert: ProviderSnapshotInsert = {
              timestamp: now,
              provider: providerId,
              usedPercent: getMaxUsagePercent(usage),
              limitReached: usage.limitReached ?? false,
              resetsAt: usage.limits?.primary?.resetsAt ?? null,
              rawJson: JSON.stringify(usage),
            };
            recordProviderSnapshots([snapshotInsert]);
          }

          notificationBus.checkProviderUsage(providerId, state.plugin.name, usage);
        }

        setProviders((prev) => {
          const next = new Map(prev);
          const current = next.get(providerId);
          const currentHistory = current?.history ?? [];

          const snapshot: UsageSnapshot = {
            timestamp: Date.now(),
            usedPercent: getMaxUsagePercent(usage),
            limitReached: usage.limitReached,
          };

          next.set(providerId, {
            ...state,
            usage,
            loading: false,
            lastFetchAt: Date.now(),
            rateLimitUntil: 0,
            history: addToHistory(currentHistory, snapshot),
          });
          return next;
        });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        logError(`Failed to refresh ${providerId}: ${errorMsg}`, undefined, "refresh");

        setProviders((prev) => {
          const next = new Map(prev);
          const current = next.get(providerId);
          next.set(providerId, {
            ...state,
            usage: {
              fetchedAt: Date.now(),
              error: errorMsg,
            },
            loading: false,
            lastFetchAt: Date.now(),
            rateLimitUntil: current?.rateLimitUntil ?? 0,
            history: current?.history ?? [],
          });
          return next;
        });
      }
    },
    [
      providers,
      debug,
      info,
      warn,
      logError,
      storageReady,
      recordProviderSnapshots,
      demoMode,
      simulator,
    ],
  );

  const refreshAllProviders = useCallback(async () => {
    const configuredProviders = Array.from(providers.entries())
      .filter(([_, state]) => state.configured)
      .map(([id]) => id);

    info(
      `Refreshing ${configuredProviders.length} providers`,
      { providers: configuredProviders },
      "refresh",
    );

    await Promise.all(configuredProviders.map(refreshProvider));
  }, [providers, refreshProvider, info]);

  const refreshProviderRef = useRef(refreshProvider);
  const refreshAllProvidersRef = useRef(refreshAllProviders);
  refreshProviderRef.current = refreshProvider;
  refreshAllProvidersRef.current = refreshAllProviders;

  const stableRefreshProvider = useCallback(
    (providerId: string) => refreshProviderRef.current(providerId),
    [],
  );
  const stableRefreshAllProviders = useCallback(() => refreshAllProvidersRef.current(), []);

  const value: PluginContextValue = {
    providers,
    agents,
    themes,
    notifications,
    isInitialized,
    refreshProvider: stableRefreshProvider,
    refreshAllProviders: stableRefreshAllProviders,
  };

  return <PluginContext.Provider value={value}>{children}</PluginContext.Provider>;
}

export function usePlugins(): PluginContextValue {
  const context = useContext(PluginContext);
  if (!context) {
    throw new Error("usePlugins must be used within PluginProvider");
  }
  return context;
}

export function useProvider(providerId: string): ProviderState | undefined {
  const { providers } = usePlugins();
  return providers.get(providerId);
}

export function useConfiguredProviders(): ProviderState[] {
  const { providers } = usePlugins();
  return Array.from(providers.values()).filter((p) => p.configured);
}
