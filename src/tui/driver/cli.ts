#!/usr/bin/env bun
import * as readline from 'readline';
import * as fs from 'fs/promises';
import * as path from 'path';
import { diffFrames, highlightDiff } from './diff.ts';
import { assertSnapshot, listGoldenFiles, deleteGoldenFile, getGoldenFile } from './assertions.ts';
import { createDriver, type Driver, type DriverOptions } from './driver.ts';
import {
  createRecorder,
  replayRecording,
  saveRecording,
  loadRecording,
  listRecordings,
  deleteRecording,
  type Recorder,
  type Recording,
} from './recorder.ts';
import {
  createCoverageTracker,
  detectViewFromFrame,
  formatCoverageReport,
  type CoverageTracker,
} from './coverage.ts';

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
let recorder: Recorder | null = null;
let coverageTracker: CoverageTracker | null = null;
let currentWidth = 100;
let currentHeight = 30;

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
        currentWidth = typeof cmd.width === 'number' ? cmd.width : 100;
        currentHeight = typeof cmd.height === 'number' ? cmd.height : 30;
        const options: DriverOptions = {
          width: currentWidth,
          height: currentHeight,
          appOptions: {
            debug: cmd.debug === true,
            demoMode: cmd.demo === true,
            ...(typeof cmd.demoSeed === 'number' ? { demoSeed: cmd.demoSeed, demoMode: true } : {}),
            ...(typeof cmd.demoPreset === 'string' && ['light', 'normal', 'heavy'].includes(cmd.demoPreset)
              ? { demoPreset: cmd.demoPreset as 'light' | 'normal' | 'heavy', demoMode: true }
              : {}),
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
        recorder?.addCommand('sendKeys', { keys });
        if (recorder?.isRecording()) {
          recorder.captureFrame(await driver.capture());
        }
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
        recorder?.addCommand('pressKey', { key, ...(Object.keys(modifiers).length > 0 ? { modifiers } : {}) });
        if (recorder?.isRecording()) {
          recorder.captureFrame(await driver.capture());
        }
        return { ok: true };
      }

      case 'typeText': {
        if (!driver?.isRunning()) {
          return { ok: false, error: 'Driver not running' };
        }
        const text = typeof cmd.text === 'string' ? cmd.text : '';
        const delay = typeof cmd.delay === 'number' ? cmd.delay : 0;
        await driver.typeText(text, delay);
        recorder?.addCommand('typeText', { text, ...(delay > 0 ? { delay } : {}) });
        if (recorder?.isRecording()) {
          recorder.captureFrame(await driver.capture());
        }
        return { ok: true };
      }

      case 'pressTab': {
        if (!driver?.isRunning()) {
          return { ok: false, error: 'Driver not running' };
        }
        await driver.pressTab();
        recorder?.addCommand('pressTab');
        if (recorder?.isRecording()) {
          recorder.captureFrame(await driver.capture());
        }
        return { ok: true };
      }

      case 'pressEnter': {
        if (!driver?.isRunning()) {
          return { ok: false, error: 'Driver not running' };
        }
        await driver.pressEnter();
        recorder?.addCommand('pressEnter');
        if (recorder?.isRecording()) {
          recorder.captureFrame(await driver.capture());
        }
        return { ok: true };
      }

      case 'pressEscape': {
        if (!driver?.isRunning()) {
          return { ok: false, error: 'Driver not running' };
        }
        await driver.pressEscape();
        recorder?.addCommand('pressEscape');
        if (recorder?.isRecording()) {
          recorder.captureFrame(await driver.capture());
        }
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
        recorder?.addCommand('pressArrow', { direction });
        if (recorder?.isRecording()) {
          recorder.captureFrame(await driver.capture());
        }
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
        recorder?.addCommand('waitForStable', { maxIterations, intervalMs });
        return { ok: true };
      }

      case 'resize': {
        if (!driver?.isRunning()) {
          return { ok: false, error: 'Driver not running' };
        }
        const cols = typeof cmd.cols === 'number' ? cmd.cols : 100;
        const rows = typeof cmd.rows === 'number' ? cmd.rows : 30;
        await driver.resize(cols, rows);
        currentWidth = cols;
        currentHeight = rows;
        recorder?.addCommand('resize', { cols, rows });
        return { ok: true };
      }

      case 'status': {
        return {
          ok: true,
          running: driver?.isRunning() ?? false,
          size: driver?.getSize() ?? null,
        };
      }

      case 'diff': {
        const file1 = typeof cmd.file1 === 'string' ? cmd.file1 : null;
        const file2 = typeof cmd.file2 === 'string' ? cmd.file2 : null;
        const frame1 = typeof cmd.frame1 === 'string' ? cmd.frame1 : null;
        const frame2 = typeof cmd.frame2 === 'string' ? cmd.frame2 : null;
        const ignoreWhitespace = cmd.ignoreWhitespace === true;
        
        let expected: string;
        let actual: string;
        
        if (file1 && file2) {
          expected = await fs.readFile(file1, 'utf-8');
          actual = await fs.readFile(file2, 'utf-8');
        } else if (frame1 && frame2) {
          expected = frame1;
          actual = frame2;
        } else {
          return { ok: false, error: 'Provide file1/file2 or frame1/frame2' };
        }
        
        const result = diffFrames(expected, actual, { ignoreWhitespace });
        const visual = cmd.visual === true ? highlightDiff(expected, actual, { ignoreWhitespace }) : undefined;
        
        return {
          ok: true,
          identical: result.identical,
          changedLines: result.changedLines,
          totalLines: result.totalLines,
          changePercentage: result.changePercentage,
          additions: result.additions.length,
          deletions: result.deletions.length,
          modifications: result.modifications.length,
          ...(visual ? { visual } : {}),
        };
      }

      case 'assert': {
        if (!driver?.isRunning()) {
          return { ok: false, error: 'Driver not running' };
        }
        const name = typeof cmd.name === 'string' ? cmd.name : null;
        if (!name) {
          return { ok: false, error: 'Name is required for assertion' };
        }
        
        const frame = await driver.capture();
        const { width, height } = driver.getSize();
        const goldenDir = typeof cmd.goldenDir === 'string' ? cmd.goldenDir : './golden';
        const updateGolden = cmd.update === true;
        const ignoreWhitespace = cmd.ignoreWhitespace === true;
        
        const result = await assertSnapshot(name, frame, {
          goldenDir,
          updateGolden,
          ignoreWhitespace,
          width,
          height,
        });
        
        return {
          ok: true,
          passed: result.passed,
          goldenExists: result.goldenExists,
          goldenPath: result.goldenPath,
          message: result.message,
          width,
          height,
          ...(result.dimensionMismatch ? { dimensionMismatch: result.dimensionMismatch } : {}),
          ...(result.diff ? {
            changedLines: result.diff.changedLines,
            totalLines: result.diff.totalLines,
            changePercentage: result.diff.changePercentage,
          } : {}),
          ...(result.visual && cmd.visual === true ? { visual: result.visual } : {}),
        };
      }

      case 'listGolden': {
        const goldenDir = typeof cmd.goldenDir === 'string' ? cmd.goldenDir : './golden';
        const files = await listGoldenFiles(goldenDir);
        return { ok: true, files, count: files.length };
      }

      case 'getGolden': {
        const name = typeof cmd.name === 'string' ? cmd.name : null;
        if (!name) {
          return { ok: false, error: 'Name is required' };
        }
        const goldenDir = typeof cmd.goldenDir === 'string' ? cmd.goldenDir : './golden';
        const info = await getGoldenFile(name, goldenDir);
        if (info === null) {
          return { ok: false, error: `Golden file not found: ${name}` };
        }
        return {
          ok: true,
          name: info.name,
          content: info.content,
          width: info.width,
          height: info.height,
          createdAt: info.createdAt,
          updatedAt: info.updatedAt,
          isLegacy: info.isLegacy,
        };
      }

      case 'deleteGolden': {
        const name = typeof cmd.name === 'string' ? cmd.name : null;
        if (!name) {
          return { ok: false, error: 'Name is required' };
        }
        const goldenDir = typeof cmd.goldenDir === 'string' ? cmd.goldenDir : './golden';
        const deleted = await deleteGoldenFile(name, goldenDir);
        return { ok: true, deleted, name };
      }

      case 'startRecording': {
        if (!driver?.isRunning()) {
          return { ok: false, error: 'Driver not running' };
        }
        if (recorder?.isRecording()) {
          return { ok: false, error: 'Already recording' };
        }
        const name = typeof cmd.name === 'string' ? cmd.name : `recording-${Date.now()}`;
        const captureFrames = cmd.captureFrames === true;
        recorder = createRecorder(currentWidth, currentHeight, { name, captureFrames });
        recorder.start();
        return { ok: true, name, captureFrames };
      }

      case 'stopRecording': {
        if (!recorder?.isRecording()) {
          return { ok: false, error: 'Not recording' };
        }
        const recording = recorder.stop();
        const recordingsDir = typeof cmd.dir === 'string' ? cmd.dir : './recordings';
        const savedPath = await saveRecording(recording, recordingsDir);
        recorder = null;
        return {
          ok: true,
          name: recording.name,
          commandCount: recording.commands.length,
          savedTo: savedPath,
        };
      }

      case 'cancelRecording': {
        if (!recorder?.isRecording()) {
          return { ok: false, error: 'Not recording' };
        }
        recorder = null;
        return { ok: true };
      }

      case 'recordingStatus': {
        return {
          ok: true,
          recording: recorder?.isRecording() ?? false,
          commandCount: recorder?.getRecording()?.commands.length ?? 0,
        };
      }

      case 'replay': {
        if (!driver?.isRunning()) {
          return { ok: false, error: 'Driver not running' };
        }
        const name = typeof cmd.name === 'string' ? cmd.name : null;
        let recording: Recording | null = null;

        if (name) {
          const recordingsDir = typeof cmd.dir === 'string' ? cmd.dir : './recordings';
          recording = await loadRecording(name, recordingsDir);
          if (!recording) {
            return { ok: false, error: `Recording not found: ${name}` };
          }
        } else if (typeof cmd.recording === 'object' && cmd.recording !== null) {
          recording = cmd.recording as Recording;
        } else {
          return { ok: false, error: 'Provide name or recording object' };
        }

        const speed = typeof cmd.speed === 'number' ? cmd.speed : Infinity;
        const result = await replayRecording(driver, recording, { speed });

        return {
          ok: true,
          success: result.success,
          commandsExecuted: result.commandsExecuted,
          totalCommands: result.totalCommands,
          errors: result.errors,
        };
      }

      case 'listRecordings': {
        const recordingsDir = typeof cmd.dir === 'string' ? cmd.dir : './recordings';
        const recordings = await listRecordings(recordingsDir);
        return { ok: true, recordings, count: recordings.length };
      }

      case 'getRecording': {
        const name = typeof cmd.name === 'string' ? cmd.name : null;
        if (!name) {
          return { ok: false, error: 'Name is required' };
        }
        const recordingsDir = typeof cmd.dir === 'string' ? cmd.dir : './recordings';
        const recording = await loadRecording(name, recordingsDir);
        if (!recording) {
          return { ok: false, error: `Recording not found: ${name}` };
        }
        return { ok: true, recording };
      }

      case 'deleteRecording': {
        const name = typeof cmd.name === 'string' ? cmd.name : null;
        if (!name) {
          return { ok: false, error: 'Name is required' };
        }
        const recordingsDir = typeof cmd.dir === 'string' ? cmd.dir : './recordings';
        const deleted = await deleteRecording(name, recordingsDir);
        return { ok: true, deleted, name };
      }

      case 'startCoverage': {
        if (!driver?.isRunning()) {
          return { ok: false, error: 'Driver not running' };
        }
        if (coverageTracker?.isTracking()) {
          return { ok: false, error: 'Already tracking coverage' };
        }
        const knownViews =
          Array.isArray(cmd.knownViews) &&
          cmd.knownViews.every((v): v is string => typeof v === 'string')
            ? cmd.knownViews
            : undefined;
        coverageTracker = createCoverageTracker(knownViews);
        coverageTracker.start();
        return { ok: true };
      }

      case 'stopCoverage': {
        if (!coverageTracker?.isTracking()) {
          return { ok: false, error: 'Not tracking coverage' };
        }
        const report = coverageTracker.stop();
        const visual = cmd.visual === true ? formatCoverageReport(report) : undefined;
        coverageTracker = null;
        return {
          ok: true,
          ...report,
          ...(visual ? { visual } : {}),
        };
      }

      case 'recordViewFromFrame': {
        if (!driver?.isRunning()) {
          return { ok: false, error: 'Driver not running' };
        }
        if (!coverageTracker?.isTracking()) {
          return { ok: false, error: 'Not tracking coverage' };
        }
        const frame = await driver.capture();
        const view = detectViewFromFrame(frame);
        if (view) {
          coverageTracker.recordView(view);
        }
        return { ok: true, detectedView: view };
      }

      case 'getCoverage': {
        if (!coverageTracker) {
          return { ok: false, error: 'No coverage tracker' };
        }
        const report = coverageTracker.getReport();
        const visual = cmd.visual === true ? formatCoverageReport(report) : undefined;
        return {
          ok: true,
          ...report,
          ...(visual ? { visual } : {}),
        };
      }

      case 'help': {
        return {
          ok: true,
          commands: [
            'launch - Start the app (options: width, height, debug; demo mode: demo, demoSeed, demoPreset)',
            'close - Stop the app',
            'sendKeys - Send key sequence (options: keys)',
            'pressKey - Press single key (options: key, modifiers)',
            'pressTab - Press Tab key',
            'pressEnter - Press Enter key',
            'pressEscape - Press Escape key',
            'pressArrow - Press arrow key (options: direction)',
            'typeText - Type text (options: text, delay)',
            'capture - Get current frame (options: meta, save)',
            'snapshot - Save frame to file (options: dir, name)',
            'waitForText - Wait for text (options: text, timeout)',
            'waitForStable - Wait for stable frame (options: maxIterations, intervalMs)',
            'resize - Resize terminal (options: cols, rows)',
            'status - Get driver status',
            'diff - Compare two frames (options: file1, file2 OR frame1, frame2, ignoreWhitespace, visual)',
            'assert - Assert snapshot matches golden file (options: name, goldenDir, update, ignoreWhitespace, visual)',
            'listGolden - List all golden files (options: goldenDir)',
            'getGolden - Get content of golden file (options: name, goldenDir)',
            'deleteGolden - Delete a golden file (options: name, goldenDir)',
            'startRecording - Start recording commands (options: name, captureFrames)',
            'stopRecording - Stop recording and save (options: dir)',
            'cancelRecording - Cancel recording without saving',
            'recordingStatus - Get current recording status',
            'replay - Replay a recording (options: name, dir, speed)',
            'listRecordings - List all recordings (options: dir)',
            'getRecording - Get a recording (options: name, dir)',
            'deleteRecording - Delete a recording (options: name, dir)',
            'startCoverage - Start tracking view coverage (options: knownViews)',
            'stopCoverage - Stop tracking and get report (options: visual)',
            'recordViewFromFrame - Detect and record current view',
            'getCoverage - Get current coverage report (options: visual)',
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
  {"action":"launch","width":100,"height":30}                    Launch app
  {"action":"launch","demo":true}                                Launch in demo mode
  {"action":"launch","demo":true,"demoSeed":42}                  Launch demo with seed
  {"action":"launch","demo":true,"demoPreset":"heavy"}           Launch demo with preset
  {"action":"capture"}                                           Get current frame
  {"action":"capture","save":"./frame.txt"}                      Capture and save to file
  {"action":"snapshot","name":"dashboard"}                       Save snapshot to ./snapshots/
  {"action":"sendKeys","keys":"jj"}                             Send keystrokes
  {"action":"pressKey","key":"1"}                               Switch to view 1
  {"action":"waitForText","text":"Dashboard"}                   Wait for text
  {"action":"resize","cols":120,"rows":40}                      Resize terminal
  {"action":"close"}                                            Stop app
  {"action":"help"}                                             List all commands

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
