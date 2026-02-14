import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Database } from 'bun:sqlite';
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
const OPENCODE_DB_PATH = path.join(os.homedir(), '.local/share/opencode/opencode.db');

let sqliteDb: InstanceType<typeof Database> | null = null;
let sqliteChecked = false;
let sqliteOpenedAt = 0;

const WAL_RELEASE_INTERVAL_MS = 5 * 60 * 1000;

function getDb(): InstanceType<typeof Database> | null {
  if (sqliteDb) {
    if (Date.now() - sqliteOpenedAt > WAL_RELEASE_INTERVAL_MS) {
      closeDb();
    } else {
      return sqliteDb;
    }
  }
  if (sqliteChecked && !sqliteDb) return null;

  try {
    if (!fsSync.existsSync(OPENCODE_DB_PATH)) {
      sqliteChecked = true;
      return null;
    }
    sqliteDb = new Database(OPENCODE_DB_PATH, { readonly: true, create: false });
    sqliteOpenedAt = Date.now();
    stmts = null;
    return sqliteDb;
  } catch {
    sqliteChecked = true;
    return null;
  }
}

function closeDb(): void {
  if (sqliteDb) {
    try { sqliteDb.close(); } catch { /* ignore */ }
    sqliteDb = null;
    stmts = null;
  }
}

type Stmt = ReturnType<InstanceType<typeof Database>['prepare']>;

interface PreparedStatements {
  allSessions: Stmt;
  sessionsSince: Stmt;
  oneSession: Stmt;
  sessionMessages: Stmt;
  uncachedMessages: Stmt;
  uncachedMessagesSince: Stmt;
  recentParts: Stmt;
}

let stmts: PreparedStatements | null = null;

function getStmts(db: InstanceType<typeof Database>): PreparedStatements {
  if (stmts) return stmts;

  const assistantFilter = `
    json_extract(m.data, '$.role') = 'assistant'
    AND json_extract(m.data, '$.tokens.input') IS NOT NULL`;

  stmts = {
    allSessions: db.prepare(
      'SELECT id, project_id, title, directory, time_created, time_updated FROM session ORDER BY time_updated DESC'
    ),
    sessionsSince: db.prepare(
      'SELECT id, project_id, title, directory, time_created, time_updated FROM session WHERE time_updated > ? ORDER BY time_updated DESC'
    ),
    oneSession: db.prepare(
      'SELECT id, project_id, title, directory, time_created, time_updated FROM session WHERE id = ?'
    ),
    sessionMessages: db.prepare(`
      SELECT s.id as sid, s.title, s.directory, s.time_updated, m.data
      FROM session s
      JOIN message m ON m.session_id = s.id
      WHERE s.id IN (SELECT value FROM json_each(?))
        AND ${assistantFilter}
      ORDER BY s.time_updated DESC, m.time_created DESC
    `),
    uncachedMessages: db.prepare(`
      SELECT s.id as sid, s.title, s.directory, s.time_updated, m.data
      FROM session s
      JOIN message m ON m.session_id = s.id
      WHERE ${assistantFilter}
      ORDER BY s.time_updated DESC, m.time_created DESC
    `),
    uncachedMessagesSince: db.prepare(`
      SELECT s.id as sid, s.title, s.directory, s.time_updated, m.data
      FROM session s
      JOIN message m ON m.session_id = s.id
      WHERE s.time_updated > ?
        AND ${assistantFilter}
      ORDER BY s.time_updated DESC, m.time_created DESC
    `),
    recentParts: db.prepare(
      'SELECT id, message_id, session_id, time_created, data FROM part WHERE time_created > ? ORDER BY time_created ASC'
    ),
  };

  return stmts;
}

interface SessionRow {
  id: string;
  project_id: string;
  title: string;
  directory: string;
  time_created: number;
  time_updated: number;
}

interface JoinedMessageRow {
  sid: string;
  title: string;
  directory: string;
  time_updated: number;
  data: string;
}

interface PartRow {
  id: string;
  message_id: string;
  session_id: string;
  time_created: number;
  data: string;
}

function parseSessionsSqlite(
  options: SessionParseOptions,
  ctx: AgentFetchContext,
): SessionUsageData[] {
  const db = getDb();
  if (!db) return [];

  const now = Date.now();

  if (
    !options.sessionId &&
    now - sessionCache.lastCheck < CACHE_TTL_MS &&
    sessionCache.lastResult.length > 0 &&
    sessionCache.lastSince === options.since
  ) {
    ctx.log.debug('SQLite: using cached sessions (within TTL)', { count: sessionCache.lastResult.length });
    return sessionCache.lastResult;
  }

  try {
    const s = getStmts(db);
    const sessions: SessionUsageData[] = [];

    let sessionRows: SessionRow[];
    if (options.sessionId) {
      sessionRows = s.oneSession.all(options.sessionId) as SessionRow[];
    } else if (options.since) {
      sessionRows = s.sessionsSince.all(options.since) as SessionRow[];
    } else {
      sessionRows = s.allSessions.all() as SessionRow[];
    }

    let aggregateCacheHits = 0;
    let aggregateCacheMisses = 0;

    const uncachedSessionIds: string[] = [];
    for (const row of sessionRows) {
      const cached = sessionAggregateCache.get(row.id);
      if (cached && cached.updatedAt === row.time_updated) {
        cached.lastAccessed = now;
        aggregateCacheHits++;
        sessions.push(...cached.usageRows);
      } else {
        aggregateCacheMisses++;
        uncachedSessionIds.push(row.id);
      }
    }

    if (uncachedSessionIds.length > 0) {
      const sessionLookup = new Map<string, SessionRow>();
      for (const row of sessionRows) {
        if (uncachedSessionIds.includes(row.id)) {
          sessionLookup.set(row.id, row);
        }
      }

      let messageRows: JoinedMessageRow[];
      if (uncachedSessionIds.length === sessionRows.length && !options.sessionId) {
        messageRows = options.since
          ? s.uncachedMessagesSince.all(options.since) as JoinedMessageRow[]
          : s.uncachedMessages.all() as JoinedMessageRow[];
      } else {
        messageRows = s.sessionMessages.all(JSON.stringify(uncachedSessionIds)) as JoinedMessageRow[];
      }

      const sessionUsageMap = new Map<string, SessionUsageData[]>();

      for (const msgRow of messageRows) {
        let msgData: OpenCodeMessage;
        try {
          msgData = JSON.parse(msgRow.data) as OpenCodeMessage;
        } catch {
          continue;
        }

        if (!msgData.tokens) continue;

        const providerId = msgData.providerID ?? msgData.model?.providerID ?? 'unknown';
        const modelId = msgData.modelID ?? msgData.model?.modelID ?? 'unknown';

        const usage: SessionUsageData = {
          sessionId: msgRow.sid,
          providerId,
          modelId,
          tokens: {
            input: msgData.tokens.input ?? 0,
            output: msgData.tokens.output ?? 0,
          },
          timestamp: msgData.time.completed ?? msgData.time.created,
          sessionUpdatedAt: msgRow.time_updated,
        };

        if (msgRow.title) usage.sessionName = msgRow.title;
        if (msgData.tokens.cache?.read) usage.tokens.cacheRead = msgData.tokens.cache.read;
        if (msgData.tokens.cache?.write) usage.tokens.cacheWrite = msgData.tokens.cache.write;
        if (msgRow.directory) usage.projectPath = msgRow.directory;

        let arr = sessionUsageMap.get(msgRow.sid);
        if (!arr) {
          arr = [];
          sessionUsageMap.set(msgRow.sid, arr);
        }
        arr.push(usage);
      }

      for (const [sid, usageRows] of sessionUsageMap) {
        const row = sessionLookup.get(sid);
        sessionAggregateCache.set(sid, {
          updatedAt: row?.time_updated ?? 0,
          usageRows,
          lastAccessed: now,
        });
        sessions.push(...usageRows);
      }

      for (const sid of uncachedSessionIds) {
        if (!sessionUsageMap.has(sid)) {
          const row = sessionLookup.get(sid);
          sessionAggregateCache.set(sid, {
            updatedAt: row?.time_updated ?? 0,
            usageRows: [],
            lastAccessed: now,
          });
        }
      }
    }

    evictSessionAggregateCache();

    if (!options.sessionId) {
      sessionCache.lastCheck = Date.now();
      sessionCache.lastResult = sessions;
      sessionCache.lastLimit = options.limit ?? 100;
      sessionCache.lastSince = options.since;
    }

    ctx.log.debug('SQLite: parsed sessions', {
      count: sessions.length,
      sessionRows: sessionRows.length,
      aggregateCacheHits,
      aggregateCacheMisses,
      aggregateCacheSize: sessionAggregateCache.size,
    });

    return sessions;
  } catch (err) {
    ctx.log.debug('SQLite: query failed, falling back to JSON', { error: err });
    closeDb();
    sqliteChecked = false;
    return [];
  }
}

interface SqliteActivityState {
  timer: ReturnType<typeof setInterval> | null;
  callback: ActivityCallback | null;
  lastPartTime: number;
}

const sqliteActivity: SqliteActivityState = {
  timer: null,
  callback: null,
  lastPartTime: 0,
};

const SQLITE_POLL_INTERVAL_MS = 1000;

function startActivityWatchSqlite(callback: ActivityCallback): void {
  sqliteActivity.callback = callback;

  if (sqliteActivity.timer) return;

  sqliteActivity.lastPartTime = Date.now();

  sqliteActivity.timer = setInterval(() => {
    const db = getDb();
    if (!db || !sqliteActivity.callback) return;

    try {
      const s = getStmts(db);
      const rows = s.recentParts.all(sqliteActivity.lastPartTime) as PartRow[];

      for (const row of rows) {
        if (row.time_created > sqliteActivity.lastPartTime) {
          sqliteActivity.lastPartTime = row.time_created;
        }

        let partData: OpenCodePart;
        try {
          partData = JSON.parse(row.data) as OpenCodePart;
        } catch {
          continue;
        }

        if (!partData.tokens) continue;

        const tokens: ActivityUpdate['tokens'] = {
          input: partData.tokens.input ?? 0,
          output: partData.tokens.output ?? 0,
        };
        if (partData.tokens.reasoning !== undefined) tokens.reasoning = partData.tokens.reasoning;
        if (partData.tokens.cache?.read !== undefined) tokens.cacheRead = partData.tokens.cache.read;
        if (partData.tokens.cache?.write !== undefined) tokens.cacheWrite = partData.tokens.cache.write;

        sqliteActivity.callback({
          sessionId: row.session_id,
          messageId: row.message_id,
          tokens,
          timestamp: row.time_created,
        });
      }
    } catch {
    }
  }, SQLITE_POLL_INTERVAL_MS);
}

function stopActivityWatchSqlite(): void {
  if (sqliteActivity.timer) {
    clearInterval(sqliteActivity.timer);
    sqliteActivity.timer = null;
  }
  sqliteActivity.callback = null;
  sqliteActivity.lastPartTime = 0;
}

const sessionCache: {
  lastCheck: number;
  lastResult: SessionUsageData[];
  lastLimit: number;
  lastSince: number | undefined;
} = {
  lastCheck: 0,
  lastResult: [],
  lastLimit: 0,
  lastSince: undefined,
};

const CACHE_TTL_MS = 2000;

/**
 * Per-session aggregate cache: avoids re-parsing messages for unchanged sessions.
 * Keyed by sessionId, invalidated when session's time.updated changes.
 * LRU eviction: entries track lastAccessed time; evict oldest when exceeding MAX size.
 */
const SESSION_AGGREGATE_CACHE_MAX = 10_000;

const sessionAggregateCache = new Map<string, {
  updatedAt: number;
  usageRows: SessionUsageData[];
  lastAccessed: number;
}>();

/**
 * Evict least-recently-accessed entries from sessionAggregateCache when it exceeds max size.
 */
function evictSessionAggregateCache(): void {
  if (sessionAggregateCache.size <= SESSION_AGGREGATE_CACHE_MAX) return;

  const entries = Array.from(sessionAggregateCache.entries());
  entries.sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);

  const toEvict = entries.length - SESSION_AGGREGATE_CACHE_MAX;
  for (let i = 0; i < toEvict; i++) {
    sessionAggregateCache.delete(entries[i]![0]);
  }
}

/**
 * Session metadata index: caches stat mtime per session file path.
 * On refresh, we stat each file and only re-read JSON if mtime changed.
 */
const sessionMetadataIndex = new Map<string, {
  mtimeMs: number;
  session: OpenCodeSession;
}>();

/**
 * Session directory watcher state: tracks dirty session file paths detected by fs.watch.
 * On refresh, dirty paths are processed first (guaranteed changed),
 * then non-dirty paths get stat-checked as fallback.
 */
interface SessionWatcherState {
  /** Watchers on each project subdirectory under OPENCODE_SESSIONS_PATH */
  projectWatchers: Map<string, fsSync.FSWatcher>;
  /** Watcher on the root sessions directory (to detect new project dirs) */
  rootWatcher: fsSync.FSWatcher | null;
  /** Set of session file paths marked dirty by fs.watch events */
  dirtyPaths: Set<string>;
  /** Timer for periodic full reconciliation sweep */
  reconciliationTimer: ReturnType<typeof setInterval> | null;
  /** Whether the watcher has been started */
  started: boolean;
}

const RECONCILIATION_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

const sessionWatcher: SessionWatcherState = {
  projectWatchers: new Map(),
  rootWatcher: null,
  dirtyPaths: new Set(),
  reconciliationTimer: null,
  started: false,
};

/** Flag to force full re-stat on next refresh (set by reconciliation timer) */
let forceFullReconciliation = false;

/**
 * Watch a single project directory under OPENCODE_SESSIONS_PATH for session file changes.
 */
function watchProjectDir(projectDirPath: string): void {
  if (sessionWatcher.projectWatchers.has(projectDirPath)) return;

  try {
    const watcher = fsSync.watch(projectDirPath, (_eventType, filename) => {
      if (filename?.endsWith('.json')) {
        const filePath = path.join(projectDirPath, filename);
        sessionWatcher.dirtyPaths.add(filePath);
      }
    });
    sessionWatcher.projectWatchers.set(projectDirPath, watcher);
  } catch {
    // Directory may not exist or be inaccessible
  }
}

/**
 * Start watching session storage directories for changes.
 * Called lazily on first parseSessions invocation.
 */
function startSessionWatcher(): void {
  if (sessionWatcher.started) return;
  sessionWatcher.started = true;

  // Watch root sessions dir for new project subdirectories
  try {
    sessionWatcher.rootWatcher = fsSync.watch(OPENCODE_SESSIONS_PATH, (eventType, filename) => {
      if (eventType === 'rename' && filename) {
        const projectDirPath = path.join(OPENCODE_SESSIONS_PATH, filename);
        // Attempt to watch new project dirs as they appear
        watchProjectDir(projectDirPath);
      }
    });
  } catch {
    // Sessions directory may not exist yet
  }

  // Watch existing project subdirectories
  try {
    const entries = fsSync.readdirSync(OPENCODE_SESSIONS_PATH, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        watchProjectDir(path.join(OPENCODE_SESSIONS_PATH, entry.name));
      }
    }
  } catch {
    // Sessions directory may not exist yet
  }

  // Periodic full reconciliation sweep every 10 minutes
  sessionWatcher.reconciliationTimer = setInterval(() => {
    forceFullReconciliation = true;
  }, RECONCILIATION_INTERVAL_MS);
}

/**
 * Stop all session directory watchers and clean up.
 */
function stopSessionWatcher(): void {
  if (sessionWatcher.reconciliationTimer) {
    clearInterval(sessionWatcher.reconciliationTimer);
    sessionWatcher.reconciliationTimer = null;
  }

  for (const watcher of sessionWatcher.projectWatchers.values()) {
    watcher.close();
  }
  sessionWatcher.projectWatchers.clear();

  if (sessionWatcher.rootWatcher) {
    sessionWatcher.rootWatcher.close();
    sessionWatcher.rootWatcher = null;
  }

  sessionWatcher.dirtyPaths.clear();
  sessionWatcher.started = false;
}

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
  if (!part || !part.tokens) return;

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

function startActivityWatchJson(callback: ActivityCallback): void {
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

function stopActivityWatchJson(): void {
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

  stopSessionWatcher();
}

async function parseSessionsJson(
  options: SessionParseOptions,
  ctx: AgentFetchContext,
): Promise<SessionUsageData[]> {
  const limit = options.limit ?? 100;

  try {
    await fs.access(OPENCODE_STORAGE_PATH);
  } catch {
    ctx.log.debug('No OpenCode storage directory found');
    return [];
  }

  startSessionWatcher();

  const now = Date.now();
  if (
    !options.sessionId &&
    limit === sessionCache.lastLimit &&
    now - sessionCache.lastCheck < CACHE_TTL_MS &&
    sessionCache.lastResult.length > 0 &&
    sessionCache.lastSince === options.since
  ) {
    ctx.log.debug('JSON: using cached sessions (within TTL)', { count: sessionCache.lastResult.length });
    return sessionCache.lastResult;
  }

  const dirtyPaths = new Set(sessionWatcher.dirtyPaths);
  sessionWatcher.dirtyPaths.clear();

  const needsFullStat = forceFullReconciliation;
  if (forceFullReconciliation) {
    forceFullReconciliation = false;
    ctx.log.debug('JSON: full reconciliation sweep triggered');
  }

  const sessions: SessionUsageData[] = [];
  const sessionFiles: Array<{ path: string; session: OpenCodeSession }> = [];

  let statCount = 0;
  let statSkipCount = 0;
  let parseCount = 0;
  let dirtyHitCount = 0;

  const seenFilePaths = new Set<string>();

  try {
    const projectDirs = await fs.readdir(OPENCODE_SESSIONS_PATH, { withFileTypes: true });

    for (const projectDir of projectDirs) {
      if (!projectDir.isDirectory()) continue;

      const projectPath = path.join(OPENCODE_SESSIONS_PATH, projectDir.name);

      watchProjectDir(projectPath);

      const sessionEntries = await fs.readdir(projectPath, { withFileTypes: true });

      for (const entry of sessionEntries) {
        if (!entry.isFile() || !entry.name.endsWith('.json')) continue;

        const sessionFilePath = path.join(projectPath, entry.name);
        seenFilePaths.add(sessionFilePath);

        const isDirty = dirtyPaths.has(sessionFilePath);
        if (isDirty) dirtyHitCount++;

        const cached = sessionMetadataIndex.get(sessionFilePath);

        if (!isDirty && !needsFullStat && cached) {
          statSkipCount++;
          const session = cached.session;
          if (session?.id) {
            if (options.sessionId && session.id !== options.sessionId) continue;
            sessionFiles.push({ path: sessionFilePath, session });
          }
          continue;
        }

        statCount++;
        let mtimeMs: number;
        try {
          const stat = await fs.stat(sessionFilePath);
          mtimeMs = stat.mtimeMs;
        } catch {
          sessionMetadataIndex.delete(sessionFilePath);
          continue;
        }

        if (cached && cached.mtimeMs === mtimeMs) {
          const session = cached.session;
          if (session?.id) {
            if (options.sessionId && session.id !== options.sessionId) continue;
            sessionFiles.push({ path: sessionFilePath, session });
          }
          continue;
        }

        parseCount++;
        const session = await readJsonFile<OpenCodeSession>(sessionFilePath);

        if (session?.id) {
          sessionMetadataIndex.set(sessionFilePath, { mtimeMs, session });
          if (options.sessionId && session.id !== options.sessionId) continue;
          sessionFiles.push({ path: sessionFilePath, session });
        } else {
          sessionMetadataIndex.delete(sessionFilePath);
        }
      }
    }
  } catch (err) {
    ctx.log.debug('JSON: failed to read session directories', { error: err });
    return sessions;
  }

  for (const cachedPath of sessionMetadataIndex.keys()) {
    if (!seenFilePaths.has(cachedPath)) {
      sessionMetadataIndex.delete(cachedPath);
    }
  }

  if (options.since) {
    const since = options.since;
    for (let i = sessionFiles.length - 1; i >= 0; i--) {
      if (sessionFiles[i]!.session.time.updated < since) {
        sessionFiles.splice(i, 1);
      }
    }
  }

  sessionFiles.sort((a, b) => b.session.time.updated - a.session.time.updated);

  let aggregateCacheHits = 0;
  let aggregateCacheMisses = 0;

  for (const { session } of sessionFiles) {
    const cached = sessionAggregateCache.get(session.id);
    if (cached && cached.updatedAt === session.time.updated) {
      cached.lastAccessed = now;
      aggregateCacheHits++;
      sessions.push(...cached.usageRows);
      continue;
    }

    aggregateCacheMisses++;

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

    const sessionUsageRows: SessionUsageData[] = [];

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

      if (session.title) {
        usage.sessionName = session.title;
      }
      if (message.tokens.cache?.read) {
        usage.tokens.cacheRead = message.tokens.cache.read;
      }
      if (message.tokens.cache?.write) {
        usage.tokens.cacheWrite = message.tokens.cache.write;
      }
      if (session.directory) {
        usage.projectPath = session.directory;
      }

      sessionUsageRows.push(usage);
    }

    sessionAggregateCache.set(session.id, {
      updatedAt: session.time.updated,
      usageRows: sessionUsageRows,
      lastAccessed: now,
    });

    sessions.push(...sessionUsageRows);
  }

  evictSessionAggregateCache();

  if (!options.sessionId) {
    sessionCache.lastCheck = Date.now();
    sessionCache.lastResult = sessions;
    sessionCache.lastLimit = limit;
    sessionCache.lastSince = options.since;
  }

  ctx.log.debug('JSON: parsed OpenCode sessions', {
    count: sessions.length,
    sessionFiles: sessionFiles.length,
    statChecks: statCount,
    statSkips: statSkipCount,
    jsonParses: parseCount,
    dirtyHits: dirtyHitCount,
    aggregateCacheHits,
    aggregateCacheMisses,
    metadataIndexSize: sessionMetadataIndex.size,
    aggregateCacheSize: sessionAggregateCache.size,
  });
  return sessions;
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

  startActivityWatch(callback: ActivityCallback): void {
    if (getDb()) {
      startActivityWatchSqlite(callback);
    } else {
      startActivityWatchJson(callback);
    }
  },

  stopActivityWatch(): void {
    stopActivityWatchSqlite();
    stopActivityWatchJson();
    closeDb();
  },

  async isInstalled(): Promise<boolean> {
    if (fsSync.existsSync(OPENCODE_DB_PATH)) return true;
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
    const sqliteResult = parseSessionsSqlite(options, ctx);
    if (sqliteResult.length > 0) return sqliteResult;

    return parseSessionsJson(options, ctx);
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
