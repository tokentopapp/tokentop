import { useState, useEffect, useCallback, useRef } from 'react';
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
import { Header } from './components/Header.tsx';
import { StatusBar } from './components/StatusBar.tsx';
import { DebugConsole, copyLogsToClipboard, type DebugConsoleHandle } from './components/DebugConsole.tsx';
import { Toast, useToast } from './components/Toast.tsx';
import { RealTimeDashboard } from './views/RealTimeDashboard.tsx';
import { Dashboard } from './views/Dashboard.tsx';
import { copyToClipboard } from '@/utils/clipboard.ts';
import type { ThemePlugin } from '@/plugins/types/theme.ts';

interface AppProps {
  initialTheme?: ThemePlugin;
  refreshInterval?: number;
  debug?: boolean;
}

type View = 'dashboard' | 'providers';

function AppContent({ refreshInterval = 60000 }: { refreshInterval?: number }) {
  const renderer = useRenderer();
  const colors = useColors();
  const { refreshAllProviders, isInitialized } = usePlugins();
  const { logs, isConsoleOpen, toggleConsole, closeConsole, clearLogs, exportLogs, info } = useLogs();
  const { toast, showToast, dismissToast } = useToast();
  const { isInputFocused } = useInputFocus();
  const [lastRefresh, setLastRefresh] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | undefined>();
  const [activeView, setActiveView] = useState<View>('dashboard');
  const [consoleFollow, setConsoleFollow] = useState(true);
  const debugConsoleRef = useRef<DebugConsoleHandle>(null);
  const lastKeyRef = useRef<string | null>(null);
  const burstRecorderRef = useRef<BurstRecorder | null>(null);

  const handleCopyLogs = useCallback(async () => {
    await copyLogsToClipboard(logs);
    showToast('Copied to clipboard');
  }, [logs, showToast]);

  const handleCaptureFrame = useCallback(async () => {
    try {
      const result = await captureFrameToFile(renderer, 'manual');
      info(`Frame captured: ${result.framePath}`);
      showToast('Frame captured');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      info(`Frame capture failed: ${msg}`);
      showToast('Capture failed', 'error');
    }
  }, [renderer, info, showToast]);

  const handleBurstRecord = useCallback(async () => {
    if (burstRecorderRef.current?.recording) {
      const frames = burstRecorderRef.current.stop();
      info(`Burst stopped: ${frames.length} frames captured`);
      showToast(`Burst: ${frames.length} frames`);
      burstRecorderRef.current = null;
      return;
    }

    burstRecorderRef.current = createBurstRecorder(renderer, { frameCount: 10, minInterval: 200 });
    info('Burst recording started (10 frames)');
    showToast('Recording burst...');
    
    const frames = await burstRecorderRef.current.start();
    info(`Burst complete: ${frames.length} frames in ${frames[0]?.framePath.split('/').slice(0, -1).join('/')}`);
    showToast(`Burst: ${frames.length} frames`);
    burstRecorderRef.current = null;
  }, [renderer, info, showToast]);

  const handleMouseUp = useCallback(async () => {
    const selection = renderer.getSelection();
    const text = selection?.getSelectedText();
    if (text && text.length > 0) {
      try {
        await copyToClipboard(text);
        showToast('Copied to clipboard');
      } catch {
        showToast('Copy failed', 'error');
      }
      renderer.clearSelection();
    }
  }, [renderer, showToast]);

  useKeyboard((key) => {
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
      // Vim: G = bottom, gg = top
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
    // Ctrl+P: Capture single frame
    if (key.ctrl && key.name === 'p') {
      handleCaptureFrame();
    }
    // Ctrl+Shift+P: Toggle burst recording
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
      ) : (
        <Dashboard />
      )}
      
      <StatusBar
        lastRefresh={lastRefresh ?? 0}
        nextRefresh={lastRefresh ? lastRefresh + refreshInterval : 0}
        {...(statusMessage ? { message: statusMessage } : {})}
      />

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onDismiss={dismissToast}
        />
      )}
    </box>
  );
}

export function App({ initialTheme, refreshInterval = 60000, debug = false }: AppProps) {
  const themeProviderProps = initialTheme ? { initialTheme } : {};

  return (
    <LogProvider debugEnabled={debug}>
      <InputProvider>
        <StorageProvider>
          <ThemeProvider {...themeProviderProps}>
            <TimeWindowProvider defaultWindow="5m">
              <PluginProvider>
                <AgentSessionProvider autoRefresh={true} refreshInterval={3000}>
                  <AppContent refreshInterval={refreshInterval} />
                </AgentSessionProvider>
              </PluginProvider>
            </TimeWindowProvider>
          </ThemeProvider>
        </StorageProvider>
      </InputProvider>
    </LogProvider>
  );
}
