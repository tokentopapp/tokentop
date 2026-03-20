import type {
  NotificationContext,
  NotificationEvent,
  NotificationPlugin,
} from "@tokentop/plugin-sdk";

export const visualFlashPlugin: NotificationPlugin = {
  apiVersion: 2,
  id: "visual-flash",
  type: "notification",
  name: "Visual Flash",
  version: "1.0.0",

  meta: {
    description: "Visual screen flash for alerts (rendered via TUI overlay)",
  },

  permissions: {},

  configSchema: {
    enabled: {
      type: "boolean",
      label: "Enabled",
      default: true,
      description: "Enable visual flash notifications",
    },
    duration: {
      type: "number",
      label: "Flash duration (ms)",
      default: 150,
      description: "Flash duration in milliseconds",
    },
  },

  supports(event: NotificationEvent): boolean {
    return (
      event.type.startsWith("budget.") ||
      event.type.startsWith("provider.") ||
      event.type === "plugin.crashed"
    );
  },

  async initialize(ctx: NotificationContext): Promise<void> {
    ctx.logger.debug("Visual flash notification plugin initialized");
  },

  async notify(_ctx: NotificationContext, _event: NotificationEvent): Promise<void> {
    // Flash is handled by the NotificationFlash React component via
    // notificationBus.flashHandler — raw ANSI escapes conflict with OpenTUI.
  },

  async test(ctx: NotificationContext): Promise<boolean> {
    ctx.logger.info("Testing visual flash...");
    return true;
  },
};
