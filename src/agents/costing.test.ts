import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { ModelPricing } from "@tokentop/plugin-sdk";
import { estimateCost } from "@/pricing/estimator.ts";
import type { AgentSessionAggregate, AgentSessionStream } from "./types.ts";

const getPricing = mock<(providerId: string, modelId: string) => Promise<ModelPricing | null>>(
  async () => null,
);

mock.module("@/pricing/index.ts", () => ({
  estimateCost,
  getPricing,
}));

const { priceSession, priceSessions, priceStream } = await import("./costing.ts");

function makeStream(overrides: Partial<AgentSessionStream> = {}): AgentSessionStream {
  return {
    providerId: "anthropic",
    modelId: "claude-sonnet-4",
    tokens: { input: 0, output: 0 },
    requestCount: 1,
    ...overrides,
  };
}

function makeSession(
  overrides: Partial<AgentSessionAggregate> & Pick<AgentSessionAggregate, "sessionId">,
): AgentSessionAggregate {
  return {
    agentId: "opencode",
    agentName: "OpenCode",
    startedAt: 0,
    lastActivityAt: 0,
    status: "idle",
    totals: { input: 0, output: 0 },
    requestCount: 0,
    streams: [],
    costInDay: 0,
    costInWeek: 0,
    costInMonth: 0,
    ...overrides,
  };
}

beforeEach(() => {
  getPricing.mockReset();
  getPricing.mockResolvedValue(null);
});

afterEach(() => {
  getPricing.mockClear();
});

describe("priceStream()", () => {
  test("prices a single stream with fallback pricing and cache breakdown", async () => {
    getPricing.mockResolvedValue({
      input: 2,
      output: 4,
      cacheRead: 1,
      cacheWrite: 3,
      source: "fallback",
    });

    const priced = await priceStream(
      makeStream({
        tokens: { input: 500_000, output: 250_000, cacheRead: 100_000, cacheWrite: 50_000 },
      }),
    );

    expect(getPricing).toHaveBeenCalledWith("anthropic", "claude-sonnet-4");
    expect(priced).toMatchObject({
      costUsd: 2.25,
      costBreakdown: {
        total: 2.25,
        input: 1,
        output: 1,
        cacheRead: 0.1,
        cacheWrite: 0.15,
      },
      pricingSource: "fallback",
    });
  });

  test("marks priced streams as models.dev when pricing comes from models.dev", async () => {
    getPricing.mockResolvedValue({
      input: 1.5,
      output: 6,
      source: "models.dev",
    });

    const priced = await priceStream(
      makeStream({
        providerId: "openai",
        modelId: "gpt-4.1",
        tokens: { input: 200_000, output: 300_000 },
      }),
    );

    expect(priced.costUsd).toBe(2.1);
    expect(priced.costBreakdown).toEqual({
      total: 2.1,
      input: 0.3,
      output: 1.8,
    });
    expect(priced.pricingSource).toBe("models.dev");
  });

  test("returns unknown pricing source when no pricing is available", () => {
    const stream = makeStream({ tokens: { input: 123, output: 456 } });

    return expect(priceStream(stream)).resolves.toEqual({
      ...stream,
      pricingSource: "unknown",
    });
  });

  test("keeps base-only pricing identical when tiered pricing metadata exists", async () => {
    getPricing.mockResolvedValue({
      input: 2,
      output: 4,
      cacheRead: 1,
      cacheWrite: 3,
      longContextInput: 20,
      longContextOutput: 40,
      longContextCacheRead: 10,
      longContextCacheWrite: 30,
      source: "fallback",
    });

    const priced = await priceStream(
      makeStream({
        tokens: { input: 500_000, output: 250_000, cacheRead: 100_000, cacheWrite: 50_000 },
      }),
    );

    expect(priced.costUsd).toBe(2.25);
    expect(priced.costBreakdown).toEqual({
      total: 2.25,
      input: 1,
      output: 1,
      cacheRead: 0.1,
      cacheWrite: 0.15,
    });
    expect(priced.hasLongContext).toBeUndefined();
  });

  test("applies long-context tiered pricing to a long-context-only stream", async () => {
    getPricing.mockResolvedValue({
      input: 2,
      output: 4,
      cacheRead: 1,
      cacheWrite: 3,
      longContextInput: 4,
      longContextOutput: 8,
      longContextCacheRead: 2,
      longContextCacheWrite: 6,
      source: "models.dev",
    });

    const priced = await priceStream(
      makeStream({
        tokens: { input: 0, output: 0 },
        longContextTokens: {
          input: 200_000,
          output: 100_000,
          cacheRead: 50_000,
          cacheWrite: 25_000,
        },
        longContextRequestCount: 1,
      }),
    );

    expect(priced.costUsd).toBe(1.85);
    expect(priced.costBreakdown).toEqual({
      total: 1.85,
      input: 0.8,
      output: 0.8,
      cacheRead: 0.1,
      cacheWrite: 0.15,
    });
    expect(priced.hasLongContext).toBe(true);
    expect(priced.pricingSource).toBe("models.dev");
  });

  test("sums base and long-context buckets for mixed streams", async () => {
    getPricing.mockResolvedValue({
      input: 3,
      output: 9,
      cacheRead: 1,
      cacheWrite: 4,
      longContextInput: 6,
      longContextOutput: 18,
      longContextCacheRead: 2,
      longContextCacheWrite: 8,
      source: "fallback",
    });

    const priced = await priceStream(
      makeStream({
        tokens: { input: 100_000, output: 50_000, cacheRead: 10_000, cacheWrite: 5_000 },
        longContextTokens: {
          input: 250_000,
          output: 100_000,
          cacheRead: 50_000,
          cacheWrite: 25_000,
        },
        longContextRequestCount: 2,
      }),
    );

    expect(priced.costUsd).toBe(4.38);
    expect(priced.costBreakdown).toEqual({
      total: 4.38,
      input: 1.8,
      output: 2.25,
      cacheRead: 0.11,
      cacheWrite: 0.22,
    });
    expect(priced.hasLongContext).toBe(true);
  });

  test("uses base pricing conservatively when long-context pricing is unavailable", async () => {
    getPricing.mockResolvedValue({
      input: 2,
      output: 6,
      cacheRead: 1,
      cacheWrite: 3,
      source: "fallback",
    });

    const priced = await priceStream(
      makeStream({
        tokens: { input: 100_000, output: 50_000, cacheRead: 20_000, cacheWrite: 10_000 },
        longContextTokens: {
          input: 250_000,
          output: 100_000,
          cacheRead: 80_000,
          cacheWrite: 40_000,
        },
        longContextRequestCount: 1,
      }),
    );

    expect(priced.costUsd).toBe(1.85);
    expect(priced.costBreakdown).toEqual({
      total: 1.85,
      input: 0.7,
      output: 0.9,
      cacheRead: 0.1,
      cacheWrite: 0.15,
    });
    expect(priced.hasLongContext).toBe(true);
  });

  test("handles empty long-context buckets without NaN or errors", async () => {
    getPricing.mockResolvedValue({
      input: 2,
      output: 4,
      longContextInput: 6,
      longContextOutput: 12,
      source: "fallback",
    });

    const priced = await priceStream(
      makeStream({
        tokens: { input: 300_000, output: 100_000 },
        longContextTokens: { input: 0, output: 0 },
        longContextRequestCount: 1,
      }),
    );

    expect(priced.costUsd).toBe(1);
    expect(priced.costBreakdown).toEqual({
      total: 1,
      input: 0.6,
      output: 0.4,
    });
    expect(Number.isNaN(priced.costUsd ?? 0)).toBe(false);
    expect(priced.hasLongContext).toBe(true);
  });
});

describe("priceSession()", () => {
  test("prices a multi-stream session and removes internal window metadata", async () => {
    getPricing.mockImplementation(async (providerId, modelId) => {
      if (`${providerId}::${modelId}` === "anthropic::claude-sonnet-4") {
        return { input: 2, output: 4, cacheRead: 1, cacheWrite: 3, source: "fallback" };
      }

      if (`${providerId}::${modelId}` === "openai::gpt-4.1") {
        return { input: 1.5, output: 6, source: "models.dev" };
      }

      return null;
    });

    const priced = await priceSession(
      makeSession({
        sessionId: "multi-stream",
        requestCount: 3,
        streams: [
          makeStream({
            tokens: { input: 500_000, output: 250_000, cacheRead: 100_000, cacheWrite: 50_000 },
            requestCount: 2,
          }),
          makeStream({
            providerId: "openai",
            modelId: "gpt-4.1",
            tokens: { input: 200_000, output: 300_000 },
            requestCount: 1,
          }),
        ],
        _streamWindowedTokens: new Map([
          [
            "anthropic::claude-sonnet-4",
            { dayTokens: 400, weekTokens: 500, monthTokens: 750, totalTokens: 1000 },
          ],
          [
            "openai::gpt-4.1",
            { dayTokens: 1000, weekTokens: 1200, monthTokens: 1500, totalTokens: 2000 },
          ],
        ]),
      }),
    );

    expect(priced.totalCostUsd).toBe(4.35);
    expect(priced.costInDay).toBeCloseTo(1.95, 10);
    expect(priced.costInWeek).toBeCloseTo(2.385, 10);
    expect(priced.costInMonth).toBeCloseTo(3.2625, 10);
    expect(priced.streams.map((stream) => stream.pricingSource)).toEqual([
      "fallback",
      "models.dev",
    ]);
    expect(priced).not.toHaveProperty("_streamWindowedTokens");
  });

  test("uses the current windowed cost ratio formula for day, week, and month costs", async () => {
    getPricing.mockResolvedValue({ input: 10, output: 0, source: "fallback" });

    const priced = await priceSession(
      makeSession({
        sessionId: "ratio",
        streams: [makeStream({ tokens: { input: 1_000_000, output: 0 } })],
        _streamWindowedTokens: new Map([
          [
            "anthropic::claude-sonnet-4",
            { dayTokens: 500, weekTokens: 750, monthTokens: 1000, totalTokens: 1000 },
          ],
        ]),
      }),
    );

    expect(priced.totalCostUsd).toBe(10);
    expect(priced.costInDay).toBe(5);
    expect(priced.costInWeek).toBe(7.5);
    expect(priced.costInMonth).toBe(10);
  });

  test("returns zero costs for zero-token streams without dividing by zero", async () => {
    getPricing.mockResolvedValue({ input: 3, output: 15, source: "fallback" });

    const priced = await priceSession(
      makeSession({
        sessionId: "zero-token",
        streams: [makeStream({ tokens: { input: 0, output: 0 }, requestCount: 0 })],
        _streamWindowedTokens: new Map([
          [
            "anthropic::claude-sonnet-4",
            { dayTokens: 0, weekTokens: 0, monthTokens: 0, totalTokens: 0 },
          ],
        ]),
      }),
    );

    expect(priced.totalCostUsd).toBe(0);
    expect(priced.costInDay).toBe(0);
    expect(priced.costInWeek).toBe(0);
    expect(priced.costInMonth).toBe(0);
    expect(priced.streams[0]).toMatchObject({
      costUsd: 0,
      costBreakdown: { total: 0, input: 0, output: 0 },
      pricingSource: "fallback",
    });
  });

  test("returns an empty session unchanged when there are no streams", async () => {
    const priced = await priceSession(makeSession({ sessionId: "empty" }));

    expect(priced.streams).toEqual([]);
    expect(priced.totalCostUsd).toBeUndefined();
    expect(priced.costInDay).toBe(0);
    expect(priced.costInWeek).toBe(0);
    expect(priced.costInMonth).toBe(0);
  });

  test("ignores windowed allocations for streams without pricing", async () => {
    getPricing.mockResolvedValue(null);

    const priced = await priceSession(
      makeSession({
        sessionId: "unknown-pricing",
        streams: [makeStream({ tokens: { input: 1_000_000, output: 500_000 } })],
        _streamWindowedTokens: new Map([
          [
            "anthropic::claude-sonnet-4",
            { dayTokens: 500, weekTokens: 800, monthTokens: 1000, totalTokens: 1000 },
          ],
        ]),
      }),
    );

    expect(priced.totalCostUsd).toBeUndefined();
    expect(priced.costInDay).toBe(0);
    expect(priced.costInWeek).toBe(0);
    expect(priced.costInMonth).toBe(0);
    expect(priced.streams[0]?.pricingSource).toBe("unknown");
  });

  test("prices windowed costs with per-bucket ratios instead of a blended ratio", async () => {
    getPricing.mockResolvedValue({
      input: 2,
      output: 0,
      longContextInput: 6,
      longContextOutput: 0,
      source: "fallback",
    });

    const priced = await priceSession(
      makeSession({
        sessionId: "windowed-buckets",
        streams: [
          makeStream({
            tokens: { input: 1_000_000, output: 0 },
            longContextTokens: { input: 1_000_000, output: 0 },
            longContextRequestCount: 1,
          }),
        ],
        _streamWindowedTokens: new Map([
          [
            "anthropic::claude-sonnet-4",
            {
              dayTokens: 1_000_000,
              weekTokens: 500_000,
              monthTokens: 1_000_000,
              totalTokens: 1_000_000,
              longContextDayTokens: 0,
              longContextWeekTokens: 250_000,
              longContextMonthTokens: 1_000_000,
              longContextTotalTokens: 1_000_000,
            },
          ],
        ]),
      }),
    );

    expect(priced.totalCostUsd).toBe(8);
    expect(priced.costInDay).toBe(2);
    expect(priced.costInWeek).toBe(2.5);
    expect(priced.costInMonth).toBe(8);
  });

  test("prices multi-stream sessions with mixed tiered and non-tiered long-context streams", async () => {
    getPricing.mockImplementation(async (providerId, modelId) => {
      if (`${providerId}::${modelId}` === "anthropic::claude-sonnet-4") {
        return {
          input: 2,
          output: 0,
          longContextInput: 6,
          longContextOutput: 0,
          source: "fallback",
        };
      }

      if (`${providerId}::${modelId}` === "openai::gpt-4.1") {
        return {
          input: 4,
          output: 0,
          source: "fallback",
        };
      }

      return null;
    });

    const priced = await priceSession(
      makeSession({
        sessionId: "mixed-tiered-session",
        streams: [
          makeStream({
            tokens: { input: 500_000, output: 0 },
            longContextTokens: { input: 250_000, output: 0 },
            longContextRequestCount: 1,
          }),
          makeStream({
            providerId: "openai",
            modelId: "gpt-4.1",
            tokens: { input: 500_000, output: 0 },
            longContextTokens: { input: 250_000, output: 0 },
            longContextRequestCount: 1,
          }),
        ],
        _streamWindowedTokens: new Map([
          [
            "anthropic::claude-sonnet-4",
            {
              dayTokens: 250_000,
              weekTokens: 500_000,
              monthTokens: 500_000,
              totalTokens: 500_000,
              longContextDayTokens: 50_000,
              longContextWeekTokens: 100_000,
              longContextMonthTokens: 250_000,
              longContextTotalTokens: 250_000,
            },
          ],
          [
            "openai::gpt-4.1",
            {
              dayTokens: 100_000,
              weekTokens: 250_000,
              monthTokens: 500_000,
              totalTokens: 500_000,
              longContextDayTokens: 125_000,
              longContextWeekTokens: 125_000,
              longContextMonthTokens: 250_000,
              longContextTotalTokens: 250_000,
            },
          ],
        ]),
      }),
    );

    expect(priced.totalCostUsd).toBe(5.5);
    expect(priced.costInDay).toBe(1.7);
    expect(priced.costInWeek).toBe(3.1);
    expect(priced.costInMonth).toBe(5.5);
    expect(priced.streams.map((stream) => stream.hasLongContext)).toEqual([true, true]);
  });
});

describe("priceSessions()", () => {
  test("prices sessions in a batch", async () => {
    getPricing.mockImplementation(async (providerId, modelId) => {
      if (`${providerId}::${modelId}` === "anthropic::claude-sonnet-4") {
        return { input: 2, output: 4, source: "fallback" };
      }

      if (`${providerId}::${modelId}` === "openai::gpt-4.1") {
        return { input: 1, output: 2, source: "fallback" };
      }

      return null;
    });

    const priced = await priceSessions([
      makeSession({
        sessionId: "batch-a",
        streams: [makeStream({ tokens: { input: 500_000, output: 250_000 } })],
      }),
      makeSession({
        sessionId: "batch-b",
        streams: [
          makeStream({
            providerId: "openai",
            modelId: "gpt-4.1",
            tokens: { input: 1_000_000, output: 500_000 },
          }),
        ],
      }),
    ]);

    expect(priced).toHaveLength(2);
    expect(
      priced.map((session) => ({
        sessionId: session.sessionId,
        totalCostUsd: session.totalCostUsd,
      })),
    ).toEqual([
      { sessionId: "batch-a", totalCostUsd: 2 },
      { sessionId: "batch-b", totalCostUsd: 2 },
    ]);
  });
});
