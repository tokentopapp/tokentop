import * as fs from 'fs/promises';
import * as path from 'path';
import { PATHS } from '@/storage/paths.ts';

export type TimeWindow = '5m' | '15m' | '1h' | '24h' | '7d' | '30d' | 'all';

export interface BudgetConfig {
  daily: number | null;
  weekly: number | null;
  monthly: number | null;
  currency: 'USD' | 'EUR' | 'GBP';
}

export interface AlertThresholds {
  warningPercent: number;
  criticalPercent: number;
}

export type SparklineStyle = 'braille' | 'block';
export type SparklineOrientation = 'up' | 'down';

export interface SparklineConfig {
  style: SparklineStyle;
  orientation: SparklineOrientation;
  showBaseline: boolean;
}

export interface PluginsConfig {
  local: string[];
  npm: string[];
  disabled: string[];
}

export interface AppConfig {
  configVersion: number;
  refresh: {
    intervalMs: number;
    pauseAutoRefresh: boolean;
    staleThresholdMs: number;
  };
  display: {
    defaultTimeWindow: TimeWindow;
    sidebarCollapsed: boolean;
    timeFormat: '12h' | '24h';
    numberFormat: 'full' | 'compact';
    sparkline: SparklineConfig;
    theme: string;
    colorScheme: 'auto' | 'light' | 'dark';
  };
  notifications: {
    toastsEnabled: boolean;
    soundEnabled: boolean;
  };
  budgets: BudgetConfig;
  alerts: AlertThresholds;
  providers: {
    hideUnconfigured: boolean;
  };
  plugins: PluginsConfig;
  pluginConfig: Record<string, Record<string, unknown>>;
}

export const DEFAULT_CONFIG: AppConfig = {
  configVersion: 1,
  refresh: {
    intervalMs: 60000,
    pauseAutoRefresh: false,
    staleThresholdMs: 300000,
  },
   display: {
     defaultTimeWindow: '1h',
     sidebarCollapsed: false,
      timeFormat: '24h',
     numberFormat: 'compact',
     sparkline: {
       style: 'braille',
       orientation: 'up',
       showBaseline: true,
     },
      theme: 'tokyo-night',
      colorScheme: 'auto',
    },
  notifications: {
    toastsEnabled: true,
    soundEnabled: false,
  },
  budgets: {
    daily: null,
    weekly: null,
    monthly: null,
    currency: 'USD',
  },
  alerts: {
    warningPercent: 80,
    criticalPercent: 95,
  },
  providers: {
    hideUnconfigured: false,
  },
  plugins: {
    local: [],
    npm: [],
    disabled: [],
  },
  pluginConfig: {},
};

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
      sparkline: {
        ...target.display.sparkline,
        ...(source.display?.sparkline ?? {}),
      },
    },
    notifications: {
      ...target.notifications,
      ...(source.notifications ?? {}),
    },
    budgets: {
      ...target.budgets,
      ...(source.budgets ?? {}),
    },
    alerts: {
      ...target.alerts,
      ...(source.alerts ?? {}),
    },
    providers: {
      ...target.providers,
      ...(source.providers ?? {}),
    },
    plugins: {
      ...target.plugins,
      ...(source.plugins ?? {}),
    },
    pluginConfig: {
      ...target.pluginConfig,
      ...(source.pluginConfig ?? {}),
    },
  };
}

export async function loadConfig(): Promise<AppConfig> {
  try {
    const content = await fs.readFile(PATHS.config.file, 'utf-8');
    const loaded = JSON.parse(content) as Partial<AppConfig>;
    return deepMerge(DEFAULT_CONFIG, loaded);
  } catch {
    return DEFAULT_CONFIG;
  }
}

export async function saveConfig(config: AppConfig): Promise<void> {
  await fs.mkdir(path.dirname(PATHS.config.file), { recursive: true });
  const tempFile = PATHS.config.file + '.tmp';
  await fs.writeFile(tempFile, JSON.stringify(config, null, 2), 'utf-8');
  await fs.rename(tempFile, PATHS.config.file);
}
