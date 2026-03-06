/**
 * Global animation tick manager.
 *
 * Replaces per-component setInterval timers with a single shared 30 Hz tick.
 * This eliminates the ~90 concurrent timers that were causing ~2,400 state
 * updates/sec and ~60% CPU usage at idle.
 *
 * The tick automatically starts when the first subscriber joins and stops
 * when the last subscriber leaves, consuming zero CPU when no animations
 * are active.
 *
 * @see https://github.com/tokentopapp/tokentop/issues/55
 */
import { useEffect, useRef } from "react";

type TickCallback = (now: number) => void;

const TICK_RATE_HZ = 30;
const TICK_INTERVAL_MS = Math.round(1000 / TICK_RATE_HZ);

class AnimationTickManager {
  private callbacks = new Set<TickCallback>();
  private interval: ReturnType<typeof setInterval> | null = null;

  /**
   * Subscribe a callback to the global tick.
   * Returns an unsubscribe function. When the last subscriber leaves,
   * the underlying setInterval is cleared automatically.
   */
  subscribe(callback: TickCallback): () => void {
    this.callbacks.add(callback);
    if (this.callbacks.size === 1) {
      this.start();
    }
    return () => {
      this.callbacks.delete(callback);
      if (this.callbacks.size === 0) {
        this.stop();
      }
    };
  }

  /** Number of active subscribers (useful for debugging). */
  get subscriberCount(): number {
    return this.callbacks.size;
  }

  /** Whether the global interval is currently running. */
  get isRunning(): boolean {
    return this.interval !== null;
  }

  private start(): void {
    if (this.interval !== null) return;
    this.interval = setInterval(() => {
      const now = Date.now();
      for (const cb of this.callbacks) {
        cb(now);
      }
    }, TICK_INTERVAL_MS);
  }

  private stop(): void {
    if (this.interval !== null) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
}

/** Global animation tick singleton — single 30 Hz timer shared by all hooks. */
export const animationTick = new AnimationTickManager();

/**
 * React hook to subscribe to the global animation tick.
 *
 * The callback fires at ~30 Hz while `active` is true.
 * Uses a ref to always call the latest callback (no stale closures).
 *
 * @param callback - Called with current timestamp (Date.now()) on each tick
 * @param active - Whether to subscribe (default: true). When false, the
 *   subscription is paused and the global timer may stop if no other
 *   subscribers remain.
 */
export function useAnimationTick(callback: TickCallback, active = true): void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!active) return;
    return animationTick.subscribe((now) => callbackRef.current(now));
  }, [active]);
}
