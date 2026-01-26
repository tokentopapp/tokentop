import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useTerminalDimensions } from '@opentui/react';
import type { ScrollBoxRenderable } from '@opentui/core';
import { useColors } from '../contexts/ThemeContext.tsx';
import { usePlugins } from '../contexts/PluginContext.tsx';
import { useAgentSessions } from '../contexts/AgentSessionContext.tsx';
import { useTimeWindow } from '../contexts/TimeWindowContext.tsx';
import { useConfig } from '../contexts/ConfigContext.tsx';
import { useDashboardRuntime } from '../contexts/DashboardRuntimeContext.tsx';
import { useDrawer } from '../contexts/DrawerContext.tsx';
import { useDashboardKeyboard } from '../hooks/useDashboardKeyboard.ts';

import { KpiStrip } from '../components/KpiStrip.tsx';
import { SessionsTable } from '../components/SessionsTable.tsx';
import { SidebarBreakdown } from '../components/SidebarBreakdown.tsx';
import { ProviderLimitsPanel } from '../components/ProviderLimitsPanel.tsx';
import { HelpOverlay } from '../components/HelpOverlay.tsx';

export function RealTimeDashboard() {
  const colors = useColors();
  const { providers } = usePlugins();
  const { sessions: agentSessions, isLoading } = useAgentSessions();
  const { windowMs, windowLabel } = useTimeWindow();
  const { height: terminalHeight, width: terminalWidth } = useTerminalDimensions();
  const { config } = useConfig();
  const { activity, sparkData, deltas } = useDashboardRuntime();

  const showLargeHeader = terminalHeight >= 35;
  const showProviderLimitsPanel = terminalHeight >= 24;
  
  const LARGE_HEADER_AREA = 16;
  const SMALL_HEADER_AREA = 9;
  const HEADER_AREA = showLargeHeader ? LARGE_HEADER_AREA : SMALL_HEADER_AREA;
  const PROVIDER_LIMITS_COMPACT = 1;
  const PROVIDER_LIMITS_FULL = 6;
  const providerLimitsArea = !showProviderLimitsPanel ? 0 : (terminalHeight < 30 ? PROVIDER_LIMITS_COMPACT : PROVIDER_LIMITS_FULL);
  const TABLE_CHROME = 4;
  const FOOTER_AREA = 3;
  const reservedLines = HEADER_AREA + providerLimitsArea + TABLE_CHROME + FOOTER_AREA;
  const visibleRows = Math.max(1, terminalHeight - reservedLines);

  const { showDrawer, isOpen: showSessionDrawer } = useDrawer();
  
  const [showHelp, setShowHelp] = useState(false);
  const [selectedRow, setSelectedRow] = useState(0);
  const [focusedPanel, setFocusedPanel] = useState<'sessions' | 'sidebar' | 'limits'>('sessions');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(config.display.sidebarCollapsed);
  const [filterQuery, setFilterQuery] = useState('');
  const [isFiltering, setIsFiltering] = useState(false);
  const [sortField, setSortField] = useState<'cost' | 'tokens' | 'time'>('cost');
  const [pendingG, setPendingG] = useState(false);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [limitSelectedIndex, setLimitSelectedIndex] = useState(0);

  // Collapse sidebar if terminal is too narrow, overriding user preference if needed
  const effectiveSidebarCollapsed = sidebarCollapsed || terminalWidth < 100;

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
    if (processedSessions.length === 0) {
      if (selectedRow !== 0) setSelectedRow(0);
      if (scrollOffset !== 0) setScrollOffset(0);
      return;
    }
    
    const maxRow = processedSessions.length - 1;
    if (selectedRow > maxRow) {
      setSelectedRow(maxRow);
      return;
    }
  }, [processedSessions.length, selectedRow, scrollOffset]);

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
  }, [selectedRow, processedSessions.length, scrollOffset, visibleRows]);

  const openSessionDrawer = useCallback(() => {
    const session = processedSessions[selectedRow];
    if (session) {
      showDrawer(session);
    }
  }, [processedSessions, selectedRow, showDrawer]);

  const { hideDrawer } = useDrawer();

  const visibleProviderCount = Math.min(configuredProviders.length, terminalWidth >= 140 ? 6 : 4);

  useDashboardKeyboard({
    state: {
      showHelp,
      showSessionDrawer,
      selectedRow,
      focusedPanel,
      sidebarCollapsed,
      filterQuery,
      isFiltering,
      sortField,
      pendingG,
      scrollOffset,
      limitSelectedIndex,
      providerCount: visibleProviderCount,
    },
    actions: {
      setShowHelp,
      openSessionDrawer,
      closeSessionDrawer: hideDrawer,
      setSelectedRow,
      setFocusedPanel,
      setSidebarCollapsed,
      setFilterQuery,
      setIsFiltering,
      setSortField,
      setPendingG,
      setScrollOffset,
      setLimitSelectedIndex,
    },
    processedSessions,
  });

  const windowedKpis = useMemo(() => ({
    cost: processedSessions.reduce((acc, s) => acc + (s.totalCostUsd ?? 0), 0),
    tokens: processedSessions.reduce((acc, s) => acc + s.totals.input + s.totals.output, 0),
    requests: processedSessions.reduce((acc, s) => acc + s.requestCount, 0),
  }), [processedSessions]);

  const activeCount = agentSessions.filter(s => s.status === 'active').length;

  return (
    <box flexDirection="column" flexGrow={1} padding={1} gap={1} overflow="hidden">
      {showHelp && <HelpOverlay />}

      
      <KpiStrip
        totalCost={windowedKpis.cost}
        totalTokens={windowedKpis.tokens}
        totalRequests={windowedKpis.requests}
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

      <ProviderLimitsPanel
        providers={configuredProviders.map(p => ({
          id: p.plugin.id,
          name: p.plugin.name,
          usedPercent: getMaxUsedPercent(p),
          color: getProviderColor(p.plugin.id),
          ...(p.usage?.error ? { error: p.usage.error } : {}),
        }))}
        focused={focusedPanel === 'limits'}
        selectedIndex={limitSelectedIndex}
      />

      <box flexDirection="row" gap={1} flexGrow={1} minHeight={1}>
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

        {!effectiveSidebarCollapsed && (
          <SidebarBreakdown
            sessions={processedSessions}
            focusedPanel={focusedPanel}
            getProviderColor={getProviderColor}
          />
        )}
      </box>
      
      <box flexDirection="row" paddingLeft={1} height={1} flexShrink={0}>
        <text fg={colors.textSubtle} height={1} flexGrow={1}>
          {isFiltering ? 'Type to filter  Esc cancel  Enter apply' : 
           filterQuery ? `Esc clear  / edit filter  ↑↓ navigate  s sort` :
           focusedPanel === 'sessions' ? '/ filter  ↑↓ navigate  Enter details  s sort  l limits' :
           focusedPanel === 'limits' ? '←→ select provider  Tab next  Esc back' :
           focusedPanel === 'sidebar' ? 'Tab back to sessions' :
           '/ filter  i sidebar  Tab switch  ? help'}
        </text>
      </box>
    </box>
  );
}
