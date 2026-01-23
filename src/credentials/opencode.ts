import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { Credentials, OAuthCredentials } from '@/plugins/types/provider.ts';

const OPENCODE_AUTH_PATH = path.join(os.homedir(), '.local/share/opencode/auth.json');
const OPENCODE_CONFIG_PATH = path.join(os.homedir(), '.config/opencode/opencode.json');
const ANTIGRAVITY_ACCOUNTS_PATH = path.join(os.homedir(), '.config/opencode/antigravity-accounts.json');

interface OpenCodeAuthEntry {
  type: 'api' | 'oauth' | 'codex' | 'github' | 'wellknown';
  key?: string;
  access?: string;
  refresh?: string;
  expires?: number;
  token?: string;
  accessToken?: string;
  refreshToken?: string;
  idToken?: string;
  accountId?: string;
  expiresAt?: number;
  enterpriseUrl?: string;
}

interface OpenCodeConfig {
  provider?: Record<string, {
    name?: string;
    key?: string;
    options?: {
      apiKey?: string;
      [key: string]: unknown;
    };
  }>;
}

interface AntigravityAccount {
  email?: string;
  refreshToken?: string;
  accessToken?: string;
  expiresAt?: number;
  addedAt?: number;
  lastUsed?: number;
  rateLimitResetTimes?: Record<string, unknown>;
  managedProjectId?: string;
}

interface AntigravityAccountsFile {
  version?: number;
  accounts?: AntigravityAccount[];
  activeIndex?: number;
  activeIndexByFamily?: Record<string, number>;
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

function resolveEnvValue(value: string | undefined): string | undefined {
  if (!value) return undefined;
  
  const envMatch = value.match(/^\{env:(\w+)\}$/);
  if (envMatch && envMatch[1]) {
    return process.env[envMatch[1]];
  }
  return value;
}

function buildOAuthCredentials(
  accessToken: string,
  refreshToken?: string,
  expiresAt?: number,
  accountId?: string
): OAuthCredentials {
  const oauth: OAuthCredentials = { accessToken };
  if (refreshToken !== undefined) oauth.refreshToken = refreshToken;
  if (expiresAt !== undefined) oauth.expiresAt = expiresAt;
  if (accountId !== undefined) oauth.accountId = accountId;
  return oauth;
}

const PROVIDER_TO_OPENCODE_KEY: Record<string, string> = {
  'claude-max': 'anthropic',
  'codex': 'openai',
  'antigravity': 'google',
};

const OPENCODE_EXCLUDED_PROVIDERS = new Set([
  'gemini',
]);

export async function discoverFromOpenCode(providerId: string): Promise<Credentials | null> {
  if (OPENCODE_EXCLUDED_PROVIDERS.has(providerId)) {
    return null;
  }

  const opencodeKey = PROVIDER_TO_OPENCODE_KEY[providerId] ?? providerId;
  
  if (providerId === 'google-gemini' || providerId === 'antigravity') {
    const antigravityResult = await readFromAntigravityAccounts();
    if (antigravityResult) return antigravityResult;
  }

  const authResult = await readFromAuthFile(opencodeKey);
  if (authResult) return authResult;

  const configResult = await readFromConfigFile(opencodeKey);
  if (configResult) return configResult;

  return null;
}

async function readFromAuthFile(providerId: string): Promise<Credentials | null> {
  const authData = await readJsonFile<Record<string, OpenCodeAuthEntry>>(OPENCODE_AUTH_PATH);
  if (!authData) return null;

  const entry = authData[providerId];
  if (!entry) return null;

  if (entry.type === 'api' && entry.key) {
    return {
      apiKey: entry.key,
      source: 'opencode',
    };
  }

  if (entry.type === 'oauth' && entry.access) {
    return {
      oauth: buildOAuthCredentials(entry.access, entry.refresh, entry.expires, entry.accountId),
      source: 'opencode',
    };
  }

  if (entry.type === 'codex' && entry.accessToken) {
    return {
      oauth: buildOAuthCredentials(
        entry.accessToken,
        entry.refreshToken,
        entry.expiresAt,
        entry.accountId
      ),
      source: 'opencode',
    };
  }

  if (entry.type === 'github' && entry.token) {
    return {
      apiKey: entry.token,
      source: 'opencode',
    };
  }

  if (entry.type === 'wellknown') {
    const apiKey = entry.token ?? entry.key;
    if (apiKey) {
      return {
        apiKey,
        source: 'opencode',
      };
    }
  }

  return null;
}

async function readFromConfigFile(providerId: string): Promise<Credentials | null> {
  const config = await readJsonFile<OpenCodeConfig>(OPENCODE_CONFIG_PATH);
  if (!config?.provider) return null;

  const providerConfig = config.provider[providerId];
  if (!providerConfig) return null;

  const apiKey = resolveEnvValue(providerConfig.key) ?? 
                 resolveEnvValue(providerConfig.options?.apiKey as string);

  if (apiKey) {
    return {
      apiKey,
      source: 'opencode',
    };
  }

  return null;
}

async function readFromAntigravityAccounts(): Promise<Credentials | null> {
  const data = await readJsonFile<AntigravityAccountsFile>(ANTIGRAVITY_ACCOUNTS_PATH);
  if (!data?.accounts || data.accounts.length === 0) return null;

  // Use active account or first account
  const activeIndex = data.activeIndex ?? 0;
  const account = data.accounts[activeIndex] ?? data.accounts[0];
  
  if (!account) return null;

  // We need at least a refresh token to be useful
  // The provider will handle token refresh if accessToken is missing/expired
  if (!account.refreshToken && !account.accessToken) return null;

  const oauth: OAuthCredentials = {
    accessToken: account.accessToken ?? '',
    ...(account.refreshToken !== undefined && { refreshToken: account.refreshToken }),
    ...(account.expiresAt !== undefined && { expiresAt: account.expiresAt }),
    ...(account.managedProjectId !== undefined && { managedProjectId: account.managedProjectId }),
  };

  return {
    oauth,
    source: 'opencode',
  };
}

export async function getOpenCodeInstallation(): Promise<{
  installed: boolean;
  authPath: string;
  configPath: string;
  hasAuth: boolean;
  hasConfig: boolean;
}> {
  const [authExists, configExists] = await Promise.all([
    fs.access(OPENCODE_AUTH_PATH).then(() => true).catch(() => false),
    fs.access(OPENCODE_CONFIG_PATH).then(() => true).catch(() => false),
  ]);

  return {
    installed: authExists || configExists,
    authPath: OPENCODE_AUTH_PATH,
    configPath: OPENCODE_CONFIG_PATH,
    hasAuth: authExists,
    hasConfig: configExists,
  };
}

export { OPENCODE_AUTH_PATH, OPENCODE_CONFIG_PATH, ANTIGRAVITY_ACCOUNTS_PATH };
