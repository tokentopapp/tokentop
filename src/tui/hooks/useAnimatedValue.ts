import { useEffect, useRef, useState } from "react";
import { animationTick } from "./useAnimationTick.ts";

export type EasingFunction = (t: number) => number;

export const easings = {
  linear: (t: number) => t,
  easeOutQuad: (t: number) => 1 - (1 - t) * (1 - t),
  easeOutCubic: (t: number) => 1 - (1 - t) ** 3,
  easeOutExpo: (t: number) => (t === 1 ? 1 : 1 - 2 ** (-10 * t)),
  easeInOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
} as const;

export interface UseAnimatedValueOptions {
  durationMs?: number;
  easing?: keyof typeof easings | EasingFunction;
  precision?: number;
  /** @deprecated Ignored — animations now use the global 30 Hz tick. */
  frameRate?: number;
}

export function useAnimatedValue(
  targetValue: number,
  options: UseAnimatedValueOptions = {},
): number {
  const { durationMs = 300, easing = "easeOutQuad", precision = 2 } = options;

  const [displayValue, setDisplayValue] = useState(targetValue);
  const displayRef = useRef(targetValue);
  const startValueRef = useRef(targetValue);
  const startTimeRef = useRef(0);
  const targetRef = useRef(targetValue);
  const unsubRef = useRef<(() => void) | null>(null);

  const easingFn = typeof easing === "function" ? easing : easings[easing];

  useEffect(() => {
    // Already at target — nothing to animate
    if (targetRef.current === targetValue && displayRef.current === targetValue) {
      return;
    }

    // Clean up any existing subscription
    unsubRef.current?.();

    // Set up animation from current display value to new target
    startValueRef.current = displayRef.current;
    startTimeRef.current = Date.now();
    targetRef.current = targetValue;

    // Subscribe to global tick — auto-starts the shared timer
    unsubRef.current = animationTick.subscribe((now) => {
      const elapsed = now - startTimeRef.current;
      const progress = Math.min(elapsed / durationMs, 1);
      const easedProgress = easingFn(progress);
      const startVal = startValueRef.current;
      const target = targetRef.current;
      const currentValue = startVal + (target - startVal) * easedProgress;
      const rounded = Number(currentValue.toFixed(precision));

      displayRef.current = rounded;
      setDisplayValue(rounded);

      if (progress >= 1) {
        displayRef.current = target;
        setDisplayValue(target);
        // Unsubscribe — if no other animations are active, the global timer stops
        unsubRef.current?.();
        unsubRef.current = null;
      }
    });

    return () => {
      unsubRef.current?.();
      unsubRef.current = null;
    };
  }, [targetValue, durationMs, easingFn, precision]);

  return displayValue;
}

export function useAnimatedCurrency(
  targetValue: number,
  options: Omit<UseAnimatedValueOptions, "precision"> = {},
): string {
  const animatedValue = useAnimatedValue(targetValue, { ...options, precision: 2 });
  return `$${animatedValue.toFixed(2)}`;
}

export function useAnimatedTokens(
  targetValue: number,
  options: Omit<UseAnimatedValueOptions, "precision"> = {},
): string {
  const animatedValue = useAnimatedValue(targetValue, { ...options, precision: 0 });

  if (animatedValue >= 1_000_000) {
    return `${(animatedValue / 1_000_000).toFixed(1)}M`;
  }
  if (animatedValue >= 1_000) {
    return `${(animatedValue / 1_000).toFixed(1)}K`;
  }
  return Math.round(animatedValue).toLocaleString();
}

export function useAnimatedCount(
  targetValue: number,
  options: Omit<UseAnimatedValueOptions, "precision"> = {},
): string {
  const animatedValue = useAnimatedValue(targetValue, { ...options, precision: 0 });
  return Math.round(animatedValue).toLocaleString();
}
