import type { ModelPricing } from '@/plugins/types/provider.ts';
import { getModelPricing, getProviderModels, normalizeProviderName, clearCache as clearModelsDevCache } from './models-dev.ts';
import { getFallbackPricing, getFallbackProviderPricing } from './fallback.ts';

export async function getPricing(
  providerId: string,
  modelId: string
): Promise<ModelPricing | null> {
  const normalizedProvider = normalizeProviderName(providerId);
  
  const modelsDevPricing = await getModelPricing(normalizedProvider, modelId);
  if (modelsDevPricing) return modelsDevPricing;

  const fallbackPricing = getFallbackPricing(normalizedProvider, modelId);
  if (fallbackPricing) return fallbackPricing;

  return null;
}

export async function getProviderPricing(
  providerId: string
): Promise<Record<string, ModelPricing>> {
  const normalizedProvider = normalizeProviderName(providerId);
  
  const modelsDevPricing = await getProviderModels(normalizedProvider);
  if (modelsDevPricing && Object.keys(modelsDevPricing).length > 0) {
    return modelsDevPricing;
  }

  const fallbackPricing = getFallbackProviderPricing(normalizedProvider);
  return fallbackPricing ?? {};
}

export function clearPricingCache(): void {
  clearModelsDevCache();
}

export { estimateCost, estimateSessionCost, formatCost, formatTokenCount } from './estimator.ts';
export type { TokenUsage } from './estimator.ts';
export { FALLBACK_PRICING } from './fallback.ts';
