import { useTerminalDimensions } from '@opentui/react';
import { useColors } from '../contexts/ThemeContext.tsx';
import { useTimeWindow, type TimeWindow } from '../contexts/TimeWindowContext.tsx';
import { useConfig } from '../contexts/ConfigContext.tsx';
import { Sparkline } from './Sparkline.tsx';
import { usePulse } from '../hooks/usePulse.ts';
import { useValueFlash, interpolateColor } from '../hooks/useValueFlash.ts';
import { useAnimatedValue } from '../hooks/useAnimatedValue.ts';

type MetricType = 'cost' | 'tokens' | 'requests' | 'rate' | 'default';
type BudgetStatus = 'ok' | 'warning' | 'critical';

interface KPICardProps {
  title: string;
  value: string;
  delta?: string;
  subValue?: string;
  metric?: MetricType;
  budgetStatus?: BudgetStatus;
  flashIntensity?: number;
}

const TIME_WINDOW_EXPANDED: Record<TimeWindow, string> = {
  '5m': 'Last 5 Minutes',
  '15m': 'Last 15 Minutes',
  '1h': 'Last Hour',
  '24h': 'Last 24 Hours',
  '7d': 'Last 7 Days',
  '30d': 'Last 30 Days',
  'all': 'All Time',
};

interface TimeWindowCardProps {
  isCompact: boolean;
}

function TimeWindowCard({ isCompact }: TimeWindowCardProps) {
  const colors = useColors();
  const { window: timeWindow } = useTimeWindow();

  const title = isCompact ? 'WINDOW' : 'TIME WINDOW (t)';
  const value = isCompact ? timeWindow.toUpperCase() : TIME_WINDOW_EXPANDED[timeWindow];
  const hint = isCompact ? '(t)' : "Press 't' to change";

  return (
    <box 
      flexDirection="column" 
      paddingLeft={1}
      paddingRight={1}
      flexShrink={0}
      width={isCompact ? 9 : 22}
    >
      <text fg={colors.textMuted} height={1}>{title}</text>
      <text fg={colors.info} height={1}><strong>{value}</strong></text>
      <text fg={colors.textSubtle} height={1}>{hint}</text>
    </box>
  );
}

function KPICard({ title, value, delta, subValue, metric = 'default', budgetStatus, flashIntensity = 0 }: KPICardProps) {
  const colors = useColors();
  const pulseStep = usePulse({ enabled: budgetStatus === 'critical', intervalMs: 200 });
  
  const getBaseMetricColor = (m: MetricType, status?: BudgetStatus): string => {
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
  
  const baseColor = getBaseMetricColor(metric, budgetStatus);
  const flashHighlight = '#ffffff';
  const valueColor = flashIntensity > 0 
    ? interpolateColor(flashIntensity, baseColor, flashHighlight)
    : baseColor;
  
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
  const { config } = useConfig();
  const { sparkline: sparklineConfig } = config.display;
  
  const animatedCost = useAnimatedValue(totalCost, { durationMs: 400, precision: 2 });
  const animatedTokens = useAnimatedValue(totalTokens, { durationMs: 400, precision: 0 });
  const animatedRequests = useAnimatedValue(totalRequests, { durationMs: 300, precision: 0 });
  
  const { intensity: costFlashIntensity } = useValueFlash(totalCost, { 
    durationMs: 500, 
    increaseOnly: true,
    threshold: 0.001 
  });
  const { intensity: tokenFlashIntensity } = useValueFlash(totalTokens, { 
    durationMs: 400, 
    increaseOnly: true,
    threshold: 10 
  });
  
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
    if (isSpike || instantRate >= 500) return { label: 'SPIKE', color: colors.error };
    if (avgRate >= 150) return { label: 'HOT', color: colors.warning };
    if (avgRate >= 50) return { label: 'BUSY', color: colors.success };
    if (avgRate >= 10) return { label: 'LOW', color: colors.textMuted };
    return { label: 'IDLE', color: colors.textSubtle };
  };

  const activityStatus = getActivityStatus();
  
  const isCompact = terminalWidth < 100;
  const sparklineWidth = isCompact 
    ? Math.min(25, Math.max(15, Math.floor(terminalWidth * 0.2)))
    : Math.min(50, Math.max(20, Math.floor(terminalWidth * 0.25)));

  // Fixed max based on thresholds so bar HEIGHT reflects actual activity level
  // This ensures green (low), yellow (medium), red (high) show distinct bar sizes
  // 600 = 1.2x the SPIKE threshold (500), giving headroom for extreme spikes
  const sparkMax = 600;

  return (
    <>
      <box flexDirection="row" gap={0} height={4} flexShrink={0}>
        <TimeWindowCard isCompact={isCompact} />
        <KPICard 
          title="COST" 
          value={formatCurrency(animatedCost)} 
          delta={hasEnoughHistory ? `+${formatCurrency(deltaCost)} (${windowLabel})` : 'gathering...'} 
          metric="cost"
          budgetStatus={budgetStatus}
          flashIntensity={costFlashIntensity}
        />
        <KPICard 
          title="TOKENS" 
          value={formatTokens(animatedTokens)} 
          delta={hasEnoughHistory ? `+${formatTokens(deltaTokens)} (${windowLabel})` : 'gathering...'}
          metric="tokens"
          flashIntensity={tokenFlashIntensity}
        />
        <KPICard 
          title="REQUESTS" 
          value={Math.round(animatedRequests).toLocaleString()} 
          subValue={`${activeCount} active`}
          metric="requests"
        />
        {!isCompact && (
          <KPICard 
            title="BURN RATE" 
            value={hasEnoughHistory ? `${formatCurrency(burnRateCostPerHour)}/hr` : '--'}
            subValue={hasEnoughHistory ? `${formatBurnTokens(burnRateTokensPerMin)} tok/min` : 'gathering...'}
            metric="rate"
          />
        )}
        
        <box flexDirection="column" flexGrow={1} paddingLeft={1} paddingRight={1} overflow="hidden">
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
            thresholds={{ warning: 150, error: 500 }}
            style={sparklineConfig.style}
            orientation={sparklineConfig.orientation}
            showBaseline={sparklineConfig.showBaseline}
          />
        </box>
      </box>
      
      <box height={1} overflow="hidden">
        <text fg={colors.border}>{'─'.repeat(300)}</text>
      </box>
    </>
  );
}
