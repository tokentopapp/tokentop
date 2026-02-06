/**
 * Status worktree command
 * Shows detailed status for a specific worktree or summary of all worktrees
 */

import { readState, updateWorktree, type WorktreeInfo } from '../state.ts';
import { execSync } from 'child_process';
import { existsSync, statSync } from 'fs';
import { join } from 'path';

interface StatusOptions {
  json: boolean;
}

/**
 * Get git status counts for a worktree
 */
function getGitStatusCounts(worktreePath: string): {
  modified: number;
  staged: number;
  untracked: number;
} {
  try {
    if (!existsSync(worktreePath)) {
      return { modified: 0, staged: 0, untracked: 0 };
    }

    const porcelain = execSync(`git -C "${worktreePath}" status --porcelain`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();

    let modified = 0;
    let staged = 0;
    let untracked = 0;

    for (const line of porcelain.split('\n')) {
      if (!line) continue;
      const status = line.slice(0, 2);
      if (status[0] !== ' ') staged++;
      if (status[1] !== ' ') modified++;
      if (status === '??') {
        untracked++;
        staged--;
      }
    }

    return { modified, staged, untracked };
  } catch {
    return { modified: 0, staged: 0, untracked: 0 };
  }
}

/**
 * Get current branch for a worktree
 */
function getCurrentBranch(worktreePath: string): string {
  try {
    if (!existsSync(worktreePath)) {
      return 'unknown';
    }

    return execSync(`git -C "${worktreePath}" rev-parse --abbrev-ref HEAD`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'unknown';
  }
}

/**
 * Get upstream tracking info
 */
function getTrackingInfo(worktreePath: string): string {
  try {
    if (!existsSync(worktreePath)) {
      return 'not tracking';
    }

    const branch = execSync(`git -C "${worktreePath}" rev-parse --abbrev-ref HEAD`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();

    const upstream = execSync(
      `git -C "${worktreePath}" rev-parse --abbrev-ref @{upstream}`,
      {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore'],
      }
    ).trim();

    if (upstream === branch) {
      return 'not tracking';
    }

    // Get ahead/behind counts
    const aheadBehind = execSync(
      `git -C "${worktreePath}" rev-list --left-right --count ${upstream}...HEAD`,
      {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore'],
      }
    ).trim();

    const [behind, ahead] = aheadBehind.split('\t').map(Number);
    const parts = [upstream];

    if (ahead > 0) parts.push(`+${ahead}`);
    if (behind > 0) parts.push(`-${behind}`);

    return parts.join(' ');
  } catch {
    return 'not tracking';
  }
}

/**
 * Get last commit info
 */
function getLastCommit(worktreePath: string): { message: string; author: string; date: string } {
  try {
    if (!existsSync(worktreePath)) {
      return { message: 'unknown', author: 'unknown', date: 'unknown' };
    }

    const message = execSync(`git -C "${worktreePath}" log -1 --format=%s`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();

    const author = execSync(`git -C "${worktreePath}" log -1 --format=%an`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();

    const date = execSync(`git -C "${worktreePath}" log -1 --format=%ai`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();

    return { message, author, date };
  } catch {
    return { message: 'unknown', author: 'unknown', date: 'unknown' };
  }
}

/**
 * Calculate disk usage in human-readable format
 */
function getDiskUsage(dirPath: string): string {
  try {
    if (!existsSync(dirPath)) {
      return '0 B';
    }

    const result = execSync(`du -sh "${dirPath}"`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();

    return result.split('\t')[0];
  } catch {
    return 'unknown';
  }
}

/**
 * Format relative time
 */
function formatRelativeTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

    return date.toLocaleDateString();
  } catch {
    return 'unknown';
  }
}

/**
 * Pad string to fixed width
 */
function padRight(str: string, width: number): string {
  return str.length >= width ? str.slice(0, width) : str + ' '.repeat(width - str.length);
}

/**
 * Format summary table of all worktrees
 */
function formatSummaryTable(worktrees: WorktreeInfo[], mainWorktreePath: string): string {
  if (worktrees.length === 0) {
    return 'No worktrees found.';
  }

  const nameWidth = 20;
  const branchWidth = 25;
  const statusWidth = 15;
  const activityWidth = 15;

  let output = '';
  output += padRight('NAME', nameWidth) + ' ';
  output += padRight('BRANCH', branchWidth) + ' ';
  output += padRight('STATUS', statusWidth) + ' ';
  output += 'LAST ACTIVITY\n';

  output += '─'.repeat(nameWidth) + ' ';
  output += '─'.repeat(branchWidth) + ' ';
  output += '─'.repeat(statusWidth) + ' ';
  output += '─'.repeat(activityWidth) + '\n';

  for (const wt of worktrees) {
    const isMain = wt.path === mainWorktreePath;
    const marker = isMain ? '* ' : '  ';

    const name = padRight(wt.name, nameWidth - 2);
    const branch = padRight(wt.branch, branchWidth);
    const status = padRight(wt.gitStatus, statusWidth);
    const activity = formatRelativeTime(wt.lastActivity);

    output += marker + name + ' ' + branch + ' ' + status + ' ' + activity + '\n';
  }

  return output;
}

/**
 * Format detailed view for a single worktree
 */
function formatDetailedView(wt: WorktreeInfo, isMain: boolean): string {
  const statusCounts = getGitStatusCounts(wt.path);
  const tracking = getTrackingInfo(wt.path);
  const lastCommit = getLastCommit(wt.path);
  const diskUsage = getDiskUsage(wt.path);

  let output = '';

  // Header
  output += `\n${'═'.repeat(60)}\n`;
  output += `Worktree: ${wt.name}${isMain ? ' (main)' : ''}\n`;
  output += `${'═'.repeat(60)}\n\n`;

  // Path
  output += `Path:              ${wt.path}\n`;

  // Branch info
  output += `Branch:            ${wt.branch}\n`;
  output += `Tracking:          ${tracking}\n`;

  // Git status
  output += `\nGit Status:\n`;
  output += `  Staged:          ${statusCounts.staged} file${statusCounts.staged !== 1 ? 's' : ''}\n`;
  output += `  Modified:        ${statusCounts.modified} file${statusCounts.modified !== 1 ? 's' : ''}\n`;
  output += `  Untracked:       ${statusCounts.untracked} file${statusCounts.untracked !== 1 ? 's' : ''}\n`;

  // Last commit
  output += `\nLast Commit:\n`;
  output += `  Message:         ${lastCommit.message}\n`;
  output += `  Author:          ${lastCommit.author}\n`;
  output += `  Date:            ${lastCommit.date}\n`;
  output += `  Time ago:        ${formatRelativeTime(lastCommit.date)}\n`;

  // Activity and disk usage
  output += `\nActivity:\n`;
  output += `  Last activity:   ${formatRelativeTime(wt.lastActivity)}\n`;
  output += `  Created:         ${new Date(wt.createdAt).toLocaleDateString()}\n`;
  output += `  Disk usage:      ${diskUsage}\n`;

  if (wt.description) {
    output += `\nDescription:       ${wt.description}\n`;
  }

  output += `\n`;

  return output;
}

/**
 * Parse command line arguments
 */
function parseArgs(args: string[]): { name?: string; json: boolean } {
  return {
    name: args.find(arg => !arg.startsWith('--')),
    json: args.includes('--json'),
  };
}

export async function statusWorktrees(args: string[] = []): Promise<void> {
  const options = parseArgs(args);

  try {
    const state = await readState();

    if (options.name) {
      // Show detailed status for specific worktree
      const worktree = state.worktrees.find(w => w.name === options.name);

      if (!worktree) {
        console.error(`Error: Worktree '${options.name}' not found`);
        process.exit(1);
      }

      // Sync state with actual git state
      const branch = getCurrentBranch(worktree.path);
      const updatedWorktree: WorktreeInfo = {
        ...worktree,
        branch,
        lastActivity: new Date().toISOString(),
      };

      await updateWorktree(updatedWorktree);

      if (options.json) {
        const statusCounts = getGitStatusCounts(worktree.path);
        const tracking = getTrackingInfo(worktree.path);
        const lastCommit = getLastCommit(worktree.path);
        const diskUsage = getDiskUsage(worktree.path);

        console.log(
          JSON.stringify(
            {
              ...updatedWorktree,
              statusCounts,
              tracking,
              lastCommit,
              diskUsage,
            },
            null,
            2
          )
        );
      } else {
        const isMain = worktree.path === state.mainWorktree;
        console.log(formatDetailedView(updatedWorktree, isMain));
      }
    } else {
      // Show summary of all worktrees
      const worktrees = state.worktrees.map(wt => {
        const statusCounts = getGitStatusCounts(wt.path);
        const gitStatus: 'clean' | 'dirty' | 'unknown' =
          statusCounts.modified > 0 || statusCounts.staged > 0 || statusCounts.untracked > 0
            ? 'dirty'
            : 'clean';
        return {
          ...wt,
          gitStatus,
        };
      });

      if (options.json) {
        console.log(JSON.stringify(worktrees, null, 2));
      } else {
        const table = formatSummaryTable(worktrees, state.mainWorktree);
        console.log(table);

        if (worktrees.length > 0) {
          console.log(`Total: ${worktrees.length} worktree${worktrees.length !== 1 ? 's' : ''}`);
        }
      }
    }
  } catch (error) {
    console.error('Error showing status:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
