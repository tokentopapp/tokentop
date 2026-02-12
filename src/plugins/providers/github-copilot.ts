import type {
  ProviderPlugin,
  ProviderFetchContext,
  ProviderUsageData,
  UsageLimit,
  ProviderAuth,
  PluginContext,
  CredentialResult,
  Credentials,
} from '../types/provider.ts';

interface CopilotUserResponse {
  access_type_sku?: string;
  copilot_plan?: string;
  chat_enabled?: boolean;
  quota_reset_date?: string;
  quota_reset_date_utc?: string;
  quota_snapshots?: Record<string, CopilotQuotaSnapshot | undefined>;
}

interface CopilotQuotaSnapshot {
  entitlement: number;
  remaining: number;
  percent_remaining?: number;
  unlimited: boolean;
  quota_id?: string;
  timestamp_utc?: string;
}

export const githubCopilotPlugin: ProviderPlugin = {
  id: 'github-copilot',
  type: 'provider',
  name: 'GitHub Copilot',
  version: '1.0.0',

  meta: {
    description: 'GitHub Copilot usage tracking including premium requests',
    homepage: 'https://github.com/features/copilot',
    color: '#6e40c9',
  },

  permissions: {
    network: {
      enabled: true,
      allowedDomains: ['api.github.com'],
    },
    env: {
      read: true,
      vars: ['GITHUB_TOKEN', 'GH_TOKEN'],
    },
    filesystem: {
      read: true,
      paths: ['~/.config/github-copilot'],
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
      const entry = await ctx.authSources.opencode.getProviderEntry('github-copilot');
      if (entry) {
        const token = entry.token || entry.key || entry.access;
        if (token) {
          return { ok: true, credentials: { apiKey: token, source: 'opencode' } };
        }
      }

      // 2. Try env vars
      const githubToken = ctx.authSources.env.get('GITHUB_TOKEN');
      if (githubToken) {
        return { ok: true, credentials: { apiKey: githubToken, source: 'env' } };
      }

      const ghToken = ctx.authSources.env.get('GH_TOKEN');
      if (ghToken) {
        return { ok: true, credentials: { apiKey: ghToken, source: 'env' } };
      }

      // 3. Try external file: ~/.config/github-copilot/hosts.json
      const hostsData = await ctx.authSources.files.readJson<{
        'github.com'?: { oauth_token?: string; user?: string };
      }>('~/.config/github-copilot/hosts.json');
      if (hostsData) {
        const githubEntry = hostsData['github.com'];
        if (githubEntry?.oauth_token) {
          return { ok: true, credentials: { apiKey: githubEntry.oauth_token, source: 'external' } };
        }
      }

      return { ok: false, reason: 'missing', message: 'No GitHub token found. Set GITHUB_TOKEN or install GitHub Copilot CLI.' };
    },

    isConfigured(credentials: Credentials): boolean {
      return !!(credentials.apiKey || credentials.oauth?.accessToken);
    },
  } satisfies ProviderAuth,

  async fetchUsage(ctx: ProviderFetchContext): Promise<ProviderUsageData> {
    const { credentials, http, log } = ctx;
    const token = credentials.apiKey ?? credentials.oauth?.accessToken;

    if (!token) {
      return {
        fetchedAt: Date.now(),
        error: 'Not configured: missing GitHub token',
      };
    }

    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github+json',
      'Authorization': `token ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    };

    try {
      const response = await http.fetch('https://api.github.com/copilot_internal/user', {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        if (response.status === 404) {
          return {
            planType: 'None',
            fetchedAt: Date.now(),
            error: 'Copilot not enabled for this account',
          };
        }
        log.warn('Failed to fetch Copilot usage', { status: response.status });
        return {
          fetchedAt: Date.now(),
          error: `API error: ${response.status} ${response.statusText}`,
        };
      }

      const data = (await response.json()) as CopilotUserResponse;

      const planType = data.copilot_plan ?? data.access_type_sku ?? 'Copilot';
      const result: ProviderUsageData = {
        planType,
        fetchedAt: Date.now(),
      };

      const premiumSnapshot = data.quota_snapshots?.premium_interactions;
      if (premiumSnapshot) {
        const used = premiumSnapshot.entitlement - premiumSnapshot.remaining;
        const usedPercent = premiumSnapshot.unlimited
          ? 0
          : premiumSnapshot.percent_remaining !== undefined
          ? Math.max(0, 100 - premiumSnapshot.percent_remaining)
          : premiumSnapshot.entitlement > 0
          ? (used / premiumSnapshot.entitlement) * 100
          : 0;

        const label = premiumSnapshot.unlimited
          ? 'Premium requests (unlimited)'
          : `Premium requests (${Math.max(0, used)}/${premiumSnapshot.entitlement})`;

        const primary: UsageLimit = {
          usedPercent,
          label,
        };

        const resetAt = data.quota_reset_date_utc ?? data.quota_reset_date;
        if (resetAt) {
          primary.resetsAt = new Date(resetAt).getTime();
        }

        result.limits = { primary };

        result.limitReached = !premiumSnapshot.unlimited && premiumSnapshot.remaining <= 0;
      }

      return result;
    } catch (err) {
      log.error('Failed to fetch Copilot usage', { error: err });
      return {
        fetchedAt: Date.now(),
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  },
};
