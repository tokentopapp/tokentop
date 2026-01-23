import { z } from 'zod';
import type { BasePlugin, PluginHttpClient, PluginLogger } from './base.ts';

export const ProviderCapabilitiesSchema = z.object({
  usageLimits: z.boolean(),
  apiRateLimits: z.boolean(),
  tokenUsage: z.boolean(),
  actualCosts: z.boolean(),
});

export type ProviderCapabilities = z.infer<typeof ProviderCapabilitiesSchema>;

export interface ExternalAuthPath {
  path: string;
  type: string;
  key?: string;
}

export interface ProviderAuthConfig {
  envVars: string[];
  externalPaths?: ExternalAuthPath[];
  types: Array<'api' | 'oauth' | 'wellknown'>;
}

export interface Credentials {
  apiKey?: string;
  oauth?: OAuthCredentials;
  groupId?: string;
  source: 'env' | 'opencode' | 'external' | 'config';
}

export interface OAuthCredentials {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  accountId?: string;
  managedProjectId?: string;
}

export interface RefreshedCredentials {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface ModelPricing {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
  source?: string;
}

export interface UsageLimit {
  usedPercent: number | null;
  resetsAt?: number;
  label?: string;
  windowMinutes?: number;
}

export interface CostBreakdown {
  total: number;
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  currency: string;
}

export interface ProviderUsageData {
  planType?: string;
  allowed?: boolean;
  limitReached?: boolean;
  limits?: {
    primary?: UsageLimit;
    secondary?: UsageLimit;
    items?: UsageLimit[];
  };
  tokens?: {
    input: number;
    output: number;
    cacheRead?: number;
    cacheWrite?: number;
  };
  credits?: {
    hasCredits: boolean;
    unlimited: boolean;
    balance?: string;
  };
  cost?: {
    actual?: CostBreakdown;
    estimated?: CostBreakdown;
    source: 'api' | 'estimated';
  };
  fetchedAt: number;
  error?: string;
}

export interface ProviderFetchContext {
  credentials: Credentials;
  options?: {
    timePeriod?: 'session' | 'daily' | 'weekly' | 'monthly';
    sessionId?: string;
  };
  http: PluginHttpClient;
  log: PluginLogger;
  config: Record<string, unknown>;
}

export interface ProviderPlugin extends BasePlugin {
  readonly type: 'provider';
  readonly capabilities: ProviderCapabilities;
  readonly auth: ProviderAuthConfig;
  readonly pricing?: Record<string, ModelPricing>;

  isConfigured(credentials: Credentials): boolean;
  fetchUsage(ctx: ProviderFetchContext): Promise<ProviderUsageData>;
  refreshToken?(auth: OAuthCredentials): Promise<RefreshedCredentials>;
}
