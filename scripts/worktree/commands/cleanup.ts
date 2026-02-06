/**
 * Cleanup worktrees command
 * Finds and removes merged or stale worktrees with user confirmation
 */

import { readState, removeWorktree as removeWorktreeFromState } from '../state.ts';
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import * as readline from 'readline';

interface CleanupOptions {
  dryRun: boolean;
  staleDays: number;
  force: boolean;
  deleteBranches: boolean;
}

interface CleanupCandidate {
  name: string;
  path: string;
  branch: string;
  reason: 'merged' | 'stale';
  lastActivity: string;
  hasUncommittedChanges: boolean;
}

/**
 * Parse command line arguments
 */
function parseArgs(args: string[]): CleanupOptions {
  const options: CleanupOptions = {
    dryRun: args.includes('--dry-run'),
    staleDays: 30,
    force: args.includes('--force'),
    deleteBranches: args.includes('--delete-branches'),
  };

  const staleDaysIndex = args.indexOf('--stale-days');
  if (staleDaysIndex !== -1 && args[staleDaysIndex + 1]) {
    const days = parseInt(args[staleDaysIndex + 1], 10);
    if (!isNaN(days) && days > 0) {
      options.staleDays = days;
    }
  }

  return options;
}

/**
 * Check if a branch is merged into main
 */
function isBranchMerged(branch: string): boolean {
  try {
    const output = execSync('git branch --merged main', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    });

    const mergedBranches = output
      .split('\n')
      .map(line => line.trim().replace(/^\*\s+/, ''))
      .filter(line => line.length > 0);

    return mergedBranches.includes(branch);
  } catch {
    return false;
  }
}

/**
 * Check if a worktree is stale (no activity for N days)
 */
function isWorktreeStale(lastActivity: string, staleDays: number): boolean {
  const lastActivityDate = new Date(lastActivity);
  const now = new Date();
  const daysSinceActivity = (now.getTime() - lastActivityDate.getTime()) / (1000 * 60 * 60 * 24);

  return daysSinceActivity > staleDays;
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
 * Prompt user for confirmation
 */
function promptConfirmation(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise(resolve => {
    rl.question(`${message} (y/n): `, answer => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

/**
 * Remove a worktree (reusing logic from remove command)
 */
async function removeWorktreePhysically(path: string, force: boolean): Promise<void> {
  const forceFlag = force ? ' --force' : '';
  execSync(`git worktree remove${forceFlag} "${path}"`, {
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
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
    console.log(`  ✓ Deleted branch: ${branch}`);
  } catch (error) {
    console.error(`  Warning: Failed to delete branch ${branch}`);
  }
}

export async function cleanupWorktrees(args: string[] = []): Promise<void> {
  try {
    const options = parseArgs(args);

    console.log('🔍 Scanning for worktrees to clean up...\n');

    const state = await readState();
    const candidates: CleanupCandidate[] = [];

    // Find cleanup candidates
    for (const worktree of state.worktrees) {
      // Skip main worktree
      if (worktree.path === state.mainWorktree) {
        continue;
      }

      // Check if worktree path exists
      if (!existsSync(worktree.path)) {
        // Worktree doesn't exist, add as candidate for state cleanup
        candidates.push({
          name: worktree.name,
          path: worktree.path,
          branch: worktree.branch,
          reason: 'stale',
          lastActivity: worktree.lastActivity,
          hasUncommittedChanges: false,
        });
        continue;
      }

      // Check for uncommitted changes
      const hasChanges = hasUncommittedChanges(worktree.path);

      // Check if branch is merged
      if (isBranchMerged(worktree.branch)) {
        candidates.push({
          name: worktree.name,
          path: worktree.path,
          branch: worktree.branch,
          reason: 'merged',
          lastActivity: worktree.lastActivity,
          hasUncommittedChanges: hasChanges,
        });
        continue;
      }

      // Check if worktree is stale
      if (isWorktreeStale(worktree.lastActivity, options.staleDays)) {
        candidates.push({
          name: worktree.name,
          path: worktree.path,
          branch: worktree.branch,
          reason: 'stale',
          lastActivity: worktree.lastActivity,
          hasUncommittedChanges: hasChanges,
        });
      }
    }

    // Filter out worktrees with uncommitted changes (unless force)
    const safeToRemove = candidates.filter(c => !c.hasUncommittedChanges);
    const unsafeToRemove = candidates.filter(c => c.hasUncommittedChanges);

    if (candidates.length === 0) {
      console.log('✓ No worktrees to clean up. Everything looks good!');
      return;
    }

    // Display what would be removed
    console.log(`Found ${candidates.length} worktree(s) to clean up:\n`);

    if (safeToRemove.length > 0) {
      console.log('Safe to remove:');
      for (const candidate of safeToRemove) {
        const reasonText = candidate.reason === 'merged' 
          ? 'branch merged to main' 
          : `no activity for ${options.staleDays}+ days`;
        console.log(`  • ${candidate.name} (${candidate.branch}) - ${reasonText}`);
        console.log(`    Path: ${candidate.path}`);
        console.log(`    Last activity: ${candidate.lastActivity}`);
      }
      console.log('');
    }

    if (unsafeToRemove.length > 0) {
      console.log('⚠ Skipped (uncommitted changes):');
      for (const candidate of unsafeToRemove) {
        const reasonText = candidate.reason === 'merged' 
          ? 'branch merged to main' 
          : `no activity for ${options.staleDays}+ days`;
        console.log(`  • ${candidate.name} (${candidate.branch}) - ${reasonText}`);
        console.log(`    Path: ${candidate.path}`);
        console.log(`    ⚠ Has uncommitted changes - will not remove`);
      }
      console.log('');
    }

    if (safeToRemove.length === 0) {
      console.log('✓ No worktrees can be safely removed (all have uncommitted changes).');
      console.log('  Commit or stash changes first, or use --force in the remove command.');
      return;
    }

    // Dry run mode - stop here
    if (options.dryRun) {
      console.log('🔍 Dry run mode - no changes made.');
      console.log(`\nTo actually remove these worktrees, run without --dry-run`);
      return;
    }

    // Require confirmation unless --force
    if (!options.force) {
      const confirmed = await promptConfirmation(
        `\nRemove ${safeToRemove.length} worktree(s)?`
      );

      if (!confirmed) {
        console.log('Cleanup cancelled.');
        return;
      }
    }

    // Perform cleanup
    console.log('\n🗑️  Removing worktrees...\n');

    let successCount = 0;
    let failCount = 0;

    for (const candidate of safeToRemove) {
      try {
        console.log(`Removing: ${candidate.name}`);

        // Remove worktree physically if it exists
        if (existsSync(candidate.path)) {
          await removeWorktreePhysically(candidate.path, true);
          console.log(`  ✓ Removed worktree: ${candidate.path}`);
        } else {
          console.log(`  ℹ Worktree path doesn't exist, cleaning state only`);
        }

        // Remove from state
        await removeWorktreeFromState(candidate.name);
        console.log(`  ✓ Updated state file`);

        // Delete branch if requested
        if (options.deleteBranches && candidate.reason === 'merged') {
          deleteBranch(candidate.branch);
        }

        successCount++;
        console.log('');
      } catch (error) {
        console.error(`  ✗ Failed to remove ${candidate.name}: ${error instanceof Error ? error.message : String(error)}`);
        failCount++;
        console.log('');
      }
    }

    // Summary
    console.log('─'.repeat(50));
    console.log(`✓ Cleanup complete: ${successCount} removed, ${failCount} failed`);
    
    if (unsafeToRemove.length > 0) {
      console.log(`⚠ ${unsafeToRemove.length} worktree(s) skipped due to uncommitted changes`);
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
