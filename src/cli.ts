#!/usr/bin/env bun
import { startTui, type TuiOptions } from './tui/index.tsx';
import { tokyoNightTheme } from './plugins/themes/tokyo-night.ts';
import { draculaTheme } from './plugins/themes/dracula.ts';
import { nordTheme } from './plugins/themes/nord.ts';
import type { ThemePlugin } from './plugins/types/theme.ts';
import type { DemoPreset } from './demo/simulator.ts';

const THEMES: Record<string, ThemePlugin> = {
  'tokyo-night': tokyoNightTheme,
  dracula: draculaTheme,
  nord: nordTheme,
};

const DEMO_PRESETS: DemoPreset[] = ['light', 'normal', 'heavy'];

function printHelp() {
  console.log(`
tokentop - htop for AI API usage

Usage:
  ttop [options]
  ttop demo [options]

Commands:
  demo                    Run with demo data (no real providers)

Options:
  -t, --theme <name>      Theme to use (tokyo-night, dracula, nord)
  -r, --refresh <ms>      Refresh interval in milliseconds (default: 60000)
  -d, --debug             Enable debug mode (verbose logging)
  -h, --help              Show this help message
  -v, --version           Show version

Demo Options:
  --seed <number>         Seed for deterministic demo data
  --preset <preset>       Demo intensity: light, normal, heavy (default: normal)

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
  ttop                        Start with default theme
  ttop -t dracula             Start with Dracula theme
  ttop -r 30000               Refresh every 30 seconds
  ttop -d                     Start with debug logging enabled
  ttop demo                   Start in demo mode
  ttop demo --seed 42         Demo mode with seed 42 (reproducible)
  ttop demo --preset heavy    Demo mode with high activity
`);
}

function printVersion() {
  console.log('tokentop v0.1.0');
}

async function main() {
  const args = process.argv.slice(2);
  
  // Check for subcommands first
  const subcommand = args[0] && !args[0].startsWith('-') ? args[0] : null;
  const commandArgs = subcommand ? args.slice(1) : args;
  
  let theme: ThemePlugin = tokyoNightTheme;
  let refreshInterval = 60000;
  let debug = false;
  let demo = false;
  let demoSeed: number | undefined;
  let demoPreset: DemoPreset | undefined;

  // Handle demo subcommand
  if (subcommand === 'demo') {
    demo = true;
  } else if (subcommand !== null) {
    console.error(`Error: Unknown command "${subcommand}"`);
    console.error('Run "ttop --help" for usage information');
    process.exit(1);
  }

  for (let i = 0; i < commandArgs.length; i++) {
    const arg = commandArgs[i];

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

    // Demo subcommand options
    if (arg === '--seed') {
      if (!demo) {
        console.error('Error: --seed can only be used with the demo command');
        process.exit(1);
      }
      const seedStr = commandArgs[++i];
      const seed = seedStr ? parseInt(seedStr, 10) : NaN;
      if (isNaN(seed)) {
        console.error('Error: --seed requires a number');
        process.exit(1);
      }
      demoSeed = seed;
    }

    if (arg === '--preset') {
      if (!demo) {
        console.error('Error: --preset can only be used with the demo command');
        process.exit(1);
      }
      const preset = commandArgs[++i] as DemoPreset;
      if (!preset || !DEMO_PRESETS.includes(preset)) {
        console.error(`Error: --preset must be one of: ${DEMO_PRESETS.join(', ')}`);
        process.exit(1);
      }
      demoPreset = preset;
    }

    if (arg === '-t' || arg === '--theme') {
      const themeName = commandArgs[++i];
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
      const intervalStr = commandArgs[++i];
      const interval = intervalStr ? parseInt(intervalStr, 10) : NaN;
      if (isNaN(interval) || interval < 1000) {
        console.error('Error: --refresh must be a number >= 1000');
        process.exit(1);
      }
      refreshInterval = interval;
    }
  }

  const launchOptions: TuiOptions = {
    theme,
    refreshInterval,
    debug,
    demo,
  };
  if (demoSeed !== undefined) {
    launchOptions.demoSeed = demoSeed;
  }
  if (demoPreset !== undefined) {
    launchOptions.demoPreset = demoPreset;
  }
  await startTui(launchOptions);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
