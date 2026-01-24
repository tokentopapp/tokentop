import { useColors } from '../contexts/ThemeContext.tsx';

interface LimitGaugeProps {
  label: string;
  usedPercent: number | null;
  color: string;
  ghost?: boolean;
  error?: string;
}

export function LimitGauge({ 
  label, 
  usedPercent, 
  color,
  ghost = false,
  error,
}: LimitGaugeProps) {
  const colors = useColors();
  const barWidth = 10;
  
  if (ghost) {
    const ghostLabel = label.length > 10 ? label.slice(0, 9) + '…' : label.padEnd(10);
    return (
      <box width={30} overflow="hidden">
        <text>
          <span fg={colors.textSubtle}> ○ </span>
          <span fg={colors.textSubtle}>{ghostLabel} </span>
          <span fg={colors.textSubtle}>{'·'.repeat(barWidth)}</span>
          <span fg={colors.textSubtle}> N/A</span>
        </text>
      </box>
    );
  }
  
  if (error) {
    const displayLabel = label.length > 10 ? label.slice(0, 9) + '…' : label.padEnd(10);
    return (
      <box width={30} overflow="hidden">
        <text>
          <span fg={colors.error}> ✗ </span>
          <span fg={colors.text}>{displayLabel} </span>
          <span fg={colors.error}>{'·'.repeat(barWidth)}</span>
          <span fg={colors.error}> ERR</span>
        </text>
      </box>
    );
  }
  
  const percent = usedPercent ?? 0;
  const filled = Math.min(barWidth, Math.round((percent / 100) * barWidth));
  const empty = barWidth - filled;
  
  const isCritical = percent >= 95;
  const isWarning = percent >= 80;
  
  const barColor = isCritical ? colors.error : isWarning ? colors.warning : color;
  const statusIcon = isCritical ? '!!' : isWarning ? ' !' : ' ●';
  const statusColor = isCritical ? colors.error : isWarning ? colors.warning : colors.success;
  
  const displayLabel = label.length > 10 ? label.slice(0, 9) + '…' : label.padEnd(10);
  const percentStr = usedPercent !== null ? `${Math.round(percent)}%`.padStart(3) : ' --';
  
  return (
    <box width={30} overflow="hidden">
      <text>
        <span fg={statusColor}>{statusIcon} </span>
        <span fg={colors.textMuted}>{displayLabel} </span>
        <span fg={barColor}>{'█'.repeat(filled)}</span>
        <span fg={colors.textSubtle}>{'·'.repeat(empty)}</span>
        <span fg={isCritical ? colors.error : colors.textMuted}> {percentStr}</span>
      </text>
    </box>
  );
}
