import type { ReactNode } from 'react';
import { useColors } from '../contexts/ThemeContext.tsx';
import { usePulse } from '../hooks/usePulse.ts';

interface LimitGaugeProps {
  label: string;
  usedPercent: number | null;
  color: string;
  ghost?: boolean;
  error?: string;
  resetTime?: string;
  compact?: boolean;
  labelWidth?: number;
  barWidth?: number;
  selected?: boolean;
  warningThreshold?: number;
  criticalThreshold?: number;
}

const FRACTIONAL_BLOCKS = [' ', '▏', '▎', '▍', '▌', '▋', '▊', '▉', '█'];

function renderFractionalBar(percent: number, width: number, filledColor: string, emptyColor: string): ReactNode[] {
  const totalSegments = width * 8;
  const filledSegments = Math.round((percent / 100) * totalSegments);
  const fullBlocks = Math.floor(filledSegments / 8);
  const remainder = filledSegments % 8;
  const emptyBlocks = width - fullBlocks - (remainder > 0 ? 1 : 0);
  
  const elements: ReactNode[] = [];
  
  if (fullBlocks > 0) {
    elements.push(<span key="full" fg={filledColor}>{'█'.repeat(fullBlocks)}</span>);
  }
  
  if (remainder > 0) {
    elements.push(<span key="partial" fg={filledColor}>{FRACTIONAL_BLOCKS[remainder]}</span>);
  }
  
  if (emptyBlocks > 0) {
    elements.push(<span key="empty" fg={emptyColor}>{'─'.repeat(emptyBlocks)}</span>);
  }
  
  return elements;
}

function interpolatePulseColor(intensity: number, baseColor: string, dimColor: string): string {
  const dimAmount = 0.4;
  const t = intensity * dimAmount;
  
  const parseHex = (hex: string) => {
    const h = hex.replace('#', '');
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
  
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

export function LimitGauge({ 
  label, 
  usedPercent, 
  color,
  ghost = false,
  error,
  resetTime,
  compact = false,
  labelWidth = 12,
  barWidth = 10,
  selected = false,
  warningThreshold = 90,
  criticalThreshold = 95,
}: LimitGaugeProps) {
  const colors = useColors();
  
  const percent = usedPercent ?? 0;
  const isCritical = percent >= criticalThreshold;
  const isWarning = percent >= warningThreshold && percent < criticalThreshold;
  
  // Critical: fast, intense pulse (80ms interval)
  // Warning: moderate pulse (200ms interval) to draw attention
  const criticalPulseStep = usePulse({ enabled: isCritical, intervalMs: 80 });
  const warningPulseStep = usePulse({ enabled: isWarning, intervalMs: 200 });
  
  const pulseIntensity = isCritical 
    ? Math.abs(Math.sin(criticalPulseStep * 0.3)) 
    : isWarning 
      ? Math.abs(Math.sin(warningPulseStep * 0.25))
      : 0;
  
  const truncateLabel = (lbl: string, maxLen: number): string => {
    if (lbl.length <= maxLen) return lbl.padEnd(maxLen);
    return lbl.slice(0, maxLen - 1) + '…';
  };
  
  if (compact) {
    const shortLabel = truncateLabel(label, 10);
    const percentStr = usedPercent !== null ? `${Math.round(percent)}%` : '--';
    const statusIcon = isCritical ? '!!' : isWarning ? '!' : '';
    const statusColor = isCritical ? colors.error : isWarning ? color : colors.textMuted;
    const textColor = isCritical ? colors.error : isWarning ? color : colors.text;
    
    return (
      <text height={1}>
        {selected && <span fg={colors.primary}>▌</span>}
        <span fg={selected ? colors.text : textColor}>{shortLabel}</span>
        <span fg={statusColor}> {percentStr}</span>
        {statusIcon && <span fg={statusColor}> {statusIcon}</span>}
      </text>
    );
  }
  
  if (ghost) {
    const ghostLabel = truncateLabel(label, labelWidth);
    return (
      <box height={1} overflow="hidden">
        <text height={1}>
          <span fg={colors.textSubtle}>○ </span>
          <span fg={colors.textSubtle}>{ghostLabel} </span>
          <span fg={colors.textSubtle}>{'─'.repeat(barWidth)}</span>
          <span fg={colors.textSubtle}>  --</span>
        </text>
      </box>
    );
  }
  
  if (error) {
    const displayLabel = truncateLabel(label, labelWidth);
    const errorIcon = selected ? '▌' : '✗';
    return (
      <box height={1} overflow="hidden" {...(selected ? { backgroundColor: colors.borderMuted } : {})}>
        <text height={1}>
          <span fg={selected ? colors.primary : colors.error}>{errorIcon} </span>
          <span fg={selected ? colors.text : colors.text}>{displayLabel} </span>
          <span fg={colors.error}>{'─'.repeat(barWidth)}</span>
          <span fg={colors.error}> ERR</span>
        </text>
      </box>
    );
  }
  
  const barColor = isCritical 
    ? interpolatePulseColor(pulseIntensity, colors.error, colors.background)
    : isWarning 
      ? interpolatePulseColor(pulseIntensity, color, colors.background)
      : color;
  
  const statusIcon = isCritical ? '!!' : isWarning ? '!' : '●';
  const statusColor = isCritical ? colors.error : isWarning ? color : colors.success;
  
  const displayLabel = truncateLabel(label, labelWidth);
  const percentStr = usedPercent !== null ? `${Math.round(percent)}%`.padStart(4) : '  --';
  
  const percentDisplay = isCritical ? (
    <span fg={colors.background} bg={colors.error}>{percentStr}</span>
  ) : (
    <span fg={isWarning ? color : colors.textMuted}>{percentStr}</span>
  );
  
  const resetDisplay = resetTime ? (
    <span fg={colors.textSubtle}> {resetTime}</span>
  ) : null;
  
  const selectionIndicator = selected ? '▌' : statusIcon;
  
  return (
    <box height={1} overflow="hidden" {...(selected ? { backgroundColor: colors.borderMuted } : {})}>
      <text height={1}>
        <span fg={selected ? colors.primary : statusColor}>{selectionIndicator} </span>
        <span fg={selected ? colors.text : (isCritical ? colors.error : isWarning ? color : colors.textMuted)}>{displayLabel} </span>
        {renderFractionalBar(percent, barWidth, barColor, colors.border)}
        {percentDisplay}
        {resetDisplay}
      </text>
    </box>
  );
}
