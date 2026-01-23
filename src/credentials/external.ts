import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { execFileSync } from 'child_process';
import type { Credentials, OAuthCredentials } from '@/plugins/types/provider.ts';

const EXTERNAL_PATHS = {
  claudeCode: path.join(os.homedir(), '.claude/.credentials.json'),
  codexCli: path.join(os.homedir(), '.codex/auth.json'),
  gemini: path.join(os.homedir(), '.gemini/oauth_creds.json'),
  cursor: path.join(os.homedir(), '.cursor/credentials.json'),
  copilot: path.join(os.homedir(), '.config/github-copilot/hosts.json'),
} as const;

interface ExternalPath {
  path: string;
  type: string;
  key?: string;
}

interface ClaudeCodeCredentialsFile {
  claudeAiOauth?: {
    accessToken?: string;
    refreshToken?: string;
    subscriptionType?: string;
    rateLimitTier?: string;
    expiresAt?: number;
    scopes?: string[];
  };
}

interface CodexCliCredentials {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  account_id?: string;
  id_token?: string;
}

interface GeminiCredentials {
  access_token?: string;
  refresh_token?: string;
  expiry_date?: number;  // Gemini CLI uses expiry_date, not expires_at
  token_type?: string;
  scope?: string;
}

interface CopilotHostsCredentials {
  'github.com'?: {
    oauth_token?: string;
    user?: string;
  };
}

interface CursorCredentials {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

function buildOAuthCredentials(
  accessToken: string,
  refreshToken?: string,
  expiresAt?: number,
  accountId?: string,
  subscriptionType?: string
): OAuthCredentials {
  const oauth: OAuthCredentials = { accessToken };
  if (refreshToken !== undefined) oauth.refreshToken = refreshToken;
  if (expiresAt !== undefined) oauth.expiresAt = expiresAt;
  if (accountId !== undefined) oauth.accountId = accountId;
  if (subscriptionType !== undefined) (oauth as OAuthCredentials & { subscriptionType?: string }).subscriptionType = subscriptionType;
  return oauth;
}

export async function discoverFromExternal(
  _providerId: string,
  externalPath: ExternalPath
): Promise<Credentials | null> {
  const resolvedPath = externalPath.path.startsWith('~')
    ? path.join(os.homedir(), externalPath.path.slice(1))
    : externalPath.path;

  switch (externalPath.type) {
    case 'claude-code':
      return readClaudeCodeCredentials(resolvedPath);
    case 'codex-cli':
      return readCodexCliCredentials(resolvedPath);
    case 'gemini':
      return readGeminiCredentials(resolvedPath);
    case 'copilot':
      return readCopilotCredentials(resolvedPath);
    case 'cursor':
      return readCursorCredentials(resolvedPath);
    case 'json-key':
      return readJsonKeyCredentials(resolvedPath, externalPath.key);
    case 'json-oauth':
      return readJsonOAuthCredentials(resolvedPath);
    default:
      return null;
  }
}

function readKeychainCredentials(): ClaudeCodeCredentialsFile | null {
  if (process.platform !== 'darwin') {
    return null;
  }

  try {
    const keychainData = execFileSync(
      '/usr/bin/security',
      ['find-generic-password', '-s', 'Claude Code-credentials', '-w'],
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 5000 }
    ).trim();

    if (!keychainData) {
      return null;
    }

    return JSON.parse(keychainData) as ClaudeCodeCredentialsFile;
  } catch {
    return null;
  }
}

async function readClaudeCodeCredentials(filePath: string): Promise<Credentials | null> {
  const now = Date.now();

  const keychainData = readKeychainCredentials();
  const keychainOauth = keychainData?.claudeAiOauth;
  if (keychainOauth?.accessToken) {
    const isExpired = keychainOauth.expiresAt && keychainOauth.expiresAt <= now;
    if (!isExpired) {
      return {
        oauth: buildOAuthCredentials(
          keychainOauth.accessToken,
          keychainOauth.refreshToken,
          keychainOauth.expiresAt,
          undefined,
          keychainOauth.subscriptionType
        ),
        source: 'external',
      };
    }
  }

  const fileData = await readJsonFile<ClaudeCodeCredentialsFile>(filePath);
  const fileOauth = fileData?.claudeAiOauth;
  if (!fileOauth?.accessToken) return null;

  if (fileOauth.expiresAt && fileOauth.expiresAt <= now) {
    return null;
  }

  return {
    oauth: buildOAuthCredentials(
      fileOauth.accessToken,
      fileOauth.refreshToken,
      fileOauth.expiresAt,
      undefined,
      fileOauth.subscriptionType
    ),
    source: 'external',
  };
}

async function readCodexCliCredentials(filePath: string): Promise<Credentials | null> {
  const data = await readJsonFile<CodexCliCredentials>(filePath);
  if (!data?.access_token) return null;

  return {
    oauth: buildOAuthCredentials(
      data.access_token,
      data.refresh_token,
      data.expires_at,
      data.account_id
    ),
    source: 'external',
  };
}

async function readGeminiCredentials(filePath: string): Promise<Credentials | null> {
  const data = await readJsonFile<GeminiCredentials>(filePath);
  if (!data?.access_token) return null;

  return {
    oauth: buildOAuthCredentials(
      data.access_token,
      data.refresh_token,
      data.expiry_date
    ),
    source: 'external',
  };
}

async function readCopilotCredentials(filePath: string): Promise<Credentials | null> {
  const data = await readJsonFile<CopilotHostsCredentials>(filePath);
  const githubEntry = data?.['github.com'];
  if (!githubEntry?.oauth_token) return null;

  return {
    apiKey: githubEntry.oauth_token,
    source: 'external',
  };
}

async function readCursorCredentials(filePath: string): Promise<Credentials | null> {
  const data = await readJsonFile<CursorCredentials>(filePath);
  if (!data?.accessToken) return null;

  return {
    oauth: buildOAuthCredentials(
      data.accessToken,
      data.refreshToken,
      data.expiresAt
    ),
    source: 'external',
  };
}

async function readJsonKeyCredentials(
  filePath: string,
  key?: string
): Promise<Credentials | null> {
  if (!key) return null;

  const data = await readJsonFile<Record<string, unknown>>(filePath);
  if (!data) return null;

  const value = key.split('.').reduce<unknown>((obj, k) => {
    if (obj && typeof obj === 'object' && k in obj) {
      return (obj as Record<string, unknown>)[k];
    }
    return undefined;
  }, data);

  if (typeof value !== 'string' || !value.trim()) return null;

  return {
    apiKey: value.trim(),
    source: 'external',
  };
}

async function readJsonOAuthCredentials(filePath: string): Promise<Credentials | null> {
  const data = await readJsonFile<Record<string, unknown>>(filePath);
  if (!data) return null;

  const accessToken =
    (data.accessToken as string) ||
    (data.access_token as string);

  if (!accessToken) return null;

  const refreshToken =
    (data.refreshToken as string | undefined) ||
    (data.refresh_token as string | undefined);
  const expiresAt =
    (data.expiresAt as number | undefined) ||
    (data.expires_at as number | undefined);
  const accountId =
    (data.accountId as string | undefined) ||
    (data.account_id as string | undefined);

  return {
    oauth: buildOAuthCredentials(accessToken, refreshToken, expiresAt, accountId),
    source: 'external',
  };
}

export function getExternalPaths(): typeof EXTERNAL_PATHS {
  return EXTERNAL_PATHS;
}

export async function checkExternalCredentials(): Promise<
  Record<keyof typeof EXTERNAL_PATHS, boolean>
> {
  const results = await Promise.all(
    (Object.keys(EXTERNAL_PATHS) as Array<keyof typeof EXTERNAL_PATHS>).map(
      async (tool) => {
        try {
          await fs.access(EXTERNAL_PATHS[tool]);
          return [tool, true] as const;
        } catch {
          return [tool, false] as const;
        }
      }
    )
  );

  return Object.fromEntries(results) as Record<keyof typeof EXTERNAL_PATHS, boolean>;
}

export { EXTERNAL_PATHS };
