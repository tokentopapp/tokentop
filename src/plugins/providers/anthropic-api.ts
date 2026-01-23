import type {
  ProviderPlugin,
  ProviderFetchContext,
  ProviderUsageData,
  Credentials,
} from '../types/provider.ts';

export const anthropicApiPlugin: ProviderPlugin = {
  id: 'anthropic-api',
  type: 'provider',
  name: 'Anthropic API',
  version: '1.0.0',

  meta: {
    description: 'Anthropic API usage tracking (pay-per-token)',
    homepage: 'https://console.anthropic.com',
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
  },

  capabilities: {
    usageLimits: false,
    apiRateLimits: true,
    tokenUsage: true,
    actualCosts: false,
  },

  auth: {
    envVars: ['ANTHROPIC_API_KEY'],
    types: ['api'],
  },

  isConfigured(credentials: Credentials): boolean {
    return !!credentials.apiKey;
  },

  async fetchUsage(ctx: ProviderFetchContext): Promise<ProviderUsageData> {
    const { credentials, log } = ctx;

    if (!credentials.apiKey) {
      return {
        fetchedAt: Date.now(),
        error: 'API key required. Set ANTHROPIC_API_KEY environment variable.',
      };
    }

    log.info('Anthropic API configured', { keyPrefix: credentials.apiKey.slice(0, 10) });

    return {
      planType: 'API',
      allowed: true,
      fetchedAt: Date.now(),
    };
  },
};
