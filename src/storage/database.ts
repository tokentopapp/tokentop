import { Database } from 'bun:sqlite';
import * as fs from 'fs/promises';
import { PATHS } from './paths.ts';

let db: Database | null = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  agent TEXT,
  session_id TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER DEFAULT 0,
  cache_write_tokens INTEGER DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0,
  project_path TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_usage_timestamp ON usage(timestamp);
CREATE INDEX IF NOT EXISTS idx_usage_provider ON usage(provider, timestamp);
CREATE INDEX IF NOT EXISTS idx_usage_model ON usage(model, timestamp);
CREATE INDEX IF NOT EXISTS idx_usage_agent ON usage(agent, timestamp);
CREATE INDEX IF NOT EXISTS idx_usage_session ON usage(session_id);

CREATE TABLE IF NOT EXISTS provider_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  provider TEXT NOT NULL,
  used_percent REAL,
  limit_reached INTEGER DEFAULT 0,
  tokens_input INTEGER,
  tokens_output INTEGER,
  cost_usd REAL,
  raw_json TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_snapshots_provider ON provider_snapshots(provider, timestamp);

CREATE TABLE IF NOT EXISTS daily_aggregates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT,
  total_input_tokens INTEGER NOT NULL DEFAULT 0,
  total_output_tokens INTEGER NOT NULL DEFAULT 0,
  total_cache_read INTEGER DEFAULT 0,
  total_cache_write INTEGER DEFAULT 0,
  total_cost_usd REAL NOT NULL DEFAULT 0,
  request_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE(date, provider, model)
);

CREATE INDEX IF NOT EXISTS idx_daily_date ON daily_aggregates(date);
CREATE INDEX IF NOT EXISTS idx_daily_provider ON daily_aggregates(provider, date);
`;

export async function initDatabase(): Promise<Database> {
  if (db) return db;

  await fs.mkdir(PATHS.data.dir, { recursive: true });

  db = new Database(PATHS.data.database, { create: true });
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA synchronous = NORMAL');
  db.exec(SCHEMA);

  return db;
}

export function getDatabase(): Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

export interface UsageRecord {
  timestamp: number;
  provider: string;
  model: string;
  agent?: string | undefined;
  sessionId?: string | undefined;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number | undefined;
  cacheWriteTokens?: number | undefined;
  costUsd: number;
  projectPath?: string | undefined;
}

export interface ProviderSnapshot {
  timestamp: number;
  provider: string;
  usedPercent?: number | undefined;
  limitReached?: boolean | undefined;
  tokensInput?: number | undefined;
  tokensOutput?: number | undefined;
  costUsd?: number | undefined;
  rawJson?: string | undefined;
}

export interface DailyAggregate {
  date: string;
  provider: string;
  model?: string | undefined;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheRead: number;
  totalCacheWrite: number;
  totalCostUsd: number;
  requestCount: number;
}

export interface UsageQuery {
  startTime?: number;
  endTime?: number;
  provider?: string;
  model?: string;
  agent?: string;
  sessionId?: string;
  limit?: number;
  offset?: number;
}

export function insertUsage(record: UsageRecord): void {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO usage (
      timestamp, provider, model, agent, session_id,
      input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
      cost_usd, project_path
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    record.timestamp,
    record.provider,
    record.model,
    record.agent ?? null,
    record.sessionId ?? null,
    record.inputTokens,
    record.outputTokens,
    record.cacheReadTokens ?? 0,
    record.cacheWriteTokens ?? 0,
    record.costUsd,
    record.projectPath ?? null
  );
}

export function insertUsageBatch(records: UsageRecord[]): void {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO usage (
      timestamp, provider, model, agent, session_id,
      input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
      cost_usd, project_path
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const transaction = db.transaction((records: UsageRecord[]) => {
    for (const record of records) {
      stmt.run(
        record.timestamp,
        record.provider,
        record.model,
        record.agent ?? null,
        record.sessionId ?? null,
        record.inputTokens,
        record.outputTokens,
        record.cacheReadTokens ?? 0,
        record.cacheWriteTokens ?? 0,
        record.costUsd,
        record.projectPath ?? null
      );
    }
  });

  transaction(records);
}

export function insertProviderSnapshot(snapshot: ProviderSnapshot): void {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO provider_snapshots (
      timestamp, provider, used_percent, limit_reached,
      tokens_input, tokens_output, cost_usd, raw_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    snapshot.timestamp,
    snapshot.provider,
    snapshot.usedPercent ?? null,
    snapshot.limitReached ? 1 : 0,
    snapshot.tokensInput ?? null,
    snapshot.tokensOutput ?? null,
    snapshot.costUsd ?? null,
    snapshot.rawJson ?? null
  );
}

export function queryUsage(query: UsageQuery): UsageRecord[] {
  const db = getDatabase();
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (query.startTime !== undefined) {
    conditions.push('timestamp >= ?');
    params.push(query.startTime);
  }
  if (query.endTime !== undefined) {
    conditions.push('timestamp <= ?');
    params.push(query.endTime);
  }
  if (query.provider) {
    conditions.push('provider = ?');
    params.push(query.provider);
  }
  if (query.model) {
    conditions.push('model = ?');
    params.push(query.model);
  }
  if (query.agent) {
    conditions.push('agent = ?');
    params.push(query.agent);
  }
  if (query.sessionId) {
    conditions.push('session_id = ?');
    params.push(query.sessionId);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limitClause = query.limit ? `LIMIT ${query.limit}` : '';
  const offsetClause = query.offset ? `OFFSET ${query.offset}` : '';

  const sql = `
    SELECT * FROM usage
    ${whereClause}
    ORDER BY timestamp DESC
    ${limitClause} ${offsetClause}
  `;

  const rows = db.prepare(sql).all(...params) as Array<{
    timestamp: number;
    provider: string;
    model: string;
    agent: string | null;
    session_id: string | null;
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    cache_write_tokens: number;
    cost_usd: number;
    project_path: string | null;
  }>;

  return rows.map((row) => ({
    timestamp: row.timestamp,
    provider: row.provider,
    model: row.model,
    agent: row.agent ?? undefined,
    sessionId: row.session_id ?? undefined,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    cacheReadTokens: row.cache_read_tokens,
    cacheWriteTokens: row.cache_write_tokens,
    costUsd: row.cost_usd,
    projectPath: row.project_path ?? undefined,
  }));
}

export interface UsageSummary {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheRead: number;
  totalCacheWrite: number;
  totalCost: number;
  requestCount: number;
}

export function getUsageSummary(startTime: number, endTime: number): UsageSummary {
  const db = getDatabase();
  const row = db.prepare(`
    SELECT
      COALESCE(SUM(input_tokens), 0) as total_input,
      COALESCE(SUM(output_tokens), 0) as total_output,
      COALESCE(SUM(cache_read_tokens), 0) as total_cache_read,
      COALESCE(SUM(cache_write_tokens), 0) as total_cache_write,
      COALESCE(SUM(cost_usd), 0) as total_cost,
      COUNT(*) as request_count
    FROM usage
    WHERE timestamp >= ? AND timestamp <= ?
  `).get(startTime, endTime) as {
    total_input: number;
    total_output: number;
    total_cache_read: number;
    total_cache_write: number;
    total_cost: number;
    request_count: number;
  };

  return {
    totalInputTokens: row.total_input,
    totalOutputTokens: row.total_output,
    totalCacheRead: row.total_cache_read,
    totalCacheWrite: row.total_cache_write,
    totalCost: row.total_cost,
    requestCount: row.request_count,
  };
}

export interface ProviderSummary {
  provider: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
  requestCount: number;
}

export function getUsageByProvider(startTime: number, endTime: number): ProviderSummary[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT
      provider,
      COALESCE(SUM(input_tokens), 0) as total_input,
      COALESCE(SUM(output_tokens), 0) as total_output,
      COALESCE(SUM(cost_usd), 0) as total_cost,
      COUNT(*) as request_count
    FROM usage
    WHERE timestamp >= ? AND timestamp <= ?
    GROUP BY provider
    ORDER BY total_cost DESC
  `).all(startTime, endTime) as Array<{
    provider: string;
    total_input: number;
    total_output: number;
    total_cost: number;
    request_count: number;
  }>;

  return rows.map((row) => ({
    provider: row.provider,
    totalInputTokens: row.total_input,
    totalOutputTokens: row.total_output,
    totalCost: row.total_cost,
    requestCount: row.request_count,
  }));
}

export interface ModelSummary {
  model: string;
  provider: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
  requestCount: number;
}

export function getUsageByModel(startTime: number, endTime: number): ModelSummary[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT
      model,
      provider,
      COALESCE(SUM(input_tokens), 0) as total_input,
      COALESCE(SUM(output_tokens), 0) as total_output,
      COALESCE(SUM(cost_usd), 0) as total_cost,
      COUNT(*) as request_count
    FROM usage
    WHERE timestamp >= ? AND timestamp <= ?
    GROUP BY model, provider
    ORDER BY total_cost DESC
  `).all(startTime, endTime) as Array<{
    model: string;
    provider: string;
    total_input: number;
    total_output: number;
    total_cost: number;
    request_count: number;
  }>;

  return rows.map((row) => ({
    model: row.model,
    provider: row.provider,
    totalInputTokens: row.total_input,
    totalOutputTokens: row.total_output,
    totalCost: row.total_cost,
    requestCount: row.request_count,
  }));
}

export interface TimeSeriesPoint {
  timestamp: number;
  totalTokens: number;
  totalCost: number;
  requestCount: number;
}

export function getUsageTimeSeries(
  startTime: number,
  endTime: number,
  bucketMinutes: number = 5
): TimeSeriesPoint[] {
  const db = getDatabase();
  const bucketSeconds = bucketMinutes * 60;

  const rows = db.prepare(`
    SELECT
      (timestamp / ? * ?) as bucket_time,
      COALESCE(SUM(input_tokens + output_tokens), 0) as total_tokens,
      COALESCE(SUM(cost_usd), 0) as total_cost,
      COUNT(*) as request_count
    FROM usage
    WHERE timestamp >= ? AND timestamp <= ?
    GROUP BY bucket_time
    ORDER BY bucket_time ASC
  `).all(bucketSeconds, bucketSeconds, startTime, endTime) as Array<{
    bucket_time: number;
    total_tokens: number;
    total_cost: number;
    request_count: number;
  }>;

  return rows.map((row) => ({
    timestamp: row.bucket_time,
    totalTokens: row.total_tokens,
    totalCost: row.total_cost,
    requestCount: row.request_count,
  }));
}

export function getProviderSnapshots(
  provider: string,
  startTime: number,
  endTime: number,
  limit: number = 100
): ProviderSnapshot[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT * FROM provider_snapshots
    WHERE provider = ? AND timestamp >= ? AND timestamp <= ?
    ORDER BY timestamp DESC
    LIMIT ?
  `).all(provider, startTime, endTime, limit) as Array<{
    timestamp: number;
    provider: string;
    used_percent: number | null;
    limit_reached: number;
    tokens_input: number | null;
    tokens_output: number | null;
    cost_usd: number | null;
    raw_json: string | null;
  }>;

  return rows.map((row) => ({
    timestamp: row.timestamp,
    provider: row.provider,
    usedPercent: row.used_percent ?? undefined,
    limitReached: row.limit_reached === 1,
    tokensInput: row.tokens_input ?? undefined,
    tokensOutput: row.tokens_output ?? undefined,
    costUsd: row.cost_usd ?? undefined,
    rawJson: row.raw_json ?? undefined,
  }));
}

export function upsertDailyAggregate(aggregate: DailyAggregate): void {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO daily_aggregates (
      date, provider, model,
      total_input_tokens, total_output_tokens,
      total_cache_read, total_cache_write,
      total_cost_usd, request_count
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(date, provider, model) DO UPDATE SET
      total_input_tokens = total_input_tokens + excluded.total_input_tokens,
      total_output_tokens = total_output_tokens + excluded.total_output_tokens,
      total_cache_read = total_cache_read + excluded.total_cache_read,
      total_cache_write = total_cache_write + excluded.total_cache_write,
      total_cost_usd = total_cost_usd + excluded.total_cost_usd,
      request_count = request_count + excluded.request_count
  `);

  stmt.run(
    aggregate.date,
    aggregate.provider,
    aggregate.model ?? null,
    aggregate.totalInputTokens,
    aggregate.totalOutputTokens,
    aggregate.totalCacheRead,
    aggregate.totalCacheWrite,
    aggregate.totalCostUsd,
    aggregate.requestCount
  );
}

export function getDailyAggregates(
  startDate: string,
  endDate: string,
  provider?: string
): DailyAggregate[] {
  const db = getDatabase();
  const conditions = ['date >= ?', 'date <= ?'];
  const params: string[] = [startDate, endDate];

  if (provider) {
    conditions.push('provider = ?');
    params.push(provider);
  }

  const rows = db.prepare(`
    SELECT * FROM daily_aggregates
    WHERE ${conditions.join(' AND ')}
    ORDER BY date DESC, total_cost_usd DESC
  `).all(...params) as Array<{
    date: string;
    provider: string;
    model: string | null;
    total_input_tokens: number;
    total_output_tokens: number;
    total_cache_read: number;
    total_cache_write: number;
    total_cost_usd: number;
    request_count: number;
  }>;

  return rows.map((row) => ({
    date: row.date,
    provider: row.provider,
    model: row.model ?? undefined,
    totalInputTokens: row.total_input_tokens,
    totalOutputTokens: row.total_output_tokens,
    totalCacheRead: row.total_cache_read,
    totalCacheWrite: row.total_cache_write,
    totalCostUsd: row.total_cost_usd,
    requestCount: row.request_count,
  }));
}

export function getTodaySummary(): UsageSummary {
  const now = Date.now();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  return getUsageSummary(startOfDay.getTime(), now);
}

export function getThisMonthSummary(): UsageSummary {
  const now = Date.now();
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  return getUsageSummary(startOfMonth.getTime(), now);
}
