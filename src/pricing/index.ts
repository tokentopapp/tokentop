import type { ModelPricing, ProviderPlugin, ProviderPricing } from "@tokentop/plugin-sdk";
import { getFallbackPricing, getFallbackProviderPricing } from "./fallback.ts";
import {
  clearCache as clearModelsDevCache,
  getModelPricing,
  getProviderModels,
  normalizeProviderName,
  setProviderAliases,
} from "./models-dev.ts";

export function initPricingFromPlugins(
  plugins: readonly ProviderPlugin[],
  additionalAliases?: Record<string, string>,
): void {
  const aliases = new Map<string, string>();

  for (const plugin of plugins) {
    const pricing = plugin.pricing;
    if (
      pricing &&
      "modelsDevProviderId" in pricing &&
      typeof (pricing as ProviderPricing).modelsDevProviderId === "string"
    ) {
      aliases.set(plugin.id, (pricing as ProviderPricing).modelsDevProviderId!);
    }
  }

  if (additionalAliases) {
    for (const [key, value] of Object.entries(additionalAliases)) {
      aliases.set(key, value);
    }
  }

  setProviderAliases(aliases);
}

export async function getPricing(
  providerId: string,
  modelId: string,
): Promise<ModelPricing | null> {
  const normalizedProvider = normalizeProviderName(providerId);

  const modelsDevPricing = await getModelPricing(normalizedProvider, modelId);
  if (modelsDevPricing) return modelsDevPricing;

  const fallbackPricing = getFallbackPricing(normalizedProvider, modelId);
  if (fallbackPricing) return fallbackPricing;

  return null;
}

export async function getProviderPricing(
  providerId: string,
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

export type { TokenUsage } from "./estimator.ts";
/**
 * @deprecated This function sums tokens before pricing, which is incompatible with
 * tiered context-based pricing. Use per-request costing via priceStream() instead.
 * Kept for backward compatibility — not called at runtime.
 */
export { estimateCost, estimateSessionCost, formatCost, formatTokenCount } from "./estimator.ts";
export { FALLBACK_PRICING } from "./fallback.ts";
