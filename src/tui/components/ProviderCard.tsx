import type { BoxRenderable } from "@opentui/core";
import { useTerminalDimensions } from "@opentui/react";
import type { ProviderUsageData } from "@tokentop/plugin-sdk";
import { forwardRef, useCallback } from "react";
import { useColors } from "../contexts/ThemeContext.tsx";
import { usePulse } from "../hooks/usePulse.ts";
import { SkeletonProviderContent } from "./Skeleton.tsx";
import { Spinner } from "./Spinner.tsx";
import { UsageGauge } from "./UsageGauge.tsx";

interface CompactGaugeProps {
  label: string;
  usedPercent: number | null;
  windowMinutes?: number | undefined;
  resetsAt?: number | undefined;
  color?: string | undefined;
}

function CompactGauge({ label, usedPercent, resetsAt, color }: CompactGaugeProps) {
  const colors = useColors();
  const providerColor = color ?? colors.primary;
  const percent = usedPercent ?? 0;

  const barWidth = 20;
  const filledWidth = Math.round((percent / 100) * barWidth);
  const emptyWidth = barWidth - filledWidth;

  const fillColor =
    percent >= 90 ? colors.gaugeDanger : percent >= 70 ? colors.gaugeWarning : providerColor;

  const filledBar = "█".repeat(filledWidth);
  const emptyBar = "·".repeat(emptyWidth);

  const resetText = resetsAt ? formatResetTime(resetsAt) : "";

  return (
    <box flexDirection="column">
      <text fg={providerColor}>{label}</text>
      <text>
        <span fg={fillColor}>{filledBar}</span>
        <span fg={colors.gaugeBackground}>{emptyBar}</span>
        <span fg={colors.text}> {percent !== null ? `${Math.round(percent)}%` : "--"}</span>
      </text>
      {resetText && <text fg={colors.textMuted}>{resetText}</text>}
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

export const ProviderCard = forwardRef<BoxRenderable, ProviderCardProps>(
  ({ name, configured, loading, usage, color, focused = false, onFocus }, ref) => {
    const colors = useColors();
    const { width: termWidth } = useTerminalDimensions();
    const providerColor = color ?? colors.primary;
    const pulseStep = usePulse({
      enabled: usage?.limitReached ?? false,
      intervalMs: 150,
      steps: 12,
    });

    const rawItems = usage?.limits?.items;
    const hasItems = rawItems && rawItems.length > 0;

    const sortedItems = hasItems
      ? [...rawItems].sort((a, b) => (b.usedPercent ?? 0) - (a.usedPercent ?? 0))
      : [];

    const maxVisibleGauges = 3;
    const hiddenGaugeCount =
      sortedItems.length > maxVisibleGauges ? sortedItems.length - maxVisibleGauges : 0;
    const visibleItems =
      sortedItems.length > maxVisibleGauges ? sortedItems.slice(0, maxVisibleGauges) : sortedItems;
    const useCompactMode = visibleItems.length > 3;

    const handleClick = useCallback(() => {
      if (onFocus) {
        onFocus();
      }
    }, [onFocus]);

    const statusColor = !configured
      ? colors.textSubtle
      : loading
        ? colors.info
        : usage?.error
          ? colors.error
          : usage?.limitReached
            ? colors.warning
            : colors.success;

    const statusIcon = !configured ? "○" : usage?.error ? "✗" : usage?.limitReached ? "!" : "●";

    const isInitialLoad = loading && !usage;

    const getWarningBorderColor = (step: number, baseColor: string): string => {
      const intensity = Math.sin((step / 12) * Math.PI);
      const base = hexToRgb(baseColor);
      const warn = hexToRgb(colors.warning);
      if (!base || !warn) return baseColor;
      const r = Math.round(base.r + (warn.r - base.r) * intensity);
      const g = Math.round(base.g + (warn.g - base.g) * intensity);
      const b = Math.round(base.b + (warn.b - base.b) * intensity);
      return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
    };

    const baseBorderColor = focused ? providerColor : colors.border;
    const borderColor = usage?.limitReached
      ? getWarningBorderColor(pulseStep, baseBorderColor)
      : baseBorderColor;

    const numColumns = termWidth >= 160 ? 3 : termWidth >= 100 ? 2 : 1;
    const cardPadding = 4;
    const gaps = numColumns - 1;
    const cardWidth = Math.max(
      40,
      Math.min(60, Math.floor((termWidth - cardPadding - gaps) / numColumns)),
    );

    return (
      <box
        ref={ref}
        border
        borderStyle="rounded"
        borderColor={borderColor}
        padding={1}
        flexDirection="column"
        gap={1}
        width={cardWidth}
        focusable
        onMouseDown={handleClick}
      >
        <box flexDirection="row" justifyContent="space-between" alignItems="center">
          <text>
            <span fg={providerColor}>
              <strong>{name}</strong>
            </span>
          </text>
          {configured && loading ? (
            <Spinner color={statusColor} />
          ) : (
            <text fg={statusColor}>{statusIcon}</text>
          )}
        </box>

        {!configured && <text fg={colors.textSubtle}>Not configured</text>}

        {configured && isInitialLoad && <SkeletonProviderContent />}

        {configured && !isInitialLoad && usage?.error && (
          <text fg={colors.error}>{usage.error}</text>
        )}

        {configured && !isInitialLoad && usage && !usage.error && (
          <box flexDirection="column" flexGrow={1} justifyContent="space-between">
            <box flexDirection="column" gap={1}>
              {usage.planType && <text fg={colors.textMuted}>{usage.planType}</text>}

              {hasItems ? (
                <>
                  {useCompactMode
                    ? visibleItems.map((limit, idx) => (
                        <CompactGauge
                          key={idx}
                          label={limit.label ?? "Usage"}
                          usedPercent={limit.usedPercent}
                          color={providerColor}
                          {...(limit.windowMinutes ? { windowMinutes: limit.windowMinutes } : {})}
                          {...(limit.resetsAt ? { resetsAt: limit.resetsAt } : {})}
                        />
                      ))
                    : visibleItems.map((limit, idx) => {
                        const labelText = limit.label ?? "Usage";
                        const labelHasWindow =
                          labelText.toLowerCase().includes("window") ||
                          labelText.toLowerCase().includes("hour") ||
                          labelText.toLowerCase().includes("day");
                        return (
                          <UsageGauge
                            key={idx}
                            label={labelText}
                            usedPercent={limit.usedPercent}
                            color={providerColor}
                            {...(limit.windowMinutes && !labelHasWindow
                              ? { windowLabel: formatWindow(limit.windowMinutes) }
                              : {})}
                            {...(limit.resetsAt ? { resetsAt: limit.resetsAt } : {})}
                          />
                        );
                      })}
                  {hiddenGaugeCount > 0 && (
                    <text fg={colors.textSubtle}>
                      +{hiddenGaugeCount} more limit{hiddenGaugeCount > 1 ? "s" : ""}
                    </text>
                  )}
                </>
              ) : (
                <>
                  {usage.limits?.primary &&
                    (() => {
                      const labelText = usage.limits.primary.label ?? "Usage";
                      const labelHasWindow =
                        labelText.toLowerCase().includes("window") ||
                        labelText.toLowerCase().includes("hour") ||
                        labelText.toLowerCase().includes("day");
                      return (
                        <UsageGauge
                          label={labelText}
                          usedPercent={usage.limits.primary.usedPercent}
                          color={providerColor}
                          {...(usage.limits.primary.windowMinutes && !labelHasWindow
                            ? { windowLabel: formatWindow(usage.limits.primary.windowMinutes) }
                            : {})}
                          {...(usage.limits.primary.resetsAt
                            ? { resetsAt: usage.limits.primary.resetsAt }
                            : {})}
                        />
                      );
                    })()}

                  {usage.limits?.secondary &&
                    (() => {
                      const labelText = usage.limits.secondary.label ?? "Secondary";
                      const labelHasWindow =
                        labelText.toLowerCase().includes("window") ||
                        labelText.toLowerCase().includes("hour") ||
                        labelText.toLowerCase().includes("day");
                      return (
                        <UsageGauge
                          label={labelText}
                          usedPercent={usage.limits.secondary.usedPercent}
                          color={providerColor}
                          {...(usage.limits.secondary.windowMinutes && !labelHasWindow
                            ? { windowLabel: formatWindow(usage.limits.secondary.windowMinutes) }
                            : {})}
                          {...(usage.limits.secondary.resetsAt
                            ? { resetsAt: usage.limits.secondary.resetsAt }
                            : {})}
                        />
                      );
                    })()}
                </>
              )}

              {usage.credits && (
                <box flexDirection="row" gap={1}>
                  <text fg={colors.textMuted}>Credits:</text>
                  <text fg={usage.credits.unlimited ? colors.success : colors.text}>
                    {usage.credits.unlimited ? "Unlimited" : (usage.credits.balance ?? "Unknown")}
                  </text>
                </box>
              )}
            </box>
          </box>
        )}
      </box>
    );
  },
);
ProviderCard.displayName = "ProviderCard";

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

function formatResetTime(timestamp: number): string {
  const now = Date.now();
  const diff = timestamp - now;

  if (diff <= 0) return "soon";

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
