import { forwardRef, type Ref } from 'react';
import type { ScrollBoxRenderable } from '@opentui/core';
import { useColors } from '../contexts/ThemeContext.tsx';
import type { AgentSessionAggregate } from '../../agents/types.ts';

interface SessionsTableProps {
  sessions: AgentSessionAggregate[];
  selectedRow: number;
  isLoading: boolean;
  isFiltering: boolean;
  filterQuery: string;
  focusedPanel: 'sessions' | 'sidebar';
  windowLabel: string;
  getProviderColor: (id: string) => string;
}

function formatCurrency(val: number): string {
  return `$${val.toFixed(2)}`;
}

function formatTokens(val: number): string {
  return val > 1000000 ? `${(val / 1000000).toFixed(1)}M` : `${(val / 1000).toFixed(1)}K`;
}

function extractRepoName(projectPath: string | null): string {
  if (!projectPath || projectPath === '—') return '—';
  const normalized = projectPath.replace(/\\/g, '/');
  return normalized.split('/').filter(Boolean).pop() ?? projectPath;
}

export const SessionsTable = forwardRef(function SessionsTable(
  {
    sessions,
    selectedRow,
    isLoading,
    isFiltering,
    filterQuery,
    focusedPanel,
    windowLabel,
    getProviderColor,
  }: SessionsTableProps,
  ref: Ref<ScrollBoxRenderable>
) {
  const colors = useColors();

  return (
    <box
      flexDirection="column"
      flexGrow={2}
      border
      borderStyle={focusedPanel === 'sessions' ? 'double' : 'single'}
      borderColor={focusedPanel === 'sessions' ? colors.primary : colors.border}
      overflow="hidden"
    >
      <box flexDirection="row" paddingLeft={1} paddingRight={1} height={1} justifyContent="space-between" overflow="hidden">
        <text height={1} fg={colors.textMuted}>
          SESSIONS{isFiltering ? ` (Filter: ${filterQuery})` : ''}{isLoading ? ' ⟳' : '  '}
        </text>
        <text height={1} fg={colors.textMuted}>[{windowLabel}] {sessions.length} sessions</text>
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

      <scrollbox ref={ref} flexGrow={1}>
        <box flexDirection="column">
          {sessions.length === 0 && (
            <box paddingLeft={1}>
              <text fg={colors.textMuted}>{isLoading ? 'Loading sessions...' : 'No sessions found'}</text>
            </box>
          )}
          {sessions.map((session, idx) => {
            const isSelected = idx === selectedRow;
            const rowFg = isSelected ? colors.background : colors.text;
            const primaryStream = session.streams[0];
            const providerId = primaryStream?.providerId ?? 'unknown';
            const modelId = primaryStream?.modelId ?? 'unknown';
            const providerColor = getProviderColor(providerId);
            const repoName = extractRepoName(session.projectPath ?? '—');
            const projectDisplay = repoName.length > 20 ? repoName.slice(0, 19) + '…' : repoName;

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
                <text width={12} height={1} fg={isSelected ? rowFg : colors.textSubtle}>{session.agentName}</text>
                <text width={16} height={1} fg={isSelected ? rowFg : providerColor}>{modelId.split('/').pop()?.slice(0, 15)}</text>
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
  );
});
