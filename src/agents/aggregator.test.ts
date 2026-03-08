import { describe, expect, test } from "bun:test";
import { aggregateSessionUsage, deduplicateAggregates } from "./aggregator.ts";
import type { AgentSessionAggregate } from "./types.ts";

// ---------------------------------------------------------------------------
// Helper: build a minimal AgentSessionAggregate for dedup tests
// ---------------------------------------------------------------------------
function makeAggregate(
  overrides: Partial<AgentSessionAggregate> & Pick<AgentSessionAggregate, "sessionId" | "agentId">,
): AgentSessionAggregate {
  return {
    agentName: overrides.agentId,
    startedAt: 0,
    lastActivityAt: 0,
    status: "idle",
    totals: { input: 0, output: 0 },
    totalCostUsd: 0,
    requestCount: 0,
    streams: [],
    costInDay: 0,
    costInWeek: 0,
    costInMonth: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// deduplicateAggregates
// ---------------------------------------------------------------------------
describe("deduplicateAggregates", () => {
  test("returns empty array for empty input", () => {
    expect(deduplicateAggregates([])).toEqual([]);
  });

  test("passes through unique sessions unchanged", () => {
    const a = makeAggregate({ sessionId: "s1", agentId: "antigravity" });
    const b = makeAggregate({ sessionId: "s2", agentId: "antigravity" });
    const c = makeAggregate({ sessionId: "s3", agentId: "gemini-cli" });

    const result = deduplicateAggregates([a, b, c]);
    expect(result).toHaveLength(3);
    expect(result.map((r) => r.sessionId).sort()).toEqual(["s1", "s2", "s3"]);
  });

  test("removes exact duplicates (same sessionId from two agents)", () => {
    const fromAntigravity = makeAggregate({
      sessionId: "dup-1",
      agentId: "antigravity",
      agentName: "Antigravity",
      requestCount: 5,
      streams: [
        {
          providerId: "google",
          modelId: "gemini-3-flash",
          tokens: { input: 100, output: 50 },
          requestCount: 5,
        },
      ],
    });
    const fromGeminiCli = makeAggregate({
      sessionId: "dup-1",
      agentId: "gemini-cli",
      agentName: "Gemini CLI",
      requestCount: 5,
      streams: [
        {
          providerId: "google",
          modelId: "gemini-3-flash",
          tokens: { input: 100, output: 50 },
          requestCount: 5,
        },
      ],
    });

    const result = deduplicateAggregates([fromAntigravity, fromGeminiCli]);
    expect(result).toHaveLength(1);
    // First one encountered wins when equal
    expect(result[0]!.agentId).toBe("antigravity");
  });

  test("keeps the aggregate with more streams", () => {
    const fewer = makeAggregate({
      sessionId: "dup-2",
      agentId: "agent-a",
      requestCount: 10,
      streams: [
        {
          providerId: "google",
          modelId: "gemini-3-flash",
          tokens: { input: 100, output: 50 },
          requestCount: 10,
        },
      ],
    });
    const more = makeAggregate({
      sessionId: "dup-2",
      agentId: "agent-b",
      requestCount: 10,
      streams: [
        {
          providerId: "google",
          modelId: "gemini-3-flash",
          tokens: { input: 80, output: 40 },
          requestCount: 7,
        },
        {
          providerId: "google",
          modelId: "gemini-2.5-pro",
          tokens: { input: 20, output: 10 },
          requestCount: 3,
        },
      ],
    });

    // Regardless of order, the one with more streams wins
    expect(deduplicateAggregates([fewer, more])[0]!.agentId).toBe("agent-b");
    expect(deduplicateAggregates([more, fewer])[0]!.agentId).toBe("agent-b");
  });

  test("breaks stream-count tie by preferring more requests", () => {
    const lessRequests = makeAggregate({
      sessionId: "dup-3",
      agentId: "agent-a",
      requestCount: 3,
      streams: [
        {
          providerId: "google",
          modelId: "gemini-3-flash",
          tokens: { input: 50, output: 25 },
          requestCount: 3,
        },
      ],
    });
    const moreRequests = makeAggregate({
      sessionId: "dup-3",
      agentId: "agent-b",
      requestCount: 7,
      streams: [
        {
          providerId: "google",
          modelId: "gemini-3-flash",
          tokens: { input: 100, output: 50 },
          requestCount: 7,
        },
      ],
    });

    expect(deduplicateAggregates([lessRequests, moreRequests])[0]!.agentId).toBe("agent-b");
    expect(deduplicateAggregates([moreRequests, lessRequests])[0]!.agentId).toBe("agent-b");
  });

  test("keeps first encountered when streams and requests are equal", () => {
    const first = makeAggregate({
      sessionId: "dup-4",
      agentId: "first",
      requestCount: 5,
      streams: [
        { providerId: "google", modelId: "m", tokens: { input: 1, output: 1 }, requestCount: 5 },
      ],
    });
    const second = makeAggregate({
      sessionId: "dup-4",
      agentId: "second",
      requestCount: 5,
      streams: [
        { providerId: "google", modelId: "m", tokens: { input: 1, output: 1 }, requestCount: 5 },
      ],
    });

    expect(deduplicateAggregates([first, second])[0]!.agentId).toBe("first");
    expect(deduplicateAggregates([second, first])[0]!.agentId).toBe("second");
  });

  test("handles mix of unique and duplicate sessions", () => {
    const unique1 = makeAggregate({ sessionId: "u1", agentId: "antigravity" });
    const unique2 = makeAggregate({ sessionId: "u2", agentId: "opencode" });
    const dupA = makeAggregate({
      sessionId: "d1",
      agentId: "antigravity",
      requestCount: 5,
      streams: [
        { providerId: "google", modelId: "m", tokens: { input: 1, output: 1 }, requestCount: 5 },
      ],
    });
    const dupB = makeAggregate({
      sessionId: "d1",
      agentId: "gemini-cli",
      requestCount: 5,
      streams: [
        { providerId: "google", modelId: "m", tokens: { input: 1, output: 1 }, requestCount: 5 },
      ],
    });

    const result = deduplicateAggregates([unique1, dupA, unique2, dupB]);
    expect(result).toHaveLength(3);
    expect(result.map((r) => r.sessionId).sort()).toEqual(["d1", "u1", "u2"]);
  });
});

// ---------------------------------------------------------------------------
// aggregateSessionUsage — basic sanity
// ---------------------------------------------------------------------------
describe("aggregateSessionUsage", () => {
  const NOW = Date.now();

  test("groups rows by sessionId", () => {
    const result = aggregateSessionUsage({
      agentId: "test",
      agentName: "Test",
      now: NOW,
      rows: [
        {
          sessionId: "s1",
          providerId: "google",
          modelId: "m1",
          tokens: { input: 10, output: 5 },
          timestamp: NOW,
        },
        {
          sessionId: "s1",
          providerId: "google",
          modelId: "m1",
          tokens: { input: 20, output: 10 },
          timestamp: NOW - 1000,
        },
        {
          sessionId: "s2",
          providerId: "google",
          modelId: "m1",
          tokens: { input: 30, output: 15 },
          timestamp: NOW - 2000,
        },
      ],
    });

    expect(result).toHaveLength(2);

    const s1 = result.find((r) => r.sessionId === "s1");
    expect(s1).toBeDefined();
    expect(s1!.requestCount).toBe(2);
    expect(s1!.totals.input).toBe(30);
    expect(s1!.totals.output).toBe(15);

    const s2 = result.find((r) => r.sessionId === "s2");
    expect(s2).toBeDefined();
    expect(s2!.requestCount).toBe(1);
  });

  test("splits different models into separate streams", () => {
    const result = aggregateSessionUsage({
      agentId: "test",
      agentName: "Test",
      now: NOW,
      rows: [
        {
          sessionId: "s1",
          providerId: "google",
          modelId: "flash",
          tokens: { input: 10, output: 5 },
          timestamp: NOW,
        },
        {
          sessionId: "s1",
          providerId: "google",
          modelId: "pro",
          tokens: { input: 20, output: 10 },
          timestamp: NOW,
        },
      ],
    });

    expect(result).toHaveLength(1);
    expect(result[0]!.streams).toHaveLength(2);
    expect(result[0]!.requestCount).toBe(2);
  });

  test("marks session active when within threshold", () => {
    const result = aggregateSessionUsage({
      agentId: "test",
      agentName: "Test",
      now: NOW,
      activeThresholdMs: 60_000,
      rows: [
        {
          sessionId: "active",
          providerId: "g",
          modelId: "m",
          tokens: { input: 1, output: 1 },
          timestamp: NOW - 10_000,
        },
        {
          sessionId: "idle",
          providerId: "g",
          modelId: "m",
          tokens: { input: 1, output: 1 },
          timestamp: NOW - 120_000,
        },
      ],
    });

    const active = result.find((r) => r.sessionId === "active");
    const idle = result.find((r) => r.sessionId === "idle");
    expect(active!.status).toBe("active");
    expect(idle!.status).toBe("idle");
  });
});
