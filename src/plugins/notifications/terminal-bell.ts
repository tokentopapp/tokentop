import type {
  NotificationContext,
  NotificationEvent,
  NotificationPlugin,
} from "@tokentop/plugin-sdk";

const SEVERITY_ORDER = ["info", "warning", "critical"];

/**
 * Write directly to stderr so the escape sequences bypass OpenTUI's
 * stdout render pipeline. Most terminals still interpret BEL and OSC
 * sequences arriving on fd 2.
 */
function writeEsc(data: string): void {
  process.stderr.write(data);
}

/**
 * OSC 777 (notify;title;body) — supported by iTerm2, Kitty, WezTerm, rxvt-unicode.
 * OSC 9 (notify;body)         — supported by Windows Terminal, ConEmu.
 * BEL (\x07)                  — universal fallback (if terminal has bell enabled).
 *
 * We send all three; unsupported sequences are silently ignored.
 */
function sendDesktopNotification(title: string, body: string): void {
  writeEsc(`\x1b]777;notify;${title};${body}\x07`);
  writeEsc(`\x1b]9;${title}: ${body}\x07`);
  writeEsc("\x07");
}

/**
 * macOS: afplay with system sounds (Ping, Funk, Glass, etc.)
 * Linux: paplay → aplay → canberra-gtk-play (first available)
 *
 * Fire-and-forget — errors are silently ignored so a missing
 * sound binary never breaks notifications.
 */
const SEVERITY_SOUNDS: Record<string, string> = {
  critical: "Funk.aiff",
  warning: "Ping.aiff",
  info: "Pop.aiff",
};

function playSystemSound(severity: string): void {
  const platform = process.platform;

  if (platform === "darwin") {
    const sound = SEVERITY_SOUNDS[severity] ?? "Ping.aiff";
    Bun.spawn(["afplay", `/System/Library/Sounds/${sound}`], {
      stdout: "ignore",
      stderr: "ignore",
    });
    return;
  }

  if (platform === "linux") {
    const xdgSound =
      severity === "critical"
        ? "dialog-error"
        : severity === "warning"
          ? "dialog-warning"
          : "dialog-information";

    Bun.spawn(["canberra-gtk-play", "-i", xdgSound], {
      stdout: "ignore",
      stderr: "ignore",
    }).exited.then((code) => {
      if (code !== 0) {
        Bun.spawn(["paplay", "/usr/share/sounds/freedesktop/stereo/bell.oga"], {
          stdout: "ignore",
          stderr: "ignore",
        });
      }
    });
    return;
  }

  // Windows / other — BEL only (already sent via sendDesktopNotification)
}

export const terminalBellPlugin: NotificationPlugin = {
  apiVersion: 2,
  id: "terminal-bell",
  type: "notification",
  name: "Terminal Bell",
  version: "1.0.0",

  meta: {
    description: "Desktop notification + system sound alerts",
  },

  permissions: {},

  configSchema: {
    enabled: {
      type: "boolean",
      label: "Enabled",
      default: true,
      description: "Enable terminal bell notifications",
    },
    minSeverity: {
      label: "Minimum severity",
      description: "Only trigger bell for alerts at this severity or higher.",
      type: "select",
      default: "warning",
      options: [
        { value: "info", label: "Info" },
        { value: "warning", label: "Warning" },
        { value: "critical", label: "Critical" },
      ],
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
    ctx.logger.debug("Terminal bell notification plugin initialized");
  },

  async notify(ctx: NotificationContext, event: NotificationEvent): Promise<void> {
    const minSeverity = (ctx.config.minSeverity as string) ?? "warning";

    if (SEVERITY_ORDER.indexOf(event.severity) < SEVERITY_ORDER.indexOf(minSeverity)) {
      return;
    }

    sendDesktopNotification(event.title, event.message);
    playSystemSound(event.severity);
  },

  async test(ctx: NotificationContext): Promise<boolean> {
    ctx.logger.info("Testing terminal bell...");
    sendDesktopNotification("tokentop", "Test notification");
    playSystemSound("warning");
    return true;
  },
};
