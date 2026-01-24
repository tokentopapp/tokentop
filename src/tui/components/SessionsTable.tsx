import { useColors } from '../contexts/ThemeContext.tsx';
import type { AgentSessionAggregate } from '../../agents/types.ts';

interface SessionsTableProps {
  sessions: AgentSessionAggregate[];
  selectedRow: number;
  isLoading: boolean;
  isFiltering: boolean;
  filterQuery: string;
  focusedPanel: 'sessions' | 'sidebar';
  getProviderColor: (id: string) => string;
}

export function SessionsTable({
  sessions,
  selectedRow,
  isLoading,
  isFiltering,
  filterQuery,
  focusedPanel,
  getProviderColor,
}: SessionsTableProps) {
  const colors = useColors();
  
  const formatCurrency = (val: number) => `$${val.toFixed(2)}`;
  const formatTokens = (val: number) => val > 1000000 ? `${(val/1000000).toFixed(1)}M` : `${(val/1000).toFixed(1)}K`;

  return (
    <box 
      flexDirection="column" 
      flexGrow={2} 
      border 
      borderStyle={focusedPanel === 'sessions' ? "double" : "single"} 
      borderColor={focusedPanel === 'sessions' ? colors.primary : colors.border}
      overflow="hidden"
    >
      <box flexDirection="row" paddingLeft={1} paddingRight={1} paddingBottom={0} justifyContent="space-between">
        <text fg={colors.textMuted}>
          SESSIONS{isFiltering ? ` (Filter: ${filterQuery})` : ''}{isLoading ? ' ⟳' : '  '}
        </text>
        <text fg={colors.textMuted}>{sessions.length} sessions</text>
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
      
      <scrollbox flexGrow={1}>
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
  );
}
