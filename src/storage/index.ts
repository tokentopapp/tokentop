export { PATHS } from './paths.ts';

export {
  initDatabase,
  getDatabase,
  closeDatabase,
  isDatabaseInitialized,
  getAppRunId,
} from './db.ts';

export {
  insertProviderSnapshot,
  insertProviderSnapshotBatch,
  queryProviderSnapshots,
  getLatestProviderSnapshot,
} from './repos/providerSnapshots.ts';

export {
  insertUsageEvent,
  insertUsageEventBatch,
  queryUsageTimeSeries,
  calculateBurnRate,
  getTotalUsageInWindow,
  getSessionActivityTimeline,
} from './repos/usageEvents.ts';

export type { SessionActivityPoint } from './repos/usageEvents.ts';

export {
  upsertAgentSession,
  insertAgentSessionSnapshot,
  getAgentSession,
  getRecentSessions,
  getSessionsByProject,
  getLatestStreamTotalsForAllSessions,
} from './repos/agentSessions.ts';

export type { LatestStreamTotals } from './repos/agentSessions.ts';

export type {
  UsageEventSource,
  SessionStatus,
  CostSource,
  PricingSource,
  AppRunRow,
  ProviderSnapshotRow,
  ProviderSnapshotInsert,
  AgentSessionDim,
  AgentSessionUpsert,
  AgentSessionSnapshotRow,
  AgentSessionSnapshotInsert,
  AgentSessionStreamSnapshotRow,
  UsageEventRow,
  UsageEventInsert,
  HourlyAggregateRow,
  DailyAggregateRow,
  TimeSeriesPoint,
  TimeSeriesFilters,
  UsageQueryOptions,
  StreamTotals,
} from './types.ts';

export { computeStreamDelta } from './types.ts';
