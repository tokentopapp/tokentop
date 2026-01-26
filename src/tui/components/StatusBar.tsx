import { useState, useEffect } from 'react';
import { useColors } from '../contexts/ThemeContext.tsx';

interface StatusBarProps {
  lastRefresh?: number;
  nextRefresh?: number;
  message?: string;
  demoMode?: boolean;
}

export function StatusBar({ lastRefresh, nextRefresh, message, demoMode = false }: StatusBarProps) {
  const colors = useColors();
  const [, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const lastRefreshText = lastRefresh
    ? `Last: ${formatTime(lastRefresh)}`
    : '';

  const nextRefreshText = nextRefresh
    ? `Next: ${formatCountdown(nextRefresh)}`
    : '';

  return (
    <box
      flexDirection="row"
      justifyContent="space-between"
      paddingLeft={1}
      paddingRight={1}
      backgroundColor={colors.foreground}
      flexShrink={0}
      height={1}
    >
      <text fg={colors.textMuted}>
        {demoMode ? 'tokentop - DEMO MODE' : (message ?? 'tokentop - htop for AI usage')}
      </text>
      <box flexDirection="row" gap={2}>
        {lastRefreshText && <text fg={colors.textSubtle}>{lastRefreshText}</text>}
        {nextRefreshText && <text fg={colors.textSubtle}>{nextRefreshText}</text>}
      </box>
    </box>
  );
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
