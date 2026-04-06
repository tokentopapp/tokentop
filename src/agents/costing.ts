import type { CostBreakdown, ModelPricing } from "@tokentop/plugin-sdk";
import { estimateCost, getPricing } from "@/pricing/index.ts";
import type { AgentSessionAggregate, AgentSessionStream, StreamCostBreakdown } from "./types.ts";

export async function priceStream(stream: AgentSessionStream): Promise<AgentSessionStream> {
  const pricing = await getPricing(stream.providerId, stream.modelId);

  return priceStreamWithPricing(stream, pricing).stream;
}

export async function priceSession(session: AgentSessionAggregate): Promise<AgentSessionAggregate> {
  const pricedResults = await Promise.all(
    session.streams.map(async (stream) => {
      const pricing = await getPricing(stream.providerId, stream.modelId);
      return priceStreamWithPricing(stream, pricing);
    }),
  );
  const pricedStreams = pricedResults.map((result) => result.stream);

  const totalCostUsd = pricedStreams.reduce((sum, s) => {
    return sum + (s.costUsd ?? 0);
  }, 0);

  const hasAnyCost = pricedStreams.some((s) => s.costUsd !== undefined);

  let costInDay = 0;
  let costInWeek = 0;
  let costInMonth = 0;

  if (hasAnyCost && session._streamWindowedTokens) {
    for (const result of pricedResults) {
      const streamCost = result.stream.costUsd ?? 0;
      if (streamCost === 0) continue;

      const keyStr = `${result.stream.providerId}::${result.stream.modelId}`;
      const windowed = session._streamWindowedTokens.get(keyStr);
      if (!windowed) continue;

      if (result.baseBreakdown.total > 0 && windowed.totalTokens > 0) {
        const baseRatio = 1 / windowed.totalTokens;
        costInDay += result.baseBreakdown.total * windowed.dayTokens * baseRatio;
        costInWeek += result.baseBreakdown.total * windowed.weekTokens * baseRatio;
        costInMonth += result.baseBreakdown.total * windowed.monthTokens * baseRatio;
      }

      const longContextTotalTokens = windowed.longContextTotalTokens ?? 0;
      if (result.longContextBreakdown.total > 0 && longContextTotalTokens > 0) {
        const longContextRatio = 1 / longContextTotalTokens;
        costInDay +=
          result.longContextBreakdown.total *
          (windowed.longContextDayTokens ?? 0) *
          longContextRatio;
        costInWeek +=
          result.longContextBreakdown.total *
          (windowed.longContextWeekTokens ?? 0) *
          longContextRatio;
        costInMonth +=
          result.longContextBreakdown.total *
          (windowed.longContextMonthTokens ?? 0) *
          longContextRatio;
      }
    }
  }

  const result: AgentSessionAggregate = {
    ...session,
    streams: pricedStreams,
    costInDay,
    costInWeek,
    costInMonth,
  };
  if (hasAnyCost) result.totalCostUsd = totalCostUsd;
  delete result._streamWindowedTokens;

  return result;
}

type PricedStreamResult = {
  stream: AgentSessionStream;
  baseBreakdown: CostBreakdown;
  longContextBreakdown: CostBreakdown;
};

function priceStreamWithPricing(
  stream: AgentSessionStream,
  pricing: ModelPricing | null,
): PricedStreamResult {
  const hasLongContext = (stream.longContextRequestCount ?? 0) > 0;

  if (!pricing) {
    return {
      stream: {
        ...stream,
        ...(hasLongContext ? { hasLongContext: true } : {}),
        pricingSource: "unknown",
      },
      baseBreakdown: zeroCostBreakdown(),
      longContextBreakdown: zeroCostBreakdown(),
    };
  }

  const baseBreakdown = estimateCost(stream.tokens, pricing);
  const longContextBreakdown = stream.longContextTokens
    ? estimateCost(
        stream.longContextTokens,
        hasLongContextPricing(pricing) ? buildLongContextPricing(pricing) : pricing,
      )
    : zeroCostBreakdown();
  const breakdown = sumCostBreakdowns(baseBreakdown, longContextBreakdown);
  const source = pricing.source === "models.dev" ? "models.dev" : "fallback";

  return {
    stream: {
      ...stream,
      ...(hasLongContext ? { hasLongContext: true } : {}),
      costUsd: breakdown.total,
      costBreakdown: toStreamCostBreakdown(breakdown),
      pricingSource: source,
    },
    baseBreakdown,
    longContextBreakdown,
  };
}

export async function priceSessions(
  sessions: AgentSessionAggregate[],
): Promise<AgentSessionAggregate[]> {
  return Promise.all(sessions.map(priceSession));
}

function hasLongContextPricing(pricing: ModelPricing): boolean {
  return (
    pricing.longContextInput !== undefined ||
    pricing.longContextOutput !== undefined ||
    pricing.longContextCacheRead !== undefined ||
    pricing.longContextCacheWrite !== undefined
  );
}

function buildLongContextPricing(pricing: ModelPricing): ModelPricing {
  return {
    ...pricing,
    input: pricing.longContextInput ?? pricing.input,
    output: pricing.longContextOutput ?? pricing.output,
    ...(pricing.longContextCacheRead !== undefined || pricing.cacheRead !== undefined
      ? { cacheRead: pricing.longContextCacheRead ?? pricing.cacheRead }
      : {}),
    ...(pricing.longContextCacheWrite !== undefined || pricing.cacheWrite !== undefined
      ? { cacheWrite: pricing.longContextCacheWrite ?? pricing.cacheWrite }
      : {}),
  };
}

function toStreamCostBreakdown(breakdown: CostBreakdown): StreamCostBreakdown {
  const costBreakdown: StreamCostBreakdown = {
    total: breakdown.total,
    input: breakdown.input ?? 0,
    output: breakdown.output ?? 0,
  };
  if (breakdown.cacheRead) costBreakdown.cacheRead = breakdown.cacheRead;
  if (breakdown.cacheWrite) costBreakdown.cacheWrite = breakdown.cacheWrite;
  return costBreakdown;
}

function sumCostBreakdowns(a: CostBreakdown, b: CostBreakdown): CostBreakdown {
  const cacheRead = (a.cacheRead ?? 0) + (b.cacheRead ?? 0);
  const cacheWrite = (a.cacheWrite ?? 0) + (b.cacheWrite ?? 0);
  const breakdown: CostBreakdown = {
    total: roundCost(a.total + b.total),
    input: roundCost((a.input ?? 0) + (b.input ?? 0)),
    output: roundCost((a.output ?? 0) + (b.output ?? 0)),
    currency: a.currency,
  };
  if (cacheRead > 0) breakdown.cacheRead = roundCost(cacheRead);
  if (cacheWrite > 0) breakdown.cacheWrite = roundCost(cacheWrite);
  return breakdown;
}

function zeroCostBreakdown(): CostBreakdown {
  return {
    total: 0,
    input: 0,
    output: 0,
    currency: "USD",
  };
}

function roundCost(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
