import { useEffect, useRef, useState } from "react";
import { animationTick } from "./useAnimationTick.ts";

export interface UseValueFlashOptions {
  durationMs?: number;
  increaseOnly?: boolean;
  threshold?: number;
}

export interface UseValueFlashResult {
  isFlashing: boolean;
  intensity: number;
  step: number;
}

export function useValueFlash(
  value: number,
  options: UseValueFlashOptions = {},
): UseValueFlashResult {
  const { durationMs = 600, increaseOnly = true, threshold = 0 } = options;

  const prevValueRef = useRef<number>(value);
  const [isFlashing, setIsFlashing] = useState(false);
  const [intensity, setIntensity] = useState(0);
  const flashStartRef = useRef(0);
  const unsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const prevValue = prevValueRef.current;
    const delta = value - prevValue;

    const shouldFlash = increaseOnly ? delta > threshold : Math.abs(delta) > threshold;

    if (shouldFlash && prevValue !== value) {
      // Clean up any existing subscription
      unsubRef.current?.();

      flashStartRef.current = Date.now();
      setIsFlashing(true);

      // Subscribe to global tick
      unsubRef.current = animationTick.subscribe((now) => {
        const elapsed = now - flashStartRef.current;
        const progress = elapsed / durationMs;

        if (progress >= 1) {
          setIsFlashing(false);
          setIntensity(0);
          unsubRef.current?.();
          unsubRef.current = null;
        } else {
          const currentIntensity = Math.sin(progress * Math.PI);
          setIntensity(currentIntensity);
        }
      });
    }

    prevValueRef.current = value;

    return () => {
      unsubRef.current?.();
      unsubRef.current = null;
    };
  }, [value, durationMs, increaseOnly, threshold]);

  // step is kept for backward API compatibility
  const step = isFlashing ? Math.round(intensity * 9) : 0;

  return { isFlashing, intensity, step };
}

export function interpolateColor(factor: number, colorA: string, colorB: string): string {
  const parseHex = (hex: string): [number, number, number] | null => {
    const clean = hex.startsWith("#") ? hex.slice(1) : hex;
    if (clean.length === 3) {
      const [r, g, b] = clean.split("").map((c) => parseInt(c + c, 16));
      return [r!, g!, b!];
    }
    if (clean.length === 6) {
      return [
        parseInt(clean.slice(0, 2), 16),
        parseInt(clean.slice(2, 4), 16),
        parseInt(clean.slice(4, 6), 16),
      ];
    }
    return null;
  };

  const a = parseHex(colorA);
  const b = parseHex(colorB);

  if (!a || !b) return colorA;

  const r = Math.round(a[0] + (b[0] - a[0]) * factor);
  const g = Math.round(a[1] + (b[1] - a[1]) * factor);
  const bl = Math.round(a[2] + (b[2] - a[2]) * factor);

  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${bl.toString(16).padStart(2, "0")}`;
}
