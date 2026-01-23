import type { ModelPricing, CostBreakdown } from '@/plugins/types/provider.ts';

export interface TokenUsage {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
}

export function estimateCost(
  usage: TokenUsage,
  pricing: ModelPricing
): CostBreakdown {
  const inputCost = (usage.input / 1_000_000) * pricing.input;
  const outputCost = (usage.output / 1_000_000) * pricing.output;

  let cacheReadCost = 0;
  if (usage.cacheRead && pricing.cacheRead) {
    cacheReadCost = (usage.cacheRead / 1_000_000) * pricing.cacheRead;
  }

  let cacheWriteCost = 0;
  if (usage.cacheWrite && pricing.cacheWrite) {
    cacheWriteCost = (usage.cacheWrite / 1_000_000) * pricing.cacheWrite;
  }

  const total = inputCost + outputCost + cacheReadCost + cacheWriteCost;

  const breakdown: CostBreakdown = {
    total: roundCost(total),
    input: roundCost(inputCost),
    output: roundCost(outputCost),
    currency: 'USD',
  };

  if (cacheReadCost > 0) breakdown.cacheRead = roundCost(cacheReadCost);
  if (cacheWriteCost > 0) breakdown.cacheWrite = roundCost(cacheWriteCost);

  return breakdown;
}

export function estimateSessionCost(
  sessions: TokenUsage[],
  pricing: ModelPricing
): CostBreakdown {
  const totals = sessions.reduce<TokenUsage>(
    (acc, session) => ({
      input: acc.input + session.input,
      output: acc.output + session.output,
      cacheRead: (acc.cacheRead ?? 0) + (session.cacheRead ?? 0),
      cacheWrite: (acc.cacheWrite ?? 0) + (session.cacheWrite ?? 0),
    }),
    { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
  );

  return estimateCost(totals, pricing);
}

export function formatCost(cost: number, currency = 'USD'): string {
  if (currency === 'USD') {
    if (cost < 0.01) {
      return `$${cost.toFixed(4)}`;
    }
    if (cost < 1) {
      return `$${cost.toFixed(3)}`;
    }
    return `$${cost.toFixed(2)}`;
  }
  return `${cost.toFixed(4)} ${currency}`;
}

export function formatTokenCount(tokens: number): string {
  if (tokens < 1000) return tokens.toString();
  if (tokens < 1_000_000) return `${(tokens / 1000).toFixed(1)}K`;
  return `${(tokens / 1_000_000).toFixed(2)}M`;
}

function roundCost(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
