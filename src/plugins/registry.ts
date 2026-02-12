import type {
  AnyPlugin,
  PluginType,
  PluginByType,
  ProviderPlugin,
  AgentPlugin,
  ThemePlugin,
  NotificationPlugin,
} from './types/index.ts';
import { loadLocalPlugin, loadNpmPlugin, discoverLocalPlugins, resolvePluginPath } from './loader.ts';
import type { PluginsConfig } from '@/config/schema.ts';

type PluginStore = {
  provider: Map<string, ProviderPlugin>;
  agent: Map<string, AgentPlugin>;
  theme: Map<string, ThemePlugin>;
  notification: Map<string, NotificationPlugin>;
};

class PluginRegistryImpl {
  private plugins: PluginStore = {
    provider: new Map(),
    agent: new Map(),
    theme: new Map(),
    notification: new Map(),
  };

  private initialized = false;

  register(plugin: AnyPlugin): void {
    switch (plugin.type) {
      case 'provider':
        if (this.plugins.provider.has(plugin.id)) {
          console.warn(`Plugin "${plugin.id}" already registered, overwriting`);
        }
        this.plugins.provider.set(plugin.id, plugin);
        break;
      case 'agent':
        if (this.plugins.agent.has(plugin.id)) {
          console.warn(`Plugin "${plugin.id}" already registered, overwriting`);
        }
        this.plugins.agent.set(plugin.id, plugin);
        break;
      case 'theme':
        if (this.plugins.theme.has(plugin.id)) {
          console.warn(`Plugin "${plugin.id}" already registered, overwriting`);
        }
        this.plugins.theme.set(plugin.id, plugin);
        break;
      case 'notification':
        if (this.plugins.notification.has(plugin.id)) {
          console.warn(`Plugin "${plugin.id}" already registered, overwriting`);
        }
        this.plugins.notification.set(plugin.id, plugin);
        break;
    }
  }

  unregister(type: PluginType, id: string): boolean {
    return this.plugins[type].delete(id);
  }

  get<T extends PluginType>(type: T, id: string): PluginByType[T] | undefined {
    return this.plugins[type].get(id) as PluginByType[T] | undefined;
  }

  getAll<T extends PluginType>(type: T): PluginByType[T][] {
    return [...this.plugins[type].values()] as PluginByType[T][];
  }

  getAllPlugins(): AnyPlugin[] {
    return [
      ...this.plugins.provider.values(),
      ...this.plugins.agent.values(),
      ...this.plugins.theme.values(),
      ...this.plugins.notification.values(),
    ];
  }

  has(type: PluginType, id: string): boolean {
    return this.plugins[type].has(id);
  }

  count(type?: PluginType): number {
    if (type) {
      return this.plugins[type].size;
    }
    return (
      this.plugins.provider.size +
      this.plugins.agent.size +
      this.plugins.theme.size +
      this.plugins.notification.size
    );
  }

  async loadBuiltinPlugins(): Promise<void> {
    const [providers, agents, themes, notifications] = await Promise.all([
      import('./providers/index.ts'),
      import('./agents/index.ts'),
      import('./themes/index.ts'),
      import('./notifications/index.ts'),
    ]);

    for (const plugin of Object.values(providers)) {
      if (isProviderPlugin(plugin)) this.register(plugin);
    }

    for (const plugin of Object.values(agents)) {
      if (isAgentPlugin(plugin)) this.register(plugin);
    }

    for (const plugin of Object.values(themes)) {
      if (isThemePlugin(plugin)) this.register(plugin);
    }

    for (const plugin of Object.values(notifications)) {
      if (isNotificationPlugin(plugin)) this.register(plugin);
    }
  }

  async loadLocalPlugins(extraPaths: string[] = []): Promise<void> {
    const discoveredPaths = await discoverLocalPlugins();
    const resolvedExtraPaths = extraPaths.map(p => resolvePluginPath(p));
    const allPaths = [...discoveredPaths, ...resolvedExtraPaths];

    for (const pluginPath of allPaths) {
      const result = await loadLocalPlugin(pluginPath);
      if (result.success && result.plugin) {
        this.register(result.plugin);
        console.info(`Loaded local plugin: ${result.plugin.name} (${result.plugin.id})`);
      } else {
        console.warn(`Failed to load plugin from ${pluginPath}: ${result.error}`);
      }
    }
  }

  async loadNpmPlugins(packages: string[]): Promise<void> {
    for (const packageName of packages) {
      const result = await loadNpmPlugin(packageName);
      if (result.success && result.plugin) {
        this.register(result.plugin);
        console.info(`Loaded npm plugin: ${result.plugin.name} (${packageName})`);
      } else {
        console.warn(`Failed to load npm plugin ${packageName}: ${result.error}`);
      }
    }
  }

  disablePlugin(type: PluginType, id: string): boolean {
    return this.plugins[type].delete(id);
  }

  async initialize(config?: {
    plugins?: Partial<PluginsConfig>;
    cliPlugins?: string[];
  }): Promise<void> {
    if (this.initialized) return;

    await this.loadBuiltinPlugins();

    const localPaths = [
      ...(config?.plugins?.local ?? []),
      ...(config?.cliPlugins ?? []),
    ];
    await this.loadLocalPlugins(localPaths);

    const npmPackages = config?.plugins?.npm ?? [];
    if (npmPackages.length > 0) {
      await this.loadNpmPlugins(npmPackages);
    }

    const disabled = config?.plugins?.disabled ?? [];
    for (const pluginId of disabled) {
      for (const type of ['provider', 'agent', 'theme', 'notification'] as PluginType[]) {
        if (this.has(type, pluginId)) {
          this.disablePlugin(type, pluginId);
          console.info(`Disabled plugin: ${pluginId}`);
        }
      }
    }

    this.initialized = true;
    console.info(
      `Plugin registry initialized: ${this.count('provider')} providers, ` +
        `${this.count('agent')} agents, ${this.count('theme')} themes, ` +
        `${this.count('notification')} notifications`
    );
  }
}

function hasPluginShape(obj: unknown): obj is { id: string; type: string; name: string; version: string } {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    'id' in obj &&
    'type' in obj &&
    'name' in obj &&
    'version' in obj
  );
}

function isProviderPlugin(obj: unknown): obj is ProviderPlugin {
  return hasPluginShape(obj) && obj.type === 'provider';
}

function isAgentPlugin(obj: unknown): obj is AgentPlugin {
  return hasPluginShape(obj) && obj.type === 'agent';
}

function isThemePlugin(obj: unknown): obj is ThemePlugin {
  return hasPluginShape(obj) && obj.type === 'theme';
}

function isNotificationPlugin(obj: unknown): obj is NotificationPlugin {
  return hasPluginShape(obj) && obj.type === 'notification';
}

export const pluginRegistry = new PluginRegistryImpl();
export type PluginRegistry = PluginRegistryImpl;
