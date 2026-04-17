import type { ScrollBoxRenderable } from "@opentui/core";
import { useTerminalDimensions } from "@opentui/react";
import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { notificationBus } from "@/plugins/notification-bus.ts";
import { classifyProviderError } from "@/utils/error-category.ts";
import { HelpOverlay } from "../components/HelpOverlay.tsx";
import { KpiStrip } from "../components/KpiStrip.tsx";
import { ProviderLimitsPanel } from "../components/ProviderLimitsPanel.tsx";
import { SessionsTable } from "../components/SessionsTable.tsx";
import { type DriverDimension, getSidebarMode, SmartSidebar } from "../components/SmartSidebar.tsx";
import { SortOverlay } from "../components/SortOverlay.tsx";
import { useAgentSessions } from "../contexts/AgentSessionContext.tsx";
import { useConfig } from "../contexts/ConfigContext.tsx";
import { useDashboardRuntime } from "../contexts/DashboardRuntimeContext.tsx";
import { useDrawer } from "../contexts/DrawerContext.tsx";
import { usePlugins } from "../contexts/PluginContext.tsx";
import { useColors } from "../contexts/ThemeContext.tsx";
import { useTimeWindow } from "../contexts/TimeWindowContext.tsx";
import { useDashboardKeyboard } from "../hooks/useDashboardKeyboard.ts";
import type { SortDirection, SortField } from "../types/sort.ts";
import { SORT_FIELDS } from "../types/sort.ts";
import { getProviderColor } from "../utils/providerColor.ts";
import { computeScrollOffset } from "../utils/scrollFollow.ts";

export function RealTimeDashboard() {
  const colors = useColors();
  const { providers } = usePlugins();
  const { sessions: agentSessions, isLoading } = useAgentSessions();
  const { windowMs, windowLabel, budgetType, budgetTypeLabel } = useTimeWindow();
  const { height: terminalHeight, width: terminalWidth } = useTerminalDimensions();
  const { config } = useConfig();
  const { activity, sparkData, deltas } = useDashboardRuntime();

  const sidebarMode = getSidebarMode(terminalWidth);
  const showLargeHeader = terminalHeight >= 35;
  const showProviderLimitsPanel = terminalHeight >= 24;

  // SessionsTable hides REQ, NAME, DUR, TIME columns in narrow mode (<140).
  // Filter sort fields to match visible columns.
  const SESSIONS_WIDE_THRESHOLD = 140;
  const NARROW_HIDDEN_FIELDS: ReadonlySet<SortField> = new Set([
    "requests",
    "name",
    "duration",
    "time",
  ]);
  const visibleSortFields = useMemo(
    () =>
      terminalWidth >= SESSIONS_WIDE_THRESHOLD
        ? SORT_FIELDS
        : SORT_FIELDS.filter((f) => !NARROW_HIDDEN_FIELDS.has(f.id)),
    [terminalWidth],
  );

  // Visible-row count for scroll tracking — every non-session-data line must be counted.
  const visibleRows = (() => {
    const appChrome = (showLargeHeader ? 7 : 1) + 1; // App.tsx: Header + StatusBar
    const outerPadding = 2; // padding={1} top + bottom
    const kpi = 5; // KpiStrip fragment: h4 cards + h1 rule
    const limits = !showProviderLimitsPanel
      ? 0 // ProviderLimitsPanel
      : terminalHeight < 30
        ? sidebarMode === "hidden"
          ? 2
          : 1 // compact (+budget bar)
        : 4; // normal/wide bordered box
    const tableChrome = 4 + (terminalHeight >= 30 ? 1 : 0); // borders + header + columns + inspector
    const footer = 1; // keyboard shortcut bar
    // gap={1} between rendered children; KpiStrip fragment injects 2 children
    const children = 2 + (showProviderLimitsPanel ? 1 : 0) + 1 + 1;
    const gaps = children - 1;
    return Math.max(
      1,
      terminalHeight - appChrome - outerPadding - kpi - limits - tableChrome - footer - gaps,
    );
  })();

  const { showDrawer, isOpen: showSessionDrawer } = useDrawer();

  const [showHelp, setShowHelp] = useState(false);
  // Cursor and scroll offset share one state so batched j-presses advance
  // both in lockstep — see setSelectedRow below.
  const [nav, setNav] = useState<{ selectedRow: number; scrollOffset: number }>({
    selectedRow: 0,
    scrollOffset: 0,
  });
  const { selectedRow, scrollOffset } = nav;
  const [focusedPanel, setFocusedPanel] = useState<"sessions" | "sidebar" | "limits">("sessions");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(config.display.sidebarCollapsed);
  const [filterQuery, setFilterQuery] = useState("");
  const [isFiltering, setIsFiltering] = useState(false);
  const [sortField, setSortField] = useState<SortField>("time");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [showSortOverlay, setShowSortOverlay] = useState(false);
  const [pendingG, setPendingG] = useState(false);
  const selectedSessionIdRef = useRef<string | null>(null);
  const [limitSelectedIndex, setLimitSelectedIndex] = useState(0);
  const [driverDimension, setDriverDimension] = useState<DriverDimension>("model");
  const [selectedDriverIndex, setSelectedDriverIndex] = useState(0);
  const [activeDriverFilter, setActiveDriverFilter] = useState<string | null>(null);

  const effectiveSidebarCollapsed = sidebarCollapsed || sidebarMode === "hidden";
  const showBudgetInLimits = sidebarMode === "hidden";

  const sessionsScrollboxRef = useRef<ScrollBoxRenderable>(null);

  const visibleRowsRef = useRef(visibleRows);
  visibleRowsRef.current = visibleRows;
  const sessionsLengthRef = useRef(0);

  const setSelectedRow = useCallback<Dispatch<SetStateAction<number>>>((arg) => {
    setNav((prev) => {
      const next = typeof arg === "function" ? arg(prev.selectedRow) : arg;
      const clamped = Math.max(0, next);
      const newOffset = computeScrollOffset(
        clamped,
        prev.scrollOffset,
        visibleRowsRef.current,
        sessionsLengthRef.current,
      );
      if (clamped === prev.selectedRow && newOffset === prev.scrollOffset) return prev;
      return { selectedRow: clamped, scrollOffset: newOffset };
    });
  }, []);

  const setScrollOffset = useCallback((val: number) => {
    setNav((prev) => {
      if (val === prev.scrollOffset) return prev;
      return { ...prev, scrollOffset: val };
    });
  }, []);

  const configuredProviders = useMemo(() => {
    return Array.from(providers.values())
      .filter((p) => p.configured)
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

  const providerColorOf = useCallback(
    (id: string) => getProviderColor(id, providers, colors.primary),
    [providers, colors.primary],
  );

  const baseFilteredSessions = useMemo(() => {
    let result = [...agentSessions];

    if (windowMs !== null) {
      const cutoff = Date.now() - windowMs;
      result = result.filter((s) => s.lastActivityAt >= cutoff);
    }

    if (filterQuery) {
      const q = filterQuery.toLowerCase();
      result = result.filter(
        (s) =>
          s.agentName.toLowerCase().includes(q) ||
          s.streams.some((st) => st.modelId.toLowerCase().includes(q)) ||
          (s.projectPath?.toLowerCase().includes(q) ?? false) ||
          (s.sessionName?.toLowerCase().includes(q) ?? false),
      );
    }

    return result;
  }, [agentSessions, filterQuery, windowMs]);

  const drivers = useMemo(() => {
    const stats: Record<string, { cost: number }> = {};
    baseFilteredSessions.forEach((s) => {
      s.streams.forEach((st) => {
        let key: string;
        switch (driverDimension) {
          case "model":
            key = st.modelId;
            break;
          case "project":
            key = s.projectPath?.split("/").pop() ?? "unknown";
            break;
          case "agent":
            key = s.agentName;
            break;
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
    if (activeDriverFilter === "__TOGGLE_SELECTED__") {
      const driver = drivers[selectedDriverIndex];
      setActiveDriverFilter(driver?.id ?? null);
    }
  }, [activeDriverFilter, drivers, selectedDriverIndex]);

  const processedSessions = useMemo(() => {
    let result = [...baseFilteredSessions];

    if (activeDriverFilter && activeDriverFilter !== "__TOGGLE_SELECTED__") {
      result = result.filter((s) => {
        switch (driverDimension) {
          case "model":
            return s.streams.some((st) => st.modelId === activeDriverFilter);
          case "project":
            return (s.projectPath?.split("/").pop() ?? "unknown") === activeDriverFilter;
          case "agent":
            return s.agentName === activeDriverFilter;
          default:
            return true;
        }
      });
    }

    result.sort((a, b) => {
      const aActive = a.status === "active" ? 1 : 0;
      const bActive = b.status === "active" ? 1 : 0;
      if (bActive !== aActive) return bActive - aActive;

      let cmp = 0;
      switch (sortField) {
        case "cost":
          cmp = (a.totalCostUsd ?? 0) - (b.totalCostUsd ?? 0);
          break;
        case "tokens":
          cmp = a.totals.input + a.totals.output - (b.totals.input + b.totals.output);
          break;
        case "time":
          cmp = a.lastActivityAt - b.lastActivityAt;
          break;
        case "requests":
          cmp = a.requestCount - b.requestCount;
          break;
        case "duration": {
          const aDur = (a.endedAt ?? Date.now()) - a.startedAt;
          const bDur = (b.endedAt ?? Date.now()) - b.startedAt;
          cmp = aDur - bDur;
          break;
        }
        case "project": {
          const aProj = a.projectPath?.split("/").pop() ?? "";
          const bProj = b.projectPath?.split("/").pop() ?? "";
          cmp = aProj.localeCompare(bProj);
          break;
        }
        case "agent":
          cmp = a.agentName.localeCompare(b.agentName);
          break;
        case "model": {
          const aModel = a.streams[0]?.modelId ?? "";
          const bModel = b.streams[0]?.modelId ?? "";
          cmp = aModel.localeCompare(bModel);
          break;
        }
        case "name": {
          const aName = a.sessionName ?? "";
          const bName = b.sessionName ?? "";
          cmp = aName.localeCompare(bName);
          break;
        }
      }
      return sortDirection === "desc" ? -cmp : cmp;
    });

    return result;
  }, [baseFilteredSessions, activeDriverFilter, driverDimension, sortField, sortDirection]);

  sessionsLengthRef.current = processedSessions.length;

  // A keypress and a refresh tick can batch into one render; if they do,
  // `prev` may be the user's new row while `selectedSessionIdRef` is still
  // the session they moved *from*. Trusting `prev` when it resolves to a
  // valid session prevents a snap-back bounce.
  useLayoutEffect(() => {
    if (processedSessions.length === 0) {
      setSelectedRow(0);
      setScrollOffset(0);
      selectedSessionIdRef.current = null;
      return;
    }

    setSelectedRow((prev) => {
      const currentSession = processedSessions[prev];

      if (currentSession) {
        if (currentSession.sessionId === selectedSessionIdRef.current) {
          return prev;
        }
        if (selectedSessionIdRef.current) {
          const trackedIndex = processedSessions.findIndex(
            (s) => s.sessionId === selectedSessionIdRef.current,
          );
          if (trackedIndex !== -1 && trackedIndex !== prev) {
            return trackedIndex;
          }
        }
        selectedSessionIdRef.current = currentSession.sessionId;
        return prev;
      }

      if (selectedSessionIdRef.current) {
        const trackedIndex = processedSessions.findIndex(
          (s) => s.sessionId === selectedSessionIdRef.current,
        );
        if (trackedIndex !== -1) return trackedIndex;
        selectedSessionIdRef.current = null;
      }

      const clamped = Math.min(prev, processedSessions.length - 1);
      selectedSessionIdRef.current = processedSessions[clamped]?.sessionId ?? null;
      return clamped;
    });
  }, [processedSessions, setScrollOffset]);

  useLayoutEffect(() => {
    const session = processedSessions[selectedRow];
    if (session) {
      selectedSessionIdRef.current = session.sessionId;
    }
  }, [selectedRow, processedSessions]);

  useLayoutEffect(() => {
    if (processedSessions.length === 0) return;
    setNav((prev) => {
      const newOffset = computeScrollOffset(
        prev.selectedRow,
        prev.scrollOffset,
        visibleRows,
        processedSessions.length,
      );
      if (newOffset === prev.scrollOffset) return prev;
      return { ...prev, scrollOffset: newOffset };
    });
  }, [processedSessions.length, visibleRows]);

  useLayoutEffect(() => {
    sessionsScrollboxRef.current?.scrollTo(scrollOffset);
  }, [scrollOffset]);

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
      sortDirection,
      pendingG,
      scrollOffset,
      limitSelectedIndex,
      providerCount: configuredProviders.length,
      driverDimension,
      selectedDriverIndex,
      activeDriverFilter,
      sidebarMode,
      showSortOverlay,
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
      setSortDirection,
      setPendingG,
      setScrollOffset,
      setLimitSelectedIndex,
      setDriverDimension,
      setSelectedDriverIndex,
      setActiveDriverFilter,
      setShowSortOverlay,
    },
    processedSessions,
  });

  const windowedKpis = useMemo(
    () => ({
      cost: processedSessions.reduce((acc, s) => acc + (s.totalCostUsd ?? 0), 0),
      tokens: processedSessions.reduce((acc, s) => acc + s.totals.input + s.totals.output, 0),
      requests: processedSessions.reduce((acc, s) => acc + s.requestCount, 0),
    }),
    [processedSessions],
  );

  const budgetPeriodCost = useMemo(() => {
    let dailyCost = 0;
    let weeklyCost = 0;
    let monthlyCost = 0;

    for (const session of agentSessions) {
      dailyCost += session.costInDay;
      weeklyCost += session.costInWeek;
      monthlyCost += session.costInMonth;
    }

    return { daily: dailyCost, weekly: weeklyCost, monthly: monthlyCost };
  }, [agentSessions]);

  useEffect(() => {
    const checks: Array<{
      cost: number;
      limit: number | null;
      type: "daily" | "weekly" | "monthly";
    }> = [
      { cost: budgetPeriodCost.daily, limit: config.budgets.daily, type: "daily" },
      { cost: budgetPeriodCost.weekly, limit: config.budgets.weekly, type: "weekly" },
      { cost: budgetPeriodCost.monthly, limit: config.budgets.monthly, type: "monthly" },
    ];
    for (const { cost, limit, type } of checks) {
      if (limit !== null && limit > 0) {
        notificationBus.checkBudget(cost, limit, type, config);
      }
    }
  }, [budgetPeriodCost, config]);

  const getBudgetCost = () => {
    switch (budgetType) {
      case "daily":
        return budgetPeriodCost.daily;
      case "weekly":
        return budgetPeriodCost.weekly;
      case "monthly":
        return budgetPeriodCost.monthly;
      default:
        return windowedKpis.cost;
    }
  };

  const activeCount = agentSessions.filter((s) => s.status === "active").length;

  return (
    <box flexDirection="column" flexGrow={1} padding={1} gap={1} overflow="hidden">
      {showHelp && <HelpOverlay />}
      {showSortOverlay && (
        <SortOverlay
          fields={visibleSortFields}
          currentField={sortField}
          currentDirection={sortDirection}
          onSelect={(field, direction) => {
            setSortField(() => field);
            setSortDirection(() => direction);
            setShowSortOverlay(false);
          }}
          onClose={() => setShowSortOverlay(false)}
        />
      )}

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
          limit:
            budgetType === "daily"
              ? config.budgets.daily
              : budgetType === "weekly"
                ? config.budgets.weekly
                : budgetType === "monthly"
                  ? config.budgets.monthly
                  : null,
          budgetCost: getBudgetCost(),
          budgetType,
          budgetTypeLabel,
          warningPercent: config.alerts.warningPercent,
          criticalPercent: config.alerts.criticalPercent,
        }}
      />

      <ProviderLimitsPanel
        providers={configuredProviders.map((p) => ({
          id: p.plugin.id,
          name: p.plugin.name,
          usedPercent: getMaxUsedPercent(p),
          color: providerColorOf(p.plugin.id),
          ...(p.usage?.error
            ? { error: p.usage.error, errorCategory: classifyProviderError(p.usage.error) }
            : {}),
        }))}
        focused={focusedPanel === "limits"}
        selectedIndex={limitSelectedIndex}
        showBudgetBar={showBudgetInLimits}
        budget={{
          totalCost: windowedKpis.cost,
          budgetCost: getBudgetCost(),
          limit:
            budgetType === "daily"
              ? config.budgets.daily
              : budgetType === "weekly"
                ? config.budgets.weekly
                : budgetType === "monthly"
                  ? config.budgets.monthly
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
          scrollOffset={scrollOffset}
          visibleRows={visibleRows}
          isLoading={isLoading}
          isFiltering={isFiltering}
          filterQuery={filterQuery}
          focusedPanel={focusedPanel}
          windowLabel={windowLabel}
          getProviderColor={providerColorOf}
          sortField={sortField}
          sortDirection={sortDirection}
        />

        {!effectiveSidebarCollapsed && (
          <SmartSidebar
            sessions={processedSessions}
            budgetCost={getBudgetCost()}
            focusedPanel={focusedPanel}
            dimension={driverDimension}
            selectedDriverIndex={selectedDriverIndex}
            activeDriverFilter={activeDriverFilter}
            getProviderColor={providerColorOf}
          />
        )}
      </box>

      <box flexDirection="row" paddingLeft={1} height={1} flexShrink={0}>
        <text fg={colors.textSubtle} height={1} flexGrow={1}>
          {isFiltering
            ? "Type to filter  Esc cancel  Enter apply"
            : filterQuery
              ? `Esc clear  / edit filter  ↑↓ navigate  s sort`
              : activeDriverFilter
                ? `Filter: ${activeDriverFilter}  Esc clear`
                : focusedPanel === "sessions"
                  ? "/ filter  ↑↓ navigate  Enter details  s sort  l limits  Tab next"
                  : focusedPanel === "limits"
                    ? "←→ select provider  Tab next  ⇧Tab prev  Esc back"
                    : focusedPanel === "sidebar"
                      ? "↑↓ select  Enter filter  m/p/a dimension  b budget  Tab next  ⇧Tab prev"
                      : "/ filter  i sidebar  Tab/⇧Tab switch  ? help"}
        </text>
      </box>
    </box>
  );
}
