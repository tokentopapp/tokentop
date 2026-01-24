import { useState, useCallback } from 'react';
import { useKeyboard } from '@opentui/react';
import { useColors } from '../contexts/ThemeContext.tsx';
import { useToastContext } from '../contexts/ToastContext.tsx';
import { useConfig } from '../contexts/ConfigContext.tsx';
import { type AppConfig } from '@/config/schema.ts';

type SettingCategory = 'refresh' | 'display' | 'budgets' | 'alerts' | 'notifications';

interface SettingItem {
  key: string;
  label: string;
  category: SettingCategory;
  type: 'toggle' | 'select' | 'number';
  options?: string[];
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
    options: ['5m', '15m', '1h', '24h', '7d', '30d', 'all'],
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
    key: 'timeFormat',
    label: 'Time Format',
    category: 'display',
    type: 'select',
    options: ['12h', '24h'],
    getValue: (c) => c.display.timeFormat,
    setValue: (c, v) => ({ ...c, display: { ...c.display, timeFormat: v as '12h' | '24h' } }),
  },
  {
    key: 'dailyBudget',
    label: 'Daily Budget ($)',
    category: 'budgets',
    type: 'select',
    options: ['None', '$10', '$25', '$50', '$100', '$200'],
    getValue: (c) => {
      const b = c.budgets.daily;
      if (b === null) return 'None';
      return `$${b}`;
    },
    setValue: (c, v) => {
      const map: Record<string, number | null> = { 'None': null, '$10': 10, '$25': 25, '$50': 50, '$100': 100, '$200': 200 };
      return { ...c, budgets: { ...c.budgets, daily: map[v as string] ?? null } };
    },
  },
  {
    key: 'weeklyBudget',
    label: 'Weekly Budget ($)',
    category: 'budgets',
    type: 'select',
    options: ['None', '$50', '$100', '$200', '$500', '$1000'],
    getValue: (c) => {
      const b = c.budgets.weekly;
      if (b === null) return 'None';
      return `$${b}`;
    },
    setValue: (c, v) => {
      const map: Record<string, number | null> = { 'None': null, '$50': 50, '$100': 100, '$200': 200, '$500': 500, '$1000': 1000 };
      return { ...c, budgets: { ...c.budgets, weekly: map[v as string] ?? null } };
    },
  },
  {
    key: 'monthlyBudget',
    label: 'Monthly Budget ($)',
    category: 'budgets',
    type: 'select',
    options: ['None', '$100', '$250', '$500', '$1000', '$2000'],
    getValue: (c) => {
      const b = c.budgets.monthly;
      if (b === null) return 'None';
      return `$${b}`;
    },
    setValue: (c, v) => {
      const map: Record<string, number | null> = { 'None': null, '$100': 100, '$250': 250, '$500': 500, '$1000': 1000, '$2000': 2000 };
      return { ...c, budgets: { ...c.budgets, monthly: map[v as string] ?? null } };
    },
  },
  {
    key: 'budgetWarningPercent',
    label: 'Warning Threshold (%)',
    category: 'alerts',
    type: 'select',
    options: ['70%', '75%', '80%', '85%', '90%'],
    getValue: (c) => `${c.alerts.budgetWarningPercent}%`,
    setValue: (c, v) => {
      const percent = parseInt((v as string).replace('%', ''), 10);
      return { ...c, alerts: { ...c.alerts, budgetWarningPercent: percent } };
    },
  },
  {
    key: 'budgetCriticalPercent',
    label: 'Critical Threshold (%)',
    category: 'alerts',
    type: 'select',
    options: ['90%', '95%', '98%', '100%'],
    getValue: (c) => `${c.alerts.budgetCriticalPercent}%`,
    setValue: (c, v) => {
      const percent = parseInt((v as string).replace('%', ''), 10);
      return { ...c, alerts: { ...c.alerts, budgetCriticalPercent: percent } };
    },
  },
  {
    key: 'providerLimitWarning',
    label: 'Provider Limit Warning (%)',
    category: 'alerts',
    type: 'select',
    options: ['80%', '85%', '90%', '95%'],
    getValue: (c) => `${c.alerts.providerLimitWarningPercent}%`,
    setValue: (c, v) => {
      const percent = parseInt((v as string).replace('%', ''), 10);
      return { ...c, alerts: { ...c.alerts, providerLimitWarningPercent: percent } };
    },
  },
  {
    key: 'toastsEnabled',
    label: 'Show Toast Notifications',
    category: 'notifications',
    type: 'toggle',
    getValue: (c) => c.notifications.toastsEnabled,
    setValue: (c, v) => ({ ...c, notifications: { ...c.notifications, toastsEnabled: v as boolean } }),
  },
  {
    key: 'soundEnabled',
    label: 'Sound Alerts',
    category: 'notifications',
    type: 'toggle',
    getValue: (c) => c.notifications.soundEnabled,
    setValue: (c, v) => ({ ...c, notifications: { ...c.notifications, soundEnabled: v as boolean } }),
  },
];

const CATEGORIES: { id: SettingCategory; label: string }[] = [
  { id: 'refresh', label: 'Refresh' },
  { id: 'display', label: 'Display' },
  { id: 'budgets', label: 'Budgets' },
  { id: 'alerts', label: 'Alerts' },
  { id: 'notifications', label: 'Notifications' },
];

export function SettingsView() {
  const colors = useColors();
  const { showToast } = useToastContext();
  const { config, isLoading, updateConfig, resetToDefaults, saveNow } = useConfig();
  
  const [selectedCategory, setSelectedCategory] = useState<SettingCategory>('refresh');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [focusedPane, setFocusedPane] = useState<'categories' | 'settings'>('settings');
  
  const categorySettings = SETTINGS.filter(s => s.category === selectedCategory);
  
  const handleSave = useCallback(async () => {
    try {
      await saveNow();
      showToast('Settings saved');
    } catch {
      showToast('Failed to save settings', 'error');
    }
  }, [saveNow, showToast]);
  
  const handleReset = useCallback(() => {
    resetToDefaults();
    showToast('Reset to defaults');
  }, [resetToDefaults, showToast]);
  
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
    
    updateConfig(newConfig);
  }, [categorySettings, selectedIndex, config, updateConfig]);
  
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
          updateConfig(setting.setValue(config, setting.options[prevIdx]!));
        }
      } else if (key.name === 'right' || key.name === 'l') {
        const setting = categorySettings[selectedIndex];
        if (setting?.type === 'select' && setting.options) {
          const currentValue = setting.getValue(config) as string;
          const currentIdx = setting.options.indexOf(currentValue);
          const nextIdx = (currentIdx + 1) % setting.options.length;
          updateConfig(setting.setValue(config, setting.options[nextIdx]!));
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
