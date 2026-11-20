import { describe, expect, test } from "bun:test";
import { FALLBACK_PRICING, getFallbackPricing, getFallbackProviderPricing } from "./fallback.ts";

describe("getFallbackPricing()", () => {
  test("returns pricing for an exact model match", () => {
    expect(getFallbackPricing("openai", "gpt-4.1")).toEqual({
      input: 2,
      output: 8,
      cacheRead: 0.5,
      source: "fallback",
    });
  });

  test("returns pricing when model id includes a known key", () => {
    expect(getFallbackPricing("anthropic", "claude-3-7-sonnet-20250219-thinking")).toEqual({
      input: 3,
      output: 15,
      cacheRead: 0.3,
      cacheWrite: 3.75,
      source: "fallback",
    });
  });

  test("prefers the most specific key when several keys match a dated id", () => {
    expect(getFallbackPricing("openai", "gpt-4o-mini-2024-07-18")).toEqual({
      input: 0.15,
      output: 0.6,
      cacheRead: 0.075,
      source: "fallback",
    });
    expect(getFallbackPricing("openai", "gpt-4.1-mini-2025-04-14")).toEqual({
      input: 0.4,
      output: 1.6,
      cacheRead: 0.1,
      source: "fallback",
    });
    expect(getFallbackPricing("openai", "o3-mini-2025-01-31")).toEqual({
      input: 1.1,
      output: 4.4,
      source: "fallback",
    });
    expect(getFallbackPricing("openai", "o1-mini-2024-09-12")).toEqual({
      input: 1.1,
      output: 4.4,
      source: "fallback",
    });
  });

  test("returns pricing when a known key includes the model id", () => {
    expect(getFallbackPricing("google", "gemini-2.5")).toEqual({
      input: 1.25,
      output: 10,
      source: "fallback",
    });
  });

  test("returns null for unknown provider", () => {
    expect(getFallbackPricing("unknown-provider", "gpt-4.1")).toBeNull();
  });

  test("returns null for unknown model in a known provider", () => {
    expect(getFallbackPricing("openai", "totally-unknown-model")).toBeNull();
  });
});

describe("getFallbackProviderPricing()", () => {
  test("returns the full provider pricing map", () => {
    const anthropicPricing = FALLBACK_PRICING["anthropic"];
    if (!anthropicPricing) {
      throw new Error("Expected anthropic fallback pricing to exist");
    }
    expect(getFallbackProviderPricing("anthropic")).toEqual(anthropicPricing);
  });

  test("returns null for unknown provider", () => {
    expect(getFallbackProviderPricing("does-not-exist")).toBeNull();
  });
});

describe("FALLBACK_PRICING", () => {
  test("includes anthropic provider pricing data", () => {
    expect(FALLBACK_PRICING["anthropic"]).toBeDefined();
  });

  test("includes openai provider pricing data", () => {
    expect(FALLBACK_PRICING["openai"]).toBeDefined();
  });

  test("includes google provider pricing data", () => {
    expect(FALLBACK_PRICING["google"]).toBeDefined();
  });
});
