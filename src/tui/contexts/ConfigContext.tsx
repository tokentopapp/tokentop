import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { loadConfig, saveConfig, DEFAULT_CONFIG, type AppConfig } from '@/config/schema.ts';
import { useDemoMode } from './DemoModeContext.tsx';

interface ConfigContextValue {
  config: AppConfig;
  isLoading: boolean;
  updateConfig: (updates: Partial<AppConfig>) => void;
  updateRefresh: (updates: Partial<AppConfig['refresh']>) => void;
  updateDisplay: (updates: Partial<AppConfig['display']>) => void;
  updateNotifications: (updates: Partial<AppConfig['notifications']>) => void;
  resetToDefaults: () => void;
  saveNow: () => Promise<void>;
}

const ConfigContext = createContext<ConfigContextValue | null>(null);

interface ConfigProviderProps {
  children: ReactNode;
  /** For testing: skip async loading and use this config directly */
  initialConfig?: AppConfig;
}

export function ConfigProvider({ children, initialConfig }: ConfigProviderProps) {
  const { demoMode } = useDemoMode();
  const demoConfig: AppConfig = {
    ...DEFAULT_CONFIG,
    refresh: {
      ...DEFAULT_CONFIG.refresh,
      intervalMs: 5000,
      pauseAutoRefresh: false,
    },
    display: {
      ...DEFAULT_CONFIG.display,
      defaultTimeWindow: '1h',
      sidebarCollapsed: false,
    },
    budgets: {
      daily: 50,
      weekly: 200,
      monthly: 800,
      currency: 'USD',
    },
    alerts: {
      ...DEFAULT_CONFIG.alerts,
      criticalPercent: 90,
    },
  };
  const [config, setConfig] = useState<AppConfig>(initialConfig ?? (demoMode ? demoConfig : DEFAULT_CONFIG));
  const [isLoading, setIsLoading] = useState(!initialConfig);
  const [pendingSave, setPendingSave] = useState(false);

  useEffect(() => {
    if (initialConfig) return; // Skip loading if initial config provided
    if (demoMode) {
      setConfig(demoConfig);
      setIsLoading(false);
      return;
    }
    loadConfig().then((loaded) => {
      setConfig(loaded);
      setIsLoading(false);
    });
  }, [initialConfig, demoMode]);

  useEffect(() => {
    if (demoMode || isLoading || !pendingSave) return;

    const timeout = setTimeout(() => {
      saveConfig(config).catch(() => {});
      setPendingSave(false);
    }, 500);

    return () => clearTimeout(timeout);
  }, [config, isLoading, pendingSave]);

  const updateConfig = useCallback((updates: Partial<AppConfig>) => {
    setConfig((prev) => ({ ...prev, ...updates }));
    setPendingSave(true);
  }, []);

  const updateRefresh = useCallback((updates: Partial<AppConfig['refresh']>) => {
    setConfig((prev) => ({
      ...prev,
      refresh: { ...prev.refresh, ...updates },
    }));
    setPendingSave(true);
  }, []);

  const updateDisplay = useCallback((updates: Partial<AppConfig['display']>) => {
    setConfig((prev) => ({
      ...prev,
      display: { ...prev.display, ...updates },
    }));
    setPendingSave(true);
  }, []);

  const updateNotifications = useCallback((updates: Partial<AppConfig['notifications']>) => {
    setConfig((prev) => ({
      ...prev,
      notifications: { ...prev.notifications, ...updates },
    }));
    setPendingSave(true);
  }, []);

  const resetToDefaults = useCallback(() => {
    setConfig(DEFAULT_CONFIG);
    setPendingSave(true);
  }, []);

  const saveNow = useCallback(async () => {
    if (demoMode) return;
    await saveConfig(config);
    setPendingSave(false);
  }, [config, demoMode]);

  return (
    <ConfigContext.Provider
      value={{
        config,
        isLoading,
        updateConfig,
        updateRefresh,
        updateDisplay,
        updateNotifications,
        resetToDefaults,
        saveNow,
      }}
    >
      {children}
    </ConfigContext.Provider>
  );
}

export function useConfig(): ConfigContextValue {
  const context = useContext(ConfigContext);
  if (!context) {
    throw new Error('useConfig must be used within a ConfigProvider');
  }
  return context;
}
