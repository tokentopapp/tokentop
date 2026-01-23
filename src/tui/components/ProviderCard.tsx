import { useState, useEffect, useCallback, forwardRef } from 'react';
import { useKeyboard } from '@opentui/react';
import type { BoxRenderable } from '@opentui/core';
import { useColors } from '../contexts/ThemeContext.tsx';
import { UsageGauge } from './UsageGauge.tsx';
import { useSpinner } from './Spinner.tsx';
import { SkeletonProviderContent } from './Skeleton.tsx';
import type { ProviderUsageData } from '@/plugins/types/provider.ts';

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

  const [page, setPage] = useState(0);
  const [autoRotate, setAutoRotate] = useState(true);
  const [pulseStep, setPulseStep] = useState(0);

  const items = usage?.limits?.items;
  const hasItems = items && items.length > 0;
  const totalPages = hasItems ? Math.ceil(items.length / 2) : 0;
  const safePage = totalPages > 0 ? page % totalPages : 0;

  const goNext = useCallback(() => {
    if (totalPages > 1) {
      setPage((p) => (p + 1) % totalPages);
    }
  }, [totalPages]);

  const goPrev = useCallback(() => {
    if (totalPages > 1) {
      setPage((p) => (p - 1 + totalPages) % totalPages);
    }
  }, [totalPages]);

  const toggleAutoRotate = useCallback(() => {
    setAutoRotate((a) => !a);
  }, []);

  useKeyboard((key) => {
    if (!focused || totalPages <= 1) return;

    switch (key.name) {
      case 'left':
      case 'h':
        goPrev();
        setAutoRotate(false);
        break;
      case 'right':
      case 'l':
        goNext();
        setAutoRotate(false);
        break;
      case 'space':
      case 'enter':
        toggleAutoRotate();
        break;
    }
  });

  useEffect(() => {
    if (!hasItems || totalPages <= 1 || !autoRotate) return;
    const timer = setInterval(() => {
      setPage((p) => (p + 1) % totalPages);
    }, 4000);
    return () => clearInterval(timer);
  }, [hasItems, totalPages, autoRotate]);

  useEffect(() => {
    if (totalPages > 0 && page >= totalPages) {
      setPage(0);
    }
  }, [totalPages, page]);

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
  const showPagination = hasItems && totalPages > 1;

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
      {...(showPagination ? { height: 18 } : {})}
    >
      <box flexDirection="row" justifyContent="space-between" alignItems="center">
        <text>
          <span fg={providerColor}>
            <strong>{name}</strong>
          </span>
        </text>
        <box flexDirection="row" alignItems="center" gap={1}>
          {focused && showPagination && (
            <box onMouseDown={toggleAutoRotate}>
              <text fg={colors.textSubtle}>{autoRotate ? '▶' : '⏸'}</text>
            </box>
          )}
          <text fg={statusColor}>
            {configured && loading ? spinnerFrame : statusIcon}
          </text>
        </box>
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
                {items!.slice(safePage * 2, safePage * 2 + 2).map((limit, idx) => (
                  <UsageGauge
                    key={`${safePage}-${idx}`}
                    label={limit.label ?? 'Usage'}
                    usedPercent={limit.usedPercent}
                    color={providerColor}
                    {...(limit.windowMinutes ? { windowLabel: formatWindow(limit.windowMinutes) } : {})}
                    {...(limit.resetsAt ? { resetsAt: limit.resetsAt } : {})}
                  />
                ))}
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

          {showPagination && (
            <box flexDirection="row" justifyContent="center">
              {Array.from({ length: totalPages }).map((_, i) => (
                <box key={i} onMouseDown={() => { setPage(i); setAutoRotate(false); }}>
                  <text fg={i === safePage ? colors.text : colors.textSubtle}>
                    {i === safePage ? ' ● ' : ' ○ '}
                  </text>
                </box>
              ))}
            </box>
          )}
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

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!match) return null;
  return {
    r: parseInt(match[1]!, 16),
    g: parseInt(match[2]!, 16),
    b: parseInt(match[3]!, 16),
  };
}
