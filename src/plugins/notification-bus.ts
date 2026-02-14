import type { NotificationPlugin, Notification, NotificationConfig } from './types/notification.ts';
import type { ProviderUsageData } from './types/provider.ts';
import { safeInvoke } from './plugin-host.ts';
import { createPluginLogger } from './sandbox.ts';
import type { AppConfig } from '@/config/schema.ts';

type EventType = 'budget_warning' | 'budget_critical' | 'rate_limit_warning' | 'rate_limit_reached';

interface EmittedEvent {
  type: EventType;
  key: string;
  timestamp: number;
}

const DEDUP_WINDOW_MS = 5 * 60_000; // 5 minutes — don't re-fire same event within this window

class NotificationBus {
  private plugins: NotificationPlugin[] = [];
  private recentEvents = new Map<string, EmittedEvent>();
  private pluginConfigs = new Map<string, NotificationConfig>();

  registerPlugins(plugins: NotificationPlugin[]): void {
    this.plugins = plugins;
    for (const plugin of plugins) {
      if (!this.pluginConfigs.has(plugin.id)) {
        this.pluginConfigs.set(plugin.id, { enabled: true });
      }
    }
  }

  setPluginConfig(pluginId: string, config: NotificationConfig): void {
    this.pluginConfigs.set(pluginId, config);
  }

  async initializePlugins(): Promise<void> {
    for (const plugin of this.plugins) {
      const config = this.pluginConfigs.get(plugin.id) ?? { enabled: true };
      const log = createPluginLogger(plugin.id);
      await safeInvoke(plugin.id, 'initialize', () =>
        plugin.initialize(config, { log, config }),
      );
    }
  }

  async checkProviderUsage(
    providerId: string,
    providerName: string,
    usage: ProviderUsageData,
  ): Promise<void> {
    if (usage.limitReached) {
      await this.emit({
        type: 'rate_limit_reached',
        key: `rate_limit_reached:${providerId}`,
        notification: {
          type: 'alert',
          title: `${providerName} Rate Limit Reached`,
          message: `Rate limit reached for ${providerName}. Requests may be throttled.`,
          severity: 'high',
          data: { provider: providerId },
          timestamp: Date.now(),
        },
        capability: 'rateLimitWarnings',
      });
    }

    const primaryPercent = usage.limits?.primary?.usedPercent;
    if (primaryPercent !== null && primaryPercent !== undefined && primaryPercent >= 80) {
      await this.emit({
        type: 'rate_limit_warning',
        key: `rate_limit_warning:${providerId}`,
        notification: {
          type: 'warning',
          title: `${providerName} Approaching Limit`,
          message: `${providerName} usage at ${Math.round(primaryPercent)}%.`,
          severity: primaryPercent >= 95 ? 'high' : 'medium',
          data: {
            provider: providerId,
            rateLimit: {
              used: primaryPercent,
              limit: 100,
              ...(usage.limits?.primary?.resetsAt !== undefined ? { resetsAt: usage.limits.primary.resetsAt } : {}),
            },
          },
          timestamp: Date.now(),
        },
        capability: 'rateLimitWarnings',
      });
    }
  }

  async checkBudget(
    cost: number,
    limit: number,
    budgetType: 'daily' | 'weekly' | 'monthly',
    config: AppConfig,
  ): Promise<void> {
    if (limit <= 0) return;

    const percent = (cost / limit) * 100;

    if (percent >= config.alerts.criticalPercent) {
      await this.emit({
        type: 'budget_critical',
        key: `budget_critical:${budgetType}`,
        notification: {
          type: 'alert',
          title: `${capitalize(budgetType)} Budget Critical`,
          message: `${capitalize(budgetType)} spending at ${Math.round(percent)}% ($${cost.toFixed(2)}/$${limit.toFixed(2)}).`,
          severity: 'critical',
          data: {
            budget: { used: cost, limit, currency: config.budgets.currency },
          },
          timestamp: Date.now(),
        },
        capability: 'budgetWarnings',
      });
    } else if (percent >= config.alerts.warningPercent) {
      await this.emit({
        type: 'budget_warning',
        key: `budget_warning:${budgetType}`,
        notification: {
          type: 'warning',
          title: `${capitalize(budgetType)} Budget Warning`,
          message: `${capitalize(budgetType)} spending at ${Math.round(percent)}% ($${cost.toFixed(2)}/$${limit.toFixed(2)}).`,
          severity: 'medium',
          data: {
            budget: { used: cost, limit, currency: config.budgets.currency },
          },
          timestamp: Date.now(),
        },
        capability: 'budgetWarnings',
      });
    }
  }

  private async emit(event: {
    type: EventType;
    key: string;
    notification: Notification;
    capability: keyof typeof capabilityMap;
  }): Promise<void> {
    if (this.isDuplicate(event.key)) return;
    this.recordEvent(event.type, event.key);

    const matchingPlugins = this.plugins.filter((p) => {
      const config = this.pluginConfigs.get(p.id);
      if (config && !config.enabled) return false;
      return p.capabilities[event.capability];
    });

    await Promise.all(
      matchingPlugins.map((plugin) => {
        const config = this.pluginConfigs.get(plugin.id) ?? { enabled: true };
        const log = createPluginLogger(plugin.id);
        return safeInvoke(plugin.id, 'notify', () =>
          plugin.notify(event.notification, { log, config }),
        );
      }),
    );
  }

  private isDuplicate(key: string): boolean {
    const recent = this.recentEvents.get(key);
    if (!recent) return false;
    return Date.now() - recent.timestamp < DEDUP_WINDOW_MS;
  }

  private recordEvent(type: EventType, key: string): void {
    this.recentEvents.set(key, { type, key, timestamp: Date.now() });
    this.pruneOldEvents();
  }

  private pruneOldEvents(): void {
    const cutoff = Date.now() - DEDUP_WINDOW_MS;
    for (const [key, event] of this.recentEvents) {
      if (event.timestamp < cutoff) {
        this.recentEvents.delete(key);
      }
    }
  }

  destroy(): void {
    this.plugins = [];
    this.recentEvents.clear();
    this.pluginConfigs.clear();
  }
}

const capabilityMap = {
  alerts: 'alerts',
  budgetWarnings: 'budgetWarnings',
  rateLimitWarnings: 'rateLimitWarnings',
  dailySummaries: 'dailySummaries',
} as const;

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const notificationBus = new NotificationBus();
export type { NotificationBus };
