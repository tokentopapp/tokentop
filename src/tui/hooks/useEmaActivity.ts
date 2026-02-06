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
  injectDelta: (delta: number) => void;
}

export function useEmaActivity(totalTokens: number): UseActivityRateResult {
  const [buckets, setBuckets] = useState<number[]>(() => Array(BUCKET_COUNT).fill(0));
  const [activity, setActivity] = useState<ActivityState>({ 
    instantRate: 0, avgRate: 0, isSpike: false 
  });
  
  const stateRef = useRef<{ 
    lastTokens: number; 
    lastTokenTime: number;
    lastShiftTime: number;
    initialized: boolean;
  }>({ 
    lastTokens: -1, 
    lastTokenTime: Date.now(),
    lastShiftTime: Date.now(),
    initialized: false,
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
    
    const isSpike = instantRate >= 500 && instantRate >= avgRate * 3;
    
    return { instantRate, avgRate, isSpike };
  }, []);

  const shiftBucketsWithDecay = useCallback((bucketData: number[], count: number): number[] => {
    if (count <= 0) return bucketData;
    const newBuckets = [...bucketData];
    const shift = Math.min(count, BUCKET_COUNT);
    const decayFactor = 0.7;
    const zeroThreshold = 0.5; // Values below this become true zero (shows as dot)
    
    for (let i = 0; i < BUCKET_COUNT - shift; i++) {
      const val = bucketData[i + shift] ?? 0;
      newBuckets[i] = val < zeroThreshold ? 0 : val;
    }
    for (let i = BUCKET_COUNT - shift; i < BUCKET_COUNT; i++) {
      const prevValue = bucketData[BUCKET_COUNT - shift - 1] ?? 0;
      const decaySteps = i - (BUCKET_COUNT - shift) + 1;
      const decayed = prevValue * Math.pow(decayFactor, decaySteps);
      newBuckets[i] = decayed < zeroThreshold ? 0 : decayed;
    }
    return newBuckets;
  }, []);

  const applyActivityRamp = useCallback((bucketData: number[], peakRate: number, fillCount: number): number[] => {
    const newBuckets = [...bucketData];
    const rampWidth = Math.min(fillCount + 2, 6);
    
    for (let i = 0; i < rampWidth; i++) {
      const bucketIdx = BUCKET_COUNT - 1 - i;
      if (bucketIdx < 0) break;
      
      const distanceFromPeak = i;
      const rampMultiplier = Math.max(0.15, 1 - (distanceFromPeak * 0.25));
      const rampedValue = peakRate * rampMultiplier;
      
      newBuckets[bucketIdx] = Math.max(newBuckets[bucketIdx] ?? 0, rampedValue);
    }
    return newBuckets;
  }, []);

  const injectDelta = useCallback((delta: number) => {
    if (delta <= 0 || delta >= 1000000) return;
    
    const now = Date.now();
    const rate = delta;
    
    debugDataRef.current.lastDeltaTokens = delta;
    debugDataRef.current.lastDt = 1;
    debugDataRef.current.currentBucketValue = rate;
    
    setBuckets(prev => {
      const secSinceShift = (now - stateRef.current.lastShiftTime) / 1000;
      const bucketsToShift = Math.floor(secSinceShift);
      
      let newBuckets = shiftBucketsWithDecay(prev, bucketsToShift);
      if (bucketsToShift > 0) {
        stateRef.current.lastShiftTime = now;
        debugDataRef.current.bucketsShifted = bucketsToShift;
      }
      
      newBuckets = applyActivityRamp(newBuckets, rate, bucketsToShift);
      
      const rates = calculateRates(newBuckets);
      setActivity(rates);
      return newBuckets;
    });
  }, [calculateRates, shiftBucketsWithDecay, applyActivityRamp]);

  useEffect(() => {
    const now = Date.now();
    
    debugDataRef.current.refreshCount++;
    debugDataRef.current.lastRefreshTime = now;

    const prevTokens = stateRef.current.lastTokens;
    const wasInitialized = stateRef.current.initialized;
    
    if (prevTokens === -1 || prevTokens === 0 || !wasInitialized) {
      stateRef.current = { 
        lastTokens: totalTokens, 
        lastTokenTime: now,
        lastShiftTime: now,
        initialized: totalTokens > 0,
      };
      return;
    }

    const deltaTokens = Math.max(0, totalTokens - prevTokens);
    const rawDt = (now - stateRef.current.lastTokenTime) / 1000;
    
    // Require minimum 0.5s between rate calculations
    // DON'T update lastTokens here — that would silently consume the delta
    // without ever writing it to buckets. Let the delta accumulate until
    // enough time has passed for a proper rate calculation.
    if (rawDt < 0.5) {
      return;
    }
    
    // Cap dt at 10s so long idle gaps don't dilute the rate when tokens finally arrive
    // This shows activity as a "burst" rather than averaged over idle time
    const dt = Math.min(Math.max(rawDt, 0.5), 10);
    
    debugDataRef.current.lastDeltaTokens = deltaTokens;
    debugDataRef.current.lastDt = dt;

    if (deltaTokens > 0 && deltaTokens < 1000000) {
      const rate = deltaTokens / dt;
      debugDataRef.current.currentBucketValue = rate;
      
      setBuckets(prev => {
        const secSinceShift = (now - stateRef.current.lastShiftTime) / 1000;
        const bucketsToShift = Math.floor(secSinceShift);
        
        let newBuckets = shiftBucketsWithDecay(prev, bucketsToShift);
        if (bucketsToShift > 0) {
          stateRef.current.lastShiftTime = now;
          debugDataRef.current.bucketsShifted = bucketsToShift;
        }
        
        newBuckets = applyActivityRamp(newBuckets, rate, bucketsToShift);
        
        const rates = calculateRates(newBuckets);
        setActivity(rates);
        return newBuckets;
      });
      
      stateRef.current.lastTokens = totalTokens;
      stateRef.current.lastTokenTime = now;
    }
  }, [totalTokens, calculateRates, shiftBucketsWithDecay, applyActivityRamp]);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const secSinceShift = (now - stateRef.current.lastShiftTime) / 1000;
      
      if (secSinceShift >= 1) {
        const bucketsToShift = Math.floor(secSinceShift);
        debugDataRef.current.bucketsShifted = bucketsToShift;
        
        setBuckets(prev => {
          const newBuckets = shiftBucketsWithDecay(prev, bucketsToShift);
          stateRef.current.lastShiftTime = now;
          
          const rates = calculateRates(newBuckets);
          setActivity(rates);
          return newBuckets;
        });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [calculateRates, shiftBucketsWithDecay]);

  return { 
    activity, 
    sparkData: buckets,
    debugDataRef,
    injectDelta,
  };
}
