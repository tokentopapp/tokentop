import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type {
  AgentPlugin,
  AgentFetchContext,
  AgentCredentials,
  AgentProviderConfig,
  SessionParseOptions,
  SessionUsageData,
} from '../types/agent.ts';
import type { Credentials, OAuthCredentials } from '../types/provider.ts';

const OPENCODE_AUTH_PATH = path.join(os.homedir(), '.local/share/opencode/auth.json');
const OPENCODE_CONFIG_PATH = path.join(os.homedir(), '.config/opencode/opencode.json');
const OPENCODE_SESSIONS_PATH = path.join(os.homedir(), '.local/share/opencode/sessions');

interface OpenCodeAuthEntry {
  type: 'api' | 'oauth' | 'codex' | 'github' | 'wellknown';
  key?: string;
  access?: string;
  refresh?: string;
  expires?: number;
  token?: string;
  accessToken?: string;
  refreshToken?: string;
  accountId?: string;
  expiresAt?: number;
}

interface OpenCodeConfig {
  provider?: Record<string, {
    name?: string;
    key?: string;
    enabled?: boolean;
    options?: {
      apiKey?: string;
      [key: string]: unknown;
    };
  }>;
}

interface OpenCodeSessionMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  model?: string;
  provider?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
  timestamp?: number;
}

interface OpenCodeSession {
  id: string;
  messages: OpenCodeSessionMessage[];
  created_at?: number;
  updated_at?: number;
  project_path?: string;
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

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

export const opencodeAgentPlugin: AgentPlugin = {
  id: 'opencode',
  type: 'agent',
  name: 'OpenCode',
  version: '1.0.0',

  meta: {
    description: 'OpenCode AI coding agent session tracking',
    homepage: 'https://opencode.ai',
  },

  permissions: {
    filesystem: {
      read: true,
      paths: [
        '~/.local/share/opencode',
        '~/.config/opencode',
      ],
    },
  },

  agent: {
    command: 'opencode',
    configPath: OPENCODE_CONFIG_PATH,
    sessionPath: OPENCODE_SESSIONS_PATH,
    authPath: OPENCODE_AUTH_PATH,
  },

  capabilities: {
    sessionParsing: true,
    authReading: true,
    realTimeTracking: false,
    multiProvider: true,
  },

  async isInstalled(): Promise<boolean> {
    try {
      await fs.access(OPENCODE_CONFIG_PATH);
      return true;
    } catch {
      try {
        await fs.access(OPENCODE_AUTH_PATH);
        return true;
      } catch {
        return false;
      }
    }
  },

  async readCredentials(ctx: AgentFetchContext): Promise<AgentCredentials> {
    const result: AgentCredentials = { providers: {} };

    const authData = await readJsonFile<Record<string, OpenCodeAuthEntry>>(OPENCODE_AUTH_PATH);
    if (authData) {
      for (const [providerId, entry] of Object.entries(authData)) {
        const creds = parseAuthEntry(entry);
        if (creds) {
          result.providers[providerId] = creds;
        }
      }
    }

    const config = await readJsonFile<OpenCodeConfig>(OPENCODE_CONFIG_PATH);
    if (config?.provider) {
      for (const [providerId, providerConfig] of Object.entries(config.provider)) {
        if (result.providers[providerId]) continue;

        const apiKey = resolveEnvValue(providerConfig.key) ??
                       resolveEnvValue(providerConfig.options?.apiKey as string);

        if (apiKey) {
          result.providers[providerId] = {
            apiKey,
            source: 'opencode',
          };
        }
      }
    }

    ctx.log.debug('Read OpenCode credentials', { providers: Object.keys(result.providers) });
    return result;
  },

  async parseSessions(options: SessionParseOptions, ctx: AgentFetchContext): Promise<SessionUsageData[]> {
    const sessions: SessionUsageData[] = [];

    try {
      await fs.access(OPENCODE_SESSIONS_PATH);
    } catch {
      ctx.log.debug('No OpenCode sessions directory found');
      return sessions;
    }

    const entries = await fs.readdir(OPENCODE_SESSIONS_PATH, { withFileTypes: true });
    const sessionDirs = entries.filter((e) => e.isDirectory());

    const limit = options.limit ?? 100;
    let count = 0;

    for (const dir of sessionDirs) {
      if (count >= limit) break;

      if (options.sessionId && dir.name !== options.sessionId) continue;

      const sessionPath = path.join(OPENCODE_SESSIONS_PATH, dir.name, 'session.json');
      const session = await readJsonFile<OpenCodeSession>(sessionPath);

      if (!session?.messages) continue;

      for (const message of session.messages) {
        if (message.role !== 'assistant' || !message.usage) continue;

        const usage: SessionUsageData = {
          sessionId: session.id || dir.name,
          providerId: message.provider ?? 'unknown',
          modelId: message.model ?? 'unknown',
          tokens: {
            input: message.usage.input_tokens ?? 0,
            output: message.usage.output_tokens ?? 0,
          },
          timestamp: message.timestamp ?? session.updated_at ?? Date.now(),
        };

        if (message.usage.cache_read_input_tokens) {
          usage.tokens.cacheRead = message.usage.cache_read_input_tokens;
        }
        if (message.usage.cache_creation_input_tokens) {
          usage.tokens.cacheWrite = message.usage.cache_creation_input_tokens;
        }
        if (session.project_path) {
          usage.projectPath = session.project_path;
        }

        sessions.push(usage);
        count++;

        if (count >= limit) break;
      }
    }

    ctx.log.debug('Parsed OpenCode sessions', { count: sessions.length });
    return sessions;
  },

  async getProviders(ctx: AgentFetchContext): Promise<AgentProviderConfig[]> {
    const providers: AgentProviderConfig[] = [];

    const config = await readJsonFile<OpenCodeConfig>(OPENCODE_CONFIG_PATH);
    const authData = await readJsonFile<Record<string, OpenCodeAuthEntry>>(OPENCODE_AUTH_PATH);

    const knownProviders: Record<string, string> = {
      anthropic: 'Anthropic',
      openai: 'OpenAI',
      'opencode-zen': 'OpenCode Zen',
      'github-copilot': 'GitHub Copilot',
      'google-gemini': 'Google Gemini',
      openrouter: 'OpenRouter',
      antigravity: 'Antigravity',
    };

    for (const [id, name] of Object.entries(knownProviders)) {
      const hasAuth = authData?.[id] !== undefined;
      const configEntry = config?.provider?.[id];
      const hasConfig = configEntry !== undefined;
      const enabled = configEntry?.enabled !== false;

      providers.push({
        id,
        name,
        configured: hasAuth || hasConfig,
        enabled: enabled && (hasAuth || hasConfig),
      });
    }

    ctx.log.debug('Got OpenCode providers', { count: providers.length });
    return providers;
  },
};

function parseAuthEntry(entry: OpenCodeAuthEntry): Credentials | null {
  if (entry.type === 'api' && entry.key) {
    return { apiKey: entry.key, source: 'opencode' };
  }

  if (entry.type === 'oauth' && entry.access) {
    return {
      oauth: buildOAuthCredentials(entry.access, entry.refresh, entry.expires),
      source: 'opencode',
    };
  }

  if (entry.type === 'codex' && entry.accessToken) {
    return {
      oauth: buildOAuthCredentials(entry.accessToken, entry.refreshToken, entry.expiresAt, entry.accountId),
      source: 'opencode',
    };
  }

  if (entry.type === 'github' && entry.token) {
    return { apiKey: entry.token, source: 'opencode' };
  }

  if (entry.type === 'wellknown') {
    const apiKey = entry.token ?? entry.key;
    if (apiKey) {
      return { apiKey, source: 'opencode' };
    }
  }

  return null;
}

function resolveEnvValue(value: string | undefined): string | undefined {
  if (!value) return undefined;

  const envMatch = value.match(/^\{env:(\w+)\}$/);
  if (envMatch && envMatch[1]) {
    return process.env[envMatch[1]];
  }
  return value;
}
