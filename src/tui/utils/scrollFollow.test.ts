import { describe, expect, test } from "bun:test";
import { computeScrollOffset } from "./scrollFollow.ts";

describe("computeScrollOffset", () => {
  test("cursor inside viewport leaves offset unchanged", () => {
    expect(computeScrollOffset(5, 0, 10, 100)).toBe(0);
  });

  test("cursor at bottom edge leaves offset unchanged", () => {
    expect(computeScrollOffset(9, 0, 10, 100)).toBe(0);
  });

  test("cursor past bottom pulls offset down by one row", () => {
    expect(computeScrollOffset(10, 0, 10, 100)).toBe(1);
  });

  test("cursor past top pulls offset up", () => {
    expect(computeScrollOffset(3, 5, 10, 100)).toBe(3);
  });

  test("clamps offset to non-negative", () => {
    expect(computeScrollOffset(0, 0, 10, 100)).toBe(0);
  });

  test("clamps offset to total - visibleRows", () => {
    expect(computeScrollOffset(99, 0, 10, 100)).toBe(90);
  });

  test("offset stays 0 when content fits in viewport", () => {
    expect(computeScrollOffset(3, 0, 10, 4)).toBe(0);
  });

  // Regression test for cursor-disappears-then-jump bug: rapid j presses
  // that React batches into a single render must still land with the cursor
  // visible at the bottom edge. Simulating N sequential functional updates
  // (the reducer runs each one in order) verifies the invariant.
  test("batched rapid j-presses keep cursor at bottom edge each step", () => {
    const vis = 10;
    const total = 1000;
    let state = { row: 0, offset: 0 };
    for (let i = 0; i < 50; i++) {
      const nextRow = Math.min(state.row + 1, total - 1);
      const nextOffset = computeScrollOffset(nextRow, state.offset, vis, total);
      state = { row: nextRow, offset: nextOffset };
      expect(state.row).toBeGreaterThanOrEqual(state.offset);
      expect(state.row).toBeLessThan(state.offset + vis);
    }
    expect(state.row).toBe(50);
    expect(state.offset).toBe(41);
  });

  test("batched rapid k-presses at top keep cursor at top edge", () => {
    const vis = 10;
    const total = 1000;
    let state = { row: 50, offset: 41 };
    for (let i = 0; i < 50; i++) {
      const nextRow = Math.max(state.row - 1, 0);
      const nextOffset = computeScrollOffset(nextRow, state.offset, vis, total);
      state = { row: nextRow, offset: nextOffset };
      expect(state.row).toBeGreaterThanOrEqual(state.offset);
      expect(state.row).toBeLessThan(state.offset + vis);
    }
    expect(state.row).toBe(0);
    expect(state.offset).toBe(0);
  });

  test("re-clamp when list shrinks below current offset", () => {
    expect(computeScrollOffset(5, 50, 10, 20)).toBe(5);
    expect(computeScrollOffset(19, 50, 10, 20)).toBe(10);
  });
});
