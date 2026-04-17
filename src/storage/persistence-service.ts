/**
 * Module-level session persistence service.
 *
 * All mutable state is stored on globalThis to survive bun --hot HMR
 * reloads and React component remounts. This decouples persistence
 * from React's lifecycle entirely.
 *
 * Call persistSessions() on every poll tick (1s). The service internally:
 *   Gate 1: Skips sessions whose usage data hasn't changed (fingerprint)
 *   Gate 2: Throttles writes to at most once per SNAPSHOT_INTERVAL_MS
 *
 * Both gates update their state only on successful writes, ensuring
 * deferred writes when the throttle expires.
 */

import { isDatabaseInitialized } from "./db.ts";
import {
  getLatestSnapshotsForAllSessions,
  getLatestStreamTotalsForAllSessions,
  insertAgentSessionSnapshot,
  upsertAgentSession,
} from "./repos/agentSessions.ts";
import { insertUsageEventBatch } from "./repos/usageEvents.ts";
import type {
  AgentSessionSnapshotInsert,
  AgentSessionStreamSnapshotRow,
  AgentSessionUpsert,
  StreamTotals,
  UsageEventInsert,
} from "./types.ts";
import { computeStreamDelta } from "./types.ts";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Minimum interval between DB writes for the same session */
const SNAPSHOT_INTERVAL_MS = 300_000; // 5 minutes

/** Remove tracking entries for sessions not written in this window */
const STALE_ENTRY_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

/** Run eviction at most this often */
const EVICTION_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

// ---------------------------------------------------------------------------
// Global state (survives bun --hot HMR and React remounts)
// ---------------------------------------------------------------------------

interface PersistenceState {
  /** Timestamp of last successful DB write per session key */
  lastWriteTimestamps: Map<string, number>;
  /** Usage-based fingerprint per session key (updated only on successful write) */
  sessionFingerprints: Map<string, string>;
  /** Previous stream totals for delta computation */
  previousStreamTotals: Map<string, StreamTotals>;
  /** Whether startup seeding has completed */
  seeded: boolean;
  /** Timestamp of last stale entry eviction run */
  lastEvictionAt: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __tokentopPersistence: PersistenceState | undefined;
}

function getState(): PersistenceState {
  if (!globalThis.__tokentopPersistence) {
    globalThis.__tokentopPersistence = {
      lastWriteTimestamps: new Map(),
      sessionFingerprints: new Map(),
      previousStreamTotals: new Map(),
      seeded: false,
      lastEvictionAt: 0,
    };
  }
  return globalThis.__tokentopPersistence;
}

// ---------------------------------------------------------------------------
// Fingerprinting
// ---------------------------------------------------------------------------

/**
 * Compute a fingerprint based on usage data only (not lastActivityAt).
 * This ensures inactive sessions with stable usage don't trigger writes,
 * while active sessions that consume tokens do.
 */
function computeFingerprint(snapshot: Omit<AgentSessionSnapshotInsert, "agentSessionId">): string {
  return `${snapshot.totalCostUsd}:${snapshot.requestCount}:${snapshot.totalInputTokens}:${snapshot.totalOutputTokens}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface SessionPersistData {
  session: AgentSessionUpsert;
  snapshot: Omit<AgentSessionSnapshotInsert, "agentSessionId">;
  streams: Omit<AgentSessionStreamSnapshotRow, "agentSessionSnapshotId">[];
}

function evictStaleEntries(state: PersistenceState, now: number): void {
  if (now - state.lastEvictionAt < EVICTION_INTERVAL_MS) return;
  state.lastEvictionAt = now;

  const cutoff = now - STALE_ENTRY_MAX_AGE_MS;
  for (const [key, ts] of state.lastWriteTimestamps) {
    if (ts < cutoff) {
      state.lastWriteTimestamps.delete(key);
      state.sessionFingerprints.delete(key);
    }
  }

  // Evict stream totals whose parent session was evicted
  for (const streamKey of state.previousStreamTotals.keys()) {
    const sessionKey = streamKey.slice(0, streamKey.indexOf(":", streamKey.indexOf(":") + 1));
    if (!state.lastWriteTimestamps.has(sessionKey)) {
      state.previousStreamTotals.delete(streamKey);
    }
  }
}

/**
 * Persist session data to the database with per-session throttling.
 *
 * Safe to call on every poll tick (every 1s). The service internally:
 *   1. Skips sessions whose usage data hasn't changed (fingerprint gate)
 *   2. Throttles writes to at most once per SNAPSHOT_INTERVAL_MS per session
 *
 * @returns Number of sessions actually written to DB
 */
export function persistSessions(sessions: SessionPersistData[]): number {
  if (!isDatabaseInitialized()) return 0;

  const state = getState();
  const now = Date.now();
  evictStaleEntries(state, now);
  let persistedCount = 0;

  for (const { session, snapshot, streams } of sessions) {
    const sessionKey = `${session.agentId}:${session.sessionId}`;

    // Gate 1: Skip sessions whose usage data hasn't changed since last write
    const fp = computeFingerprint(snapshot);
    if (state.sessionFingerprints.get(sessionKey) === fp) continue;

    // Gate 2: Throttle writes to once per interval per session
    const lastTs = state.lastWriteTimestamps.get(sessionKey) ?? 0;
    if (now - lastTs < SNAPSHOT_INTERVAL_MS) continue;

    // Both gates passed — write to DB
    try {
      const agentSessionId = upsertAgentSession(session);
      insertAgentSessionSnapshot({ ...snapshot, agentSessionId }, streams);

      // Compute and emit usage event deltas
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

        const previous = state.previousStreamTotals.get(streamKey);
        const delta = computeStreamDelta(current, previous);

        if (delta) {
          usageEvents.push({
            timestamp: now,
            source: "agent",
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

        state.previousStreamTotals.set(streamKey, current);
      }

      if (usageEvents.length > 0) {
        insertUsageEventBatch(usageEvents);
      }

      // Update tracking state ONLY on successful write
      state.lastWriteTimestamps.set(sessionKey, now);
      state.sessionFingerprints.set(sessionKey, fp);
      persistedCount++;
    } catch (err) {
      console.error("Failed to persist session:", err);
    }
  }

  return persistedCount;
}

export function seedPreviousTotals(): void {
  const state = getState();
  if (state.seeded) return;

  try {
    const latestTotals = getLatestStreamTotalsForAllSessions();
    for (const row of latestTotals) {
      const streamKey = `${row.agentId}:${row.sessionId}:${row.provider}:${row.model}`;
      state.previousStreamTotals.set(streamKey, {
        inputTokens: row.inputTokens,
        outputTokens: row.outputTokens,
        cacheReadTokens: row.cacheReadTokens,
        cacheWriteTokens: row.cacheWriteTokens,
        costUsd: row.costUsd,
        requestCount: row.requestCount,
      });
    }

    // Seeds Gate 1/2 so the first post-startup tick does not rewrite every
    // historical session. computeFingerprint only reads cost/count/input/output,
    // so the other fields are placeholders to satisfy the snapshot shape.
    const latestSnapshots = getLatestSnapshotsForAllSessions();
    for (const snap of latestSnapshots) {
      const sessionKey = `${snap.agentId}:${snap.sessionId}`;
      const fp = computeFingerprint({
        timestamp: snap.timestamp,
        lastActivityAt: snap.timestamp,
        status: null,
        totalInputTokens: snap.totalInputTokens,
        totalOutputTokens: snap.totalOutputTokens,
        totalCacheReadTokens: 0,
        totalCacheWriteTokens: 0,
        totalCostUsd: snap.totalCostUsd,
        requestCount: snap.requestCount,
      });
      state.sessionFingerprints.set(sessionKey, fp);
      state.lastWriteTimestamps.set(sessionKey, snap.timestamp);
    }

    state.seeded = true;
  } catch (err) {
    console.error("Failed to seed previous totals from DB:", err);
  }
}
