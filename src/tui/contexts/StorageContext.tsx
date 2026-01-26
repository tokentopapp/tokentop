import { createContext, useContext, useEffect, useRef, useState, useCallback, useMemo, type ReactNode } from 'react';
import { initDatabase, closeDatabase, isDatabaseInitialized, getAppRunId } from '@/storage/db.ts';
import { insertProviderSnapshotBatch } from '@/storage/repos/providerSnapshots.ts';
import { insertUsageEventBatch } from '@/storage/repos/usageEvents.ts';
import { upsertAgentSession, insertAgentSessionSnapshot } from '@/storage/repos/agentSessions.ts';
import type {
  ProviderSnapshotInsert,
  UsageEventInsert,
  AgentSessionUpsert,
  AgentSessionSnapshotInsert,
  AgentSessionStreamSnapshotRow,
  StreamTotals,
} from '@/storage/types.ts';
import { computeStreamDelta } from '@/storage/types.ts';
import { useDemoMode } from './DemoModeContext.tsx';

interface StorageContextValue {
  isReady: boolean;
  appRunId: number | null;
  recordProviderSnapshots: (snapshots: ProviderSnapshotInsert[]) => void;
  recordUsageEvents: (events: UsageEventInsert[]) => void;
  recordAgentSession: (
    session: AgentSessionUpsert,
    snapshot: Omit<AgentSessionSnapshotInsert, 'agentSessionId'>,
    streams: Omit<AgentSessionStreamSnapshotRow, 'agentSessionSnapshotId'>[]
  ) => number | null;
}

const StorageContext = createContext<StorageContextValue | null>(null);

const SNAPSHOT_INTERVAL_MS = 60_000;

interface StorageProviderProps {
  children: ReactNode;
}

export function StorageProvider({ children }: StorageProviderProps) {
  const [isReady, setIsReady] = useState(false);
  const [appRunId, setAppRunId] = useState<number | null>(null);
  const lastProviderSnapshotRef = useRef<Map<string, number>>(new Map());
  const lastSessionSnapshotRef = useRef<Map<string, number>>(new Map());
  const previousTotalsRef = useRef<Map<string, StreamTotals>>(new Map());
  const { demoMode, simulator } = useDemoMode();

  useEffect(() => {
    // Skip real database in demo mode - all data stays in memory
    if (demoMode) {
      setIsReady(true);
      setAppRunId(null);
      return;
    }

    let mounted = true;

    async function init() {
      try {
        await initDatabase();
        if (mounted) {
          setIsReady(true);
          setAppRunId(getAppRunId());
        }
      } catch (err) {
        console.error('Failed to initialize database:', err);
      }
    }

    init();

    return () => {
      mounted = false;
      if (isDatabaseInitialized()) {
        closeDatabase();
      }
    };
  }, [demoMode]);

  const recordProviderSnapshots = useCallback((snapshots: ProviderSnapshotInsert[]) => {
    if (!isReady || demoMode || snapshots.length === 0) return;

    const now = Date.now();
    const filtered = snapshots.filter(s => {
      const lastTs = lastProviderSnapshotRef.current.get(s.provider) ?? 0;
      return now - lastTs >= SNAPSHOT_INTERVAL_MS;
    });

    if (filtered.length === 0) return;

    try {
      insertProviderSnapshotBatch(filtered);
      for (const s of filtered) {
        lastProviderSnapshotRef.current.set(s.provider, now);
      }
    } catch (err) {
      console.error('Failed to record provider snapshots:', err);
    }
  }, [isReady, demoMode]);

  const recordUsageEvents = useCallback((events: UsageEventInsert[]) => {
    if (!isReady || demoMode || events.length === 0) return;

    try {
      insertUsageEventBatch(events);
    } catch (err) {
      console.error('Failed to record usage events:', err);
    }
  }, [isReady, demoMode]);

  const recordAgentSession = useCallback((
    session: AgentSessionUpsert,
    snapshot: Omit<AgentSessionSnapshotInsert, 'agentSessionId'>,
    streams: Omit<AgentSessionStreamSnapshotRow, 'agentSessionSnapshotId'>[]
  ): number | null => {
    if (!isReady || demoMode) return null;

    const sessionKey = `${session.agentId}:${session.sessionId}`;
    const now = Date.now();
    const lastTs = lastSessionSnapshotRef.current.get(sessionKey) ?? 0;

    if (now - lastTs < SNAPSHOT_INTERVAL_MS) {
      return null;
    }

    try {
      const agentSessionId = upsertAgentSession(session);

      const snapshotId = insertAgentSessionSnapshot(
        { ...snapshot, agentSessionId },
        streams
      );

      lastSessionSnapshotRef.current.set(sessionKey, now);

      const usageEvents: UsageEventInsert[] = [];
      for (const stream of streams) {
        const streamKey = `${sessionKey}:${stream.provider}:${stream.model}`;
        const current: StreamTotals = {
          inputTokens: stream.inputTokens,
          outputTokens: stream.outputTokens,
          cacheReadTokens: stream.cacheReadTokens,
          cacheWriteTokens: stream.cacheWriteTokens,
          costUsd: stream.costUsd,
          requestCount: stream.requestCount,
        };

        const previous = previousTotalsRef.current.get(streamKey);
        const delta = computeStreamDelta(current, previous);

        if (delta) {
          usageEvents.push({
            timestamp: now,
            source: 'agent',
            provider: stream.provider,
            model: stream.model,
            agentId: session.agentId,
            sessionId: session.sessionId,
            projectPath: session.projectPath ?? null,
            inputTokens: delta.inputTokens,
            outputTokens: delta.outputTokens,
            cacheReadTokens: delta.cacheReadTokens,
            cacheWriteTokens: delta.cacheWriteTokens,
            costUsd: delta.costUsd,
            requestCount: delta.requestCount,
            pricingSource: stream.pricingSource ?? null,
          });
        }

        previousTotalsRef.current.set(streamKey, current);
      }

      if (usageEvents.length > 0) {
        insertUsageEventBatch(usageEvents);
      }

      return snapshotId;
    } catch (err) {
      console.error('Failed to record agent session:', err);
      return null;
    }
  }, [isReady, demoMode]);

  useEffect(() => {
    if (!demoMode || !isReady || !simulator) return;

    const interval = setInterval(() => {
      simulator.tick();
    }, 1000);

    return () => clearInterval(interval);
  }, [demoMode, isReady, simulator]);

  const value: StorageContextValue = useMemo(() => ({
    isReady,
    appRunId,
    recordProviderSnapshots,
    recordUsageEvents,
    recordAgentSession,
  }), [isReady, appRunId, recordProviderSnapshots, recordUsageEvents, recordAgentSession]);

  return (
    <StorageContext.Provider value={value}>
      {children}
    </StorageContext.Provider>
  );
}

export function useStorage(): StorageContextValue {
  const context = useContext(StorageContext);
  if (!context) {
    throw new Error('useStorage must be used within StorageProvider');
  }
  return context;
}

export function useStorageReady(): boolean {
  const { isReady } = useStorage();
  return isReady;
}
