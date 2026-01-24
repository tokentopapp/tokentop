import { useMemo } from 'react';
import { useColors } from '../contexts/ThemeContext.tsx';
import type { AgentSessionAggregate, AgentSessionStream } from '../../agents/types.ts';

interface SidebarBreakdownProps {
  sessions: AgentSessionAggregate[];
  focusedPanel: 'sessions' | 'sidebar';
  getProviderColor: (id: string) => string;
}

export function SidebarBreakdown({
  sessions,
  focusedPanel,
  getProviderColor,
}: SidebarBreakdownProps) {
  const colors = useColors();
  
  const formatCurrency = (val: number) => `$${val.toFixed(2)}`;

  const modelStats = useMemo(() => {
    const stats: Record<string, number> = {};
    sessions.forEach(s => {
      s.streams.forEach((st: AgentSessionStream) => {
        stats[st.modelId] = (stats[st.modelId] || 0) + (st.costUsd ?? 0);
      });
    });
    return Object.entries(stats).sort(([, a], [, b]) => b - a).slice(0, 5);
  }, [sessions]);

  const providerStats = useMemo(() => {
    const stats: Record<string, number> = {};
    sessions.forEach(s => {
      s.streams.forEach((st: AgentSessionStream) => {
        stats[st.providerId] = (stats[st.providerId] || 0) + (st.costUsd ?? 0);
      });
    });
    return Object.entries(stats).sort(([, a], [, b]) => b - a);
  }, [sessions]);

  const maxModelCost = Math.max(...modelStats.map(([, c]) => c), 0.01);

  return (
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
  );
}
