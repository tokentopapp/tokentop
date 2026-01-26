import { useRef, useEffect } from 'react';
import { useKeyboard } from '@opentui/react';
import { useInputFocus } from '../contexts/InputContext.tsx';
import { useTimeWindow } from '../contexts/TimeWindowContext.tsx';
import { useToastContext } from '../contexts/ToastContext.tsx';
import { useAgentSessions } from '../contexts/AgentSessionContext.tsx';
import { copyToClipboard } from '@/utils/clipboard.ts';
import type { AgentSessionAggregate } from '../../agents/types.ts';

function formatSessionSummary(session: AgentSessionAggregate): string {
  const totalTokens = session.totals.input + session.totals.output;
  const cost = session.totalCostUsd?.toFixed(4) ?? '0.00';
  const primaryModel = session.streams[0]?.modelId ?? 'unknown';
  const duration = Math.round((session.lastActivityAt - session.startedAt) / 1000);
  const durationStr = duration > 3600
    ? `${Math.floor(duration / 3600)}h ${Math.floor((duration % 3600) / 60)}m`
    : duration > 60
      ? `${Math.floor(duration / 60)}m ${duration % 60}s`
      : `${duration}s`;

  return [
    `Session: ${session.sessionId}`,
    `Agent: ${session.agentName}`,
    `Model: ${primaryModel}`,
    `Status: ${session.status}`,
    `Duration: ${durationStr}`,
    `Tokens: ${totalTokens.toLocaleString()} (in: ${session.totals.input.toLocaleString()}, out: ${session.totals.output.toLocaleString()})`,
    `Cost: $${cost}`,
    `Requests: ${session.requestCount}`,
    session.projectPath ? `Project: ${session.projectPath}` : null,
  ].filter(Boolean).join('\n');
}

interface DashboardKeyboardState {
  showHelp: boolean;
  showSessionDrawer: boolean;
  selectedRow: number;
  focusedPanel: 'sessions' | 'sidebar' | 'limits';
  sidebarCollapsed: boolean;
  filterQuery: string;
  isFiltering: boolean;
  sortField: 'cost' | 'tokens' | 'time';
  pendingG: boolean;
  scrollOffset: number;
  limitSelectedIndex: number;
  providerCount: number;
}

interface DashboardKeyboardActions {
  setShowHelp: (fn: (prev: boolean) => boolean) => void;
  openSessionDrawer: () => void;
  closeSessionDrawer: () => void;
  setSelectedRow: (fn: (prev: number) => number) => void;
  setFocusedPanel: (fn: (prev: 'sessions' | 'sidebar' | 'limits') => 'sessions' | 'sidebar' | 'limits') => void;
  setSidebarCollapsed: (fn: (prev: boolean) => boolean) => void;
  setFilterQuery: (fn: (prev: string) => string) => void;
  setIsFiltering: (val: boolean) => void;
  setSortField: (fn: (prev: 'cost' | 'tokens' | 'time') => 'cost' | 'tokens' | 'time') => void;
  setPendingG: (val: boolean) => void;
  setScrollOffset: (val: number) => void;
  setLimitSelectedIndex: (fn: (prev: number) => number) => void;
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
  const { cycleWindow } = useTimeWindow();
  const { showToast } = useToastContext();
  const { refreshSessions } = useAgentSessions();

  const isFilteringRef = useRef(state.isFiltering);
  const modalOpenRef = useRef(false);
  const pendingGRef = useRef(false);
  const sessionsRef = useRef(processedSessions);
  const focusedPanelRef = useRef(state.focusedPanel);
  const providerCountRef = useRef(state.providerCount);
  const filterQueryRef = useRef(state.filterQuery);

  useEffect(() => {
    isFilteringRef.current = state.isFiltering;
    modalOpenRef.current = state.showHelp || state.showSessionDrawer;
    pendingGRef.current = state.pendingG;
    sessionsRef.current = processedSessions;
    focusedPanelRef.current = state.focusedPanel;
    providerCountRef.current = state.providerCount;
    filterQueryRef.current = state.filterQuery;
  }, [state.isFiltering, state.showHelp, state.showSessionDrawer, state.pendingG, processedSessions, state.focusedPanel, state.providerCount, state.filterQuery]);

  const { isInputFocused } = useInputFocus();

  useKeyboard((key) => {
    // Allow filter mode to handle its own input (no <input> element in RealTimeDashboard)
    if (isInputFocused && !isFilteringRef.current) {
      return;
    }

    if (key.sequence === '?' || (key.shift && key.name === '/')) {
      actions.setShowHelp(prev => !prev);
      return;
    }

    if (modalOpenRef.current) {
      if (key.name === 'escape' || key.name === 'q' || key.sequence === '?') {
        actions.setShowHelp(() => false);
        actions.closeSessionDrawer();
        return;
      }

      const selectedSession = processedSessions[state.selectedRow];
      if (state.showSessionDrawer && selectedSession) {
        if (key.name === 'c') {
          const summary = formatSessionSummary(selectedSession);
          copyToClipboard(summary).then(() => {
            showToast('Copied to clipboard');
          }).catch(() => {
            showToast('Copy failed', 'error');
          });
          return;
        }
        if (key.name === 'x') {
          showToast('Export not yet implemented', 'info');
          return;
        }
      }
      return;
    }

    if (isFilteringRef.current) {
      if (key.name === 'enter' || key.name === 'return') {
        actions.setIsFiltering(false);
        setInputFocused(false);
        return;
      }
      if (key.name === 'escape') {
        actions.setFilterQuery(() => '');
        actions.setIsFiltering(false);
        setInputFocused(false);
        return;
      }
      if (key.name === 'backspace') {
        actions.setFilterQuery(q => q.slice(0, -1));
        return;
      }
      if (key.sequence && key.sequence.length === 1 && /^[a-zA-Z0-9\-_./]$/.test(key.sequence)) {
        actions.setFilterQuery(q => q + key.sequence);
        return;
      }
      return;
    }

    if (key.name === 'tab') {
      actions.setFocusedPanel(curr => {
        if (curr === 'sessions') return 'limits';
        if (curr === 'limits') return 'sidebar';
        return 'sessions';
      });
      return;
    }

    if (key.name === 'l' && focusedPanelRef.current !== 'limits') {
      actions.setFocusedPanel(() => 'limits');
      return;
    }

    if (key.name === 'i') {
      actions.setSidebarCollapsed(curr => !curr);
      return;
    }

    if (key.name === '/' || key.sequence === '/') {
      actions.setIsFiltering(true);
      setInputFocused(true);
      return;
    }

    if (key.name === 's') {
      actions.setSortField(curr => curr === 'cost' ? 'tokens' : 'cost');
      return;
    }

    // Clear applied filter with Escape (when not in typing mode)
    if (key.name === 'escape' && filterQueryRef.current) {
      actions.setFilterQuery(() => '');
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

    if (focusedPanelRef.current === 'sessions') {
      const sessions = sessionsRef.current;
      if (key.name === 'down' || key.name === 'j') {
        actions.setPendingG(false);
        actions.setSelectedRow(curr => Math.min(curr + 1, sessions.length - 1));
      } else if (key.name === 'up' || key.name === 'k') {
        actions.setPendingG(false);
        actions.setSelectedRow(curr => Math.max(curr - 1, 0));
      } else if (key.shift && key.name === 'g') {
        actions.setPendingG(false);
        actions.setSelectedRow(() => sessions.length - 1);
      } else if (key.name === 'g') {
        if (pendingGRef.current) {
          actions.setSelectedRow(() => 0);
          actions.setScrollOffset(0);
          actions.setPendingG(false);
        } else {
          actions.setPendingG(true);
          setTimeout(() => actions.setPendingG(false), 500);
        }
      } else if (key.name === 'return' && sessions.length > 0) {
        actions.setPendingG(false);
        actions.openSessionDrawer();
      } else {
        actions.setPendingG(false);
      }
    }

    if (focusedPanelRef.current === 'limits') {
      const maxIndex = Math.max(0, providerCountRef.current - 1);
      if (key.name === 'left' || key.name === 'h') {
        actions.setLimitSelectedIndex(curr => Math.max(curr - 1, 0));
        return;
      } else if (key.name === 'right' || key.name === 'l') {
        actions.setLimitSelectedIndex(curr => Math.min(curr + 1, maxIndex));
        return;
      } else if (key.name === 'escape') {
        actions.setFocusedPanel(() => 'sessions');
        actions.setLimitSelectedIndex(() => 0);
        return;
      }
    }
  });
}
