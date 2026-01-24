import type { SessionUsageData } from '@/plugins/types/agent.ts';
import type {
  AgentId,
  AgentName,
  AgentSessionAggregate,
  AgentSessionStream,
  TokenCounts,
} from './types.ts';

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

export function aggregateSessionUsage(options: AggregateOptions): AgentSessionAggregate[] {
  const { agentId, agentName, rows, now = Date.now(), activeThresholdMs = ACTIVE_THRESHOLD_MS } = options;

  const sessionMap = new Map<string, {
    projectPath?: string;
    timestamps: number[];
    sessionUpdatedAt?: number;
    streamMap: Map<string, { key: StreamKey; tokens: TokenCounts; requestCount: number }>;
  }>();

  for (const row of rows) {
    const existing = sessionMap.get(row.sessionId);
    if (!existing) {
      const newSession: {
        projectPath?: string;
        timestamps: number[];
        sessionUpdatedAt?: number;
        streamMap: Map<string, { key: StreamKey; tokens: TokenCounts; requestCount: number }>;
      } = {
        timestamps: [],
        streamMap: new Map(),
      };
      if (row.projectPath) newSession.projectPath = row.projectPath;
      if (row.sessionUpdatedAt) newSession.sessionUpdatedAt = row.sessionUpdatedAt;
      sessionMap.set(row.sessionId, newSession);
    }
    
    const session = sessionMap.get(row.sessionId)!;

    session.timestamps.push(row.timestamp);
    if (row.projectPath && !session.projectPath) {
      session.projectPath = row.projectPath;
    }
    if (row.sessionUpdatedAt && (!session.sessionUpdatedAt || row.sessionUpdatedAt > session.sessionUpdatedAt)) {
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
      };
      session.streamMap.set(streamKeyStr, stream);
    }

    stream.tokens = sumTokens(stream.tokens, row.tokens);
    stream.requestCount += 1;
  }

  const results: AgentSessionAggregate[] = [];

  for (const [sessionId, session] of sessionMap) {
    const startedAt = Math.min(...session.timestamps);
    const lastActivityAt = Math.max(...session.timestamps);
    const lastSeenAt = session.sessionUpdatedAt ?? lastActivityAt;
    const status = (now - lastSeenAt) <= activeThresholdMs ? 'active' : 'idle';

    const streams: AgentSessionStream[] = [];
    let totals: TokenCounts = { input: 0, output: 0 };
    let totalRequestCount = 0;

    for (const stream of session.streamMap.values()) {
      streams.push({
        providerId: stream.key.providerId,
        modelId: stream.key.modelId,
        tokens: stream.tokens,
        requestCount: stream.requestCount,
      });
      totals = sumTokens(totals, stream.tokens);
      totalRequestCount += stream.requestCount;
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
    };
    if (session.projectPath) aggregate.projectPath = session.projectPath;
    results.push(aggregate);
  }

  return results.sort((a, b) => b.lastActivityAt - a.lastActivityAt);
}
