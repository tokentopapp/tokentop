import { useTerminalDimensions } from "@opentui/react";
import { useMemo } from "react";
import type { ProviderErrorCategory } from "@/utils/error-category.ts";
import { useConfig } from "../contexts/ConfigContext.tsx";
import { useColors } from "../contexts/ThemeContext.tsx";
import { usePulse } from "../hooks/usePulse.ts";
import { LimitGauge } from "./LimitGauge.tsx";

function interpolatePulseColor(intensity: number, baseColor: string, dimColor: string): string {
  const dimAmount = 0.4;
  const t = intensity * dimAmount;

  const parseHex = (hex: string) => {
    const h = hex.replace("#", "");
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

  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

interface ProviderData {
  id: string;
  name: string;
  usedPercent: number;
  color: string;
  error?: string;
  errorCategory?: ProviderErrorCategory;
  resetTime?: string;
  used?: number;
  limit?: number;
  limitType?: string;
}

interface BudgetData {
  totalCost: number;
  budgetCost: number;
  limit: number | null;
  budgetType: "daily" | "weekly" | "monthly" | "none";
  budgetTypeLabel: string;
  warningPercent: number;
  criticalPercent: number;
}

interface ProviderLimitsPanelProps {
  providers: ProviderData[];
  focused?: boolean;
  selectedIndex?: number;
  budget?: BudgetData;
  showBudgetBar?: boolean;
}

type LayoutMode = "hidden" | "compact" | "normal" | "wide";

function getLayoutMode(width: number, height: number): LayoutMode {
  if (height < 24) return "hidden";
  if (height < 30) return "compact";
  if (width >= 140) return "wide";
  return "normal";
}

function sortByUrgency(
  providers: ProviderData[],
  warningThreshold: number,
  criticalThreshold: number,
): ProviderData[] {
  return [...providers].sort((a, b) => {
    const aIsCritical = a.usedPercent >= criticalThreshold;
    const bIsCritical = b.usedPercent >= criticalThreshold;
    const aIsWarning = a.usedPercent >= warningThreshold;
    const bIsWarning = b.usedPercent >= warningThreshold;

    if (aIsCritical && !bIsCritical) return -1;
    if (!aIsCritical && bIsCritical) return 1;
    if (aIsWarning && !bIsWarning) return -1;
    if (!aIsWarning && bIsWarning) return 1;

    return b.usedPercent - a.usedPercent;
  });
}

function formatCurrency(val: number): string {
  if (val >= 1000) return `$${(val / 1000).toFixed(1)}k`;
  if (val >= 100) return `$${Math.round(val)}`;
  if (val >= 10) return `$${val.toFixed(1)}`;
  return `$${val.toFixed(2)}`;
}

function makeProgressBar(percent: number, width: number): string {
  const clamped = Math.max(0, Math.min(100, percent));
  const filledWidth = Math.round((clamped / 100) * width);
  return "█".repeat(filledWidth) + "·".repeat(width - filledWidth);
}

export function ProviderLimitsPanel({
  providers,
  focused = false,
  selectedIndex = 0,
  budget,
  showBudgetBar = false,
}: ProviderLimitsPanelProps) {
  const colors = useColors();
  const { config } = useConfig();
  const { width: termWidth, height: termHeight } = useTerminalDimensions();

  const warningThreshold = config.alerts.warningPercent;
  const criticalThreshold = config.alerts.criticalPercent;

  const hasBudgetLimit = !!(budget?.limit && budget.budgetType !== "none");
  const budgetPercent =
    hasBudgetLimit && budget?.limit ? (budget.budgetCost / budget.limit) * 100 : 0;
  const isBudgetCritical = hasBudgetLimit && budget && budgetPercent >= budget.criticalPercent;
  const isBudgetWarning =
    hasBudgetLimit && budget && budgetPercent >= budget.warningPercent && !isBudgetCritical;

  const criticalPulseStep = usePulse({ enabled: !!isBudgetCritical, intervalMs: 80 });
  const warningPulseStep = usePulse({ enabled: !!isBudgetWarning, intervalMs: 200 });

  const pulseIntensity = isBudgetCritical
    ? Math.abs(Math.sin(criticalPulseStep * 0.3))
    : isBudgetWarning
      ? Math.abs(Math.sin(warningPulseStep * 0.25))
      : 0;

  const getBudgetColor = () => {
    if (!budget?.limit) return colors.textMuted;
    if (isBudgetCritical) {
      return interpolatePulseColor(pulseIntensity, colors.error, colors.background);
    }
    if (isBudgetWarning) {
      return interpolatePulseColor(pulseIntensity, colors.warning, colors.background);
    }
    return colors.success;
  };

  const budgetColor = getBudgetColor();

  const layoutMode = getLayoutMode(termWidth, termHeight);
  const sortedProviders = useMemo(
    () => sortByUrgency(providers, warningThreshold, criticalThreshold),
    [providers, warningThreshold, criticalThreshold],
  );

  if (layoutMode === "hidden" || sortedProviders.length === 0) {
    return null;
  }

  const safeSelectedIndex = Math.min(selectedIndex, sortedProviders.length - 1);

  if (layoutMode === "compact") {
    const baseMaxShow = 4;
    const hasMore = sortedProviders.length > baseMaxShow;
    const maxShow = hasMore ? baseMaxShow - 1 : baseMaxShow;
    const startIndex = Math.max(
      0,
      Math.min(safeSelectedIndex - maxShow + 1, sortedProviders.length - maxShow),
    );
    const showLeftArrow = hasMore && startIndex > 0;
    const showRightArrow = hasMore && startIndex + maxShow < sortedProviders.length;
    const shown = sortedProviders.slice(startIndex, startIndex + maxShow);
    const remaining = sortedProviders.length - startIndex - maxShow;

    return (
      <box flexDirection="column" height={showBudgetBar && budget ? 2 : 1} overflow="hidden">
        <box flexDirection="row" height={1} paddingX={1} gap={1} overflow="hidden">
          <text fg={colors.textMuted} height={1}>
            LIMITS:
          </text>
          {showLeftArrow && (
            <text fg={colors.primary} height={1}>
              ◀
            </text>
          )}
          {shown.map((p, idx) => (
            <LimitGauge
              key={p.id}
              label={p.name}
              usedPercent={p.usedPercent}
              color={p.color}
              {...(p.error ? { error: p.error } : {})}
              {...(p.errorCategory ? { errorCategory: p.errorCategory } : {})}
              compact={true}
              selected={focused && startIndex + idx === safeSelectedIndex}
              warningThreshold={warningThreshold}
              criticalThreshold={criticalThreshold}
            />
          ))}
          {showRightArrow && (
            <text fg={colors.primary} height={1}>
              ▶ +{remaining}
            </text>
          )}
        </box>
        {showBudgetBar && budget && (
          <box flexDirection="row" height={1} paddingX={1} gap={1} overflow="hidden">
            <text fg={colors.textMuted} height={1}>
              {budget.budgetType === "none" ? "TOTAL:" : `${budget.budgetTypeLabel.toUpperCase()}:`}
            </text>
            {hasBudgetLimit ? (
              <>
                <text fg={budgetColor} height={1}>
                  {makeProgressBar(budgetPercent, 12)}
                </text>
                <text fg={budgetColor} height={1}>
                  {Math.round(budgetPercent)}%
                </text>
                <text fg={colors.text} height={1}>
                  {formatCurrency(budget.budgetCost)}
                </text>
                <text fg={colors.textMuted} height={1}>
                  /{formatCurrency(budget.limit!)}
                </text>
              </>
            ) : (
              <text fg={colors.text} height={1}>
                {formatCurrency(budget.totalCost)}
              </text>
            )}
          </box>
        )}
      </box>
    );
  }

  if (layoutMode === "wide") {
    const baseMaxShow = 5;
    const hasMore = sortedProviders.length > baseMaxShow;
    const maxShow = hasMore ? baseMaxShow - 1 : baseMaxShow;
    const startIndex = Math.max(
      0,
      Math.min(safeSelectedIndex - maxShow + 1, sortedProviders.length - maxShow),
    );
    const showLeftArrow = hasMore && startIndex > 0;
    const showRightArrow = hasMore && startIndex + maxShow < sortedProviders.length;
    const shown = sortedProviders.slice(startIndex, startIndex + maxShow);

    return (
      <box
        flexDirection="column"
        border
        borderStyle={focused ? "double" : "single"}
        borderColor={focused ? colors.primary : colors.border}
        overflow="hidden"
        height={4}
        flexShrink={0}
      >
        <box flexDirection="row" paddingLeft={2} height={1}>
          <text fg={colors.textMuted} height={1}>
            PROVIDER LIMITS {focused ? "(←→ navigate, Tab exit)" : ""}
          </text>
        </box>
        <box flexDirection="row" gap={3} overflow="hidden" height={1} paddingLeft={2}>
          {showLeftArrow && (
            <text fg={colors.primary} height={1}>
              ◀
            </text>
          )}
          {shown.map((p, idx) => (
            <LimitGauge
              key={p.id}
              label={p.name}
              usedPercent={p.usedPercent}
              color={p.color}
              {...(p.error ? { error: p.error } : {})}
              {...(p.errorCategory ? { errorCategory: p.errorCategory } : {})}
              {...(p.resetTime ? { resetTime: p.resetTime } : {})}
              labelWidth={14}
              barWidth={12}
              selected={focused && startIndex + idx === safeSelectedIndex}
              warningThreshold={warningThreshold}
              criticalThreshold={criticalThreshold}
            />
          ))}
          {showRightArrow && (
            <text fg={colors.primary} height={1}>
              ▶
            </text>
          )}
        </box>
      </box>
    );
  }

  const baseMaxShow = 4;
  const hasMore = sortedProviders.length > baseMaxShow;
  const maxShow = hasMore ? baseMaxShow - 1 : baseMaxShow;
  const startIndex = Math.max(
    0,
    Math.min(safeSelectedIndex - maxShow + 1, sortedProviders.length - maxShow),
  );
  const showLeftArrow = hasMore && startIndex > 0;
  const showRightArrow = hasMore && startIndex + maxShow < sortedProviders.length;
  const shown = sortedProviders.slice(startIndex, startIndex + maxShow);

  return (
    <box
      flexDirection="column"
      border
      borderStyle={focused ? "double" : "single"}
      borderColor={focused ? colors.primary : colors.border}
      overflow="hidden"
      height={4}
      flexShrink={0}
    >
      <box flexDirection="row" paddingLeft={2} height={1}>
        <text fg={colors.textMuted} height={1}>
          PROVIDER LIMITS {focused ? "(←→ navigate, Tab exit)" : ""}
        </text>
      </box>
      <box flexDirection="row" gap={2} overflow="hidden" height={1} paddingLeft={2}>
        {showLeftArrow && (
          <text fg={colors.primary} height={1}>
            ◀
          </text>
        )}
        {shown.map((p, idx) => (
          <LimitGauge
            key={p.id}
            label={p.name}
            usedPercent={p.usedPercent}
            color={p.color}
            {...(p.error ? { error: p.error } : {})}
            {...(p.errorCategory ? { errorCategory: p.errorCategory } : {})}
            {...(p.resetTime ? { resetTime: p.resetTime } : {})}
            labelWidth={12}
            barWidth={10}
            selected={focused && startIndex + idx === safeSelectedIndex}
            warningThreshold={warningThreshold}
            criticalThreshold={criticalThreshold}
          />
        ))}
        {showRightArrow && (
          <text fg={colors.primary} height={1}>
            ▶
          </text>
        )}
      </box>
    </box>
  );
}
