import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { PluginPermissions } from './types/base.ts';
import type { AuthSources, OpenCodeAuthEntry } from './types/provider.ts';
import { PluginPermissionError } from './types/base.ts';

const OPENCODE_AUTH_PATH = path.join(os.homedir(), '.local/share/opencode/auth.json');
const OPENCODE_CONFIG_PATH = path.join(os.homedir(), '.config/opencode/opencode.json');

function expandHome(filePath: string): string {
  if (filePath.startsWith('~')) {
    return path.join(os.homedir(), filePath.slice(1));
  }
  return filePath;
}

function isPathAllowed(filePath: string, permissions: PluginPermissions): boolean {
  const allowedPaths = permissions.filesystem?.paths;
  if (!allowedPaths || allowedPaths.length === 0) return true;

  const normalized = expandHome(filePath);
  return allowedPaths.some((allowed: string) => {
    const normalizedAllowed = expandHome(allowed);
    return normalized.startsWith(normalizedAllowed);
  });
}

function isEnvVarAllowed(name: string, permissions: PluginPermissions): boolean {
  if (!permissions.env?.read) return false;
  const allowedVars = permissions.env.vars;
  if (!allowedVars || allowedVars.length === 0) return true;
  return allowedVars.includes(name);
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

interface OpenCodeConfig {
  provider?: Record<string, {
    name?: string;
    key?: string;
    options?: {
      apiKey?: string;
      [key: string]: unknown;
    };
  }>;
}

function resolveEnvValue(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const envMatch = value.match(/^\{env:(\w+)\}$/);
  if (envMatch?.[1]) {
    return process.env[envMatch[1]];
  }
  return value;
}

export function createAuthSources(pluginId: string, permissions: PluginPermissions): AuthSources {
  return {
    env: {
      get(name: string): string | undefined {
        if (!isEnvVarAllowed(name, permissions)) {
          throw new PluginPermissionError(
            pluginId,
            'env',
            `Environment variable "${name}" not in allowlist`
          );
        }
        return process.env[name];
      },
    },

    files: {
      async readText(filePath: string): Promise<string | null> {
        const resolved = expandHome(filePath);
        if (!permissions.filesystem?.read) {
          throw new PluginPermissionError(
            pluginId,
            'filesystem',
            'Filesystem read access not permitted'
          );
        }
        if (!isPathAllowed(filePath, permissions)) {
          throw new PluginPermissionError(
            pluginId,
            'filesystem',
            `Path "${filePath}" not in allowlist`
          );
        }
        try {
          return await fs.readFile(resolved, 'utf-8');
        } catch {
          return null;
        }
      },

      async readJson<T = unknown>(filePath: string): Promise<T | null> {
        const resolved = expandHome(filePath);
        if (!permissions.filesystem?.read) {
          throw new PluginPermissionError(
            pluginId,
            'filesystem',
            'Filesystem read access not permitted'
          );
        }
        if (!isPathAllowed(filePath, permissions)) {
          throw new PluginPermissionError(
            pluginId,
            'filesystem',
            `Path "${filePath}" not in allowlist`
          );
        }
        try {
          const content = await fs.readFile(resolved, 'utf-8');
          return JSON.parse(content) as T;
        } catch {
          return null;
        }
      },

      async exists(filePath: string): Promise<boolean> {
        const resolved = expandHome(filePath);
        if (!permissions.filesystem?.read) {
          throw new PluginPermissionError(
            pluginId,
            'filesystem',
            'Filesystem read access not permitted'
          );
        }
        if (!isPathAllowed(filePath, permissions)) {
          throw new PluginPermissionError(
            pluginId,
            'filesystem',
            `Path "${filePath}" not in allowlist`
          );
        }
        try {
          await fs.access(resolved);
          return true;
        } catch {
          return false;
        }
      },
    },

    opencode: {
      async getProviderEntry(key: string): Promise<OpenCodeAuthEntry | null> {
        const authData = await readJsonFile<Record<string, OpenCodeAuthEntry>>(OPENCODE_AUTH_PATH);
        if (authData) {
          const entry = authData[key];
          if (entry) return entry;
        }

        const config = await readJsonFile<OpenCodeConfig>(OPENCODE_CONFIG_PATH);
        if (config?.provider) {
          const providerConfig = config.provider[key];
          if (providerConfig) {
            const apiKey = resolveEnvValue(providerConfig.key) ??
                           resolveEnvValue(providerConfig.options?.apiKey as string);
            if (apiKey) {
              return {
                type: 'api',
                key: apiKey,
              };
            }
          }
        }

        return null;
      },
    },

    platform: {
      os: process.platform as 'darwin' | 'linux' | 'win32',
      homedir: os.homedir(),
      arch: process.arch,
    },
  };
}
