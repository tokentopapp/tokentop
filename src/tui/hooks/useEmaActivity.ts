import { useState, useEffect, useRef } from 'react';

export interface EmaActivityState {
  rate: number;
  ema: number;
  isSpike: boolean;
}

export interface EmaDebugData {
  lastDeltaTokens: number;
  lastRateTps: number;
  lastDt: number;
  refreshCount: number;
  lastRefreshTime: number;
}

export interface UseEmaActivityResult {
  activity: EmaActivityState;
  sparkData: number[];
  emaRef: React.MutableRefObject<{ lastTokens: number; lastTime: number; ema: number }>;
  debugDataRef: React.MutableRefObject<EmaDebugData>;
}

/**
 * Hook for calculating exponential moving average of token activity.
 * Tracks token rate over time and detects spikes.
 */
export function useEmaActivity(totalTokens: number): UseEmaActivityResult {
  const [sparkData, setSparkData] = useState<number[]>([]);
  const [activity, setActivity] = useState<EmaActivityState>({ 
    rate: 0, ema: 0, isSpike: false 
  });
  
  const emaRef = useRef<{ lastTokens: number; lastTime: number; ema: number }>({ 
    lastTokens: -1, lastTime: Date.now(), ema: 0 
  });
  
  const debugDataRef = useRef<EmaDebugData>({
    lastDeltaTokens: 0,
    lastRateTps: 0,
    lastDt: 0,
    refreshCount: 0,
    lastRefreshTime: Date.now(),
  });

  useEffect(() => {
    setSparkData(Array.from({ length: 60 }, () => 0));
  }, []);

  useEffect(() => {
    const currentTime = Date.now();
    
    debugDataRef.current.refreshCount++;
    debugDataRef.current.lastRefreshTime = currentTime;

    if (emaRef.current.lastTokens === -1) {
      emaRef.current = { lastTokens: totalTokens, lastTime: currentTime, ema: 0 };
      return;
    }

    const prevTokens = emaRef.current.lastTokens;
    const deltaTokens = Math.max(0, totalTokens - prevTokens);
    const dt = (currentTime - emaRef.current.lastTime) / 1000;
    
    debugDataRef.current.lastDeltaTokens = deltaTokens;
    debugDataRef.current.lastDt = dt;
    
    if (deltaTokens > 0) {
      const rateTps = dt > 0 ? deltaTokens / dt : 0;
      const alpha = 2 / (10 + 1);
      const newEma = alpha * rateTps + (1 - alpha) * emaRef.current.ema;
      const isSpike = rateTps >= Math.max(800, newEma * 2) && (rateTps - newEma) >= 200;
      
      debugDataRef.current.lastRateTps = rateTps;
      emaRef.current.ema = newEma;
      setActivity({ rate: rateTps, ema: newEma, isSpike });
    }
    
    emaRef.current.lastTokens = totalTokens;
    emaRef.current.lastTime = currentTime;
  }, [totalTokens]);

  useEffect(() => {
    const interval = setInterval(() => {
      const alpha = 2 / (10 + 1);
      const decayedEma = (1 - alpha) * emaRef.current.ema;
      emaRef.current.ema = decayedEma;
      
      setActivity(prev => ({ ...prev, ema: decayedEma, isSpike: false }));
      setSparkData(d => [...d.slice(1), Math.min(100, Math.round(decayedEma / 10))]);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return { activity, sparkData, emaRef, debugDataRef };
}
