import type { AgentSessionAggregate, AgentSessionStream } from '@/agents/types.ts';
import type { ProviderUsageData } from '@/plugins/types/provider.ts';
import type { UsageEventInsert } from '@/storage/types.ts';

/**
 * Demo presets control the intensity of simulated activity.
 * - light: Low activity, fewer sessions, slower token accumulation
 * - normal: Moderate activity, balanced simulation (default)
 * - heavy: High activity, more sessions, faster token accumulation
 */
export type DemoPreset = 'light' | 'normal' | 'heavy';

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
  agentId: 'opencode' | 'claude-code' | 'cursor';
  agentName: 'OpenCode' | 'Claude Code' | 'Cursor';
  projectPath: string;
  modelId: string;
  providerId: string;
  baseTokens: number;
  baseCost: number;
  inactive?: boolean;
}

const DEFAULT_SESSIONS: DemoSessionSeed[] = [
  {
    sessionId: 'demo-opencode-1',
    agentId: 'opencode',
    agentName: 'OpenCode',
    projectPath: '/Users/demo/workspace/tokentop',
    modelId: 'claude-3-5-sonnet',
    providerId: 'anthropic',
    baseTokens: 3200,
    baseCost: 1.24,
  },
  {
    sessionId: 'demo-opencode-2',
    agentId: 'opencode',
    agentName: 'OpenCode',
    projectPath: '/Users/demo/workspace/infra',
    modelId: 'gpt-4.1',
    providerId: 'openai',
    baseTokens: 2100,
    baseCost: 0.92,
  },
  {
    sessionId: 'demo-claude-1',
    agentId: 'claude-code',
    agentName: 'Claude Code',
    projectPath: '/Users/demo/workspace/mobile',
    modelId: 'claude-3-opus',
    providerId: 'anthropic',
    baseTokens: 1800,
    baseCost: 0.78,
  },
  {
    sessionId: 'demo-cursor-1',
    agentId: 'cursor',
    agentName: 'Cursor',
    projectPath: '/Users/demo/workspace/webapp',
    modelId: 'gemini-2.0-pro',
    providerId: 'google-gemini',
    baseTokens: 2600,
    baseCost: 0.64,
  },
  {
    sessionId: 'demo-opencode-old-1',
    agentId: 'opencode',
    agentName: 'OpenCode',
    projectPath: '/Users/demo/workspace/legacy-api',
    modelId: 'claude-3-5-sonnet',
    providerId: 'anthropic',
    baseTokens: 5400,
    baseCost: 2.18,
    inactive: true,
  },
  {
    sessionId: 'demo-claude-old-1',
    agentId: 'claude-code',
    agentName: 'Claude Code',
    projectPath: '/Users/demo/workspace/docs-site',
    modelId: 'gpt-4.1',
    providerId: 'openai',
    baseTokens: 3800,
    baseCost: 1.56,
    inactive: true,
  },
];

const PROVIDER_LIMITS: Record<string, { label: string; windowMinutes: number }> = {
  anthropic: { label: 'Daily Tokens', windowMinutes: 1440 },
  openai: { label: 'Daily Tokens', windowMinutes: 1440 },
  'google-gemini': { label: 'Daily Tokens', windowMinutes: 1440 },
};

const PROVIDER_COLORS: Record<string, string> = {
  anthropic: '#D97706',
  openai: '#10A37F',
  'google-gemini': '#4285F4',
};

const EXTRA_PROVIDERS: Array<{ id: string; label: string; balance?: string }> = [
  { id: 'codex', label: 'ChatGPT Plus', balance: '$18.00' },
  { id: 'github-copilot', label: 'Copilot Pro', balance: '$26.00' },
  { id: 'perplexity', label: 'Perplexity Pro', balance: '$12.50' },
  { id: 'antigravity', label: 'Antigravity AI', balance: '$31.00' },
  { id: 'minimax', label: 'MiniMax', balance: '$22.00' },
  { id: 'cohere', label: 'Cohere Enterprise', balance: '$45.00' },
  { id: 'mistral', label: 'Mistral API', balance: '$15.00' },
  { id: 'groq', label: 'Groq Cloud', balance: '$8.50' },
  { id: 'together', label: 'Together AI', balance: '$20.00' },
  { id: 'fireworks', label: 'Fireworks AI', balance: '$12.00' },
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function hashCombine(a: number, b: number): number {
  return ((a * 2654435761) ^ (b * 1597334677)) >>> 0;
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
    this.preset = options.preset ?? 'normal';
    this.presetConfig = DEMO_PRESETS[this.preset];
    this.rng = new DemoRng(seed);
    const now = Date.now();
    this.startTime = now;

    const sessionCount = Math.min(this.presetConfig.sessionCount, DEFAULT_SESSIONS.length);

    // Select sessions: include a mix of inactive history and active sessions per preset size.
    const inactiveSessions = DEFAULT_SESSIONS.filter(s => s.inactive ?? false);
    const activeSessions = DEFAULT_SESSIONS.filter(s => !(s.inactive ?? false));
    const desiredInactive = Math.max(1, Math.round(sessionCount * 0.3));
    let inactiveCount = Math.min(inactiveSessions.length, desiredInactive);
    if (activeSessions.length > 0) {
      inactiveCount = Math.min(inactiveCount, sessionCount - 1);
    }
    let activeCount = Math.min(activeSessions.length, sessionCount - inactiveCount);
    if (activeCount + inactiveCount < sessionCount) {
      inactiveCount = Math.min(inactiveSessions.length, sessionCount - activeCount);
    }

    const selectedSessions = [
      ...activeSessions.slice(0, activeCount),
      ...inactiveSessions.slice(0, inactiveCount),
    ];

    this.sessions = selectedSessions.map((seedSession, index) => {
      const tokens = seedSession.baseTokens;
      const cost = seedSession.baseCost;
      const inputTokens = Math.floor(tokens * 0.6);
      const outputTokens = tokens - inputTokens;
      const streams: AgentSessionStream[] = [
        {
          providerId: seedSession.providerId,
          modelId: seedSession.modelId,
          tokens: { input: inputTokens, output: outputTokens },
          requestCount: Math.max(1, Math.floor(tokens / 800)),
          costUsd: cost,
          pricingSource: 'fallback',
        },
      ];

      const isInactive = seedSession.inactive ?? false;
      const startedAt = isInactive
        ? now - this.rng.range(3, 7) * 24 * 60 * 60 * 1000
        : now - (index + 1) * 45 * 60 * 1000;
      const lastActivityAt = isInactive
        ? startedAt + this.rng.range(30, 120) * 60 * 1000
        : now - this.rng.range(10_000, 50_000);

      const baseSession = {
        sessionId: seedSession.sessionId,
        agentId: seedSession.agentId,
        agentName: seedSession.agentName,
        projectPath: seedSession.projectPath,
        startedAt,
        lastActivityAt,
        status: isInactive ? 'idle' : (index % 3 === 0 ? 'idle' : 'active'),
        totals: {
          input: inputTokens,
          output: outputTokens,
          cacheRead: Math.floor(tokens * 0.05),
          cacheWrite: Math.floor(tokens * 0.02),
        },
        totalCostUsd: cost,
        requestCount: Math.max(1, Math.floor(tokens / 700)),
        streams,
      } satisfies Omit<AgentSessionAggregate, 'endedAt'>;

      return isInactive
        ? { ...baseSession, endedAt: lastActivityAt }
        : baseSession;
    });

    const sessionProviderIds = new Set(selectedSessions.map(s => s.providerId));
    this.fixedProviderIds = Array.from(sessionProviderIds);

    const extraCount = Math.min(this.presetConfig.extraProviderCount, EXTRA_PROVIDERS.length);
    this.fixedExtraProviders = EXTRA_PROVIDERS.slice(0, extraCount);

    this.providerUsage = new Map();
    this.lastTick = now;
    this.initializeProviderUsage(now);
  }

  private initializeProviderUsage(now: number) {
    const providerTotals = new Map<string, { tokens: number; cost: number; requests: number }>();
    for (const session of this.sessions) {
      for (const stream of session.streams) {
        const current = providerTotals.get(stream.providerId) ?? { tokens: 0, cost: 0, requests: 0 };
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
      const limit = PROVIDER_LIMITS[providerId] ?? { label: 'Daily Tokens', windowMinutes: 1440 };
      const usedPercent = clamp((totals.tokens / 50_000) * 100, 5, 98);
      const limitReached = usedPercent > 95;

      this.providerUsage.set(providerId, {
        planType: 'Pro',
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
            currency: 'USD',
          },
          source: 'estimated',
        },
        credits: {
          hasCredits: true,
          unlimited: false,
          balance: '$42.50',
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
            label: 'Monthly Tokens',
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
            currency: 'USD',
          },
          source: 'estimated',
        },
        credits: {
          hasCredits: true,
          unlimited: false,
          balance: provider.balance ?? '$25.00',
        },
        fetchedAt: now,
      });
    }
  }

  private updateProviderUsage(now: number, tickRng: DemoRng) {
    const providerTotals = new Map<string, { tokens: number; cost: number; requests: number }>();
    for (const session of this.sessions) {
      for (const stream of session.streams) {
        const current = providerTotals.get(stream.providerId) ?? { tokens: 0, cost: 0, requests: 0 };
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
      const limit = PROVIDER_LIMITS[providerId] ?? { label: 'Daily Tokens', windowMinutes: 1440 };
      const usedPercent = clamp((totals.tokens / 50_000) * 100, 5, 98);
      const limitReached = usedPercent > 95;

      const existing = this.providerUsage.get(providerId);
      this.providerUsage.set(providerId, {
        planType: existing?.planType ?? 'Pro',
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
            currency: 'USD',
          },
          source: 'estimated',
        },
        credits: existing?.credits ?? {
          hasCredits: true,
          unlimited: false,
          balance: '$42.50',
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
            ...existing.limits!.primary!,
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
            currency: 'USD',
          },
          source: 'estimated',
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
        return { ...session, status: 'idle' as const };
      }

      const isBurst = sessionRng.next() < this.presetConfig.burstProbability;
      const burstFactor = isBurst ? this.presetConfig.burstMultiplier : 1;
      const activityFactor = sessionRng.range(0.4, 1.6) * burstFactor;
      const tokensPerSec = session.agentId === 'opencode' ? 35 : session.agentId === 'claude-code' ? 28 : 22;
      const deltaTokens = Math.floor(tokensPerSec * activityFactor * activityMultiplier * dtSec);
      if (deltaTokens === 0) {
        return { ...session, status: 'idle' as const };
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
        source: 'agent',
        provider: updatedStreams[0]?.providerId ?? 'anthropic',
        model: updatedStreams[0]?.modelId ?? 'claude-3-5-sonnet',
        agentId: session.agentId,
        sessionId: session.sessionId,
        projectPath: session.projectPath ?? null,
        inputTokens: inputDelta,
        outputTokens: outputDelta,
        cacheReadTokens: Math.floor(deltaTokens * 0.05),
        cacheWriteTokens: Math.floor(deltaTokens * 0.02),
        costUsd: costDelta,
        requestCount: Math.max(1, Math.floor(deltaTokens / 700)),
        pricingSource: 'fallback',
      });

      return {
        ...session,
        status: 'active' as const,
        lastActivityAt: now,
        totals: {
          ...session.totals,
          input: session.totals.input + inputDelta,
          output: session.totals.output + outputDelta,
        },
        totalCostUsd: (session.totalCostUsd ?? 0) + costDelta,
        requestCount: session.requestCount + Math.max(1, Math.floor(deltaTokens / 700)),
        streams: updatedStreams,
      } satisfies AgentSessionAggregate;
    });

    this.updateProviderUsage(now, tickRng);

    return {
      sessions: this.sessions,
      providerUsage: new Map(this.providerUsage),
      usageEvents,
    };
  }

  getProviderColors(): Record<string, string> {
    return PROVIDER_COLORS;
  }

  getSeed(): number {
    return this.rng.getSeed();
  }

  getPreset(): DemoPreset {
    return this.preset;
  }

  getProviderIds(): string[] {
    return [...this.fixedProviderIds, ...this.fixedExtraProviders.map(p => p.id)];
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
