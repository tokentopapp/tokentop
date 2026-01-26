import { useState, useEffect, useRef } from 'react';

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
  options: UseValueFlashOptions = {}
): UseValueFlashResult {
  const { durationMs = 600, increaseOnly = true, threshold = 0 } = options;
  
  const prevValueRef = useRef<number>(value);
  const [isFlashing, setIsFlashing] = useState(false);
  const [step, setStep] = useState(0);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const steps = 18;
  const stepDuration = durationMs / steps;

  useEffect(() => {
    const prevValue = prevValueRef.current;
    const delta = value - prevValue;
    
    const shouldFlash = increaseOnly 
      ? delta > threshold 
      : Math.abs(delta) > threshold;

    if (shouldFlash && prevValue !== value) {
      if (flashTimeoutRef.current) {
        clearTimeout(flashTimeoutRef.current);
      }
      if (animationIntervalRef.current) {
        clearInterval(animationIntervalRef.current);
      }

      setIsFlashing(true);
      setStep(0);

      let currentStep = 0;
      animationIntervalRef.current = setInterval(() => {
        currentStep++;
        if (currentStep >= steps) {
          if (animationIntervalRef.current) {
            clearInterval(animationIntervalRef.current);
            animationIntervalRef.current = null;
          }
          setIsFlashing(false);
          setStep(0);
        } else {
          setStep(currentStep);
        }
      }, stepDuration);
    }

    prevValueRef.current = value;

    return () => {
      if (flashTimeoutRef.current) {
        clearTimeout(flashTimeoutRef.current);
      }
      if (animationIntervalRef.current) {
        clearInterval(animationIntervalRef.current);
      }
    };
  }, [value, durationMs, increaseOnly, threshold, steps, stepDuration]);

  const intensity = isFlashing 
    ? Math.sin((step / steps) * Math.PI) 
    : 0;

  return { isFlashing, intensity, step };
}

export function interpolateColor(factor: number, colorA: string, colorB: string): string {
  const parseHex = (hex: string): [number, number, number] | null => {
    const clean = hex.startsWith('#') ? hex.slice(1) : hex;
    if (clean.length === 3) {
      const [r, g, b] = clean.split('').map(c => parseInt(c + c, 16));
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

  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bl.toString(16).padStart(2, '0')}`;
}
