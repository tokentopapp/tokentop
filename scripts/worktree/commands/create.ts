/**
 * Create worktree command
 */

import { join } from 'path';
import { existsSync } from 'fs';
import { execSync } from 'child_process';
import { WORKTREE_DIR } from '../config.ts';
import { readState, updateWorktree, type WorktreeInfo } from '../state.ts';
import { runGit } from '../utils.ts';

interface CreateOptions {
  branch?: string;
  noInstall?: boolean;
}

/**
 * Detect smart branch prefix based on worktree name
 * fix-* → fix/
 * refactor-* → refactor/
 * chore-* → chore/
 * docs-* → docs/
 * else → feature/
 */
function detectBranchPrefix(name: string): string {
  if (name.startsWith('fix-')) return 'fix/';
  if (name.startsWith('refactor-')) return 'refactor/';
  if (name.startsWith('chore-')) return 'chore/';
  if (name.startsWith('docs-')) return 'docs/';
  return 'feature/';
}

/**
 * Check if a branch exists locally or remotely
 */
function branchExists(branchName: string): boolean {
  try {
    runGit(`rev-parse --verify ${branchName}`);
    return true;
  } catch {
    try {
      runGit(`rev-parse --verify origin/${branchName}`);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Parse command line arguments for create command
 */
function parseCreateArgs(args: string[]): { name: string; options: CreateOptions } {
  if (args.length === 0) {
    throw new Error('Worktree name is required. Usage: create <name> [--branch <branch>] [--no-install]');
  }

  const name = args[0];
  const options: CreateOptions = {};

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--branch' && i + 1 < args.length) {
      options.branch = args[i + 1];
      i++;
    } else if (args[i] === '--no-install') {
      options.noInstall = true;
    }
  }

  return { name, options };
}

export async function createWorktree(args: string[]): Promise<void> {
  const { name, options } = parseCreateArgs(args);

  if (name === 'main' || name === 'master') {
    throw new Error('Cannot create worktree named "main" or "master"');
  }

  let branchName: string;
  if (options.branch) {
    branchName = options.branch;
  } else {
    const prefix = detectBranchPrefix(name);
    branchName = `${prefix}${name}`;
  }

  const worktreePath = join(WORKTREE_DIR, name);
  if (existsSync(worktreePath)) {
    throw new Error(`Worktree directory already exists: ${worktreePath}`);
  }

  const state = await readState();
  const existingWorktree = state.worktrees.find(w => w.name === name);
  if (existingWorktree) {
    throw new Error(`Worktree "${name}" is already registered in state`);
  }

  console.log(`Creating worktree: ${name}`);
  console.log(`Branch: ${branchName}`);
  console.log(`Path: ${worktreePath}`);

  const branchAlreadyExists = branchExists(branchName);
  
  try {
    if (branchAlreadyExists) {
      console.log(`Checking out existing branch: ${branchName}`);
      runGit(`worktree add ${worktreePath} ${branchName}`);
    } else {
      console.log(`Creating new branch: ${branchName}`);
      runGit(`worktree add -b ${branchName} ${worktreePath}`);
    }
  } catch (error) {
    throw new Error(`Failed to create worktree: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!options.noInstall) {
    console.log('Installing dependencies...');
    try {
      execSync('bun install', {
        cwd: worktreePath,
        stdio: 'inherit',
      });
    } catch (error) {
      console.warn('Warning: Failed to install dependencies. You may need to run "bun install" manually.');
    }
  }

  const worktreeInfo: WorktreeInfo = {
    name,
    path: worktreePath,
    branch: branchName,
    createdAt: new Date().toISOString(),
    lastActivity: new Date().toISOString(),
    gitStatus: 'clean',
  };

  await updateWorktree(worktreeInfo);

  console.log('\n✓ Worktree created successfully!');
  console.log('\nNext steps:');
  console.log(`  cd ${worktreePath}`);
  console.log(`  # Start working on ${branchName}`);
}
