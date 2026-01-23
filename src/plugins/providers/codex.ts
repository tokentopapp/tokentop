import type {
  ProviderPlugin,
  ProviderFetchContext,
  ProviderUsageData,
  Credentials,
} from '../types/provider.ts';

interface CodexUsageResponse {
  plan_type: string;
  rate_limit?: {
    allowed: boolean;
    limit_reached: boolean;
    primary_window?: {
      used_percent: number;
      limit_window_seconds: number;
      reset_after_seconds: number;
      reset_at: number;
    } | null;
    secondary_window?: {
      used_percent: number;
      limit_window_seconds: number;
      reset_after_seconds: number;
      reset_at: number;
    } | null;
  } | null;
  credits?: {
    has_credits: boolean;
    unlimited: boolean;
    balance?: string | null;
  } | null;
}

export const codexPlugin: ProviderPlugin = {
  id: 'codex',
  type: 'provider',
  name: 'Codex',
  version: '1.0.0',

  meta: {
    description: 'OpenAI Codex subscription usage tracking (OAuth)',
    homepage: 'https://openai.com/codex',
    color: '#10a37f',
  },

  permissions: {
    network: {
      enabled: true,
      allowedDomains: ['chatgpt.com'],
    },
    env: {
      read: false,
      vars: [],
    },
  },

  capabilities: {
    usageLimits: true,
    apiRateLimits: false,
    tokenUsage: false,
    actualCosts: false,
  },

  auth: {
    envVars: [],
    externalPaths: [
      { path: '~/.codex/auth.json', type: 'codex-cli' },
    ],
    types: ['oauth'],
  },

  isConfigured(credentials: Credentials): boolean {
    return !!(credentials.oauth?.accessToken && credentials.oauth?.accountId);
  },

  async fetchUsage(ctx: ProviderFetchContext): Promise<ProviderUsageData> {
    const { credentials, http, log } = ctx;

    if (!credentials.oauth?.accessToken) {
      return {
        fetchedAt: Date.now(),
        error: 'OAuth token required. Sign in via OpenCode with ChatGPT Pro account.',
      };
    }

    if (!credentials.oauth.accountId) {
      return {
        fetchedAt: Date.now(),
        error: 'ChatGPT account ID required. Re-authenticate in OpenCode.',
      };
    }

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${credentials.oauth.accessToken}`,
      'ChatGPT-Account-Id': credentials.oauth.accountId,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'tokentop',
    };

    try {
      const response = await http.fetch('https://chatgpt.com/backend-api/wham/usage', {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        const bodyText = await response.text().catch(() => '');
        log.warn('Failed to fetch ChatGPT usage', { status: response.status, body: bodyText });
        
        if (response.status === 401) {
          return {
            fetchedAt: Date.now(),
            error: 'OAuth token expired. Re-authenticate in OpenCode.',
          };
        }
        
        return {
          fetchedAt: Date.now(),
          error: `API error: ${response.status} ${response.statusText}`,
        };
      }

      const data = (await response.json()) as CodexUsageResponse;

      const planTypeMap: Record<string, string> = {
        'plus': 'ChatGPT Plus',
        'pro': 'ChatGPT Pro',
        'team': 'ChatGPT Team',
        'enterprise': 'ChatGPT Enterprise',
      };
      const planType = planTypeMap[data.plan_type] ?? data.plan_type ?? 'ChatGPT';

      const result: ProviderUsageData = {
        planType,
        allowed: data.rate_limit?.allowed ?? true,
        limitReached: data.rate_limit?.limit_reached ?? false,
        fetchedAt: Date.now(),
      };

      if (data.rate_limit) {
        result.limits = {};

        if (data.rate_limit.primary_window) {
          const pw = data.rate_limit.primary_window;
          result.limits.primary = {
            usedPercent: pw.used_percent,
            label: '5-hour window',
            ...(pw.reset_at ? { resetsAt: pw.reset_at * 1000 } : {}),
          };
        }

        if (data.rate_limit.secondary_window) {
          const sw = data.rate_limit.secondary_window;
          result.limits.secondary = {
            usedPercent: sw.used_percent,
            label: '7-day window',
            ...(sw.reset_at ? { resetsAt: sw.reset_at * 1000 } : {}),
          };
        }
      }

      if (data.credits) {
        result.credits = {
          hasCredits: data.credits.has_credits,
          unlimited: data.credits.unlimited,
          ...(data.credits.balance != null ? { balance: data.credits.balance } : {}),
        };
      }

      return result;
    } catch (err) {
      log.error('Failed to fetch ChatGPT usage', { error: err });
      return {
        fetchedAt: Date.now(),
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  },
};
