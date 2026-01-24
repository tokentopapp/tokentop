import { useState, useEffect, useCallback, forwardRef } from 'react';
import type { BoxRenderable } from '@opentui/core';
import { useColors } from '../contexts/ThemeContext.tsx';
import { UsageGauge } from './UsageGauge.tsx';
import { useSpinner } from './Spinner.tsx';
import { SkeletonProviderContent } from './Skeleton.tsx';
import type { ProviderUsageData } from '@/plugins/types/provider.ts';

interface CompactGaugeProps {
  label: string;
  usedPercent: number | null;
  windowMinutes?: number | undefined;
  resetsAt?: number | undefined;
  color?: string | undefined;
}

function CompactGauge({ label, usedPercent, windowMinutes, resetsAt, color }: CompactGaugeProps) {
  const colors = useColors();
  const providerColor = color ?? colors.primary;
  const percent = usedPercent ?? 0;
  
  const barWidth = 12;
  const filledWidth = Math.round((percent / 100) * barWidth);
  const emptyWidth = barWidth - filledWidth;
  
  const fillColor = percent >= 90 ? colors.gaugeDanger :
                    percent >= 70 ? colors.gaugeWarning :
                    providerColor;
  
  const filledBar = '█'.repeat(filledWidth);
  const emptyBar = '·'.repeat(emptyWidth);
  
  const windowText = windowMinutes ? formatWindowCompact(windowMinutes) : '';
  const resetText = resetsAt ? formatResetTime(resetsAt) : '';
  const suffix = [windowText, resetText].filter(Boolean).join(' · ');
  
  return (
    <box flexDirection="row" gap={1}>
      <text>
        <span fg={providerColor}>{label}</span>
        <span fg={colors.textMuted}> [</span>
        <span fg={fillColor}>{filledBar}</span>
        <span fg={colors.gaugeBackground}>{emptyBar}</span>
        <span fg={colors.textMuted}>] </span>
        <span fg={colors.text}>{percent !== null ? `${Math.round(percent)}%` : '--'}</span>
        {suffix && <span fg={colors.textMuted}> ({suffix})</span>}
      </text>
    </box>
  );
}

interface ProviderCardProps {
  name: string;
  configured: boolean;
  loading: boolean;
  usage: ProviderUsageData | null;
  color?: string | undefined;
  focused?: boolean | undefined;
  onFocus?: (() => void) | undefined;
}

export const ProviderCard = forwardRef<BoxRenderable, ProviderCardProps>(({
  name,
  configured,
  loading,
  usage,
  color,
  focused = false,
  onFocus,
}, ref) => {
  const colors = useColors();
  const providerColor = color ?? colors.primary;
  const spinnerFrame = useSpinner();

  const [pulseStep, setPulseStep] = useState(0);

  const rawItems = usage?.limits?.items;
  const hasItems = rawItems && rawItems.length > 0;
  
  const sortedItems = hasItems 
    ? [...rawItems].sort((a, b) => (b.usedPercent ?? 0) - (a.usedPercent ?? 0))
    : [];
  
  const useCompactMode = sortedItems.length > 3;

  useEffect(() => {
    if (!usage?.limitReached) {
      setPulseStep(0);
      return;
    }

    const timer = setInterval(() => {
      setPulseStep((p) => (p + 1) % 12);
    }, 150);

    return () => clearInterval(timer);
  }, [usage?.limitReached]);

  const handleClick = useCallback(() => {
    if (onFocus) {
      onFocus();
    }
  }, [onFocus]);

  const statusColor = !configured ? colors.textSubtle :
                      loading ? colors.info :
                      usage?.error ? colors.error :
                      usage?.limitReached ? colors.warning :
                      colors.success;

  const statusIcon = !configured ? '○' :
                     usage?.error ? '✗' :
                     usage?.limitReached ? '!' :
                     '●';

  const isInitialLoad = loading && !usage;

  const getWarningBorderColor = (step: number, baseColor: string): string => {
    const intensity = Math.sin((step / 12) * Math.PI);
    const base = hexToRgb(baseColor);
    const warn = hexToRgb(colors.warning);
    if (!base || !warn) return baseColor;
    const r = Math.round(base.r + (warn.r - base.r) * intensity);
    const g = Math.round(base.g + (warn.g - base.g) * intensity);
    const b = Math.round(base.b + (warn.b - base.b) * intensity);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  };

  const baseBorderColor = focused ? providerColor : colors.border;
  const borderColor = usage?.limitReached
    ? getWarningBorderColor(pulseStep, baseBorderColor)
    : baseBorderColor;

  return (
    <box
      ref={ref}
      border
      borderStyle="rounded"
      borderColor={borderColor}
      padding={1}
      flexDirection="column"
      gap={1}
      width={44}
      onMouseDown={handleClick}
    >
      <box flexDirection="row" justifyContent="space-between" alignItems="center">
        <text>
          <span fg={providerColor}>
            <strong>{name}</strong>
          </span>
        </text>
        <text fg={statusColor}>
          {configured && loading ? spinnerFrame : statusIcon}
        </text>
      </box>

      {!configured && (
        <text fg={colors.textSubtle}>Not configured</text>
      )}

      {configured && isInitialLoad && (
        <SkeletonProviderContent />
      )}

      {configured && !isInitialLoad && usage?.error && (
        <text fg={colors.error}>{usage.error}</text>
      )}

      {configured && !isInitialLoad && usage && !usage.error && (
        <box flexDirection="column" flexGrow={1} justifyContent="space-between">
          <box flexDirection="column" gap={1}>
            {usage.planType && (
              <text fg={colors.textMuted}>{usage.planType}</text>
            )}

            {hasItems ? (
              <>
                {useCompactMode ? (
                  sortedItems.map((limit, idx) => (
                    <CompactGauge
                      key={idx}
                      label={limit.label ?? 'Usage'}
                      usedPercent={limit.usedPercent}
                      color={providerColor}
                      {...(limit.windowMinutes ? { windowMinutes: limit.windowMinutes } : {})}
                      {...(limit.resetsAt ? { resetsAt: limit.resetsAt } : {})}
                    />
                  ))
                ) : (
                  sortedItems.map((limit, idx) => (
                    <UsageGauge
                      key={idx}
                      label={limit.label ?? 'Usage'}
                      usedPercent={limit.usedPercent}
                      color={providerColor}
                      {...(limit.windowMinutes ? { windowLabel: formatWindow(limit.windowMinutes) } : {})}
                      {...(limit.resetsAt ? { resetsAt: limit.resetsAt } : {})}
                    />
                  ))
                )}
              </>
            ) : (
              <>
                {usage.limits?.primary && (
                  <UsageGauge
                    label={usage.limits.primary.label ?? 'Usage'}
                    usedPercent={usage.limits.primary.usedPercent}
                    color={providerColor}
                    {...(usage.limits.primary.windowMinutes ? { windowLabel: formatWindow(usage.limits.primary.windowMinutes) } : {})}
                    {...(usage.limits.primary.resetsAt ? { resetsAt: usage.limits.primary.resetsAt } : {})}
                  />
                )}

                {usage.limits?.secondary && (
                  <UsageGauge
                    label={usage.limits.secondary.label ?? 'Secondary'}
                    usedPercent={usage.limits.secondary.usedPercent}
                    color={providerColor}
                    {...(usage.limits.secondary.windowMinutes ? { windowLabel: formatWindow(usage.limits.secondary.windowMinutes) } : {})}
                    {...(usage.limits.secondary.resetsAt ? { resetsAt: usage.limits.secondary.resetsAt } : {})}
                  />
                )}
              </>
            )}

            {usage.credits && (
              <box flexDirection="row" gap={1}>
                <text fg={colors.textMuted}>Credits:</text>
                <text fg={usage.credits.unlimited ? colors.success : colors.text}>
                  {usage.credits.unlimited ? 'Unlimited' : usage.credits.balance ?? 'Unknown'}
                </text>
              </box>
            )}
          </box>
        </box>
      )}
    </box>
  );
});
ProviderCard.displayName = 'ProviderCard';

function formatWindow(minutes: number): string {
  if (minutes >= 1440) {
    const days = Math.round(minutes / 1440);
    return `${days}-day window`;
  }
  if (minutes >= 60) {
    const hours = Math.round(minutes / 60);
    return `${hours}-hour window`;
  }
  return `${minutes}-minute window`;
}

function formatWindowCompact(minutes: number): string {
  if (minutes >= 1440) {
    const days = Math.round(minutes / 1440);
    return `${days}d`;
  }
  if (minutes >= 60) {
    const hours = Math.round(minutes / 60);
    return `${hours}h`;
  }
  return `${minutes}m`;
}

function formatResetTime(timestamp: number): string {
  const now = Date.now();
  const diff = timestamp - now;

  if (diff <= 0) return 'soon';

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  return `${minutes}m`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!match) return null;
  return {
    r: parseInt(match[1]!, 16),
    g: parseInt(match[2]!, 16),
    b: parseInt(match[3]!, 16),
  };
}
