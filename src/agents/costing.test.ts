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

  test("returns unknown pricing source when no pricing is available", async () => {
    const stream = makeStream({ tokens: { input: 123, output: 456 } });

    await expect(priceStream(stream)).resolves.toEqual({
      ...stream,
      pricingSource: "unknown",
    });
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
