import type {
  NotificationPlugin,
  NotificationContext,
  NotificationConfig,
  Notification,
  NotificationResult,
} from '../types/notification.ts';

export const terminalBellPlugin: NotificationPlugin = {
  id: 'terminal-bell',
  type: 'notification',
  name: 'Terminal Bell',
  version: '1.0.0',

  meta: {
    description: 'Simple terminal bell (BEL character) for alerts',
  },

  permissions: {},

  capabilities: {
    alerts: true,
    budgetWarnings: true,
    rateLimitWarnings: true,
    dailySummaries: false,
  },

  configSchema: {
    enabled: { type: 'boolean', default: true, description: 'Enable terminal bell notifications' },
    minSeverity: { type: 'select', default: 'medium', options: [
      { value: 'low', label: 'Low' },
      { value: 'medium', label: 'Medium' },
      { value: 'high', label: 'High' },
      { value: 'critical', label: 'Critical' },
    ]},
  },

  async initialize(_config: NotificationConfig, ctx: NotificationContext): Promise<void> {
    ctx.log.debug('Terminal bell notification plugin initialized');
  },

  async notify(notification: Notification, ctx: NotificationContext): Promise<NotificationResult> {
    const severityOrder = ['low', 'medium', 'high', 'critical'];
    const minSeverity = (ctx.config.minSeverity as string) ?? 'medium';
    
    if (severityOrder.indexOf(notification.severity) < severityOrder.indexOf(minSeverity)) {
      return { success: true };
    }

    const bellCount = notification.severity === 'critical' ? 3 :
                      notification.severity === 'high' ? 2 : 1;
    
    for (let i = 0; i < bellCount; i++) {
      process.stdout.write('\x07');
      if (i < bellCount - 1) {
        await sleep(200);
      }
    }

    return { success: true };
  },

  async test(ctx: NotificationContext): Promise<boolean> {
    ctx.log.info('Testing terminal bell...');
    process.stdout.write('\x07');
    return true;
  },
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
