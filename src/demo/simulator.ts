import type { ProviderUsageData } from "@tokentop/plugin-sdk";
import type {
  AgentSessionAggregate,
  AgentSessionStream,
  StreamCostBreakdown,
  StreamWindowedTokens,
  TokenCounts,
} from "@/agents/types.ts";
import type { UsageEventInsert } from "@/storage/types.ts";

/**
 * Demo presets control the intensity of simulated activity.
 * - light: ~50 sessions, low variety, sparse activity
 * - normal: ~500 sessions, moderate variety, balanced simulation (default)
 * - heavy: ~4000 sessions, wide model/project variety, bursty activity
 *
 * All generation is deterministic on (seed, preset): identical session ids,
 * counts, tokens, costs, project paths for every run at the same seed.
 */
export type DemoPreset = "light" | "normal" | "heavy";

export interface DemoPresetConfig {
  sessionCount: number;
  activityMultiplier: number;
  extraProviderCount: number;
  usageRange: [number, number];
  idleProbability: number;
  burstProbability: number;
  burstMultiplier: number;
  tokenScale: number;
  historicalDailyCostBase: number;
}

export const DEMO_PRESETS: Record<DemoPreset, DemoPresetConfig> = {
  light: {
    sessionCount: 50,
    activityMultiplier: 0.5,
    extraProviderCount: 1,
    usageRange: [5, 35],
    idleProbability: 0.6,
    burstProbability: 0.05,
    burstMultiplier: 3,
    tokenScale: 150,
    historicalDailyCostBase: 2,
  },
  normal: {
    sessionCount: 500,
    activityMultiplier: 1.0,
    extraProviderCount: 3,
    usageRange: [8, 72],
    idleProbability: 0.35,
    burstProbability: 0.1,
    burstMultiplier: 4,
    tokenScale: 250,
    historicalDailyCostBase: 15,
  },
  heavy: {
    sessionCount: 4000,
    activityMultiplier: 2.0,
    extraProviderCount: 10,
    usageRange: [25, 95],
    idleProbability: 0.15,
    burstProbability: 0.2,
    burstMultiplier: 5,
    tokenScale: 400,
    historicalDailyCostBase: 55,
  },
};

type AgentKey = "opencode" | "claude-code" | "cursor" | "copilot-cli" | "gemini-cli";
type AgentName = "OpenCode" | "Claude Code" | "Cursor" | "Copilot CLI" | "Gemini CLI";

interface ModelConfig {
  providerId: string;
  modelId: string;
  inputRate: number;
  outputRate: number;
  cacheReadRate?: number;
  cacheWriteRate?: number;
  weight: number;
}

const MODEL_POOL: ModelConfig[] = [
  {
    providerId: "anthropic",
    modelId: "claude-opus-4-7",
    inputRate: 15,
    outputRate: 75,
    cacheReadRate: 1.5,
    cacheWriteRate: 18.75,
    weight: 90,
  },
  {
    providerId: "anthropic",
    modelId: "claude-sonnet-4-20250514",
    inputRate: 3,
    outputRate: 15,
    cacheReadRate: 0.3,
    cacheWriteRate: 3.75,
    weight: 45,
  },
  {
    providerId: "xai",
    modelId: "grok-code-fast-1",
    inputRate: 0.2,
    outputRate: 1.5,
    weight: 38,
  },
  {
    providerId: "anthropic",
    modelId: "claude-3-5-sonnet-20241022",
    inputRate: 3,
    outputRate: 15,
    cacheReadRate: 0.3,
    cacheWriteRate: 3.75,
    weight: 30,
  },
  {
    providerId: "openai",
    modelId: "gpt-4.1",
    inputRate: 2,
    outputRate: 8,
    cacheReadRate: 0.5,
    weight: 22,
  },
  {
    providerId: "google-gemini",
    modelId: "gemini-2.5-pro",
    inputRate: 1.25,
    outputRate: 10,
    weight: 18,
  },
  {
    providerId: "anthropic",
    modelId: "claude-3-5-haiku-20241022",
    inputRate: 0.8,
    outputRate: 4,
    cacheReadRate: 0.08,
    cacheWriteRate: 1,
    weight: 15,
  },
  { providerId: "minimax", modelId: "minimax-m2.5-free", inputRate: 0, outputRate: 0, weight: 14 },
  {
    providerId: "anthropic",
    modelId: "claude-3-7-sonnet-20250219",
    inputRate: 3,
    outputRate: 15,
    cacheReadRate: 0.3,
    cacheWriteRate: 3.75,
    weight: 12,
  },
  {
    providerId: "openai",
    modelId: "gpt-4.1-mini",
    inputRate: 0.4,
    outputRate: 1.6,
    cacheReadRate: 0.1,
    weight: 11,
  },
  {
    providerId: "google-gemini",
    modelId: "gemini-3-pro-preview",
    inputRate: 2,
    outputRate: 12,
    cacheReadRate: 0.2,
    weight: 10,
  },
  {
    providerId: "openai",
    modelId: "gpt-4o",
    inputRate: 2.5,
    outputRate: 10,
    cacheReadRate: 1.25,
    weight: 9,
  },
  {
    providerId: "google-gemini",
    modelId: "gemini-2.5-flash",
    inputRate: 0.15,
    outputRate: 0.6,
    weight: 8,
  },
  { providerId: "openai", modelId: "o3", inputRate: 10, outputRate: 40, weight: 7 },
  { providerId: "openai", modelId: "o4-mini", inputRate: 1.1, outputRate: 4.4, weight: 6 },
  {
    providerId: "anthropic",
    modelId: "claude-3-opus-20240229",
    inputRate: 15,
    outputRate: 75,
    cacheReadRate: 1.5,
    cacheWriteRate: 18.75,
    weight: 5,
  },
  {
    providerId: "google-gemini",
    modelId: "gemini-3-flash-preview",
    inputRate: 0.5,
    outputRate: 3,
    cacheReadRate: 0.05,
    weight: 5,
  },
  {
    providerId: "openai",
    modelId: "gpt-4o-mini",
    inputRate: 0.15,
    outputRate: 0.6,
    cacheReadRate: 0.075,
    weight: 4,
  },
  {
    providerId: "google-gemini",
    modelId: "gemini-3.1-pro-preview",
    inputRate: 2,
    outputRate: 12,
    cacheReadRate: 0.2,
    weight: 3,
  },
  {
    providerId: "github-copilot",
    modelId: "claude-sonnet-4-copilot",
    inputRate: 0,
    outputRate: 0,
    weight: 3,
  },
  { providerId: "openai", modelId: "o3-mini", inputRate: 1.1, outputRate: 4.4, weight: 2 },
];

interface AgentConfig {
  id: AgentKey;
  name: AgentName;
  weight: number;
  allowedProviders?: Set<string>;
}

const AGENT_POOL: AgentConfig[] = [
  { id: "opencode", name: "OpenCode", weight: 55 },
  {
    id: "claude-code",
    name: "Claude Code",
    weight: 20,
    allowedProviders: new Set(["anthropic"]),
  },
  { id: "cursor", name: "Cursor", weight: 10 },
  {
    id: "copilot-cli",
    name: "Copilot CLI",
    weight: 8,
    allowedProviders: new Set(["github-copilot", "anthropic", "openai"]),
  },
  {
    id: "gemini-cli",
    name: "Gemini CLI",
    weight: 7,
    allowedProviders: new Set(["google-gemini"]),
  },
];

interface ProjectConfig {
  path: string;
  weight: number;
}

const PROJECT_POOL: ProjectConfig[] = [
  { path: "/Users/demo/workspace/tokentop", weight: 35 },
  { path: "/Users/demo/workspace/webapp", weight: 20 },
  { path: "/Users/demo/workspace/infra", weight: 14 },
  { path: "/Users/demo/workspace/mobile", weight: 11 },
  { path: "/Users/demo/workspace/docs-site", weight: 8 },
  { path: "/Users/demo/workspace/ml-pipeline", weight: 7 },
  { path: "/Users/demo/workspace/auth-service", weight: 6 },
  { path: "/Users/demo/workspace/design-system", weight: 5 },
  { path: "/Users/demo/workspace/notifications-service", weight: 5 },
  { path: "/Users/demo/workspace/data-platform", weight: 4 },
  { path: "/Users/demo/workspace/legacy-api", weight: 3 },
  { path: "/Users/demo/workspace/playground", weight: 2 },
];

const SESSION_NAME_VERBS = [
  "Implement",
  "Fix",
  "Refactor",
  "Add",
  "Remove",
  "Update",
  "Migrate",
  "Optimize",
  "Debug",
  "Review",
  "Investigate",
  "Design",
  "Prototype",
  "Test",
  "Ship",
  "Rewrite",
  "Document",
];
const SESSION_NAME_SUBJECTS = [
  "authentication flow",
  "user dashboard",
  "caching layer",
  "API pagination",
  "rate limiting",
  "error handling",
  "database schema",
  "CI pipeline",
  "deployment config",
  "observability stack",
  "feature flags",
  "type definitions",
  "onboarding wizard",
  "settings page",
  "webhook handler",
  "billing integration",
  "search index",
  "notification system",
  "audit log",
  "data migration script",
  "component library",
  "theme tokens",
  "analytics tracker",
  "session store",
  "oauth callback",
  "permissions model",
  "export pipeline",
  "rollout telemetry",
  "plugin loader",
  "credential discovery",
  "snapshot regression",
];

const PROVIDER_LIMITS: Record<string, { label: string; windowMinutes: number }> = {
  anthropic: { label: "Daily Tokens", windowMinutes: 1440 },
  openai: { label: "Daily Tokens", windowMinutes: 1440 },
  "google-gemini": { label: "Daily Tokens", windowMinutes: 1440 },
  xai: { label: "Daily Tokens", windowMinutes: 1440 },
  minimax: { label: "Daily Tokens", windowMinutes: 1440 },
  "github-copilot": { label: "Monthly Tokens", windowMinutes: 43200 },
};

const EXTRA_PROVIDERS: Array<{ id: string; label: string; balance?: string }> = [
  { id: "codex", label: "ChatGPT Plus", balance: "$18.00" },
  { id: "github-copilot", label: "Copilot Pro", balance: "$26.00" },
  { id: "perplexity", label: "Perplexity Pro", balance: "$12.50" },
  { id: "antigravity", label: "Antigravity AI", balance: "$31.00" },
  { id: "minimax", label: "MiniMax", balance: "$22.00" },
  { id: "cohere", label: "Cohere Enterprise", balance: "$45.00" },
  { id: "mistral", label: "Mistral API", balance: "$15.00" },
  { id: "groq", label: "Groq Cloud", balance: "$8.50" },
  { id: "together", label: "Together AI", balance: "$20.00" },
  { id: "fireworks", label: "Fireworks AI", balance: "$12.00" },
];

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const HISTORICAL_WINDOW_MS = 30 * MS_PER_DAY;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function hashCombine(a: number, b: number): number {
  return ((a * 2654435761) ^ (b * 1597334677)) >>> 0;
}

function roundCost(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function totalTokens(tokens: TokenCounts): number {
  return tokens.input + (tokens.cacheRead ?? 0) + (tokens.cacheWrite ?? 0) + tokens.output;
}

class DemoRng {
  private seed: number;
  private initialSeed: number;

  constructor(seed = 1337) {
    this.initialSeed = seed;
    this.seed = seed;
  }

  next(): number {
    this.seed = (this.seed * 1664525 + 1013904223) % 4294967296;
    return this.seed / 4294967296;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  getSeed(): number {
    return this.initialSeed;
  }

  fork(offset: number): DemoRng {
    return new DemoRng(hashCombine(this.initialSeed, offset));
  }
}

function pickWeighted<T extends { weight: number }>(rng: DemoRng, items: T[]): T {
  let total = 0;
  for (const item of items) total += item.weight;
  let r = rng.next() * total;
  for (const item of items) {
    r -= item.weight;
    if (r <= 0) return item;
  }
  return items[items.length - 1]!;
}

function pickAgent(rng: DemoRng): AgentConfig {
  return pickWeighted(rng, AGENT_POOL);
}

function pickModelForAgent(rng: DemoRng, agent: AgentConfig): ModelConfig {
  const allowed = agent.allowedProviders
    ? MODEL_POOL.filter((m) => agent.allowedProviders!.has(m.providerId))
    : MODEL_POOL;
  return pickWeighted(rng, allowed);
}

function pickProject(rng: DemoRng): ProjectConfig {
  return pickWeighted(rng, PROJECT_POOL);
}

function pickSessionName(rng: DemoRng): string {
  const verbIndex = Math.floor(rng.next() * SESSION_NAME_VERBS.length);
  const subjectIndex = Math.floor(rng.next() * SESSION_NAME_SUBJECTS.length);
  return `${SESSION_NAME_VERBS[verbIndex]} ${SESSION_NAME_SUBJECTS[subjectIndex]}`;
}

function paretoBounded(rng: DemoRng, scale: number, alpha: number, maxValue: number): number {
  const u = clamp(rng.next(), 1e-6, 1 - 1e-6);
  const draw = scale * (1 - u) ** (-1 / alpha);
  return Math.min(maxValue, draw);
}

interface GeneratedSession {
  aggregate: AgentSessionAggregate;
  isActive: boolean;
}

function buildSession(
  index: number,
  parentRng: DemoRng,
  preset: DemoPreset,
  presetConfig: DemoPresetConfig,
  now: number,
  isActive: boolean,
  anchors: {
    startOfDay: number;
    startOfWeek: number;
    startOfMonth: number;
  },
): GeneratedSession {
  const rng = parentRng.fork(index);

  const agent = pickAgent(rng);
  const model = pickModelForAgent(rng, agent);
  const project = pickProject(rng);
  const sessionName = pickSessionName(rng);

  let startedAt: number;
  let lastActivityAt: number;
  let endedAt: number | undefined;

  if (isActive) {
    startedAt = now - rng.range(5, 120) * 60 * 1000;
    lastActivityAt = now - Math.floor(rng.range(0, 55) * 1000);
  } else {
    // Recency-biased spread over 30d: u^1.8 concentrates near 0 (recent), tail to 30d.
    const recencyBias = rng.next() ** 1.8;
    const minAgeMs = 2 * 60 * 1000;
    const ageMs = minAgeMs + recencyBias * (HISTORICAL_WINDOW_MS - minAgeMs);
    const durationMs = rng.range(30 * 1000, 45 * 60 * 1000);
    lastActivityAt = now - ageMs;
    startedAt = lastActivityAt - durationMs;
    endedAt = lastActivityAt;
  }

  const baseTokens = Math.floor(paretoBounded(rng, presetConfig.tokenScale, 1.35, 600_000));
  const inputTokens = Math.max(1, Math.floor(baseTokens * rng.range(0.55, 0.8)));
  const outputTokens = Math.max(1, baseTokens - inputTokens);

  const longContextRoll = rng.next();
  const hasLongContext = preset !== "light" && baseTokens > 4_000 && longContextRoll < 0.18;
  const longContextTokens: TokenCounts | undefined = hasLongContext
    ? {
        input: 180_000 + Math.floor(rng.range(0, 120_000)),
        output: 2_500 + Math.floor(rng.range(0, 9_500)),
      }
    : undefined;

  const cacheReadTokens = Math.floor(rng.next() < 0.6 ? baseTokens * rng.range(0, 3) : 0);
  const cacheWriteTokens = Math.floor(cacheReadTokens * rng.range(0.08, 0.25));

  const inputCost = (inputTokens / 1_000_000) * model.inputRate;
  const outputCost = (outputTokens / 1_000_000) * model.outputRate;
  const cacheReadCost = (cacheReadTokens / 1_000_000) * (model.cacheReadRate ?? 0);
  const cacheWriteCost = (cacheWriteTokens / 1_000_000) * (model.cacheWriteRate ?? 0);
  const longCtxInputCost = longContextTokens
    ? (longContextTokens.input / 1_000_000) * model.inputRate * 2
    : 0;
  const longCtxOutputCost = longContextTokens
    ? (longContextTokens.output / 1_000_000) * model.outputRate * 2
    : 0;

  const totalCost = roundCost(
    inputCost + outputCost + cacheReadCost + cacheWriteCost + longCtxInputCost + longCtxOutputCost,
  );

  const breakdown: StreamCostBreakdown = {
    total: totalCost,
    input: roundCost(inputCost + longCtxInputCost),
    output: roundCost(outputCost + longCtxOutputCost),
  };
  if (cacheReadTokens > 0) breakdown.cacheRead = roundCost(cacheReadCost);
  if (cacheWriteTokens > 0) breakdown.cacheWrite = roundCost(cacheWriteCost);

  const requestCount = Math.max(1, Math.floor((inputTokens + outputTokens) / rng.range(650, 1400)));
  const longContextRequestCount = hasLongContext ? 1 : 0;

  const totalsInput = hasLongContext ? inputTokens + (longContextTokens?.input ?? 0) : inputTokens;
  const totalsOutput = hasLongContext
    ? outputTokens + (longContextTokens?.output ?? 0)
    : outputTokens;

  const totals: TokenCounts = {
    input: totalsInput,
    output: totalsOutput,
  };
  if (cacheReadTokens > 0) totals.cacheRead = cacheReadTokens;
  if (cacheWriteTokens > 0) totals.cacheWrite = cacheWriteTokens;

  const stream: AgentSessionStream = {
    providerId: model.providerId,
    modelId: model.modelId,
    tokens: { input: inputTokens, output: outputTokens },
    requestCount: requestCount + longContextRequestCount,
    costUsd: totalCost,
    costBreakdown: breakdown,
    pricingSource: "fallback",
  };
  if (hasLongContext && longContextTokens) {
    stream.longContextTokens = longContextTokens;
    stream.longContextRequestCount = longContextRequestCount;
    stream.hasLongContext = true;
  }

  const windowedBase = totalTokens({ input: inputTokens, output: outputTokens });
  const longContextTotalTokens = longContextTokens ? totalTokens(longContextTokens) : 0;
  const windowedTokens: StreamWindowedTokens = {
    dayTokens: lastActivityAt >= anchors.startOfDay ? windowedBase : 0,
    weekTokens: lastActivityAt >= anchors.startOfWeek ? windowedBase : 0,
    monthTokens: lastActivityAt >= anchors.startOfMonth ? windowedBase : 0,
    totalTokens: windowedBase,
  };
  if (longContextTotalTokens > 0) {
    windowedTokens.longContextDayTokens =
      lastActivityAt >= anchors.startOfDay ? longContextTotalTokens : 0;
    windowedTokens.longContextWeekTokens =
      lastActivityAt >= anchors.startOfWeek ? longContextTotalTokens : 0;
    windowedTokens.longContextMonthTokens =
      lastActivityAt >= anchors.startOfMonth ? longContextTotalTokens : 0;
    windowedTokens.longContextTotalTokens = longContextTotalTokens;
  }

  const costInDay = lastActivityAt >= anchors.startOfDay ? totalCost : 0;
  const costInWeek = lastActivityAt >= anchors.startOfWeek ? totalCost : 0;
  const costInMonth = lastActivityAt >= anchors.startOfMonth ? totalCost : 0;

  const status: "active" | "idle" = isActive ? (index % 3 === 0 ? "idle" : "active") : "idle";

  const sessionId = `demo-${agent.id}-${String(index).padStart(5, "0")}`;

  const aggregate: AgentSessionAggregate = {
    sessionId,
    sessionName,
    agentId: agent.id,
    agentName: agent.name,
    projectPath: project.path,
    startedAt,
    lastActivityAt,
    status,
    totals,
    totalCostUsd: totalCost,
    requestCount: requestCount + longContextRequestCount,
    streams: [stream],
    costInDay,
    costInWeek,
    costInMonth,
    _streamWindowedTokens: new Map([[`${model.providerId}::${model.modelId}`, windowedTokens]]),
  };
  if (endedAt !== undefined) {
    aggregate.endedAt = endedAt;
  }

  return { aggregate, isActive };
}

function computeTimeAnchors(now: number): {
  startOfDay: number;
  startOfWeek: number;
  startOfMonth: number;
} {
  const d = new Date(now);
  const startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const startOfWeek = new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay()).getTime();
  const startOfMonth = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  return { startOfDay, startOfWeek, startOfMonth };
}

export interface DemoSimulatorSnapshot {
  sessions: AgentSessionAggregate[];
  providerUsage: Map<string, ProviderUsageData>;
  usageEvents: UsageEventInsert[];
}

export interface DemoSimulatorOptions {
  seed?: number;
  preset?: DemoPreset;
}

export class DemoSimulator {
  private rng: DemoRng;
  private activeSessions: AgentSessionAggregate[];
  private readonly historicalSessions: AgentSessionAggregate[];
  private providerUsage: Map<string, ProviderUsageData>;
  private lastTick: number;
  private readonly startTime: number;
  private readonly preset: DemoPreset;
  private readonly presetConfig: DemoPresetConfig;
  private readonly fixedProviderIds: string[];
  private readonly fixedExtraProviders: Array<{ id: string; label: string; balance?: string }>;

  constructor(options: DemoSimulatorOptions = {}) {
    const seed = options.seed ?? 1337;
    this.preset = options.preset ?? "normal";
    this.presetConfig = DEMO_PRESETS[this.preset];
    this.rng = new DemoRng(seed);
    const now = Date.now();
    this.startTime = now;
    this.lastTick = now;

    const anchors = computeTimeAnchors(now);
    const sessionCount = this.presetConfig.sessionCount;
    // Keep 4–8 truly active sessions regardless of preset scale so the
    // burn-rate / sparkline feedback loops still animate on tick().
    const activeCount = clamp(
      4 + Math.floor(this.presetConfig.activityMultiplier * 2),
      4,
      Math.min(8, sessionCount),
    );

    const genRng = this.rng.fork(1);
    const active: AgentSessionAggregate[] = [];
    const historical: AgentSessionAggregate[] = [];

    for (let i = 0; i < sessionCount; i++) {
      const isActive = i < activeCount;
      const { aggregate } = buildSession(
        i,
        genRng,
        this.preset,
        this.presetConfig,
        now,
        isActive,
        anchors,
      );
      if (isActive) active.push(aggregate);
      else historical.push(aggregate);
    }

    this.activeSessions = active;
    this.historicalSessions = historical;

    const providerIds = new Set<string>();
    for (const session of this.getAllSessions()) {
      for (const stream of session.streams) providerIds.add(stream.providerId);
    }
    this.fixedProviderIds = Array.from(providerIds);

    const extraCount = Math.min(this.presetConfig.extraProviderCount, EXTRA_PROVIDERS.length);
    this.fixedExtraProviders = EXTRA_PROVIDERS.slice(0, extraCount).filter(
      (p) => !providerIds.has(p.id),
    );

    this.providerUsage = new Map();
    this.initializeProviderUsage(now);
  }

  private getAllSessions(): AgentSessionAggregate[] {
    return [...this.activeSessions, ...this.historicalSessions];
  }

  private aggregateProviderTotals(): Map<
    string,
    { tokens: number; cost: number; requests: number }
  > {
    const totals = new Map<string, { tokens: number; cost: number; requests: number }>();
    for (const session of this.getAllSessions()) {
      for (const stream of session.streams) {
        const current = totals.get(stream.providerId) ?? { tokens: 0, cost: 0, requests: 0 };
        const streamTokens = stream.tokens.input + stream.tokens.output;
        totals.set(stream.providerId, {
          tokens: current.tokens + streamTokens,
          cost: current.cost + (stream.costUsd ?? 0),
          requests: current.requests + stream.requestCount,
        });
      }
    }
    return totals;
  }

  private initializeProviderUsage(now: number) {
    const providerTotals = this.aggregateProviderTotals();

    for (const providerId of this.fixedProviderIds) {
      const totals = providerTotals.get(providerId) ?? { tokens: 0, cost: 0, requests: 0 };
      const limit = PROVIDER_LIMITS[providerId] ?? { label: "Daily Tokens", windowMinutes: 1440 };
      // Scale the "used %" relative to preset so heavy looks busy but never maxed by default.
      const scaleDivisor = this.presetConfig.sessionCount * 12_000;
      const usedPercent = clamp((totals.tokens / scaleDivisor) * 100, 5, 98);
      const limitReached = usedPercent > 95;

      this.providerUsage.set(providerId, {
        planType: "Pro",
        limitReached,
        limits: {
          primary: {
            usedPercent,
            label: limit.label,
            windowMinutes: limit.windowMinutes,
            resetsAt: now + 6 * 60 * 60 * 1000,
          },
        },
        tokens: {
          input: Math.floor(totals.tokens * 0.6),
          output: Math.floor(totals.tokens * 0.4),
          cacheRead: Math.floor(totals.tokens * 0.05),
          cacheWrite: Math.floor(totals.tokens * 0.02),
        },
        cost: {
          actual: {
            total: totals.cost,
            input: totals.cost * 0.55,
            output: totals.cost * 0.45,
            currency: "USD",
          },
          source: "estimated",
        },
        credits: {
          hasCredits: true,
          unlimited: false,
          balance: "$42.50",
        },
        fetchedAt: now,
      });
    }

    const [minUsage, maxUsage] = this.presetConfig.usageRange;
    const extraRng = this.rng.fork(2);
    for (const provider of this.fixedExtraProviders) {
      const usedPercent = clamp(extraRng.range(minUsage, maxUsage), 5, 98);
      this.providerUsage.set(provider.id, {
        planType: provider.label,
        limitReached: usedPercent > 95,
        limits: {
          primary: {
            usedPercent,
            label: "Monthly Tokens",
            windowMinutes: 43200,
            resetsAt: now + 10 * 24 * 60 * 60 * 1000,
          },
        },
        tokens: {
          input: Math.floor(usedPercent * 800),
          output: Math.floor(usedPercent * 600),
        },
        cost: {
          estimated: {
            total: usedPercent * 0.08,
            input: usedPercent * 0.04,
            output: usedPercent * 0.04,
            currency: "USD",
          },
          source: "estimated",
        },
        credits: {
          hasCredits: true,
          unlimited: false,
          balance: provider.balance ?? "$25.00",
        },
        fetchedAt: now,
      });
    }
  }

  private updateProviderUsage(now: number, tickRng: DemoRng) {
    const providerTotals = this.aggregateProviderTotals();

    for (const providerId of this.fixedProviderIds) {
      const totals = providerTotals.get(providerId) ?? { tokens: 0, cost: 0, requests: 0 };
      const limit = PROVIDER_LIMITS[providerId] ?? { label: "Daily Tokens", windowMinutes: 1440 };
      const scaleDivisor = this.presetConfig.sessionCount * 12_000;
      const usedPercent = clamp((totals.tokens / scaleDivisor) * 100, 5, 98);
      const limitReached = usedPercent > 95;

      const existing = this.providerUsage.get(providerId);
      this.providerUsage.set(providerId, {
        planType: existing?.planType ?? "Pro",
        limitReached,
        limits: {
          primary: {
            usedPercent,
            label: limit.label,
            windowMinutes: limit.windowMinutes,
            resetsAt: existing?.limits?.primary?.resetsAt ?? now + 6 * 60 * 60 * 1000,
          },
        },
        tokens: {
          input: Math.floor(totals.tokens * 0.6),
          output: Math.floor(totals.tokens * 0.4),
          cacheRead: Math.floor(totals.tokens * 0.05),
          cacheWrite: Math.floor(totals.tokens * 0.02),
        },
        cost: {
          actual: {
            total: totals.cost,
            input: totals.cost * 0.55,
            output: totals.cost * 0.45,
            currency: "USD",
          },
          source: "estimated",
        },
        credits: existing?.credits ?? {
          hasCredits: true,
          unlimited: false,
          balance: "$42.50",
        },
        fetchedAt: now,
      });
    }

    for (const provider of this.fixedExtraProviders) {
      const existing = this.providerUsage.get(provider.id);
      if (!existing) continue;

      const currentPercent = existing.limits?.primary?.usedPercent ?? 50;
      const delta = tickRng.range(0.1, 0.5) * this.presetConfig.activityMultiplier;
      const newPercent = clamp(currentPercent + delta, 5, 98);

      this.providerUsage.set(provider.id, {
        ...existing,
        limitReached: newPercent > 95,
        limits: {
          primary: {
            ...existing.limits?.primary,
            usedPercent: newPercent,
          },
        },
        tokens: {
          input: Math.floor(newPercent * 800),
          output: Math.floor(newPercent * 600),
        },
        cost: {
          estimated: {
            total: newPercent * 0.08,
            input: newPercent * 0.04,
            output: newPercent * 0.04,
            currency: "USD",
          },
          source: "estimated",
        },
        fetchedAt: now,
      });
    }
  }

  tick(now = Date.now()): DemoSimulatorSnapshot {
    const dtSec = Math.max((now - this.lastTick) / 1000, 1);
    this.lastTick = now;

    const elapsedSec = Math.floor((now - this.startTime) / 1000);
    const tickRng = this.rng.fork(elapsedSec);

    const usageEvents: UsageEventInsert[] = [];
    const activityMultiplier = this.presetConfig.activityMultiplier;

    this.activeSessions = this.activeSessions.map((session, sessionIndex) => {
      const sessionRng = tickRng.fork(sessionIndex);
      const isIdle = sessionRng.next() < this.presetConfig.idleProbability;
      if (isIdle) {
        return { ...session, status: "idle" as const };
      }

      const isBurst = sessionRng.next() < this.presetConfig.burstProbability;
      const burstFactor = isBurst ? this.presetConfig.burstMultiplier : 1;
      const activityFactor = sessionRng.range(0.4, 1.6) * burstFactor;
      const tokensPerSec =
        session.agentId === "opencode" ? 35 : session.agentId === "claude-code" ? 28 : 22;
      const deltaTokens = Math.floor(tokensPerSec * activityFactor * activityMultiplier * dtSec);
      if (deltaTokens === 0) {
        return { ...session, status: "idle" as const };
      }
      const inputDelta = Math.floor(deltaTokens * 0.6);
      const outputDelta = deltaTokens - inputDelta;
      const costDelta = deltaTokens * 0.000015;

      const updatedStreams = session.streams.map((stream) => ({
        ...stream,
        tokens: {
          ...stream.tokens,
          input: stream.tokens.input + inputDelta,
          output: stream.tokens.output + outputDelta,
        },
        requestCount: stream.requestCount + Math.max(1, Math.floor(deltaTokens / 750)),
        costUsd: (stream.costUsd ?? 0) + costDelta,
      }));

      usageEvents.push({
        timestamp: now,
        source: "agent",
        provider: updatedStreams[0]?.providerId ?? "anthropic",
        model: updatedStreams[0]?.modelId ?? "claude-3-5-sonnet",
        agentId: session.agentId,
        sessionId: session.sessionId,
        projectPath: session.projectPath ?? null,
        inputTokens: inputDelta,
        outputTokens: outputDelta,
        cacheReadTokens: Math.floor(deltaTokens * 0.05),
        cacheWriteTokens: Math.floor(deltaTokens * 0.02),
        costUsd: costDelta,
        requestCount: Math.max(1, Math.floor(deltaTokens / 700)),
        pricingSource: "fallback",
      });

      return {
        ...session,
        status: "active" as const,
        lastActivityAt: now,
        totals: {
          ...session.totals,
          input: session.totals.input + inputDelta,
          output: session.totals.output + outputDelta,
        },
        totalCostUsd: (session.totalCostUsd ?? 0) + costDelta,
        requestCount: session.requestCount + Math.max(1, Math.floor(deltaTokens / 700)),
        streams: updatedStreams,
        costInDay: session.costInDay + costDelta,
        costInWeek: session.costInWeek + costDelta,
        costInMonth: session.costInMonth + costDelta,
      } satisfies AgentSessionAggregate;
    });

    this.updateProviderUsage(now, tickRng);

    return {
      sessions: [...this.activeSessions, ...this.historicalSessions],
      providerUsage: new Map(this.providerUsage),
      usageEvents,
    };
  }

  getSeed(): number {
    return this.rng.getSeed();
  }

  getPreset(): DemoPreset {
    return this.preset;
  }

  getProviderIds(): string[] {
    return [...this.fixedProviderIds, ...this.fixedExtraProviders.map((p) => p.id)];
  }

  generateHistoricalCostDataByProvider(
    daysBack: number,
  ): Array<{ date: number; provider: string; cost: number; tokens: number; requests: number }> {
    const totalDaily = this.generateHistoricalCostData(daysBack);
    const result: Array<{
      date: number;
      provider: string;
      cost: number;
      tokens: number;
      requests: number;
    }> = [];

    const providerShares: Array<{ id: string; share: number }> = [
      { id: "anthropic", share: 0.55 },
      { id: "openai", share: 0.18 },
      { id: "google-gemini", share: 0.12 },
      { id: "xai", share: 0.06 },
      { id: "github-copilot", share: 0.05 },
      { id: "minimax", share: 0.04 },
    ];

    const providerRng = this.rng.fork(88888);

    for (let i = 0; i < totalDaily.length; i++) {
      const day = totalDaily[i]!;
      const dayRng = providerRng.fork(i);

      let remainingCost = day.cost;

      for (const provider of providerShares) {
        const variance = dayRng.range(0.8, 1.2);
        const cost = Math.round(day.cost * provider.share * variance * 100) / 100;
        const actualCost = Math.min(Math.max(cost, 0), remainingCost);
        remainingCost -= actualCost;

        const tokensPerDollar = dayRng.range(15000, 25000);
        const requestsPerDollar = dayRng.range(8, 15);

        result.push({
          date: day.date,
          provider: provider.id,
          cost: actualCost,
          tokens: Math.floor(actualCost * tokensPerDollar),
          requests: Math.floor(actualCost * requestsPerDollar),
        });
      }
    }

    return result;
  }

  generateHistoricalCostDataByModel(
    daysBack: number,
  ): Array<{ date: number; model: string; cost: number; tokens: number; requests: number }> {
    const totalDaily = this.generateHistoricalCostData(daysBack);
    const result: Array<{
      date: number;
      model: string;
      cost: number;
      tokens: number;
      requests: number;
    }> = [];

    const modelShares: Array<{ id: string; share: number }> = [
      { id: "claude-opus-4-7", share: 0.34 },
      { id: "claude-sonnet-4-20250514", share: 0.16 },
      { id: "grok-code-fast-1", share: 0.12 },
      { id: "claude-3-5-sonnet-20241022", share: 0.1 },
      { id: "gpt-4.1", share: 0.08 },
      { id: "gemini-2.5-pro", share: 0.07 },
      { id: "claude-3-5-haiku-20241022", share: 0.05 },
      { id: "gpt-4o", share: 0.04 },
      { id: "minimax-m2.5-free", share: 0.04 },
    ];

    const modelRng = this.rng.fork(77777);

    for (let i = 0; i < totalDaily.length; i++) {
      const day = totalDaily[i]!;
      const dayRng = modelRng.fork(i);

      let remainingCost = day.cost;

      for (const model of modelShares) {
        const variance = dayRng.range(0.8, 1.2);
        const cost = Math.round(day.cost * model.share * variance * 100) / 100;
        const actualCost = Math.min(Math.max(cost, 0), remainingCost);
        remainingCost -= actualCost;

        const tokensPerDollar = dayRng.range(15000, 25000);
        const requestsPerDollar = dayRng.range(8, 15);

        result.push({
          date: day.date,
          model: model.id,
          cost: actualCost,
          tokens: Math.floor(actualCost * tokensPerDollar),
          requests: Math.floor(actualCost * requestsPerDollar),
        });
      }
    }

    return result;
  }

  generateHistoricalCostDataByProject(
    daysBack: number,
  ): Array<{ date: number; projectPath: string; cost: number; tokens: number; requests: number }> {
    const totalDaily = this.generateHistoricalCostData(daysBack);
    const result: Array<{
      date: number;
      projectPath: string;
      cost: number;
      tokens: number;
      requests: number;
    }> = [];

    const totalWeight = PROJECT_POOL.reduce((sum, p) => sum + p.weight, 0);
    const projectShares: Array<{ path: string; share: number }> = PROJECT_POOL.slice(0, 8).map(
      (p) => ({ path: p.path, share: p.weight / totalWeight }),
    );

    const projectRng = this.rng.fork(66666);

    for (let i = 0; i < totalDaily.length; i++) {
      const day = totalDaily[i]!;
      const dayRng = projectRng.fork(i);

      let remainingCost = day.cost;

      for (const project of projectShares) {
        const variance = dayRng.range(0.8, 1.2);
        const cost = Math.round(day.cost * project.share * variance * 100) / 100;
        const actualCost = Math.min(Math.max(cost, 0), remainingCost);
        remainingCost -= actualCost;

        const tokensPerDollar = dayRng.range(15000, 25000);
        const requestsPerDollar = dayRng.range(8, 15);

        result.push({
          date: day.date,
          projectPath: project.path,
          cost: actualCost,
          tokens: Math.floor(actualCost * tokensPerDollar),
          requests: Math.floor(actualCost * requestsPerDollar),
        });
      }
    }

    return result;
  }

  generateHistoricalCostData(daysBack: number): Array<{ date: number; cost: number }> {
    const historyRng = this.rng.fork(99999);
    const now = Date.now();
    const result: Array<{ date: number; cost: number }> = [];

    const baseCost = this.presetConfig.historicalDailyCostBase;

    for (let i = daysBack - 1; i >= 0; i--) {
      const dayTimestamp = now - i * MS_PER_DAY;
      const dayRng = historyRng.fork(i);

      const isWeekend = new Date(dayTimestamp).getDay() % 6 === 0;
      const weekendFactor = isWeekend ? 0.4 : 1.0;

      const variance = dayRng.range(0.5, 1.5);
      const spikeFactor = dayRng.next() < 0.1 ? dayRng.range(1.5, 2.5) : 1.0;

      const cost = baseCost * variance * weekendFactor * spikeFactor;

      result.push({ date: dayTimestamp, cost: Math.round(cost * 100) / 100 });
    }

    return result;
  }
}
