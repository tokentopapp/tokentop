/**
 * Base plugin types and interfaces for the tokentop plugin system.
 */

import { z } from 'zod';

/**
 * Plugin type discriminator
 */
export type PluginType = 'provider' | 'agent' | 'theme' | 'notification';

/**
 * Plugin permissions schema - defines what a plugin can access
 */
export const PluginPermissionsSchema = z.object({
  network: z.object({
    enabled: z.boolean(),
    allowedDomains: z.array(z.string()).optional(),
  }).optional(),
  filesystem: z.object({
    read: z.boolean().optional(),
    write: z.boolean().optional(),
    paths: z.array(z.string()).optional(),
  }).optional(),
  env: z.object({
    read: z.boolean().optional(),
    vars: z.array(z.string()).optional(),
  }).optional(),
  system: z.object({
    notifications: z.boolean().optional(),
    clipboard: z.boolean().optional(),
  }).optional(),
});

export type PluginPermissions = z.infer<typeof PluginPermissionsSchema>;

/**
 * Plugin metadata
 */
export const PluginMetaSchema = z.object({
  author: z.string().optional(),
  description: z.string().optional(),
  homepage: z.string().url().optional(),
  repository: z.string().url().optional(),
  license: z.string().optional(),
  color: z.string().optional(),
});

export type PluginMeta = z.infer<typeof PluginMetaSchema>;

/**
 * Base plugin interface - all plugins must implement this
 */
export interface BasePlugin {
  /** Unique plugin identifier (kebab-case) */
  readonly id: string;

  /** Plugin type discriminator */
  readonly type: PluginType;

  /** Human-readable display name */
  readonly name: string;

  /** Semantic version string */
  readonly version: string;

  /** Plugin metadata */
  readonly meta?: PluginMeta;

  /** Required permissions */
  readonly permissions: PluginPermissions;
}

/**
 * Plugin configuration field definition (for plugin settings UI)
 */
export interface ConfigField {
  type: 'string' | 'number' | 'boolean' | 'select';
  required?: boolean;
  default?: unknown;
  description?: string;
  options?: Array<{ value: string; label: string }>; // For select type
}

/**
 * Logger interface provided to plugins
 */
export interface PluginLogger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

/**
 * HTTP client interface provided to plugins (sandboxed)
 */
export interface PluginHttpClient {
  fetch(url: string, init?: RequestInit): Promise<Response>;
}

/**
 * Plugin validation result
 */
export interface PluginValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Plugin load result
 */
export interface PluginLoadResult<T extends BasePlugin = BasePlugin> {
  success: boolean;
  plugin?: T;
  error?: string;
  source: 'builtin' | 'local' | 'npm';
}

/**
 * Plugin permission error
 */
export class PluginPermissionError extends Error {
  constructor(
    public readonly pluginId: string,
    public readonly permission: keyof PluginPermissions,
    message: string
  ) {
    super(`Plugin "${pluginId}" permission denied: ${message}`);
    this.name = 'PluginPermissionError';
  }
}
