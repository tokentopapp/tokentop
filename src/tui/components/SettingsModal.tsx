import { useState, useCallback, useEffect } from 'react';
import { useKeyboard, useTerminalDimensions } from '@opentui/react';
import { useColors } from '../contexts/ThemeContext.tsx';
import { useToastContext } from '../contexts/ToastContext.tsx';
import { useConfig } from '../contexts/ConfigContext.tsx';
import { useDemoMode } from '../contexts/DemoModeContext.tsx';
import { useInputFocus } from '../contexts/InputContext.tsx';
import { ModalBackdrop, Z_INDEX } from './ModalBackdrop.tsx';
import { type AppConfig, type SparklineStyle, type SparklineOrientation } from '@/config/schema.ts';

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
    key: 'sparklineStyle',
    label: 'Sparkline Style',
    category: 'display',
    type: 'select',
    options: ['braille', 'block'],
    getValue: (c) => c.display.sparkline.style,
    setValue: (c, v) => ({ 
      ...c, 
      display: { 
        ...c.display, 
        sparkline: { ...c.display.sparkline, style: v as SparklineStyle } 
      } 
    }),
  },
  {
    key: 'sparklineOrientation',
    label: 'Sparkline Direction',
    category: 'display',
    type: 'select',
    options: ['up', 'down'],
    getValue: (c) => c.display.sparkline.orientation,
    setValue: (c, v) => ({ 
      ...c, 
      display: { 
        ...c.display, 
        sparkline: { ...c.display.sparkline, orientation: v as SparklineOrientation } 
      } 
    }),
  },
  {
    key: 'sparklineBaseline',
    label: 'Sparkline Baseline',
    category: 'display',
    type: 'toggle',
    getValue: (c) => c.display.sparkline.showBaseline,
    setValue: (c, v) => ({ 
      ...c, 
      display: { 
        ...c.display, 
        sparkline: { ...c.display.sparkline, showBaseline: v as boolean } 
      } 
    }),
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
    key: 'warningPercent',
    label: 'Warning Threshold (%)',
    category: 'alerts',
    type: 'select',
    options: ['55%', '60%', '65%', '70%', '75%', '80%', '85%', '90%', '95%'],
    getValue: (c) => `${c.alerts.warningPercent}%`,
    setValue: (c, v) => {
      const percent = parseInt((v as string).replace('%', ''), 10);
      return { ...c, alerts: { ...c.alerts, warningPercent: percent } };
    },
  },
  {
    key: 'criticalPercent',
    label: 'Critical Threshold (%)',
    category: 'alerts',
    type: 'select',
    options: ['75%', '80%', '85%', '90%', '95%', '98%', '100%'],
    getValue: (c) => `${c.alerts.criticalPercent}%`,
    setValue: (c, v) => {
      const percent = parseInt((v as string).replace('%', ''), 10);
      return { ...c, alerts: { ...c.alerts, criticalPercent: percent } };
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

interface SettingsModalProps {
  onClose: () => void;
}

export function SettingsModal({ onClose }: SettingsModalProps) {
  const colors = useColors();
  const { showToast } = useToastContext();
  const { config, updateConfig, resetToDefaults, saveNow } = useConfig();
  const { demoMode, seed, preset } = useDemoMode();
  const { setInputFocused } = useInputFocus();
  const { width: termWidth, height: termHeight } = useTerminalDimensions();

  const [selectedCategory, setSelectedCategory] = useState<SettingCategory>('refresh');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [focusedPane, setFocusedPane] = useState<'categories' | 'settings'>('settings');

  const width = Math.min(termWidth - 4, 100);
  const height = Math.min(termHeight - 4, 28);

  const categorySettings = SETTINGS.filter(s => s.category === selectedCategory);

  useEffect(() => {
    setInputFocused(true);
    return () => setInputFocused(false);
  }, [setInputFocused]);

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
    if (key.name === 'escape') {
      onClose();
      return;
    }

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

  return (
    <ModalBackdrop zIndex={Z_INDEX.MODAL}>
      <box
        width={width}
        height={height}
        border
        borderStyle="double"
        borderColor={colors.primary}
        flexDirection="column"
        backgroundColor={colors.background}
        overflow="hidden"
      >
        <box
          flexDirection="row"
          justifyContent="space-between"
          paddingLeft={1}
          paddingRight={1}
          backgroundColor={colors.foreground}
          height={1}
          flexShrink={0}
        >
          <text fg={colors.primary}><strong>SETTINGS</strong></text>
          <text fg={colors.textSubtle}>Esc:close  ^S:save  Shift+R:reset</text>
        </box>

        {demoMode && (
          <box flexDirection="row" height={1} paddingLeft={1} gap={2}>
            <text fg={colors.warning}>DEMO MODE</text>
            <text fg={colors.textMuted}>
              Seed: {seed ?? 'default'} | Preset: {preset ?? 'normal'}
            </text>
          </box>
        )}

        <box flexDirection="row" gap={1} flexGrow={1} padding={1}>
          <box
            flexDirection="column"
            width={20}
            border
            borderStyle={focusedPane === 'categories' ? 'double' : 'single'}
            borderColor={focusedPane === 'categories' ? colors.primary : colors.border}
            padding={1}
          >
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
            <text fg={colors.textMuted} marginBottom={1} height={1}>
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

        <box flexDirection="row" height={1} paddingLeft={1} backgroundColor={colors.foreground}>
          <text fg={colors.textSubtle}>Tab:switch  ↑↓:navigate  ←→:adjust  Enter:toggle</text>
        </box>
      </box>
    </ModalBackdrop>
  );
}
