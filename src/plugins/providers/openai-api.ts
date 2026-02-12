import type {
  ProviderPlugin,
  ProviderFetchContext,
  ProviderUsageData,
  ProviderAuth,
  PluginContext,
  CredentialResult,
  Credentials,
} from '../types/provider.ts';

interface UsageBucket {
  object: string;
  start_time: number;
  end_time: number;
  results: Array<{
    object: string;
    input_tokens: number;
    output_tokens: number;
    input_cached_tokens?: number;
    num_model_requests: number;
    model?: string | null;
  }>;
}

interface UsageResponse {
  object: string;
  data: UsageBucket[];
  has_more: boolean;
}

interface CostsBucket {
  object: string;
  start_time: number;
  end_time: number;
  results: Array<{
    object: string;
    amount: {
      value: number;
      currency: string;
    };
    line_item?: string | null;
    project_id?: string | null;
  }>;
}

interface CostsResponse {
  object: string;
  data: CostsBucket[];
  has_more: boolean;
}

export const openaiApiPlugin: ProviderPlugin = {
  id: 'openai-api',
  type: 'provider',
  name: 'OpenAI API',
  version: '1.0.0',

  meta: {
    description: 'OpenAI API usage tracking (tokens and costs)',
    homepage: 'https://platform.openai.com',
    color: '#10a37f',
  },

  permissions: {
    network: {
      enabled: true,
      allowedDomains: ['api.openai.com'],
    },
    env: {
      read: true,
      vars: ['OPENAI_API_KEY', 'OPENAI_ADMIN_KEY'],
    },
  },

  capabilities: {
    usageLimits: false,
    apiRateLimits: true,
    tokenUsage: true,
    actualCosts: true,
  },

  auth: {
    async discover(ctx: PluginContext): Promise<CredentialResult> {
      const entry = await ctx.authSources.opencode.getProviderEntry('openai');
      if (entry) {
        if (entry.type === 'api' && entry.key) {
          return { ok: true, credentials: { apiKey: entry.key, source: 'opencode' } };
        }
        if (entry.type === 'wellknown' && (entry.token || entry.key)) {
          return { ok: true, credentials: { apiKey: (entry.token || entry.key)!, source: 'opencode' } };
        }
      }

      // 2. Try env vars (OPENAI_API_KEY, then OPENAI_ADMIN_KEY)
      const apiKey = ctx.authSources.env.get('OPENAI_API_KEY');
      if (apiKey) {
        return { ok: true, credentials: { apiKey, source: 'env' } };
      }

      const adminKey = ctx.authSources.env.get('OPENAI_ADMIN_KEY');
      if (adminKey) {
        return { ok: true, credentials: { apiKey: adminKey, source: 'env' } };
      }

      return { ok: false, reason: 'missing', message: 'No OpenAI API key found. Set OPENAI_API_KEY or configure in OpenCode.' };
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
        error: 'API key required. Set OPENAI_API_KEY environment variable.',
      };
    }

    const adminKey = process.env.OPENAI_ADMIN_KEY || credentials.apiKey;
    const now = Math.floor(Date.now() / 1000);
    const oneDayAgo = now - 86400;

    log.info('Fetching OpenAI usage', { keyPrefix: credentials.apiKey.slice(0, 10) });

    try {
      const [usageResult, costsResult] = await Promise.allSettled([
        fetchCompletionsUsage(http, adminKey, oneDayAgo),
        fetchCosts(http, adminKey, oneDayAgo),
      ]);

      const result: ProviderUsageData = {
        planType: 'API',
        allowed: true,
        fetchedAt: Date.now(),
      };

      if (usageResult.status === 'fulfilled' && usageResult.value) {
        const usage = usageResult.value;
        const totalInput = usage.data.reduce((sum, bucket) => 
          sum + bucket.results.reduce((s, r) => s + (r.input_tokens || 0), 0), 0);
        const totalOutput = usage.data.reduce((sum, bucket) => 
          sum + bucket.results.reduce((s, r) => s + (r.output_tokens || 0), 0), 0);
        const totalCached = usage.data.reduce((sum, bucket) => 
          sum + bucket.results.reduce((s, r) => s + (r.input_cached_tokens || 0), 0), 0);

        result.tokens = {
          input: totalInput,
          output: totalOutput,
          cacheRead: totalCached,
        };

        log.debug('OpenAI tokens (24h)', { input: totalInput, output: totalOutput, cached: totalCached });
      } else if (usageResult.status === 'rejected') {
        log.warn('Failed to fetch OpenAI usage', { error: usageResult.reason?.message });
      }

      if (costsResult.status === 'fulfilled' && costsResult.value) {
        const costs = costsResult.value;
        const totalCost = costs.data.reduce((sum, bucket) => 
          sum + bucket.results.reduce((s, r) => s + (r.amount?.value || 0), 0), 0);
        
        const currency = costs.data[0]?.results[0]?.amount?.currency || 'USD';

        if (totalCost > 0) {
          result.cost = {
            actual: {
              total: totalCost,
              currency,
            },
            source: 'api',
          };
        }

        log.debug('OpenAI costs (24h)', { total: totalCost, currency });
      } else if (costsResult.status === 'rejected') {
        log.warn('Failed to fetch OpenAI costs', { error: costsResult.reason?.message });
      }

      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error('OpenAI fetch error', { error: msg });
      
      return {
        planType: 'API',
        allowed: true,
        fetchedAt: Date.now(),
        error: `Failed to fetch usage: ${msg}`,
      };
    }
  },
};

async function fetchCompletionsUsage(
  http: ProviderFetchContext['http'],
  apiKey: string,
  startTime: number
): Promise<UsageResponse | null> {
  const url = `https://api.openai.com/v1/organization/usage/completions?start_time=${startTime}&bucket_width=1d&limit=1`;
  
  const response = await http.fetch(url, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    if (response.status === 403) {
      return null;
    }
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json() as Promise<UsageResponse>;
}

async function fetchCosts(
  http: ProviderFetchContext['http'],
  apiKey: string,
  startTime: number
): Promise<CostsResponse | null> {
  const url = `https://api.openai.com/v1/organization/usage/costs?start_time=${startTime}&bucket_width=1d&limit=1`;
  
  const response = await http.fetch(url, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    if (response.status === 403) {
      return null;
    }
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json() as Promise<CostsResponse>;
}
