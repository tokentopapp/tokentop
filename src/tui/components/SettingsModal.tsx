import { useState, useCallback, useEffect, useMemo } from 'react';
import { useKeyboard, useTerminalDimensions } from '@opentui/react';
import { useColors, useTheme } from '../contexts/ThemeContext.tsx';
import { usePlugins } from '../contexts/PluginContext.tsx';
import { useToastContext } from '../contexts/ToastContext.tsx';
import { useConfig } from '../contexts/ConfigContext.tsx';
import { useDemoMode } from '../contexts/DemoModeContext.tsx';
import { useInputFocus } from '../contexts/InputContext.tsx';
import { ModalBackdrop, Z_INDEX } from './ModalBackdrop.tsx';
import { type AppConfig, type SparklineStyle, type SparklineOrientation } from '@/config/schema.ts';
import { parseCurrencyInput, formatBudgetDisplay } from '@/utils/currency.ts';

type SettingCategory = 'refresh' | 'display' | 'budgets' | 'alerts' | 'notifications';

interface SettingItem {
  key: string;
  label: string;
  category: SettingCategory;
  type: 'toggle' | 'select' | 'number';
  options?: string[];
  getValue: (config: AppConfig) => string | number | boolean | null;
  setValue: (config: AppConfig, value: string | number | boolean | null) => AppConfig;
}

const BASE_SETTINGS: SettingItem[] = [
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
    type: 'number',
    getValue: (c) => c.budgets.daily,
    setValue: (c, v) => ({ ...c, budgets: { ...c.budgets, daily: v as number | null } }),
  },
  {
    key: 'weeklyBudget',
    label: 'Weekly Budget ($)',
    category: 'budgets',
    type: 'number',
    getValue: (c) => c.budgets.weekly,
    setValue: (c, v) => ({ ...c, budgets: { ...c.budgets, weekly: v as number | null } }),
  },
  {
    key: 'monthlyBudget',
    label: 'Monthly Budget ($)',
    category: 'budgets',
    type: 'number',
    getValue: (c) => c.budgets.monthly,
    setValue: (c, v) => ({ ...c, budgets: { ...c.budgets, monthly: v as number | null } }),
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
  const { setTheme } = useTheme();
  const { themes } = usePlugins();
  const { showToast } = useToastContext();
  const { config, updateConfig, resetToDefaults, saveNow } = useConfig();
  const { demoMode, seed, preset } = useDemoMode();
  const { setInputFocused } = useInputFocus();
  const { width: termWidth, height: termHeight } = useTerminalDimensions();

  const [selectedCategory, setSelectedCategory] = useState<SettingCategory>('refresh');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [focusedPane, setFocusedPane] = useState<'categories' | 'settings'>('categories');
  
  const [editingSettingKey, setEditingSettingKey] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');

  const width = Math.min(termWidth - 4, 100);
  const height = Math.min(termHeight - 4, 28);
  
  // Calculate available height for settings list
  // Modal height - header(1) - footer(1) - outer padding(2) - inner borders(4) - title row with margin(2)
  const settingsAreaHeight = height - 1 - 1 - 2 - 4 - 2 - (demoMode ? 1 : 0);
  // Each setting takes 2 rows (height=1 + marginBottom=1)
  const visibleSettingsCount = Math.max(1, Math.floor(settingsAreaHeight / 2));

  const settings = useMemo(() => {
    const newSettings = [...BASE_SETTINGS];
    newSettings.push({
      key: 'theme',
      label: 'Theme',
      category: 'display',
      type: 'select',
      options: themes.map(t => t.id),
      getValue: (c) => c.display.theme,
      setValue: (c, v) => ({ ...c, display: { ...c.display, theme: v as string } }),
    });
    return newSettings;
  }, [themes]);

  const categorySettings = settings.filter(s => s.category === selectedCategory);
  
  // Calculate scroll offset to keep selected item visible
  const scrollOffset = useMemo(() => {
    if (categorySettings.length <= visibleSettingsCount) return 0;
    const maxOffset = categorySettings.length - visibleSettingsCount;
    if (selectedIndex < visibleSettingsCount - 1) return 0;
    return Math.min(selectedIndex - visibleSettingsCount + 2, maxOffset);
  }, [selectedIndex, categorySettings.length, visibleSettingsCount]);
  
  const visibleSettings = categorySettings.slice(scrollOffset, scrollOffset + visibleSettingsCount);
  const hasMoreAbove = scrollOffset > 0;
  const hasMoreBelow = scrollOffset + visibleSettingsCount < categorySettings.length;

  const applyThemeChange = useCallback((themeId: string) => {
    const newTheme = themes.find(t => t.id === themeId);
    if (newTheme) {
      setTheme(newTheme);
    }
  }, [themes, setTheme]);

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

  const startEditingNumber = useCallback(() => {
    const setting = categorySettings[selectedIndex];
    if (!setting || setting.type !== 'number') return;
    
    const currentValue = setting.getValue(config);
    setInputValue(currentValue === null ? '' : String(currentValue));
    setEditingSettingKey(setting.key);
  }, [categorySettings, selectedIndex, config]);

  const commitNumberEdit = useCallback(() => {
    if (editingSettingKey === null) return;
    
    const setting = categorySettings.find(s => s.key === editingSettingKey);
    if (!setting || setting.type !== 'number') {
      setEditingSettingKey(null);
      setInputValue('');
      return;
    }
    
    const parsed = inputValue.trim() === '' ? null : parseCurrencyInput(inputValue);
    updateConfig(setting.setValue(config, parsed));
    setEditingSettingKey(null);
    setInputValue('');
  }, [editingSettingKey, categorySettings, inputValue, config, updateConfig]);

  const cancelNumberEdit = useCallback(() => {
    setEditingSettingKey(null);
    setInputValue('');
  }, []);

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
      const newValue = setting.options[nextIdx]!;
      newConfig = setting.setValue(config, newValue);

      if (setting.key === 'theme') {
        applyThemeChange(newValue);
      }
    } else {
      return;
    }

    updateConfig(newConfig);
  }, [categorySettings, selectedIndex, config, updateConfig, applyThemeChange]);

  useKeyboard((key) => {
    if (editingSettingKey !== null) {
      if (key.ctrl && (key.name === 'p' || key.name === 's')) {
        return;
      }
      if (key.name === 'escape') {
        cancelNumberEdit();
        return;
      }
      if (key.name === 'return') {
        commitNumberEdit();
        return;
      }
      if (key.name === 'backspace') {
        setInputValue(prev => prev.slice(0, -1));
        return;
      }
      if (key.sequence && /^[0-9.]$/.test(key.sequence)) {
        setInputValue(prev => prev + key.sequence);
        return;
      }
      return;
    }

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
      } else if (key.name === 'return' || key.name === 'right' || key.name === 'l') {
        setFocusedPane('settings');
      }
      return;
    }

    if (focusedPane === 'settings') {
      if (key.name === 'down' || key.name === 'j') {
        setSelectedIndex(i => Math.min(i + 1, categorySettings.length - 1));
      } else if (key.name === 'up' || key.name === 'k') {
        setSelectedIndex(i => Math.max(i - 1, 0));
      } else if (key.name === 'return' || key.name === 'space') {
        const setting = categorySettings[selectedIndex];
        if (setting?.type === 'number') {
          startEditingNumber();
        } else {
          toggleCurrentSetting();
        }
      } else if (key.name === 'left' || key.name === 'h') {
        const setting = categorySettings[selectedIndex];
        if (setting?.type === 'select' && setting.options) {
          const currentValue = setting.getValue(config) as string;
          const currentIdx = setting.options.indexOf(currentValue);
          const prevIdx = (currentIdx - 1 + setting.options.length) % setting.options.length;
          const newValue = setting.options[prevIdx]!;
          updateConfig(setting.setValue(config, newValue));
          if (setting.key === 'theme') {
            applyThemeChange(newValue);
          }
        }
      } else if (key.name === 'right' || key.name === 'l') {
        const setting = categorySettings[selectedIndex];
        if (setting?.type === 'select' && setting.options) {
          const currentValue = setting.getValue(config) as string;
          const currentIdx = setting.options.indexOf(currentValue);
          const nextIdx = (currentIdx + 1) % setting.options.length;
          const newValue = setting.options[nextIdx]!;
          updateConfig(setting.setValue(config, newValue));
          if (setting.key === 'theme') {
            applyThemeChange(newValue);
          }
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
            overflow="hidden"
          >
            <box flexDirection="row" justifyContent="space-between" marginBottom={1} height={1}>
              <text fg={colors.textMuted}>
                {CATEGORIES.find(c => c.id === selectedCategory)?.label.toUpperCase()}
              </text>
              {(hasMoreAbove || hasMoreBelow) && (
                <text fg={colors.textSubtle}>
                  {hasMoreAbove ? '▲' : ' '}{hasMoreBelow ? '▼' : ' '}
                </text>
              )}
            </box>

            {visibleSettings.map((setting) => {
              const realIdx = categorySettings.findIndex(s => s.key === setting.key);
              const isSelected = realIdx === selectedIndex && focusedPane === 'settings';
              const value = setting.getValue(config);
              const isEditingThis = setting.type === 'number' && editingSettingKey === setting.key;

              let displayValue: string;
              if (setting.type === 'toggle') {
                displayValue = value ? '● ON' : '○ OFF';
              } else if (setting.type === 'select') {
                displayValue = `◂ ${value} ▸`;
              } else if (setting.type === 'number' && !isEditingThis) {
                displayValue = formatBudgetDisplay(value as number | null);
              } else {
                displayValue = String(value);
              }

              return (
                <box
                  key={setting.key}
                  flexDirection="row"
                  height={1}
                  marginBottom={1}
                  paddingLeft={1}
                  paddingRight={1}
                  {...(isSelected && !isEditingThis ? { backgroundColor: colors.primary } : {})}
                >
                  <text 
                    flexGrow={1}
                    fg={isSelected && !isEditingThis ? colors.background : colors.text}
                  >
                    {setting.label}
                  </text>
                  {isEditingThis ? (
                    <text fg={colors.text}>
                      ${inputValue}<span fg={colors.primary}>█</span>
                    </text>
                  ) : (
                    <text fg={isSelected ? colors.background : colors.textMuted}>
                      {displayValue}
                    </text>
                  )}
                </box>
              );
            })}
          </box>
        </box>

        <box flexDirection="row" height={1} paddingLeft={1} backgroundColor={colors.foreground}>
          <text fg={colors.textSubtle}>
            {editingSettingKey !== null 
              ? 'Type value  Enter:save  Esc:cancel'
              : 'Tab:switch  ↑↓:navigate  ←→:adjust  Enter:edit'}
          </text>
        </box>
      </box>
    </ModalBackdrop>
  );
}
