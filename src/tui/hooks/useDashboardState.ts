import { useState, useMemo, useRef, useEffect } from 'react';
import type { AgentSessionAggregate, AgentSessionStream } from '../../agents/types.ts';

export interface DashboardDeltas {
  cost: number;
  tokens: number;
}

export interface UseDashboardStateResult {
  showHelp: boolean;
  setShowHelp: React.Dispatch<React.SetStateAction<boolean>>;
  showDebugInspector: boolean;
  setShowDebugInspector: React.Dispatch<React.SetStateAction<boolean>>;
  selectedRow: number;
  setSelectedRow: React.Dispatch<React.SetStateAction<number>>;
  focusedPanel: 'sessions' | 'sidebar';
  setFocusedPanel: React.Dispatch<React.SetStateAction<'sessions' | 'sidebar'>>;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  filterQuery: string;
  setFilterQuery: React.Dispatch<React.SetStateAction<string>>;
  isFiltering: boolean;
  setIsFiltering: React.Dispatch<React.SetStateAction<boolean>>;
  sortField: 'cost' | 'tokens' | 'time';
  setSortField: React.Dispatch<React.SetStateAction<'cost' | 'tokens' | 'time'>>;
  deltas: DashboardDeltas;
  processedSessions: AgentSessionAggregate[];
  totalCost: number;
  totalTokens: number;
  totalRequests: number;
  activeCount: number;
}

export function useDashboardState(sessions: AgentSessionAggregate[]): UseDashboardStateResult {
  const [showHelp, setShowHelp] = useState(false);
  const [showDebugInspector, setShowDebugInspector] = useState(false);
  const [selectedRow, setSelectedRow] = useState(0);
  const [focusedPanel, setFocusedPanel] = useState<'sessions' | 'sidebar'>('sessions');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [filterQuery, setFilterQuery] = useState('');
  const [isFiltering, setIsFiltering] = useState(false);
  const [sortField, setSortField] = useState<'cost' | 'tokens' | 'time'>('cost');
  
  const historyRef = useRef<{time: number, cost: number, tokens: number}[]>([]);
  const [deltas, setDeltas] = useState<DashboardDeltas>({ cost: 0, tokens: 0 });

  const totalCost = sessions.reduce((acc, s) => acc + (s.totalCostUsd ?? 0), 0);
  const totalTokens = sessions.reduce((acc, s) => acc + s.totals.input + s.totals.output, 0);
  const totalRequests = sessions.reduce((acc, s) => acc + s.requestCount, 0);
  const activeCount = sessions.filter(s => s.status === 'active').length;

  useEffect(() => {
    const currentTime = Date.now();
    historyRef.current.push({ time: currentTime, cost: totalCost, tokens: totalTokens });
    if (historyRef.current.length > 300) historyRef.current.shift();

    const fiveMinAgo = historyRef.current[0];
    if (fiveMinAgo) {
      setDeltas({
        cost: totalCost - fiveMinAgo.cost,
        tokens: totalTokens - fiveMinAgo.tokens
      });
    }
  }, [sessions, totalCost, totalTokens]);

  const processedSessions = useMemo(() => {
    let result = [...sessions];
    
    if (filterQuery) {
      const q = filterQuery.toLowerCase();
      result = result.filter(s => 
        s.agentName.toLowerCase().includes(q) || 
        s.streams.some((st: AgentSessionStream) => st.modelId.toLowerCase().includes(q)) ||
        (s.projectPath?.toLowerCase().includes(q) ?? false)
      );
    }

    result.sort((a, b) => {
      const aActive = a.status === 'active' ? 1 : 0;
      const bActive = b.status === 'active' ? 1 : 0;
      if (bActive !== aActive) return bActive - aActive;
      
      if (sortField === 'cost') return (b.totalCostUsd ?? 0) - (a.totalCostUsd ?? 0);
      if (sortField === 'tokens') return (b.totals.input + b.totals.output) - (a.totals.input + a.totals.output);
      return b.lastActivityAt - a.lastActivityAt;
    });

    return result;
  }, [sessions, filterQuery, sortField]);

  return {
    showHelp,
    setShowHelp,
    showDebugInspector,
    setShowDebugInspector,
    selectedRow,
    setSelectedRow,
    focusedPanel,
    setFocusedPanel,
    sidebarCollapsed,
    setSidebarCollapsed,
    filterQuery,
    setFilterQuery,
    isFiltering,
    setIsFiltering,
    sortField,
    setSortField,
    deltas,
    processedSessions,
    totalCost,
    totalTokens,
    totalRequests,
    activeCount,
  };
}
