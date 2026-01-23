import {
  PluginPermissionError,
  type PluginPermissions,
  type PluginHttpClient,
  type PluginLogger,
} from './types/index.ts';

export function createSandboxedHttpClient(
  pluginId: string,
  permissions: PluginPermissions
): PluginHttpClient {
  return {
    async fetch(url: string, init?: RequestInit): Promise<Response> {
      if (!permissions.network?.enabled) {
        throw new PluginPermissionError(
          pluginId,
          'network',
          'Network access not permitted'
        );
      }

      const urlObj = new URL(url);
      const allowedDomains = permissions.network.allowedDomains;

      if (allowedDomains && allowedDomains.length > 0) {
        const isAllowed = allowedDomains.some(
          (domain) =>
            urlObj.hostname === domain ||
            urlObj.hostname.endsWith(`.${domain}`)
        );

        if (!isAllowed) {
          throw new PluginPermissionError(
            pluginId,
            'network',
            `Domain "${urlObj.hostname}" not in allowlist: ${allowedDomains.join(', ')}`
          );
        }
      }

      return globalThis.fetch(url, init);
    },
  };
}

export function createPluginLogger(pluginId: string): PluginLogger {
  const prefix = `[plugin:${pluginId}]`;

  return {
    debug(message: string, data?: Record<string, unknown>) {
      if (process.env.DEBUG) {
        console.debug(prefix, message, data ?? '');
      }
    },
    info(message: string, data?: Record<string, unknown>) {
      console.info(prefix, message, data ?? '');
    },
    warn(message: string, data?: Record<string, unknown>) {
      console.warn(prefix, message, data ?? '');
    },
    error(message: string, data?: Record<string, unknown>) {
      console.error(prefix, message, data ?? '');
    },
  };
}

export function validateEnvAccess(
  pluginId: string,
  permissions: PluginPermissions,
  varName: string
): void {
  if (!permissions.env?.read) {
    throw new PluginPermissionError(
      pluginId,
      'env',
      'Environment variable access not permitted'
    );
  }

  const allowedVars = permissions.env.vars;
  if (allowedVars && allowedVars.length > 0 && !allowedVars.includes(varName)) {
    throw new PluginPermissionError(
      pluginId,
      'env',
      `Environment variable "${varName}" not in allowlist`
    );
  }
}

export function validateFilesystemAccess(
  pluginId: string,
  permissions: PluginPermissions,
  path: string,
  mode: 'read' | 'write'
): void {
  const fsPerms = permissions.filesystem;

  if (!fsPerms) {
    throw new PluginPermissionError(
      pluginId,
      'filesystem',
      'Filesystem access not permitted'
    );
  }

  if (mode === 'read' && !fsPerms.read) {
    throw new PluginPermissionError(
      pluginId,
      'filesystem',
      'Filesystem read access not permitted'
    );
  }

  if (mode === 'write' && !fsPerms.write) {
    throw new PluginPermissionError(
      pluginId,
      'filesystem',
      'Filesystem write access not permitted'
    );
  }

  const allowedPaths = fsPerms.paths;
  if (allowedPaths && allowedPaths.length > 0) {
    const normalizedPath = path.replace(/^~/, process.env.HOME ?? '');
    const isAllowed = allowedPaths.some((allowed) => {
      const normalizedAllowed = allowed.replace(/^~/, process.env.HOME ?? '');
      return normalizedPath.startsWith(normalizedAllowed);
    });

    if (!isAllowed) {
      throw new PluginPermissionError(
        pluginId,
        'filesystem',
        `Path "${path}" not in allowlist`
      );
    }
  }
}
