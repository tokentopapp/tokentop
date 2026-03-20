import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import type { ConfigField, PluginType } from "@tokentop/plugin-sdk";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AppConfig, SparklineOrientation, SparklineStyle } from "@/config/schema.ts";
import { notificationBus } from "@/plugins/notification-bus.ts";
import { formatBudgetDisplay, parseCurrencyInput } from "@/utils/currency.ts";
import { useConfig } from "../contexts/ConfigContext.tsx";
import { useDemoMode } from "../contexts/DemoModeContext.tsx";
import { useInputFocus } from "../contexts/InputContext.tsx";
import { usePlugins } from "../contexts/PluginContext.tsx";
import { useColors, useTheme } from "../contexts/ThemeContext.tsx";
import { useToastContext } from "../contexts/ToastContext.tsx";
import { ModalBackdrop, Z_INDEX } from "./ModalBackdrop.tsx";
import { ThemePicker } from "./ThemePicker.tsx";

type SettingCategory = "refresh" | "display" | "budgets" | "alerts" | "notifications" | "plugins";

interface SettingItem {
  key: string;
  label: string;
  description?: string;
  category: SettingCategory;
  pluginId?: string;
  type: "toggle" | "select" | "number" | "action";
  options?: string[];
  getValue: (config: AppConfig) => string | number | boolean | null;
  setValue: (config: AppConfig, value: string | number | boolean | null) => AppConfig;
  onAction?: () => void;
}

const BASE_SETTINGS: SettingItem[] = [
  {
    key: "intervalMs",
    label: "Refresh Interval",
    category: "refresh",
    type: "select",
    options: ["30s", "1m", "2m", "5m"],
    getValue: (c) => {
      const ms = c.refresh.intervalMs;
      if (ms <= 30000) return "30s";
      if (ms <= 60000) return "1m";
      if (ms <= 120000) return "2m";
      return "5m";
    },
    setValue: (c, v) => {
      const map: Record<string, number> = { "30s": 30000, "1m": 60000, "2m": 120000, "5m": 300000 };
      return { ...c, refresh: { ...c.refresh, intervalMs: map[v as string] ?? 60000 } };
    },
  },
  {
    key: "pauseAutoRefresh",
    label: "Pause Auto-Refresh",
    category: "refresh",
    type: "toggle",
    getValue: (c) => c.refresh.pauseAutoRefresh,
    setValue: (c, v) => ({ ...c, refresh: { ...c.refresh, pauseAutoRefresh: v as boolean } }),
  },
  {
    key: "defaultTimeWindow",
    label: "Default Time Window",
    category: "display",
    type: "select",
    options: ["5m", "15m", "1h", "24h", "7d", "30d", "all"],
    getValue: (c) => c.display.defaultTimeWindow,
    setValue: (c, v) => ({
      ...c,
      display: { ...c.display, defaultTimeWindow: v as AppConfig["display"]["defaultTimeWindow"] },
    }),
  },
  {
    key: "sidebarCollapsed",
    label: "Sidebar Collapsed",
    category: "display",
    type: "toggle",
    getValue: (c) => c.display.sidebarCollapsed,
    setValue: (c, v) => ({ ...c, display: { ...c.display, sidebarCollapsed: v as boolean } }),
  },
  {
    key: "timeFormat",
    label: "Time Format",
    category: "display",
    type: "select",
    options: ["12h", "24h"],
    getValue: (c) => c.display.timeFormat,
    setValue: (c, v) => ({ ...c, display: { ...c.display, timeFormat: v as "12h" | "24h" } }),
  },
  {
    key: "sparklineStyle",
    label: "Sparkline Style",
    category: "display",
    type: "select",
    options: ["braille", "block"],
    getValue: (c) => c.display.sparkline.style,
    setValue: (c, v) => ({
      ...c,
      display: {
        ...c.display,
        sparkline: { ...c.display.sparkline, style: v as SparklineStyle },
      },
    }),
  },
  {
    key: "sparklineOrientation",
    label: "Sparkline Direction",
    category: "display",
    type: "select",
    options: ["up", "down"],
    getValue: (c) => c.display.sparkline.orientation,
    setValue: (c, v) => ({
      ...c,
      display: {
        ...c.display,
        sparkline: { ...c.display.sparkline, orientation: v as SparklineOrientation },
      },
    }),
  },
  {
    key: "sparklineBaseline",
    label: "Sparkline Baseline",
    category: "display",
    type: "toggle",
    getValue: (c) => c.display.sparkline.showBaseline,
    setValue: (c, v) => ({
      ...c,
      display: {
        ...c.display,
        sparkline: { ...c.display.sparkline, showBaseline: v as boolean },
      },
    }),
  },
  {
    key: "theme",
    label: "Theme",
    category: "display",
    type: "select",
    options: [], // Handled by ThemePicker
    getValue: (c) => c.display.theme,
    setValue: (c) => c, // Handled by ThemePicker
  },
  {
    key: "dailyBudget",
    label: "Daily Budget ($)",
    category: "budgets",
    type: "number",
    getValue: (c) => c.budgets.daily,
    setValue: (c, v) => ({ ...c, budgets: { ...c.budgets, daily: v as number | null } }),
  },
  {
    key: "weeklyBudget",
    label: "Weekly Budget ($)",
    category: "budgets",
    type: "number",
    getValue: (c) => c.budgets.weekly,
    setValue: (c, v) => ({ ...c, budgets: { ...c.budgets, weekly: v as number | null } }),
  },
  {
    key: "monthlyBudget",
    label: "Monthly Budget ($)",
    category: "budgets",
    type: "number",
    getValue: (c) => c.budgets.monthly,
    setValue: (c, v) => ({ ...c, budgets: { ...c.budgets, monthly: v as number | null } }),
  },
  {
    key: "warningPercent",
    label: "Warning Threshold (%)",
    category: "alerts",
    type: "select",
    options: ["55%", "60%", "65%", "70%", "75%", "80%", "85%", "90%", "95%"],
    getValue: (c) => `${c.alerts.warningPercent}%`,
    setValue: (c, v) => {
      const percent = parseInt((v as string).replace("%", ""), 10);
      return { ...c, alerts: { ...c.alerts, warningPercent: percent } };
    },
  },
  {
    key: "criticalPercent",
    label: "Critical Threshold (%)",
    category: "alerts",
    type: "select",
    options: ["75%", "80%", "85%", "90%", "95%", "98%", "100%"],
    getValue: (c) => `${c.alerts.criticalPercent}%`,
    setValue: (c, v) => {
      const percent = parseInt((v as string).replace("%", ""), 10);
      return { ...c, alerts: { ...c.alerts, criticalPercent: percent } };
    },
  },
  {
    key: "toastsEnabled",
    label: "Show Toast Notifications",
    category: "notifications",
    type: "toggle",
    getValue: (c) => c.notifications.toastsEnabled,
    setValue: (c, v) => ({
      ...c,
      notifications: { ...c.notifications, toastsEnabled: v as boolean },
    }),
  },
  {
    key: "soundEnabled",
    label: "Sound Alerts",
    category: "notifications",
    type: "toggle",
    getValue: (c) => c.notifications.soundEnabled,
    setValue: (c, v) => ({
      ...c,
      notifications: { ...c.notifications, soundEnabled: v as boolean },
    }),
  },
  {
    key: "testNotification",
    label: "Test Notifications",
    description: "Send a test notification to verify toast, flash, and sound alerts are working.",
    category: "notifications",
    type: "action",
    onAction: () => void notificationBus.testNotification(),
    getValue: () => "▸ Run",
    setValue: (c) => c,
  },
];

const CATEGORIES: { id: SettingCategory; label: string }[] = [
  { id: "refresh", label: "Refresh" },
  { id: "display", label: "Display" },
  { id: "budgets", label: "Budgets" },
  { id: "alerts", label: "Alerts" },
  { id: "notifications", label: "Notifications" },
  { id: "plugins", label: "Plugins" },
];

function buildPluginSettings(
  plugins: Array<{ id: string; name: string; configSchema?: Record<string, ConfigField> }>,
): SettingItem[] {
  const items: SettingItem[] = [];
  for (const plugin of plugins) {
    if (!plugin.configSchema) continue;
    for (const [fieldKey, field] of Object.entries(plugin.configSchema)) {
      const settingKey = `${plugin.id}.${fieldKey}`;
      // Short label for the setting row; long description shown in help area
      const label = field.label ?? fieldKey;
      const description = field.description;

      const getPluginValue = (c: AppConfig): unknown => {
        const pluginCfg = c.pluginConfig[plugin.id];
        const raw = pluginCfg?.[fieldKey];
        return raw ?? field.default;
      };

      const setPluginValue = (c: AppConfig, value: unknown): AppConfig => ({
        ...c,
        pluginConfig: {
          ...c.pluginConfig,
          [plugin.id]: {
            ...(c.pluginConfig[plugin.id] ?? {}),
            [fieldKey]: value,
          },
        },
      });

      const baseItem: Omit<SettingItem, "type" | "getValue" | "setValue"> = {
        key: settingKey,
        label,
        ...(description != null ? { description } : {}),
        category: "plugins" as SettingCategory,
        pluginId: plugin.id,
      };

      if (field.type === "boolean") {
        items.push({
          ...baseItem,
          type: "toggle",
          getValue: (c) => getPluginValue(c) as boolean,
          setValue: (c, v) => setPluginValue(c, v),
        });
      } else if (field.type === "select" && field.options) {
        items.push({
          ...baseItem,
          type: "select",
          options: field.options.map((o) => o.label),
          getValue: (c) => {
            const val = getPluginValue(c) as string;
            const opt = field.options?.find((o) => o.value === val);
            return opt?.label ?? val ?? "";
          },
          setValue: (c, v) => {
            const opt = field.options?.find((o) => o.label === v);
            return setPluginValue(c, opt?.value ?? v);
          },
        });
      } else if (field.type === "number") {
        items.push({
          ...baseItem,
          type: "number",
          getValue: (c) => (getPluginValue(c) as number) ?? 0,
          setValue: (c, v) => setPluginValue(c, v),
        });
      } else {
        items.push({
          ...baseItem,
          type: "select",
          getValue: (c) => String(getPluginValue(c) ?? ""),
          setValue: (c, v) => setPluginValue(c, v),
        });
      }
    }
  }
  return items;
}

interface SettingsModalProps {
  onClose: () => void;
}

export function SettingsModal({ onClose }: SettingsModalProps) {
  const colors = useColors();
  const { setPreviewTheme } = useTheme();
  const { providers, agents, themes, notifications } = usePlugins();
  const { showToast } = useToastContext();
  const { config, updateConfig, resetToDefaults, saveNow } = useConfig();
  const { demoMode, seed, preset } = useDemoMode();
  const { setInputFocused } = useInputFocus();
  const { width: termWidth, height: termHeight } = useTerminalDimensions();

  const [selectedCategory, setSelectedCategory] = useState<SettingCategory>("refresh");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedPluginId, setSelectedPluginId] = useState<string | null>(null);
  const [isPluginsExpanded, setIsPluginsExpanded] = useState(false);
  const [focusedPane, setFocusedPane] = useState<"categories" | "settings">("categories");
  const [showThemePicker, setShowThemePicker] = useState(false);

  const [editingSettingKey, setEditingSettingKey] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");

  const width = Math.min(termWidth - 4, 100);
  const height = Math.min(termHeight - 4, 28);

  // Calculate available height for settings list
  // Modal height - header(1) - footer(1) - outer padding(2) - inner borders(4) - title row with margin(2) - help area(4)
  const helpAreaHeight = 4; // separator(1) + 3 lines of description text
  const settingsAreaHeight = height - 1 - 1 - 2 - 4 - 2 - helpAreaHeight - (demoMode ? 1 : 0);
  // Each setting takes 2 rows (height=1 + marginBottom=1)
  const visibleSettingsCount = Math.max(1, Math.floor(settingsAreaHeight / 2));

  const pluginsByType = useMemo(() => {
    const allPlugins = [
      ...Array.from(providers.values()).map((p) => p.plugin),
      ...agents,
      ...themes,
      ...notifications,
    ].filter((p) => p.configSchema && Object.keys(p.configSchema).length > 0);

    const grouped = new Map<PluginType, typeof allPlugins>();
    for (const p of allPlugins) {
      const list = grouped.get(p.type) ?? [];
      list.push(p);
      grouped.set(p.type, list);
    }
    // Sort plugins within each group
    for (const list of grouped.values()) {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }
    return grouped;
  }, [providers, agents, themes, notifications]);

  const availablePlugins = useMemo(() => {
    return [...pluginsByType.values()].flat();
  }, [pluginsByType]);

  const pluginSettings = useMemo(() => {
    return buildPluginSettings(availablePlugins);
  }, [availablePlugins]);

  const TYPE_LABELS: Record<PluginType, string> = {
    provider: "Providers",
    agent: "Agents",
    theme: "Themes",
    notification: "Notifications",
  };

  // Stable ordering for plugin type groups in sidebar
  const TYPE_ORDER: PluginType[] = ["provider", "agent", "theme", "notification"];

  type NavItem =
    | { type: "category"; id: SettingCategory; label: string }
    | { type: "pluginTypeHeader"; pluginType: PluginType; label: string }
    | { type: "plugin"; id: string; label: string };

  const navItems = useMemo<NavItem[]>(() => {
    const items: NavItem[] = [];
    for (const cat of CATEGORIES) {
      items.push({ type: "category", id: cat.id, label: cat.label });
      if (cat.id === "plugins" && isPluginsExpanded) {
        for (const pt of TYPE_ORDER) {
          const pluginsOfType = pluginsByType.get(pt);
          if (!pluginsOfType || pluginsOfType.length === 0) continue;
          items.push({ type: "pluginTypeHeader", pluginType: pt, label: TYPE_LABELS[pt] });
          for (const p of pluginsOfType) {
            items.push({ type: "plugin", id: p.id, label: p.name });
          }
        }
      }
    }
    return items;
  }, [isPluginsExpanded, pluginsByType]);

  const settings = useMemo(() => [...BASE_SETTINGS, ...pluginSettings], [pluginSettings]);

  const categorySettings = useMemo(() => {
    if (selectedCategory === "plugins" && selectedPluginId) {
      return settings.filter((s) => s.category === "plugins" && s.pluginId === selectedPluginId);
    }
    return settings.filter((s) => s.category === selectedCategory && !s.pluginId);
  }, [settings, selectedCategory, selectedPluginId]);

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
  const focusedDescription = useMemo(() => {
    if (focusedPane !== "settings") return null;
    const setting = categorySettings[selectedIndex];
    const desc = setting?.description ?? null;
    if (!desc) return null;

    // Truncate to fit 3 lines with ellipsis if needed
    // Help area usable width: total width - sidebar(20) - borders(2) - outer padding(2) - help paddingX(2) - inner padding(2)
    const lineWidth = Math.max(20, width - 20 - 2 - 2 - 2 - 2);
    const maxChars = lineWidth * 3;
    if (desc.length <= maxChars) return desc;
    return desc.slice(0, maxChars - 1) + "\u2026";
  }, [focusedPane, categorySettings, selectedIndex, width]);

  useEffect(() => {
    setInputFocused(true);
    return () => setInputFocused(false);
  }, [setInputFocused]);

  const handleSave = useCallback(async () => {
    try {
      await saveNow();
      showToast("Settings saved");
    } catch {
      showToast("Failed to save settings", "error");
    }
  }, [saveNow, showToast]);

  const handleReset = useCallback(() => {
    resetToDefaults();
    showToast("Reset to defaults");
  }, [resetToDefaults, showToast]);

  const startEditingNumber = useCallback(() => {
    const setting = categorySettings[selectedIndex];
    if (!setting || setting.type !== "number") return;

    const currentValue = setting.getValue(config);
    setInputValue(currentValue === null ? "" : String(currentValue));
    setEditingSettingKey(setting.key);
  }, [categorySettings, selectedIndex, config]);

  const commitNumberEdit = useCallback(() => {
    if (editingSettingKey === null) return;

    const setting = categorySettings.find((s) => s.key === editingSettingKey);
    if (!setting || setting.type !== "number") {
      setEditingSettingKey(null);
      setInputValue("");
      return;
    }

    const parsed = inputValue.trim() === "" ? null : parseCurrencyInput(inputValue);
    updateConfig(setting.setValue(config, parsed));
    setEditingSettingKey(null);
    setInputValue("");
  }, [editingSettingKey, categorySettings, inputValue, config, updateConfig]);

  const cancelNumberEdit = useCallback(() => {
    setEditingSettingKey(null);
    setInputValue("");
  }, []);

  const toggleCurrentSetting = useCallback(() => {
    const setting = categorySettings[selectedIndex];
    if (!setting) return;

    const currentValue = setting.getValue(config);
    let newConfig: AppConfig;

    if (setting.type === "toggle") {
      newConfig = setting.setValue(config, !currentValue);
    } else if (setting.type === "select" && setting.options && setting.options.length > 0) {
      const currentIdx = setting.options.indexOf(currentValue as string);
      const nextIdx = (currentIdx + 1) % setting.options.length;
      const newValue = setting.options[nextIdx]!;
      newConfig = setting.setValue(config, newValue);
    } else {
      return;
    }

    updateConfig(newConfig);
  }, [categorySettings, selectedIndex, config, updateConfig]);

  useKeyboard((key) => {
    if (showThemePicker) return;

    if (editingSettingKey !== null) {
      if (key.ctrl && (key.name === "p" || key.name === "s")) {
        return;
      }
      if (key.name === "escape") {
        cancelNumberEdit();
        return;
      }
      if (key.name === "return") {
        commitNumberEdit();
        return;
      }
      if (key.name === "backspace") {
        setInputValue((prev) => prev.slice(0, -1));
        return;
      }
      if (key.sequence && /^[0-9.]$/.test(key.sequence)) {
        setInputValue((prev) => prev + key.sequence);
        return;
      }
      return;
    }

    if (key.name === "escape") {
      onClose();
      return;
    }

    if (key.ctrl && key.name === "s") {
      handleSave();
      return;
    }

    if (key.shift && key.name === "r") {
      handleReset();
      return;
    }

    if (key.name === "tab") {
      setFocusedPane((p) => (p === "categories" ? "settings" : "categories"));
      return;
    }

    if (focusedPane === "categories") {
      // Find current position — skip headers when matching
      const currentIdx = navItems.findIndex((item) =>
        item.type === "category"
          ? item.id === selectedCategory && (item.id !== "plugins" || !selectedPluginId)
          : item.type === "plugin"
            ? item.id === selectedPluginId
            : false,
      );

      // Helper: find next focusable item (skip pluginTypeHeader)
      const findNext = (from: number, dir: 1 | -1): number => {
        let idx = from + dir;
        while (idx >= 0 && idx < navItems.length) {
          if (navItems[idx]!.type !== "pluginTypeHeader") return idx;
          idx += dir;
        }
        return from; // no focusable item found, stay put
      };

      if (key.name === "down" || key.name === "j") {
        const nextIdx = findNext(currentIdx, 1);
        const nextItem = navItems[nextIdx];
        if (nextItem && nextIdx !== currentIdx) {
          if (nextItem.type === "category") {
            setSelectedCategory(nextItem.id);
            setSelectedPluginId(null);
            if (nextItem.id === "plugins") {
              setIsPluginsExpanded(true);
            }
          } else if (nextItem.type === "plugin") {
            setSelectedPluginId(nextItem.id);
          }
          setSelectedIndex(0);
        }
      } else if (key.name === "up" || key.name === "k") {
        const prevIdx = findNext(currentIdx, -1);
        const prevItem = navItems[prevIdx];
        if (prevItem && prevIdx !== currentIdx) {
          if (prevItem.type === "category") {
            setSelectedCategory(prevItem.id);
            setSelectedPluginId(null);
            // Collapse plugins if navigating up from first plugin child to Plugins parent
            if (prevItem.id === "plugins" && navItems[currentIdx]?.type === "plugin") {
              setIsPluginsExpanded(false);
            }
          } else if (prevItem.type === "plugin") {
            setSelectedPluginId(prevItem.id);
          }
          setSelectedIndex(0);
        }
      } else if (key.name === "return" || key.name === "right" || key.name === "l") {
        const currentItem = navItems[currentIdx];
        if (currentItem?.type === "category" && currentItem.id === "plugins") {
          if (!isPluginsExpanded) {
            setIsPluginsExpanded(true);
          } else if (key.name === "return") {
            setIsPluginsExpanded((p) => !p);
          }
        } else if (selectedPluginId || selectedCategory !== "plugins") {
          setFocusedPane("settings");
        }
      } else if (key.name === "left" || key.name === "h") {
        if (selectedPluginId) {
          setSelectedPluginId(null);
          setSelectedIndex(0);
        } else if (selectedCategory === "plugins" && isPluginsExpanded) {
          setIsPluginsExpanded(false);
        }
      }
      return;
    }

    if (focusedPane === "settings") {
      if (key.name === "down" || key.name === "j") {
        setSelectedIndex((i) => Math.min(i + 1, categorySettings.length - 1));
      } else if (key.name === "up" || key.name === "k") {
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (key.name === "return" || key.name === "space") {
        const setting = categorySettings[selectedIndex];
        if (setting?.type === "action" && setting.onAction) {
          setting.onAction();
        } else if (setting?.key === "theme") {
          setShowThemePicker(true);
        } else if (setting?.type === "number") {
          startEditingNumber();
        } else {
          toggleCurrentSetting();
        }
      } else if (key.name === "left" || key.name === "h") {
        const setting = categorySettings[selectedIndex];
        if (setting?.type === "select" && setting.options && setting.options.length > 0) {
          const currentValue = setting.getValue(config) as string;
          const currentIdx = setting.options.indexOf(currentValue);
          const prevIdx = (currentIdx - 1 + setting.options.length) % setting.options.length;
          const newValue = setting.options[prevIdx]!;
          updateConfig(setting.setValue(config, newValue));
        }
      } else if (key.name === "right" || key.name === "l") {
        const setting = categorySettings[selectedIndex];
        if (setting?.type === "select" && setting.options && setting.options.length > 0) {
          const currentValue = setting.getValue(config) as string;
          const currentIdx = setting.options.indexOf(currentValue);
          const nextIdx = (currentIdx + 1) % setting.options.length;
          const newValue = setting.options[nextIdx]!;
          updateConfig(setting.setValue(config, newValue));
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
          paddingX={1}
          backgroundColor={colors.foreground}
          height={1}
          flexShrink={0}
        >
          <text fg={colors.primary}>
            <strong>SETTINGS</strong>
          </text>
          <text fg={colors.textSubtle}>Esc:close ^S:save Shift+R:reset</text>
        </box>

        {demoMode && (
          <box flexDirection="row" height={1} paddingLeft={1} gap={2}>
            <text fg={colors.warning}>DEMO MODE</text>
            <text fg={colors.textMuted}>
              Seed: {seed ?? "default"} | Preset: {preset ?? "normal"}
            </text>
          </box>
        )}

        <box flexDirection="row" gap={1} flexGrow={1} padding={1}>
          <box
            flexDirection="column"
            width={20}
            border
            borderStyle={focusedPane === "categories" ? "double" : "single"}
            borderColor={focusedPane === "categories" ? colors.primary : colors.border}
            padding={1}
          >
            {navItems.map((item) => {
              if (item.type === "pluginTypeHeader") {
                // Non-interactive type group header with · prefix
                return (
                  <box key={`type-${item.pluginType}`} height={1}>
                    <text fg={colors.textSubtle}>{` · ${item.label}`}</text>
                  </box>
                );
              }

              const isCategory = item.type === "category";
              const isPlugin = item.type === "plugin";
              const isActive = isCategory
                ? item.id === selectedCategory && (!selectedPluginId || item.id !== "plugins")
                : isPlugin
                  ? item.id === selectedPluginId
                  : false;
              const isFocusedActive = isActive && focusedPane === "categories";

              let prefix = "  ";
              if (isCategory) {
                if (item.id === "plugins") {
                  prefix = isPluginsExpanded ? "▾ " : isActive ? "▸ " : "  ";
                } else {
                  prefix = isActive ? "> " : "  ";
                }
              } else if (isPlugin) {
                prefix = isActive ? "  > " : "    ";
              }

              // Smart truncation: preserve last word when possible
              const maxLabelWidth = 18 - prefix.length;
              let label = item.label;
              if (label.length > maxLabelWidth) {
                const words = label.split(" ");
                if (words.length > 1) {
                  const lastWord = words[words.length - 1];
                  // Try to fit "X… LastWord" format
                  const ellipsisAndLast = `… ${lastWord}`;
                  if (ellipsisAndLast.length < maxLabelWidth) {
                    const firstPartLen = maxLabelWidth - ellipsisAndLast.length;
                    label = label.slice(0, firstPartLen) + ellipsisAndLast;
                  } else {
                    // Last word alone is too long, just truncate
                    label = label.slice(0, maxLabelWidth - 1) + "…";
                  }
                } else {
                  label = label.slice(0, maxLabelWidth - 1) + "…";
                }
              }

              return (
                <box key={`${item.type}-${item.id}`} height={1}>
                  <text
                    fg={
                      isFocusedActive ? colors.background : isActive ? colors.primary : colors.text
                    }
                    {...(isFocusedActive ? { bg: colors.primary } : {})}
                  >
                    {prefix}
                    {label}
                  </text>
                </box>
              );
            })}
          </box>

          <box
            flexDirection="column"
            flexGrow={1}
            border
            borderStyle={focusedPane === "settings" ? "double" : "single"}
            borderColor={focusedPane === "settings" ? colors.primary : colors.border}
            padding={0}
            overflow="hidden"
          >
            {showThemePicker ? (
              <ThemePicker
                themes={themes}
                currentThemeId={config.display.theme}
                currentScheme={config.display.colorScheme}
                onSelect={(themeId, scheme) => {
                  updateConfig({
                    ...config,
                    display: {
                      ...config.display,
                      theme: themeId,
                      colorScheme: scheme,
                    },
                  });
                  setShowThemePicker(false);
                }}
                onPreview={(theme) => setPreviewTheme(theme)}
                onCancel={() => {
                  setPreviewTheme(null);
                  setShowThemePicker(false);
                }}
              />
            ) : (
              <box flexDirection="column" flexGrow={1} padding={1} justifyContent="space-between">
                {/* Settings list area */}
                <box flexDirection="column" flexGrow={1}>
                  <box
                    flexDirection="row"
                    justifyContent="space-between"
                    marginBottom={1}
                    height={1}
                  >
                    <text fg={colors.textMuted}>
                      {selectedCategory === "plugins" && selectedPluginId
                        ? availablePlugins
                            .find((p) => p.id === selectedPluginId)
                            ?.name.toUpperCase()
                        : CATEGORIES.find((c) => c.id === selectedCategory)?.label.toUpperCase()}
                    </text>
                    {(hasMoreAbove || hasMoreBelow) && (
                      <text fg={colors.textSubtle}>
                        {hasMoreAbove ? "▲" : " "}
                        {hasMoreBelow ? "▼" : " "}
                      </text>
                    )}
                  </box>

                  {visibleSettings.length === 0 && (
                    <text fg={colors.textMuted}>
                      {selectedCategory === "plugins" && !selectedPluginId
                        ? "Select a plugin to configure"
                        : "No settings available"}
                    </text>
                  )}
                  {visibleSettings.map((setting) => {
                    const realIdx = categorySettings.findIndex((s) => s.key === setting.key);
                    const isSelected = realIdx === selectedIndex && focusedPane === "settings";
                    const value = setting.getValue(config);
                    const isEditingThis =
                      setting.type === "number" && editingSettingKey === setting.key;

                    let displayValue: string;
                    if (setting.type === "action") {
                      displayValue = "▸ Run";
                    } else if (setting.key === "theme") {
                      const themeName = themes.find((t) => t.id === value)?.name ?? value;
                      displayValue = `${themeName} ▸`;
                    } else if (setting.type === "toggle") {
                      displayValue = value ? "● ON" : "○ OFF";
                    } else if (setting.type === "select") {
                      displayValue = `◂ ${value} ▸`;
                    } else if (setting.type === "number" && !isEditingThis) {
                      displayValue =
                        setting.category === "budgets"
                          ? formatBudgetDisplay(value as number | null)
                          : value === null
                            ? "—"
                            : String(value);
                    } else {
                      displayValue = String(value);
                    }

                    return (
                      <box
                        key={setting.key}
                        flexDirection="row"
                        height={1}
                        marginBottom={1}
                        paddingX={1}
                        {...(isSelected && !isEditingThis
                          ? { backgroundColor: colors.primary }
                          : {})}
                      >
                        <text
                          flexGrow={1}
                          fg={isSelected && !isEditingThis ? colors.background : colors.text}
                        >
                          {setting.label}
                        </text>
                        {isEditingThis ? (
                          <text fg={colors.text}>
                            ${inputValue}
                            <span fg={colors.primary}>█</span>
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

                {/* Help area — shows focused setting's description */}
                <box height={helpAreaHeight} flexDirection="column" paddingX={1}>
                  <box height={1}>
                    <text fg={colors.border}>{"─".repeat(40)}</text>
                  </box>
                  <text fg={colors.textSubtle} height={3}>
                    {focusedDescription ?? " "}
                  </text>
                </box>
              </box>
            )}
          </box>
        </box>

        <box flexDirection="row" height={1} paddingX={1} backgroundColor={colors.foreground}>
          <text fg={colors.textSubtle}>
            {editingSettingKey !== null
              ? "Type value  Enter:save  Esc:cancel"
              : showThemePicker
                ? "↑↓:navigate  ←→:scheme  Tab:switch  Enter:apply  Esc:cancel"
                : "Tab:switch  ↑↓:navigate  ←→:adjust  Enter:edit"}
          </text>
        </box>
      </box>
    </ModalBackdrop>
  );
}
