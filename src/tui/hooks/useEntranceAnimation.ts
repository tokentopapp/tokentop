import { useState, useEffect, useRef } from 'react';

export interface UseEntranceAnimationOptions {
  durationMs?: number;
  fps?: number;
}

/**
 * Hook that provides a fade-in animation when a component mounts.
 * Returns an intensity from 0 (just appeared) to 1 (fully visible).
 * Use this to fade in new items in a list.
 */
export function useEntranceAnimation(options: UseEntranceAnimationOptions = {}): number {
  const { durationMs = 400, fps = 30 } = options;
  const mountTime = useRef(Date.now());
  const [intensity, setIntensity] = useState(0);

  useEffect(() => {
    const intervalMs = 1000 / fps;
    
    const tick = () => {
      const elapsed = Date.now() - mountTime.current;
      const progress = Math.min(1, elapsed / durationMs);
      const eased = 1 - Math.pow(1 - progress, 2);
      setIntensity(eased);
      
      if (progress < 1) {
        setTimeout(tick, intervalMs);
      }
    };
    
    tick();
  }, [durationMs, fps]);

  return intensity;
}

/**
 * Apply entrance fade to a color - starts dim and brightens to full color.
 */
export function applyEntranceFade(intensity: number, color: string, dimColor: string): string {
  if (intensity >= 1) return color;
  if (intensity <= 0) return dimColor;
  
  const parseHex = (hex: string): [number, number, number] => {
    const clean = hex.replace('#', '');
    return [
      parseInt(clean.slice(0, 2), 16),
      parseInt(clean.slice(2, 4), 16),
      parseInt(clean.slice(4, 6), 16),
    ];
  };
  
  const [r1, g1, b1] = parseHex(dimColor);
  const [r2, g2, b2] = parseHex(color);
  
  const r = Math.round(r1 + (r2 - r1) * intensity);
  const g = Math.round(g1 + (g2 - g1) * intensity);
  const b = Math.round(b1 + (b2 - b1) * intensity);
  
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}
