import * as fs from 'fs/promises';
import * as path from 'path';
import { PATHS } from '@/storage/paths.ts';

export interface AppConfig {
  configVersion: number;
  refresh: {
    intervalMs: number;
    pauseAutoRefresh: boolean;
  };
  display: {
    defaultTimeWindow: '5m' | '15m' | '1h' | '24h' | '7d' | '30d' | 'all';
    sidebarCollapsed: boolean;
    compactMode: boolean;
  };
  notifications: {
    toastsEnabled: boolean;
  };
}

export const DEFAULT_CONFIG: AppConfig = {
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
