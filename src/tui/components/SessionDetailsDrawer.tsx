import { RGBA } from "@opentui/core";
import { useTerminalDimensions } from "@opentui/react";
import { useMemo } from "react";
import { getSessionActivityTimeline, isDatabaseInitialized } from "@/storage/index.ts";
import type { AgentSessionAggregate } from "../../agents/types.ts";
import { usePlugins } from "../contexts/PluginContext.tsx";
import { useColors } from "../contexts/ThemeContext.tsx";
import { getProviderColor } from "../utils/providerColor.ts";

const OVERLAY_BG = RGBA.fromValues(0.0, 0.0, 0.0, 0.5);

interface SessionDetailsDrawerProps {
  session: AgentSessionAggregate;
  onClose: () => void;
}

function formatTokens(count: number): string {
  if (count >= 1_000_000) return (count / 1_000_000).toFixed(1) + "M";
  if (count >= 1_000) return (count / 1_000).toFixed(1) + "K";
  return count.toString();
}

function formatCost(cost: number | undefined): string {
  if (cost === undefined) return "$0.00";
  if (cost < 0.01 && cost > 0) return "<$0.01";
  return "$" + cost.toFixed(2);
}

function formatDuration(startedAt: number, lastActivityAt: number): string {
  const ms = lastActivityAt - startedAt;
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function formatTimelineLabel(timestamp: number, isMultiDay: boolean): string {
  const date = new Date(timestamp);
  if (isMultiDay) {
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  }
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const SPARK_CHARS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];

function buildSparkline(values: number[], width: number): string {
  if (values.length === 0 || width <= 0) return "·".repeat(Math.max(width, 1));

  const bucketSize = Math.ceil(values.length / width);
  const buckets: number[] = [];

  for (let i = 0; i < width; i++) {
    const start = i * bucketSize;
    const end = Math.min(start + bucketSize, values.length);
    const slice = values.slice(start, end);
    buckets.push(slice.length > 0 ? slice.reduce((a, b) => a + b, 0) : 0);
  }

  const maxVal = Math.max(...buckets, 1);

  return buckets
    .map((v) => {
      if (v === 0) return "·";
      const idx = Math.min(Math.floor((v / maxVal) * SPARK_CHARS.length), SPARK_CHARS.length - 1);
      return SPARK_CHARS[idx];
    })
    .join("");
}

function truncateMiddle(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  const side = Math.floor((maxLength - 1) / 2);
  return str.slice(0, side) + "…" + str.slice(-side);
}

function shortenPath(fullPath: string, maxLength: number): string {
  if (!fullPath) return "—";

  const normalized = fullPath.replace(/\\/g, "/");
  const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
  let path = normalized;

  if (home && normalized.startsWith(home)) {
    path = "~" + normalized.slice(home.length);
  }

  if (path.length <= maxLength) return path;

  const parts = path.split("/").filter(Boolean);
  if (parts.length <= 2) return truncateMiddle(path, maxLength);

  const first = parts[0];
  const last = parts[parts.length - 1];
  const secondLast = parts.length > 2 ? parts[parts.length - 2] : "";

  const shortened = secondLast ? `${first}/…/${secondLast}/${last}` : `${first}/…/${last}`;

  return shortened.length <= maxLength ? shortened : truncateMiddle(path, maxLength);
}

export function SessionDetailsDrawer({ session, onClose: _onClose }: SessionDetailsDrawerProps) {
  void _onClose;
  const colors = useColors();
  const { providers } = usePlugins();
  const { width: termWidth, height: termHeight } = useTerminalDimensions();

  const width = Math.max(70, Math.min(termWidth - 4, 100));
  const height = Math.max(24, Math.min(termHeight - 4, 40));
  const contentWidth = width - 4;

  const duration = formatDuration(session.startedAt, session.lastActivityAt);
  const projectName = session.projectPath?.split("/").pop() ?? "N/A";
  const fullPath = session.projectPath ?? "";

  const sparklineInnerWidth = Math.max(contentWidth - 6, 20);
  const sparkline = useMemo(() => {
    if (!isDatabaseInitialized()) return "·".repeat(sparklineInnerWidth);
    const activity = getSessionActivityTimeline(session.sessionId);
    if (activity.length === 0) return "·".repeat(sparklineInnerWidth);
    return buildSparkline(
      activity.map((a) => a.tokens),
      sparklineInnerWidth,
    );
  }, [session.sessionId, sparklineInnerWidth]);

  const cacheRead = session.totals.cacheRead ?? 0;
  const cacheWrite = session.totals.cacheWrite ?? 0;
  const hasCacheData = cacheRead > 0 || cacheWrite > 0;
  const totalInput = session.totals.input + cacheRead + cacheWrite;
  const cacheHitRate = totalInput > 0 ? Math.round((cacheRead / totalInput) * 100) : 0;

  const sessionCostBreakdown = useMemo(() => {
    let input = 0,
      output = 0,
      cr = 0,
      cw = 0;
    let hasAny = false;
    for (const stream of session.streams) {
      if (!stream.costBreakdown) continue;
      hasAny = true;
      input += stream.costBreakdown.input;
      output += stream.costBreakdown.output;
      cr += stream.costBreakdown.cacheRead ?? 0;
      cw += stream.costBreakdown.cacheWrite ?? 0;
    }
    if (!hasAny) return null;
    return {
      input,
      output,
      cacheRead: cr > 0 ? cr : undefined,
      cacheWrite: cw > 0 ? cw : undefined,
    };
  }, [session.streams]);

  const hasAnyLongContext = session.streams.some((s) => s.hasLongContext);
  const totalLongContextRequests = session.streams.reduce(
    (sum, s) => sum + (s.longContextRequestCount ?? 0),
    0,
  );
  const totalLongContextTokens = session.streams.reduce((sum, s) => {
    if (!s.longContextTokens) return sum;
    return sum + s.longContextTokens.input + s.longContextTokens.output;
  }, 0);

  const isMultiDay = session.lastActivityAt - session.startedAt > 24 * 60 * 60 * 1000;
  const startTimeStr = formatTimelineLabel(session.startedAt, isMultiDay);
  const endTimeStr = formatTimelineLabel(session.lastActivityAt, isMultiDay);
  const timeGap = Math.max(0, sparklineInnerWidth - startTimeStr.length - endTimeStr.length);
  const timelineLabel = startTimeStr + " ".repeat(timeGap) + endTimeStr;

  return (
    <box
      position="absolute"
      left={0}
      top={0}
      width="100%"
      height="100%"
      justifyContent="center"
      alignItems="center"
      zIndex={100}
      backgroundColor={OVERLAY_BG}
    >
      <box
        width={width}
        height={height}
        border
        borderStyle="double"
        borderColor={colors.primary}
        flexDirection="column"
        padding={1}
        backgroundColor={colors.background}
        overflow="hidden"
      >
        <box flexDirection="row" justifyContent="space-between" height={1} marginBottom={1}>
          <text height={1} fg={colors.primary}>
            <strong>SESSION DETAILS</strong>
          </text>
          <text height={1} fg={colors.textMuted}>
            [Esc] Close
          </text>
        </box>

        <box
          flexDirection="column"
          marginBottom={0}
          border
          borderStyle="single"
          borderColor={colors.border}
          paddingX={1}
          paddingY={0}
          flexShrink={0}
        >
          <box flexDirection="row" height={1} justifyContent="space-between" marginTop={0}>
            <text height={1} overflow="hidden">
              <span fg={colors.textMuted}>ID: </span>
              <span fg={colors.text}>
                <strong>{session.sessionId}</strong>
              </span>
            </text>
            <text height={1}>
              <span fg={colors.textMuted}>Status: </span>
              <span fg={session.status === "active" ? colors.success : colors.textMuted}>
                {session.status.toUpperCase()}
              </span>
            </text>
          </box>

          {session.sessionName && (
            <box flexDirection="row" height={1}>
              <text height={1} overflow="hidden">
                <span fg={colors.textMuted}>Name: </span>
                <span fg={colors.primary}>
                  <strong>{session.sessionName}</strong>
                </span>
              </text>
            </box>
          )}

          <box flexDirection="row" height={1} justifyContent="space-between">
            <text height={1} overflow="hidden">
              <span fg={colors.textMuted}>Agent: </span>
              <span fg={colors.text}>{session.agentName}</span>
            </text>
            <text height={1}>
              <span fg={colors.textMuted}>Project: </span>
              <span fg={colors.text}>
                <strong>{projectName}</strong>
              </span>
            </text>
          </box>

          <box flexDirection="row" height={1} marginBottom={0}>
            <text height={1} overflow="hidden" fg={colors.textMuted}>
              {shortenPath(fullPath, contentWidth - 4)}
            </text>
          </box>
        </box>

        <box
          flexDirection="column"
          marginBottom={0}
          border
          borderStyle="single"
          borderColor={colors.border}
          paddingX={1}
          paddingY={0}
          flexShrink={0}
        >
          <box flexDirection="row" height={1} justifyContent="space-between" marginTop={0}>
            <text height={1}>
              <span fg={colors.textMuted}>Cost: </span>
              <span fg={colors.success}>
                <strong>{formatCost(session.totalCostUsd)}</strong>
              </span>
            </text>
            <text height={1}>
              <span fg={colors.textMuted}>Duration: </span>
              <span fg={colors.text}>{duration}</span>
            </text>
          </box>

          {sessionCostBreakdown && (
            <box flexDirection="row" height={1} marginBottom={0}>
              <text height={1} overflow="hidden">
                <span fg={colors.textMuted}> </span>
                <span fg={colors.text}>In {formatCost(sessionCostBreakdown.input)}</span>
                <span fg={colors.textMuted}> │ </span>
                <span fg={colors.text}>Out {formatCost(sessionCostBreakdown.output)}</span>
                {(sessionCostBreakdown.cacheRead ?? 0) > 0 && (
                  <>
                    <span fg={colors.textMuted}> │ </span>
                    <span fg={colors.text}>Read {formatCost(sessionCostBreakdown.cacheRead)}</span>
                  </>
                )}
                {(sessionCostBreakdown.cacheWrite ?? 0) > 0 && (
                  <>
                    <span fg={colors.textMuted}> │ </span>
                    <span fg={colors.text}>
                      Write {formatCost(sessionCostBreakdown.cacheWrite)}
                    </span>
                  </>
                )}
              </text>
            </box>
          )}

          <box flexDirection="row" height={1} marginTop={0}>
            <text height={1}>
              <span fg={colors.textMuted}>Tokens: </span>
              <span fg={colors.text}>
                {formatTokens(session.totals.input + session.totals.output)}
              </span>
              <span fg={colors.textMuted}>
                {" "}
                (In: {formatTokens(session.totals.input)} / Out:{" "}
                {formatTokens(session.totals.output)})
              </span>
            </text>
          </box>

          {session.metadata?.isEstimated === true && (
            <box flexDirection="row" height={1} marginBottom={0}>
              <text height={1} overflow="hidden">
                <span fg={colors.warning}>
                  ≈ Token data is estimated — server enrichment pending
                </span>
              </text>
            </box>
          )}

          {hasCacheData && (
            <box flexDirection="row" height={1} marginBottom={0}>
              <text height={1} overflow="hidden">
                <span fg={colors.textMuted}>Cache: </span>
                <span fg={cacheHitRate >= 50 ? colors.success : colors.warning}>
                  {cacheHitRate}% hit
                </span>
                <span fg={colors.textMuted}>
                  {" "}
                  — {formatTokens(cacheRead)} read / {formatTokens(cacheWrite)} write
                </span>
              </text>
            </box>
          )}

          {hasAnyLongContext && (
            <box flexDirection="row" height={1} marginBottom={0}>
              <text height={1} overflow="hidden">
                <span fg={colors.warning}>↑ Long ctx: </span>
                <span fg={colors.text}>{totalLongContextRequests} reqs</span>
                <span fg={colors.textMuted}> · </span>
                <span fg={colors.text}>{formatTokens(totalLongContextTokens)} tokens</span>
                <span fg={colors.textMuted}> at tiered rate</span>
              </text>
            </box>
          )}
        </box>

        <box
          flexDirection="column"
          height={4}
          marginBottom={0}
          border
          borderColor={colors.border}
          paddingX={1}
          flexShrink={0}
        >
          <text height={1} fg={colors.primary} overflow="hidden">
            {sparkline}
          </text>
          <text height={1} fg={colors.textMuted} overflow="hidden">
            {timelineLabel}
          </text>
        </box>

        <box flexDirection="row" height={1} paddingLeft={1} paddingRight={2} marginBottom={0}>
          <box width={12}>
            <text fg={colors.primary}>
              <strong>PROVIDER</strong>
            </text>
          </box>
          <text flexGrow={1} fg={colors.primary}>
            <strong>MODEL</strong>
          </text>
          <box width={10} justifyContent="flex-end">
            <text fg={colors.primary}>
              <strong>TOKENS</strong>
            </text>
          </box>
          <box width={10} justifyContent="flex-end">
            <text fg={colors.primary}>
              <strong>COST</strong>
            </text>
          </box>
        </box>

        <box
          flexDirection="column"
          flexGrow={1}
          border
          borderColor={colors.border}
          overflow="hidden"
        >
          <scrollbox flexGrow={1}>
            {session.streams.map((stream, idx) => {
              const modelName = stream.modelId.split("/").pop() ?? stream.modelId;
              const providerName =
                stream.providerId.charAt(0).toUpperCase() + stream.providerId.slice(1);
              const providerColor = getProviderColor(
                stream.providerId,
                providers,
                colors.textMuted,
              );
              return (
                <box key={`${stream.modelId}-${idx}`} flexDirection="row" height={1} paddingX={1}>
                  <box width={12} height={1}>
                    <text height={1} fg={providerColor} overflow="hidden">
                      {truncateMiddle(providerName, 11)}
                    </text>
                  </box>
                  <text flexGrow={1} height={1} fg={colors.text} overflow="hidden">
                    {truncateMiddle(modelName, contentWidth - 37)}
                  </text>
                  <box width={10} height={1} justifyContent="flex-end">
                    <text fg={colors.textMuted}>
                      {formatTokens(
                        stream.tokens.input +
                          stream.tokens.output +
                          (stream.longContextTokens?.input ?? 0) +
                          (stream.longContextTokens?.output ?? 0),
                      )}
                    </text>
                  </box>
                  <box width={10} height={1} justifyContent="flex-end">
                    <text fg={colors.success}>{formatCost(stream.costUsd)}</text>
                    <text fg={colors.textMuted}>{stream.hasLongContext ? "↑" : " "}</text>
                  </box>
                </box>
              );
            })}
          </scrollbox>
        </box>
      </box>
    </box>
  );
}
