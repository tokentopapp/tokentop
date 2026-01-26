import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import * as os from 'os';
import type {
  AgentPlugin,
  AgentFetchContext,
  AgentCredentials,
  AgentProviderConfig,
  SessionParseOptions,
  SessionUsageData,
  ActivityUpdate,
  ActivityCallback,
} from '../types/agent.ts';
import type { Credentials, OAuthCredentials } from '../types/provider.ts';

const OPENCODE_AUTH_PATH = path.join(os.homedir(), '.local/share/opencode/auth.json');
const OPENCODE_CONFIG_PATH = path.join(os.homedir(), '.config/opencode/opencode.json');
const OPENCODE_STORAGE_PATH = path.join(os.homedir(), '.local/share/opencode/storage');
const OPENCODE_SESSIONS_PATH = path.join(OPENCODE_STORAGE_PATH, 'session');
const OPENCODE_MESSAGES_PATH = path.join(OPENCODE_STORAGE_PATH, 'message');
const OPENCODE_PARTS_PATH = path.join(OPENCODE_STORAGE_PATH, 'part');

const sessionCache: {
  lastCheck: number;
  lastResult: SessionUsageData[];
  lastLimit: number;
} = {
  lastCheck: 0,
  lastResult: [],
  lastLimit: 0,
};

const CACHE_TTL_MS = 2000;

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

interface OpenCodeMessageTokens {
  input: number;
  output: number;
  reasoning?: number;
  cache?: {
    read: number;
    write: number;
  };
}

interface OpenCodeMessage {
  id: string;
  sessionID: string;
  role: 'user' | 'assistant' | 'system';
  time: {
    created: number;
    completed?: number;
  };
  providerID?: string;
  modelID?: string;
  cost?: number;
  tokens?: OpenCodeMessageTokens;
  agent?: string;
  model?: {
    providerID?: string;
    modelID?: string;
  };
}

interface OpenCodeSession {
  id: string;
  projectID?: string;
  directory?: string;
  title?: string;
  time: {
    created: number;
    updated: number;
  };
}

interface OpenCodePart {
  id: string;
  sessionID: string;
  messageID: string;
  type: 'step-start' | 'step-finish' | 'reasoning' | 'tool' | 'text';
  tokens?: OpenCodeMessageTokens;
  cost?: number;
  time?: {
    start?: number;
    end?: number;
  };
}

interface ActivityWatcherState {
  watcher: fsSync.FSWatcher | null;
  callback: ActivityCallback | null;
  seenParts: Set<string>;
  debounceTimer: ReturnType<typeof setTimeout> | null;
  pendingDirs: Set<string>;
  messageWatchers: Map<string, fsSync.FSWatcher>;
}

const activityWatcher: ActivityWatcherState = {
  watcher: null,
  callback: null,
  seenParts: new Set(),
  debounceTimer: null,
  pendingDirs: new Set(),
  messageWatchers: new Map(),
};

async function processPartFile(partPath: string): Promise<void> {
  if (activityWatcher.seenParts.has(partPath)) return;
  activityWatcher.seenParts.add(partPath);

  const part = await readJsonFile<OpenCodePart>(partPath);
  if (!part || part.type !== 'step-finish' || !part.tokens) return;

  const callback = activityWatcher.callback;
  if (!callback) return;

  const tokens: ActivityUpdate['tokens'] = {
    input: part.tokens.input ?? 0,
    output: part.tokens.output ?? 0,
  };
  if (part.tokens.reasoning !== undefined) tokens.reasoning = part.tokens.reasoning;
  if (part.tokens.cache?.read !== undefined) tokens.cacheRead = part.tokens.cache.read;
  if (part.tokens.cache?.write !== undefined) tokens.cacheWrite = part.tokens.cache.write;

  const update: ActivityUpdate = {
    sessionId: part.sessionID,
    messageId: part.messageID,
    tokens,
    timestamp: Date.now(),
  };

  callback(update);
}

async function scanMessageDir(msgDirPath: string): Promise<void> {
  try {
    const files = await fs.readdir(msgDirPath);
    for (const file of files) {
      if (file.endsWith('.json')) {
        const partPath = path.join(msgDirPath, file);
        await processPartFile(partPath);
      }
    }
  } catch {
    // Ignore - directory may not exist
  }
}

function watchMessageDir(msgDirPath: string): void {
  if (activityWatcher.messageWatchers.has(msgDirPath)) return;

  try {
    const watcher = fsSync.watch(msgDirPath, async (eventType, filename) => {
      if (eventType === 'rename' && filename?.endsWith('.json')) {
        const partPath = path.join(msgDirPath, filename);
        setTimeout(() => processPartFile(partPath), 50);
      }
    });

    activityWatcher.messageWatchers.set(msgDirPath, watcher);
    scanMessageDir(msgDirPath);
  } catch {
    // Ignore - directory may not exist
  }
}

function startActivityWatch(callback: ActivityCallback): void {
  if (activityWatcher.watcher) {
    activityWatcher.callback = callback;
    return;
  }

  activityWatcher.callback = callback;
  activityWatcher.seenParts.clear();

  try {
    activityWatcher.watcher = fsSync.watch(OPENCODE_PARTS_PATH, (eventType, filename) => {
      if (eventType === 'rename' && filename?.startsWith('msg_')) {
        const msgDirPath = path.join(OPENCODE_PARTS_PATH, filename);
        watchMessageDir(msgDirPath);
      }
    });
  } catch {
    // Ignore - directory may not exist yet
  }
}

function stopActivityWatch(): void {
  if (activityWatcher.debounceTimer) {
    clearTimeout(activityWatcher.debounceTimer);
    activityWatcher.debounceTimer = null;
  }

  for (const watcher of activityWatcher.messageWatchers.values()) {
    watcher.close();
  }
  activityWatcher.messageWatchers.clear();

  if (activityWatcher.watcher) {
    activityWatcher.watcher.close();
    activityWatcher.watcher = null;
  }

  activityWatcher.callback = null;
  activityWatcher.seenParts.clear();
  activityWatcher.pendingDirs.clear();
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
    sessionPath: OPENCODE_STORAGE_PATH,
    authPath: OPENCODE_AUTH_PATH,
  },

  capabilities: {
    sessionParsing: true,
    authReading: true,
    realTimeTracking: true,
    multiProvider: true,
  },

  startActivityWatch,
  stopActivityWatch,

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
    const limit = options.limit ?? 100;

    try {
      await fs.access(OPENCODE_STORAGE_PATH);
    } catch {
      ctx.log.debug('No OpenCode storage directory found');
      return [];
    }

    const now = Date.now();
    if (
      !options.sessionId &&
      limit === sessionCache.lastLimit &&
      now - sessionCache.lastCheck < CACHE_TTL_MS &&
      sessionCache.lastResult.length > 0
    ) {
      ctx.log.debug('Using cached sessions (within TTL)', { count: sessionCache.lastResult.length });
      return sessionCache.lastResult;
    }

    const sessions: SessionUsageData[] = [];
    const sessionFiles: Array<{ path: string; session: OpenCodeSession }> = [];

    try {
      const projectDirs = await fs.readdir(OPENCODE_SESSIONS_PATH, { withFileTypes: true });

      for (const projectDir of projectDirs) {
        if (!projectDir.isDirectory()) continue;

        const projectPath = path.join(OPENCODE_SESSIONS_PATH, projectDir.name);
        const sessionEntries = await fs.readdir(projectPath, { withFileTypes: true });

        for (const entry of sessionEntries) {
          if (!entry.isFile() || !entry.name.endsWith('.json')) continue;

          const sessionFilePath = path.join(projectPath, entry.name);
          const session = await readJsonFile<OpenCodeSession>(sessionFilePath);

          if (session?.id) {
            if (options.sessionId && session.id !== options.sessionId) continue;
            sessionFiles.push({ path: sessionFilePath, session });
          }
        }
      }
    } catch (err) {
      ctx.log.debug('Failed to read session directories', { error: err });
      return sessions;
    }

    sessionFiles.sort((a, b) => b.session.time.updated - a.session.time.updated);

    const maxSessionsToProcess = Math.min(sessionFiles.length, 50);

    for (let i = 0; i < maxSessionsToProcess; i++) {
      const { session } = sessionFiles[i]!;

      const messagesDir = path.join(OPENCODE_MESSAGES_PATH, session.id);

      try {
        await fs.access(messagesDir);
      } catch {
        continue;
      }

      const messageFiles = await fs.readdir(messagesDir, { withFileTypes: true });
      
      const messageData: Array<{ file: string; mtime: number }> = [];
      for (const msgFile of messageFiles) {
        if (!msgFile.isFile() || !msgFile.name.endsWith('.json')) continue;
        const msgPath = path.join(messagesDir, msgFile.name);
        try {
          const stat = await fs.stat(msgPath);
          messageData.push({ file: msgPath, mtime: stat.mtimeMs });
        } catch {
          continue;
        }
      }
      
      messageData.sort((a, b) => b.mtime - a.mtime);

      for (const { file: msgPath } of messageData) {
        const message = await readJsonFile<OpenCodeMessage>(msgPath);

        if (!message || message.role !== 'assistant' || !message.tokens) continue;

        const providerId = message.providerID ?? message.model?.providerID ?? 'unknown';
        const modelId = message.modelID ?? message.model?.modelID ?? 'unknown';

        const usage: SessionUsageData = {
          sessionId: session.id,
          providerId,
          modelId,
          tokens: {
            input: message.tokens.input ?? 0,
            output: message.tokens.output ?? 0,
          },
          timestamp: message.time.completed ?? message.time.created,
          sessionUpdatedAt: session.time.updated,
        };

        if (message.tokens.cache?.read) {
          usage.tokens.cacheRead = message.tokens.cache.read;
        }
        if (message.tokens.cache?.write) {
          usage.tokens.cacheWrite = message.tokens.cache.write;
        }
        if (session.directory) {
          usage.projectPath = session.directory;
        }

        sessions.push(usage);
      }
    }

    if (!options.sessionId) {
      sessionCache.lastCheck = Date.now();
      sessionCache.lastResult = sessions;
      sessionCache.lastLimit = limit;
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
