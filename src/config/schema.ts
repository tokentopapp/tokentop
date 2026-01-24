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
  budgetWarningPercent: number;
  budgetCriticalPercent: number;
  providerLimitWarningPercent: number;
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
    compactMode: boolean;
    timeFormat: '12h' | '24h';
    numberFormat: 'full' | 'compact';
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
}

export const DEFAULT_CONFIG: AppConfig = {
  configVersion: 1,
  refresh: {
    intervalMs: 60000,
    pauseAutoRefresh: false,
    staleThresholdMs: 300000,
  },
  display: {
    defaultTimeWindow: '5m',
    sidebarCollapsed: false,
    compactMode: false,
    timeFormat: '24h',
    numberFormat: 'compact',
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
    budgetWarningPercent: 80,
    budgetCriticalPercent: 95,
    providerLimitWarningPercent: 90,
  },
  providers: {
    hideUnconfigured: false,
  },
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
