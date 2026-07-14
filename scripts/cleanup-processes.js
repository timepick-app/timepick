#!/usr/bin/env node

/**
 * Cleanup Orphaned Node Processes
 *
 * Kills orphaned vitest processes that may accumulate during development.
 * This script is idempotent and safe to run multiple times.
 *
 * IMPORTANT: Only kills vitest processes to avoid interrupting active
 * development servers (vite dev, nodemon, etc.)
 *
 * Usage: node scripts/cleanup-processes.js
 */

import { execSync } from 'child_process';
import { platform } from 'os';

// Only target vitest to avoid killing active dev servers
const TARGET_PROCESSES = ['vitest'];

function isWindows() {
  return platform() === 'win32';
}

function findProcesses() {
  const found = new Map();

  for (const proc of TARGET_PROCESSES) {
    try {
      let command;
      if (isWindows()) {
        // Windows: use tasklist to find processes
        command = `tasklist /FI "IMAGENAME eq node.exe" /FO CSV /NH`;
      } else {
        // Mac/Linux: use ps to find processes
        command = `ps aux | grep -E "${proc}" | grep -v grep | grep -v cleanup-processes`;
      }

      const output = execSync(command, { encoding: 'utf-8', stdio: 'pipe' });
      const lines = output.trim().split('\n').filter(l => l.trim());

      if (lines.length > 0) {
        found.set(proc, lines);
      }
    } catch (e) {
      // No processes found or command failed - silent
    }
  }

  return found;
}

function killProcesses(foundProcesses) {
  const killed = [];

  for (const [procName, lines] of foundProcesses) {
    for (const line of lines) {
      try {
        let pid;

        if (isWindows()) {
          // Windows: Parse tasklist output to extract PID
          // Format: "node.exe","12345","Console","1","100,000 K"
          const parts = line.split(',');
          if (parts.length > 1) {
            pid = parts[1].replace(/"/g, '').trim();
          }
        } else {
          // Mac/Linux: Parse ps output to extract PID
          // Format: user  PID  ...
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 2) {
            pid = parts[1];
          }
        }

        if (pid) {
          execSync(
            isWindows() ? `taskkill /F /PID ${pid}` : `kill ${pid} 2>/dev/null`,
            { stdio: 'pipe' }
          );
          killed.push({ proc: procName, pid });
        }
      } catch (e) {
        // Process may have already terminated - continue
      }
    }
  }

  return killed;
}

function main() {
  const foundProcesses = findProcesses();

  if (foundProcesses.size === 0) {
    // No orphaned processes - silent exit
    return;
  }

  const killed = killProcesses(foundProcesses);

  if (killed.length > 0) {
    console.log(`[cleanup] Killed ${killed.length} orphaned process(es):`);
    for (const { proc, pid } of killed) {
      console.log(`  - ${proc} (PID: ${pid})`);
    }
  }
}

main();
