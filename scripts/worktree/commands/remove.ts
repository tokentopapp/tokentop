/**
 * Remove worktree command
 */

import { readState, removeWorktree as removeWorktreeFromState } from '../state.ts';
import { execSync } from 'child_process';
import { existsSync } from 'fs';

interface RemoveOptions {
  force: boolean;
  deleteBranch: boolean;
}

/**
 * Parse command line arguments
 */
function parseArgs(args: string[]): { name: string; options: RemoveOptions } {
  if (args.length === 0) {
    throw new Error('Missing worktree name. Usage: remove <name> [--force] [--delete-branch]');
  }

  const name = args[0];
  const options: RemoveOptions = {
    force: args.includes('--force'),
    deleteBranch: args.includes('--delete-branch'),
  };

  return { name, options };
}

/**
 * Check if a worktree has uncommitted changes
 */
function hasUncommittedChanges(worktreePath: string): boolean {
  try {
    const output = execSync(`git -C "${worktreePath}" status --porcelain`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();

    return output.length > 0;
  } catch {
    return false;
  }
}

/**
 * Check if a worktree has unpushed commits
 */
function hasUnpushedCommits(worktreePath: string, branch: string): boolean {
  try {
    // Get the upstream branch
    const upstream = execSync(`git -C "${worktreePath}" rev-parse --abbrev-ref ${branch}@{upstream}`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();

    // Count commits ahead of upstream
    const output = execSync(`git -C "${worktreePath}" rev-list --count ${upstream}..${branch}`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();

    return parseInt(output, 10) > 0;
  } catch {
    // If upstream doesn't exist or command fails, assume no unpushed commits
    return false;
  }
}

/**
 * Delete a git branch
 */
function deleteBranch(branch: string): void {
  try {
    execSync(`git branch -D ${branch}`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    console.log(`✓ Deleted branch: ${branch}`);
  } catch (error) {
    console.error(`Warning: Failed to delete branch ${branch}`);
  }
}

export async function removeWorktree(args: string[] = []): Promise<void> {
  try {
    const { name, options } = parseArgs(args);

    const state = await readState();
    const worktree = state.worktrees.find(wt => wt.name === name);

    if (!worktree) {
      throw new Error(`Worktree '${name}' not found`);
    }

    // CRITICAL: Block removal of main worktree completely
    if (worktree.path === state.mainWorktree) {
      throw new Error('Cannot remove main worktree. This operation is not allowed.');
    }

    if (!existsSync(worktree.path)) {
      console.log(`Warning: Worktree path does not exist: ${worktree.path}`);
      console.log('Removing from state file only...');
      await removeWorktreeFromState(name);
      console.log(`✓ Removed worktree '${name}' from state`);
      return;
    }

    const warnings: string[] = [];

    if (hasUncommittedChanges(worktree.path)) {
      warnings.push('⚠ Worktree has uncommitted changes');
    }

    if (hasUnpushedCommits(worktree.path, worktree.branch)) {
      warnings.push('⚠ Worktree has unpushed commits');
    }

    if (warnings.length > 0) {
      console.log('\nWarnings:');
      warnings.forEach(warning => console.log(`  ${warning}`));
      console.log('');

      if (!options.force) {
        throw new Error('Removal blocked due to warnings. Use --force to proceed anyway.');
      } else {
        console.log('Proceeding with --force flag...\n');
      }
    }

    try {
      const forceFlag = options.force ? ' --force' : '';
      execSync(`git worktree remove${forceFlag} "${worktree.path}"`, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      console.log(`✓ Removed worktree: ${worktree.path}`);
    } catch (error) {
      throw new Error(`Failed to remove worktree: ${error instanceof Error ? error.message : String(error)}`);
    }

    await removeWorktreeFromState(name);
    console.log(`✓ Updated state file`);

    if (options.deleteBranch) {
      deleteBranch(worktree.branch);
    }

    console.log(`\n✓ Successfully removed worktree '${name}'`);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
