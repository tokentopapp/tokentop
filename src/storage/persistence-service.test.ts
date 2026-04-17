import { beforeEach, describe, expect, mock, test } from "bun:test";
import type {
  AgentSessionSnapshotInsert,
  AgentSessionStreamSnapshotRow,
  AgentSessionUpsert,
  UsageEventInsert,
} from "./types.ts";

mock.module("./db.ts", () => ({
  isDatabaseInitialized: () => true,
}));

let upsertCalls: AgentSessionUpsert[] = [];
let snapshotCalls: Array<{
  snapshot: AgentSessionSnapshotInsert;
  streams: Omit<AgentSessionStreamSnapshotRow, "agentSessionSnapshotId">[];
}> = [];
let usageEventCalls: UsageEventInsert[][] = [];

let seededSnapshots: Array<{
  agentId: string;
  sessionId: string;
  timestamp: number;
  totalCostUsd: number;
  requestCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
}> = [];

mock.module("./repos/agentSessions.ts", () => ({
  getLatestSnapshotsForAllSessions: () => seededSnapshots,
  getLatestStreamTotalsForAllSessions: () => [],
  upsertAgentSession: (session: AgentSessionUpsert) => {
    upsertCalls.push(session);
    return upsertCalls.length;
  },
  insertAgentSessionSnapshot: (
    snapshot: AgentSessionSnapshotInsert,
    streams: Omit<AgentSessionStreamSnapshotRow, "agentSessionSnapshotId">[],
  ) => {
    snapshotCalls.push({ snapshot, streams });
  },
}));

mock.module("./repos/usageEvents.ts", () => ({
  insertUsageEventBatch: (events: UsageEventInsert[]) => {
    usageEventCalls.push(events);
  },
}));

const { persistSessions, seedPreviousTotals } = await import("./persistence-service.ts");

beforeEach(() => {
  upsertCalls = [];
  snapshotCalls = [];
  usageEventCalls = [];
  seededSnapshots = [];
  (globalThis as { __tokentopPersistence?: unknown }).__tokentopPersistence = undefined;
});

function makePersistData(overrides: {
  agentId?: string;
  sessionId?: string;
  totalCostUsd?: number;
  requestCount?: number;
  totalInputTokens?: number;
  totalOutputTokens?: number;
  timestamp?: number;
}) {
  const now = overrides.timestamp ?? Date.now();
  return {
    session: {
      agentId: overrides.agentId ?? "claude-code",
      sessionId: overrides.sessionId ?? "s1",
      projectPath: null,
      startedAt: null,
      lastSeenAt: now,
    },
    snapshot: {
      timestamp: now,
      lastActivityAt: now,
      status: null,
      totalInputTokens: overrides.totalInputTokens ?? 1000,
      totalOutputTokens: overrides.totalOutputTokens ?? 500,
      totalCacheReadTokens: 0,
      totalCacheWriteTokens: 0,
      totalCostUsd: overrides.totalCostUsd ?? 1.5,
      requestCount: overrides.requestCount ?? 10,
    },
    streams: [],
  };
}

describe("seedPreviousTotals", () => {
  test("skips persist for session whose fingerprint matches seeded DB snapshot", () => {
    seededSnapshots = [
      {
        agentId: "claude-code",
        sessionId: "s1",
        timestamp: Date.now() - 60_000,
        totalCostUsd: 1.5,
        requestCount: 10,
        totalInputTokens: 1000,
        totalOutputTokens: 500,
      },
    ];

    seedPreviousTotals();

    const persistedCount = persistSessions([
      makePersistData({
        agentId: "claude-code",
        sessionId: "s1",
        totalCostUsd: 1.5,
        requestCount: 10,
        totalInputTokens: 1000,
        totalOutputTokens: 500,
      }),
    ]);

    expect(persistedCount).toBe(0);
    expect(upsertCalls).toHaveLength(0);
    expect(snapshotCalls).toHaveLength(0);
  });

  test("persists session whose usage changed since seeded snapshot", () => {
    seededSnapshots = [
      {
        agentId: "claude-code",
        sessionId: "s1",
        timestamp: Date.now() - 10 * 60 * 1000,
        totalCostUsd: 1.5,
        requestCount: 10,
        totalInputTokens: 1000,
        totalOutputTokens: 500,
      },
    ];

    seedPreviousTotals();

    const persistedCount = persistSessions([
      makePersistData({
        agentId: "claude-code",
        sessionId: "s1",
        totalCostUsd: 2.0,
        requestCount: 12,
        totalInputTokens: 1200,
        totalOutputTokens: 600,
      }),
    ]);

    expect(persistedCount).toBe(1);
    expect(upsertCalls).toHaveLength(1);
    expect(snapshotCalls).toHaveLength(1);
  });

  test("persists brand-new session not present in seed", () => {
    seededSnapshots = [];

    seedPreviousTotals();

    const persistedCount = persistSessions([
      makePersistData({ agentId: "claude-code", sessionId: "new-session" }),
    ]);

    expect(persistedCount).toBe(1);
    expect(upsertCalls).toHaveLength(1);
  });

  test("skips thousands of unchanged sessions after seed (regression for startup freeze)", () => {
    const baseTs = Date.now() - 60_000;
    seededSnapshots = Array.from({ length: 5000 }, (_, i) => ({
      agentId: "claude-code",
      sessionId: `s${i}`,
      timestamp: baseTs + i,
      totalCostUsd: i * 0.01,
      requestCount: i,
      totalInputTokens: i * 100,
      totalOutputTokens: i * 50,
    }));

    seedPreviousTotals();

    const persistData = seededSnapshots.map((s) =>
      makePersistData({
        agentId: s.agentId,
        sessionId: s.sessionId,
        totalCostUsd: s.totalCostUsd,
        requestCount: s.requestCount,
        totalInputTokens: s.totalInputTokens,
        totalOutputTokens: s.totalOutputTokens,
      }),
    );

    const persistedCount = persistSessions(persistData);

    expect(persistedCount).toBe(0);
    expect(upsertCalls).toHaveLength(0);
    expect(snapshotCalls).toHaveLength(0);
  });
});
