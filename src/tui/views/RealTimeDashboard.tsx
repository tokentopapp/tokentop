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
import { SmartSidebar, getSidebarMode, type DriverDimension } from '../components/SmartSidebar.tsx';
import { ProviderLimitsPanel } from '../components/ProviderLimitsPanel.tsx';
import { HelpOverlay } from '../components/HelpOverlay.tsx';

export function RealTimeDashboard() {
  const colors = useColors();
  const { providers } = usePlugins();
  const { sessions: agentSessions, isLoading } = useAgentSessions();
  const { windowMs, windowLabel, budgetType, budgetTypeLabel } = useTimeWindow();
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
  const [driverDimension, setDriverDimension] = useState<DriverDimension>('model');
  const [selectedDriverIndex, setSelectedDriverIndex] = useState(0);
  const [activeDriverFilter, setActiveDriverFilter] = useState<string | null>(null);

  const sidebarMode = getSidebarMode(terminalWidth);
  const effectiveSidebarCollapsed = sidebarCollapsed || sidebarMode === 'hidden';
  const showBudgetInLimits = sidebarMode === 'hidden';

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

  const baseFilteredSessions = useMemo(() => {
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
        (s.projectPath?.toLowerCase().includes(q) ?? false) ||
        (s.sessionName?.toLowerCase().includes(q) ?? false)
      );
    }

    return result;
  }, [agentSessions, filterQuery, windowMs]);

  const drivers = useMemo(() => {
    const stats: Record<string, { cost: number }> = {};
    baseFilteredSessions.forEach(s => {
      s.streams.forEach(st => {
        let key: string;
        switch (driverDimension) {
          case 'model': key = st.modelId; break;
          case 'project': key = s.projectPath?.split('/').pop() ?? 'unknown'; break;
          case 'agent': key = s.agentName; break;
        }
        if (!stats[key]) stats[key] = { cost: 0 };
        stats[key]!.cost += st.costUsd ?? 0;
      });
    });
    return Object.entries(stats)
      .map(([id, data]) => ({ id, cost: data.cost }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 5);
  }, [baseFilteredSessions, driverDimension]);

  useEffect(() => {
    const maxIndex = Math.max(0, drivers.length - 1);
    if (selectedDriverIndex > maxIndex) {
      setSelectedDriverIndex(maxIndex);
    }
  }, [drivers.length, selectedDriverIndex]);

  useEffect(() => {
    if (activeDriverFilter === '__TOGGLE_SELECTED__') {
      const driver = drivers[selectedDriverIndex];
      setActiveDriverFilter(driver?.id ?? null);
    }
  }, [activeDriverFilter, drivers, selectedDriverIndex]);

  const processedSessions = useMemo(() => {
    let result = [...baseFilteredSessions];
    
    if (activeDriverFilter && activeDriverFilter !== '__TOGGLE_SELECTED__') {
      result = result.filter(s => {
        switch (driverDimension) {
          case 'model':
            return s.streams.some(st => st.modelId === activeDriverFilter);
          case 'project':
            return (s.projectPath?.split('/').pop() ?? 'unknown') === activeDriverFilter;
          case 'agent':
            return s.agentName === activeDriverFilter;
        }
      });
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
  }, [baseFilteredSessions, activeDriverFilter, driverDimension, sortField]);

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
      providerCount: configuredProviders.length,
      driverDimension,
      selectedDriverIndex,
      activeDriverFilter,
      sidebarMode,
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
      setDriverDimension,
      setSelectedDriverIndex,
      setActiveDriverFilter,
    },
    processedSessions,
  });

  const windowedKpis = useMemo(() => ({
    cost: processedSessions.reduce((acc, s) => acc + (s.totalCostUsd ?? 0), 0),
    tokens: processedSessions.reduce((acc, s) => acc + s.totals.input + s.totals.output, 0),
    requests: processedSessions.reduce((acc, s) => acc + s.requestCount, 0),
  }), [processedSessions]);

  const budgetPeriodCost = useMemo(() => {
    const now = new Date();
    
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    
    const dayOfWeek = now.getDay();
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek).getTime();
    
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    let dailyCost = 0;
    let weeklyCost = 0;
    let monthlyCost = 0;

    for (const session of agentSessions) {
      const cost = session.totalCostUsd ?? 0;
      const activityTime = session.lastActivityAt;
      
      if (activityTime >= startOfDay) dailyCost += cost;
      if (activityTime >= startOfWeek) weeklyCost += cost;
      if (activityTime >= startOfMonth) monthlyCost += cost;
    }

    return { daily: dailyCost, weekly: weeklyCost, monthly: monthlyCost };
  }, [agentSessions]);

  const getBudgetCost = () => {
    switch (budgetType) {
      case 'daily': return budgetPeriodCost.daily;
      case 'weekly': return budgetPeriodCost.weekly;
      case 'monthly': return budgetPeriodCost.monthly;
      default: return windowedKpis.cost;
    }
  };

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
          limit: budgetType === 'daily' ? config.budgets.daily
            : budgetType === 'weekly' ? config.budgets.weekly
            : budgetType === 'monthly' ? config.budgets.monthly
            : null,
          budgetCost: getBudgetCost(),
          budgetType,
          budgetTypeLabel,
          warningPercent: config.alerts.warningPercent,
          criticalPercent: config.alerts.criticalPercent,
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
        showBudgetBar={showBudgetInLimits}
        budget={{
          totalCost: windowedKpis.cost,
          budgetCost: getBudgetCost(),
          limit: budgetType === 'daily' ? config.budgets.daily
            : budgetType === 'weekly' ? config.budgets.weekly
            : budgetType === 'monthly' ? config.budgets.monthly
            : null,
          budgetType,
          budgetTypeLabel,
          warningPercent: config.alerts.warningPercent,
          criticalPercent: config.alerts.criticalPercent,
        }}
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
          <SmartSidebar
            sessions={processedSessions}
            budgetCost={getBudgetCost()}
            focusedPanel={focusedPanel}
            dimension={driverDimension}
            selectedDriverIndex={selectedDriverIndex}
            activeDriverFilter={activeDriverFilter}
            getProviderColor={getProviderColor}
          />
        )}
      </box>
      
      <box flexDirection="row" paddingLeft={1} height={1} flexShrink={0}>
        <text fg={colors.textSubtle} height={1} flexGrow={1}>
          {isFiltering ? 'Type to filter  Esc cancel  Enter apply' : 
           filterQuery ? `Esc clear  / edit filter  ↑↓ navigate  s sort` :
           activeDriverFilter ? `Filter: ${activeDriverFilter}  Esc clear` :
           focusedPanel === 'sessions' ? '/ filter  ↑↓ navigate  Enter details  s sort  l limits' :
           focusedPanel === 'limits' ? '←→ select provider  Tab next  Esc back' :
           focusedPanel === 'sidebar' ? '↑↓ select  Enter filter  m/p/a dimension  Tab back' :
           '/ filter  i sidebar  Tab switch  ? help'}
        </text>
      </box>
    </box>
  );
}
