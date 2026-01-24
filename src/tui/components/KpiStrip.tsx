import { useColors } from '../contexts/ThemeContext.tsx';
import { Sparkline } from './Sparkline.tsx';

type MetricType = 'cost' | 'tokens' | 'requests' | 'rate' | 'default';

interface KPICardProps {
  title: string;
  value: string;
  delta?: string;
  subValue?: string;
  metric?: MetricType;
}

function KPICard({ title, value, delta, subValue, metric = 'default' }: KPICardProps) {
  const colors = useColors();
  
  // Semantic color mapping per spec
  const getMetricColor = (m: MetricType): string => {
    switch (m) {
      case 'cost': return colors.success;      // Green - money/budget
      case 'tokens': return colors.primary;    // Cyan/Blue - primary metric
      case 'requests': return colors.secondary; // Purple - secondary metric
      case 'rate': return colors.warning;      // Yellow/Orange - burn rate
      default: return colors.text;
    }
  };
  
  const valueColor = getMetricColor(metric);
  
  return (
    <box 
      flexDirection="column" 
      paddingLeft={1}
      paddingRight={2}
      flexGrow={1}
    >
      <text fg={colors.textMuted}>{title}</text>
      <text fg={valueColor}><strong>{value}</strong></text>
      {delta && <text fg={colors.success}>{delta}</text>}
      {subValue && <text fg={colors.textMuted}>{subValue}</text>}
    </box>
  );
}

export interface ActivityStatus {
  label: string;
  color: string;
}

export interface KpiStripProps {
  totalCost: number;
  totalTokens: number;
  totalRequests: number;
  activeCount: number;
  deltaCost: number;
  deltaTokens: number;
  windowSec: number;
  activity: { rate: number; ema: number; isSpike: boolean };
  sparkData: number[];
}

export function KpiStrip({
  totalCost,
  totalTokens,
  totalRequests,
  activeCount,
  deltaCost,
  deltaTokens,
  windowSec,
  activity,
  sparkData,
}: KpiStripProps) {
  const colors = useColors();
  
  const formatCurrency = (val: number) => `$${val.toFixed(2)}`;
  const formatTokens = (val: number) => val > 1000000 ? `${(val/1000000).toFixed(1)}M` : `${(val/1000).toFixed(1)}K`;
  const formatRate = (val: number) => val >= 1000 ? `${(val/1000).toFixed(1)}k` : `${Math.round(val)}`;
  const formatBurnTokens = (val: number) => val >= 1000 ? `${(val/1000).toFixed(1)}k` : `${Math.round(val)}`;
  
  const formatWindowLabel = (sec: number): string => {
    if (sec < 60) return `${Math.round(sec)}s`;
    if (sec < 3600) return `${Math.round(sec / 60)}m`;
    return `${(sec / 3600).toFixed(1)}h`;
  };
  
  const hasEnoughHistory = windowSec >= 30;
  const burnRateCostPerHour = hasEnoughHistory ? deltaCost * (3600 / windowSec) : 0;
  const burnRateTokensPerMin = hasEnoughHistory ? deltaTokens * (60 / windowSec) : 0;
  const windowLabel = formatWindowLabel(windowSec);
  
  const getActivityStatus = (): ActivityStatus => {
    const { ema, isSpike } = activity;
    if (isSpike || ema >= 2000) return { label: 'SPIKE', color: colors.error };
    if (ema >= 800) return { label: 'HOT', color: colors.warning };
    if (ema >= 200) return { label: 'BUSY', color: colors.success };
    if (ema >= 50) return { label: 'LOW', color: colors.textMuted };
    return { label: 'IDLE', color: colors.textSubtle };
  };

  const activityStatus = getActivityStatus();

  return (
    <>
      <box flexDirection="row" gap={0} height={4} flexShrink={0}>
        <KPICard 
          title="COST" 
          value={formatCurrency(totalCost)} 
          delta={hasEnoughHistory ? `+${formatCurrency(deltaCost)} (${windowLabel})` : 'gathering...'} 
          metric="cost"
        />
        <KPICard 
          title="TOKENS" 
          value={formatTokens(totalTokens)} 
          delta={hasEnoughHistory ? `+${formatTokens(deltaTokens)} (${windowLabel})` : 'gathering...'}
          metric="tokens"
        />
        <KPICard 
          title="REQUESTS" 
          value={totalRequests.toLocaleString()} 
          subValue={`${activeCount} active`}
          metric="requests"
        />
        <KPICard 
          title="BURN RATE" 
          value={hasEnoughHistory ? `${formatCurrency(burnRateCostPerHour)}/hr` : '--'}
          subValue={hasEnoughHistory ? `${formatBurnTokens(burnRateTokensPerMin)} tok/min` : 'gathering...'}
          metric="rate"
        />
        
        <box flexDirection="column" flexGrow={1} paddingLeft={1} paddingRight={1}>
          <box flexDirection="row" justifyContent="space-between">
            <text fg={colors.textMuted}>ACTIVITY</text>
            <text>
              <span fg={activityStatus.color}>{activityStatus.label}</span>
              <span fg={colors.textMuted}> {formatRate(activity.ema)}/s</span>
            </text>
          </box>
          <Sparkline data={sparkData} width={50} label="tok/s" fixedMax={2000} />
        </box>
      </box>
      
      <box height={1} overflow="hidden">
        <text fg={colors.border}>{'─'.repeat(300)}</text>
      </box>
    </>
  );
}
