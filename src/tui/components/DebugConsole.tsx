import { useColors } from '../contexts/ThemeContext.tsx';
import { useLogs, type LogEntry, type LogLevel } from '../contexts/LogContext.tsx';
import { copyToClipboard } from '@/utils/clipboard.ts';

interface DebugConsoleProps {
  height?: number;
}

export function DebugConsole({ height = 15 }: DebugConsoleProps) {
  const colors = useColors();
  const { logs } = useLogs();

  const levelColors: Record<LogLevel, string> = {
    debug: colors.textSubtle,
    info: colors.info,
    warn: colors.warning,
    error: colors.error,
  };

  const levelLabels: Record<LogLevel, string> = {
    debug: 'DBG',
    info: 'INF',
    warn: 'WRN',
    error: 'ERR',
  };

  const visibleLogs = logs.slice(-50);

  return (
    <box
      flexDirection="column"
      height={height}
      borderStyle="single"
      borderColor={colors.border}
      backgroundColor={colors.background}
    >
      <box
        flexDirection="row"
        justifyContent="space-between"
        paddingLeft={1}
        paddingRight={1}
        backgroundColor={colors.foreground}
      >
        <text>
          <span fg={colors.primary}>
            <strong>Debug Console</strong>
          </span>
          <span fg={colors.textMuted}> ({logs.length} entries)</span>
        </text>
        <text fg={colors.textSubtle}>ESC:close c:clear x:export y:copy</text>
      </box>

      <scrollbox
        focused
        style={{
          rootOptions: { backgroundColor: colors.background },
          viewportOptions: { backgroundColor: colors.background },
          scrollbarOptions: {
            trackOptions: {
              foregroundColor: colors.textSubtle,
              backgroundColor: colors.background,
            },
          },
        }}
      >
        <box flexDirection="column" padding={1}>
          {visibleLogs.length === 0 ? (
            <text fg={colors.textSubtle}>No logs yet. Actions will appear here.</text>
          ) : (
            visibleLogs.map((entry) => (
              <LogLine key={entry.id} entry={entry} levelColors={levelColors} levelLabels={levelLabels} colors={colors} />
            ))
          )}
        </box>
      </scrollbox>
    </box>
  );
}

interface LogLineProps {
  entry: LogEntry;
  levelColors: Record<LogLevel, string>;
  levelLabels: Record<LogLevel, string>;
  colors: ReturnType<typeof useColors>;
}

function LogLine({ entry, levelColors, levelLabels, colors }: LogLineProps) {
  const time = new Date(entry.timestamp).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const levelColor = levelColors[entry.level];
  const levelLabel = levelLabels[entry.level];

  const source = entry.source ? `[${entry.source}]` : '';
  const dataStr = entry.data ? ` ${JSON.stringify(entry.data)}` : '';

  return (
    <text>
      <span fg={colors.textSubtle}>{time}</span>
      {' '}
      <span fg={levelColor}>{levelLabel}</span>
      {' '}
      {source && <span fg={colors.textMuted}>{source} </span>}
      <span fg={colors.text}>{entry.message}</span>
      {dataStr && <span fg={colors.textSubtle}>{dataStr}</span>}
    </text>
  );
}

export async function copyLogsToClipboard(logs: LogEntry[]): Promise<void> {
  const lines = logs.map((entry) => {
    const time = new Date(entry.timestamp).toISOString();
    const src = entry.source ? `[${entry.source}]` : '';
    const dataStr = entry.data ? ` ${JSON.stringify(entry.data)}` : '';
    return `${time} ${entry.level.toUpperCase().padEnd(5)} ${src} ${entry.message}${dataStr}`;
  });
  await copyToClipboard(lines.join('\n'));
}
