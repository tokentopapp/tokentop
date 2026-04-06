export type AgentName = string;

export type AgentId = string;

export interface TokenCounts {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
}

/** Sum all token categories (input + cacheRead + cacheWrite + output). */
export function totalTokenCount(t: TokenCounts): number {
  return t.input + (t.cacheRead ?? 0) + (t.cacheWrite ?? 0) + t.output;
}

export interface StreamCostBreakdown {
  total: number;
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
  longContextTokens?: TokenCounts;
  longContextRequestCount?: number;
  hasLongContext?: boolean;
  costUsd?: number;
  costBreakdown?: StreamCostBreakdown;
  pricingSource?: "models.dev" | "fallback" | "unknown";
}

export interface StreamWindowedTokens {
  dayTokens: number;
  weekTokens: number;
  monthTokens: number;
  totalTokens: number;
  longContextDayTokens?: number;
  longContextWeekTokens?: number;
  longContextMonthTokens?: number;
  longContextTotalTokens?: number;
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
  status: "active" | "idle";
  totals: TokenCounts;
  totalCostUsd?: number;
  requestCount: number;
  streams: AgentSessionStream[];

  costInDay: number;
  costInWeek: number;
  costInMonth: number;

  /** @internal Keyed by `providerId::modelId`. Set by aggregator, consumed by costing. */
  _streamWindowedTokens?: Map<string, StreamWindowedTokens>;

  /** Plugin-provided metadata merged from underlying SessionUsageData rows. */
  metadata?: Record<string, unknown>;
}

export interface AgentInfo {
  agentId: AgentId;
  name: AgentName;
  installed: boolean;
  sessionParsingSupported: boolean;
  error?: string;
}
