import { useMemo } from 'react';
import { useTerminalDimensions } from '@opentui/react';
import { useColors } from '../contexts/ThemeContext.tsx';
import { useConfig } from '../contexts/ConfigContext.tsx';
import { useTimeWindow } from '../contexts/TimeWindowContext.tsx';
import { usePulse } from '../hooks/usePulse.ts';
import type { AgentSessionAggregate, AgentSessionStream } from '../../agents/types.ts';

export type DriverDimension = 'model' | 'project' | 'agent';

export type SidebarMode = 'full' | 'compact' | 'minimal' | 'micro' | 'hidden';

export interface DriverStats {
  id: string;
  providerId?: string;
  displayName: string;
  cost: number;
  costShare: number;
  tokens: number;
  delta5m: number;
  isHot: boolean;
}

export interface SmartSidebarProps {
  sessions: AgentSessionAggregate[];
  budgetCost: number;
  focusedPanel: 'sessions' | 'sidebar' | 'limits';
  dimension: DriverDimension;
  selectedDriverIndex: number;
  activeDriverFilter: string | null;
  getProviderColor: (id: string) => string;
}

function interpolatePulseColor(intensity: number, baseColor: string, dimColor: string): string {
  const dimAmount = 0.4;
  const t = intensity * dimAmount;
  
  const parseHex = (hex: string) => {
    const h = hex.replace('#', '');
    return {
      r: parseInt(h.substring(0, 2), 16),
      g: parseInt(h.substring(2, 4), 16),
      b: parseInt(h.substring(4, 6), 16),
    };
  };
  
  const base = parseHex(baseColor);
  const dim = parseHex(dimColor);
  
  const r = Math.round(base.r + (dim.r - base.r) * t);
  const g = Math.round(base.g + (dim.g - base.g) * t);
  const b = Math.round(base.b + (dim.b - base.b) * t);
  
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function formatCurrency(val: number): string {
  if (val >= 1000) return `$${(val / 1000).toFixed(1)}k`;
  if (val >= 100) return `$${Math.round(val)}`;
  if (val >= 10) return `$${val.toFixed(1)}`;
  return `$${val.toFixed(2)}`;
}

/** Always shows 2 decimal places for budget displays where precision matters */
function formatBudget(val: number): string {
  if (val >= 1000) return `$${(val / 1000).toFixed(2)}k`;
  return `$${val.toFixed(2)}`;
}

function formatDelta(val: number): string {
  if (val < 0.01) return '';
  if (val >= 10) return `+$${val.toFixed(1)}`;
  return `+$${val.toFixed(2)}`;
}

function formatPercent(val: number): string {
  if (val < 1) return '<1%';
  return `${Math.round(val)}%`;
}

function truncateWithEllipsis(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '…';
}

function getSidebarMode(width: number): SidebarMode {
  if (width >= 140) return 'full';
  if (width >= 105) return 'compact';
  if (width >= 95) return 'minimal';
  if (width >= 85) return 'micro';
  return 'hidden';
}

function getSidebarWidth(mode: SidebarMode, terminalWidth: number): number {
  if (mode === 'micro') return 28;
  if (mode === 'minimal') return 32;
  if (mode === 'compact') return 36;
  if (terminalWidth >= 160) return 44;
  if (terminalWidth >= 140) return 40;
  return 38;
}

function extractRepoName(projectPath: string | undefined | null): string {
  if (!projectPath) return 'unknown';
  const normalized = projectPath.replace(/\\/g, '/');
  return normalized.split('/').filter(Boolean).pop() ?? 'unknown';
}

function makeProgressBar(percent: number, width: number, filledChar = '█', emptyChar = '·'): string {
  const clamped = Math.max(0, Math.min(100, percent));
  const filledWidth = Math.round((clamped / 100) * width);
  return filledChar.repeat(filledWidth) + emptyChar.repeat(width - filledWidth);
}

function makeDivider(width: number, char = '─'): string {
  return char.repeat(Math.max(0, width - 2));
}

interface BudgetSectionProps {
  totalCost: number;
  budgetCost: number;
  mode: SidebarMode;
  sidebarWidth: number;
}

function BudgetSection({ totalCost, budgetCost, mode, sidebarWidth }: BudgetSectionProps) {
  const colors = useColors();
  const { config } = useConfig();
  const { budgetType, budgetTypeLabel, budgetLock } = useTimeWindow();
  
  const activeBudget = budgetType === 'daily' ? config.budgets.daily
    : budgetType === 'weekly' ? config.budgets.weekly
    : budgetType === 'monthly' ? config.budgets.monthly
    : null;
  
  const hasBudgetLimit = activeBudget !== null && budgetType !== 'none';
  const budgetUsedPercent = hasBudgetLimit ? (budgetCost / activeBudget) * 100 : 0;
  
  const isCritical = hasBudgetLimit && budgetUsedPercent >= config.alerts.criticalPercent;
  const isWarning = hasBudgetLimit && budgetUsedPercent >= config.alerts.warningPercent && !isCritical;
  
  const criticalPulseStep = usePulse({ enabled: isCritical, intervalMs: 80 });
  const warningPulseStep = usePulse({ enabled: isWarning, intervalMs: 200 });
  
  const pulseIntensity = isCritical 
    ? Math.abs(Math.sin(criticalPulseStep * 0.3)) 
    : isWarning 
      ? Math.abs(Math.sin(warningPulseStep * 0.25))
      : 0;
  
  const getStatusColor = () => {
    if (isCritical) {
      return interpolatePulseColor(pulseIntensity, colors.error, colors.background);
    }
    if (isWarning) {
      return interpolatePulseColor(pulseIntensity, colors.warning, colors.background);
    }
    return colors.success;
  };
  
  const statusColor = hasBudgetLimit ? getStatusColor() : colors.text;
  const innerWidth = sidebarWidth - 4;
  const barWidth = Math.max(10, innerWidth - 6);
  const bar = makeProgressBar(budgetUsedPercent, barWidth);
  
  const isLocked = budgetLock !== 'sync';
  const lockSuffix = isLocked ? ' [locked]' : '';
  const headerLabel = budgetType === 'none' ? 'TOTAL COST' : `${budgetTypeLabel.toUpperCase()} BUDGET${lockSuffix}`;
  
  if (budgetType === 'none') {
    if (mode === 'micro') {
       return (
         <box flexDirection="row" height={1} paddingX={1}>
           <text fg={colors.textMuted} height={1}>Total: </text>
           <text fg={colors.text} height={1}><strong>{formatCurrency(totalCost)}</strong></text>
         </box>
       );
    }
    
    return (
      <box flexDirection="column" paddingX={1}>
        <text fg={colors.textMuted} height={1}><strong>{headerLabel}</strong></text>
        <text fg={colors.text} height={1}><strong>{formatCurrency(totalCost)}</strong></text>
      </box>
    );
  }
  
  if (!activeBudget) {
    if (mode === 'micro') {
       return (
         <box flexDirection="row" height={1} paddingX={1}>
           <text fg={colors.textMuted} height={1}>No {budgetTypeLabel.toLowerCase()} budget</text>
         </box>
       );
    }
    
     return (
       <box flexDirection="column" paddingX={1}>
         <text fg={colors.textMuted} height={1}><strong>{headerLabel}</strong></text>
         <text fg={colors.textSubtle} height={1}>Not set</text>
         <text fg={colors.textSubtle} height={1}>(, to configure)</text>
       </box>
     );
  }
  
  if (mode === 'micro') {
     return (
       <box flexDirection="column" paddingX={1}>
         <box flexDirection="row" height={1}>
           <text fg={colors.textMuted} height={1}>{budgetTypeLabel} </text>
           <text fg={statusColor} height={1}><strong>{formatPercent(budgetUsedPercent)}</strong></text>
           <text fg={colors.textMuted} height={1}> {formatBudget(budgetCost)}/{formatBudget(activeBudget)}</text>
         </box>
       </box>
     );
  }
  
   return (
     <box flexDirection="column" paddingX={1}>
       <box flexDirection="row" height={1}>
         <text fg={colors.textMuted}><strong>{headerLabel}</strong></text>
         <text flexGrow={1}></text>
         <text fg={statusColor}><strong>{formatPercent(budgetUsedPercent)}</strong></text>
       </box>
       
       <box flexDirection="row" height={1}>
         <text fg={statusColor}>{bar}</text>
       </box>
       
       <box flexDirection="row" height={1}>
         <text fg={colors.text}><strong>{formatBudget(budgetCost)}</strong></text>
         <text fg={colors.textMuted}>/{formatBudget(activeBudget)}</text>
       </box>
     </box>
   );
}

interface TopDriversSectionProps {
  drivers: DriverStats[];
  dimension: DriverDimension;
  selectedIndex: number;
  activeFilter: string | null;
  isFocused: boolean;
  mode: SidebarMode;
  sidebarWidth: number;
  maxDrivers: number;
  getProviderColor: (id: string) => string;
}

const DIMENSION_LABELS: Record<DriverDimension, string> = {
  model: 'MODELS',
  project: 'PROJECTS',
  agent: 'AGENTS',
};

function TopDriversSection({
  drivers,
  dimension,
  selectedIndex,
  activeFilter,
  isFocused,
  mode,
  sidebarWidth,
  maxDrivers,
  getProviderColor,
}: TopDriversSectionProps) {
  const colors = useColors();
  
  const displayDrivers = drivers.slice(0, maxDrivers);
  const innerWidth = sidebarWidth - 4;
  
  const showBars = mode === 'full' || mode === 'compact';
  const showDelta = mode === 'full';
  const showPercent = mode !== 'minimal';
  
  const prefixWidth = 2;
  const nameWidth = mode === 'full' ? 14 : mode === 'compact' ? 12 : 10;
  const deltaWidth = showDelta ? 7 : 0;
  const percentWidth = showPercent ? 5 : 0;
  const barWidth = showBars ? Math.max(8, innerWidth - prefixWidth - nameWidth - deltaWidth - percentWidth - 2) : 0;
  
  const dimensionToggle = ['m', 'p', 'a'].map(k => {
    const isActive = (k === 'm' && dimension === 'model') ||
                     (k === 'p' && dimension === 'project') ||
                     (k === 'a' && dimension === 'agent');
    return isActive ? k.toUpperCase() : k;
  }).join('/');
  
   return (
     <box flexDirection="column" paddingX={1}>
       <box flexDirection="row" height={1}>
         <text fg={colors.textMuted}><strong>TOP {DIMENSION_LABELS[dimension]}</strong></text>
         <text flexGrow={1}></text>
         <text fg={colors.textSubtle}>[{dimensionToggle}]</text>
       </box>
      
      {displayDrivers.length === 0 ? (
        <text fg={colors.textSubtle} height={1}>No data</text>
      ) : (
        displayDrivers.map((driver, idx) => {
          const isSelected = isFocused && idx === selectedIndex;
          const isFiltered = activeFilter === driver.id;
          
          const hotPrefix = driver.isHot ? '▲' : ' ';
          const selectPrefix = isSelected ? '▸' : isFiltered ? '●' : ' ';
          const displayName = truncateWithEllipsis(driver.displayName, nameWidth);
          const paddedName = displayName.padEnd(nameWidth);
          const delta = showDelta ? formatDelta(driver.delta5m).padStart(deltaWidth) : '';
          const percent = showPercent ? formatPercent(driver.costShare).padStart(percentWidth) : '';
          const bar = showBars ? makeProgressBar(driver.costShare, barWidth) : '';
          
          const textColor = isSelected ? colors.text : colors.textSubtle;
          const nameColor = isSelected ? colors.primary : getProviderColor(driver.providerId ?? driver.id);
          
          if (showBars) {
            return (
              <box key={driver.id} flexDirection="column" height={2}>
                <box flexDirection="row" height={1}>
                  <text fg={driver.isHot ? colors.warning : colors.textSubtle}>{hotPrefix}</text>
                  <text fg={textColor}>{selectPrefix}</text>
                  <text fg={nameColor}>{paddedName}</text>
                  {showDelta && <text fg={colors.success}>{delta}</text>}
                  {showPercent && <text fg={colors.textMuted}>{percent}</text>}
                </box>
                <box flexDirection="row" height={1}>
                  <text fg={isSelected ? colors.primary : colors.textSubtle}>  {bar}</text>
                </box>
              </box>
            );
          }
          
          return (
            <box key={driver.id} flexDirection="row" height={1}>
              <text fg={driver.isHot ? colors.warning : colors.textSubtle}>{hotPrefix}</text>
              <text fg={textColor}>{selectPrefix}</text>
              <text fg={nameColor}>{paddedName}</text>
              <text fg={colors.text}> {formatCurrency(driver.cost)}</text>
            </box>
          );
        })
      )}
      
      {isFocused && displayDrivers.length > 0 && (
        <text fg={colors.textSubtle} height={1}>↑↓ select  Enter filter</text>
      )}
    </box>
  );
}

interface DividerProps {
  width: number;
}

function Divider({ width }: DividerProps) {
  const colors = useColors();
   return (
     <box paddingX={1} height={1}>
       <text fg={colors.border} height={1}>{makeDivider(width)}</text>
     </box>
   );
}

interface EfficiencyInsight {
  type: 'cache' | 'verbosity' | 'chatty' | 'fallback';
  primaryLabel: string;
  primaryValue: string;
  actionLine: string;
  secondaryLabel?: string;
  isWarning: boolean;
}

interface EfficiencySectionProps {
  sessions: AgentSessionAggregate[];
  mode: SidebarMode;
}

function EfficiencySection({ sessions, mode }: EfficiencySectionProps) {
  const colors = useColors();
  
  const metrics = useMemo(() => {
    let totalInput = 0, totalOutput = 0, totalCacheRead = 0;
    let totalCost = 0, totalRequests = 0;
    let hasCacheData = false;

    sessions.forEach(s => {
      s.streams.forEach((st: AgentSessionStream) => {
        totalInput += st.tokens.input;
        totalOutput += st.tokens.output;
        totalCacheRead += st.tokens.cacheRead ?? 0;
        totalCost += st.costUsd ?? 0;
        totalRequests += st.requestCount;
        if (st.tokens.cacheRead != null && st.tokens.cacheRead > 0) hasCacheData = true;
      });
    });

    const cacheHitRate = (totalInput + totalCacheRead) > 0
      ? (totalCacheRead / (totalInput + totalCacheRead)) * 100 : 0;
    const outputShare = (totalInput + totalOutput) > 0
      ? (totalOutput / (totalInput + totalOutput)) * 100 : 0;
    const costPerReq = totalRequests > 0 ? totalCost / totalRequests : 0;

    return { totalInput, totalOutput, totalCacheRead, totalCost, totalRequests, hasCacheData, cacheHitRate, outputShare, costPerReq };
  }, [sessions]);

  const insight: EfficiencyInsight = useMemo(() => {
    // Priority 1: Cache Leverage
    if (metrics.hasCacheData && metrics.totalInput > 1000 && metrics.cacheHitRate < 80) {
      return {
        type: 'cache',
        primaryLabel: 'Cache hit:',
        primaryValue: `${Math.round(metrics.cacheHitRate)}%`,
        actionLine: 'Keep sessions open; avoid resets',
        secondaryLabel: `$/req: ${formatCurrency(metrics.costPerReq)}  Out: ${Math.round(metrics.outputShare)}%`,
        isWarning: metrics.cacheHitRate < 20,
      };
    }
    // Priority 2: Output Verbosity
    if (metrics.totalInput + metrics.totalOutput > 1000 && metrics.outputShare > 65) {
      return {
        type: 'verbosity',
        primaryLabel: 'Output share:',
        primaryValue: `${Math.round(metrics.outputShare)}%`,
        actionLine: 'Ask for diffs; less commentary',
        secondaryLabel: `$/req: ${formatCurrency(metrics.costPerReq)}`,
        isWarning: metrics.outputShare > 75,
      };
    }
    // Priority 3: Chatty Usage
    if (metrics.totalRequests > 10 && metrics.costPerReq > 0.15) {
      return {
        type: 'chatty',
        primaryLabel: '$/req:',
        primaryValue: formatCurrency(metrics.costPerReq),
        actionLine: 'Batch asks; fewer back-and-forth',
        secondaryLabel: `${metrics.totalRequests} reqs`,
        isWarning: metrics.costPerReq > 0.25,
      };
    }
    // Priority 4: Fallback
    return {
      type: 'fallback',
      primaryLabel: `$/req: ${formatCurrency(metrics.costPerReq)}`,
      primaryValue: `Out: ${Math.round(metrics.outputShare)}%`,
      actionLine: 'Prefer patches; reduce re-asking',
      isWarning: false,
    };
  }, [metrics]);

  const isFull = mode === 'full';
  const metricColor = insight.isWarning ? colors.warning : colors.text;

  if (insight.type === 'fallback') {
    const cacheLabel = metrics.hasCacheData
      ? `Cache: ${Math.round(metrics.cacheHitRate)}%`
      : 'Cache: n/a';

     return (
       <box flexDirection="column" paddingX={1}>
         <text fg={colors.textMuted} height={1}><strong>EFFICIENCY</strong></text>
         <box flexDirection="row" height={1}>
           <text fg={colors.text} height={1}>{insight.primaryLabel}    {insight.primaryValue}</text>
         </box>
         <text fg={colors.textSubtle} height={1}>{'-> '}{insight.actionLine}</text>
         {isFull && (
           <text fg={colors.textMuted} height={1}>Reqs: {metrics.totalRequests}  {cacheLabel}</text>
         )}
       </box>
     );
  }

   return (
     <box flexDirection="column" paddingX={1}>
       <text fg={colors.textMuted} height={1}><strong>EFFICIENCY</strong></text>
       <box flexDirection="row" height={1}>
         <text fg={colors.textMuted} height={1}>{insight.primaryLabel} </text>
         <text fg={metricColor} height={1}>{insight.primaryValue}</text>
       </box>
       <text fg={colors.textSubtle} height={1}>{'-> '}{insight.actionLine}</text>
       {isFull && insight.secondaryLabel && (
         <text fg={colors.textMuted} height={1}>{insight.secondaryLabel}</text>
       )}
     </box>
   );
}

export function SmartSidebar({
  sessions,
  budgetCost,
  focusedPanel,
  dimension,
  selectedDriverIndex,
  activeDriverFilter,
  getProviderColor,
}: SmartSidebarProps) {
  const colors = useColors();
  const { width: terminalWidth, height: terminalHeight } = useTerminalDimensions();
  
  const mode = getSidebarMode(terminalWidth);
  const sidebarWidth = getSidebarWidth(mode, terminalWidth);
  const isFocused = focusedPanel === 'sidebar';
  
  const showBars = mode === 'full' || mode === 'compact';
  const driverRowHeight = showBars ? 2 : 1;
  
  const sidebarInnerHeight = terminalHeight - 24;
  const budgetRows = 3;
  const dividerRows = 1;
  const driversHeaderRow = 1;
  const efficiencyRows = 4;
  
  const minHeightForEfficiency = budgetRows + dividerRows + driversHeaderRow + (2 * driverRowHeight) + dividerRows + efficiencyRows;
  const showEfficiency = sidebarInnerHeight >= minHeightForEfficiency;
  
  const reservedRows = budgetRows + dividerRows + driversHeaderRow + (showEfficiency ? dividerRows + efficiencyRows : 0);
  const availableForDrivers = Math.max(0, sidebarInnerHeight - reservedRows);
  const maxDrivers = Math.max(1, Math.min(10, Math.floor(availableForDrivers / driverRowHeight)));
  
  const totalCost = useMemo(() => 
    sessions.reduce((sum, s) => sum + (s.totalCostUsd ?? 0), 0),
    [sessions]
  );
  
  const drivers = useMemo((): DriverStats[] => {
    const stats: Record<string, { cost: number; tokens: number; delta5m: number }> = {};
    const providerForKey: Record<string, string> = {};
    const now = Date.now();
    const fiveMinAgo = now - 5 * 60 * 1000;
    
    sessions.forEach(s => {
      s.streams.forEach((st: AgentSessionStream) => {
        let key: string;
        switch (dimension) {
          case 'model':
            key = st.modelId;
            if (!providerForKey[key]) providerForKey[key] = st.providerId;
            break;
          case 'project':
            key = extractRepoName(s.projectPath);
            break;
          case 'agent':
            key = s.agentName;
            break;
        }
        
        if (!stats[key]) {
          stats[key] = { cost: 0, tokens: 0, delta5m: 0 };
        }
        
        const cost = st.costUsd ?? 0;
        const entry = stats[key]!;
        entry.cost += cost;
        entry.tokens += st.tokens.input + st.tokens.output;
        
        if (s.lastActivityAt >= fiveMinAgo) {
          const sessionDuration = Math.max(1, s.lastActivityAt - s.startedAt);
          const recentWindow = Math.min(5 * 60 * 1000, now - fiveMinAgo);
          const recentRatio = recentWindow / sessionDuration;
          entry.delta5m += cost * Math.min(recentRatio, 1) * 0.5;
        }
      });
    });
    
    return Object.entries(stats)
      .map(([id, data]): DriverStats => {
        const displayName = dimension === 'model' 
          ? (id.split('/').pop() ?? id)
          : id;
        return {
          id,
          ...(providerForKey[id] != null ? { providerId: providerForKey[id] } : {}),
          displayName,
          cost: data.cost,
          costShare: totalCost > 0 ? (data.cost / totalCost) * 100 : 0,
          tokens: data.tokens,
          delta5m: data.delta5m,
          isHot: data.delta5m > 0.10,
        };
      })
      .sort((a, b) => b.cost - a.cost);
  }, [sessions, dimension, totalCost]);
  
  if (mode === 'hidden') {
    return null;
  }
  
  return (
    <box
      flexDirection="column"
      width={sidebarWidth}
      border
      borderStyle={isFocused ? 'double' : 'single'}
      borderColor={isFocused ? colors.primary : colors.border}
      overflow="hidden"
    >
      <box flexDirection="column" flexGrow={1}>
        <BudgetSection 
          totalCost={totalCost}
          budgetCost={budgetCost}
          mode={mode}
          sidebarWidth={sidebarWidth}
        />
        
        {mode !== 'micro' && <Divider width={sidebarWidth} />}
        
        {mode !== 'micro' && (
          <TopDriversSection
            drivers={drivers}
            dimension={dimension}
            selectedIndex={selectedDriverIndex}
            activeFilter={activeDriverFilter}
            isFocused={isFocused}
            mode={mode}
            sidebarWidth={sidebarWidth}
            maxDrivers={maxDrivers}
            getProviderColor={getProviderColor}
          />
        )}
        
         {mode === 'micro' && drivers[0] && (
           <box flexDirection="row" paddingX={1} height={1}>
             <text fg={colors.textMuted} height={1}>Top: </text>
             <text fg={getProviderColor(drivers[0].providerId ?? drivers[0].id)} height={1}>
               {truncateWithEllipsis(drivers[0].displayName, 10)}
             </text>
             <text fg={colors.text} height={1}> {formatCurrency(drivers[0].cost)}</text>
             {drivers[0].isHot && <text fg={colors.warning} height={1}>▲</text>}
           </box>
         )}
      </box>
      
      {showEfficiency && mode !== 'micro' && (
        <box flexDirection="column">
          <Divider width={sidebarWidth} />
          <EfficiencySection 
            sessions={sessions}
            mode={mode}
          />
        </box>
      )}
    </box>
  );
}

export { getSidebarMode };
