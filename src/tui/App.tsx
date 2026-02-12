import { useState, useEffect, useCallback, useMemo } from 'react';
import { useKeyboard } from '@opentui/react';

import { captureFrameToFile, createBurstRecorder, type BurstRecorder } from './debug/captureFrame.ts';
import { ThemeProvider, useColors, useTheme } from './contexts/ThemeContext.tsx';
import { PluginProvider, usePlugins } from './contexts/PluginContext.tsx';
import { LogProvider, useLogs } from './contexts/LogContext.tsx';
import { InputProvider, useInputFocus } from './contexts/InputContext.tsx';
import { AgentSessionProvider, useAgentSessions } from './contexts/AgentSessionContext.tsx';
import { StorageProvider } from './contexts/StorageContext.tsx';
import { TimeWindowProvider } from './contexts/TimeWindowContext.tsx';
import { ConfigProvider, useConfig } from './contexts/ConfigContext.tsx';
import { DrawerProvider, useDrawer } from './contexts/DrawerContext.tsx';
import { SessionDetailsDrawer } from './components/SessionDetailsDrawer.tsx';
import { Header } from './components/Header.tsx';
import { StatusBar } from './components/StatusBar.tsx';
import { Toast } from './components/Toast.tsx';
import { ToastProvider, useToastContext } from './contexts/ToastContext.tsx';
import { DashboardRuntimeProvider, useDashboardRuntime } from './contexts/DashboardRuntimeContext.tsx';
import { RealTimeActivityProvider } from './contexts/RealTimeActivityContext.tsx';
import { RealTimeDashboard } from './views/RealTimeDashboard.tsx';
import { Dashboard } from './views/Dashboard.tsx';
import { HistoricalTrendsView } from './views/HistoricalTrendsView.tsx';
import { ProjectsView } from './views/ProjectsView.tsx';
import { CommandPalette, type CommandAction } from './components/CommandPalette.tsx';
import { SettingsModal } from './components/SettingsModal.tsx';
import { DebugPanel } from './components/DebugPanel.tsx';
import { copyToClipboard } from '@/utils/clipboard.ts';
import { useSafeRenderer } from './hooks/useSafeRenderer.ts';
import type { ThemePlugin } from '@/plugins/types/theme.ts';
import type { DemoPreset } from '@/demo/simulator.ts';
import { DemoModeProvider, useDemoMode } from './contexts/DemoModeContext.tsx';

interface AppProps {
  initialTheme?: ThemePlugin;
  debug?: boolean;
  demoMode?: boolean;
  demoSeed?: number;
  demoPreset?: DemoPreset;
  cliPlugins?: string[];
}

type View = 'dashboard' | 'providers' | 'trends' | 'projects';

function AppContent() {
  const renderer = useSafeRenderer();
  const colors = useColors();
  const { setTheme } = useTheme();
  const { refreshAllProviders, isInitialized, themes } = usePlugins();
  const { info } = useLogs();
  const { toast, showToast, dismissToast } = useToastContext();
  const { isInputFocused } = useInputFocus();
  const { config } = useConfig();
  const { demoMode } = useDemoMode();
  const { selectedSession, hideDrawer, isOpen: isDrawerOpen } = useDrawer();
  const { sessions } = useAgentSessions();
  const { debugDataRef, activity, sparkData } = useDashboardRuntime();
  const burstRecorderRef = { current: null as BurstRecorder | null };

  const refreshInterval = config.refresh.pauseAutoRefresh ? 0 : config.refresh.intervalMs;

  const [lastRefresh, setLastRefresh] = useState<number | null>(null);
  const [activeView, setActiveView] = useState<View>('dashboard');
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [themeInitialized, setThemeInitialized] = useState(false);

  const isModalOpen = showCommandPalette || showSettings || showDebugPanel || isDrawerOpen;

  const inspectorData = useMemo(() => ({
    sessions: sessions.map(s => ({
      sessionId: s.sessionId,
      agentName: s.agentName,
      status: s.status,
      totals: s.totals,
      lastActivityAt: s.lastActivityAt,
    })),
    debugData: debugDataRef.current,
    activity,
    sparkData,
  }), [sessions, debugDataRef, activity, sparkData]);

  const handleCaptureFrame = useCallback(async () => {
    if (!renderer) {
      showToast('No renderer available', 'error');
      return;
    }
    try {
      const result = await captureFrameToFile(renderer, 'manual');
      info(`Frame captured: ${result.framePath}`);
      if (config.notifications.toastsEnabled) {
        showToast('Frame captured');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      info(`Frame capture failed: ${msg}`);
      if (config.notifications.toastsEnabled) {
        showToast('Capture failed', 'error');
      }
    }
  }, [renderer, info, showToast, config.notifications.toastsEnabled]);

  const handleBurstRecord = useCallback(async () => {
    if (!renderer) return;
    if (burstRecorderRef.current?.recording) {
      const frames = burstRecorderRef.current.stop();
      info(`Burst stopped: ${frames.length} frames captured`);
      if (config.notifications.toastsEnabled) {
        showToast(`Burst: ${frames.length} frames`);
      }
      burstRecorderRef.current = null;
      return;
    }

    burstRecorderRef.current = createBurstRecorder(renderer, { frameCount: 10, minInterval: 200 });
    info('Burst recording started (10 frames)');
    if (config.notifications.toastsEnabled) {
      showToast('Recording burst...');
    }

    const frames = await burstRecorderRef.current.start();
    info(`Burst complete: ${frames.length} frames in ${frames[0]?.framePath.split('/').slice(0, -1).join('/')}`);
    if (config.notifications.toastsEnabled) {
      showToast(`Burst: ${frames.length} frames`);
    }
    burstRecorderRef.current = null;
  }, [renderer, info, showToast, config.notifications.toastsEnabled]);

  const handleMouseUp = useCallback(async () => {
    if (!renderer) return;
    const selection = renderer.getSelection();
    const text = selection?.getSelectedText();
    if (text && text.length > 0) {
      try {
        await copyToClipboard(text);
        if (config.notifications.toastsEnabled) {
          showToast('Copied to clipboard');
        }
      } catch {
        if (config.notifications.toastsEnabled) {
          showToast('Copy failed', 'error');
        }
      }
      renderer.clearSelection();
    }
  }, [renderer, showToast, config.notifications.toastsEnabled]);

  const commands: CommandAction[] = useMemo(() => [
    { id: 'view-dashboard', label: 'Go to Dashboard', shortcut: '1', action: () => setActiveView('dashboard') },
    { id: 'view-providers', label: 'Go to Providers', shortcut: '2', action: () => setActiveView('providers') },
    { id: 'view-trends', label: 'Go to Trends', shortcut: '3', action: () => setActiveView('trends') },
    { id: 'view-projects', label: 'Go to Projects', shortcut: '4', action: () => setActiveView('projects') },
    { id: 'open-settings', label: 'Open Settings', shortcut: ',', action: () => setShowSettings(true) },
    { id: 'refresh', label: 'Refresh Data', shortcut: 'r', action: () => {
      if (isInitialized) {
        info('Manual refresh triggered');
        refreshAllProviders().then(() => setLastRefresh(Date.now()));
      }
    }},
    { id: 'toggle-debug', label: 'Toggle Debug Panel', shortcut: '~', action: () => setShowDebugPanel(prev => !prev) },
    { id: 'capture-frame', label: 'Capture Frame', shortcut: 'Ctrl+P', action: () => handleCaptureFrame() },
    { id: 'quit', label: 'Quit', shortcut: 'q', action: () => renderer?.destroy() },
  ], [isInitialized, refreshAllProviders, info, handleCaptureFrame, renderer]);

  useKeyboard((key) => {
    if (key.ctrl && key.name === 'p') {
      handleCaptureFrame();
      return;
    }
    if (key.ctrl && key.shift && key.name === 'p') {
      handleBurstRecord();
      return;
    }

    if (isModalOpen) {
      return;
    }

    if (isInputFocused) {
      return;
    }

    if (key.name === '1') {
      setActiveView('dashboard');
    }
    if (key.name === '2') {
      setActiveView('providers');
    }
    if (key.name === '3') {
      setActiveView('trends');
    }
    if (key.name === '4') {
      setActiveView('projects');
    }
    if (key.sequence === ',') {
      setShowSettings(true);
    }

    if (key.sequence === ':' || (key.shift && key.name === ';')) {
      setShowCommandPalette(true);
      return;
    }

    if (key.name === 'q' || (key.ctrl && key.name === 'c')) {
      renderer?.destroy();
    }
    if (key.name === 'r' && isInitialized) {
      info('Manual refresh triggered');
      refreshAllProviders().then(() => setLastRefresh(Date.now()));
    }
    if (key.sequence === '~' || (key.shift && key.name === 'd')) {
      setShowDebugPanel(true);
    }
  });

  useEffect(() => {
    if (themes.length > 0 && config.display.theme && !themeInitialized) {
      const matchedTheme = themes.find(t => t.id === config.display.theme);
      if (matchedTheme) {
        setTheme(matchedTheme);
      } else {
        // Fallback to first theme if saved theme invalid
        const firstTheme = themes[0];
        if (firstTheme) setTheme(firstTheme);
      }
      setThemeInitialized(true);
    }
  }, [themes, config.display.theme, themeInitialized, setTheme]);

  useEffect(() => {
    if (isInitialized) {
      info('Application initialized');
      refreshAllProviders().then(() => setLastRefresh(Date.now()));
    }
  }, [isInitialized]);

  useEffect(() => {
    if (!isInitialized || refreshInterval <= 0) return;

    const interval = setInterval(() => {
      info('Auto-refresh triggered');
      refreshAllProviders().then(() => setLastRefresh(Date.now()));
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [isInitialized, refreshInterval, refreshAllProviders, info]);

  return (
    <box
      flexDirection="column"
      width="100%"
      height="100%"
      backgroundColor={colors.background}
      onMouseUp={handleMouseUp}
      position="relative"
    >
      <Header
        activeView={activeView}
        demoMode={demoMode}
      />

      {activeView === 'dashboard' && <RealTimeDashboard />}
      {activeView === 'providers' && <Dashboard />}
      {activeView === 'trends' && <HistoricalTrendsView />}
      {activeView === 'projects' && <ProjectsView />}

      <StatusBar
        lastRefresh={lastRefresh ?? 0}
        nextRefresh={lastRefresh ? lastRefresh + refreshInterval : 0}
        demoMode={demoMode}
      />

      {toast && config.notifications.toastsEnabled && (
        <Toast
          message={toast.message}
          type={toast.type}
          onDismiss={dismissToast}
        />
      )}

      {showCommandPalette && (
        <CommandPalette
          commands={commands}
          onClose={() => setShowCommandPalette(false)}
        />
      )}

      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} />
      )}

      {showDebugPanel && (
        <DebugPanel
          onClose={() => setShowDebugPanel(false)}
          inspectorData={inspectorData}
        />
      )}

      {isDrawerOpen && selectedSession && (
        <SessionDetailsDrawer
          session={selectedSession}
          onClose={hideDrawer}
        />
      )}
    </box>
  );
}

function ConfiguredApp({ cliPlugins }: { cliPlugins?: string[] }) {
  const { config, isLoading } = useConfig();

  if (isLoading) {
    return null;
  }

  return (
    <TimeWindowProvider defaultWindow={config.display.defaultTimeWindow}>
      <ToastProvider>
        <PluginProvider {...(cliPlugins ? { cliPlugins } : {})}>
          <RealTimeActivityProvider>
            <AgentSessionProvider autoRefresh={true} refreshInterval={1000}>
              <DashboardRuntimeProvider>
              <DrawerProvider>
                <AppContent />
              </DrawerProvider>
              </DashboardRuntimeProvider>
            </AgentSessionProvider>
          </RealTimeActivityProvider>
        </PluginProvider>
      </ToastProvider>
    </TimeWindowProvider>
  );
}

export function App({ initialTheme, debug = false, demoMode = false, demoSeed, demoPreset, cliPlugins }: AppProps) {
  const themeProviderProps = initialTheme ? { initialTheme } : {};
  const demoProviderProps: { demoMode: boolean; demoSeed?: number; demoPreset?: DemoPreset } = { demoMode };
  if (demoSeed !== undefined) demoProviderProps.demoSeed = demoSeed;
  if (demoPreset !== undefined) demoProviderProps.demoPreset = demoPreset;

  return (
    <DemoModeProvider {...demoProviderProps}>
      <LogProvider debugEnabled={debug}>
        <InputProvider>
          <StorageProvider>
            <ThemeProvider {...themeProviderProps}>
              <ConfigProvider>
                <ConfiguredApp {...(cliPlugins ? { cliPlugins } : {})} />
              </ConfigProvider>
            </ThemeProvider>
          </StorageProvider>
        </InputProvider>
      </LogProvider>
    </DemoModeProvider>
  );
}
