import { useColors } from '../contexts/ThemeContext.tsx';

interface HeaderProps {
  title?: string;
  subtitle?: string;
  activeView?: 'dashboard' | 'providers';
}

export function Header({ title = 'tokentop', subtitle, activeView }: HeaderProps) {
  const colors = useColors();

  return (
    <box
      flexDirection="row"
      justifyContent="space-between"
      alignItems="center"
      paddingLeft={1}
      paddingRight={1}
      backgroundColor={colors.foreground}
      flexShrink={0}
      height={1}
    >
      <box flexDirection="row" gap={1}>
        <text>
          <span fg={colors.primary}>
            <strong>{title}</strong>
          </span>
        </text>
        {subtitle && (
          <text fg={colors.textMuted}>{subtitle}</text>
        )}
        
        {activeView && (
          <box flexDirection="row" gap={1} marginLeft={2}>
            <text>
              <span fg={activeView === 'dashboard' ? colors.primary : colors.textSubtle}>
                [1] Dashboard
              </span>
            </text>
            <text>
              <span fg={activeView === 'providers' ? colors.primary : colors.textSubtle}>
                [2] Providers
              </span>
            </text>
          </box>
        )}
      </box>
      <text fg={colors.textSubtle}>q:quit r:refresh d:debug /:filter s:sort</text>
    </box>
  );
}
