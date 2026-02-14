import * as fs from 'fs/promises';
import * as os from 'os';
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

function expandTilde(filePath: string): string {
  if (filePath.startsWith('~/') || filePath === '~') {
    return path.join(os.homedir(), filePath.slice(1));
  }
  return filePath;
}

async function resolvePluginEntryPoint(dirPath: string): Promise<string | null> {
  try {
    const pkgJsonPath = path.join(dirPath, 'package.json');
    const pkgContent = await fs.readFile(pkgJsonPath, 'utf-8');
    const pkg = JSON.parse(pkgContent) as Record<string, unknown>;

    if (typeof pkg.main === 'string') {
      return path.resolve(dirPath, pkg.main);
    }

    if (pkg.exports && typeof pkg.exports === 'object') {
      const exports = pkg.exports as Record<string, unknown>;
      const root = exports['.'];
      if (typeof root === 'string') return path.resolve(dirPath, root);
      if (root && typeof root === 'object') {
        const rootObj = root as Record<string, unknown>;
        const entry = rootObj.import ?? rootObj.default;
        if (typeof entry === 'string') return path.resolve(dirPath, entry);
      }
    }
  } catch {
    // no package.json — try convention-based entry points
  }

  const candidates = ['src/index.ts', 'src/index.js', 'index.ts', 'index.js', 'dist/index.js'];
  for (const candidate of candidates) {
    const candidatePath = path.join(dirPath, candidate);
    try {
      await fs.access(candidatePath);
      return candidatePath;
    } catch {
      continue;
    }
  }

  return null;
}

export function resolvePluginPath(rawPath: string, relativeTo?: string): string {
  const expanded = expandTilde(rawPath);
  if (path.isAbsolute(expanded)) return expanded;
  const base = relativeTo ?? PATHS.config.dir;
  return path.resolve(base, expanded);
}

export async function loadLocalPlugin(filePath: string): Promise<PluginLoadResult<AnyPlugin>> {
  try {
    let importPath = filePath;

    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) {
      const entryPoint = await resolvePluginEntryPoint(filePath);
      if (!entryPoint) {
        return {
          success: false,
          error: `Directory "${filePath}" has no recognizable entry point (checked package.json main/exports, src/index.ts, index.ts)`,
          source: 'local',
        };
      }
      importPath = entryPoint;
    }

    const module = await import(importPath);
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

export async function loadNpmPlugin(packageName: string, resolvedPath?: string): Promise<PluginLoadResult<AnyPlugin>> {
  const pluginTypes = ['provider', 'agent', 'theme', 'notification'];

  const cleanName = packageName.replace(/@[^@]*$/, '');

  const isOfficial = pluginTypes.some((t) => cleanName.startsWith(`@tokentop/${t}-`));
  const isCommunity = pluginTypes.some((t) => cleanName.startsWith(`tokentop-${t}-`));
  const isScopedCommunity = pluginTypes.some((t) => {
    const match = cleanName.match(/^@[^/]+\/tokentop-(\w+)-/);
    return match?.[1] === t;
  });

  if (!isOfficial && !isCommunity && !isScopedCommunity) {
    return {
      success: false,
      error: `Invalid npm plugin name "${packageName}". Expected one of:\n` +
        `  Official:   @tokentop/{provider,agent,theme,notification}-*\n` +
        `  Community:  tokentop-{provider,agent,theme,notification}-*\n` +
        `  Scoped:     @yourname/tokentop-{provider,agent,theme,notification}-*`,
      source: 'npm',
    };
  }

  try {
    const importTarget = resolvedPath ?? cleanName;
    const module = await import(importTarget);
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
  const results: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(CUSTOM_PLUGINS_DIR, entry.name);

    if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.js'))) {
      results.push(fullPath);
    } else if (entry.isDirectory()) {
      const entryPoint = await resolvePluginEntryPoint(fullPath);
      if (entryPoint) {
        results.push(fullPath);
      }
    }
  }

  return results;
}

export { CUSTOM_PLUGINS_DIR };
