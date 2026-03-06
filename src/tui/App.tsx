import { useKeyboard } from "@opentui/react";
import type { ThemePlugin } from "@tokentop/plugin-sdk";
import { useCallback, useEffect, useMemo, useState } from "react";
import * as builtinThemeExports from "@/plugins/themes/index.ts";
import { resolveTheme, ThemeProvider, useColors, useTheme } from "./contexts/ThemeContext.tsx";
import {
  type BurstRecorder,
  captureFrameToFile,
  createBurstRecorder,
} from "./debug/captureFrame.ts";

const builtinThemeList = Object.values(builtinThemeExports) as ThemePlugin[];

import type { DemoPreset } from "@/demo/simulator.ts";
import { copyToClipboard } from "@/utils/clipboard.ts";
import { type CommandAction, CommandPalette } from "./components/CommandPalette.tsx";
import { DebugPanel } from "./components/DebugPanel.tsx";
import { Header } from "./components/Header.tsx";
import { SessionDetailsDrawer } from "./components/SessionDetailsDrawer.tsx";
import { SettingsModal } from "./components/SettingsModal.tsx";
import { StatusBar } from "./components/StatusBar.tsx";
import { Toast } from "./components/Toast.tsx";
import { AgentSessionProvider, useAgentSessions } from "./contexts/AgentSessionContext.tsx";
import { ConfigProvider, useConfig } from "./contexts/ConfigContext.tsx";
import {
  DashboardRuntimeProvider,
  useDashboardRuntime,
} from "./contexts/DashboardRuntimeContext.tsx";
import { DemoModeProvider, useDemoMode } from "./contexts/DemoModeContext.tsx";
import { DrawerProvider, useDrawer } from "./contexts/DrawerContext.tsx";
import { InputProvider, useInputFocus } from "./contexts/InputContext.tsx";
import { LogProvider, useLogs } from "./contexts/LogContext.tsx";
import { PluginProvider, usePlugins } from "./contexts/PluginContext.tsx";
import { RealTimeActivityProvider } from "./contexts/RealTimeActivityContext.tsx";
import { StorageProvider } from "./contexts/StorageContext.tsx";
import { TimeWindowProvider } from "./contexts/TimeWindowContext.tsx";
import { ToastProvider, useToastContext } from "./contexts/ToastContext.tsx";
import { useSafeRenderer } from "./hooks/useSafeRenderer.ts";
import { triggerShutdown } from "./shutdown.ts";
import { Dashboard } from "./views/Dashboard.tsx";
import { HistoricalTrendsView } from "./views/HistoricalTrendsView.tsx";
import { ProjectsView } from "./views/ProjectsView.tsx";
import { RealTimeDashboard } from "./views/RealTimeDashboard.tsx";

interface AppProps {
  debug?: boolean;
  demoMode?: boolean;
  demoSeed?: number;
  demoPreset?: DemoPreset;
  cliPlugins?: string[];
  cliTheme?: string;
}

type View = "dashboard" | "providers" | "trends" | "projects";

function AppContent() {
  const renderer = useSafeRenderer();
  const colors = useColors();
  const { theme, setTheme, cliTheme } = useTheme();
  const { refreshAllProviders, isInitialized, themes } = usePlugins();
  const { info } = useLogs();
  const { toast, showToast, dismissToast } = useToastContext();
  const { isInputFocused } = useInputFocus();
  const { config, updateConfig } = useConfig();
  const { demoMode } = useDemoMode();
  const { selectedSession, hideDrawer, isOpen: isDrawerOpen } = useDrawer();
  const { sessions } = useAgentSessions();
  const { debugDataRef, activity, sparkData } = useDashboardRuntime();
  const burstRecorderRef = { current: null as BurstRecorder | null };

  const refreshInterval = config.refresh.pauseAutoRefresh ? 0 : config.refresh.intervalMs;

  const [lastRefresh, setLastRefresh] = useState<number | null>(null);
  const [activeView, setActiveView] = useState<View>("dashboard");
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showDebugPanel, setShowDebugPanel] = useState(false);

  const isModalOpen = showCommandPalette || showSettings || showDebugPanel || isDrawerOpen;

  const gracefulShutdown = useCallback(() => triggerShutdown(), []);

  const inspectorData = useMemo(
    () => ({
      sessions: sessions.map((s) => ({
        sessionId: s.sessionId,
        agentName: s.agentName,
        status: s.status,
        totals: s.totals,
        lastActivityAt: s.lastActivityAt,
      })),
      debugData: debugDataRef.current,
      activity,
      sparkData,
    }),
    [sessions, debugDataRef, activity, sparkData],
  );

  const handleCaptureFrame = useCallback(async () => {
    if (!renderer) {
      showToast("No renderer available", "error");
      return;
    }
    try {
      const result = await captureFrameToFile(renderer, "manual");
      info(`Frame captured: ${result.framePath}`);
      if (config.notifications.toastsEnabled) {
        showToast("Frame captured");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      info(`Frame capture failed: ${msg}`);
      if (config.notifications.toastsEnabled) {
        showToast("Capture failed", "error");
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
    info("Burst recording started (10 frames)");
    if (config.notifications.toastsEnabled) {
      showToast("Recording burst...");
    }

    const frames = await burstRecorderRef.current.start();
    info(
      `Burst complete: ${frames.length} frames in ${frames[0]?.framePath.split("/").slice(0, -1).join("/")}`,
    );
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
          showToast("Copied to clipboard");
        }
      } catch {
        if (config.notifications.toastsEnabled) {
          showToast("Copy failed", "error");
        }
      }
      renderer.clearSelection();
    }
  }, [renderer, showToast, config.notifications.toastsEnabled]);

  const commands: CommandAction[] = useMemo(() => {
    const base: CommandAction[] = [
      {
        id: "view-dashboard",
        label: "Go to Dashboard",
        shortcut: "1",
        action: () => setActiveView("dashboard"),
      },
      {
        id: "view-providers",
        label: "Go to Providers",
        shortcut: "2",
        action: () => setActiveView("providers"),
      },
      {
        id: "view-trends",
        label: "Go to Trends",
        shortcut: "3",
        action: () => setActiveView("trends"),
      },
      {
        id: "view-projects",
        label: "Go to Projects",
        shortcut: "4",
        action: () => setActiveView("projects"),
      },
      {
        id: "open-settings",
        label: "Open Settings",
        shortcut: ",",
        action: () => setShowSettings(true),
      },
      {
        id: "refresh",
        label: "Refresh Data",
        shortcut: "r",
        action: () => {
          if (isInitialized) {
            info("Manual refresh triggered");
            refreshAllProviders().then(() => setLastRefresh(Date.now()));
          }
        },
      },
      {
        id: "toggle-debug",
        label: "Toggle Debug Panel",
        shortcut: "~",
        action: () => setShowDebugPanel((prev) => !prev),
      },
      {
        id: "capture-frame",
        label: "Capture Frame",
        shortcut: "Ctrl+P",
        action: () => handleCaptureFrame(),
      },
      { id: "quit", label: "Quit", shortcut: "q", action: () => void gracefulShutdown() },
    ];

    const themeCommands: CommandAction[] = themes.map((t) => ({
      id: `theme-${t.id}`,
      label: `Theme: ${t.name}`,
      action: () => updateConfig({ ...config, display: { ...config.display, theme: t.id } }),
    }));

    return [...base, ...themeCommands];
  }, [
    isInitialized,
    refreshAllProviders,
    info,
    handleCaptureFrame,
    renderer,
    gracefulShutdown,
    themes,
    config,
    updateConfig,
  ]);

  useKeyboard((key) => {
    if (key.ctrl && key.name === "p") {
      handleCaptureFrame();
      return;
    }
    if (key.ctrl && key.shift && key.name === "p") {
      handleBurstRecord();
      return;
    }

    if (isModalOpen) {
      return;
    }

    if (isInputFocused) {
      return;
    }

    if (key.name === "1") {
      setActiveView("dashboard");
    }
    if (key.name === "2") {
      setActiveView("providers");
    }
    if (key.name === "3") {
      setActiveView("trends");
    }
    if (key.name === "4") {
      setActiveView("projects");
    }
    if (key.sequence === ",") {
      setShowSettings(true);
    }

    if (key.sequence === ":" || (key.shift && key.name === ";")) {
      setShowCommandPalette(true);
      return;
    }

    if (key.name === "q" || (key.ctrl && key.name === "c")) {
      void gracefulShutdown();
    }
    if (key.name === "r" && isInitialized) {
      info("Manual refresh triggered");
      refreshAllProviders().then(() => setLastRefresh(Date.now()));
    }
    if (key.sequence === "~" || (key.shift && key.name === "d")) {
      setShowDebugPanel(true);
    }
  });

  useEffect(() => {
    if (themes.length === 0) return;
    // CLI --theme flag takes priority over config
    const themeId = cliTheme ?? config.display.theme;
    const resolved = resolveTheme(
      themeId,
      config.display.colorScheme,
      themes,
      renderer?.themeMode ?? null,
    );
    if (resolved.id !== theme.id) {
      setTheme(resolved);
    }
  }, [themes, cliTheme, config.display.theme, config.display.colorScheme, renderer]);

  useEffect(() => {
    if (isInitialized) {
      info("Application initialized");
      refreshAllProviders().then(() => setLastRefresh(Date.now()));
    }
  }, [isInitialized]);

  useEffect(() => {
    if (!isInitialized || refreshInterval <= 0) return;

    const interval = setInterval(() => {
      info("Auto-refresh triggered");
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
      <Header activeView={activeView} demoMode={demoMode} />

      {activeView === "dashboard" && <RealTimeDashboard />}
      {activeView === "providers" && <Dashboard />}
      {activeView === "trends" && <HistoricalTrendsView />}
      {activeView === "projects" && <ProjectsView />}

      <StatusBar
        lastRefresh={lastRefresh ?? 0}
        nextRefresh={lastRefresh ? lastRefresh + refreshInterval : 0}
        demoMode={demoMode}
      />

      {toast && config.notifications.toastsEnabled && (
        <Toast message={toast.message} type={toast.type} onDismiss={dismissToast} />
      )}

      {showCommandPalette && (
        <CommandPalette commands={commands} onClose={() => setShowCommandPalette(false)} />
      )}

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}

      {showDebugPanel && (
        <DebugPanel onClose={() => setShowDebugPanel(false)} inspectorData={inspectorData} />
      )}

      {isDrawerOpen && selectedSession && (
        <SessionDetailsDrawer session={selectedSession} onClose={hideDrawer} />
      )}
    </box>
  );
}

function ConfiguredApp({ cliPlugins, cliTheme }: { cliPlugins?: string[]; cliTheme?: string }) {
  const { config, isLoading } = useConfig();

  if (isLoading) {
    return null;
  }

  const themeId = cliTheme ?? config.display.theme;
  const initialTheme = builtinThemeList.find((t) => t.id === themeId);
  const themeProps = initialTheme ? { initialTheme } : {};

  return (
    <ThemeProvider {...themeProps} {...(cliTheme ? { cliTheme } : {})}>
      <TimeWindowProvider defaultWindow={config.display.defaultTimeWindow}>
        <ToastProvider>
          <PluginProvider {...(cliPlugins ? { cliPlugins } : {})}>
            <RealTimeActivityProvider>
              <AgentSessionProvider autoRefresh={true}>
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
    </ThemeProvider>
  );
}

export function App({
  debug = false,
  demoMode = false,
  demoSeed,
  demoPreset,
  cliPlugins,
  cliTheme,
}: AppProps) {
  const demoProviderProps: { demoMode: boolean; demoSeed?: number; demoPreset?: DemoPreset } = {
    demoMode,
  };
  if (demoSeed !== undefined) demoProviderProps.demoSeed = demoSeed;
  if (demoPreset !== undefined) demoProviderProps.demoPreset = demoPreset;

  return (
    <DemoModeProvider {...demoProviderProps}>
      <LogProvider debugEnabled={debug}>
        <InputProvider>
          <StorageProvider>
            <ConfigProvider>
              <ConfiguredApp
                {...(cliPlugins ? { cliPlugins } : {})}
                {...(cliTheme ? { cliTheme } : {})}
              />
            </ConfigProvider>
          </StorageProvider>
        </InputProvider>
      </LogProvider>
    </DemoModeProvider>
  );
}
