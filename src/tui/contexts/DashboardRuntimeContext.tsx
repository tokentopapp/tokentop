import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from 'react';
import { useAgentSessions } from './AgentSessionContext.tsx';
import { useTimeWindow } from './TimeWindowContext.tsx';
import { useRealTimeActivity } from './RealTimeActivityContext.tsx';
import { useEmaActivity, type ActivityState, type ActivityDebugData } from '../hooks/useEmaActivity.ts';

interface Deltas {
  cost: number;
  tokens: number;
  windowSec: number;
}

interface DashboardRuntimeContextValue {
  activity: ActivityState;
  sparkData: number[];
  
  deltas: Deltas;
  history: Array<{time: number, cost: number, tokens: number}>;
  
  debugDataRef: React.MutableRefObject<ActivityDebugData>;
}

const DashboardRuntimeContext = createContext<DashboardRuntimeContextValue | null>(null);

export function DashboardRuntimeProvider({ children }: { children: ReactNode }) {
  const { sessions: agentSessions, isLoading } = useAgentSessions();
  const { windowMs } = useTimeWindow();
  const { subscribe } = useRealTimeActivity();
  
  const totalTokens = agentSessions.reduce((sum, s) => sum + s.totals.input + s.totals.output, 0);
  const { activity, sparkData, debugDataRef, injectDelta } = useEmaActivity(totalTokens);
  
  useEffect(() => {
    return subscribe((delta, _timestamp) => {
      injectDelta(delta);
    });
  }, [subscribe, injectDelta]);

  const historyRef = useRef<{time: number, cost: number, tokens: number}[]>([]);
  const [deltas, setDeltas] = useState<Deltas>({ cost: 0, tokens: 0, windowSec: 0 });

  useEffect(() => {
    if (isLoading || agentSessions.length === 0) return;
    
    const totalCost = agentSessions.reduce((sum, s) => sum + (s.totalCostUsd ?? 0), 0);
    const currentTime = Date.now();
    
    const lastEntry = historyRef.current[historyRef.current.length - 1];
    const isDiscontinuity = lastEntry && (
      totalTokens < lastEntry.tokens ||
      totalTokens > lastEntry.tokens * 2
    );
    if (isDiscontinuity) {
      historyRef.current = [];
    }
    
    historyRef.current.push({ time: currentTime, cost: totalCost, tokens: totalTokens });
    
    if (historyRef.current.length > 300) historyRef.current.shift();

    const targetTime = windowMs !== null ? currentTime - windowMs : 0;
    let baseline = historyRef.current[0];
    
    for (let i = historyRef.current.length - 1; i >= 0; i--) {
      if (historyRef.current[i]!.time <= targetTime) {
        baseline = historyRef.current[i];
        break;
      }
    }
    
    if (baseline) {
      const windowSec = (currentTime - baseline.time) / 1000;
      setDeltas({
        cost: totalCost - baseline.cost,
        tokens: totalTokens - baseline.tokens,
        windowSec,
      });
    }
  }, [agentSessions, isLoading, windowMs, totalTokens]);

  const value: DashboardRuntimeContextValue = {
    activity,
    sparkData,
    deltas,
    history: historyRef.current,
    debugDataRef
  };

  return (
    <DashboardRuntimeContext.Provider value={value}>
      {children}
    </DashboardRuntimeContext.Provider>
  );
}

export function useDashboardRuntime() {
  const context = useContext(DashboardRuntimeContext);
  if (!context) {
    throw new Error('useDashboardRuntime must be used within DashboardRuntimeProvider');
  }
  return context;
}
