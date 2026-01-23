import { useState, useEffect, useCallback } from 'react';
import { useRenderer, useKeyboard } from '@opentui/react';
import * as fs from 'fs/promises';
import * as path from 'path';
import { PATHS } from '@/storage/paths.ts';
import { ThemeProvider, useColors } from './contexts/ThemeContext.tsx';
import { PluginProvider, usePlugins } from './contexts/PluginContext.tsx';
import { LogProvider, useLogs } from './contexts/LogContext.tsx';
import { InputProvider, useInputFocus } from './contexts/InputContext.tsx';
import { Header } from './components/Header.tsx';
import { StatusBar } from './components/StatusBar.tsx';
import { DebugConsole, copyLogsToClipboard } from './components/DebugConsole.tsx';
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

  const handleCopyLogs = useCallback(async () => {
    await copyLogsToClipboard(logs);
    showToast('Copied to clipboard');
  }, [logs, showToast]);

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
      if (key.name === 'escape') {
        closeConsole();
        return;
      }
      if (key.name === 'c') {
        clearLogs();
        info('Logs cleared');
        return;
      }
      if (key.name === 'x') {
        exportLogsToFile();
        return;
      }
      if (key.name === 'y') {
        handleCopyLogs();
        return;
      }
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
    if (key.name === 'd') {
      toggleConsole();
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
        <DebugConsole height={20} />
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
        <ThemeProvider {...themeProviderProps}>
          <PluginProvider>
            <AppContent refreshInterval={refreshInterval} />
          </PluginProvider>
        </ThemeProvider>
      </InputProvider>
    </LogProvider>
  );
}
