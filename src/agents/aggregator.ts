import type { SessionUsageData } from "@tokentop/plugin-sdk";
import { LONG_CONTEXT_THRESHOLD } from "../pricing/estimator.ts";
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
  longContextTokens?: TokenCounts;
  longContextRequestCount?: number;
  windowed: StreamWindowedTokens;
}

function zeroTokens(): TokenCounts {
  return { input: 0, output: 0 };
}

function normalizeTokens(tokens: TokenCounts): TokenCounts {
  const normalized: TokenCounts = {
    input: tokens.input,
    output: tokens.output,
  };

  const cacheRead = tokens.cacheRead ?? 0;
  const cacheWrite = tokens.cacheWrite ?? 0;

  if (cacheRead > 0) normalized.cacheRead = cacheRead;
  if (cacheWrite > 0) normalized.cacheWrite = cacheWrite;

  return normalized;
}

function getContextSize(tokens: TokenCounts): number {
  // contextSize = input + cacheRead + cacheWrite — the full prompt context sent to the model
  return tokens.input + (tokens.cacheRead ?? 0) + (tokens.cacheWrite ?? 0);
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
        tokens: zeroTokens(),
        requestCount: 0,
        windowed: { dayTokens: 0, weekTokens: 0, monthTokens: 0, totalTokens: 0 },
      };
      session.streamMap.set(streamKeyStr, stream);
    }

    const contextSize = getContextSize(row.tokens);
    const bucketTokens = normalizeTokens(row.tokens);

    if (contextSize > LONG_CONTEXT_THRESHOLD) {
      stream.longContextTokens = sumTokens(stream.longContextTokens ?? zeroTokens(), bucketTokens);
      stream.longContextRequestCount = (stream.longContextRequestCount ?? 0) + 1;
    } else {
      stream.tokens = sumTokens(stream.tokens, bucketTokens);
    }

    stream.requestCount += 1;

    const msgTokens = totalTokenCount(row.tokens);
    stream.windowed.totalTokens += msgTokens;
    if (contextSize > LONG_CONTEXT_THRESHOLD) {
      stream.windowed.longContextTotalTokens =
        (stream.windowed.longContextTotalTokens ?? 0) + msgTokens;
    }
    if (row.timestamp >= startOfDay) {
      stream.windowed.dayTokens += msgTokens;
      if (contextSize > LONG_CONTEXT_THRESHOLD) {
        stream.windowed.longContextDayTokens =
          (stream.windowed.longContextDayTokens ?? 0) + msgTokens;
      }
    }
    if (row.timestamp >= startOfWeek) {
      stream.windowed.weekTokens += msgTokens;
      if (contextSize > LONG_CONTEXT_THRESHOLD) {
        stream.windowed.longContextWeekTokens =
          (stream.windowed.longContextWeekTokens ?? 0) + msgTokens;
      }
    }
    if (row.timestamp >= startOfMonth) {
      stream.windowed.monthTokens += msgTokens;
      if (contextSize > LONG_CONTEXT_THRESHOLD) {
        stream.windowed.longContextMonthTokens =
          (stream.windowed.longContextMonthTokens ?? 0) + msgTokens;
      }
    }
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
      const totalStreamTokens = sumTokens(stream.tokens, stream.longContextTokens ?? zeroTokens());
      const streamAggregate: AgentSessionStream = {
        providerId: stream.key.providerId,
        modelId: stream.key.modelId,
        tokens: stream.tokens,
        requestCount: stream.requestCount,
      };

      if (stream.longContextTokens) {
        streamAggregate.longContextTokens = stream.longContextTokens;
      }
      if (stream.longContextRequestCount) {
        streamAggregate.longContextRequestCount = stream.longContextRequestCount;
        streamAggregate.hasLongContext = true;
      }

      streams.push(streamAggregate);
      totals = sumTokens(totals, totalStreamTokens);
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

/**
 * Deduplicate aggregates that share the same sessionId.
 *
 * This happens when multiple agent plugins scan the same directory
 * (e.g. both agent-antigravity and agent-gemini-cli read ~/.gemini/tmp/).
 * For each duplicate sessionId, the richer aggregate is kept:
 *  1. More streams (more provider/model pairs)
 *  2. If tied, more requests
 *  3. If still tied, the first one encountered
 */
export function deduplicateAggregates(
  aggregates: AgentSessionAggregate[],
): AgentSessionAggregate[] {
  const deduped = new Map<string, AgentSessionAggregate>();
  for (const agg of aggregates) {
    const existing = deduped.get(agg.sessionId);
    if (!existing) {
      deduped.set(agg.sessionId, agg);
      continue;
    }
    if (
      agg.streams.length > existing.streams.length ||
      (agg.streams.length === existing.streams.length && agg.requestCount > existing.requestCount)
    ) {
      deduped.set(agg.sessionId, agg);
    }
  }
  return Array.from(deduped.values());
}

export interface CrossAgentShadowMetadata {
  kind: "cross-agent-shadow";
  shadowOfAgentId: string;
  shadowOfSessionId: string;
  reason: "proxy-sdk-session-id" | "heuristic";
}

export function isCrossAgentShadow(session: AgentSessionAggregate): boolean {
  const dedup = session.metadata?.dedup as { kind?: string } | undefined;
  return dedup?.kind === "cross-agent-shadow";
}

export function selectEffectiveSessions(
  sessions: AgentSessionAggregate[],
): AgentSessionAggregate[] {
  return sessions.filter((s) => !isCrossAgentShadow(s));
}

const CROSS_AGENT_TIMESTAMP_TOLERANCE_MS = 120_000;

function normalizeProjectPath(p: string | undefined): string {
  if (!p) return "";
  return p.replace(/\/+$/, "");
}

export function markCrossAgentShadows(
  aggregates: AgentSessionAggregate[],
): AgentSessionAggregate[] {
  const opencodeSessions: AgentSessionAggregate[] = [];
  const claudeCodeById = new Map<string, AgentSessionAggregate>();
  const claudeCodeByPath = new Map<string, AgentSessionAggregate[]>();
  const ccStreamKeys = new Map<string, string[]>();

  for (const agg of aggregates) {
    if (agg.agentId === "opencode") {
      opencodeSessions.push(agg);
    } else if (agg.agentId === "claude-code") {
      claudeCodeById.set(agg.sessionId, agg);
      const path = normalizeProjectPath(agg.projectPath);
      if (path) {
        const bucket = claudeCodeByPath.get(path);
        if (bucket) bucket.push(agg);
        else claudeCodeByPath.set(path, [agg]);
      }
      const keys: string[] = new Array(agg.streams.length);
      for (let i = 0; i < agg.streams.length; i++) {
        const s = agg.streams[i]!;
        keys[i] = `${s.providerId}::${s.modelId}`;
      }
      ccStreamKeys.set(agg.sessionId, keys);
    }
  }

  if (opencodeSessions.length === 0 || claudeCodeById.size === 0) {
    return aggregates;
  }

  const claimed = new Set<string>();

  for (const oc of opencodeSessions) {
    const proxy = oc.metadata?.proxy as { sdkSessionId?: string } | undefined;
    if (!proxy?.sdkSessionId) continue;
    const cc = claudeCodeById.get(proxy.sdkSessionId);
    if (!cc || claimed.has(cc.sessionId)) continue;
    cc.metadata = {
      ...cc.metadata,
      dedup: {
        kind: "cross-agent-shadow",
        shadowOfAgentId: "opencode",
        shadowOfSessionId: oc.sessionId,
        reason: "proxy-sdk-session-id",
      } satisfies CrossAgentShadowMetadata,
    };
    claimed.add(cc.sessionId);
  }

  for (const oc of opencodeSessions) {
    if (oc.streams.length === 0) continue;
    const ocPath = normalizeProjectPath(oc.projectPath);
    if (!ocPath) continue;
    const bucket = claudeCodeByPath.get(ocPath);
    if (!bucket) continue;

    const ocKeys = new Set<string>();
    for (const s of oc.streams) ocKeys.add(`${s.providerId}::${s.modelId}`);

    for (const cc of bucket) {
      if (claimed.has(cc.sessionId)) continue;
      if (Math.abs(oc.lastActivityAt - cc.lastActivityAt) > CROSS_AGENT_TIMESTAMP_TOLERANCE_MS) {
        continue;
      }
      const ccKeys = ccStreamKeys.get(cc.sessionId);
      if (!ccKeys || ccKeys.length === 0) continue;
      let overlap = false;
      for (const k of ccKeys) {
        if (ocKeys.has(k)) {
          overlap = true;
          break;
        }
      }
      if (!overlap) continue;

      cc.metadata = {
        ...cc.metadata,
        dedup: {
          kind: "cross-agent-shadow",
          shadowOfAgentId: "opencode",
          shadowOfSessionId: oc.sessionId,
          reason: "heuristic",
        } satisfies CrossAgentShadowMetadata,
      };
      claimed.add(cc.sessionId);
      break;
    }
  }

  return aggregates;
}
