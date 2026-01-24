import { useState, useMemo } from 'react';
import { useKeyboard } from '@opentui/react';
import { useColors } from '../contexts/ThemeContext.tsx';

type TimePeriod = '7d' | '30d' | '90d';

interface ChartPoint {
  label: string;
  value: number;
}

const generateMockData = (period: TimePeriod): ChartPoint[] => {
  const points: ChartPoint[] = [];
  const now = new Date();
  
  let count = 7;
  if (period === '30d') count = 30;
  if (period === '90d') count = 90;

  let baseValue = 20 + Math.random() * 10;

  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    
    const change = (Math.random() - 0.5) * 10;
    baseValue = Math.max(5, Math.min(100, baseValue + change));

    let label = '';
    if (period === '7d') {
      label = d.toLocaleDateString('en-US', { weekday: 'short' });
    } else if (period === '30d') {
      label = i % 5 === 0 ? d.getDate().toString() : ''; 
    } else {
      label = i % 15 === 0 ? `${d.getMonth()+1}/${d.getDate()}` : '';
    }

    points.push({ label, value: baseValue });
  }
  return points;
};

// Symbols for rounded step chart
// Up step: ─╯ (at y1) ... ╭─ (at y2)
// Down step: ─╮ (at y1) ... ╰─ (at y2)
const CHARS = {
  h: '─',
  v: '│',
  tl: '╭',
  tr: '╮',
  bl: '╰',
  br: '╯',
  cross: '┼',
  t_l: '┤',
};

interface ChartProps {
  data: ChartPoint[];
  height: number;
  width: number;
  color: string;
  labelColor: string;
  gridColor: string;
}

const AsciiChart = ({ data, height, width, color, labelColor, gridColor }: ChartProps) => {
  const chartHeight = height - 2; 
  const chartWidth = width - 6;   

  const values = data.map(d => d.value);
  const minVal = 0; 
  const maxVal = Math.max(...values, 10) * 1.1; 

  // Normalize values to grid rows (0 to chartHeight-1)
  const normalize = (v: number) => {
    return Math.min(
      chartHeight - 1,
      Math.max(0, Math.floor(((v - minVal) / (maxVal - minVal)) * chartHeight))
    );
  };

  const normalizedValues = values.map(normalize);
  
  const grid: string[][] = Array.from({ length: chartHeight }, () => 
    Array(chartWidth).fill(' ')
  );

  // Plotting logic: Step chart with rounded corners
  const stepsPerPoint = chartWidth / (data.length - 1);

  let currentX = 0;
  
  for (let i = 0; i < data.length - 1; i++) {
    const y1 = normalizedValues[i] ?? 0;
    const y2 = normalizedValues[i + 1] ?? 0;
    
    const xStart = Math.round(currentX);
    const xEnd = Math.round(currentX + stepsPerPoint);
    const xMid = Math.floor((xStart + xEnd) / 2);

    for (let x = xStart; x < xMid; x++) {
      if (x < chartWidth && grid[y1]) grid[y1][x] = CHARS.h;
    }

    if (y2 > y1) {
      if (xMid < chartWidth && grid[y1]) grid[y1][xMid] = CHARS.br; 
      for (let y = y1 + 1; y < y2; y++) {
        const row = grid[y];
        if (xMid < chartWidth && row) row[xMid] = CHARS.v; 
      }
      if (xMid < chartWidth && grid[y2]) grid[y2][xMid] = CHARS.tl; 
    } else if (y2 < y1) {
      if (xMid < chartWidth && grid[y1]) grid[y1][xMid] = CHARS.tr; 
      for (let y = y1 - 1; y > y2; y--) {
        const row = grid[y];
        if (xMid < chartWidth && row) row[xMid] = CHARS.v; 
      }
      if (xMid < chartWidth && grid[y2]) grid[y2][xMid] = CHARS.bl; 
    } else {
       if (xMid < chartWidth && grid[y1]) grid[y1][xMid] = CHARS.h;
    }

    for (let x = xMid + 1; x < xEnd; x++) {
       if (x < chartWidth && grid[y2]) grid[y2][x] = CHARS.h;
    }

    currentX += stepsPerPoint;
  }
  
  const lastY = normalizedValues[data.length - 1] ?? 0;
  const lastX = Math.round(currentX);
  if (lastX < chartWidth && grid[lastY]) {
      grid[lastY][lastX] = CHARS.h;
  }

  const rows = [];
  for (let r = chartHeight - 1; r >= 0; r--) {
    const rowVal = minVal + (r / (chartHeight - 1)) * (maxVal - minVal);
    const label = r === 0 || r === chartHeight - 1 || r === Math.floor(chartHeight/2) 
      ? `$${Math.round(rowVal)}`.padStart(4) 
      : '    ';
    
    const sep = r === 0 ? CHARS.cross : CHARS.t_l; 

    rows.push(
      <box key={`row-${r}`} flexDirection="row" height={1}>
        <text width={4} height={1} fg={labelColor}>{label}</text>
        <text width={1} height={1} fg={gridColor}>{sep}</text>
        <text flexGrow={1} height={1}>
            {(grid[r] ?? []).map((char, cx) => (
                <span key={cx} {...(char !== ' ' ? { fg: color } : {})}>{char}</span>
            ))}
        </text>
      </box>
    );
  }

  const labelRow = (
      <box flexDirection="row" height={1} paddingLeft={5}>
          <text height={1} fg={labelColor}>
            {data.map((d) => {
                if (!d.label) return '';
                return d.label;
            }).filter(l => l).join('   ').slice(0, chartWidth)}
          </text>
      </box>
  );

  return (
    <box flexDirection="column">
      {rows}
      {labelRow}
    </box>
  );
};

export function HistoricalTrendsView() {
  const colors = useColors();
  const [period, setPeriod] = useState<TimePeriod>('7d');
  
  const data = useMemo(() => generateMockData(period), [period]);
  const totalCost = useMemo(() => data.reduce((acc, p) => acc + p.value, 0), [data]);

  useKeyboard((key) => {
    if (key.name === 'left') {
      setPeriod(prev => prev === '90d' ? '30d' : prev === '30d' ? '7d' : '7d');
    }
    if (key.name === 'right') {
      setPeriod(prev => prev === '7d' ? '30d' : prev === '30d' ? '90d' : '90d');
    }
  });

  return (
    <box flexDirection="column" padding={1} border borderStyle="single" borderColor={colors.border}>
      <box flexDirection="row" justifyContent="space-between" height={1} marginBottom={1}>
        <text height={1}>
            <span fg={colors.primary}><strong> COST TREND </strong></span>
            <span fg={colors.textMuted}>({period === '7d' ? '7 days' : period === '30d' ? '30 days' : '90 days'})</span>
        </text>
        <text height={1}>
            <span fg={colors.textMuted}>Total: </span>
            <span fg={colors.success}><strong>${totalCost.toFixed(2)}</strong></span>
        </text>
      </box>

      <box flexGrow={1} flexDirection="column" justifyContent="center">
          <AsciiChart 
            data={data} 
            height={12} 
            width={65} 
            color={colors.primary}
            labelColor={colors.textMuted}
            gridColor={colors.border}
          />
      </box>

      <box flexDirection="row" marginTop={1} height={1}>
        <text height={1} fg={colors.textSubtle}>
          <span fg={period === '7d' ? colors.primary : colors.textSubtle}>7d</span>
          {'  '}
          <span fg={period === '30d' ? colors.primary : colors.textSubtle}>30d</span>
          {'  '}
          <span fg={period === '90d' ? colors.primary : colors.textSubtle}>90d</span>
          {'      '}
          ←/→ Select Period
        </text>
      </box>
    </box>
  );
}
