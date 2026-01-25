#!/usr/bin/env bun
import * as readline from 'readline';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createDriver, type Driver, type DriverOptions } from './driver.ts';

const DEFAULT_SNAPSHOTS_DIR = './snapshots';

interface Command {
  action: string;
  [key: string]: unknown;
}

interface Response {
  ok: boolean;
  error?: string;
  [key: string]: unknown;
}

let driver: Driver | null = null;
let frameCounter = 0;

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

async function saveFrameToFile(frame: string, filePath: string): Promise<string> {
  const dir = path.dirname(filePath);
  await ensureDir(dir);
  await fs.writeFile(filePath, frame, 'utf-8');
  return path.resolve(filePath);
}

async function handleCommand(cmd: Command): Promise<Response> {
  try {
    switch (cmd.action) {
      case 'launch': {
        if (driver?.isRunning()) {
          return { ok: false, error: 'Driver already running' };
        }
        const options: DriverOptions = {
          width: typeof cmd.width === 'number' ? cmd.width : 100,
          height: typeof cmd.height === 'number' ? cmd.height : 30,
          appOptions: {
            debug: cmd.debug === true,
          },
        };
        driver = await createDriver(options);
        await driver.launch();
        return { ok: true };
      }

      case 'close': {
        if (!driver) {
          return { ok: false, error: 'Driver not running' };
        }
        await driver.close();
        driver = null;
        return { ok: true };
      }

      case 'sendKeys': {
        if (!driver?.isRunning()) {
          return { ok: false, error: 'Driver not running' };
        }
        const keys = typeof cmd.keys === 'string' ? cmd.keys : '';
        await driver.sendKeys(keys);
        return { ok: true };
      }

      case 'pressKey': {
        if (!driver?.isRunning()) {
          return { ok: false, error: 'Driver not running' };
        }
        const key = typeof cmd.key === 'string' ? cmd.key : '';
        const modifiers = typeof cmd.modifiers === 'object' && cmd.modifiers !== null
          ? cmd.modifiers as Record<string, boolean>
          : {};
        await driver.pressKey(key, modifiers);
        return { ok: true };
      }

      case 'typeText': {
        if (!driver?.isRunning()) {
          return { ok: false, error: 'Driver not running' };
        }
        const text = typeof cmd.text === 'string' ? cmd.text : '';
        const delay = typeof cmd.delay === 'number' ? cmd.delay : 0;
        await driver.typeText(text, delay);
        return { ok: true };
      }

      case 'pressTab': {
        if (!driver?.isRunning()) {
          return { ok: false, error: 'Driver not running' };
        }
        await driver.pressTab();
        return { ok: true };
      }

      case 'pressEnter': {
        if (!driver?.isRunning()) {
          return { ok: false, error: 'Driver not running' };
        }
        await driver.pressEnter();
        return { ok: true };
      }

      case 'pressEscape': {
        if (!driver?.isRunning()) {
          return { ok: false, error: 'Driver not running' };
        }
        await driver.pressEscape();
        return { ok: true };
      }

      case 'pressArrow': {
        if (!driver?.isRunning()) {
          return { ok: false, error: 'Driver not running' };
        }
        const direction = cmd.direction as 'up' | 'down' | 'left' | 'right';
        if (!['up', 'down', 'left', 'right'].includes(direction)) {
          return { ok: false, error: 'Invalid direction. Use: up, down, left, right' };
        }
        await driver.pressArrow(direction);
        return { ok: true };
      }

      case 'capture': {
        if (!driver?.isRunning()) {
          return { ok: false, error: 'Driver not running' };
        }
        const result = cmd.meta === true 
          ? await driver.captureWithMeta()
          : { frame: await driver.capture() };
        
        if (typeof cmd.save === 'string') {
          const savedPath = await saveFrameToFile(result.frame, cmd.save);
          return { ok: true, ...result, savedTo: savedPath };
        }
        
        return { ok: true, ...result };
      }

      case 'snapshot': {
        if (!driver?.isRunning()) {
          return { ok: false, error: 'Driver not running' };
        }
        const result = await driver.captureWithMeta();
        const dir = typeof cmd.dir === 'string' ? cmd.dir : DEFAULT_SNAPSHOTS_DIR;
        const name = typeof cmd.name === 'string' 
          ? cmd.name 
          : `frame-${String(++frameCounter).padStart(4, '0')}`;
        
        const framePath = path.join(dir, `${name}.txt`);
        const metadataPath = path.join(dir, `${name}.json`);
        
        const metadata = {
          timestamp: new Date(result.timestamp).toISOString(),
          width: result.width,
          height: result.height,
          name,
        };
        
        await ensureDir(dir);
        await Promise.all([
          fs.writeFile(framePath, result.frame, 'utf-8'),
          fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8'),
        ]);
        
        return { 
          ok: true, 
          savedTo: path.resolve(framePath), 
          metadataPath: path.resolve(metadataPath),
          name,
          metadata,
        };
      }

      case 'waitForText': {
        if (!driver?.isRunning()) {
          return { ok: false, error: 'Driver not running' };
        }
        const text = typeof cmd.text === 'string' ? cmd.text : '';
        const timeout = typeof cmd.timeout === 'number' ? cmd.timeout : 5000;
        const found = await driver.waitForText(text, { timeout });
        return { ok: true, found };
      }

      case 'waitForStable': {
        if (!driver?.isRunning()) {
          return { ok: false, error: 'Driver not running' };
        }
        const maxIterations = typeof cmd.maxIterations === 'number' ? cmd.maxIterations : 10;
        const intervalMs = typeof cmd.intervalMs === 'number' ? cmd.intervalMs : 50;
        await driver.waitForStable({ maxIterations, intervalMs });
        return { ok: true };
      }

      case 'resize': {
        if (!driver?.isRunning()) {
          return { ok: false, error: 'Driver not running' };
        }
        const cols = typeof cmd.cols === 'number' ? cmd.cols : 100;
        const rows = typeof cmd.rows === 'number' ? cmd.rows : 30;
        await driver.resize(cols, rows);
        return { ok: true };
      }

      case 'status': {
        return {
          ok: true,
          running: driver?.isRunning() ?? false,
          size: driver?.getSize() ?? null,
        };
      }

      case 'help': {
        return {
          ok: true,
          commands: [
            'launch - Start the app (options: width, height, debug)',
            'close - Stop the app',
            'sendKeys - Send key sequence (options: keys)',
            'pressKey - Press single key (options: key, modifiers)',
            'typeText - Type text (options: text, delay)',
            'capture - Get current frame (options: meta, save)',
            'snapshot - Save frame to file (options: dir, name)',
            'waitForText - Wait for text (options: text, timeout)',
            'waitForStable - Wait for stable frame (options: maxIterations, intervalMs)',
            'resize - Resize terminal (options: cols, rows)',
            'status - Get driver status',
          ],
        };
      }

      default:
        return { ok: false, error: `Unknown action: ${cmd.action}` };
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Tokentop Driver CLI

Headless driver for testing and automating the tokentop TUI.

Usage:
  bun src/tui/driver/cli.ts              # Interactive JSON-line mode
  bun src/tui/driver/cli.ts --help       # Show this help

JSON-line Protocol:
  Send JSON commands to stdin, receive JSON responses on stdout.
  One command per line.

Commands:
  {"action":"launch","width":100,"height":30}     Launch app
  {"action":"capture"}                             Get current frame
  {"action":"capture","save":"./frame.txt"}        Capture and save to file
  {"action":"snapshot","name":"dashboard"}         Save snapshot to ./snapshots/
  {"action":"sendKeys","keys":"jj"}               Send keystrokes
  {"action":"pressKey","key":"1"}                 Switch to view 1
  {"action":"waitForText","text":"Dashboard"}     Wait for text
  {"action":"resize","cols":120,"rows":40}        Resize terminal
  {"action":"close"}                              Stop app
  {"action":"help"}                               List all commands

Example:
  echo '{"action":"launch"}' | bun src/tui/driver/cli.ts
  echo '{"action":"capture"}' | bun src/tui/driver/cli.ts
`);
    process.exit(0);
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  const commandQueue: string[] = [];
  let processing = false;
  let closed = false;

  async function processQueue(): Promise<void> {
    if (processing) return;
    processing = true;
    
    while (commandQueue.length > 0) {
      const line = commandQueue.shift()!;
      try {
        const cmd = JSON.parse(line) as Command;
        const response = await handleCommand(cmd);
        console.log(JSON.stringify(response));
      } catch (err) {
        console.log(JSON.stringify({
          ok: false,
          error: `Invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
        }));
      }
    }
    
    processing = false;
    
    if (closed && commandQueue.length === 0) {
      if (driver?.isRunning()) {
        await driver.close();
      }
      process.exit(0);
    }
  }

  rl.on('line', (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    commandQueue.push(trimmed);
    processQueue();
  });

  rl.on('close', () => {
    closed = true;
    if (!processing && commandQueue.length === 0) {
      if (driver?.isRunning()) {
        driver.close().then(() => process.exit(0));
      } else {
        process.exit(0);
      }
    }
  });
}

main().catch((err) => {
  console.error('Driver CLI failed:', err);
  process.exit(1);
});
