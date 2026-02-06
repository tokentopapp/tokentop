#!/usr/bin/env bun
/**
 * Git worktree management CLI
 * Manages parallel development branches using git worktrees
 */

import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { createWorktree } from './worktree/commands/create.ts';
import { listWorktrees } from './worktree/commands/list.ts';
import { removeWorktree } from './worktree/commands/remove.ts';
import { statusWorktrees } from './worktree/commands/status.ts';
import { switchWorktree } from './worktree/commands/switch.ts';
import { cleanupWorktrees } from './worktree/commands/cleanup.ts';

const commands: Record<string, (args: string[]) => Promise<void>> = {
  create: createWorktree,
  list: listWorktrees,
  remove: removeWorktree,
  status: statusWorktrees,
  switch: switchWorktree,
  cleanup: cleanupWorktrees,
};

function printHelp() {
  console.log(`
tokentop worktree - Git worktree management

Usage:
  bun scripts/worktree.ts <command> [options]
  bun run worktree <command> [options]

Commands:
  create <branch>         Create a new worktree for a branch
  list                    List all active worktrees
  remove <branch>         Remove a worktree
  status                  Show worktree status
  switch <branch>         Switch to a worktree
  cleanup                 Clean up merged or stale worktrees

Cleanup Options:
  --dry-run               Preview what would be removed without removing
  --stale-days <days>     Days of inactivity to consider stale (default: 30)
  --force                 Skip confirmation prompt
  --delete-branches       Also delete merged git branches

Options:
  -h, --help              Show this help message
  -v, --version           Show version

Examples:
  bun run worktree create feature/new-ui
  bun run worktree list
  bun run worktree remove feature/new-ui
  bun run worktree switch feature/new-ui
  bun run worktree cleanup --dry-run
  bun run worktree cleanup --stale-days 7 --delete-branches
`);
}

function printVersion() {
  console.log('tokentop worktree v0.1.0');
}

async function main() {
  const args = process.argv.slice(2);

  // Handle no arguments
  if (args.length === 0) {
    printHelp();
    process.exit(0);
  }

  // Handle global flags
  if (args[0] === '-h' || args[0] === '--help') {
    printHelp();
    process.exit(0);
  }

  if (args[0] === '-v' || args[0] === '--version') {
    printVersion();
    process.exit(0);
  }

  const command = args[0];

  // Validate command exists
  if (!commands[command]) {
    console.error(`Error: Unknown command '${command}'`);
    console.error('Run with --help for usage information');
    process.exit(1);
  }

  // Ensure .worktrees directory exists for state file
  const stateDir = join(process.cwd(), '.worktrees');
  if (!existsSync(stateDir)) {
    mkdirSync(stateDir, { recursive: true });
  }

  // Execute command with remaining arguments
  try {
    await commands[command](args.slice(1));
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
