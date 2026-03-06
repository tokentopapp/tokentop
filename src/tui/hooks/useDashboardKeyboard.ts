import { useKeyboard } from "@opentui/react";
import { useEffect, useRef } from "react";
import { copyToClipboard } from "@/utils/clipboard.ts";
import type { AgentSessionAggregate } from "../../agents/types.ts";
import type { DriverDimension, SidebarMode } from "../components/SmartSidebar.tsx";
import { useAgentSessions } from "../contexts/AgentSessionContext.tsx";
import { useInputFocus } from "../contexts/InputContext.tsx";
import { useTimeWindow } from "../contexts/TimeWindowContext.tsx";
import { useToastContext } from "../contexts/ToastContext.tsx";
import type { SortDirection, SortField } from "../types/sort.ts";

function formatSessionSummary(session: AgentSessionAggregate): string {
  const effectiveTokens = session.totals.input + session.totals.output;
  const cost = session.totalCostUsd?.toFixed(4) ?? "0.00";
  const primaryModel = session.streams[0]?.modelId ?? "unknown";
  const duration = Math.round((session.lastActivityAt - session.startedAt) / 1000);
  const durationStr =
    duration > 3600
      ? `${Math.floor(duration / 3600)}h ${Math.floor((duration % 3600) / 60)}m`
      : duration > 60
        ? `${Math.floor(duration / 60)}m ${duration % 60}s`
        : `${duration}s`;

  const cacheRead = session.totals.cacheRead ?? 0;
  const cacheWrite = session.totals.cacheWrite ?? 0;

  const lines = [
    `Session: ${session.sessionId}`,
    `Agent: ${session.agentName}`,
    `Model: ${primaryModel}`,
    `Status: ${session.status}`,
    `Duration: ${durationStr}`,
    `Tokens: ${effectiveTokens.toLocaleString()} (in: ${session.totals.input.toLocaleString()}, out: ${session.totals.output.toLocaleString()})`,
    `Cost: $${cost}`,
    `Requests: ${session.requestCount}`,
  ];

  if (cacheRead > 0 || cacheWrite > 0) {
    const totalInput = session.totals.input + cacheRead + cacheWrite;
    const hitRate = totalInput > 0 ? Math.round((cacheRead / totalInput) * 100) : 0;
    lines.push(
      `Cache: ${hitRate}% hit (read: ${cacheRead.toLocaleString()}, write: ${cacheWrite.toLocaleString()})`,
    );
  }

  if (session.projectPath) lines.push(`Project: ${session.projectPath}`);
  return lines.join("\n");
}

interface DashboardKeyboardState {
  showHelp: boolean;
  showSessionDrawer: boolean;
  selectedRow: number;
  focusedPanel: "sessions" | "sidebar" | "limits";
  sidebarCollapsed: boolean;
  filterQuery: string;
  isFiltering: boolean;
  sortField: SortField;
  sortDirection: SortDirection;
  showSortOverlay: boolean;
  pendingG: boolean;
  scrollOffset: number;
  limitSelectedIndex: number;
  providerCount: number;
  driverDimension: DriverDimension;
  selectedDriverIndex: number;
  activeDriverFilter: string | null;
  sidebarMode: SidebarMode;
}

interface DashboardKeyboardActions {
  setShowHelp: (fn: (prev: boolean) => boolean) => void;
  openSessionDrawer: () => void;
  closeSessionDrawer: () => void;
  setSelectedRow: (fn: (prev: number) => number) => void;
  setFocusedPanel: (
    fn: (prev: "sessions" | "sidebar" | "limits") => "sessions" | "sidebar" | "limits",
  ) => void;
  setSidebarCollapsed: (fn: (prev: boolean) => boolean) => void;
  setFilterQuery: (fn: (prev: string) => string) => void;
  setIsFiltering: (val: boolean) => void;
  setSortField: (fn: (prev: SortField) => SortField) => void;
  setSortDirection: (fn: (prev: SortDirection) => SortDirection) => void;
  setPendingG: (val: boolean) => void;
  setScrollOffset: (val: number) => void;
  setLimitSelectedIndex: (fn: (prev: number) => number) => void;
  setDriverDimension: (fn: (prev: DriverDimension) => DriverDimension) => void;
  setSelectedDriverIndex: (fn: (prev: number) => number) => void;
  setActiveDriverFilter: (val: string | null) => void;
  setShowSortOverlay: (val: boolean) => void;
  clearSelectedSessionId: () => void;
}

interface UseDashboardKeyboardProps {
  state: DashboardKeyboardState;
  actions: DashboardKeyboardActions;
  processedSessions: AgentSessionAggregate[];
}

export function useDashboardKeyboard({
  state,
  actions,
  processedSessions,
}: UseDashboardKeyboardProps) {
  const { setInputFocused } = useInputFocus();
  const { cycleWindow, cycleWindowBack, cycleBudgetLock } = useTimeWindow();
  const { showToast } = useToastContext();
  const { refreshSessions } = useAgentSessions();

  const isFilteringRef = useRef(state.isFiltering);
  const modalOpenRef = useRef(false);
  const pendingGRef = useRef(false);
  const sessionsRef = useRef(processedSessions);
  const focusedPanelRef = useRef(state.focusedPanel);
  const providerCountRef = useRef(state.providerCount);
  const filterQueryRef = useRef(state.filterQuery);
  const driverDimensionRef = useRef(state.driverDimension);
  const selectedDriverIndexRef = useRef(state.selectedDriverIndex);
  const activeDriverFilterRef = useRef(state.activeDriverFilter);
  const sidebarModeRef = useRef(state.sidebarMode);

  useEffect(() => {
    isFilteringRef.current = state.isFiltering;
    modalOpenRef.current = state.showHelp || state.showSessionDrawer || state.showSortOverlay;
    pendingGRef.current = state.pendingG;
    sessionsRef.current = processedSessions;
    focusedPanelRef.current = state.focusedPanel;
    providerCountRef.current = state.providerCount;
    filterQueryRef.current = state.filterQuery;
    driverDimensionRef.current = state.driverDimension;
    selectedDriverIndexRef.current = state.selectedDriverIndex;
    activeDriverFilterRef.current = state.activeDriverFilter;
    sidebarModeRef.current = state.sidebarMode;
  }, [
    state.isFiltering,
    state.showHelp,
    state.showSessionDrawer,
    state.showSortOverlay,
    state.pendingG,
    processedSessions,
    state.focusedPanel,
    state.providerCount,
    state.filterQuery,
    state.driverDimension,
    state.selectedDriverIndex,
    state.activeDriverFilter,
    state.sidebarMode,
  ]);

  const { isInputFocused } = useInputFocus();

  useKeyboard((key) => {
    // Let App.tsx handle global Ctrl+ shortcuts (Ctrl+P for capture, Ctrl+S for save, etc.)
    if (key.ctrl) {
      return;
    }

    // Allow filter mode to handle its own input (no <input> element in RealTimeDashboard)
    if (isInputFocused && !isFilteringRef.current) {
      return;
    }

    if (key.sequence === "?" || (key.shift && key.name === "/")) {
      actions.setShowHelp((prev) => !prev);
      return;
    }

    if (modalOpenRef.current) {
      if (key.name === "escape" || key.name === "q" || key.sequence === "?") {
        actions.setShowHelp(() => false);
        actions.closeSessionDrawer();
        return;
      }

      const selectedSession = processedSessions[state.selectedRow];
      if (state.showSessionDrawer && selectedSession) {
        if (key.name === "c") {
          const summary = formatSessionSummary(selectedSession);
          copyToClipboard(summary)
            .then(() => {
              showToast("Copied to clipboard");
            })
            .catch(() => {
              showToast("Copy failed", "error");
            });
          return;
        }
        if (key.name === "x") {
          showToast("Export not yet implemented", "info");
          return;
        }
      }
      return;
    }

    if (isFilteringRef.current) {
      if (key.name === "enter" || key.name === "return") {
        actions.setIsFiltering(false);
        setInputFocused(false);
        return;
      }
      if (key.name === "escape") {
        actions.setFilterQuery(() => "");
        actions.setIsFiltering(false);
        setInputFocused(false);
        return;
      }
      if (key.name === "backspace") {
        actions.setFilterQuery((q) => q.slice(0, -1));
        return;
      }
      if (key.sequence && key.sequence.length === 1 && /^[a-zA-Z0-9\-_./]$/.test(key.sequence)) {
        actions.setFilterQuery((q) => q + key.sequence);
        return;
      }
      return;
    }

    if (key.name === "tab" && !key.shift) {
      actions.setFocusedPanel((curr) => {
        if (curr === "sessions") return "limits";
        if (curr === "limits") return "sidebar";
        return "sessions";
      });
      return;
    }
    if (key.name === "tab" && key.shift) {
      actions.setFocusedPanel((curr) => {
        if (curr === "sessions") return "sidebar";
        if (curr === "sidebar") return "limits";
        return "sessions";
      });
      return;
    }

    if (key.name === "l" && focusedPanelRef.current !== "limits") {
      actions.setFocusedPanel(() => "limits");
      return;
    }

    if (key.name === "i") {
      actions.setSidebarCollapsed((curr) => !curr);
      return;
    }

    if (key.name === "/" || key.sequence === "/") {
      actions.setIsFiltering(true);
      setInputFocused(true);
      return;
    }

    // Open sort overlay menu
    if (key.name === "s") {
      actions.setShowSortOverlay(true);
      return;
    }

    // Clear applied filter with Escape (when not in typing mode)
    if (key.name === "escape" && filterQueryRef.current) {
      actions.setFilterQuery(() => "");
      return;
    }

    if (key.name === "t" && key.shift) {
      cycleWindowBack();
      return;
    }

    if (key.name === "t") {
      cycleWindow();
      return;
    }

    if (key.name === "r") {
      refreshSessions();
      return;
    }

    if (focusedPanelRef.current === "sessions") {
      const sessions = sessionsRef.current;
      if (key.name === "down" || key.name === "j") {
        pendingGRef.current = false;
        actions.setPendingG(false);
        actions.setSelectedRow((curr) => Math.min(curr + 1, sessions.length - 1));
      } else if (key.name === "up" || key.name === "k") {
        pendingGRef.current = false;
        actions.setPendingG(false);
        actions.setSelectedRow((curr) => Math.max(curr - 1, 0));
      } else if (key.shift && key.name === "g") {
        pendingGRef.current = false;
        actions.setPendingG(false);
        actions.clearSelectedSessionId();
        actions.setSelectedRow(() => sessions.length - 1);
      } else if (key.name === "g") {
        if (pendingGRef.current) {
          actions.clearSelectedSessionId();
          actions.setSelectedRow(() => 0);
          actions.setScrollOffset(0);
          pendingGRef.current = false;
          actions.setPendingG(false);
        } else {
          pendingGRef.current = true;
          actions.setPendingG(true);
          setTimeout(() => {
            pendingGRef.current = false;
            actions.setPendingG(false);
          }, 500);
        }
      } else if (key.name === "return" && sessions.length > 0) {
        pendingGRef.current = false;
        actions.setPendingG(false);
        actions.openSessionDrawer();
      } else {
        pendingGRef.current = false;
        actions.setPendingG(false);
      }
    }

    if (focusedPanelRef.current === "limits") {
      const maxIndex = Math.max(0, providerCountRef.current - 1);
      if (key.name === "left" || key.name === "h") {
        actions.setLimitSelectedIndex((curr) => Math.max(curr - 1, 0));
        return;
      } else if (key.name === "right" || key.name === "l") {
        actions.setLimitSelectedIndex((curr) => Math.min(curr + 1, maxIndex));
        return;
      } else if (key.name === "escape") {
        actions.setFocusedPanel(() => "sessions");
        actions.setLimitSelectedIndex(() => 0);
        return;
      }
    }

    if (focusedPanelRef.current === "sidebar") {
      if (key.name === "down" || key.name === "j") {
        actions.setSelectedDriverIndex((curr) => curr + 1);
        return;
      } else if (key.name === "up" || key.name === "k") {
        actions.setSelectedDriverIndex((curr) => Math.max(curr - 1, 0));
        return;
      }

      if (key.name === "return") {
        if (activeDriverFilterRef.current !== null) {
          actions.setActiveDriverFilter(null);
        } else {
          actions.setActiveDriverFilter("__TOGGLE_SELECTED__");
        }
        return;
      }

      if (key.name === "m") {
        actions.setDriverDimension(() => "model");
        actions.setSelectedDriverIndex(() => 0);
        return;
      } else if (key.name === "p") {
        actions.setDriverDimension(() => "project");
        actions.setSelectedDriverIndex(() => 0);
        return;
      } else if (key.name === "a") {
        actions.setDriverDimension(() => "agent");
        actions.setSelectedDriverIndex(() => 0);
        return;
      }

      if (key.name === "b") {
        cycleBudgetLock();
        return;
      }

      if (key.name === "escape") {
        if (activeDriverFilterRef.current !== null) {
          actions.setActiveDriverFilter(null);
        } else {
          actions.setFocusedPanel(() => "sessions");
        }
        return;
      }
    }
  });
}
