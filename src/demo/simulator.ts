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
 * - light: Low activity, fewer sessions, slower token accumulation
 * - normal: Moderate activity, balanced simulation (default)
 * - heavy: High activity, more sessions, faster token accumulation
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
}

export const DEMO_PRESETS: Record<DemoPreset, DemoPresetConfig> = {
  light: {
    sessionCount: 2,
    activityMultiplier: 0.5,
    extraProviderCount: 1,
    usageRange: [5, 35],
    idleProbability: 0.6,
    burstProbability: 0.05,
    burstMultiplier: 3,
  },
  normal: {
    sessionCount: 4,
    activityMultiplier: 1.0,
    extraProviderCount: 3,
    usageRange: [8, 72],
    idleProbability: 0.35,
    burstProbability: 0.1,
    burstMultiplier: 4,
  },
  heavy: {
    sessionCount: 6,
    activityMultiplier: 2.0,
    extraProviderCount: 10,
    usageRange: [25, 95],
    idleProbability: 0.15,
    burstProbability: 0.2,
    burstMultiplier: 5,
  },
};

export interface DemoSessionSeed {
  sessionId: string;
  sessionName?: string;
  agentId: "opencode" | "claude-code" | "cursor";
  agentName: "OpenCode" | "Claude Code" | "Cursor";
  projectPath: string;
  modelId: string;
  providerId: string;
  baseTokens: number;
  baseCost: number;
  inactive?: boolean;
}

const DEFAULT_SESSIONS: DemoSessionSeed[] = [
  {
    sessionId: "demo-opencode-1",
    sessionName: "Implement dashboard view with real-time updates",
    agentId: "opencode",
    agentName: "OpenCode",
    projectPath: "/Users/demo/workspace/tokentop",
    modelId: "claude-3-5-sonnet",
    providerId: "anthropic",
    baseTokens: 3200,
    baseCost: 1.24,
  },
  {
    sessionId: "demo-opencode-2",
    sessionName: "Fix Kubernetes deployment configuration",
    agentId: "opencode",
    agentName: "OpenCode",
    projectPath: "/Users/demo/workspace/infra",
    modelId: "gpt-4.1",
    providerId: "openai",
    baseTokens: 2100,
    baseCost: 0.92,
  },
  {
    sessionId: "demo-claude-1",
    sessionName: "Add authentication flow to mobile app",
    agentId: "claude-code",
    agentName: "Claude Code",
    projectPath: "/Users/demo/workspace/mobile",
    modelId: "claude-3-opus",
    providerId: "anthropic",
    baseTokens: 1800,
    baseCost: 0.78,
  },
  {
    sessionId: "demo-cursor-1",
    sessionName: "Refactor API endpoints for better performance",
    agentId: "cursor",
    agentName: "Cursor",
    projectPath: "/Users/demo/workspace/webapp",
    modelId: "gemini-2.0-pro",
    providerId: "google-gemini",
    baseTokens: 2600,
    baseCost: 0.64,
  },
  {
    sessionId: "demo-opencode-old-1",
    sessionName: "Migrate legacy API to REST v2",
    agentId: "opencode",
    agentName: "OpenCode",
    projectPath: "/Users/demo/workspace/legacy-api",
    modelId: "claude-3-5-sonnet",
    providerId: "anthropic",
    baseTokens: 5400,
    baseCost: 2.18,
    inactive: true,
  },
  {
    sessionId: "demo-claude-old-1",
    sessionName: "Update documentation with new API examples",
    agentId: "claude-code",
    agentName: "Claude Code",
    projectPath: "/Users/demo/workspace/docs-site",
    modelId: "gpt-4.1",
    providerId: "openai",
    baseTokens: 3800,
    baseCost: 1.56,
    inactive: true,
  },
];

const PROVIDER_LIMITS: Record<string, { label: string; windowMinutes: number }> = {
  anthropic: { label: "Daily Tokens", windowMinutes: 1440 },
  openai: { label: "Daily Tokens", windowMinutes: 1440 },
  "google-gemini": { label: "Daily Tokens", windowMinutes: 1440 },
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

function createLongContextTokens(rng: DemoRng): TokenCounts {
  return {
    input: 240_000 + Math.floor(rng.range(0, 40_000)),
    output: 4_000 + Math.floor(rng.range(0, 6_000)),
  };
}

function createStreamCostBreakdown(
  baseCost: number,
  inputTokens: number,
  outputTokens: number,
  longContextTokens?: TokenCounts,
): { costUsd: number; costBreakdown: StreamCostBreakdown } {
  const baseInputCost = baseCost * 0.55;
  const baseOutputCost = baseCost - baseInputCost;
  const inputRate = baseInputCost / (inputTokens / 1_000_000);
  const outputRate = baseOutputCost / (outputTokens / 1_000_000);

  const longContextInputCost = longContextTokens
    ? (longContextTokens.input / 1_000_000) * inputRate * 2
    : 0;
  const longContextOutputCost = longContextTokens
    ? (longContextTokens.output / 1_000_000) * outputRate * 2
    : 0;
  const total = baseCost + longContextInputCost + longContextOutputCost;

  return {
    costUsd: roundCost(total),
    costBreakdown: {
      total: roundCost(total),
      input: roundCost(baseInputCost + longContextInputCost),
      output: roundCost(baseOutputCost + longContextOutputCost),
    },
  };
}

function createWindowedTokens(
  inputTokens: number,
  outputTokens: number,
  longContextTokens?: TokenCounts,
): StreamWindowedTokens {
  const baseTotalTokens = totalTokens({ input: inputTokens, output: outputTokens });
  const longContextTotalTokens = longContextTokens ? totalTokens(longContextTokens) : 0;

  return {
    dayTokens: baseTotalTokens,
    weekTokens: baseTotalTokens,
    monthTokens: baseTotalTokens,
    totalTokens: baseTotalTokens,
    ...(longContextTotalTokens > 0 ? { longContextDayTokens: longContextTotalTokens } : {}),
    ...(longContextTotalTokens > 0 ? { longContextWeekTokens: longContextTotalTokens } : {}),
    ...(longContextTotalTokens > 0 ? { longContextMonthTokens: longContextTotalTokens } : {}),
    ...(longContextTotalTokens > 0 ? { longContextTotalTokens } : {}),
  };
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
  private sessions: AgentSessionAggregate[];
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

    const sessionCount = Math.min(this.presetConfig.sessionCount, DEFAULT_SESSIONS.length);

    // Select sessions: include a mix of inactive history and active sessions per preset size.
    const inactiveSessions = DEFAULT_SESSIONS.filter((s) => s.inactive ?? false);
    const activeSessions = DEFAULT_SESSIONS.filter((s) => !(s.inactive ?? false));
    const desiredInactive = Math.max(1, Math.round(sessionCount * 0.3));
    let inactiveCount = Math.min(inactiveSessions.length, desiredInactive);
    if (activeSessions.length > 0) {
      inactiveCount = Math.min(inactiveCount, sessionCount - 1);
    }
    const activeCount = Math.min(activeSessions.length, sessionCount - inactiveCount);
    if (activeCount + inactiveCount < sessionCount) {
      inactiveCount = Math.min(inactiveSessions.length, sessionCount - activeCount);
    }

    const selectedSessions = [
      ...activeSessions.slice(0, activeCount),
      ...inactiveSessions.slice(0, inactiveCount),
    ];

    const longContextSessionIndexes = this.pickLongContextSessionIndexes(selectedSessions);

    this.sessions = selectedSessions.map((seedSession, index) => {
      const tokens = seedSession.baseTokens;
      const inputTokens = Math.floor(tokens * 0.6);
      const outputTokens = tokens - inputTokens;
      const hasLongContext = longContextSessionIndexes.has(index);
      const longContextTokens = hasLongContext
        ? createLongContextTokens(this.rng.fork(hashCombine(index + 1, seedSession.baseTokens)))
        : undefined;
      const { costUsd, costBreakdown } = createStreamCostBreakdown(
        seedSession.baseCost,
        inputTokens,
        outputTokens,
        longContextTokens,
      );
      const streamWindowedTokens = createWindowedTokens(
        inputTokens,
        outputTokens,
        longContextTokens,
      );
      const requestCount = Math.max(1, Math.floor(tokens / 800));
      const longContextRequestCount = hasLongContext ? 1 : 0;
      const stream: AgentSessionStream = {
        providerId: seedSession.providerId,
        modelId: seedSession.modelId,
        tokens: { input: inputTokens, output: outputTokens },
        requestCount: requestCount + longContextRequestCount,
        costUsd,
        costBreakdown,
        pricingSource: "fallback",
      };
      if (hasLongContext && longContextTokens) {
        stream.longContextTokens = longContextTokens;
        stream.longContextRequestCount = longContextRequestCount;
        stream.hasLongContext = true;
      }
      const streams: AgentSessionStream[] = [stream];

      const isInactive = seedSession.inactive ?? false;
      const startedAt = isInactive
        ? now - this.rng.range(3, 7) * 24 * 60 * 60 * 1000
        : now - (index + 1) * 45 * 60 * 1000;
      const lastActivityAt = isInactive
        ? startedAt + this.rng.range(30, 120) * 60 * 1000
        : now - this.rng.range(10_000, 50_000);

      const nowDate = new Date(now);
      const startOfDay = new Date(
        nowDate.getFullYear(),
        nowDate.getMonth(),
        nowDate.getDate(),
      ).getTime();
      const dayOfWeek = nowDate.getDay();
      const startOfWeek = new Date(
        nowDate.getFullYear(),
        nowDate.getMonth(),
        nowDate.getDate() - dayOfWeek,
      ).getTime();
      const startOfMonth = new Date(nowDate.getFullYear(), nowDate.getMonth(), 1).getTime();

      const costInDay = lastActivityAt >= startOfDay ? costUsd : 0;
      const costInWeek = lastActivityAt >= startOfWeek ? costUsd : 0;
      const costInMonth = lastActivityAt >= startOfMonth ? costUsd : 0;

      const baseSession: Omit<AgentSessionAggregate, "endedAt"> = {
        sessionId: seedSession.sessionId,
        agentId: seedSession.agentId,
        agentName: seedSession.agentName,
        projectPath: seedSession.projectPath,
        startedAt,
        lastActivityAt,
        status: isInactive ? "idle" : index % 3 === 0 ? "idle" : "active",
        totals: {
          input: hasLongContext ? inputTokens + (longContextTokens?.input ?? 0) : inputTokens,
          output: hasLongContext ? outputTokens + (longContextTokens?.output ?? 0) : outputTokens,
          cacheRead: Math.floor(tokens * 0.05),
          cacheWrite: Math.floor(tokens * 0.02),
        },
        totalCostUsd: costUsd,
        requestCount: requestCount + longContextRequestCount,
        streams,
        costInDay,
        costInWeek,
        costInMonth,
        _streamWindowedTokens: new Map([
          [`${seedSession.providerId}::${seedSession.modelId}`, streamWindowedTokens],
        ]),
      };
      if (seedSession.sessionName) {
        baseSession.sessionName = seedSession.sessionName;
      }

      return isInactive ? { ...baseSession, endedAt: lastActivityAt } : baseSession;
    });

    const sessionProviderIds = new Set(selectedSessions.map((s) => s.providerId));
    this.fixedProviderIds = Array.from(sessionProviderIds);

    const extraCount = Math.min(this.presetConfig.extraProviderCount, EXTRA_PROVIDERS.length);
    this.fixedExtraProviders = EXTRA_PROVIDERS.slice(0, extraCount);

    this.providerUsage = new Map();
    this.lastTick = now;
    this.initializeProviderUsage(now);
  }

  private pickLongContextSessionIndexes(selectedSessions: DemoSessionSeed[]): Set<number> {
    if (this.preset === "light") {
      return new Set();
    }

    const activeIndexes = selectedSessions
      .map((session, index) => ({ session, index }))
      .filter(({ session }) => !(session.inactive ?? false))
      .map(({ index }) => index);

    const targetCount = this.preset === "normal" ? 1 : Math.min(2, activeIndexes.length);
    const ranked = activeIndexes
      .map((index) => ({
        index,
        score: this.rng
          .fork(hashCombine(1_000 + index, selectedSessions[index]!.baseTokens))
          .next(),
      }))
      .sort((a, b) => b.score - a.score || a.index - b.index);

    return new Set(ranked.slice(0, targetCount).map(({ index }) => index));
  }

  private initializeProviderUsage(now: number) {
    const providerTotals = new Map<string, { tokens: number; cost: number; requests: number }>();
    for (const session of this.sessions) {
      for (const stream of session.streams) {
        const current = providerTotals.get(stream.providerId) ?? {
          tokens: 0,
          cost: 0,
          requests: 0,
        };
        const streamTokens = stream.tokens.input + stream.tokens.output;
        providerTotals.set(stream.providerId, {
          tokens: current.tokens + streamTokens,
          cost: current.cost + (stream.costUsd ?? 0),
          requests: current.requests + stream.requestCount,
        });
      }
    }

    for (const providerId of this.fixedProviderIds) {
      const totals = providerTotals.get(providerId) ?? { tokens: 0, cost: 0, requests: 0 };
      const limit = PROVIDER_LIMITS[providerId] ?? { label: "Daily Tokens", windowMinutes: 1440 };
      const usedPercent = clamp((totals.tokens / 50_000) * 100, 5, 98);
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
    for (const provider of this.fixedExtraProviders) {
      const usedPercent = clamp(this.rng.range(minUsage, maxUsage), 5, 98);
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
    const providerTotals = new Map<string, { tokens: number; cost: number; requests: number }>();
    for (const session of this.sessions) {
      for (const stream of session.streams) {
        const current = providerTotals.get(stream.providerId) ?? {
          tokens: 0,
          cost: 0,
          requests: 0,
        };
        const streamTokens = stream.tokens.input + stream.tokens.output;
        providerTotals.set(stream.providerId, {
          tokens: current.tokens + streamTokens,
          cost: current.cost + (stream.costUsd ?? 0),
          requests: current.requests + stream.requestCount,
        });
      }
    }

    for (const providerId of this.fixedProviderIds) {
      const totals = providerTotals.get(providerId) ?? { tokens: 0, cost: 0, requests: 0 };
      const limit = PROVIDER_LIMITS[providerId] ?? { label: "Daily Tokens", windowMinutes: 1440 };
      const usedPercent = clamp((totals.tokens / 50_000) * 100, 5, 98);
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

    this.sessions = this.sessions.map((session, sessionIndex) => {
      if (session.endedAt !== undefined) {
        return session;
      }

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
      sessions: this.sessions,
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

    const providerShares = [
      { id: "anthropic", share: 0.5 },
      { id: "openai", share: 0.25 },
      { id: "google-gemini", share: 0.15 },
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

    const modelShares = [
      { id: "claude-3-5-sonnet", share: 0.4 },
      { id: "claude-3-opus", share: 0.2 },
      { id: "gpt-4.1", share: 0.25 },
      { id: "gemini-2.0-pro", share: 0.15 },
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

    const projectShares = [
      { path: "/Users/demo/workspace/tokentop", share: 0.45 },
      { path: "/Users/demo/workspace/webapp", share: 0.3 },
      { path: "/Users/demo/workspace/infra", share: 0.25 },
    ];

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
    const msPerDay = 24 * 60 * 60 * 1000;
    const result: Array<{ date: number; cost: number }> = [];

    const baseCost = this.presetConfig.activityMultiplier * 2.5;

    for (let i = daysBack - 1; i >= 0; i--) {
      const dayTimestamp = now - i * msPerDay;
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
