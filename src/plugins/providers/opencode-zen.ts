import type {
  ProviderPlugin,
  ProviderFetchContext,
  ProviderUsageData,
  ProviderAuth,
  PluginContext,
  CredentialResult,
  Credentials,
} from '../types/provider.ts';

export const opencodeZenPlugin: ProviderPlugin = {
  id: 'opencode-zen',
  type: 'provider',
  name: 'OpenCode Zen',
  version: '1.0.0',

  meta: {
    description: 'OpenCode Zen - curated AI models for coding agents',
    homepage: 'https://opencode.ai/zen',
    color: '#6366f1',
  },

  permissions: {
    network: {
      enabled: true,
      allowedDomains: ['opencode.ai'],
    },
    filesystem: {
      read: true,
      paths: ['~/.local/share/opencode'],
    },
    env: {
      read: true,
      vars: ['OPENCODE_API_KEY'],
    },
  },

  capabilities: {
    usageLimits: false,
    apiRateLimits: false,
    tokenUsage: true,
    actualCosts: true,
  },

  auth: {
    async discover(ctx: PluginContext): Promise<CredentialResult> {
      // 1. Try OpenCode auth (getProviderEntry reads auth.json and config)
      const entry = await ctx.authSources.opencode.getProviderEntry('opencode');
      if (entry) {
        if (entry.type === 'api' && entry.key) {
          return { ok: true, credentials: { apiKey: entry.key, source: 'opencode' } };
        }
        if (entry.type === 'wellknown' && (entry.token || entry.key)) {
          return { ok: true, credentials: { apiKey: (entry.token || entry.key)!, source: 'opencode' } };
        }
      }

      // 2. Try env vars
      const apiKey = ctx.authSources.env.get('OPENCODE_API_KEY');
      if (apiKey) {
        return { ok: true, credentials: { apiKey, source: 'env' } };
      }

      return { ok: false, reason: 'missing', message: 'No OpenCode API key found. Run /connect in OpenCode to set up Zen.' };
    },

    isConfigured(credentials: Credentials): boolean {
      return !!credentials.apiKey;
    },
  } satisfies ProviderAuth,

  async fetchUsage(ctx: ProviderFetchContext): Promise<ProviderUsageData> {
    const { credentials, http, log } = ctx;

    if (!credentials.apiKey) {
      return {
        fetchedAt: Date.now(),
        error: 'API key required. Run /connect in OpenCode to set up Zen.',
      };
    }

    log.info('OpenCode Zen configured', { keyPrefix: credentials.apiKey.slice(0, 10) });

    try {
      const response = await http.fetch('https://opencode.ai/zen/v1/models', {
        headers: {
          'Authorization': `Bearer ${credentials.apiKey}`,
        },
      });
      
      if (response.ok) {
        log.info('OpenCode Zen API accessible');
        return {
          planType: 'Pay-as-you-go',
          allowed: true,
          fetchedAt: Date.now(),
          credits: {
            hasCredits: true,
            unlimited: false,
          },
        };
      }

      return {
        planType: 'Pay-as-you-go',
        allowed: true,
        fetchedAt: Date.now(),
      };
    } catch (err) {
      log.warn('Could not verify OpenCode Zen API access', { error: String(err) });
      
      return {
        planType: 'Pay-as-you-go',
        allowed: true,
        fetchedAt: Date.now(),
      };
    }
  },
};
