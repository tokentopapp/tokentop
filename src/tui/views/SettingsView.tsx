import { useState, useEffect, useCallback } from 'react';
import { useKeyboard } from '@opentui/react';
import * as fs from 'fs/promises';
import * as path from 'path';
import { useColors } from '../contexts/ThemeContext.tsx';

import { useToastContext } from '../contexts/ToastContext.tsx';
import { PATHS } from '@/storage/paths.ts';

interface AppConfig {
  configVersion: number;
  refresh: {
    intervalMs: number;
    pauseAutoRefresh: boolean;
  };
  display: {
    defaultTimeWindow: '5m' | '15m' | '1h' | '4h' | 'all';
    sidebarCollapsed: boolean;
    compactMode: boolean;
  };
  notifications: {
    toastsEnabled: boolean;
  };
}

const DEFAULT_CONFIG: AppConfig = {
  configVersion: 1,
  refresh: {
    intervalMs: 60000,
    pauseAutoRefresh: false,
  },
  display: {
    defaultTimeWindow: '5m',
    sidebarCollapsed: false,
    compactMode: false,
  },
  notifications: {
    toastsEnabled: true,
  },
};

type SettingCategory = 'refresh' | 'display' | 'notifications';

interface SettingItem {
  key: string;
  label: string;
  category: SettingCategory;
  type: 'toggle' | 'select' | 'number';
  options?: string[];
  min?: number;
  max?: number;
  step?: number;
  getValue: (config: AppConfig) => string | number | boolean;
  setValue: (config: AppConfig, value: string | number | boolean) => AppConfig;
}

const SETTINGS: SettingItem[] = [
  {
    key: 'intervalMs',
    label: 'Refresh Interval',
    category: 'refresh',
    type: 'select',
    options: ['30s', '1m', '2m', '5m'],
    getValue: (c) => {
      const ms = c.refresh.intervalMs;
      if (ms <= 30000) return '30s';
      if (ms <= 60000) return '1m';
      if (ms <= 120000) return '2m';
      return '5m';
    },
    setValue: (c, v) => {
      const map: Record<string, number> = { '30s': 30000, '1m': 60000, '2m': 120000, '5m': 300000 };
      return { ...c, refresh: { ...c.refresh, intervalMs: map[v as string] ?? 60000 } };
    },
  },
  {
    key: 'pauseAutoRefresh',
    label: 'Pause Auto-Refresh',
    category: 'refresh',
    type: 'toggle',
    getValue: (c) => c.refresh.pauseAutoRefresh,
    setValue: (c, v) => ({ ...c, refresh: { ...c.refresh, pauseAutoRefresh: v as boolean } }),
  },
  {
    key: 'defaultTimeWindow',
    label: 'Default Time Window',
    category: 'display',
    type: 'select',
    options: ['5m', '15m', '1h', '4h', 'all'],
    getValue: (c) => c.display.defaultTimeWindow,
    setValue: (c, v) => ({ ...c, display: { ...c.display, defaultTimeWindow: v as AppConfig['display']['defaultTimeWindow'] } }),
  },
  {
    key: 'sidebarCollapsed',
    label: 'Sidebar Collapsed',
    category: 'display',
    type: 'toggle',
    getValue: (c) => c.display.sidebarCollapsed,
    setValue: (c, v) => ({ ...c, display: { ...c.display, sidebarCollapsed: v as boolean } }),
  },
  {
    key: 'compactMode',
    label: 'Compact Mode',
    category: 'display',
    type: 'toggle',
    getValue: (c) => c.display.compactMode,
    setValue: (c, v) => ({ ...c, display: { ...c.display, compactMode: v as boolean } }),
  },
  {
    key: 'toastsEnabled',
    label: 'Show Toast Notifications',
    category: 'notifications',
    type: 'toggle',
    getValue: (c) => c.notifications.toastsEnabled,
    setValue: (c, v) => ({ ...c, notifications: { ...c.notifications, toastsEnabled: v as boolean } }),
  },
];

const CATEGORIES: { id: SettingCategory; label: string }[] = [
  { id: 'refresh', label: 'Refresh' },
  { id: 'display', label: 'Display' },
  { id: 'notifications', label: 'Notifications' },
];

function deepMerge(target: AppConfig, source: Partial<AppConfig>): AppConfig {
  return {
    configVersion: source.configVersion ?? target.configVersion,
    refresh: {
      ...target.refresh,
      ...(source.refresh ?? {}),
    },
    display: {
      ...target.display,
      ...(source.display ?? {}),
    },
    notifications: {
      ...target.notifications,
      ...(source.notifications ?? {}),
    },
  };
}

async function loadConfig(): Promise<AppConfig> {
  try {
    const content = await fs.readFile(PATHS.config.file, 'utf-8');
    const loaded = JSON.parse(content) as Partial<AppConfig>;
    return deepMerge(DEFAULT_CONFIG, loaded);
  } catch {
    return DEFAULT_CONFIG;
  }
}

async function saveConfig(config: AppConfig): Promise<void> {
  await fs.mkdir(path.dirname(PATHS.config.file), { recursive: true });
  const tempFile = PATHS.config.file + '.tmp';
  await fs.writeFile(tempFile, JSON.stringify(config, null, 2), 'utf-8');
  await fs.rename(tempFile, PATHS.config.file);
}

export function SettingsView() {
  const colors = useColors();
  const { showToast } = useToastContext();
  
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [selectedCategory, setSelectedCategory] = useState<SettingCategory>('refresh');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [focusedPane, setFocusedPane] = useState<'categories' | 'settings'>('settings');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  useEffect(() => {
    loadConfig().then((loaded) => {
      setConfig(loaded);
      setIsLoading(false);
    });
  }, []);
  
  const categorySettings = SETTINGS.filter(s => s.category === selectedCategory);
  
  const handleSave = useCallback(async () => {
    try {
      await saveConfig(config);
      setHasUnsavedChanges(false);
      showToast('Settings saved');
    } catch {
      showToast('Failed to save settings', 'error');
    }
  }, [config, showToast]);
  
  const handleReset = useCallback(() => {
    setConfig(DEFAULT_CONFIG);
    setHasUnsavedChanges(true);
    showToast('Reset to defaults');
  }, [showToast]);
  
  const toggleCurrentSetting = useCallback(() => {
    const setting = categorySettings[selectedIndex];
    if (!setting) return;
    
    const currentValue = setting.getValue(config);
    let newConfig: AppConfig;
    
    if (setting.type === 'toggle') {
      newConfig = setting.setValue(config, !currentValue);
    } else if (setting.type === 'select' && setting.options) {
      const currentIdx = setting.options.indexOf(currentValue as string);
      const nextIdx = (currentIdx + 1) % setting.options.length;
      newConfig = setting.setValue(config, setting.options[nextIdx]!);
    } else {
      return;
    }
    
    setConfig(newConfig);
    setHasUnsavedChanges(true);
  }, [categorySettings, selectedIndex, config]);
  
  useKeyboard((key) => {
    if (key.ctrl && key.name === 's') {
      handleSave();
      return;
    }
    
    if (key.shift && key.name === 'r') {
      handleReset();
      return;
    }
    
    if (key.name === 'tab') {
      setFocusedPane(p => p === 'categories' ? 'settings' : 'categories');
      return;
    }
    
    if (focusedPane === 'categories') {
      const catIdx = CATEGORIES.findIndex(c => c.id === selectedCategory);
      if (key.name === 'down' || key.name === 'j') {
        const nextIdx = Math.min(catIdx + 1, CATEGORIES.length - 1);
        setSelectedCategory(CATEGORIES[nextIdx]!.id);
        setSelectedIndex(0);
      } else if (key.name === 'up' || key.name === 'k') {
        const prevIdx = Math.max(catIdx - 1, 0);
        setSelectedCategory(CATEGORIES[prevIdx]!.id);
        setSelectedIndex(0);
      }
      return;
    }
    
    if (focusedPane === 'settings') {
      if (key.name === 'down' || key.name === 'j') {
        setSelectedIndex(i => Math.min(i + 1, categorySettings.length - 1));
      } else if (key.name === 'up' || key.name === 'k') {
        setSelectedIndex(i => Math.max(i - 1, 0));
      } else if (key.name === 'return' || key.name === 'space') {
        toggleCurrentSetting();
      } else if (key.name === 'left' || key.name === 'h') {
        const setting = categorySettings[selectedIndex];
        if (setting?.type === 'select' && setting.options) {
          const currentValue = setting.getValue(config) as string;
          const currentIdx = setting.options.indexOf(currentValue);
          const prevIdx = (currentIdx - 1 + setting.options.length) % setting.options.length;
          setConfig(setting.setValue(config, setting.options[prevIdx]!));
          setHasUnsavedChanges(true);
        }
      } else if (key.name === 'right' || key.name === 'l') {
        const setting = categorySettings[selectedIndex];
        if (setting?.type === 'select' && setting.options) {
          const currentValue = setting.getValue(config) as string;
          const currentIdx = setting.options.indexOf(currentValue);
          const nextIdx = (currentIdx + 1) % setting.options.length;
          setConfig(setting.setValue(config, setting.options[nextIdx]!));
          setHasUnsavedChanges(true);
        }
      }
    }
  });
  
  if (isLoading) {
    return (
      <box flexDirection="column" flexGrow={1} justifyContent="center" alignItems="center">
        <text fg={colors.textMuted}>Loading settings...</text>
      </box>
    );
  }
  
  return (
    <box flexDirection="column" flexGrow={1} padding={1} gap={1}>
      {hasUnsavedChanges && (
        <box height={1} justifyContent="center">
          <text fg={colors.warning}>● Unsaved changes - Press Ctrl+S to save</text>
        </box>
      )}
      
      <box flexDirection="row" gap={1} flexGrow={1}>
        <box 
          flexDirection="column" 
          width={20} 
          border 
          borderStyle={focusedPane === 'categories' ? 'double' : 'single'}
          borderColor={focusedPane === 'categories' ? colors.primary : colors.border}
          padding={1}
        >
          <text fg={colors.textMuted} marginBottom={1}>CATEGORIES</text>
          {CATEGORIES.map((cat) => {
            const isActive = cat.id === selectedCategory;
            const isFocusedActive = isActive && focusedPane === 'categories';
            return (
              <box key={cat.id} height={1}>
                <text 
                  fg={isFocusedActive ? colors.background : isActive ? colors.primary : colors.text}
                  {...(isFocusedActive ? { bg: colors.primary } : {})}
                >
                  {isActive ? '▸ ' : '  '}{cat.label}
                </text>
              </box>
            );
          })}
        </box>
        
        <box 
          flexDirection="column" 
          flexGrow={1}
          border 
          borderStyle={focusedPane === 'settings' ? 'double' : 'single'}
          borderColor={focusedPane === 'settings' ? colors.primary : colors.border}
          padding={1}
        >
          <text fg={colors.textMuted} marginBottom={1}>
            {CATEGORIES.find(c => c.id === selectedCategory)?.label.toUpperCase()}
          </text>
          
          {categorySettings.map((setting, idx) => {
            const isSelected = idx === selectedIndex && focusedPane === 'settings';
            const value = setting.getValue(config);
            
            return (
              <box 
                key={setting.key} 
                flexDirection="row" 
                justifyContent="space-between" 
                height={2}
                paddingLeft={1}
                paddingRight={1}
                {...(isSelected ? { backgroundColor: colors.primary } : {})}
              >
                <text fg={isSelected ? colors.background : colors.text}>
                  {setting.label}
                </text>
                <text fg={isSelected ? colors.background : colors.textMuted}>
                  {setting.type === 'toggle' 
                    ? (value ? '● ON' : '○ OFF')
                    : setting.type === 'select'
                      ? `◂ ${value} ▸`
                      : String(value)
                  }
                </text>
              </box>
            );
          })}
        </box>
      </box>
      
      <box flexDirection="row" height={1} gap={2} paddingLeft={1}>
        <text fg={colors.textSubtle}>Tab: switch pane</text>
        <text fg={colors.textSubtle}>↑↓: navigate</text>
        <text fg={colors.textSubtle}>Enter/Space: toggle</text>
        <text fg={colors.textSubtle}>←→: cycle</text>
        <text fg={colors.textSubtle}>Ctrl+S: save</text>
        <text fg={colors.textSubtle}>Shift+R: reset</text>
      </box>
    </box>
  );
}
