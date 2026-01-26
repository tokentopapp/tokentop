import { useState, useEffect, useRef } from 'react';

export type EasingFunction = (t: number) => number;

export const easings = {
  linear: (t: number) => t,
  easeOutQuad: (t: number) => 1 - (1 - t) * (1 - t),
  easeOutCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  easeOutExpo: (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  easeInOutQuad: (t: number) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
} as const;

export interface UseAnimatedValueOptions {
  durationMs?: number;
  easing?: keyof typeof easings | EasingFunction;
  precision?: number;
  frameRate?: number;
}

export function useAnimatedValue(
  targetValue: number,
  options: UseAnimatedValueOptions = {}
): number {
  const { 
    durationMs = 300, 
    easing = 'easeOutQuad',
    precision = 2,
    frameRate = 60,
  } = options;

  const [displayValue, setDisplayValue] = useState(targetValue);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startValueRef = useRef(targetValue);
  const startTimeRef = useRef<number>(Date.now());
  const targetRef = useRef(targetValue);

  const easingFn = typeof easing === 'function' ? easing : easings[easing];
  const frameInterval = Math.round(1000 / frameRate);

  useEffect(() => {
    if (targetRef.current === targetValue && displayValue === targetValue) {
      return;
    }

    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
    }

    startValueRef.current = displayValue;
    startTimeRef.current = Date.now();
    targetRef.current = targetValue;

    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const progress = Math.min(elapsed / durationMs, 1);
      const easedProgress = easingFn(progress);
      
      const startVal = startValueRef.current;
      const currentValue = startVal + (targetRef.current - startVal) * easedProgress;
      const roundedValue = Number(currentValue.toFixed(precision));
      
      setDisplayValue(roundedValue);

      if (progress >= 1) {
        if (intervalRef.current !== null) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        setDisplayValue(targetRef.current);
      }
    }, frameInterval);

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [targetValue, durationMs, easingFn, precision, frameInterval, displayValue]);

  return displayValue;
}

export function useAnimatedCurrency(
  targetValue: number,
  options: Omit<UseAnimatedValueOptions, 'precision'> = {}
): string {
  const animatedValue = useAnimatedValue(targetValue, { ...options, precision: 2 });
  return `$${animatedValue.toFixed(2)}`;
}

export function useAnimatedTokens(
  targetValue: number,
  options: Omit<UseAnimatedValueOptions, 'precision'> = {}
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
  options: Omit<UseAnimatedValueOptions, 'precision'> = {}
): string {
  const animatedValue = useAnimatedValue(targetValue, { ...options, precision: 0 });
  return Math.round(animatedValue).toLocaleString();
}
