import { useTerminalDimensions } from '@opentui/react';
import { useColors } from '../contexts/ThemeContext.tsx';

interface HeaderProps {
  title?: string;
  subtitle?: string;
  activeView?: 'dashboard' | 'providers' | 'trends' | 'projects' | 'settings';
}

const ASCII_LOGO = [
  '████████╗ ██████╗ ██╗  ██╗███████╗███╗   ██╗████████╗ ██████╗ ██████╗ ',
  '╚══██╔══╝██╔═══██╗██║ ██╔╝██╔════╝████╗  ██║╚══██╔══╝██╔═══██╗██╔══██╗',
  '   ██║   ██║   ██║█████╔╝ █████╗  ██╔██╗ ██║   ██║   ██║   ██║██████╔╝',
  '   ██║   ██║   ██║██╔═██╗ ██╔══╝  ██║╚██╗██║   ██║   ██║   ██║██╔═══╝ ',
  '   ██║   ╚██████╔╝██║  ██╗███████╗██║ ╚████║   ██║   ╚██████╔╝██║     ',
  '   ╚═╝    ╚═════╝ ╚═╝  ╚═╝╚══════╝╚═╝  ╚═══╝   ╚═╝    ╚═════╝ ╚═╝     ',
];

const MIN_HEIGHT_FOR_LARGE_LOGO = 35;

export function Header({ title = 'tokentop', subtitle, activeView }: HeaderProps) {
  const colors = useColors();
  const { height } = useTerminalDimensions();

  const isDashboard = activeView === 'dashboard';
  const isProviders = activeView === 'providers';
  const isTrends = activeView === 'trends';
  const isProjects = activeView === 'projects';
  const isSettings = activeView === 'settings';
  const useLargeLogo = height >= MIN_HEIGHT_FOR_LARGE_LOGO;

  const headerHeight = useLargeLogo ? 7 : 1;

  return (
    <box
      flexDirection="column"
      backgroundColor={colors.foreground}
      flexShrink={0}
      height={headerHeight}
      paddingLeft={1}
      paddingRight={1}
      overflow="hidden"
    >
      {useLargeLogo && (
        <box flexDirection="column" alignItems="center" height={6}>
          {ASCII_LOGO.map((line, idx) => (
            <text key={idx} height={1} fg={colors.primary}>{line}</text>
          ))}
        </box>
      )}
      <box flexDirection="row" justifyContent="space-between" alignItems="center" height={1}>
        {!useLargeLogo && (
          <box flexDirection="row" gap={1} alignItems="center" height={1}>
            <text height={1}>
              <span fg={colors.primary}>
                <strong>{title}</strong>
              </span>
            </text>
            {subtitle && (
              <text height={1} fg={colors.textMuted}>{subtitle}</text>
            )}
          </box>
        )}
        {useLargeLogo && <box width={10} />}
        {activeView && (
          <box flexDirection="row" gap={useLargeLogo ? 1 : 0} marginLeft={useLargeLogo ? 0 : 2} alignItems="center" height={1}>
            <text height={1}>
              {isDashboard ? (
                <span bg={colors.primary} fg={colors.background}><strong> DASHBOARD </strong></span>
              ) : (
                <span fg={colors.textMuted}> DASHBOARD </span>
              )}
            </text>
            <text height={1}>
              {isProviders ? (
                <span bg={colors.primary} fg={colors.background}><strong> PROVIDERS </strong></span>
              ) : (
                <span fg={colors.textMuted}> PROVIDERS </span>
              )}
            </text>
            <text height={1}>
              {isTrends ? (
                <span bg={colors.primary} fg={colors.background}><strong> TRENDS </strong></span>
              ) : (
                <span fg={colors.textMuted}> TRENDS </span>
              )}
            </text>
            <text height={1}>
              {isProjects ? (
                <span bg={colors.primary} fg={colors.background}><strong> PROJECTS </strong></span>
              ) : (
                <span fg={colors.textMuted}> PROJECTS </span>
              )}
            </text>
            <text height={1}>
              {isSettings ? (
                <span bg={colors.primary} fg={colors.background}><strong> SETTINGS </strong></span>
              ) : (
                <span fg={colors.textMuted}> SETTINGS </span>
              )}
            </text>
          </box>
        )}
        <text height={1} fg={colors.textMuted}>v1.0.0</text>
      </box>
    </box>
  );
}
