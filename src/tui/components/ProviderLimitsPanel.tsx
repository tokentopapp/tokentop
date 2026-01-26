import { useMemo } from 'react';
import { useTerminalDimensions } from '@opentui/react';
import { useColors } from '../contexts/ThemeContext.tsx';
import { LimitGauge } from './LimitGauge.tsx';

interface ProviderData {
  id: string;
  name: string;
  usedPercent: number;
  color: string;
  error?: string;
  resetTime?: string;
  used?: number;
  limit?: number;
  limitType?: string;
}

interface ProviderLimitsPanelProps {
  providers: ProviderData[];
  focused?: boolean;
  selectedIndex?: number;
}

type LayoutMode = 'hidden' | 'compact' | 'normal' | 'wide';

function getLayoutMode(width: number, height: number): LayoutMode {
  if (height < 24) return 'hidden';
  if (height < 30) return 'compact';
  if (width >= 140) return 'wide';
  return 'normal';
}

function sortByUrgency(providers: ProviderData[]): ProviderData[] {
  return [...providers].sort((a, b) => {
    const aIsCritical = a.usedPercent >= 95;
    const bIsCritical = b.usedPercent >= 95;
    const aIsWarning = a.usedPercent >= 80;
    const bIsWarning = b.usedPercent >= 80;
    
    if (aIsCritical && !bIsCritical) return -1;
    if (!aIsCritical && bIsCritical) return 1;
    if (aIsWarning && !bIsWarning) return -1;
    if (!aIsWarning && bIsWarning) return 1;
    
    return b.usedPercent - a.usedPercent;
  });
}

export function ProviderLimitsPanel({ 
  providers, 
  focused = false, 
  selectedIndex = 0,
}: ProviderLimitsPanelProps) {
  const colors = useColors();
  const { width: termWidth, height: termHeight } = useTerminalDimensions();
  
  const layoutMode = getLayoutMode(termWidth, termHeight);
  const sortedProviders = useMemo(() => sortByUrgency(providers), [providers]);
  
  if (layoutMode === 'hidden' || sortedProviders.length === 0) {
    return null;
  }
  
  const safeSelectedIndex = Math.min(selectedIndex, sortedProviders.length - 1);
  
  if (layoutMode === 'compact') {
    const baseMaxShow = 4;
    const hasMore = sortedProviders.length > baseMaxShow;
    const needsScrolling = safeSelectedIndex >= baseMaxShow;
    const maxShow = needsScrolling ? baseMaxShow - 1 : baseMaxShow;
    const startIndex = Math.max(0, Math.min(safeSelectedIndex - maxShow + 1, sortedProviders.length - maxShow));
    const showLeftArrow = hasMore && startIndex > 0;
    const shown = sortedProviders.slice(startIndex, startIndex + maxShow);
    const remaining = sortedProviders.length - startIndex - maxShow;
    
    return (
      <box flexDirection="row" height={1} paddingLeft={1} paddingRight={1} gap={1} overflow="hidden">
        <text fg={colors.textMuted} height={1}>LIMITS:</text>
        {showLeftArrow && (
          <text fg={colors.textSubtle} height={1}>◀</text>
        )}
        {shown.map((p, idx) => (
          <LimitGauge
            key={p.id}
            label={p.name}
            usedPercent={p.usedPercent}
            color={p.color}
            {...(p.error ? { error: p.error } : {})}
            compact={true}
            selected={focused && (startIndex + idx) === safeSelectedIndex}
          />
        ))}
        {remaining > 0 && (
          <text fg={colors.textSubtle} height={1}>▶ +{remaining}</text>
        )}
      </box>
    );
  }
  
  if (layoutMode === 'wide') {
    const baseMaxShow = 6;
    const hasMore = sortedProviders.length > baseMaxShow;
    const needsScrolling = safeSelectedIndex >= baseMaxShow;
    const maxShow = needsScrolling ? baseMaxShow - 1 : baseMaxShow;
    const startIndex = Math.max(0, Math.min(safeSelectedIndex - maxShow + 1, sortedProviders.length - maxShow));
    const showLeftArrow = hasMore && startIndex > 0;
    const shown = sortedProviders.slice(startIndex, startIndex + maxShow);
    
    return (
      <box 
        flexDirection="column" 
        border 
        borderStyle={focused ? 'double' : 'single'}
        borderColor={focused ? colors.primary : colors.border} 
        overflow="hidden" 
        height={4} 
        flexShrink={0}
      >
        <box flexDirection="row" paddingLeft={2} height={1}>
          <text fg={colors.textMuted} height={1}>
            PROVIDER LIMITS {focused ? '(←→ navigate, Tab exit)' : ''}
          </text>
        </box>
        <box flexDirection="row" gap={3} overflow="hidden" height={1} paddingLeft={2}>
          {showLeftArrow && (
            <text fg={colors.textSubtle} height={1}>◀</text>
          )}
          {shown.map((p, idx) => (
            <LimitGauge
              key={p.id}
              label={p.name}
              usedPercent={p.usedPercent}
              color={p.color}
              {...(p.error ? { error: p.error } : {})}
              {...(p.resetTime ? { resetTime: p.resetTime } : {})}
              labelWidth={14}
              barWidth={12}
              selected={focused && (startIndex + idx) === safeSelectedIndex}
            />
          ))}
          {hasMore && startIndex + maxShow < sortedProviders.length && (
            <text fg={colors.textSubtle} height={1}>▶</text>
          )}
        </box>
      </box>
    );
  }
  
  const baseMaxShow = 4;
  const hasMore = sortedProviders.length > baseMaxShow;
  const needsScrolling = safeSelectedIndex >= baseMaxShow;
  const maxShow = needsScrolling ? baseMaxShow - 1 : baseMaxShow;
  const startIndex = Math.max(0, Math.min(safeSelectedIndex - maxShow + 1, sortedProviders.length - maxShow));
  const showLeftArrow = hasMore && startIndex > 0;
  const shown = sortedProviders.slice(startIndex, startIndex + maxShow);
  
  return (
    <box 
      flexDirection="column" 
      border 
      borderStyle={focused ? 'double' : 'single'}
      borderColor={focused ? colors.primary : colors.border} 
      overflow="hidden" 
      height={4} 
      flexShrink={0}
    >
      <box flexDirection="row" paddingLeft={2} height={1}>
        <text fg={colors.textMuted} height={1}>
          PROVIDER LIMITS {focused ? '(←→ navigate, Tab exit)' : ''}
        </text>
      </box>
      <box flexDirection="row" gap={2} overflow="hidden" height={1} paddingLeft={2}>
        {showLeftArrow && (
          <text fg={colors.textSubtle} height={1}>◀</text>
        )}
        {shown.map((p, idx) => (
          <LimitGauge
            key={p.id}
            label={p.name}
            usedPercent={p.usedPercent}
            color={p.color}
            {...(p.error ? { error: p.error } : {})}
            {...(p.resetTime ? { resetTime: p.resetTime } : {})}
            labelWidth={12}
            barWidth={10}
            selected={focused && (startIndex + idx) === safeSelectedIndex}
          />
        ))}
        {hasMore && startIndex + maxShow < sortedProviders.length && (
          <text fg={colors.textSubtle} height={1}>▶</text>
        )}
      </box>
    </box>
  );
}
