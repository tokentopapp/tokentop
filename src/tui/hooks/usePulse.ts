import { useEffect, useRef, useState } from "react";
import { animationTick } from "./useAnimationTick.ts";

/**
 * Options for the usePulse hook.
 */
export interface UsePulseOptions {
  /** Whether the pulse animation is enabled */
  enabled: boolean;
  /** Interval between steps in milliseconds (default: 200) */
  intervalMs?: number;
  /** Number of steps in the pulse cycle (default: 12) */
  steps?: number;
}

/**
 * Parses a hex color string to RGB components.
 * Supports both 3-digit (#RGB) and 6-digit (#RRGGBB) formats.
 *
 * @param hex - Hex color string (e.g., "#ff0000" or "#f00")
 * @returns RGB tuple [r, g, b] or null if invalid
 */
function parseHexColor(hex: string): [number, number, number] | null {
  const cleanHex = hex.startsWith("#") ? hex.slice(1) : hex;

  let expandedHex: string;

  if (cleanHex.length === 3) {
    const c0 = cleanHex.slice(0, 1);
    const c1 = cleanHex.slice(1, 2);
    const c2 = cleanHex.slice(2, 3);
    expandedHex = c0 + c0 + c1 + c1 + c2 + c2;
  } else if (cleanHex.length === 6) {
    expandedHex = cleanHex;
  } else {
    return null;
  }

  const r = parseInt(expandedHex.slice(0, 2), 16);
  const g = parseInt(expandedHex.slice(2, 4), 16);
  const b = parseInt(expandedHex.slice(4, 6), 16);

  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
    return null;
  }

  return [r, g, b];
}

/**
 * Converts RGB components to a hex color string.
 *
 * @param r - Red component (0-255)
 * @param g - Green component (0-255)
 * @param b - Blue component (0-255)
 * @returns Hex color string (e.g., "#ff0000")
 */
function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => {
    const clamped = Math.max(0, Math.min(255, Math.round(n)));
    return clamped.toString(16).padStart(2, "0");
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Interpolates between two colors based on a pulse step.
 * Uses sine wave for smooth pulsing effect.
 *
 * @param step - Current pulse step (0 to steps-1)
 * @param baseColor - Base color hex string (e.g., "#333333")
 * @param peakColor - Peak color hex string (e.g., "#ff0000")
 * @param steps - Total number of steps in the pulse cycle (default: 12)
 * @returns Interpolated hex color string
 *
 * @example
 * ```ts
 * const color = getPulseColor(3, "#333333", "#ff0000", 12);
 * ```
 */
export function getPulseColor(
  step: number,
  baseColor: string,
  peakColor: string,
  steps: number = 12,
): string {
  const baseRgb = parseHexColor(baseColor);
  const peakRgb = parseHexColor(peakColor);

  if (!baseRgb || !peakRgb) {
    return baseColor;
  }

  const t = Math.sin((step / steps) * Math.PI);

  const r = baseRgb[0] + (peakRgb[0] - baseRgb[0]) * t;
  const g = baseRgb[1] + (peakRgb[1] - baseRgb[1]) * t;
  const b = baseRgb[2] + (peakRgb[2] - baseRgb[2]) * t;

  return rgbToHex(r, g, b);
}

/**
 * Hook for creating pulse animations.
 * Returns the current step in the pulse cycle, which can be used
 * with getPulseColor to create smooth color transitions.
 *
 * Subscribes to the global animation tick when enabled and unsubscribes
 * when disabled, so the global timer stops when no pulses are active.
 *
 * @param options - Configuration options for the pulse animation
 * @returns Current step in the pulse cycle (0 to steps-1), or 0 when disabled
 *
 * @example
 * ```tsx
 * function WarningIndicator({ isWarning }: { isWarning: boolean }) {
 *   const step = usePulse({ enabled: isWarning, intervalMs: 150, steps: 12 });
 *   const color = getPulseColor(step, "#333333", "#ff6600", 12);
 *
 *   return <Box borderColor={color}>Warning!</Box>;
 * }
 * ```
 */
export function usePulse(options: UsePulseOptions): number {
  const { enabled, intervalMs = 200, steps = 12 } = options;
  const [step, setStep] = useState(0);
  const lastAdvanceRef = useRef(Date.now());

  useEffect(() => {
    if (!enabled) {
      setStep(0);
      return;
    }

    return animationTick.subscribe((now) => {
      if (now - lastAdvanceRef.current >= intervalMs) {
        lastAdvanceRef.current = now;
        setStep((prev) => (prev + 1) % steps);
      }
    });
  }, [enabled, intervalMs, steps]);

  return step;
}
