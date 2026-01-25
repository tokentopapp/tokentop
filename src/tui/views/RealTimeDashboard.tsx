import { useState, useEffect, useMemo, useRef } from 'react';
import { useTerminalDimensions } from '@opentui/react';
import type { ScrollBoxRenderable } from '@opentui/core';
import { useColors } from '../contexts/ThemeContext.tsx';
import { usePlugins } from '../contexts/PluginContext.tsx';
import { useAgentSessions } from '../contexts/AgentSessionContext.tsx';
import { useTimeWindow } from '../contexts/TimeWindowContext.tsx';
import { useConfig } from '../contexts/ConfigContext.tsx';
import { useDashboardRuntime } from '../contexts/DashboardRuntimeContext.tsx';
import { useDashboardKeyboard } from '../hooks/useDashboardKeyboard.ts';
import { DebugInspectorOverlay } from '../components/DebugInspectorOverlay.tsx';
import { KpiStrip } from '../components/KpiStrip.tsx';
import { SessionDetailsDrawer } from '../components/SessionDetailsDrawer.tsx';
import { SessionsTable } from '../components/SessionsTable.tsx';
import { SidebarBreakdown } from '../components/SidebarBreakdown.tsx';
import { LimitGauge } from '../components/LimitGauge.tsx';
import { HelpOverlay } from '../components/HelpOverlay.tsx';

export function RealTimeDashboard() {
  const colors = useColors();
  const { providers } = usePlugins();
  const { sessions: agentSessions, isLoading } = useAgentSessions();
  const { windowMs, windowLabel } = useTimeWindow();
  const { height: terminalHeight } = useTerminalDimensions();
  const { config } = useConfig();
  const { activity, sparkData, deltas, emaRef, debugDataRef } = useDashboardRuntime();

  const visibleRows = Math.max(1, terminalHeight - 29);

  const [showHelp, setShowHelp] = useState(false);
  const [showDebugInspector, setShowDebugInspector] = useState(false);
  const [showSessionDrawer, setShowSessionDrawer] = useState(false);
  const [selectedRow, setSelectedRow] = useState(0);
  const [focusedPanel, setFocusedPanel] = useState<'sessions' | 'sidebar'>('sessions');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(config.display.sidebarCollapsed);
  const [filterQuery, setFilterQuery] = useState('');
  const [isFiltering, setIsFiltering] = useState(false);
  const [sortField, setSortField] = useState<'cost' | 'tokens' | 'time'>('cost');
  const [pendingG, setPendingG] = useState(false);
  const [scrollOffset, setScrollOffset] = useState(0);

  const sessionsScrollboxRef = useRef<ScrollBoxRenderable>(null);

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

  useDashboardKeyboard({
    state: {
      showHelp,
      showDebugInspector,
      showSessionDrawer,
      selectedRow,
      focusedPanel,
      sidebarCollapsed,
      filterQuery,
      isFiltering,
      sortField,
      pendingG,
      scrollOffset,
    },
    actions: {
      setShowHelp,
      setShowDebugInspector,
      setShowSessionDrawer,
      setSelectedRow,
      setFocusedPanel,
      setSidebarCollapsed,
      setFilterQuery,
      setIsFiltering,
      setSortField,
      setPendingG,
      setScrollOffset,
    },
    processedSessions,
  });

  const totalCost = agentSessions.reduce((acc, s) => acc + (s.totalCostUsd ?? 0), 0);
  const totalTokens = agentSessions.reduce((acc, s) => acc + s.totals.input + s.totals.output, 0);
  const totalRequests = agentSessions.reduce((acc, s) => acc + s.requestCount, 0);
  const activeCount = agentSessions.filter(s => s.status === 'active').length;

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
        budget={{
          daily: config.budgets.daily,
          weekly: config.budgets.weekly,
          monthly: config.budgets.monthly,
          warningPercent: config.alerts.budgetWarningPercent,
          criticalPercent: config.alerts.budgetCriticalPercent,
        }}
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
        <SessionsTable
          ref={sessionsScrollboxRef}
          sessions={processedSessions}
          selectedRow={selectedRow}
          isLoading={isLoading}
          isFiltering={isFiltering}
          filterQuery={filterQuery}
          focusedPanel={focusedPanel}
          windowLabel={windowLabel}
          getProviderColor={getProviderColor}
        />

        {!sidebarCollapsed && (
          <SidebarBreakdown
            sessions={agentSessions}
            focusedPanel={focusedPanel}
            getProviderColor={getProviderColor}
          />
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
