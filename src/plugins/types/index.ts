export * from './base.ts';
export * from './provider.ts';
export * from './agent.ts';
export * from './theme.ts';
export * from './notification.ts';

import type { ProviderPlugin } from './provider.ts';
import type { AgentPlugin } from './agent.ts';
import type { ThemePlugin } from './theme.ts';
import type { NotificationPlugin } from './notification.ts';

export type AnyPlugin = ProviderPlugin | AgentPlugin | ThemePlugin | NotificationPlugin;

export type PluginByType = {
  provider: ProviderPlugin;
  agent: AgentPlugin;
  theme: ThemePlugin;
  notification: NotificationPlugin;
};
