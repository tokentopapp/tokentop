export type AgentName = string;

export type AgentId = string;

export interface TokenCounts {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
}

export interface AgentSessionStream {
  providerId: string;
  modelId: string;
  tokens: TokenCounts;
  requestCount: number;
  costUsd?: number;
  pricingSource?: 'models.dev' | 'fallback' | 'unknown';
}

export interface StreamWindowedTokens {
  dayTokens: number;
  weekTokens: number;
  monthTokens: number;
  totalTokens: number;
}

export interface AgentSessionAggregate {
  sessionId: string;
  sessionName?: string;
  agentId: AgentId;
  agentName: AgentName;
  projectPath?: string;
  startedAt: number;
  lastActivityAt: number;
  endedAt?: number;
  status: 'active' | 'idle';
  totals: TokenCounts;
  totalCostUsd?: number;
  requestCount: number;
  streams: AgentSessionStream[];

  costInDay: number;
  costInWeek: number;
  costInMonth: number;

  /** @internal Keyed by `providerId::modelId`. Set by aggregator, consumed by costing. */
  _streamWindowedTokens?: Map<string, StreamWindowedTokens>;
}

export interface AgentInfo {
  agentId: AgentId;
  name: AgentName;
  installed: boolean;
  sessionParsingSupported: boolean;
  error?: string;
}
