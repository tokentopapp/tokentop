import { z } from 'zod';
import type { BasePlugin, PluginHttpClient, PluginLogger } from './base.ts';
import type { Credentials, OAuthCredentials } from './provider.ts';

export const AgentCapabilitiesSchema = z.object({
  sessionParsing: z.boolean(),
  authReading: z.boolean(),
  realTimeTracking: z.boolean(),
  multiProvider: z.boolean(),
});

export type AgentCapabilities = z.infer<typeof AgentCapabilitiesSchema>;

export interface AgentConfig {
  command?: string;
  configPath?: string;
  sessionPath?: string;
  authPath?: string;
}

export interface AgentCredentials {
  providers: Record<string, Credentials | undefined>;
  oauth?: Record<string, OAuthCredentials>;
}

export interface AgentProviderConfig {
  id: string;
  name: string;
  configured: boolean;
  enabled?: boolean;
}

export interface SessionParseOptions {
  sessionId?: string;
  timePeriod?: 'session' | 'daily' | 'weekly' | 'monthly';
  limit?: number;
  /** Epoch ms — only return sessions updated after this timestamp. */
  since?: number;
}

export interface SessionUsageData {
  sessionId: string;
  sessionName?: string;
  providerId: string;
  modelId: string;
  tokens: {
    input: number;
    output: number;
    cacheRead?: number;
    cacheWrite?: number;
  };
  timestamp: number;
  sessionUpdatedAt?: number;
  projectPath?: string;
  cost?: number;
}

export interface AgentFetchContext {
  http: PluginHttpClient;
  log: PluginLogger;
  config: Record<string, unknown>;
}

export interface ActivityUpdate {
  sessionId: string;
  messageId: string;
  tokens: {
    input: number;
    output: number;
    reasoning?: number;
    cacheRead?: number;
    cacheWrite?: number;
  };
  timestamp: number;
}

export type ActivityCallback = (update: ActivityUpdate) => void;

export interface AgentPlugin extends BasePlugin {
  readonly type: 'agent';
  readonly agent: AgentConfig;
  readonly capabilities: AgentCapabilities;

  isInstalled(): Promise<boolean>;
  readCredentials(ctx: AgentFetchContext): Promise<AgentCredentials>;
  parseSessions(options: SessionParseOptions, ctx: AgentFetchContext): Promise<SessionUsageData[]>;
  getProviders(ctx: AgentFetchContext): Promise<AgentProviderConfig[]>;

  startActivityWatch?(callback: ActivityCallback): void;
  stopActivityWatch?(): void;
}
