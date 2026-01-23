import type {
  ProviderPlugin,
  ProviderFetchContext,
  ProviderUsageData,
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
  },

  capabilities: {
    usageLimits: false,
    apiRateLimits: false,
    tokenUsage: true,
    actualCosts: true,
  },

  auth: {
    envVars: ['OPENCODE_API_KEY'],
    externalPaths: [
      {
        path: '~/.local/share/opencode/auth.json',
        type: 'json-key',
        key: 'opencode.key',
      },
    ],
    types: ['api'],
  },

  isConfigured(credentials: Credentials): boolean {
    return !!credentials.apiKey;
  },

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
