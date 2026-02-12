import { forwardRef, memo, type Ref } from 'react';
import type { ScrollBoxRenderable } from '@opentui/core';
import { useTerminalDimensions } from '@opentui/react';
import { useColors } from '../contexts/ThemeContext.tsx';
import type { AgentSessionAggregate } from '../../agents/types.ts';
import { useValueFlash, interpolateColor } from '../hooks/useValueFlash.ts';
import { useAnimatedValue } from '../hooks/useAnimatedValue.ts';
import { useEntranceAnimation, applyEntranceFade } from '../hooks/useEntranceAnimation.ts';

interface SessionsTableProps {
  sessions: AgentSessionAggregate[];
  selectedRow: number;
  isLoading: boolean;
  isFiltering: boolean;
  filterQuery: string;
  focusedPanel: 'sessions' | 'sidebar' | 'limits';
  windowLabel: string;
  getProviderColor: (id: string) => string;
}

function extractRepoName(projectPath: string | null): string {
  if (!projectPath || projectPath === '—') return '—';
  const normalized = projectPath.replace(/\\/g, '/');
  return normalized.split('/').filter(Boolean).pop() ?? projectPath;
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffSec = Math.floor(diffMs / 1000);
  
  if (diffSec < 60) return `${diffSec}s`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h`;
  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay}d`;
}

function formatDuration(startedAt: number, endedAt?: number): string {
  const end = endedAt ?? Date.now();
  const diffMs = end - startedAt;
  const diffSec = Math.floor(diffMs / 1000);
  
  if (diffSec < 60) return `${diffSec}s`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h${diffMin % 60}m`;
  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay}d${diffHour % 24}h`;
}

function formatCost(costUsd: number): string {
   if (costUsd === 0) return '$0';
   if (costUsd < 0.01) return '$0.00';
   if (costUsd < 10) return `$${costUsd.toFixed(2)}`;
   if (costUsd < 100) return `$${costUsd.toFixed(1)}`;
   if (costUsd < 1000) return `$${Math.floor(costUsd)}`;
   return `$${(costUsd / 1000).toFixed(1)}k`;
}

function truncateMiddle(str: string, maxLength: number): string {
   if (str.length <= maxLength) return str;
   const side = Math.floor((maxLength - 1) / 2);
   return str.slice(0, side) + '…' + str.slice(-side);
}

interface SessionRowProps {
  session: AgentSessionAggregate;
  isSelected: boolean;
  isWide: boolean;
  getProviderColor: (id: string) => string;
}

function getActivityFadeColor(lastActivityAt: number, baseColor: string, dimColor: string): string {
  const secSinceActivity = (Date.now() - lastActivityAt) / 1000;
  if (secSinceActivity < 5) return baseColor;
  if (secSinceActivity > 60) return dimColor;
  const t = (secSinceActivity - 5) / 55;
  return interpolateColor(t, baseColor, dimColor);
}

const SessionRow = memo(function SessionRow({ session, isSelected, isWide, getProviderColor }: SessionRowProps) {
  const colors = useColors();
  const isActive = session.status === 'active';
  const entranceIntensity = useEntranceAnimation({ durationMs: 500 });
  
   const totalTokens = session.totals.input + session.totals.output;
   const costUsd = session.totalCostUsd ?? 0;
   
   const animatedTokens = useAnimatedValue(totalTokens, { durationMs: 300, precision: 0 });
   const animatedCost = useAnimatedValue(costUsd, { durationMs: 300, precision: 4 });
   
   const { intensity: tokenFlash } = useValueFlash(totalTokens, { durationMs: 400, threshold: 10 });
   const { intensity: costFlash } = useValueFlash(costUsd, { durationMs: 400, threshold: 0.001 });
  
  const primaryStream = session.streams[0];
  const providerId = primaryStream?.providerId ?? 'unknown';
  const modelId = primaryStream?.modelId ?? 'unknown';
  const baseProviderColor = getProviderColor(providerId);
  const repoName = extractRepoName(session.projectPath ?? '—');
  const projectMaxLen = isWide ? 28 : 18;
  const projectDisplay = repoName.length > projectMaxLen ? repoName.slice(0, projectMaxLen - 1) + '…' : repoName;
  
  const dimColor = colors.background;
  const fade = (color: string) => applyEntranceFade(entranceIntensity, color, dimColor);
  
  const baseStatusColor = isActive 
    ? getActivityFadeColor(session.lastActivityAt, colors.success, colors.textMuted)
    : colors.textMuted;
  const statusColor = fade(baseStatusColor);
  
   const baseTokenColor = colors.text;
  const tokenColorBeforeFade = tokenFlash > 0
    ? interpolateColor(tokenFlash, baseTokenColor, '#ffffff')
    : baseTokenColor;
  const tokenColor = fade(tokenColorBeforeFade);
  
  const providerColor = fade(baseProviderColor);
  const textColor = fade(colors.text);
  const textSubtleColor = fade(colors.textSubtle);
  const textMutedColor = fade(colors.textMuted);
  const baseCostColor = colors.warning;
  const costColorBeforeFade = costFlash > 0
    ? interpolateColor(costFlash, baseCostColor, '#ffffff')
    : baseCostColor;
  const costColor = fade(costColorBeforeFade);
  
  const formatTokensVal = (val: number): string => {
    if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M`;
    if (val >= 1000) return `${(val / 1000).toFixed(1)}K`;
    return `${val}`;
  };
  
  const railChar = isSelected ? '▌' : ' ';
  const railColor = fade(colors.primary);
  const rowBg = isSelected ? colors.borderMuted : undefined;
  
  const lastActivity = formatRelativeTime(session.lastActivityAt);
  const duration = formatDuration(session.startedAt, session.endedAt);
  const costDisplay = formatCost(animatedCost);
  
   const modelDisplay = modelId.split('/').pop()?.slice(0, 15) ?? modelId;
   const streamCount = session.streams.length;
   const modelWithCount = streamCount > 1 ? `${modelDisplay.slice(0, 12)}+${streamCount - 1}` : modelDisplay;
   
   const baseLastColor = isActive 
     ? getActivityFadeColor(session.lastActivityAt, colors.text, colors.textMuted)
     : colors.textMuted;
   const lastColor = fade(baseLastColor);
   
   const bgProp = rowBg ? { bg: rowBg } : {};
   
   const sessionIdShort = session.sessionId.slice(-7);
   const sessionNameDisplay = session.sessionName ? truncateMiddle(session.sessionName, 25) : '—';
  
   if (isWide) {
     return (
       <box flexDirection="row" paddingRight={1} height={1} gap={1} {...(rowBg ? { backgroundColor: rowBg } : {})}>
         <text width={2} height={1} fg={railColor} {...bgProp}>{railChar}</text>
         <text width={8} height={1} fg={textMutedColor} {...bgProp}>{sessionIdShort}</text>
         <text width={12} height={1} fg={isSelected ? textColor : textSubtleColor} {...bgProp}>{session.agentName.padEnd(11)}</text>
         <text width={18} height={1} fg={providerColor} {...bgProp}>{modelWithCount.padEnd(17)}</text>
         <text width={5} height={1} fg={textMutedColor} {...bgProp}>{String(session.requestCount).padStart(4)}</text>
         <text width={8} height={1} fg={tokenColor} {...bgProp}>{formatTokensVal(animatedTokens).padStart(7)}</text>
          <text width={8} height={1} fg={costColor} {...bgProp}>{costDisplay.padStart(7)}</text>
         <text width={20} height={1} fg={textMutedColor} {...bgProp}>{sessionNameDisplay.padEnd(19)}</text>
         <text flexGrow={1} height={1} fg={textSubtleColor} {...bgProp}>{projectDisplay}</text>
         <text width={6} height={1} fg={textMutedColor} {...bgProp}>{duration.padStart(5)}</text>
         <text width={5} height={1} fg={lastColor} {...bgProp}>{lastActivity.padStart(4)}</text>
         <text width={2} height={1} fg={statusColor} {...bgProp}>{isActive ? '●' : '○'}</text>
       </box>
     );
   }
  
   return (
     <box flexDirection="row" paddingRight={1} height={1} {...(rowBg ? { backgroundColor: rowBg } : {})}>
       <text width={2} height={1} fg={railColor} {...bgProp}>{railChar}</text>
       <text width={8} height={1} fg={textMutedColor} {...bgProp}>{sessionIdShort}</text>
       <text width={12} height={1} fg={isSelected ? textColor : textSubtleColor} {...bgProp}>{session.agentName}</text>
       <text width={16} height={1} fg={providerColor} {...bgProp}>{modelWithCount.padEnd(15)}</text>
       <text width={15} height={1} fg={textMutedColor} {...bgProp}>{truncateMiddle(session.sessionName ?? '—', 15).padEnd(14)}</text>
       <text flexGrow={1} height={1} fg={textSubtleColor} paddingLeft={1} {...bgProp}>{projectDisplay}</text>
       <text width={5} height={1} fg={lastColor} {...bgProp}>{lastActivity.padStart(4)}</text>
       <text width={2} height={1} fg={statusColor} {...bgProp}>{isActive ? '●' : '○'}</text>
     </box>
   );
 });

const WIDE_THRESHOLD = 140;

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
  const { width: terminalWidth } = useTerminalDimensions();
  const isWide = terminalWidth >= WIDE_THRESHOLD;

  return (
    <box
      flexDirection="column"
      flexGrow={2}
      border
      borderStyle={focusedPanel === 'sessions' ? 'double' : 'single'}
      borderColor={focusedPanel === 'sessions' ? colors.primary : colors.border}
      overflow="hidden"
    >
      <box flexDirection="row" paddingLeft={2} paddingRight={1} height={1} justifyContent="space-between" overflow="hidden">
        <text height={1} fg={colors.textMuted}>
          SESSIONS{filterQuery ? ` [${isFiltering ? 'Filter: ' : ''}${filterQuery}]` : ''}{isLoading ? ' ⟳' : '  '}
        </text>
        <text height={1} fg={colors.textMuted}>[{windowLabel}] {sessions.length} sessions</text>
      </box>

       {isWide ? (
         <box flexDirection="row" paddingRight={1} height={1} gap={1}>
           <text width={2} height={1} fg={colors.textMuted}> </text>
           <text width={8} height={1} fg={colors.textMuted}>ID      </text>
           <text width={12} height={1} fg={colors.textMuted}>AGENT       </text>
           <text width={18} height={1} fg={colors.textMuted}>MODEL             </text>
           <text width={5} height={1} fg={colors.textMuted}> REQ </text>
           <text width={8} height={1} fg={colors.textMuted}> TOKENS </text>
            <text width={8} height={1} fg={colors.textMuted}>   COST </text>
           <text width={20} height={1} fg={colors.textMuted}>NAME                </text>
           <text flexGrow={1} height={1} fg={colors.textMuted}>PROJECT</text>
           <text width={6} height={1} fg={colors.textMuted}>  DUR </text>
           <text width={5} height={1} fg={colors.textMuted}>LAST </text>
           <text width={2} height={1} fg={colors.textMuted}> </text>
         </box>
       ) : (
         <box flexDirection="row" paddingRight={1} height={1}>
           <text width={2} height={1} fg={colors.textMuted}> </text>
           <text width={8} height={1} fg={colors.textMuted}>ID      </text>
           <text width={12} height={1} fg={colors.textMuted}>AGENT       </text>
           <text width={16} height={1} fg={colors.textMuted}>MODEL           </text>
           <text width={15} height={1} fg={colors.textMuted}>NAME            </text>
           <text flexGrow={1} height={1} fg={colors.textMuted} paddingLeft={1}>PROJECT</text>
           <text width={5} height={1} fg={colors.textMuted}>LAST </text>
           <text width={2} height={1} fg={colors.textMuted}> </text>
         </box>
       )}

      <scrollbox ref={ref} flexGrow={1}>
        <box flexDirection="column">
          {sessions.length === 0 && (
            <box paddingLeft={2}>
              <text fg={colors.textMuted}>{isLoading ? 'Loading sessions...' : 'No sessions found'}</text>
            </box>
          )}
          {sessions.map((session, idx) => (
            <SessionRow
              key={session.sessionId}
              session={session}
              isSelected={idx === selectedRow}
              isWide={isWide}
              getProviderColor={getProviderColor}
            />
          ))}
        </box>
      </scrollbox>
    </box>
  );
});
