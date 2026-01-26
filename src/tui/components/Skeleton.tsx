import { useState, useEffect } from 'react';
import { useColors } from '../contexts/ThemeContext.tsx';
import { interpolateColor } from '../hooks/useValueFlash.ts';

const SHIMMER_INTERVAL = 50;
const SHIMMER_WAVE_LENGTH = 8;

interface ShimmerSegment {
  char: string;
  color: string;
}

function useShimmer(length: number, baseColor: string, highlightColor: string): ShimmerSegment[] {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setPhase((p) => (p + 1) % (length + SHIMMER_WAVE_LENGTH));
    }, SHIMMER_INTERVAL);

    return () => clearInterval(interval);
  }, [length]);

  const segments: ShimmerSegment[] = [];
  for (let i = 0; i < length; i++) {
    const distFromWave = i - phase;
    let intensity = 0;
    
    if (distFromWave >= 0 && distFromWave < SHIMMER_WAVE_LENGTH) {
      intensity = Math.sin((distFromWave / SHIMMER_WAVE_LENGTH) * Math.PI);
    }
    
    const color = intensity > 0 
      ? interpolateColor(intensity, baseColor, highlightColor)
      : baseColor;
    
    segments.push({ char: '█', color });
  }
  
  return segments;
}

interface SkeletonTextProps {
  width?: number;
}

export function SkeletonText({ width = 10 }: SkeletonTextProps) {
  const colors = useColors();
  const segments = useShimmer(width, colors.borderMuted, colors.border);
  
  return (
    <text>
      {segments.map((seg, i) => (
        <span key={i} fg={seg.color}>{seg.char}</span>
      ))}
    </text>
  );
}

interface SkeletonGaugeProps {
  barWidth?: number;
}

export function SkeletonGauge({ barWidth = 30 }: SkeletonGaugeProps) {
  const colors = useColors();
  const labelSegments = useShimmer(12, colors.borderMuted, colors.textSubtle);
  const barSegments = useShimmer(barWidth, colors.borderMuted, colors.border);
  const resetSegments = useShimmer(20, colors.borderMuted, colors.textSubtle);
  
  return (
    <box flexDirection="column" width={40}>
      <box flexDirection="row" justifyContent="space-between">
        <text>
          {labelSegments.map((seg, i) => (
            <span key={i} fg={seg.color}>{seg.char}</span>
          ))}
        </text>
        <text fg={colors.textSubtle}>···</text>
      </box>
      <text>
        {barSegments.map((seg, i) => (
          <span key={i} fg={seg.color}>{seg.char}</span>
        ))}
      </text>
      <text>
        {resetSegments.map((seg, i) => (
          <span key={i} fg={seg.color}>{seg.char}</span>
        ))}
      </text>
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
