import { useColors } from '../contexts/ThemeContext.tsx';

interface UsageGaugeProps {
  label: string;
  usedPercent: number | null;
  windowLabel?: string;
  resetsAt?: number;
  width?: number;
  color?: string;
}

export function UsageGauge({
  label,
  usedPercent,
  windowLabel,
  resetsAt,
  width = 40,
  color,
}: UsageGaugeProps) {
  const colors = useColors();
  const providerColor = color ?? colors.primary;

  const percent = usedPercent ?? 0;
  const barWidth = Math.max(0, width - 10);
  const filledWidth = Math.round((percent / 100) * barWidth);
  const emptyWidth = barWidth - filledWidth;

  const fillColor = percent >= 90 ? colors.gaugeDanger :
                    percent >= 70 ? colors.gaugeWarning :
                    providerColor;

  const filledBar = '█'.repeat(filledWidth);
  const emptyBar = '░'.repeat(emptyWidth);

  const resetText = resetsAt ? formatResetTime(resetsAt) : '';

  return (
    <box flexDirection="column" width={width}>
      <box flexDirection="row" justifyContent="space-between">
        <text>
          <span fg={providerColor}>
            <strong>{label}</strong>
          </span>
        </text>
        <text fg={colors.textMuted}>
          {usedPercent !== null ? `${Math.round(percent)}%` : '--'}
        </text>
      </box>
      <box flexDirection="row">
        <text>
          <span fg={fillColor}>{filledBar}</span>
          <span fg={colors.gaugeBackground}>{emptyBar}</span>
        </text>
      </box>
      {(windowLabel || resetText) && (
        <text fg={colors.textSubtle}>
          {windowLabel}
          {windowLabel && resetText ? ' · ' : ''}
          {resetText}
        </text>
      )}
    </box>
  );
}

function formatResetTime(timestamp: number): string {
  const now = Date.now();
  const diff = timestamp - now;

  if (diff <= 0) return 'resets soon';

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `resets in ${days}d ${hours % 24}h`;
  }
  if (hours > 0) {
    return `resets in ${hours}h ${minutes % 60}m`;
  }
  return `resets in ${minutes}m`;
}
