import type { ModelPricing } from '@/plugins/types/provider.ts';

//TODO: get more up to date fallback pricing
export const FALLBACK_PRICING: Record<string, Record<string, ModelPricing>> = {
  anthropic: {
    'claude-sonnet-4-20250514': { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75, source: 'fallback' },
    'claude-3-7-sonnet-20250219': { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75, source: 'fallback' },
    'claude-3-5-sonnet-20241022': { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75, source: 'fallback' },
    'claude-3-5-haiku-20241022': { input: 0.8, output: 4, cacheRead: 0.08, cacheWrite: 1, source: 'fallback' },
    'claude-3-opus-20240229': { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75, source: 'fallback' },
  },

  openai: {
    'gpt-4.1': { input: 2, output: 8, cacheRead: 0.5, source: 'fallback' },
    'gpt-4.1-mini': { input: 0.4, output: 1.6, cacheRead: 0.1, source: 'fallback' },
    'gpt-4o': { input: 2.5, output: 10, cacheRead: 1.25, source: 'fallback' },
    'gpt-4o-mini': { input: 0.15, output: 0.6, cacheRead: 0.075, source: 'fallback' },
    'o1': { input: 15, output: 60, source: 'fallback' },
    'o1-mini': { input: 1.1, output: 4.4, source: 'fallback' },
    'o3': { input: 10, output: 40, source: 'fallback' },
    'o3-mini': { input: 1.1, output: 4.4, source: 'fallback' },
    'o4-mini': { input: 1.1, output: 4.4, source: 'fallback' },
  },

  google: {
    'gemini-2.0-flash': { input: 0.1, output: 0.4, source: 'fallback' },
    'gemini-2.0-flash-lite': { input: 0.075, output: 0.3, source: 'fallback' },
    'gemini-2.5-pro': { input: 1.25, output: 10, source: 'fallback' },
    'gemini-2.5-flash': { input: 0.15, output: 0.6, source: 'fallback' },
  },

  openrouter: {
    'anthropic/claude-sonnet-4': { input: 3, output: 15, source: 'fallback' },
    'openai/gpt-4.1': { input: 2, output: 8, source: 'fallback' },
    'google/gemini-2.5-pro': { input: 1.25, output: 10, source: 'fallback' },
  },
};

export function getFallbackPricing(
  providerId: string,
  modelId: string
): ModelPricing | null {
  const providerPricing = FALLBACK_PRICING[providerId];
  if (!providerPricing) return null;

  const exactMatch = providerPricing[modelId];
  if (exactMatch) return exactMatch;

  for (const [key, pricing] of Object.entries(providerPricing)) {
    if (modelId.includes(key) || key.includes(modelId)) {
      return pricing;
    }
  }

  return null;
}

export function getFallbackProviderPricing(
  providerId: string
): Record<string, ModelPricing> | null {
  return FALLBACK_PRICING[providerId] ?? null;
}
