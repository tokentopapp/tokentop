#!/usr/bin/env bun
import { createDriver } from './driver.ts';
import * as fs from 'fs/promises';
import * as path from 'path';

const SNAPSHOTS_DIR = './snapshots';

async function saveSnapshot(frame: string, name: string): Promise<string> {
  await fs.mkdir(SNAPSHOTS_DIR, { recursive: true });
  const filePath = path.join(SNAPSHOTS_DIR, `${name}.txt`);
  await fs.writeFile(filePath, frame, 'utf-8');
  return path.resolve(filePath);
}

async function main() {
  // Use 80x24 to match your terminal
  const driver = await createDriver({ width: 80, height: 24 });
  
  console.log('Launching app...');
  await driver.launch();
  await driver.waitForStable();
  
  // Step 1: Navigate to Settings (key 5)
  console.log('Navigating to Settings...');
  await driver.pressKey('5');
  await driver.waitForStable();
  
  // Step 2: Find and capture Alerts settings
  // Settings page likely has tabs/sections - need to find Alerts
  console.log('Looking for Alerts section...');
  let frame = await driver.capture();
  await saveSnapshot(frame, 'workflow-01-settings');
  console.log('Saved settings view');
  
  // Try navigating within settings to find Alerts (try arrow keys or tab)
  // First let's see what's on the settings page
  if (!frame.includes('Alerts') && !frame.includes('alerts')) {
    // Try pressing tab or arrows to navigate
    await driver.pressTab();
    await driver.waitForStable();
    frame = await driver.capture();
  }
  
  await saveSnapshot(frame, 'workflow-02-alerts-settings');
  console.log('Saved alerts settings');
  
  // Step 3: Navigate back to Dashboard (key 1)
  console.log('Navigating to Dashboard...');
  await driver.pressKey('1');
  await driver.waitForStable();
  frame = await driver.capture();
  await saveSnapshot(frame, 'workflow-03-dashboard');
  console.log('Saved dashboard view');
  
  // Step 4: Change time scale to 7d
  // Need to find how to change timescale - likely a dropdown or key
  console.log('Changing time scale to 7d...');
  // Try common keys for time scale selection
  // Check if there's a visible control for this
  
  // Try 't' for time or look for other controls
  await driver.pressKey('t');
  await driver.waitForStable();
  frame = await driver.capture();
  await saveSnapshot(frame, 'workflow-04-timescale-menu');
  
  // If a menu opened, try to select 7d
  if (frame.includes('7d') || frame.includes('7 d')) {
    // Navigate to 7d option
    await driver.pressArrow('down');
    await driver.waitForStable();
    await driver.pressArrow('down');
    await driver.waitForStable();
    frame = await driver.capture();
    await saveSnapshot(frame, 'workflow-05-timescale-selecting');
    await driver.pressEnter();
    await driver.waitForStable();
  }
  
  frame = await driver.capture();
  await saveSnapshot(frame, 'workflow-06-after-timescale');
  console.log('Saved after timescale change');
  
  // Step 5: Filter with "opus"
  console.log('Filtering with "opus"...');
  // Try '/' for search/filter (common pattern)
  await driver.pressKey('/');
  await driver.waitForStable();
  frame = await driver.capture();
  await saveSnapshot(frame, 'workflow-07-filter-input');
  
  // Type "opus"
  await driver.typeText('opus');
  await driver.waitForStable();
  frame = await driver.capture();
  await saveSnapshot(frame, 'workflow-08-filter-opus');
  
  // Press enter to apply filter
  await driver.pressEnter();
  await driver.waitForStable();
  
  // Final result
  frame = await driver.capture();
  await saveSnapshot(frame, 'workflow-09-final-result');
  console.log('Saved final filtered result');
  
  await driver.close();
  
  console.log('\n✓ Workflow complete! Check ./snapshots/workflow-*.txt');
}

main().catch((err) => {
  console.error('Workflow failed:', err);
  process.exit(1);
});
