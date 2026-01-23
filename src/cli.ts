#!/usr/bin/env bun
import { startTui } from './tui/index.tsx';
import { tokyoNightTheme } from './plugins/themes/tokyo-night.ts';
import { draculaTheme } from './plugins/themes/dracula.ts';
import { nordTheme } from './plugins/themes/nord.ts';
import type { ThemePlugin } from './plugins/types/theme.ts';

const THEMES: Record<string, ThemePlugin> = {
  'tokyo-night': tokyoNightTheme,
  dracula: draculaTheme,
  nord: nordTheme,
};

function printHelp() {
  console.log(`
tokentop - htop for AI API usage

Usage:
  ttop [options]

Options:
  -t, --theme <name>    Theme to use (tokyo-night, dracula, nord)
  -r, --refresh <ms>    Refresh interval in milliseconds (default: 60000)
  -d, --debug           Enable debug mode (verbose logging)
  -h, --help            Show this help message
  -v, --version         Show version

Keyboard shortcuts (in TUI):
  q                     Quit
  r                     Refresh all providers
  d                     Toggle debug console

Debug console shortcuts:
  ESC                   Close debug console
  c                     Clear logs
  x                     Export logs to file (~/.local/share/tokentop/logs/)
  y                     Copy all logs to clipboard
  [select text]         Copies to clipboard on mouse release

Examples:
  ttop                  Start with default theme
  ttop -t dracula       Start with Dracula theme
  ttop -r 30000         Refresh every 30 seconds
  ttop -d               Start with debug logging enabled
`);
}

function printVersion() {
  console.log('tokentop v0.1.0');
}

async function main() {
  const args = process.argv.slice(2);
  let theme: ThemePlugin = tokyoNightTheme;
  let refreshInterval = 60000;
  let debug = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '-h' || arg === '--help') {
      printHelp();
      process.exit(0);
    }

    if (arg === '-v' || arg === '--version') {
      printVersion();
      process.exit(0);
    }

    if (arg === '-d' || arg === '--debug') {
      debug = true;
    }

    if (arg === '-t' || arg === '--theme') {
      const themeName = args[++i];
      if (!themeName) {
        console.error('Error: --theme requires a theme name');
        process.exit(1);
      }
      const selectedTheme = THEMES[themeName];
      if (!selectedTheme) {
        console.error(`Error: Unknown theme "${themeName}". Available: ${Object.keys(THEMES).join(', ')}`);
        process.exit(1);
      }
      theme = selectedTheme;
    }

    if (arg === '-r' || arg === '--refresh') {
      const intervalStr = args[++i];
      const interval = intervalStr ? parseInt(intervalStr, 10) : NaN;
      if (isNaN(interval) || interval < 1000) {
        console.error('Error: --refresh must be a number >= 1000');
        process.exit(1);
      }
      refreshInterval = interval;
    }
  }

  await startTui({ theme, refreshInterval, debug });
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
