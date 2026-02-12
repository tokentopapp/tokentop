import type { BasePlugin, PluginHttpClient, PluginLogger } from './base.ts';

export interface ProviderCapabilities {
  usageLimits: boolean;
  apiRateLimits: boolean;
  tokenUsage: boolean;
  actualCosts: boolean;
}

// ---------------------------------------------------------------------------
// Credential types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Auth (plugin-owned discovery)
// ---------------------------------------------------------------------------

/** Result of a credential discovery attempt. */
export interface CredentialResult {
  ok: boolean;
  credentials?: Credentials;
  reason?: 'missing' | 'expired' | 'invalid' | 'error';
  message?: string;
}

/**
 * Shape of an entry in OpenCode's auth.json file.
 * Used by AuthSources.opencode.getProviderEntry().
 */
export interface OpenCodeAuthEntry {
  type: 'api' | 'oauth' | 'codex' | 'github' | 'wellknown';
  key?: string;
  access?: string;
  refresh?: string;
  expires?: number;
  token?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  accountId?: string;
  groupId?: string;
}

/**
 * Sandboxed auth source helpers injected into plugins.
 * All methods respect the plugin's declared permissions.
 */
export interface AuthSources {
  /** Read an environment variable (sandboxed to `permissions.env.vars`). */
  env: {
    get(name: string): string | undefined;
  };

  /** Read files from the filesystem (sandboxed to `permissions.filesystem.paths`). */
  files: {
    readText(path: string): Promise<string | null>;
    readJson<T = unknown>(path: string): Promise<T | null>;
    exists(path: string): Promise<boolean>;
  };

  /**
   * Read from OpenCode's auth storage.
   * Core handles locating the auth file; plugin provides the provider key.
   */
  opencode: {
    getProviderEntry(key: string): Promise<OpenCodeAuthEntry | null>;
  };

  /** Platform information for cross-platform credential path resolution. */
  platform: {
    os: 'darwin' | 'linux' | 'win32';
    homedir: string;
    arch: string;
  };
}

/** Per-plugin key-value storage (namespaced by plugin ID). */
export interface PluginStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  has(key: string): Promise<boolean>;
}

/** Full runtime context provided to plugin methods like `auth.discover()`. */
export interface PluginContext {
  /** Plugin's validated configuration values. */
  readonly config: Record<string, unknown>;
  /** Scoped logger. */
  readonly logger: PluginLogger;
  /** Sandboxed HTTP client. */
  readonly http: PluginHttpClient;
  /** Credential discovery helpers. */
  readonly authSources: AuthSources;
  /** Per-plugin persistent key-value storage. */
  readonly storage: PluginStorage;
  /** Abort signal — fired when the plugin is being stopped or the app is shutting down. */
  readonly signal: AbortSignal;
}

export interface ProviderAuth {
  /** Discover credentials using the provided context helpers. */
  discover(ctx: PluginContext): Promise<CredentialResult>;
  /** Check whether discovered credentials are sufficient to operate. */
  isConfigured(credentials: Credentials): boolean;
}

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

export interface ModelPricing {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
  source?: string;
}

/** Pricing configuration for a provider's models. */
export interface ProviderPricing {
  /**
   * Map a model ID to the identifier used by the pricing service.
   * Return `undefined` to use the model ID as-is.
   */
  mapModelId?(modelId: string): string | undefined;
  /**
   * The provider ID to use when querying models.dev.
   * Defaults to `plugin.id` if not specified.
   */
  modelsDevProviderId?: string;
  /** Static fallback prices keyed by model ID. */
  staticPrices?: Record<string, ModelPricing>;
}

// ---------------------------------------------------------------------------
// Usage data
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Fetch context
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Provider Plugin
// ---------------------------------------------------------------------------

export interface ProviderPlugin extends BasePlugin {
  readonly type: 'provider';
  readonly capabilities: ProviderCapabilities;
  readonly auth: ProviderAuth;
  readonly pricing?: Record<string, ModelPricing> | ProviderPricing;
  fetchUsage(ctx: ProviderFetchContext): Promise<ProviderUsageData>;
  refreshToken?(auth: OAuthCredentials): Promise<RefreshedCredentials>;
}
