import { useColors } from '../contexts/ThemeContext.tsx';
import type { ProviderState } from '../contexts/PluginContext.tsx';

interface ProvidersListProps {
  providers: ProviderState[];
  selectedIndex: number | null;
  onSelect: (index: number) => void;
}

export function ProvidersList({ providers, selectedIndex, onSelect }: ProvidersListProps) {
  const colors = useColors();

  const getMaxUsage = (state: ProviderState): number => {
    if (!state.usage?.limits) return 0;
    const items = state.usage.limits.items ?? [];
    if (items.length > 0) {
      return Math.max(...items.map((item) => item.usedPercent ?? 0));
    }
    const primary = state.usage.limits.primary?.usedPercent || 0;
    const secondary = state.usage.limits.secondary?.usedPercent || 0;
    return Math.max(primary, secondary);
  };

  const getStatusInfo = (state: ProviderState): { icon: string; color: string; label: string } => {
    if (!state.configured) {
      return { icon: '○', color: colors.textSubtle, label: 'N/A' };
    }
    if (state.loading) {
      return { icon: '◌', color: colors.info, label: 'LOAD' };
    }
    if (state.usage?.error) {
      return { icon: '✗', color: colors.error, label: 'ERR' };
    }
    if (state.usage?.limitReached) {
      return { icon: '⚠', color: colors.warning, label: 'LIMIT' };
    }
    const maxUsage = getMaxUsage(state);
    if (maxUsage >= 80) {
      return { icon: '!', color: colors.warning, label: 'WARN' };
    }
    return { icon: '●', color: colors.success, label: 'OK' };
  };

  const getNextReset = (state: ProviderState): string => {
    if (!state.usage?.limits) return '—';
    
    const items = state.usage.limits.items ?? [];
    let resetsAt: Date | null = null;
    
    if (items.length > 0) {
      const withReset = items.filter(i => i.resetsAt);
      if (withReset.length > 0) {
        resetsAt = new Date(Math.min(...withReset.map(i => new Date(i.resetsAt!).getTime())));
      }
    } else if (state.usage.limits.primary?.resetsAt) {
      resetsAt = new Date(state.usage.limits.primary.resetsAt);
    }
    
    if (!resetsAt) return '—';
    
    const now = Date.now();
    const diff = resetsAt.getTime() - now;
    if (diff <= 0) return 'now';
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours >= 24) {
      const days = Math.floor(hours / 24);
      return `${days}d ${hours % 24}h`;
    }
    return `${hours}h ${mins}m`;
  };

  const formatPercent = (percent: number | null): string => {
    if (percent === null || percent === undefined) return '—';
    return `${Math.round(percent)}%`;
  };

  const getProviderColor = (state: ProviderState): string => {
    return state.plugin.meta?.color ?? colors.primary;
  };

  return (
    <box flexDirection="column" flexGrow={1}>
      <box flexDirection="row" paddingLeft={1} paddingRight={1} height={1}>
        <text width={16} fg={colors.textMuted}>NAME</text>
        <text width={8} fg={colors.textMuted}>STATUS</text>
        <text width={8} fg={colors.textMuted}>MAX%</text>
        <text width={10} fg={colors.textMuted}>RESET</text>
        <text width={12} fg={colors.textMuted}>CREDITS</text>
        <text flexGrow={1} fg={colors.textMuted}>LAST FETCH</text>
      </box>
      
      <scrollbox flexGrow={1}>
        <box flexDirection="column">
          {providers.map((state, idx) => {
            const isSelected = idx === selectedIndex;
            const status = getStatusInfo(state);
            const maxUsage = getMaxUsage(state);
            const providerColor = getProviderColor(state);
            const credits = state.usage?.credits;
            const creditsDisplay = credits 
              ? (credits.unlimited ? '∞' : credits.balance ?? '—')
              : '—';
            
            return (
              <box 
                key={state.plugin.id}
                flexDirection="row" 
                paddingLeft={1} 
                paddingRight={1}
                height={1}
                onMouseDown={() => onSelect(idx)}
                {...(isSelected ? { backgroundColor: colors.primary } : {})}
              >
                <text width={16} fg={isSelected ? colors.background : providerColor}>
                  {state.plugin.name.slice(0, 15).padEnd(15)}
                </text>
                <text width={8} fg={isSelected ? colors.background : status.color}>
                  {status.icon} {status.label.padEnd(5)}
                </text>
                <text width={8} fg={isSelected ? colors.background : (maxUsage >= 80 ? colors.warning : colors.text)}>
                  {formatPercent(maxUsage).padStart(5)}
                </text>
                <text width={10} fg={isSelected ? colors.background : colors.textMuted}>
                  {getNextReset(state).padEnd(9)}
                </text>
                <text width={12} fg={isSelected ? colors.background : colors.text}>
                  {String(creditsDisplay).slice(0, 10).padEnd(11)}
                </text>
                <text flexGrow={1} fg={isSelected ? colors.background : colors.textSubtle}>
                  {state.loading ? 'fetching...' : (state.usage ? 'just now' : '—')}
                </text>
              </box>
            );
          })}
        </box>
      </scrollbox>
    </box>
  );
}
