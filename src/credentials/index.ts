import type { Credentials } from '@/plugins/types/provider.ts';
import { discoverFromEnv } from './env.ts';
import { discoverFromOpenCode } from './opencode.ts';
import { discoverFromExternal } from './external.ts';

export interface CredentialDiscoveryResult {
  providerId: string;
  credentials: Credentials | null;
  sources: Array<{
    source: Credentials['source'];
    found: boolean;
    error?: string;
  }>;
}

/**
 * Credential discovery order (IMPORTANT - OpenCode first!):
 * 1. OpenCode auth (~/.local/share/opencode/auth.json) - preferred for OAuth tokens
 * 2. Environment variables - fallback for API keys
 * 3. External CLI auth files - last resort
 * 
 * OpenCode is checked first because it provides OAuth tokens needed for
 * usage tracking APIs (like Anthropic's /api/oauth/usage).
 */
export async function discoverCredentials(
  providerId: string,
  envVars: string[],
  externalPaths?: Array<{ path: string; type: string; key?: string }>
): Promise<CredentialDiscoveryResult> {
  const sources: CredentialDiscoveryResult['sources'] = [];

  const openCodeResult = await discoverFromOpenCode(providerId);
  sources.push({
    source: 'opencode',
    found: openCodeResult !== null,
  });
  if (openCodeResult) {
    return { providerId, credentials: openCodeResult, sources };
  }

  const envResult = discoverFromEnv(providerId, envVars);
  sources.push({
    source: 'env',
    found: envResult !== null,
  });
  if (envResult) {
    return { providerId, credentials: envResult, sources };
  }

  if (externalPaths) {
    for (const extPath of externalPaths) {
      try {
        const extResult = await discoverFromExternal(providerId, extPath);
        sources.push({
          source: 'external',
          found: extResult !== null,
        });
        if (extResult) {
          return { providerId, credentials: extResult, sources };
        }
      } catch (err) {
        sources.push({
          source: 'external',
          found: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return { providerId, credentials: null, sources };
}

export async function discoverAllCredentials(
  providers: Array<{
    id: string;
    envVars: string[];
    externalPaths?: Array<{ path: string; type: string; key?: string }>;
  }>
): Promise<Map<string, Credentials>> {
  const results = new Map<string, Credentials>();

  await Promise.all(
    providers.map(async (provider) => {
      const result = await discoverCredentials(
        provider.id,
        provider.envVars,
        provider.externalPaths
      );
      if (result.credentials) {
        results.set(provider.id, result.credentials);
      }
    })
  );

  return results;
}

export { discoverFromEnv } from './env.ts';
export { discoverFromOpenCode } from './opencode.ts';
export { discoverFromExternal } from './external.ts';
