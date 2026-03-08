import type { ScrollBoxRenderable } from "@opentui/core";
import { useTerminalDimensions } from "@opentui/react";
import { forwardRef, memo, type Ref, useCallback, useRef } from "react";
import type { AgentSessionAggregate } from "../../agents/types.ts";
import { useColors } from "../contexts/ThemeContext.tsx";
import { useAnimatedValue } from "../hooks/useAnimatedValue.ts";
import { applyEntranceFade, useEntranceAnimation } from "../hooks/useEntranceAnimation.ts";
import { useExitAnimation } from "../hooks/useExitAnimation.ts";
import { interpolateColor, useValueFlash } from "../hooks/useValueFlash.ts";
import type { SortDirection, SortField } from "../types/sort.ts";
import { getSortDirectionIndicator, getSortFieldLabel } from "../types/sort.ts";

interface SessionsTableProps {
  sessions: AgentSessionAggregate[];
  selectedRow: number;
  isLoading: boolean;
  isFiltering: boolean;
  filterQuery: string;
  focusedPanel: "sessions" | "sidebar" | "limits";
  windowLabel: string;
  getProviderColor: (id: string) => string;
  sortField: SortField;
  sortDirection: SortDirection;
}

function extractRepoName(projectPath: string | null): string {
  if (!projectPath || projectPath === "—") return "—";
  const normalized = projectPath.replace(/\\/g, "/");
  return normalized.split("/").filter(Boolean).pop() ?? projectPath;
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return `${diffSec}s`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h`;
  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay}d`;
}

function formatDuration(startedAt: number, endedAt?: number): string {
  const end = endedAt ?? Date.now();
  const diffMs = end - startedAt;
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return `${diffSec}s`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h${diffMin % 60}m`;
  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay}d${diffHour % 24}h`;
}

function formatCost(costUsd: number): string {
  if (costUsd === 0) return "$0";
  if (costUsd < 0.01) return "$0.00";
  if (costUsd < 10) return `$${costUsd.toFixed(2)}`;
  if (costUsd < 100) return `$${costUsd.toFixed(1)}`;
  if (costUsd < 1000) return `$${Math.floor(costUsd)}`;
  return `$${(costUsd / 1000).toFixed(1)}k`;
}

function truncateMiddle(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  const side = Math.floor((maxLength - 1) / 2);
  return str.slice(0, side) + "…" + str.slice(-side);
}

function formatCostVal(cost: number): string {
  if (cost === 0) return "$0";
  if (cost < 0.01) return "<$0.01";
  if (cost < 10) return `$${cost.toFixed(2)}`;
  if (cost < 100) return `$${cost.toFixed(1)}`;
  if (cost < 1000) return `$${Math.round(cost)}`;
  return `$${(cost / 1000).toFixed(1)}k`;
}

function formatTokensCompact(val: number): string {
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(1)}K`;
  return `${val}`;
}

function formatCacheBadge(val: number): string {
  if (val >= 10_000_000) return `${Math.round(val / 1_000_000)}M`;
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 100_000) return `${Math.round(val / 1_000)}K`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(1)}K`;
  return `${val}`;
}

function getInspectorData(session: AgentSessionAggregate) {
  const cacheRead = session.totals.cacheRead ?? 0;
  const cacheWrite = session.totals.cacheWrite ?? 0;
  if (cacheRead === 0 && cacheWrite === 0) return null;

  let readCost = 0,
    writeCost = 0;
  for (const stream of session.streams) {
    if (!stream.costBreakdown) continue;
    readCost += stream.costBreakdown.cacheRead ?? 0;
    writeCost += stream.costBreakdown.cacheWrite ?? 0;
  }

  const costPerReq =
    session.requestCount > 0 ? (session.totalCostUsd ?? 0) / session.requestCount : 0;

  return { cacheRead, cacheWrite, readCost, writeCost, costPerReq };
}

interface SessionRowProps {
  session: AgentSessionAggregate;
  isSelected: boolean;
  isWide: boolean;
  nameMaxWidth: number;
  getProviderColor: (id: string) => string;
  isExiting?: boolean;
  exitIntensity?: number;
  skipEntrance?: boolean;
  terminalWidth: number;
}

function getActivityFadeColor(lastActivityAt: number, baseColor: string, dimColor: string): string {
  const secSinceActivity = (Date.now() - lastActivityAt) / 1000;
  if (secSinceActivity < 5) return baseColor;
  if (secSinceActivity > 60) return dimColor;
  const t = (secSinceActivity - 5) / 55;
  return interpolateColor(t, baseColor, dimColor);
}

const SessionRow = memo(function SessionRow({
  session,
  isSelected,
  isWide,
  nameMaxWidth,
  getProviderColor,
  isExiting,
  exitIntensity,
  skipEntrance,
  terminalWidth,
}: SessionRowProps) {
  const colors = useColors();
  const isActive = session.status === "active";
  const entranceIntensity = useEntranceAnimation({ durationMs: 500 });
  const skipRef = useRef(skipEntrance);
  const currentIntensity = isExiting
    ? (exitIntensity ?? 0)
    : skipRef.current
      ? 1
      : entranceIntensity;

  const effectiveTokens = session.totals.input + session.totals.output;
  const cacheRead = session.totals.cacheRead ?? 0;
  const hasCacheData = cacheRead > 0;
  const isEstimated = session.metadata?.isEstimated === true;
  const costUsd = session.totalCostUsd ?? 0;

  const animatedTokens = useAnimatedValue(effectiveTokens, { durationMs: 300, precision: 0 });
  const animatedCost = useAnimatedValue(costUsd, { durationMs: 300, precision: 4 });

  const { intensity: tokenFlash } = useValueFlash(effectiveTokens, {
    durationMs: 400,
    threshold: 10,
  });
  const { intensity: costFlash } = useValueFlash(costUsd, { durationMs: 400, threshold: 0.001 });

  const primaryStream = session.streams[0];
  const providerId = primaryStream?.providerId ?? "unknown";
  const modelId = primaryStream?.modelId ?? "unknown";
  const baseProviderColor = getProviderColor(providerId);
  const repoName = extractRepoName(session.projectPath ?? "—");
  // In wide mode, project is fixed width (14), so truncate to 13 chars + ellipsis if needed
  // In narrow mode, project is flex, so use nameMaxWidth (which is actually projectMaxWidth in narrow mode context)
  const projectDisplay = isWide
    ? repoName.length > 13
      ? repoName.slice(0, 12) + "…"
      : repoName.padEnd(13)
    : repoName.length > nameMaxWidth
      ? repoName.slice(0, nameMaxWidth - 1) + "…"
      : repoName;

  const dimColor = colors.background;
  const fade = (color: string) => applyEntranceFade(currentIntensity, color, dimColor);

  const baseStatusColor = isActive
    ? getActivityFadeColor(session.lastActivityAt, colors.success, colors.textMuted)
    : colors.textMuted;
  const statusColor = fade(baseStatusColor);

  const baseTokenColor = colors.text;
  const tokenColorBeforeFade =
    tokenFlash > 0 ? interpolateColor(tokenFlash, baseTokenColor, "#ffffff") : baseTokenColor;
  const tokenColor = fade(tokenColorBeforeFade);

  const providerColor = fade(baseProviderColor);
  const textColor = fade(colors.text);
  const textSubtleColor = fade(colors.textSubtle);
  const textMutedColor = fade(colors.textMuted);
  const baseCostColor = colors.warning;
  const costColorBeforeFade =
    costFlash > 0 ? interpolateColor(costFlash, baseCostColor, "#ffffff") : baseCostColor;
  const costColor = fade(costColorBeforeFade);

  const formatTokensVal = (val: number): string => {
    if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M`;
    if (val >= 1000) return `${(val / 1000).toFixed(1)}K`;
    return `${val}`;
  };

  const railChar = isSelected ? "▌" : " ";
  const railColor = fade(colors.primary);
  const rowBg = isSelected ? colors.borderMuted : undefined;

  const lastActivity = formatRelativeTime(session.lastActivityAt);
  const duration = formatDuration(session.startedAt, session.endedAt);
  const costDisplay = formatCost(animatedCost);

  const modelDisplay = modelId.split("/").pop()?.slice(0, 15) ?? modelId;
  const streamCount = session.streams.length;
  const modelWithCount =
    streamCount > 1 ? `${modelDisplay.slice(0, 12)}+${streamCount - 1}` : modelDisplay;

  const baseLastColor = isActive
    ? getActivityFadeColor(session.lastActivityAt, colors.text, colors.textMuted)
    : colors.textMuted;
  const lastColor = fade(baseLastColor);

  const bgProp = rowBg ? { bg: rowBg } : {};

  const sessionIdShort = session.sessionId.slice(-7);
  // In wide mode, name is flex, so use nameMaxWidth
  // In narrow mode, name is not shown
  const sessionNameDisplay = session.sessionName
    ? truncateMiddle(session.sessionName, isWide ? nameMaxWidth : 25)
    : "—";

  if (isWide) {
    return (
      <box
        flexDirection="row"
        paddingRight={1}
        height={1}
        gap={1}
        {...(rowBg ? { backgroundColor: rowBg } : {})}
      >
        <text width={2} height={1} fg={railColor} {...bgProp}>
          {railChar}
        </text>
        <text width={8} height={1} fg={textMutedColor} {...bgProp}>
          {sessionIdShort}
        </text>
        <text width={12} height={1} fg={isSelected ? textColor : textSubtleColor} {...bgProp}>
          {session.agentName.padEnd(11)}
        </text>
        <text width={18} height={1} fg={providerColor} {...bgProp}>
          {modelWithCount.padEnd(17)}
        </text>
        <text width={5} height={1} fg={textMutedColor} {...bgProp}>
          {String(session.requestCount).padStart(4)}
        </text>
        <text width={14} height={1} {...bgProp}>
          <span fg={tokenColor}>
            {isEstimated ? "≈" : " "}
            {formatTokensVal(animatedTokens).padStart(7)}
          </span>
          <span fg={colors.textMuted}>
            {hasCacheData ? ` ↯${formatCacheBadge(cacheRead)}` : ""}
          </span>
        </text>
        <text width={8} height={1} fg={costColor} {...bgProp}>
          {costDisplay.padStart(7)}
        </text>
        <text width={14} height={1} fg={textSubtleColor} {...bgProp}>
          {projectDisplay}
        </text>
        <text flexGrow={1} height={1} fg={textMutedColor} {...bgProp}>
          {sessionNameDisplay}
        </text>
        <text width={6} height={1} fg={textMutedColor} {...bgProp}>
          {duration.padStart(5)}
        </text>
        <text width={5} height={1} fg={lastColor} {...bgProp}>
          {lastActivity.padStart(4)}
        </text>
        <text width={2} height={1} fg={statusColor} {...bgProp}>
          {isActive ? "●" : "○"}
        </text>
      </box>
    );
  }

  const showCacheBadge = terminalWidth >= 105;
  const hasSidebar = terminalWidth >= 85;
  const isTight = !isWide && hasSidebar && terminalWidth < 105;
  const narrowModelW = isTight ? 13 : 16;
  const narrowTokenW = isTight ? 9 : 14;
  const narrowModelMaxChars = narrowModelW - 1;

  return (
    <box
      flexDirection="row"
      paddingRight={1}
      height={1}
      {...(rowBg ? { backgroundColor: rowBg } : {})}
    >
      <text width={2} height={1} fg={railColor} {...bgProp}>
        {railChar}
      </text>
      <text width={9} height={1} fg={isSelected ? textColor : textSubtleColor} {...bgProp}>
        {session.agentName.length > 8
          ? session.agentName.slice(0, 8) + "…"
          : session.agentName.padEnd(8)}
      </text>
      <text width={narrowModelW} height={1} fg={providerColor} {...bgProp}>
        {modelWithCount.length > narrowModelMaxChars
          ? modelWithCount.slice(0, narrowModelMaxChars - 1) + "…"
          : modelWithCount.padEnd(narrowModelMaxChars)}
      </text>
      <text width={narrowTokenW} height={1} {...bgProp}>
        <span fg={tokenColor}>
          {isEstimated ? "≈" : " "}
          {formatTokensVal(animatedTokens).padStart(7)}
        </span>
        <span fg={colors.textMuted}>
          {hasCacheData && showCacheBadge ? ` ↯${formatCacheBadge(cacheRead)}` : ""}
        </span>
      </text>
      <text width={7} height={1} fg={costColor} {...bgProp}>
        {formatCostVal(costUsd).padStart(6)}
      </text>
      <text flexGrow={1} height={1} fg={textSubtleColor} {...bgProp}>
        {projectDisplay}
      </text>
      <text width={5} height={1} fg={lastColor} {...bgProp}>
        {lastActivity.padStart(4)}
      </text>
      <text width={2} height={1} fg={statusColor} {...bgProp}>
        {isActive ? "●" : "○"}
      </text>
    </box>
  );
});

const WIDE_THRESHOLD = 140;

export const SessionsTable = forwardRef(function SessionsTable(
  {
    sessions,
    selectedRow,
    isLoading,
    isFiltering,
    filterQuery,
    focusedPanel,
    windowLabel,
    getProviderColor,
    sortField,
    sortDirection,
  }: SessionsTableProps,
  ref: Ref<ScrollBoxRenderable>,
) {
  const colors = useColors();
  const { width: terminalWidth, height: terminalHeight } = useTerminalDimensions();
  const isWide = terminalWidth >= WIDE_THRESHOLD;

  // Compute max name column width dynamically based on terminal width.
  // Sidebar width depends on terminal width (see SmartSidebar.getSidebarWidth).
  // Table inner width = terminalWidth - sidebarWidth - borders(4) - outerMargins(2).
  // Name column = tableInnerWidth - fixedColumnsTotal.
  const sidebarW =
    terminalWidth >= 160
      ? 44
      : terminalWidth >= 140
        ? 40
        : terminalWidth >= 105
          ? 36
          : terminalWidth >= 95
            ? 32
            : terminalWidth >= 85
              ? 28
              : 0;
  const WIDE_FIXED = 106;
  const hasSidebar = sidebarW > 0;
  const isTight = !isWide && hasSidebar && terminalWidth < 105;
  const narrowFixed = isTight ? 49 : 57;
  const tableInner = terminalWidth - sidebarW - 6;
  const nameMaxWidth = isWide
    ? Math.max(8, tableInner - WIDE_FIXED)
    : Math.max(1, tableInner - narrowFixed);

  const getSessionKey = useCallback((s: AgentSessionAggregate) => s.sessionId, []);
  const { items: animatedSessions, isBulkChange } = useExitAnimation(sessions, {
    durationMs: 500,
    getKey: getSessionKey,
    bulkThreshold: 100,
  });

  let activeIndex = 0;
  const selectedSession = sessions[selectedRow] ?? null;
  const inspector = selectedSession ? getInspectorData(selectedSession) : null;

  // Sort indicator helpers for column headers
  const sortIndicator = (field: string) =>
    sortField === field ? (sortDirection === "desc" ? "▼" : "▲") : " ";
  const sortColor = (field: string) => (sortField === field ? colors.primary : colors.textMuted);

  return (
    <box
      flexDirection="column"
      flexGrow={2}
      border
      borderStyle={focusedPanel === "sessions" ? "double" : "single"}
      borderColor={focusedPanel === "sessions" ? colors.primary : colors.border}
      overflow="hidden"
    >
      <box
        flexDirection="row"
        paddingLeft={2}
        paddingRight={1}
        height={1}
        justifyContent="space-between"
        overflow="hidden"
      >
        <text height={1}>
          <span fg={colors.textMuted}>SESSIONS </span>
          <span fg={colors.primary}>
            Sort: {getSortFieldLabel(sortField)} {getSortDirectionIndicator(sortDirection)}
          </span>
          <span fg={colors.textMuted}>
            {filterQuery ? ` [${isFiltering ? "Filter: " : ""}${filterQuery}]` : ""}
            {isLoading ? " ⟳" : "  "}
          </span>
        </text>
        <text height={1} fg={colors.textMuted}>
          [{windowLabel}] {sessions.length} sessions
        </text>
      </box>

      {isWide ? (
        <box flexDirection="row" paddingRight={1} height={1} gap={1}>
          <text width={2} height={1} fg={colors.textMuted}>
            {" "}
          </text>
          <text width={8} height={1} fg={colors.textMuted}>
            ID{" "}
          </text>
          <text width={12} height={1} fg={sortColor("agent")}>
            AGENT{sortIndicator("agent")}
          </text>
          <text width={18} height={1} fg={colors.textMuted}>
            MODEL{" "}
          </text>
          <text width={5} height={1} fg={sortColor("requests")}>
            {sortIndicator("requests")}
            REQ{" "}
          </text>
          <text width={14} height={1} fg={sortColor("tokens")}>
            {sortIndicator("tokens")}
            TOKENS{" "}
          </text>
          <text width={8} height={1} fg={sortColor("cost")}>
            {sortIndicator("cost")}
            COST{" "}
          </text>
          <text width={14} height={1} fg={sortColor("project")}>
            PROJECT{sortIndicator("project")}
          </text>
          <text flexGrow={1} height={1} fg={colors.textMuted}>
            NAME
          </text>
          <text width={6} height={1} fg={sortColor("duration")}>
            {sortIndicator("duration")}
            DUR{" "}
          </text>
          <text width={5} height={1} fg={sortColor("time")}>
            LAST{sortIndicator("time")}
          </text>
          <text width={2} height={1} fg={colors.textMuted}>
            {" "}
          </text>
        </box>
      ) : (
        <box flexDirection="row" paddingRight={1} height={1}>
          <text width={2} height={1} fg={colors.textMuted}>
            {" "}
          </text>
          <text width={9} height={1} fg={sortColor("agent")}>
            AGENT{sortIndicator("agent")}
          </text>
          <text width={isTight ? 13 : 16} height={1} fg={colors.textMuted}>
            {isTight ? "MODEL        " : "MODEL           "}
          </text>
          <text width={isTight ? 9 : 14} height={1} fg={sortColor("tokens")}>
            {isTight
              ? `${sortIndicator("tokens")} TOKENS `
              : `${sortIndicator("tokens")}TOKENS        `}
          </text>
          <text width={7} height={1} fg={sortColor("cost")}>
            {sortIndicator("cost")}
            COST{" "}
          </text>
          <text flexGrow={1} height={1} fg={sortColor("project")}>
            {nameMaxWidth >= 7
              ? `PROJECT${sortIndicator("project")}`
              : nameMaxWidth >= 4
                ? "PROJ"
                : ""}
          </text>
          <text width={5} height={1} fg={sortColor("time")}>
            LAST{sortIndicator("time")}
          </text>
          <text width={2} height={1} fg={colors.textMuted}>
            {" "}
          </text>
        </box>
      )}

      <scrollbox ref={ref} flexGrow={1}>
        <box flexDirection="column" flexGrow={1}>
          {sessions.length === 0 && animatedSessions.length === 0 && (
            <box paddingLeft={2}>
              <text fg={colors.textMuted}>
                {isLoading ? "Loading sessions..." : "No sessions found"}
              </text>
            </box>
          )}
          {animatedSessions.map((entry) => {
            const isSelectedRow = !entry.isExiting && activeIndex++ === selectedRow;
            return (
              <SessionRow
                key={entry.item.sessionId}
                session={entry.item}
                isSelected={isSelectedRow}
                isWide={isWide}
                nameMaxWidth={nameMaxWidth}
                getProviderColor={getProviderColor}
                isExiting={entry.isExiting}
                exitIntensity={entry.exitIntensity}
                skipEntrance={isBulkChange}
                terminalWidth={terminalWidth}
              />
            );
          })}
        </box>
      </scrollbox>
      {terminalHeight >= 30 && (
        <box height={1} paddingX={2} flexShrink={0}>
          {inspector && focusedPanel === "sessions" ? (
            <text height={1} overflow="hidden">
              <span fg={colors.textMuted}>↯ Cache read </span>
              <span fg={colors.text}>{formatTokensCompact(inspector.cacheRead)}</span>
              <span fg={colors.textMuted}> (</span>
              <span fg={colors.warning}>{formatCostVal(inspector.readCost)}</span>
              <span fg={colors.textMuted}>)</span>
              {inspector.cacheWrite > 0 && (
                <>
                  <span fg={colors.textMuted}> • Write </span>
                  <span fg={colors.text}>{formatTokensCompact(inspector.cacheWrite)}</span>
                  <span fg={colors.textMuted}> (</span>
                  <span fg={colors.warning}>{formatCostVal(inspector.writeCost)}</span>
                  <span fg={colors.textMuted}>)</span>
                </>
              )}
              <span fg={colors.textMuted}> • $/req </span>
              <span fg={colors.warning}>{formatCostVal(inspector.costPerReq)}</span>
            </text>
          ) : (
            <text height={1}> </text>
          )}
        </box>
      )}
    </box>
  );
});
