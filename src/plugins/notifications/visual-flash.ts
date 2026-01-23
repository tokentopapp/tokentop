import type {
  NotificationPlugin,
  NotificationContext,
  NotificationConfig,
  Notification,
  NotificationResult,
} from '../types/notification.ts';

export const visualFlashPlugin: NotificationPlugin = {
  id: 'visual-flash',
  type: 'notification',
  name: 'Visual Flash',
  version: '1.0.0',

  meta: {
    description: 'Visual screen flash using ANSI escape sequences',
  },

  permissions: {},

  capabilities: {
    alerts: true,
    budgetWarnings: true,
    rateLimitWarnings: true,
    dailySummaries: false,
  },

  configSchema: {
    enabled: { type: 'boolean', default: true, description: 'Enable visual flash notifications' },
    duration: { type: 'number', default: 100, description: 'Flash duration in milliseconds' },
  },

  async initialize(_config: NotificationConfig, ctx: NotificationContext): Promise<void> {
    ctx.log.debug('Visual flash notification plugin initialized');
  },

  async notify(notification: Notification, ctx: NotificationContext): Promise<NotificationResult> {
    const duration = (ctx.config.duration as number) ?? 100;
    
    const colorCode = notification.severity === 'critical' ? '41' :
                      notification.severity === 'high' ? '43' :
                      notification.severity === 'medium' ? '44' : '42';
    
    process.stdout.write(`\x1b[${colorCode}m`);
    await sleep(duration);
    process.stdout.write('\x1b[0m');
    
    return { success: true };
  },

  async test(ctx: NotificationContext): Promise<boolean> {
    ctx.log.info('Testing visual flash...');
    process.stdout.write('\x1b[44m');
    await sleep(100);
    process.stdout.write('\x1b[0m');
    return true;
  },
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
