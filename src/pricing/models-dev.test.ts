import { afterEach, describe, expect, mock, test } from "bun:test";
import { clearCache, getModelPricing, getProviderModels } from "./models-dev.ts";

const mockFetch = mock(() => Promise.resolve(new Response("null")));
globalThis.fetch = mockFetch as unknown as typeof fetch;

function makeApiResponse(costOverride?: Record<string, unknown>) {
  return {
    anthropic: {
      id: "anthropic",
      name: "Anthropic",
      models: {
        "claude-sonnet-4-20250514": {
          id: "claude-sonnet-4-20250514",
          name: "Claude Sonnet 4",
          family: "claude",
          cost: {
            input: 3,
            output: 15,
            cache_read: 0.3,
            cache_write: 3.75,
            ...costOverride,
          },
        },
      },
    },
  };
}

function mockApiResponse(data: unknown) {
  mockFetch.mockImplementation(() =>
    Promise.resolve(new Response(JSON.stringify(data), { status: 200 })),
  );
}

afterEach(() => {
  clearCache();
  mockFetch.mockClear();
});

describe("getModelPricing() — context_over_200k", () => {
  test("returns all longContext fields when API has full context_over_200k", async () => {
    mockApiResponse(
      makeApiResponse({
        context_over_200k: {
          input: 6,
          output: 22.5,
          cache_read: 0.6,
          cache_write: 7.5,
        },
      }),
    );

    const pricing = await getModelPricing("anthropic", "claude-sonnet-4-20250514");

    expect(pricing).not.toBeNull();
    expect(pricing!.longContextInput).toBe(6);
    expect(pricing!.longContextOutput).toBe(22.5);
    expect(pricing!.longContextCacheRead).toBe(0.6);
    expect(pricing!.longContextCacheWrite).toBe(7.5);
  });

  test("returns undefined longContext fields when API lacks context_over_200k", async () => {
    mockApiResponse(makeApiResponse());

    const pricing = await getModelPricing("anthropic", "claude-sonnet-4-20250514");

    expect(pricing).not.toBeNull();
    expect(pricing!.longContextInput).toBeUndefined();
    expect(pricing!.longContextOutput).toBeUndefined();
    expect(pricing!.longContextCacheRead).toBeUndefined();
    expect(pricing!.longContextCacheWrite).toBeUndefined();
    expect(pricing!.input).toBe(3);
    expect(pricing!.output).toBe(15);
  });

  test("handles partial context_over_200k (only input+output, no cache)", async () => {
    mockApiResponse(
      makeApiResponse({
        context_over_200k: {
          input: 6,
          output: 22.5,
        },
      }),
    );

    const pricing = await getModelPricing("anthropic", "claude-sonnet-4-20250514");

    expect(pricing).not.toBeNull();
    expect(pricing!.longContextInput).toBe(6);
    expect(pricing!.longContextOutput).toBe(22.5);
    expect(pricing!.longContextCacheRead).toBeUndefined();
    expect(pricing!.longContextCacheWrite).toBeUndefined();
  });

  test("getProviderModels() passes through longContext fields", async () => {
    mockApiResponse(
      makeApiResponse({
        context_over_200k: {
          input: 6,
          output: 22.5,
          cache_read: 0.6,
        },
      }),
    );

    const models = await getProviderModels("anthropic");

    expect(models).not.toBeNull();
    const pricing = models!["claude-sonnet-4-20250514"]!;
    expect(pricing).toBeDefined();
    expect(pricing.longContextInput).toBe(6);
    expect(pricing.longContextOutput).toBe(22.5);
    expect(pricing.longContextCacheRead).toBe(0.6);
    expect(pricing.longContextCacheWrite).toBeUndefined();
  });
});
