import { describe, expect, test } from "bun:test";
import { DEMO_PRESETS, type DemoPreset, DemoSimulator } from "./simulator.ts";

function summarize(sim: DemoSimulator) {
  const { sessions } = sim.tick();
  return {
    count: sessions.length,
    ids: sessions.map((s) => s.sessionId),
    names: sessions.map((s) => s.sessionName),
    totalCost: sessions.reduce((acc, s) => acc + (s.totalCostUsd ?? 0), 0),
    totalTokens: sessions.reduce((acc, s) => acc + s.totals.input + s.totals.output, 0),
    uniqueModels: new Set(sessions.flatMap((s) => s.streams.map((st) => st.modelId))).size,
    uniqueProviders: new Set(sessions.flatMap((s) => s.streams.map((st) => st.providerId))).size,
    uniqueProjects: new Set(sessions.map((s) => s.projectPath).filter(Boolean)).size,
    uniqueAgents: new Set(sessions.map((s) => s.agentId)).size,
  };
}

describe("DemoSimulator determinism", () => {
  for (const preset of Object.keys(DEMO_PRESETS) as DemoPreset[]) {
    test(`same seed + preset=${preset} produces identical sessions`, () => {
      const a = summarize(new DemoSimulator({ seed: 42, preset }));
      const b = summarize(new DemoSimulator({ seed: 42, preset }));

      expect(b.count).toBe(a.count);
      expect(b.ids).toEqual(a.ids);
      expect(b.names).toEqual(a.names);
      expect(b.totalCost).toBeCloseTo(a.totalCost, 6);
      expect(b.totalTokens).toBe(a.totalTokens);
    });
  }

  test("different seeds produce different sessions", () => {
    const a = summarize(new DemoSimulator({ seed: 1, preset: "heavy" }));
    const b = summarize(new DemoSimulator({ seed: 2, preset: "heavy" }));

    expect(b.ids).not.toEqual(a.ids);
    expect(b.totalCost).not.toBeCloseTo(a.totalCost, 2);
  });

  test("preset controls session count", () => {
    expect(summarize(new DemoSimulator({ seed: 7, preset: "light" })).count).toBe(50);
    expect(summarize(new DemoSimulator({ seed: 7, preset: "normal" })).count).toBe(500);
    expect(summarize(new DemoSimulator({ seed: 7, preset: "heavy" })).count).toBe(4000);
  });

  test("repeated ticks keep historical sessions stable", () => {
    const sim = new DemoSimulator({ seed: 99, preset: "normal" });
    const first = sim.tick().sessions.filter((s) => s.endedAt !== undefined);
    const second = sim.tick().sessions.filter((s) => s.endedAt !== undefined);

    expect(second.length).toBe(first.length);
    for (let i = 0; i < first.length; i++) {
      expect(second[i]!.sessionId).toBe(first[i]!.sessionId);
      expect(second[i]!.totalCostUsd).toBe(first[i]!.totalCostUsd);
      expect(second[i]!.totals.input).toBe(first[i]!.totals.input);
      expect(second[i]!.totals.output).toBe(first[i]!.totals.output);
    }
  });
});

describe("DemoSimulator variety", () => {
  test("heavy preset produces enough models to stress the dashboard list", () => {
    const s = summarize(new DemoSimulator({ seed: 42, preset: "heavy" }));
    expect(s.uniqueModels).toBeGreaterThanOrEqual(12);
    expect(s.uniqueProviders).toBeGreaterThanOrEqual(5);
    expect(s.uniqueProjects).toBeGreaterThanOrEqual(10);
    expect(s.uniqueAgents).toBeGreaterThanOrEqual(4);
  });

  test("normal preset still covers multiple models and agents", () => {
    const s = summarize(new DemoSimulator({ seed: 42, preset: "normal" }));
    expect(s.uniqueModels).toBeGreaterThanOrEqual(8);
    expect(s.uniqueAgents).toBeGreaterThanOrEqual(3);
  });

  test("sessions are split between active and historical", () => {
    const { sessions } = new DemoSimulator({ seed: 42, preset: "heavy" }).tick();
    const active = sessions.filter((s) => s.endedAt === undefined);
    const historical = sessions.filter((s) => s.endedAt !== undefined);
    expect(active.length).toBeGreaterThan(0);
    expect(active.length).toBeLessThanOrEqual(8);
    expect(historical.length).toBeGreaterThan(active.length * 10);
  });

  test("heavy preset has enough recent sessions to trigger scrollbar", () => {
    const { sessions } = new DemoSimulator({ seed: 42, preset: "heavy" }).tick();
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recent = sessions.filter((s) => s.lastActivityAt >= cutoff);
    expect(recent.length).toBeGreaterThanOrEqual(50);
  });
});
