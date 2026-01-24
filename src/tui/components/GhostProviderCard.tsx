import { forwardRef } from 'react';
import type { BoxRenderable } from '@opentui/core';
import { useColors } from '../contexts/ThemeContext.tsx';

interface GhostProviderCardProps {
  name: string;
  focused?: boolean;
  onFocus?: () => void;
}

export const GhostProviderCard = forwardRef<BoxRenderable, GhostProviderCardProps>(({
  name,
  focused = false,
  onFocus,
}, ref) => {
  const colors = useColors();

  return (
    <box
      ref={ref}
      border
      borderStyle="rounded"
      borderColor={focused ? colors.textSubtle : colors.textSubtle}
      padding={1}
      flexDirection="column"
      gap={1}
      width={44}
      minHeight={8}
      {...(onFocus ? { onMouseDown: onFocus } : {})}
    >
      <box flexDirection="row" justifyContent="space-between" alignItems="center">
        <text fg={colors.textSubtle}>
          {name}
        </text>
        <text fg={colors.textSubtle}>○</text>
      </box>

      <box flexDirection="column" flexGrow={1} justifyContent="center" alignItems="center" gap={1}>
        <text fg={colors.textSubtle}>Not configured</text>
        <text fg={colors.textMuted}>Set API key to enable</text>
      </box>
    </box>
  );
});
GhostProviderCard.displayName = 'GhostProviderCard';
