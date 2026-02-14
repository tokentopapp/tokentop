import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import type { AgentPlugin, SessionParseOptions } from '@/plugins/types/agent.ts';
import type { AgentSessionAggregate, AgentInfo, AgentId, AgentName } from '@/agents/types.ts';
import { AGENT_ID_TO_NAME } from '@/agents/types.ts';
import { aggregateSessionUsage } from '@/agents/aggregator.ts';
import { priceSessions } from '@/agents/costing.ts';
import { pluginRegistry } from '@/plugins/registry.ts';
import { createSandboxedHttpClient, createPluginLogger } from '@/plugins/sandbox.ts';
import { useLogs } from './LogContext.tsx';
import { usePlugins } from './PluginContext.tsx';
import { useStorage } from './StorageContext.tsx';
import type { PricingSource } from '@/storage/types.ts';
import { useDemoMode } from './DemoModeContext.tsx';
import { useTimeWindow } from './TimeWindowContext.tsx';

interface AgentSessionContextValue {
  sessions: AgentSessionAggregate[];
  agents: AgentInfo[];
  isLoading: boolean;
  lastRefreshAt: number | null;
  error: string | null;
  refreshSessions: (options?: SessionParseOptions) => Promise<void>;
}

const AgentSessionContext = createContext<AgentSessionContextValue | null>(null);

const sessionPersistenceFingerprints = new Map<string, string>();

function sessionFingerprint(session: AgentSessionAggregate): string {
  return `${session.lastActivityAt}:${session.totalCostUsd ?? 0}:${session.requestCount}`;
}

interface AgentSessionProviderProps {
  children: ReactNode;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

export function AgentSessionProvider({
  children,
  autoRefresh = false,
  refreshInterval = 30000,
}: AgentSessionProviderProps) {
  const [sessions, setSessions] = useState<AgentSessionAggregate[]>([]);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastRefreshAt, setLastRefreshAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { debug, info, warn, error: logError } = useLogs();
  const { isInitialized: pluginsInitialized } = usePlugins();
  const { isReady: storageReady, recordAgentSession } = useStorage();
  const { demoMode, simulator } = useDemoMode();
  const { windowMs } = useTimeWindow();
  const hasBackfilled = useRef(false);

  const discoverAgents = useCallback(async (): Promise<AgentInfo[]> => {
    const agentPlugins = pluginRegistry.getAll('agent');
    const discovered: AgentInfo[] = [];

    for (const plugin of agentPlugins) {
      const agentId = plugin.id as AgentId;
      const agentName = AGENT_ID_TO_NAME[agentId] ?? plugin.name as AgentName;

      try {
        const installed = await plugin.isInstalled();
        const agentInfo: AgentInfo = {
          agentId,
          name: agentName,
          installed,
          sessionParsingSupported: plugin.capabilities.sessionParsing,
        };
        discovered.push(agentInfo);
      } catch (err) {
        const agentInfo: AgentInfo = {
          agentId,
          name: agentName,
          installed: false,
          sessionParsingSupported: false,
        };
        agentInfo.error = err instanceof Error ? err.message : 'Unknown error';
        discovered.push(agentInfo);
      }
    }

    return discovered;
  }, []);

  const fetchAgentSessions = useCallback(async (
    plugin: AgentPlugin,
    options: SessionParseOptions
  ): Promise<AgentSessionAggregate[]> => {
    const agentId = plugin.id as AgentId;
    const agentName = AGENT_ID_TO_NAME[agentId] ?? plugin.name as AgentName;

    const http = createSandboxedHttpClient(plugin.id, plugin.permissions);
    const log = createPluginLogger(plugin.id);
    const ctx = { http, log, config: {} };

    const rawSessions = await plugin.parseSessions(options, ctx);

    if (rawSessions.length === 0) {
      return [];
    }

    const aggregated = aggregateSessionUsage({
      agentId,
      agentName,
      rows: rawSessions,
    });

    return aggregated;
  }, []);

  const refreshSessions = useCallback(async (options: SessionParseOptions = {}) => {
    const isInitialLoad = sessions.length === 0;
    if (isInitialLoad) {
      setIsLoading(true);
    }
    setError(null);

    try {
      if (demoMode && simulator) {
        const snapshot = simulator.tick();
        const demoSessions = snapshot.sessions;
        setSessions(demoSessions);
        setLastRefreshAt(Date.now());
        info('Demo sessions refreshed', { count: demoSessions.length }, 'agent-sessions');
        return;
      }

      debug('Starting session refresh...', undefined, 'agent-sessions');

      const discoveredAgents = await discoverAgents();
      setAgents(discoveredAgents);

      const agentPlugins = pluginRegistry.getAll('agent');
      const allAggregates: AgentSessionAggregate[] = [];

      for (const plugin of agentPlugins) {
        if (!plugin.capabilities.sessionParsing) {
          debug(`Skipping ${plugin.id}: session parsing not supported`, undefined, 'agent-sessions');
          continue;
        }

        try {
          const installed = await plugin.isInstalled();
          if (!installed) {
            debug(`Skipping ${plugin.id}: not installed`, undefined, 'agent-sessions');
            continue;
          }

          const aggregates = await fetchAgentSessions(plugin, options);
          allAggregates.push(...aggregates);
          info(`Fetched ${aggregates.length} sessions from ${plugin.id}`, undefined, 'agent-sessions');
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Unknown error';
          warn(`Failed to fetch sessions from ${plugin.id}: ${errorMsg}`, undefined, 'agent-sessions');
        }
      }

      const pricedSessions = await priceSessions(allAggregates);

      pricedSessions.sort((a, b) => b.lastActivityAt - a.lastActivityAt);

      if (storageReady) {
        const now = Date.now();
        let persistedCount = 0;
        for (const session of pricedSessions) {
          const fp = sessionFingerprint(session);
          const prevFp = sessionPersistenceFingerprints.get(session.sessionId);
          if (prevFp === fp) continue;

          sessionPersistenceFingerprints.set(session.sessionId, fp);
          persistedCount++;

          recordAgentSession(
            {
              agentId: session.agentId,
              sessionId: session.sessionId,
              projectPath: session.projectPath ?? null,
              startedAt: session.startedAt ?? null,
              lastSeenAt: now,
            },
            {
              timestamp: now,
              lastActivityAt: session.lastActivityAt,
              status: session.status,
              totalInputTokens: session.totals.input,
              totalOutputTokens: session.totals.output,
              totalCacheReadTokens: session.totals.cacheRead ?? 0,
              totalCacheWriteTokens: session.totals.cacheWrite ?? 0,
              totalCostUsd: session.totalCostUsd ?? 0,
              requestCount: session.requestCount,
            },
            session.streams.map(s => ({
              provider: s.providerId,
              model: s.modelId,
              inputTokens: s.tokens.input,
              outputTokens: s.tokens.output,
              cacheReadTokens: s.tokens.cacheRead ?? 0,
              cacheWriteTokens: s.tokens.cacheWrite ?? 0,
              costUsd: s.costUsd ?? 0,
              requestCount: s.requestCount,
              pricingSource: (s.pricingSource as PricingSource) ?? null,
            }))
          );
        }
        debug(`Persisted ${persistedCount}/${pricedSessions.length} changed sessions to storage`, undefined, 'agent-sessions');
      }

      setSessions(pricedSessions);
      setLastRefreshAt(Date.now());

      info(`Session refresh complete`, { count: pricedSessions.length }, 'agent-sessions');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      logError(`Session refresh failed: ${errorMsg}`, undefined, 'agent-sessions');
      setError(errorMsg);
    } finally {
      if (isInitialLoad) {
        setIsLoading(false);
      }
    }
  }, [sessions.length, discoverAgents, fetchAgentSessions, debug, info, warn, logError, storageReady, recordAgentSession, demoMode]);

  const refreshSessionsRef = useRef(refreshSessions);
  refreshSessionsRef.current = refreshSessions;

  useEffect(() => {
    if (!(demoMode || pluginsInitialized)) return;

    const since = windowMs !== null ? Date.now() - windowMs : undefined;
    refreshSessions(since ? { since } : {}).then(() => {
      if (since && !hasBackfilled.current) {
        hasBackfilled.current = true;
        refreshSessionsRef.current();
      }
    });
  }, [pluginsInitialized, demoMode]);

  useEffect(() => {
    if (!autoRefresh) return;

    debug(`Setting up session refresh interval: ${refreshInterval}ms`, undefined, 'agent-sessions');
    
    const intervalId = setInterval(() => {
      debug('Interval tick - refreshing sessions', undefined, 'agent-sessions');
      refreshSessionsRef.current();
    }, refreshInterval);

    return () => {
      debug('Clearing session refresh interval', undefined, 'agent-sessions');
      clearInterval(intervalId);
    };
  }, [autoRefresh, refreshInterval, debug]);

  const value: AgentSessionContextValue = {
    sessions,
    agents,
    isLoading,
    lastRefreshAt,
    error,
    refreshSessions,
  };

  return (
    <AgentSessionContext.Provider value={value}>
      {children}
    </AgentSessionContext.Provider>
  );
}

export function useAgentSessions(): AgentSessionContextValue {
  const context = useContext(AgentSessionContext);
  if (!context) {
    throw new Error('useAgentSessions must be used within AgentSessionProvider');
  }
  return context;
}

export function useActiveSessions(): AgentSessionAggregate[] {
  const { sessions } = useAgentSessions();
  return sessions.filter(s => s.status === 'active');
}

export function useSessionsByAgent(agentId: AgentId): AgentSessionAggregate[] {
  const { sessions } = useAgentSessions();
  return sessions.filter(s => s.agentId === agentId);
}

export function useTotalCost(): number {
  const { sessions } = useAgentSessions();
  return sessions.reduce((sum, s) => sum + (s.totalCostUsd ?? 0), 0);
}

export function useTotalTokens(): { input: number; output: number } {
  const { sessions } = useAgentSessions();
  return sessions.reduce(
    (acc, s) => ({
      input: acc.input + s.totals.input,
      output: acc.output + s.totals.output,
    }),
    { input: 0, output: 0 }
  );
}
