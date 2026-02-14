import type { ProviderState } from '../contexts/PluginContext.tsx';

export function getProviderColor(
  providerId: string,
  providers: Map<string, ProviderState>,
  fallback: string,
): string {
  return providers.get(providerId)?.plugin.meta?.color ?? fallback;
}
