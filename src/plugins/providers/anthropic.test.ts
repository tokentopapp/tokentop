import { describe, expect, test } from "bun:test";
import type {
  Credentials,
  PluginHttpClient,
  PluginLogger,
  ProviderFetchContext,
} from "@tokentop/plugin-sdk";
import { anthropicPlugin } from "./anthropic.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockLogger(): PluginLogger {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  };
}

function createMockHttpClient(response: {
  status: number;
  statusText?: string;
  headers?: Record<string, string>;
  body?: unknown;
}): PluginHttpClient {
  return {
    fetch: async () =>
      new Response(JSON.stringify(response.body ?? {}), {
        status: response.status,
        statusText: response.statusText ?? "",
        headers: new Headers(response.headers ?? {}),
      }),
  };
}

function createFetchContext(
  overrides: { http?: PluginHttpClient; credentials?: Credentials } = {},
): ProviderFetchContext {
  return {
    credentials: overrides.credentials ?? {
      oauth: {
        accessToken: "test-token",
        expiresAt: Date.now() + 3_600_000, // 1 hour from now
      },
      source: "external",
    },
    http: overrides.http ?? createMockHttpClient({ status: 200, body: {} }),
    logger: createMockLogger(),
    config: {},
    signal: AbortSignal.timeout(5000),
  };
}

// ---------------------------------------------------------------------------
// 429 Rate limit handling
// ---------------------------------------------------------------------------

describe("anthropic fetchUsage — 429 rate limit", () => {
  test("returns rateLimited:true with default 300s when retry-after is 0", async () => {
    const http = createMockHttpClient({
      status: 429,
      statusText: "Too Many Requests",
      headers: { "retry-after": "0" },
      body: { error: { message: "Rate limited", type: "rate_limit_error" } },
    });

    const result = await anthropicPlugin.fetchUsage(createFetchContext({ http }));

    expect(result.rateLimited).toBe(true);
    expect(result.retryAfterMs).toBe(300_000); // 300s default when retry-after is 0
    expect(result.error).toContain("Rate limited");
    expect(result.error).toContain("300s");
  });

  test("returns rateLimited:true with parsed retry-after when positive", async () => {
    const http = createMockHttpClient({
      status: 429,
      statusText: "Too Many Requests",
      headers: { "retry-after": "60" },
      body: { error: { message: "Rate limited", type: "rate_limit_error" } },
    });

    const result = await anthropicPlugin.fetchUsage(createFetchContext({ http }));

    expect(result.rateLimited).toBe(true);
    expect(result.retryAfterMs).toBe(60_000); // 60s parsed from header
    expect(result.error).toContain("60s");
  });

  test("returns rateLimited:true with default 300s when no retry-after header", async () => {
    const http = createMockHttpClient({
      status: 429,
      statusText: "Too Many Requests",
      body: { error: { message: "Rate limited", type: "rate_limit_error" } },
    });

    const result = await anthropicPlugin.fetchUsage(createFetchContext({ http }));

    expect(result.rateLimited).toBe(true);
    expect(result.retryAfterMs).toBe(300_000); // 300s default
  });

  test("429 response always includes fetchedAt", async () => {
    const before = Date.now();
    const http = createMockHttpClient({
      status: 429,
      statusText: "Too Many Requests",
      headers: { "retry-after": "10" },
    });

    const result = await anthropicPlugin.fetchUsage(createFetchContext({ http }));

    expect(result.fetchedAt).toBeGreaterThanOrEqual(before);
    expect(result.fetchedAt).toBeLessThanOrEqual(Date.now());
  });
});

// ---------------------------------------------------------------------------
// Other HTTP error codes (regression — should NOT have rateLimited)
// ---------------------------------------------------------------------------

describe("anthropic fetchUsage — non-429 errors", () => {
  test("401 returns error without rateLimited", async () => {
    const http = createMockHttpClient({
      status: 401,
      statusText: "Unauthorized",
    });

    const result = await anthropicPlugin.fetchUsage(createFetchContext({ http }));

    expect(result.error).toContain("expired or invalid");
    expect(result.rateLimited).toBeUndefined();
    expect(result.retryAfterMs).toBeUndefined();
  });

  test("403 returns error without rateLimited", async () => {
    const http = createMockHttpClient({
      status: 403,
      statusText: "Forbidden",
    });

    const result = await anthropicPlugin.fetchUsage(createFetchContext({ http }));

    expect(result.error).toContain("lacks required scope");
    expect(result.rateLimited).toBeUndefined();
  });

  test("500 returns generic error without rateLimited", async () => {
    const http = createMockHttpClient({
      status: 500,
      statusText: "Internal Server Error",
    });

    const result = await anthropicPlugin.fetchUsage(createFetchContext({ http }));

    expect(result.error).toContain("500");
    expect(result.rateLimited).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Successful responses
// ---------------------------------------------------------------------------

describe("anthropic fetchUsage — success", () => {
  test("parses usage data correctly", async () => {
    const http = createMockHttpClient({
      status: 200,
      body: {
        five_hour: { utilization: 45.5, resets_at: "2026-03-08T15:00:00Z" },
        seven_day: { utilization: 72.3, resets_at: "2026-03-10T00:00:00Z" },
      },
    });

    const result = await anthropicPlugin.fetchUsage(createFetchContext({ http }));

    expect(result.error).toBeUndefined();
    expect(result.rateLimited).toBeUndefined();
    expect(result.limits?.primary?.usedPercent).toBe(46); // rounded from 45.5
    expect(result.limits?.primary?.label).toBe("5-hour window");
    expect(result.limits?.secondary?.usedPercent).toBe(72); // rounded from 72.3
    expect(result.limits?.secondary?.label).toBe("7-day window");
  });

  test("returns API plan type for apiKey-only credentials", async () => {
    const result = await anthropicPlugin.fetchUsage(
      createFetchContext({
        credentials: {
          apiKey: "sk-test-key",
          source: "env",
        },
      }),
    );

    expect(result.planType).toBe("API");
    expect(result.allowed).toBe(true);
    expect(result.error).toBeUndefined();
  });
});
