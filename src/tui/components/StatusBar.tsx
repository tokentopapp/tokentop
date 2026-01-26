import { useState, useEffect } from 'react';
import { useTerminalDimensions } from '@opentui/react';
import { useColors } from '../contexts/ThemeContext.tsx';
import { useTimeWindow } from '../contexts/TimeWindowContext.tsx';

interface StatusBarProps {
  lastRefresh?: number;
  nextRefresh?: number;
  demoMode?: boolean;
}

export function StatusBar({ lastRefresh, nextRefresh, demoMode = false }: StatusBarProps) {
  const colors = useColors();
  const { width: termWidth } = useTerminalDimensions();
  const { window: timeWindow } = useTimeWindow();
  const [, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const isNarrow = termWidth < 100;

  const lastRefreshText = lastRefresh
    ? (isNarrow ? formatTimeShort(lastRefresh) : formatTime(lastRefresh))
    : '';

  const nextRefreshText = nextRefresh
    ? `${formatCountdown(nextRefresh)}`
    : '';

  const timeLabel = timeWindow.toUpperCase();

  return (
    <box
      flexDirection="row"
      justifyContent="space-between"
      paddingLeft={1}
      paddingRight={1}
      backgroundColor={colors.foreground}
      flexShrink={0}
      height={1}
      overflow="hidden"
    >
      <box flexDirection="row" gap={2} overflow="hidden">
        <text fg={colors.textSubtle}>1-4 views</text>
        <text fg={colors.text}>
          <span fg={colors.textSubtle}>t</span> <span fg={colors.info}>{timeLabel}</span>
        </text>
        <text fg={colors.textSubtle}>, settings</text>
        <text fg={colors.textSubtle}>: cmd</text>
        <text fg={colors.textSubtle}>? help</text>
      </box>
      <box flexDirection="row" gap={2} overflow="hidden">
        {demoMode && <text fg={colors.warning}>{isNarrow ? 'DEMO' : 'DEMO MODE'}</text>}
        {lastRefreshText && <text fg={colors.textSubtle}>{lastRefreshText}</text>}
        {nextRefreshText && <text fg={colors.textSubtle}>{nextRefreshText}</text>}
      </box>
    </box>
  );
}

function formatTimeShort(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function formatCountdown(timestamp: number): string {
  const now = Date.now();
  const diff = timestamp - now;

  if (diff <= 0) return 'now';

  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}
