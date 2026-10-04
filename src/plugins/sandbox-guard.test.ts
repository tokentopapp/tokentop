import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { PluginPermissionError } from "@tokentop/plugin-sdk";
import { clearCache, getModelPricing } from "../pricing/models-dev.ts";
import {
  deepFreeze,
  getActivePluginGuard,
  installGlobalFetchGuard,
  runInPluginGuard,
  runOutsidePluginGuard,
} from "./sandbox-guard.ts";

const originalFetch = globalThis.fetch;
const fetchCalls: string[] = [];
let mockResponseBody = "ok";

function makeModelsDevResponse() {
  return {
    anthropic: {
      id: "anthropic",
      name: "Anthropic",
      models: {
        "claude-sonnet-4-20250514": {
          id: "claude-sonnet-4-20250514",
          name: "Claude Sonnet 4",
          family: "claude",
          cost: { input: 3, output: 15 },
        },
      },
    },
  };
}

const mockFetch: typeof fetch = Object.assign(
  (input: string | URL | Request, _init?: RequestInit): Promise<Response> => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    fetchCalls.push(url);
    return Promise.resolve(new Response(mockResponseBody, { status: 200 }));
  },
  { preconnect: originalFetch.preconnect },
);

describe("deepFreeze", () => {
  test("freezes a plain object", () => {
    const obj = { a: 1 };
    deepFreeze(obj);

    expect(Object.isFrozen(obj)).toBe(true);
  });

  test("freezes nested objects recursively", () => {
    const obj = {
      top: {
        child: {
          value: 1,
        },
      },
    };

    deepFreeze(obj);

    expect(Object.isFrozen(obj)).toBe(true);
    expect(Object.isFrozen(obj.top)).toBe(true);
    expect(Object.isFrozen(obj.top.child)).toBe(true);
  });

  test("returns the same reference", () => {
    const obj = { nested: { value: 1 } };
    const frozen = deepFreeze(obj);

    expect(frozen).toBe(obj);
  });

  test("handles null and undefined gracefully", () => {
    expect(deepFreeze(null)).toBeNull();
    expect(deepFreeze(undefined)).toBeUndefined();
  });

  test("handles circular references without infinite loop", () => {
    const obj: { self?: unknown; nested: { parent?: unknown } } = {
      nested: {},
    };
    obj.self = obj;
    obj.nested.parent = obj;

    const frozen = deepFreeze(obj);

    expect(frozen).toBe(obj);
    expect(Object.isFrozen(obj)).toBe(true);
    expect(Object.isFrozen(obj.nested)).toBe(true);
  });

  test("handles already-frozen objects", () => {
    const obj = Object.freeze({ already: true });

    const frozen = deepFreeze(obj);

    expect(frozen).toBe(obj);
    expect(Object.isFrozen(frozen)).toBe(true);
  });
});

describe("runInPluginGuard and getActivePluginGuard", () => {
  test("returns undefined outside guard", () => {
    expect(getActivePluginGuard()).toBeUndefined();
  });

  test("returns plugin context inside guard", () => {
    const context = runInPluginGuard("plugin-a", {}, () => getActivePluginGuard());

    expect(context).toBeDefined();
    expect(context?.pluginId).toBe("plugin-a");
  });

  test("preserves context across async/await", async () => {
    const context = await runInPluginGuard("plugin-async", {}, async () => {
      await Promise.resolve();
      return getActivePluginGuard();
    });

    expect(context).toBeDefined();
    expect(context?.pluginId).toBe("plugin-async");
  });

  test("nested guards use the innermost context", () => {
    const contexts = runInPluginGuard("outer-plugin", {}, () => {
      const outerBefore = getActivePluginGuard();
      const inner = runInPluginGuard("inner-plugin", {}, () => getActivePluginGuard());
      const outerAfter = getActivePluginGuard();

      return { outerBefore, inner, outerAfter };
    });

    expect(contexts.outerBefore?.pluginId).toBe("outer-plugin");
    expect(contexts.inner?.pluginId).toBe("inner-plugin");
    expect(contexts.outerAfter?.pluginId).toBe("outer-plugin");
  });

  test("trusted host work temporarily exits and restores plugin context", async () => {
    const contexts = await runInPluginGuard("outer-plugin", {}, async () => {
      const before = getActivePluginGuard();
      const outside = await runOutsidePluginGuard(async () => {
        await Promise.resolve();
        return getActivePluginGuard();
      });

      return { before, outside, after: getActivePluginGuard() };
    });

    expect(contexts.before?.pluginId).toBe("outer-plugin");
    expect(contexts.outside).toBeUndefined();
    expect(contexts.after?.pluginId).toBe("outer-plugin");
  });
});

describe("installGlobalFetchGuard", () => {
  beforeAll(() => {
    globalThis.fetch = mockFetch;
    installGlobalFetchGuard();
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  test("outside guard, fetch calls pass through", async () => {
    fetchCalls.length = 0;

    const response = await fetch("https://outside-guard.example");

    expect(response.status).toBe(200);
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]).toContain("outside-guard.example");
  });

  test("inside guard with no network permission throws PluginPermissionError", () => {
    expect(() => {
      runInPluginGuard("plugin-no-network", {}, () => {
        void fetch("https://blocked.example");
      });
    }).toThrow(PluginPermissionError);
  });

  test("inside guard with allowedDomains blocks unlisted domains", () => {
    expect(() => {
      runInPluginGuard(
        "plugin-allowlist",
        {
          network: {
            enabled: true,
            allowedDomains: ["allowed.example"],
          },
        },
        () => {
          void fetch("https://not-allowed.example/path");
        },
      );
    }).toThrow(PluginPermissionError);
  });

  test("inside guard with allowedDomains allows listed domains and subdomains", async () => {
    fetchCalls.length = 0;

    const response = await runInPluginGuard(
      "plugin-allowlist",
      {
        network: {
          enabled: true,
          allowedDomains: ["allowed.example"],
        },
      },
      async () => {
        const rootResponse = await fetch("https://allowed.example/path");
        await fetch("https://api.allowed.example/path");
        return rootResponse;
      },
    );

    expect(response.status).toBe(200);
    expect(fetchCalls).toHaveLength(2);
    expect(fetchCalls[0]).toContain("allowed.example/path");
    expect(fetchCalls[1]).toContain("api.allowed.example/path");
  });

  test("direct plugin requests to models.dev remain blocked", () => {
    fetchCalls.length = 0;

    expect(() => {
      runInPluginGuard(
        "anthropic",
        {
          network: {
            enabled: true,
            allowedDomains: ["api.anthropic.com"],
          },
        },
        () => {
          void fetch("https://models.dev/api.json");
        },
      );
    }).toThrow(PluginPermissionError);

    expect(fetchCalls).toHaveLength(0);
  });

  test("host pricing refresh bypasses plugin restrictions without logging a denial", async () => {
    clearCache();
    fetchCalls.length = 0;
    const originalResponseBody = mockResponseBody;
    mockResponseBody = JSON.stringify(makeModelsDevResponse());
    const errors: Parameters<typeof console.error>[] = [];
    const originalError = console.error;
    console.error = (...args: Parameters<typeof console.error>) => {
      errors.push(args);
    };

    try {
      const result = await runInPluginGuard(
        "anthropic",
        {
          network: {
            enabled: true,
            allowedDomains: ["api.anthropic.com"],
          },
        },
        () => getModelPricing("anthropic", "claude-sonnet-4-20250514"),
      );

      expect(result?.input).toBe(3);
      expect(result?.output).toBe(15);
      expect(fetchCalls).toEqual(["https://models.dev/api.json"]);
      expect(errors).toHaveLength(0);
    } finally {
      console.error = originalError;
      mockResponseBody = originalResponseBody;
      clearCache();
    }
  });

  test("concurrent pricing refreshes share one models.dev request", async () => {
    clearCache();
    fetchCalls.length = 0;
    const originalResponseBody = mockResponseBody;
    mockResponseBody = JSON.stringify(makeModelsDevResponse());

    try {
      const results = await runInPluginGuard(
        "anthropic",
        {
          network: {
            enabled: true,
            allowedDomains: ["api.anthropic.com"],
          },
        },
        () =>
          Promise.all([
            getModelPricing("anthropic", "claude-sonnet-4-20250514"),
            getModelPricing("anthropic", "claude-sonnet-4-20250514"),
          ]),
      );

      expect(results.map((pricing) => pricing?.input)).toEqual([3, 3]);
      expect(fetchCalls).toEqual(["https://models.dev/api.json"]);
    } finally {
      mockResponseBody = originalResponseBody;
      clearCache();
    }
  });
});
