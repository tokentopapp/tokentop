import type { AgentPlugin, SessionParseOptions } from "@tokentop/plugin-sdk";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { aggregateSessionUsage, deduplicateAggregates } from "@/agents/aggregator.ts";
import { priceSessions } from "@/agents/costing.ts";
import type { AgentId, AgentInfo, AgentSessionAggregate } from "@/agents/types.ts";
import { createPluginContext } from "@/plugins/plugin-context-factory.ts";
import { pluginRegistry } from "@/plugins/registry.ts";
import { createPluginLogger, createSandboxedHttpClient } from "@/plugins/sandbox.ts";
import { persistSessions } from "@/storage/persistence-service.ts";
import type { PricingSource } from "@/storage/types.ts";
import { useDemoMode } from "./DemoModeContext.tsx";
import { useLogs } from "./LogContext.tsx";
import { usePlugins } from "./PluginContext.tsx";
import { useTimeWindow } from "./TimeWindowContext.tsx";

/** Polling interval when at least one session is active. */
const ACTIVE_INTERVAL_MS = 3_000;
/** Polling interval when all sessions are idle/historical. */
const IDLE_INTERVAL_MS = 15_000;
interface AgentSessionContextValue {
  sessions: AgentSessionAggregate[];
  agents: AgentInfo[];
  isLoading: boolean;
  lastRefreshAt: number | null;
  error: string | null;
  refreshSessions: (options?: SessionParseOptions) => Promise<void>;
}

const AgentSessionContext = createContext<AgentSessionContextValue | null>(null);

interface AgentSessionProviderProps {
  children: ReactNode;
  autoRefresh?: boolean;
}

/**
 * Compute a lightweight fingerprint of session state.
 * If the fingerprint hasn't changed, we skip setSessions() to avoid
 * unnecessary React re-renders of the entire session list.
 */
function computeSessionFingerprint(sessions: AgentSessionAggregate[]): string {
  // Build a compact string from the fields that actually affect the UI.
  // This is intentionally simple — no crypto hashing needed, just string comparison.
  let fp = `${sessions.length}:`;
  for (const s of sessions) {
    fp += `${s.sessionId},${s.status},${s.lastActivityAt},${s.totals.input},${s.totals.output},${s.totalCostUsd ?? 0},${s.requestCount};`;
  }
  return fp;
}

export function AgentSessionProvider({ children, autoRefresh = false }: AgentSessionProviderProps) {
  const [sessions, setSessions] = useState<AgentSessionAggregate[]>([]);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastRefreshAt, setLastRefreshAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { debug, warn, error: logError } = useLogs();
  const { isInitialized: pluginsInitialized } = usePlugins();
  const { demoMode, simulator } = useDemoMode();
  const { windowMs } = useTimeWindow();
  const hasBackfilled = useRef(false);
  const isRefreshingRef = useRef(false);
  // Bugfix: track first completed load separately so an empty 1h window does not
  // keep re-entering the initial loading state forever.
  const hasLoadedOnceRef = useRef(false);
  const lastFingerprintRef = useRef<string>("");

  const discoverAgents = useCallback(async (): Promise<AgentInfo[]> => {
    const agentPlugins = pluginRegistry.getAll("agent");
    const discovered: AgentInfo[] = [];

    for (const plugin of agentPlugins) {
      const agentId = plugin.id;
      const agentName = plugin.name;
      const ctx = createPluginContext(plugin.id, plugin.permissions);

      try {
        const installed = await plugin.isInstalled(ctx);
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
        agentInfo.error = err instanceof Error ? err.message : "Unknown error";
        discovered.push(agentInfo);
      }
    }

    return discovered;
  }, []);

  const sessionParseSignal = useRef(AbortSignal.timeout(120_000));
  const fetchAgentSessions = useCallback(
    async (plugin: AgentPlugin, options: SessionParseOptions): Promise<AgentSessionAggregate[]> => {
      const agentId = plugin.id;
      const agentName = plugin.name;

      const http = createSandboxedHttpClient(plugin.id, plugin.permissions);
      const logger = createPluginLogger(plugin.id);
      const ctx = { http, logger, config: {}, signal: sessionParseSignal.current };

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
    },
    [],
  );

  const refreshSessions = useCallback(
    async (options: SessionParseOptions = {}) => {
      if (isRefreshingRef.current) return;
      isRefreshingRef.current = true;

      const isInitialLoad = !hasLoadedOnceRef.current;
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
          debug("Demo sessions refreshed", { count: demoSessions.length }, "agent-sessions");
          return;
        }

        debug("Starting session refresh...", undefined, "agent-sessions");

        const discoveredAgents = await discoverAgents();
        setAgents(discoveredAgents);

        const agentPlugins = pluginRegistry.getAll("agent");
        const allAggregates: AgentSessionAggregate[] = [];

        for (const plugin of agentPlugins) {
          if (!plugin.capabilities.sessionParsing) {
            debug(
              `Skipping ${plugin.id}: session parsing not supported`,
              undefined,
              "agent-sessions",
            );
            continue;
          }

          try {
            const pluginCtx = createPluginContext(plugin.id, plugin.permissions);
            const installed = await plugin.isInstalled(pluginCtx);
            if (!installed) {
              debug(`Skipping ${plugin.id}: not installed`, undefined, "agent-sessions");
              continue;
            }

            const aggregates = await fetchAgentSessions(plugin, options);
            allAggregates.push(...aggregates);
            debug(
              `Fetched ${aggregates.length} sessions from ${plugin.id}`,
              undefined,
              "agent-sessions",
            );
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : "Unknown error";
            warn(
              `Failed to fetch sessions from ${plugin.id}: ${errorMsg}`,
              undefined,
              "agent-sessions",
            );
          }
        }

        // Deduplicate sessions claimed by multiple agents scanning the same directory.
        const dedupedAggregates = deduplicateAggregates(allAggregates);
        if (dedupedAggregates.length < allAggregates.length) {
          debug(
            `Deduplicated sessions: ${allAggregates.length} \u2192 ${dedupedAggregates.length}`,
            undefined,
            "agent-sessions",
          );
        }

        const pricedSessions = await priceSessions(dedupedAggregates);

        pricedSessions.sort((a, b) => b.lastActivityAt - a.lastActivityAt);

        // --- Change detection: skip React update if nothing changed ---
        const newFingerprint = computeSessionFingerprint(pricedSessions);
        const changed = newFingerprint !== lastFingerprintRef.current;
        lastFingerprintRef.current = newFingerprint;

        if (!changed) {
          debug(
            "Session refresh: no changes detected, skipping render",
            undefined,
            "agent-sessions",
          );
          return;
        }

        // Persist to storage — the persistence service handles throttling
        // internally (fingerprint gate + 5-minute per-session throttle).
        // Safe to call every tick; state lives on globalThis, survives HMR.
        const now = Date.now();
        const persistData = pricedSessions.map((session) => ({
          session: {
            agentId: session.agentId,
            sessionId: session.sessionId,
            projectPath: session.projectPath ?? null,
            startedAt: session.startedAt ?? null,
            lastSeenAt: now,
          },
          snapshot: {
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
          streams: session.streams.map((s) => ({
            provider: s.providerId,
            model: s.modelId,
            inputTokens: s.tokens.input,
            outputTokens: s.tokens.output,
            cacheReadTokens: s.tokens.cacheRead ?? 0,
            cacheWriteTokens: s.tokens.cacheWrite ?? 0,
            costUsd: s.costUsd ?? 0,
            requestCount: s.requestCount,
            pricingSource: (s.pricingSource as PricingSource) ?? null,
          })),
        }));
        const persistedCount = persistSessions(persistData);
        debug(
          `Persisted ${persistedCount}/${pricedSessions.length} sessions to storage`,
          undefined,
          "agent-sessions",
        );

        setSessions(pricedSessions);
        setLastRefreshAt(Date.now());

        debug(`Session refresh complete`, { count: pricedSessions.length }, "agent-sessions");
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        logError(`Session refresh failed: ${errorMsg}`, undefined, "agent-sessions");
        setError(errorMsg);
      } finally {
        isRefreshingRef.current = false;
        if (isInitialLoad) {
          setIsLoading(false);
          hasLoadedOnceRef.current = true;
        }
      }
    },
    [sessions.length, discoverAgents, fetchAgentSessions, debug, warn, logError, demoMode],
  );

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

    // Adaptive polling: poll faster when sessions are active, slower when idle.
    // The interval is re-evaluated after each tick based on current session state.
    let timerId: ReturnType<typeof setTimeout> | null = null;

    const scheduleNext = () => {
      const hasActive = sessions.some((s) => s.status === "active");
      const interval = hasActive ? ACTIVE_INTERVAL_MS : IDLE_INTERVAL_MS;

      timerId = setTimeout(() => {
        debug(
          `Adaptive tick (${hasActive ? "active" : "idle"}, ${interval}ms)`,
          undefined,
          "agent-sessions",
        );
        refreshSessionsRef.current().then(scheduleNext);
      }, interval);
    };

    scheduleNext();

    return () => {
      if (timerId !== null) {
        clearTimeout(timerId);
      }
    };
  }, [autoRefresh, sessions, debug]);

  const value: AgentSessionContextValue = {
    sessions,
    agents,
    isLoading,
    lastRefreshAt,
    error,
    refreshSessions,
  };

  return <AgentSessionContext.Provider value={value}>{children}</AgentSessionContext.Provider>;
}

export function useAgentSessions(): AgentSessionContextValue {
  const context = useContext(AgentSessionContext);
  if (!context) {
    throw new Error("useAgentSessions must be used within AgentSessionProvider");
  }
  return context;
}

export function useActiveSessions(): AgentSessionAggregate[] {
  const { sessions } = useAgentSessions();
  return sessions.filter((s) => s.status === "active");
}

export function useSessionsByAgent(agentId: AgentId): AgentSessionAggregate[] {
  const { sessions } = useAgentSessions();
  return sessions.filter((s) => s.agentId === agentId);
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
    { input: 0, output: 0 },
  );
}
