import * as fs from 'fs/promises';
import * as path from 'path';
import type {
  PluginType,
  PluginLoadResult,
  PluginValidationResult,
  AnyPlugin,
} from './types/index.ts';
import { PATHS } from '@/storage/paths.ts';

const CUSTOM_PLUGINS_DIR = PATHS.config.plugins;

export async function validatePlugin(plugin: unknown): Promise<PluginValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!plugin || typeof plugin !== 'object') {
    errors.push('Plugin must be an object');
    return { valid: false, errors, warnings };
  }

  const p = plugin as Record<string, unknown>;

  if (typeof p.id !== 'string' || p.id.length === 0) {
    errors.push('Plugin must have a non-empty string "id"');
  } else if (!/^[a-z][a-z0-9-]*$/.test(p.id)) {
    errors.push('Plugin id must be kebab-case (lowercase letters, numbers, hyphens)');
  }

  const validTypes: PluginType[] = ['provider', 'agent', 'theme', 'notification'];
  if (!validTypes.includes(p.type as PluginType)) {
    errors.push(`Plugin type must be one of: ${validTypes.join(', ')}`);
  }

  if (typeof p.name !== 'string' || p.name.length === 0) {
    errors.push('Plugin must have a non-empty string "name"');
  }

  if (typeof p.version !== 'string' || !/^\d+\.\d+\.\d+/.test(p.version)) {
    errors.push('Plugin must have a valid semver "version" (e.g., "1.0.0")');
  }

  if (!p.permissions || typeof p.permissions !== 'object') {
    errors.push('Plugin must declare "permissions" object');
  }

  if (p.type === 'provider') {
    if (typeof p.isConfigured !== 'function') {
      errors.push('Provider plugin must implement "isConfigured" method');
    }
    if (typeof p.fetchUsage !== 'function') {
      errors.push('Provider plugin must implement "fetchUsage" method');
    }
  }

  if (p.type === 'agent') {
    if (typeof p.isInstalled !== 'function') {
      errors.push('Agent plugin must implement "isInstalled" method');
    }
    if (typeof p.readCredentials !== 'function') {
      errors.push('Agent plugin must implement "readCredentials" method');
    }
    if (typeof p.parseSessions !== 'function') {
      errors.push('Agent plugin must implement "parseSessions" method');
    }
    if (typeof p.getProviders !== 'function') {
      errors.push('Agent plugin must implement "getProviders" method');
    }
  }

  if (p.type === 'theme') {
    if (!['light', 'dark'].includes(p.colorScheme as string)) {
      errors.push('Theme plugin must specify colorScheme as "light" or "dark"');
    }
    if (!p.colors || typeof p.colors !== 'object') {
      errors.push('Theme plugin must provide "colors" object');
    }
  }

  if (p.type === 'notification') {
    if (typeof p.initialize !== 'function') {
      errors.push('Notification plugin must implement "initialize" method');
    }
    if (typeof p.notify !== 'function') {
      errors.push('Notification plugin must implement "notify" method');
    }
    if (typeof p.test !== 'function') {
      errors.push('Notification plugin must implement "test" method');
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

export async function loadLocalPlugin(filePath: string): Promise<PluginLoadResult<AnyPlugin>> {
  try {
    const module = await import(filePath);
    const plugin = module.default ?? module.plugin ?? module;

    const validation = await validatePlugin(plugin);
    if (!validation.valid) {
      return {
        success: false,
        error: `Validation failed: ${validation.errors.join('; ')}`,
        source: 'local',
      };
    }

    return {
      success: true,
      plugin: plugin as AnyPlugin,
      source: 'local',
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      source: 'local',
    };
  }
}

export async function loadNpmPlugin(packageName: string): Promise<PluginLoadResult<AnyPlugin>> {
  const validPrefixes = [
    '@tokentop/provider-',
    '@tokentop/agent-',
    '@tokentop/theme-',
    '@tokentop/notification-',
  ];

  const hasValidPrefix = validPrefixes.some((prefix) => packageName.startsWith(prefix));
  if (!hasValidPrefix) {
    return {
      success: false,
      error: `Invalid npm plugin name. Must start with: ${validPrefixes.join(', ')}`,
      source: 'npm',
    };
  }

  try {
    const module = await import(packageName);
    const plugin = module.default ?? module.plugin ?? module;

    const validation = await validatePlugin(plugin);
    if (!validation.valid) {
      return {
        success: false,
        error: `Validation failed: ${validation.errors.join('; ')}`,
        source: 'npm',
      };
    }

    return {
      success: true,
      plugin: plugin as AnyPlugin,
      source: 'npm',
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      source: 'npm',
    };
  }
}

export async function discoverLocalPlugins(): Promise<string[]> {
  try {
    await fs.access(CUSTOM_PLUGINS_DIR);
  } catch {
    return [];
  }

  const entries = await fs.readdir(CUSTOM_PLUGINS_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.js')))
    .map((entry) => path.join(CUSTOM_PLUGINS_DIR, entry.name));
}

export { CUSTOM_PLUGINS_DIR };
