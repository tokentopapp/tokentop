import type { Credentials } from '@/plugins/types/provider.ts';

const ENV_VAR_MAP: Record<string, string[]> = {
  anthropic: ['ANTHROPIC_API_KEY'],
  openai: ['OPENAI_API_KEY'],
  'opencode-zen': ['OPENCODE_API_KEY', 'ZEN_API_KEY'],
  'github-copilot': ['GITHUB_TOKEN', 'GH_TOKEN'],
  'google-gemini': ['GOOGLE_API_KEY', 'GEMINI_API_KEY'],
  openrouter: ['OPENROUTER_API_KEY'],
  antigravity: ['ANTIGRAVITY_API_KEY'],
  'aws-bedrock': ['AWS_ACCESS_KEY_ID'],
  'azure-openai': ['AZURE_OPENAI_API_KEY'],
  zai: ['ZAI_API_KEY'],
  kimi: ['KIMI_API_KEY'],
  minimax: ['MINIMAX_API_KEY'],
};

export function discoverFromEnv(
  providerId: string,
  customEnvVars?: string[]
): Credentials | null {
  const envVars = customEnvVars ?? ENV_VAR_MAP[providerId] ?? [];

  for (const varName of envVars) {
    const value = process.env[varName];
    if (value && value.trim().length > 0) {
      return {
        apiKey: value.trim(),
        source: 'env',
      };
    }
  }

  return null;
}

export function getEnvVarsForProvider(providerId: string): string[] {
  return ENV_VAR_MAP[providerId] ?? [];
}
