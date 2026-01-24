import { useState, useEffect, useMemo, useRef } from 'react';
import { useKeyboard, useTerminalDimensions } from '@opentui/react';
import type { ScrollBoxRenderable } from '@opentui/core';
import { useColors } from '../contexts/ThemeContext.tsx';
import { usePlugins } from '../contexts/PluginContext.tsx';
import { useInputFocus } from '../contexts/InputContext.tsx';
import { useAgentSessions } from '../contexts/AgentSessionContext.tsx';
import { useTimeWindow } from '../contexts/TimeWindowContext.tsx';
import { DebugInspectorOverlay } from '../components/DebugInspectorOverlay.tsx';
import { KpiStrip } from '../components/KpiStrip.tsx';
import { SessionDetailsDrawer } from '../components/SessionDetailsDrawer.tsx';

interface LimitGaugeProps {
  label: string;
  usedPercent: number | null;
  color: string;
  ghost?: boolean | undefined;
  error?: string | undefined;
}

function LimitGauge({ 
  label, 
  usedPercent, 
  color,
  ghost = false,
  error,
}: LimitGaugeProps) {
  const colors = useColors();
  const barWidth = 10;
  
  if (ghost) {
    const ghostLabel = label.length > 10 ? label.slice(0, 9) + '…' : label.padEnd(10);
    return (
      <box width={30} overflow="hidden">
        <text>
          <span fg={colors.textSubtle}> ○ </span>
          <span fg={colors.textSubtle}>{ghostLabel} </span>
          <span fg={colors.textSubtle}>{'·'.repeat(barWidth)}</span>
          <span fg={colors.textSubtle}> N/A</span>
        </text>
      </box>
    );
  }
  
  if (error) {
    const displayLabel = label.length > 10 ? label.slice(0, 9) + '…' : label.padEnd(10);
    return (
      <box width={30} overflow="hidden">
        <text>
          <span fg={colors.error}> ✗ </span>
          <span fg={colors.text}>{displayLabel} </span>
          <span fg={colors.error}>{'·'.repeat(barWidth)}</span>
          <span fg={colors.error}> ERR</span>
        </text>
      </box>
    );
  }
  
  const percent = usedPercent ?? 0;
  const filled = Math.min(barWidth, Math.round((percent / 100) * barWidth));
  const empty = barWidth - filled;
  
  const isCritical = percent >= 95;
  const isWarning = percent >= 80;
  
  const barColor = isCritical ? colors.error : isWarning ? colors.warning : color;
  const statusIcon = isCritical ? '!!' : isWarning ? ' !' : ' ●';
  const statusColor = isCritical ? colors.error : isWarning ? colors.warning : colors.success;
  
  const displayLabel = label.length > 10 ? label.slice(0, 9) + '…' : label.padEnd(10);
  const percentStr = usedPercent !== null ? `${Math.round(percent)}%`.padStart(3) : ' --';
  
  return (
    <box width={30} overflow="hidden">
      <text>
        <span fg={statusColor}>{statusIcon} </span>
        <span fg={colors.text}>{displayLabel} </span>
        <span fg={barColor}>{'█'.repeat(filled)}</span>
        <span fg={colors.textSubtle}>{'·'.repeat(empty)}</span>
        <span fg={isCritical ? colors.error : colors.textMuted}> {percentStr}</span>
      </text>
    </box>
  );
}

function HelpOverlay() {
  const colors = useColors();
  return (
    <box 
      position="absolute" 
      top="20%" 
      left="30%" 
      width={50} 
      height={20} 
      border 
      borderStyle="double" 
      borderColor={colors.primary} 
      flexDirection="column" 
      padding={1} 
      zIndex={10}
      backgroundColor={colors.background}
    >
      <box justifyContent="center"><text><strong>Help</strong></text></box>
      
      <box marginTop={1}><text fg={colors.primary}><strong>Navigation</strong></text></box>
      <box flexDirection="row"><text width={12} fg={colors.textMuted}>Tab</text><text>Switch panel focus</text></box>
      <box flexDirection="row"><text width={12} fg={colors.textMuted}>↑/↓ j/k</text><text>Navigate sessions</text></box>
      <box flexDirection="row"><text width={12} fg={colors.textMuted}>Enter</text><text>View details</text></box>
      
      <box marginTop={1}><text fg={colors.primary}><strong>Actions</strong></text></box>
      <box flexDirection="row"><text width={12} fg={colors.textMuted}>/</text><text>Filter sessions</text></box>
      <box flexDirection="row"><text width={12} fg={colors.textMuted}>s</text><text>Toggle sort</text></box>
      <box flexDirection="row"><text width={12} fg={colors.textMuted}>t</text><text>Cycle time window</text></box>
      <box flexDirection="row"><text width={12} fg={colors.textMuted}>i</text><text>Toggle sidebar</text></box>
      <box flexDirection="row"><text width={12} fg={colors.textMuted}>r</text><text>Refresh data</text></box>
      
      <box marginTop={1}><text fg={colors.primary}><strong>General</strong></text></box>
      <box flexDirection="row"><text width={12} fg={colors.textMuted}>1</text><text>Dashboard tab</text></box>
      <box flexDirection="row"><text width={12} fg={colors.textMuted}>2</text><text>Providers tab</text></box>
      <box flexDirection="row"><text width={12} fg={colors.textMuted}>q</text><text>Quit</text></box>
      
      <box justifyContent="center" marginTop={1}><text fg={colors.textMuted}>Press ? or Esc to close</text></box>
    </box>
  );
}

export function RealTimeDashboard() {
  const colors = useColors();
  const { providers } = usePlugins();
  const { setInputFocused } = useInputFocus();
  const { sessions: agentSessions, isLoading, refreshSessions } = useAgentSessions();
  const { windowMs, cycleWindow, windowLabel } = useTimeWindow();
  const { height: terminalHeight } = useTerminalDimensions();
  
  const visibleRows = Math.max(1, terminalHeight - 29);
  
  // Sparkline data for activity visualization
  const [sparkData, setSparkData] = useState<number[]>([]);
  
  // UI State
  const [showHelp, setShowHelp] = useState(false);
  const [showDebugInspector, setShowDebugInspector] = useState(false);
  const [showSessionDrawer, setShowSessionDrawer] = useState(false);
  const [selectedRow, setSelectedRow] = useState(0);
  const [focusedPanel, setFocusedPanel] = useState<'sessions' | 'sidebar'>('sessions');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [filterQuery, setFilterQuery] = useState('');
  const [isFiltering, setIsFiltering] = useState(false);
  const [sortField, setSortField] = useState<'cost' | 'tokens' | 'time'>('cost');
  const [pendingG, setPendingG] = useState(false);
  const [scrollOffset, setScrollOffset] = useState(0);
  
  // Refs to avoid stale closures in useKeyboard
  const isFilteringRef = useRef(isFiltering);
  const modalOpenRef = useRef(false);
  const sessionsScrollboxRef = useRef<ScrollBoxRenderable>(null);
  const pendingGRef = useRef(false);
  
  useEffect(() => {
    isFilteringRef.current = isFiltering;
    modalOpenRef.current = showHelp || showDebugInspector || showSessionDrawer;
    pendingGRef.current = pendingG;
  }, [isFiltering, showHelp, showDebugInspector, showSessionDrawer, pendingG]);
  
  const historyRef = useRef<{time: number, cost: number, tokens: number}[]>([]);
  const [deltas, setDeltas] = useState({ cost: 0, tokens: 0, windowSec: 0 });
  
  const emaRef = useRef<{ lastTokens: number; lastTime: number; ema: number }>({ 
    lastTokens: -1, lastTime: Date.now(), ema: 0 
  });
  const [activity, setActivity] = useState<{ rate: number; ema: number; isSpike: boolean }>({ 
    rate: 0, ema: 0, isSpike: false 
  });
  
  const debugDataRef = useRef<{
    lastDeltaTokens: number;
    lastRateTps: number;
    lastDt: number;
    refreshCount: number;
    lastRefreshTime: number;
  }>({
    lastDeltaTokens: 0,
    lastRateTps: 0,
    lastDt: 0,
    refreshCount: 0,
    lastRefreshTime: Date.now(),
  });

  const configuredProviders = useMemo(() => {
    return Array.from(providers.values())
      .filter(p => p.configured)
      .sort((a, b) => getMaxUsedPercent(b) - getMaxUsedPercent(a));
  }, [providers]);

  function getMaxUsedPercent(provider: any): number {
    if (!provider.usage?.limits) return 0;
    const items = provider.usage.limits.items ?? [];
    if (items.length > 0) return Math.max(...items.map((i: any) => i.usedPercent ?? 0));
    const primary = provider.usage.limits.primary?.usedPercent ?? 0;
    const secondary = provider.usage.limits.secondary?.usedPercent ?? 0;
    return Math.max(primary, secondary);
  }

  const getProviderColor = (id: string) => {
    if (id.includes('anthropic') || id.includes('claude')) return '#d97757';
    if (id.includes('openai') || id.includes('codex')) return '#10a37f';
    if (id.includes('google') || id.includes('gemini')) return '#4285f4';
    if (id.includes('github') || id.includes('copilot')) return '#6e40c9';
    return colors.primary;
  };

  const formatCurrency = (val: number) => `$${val.toFixed(2)}`;
  const formatTokens = (val: number) => val > 1000000 ? `${(val/1000000).toFixed(1)}M` : `${(val/1000).toFixed(1)}K`;

  useEffect(() => {
    setSparkData(Array.from({ length: 60 }, () => 0));
  }, []);

  useEffect(() => {
    if (isLoading || agentSessions.length === 0) return;
    
    const totalCost = agentSessions.reduce((sum, s) => sum + (s.totalCostUsd ?? 0), 0);
    const totalTokens = agentSessions.reduce((sum, s) => sum + s.totals.input + s.totals.output, 0);
    const currentTime = Date.now();
    
    const lastEntry = historyRef.current[historyRef.current.length - 1];
    if (lastEntry && totalTokens < lastEntry.tokens) {
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

    debugDataRef.current.refreshCount++;
    debugDataRef.current.lastRefreshTime = currentTime;

    if (emaRef.current.lastTokens === -1) {
      emaRef.current = { lastTokens: totalTokens, lastTime: currentTime, ema: 0 };
      return;
    }

    const prevTokens = emaRef.current.lastTokens;
    const deltaTokens = Math.max(0, totalTokens - prevTokens);
    const dtRaw = (currentTime - emaRef.current.lastTime) / 1000;
    const dt = Math.max(dtRaw, 0.25);
    
    debugDataRef.current.lastDeltaTokens = deltaTokens;
    debugDataRef.current.lastDt = dt;
    
    if (deltaTokens > 0) {
      const rateTps = deltaTokens / dt;
      const tauSec = 10;
      const alpha = 1 - Math.exp(-dt / tauSec);
      const newEma = emaRef.current.ema + alpha * (rateTps - emaRef.current.ema);
      const isSpike = rateTps >= Math.max(800, newEma * 2) && (rateTps - newEma) >= 200;
      
      debugDataRef.current.lastRateTps = rateTps;
      emaRef.current.ema = newEma;
      setActivity({ rate: rateTps, ema: newEma, isSpike });
    }
    
    emaRef.current.lastTokens = totalTokens;
    emaRef.current.lastTime = currentTime;
  }, [agentSessions, isLoading, windowMs]);

  useEffect(() => {
    const interval = setInterval(() => {
      const alpha = 2 / (10 + 1);
      const decayedEma = (1 - alpha) * emaRef.current.ema;
      emaRef.current.ema = decayedEma;
      
      setActivity(prev => ({ ...prev, ema: decayedEma, isSpike: false }));
      setSparkData(d => [...d.slice(1), decayedEma]);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const processedSessions = useMemo(() => {
    let result = [...agentSessions];
    
    if (windowMs !== null) {
      const cutoff = Date.now() - windowMs;
      result = result.filter(s => s.lastActivityAt >= cutoff);
    }
    
    if (filterQuery) {
      const q = filterQuery.toLowerCase();
      result = result.filter(s => 
        s.agentName.toLowerCase().includes(q) || 
        s.streams.some(st => st.modelId.toLowerCase().includes(q)) ||
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
  }, [agentSessions, filterQuery, sortField, windowMs]);

  useEffect(() => {
    if (!sessionsScrollboxRef.current || processedSessions.length === 0) return;
    
    let newOffset = scrollOffset;
    
    if (selectedRow < scrollOffset) {
      newOffset = selectedRow;
    } else if (selectedRow >= scrollOffset + visibleRows) {
      newOffset = selectedRow - visibleRows + 1;
    }
    
    if (newOffset !== scrollOffset) {
      setScrollOffset(newOffset);
    }
    
    sessionsScrollboxRef.current.scrollTo(newOffset);
  }, [selectedRow, processedSessions, scrollOffset, visibleRows]);

  useKeyboard((key) => {
    if (key.sequence === '?' || (key.shift && key.name === '/')) {
      setShowHelp(prev => !prev);
      return;
    }
    
    if (key.shift && key.name === 'd') {
      setShowDebugInspector(prev => !prev);
      return;
    }

    if (modalOpenRef.current) {
      if (key.name === 'escape' || key.name === 'q' || key.sequence === '?') {
        setShowHelp(false);
        setShowDebugInspector(false);
        setShowSessionDrawer(false);
      }
      return;
    }

    if (isFilteringRef.current) {
      if (key.name === 'enter' || key.name === 'return') {
        setIsFiltering(false);
        setInputFocused(false);
        return;
      }
      if (key.name === 'escape') {
        setFilterQuery('');
        setIsFiltering(false);
        setInputFocused(false);
        return;
      }
      if (key.name === 'backspace') {
        setFilterQuery(q => q.slice(0, -1));
        return;
      }
      if (key.sequence && key.sequence.length === 1 && /^[a-zA-Z0-9\-_./]$/.test(key.sequence)) {
        setFilterQuery(q => q + key.sequence);
        return;
      }
      return;
    }

    if (key.name === 'tab') {
      setFocusedPanel(curr => curr === 'sessions' ? 'sidebar' : 'sessions');
      return;
    }

    if (key.name === 'i') {
      setSidebarCollapsed(curr => !curr);
      return;
    }

    if (key.name === '/' || key.sequence === '/') {
      setIsFiltering(true);
      setInputFocused(true);
      return;
    }
    
    if (key.name === 's') {
      setSortField(curr => curr === 'cost' ? 'tokens' : 'cost');
      return;
    }
    
    if (key.name === 't') {
      cycleWindow();
      return;
    }

    if (key.name === 'r') {
      refreshSessions();
      return;
    }

    if (focusedPanel === 'sessions') {
      if (key.name === 'down' || key.name === 'j') {
        setPendingG(false);
        setSelectedRow(curr => Math.min(curr + 1, processedSessions.length - 1));
      } else if (key.name === 'up' || key.name === 'k') {
        setPendingG(false);
        setSelectedRow(curr => Math.max(curr - 1, 0));
      } else if (key.shift && key.name === 'g') {
        setPendingG(false);
        setSelectedRow(processedSessions.length - 1);
        setScrollOffset(Math.max(0, processedSessions.length - 1));
      } else if (key.name === 'g') {
        if (pendingGRef.current) {
          setSelectedRow(0);
          setScrollOffset(0);
          setPendingG(false);
        } else {
          setPendingG(true);
          setTimeout(() => setPendingG(false), 500);
        }
      } else if (key.name === 'return' && processedSessions.length > 0) {
        setPendingG(false);
        setShowSessionDrawer(true);
      } else {
        setPendingG(false);
      }
    }
  });

  const totalCost = agentSessions.reduce((acc, s) => acc + (s.totalCostUsd ?? 0), 0);
  const totalTokens = agentSessions.reduce((acc, s) => acc + s.totals.input + s.totals.output, 0);
  const totalRequests = agentSessions.reduce((acc, s) => acc + s.requestCount, 0);
  const activeCount = agentSessions.filter(s => s.status === 'active').length;

  const modelStats = useMemo(() => {
    const stats: Record<string, number> = {};
    agentSessions.forEach(s => {
      s.streams.forEach(st => {
        stats[st.modelId] = (stats[st.modelId] || 0) + (st.costUsd ?? 0);
      });
    });
    return Object.entries(stats).sort(([, a], [, b]) => b - a).slice(0, 5);
  }, [agentSessions]);

  const providerStats = useMemo(() => {
    const stats: Record<string, number> = {};
    agentSessions.forEach(s => {
      s.streams.forEach(st => {
        stats[st.providerId] = (stats[st.providerId] || 0) + (st.costUsd ?? 0);
      });
    });
    return Object.entries(stats).sort(([, a], [, b]) => b - a);
  }, [agentSessions]);

  const maxModelCost = Math.max(...modelStats.map(([, c]) => c), 0.01);

  return (
    <box flexDirection="column" flexGrow={1} padding={1} gap={1} overflow="hidden">
      {showHelp && <HelpOverlay />}
      {showDebugInspector && (
        <DebugInspectorOverlay 
          sessions={agentSessions}
          emaData={emaRef.current}
          debugData={debugDataRef.current}
          activity={activity}
          sparkData={sparkData}
        />
      )}
      {showSessionDrawer && processedSessions[selectedRow] && (
        <SessionDetailsDrawer 
          session={processedSessions[selectedRow]} 
          onClose={() => setShowSessionDrawer(false)} 
        />
      )}
      
      <KpiStrip
        totalCost={totalCost}
        totalTokens={totalTokens}
        totalRequests={totalRequests}
        activeCount={activeCount}
        deltaCost={deltas.cost}
        deltaTokens={deltas.tokens}
        windowSec={deltas.windowSec}
        activity={activity}
        sparkData={sparkData}
      />

      <box flexDirection="column" border borderStyle="single" padding={1} borderColor={colors.border} overflow="hidden" height={5} flexShrink={0}>
        <text fg={colors.textMuted} marginBottom={0}>PROVIDER LIMITS</text>
        <box flexDirection="row" flexWrap="wrap" gap={2} overflow="hidden">
          {configuredProviders.slice(0, 4).map(p => (
            <LimitGauge 
              key={p.plugin.id} 
              label={p.plugin.name} 
              usedPercent={getMaxUsedPercent(p)} 
              color={getProviderColor(p.plugin.id)}
              {...(p.usage?.error ? { error: p.usage.error } : {})}
            />
          ))}
          {configuredProviders.length === 0 && (
            <text fg={colors.textMuted}>No providers configured with limits.</text>
          )}
        </box>
      </box>

      <box flexDirection="row" gap={1} flexGrow={1} minHeight={10}>
        
        <box 
          flexDirection="column" 
          flexGrow={2} 
          border 
          borderStyle={focusedPanel === 'sessions' ? "double" : "single"} 
          borderColor={focusedPanel === 'sessions' ? colors.primary : colors.border}
          overflow="hidden"
        >
          <box flexDirection="row" paddingLeft={1} paddingRight={1} height={1} justifyContent="space-between" overflow="hidden">
            <text height={1} fg={colors.textMuted}>
              SESSIONS{isFiltering ? ` (Filter: ${filterQuery})` : ''}{isLoading ? ' ⟳' : '  '}
            </text>
            <text height={1} fg={colors.textMuted}>[{windowLabel}] {processedSessions.length} sessions</text>
          </box>
          
          <box flexDirection="row" paddingLeft={1} paddingRight={1} height={1}>
            <text width={8} height={1} fg={colors.textMuted}>PID     </text>
            <text width={12} height={1} fg={colors.textMuted}>AGENT       </text>
            <text width={16} height={1} fg={colors.textMuted}>MODEL           </text>
            <text width={8} height={1} fg={colors.textMuted}>TOKENS  </text>
            <text width={8} height={1} fg={colors.textMuted}>COST    </text>
            <text flexGrow={1} height={1} fg={colors.textMuted} paddingLeft={2}>PROJECT</text>
            <text width={6} height={1} fg={colors.textMuted}>STATUS</text>
          </box>
          
          <scrollbox ref={sessionsScrollboxRef} flexGrow={1}>
            <box flexDirection="column">
              {processedSessions.length === 0 && (
                <box paddingLeft={1}>
                  <text fg={colors.textMuted}>{isLoading ? 'Loading sessions...' : 'No sessions found'}</text>
                </box>
              )}
              {processedSessions.map((session, idx) => {
                const isSelected = idx === selectedRow;
                const rowFg = isSelected ? colors.background : colors.text;
                const primaryStream = session.streams[0];
                const providerId = primaryStream?.providerId ?? 'unknown';
                const modelId = primaryStream?.modelId ?? 'unknown';
                const providerColor = getProviderColor(providerId);
                const projectPath = session.projectPath ?? '—';
                const projectDisplay = projectPath.length > 20 
                  ? '…' + projectPath.slice(-19) 
                  : projectPath;

                return (
                  <box 
                    key={session.sessionId} 
                    flexDirection="row" 
                    paddingLeft={1} 
                    paddingRight={1}
                    height={1}
                    {...(isSelected ? { backgroundColor: colors.primary } : {})}
                  >
                    <text width={8} height={1} fg={isSelected ? rowFg : colors.textMuted}>{session.sessionId.slice(0, 7)}</text>
                    <text width={12} height={1} fg={isSelected ? rowFg : colors.text}>{session.agentName}</text>
                    <text width={16} height={1} fg={isSelected ? rowFg : providerColor}>{modelId.split('/').pop()?.slice(0,15)}</text>
                    <text width={8} height={1} fg={isSelected ? rowFg : colors.text}>{formatTokens(session.totals.input + session.totals.output).padStart(7)}</text>
                    <text width={8} height={1} fg={isSelected ? rowFg : colors.success}>{formatCurrency(session.totalCostUsd ?? 0).padStart(7)}</text>
                    <text flexGrow={1} height={1} fg={isSelected ? rowFg : colors.textSubtle} paddingLeft={2}>{projectDisplay}</text>
                    <text 
                      width={6} 
                      height={1} 
                      fg={isSelected 
                        ? (session.status === 'active' ? '#ffffff' : rowFg)
                        : (session.status === 'active' ? colors.success : colors.textMuted)}
                    >
                      {session.status === 'active' ? '●' : '○'}
                    </text>
                  </box>
                );
              })}
            </box>
          </scrollbox>
        </box>

        {!sidebarCollapsed && (
          <box 
            flexDirection="column" 
            width={35} 
            gap={1}
            border
            borderStyle={focusedPanel === 'sidebar' ? "double" : "single"}
            borderColor={focusedPanel === 'sidebar' ? colors.primary : colors.border}
            overflow="hidden"
          >
            <box flexDirection="column" padding={1} flexGrow={1} overflow="hidden">
              <text height={1} fg={colors.textMuted} marginBottom={1}>MODEL BREAKDOWN</text>
              {modelStats.map(([modelId, cost]) => (
                <box key={modelId} flexDirection="column" marginBottom={1}>
                  <box flexDirection="row" justifyContent="space-between" height={1}>
                    <text height={1} fg={colors.text}>{(modelId.length > 15 ? modelId.slice(0,14)+'…' : modelId).padEnd(18)}</text>
                    <text height={1} fg={colors.textMuted}>{formatCurrency(cost).padStart(7)}</text>
                  </box>
                  <box flexDirection="row" height={1}>
                    <text height={1} fg={getProviderColor(modelId)}>
                      {'█'.repeat(Math.ceil((cost / maxModelCost) * 20)).padEnd(20)}
                    </text>
                  </box>
                </box>
              ))}
            </box>

            <box flexDirection="column" padding={1} flexGrow={1} overflow="hidden">
               <text height={1} fg={colors.textMuted} marginBottom={1}>BY PROVIDER</text>
               {providerStats.map(([provider, cost]) => (
                 <box key={provider} flexDirection="row" justifyContent="space-between" height={1}>
                   <text height={1} fg={getProviderColor(provider)}>{provider.padEnd(18)}</text>
                   <text height={1} fg={colors.text}>{formatCurrency(cost).padStart(7)}</text>
                 </box>
               ))}
            </box>
          </box>
        )}
      </box>
      
      <box flexDirection="row" paddingLeft={1}>
        <text fg={colors.textSubtle}>
          {isFiltering ? 'Type to filter  Esc cancel  Enter apply' : 
           focusedPanel === 'sessions' ? '/ filter  ↑↓ navigate  Enter details  s sort' :
           focusedPanel === 'sidebar' ? 'Tab back to sessions' :
           '/ filter  i sidebar  Tab switch  ? help'}
        </text>
      </box>
    </box>
  );
}
