/**
 * Switch worktree command
 */

import { readState, updateWorktree } from '../state.ts';
import { runGit } from '../utils.ts';

interface SwitchOptions {
  noCommit?: boolean;
}

function parseSwitchArgs(args: string[]): { name: string; options: SwitchOptions } {
  if (args.length === 0) {
    throw new Error('Worktree name is required. Usage: switch <name> [--no-commit]');
  }

  const name = args[0];
  const options: SwitchOptions = {};

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--no-commit') {
      options.noCommit = true;
    }
  }

  return { name, options };
}

function hasUncommittedChanges(): boolean {
  try {
    const status = runGit('status --porcelain');
    if (!status) return false;

    const lines = status.split('\n').filter(line => line.trim());
    const trackedChanges = lines.filter(line => !line.startsWith('??'));
    
    return trackedChanges.length > 0;
  } catch {
    return false;
  }
}

function createWipCommit(targetName: string): void {
  console.log('Uncommitted changes detected. Creating WIP commit...');
  
  runGit('add -u');
  
  const message = `WIP: auto-commit before switch to ${targetName}`;
  runGit(`commit -m "${message}"`);
  
  console.log(`✓ Created WIP commit: ${message}`);
}

export async function switchWorktree(args: string[]): Promise<void> {
  const { name, options } = parseSwitchArgs(args);

  const state = await readState();
  const targetWorktree = state.worktrees.find(w => w.name === name);

  if (!targetWorktree) {
    throw new Error(`Worktree "${name}" not found. Use "list" to see available worktrees.`);
  }

  if (!options.noCommit && hasUncommittedChanges()) {
    try {
      createWipCommit(name);
    } catch (error) {
      throw new Error(`Failed to create WIP commit: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  targetWorktree.lastActivity = new Date().toISOString();
  await updateWorktree(targetWorktree);

  console.log('\n✓ Ready to switch!');
  console.log('\nTo switch to this worktree, run:');
  console.log(`  cd ${targetWorktree.path}`);
  console.log(`\nWorktree: ${name}`);
  console.log(`Branch: ${targetWorktree.branch}`);
}
