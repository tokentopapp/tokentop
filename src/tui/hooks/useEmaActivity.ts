import { useState, useEffect, useRef, useCallback } from 'react';

const BUCKET_COUNT = 60;
const AVG_WINDOW = 10;

export interface ActivityState {
  instantRate: number;
  avgRate: number;
  isSpike: boolean;
}

export interface ActivityDebugData {
  lastDeltaTokens: number;
  lastDt: number;
  bucketsShifted: number;
  currentBucketValue: number;
  refreshCount: number;
  lastRefreshTime: number;
}

export interface UseActivityRateResult {
  activity: ActivityState;
  sparkData: number[];
  debugDataRef: React.MutableRefObject<ActivityDebugData>;
}

/**
 * Token activity tracker using time-bucketed rates.
 * 
 * - When tokens arrive: calculate rate = deltaTokens/dt, put in current bucket
 * - Timer shifts buckets left every second, fills zeros for idle time
 * - instantRate = avg of last 3 buckets, avgRate = avg of last 10
 */
export function useEmaActivity(totalTokens: number): UseActivityRateResult {
  const [buckets, setBuckets] = useState<number[]>(() => Array(BUCKET_COUNT).fill(0));
  const [activity, setActivity] = useState<ActivityState>({ 
    instantRate: 0, avgRate: 0, isSpike: false 
  });
  
  const stateRef = useRef<{ 
    lastTokens: number; 
    lastTokenTime: number;
    lastShiftTime: number;
  }>({ 
    lastTokens: -1, 
    lastTokenTime: Date.now(),
    lastShiftTime: Date.now(),
  });
  
  const debugDataRef = useRef<ActivityDebugData>({
    lastDeltaTokens: 0,
    lastDt: 0,
    bucketsShifted: 0,
    currentBucketValue: 0,
    refreshCount: 0,
    lastRefreshTime: Date.now(),
  });

  const calculateRates = useCallback((bucketData: number[]) => {
    const recentBuckets = bucketData.slice(-AVG_WINDOW);
    
    const instantRate = Math.max(...recentBuckets);
    const avgRate = recentBuckets.reduce((a, b) => a + b, 0) / AVG_WINDOW;
    
    const isSpike = instantRate >= 120 && instantRate >= avgRate * 3;
    
    return { instantRate, avgRate, isSpike };
  }, []);

  const shiftBuckets = useCallback((bucketData: number[], count: number): number[] => {
    if (count <= 0) return bucketData;
    const newBuckets = [...bucketData];
    const shift = Math.min(count, BUCKET_COUNT);
    for (let i = 0; i < BUCKET_COUNT - shift; i++) {
      newBuckets[i] = bucketData[i + shift] ?? 0;
    }
    for (let i = BUCKET_COUNT - shift; i < BUCKET_COUNT; i++) {
      newBuckets[i] = 0;
    }
    return newBuckets;
  }, []);

  useEffect(() => {
    const now = Date.now();
    
    debugDataRef.current.refreshCount++;
    debugDataRef.current.lastRefreshTime = now;

    const prevTokens = stateRef.current.lastTokens;
    
    if (prevTokens === -1 || prevTokens === 0) {
      stateRef.current = { 
        lastTokens: totalTokens, 
        lastTokenTime: now,
        lastShiftTime: now,
      };
      return;
    }

    const deltaTokens = Math.max(0, totalTokens - prevTokens);
    const dt = Math.max((now - stateRef.current.lastTokenTime) / 1000, 0.1);
    
    debugDataRef.current.lastDeltaTokens = deltaTokens;
    debugDataRef.current.lastDt = dt;

    if (deltaTokens > 0 && deltaTokens < 100000) {
      const rate = deltaTokens / dt;
      debugDataRef.current.currentBucketValue = rate;
      
      setBuckets(prev => {
        const secSinceShift = (now - stateRef.current.lastShiftTime) / 1000;
        const bucketsToShift = Math.floor(secSinceShift);
        
        let newBuckets = shiftBuckets(prev, bucketsToShift);
        if (bucketsToShift > 0) {
          stateRef.current.lastShiftTime = now;
          debugDataRef.current.bucketsShifted = bucketsToShift;
        }
        
        // Distribute rate across the active window to avoid spikes
        if (bucketsToShift > 0) {
          // If we shifted buckets, fill the new ones with the average rate
          // This smooths out the graph when polling interval > 1s
          const fillCount = Math.min(bucketsToShift, BUCKET_COUNT);
          for (let i = 0; i < fillCount; i++) {
            newBuckets[BUCKET_COUNT - 1 - i] = rate;
          }
        } else {
          // If sub-second update, accumulate rate
          newBuckets[BUCKET_COUNT - 1] = (newBuckets[BUCKET_COUNT - 1] ?? 0) + rate;
        }
        
        const rates = calculateRates(newBuckets);
        setActivity(rates);
        return newBuckets;
      });
    }
    
    stateRef.current.lastTokens = totalTokens;
    stateRef.current.lastTokenTime = now;
  }, [totalTokens, calculateRates, shiftBuckets]);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const secSinceShift = (now - stateRef.current.lastShiftTime) / 1000;
      
      if (secSinceShift >= 1) {
        const bucketsToShift = Math.floor(secSinceShift);
        debugDataRef.current.bucketsShifted = bucketsToShift;
        
        setBuckets(prev => {
          const newBuckets = shiftBuckets(prev, bucketsToShift);
          stateRef.current.lastShiftTime = now;
          
          const rates = calculateRates(newBuckets);
          setActivity(rates);
          return newBuckets;
        });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [calculateRates, shiftBuckets]);

  return { 
    activity, 
    sparkData: buckets,
    debugDataRef,
  };
}
