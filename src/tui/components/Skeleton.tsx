import { useState, useEffect } from 'react';
import { useColors } from '../contexts/ThemeContext.tsx';

const SHIMMER_CHARS = ['░', '▒', '▓', '▒'];
const SHIMMER_INTERVAL = 20;

function useShimmer(length: number): string {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setOffset((o) => (o + 1) % (length + SHIMMER_CHARS.length));
    }, SHIMMER_INTERVAL);

    return () => clearInterval(interval);
  }, [length]);

  let result = '';
  for (let i = 0; i < length; i++) {
    const shimmerPos = (i - offset + length + SHIMMER_CHARS.length) % (length + SHIMMER_CHARS.length);
    if (shimmerPos < SHIMMER_CHARS.length) {
      result += SHIMMER_CHARS[shimmerPos];
    } else {
      result += '░';
    }
  }
  
  return result;
}

interface SkeletonTextProps {
  width?: number;
}

export function SkeletonText({ width = 10 }: SkeletonTextProps) {
  const colors = useColors();
  const shimmer = useShimmer(width);
  
  return <text fg={colors.textSubtle}>{shimmer}</text>;
}

interface SkeletonGaugeProps {
  barWidth?: number;
}

export function SkeletonGauge({ barWidth = 30 }: SkeletonGaugeProps) {
  const colors = useColors();
  const labelShimmer = useShimmer(12);
  const barShimmer = useShimmer(barWidth);
  const resetShimmer = useShimmer(26);
  
  return (
    <box flexDirection="column" width={40}>
      <box flexDirection="row" justifyContent="space-between">
        <text fg={colors.textSubtle}>{labelShimmer}</text>
        <text fg={colors.textSubtle}>░░░</text>
      </box>
      <text fg={colors.textSubtle}>{barShimmer}</text>
      <text fg={colors.textSubtle}>{resetShimmer}</text>
    </box>
  );
}

export function SkeletonProviderContent() {
  return (
    <box flexDirection="column" gap={1}>
      <SkeletonText width={8} />
      <SkeletonGauge />
      <SkeletonGauge />
    </box>
  );
}
