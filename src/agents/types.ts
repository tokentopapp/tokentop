export type AgentName = 'OpenCode' | 'Claude Code' | 'Gemini CLI' | 'Cursor' | 'Windsurf';

export type AgentId = 'opencode' | 'claude-code' | 'gemini-cli' | 'cursor' | 'windsurf';

export const AGENT_ID_TO_NAME: Record<AgentId, AgentName> = {
  'opencode': 'OpenCode',
  'claude-code': 'Claude Code',
  'gemini-cli': 'Gemini CLI',
  'cursor': 'Cursor',
  'windsurf': 'Windsurf',
};

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

export interface AgentSessionAggregate {
  sessionId: string;
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
}

export interface AgentInfo {
  agentId: AgentId;
  name: AgentName;
  installed: boolean;
  sessionParsingSupported: boolean;
  error?: string;
}
