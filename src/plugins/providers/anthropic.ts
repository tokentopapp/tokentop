import { execFileSync } from 'child_process';
import type {
  ProviderPlugin,
  ProviderFetchContext,
  ProviderUsageData,
  Credentials,
  CredentialResult,
  OAuthCredentials,
  PluginContext,
  ProviderAuth,
} from '../types/provider.ts';

const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000;

interface ClaudeCodeCredentialsFile {
  claudeAiOauth?: {
    accessToken?: string;
    refreshToken?: string;
    subscriptionType?: string;
    rateLimitTier?: string;
    expiresAt?: number;
    scopes?: string[];
  };
}

function buildOAuthCredentials(
  accessToken: string,
  refreshToken?: string,
  expiresAt?: number,
  accountId?: string,
  subscriptionType?: string
): OAuthCredentials {
  const oauth: OAuthCredentials = { accessToken };
  if (refreshToken !== undefined) oauth.refreshToken = refreshToken;
  if (expiresAt !== undefined) oauth.expiresAt = expiresAt;
  if (accountId !== undefined) oauth.accountId = accountId;
  if (subscriptionType !== undefined) {
    (oauth as OAuthCredentials & { subscriptionType?: string }).subscriptionType = subscriptionType;
  }
  return oauth;
}

async function discoverClaudeCode(ctx: PluginContext): Promise<CredentialResult> {
  const now = Date.now();

  // Try macOS Keychain first (only on darwin)
  if (ctx.authSources.platform.os === 'darwin') {
    try {
      const keychainData = execFileSync(
        '/usr/bin/security',
        ['find-generic-password', '-s', 'Claude Code-credentials', '-w'],
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 5000 }
      ).trim();

      if (keychainData) {
        const parsed = JSON.parse(keychainData) as ClaudeCodeCredentialsFile;
        const oauth = parsed.claudeAiOauth;
        if (oauth?.accessToken) {
          const isExpired = oauth.expiresAt && oauth.expiresAt <= now;
          if (!isExpired) {
            return {
              ok: true,
              credentials: {
                oauth: buildOAuthCredentials(
                  oauth.accessToken,
                  oauth.refreshToken,
                  oauth.expiresAt,
                  undefined,
                  oauth.subscriptionType
                ),
                source: 'external',
              },
            };
          }
        }
      }
    } catch {
      // Keychain access failed, fall through to file
    }
  }

  // Fall back to credentials file
  const credPath = `${ctx.authSources.platform.homedir}/.claude/.credentials.json`;
  const fileData = await ctx.authSources.files.readJson<ClaudeCodeCredentialsFile>(credPath);
  const fileOauth = fileData?.claudeAiOauth;
  if (!fileOauth?.accessToken) return { ok: false, reason: 'missing', message: 'No Claude Code credentials found' };

  if (fileOauth.expiresAt && fileOauth.expiresAt <= now) {
    return { ok: false, reason: 'expired', message: 'Claude Code token expired' };
  }

  return {
    ok: true,
    credentials: {
      oauth: buildOAuthCredentials(
        fileOauth.accessToken,
        fileOauth.refreshToken,
        fileOauth.expiresAt,
        undefined,
        fileOauth.subscriptionType
      ),
      source: 'external',
    },
  };
}

interface AnthropicUsageResponse {
  five_hour?: {
    utilization?: number;
    resets_at?: string;
  };
  seven_day?: {
    utilization?: number;
    resets_at?: string;
  };
}

export const anthropicPlugin: ProviderPlugin = {
  id: 'anthropic',
  type: 'provider',
  name: 'Anthropic',
  version: '1.0.0',

  meta: {
    description: 'Anthropic Claude subscription usage tracking',
    homepage: 'https://anthropic.com',
    color: '#d4a27f',
  },

  permissions: {
    network: {
      enabled: true,
      allowedDomains: ['api.anthropic.com'],
    },
    env: {
      read: true,
      vars: ['ANTHROPIC_API_KEY'],
    },
    filesystem: {
      read: true,
      paths: ['~/.claude', '~/.local/share/opencode'],
    },
  },

  capabilities: {
    usageLimits: true,
    apiRateLimits: false,
    tokenUsage: false,
    actualCosts: false,
  },

  auth: {
    async discover(ctx: PluginContext): Promise<CredentialResult> {
      const entry = await ctx.authSources.opencode.getProviderEntry('anthropic');
      if (entry?.type === 'oauth' && entry.access) {
        return {
          ok: true,
          credentials: {
            oauth: buildOAuthCredentials(entry.access, entry.refresh, entry.expires, entry.accountId),
            source: 'opencode',
          },
        };
      }

      const claudeCodeResult = await discoverClaudeCode(ctx);
      if (claudeCodeResult.ok) return claudeCodeResult;

      const apiKey = ctx.authSources.env.get('ANTHROPIC_API_KEY');
      if (apiKey) {
        return { ok: true, credentials: { apiKey, source: 'env' } };
      }

      return { ok: false, reason: 'missing', message: 'No Anthropic credentials found' };
    },

    isConfigured(credentials: Credentials): boolean {
      return !!(credentials.oauth?.accessToken || credentials.apiKey);
    },
  } satisfies ProviderAuth,

  async fetchUsage(ctx: ProviderFetchContext): Promise<ProviderUsageData> {
    const { credentials, http, log } = ctx;

    const hasOAuth = !!credentials.oauth?.accessToken;
    const hasApiKey = !!credentials.apiKey;

    if (!hasOAuth && !hasApiKey) {
      return {
        fetchedAt: Date.now(),
        error: 'OAuth token or API key required. Authenticate via OpenCode or Claude Code.',
      };
    }

    if (hasApiKey && !hasOAuth) {
      return {
        planType: 'API',
        allowed: true,
        fetchedAt: Date.now(),
      };
    }

    if (credentials.oauth?.expiresAt) {
      const isExpired = credentials.oauth.expiresAt <= Date.now() + TOKEN_EXPIRY_BUFFER_MS;
      if (isExpired) {
        return {
          fetchedAt: Date.now(),
          error: 'Token expired. Run any command in OpenCode to refresh.',
        };
      }
    }

    const accessToken = credentials.oauth!.accessToken;
    const subscriptionType = (credentials.oauth as { subscriptionType?: string } | undefined)?.subscriptionType;
    const planType = getPlanName(subscriptionType);

    try {
      const response = await http.fetch('https://api.anthropic.com/api/oauth/usage', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'anthropic-beta': 'oauth-2025-04-20',
          'User-Agent': 'tokentop/1.0',
        },
      });

      if (!response.ok) {
        log.warn('Failed to fetch Anthropic usage', { status: response.status });
        
        if (response.status === 401) {
          return {
            fetchedAt: Date.now(),
            error: 'Token expired or invalid. Re-authenticate in OpenCode or Claude Code.',
          };
        }
        if (response.status === 403) {
          return {
            fetchedAt: Date.now(),
            error: 'Token lacks required scope. Re-authenticate in OpenCode or Claude Code.',
          };
        }
        
        return {
          fetchedAt: Date.now(),
          error: `API error: ${response.status} ${response.statusText}`,
        };
      }

      const data = (await response.json()) as AnthropicUsageResponse;

      const result: ProviderUsageData = {
        planType: planType ?? 'Pro/Max',
        allowed: true,
        limitReached: false,
        fetchedAt: Date.now(),
      };

      const fiveHour = parseUtilization(data.five_hour?.utilization);
      const sevenDay = parseUtilization(data.seven_day?.utilization);

      if (fiveHour !== null || sevenDay !== null) {
        result.limits = {};

        if (fiveHour !== null) {
          result.limits.primary = {
            usedPercent: fiveHour,
            windowMinutes: 300,
            label: '5-hour window',
          };
          if (data.five_hour?.resets_at) {
            const resetTime = new Date(data.five_hour.resets_at).getTime();
            if (!isNaN(resetTime)) {
              result.limits.primary.resetsAt = resetTime;
            }
          }
        }

        if (sevenDay !== null) {
          result.limits.secondary = {
            usedPercent: sevenDay,
            windowMinutes: 10080,
            label: '7-day window',
          };
          if (data.seven_day?.resets_at) {
            const resetTime = new Date(data.seven_day.resets_at).getTime();
            if (!isNaN(resetTime)) {
              result.limits.secondary.resetsAt = resetTime;
            }
          }
        }

        if (fiveHour !== null && fiveHour >= 100) {
          result.limitReached = true;
        }
        if (sevenDay !== null && sevenDay >= 100) {
          result.limitReached = true;
        }
      }

      return result;
    } catch (err) {
      log.error('Failed to fetch Anthropic usage', { error: err });
      return {
        fetchedAt: Date.now(),
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  },
};

function getPlanName(subscriptionType?: string): string | null {
  if (!subscriptionType) return null;
  const lower = subscriptionType.toLowerCase();
  if (lower.includes('max')) return 'Max';
  if (lower.includes('pro')) return 'Pro';
  if (lower.includes('team')) return 'Team';
  if (lower.includes('api')) return null;
  return subscriptionType.charAt(0).toUpperCase() + subscriptionType.slice(1);
}

function parseUtilization(value?: number): number | null {
  if (value == null) return null;
  if (!Number.isFinite(value)) return null;
  return Math.round(Math.max(0, Math.min(100, value)));
}
