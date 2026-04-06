import type { ModelPricing } from "@tokentop/plugin-sdk";

const MODELS_DEV_API = "https://models.dev/api.json";
const CACHE_TTL_MS = 3600000;

interface ModelsDevCost {
  input: number;
  output: number;
  cache_read?: number;
  cache_write?: number;
  context_over_200k?: {
    input?: number;
    output?: number;
    cache_read?: number;
    cache_write?: number;
  };
}

interface ModelsDevModel {
  id: string;
  name: string;
  family: string;
  cost: ModelsDevCost;
}

interface ModelsDevProvider {
  id: string;
  name: string;
  models: Record<string, ModelsDevModel>;
}

type ModelsDevResponse = Record<string, ModelsDevProvider>;

interface CachedData {
  data: ModelsDevResponse;
  fetchedAt: number;
}

let cache: CachedData | null = null;

export async function fetchModelsDevData(): Promise<ModelsDevResponse | null> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.data;
  }

  try {
    const response = await fetch(MODELS_DEV_API);
    if (!response.ok) {
      return cache?.data ?? null;
    }

    const data = (await response.json()) as ModelsDevResponse;
    cache = { data, fetchedAt: Date.now() };
    return data;
  } catch {
    return cache?.data ?? null;
  }
}

let providerAliases: ReadonlyMap<string, string> = new Map();

export function setProviderAliases(aliases: ReadonlyMap<string, string>): void {
  providerAliases = aliases;
}

export function normalizeProviderName(providerId: string): string {
  return providerAliases.get(providerId) ?? providerId;
}

export async function getModelPricing(
  providerId: string,
  modelId: string,
): Promise<ModelPricing | null> {
  const data = await fetchModelsDevData();
  if (!data) return null;

  const normalizedProvider = normalizeProviderName(providerId);
  const provider = data[normalizedProvider];
  if (!provider?.models) return null;

  const model = provider.models[modelId];
  if (!model?.cost) return null;

  const pricing: ModelPricing = {
    input: model.cost.input,
    output: model.cost.output,
    source: "models.dev",
  };

  if (model.cost.cache_read !== undefined) {
    pricing.cacheRead = model.cost.cache_read;
  }
  if (model.cost.cache_write !== undefined) {
    pricing.cacheWrite = model.cost.cache_write;
  }

  return pricing;
}

export async function getProviderModels(
  providerId: string,
): Promise<Record<string, ModelPricing> | null> {
  const data = await fetchModelsDevData();
  if (!data) return null;

  const normalizedProvider = normalizeProviderName(providerId);
  const provider = data[normalizedProvider];
  if (!provider?.models) return null;

  const result: Record<string, ModelPricing> = {};

  for (const [modelId, model] of Object.entries(provider.models)) {
    if (!model.cost) continue;

    const pricing: ModelPricing = {
      input: model.cost.input,
      output: model.cost.output,
      source: "models.dev",
    };

    if (model.cost.cache_read !== undefined) {
      pricing.cacheRead = model.cost.cache_read;
    }
    if (model.cost.cache_write !== undefined) {
      pricing.cacheWrite = model.cost.cache_write;
    }

    result[modelId] = pricing;
  }

  return result;
}

export function clearCache(): void {
  cache = null;
}
