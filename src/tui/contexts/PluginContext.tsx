import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { ProviderPlugin, ProviderUsageData } from '@/plugins/types/provider.ts';
import type { ThemePlugin } from '@/plugins/types/theme.ts';
import type { NotificationPlugin } from '@/plugins/types/notification.ts';
import { pluginRegistry } from '@/plugins/registry.ts';
import { discoverAllCredentials } from '@/credentials/index.ts';
import { createSandboxedHttpClient, createPluginLogger } from '@/plugins/sandbox.ts';
import { useLogs } from './LogContext.tsx';

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
}

interface PluginContextValue {
  providers: Map<string, ProviderState>;
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
}

export function PluginProvider({ children }: PluginProviderProps) {
  const [isInitialized, setIsInitialized] = useState(false);
  const [providers, setProviders] = useState<Map<string, ProviderState>>(new Map());
  const [themes, setThemes] = useState<ThemePlugin[]>([]);
  const [notifications, setNotifications] = useState<NotificationPlugin[]>([]);
  const { debug, info, warn, error: logError } = useLogs();

  useEffect(() => {
    async function initialize() {
      debug('Initializing plugin registry...', undefined, 'plugins');

      try {
        await pluginRegistry.initialize();
        info('Plugin registry initialized', undefined, 'plugins');
      } catch (err) {
        logError('Failed to initialize plugin registry', { error: String(err) }, 'plugins');
      }

      const providerPlugins = pluginRegistry.getAll('provider');
      const themePlugins = pluginRegistry.getAll('theme');
      const notificationPlugins = pluginRegistry.getAll('notification');

      info(`Loaded plugins`, {
        providers: providerPlugins.length,
        themes: themePlugins.length,
        notifications: notificationPlugins.length,
      }, 'plugins');

      debug('Discovering credentials...', undefined, 'credentials');

      const providerConfigs = providerPlugins.map((p) => {
        const config: { id: string; envVars: string[]; externalPaths?: Array<{ path: string; type: string; key?: string }> } = {
          id: p.id,
          envVars: p.auth.envVars,
        };
        if (p.auth.externalPaths) {
          config.externalPaths = p.auth.externalPaths;
        }
        return config;
      });

      const credentials = await discoverAllCredentials(providerConfigs);

      const providerStates = new Map<string, ProviderState>();
      const configuredIds: string[] = [];
      const unconfiguredIds: string[] = [];

      for (const plugin of providerPlugins) {
        const creds = credentials.get(plugin.id);
        const configured = creds ? plugin.isConfigured(creds) : false;
        providerStates.set(plugin.id, {
          plugin,
          configured,
          usage: null,
          loading: false,
          lastFetchAt: null,
          history: [],
        });

        if (configured) {
          configuredIds.push(plugin.id);
        } else {
          unconfiguredIds.push(plugin.id);
        }
      }

      info('Credential discovery complete', {
        configured: configuredIds,
        unconfigured: unconfiguredIds,
      }, 'credentials');

      setProviders(providerStates);
      setThemes(themePlugins);
      setNotifications(notificationPlugins);
      setIsInitialized(true);
    }

    initialize();
  }, []);



  const refreshProvider = useCallback(async (providerId: string) => {
    const state = providers.get(providerId);
    if (!state || !state.configured) {
      debug(`Skipping refresh for ${providerId}: not configured`, undefined, 'refresh');
      return;
    }

    info(`Refreshing ${providerId}...`, undefined, 'refresh');

    setProviders((prev) => {
      const next = new Map(prev);
      const current = next.get(providerId);
      if (current) {
        next.set(providerId, { ...current, loading: true });
      }
      return next;
    });

    try {
      const config: { id: string; envVars: string[]; externalPaths?: Array<{ path: string; type: string; key?: string }> } = {
        id: providerId,
        envVars: state.plugin.auth.envVars,
      };
      if (state.plugin.auth.externalPaths) {
        config.externalPaths = state.plugin.auth.externalPaths;
      }
      const credentials = await discoverAllCredentials([config]);
      const creds = credentials.get(providerId);

      if (!creds) {
        throw new Error('Credentials not found');
      }

      const http = createSandboxedHttpClient(providerId, state.plugin.permissions);
      const log = createPluginLogger(providerId);

      const usage = await state.plugin.fetchUsage({
        credentials: creds,
        http,
        log,
        config: {},
      });

      if (usage.error) {
        warn(`${providerId} returned error: ${usage.error}`, undefined, 'refresh');
      } else {
        info(`${providerId} refreshed successfully`, {
          limitReached: usage.limitReached,
          primaryUsage: usage.limits?.primary?.usedPercent,
        }, 'refresh');
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
          history: addToHistory(currentHistory, snapshot),
        });
        return next;
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      logError(`Failed to refresh ${providerId}: ${errorMsg}`, undefined, 'refresh');

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
          history: current?.history ?? [],
        });
        return next;
      });
    }
  }, [providers, debug, info, warn, logError]);

  const refreshAllProviders = useCallback(async () => {
    const configuredProviders = Array.from(providers.entries())
      .filter(([_, state]) => state.configured)
      .map(([id]) => id);

    info(`Refreshing ${configuredProviders.length} providers`, { providers: configuredProviders }, 'refresh');

    await Promise.all(configuredProviders.map(refreshProvider));
  }, [providers, refreshProvider, info]);

  const value: PluginContextValue = {
    providers,
    themes,
    notifications,
    isInitialized,
    refreshProvider,
    refreshAllProviders,
  };

  return (
    <PluginContext.Provider value={value}>
      {children}
    </PluginContext.Provider>
  );
}

export function usePlugins(): PluginContextValue {
  const context = useContext(PluginContext);
  if (!context) {
    throw new Error('usePlugins must be used within PluginProvider');
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
