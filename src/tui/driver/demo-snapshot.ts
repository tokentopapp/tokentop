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
  console.log('Creating driver...');
  const driver = await createDriver({ width: 100, height: 30 });
  
  console.log('Launching app...');
  await driver.launch();
  await driver.waitForStable();
  
  console.log('Capturing dashboard...');
  const dashboardFrame = await driver.capture();
  const dashboardPath = await saveSnapshot(dashboardFrame, '01-dashboard');
  console.log(`Saved: ${dashboardPath}`);
  
  console.log('Switching to Providers view...');
  await driver.pressKey('2');
  await driver.waitForStable();
  const providersFrame = await driver.capture();
  const providersPath = await saveSnapshot(providersFrame, '02-providers');
  console.log(`Saved: ${providersPath}`);
  
  console.log('Switching to Trends view...');
  await driver.pressKey('3');
  await driver.waitForStable();
  const trendsFrame = await driver.capture();
  const trendsPath = await saveSnapshot(trendsFrame, '03-trends');
  console.log(`Saved: ${trendsPath}`);
  
  console.log('Switching to Projects view...');
  await driver.pressKey('4');
  await driver.waitForStable();
  const projectsFrame = await driver.capture();
  const projectsPath = await saveSnapshot(projectsFrame, '04-projects');
  console.log(`Saved: ${projectsPath}`);
  
  console.log('Switching to Settings view...');
  await driver.pressKey('5');
  await driver.waitForStable();
  const settingsFrame = await driver.capture();
  const settingsPath = await saveSnapshot(settingsFrame, '05-settings');
  console.log(`Saved: ${settingsPath}`);
  
  console.log('Closing driver...');
  await driver.close();
  
  console.log('\n✓ All snapshots saved to ./snapshots/');
  console.log('  You can view them with: cat snapshots/01-dashboard.txt');
}

main().catch((err) => {
  console.error('Demo failed:', err);
  process.exit(1);
});
