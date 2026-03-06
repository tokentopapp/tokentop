import type { SessionUsageData } from "@tokentop/plugin-sdk";
import {
  type AgentId,
  type AgentName,
  type AgentSessionAggregate,
  type AgentSessionStream,
  type StreamWindowedTokens,
  type TokenCounts,
  totalTokenCount,
} from "./types.ts";

const ACTIVE_THRESHOLD_MS = 2 * 60 * 1000;

interface AggregateOptions {
  agentId: AgentId;
  agentName: AgentName;
  rows: SessionUsageData[];
  now?: number;
  activeThresholdMs?: number;
}

interface StreamKey {
  providerId: string;
  modelId: string;
}

function streamKeyToString(key: StreamKey): string {
  return `${key.providerId}::${key.modelId}`;
}

function sumTokens(a: TokenCounts, b: TokenCounts): TokenCounts {
  const result: TokenCounts = {
    input: a.input + b.input,
    output: a.output + b.output,
  };

  const cacheRead = (a.cacheRead ?? 0) + (b.cacheRead ?? 0);
  if (cacheRead > 0) result.cacheRead = cacheRead;

  const cacheWrite = (a.cacheWrite ?? 0) + (b.cacheWrite ?? 0);
  if (cacheWrite > 0) result.cacheWrite = cacheWrite;

  return result;
}

function computeWindowBoundaries(now: number) {
  const nowDate = new Date(now);
  const startOfDay = new Date(
    nowDate.getFullYear(),
    nowDate.getMonth(),
    nowDate.getDate(),
  ).getTime();
  const dayOfWeek = nowDate.getDay();
  const startOfWeek = new Date(
    nowDate.getFullYear(),
    nowDate.getMonth(),
    nowDate.getDate() - dayOfWeek,
  ).getTime();
  const startOfMonth = new Date(nowDate.getFullYear(), nowDate.getMonth(), 1).getTime();
  return { startOfDay, startOfWeek, startOfMonth };
}

interface StreamAccumulator {
  key: StreamKey;
  tokens: TokenCounts;
  requestCount: number;
  windowed: StreamWindowedTokens;
}

export function aggregateSessionUsage(options: AggregateOptions): AgentSessionAggregate[] {
  const {
    agentId,
    agentName,
    rows,
    now = Date.now(),
    activeThresholdMs = ACTIVE_THRESHOLD_MS,
  } = options;
  const { startOfDay, startOfWeek, startOfMonth } = computeWindowBoundaries(now);

  const sessionMap = new Map<
    string,
    {
      sessionName?: string;
      projectPath?: string;
      timestamps: number[];
      sessionUpdatedAt?: number;
      streamMap: Map<string, StreamAccumulator>;
      hasEstimated: boolean;
    }
  >();

  for (const row of rows) {
    const existing = sessionMap.get(row.sessionId);
    if (!existing) {
      const newSession: {
        sessionName?: string;
        projectPath?: string;
        timestamps: number[];
        sessionUpdatedAt?: number;
        streamMap: Map<string, StreamAccumulator>;
        hasEstimated: boolean;
      } = {
        timestamps: [],
        streamMap: new Map(),
        hasEstimated: false,
      };
      if (row.sessionName) newSession.sessionName = row.sessionName;
      if (row.projectPath) newSession.projectPath = row.projectPath;
      if (row.sessionUpdatedAt) newSession.sessionUpdatedAt = row.sessionUpdatedAt;
      sessionMap.set(row.sessionId, newSession);
    }

    const session = sessionMap.get(row.sessionId);
    if (!session) continue;

    session.timestamps.push(row.timestamp);
    if (row.sessionName && !session.sessionName) {
      session.sessionName = row.sessionName;
    }
    if (row.projectPath && !session.projectPath) {
      session.projectPath = row.projectPath;
    }
    if (
      row.sessionUpdatedAt &&
      (!session.sessionUpdatedAt || row.sessionUpdatedAt > session.sessionUpdatedAt)
    ) {
      session.sessionUpdatedAt = row.sessionUpdatedAt;
    }

    const streamKey: StreamKey = { providerId: row.providerId, modelId: row.modelId };
    const streamKeyStr = streamKeyToString(streamKey);

    let stream = session.streamMap.get(streamKeyStr);
    if (!stream) {
      stream = {
        key: streamKey,
        tokens: { input: 0, output: 0 },
        requestCount: 0,
        windowed: { dayTokens: 0, weekTokens: 0, monthTokens: 0, totalTokens: 0 },
      };
      session.streamMap.set(streamKeyStr, stream);
    }

    stream.tokens = sumTokens(stream.tokens, row.tokens);
    stream.requestCount += 1;

    const msgTokens = totalTokenCount(row.tokens);
    stream.windowed.totalTokens += msgTokens;
    if (row.timestamp >= startOfDay) stream.windowed.dayTokens += msgTokens;
    if (row.timestamp >= startOfWeek) stream.windowed.weekTokens += msgTokens;
    if (row.timestamp >= startOfMonth) stream.windowed.monthTokens += msgTokens;
    if ((row.metadata?.isEstimated as boolean) === true) {
      session.hasEstimated = true;
    }
  }

  const results: AgentSessionAggregate[] = [];

  for (const [sessionId, session] of sessionMap) {
    const startedAt = Math.min(...session.timestamps);
    const lastActivityAt = Math.max(...session.timestamps);
    const lastSeenAt = session.sessionUpdatedAt ?? lastActivityAt;
    const status = now - lastSeenAt <= activeThresholdMs ? "active" : "idle";

    const streams: AgentSessionStream[] = [];
    const streamWindowedTokens = new Map<string, StreamWindowedTokens>();
    let totals: TokenCounts = { input: 0, output: 0 };
    let totalRequestCount = 0;

    for (const [streamKeyStr, stream] of session.streamMap) {
      streams.push({
        providerId: stream.key.providerId,
        modelId: stream.key.modelId,
        tokens: stream.tokens,
        requestCount: stream.requestCount,
      });
      totals = sumTokens(totals, stream.tokens);
      totalRequestCount += stream.requestCount;
      streamWindowedTokens.set(streamKeyStr, stream.windowed);
    }

    const aggregate: AgentSessionAggregate = {
      sessionId,
      agentId,
      agentName,
      startedAt,
      lastActivityAt,
      status,
      totals,
      requestCount: totalRequestCount,
      streams,
      costInDay: 0,
      costInWeek: 0,
      costInMonth: 0,
      _streamWindowedTokens: streamWindowedTokens,
    };
    if (session.sessionName) aggregate.sessionName = session.sessionName;
    if (session.projectPath) aggregate.projectPath = session.projectPath;

    // Propagate metadata — collected during the first pass (O(1) per session)
    if (session.hasEstimated) {
      aggregate.metadata = { isEstimated: true };
    }
    results.push(aggregate);
  }

  return results.sort((a, b) => b.lastActivityAt - a.lastActivityAt);
}
