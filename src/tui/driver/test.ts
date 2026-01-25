#!/usr/bin/env bun
import { createDriver } from './driver.ts';

async function main() {
  console.log('Creating driver...');
  const driver = await createDriver({ width: 100, height: 30 });
  
  console.log('Launching app...');
  await driver.launch();
  
  console.log('Waiting for initial render...');
  await driver.waitForStable();
  
  console.log('Capturing initial frame...');
  const frame1 = await driver.capture();
  console.log('=== INITIAL FRAME ===');
  console.log(frame1);
  console.log('=== END FRAME ===\n');
  
  console.log('Pressing "2" to switch to Providers view...');
  await driver.pressKey('2');
  await driver.waitForStable();
  
  const frame2 = await driver.capture();
  console.log('=== PROVIDERS VIEW ===');
  console.log(frame2);
  console.log('=== END FRAME ===\n');
  
  console.log('Pressing "3" to switch to Trends view...');
  await driver.pressKey('3');
  await driver.waitForStable();
  
  const frame3 = await driver.capture();
  console.log('=== TRENDS VIEW ===');
  console.log(frame3);
  console.log('=== END FRAME ===\n');
  
  console.log('Closing driver...');
  await driver.close();
  
  console.log('Done!');
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
