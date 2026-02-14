import { z } from 'zod';
import type { BasePlugin, PluginLogger } from './base.ts';

export const NotificationCapabilitiesSchema = z.object({
  alerts: z.boolean(),
  budgetWarnings: z.boolean(),
  rateLimitWarnings: z.boolean(),
  dailySummaries: z.boolean(),
});

export type NotificationCapabilities = z.infer<typeof NotificationCapabilitiesSchema>;

export type NotificationType = 'alert' | 'warning' | 'info' | 'summary';
export type NotificationSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface Notification {
  type: NotificationType;
  title: string;
  message: string;
  severity: NotificationSeverity;
  data?: {
    provider?: string;
    budget?: { used: number; limit: number; currency: string };
    rateLimit?: { used: number; limit: number; resetsAt?: number };
    model?: string;
  };
  timestamp: number;
}

export interface NotificationResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface NotificationConfig {
  enabled: boolean;
  [key: string]: unknown;
}

export interface NotificationContext {
  log: PluginLogger;
  config: NotificationConfig;
}

export interface NotificationPlugin extends BasePlugin {
  readonly type: 'notification';
  readonly capabilities: NotificationCapabilities;

  initialize(config: NotificationConfig, ctx: NotificationContext): Promise<void>;
  notify(notification: Notification, ctx: NotificationContext): Promise<NotificationResult>;
  test(ctx: NotificationContext): Promise<boolean>;
  destroy?(): Promise<void>;
}
