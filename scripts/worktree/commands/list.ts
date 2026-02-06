/**
 * List worktrees command
 */

import { readState, type WorktreeInfo } from '../state.ts';
import { execSync } from 'child_process';
import { existsSync } from 'fs';

interface ListOptions {
  json: boolean;
}

/**
 * Check if a worktree has uncommitted changes
 */
function checkWorktreeStatus(worktreePath: string): 'clean' | 'dirty' | 'unknown' {
  try {
    if (!existsSync(worktreePath)) {
      return 'unknown';
    }

    const output = execSync(`git -C "${worktreePath}" status --porcelain`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();

    return output.length === 0 ? 'clean' : 'dirty';
  } catch {
    return 'unknown';
  }
}

/**
 * Format a date string to relative time (e.g., "2 hours ago")
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
 * Format worktrees as a table
 */
function formatTable(worktrees: WorktreeInfo[], mainWorktreePath: string): string {
  if (worktrees.length === 0) {
    return 'No worktrees found.';
  }

  // Column widths
  const nameWidth = 20;
  const branchWidth = 25;
  const statusWidth = 10;
  const activityWidth = 15;

  // Header
  let output = '';
  output += padRight('NAME', nameWidth) + ' ';
  output += padRight('BRANCH', branchWidth) + ' ';
  output += padRight('STATUS', statusWidth) + ' ';
  output += 'LAST ACTIVITY\n';

  // Separator
  output += '─'.repeat(nameWidth) + ' ';
  output += '─'.repeat(branchWidth) + ' ';
  output += '─'.repeat(statusWidth) + ' ';
  output += '─'.repeat(activityWidth) + '\n';

  // Rows
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
 * Parse command line arguments
 */
function parseArgs(args: string[]): ListOptions {
  return {
    json: args.includes('--json'),
  };
}

export async function listWorktrees(args: string[] = []): Promise<void> {
  const options = parseArgs(args);

  try {
    const state = await readState();

    // Sync git status for all worktrees
    const worktrees = state.worktrees.map(wt => ({
      ...wt,
      gitStatus: checkWorktreeStatus(wt.path) as 'clean' | 'dirty' | 'unknown',
    }));

    if (options.json) {
      // JSON output for scripting
      console.log(JSON.stringify(worktrees, null, 2));
    } else {
      // Human-readable table format
      const table = formatTable(worktrees, state.mainWorktree);
      console.log(table);

      if (worktrees.length > 0) {
        console.log(`\nTotal: ${worktrees.length} worktree${worktrees.length !== 1 ? 's' : ''}`);
      }
    }
  } catch (error) {
    console.error('Error listing worktrees:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
