import { useColors } from '../contexts/ThemeContext.tsx';

export interface SparklineProps {
  data: number[];
  width?: number;
  label?: string;
  fixedMax?: number;
  thresholds?: { warning: number; error: number };
}

export function Sparkline({ 
  data, 
  width = 60, 
  label, 
  fixedMax = 2000,
  thresholds = { warning: 800, error: 2000 },
}: SparklineProps) {
  const colors = useColors();
  const chars = ['▁', '▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
  
  const peak = Math.max(...data);
  const normalized = data.map(v => {
    if (v <= 0) return 0;
    return Math.min(8, Math.max(1, Math.floor((v / fixedMax) * 8)));
  });
  
  const displayData = normalized.slice(-width);
  const padding = width - displayData.length;
  
  const groups: { color: string; chars: string }[] = [];
  for (let i = 0; i < displayData.length; i++) {
    const v = displayData[i] ?? 0;
    const rawValue = data[data.length - displayData.length + i] ?? 0;
    
    let color: string;
    if (rawValue <= 0) {
      color = colors.textSubtle;
    } else if (rawValue >= thresholds.error) {
      color = colors.error;
    } else if (rawValue >= thresholds.warning) {
      color = colors.warning;
    } else {
      color = colors.success;
    }
    
    const char = rawValue <= 0 ? '·' : (chars[v] ?? '▁');
    if (groups.length > 0 && groups[groups.length - 1]!.color === color) {
      groups[groups.length - 1]!.chars += char;
    } else {
      groups.push({ color, chars: char });
    }
  }
  
  const peakLabel = peak >= 1000 ? `${(peak/1000).toFixed(1)}k` : `${Math.round(peak)}`;
  
  return (
    <box flexDirection="column">
      <text>
        {padding > 0 && <span>{' '.repeat(padding)}</span>}
        {groups.map((group, i) => (
          <span key={i} fg={group.color}>{group.chars}</span>
        ))}
      </text>
      {label && <text fg={colors.textMuted}>{label} peak:{peakLabel}</text>}
    </box>
  );
}
