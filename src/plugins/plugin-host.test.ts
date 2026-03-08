import { afterEach, describe, expect, test } from "bun:test";
import { getPluginHealth, resetAllCircuits, safeInvoke } from "./plugin-host.ts";

afterEach(() => {
  resetAllCircuits();
});

// ---------------------------------------------------------------------------
// Baseline behaviour (no isFailure)
// ---------------------------------------------------------------------------

describe("safeInvoke — baseline", () => {
  test("returns ok:true on success", async () => {
    const result = await safeInvoke("test-plugin", "test", async () => 42);
    expect(result).toEqual({ ok: true, value: 42 });
  });

  test("returns ok:false on thrown error", async () => {
    const result = await safeInvoke("test-plugin", "test", async () => {
      throw new Error("boom");
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe("boom");
      expect(result.circuitOpen).toBe(false);
    }
  });

  test("increments failure count on thrown errors", async () => {
    for (let i = 0; i < 3; i++) {
      await safeInvoke("fail-plugin", "test", async () => {
        throw new Error("oops");
      });
    }
    const health = getPluginHealth("fail-plugin");
    expect(health.consecutiveFailures).toBe(3);
    expect(health.totalFailures).toBe(3);
  });

  test("resets failure count on success", async () => {
    // Fail twice
    for (let i = 0; i < 2; i++) {
      await safeInvoke("reset-plugin", "test", async () => {
        throw new Error("fail");
      });
    }
    expect(getPluginHealth("reset-plugin").consecutiveFailures).toBe(2);

    // Succeed once — should reset
    await safeInvoke("reset-plugin", "test", async () => "ok");
    expect(getPluginHealth("reset-plugin").consecutiveFailures).toBe(0);
  });

  test("trips circuit after 5 consecutive failures", async () => {
    for (let i = 0; i < 5; i++) {
      await safeInvoke("trip-plugin", "test", async () => {
        throw new Error("fail");
      });
    }
    const health = getPluginHealth("trip-plugin");
    expect(health.healthy).toBe(false);
    expect(health.disabledUntil).not.toBeNull();

    // Next call should be short-circuited
    const result = await safeInvoke("trip-plugin", "test", async () => "ok");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.circuitOpen).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// isFailure predicate (the new feature)
// ---------------------------------------------------------------------------

interface MockUsage {
  value: number;
  error?: string;
  rateLimited?: boolean;
}

describe("safeInvoke — isFailure predicate", () => {
  test("counts logical failures when isFailure returns true", async () => {
    const isFailure = (v: MockUsage) => !!v.error && !v.rateLimited;

    const result = await safeInvoke(
      "logical-fail",
      "fetchUsage",
      async () => ({ value: 0, error: "API error: 500 Internal Server Error" }),
      { isFailure },
    );

    // Still returns ok:true so caller can inspect the error details
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.error).toContain("500");
    }

    // But the circuit breaker counted it as a failure
    const health = getPluginHealth("logical-fail");
    expect(health.consecutiveFailures).toBe(1);
    expect(health.totalFailures).toBe(1);
  });

  test("does NOT count rate-limited responses as failures", async () => {
    const isFailure = (v: MockUsage) => !!v.error && !v.rateLimited;

    const result = await safeInvoke(
      "rate-limit",
      "fetchUsage",
      async () => ({
        value: 0,
        error: "Rate limited. Retry after 300s.",
        rateLimited: true,
      }),
      { isFailure },
    );

    expect(result.ok).toBe(true);
    const health = getPluginHealth("rate-limit");
    expect(health.consecutiveFailures).toBe(0);
    expect(health.totalFailures).toBe(0);
  });

  test("resets failures after a true success", async () => {
    const isFailure = (v: MockUsage) => !!v.error;

    // Fail 3 times logically
    for (let i = 0; i < 3; i++) {
      await safeInvoke(
        "reset-after-logical",
        "fetchUsage",
        async () => ({ value: 0, error: "fail" }),
        { isFailure },
      );
    }
    expect(getPluginHealth("reset-after-logical").consecutiveFailures).toBe(3);

    // Succeed — should reset
    await safeInvoke("reset-after-logical", "fetchUsage", async () => ({ value: 42 }), {
      isFailure,
    });
    expect(getPluginHealth("reset-after-logical").consecutiveFailures).toBe(0);
  });

  test("trips circuit after 5 consecutive logical failures", async () => {
    const isFailure = (v: MockUsage) => !!v.error;

    for (let i = 0; i < 5; i++) {
      await safeInvoke(
        "trip-logical",
        "fetchUsage",
        async () => ({ value: 0, error: `fail ${i}` }),
        { isFailure },
      );
    }

    const health = getPluginHealth("trip-logical");
    expect(health.healthy).toBe(false);
    expect(health.consecutiveFailures).toBe(5);
    expect(health.disabledUntil).not.toBeNull();
  });

  test("mixes thrown errors and logical failures for circuit breaker", async () => {
    const isFailure = (v: MockUsage) => !!v.error;

    // 3 logical failures
    for (let i = 0; i < 3; i++) {
      await safeInvoke("mixed-fail", "fetchUsage", async () => ({ value: 0, error: "logical" }), {
        isFailure,
      });
    }

    // 2 thrown errors
    for (let i = 0; i < 2; i++) {
      await safeInvoke("mixed-fail", "fetchUsage", async () => {
        throw new Error("thrown");
      });
    }

    // Total: 5 consecutive failures → circuit should trip
    const health = getPluginHealth("mixed-fail");
    expect(health.consecutiveFailures).toBe(5);
    expect(health.healthy).toBe(false);
  });

  test("does not treat successful value as failure when isFailure returns false", async () => {
    const result = await safeInvoke("success-check", "fetchUsage", async () => ({ value: 42 }), {
      isFailure: (v: MockUsage) => !!v.error,
    });

    expect(result.ok).toBe(true);
    const health = getPluginHealth("success-check");
    expect(health.consecutiveFailures).toBe(0);
  });
});
