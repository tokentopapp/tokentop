import { useTerminalDimensions } from '@opentui/react';
import { useColors } from '../contexts/ThemeContext.tsx';
import { Sparkline } from './Sparkline.tsx';
import { usePulse } from '../hooks/usePulse.ts';

type MetricType = 'cost' | 'tokens' | 'requests' | 'rate' | 'default';
type BudgetStatus = 'ok' | 'warning' | 'critical';

interface KPICardProps {
  title: string;
  value: string;
  delta?: string;
  subValue?: string;
  metric?: MetricType;
  budgetStatus?: BudgetStatus;
}

function KPICard({ title, value, delta, subValue, metric = 'default', budgetStatus }: KPICardProps) {
  const colors = useColors();
  const pulseStep = usePulse({ enabled: budgetStatus === 'critical', intervalMs: 200 });
  
  const getMetricColor = (m: MetricType, status?: BudgetStatus): string => {
    if (m === 'cost' && status) {
      if (status === 'critical') {
        const intensity = Math.sin((pulseStep / 12) * Math.PI * 2) * 0.5 + 0.5;
        return intensity > 0.5 ? colors.error : colors.warning;
      }
      if (status === 'warning') return colors.warning;
      return colors.success;
    }
    switch (m) {
      case 'cost': return colors.success;
      case 'tokens': return colors.primary;
      case 'requests': return colors.secondary;
      case 'rate': return colors.warning;
      default: return colors.text;
    }
  };
  
  const valueColor = getMetricColor(metric, budgetStatus);
  const deltaColor = budgetStatus === 'critical' ? colors.error : 
                     budgetStatus === 'warning' ? colors.warning : colors.success;
  
  return (
    <box 
      flexDirection="column" 
      paddingLeft={1}
      paddingRight={2}
      flexGrow={1}
    >
      <text fg={colors.textMuted} height={1}>{title}</text>
      <text fg={valueColor} height={1}><strong>{value}</strong></text>
      {delta && <text fg={deltaColor} height={1}>{delta}</text>}
      {subValue && <text fg={colors.textMuted} height={1}>{subValue}</text>}
    </box>
  );
}

export interface ActivityStatus {
  label: string;
  color: string;
}

export interface BudgetInfo {
  daily: number | null;
  weekly: number | null;
  monthly: number | null;
  warningPercent: number;
  criticalPercent: number;
}

export interface KpiStripProps {
  totalCost: number;
  totalTokens: number;
  totalRequests: number;
  activeCount: number;
  deltaCost: number;
  deltaTokens: number;
  windowSec: number;
  activity: { instantRate: number; avgRate: number; isSpike: boolean };
  sparkData: number[];
  budget?: BudgetInfo;
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
  budget,
}: KpiStripProps) {
  const colors = useColors();
  const { width: terminalWidth } = useTerminalDimensions();
  
  const formatCurrency = (val: number) => `$${val.toFixed(2)}`;
  const formatTokens = (val: number) => val > 1000000 ? `${(val/1000000).toFixed(1)}M` : `${(val/1000).toFixed(1)}K`;
  const formatRate = (val: number) => val >= 1000 ? `${(val/1000).toFixed(1)}k` : `${Math.round(val)}`;
  const formatBurnTokens = (val: number) => val >= 1000 ? `${(val/1000).toFixed(1)}k` : `${Math.round(val)}`;
  
  const formatWindowLabel = (sec: number): string => {
    if (sec < 60) return `${Math.round(sec)}s`;
    if (sec < 3600) return `${Math.round(sec / 60)}m`;
    return `${(sec / 3600).toFixed(1)}h`;
  };
  
  const getBudgetStatus = (): BudgetStatus => {
    if (!budget) return 'ok';
    const activeBudget = budget.daily ?? budget.weekly ?? budget.monthly;
    if (!activeBudget || activeBudget <= 0) return 'ok';
    const percent = (totalCost / activeBudget) * 100;
    if (percent >= budget.criticalPercent) return 'critical';
    if (percent >= budget.warningPercent) return 'warning';
    return 'ok';
  };
  
  const budgetStatus = getBudgetStatus();
  const hasEnoughHistory = windowSec >= 30;
  const burnRateCostPerHour = hasEnoughHistory ? deltaCost * (3600 / windowSec) : 0;
  const burnRateTokensPerMin = hasEnoughHistory ? deltaTokens * (60 / windowSec) : 0;
  const windowLabel = formatWindowLabel(windowSec);
  
  const getActivityStatus = (): ActivityStatus => {
    const { instantRate, avgRate, isSpike } = activity;
    if (isSpike || instantRate >= 120) return { label: 'SPIKE', color: colors.error };
    if (avgRate >= 40) return { label: 'HOT', color: colors.warning };
    if (avgRate >= 10) return { label: 'BUSY', color: colors.success };
    if (avgRate >= 2) return { label: 'LOW', color: colors.textMuted };
    return { label: 'IDLE', color: colors.textSubtle };
  };

  const activityStatus = getActivityStatus();
  
  // Calculate responsive width for sparkline
  // Min width 20, max width 50
  // Target: 25% of terminal width
  const sparklineWidth = Math.min(50, Math.max(20, Math.floor(terminalWidth * 0.25)));

  // Dynamic max for sparkline to ensure visibility of low rates
  // Minimum 10 to avoid noise, but scale up to peak
  const sparkMax = Math.max(10, ...sparkData.map(v => v * 1.2));

  return (
    <>
      <box flexDirection="row" gap={0} height={4} flexShrink={0}>
        <KPICard 
          title="COST" 
          value={formatCurrency(totalCost)} 
          delta={hasEnoughHistory ? `+${formatCurrency(deltaCost)} (${windowLabel})` : 'gathering...'} 
          metric="cost"
          budgetStatus={budgetStatus}
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
              <span fg={colors.textMuted}> {formatRate(activity.instantRate)}/s</span>
            </text>
          </box>
          <Sparkline 
            data={sparkData} 
            width={sparklineWidth} 
            label="tok/s" 
            fixedMax={sparkMax}
            thresholds={{ warning: 40, error: 120 }}
          />
        </box>
      </box>
      
      <box height={1} overflow="hidden">
        <text fg={colors.border}>{'─'.repeat(300)}</text>
      </box>
    </>
  );
}
