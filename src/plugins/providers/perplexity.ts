import type {
  ProviderPlugin,
  ProviderFetchContext,
  ProviderUsageData,
  Credentials,
} from '../types/provider.ts';

/**
 * Perplexity Shadow API Discovery (January 2026):
 * 
 * Internal endpoints that power the billing dashboard (require session cookies, not API key):
 * - GET /rest/pplx-api/v2/groups → { orgs: [{ api_org_id, display_name, usage_tier }] }
 * - GET /rest/pplx-api/v2/groups/{orgId} → { customerInfo: { balance, auto_top_up_amount, ... } }
 * - GET /rest/pplx-api/v2/groups/{orgId}/usage-analytics?time_bucket=day&time_range=past_month
 *     → Array of meter data (api_requests, input_tokens, output_tokens, etc.) with costs
 * - GET /rest/pplx-api/v2/groups/{orgId}/invoices → Invoice history
 * 
 * Unfortunately, these endpoints use web session auth, not API key auth.
 * GitHub issue #266 requests a public usage API endpoint.
 */

export const perplexityPlugin: ProviderPlugin = {
  id: 'perplexity',
  type: 'provider',
  name: 'Perplexity',
  version: '1.0.0',

  meta: {
    description: 'Perplexity AI API usage (credit-based)',
    homepage: 'https://www.perplexity.ai',
    color: '#20b2aa',
  },

  permissions: {
    network: {
      enabled: true,
      allowedDomains: ['api.perplexity.ai'],
    },
    env: {
      read: true,
      vars: ['PERPLEXITY_API_KEY'],
    },
  },

  capabilities: {
    usageLimits: false,
    apiRateLimits: true,
    tokenUsage: true,
    actualCosts: false,
  },

  auth: {
    envVars: ['PERPLEXITY_API_KEY'],
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
        error: 'API key required. Set PERPLEXITY_API_KEY environment variable.',
      };
    }

    log.info('Checking Perplexity API', { keyPrefix: credentials.apiKey.slice(0, 8) });

    try {
      const response = await http.fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${credentials.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'sonar',
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
        }),
      });

      if (response.status === 401) {
        return {
          fetchedAt: Date.now(),
          error: 'Invalid API key',
        };
      }

      if (response.status === 402) {
        return {
          planType: 'API',
          allowed: false,
          fetchedAt: Date.now(),
          credits: {
            hasCredits: false,
            unlimited: false,
            balance: '$0.00',
          },
          error: 'Insufficient credits',
        };
      }

      if (response.status === 429) {
        return {
          planType: 'API',
          allowed: true,
          fetchedAt: Date.now(),
          error: 'Rate limited',
        };
      }

      if (response.ok) {
        const data = await response.json().catch(() => null) as { usage?: { prompt_tokens?: number; completion_tokens?: number } } | null;
        const usage = data?.usage;
        
        return {
          planType: 'API',
          allowed: true,
          fetchedAt: Date.now(),
          credits: {
            hasCredits: true,
            unlimited: false,
          },
          ...(usage && {
            tokens: {
              input: usage.prompt_tokens ?? 0,
              output: usage.completion_tokens ?? 0,
            },
          }),
        };
      }

      const errorText = await response.text().catch(() => '');
      return {
        planType: 'API',
        allowed: true,
        fetchedAt: Date.now(),
        error: `API error: ${response.status} ${errorText.slice(0, 100)}`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error('Perplexity fetch error', { error: msg });
      
      return {
        fetchedAt: Date.now(),
        error: `Connection error: ${msg}`,
      };
    }
  },
};
