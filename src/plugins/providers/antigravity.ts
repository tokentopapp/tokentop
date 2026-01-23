import type {
  ProviderPlugin,
  ProviderFetchContext,
  ProviderUsageData,
  UsageLimit,
  Credentials,
  OAuthCredentials,
  RefreshedCredentials,
} from '../types/provider.ts';

const ANTIGRAVITY_ENDPOINTS = [
  'https://daily-cloudcode-pa.sandbox.googleapis.com',
  'https://autopush-cloudcode-pa.sandbox.googleapis.com',
  'https://cloudcode-pa.googleapis.com',
];

const ANTIGRAVITY_HEADERS = {
  'User-Agent': 'antigravity/1.11.5 windows/amd64',
  'X-Goog-Api-Client': 'google-cloud-sdk vscode_cloudshelleditor/0.1',
  'Client-Metadata': '{"ideType":"IDE_UNSPECIFIED","platform":"PLATFORM_UNSPECIFIED","pluginType":"GEMINI"}',
};

const ANTIGRAVITY_CLIENT_ID = '1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com';
const ANTIGRAVITY_CLIENT_SECRET = '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';
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000;

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  token_type: string;
}

interface AntigravityModelsResponse {
  models?: Record<string, {
    displayName?: string;
    quotaInfo?: {
      remainingFraction?: number | null;
      resetTime?: string | null;
    };
  }>;
}

export const antigravityPlugin: ProviderPlugin = {
  id: 'antigravity',
  type: 'provider',
  name: 'Antigravity',
  version: '1.0.0',

  meta: {
    description: 'Antigravity (Google Gemini Advanced) subscription usage tracking',
    homepage: 'https://one.google.com/explore-plan/gemini-advanced',
    color: '#4285f4',
  },

  permissions: {
    network: {
      enabled: true,
      allowedDomains: ['googleapis.com', 'sandbox.googleapis.com'],
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
    types: ['oauth'],
  },

  isConfigured(credentials: Credentials): boolean {
    return !!(credentials.oauth?.accessToken || credentials.oauth?.refreshToken);
  },

  async refreshToken(auth: OAuthCredentials): Promise<RefreshedCredentials> {
    if (!auth.refreshToken) {
      throw new Error('No refresh token available');
    }

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: auth.refreshToken,
        client_id: ANTIGRAVITY_CLIENT_ID,
        client_secret: ANTIGRAVITY_CLIENT_SECRET,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Token refresh failed: ${response.status} ${errorText.slice(0, 100)}`);
    }

    const data = (await response.json()) as TokenResponse;

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? auth.refreshToken,
      expiresAt: Date.now() + data.expires_in * 1000,
    };
  },

  async fetchUsage(ctx: ProviderFetchContext): Promise<ProviderUsageData> {
    const { credentials, http, log } = ctx;

    if (!credentials.oauth?.accessToken && !credentials.oauth?.refreshToken) {
      return {
        fetchedAt: Date.now(),
        error: 'OAuth token required. Sign in via OpenCode with Google account.',
      };
    }

    let accessToken = credentials.oauth.accessToken;
    const needsRefresh = !accessToken || 
      (credentials.oauth.expiresAt && credentials.oauth.expiresAt <= Date.now() + TOKEN_EXPIRY_BUFFER_MS);

    if (needsRefresh && credentials.oauth.refreshToken) {
      try {
        log.debug('Access token expired or missing, refreshing...');
        const refreshed = await this.refreshToken!(credentials.oauth);
        accessToken = refreshed.accessToken;
        log.debug('Token refreshed successfully');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.error('Token refresh failed', { error: msg });
        return {
          fetchedAt: Date.now(),
          error: `Token refresh failed: ${msg}`,
        };
      }
    }

    if (!accessToken) {
      return {
        fetchedAt: Date.now(),
        error: 'No valid access token and refresh failed.',
      };
    }

    let lastError: string | undefined;

    for (const endpoint of ANTIGRAVITY_ENDPOINTS) {
      try {
        const response = await http.fetch(`${endpoint}/v1internal:fetchAvailableModels`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            ...ANTIGRAVITY_HEADERS,
          },
          body: JSON.stringify({}),
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => '');
          lastError = `${response.status} ${response.statusText}: ${errorText.slice(0, 100)}`;
          
          if (response.status === 401) {
            return {
              fetchedAt: Date.now(),
              error: 'OAuth token expired or invalid. Re-authenticate in OpenCode.',
            };
          }
          
          continue;
        }

        const data = (await response.json()) as AntigravityModelsResponse;

        if (!data.models) {
          lastError = 'No models data in response';
          continue;
        }

        const result: ProviderUsageData = {
          planType: 'Gemini Advanced',
          allowed: true,
          fetchedAt: Date.now(),
        };

        const quotas = Object.entries(data.models)
          .map(([modelId, model]) => {
            const remainingFraction = model.quotaInfo?.remainingFraction;
            if (remainingFraction === undefined || remainingFraction === null) return null;

            const usedPercent = Math.round((1 - remainingFraction) * 100);
            const limit: UsageLimit = {
              usedPercent,
              label: model.displayName ?? modelId,
            };

            if (model.quotaInfo?.resetTime) {
              const resetTime = new Date(model.quotaInfo.resetTime).getTime();
              if (!isNaN(resetTime)) {
                limit.resetsAt = resetTime;
              }
            }

            return { usedPercent, limit };
          })
          .filter((entry): entry is { usedPercent: number; limit: UsageLimit } => entry !== null)
          .sort((a, b) => {
            const usageDiff = b.usedPercent - a.usedPercent;
            if (usageDiff !== 0) return usageDiff;
            const labelA = a.limit.label ?? '';
            const labelB = b.limit.label ?? '';
            return labelB.localeCompare(labelA, undefined, { numeric: true, sensitivity: 'base' });
          });

        if (quotas.length > 0) {
          const items = quotas.map((entry) => entry.limit);
          const primary = items[0];
          if (primary) {
            result.limits = {
              primary,
              ...(items[1] ? { secondary: items[1] } : {}),
              items,
            };
            result.limitReached = primary.usedPercent !== null && primary.usedPercent >= 100;
          }
        }

        return result;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        continue;
      }
    }

    log.error('Failed to fetch Antigravity usage from all endpoints', { error: lastError });
    return {
      fetchedAt: Date.now(),
      error: lastError ?? 'Failed to fetch usage from all endpoints',
    };
  },
};
