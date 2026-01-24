import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRenderer, useKeyboard } from '@opentui/react';
import * as fs from 'fs/promises';
import * as path from 'path';
import { PATHS } from '@/storage/paths.ts';
import { captureFrameToFile, createBurstRecorder, type BurstRecorder } from './debug/captureFrame.ts';
import { ThemeProvider, useColors } from './contexts/ThemeContext.tsx';
import { PluginProvider, usePlugins } from './contexts/PluginContext.tsx';
import { LogProvider, useLogs } from './contexts/LogContext.tsx';
import { InputProvider, useInputFocus } from './contexts/InputContext.tsx';
import { AgentSessionProvider } from './contexts/AgentSessionContext.tsx';
import { StorageProvider } from './contexts/StorageContext.tsx';
import { TimeWindowProvider } from './contexts/TimeWindowContext.tsx';
import { ConfigProvider, useConfig } from './contexts/ConfigContext.tsx';
import { Header } from './components/Header.tsx';
import { StatusBar } from './components/StatusBar.tsx';
import { DebugConsole, copyLogsToClipboard, type DebugConsoleHandle } from './components/DebugConsole.tsx';
import { Toast } from './components/Toast.tsx';
import { ToastProvider, useToastContext } from './contexts/ToastContext.tsx';
import { RealTimeDashboard } from './views/RealTimeDashboard.tsx';
import { Dashboard } from './views/Dashboard.tsx';
import { HistoricalTrendsView } from './views/HistoricalTrendsView.tsx';
import { ProjectsView } from './views/ProjectsView.tsx';
import { SettingsView } from './views/SettingsView.tsx';
import { CommandPalette, type CommandAction } from './components/CommandPalette.tsx';
import { copyToClipboard } from '@/utils/clipboard.ts';
import type { ThemePlugin } from '@/plugins/types/theme.ts';

interface AppProps {
  initialTheme?: ThemePlugin;
  debug?: boolean;
}

type View = 'dashboard' | 'providers' | 'trends' | 'projects' | 'settings';

function AppContent() {
  const renderer = useRenderer();
  const colors = useColors();
  const { refreshAllProviders, isInitialized } = usePlugins();
  const { logs, isConsoleOpen, toggleConsole, closeConsole, clearLogs, exportLogs, info } = useLogs();
  const { toast, showToast, dismissToast } = useToastContext();
  const { isInputFocused } = useInputFocus();
  const { config } = useConfig();
  
  const refreshInterval = config.refresh.pauseAutoRefresh ? 0 : config.refresh.intervalMs;
  
  const [lastRefresh, setLastRefresh] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | undefined>();
  const [activeView, setActiveView] = useState<View>('dashboard');
  const [consoleFollow, setConsoleFollow] = useState(true);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const debugConsoleRef = useRef<DebugConsoleHandle>(null);
  const lastKeyRef = useRef<string | null>(null);
  const burstRecorderRef = useRef<BurstRecorder | null>(null);

  const handleCopyLogs = useCallback(async () => {
    await copyLogsToClipboard(logs);
    if (config.notifications.toastsEnabled) {
      showToast('Copied to clipboard');
    }
  }, [logs, showToast, config.notifications.toastsEnabled]);

  const handleCaptureFrame = useCallback(async () => {
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
    { id: 'view-settings', label: 'Go to Settings', shortcut: '5', action: () => setActiveView('settings') },
    { id: 'refresh', label: 'Refresh Data', shortcut: 'r', action: () => {
      if (isInitialized) {
        info('Manual refresh triggered');
        refreshAllProviders().then(() => setLastRefresh(Date.now()));
      }
    }},
    { id: 'toggle-debug', label: 'Toggle Debug Console', shortcut: '~', action: () => toggleConsole() },
    { id: 'capture-frame', label: 'Capture Frame', shortcut: 'Ctrl+P', action: () => handleCaptureFrame() },
    { id: 'quit', label: 'Quit', shortcut: 'q', action: () => renderer.destroy() },
  ], [isInitialized, refreshAllProviders, info, toggleConsole, handleCaptureFrame, renderer]);

  useKeyboard((key) => {
    if (showCommandPalette) {
      return;
    }
    
    if (isConsoleOpen) {
      if (key.name === 'escape' || key.sequence === '~') {
        closeConsole();
        lastKeyRef.current = null;
        return;
      }
      if (key.name === 'c') {
        clearLogs();
        info('Logs cleared');
        lastKeyRef.current = null;
        return;
      }
      if (key.name === 'f') {
        setConsoleFollow(prev => !prev);
        lastKeyRef.current = null;
        return;
      }
      if (key.name === 'x') {
        exportLogsToFile();
        lastKeyRef.current = null;
        return;
      }
      if (key.name === 'y') {
        handleCopyLogs();
        lastKeyRef.current = null;
        return;
      }
      if (key.shift && key.name === 'g') {
        debugConsoleRef.current?.scrollToBottom();
        lastKeyRef.current = null;
        return;
      }
      if (key.name === 'g') {
        if (lastKeyRef.current === 'g') {
          debugConsoleRef.current?.scrollToTop();
          lastKeyRef.current = null;
        } else {
          lastKeyRef.current = 'g';
        }
        return;
      }
      lastKeyRef.current = null;
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
    if (key.name === '5') {
      setActiveView('settings');
    }
    
    if (key.sequence === ':' || (key.shift && key.name === ';')) {
      setShowCommandPalette(true);
      return;
    }

    if (key.name === 'q' || (key.ctrl && key.name === 'c')) {
      renderer.destroy();
    }
    if (key.name === 'r' && isInitialized) {
      info('Manual refresh triggered');
      refreshAllProviders().then(() => setLastRefresh(Date.now()));
    }
    if (key.sequence === '~') {
      toggleConsole();
    }
    if (key.ctrl && key.name === 'p') {
      handleCaptureFrame();
    }
    if (key.ctrl && key.shift && key.name === 'p') {
      handleBurstRecord();
    }
  });

  async function exportLogsToFile() {
    const logsDir = PATHS.data.logs;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logFile = path.join(logsDir, `debug-${timestamp}.log`);

    try {
      await fs.mkdir(logsDir, { recursive: true });
      const content = exportLogs();
      await fs.writeFile(logFile, content, 'utf-8');
      info(`Logs exported to ${logFile}`);
      setStatusMessage(`Logs saved: ${logFile}`);
      setTimeout(() => setStatusMessage(undefined), 3000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      info(`Failed to export logs: ${msg}`);
      setStatusMessage(`Export failed: ${msg}`);
      setTimeout(() => setStatusMessage(undefined), 3000);
    }
  }

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
    >
      <Header 
        {...(isConsoleOpen ? { subtitle: '(debug)' } : {})} 
        activeView={activeView}
      />
      
      {isConsoleOpen ? (
        <DebugConsole ref={debugConsoleRef} height={20} follow={consoleFollow} />
      ) : activeView === 'dashboard' ? (
        <RealTimeDashboard />
      ) : activeView === 'providers' ? (
        <Dashboard />
      ) : activeView === 'trends' ? (
        <HistoricalTrendsView />
      ) : activeView === 'projects' ? (
        <ProjectsView />
      ) : activeView === 'settings' ? (
        <SettingsView />
      ) : (
        <RealTimeDashboard />
      )}
      
      <StatusBar
        lastRefresh={lastRefresh ?? 0}
        nextRefresh={lastRefresh ? lastRefresh + refreshInterval : 0}
        {...(statusMessage ? { message: statusMessage } : {})}
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
    </box>
  );
}

function ConfiguredApp() {
  const { config, isLoading } = useConfig();
  
  if (isLoading) {
    return null;
  }
  
  return (
    <TimeWindowProvider defaultWindow={config.display.defaultTimeWindow}>
      <ToastProvider>
        <PluginProvider>
          <AgentSessionProvider autoRefresh={true} refreshInterval={3000}>
            <AppContent />
          </AgentSessionProvider>
        </PluginProvider>
      </ToastProvider>
    </TimeWindowProvider>
  );
}

export function App({ initialTheme, debug = false }: AppProps) {
  const themeProviderProps = initialTheme ? { initialTheme } : {};

  return (
    <LogProvider debugEnabled={debug}>
      <InputProvider>
        <StorageProvider>
          <ThemeProvider {...themeProviderProps}>
            <ConfigProvider>
              <ConfiguredApp />
            </ConfigProvider>
          </ThemeProvider>
        </StorageProvider>
      </InputProvider>
    </LogProvider>
  );
}
