#!/usr/bin/env node

/**
 * Vitest Single-Instance Wrapper
 *
 * Ensures only one vitest instance runs at a time by:
 * 1. Killing only OUR previous instance (its process group, via lock file)
 * 2. Recording the spawned vitest process-group id in the lock file
 * 3. Reaping that whole group + removing the lock file on exit/signal
 *
 * This prevents memory exhaustion from accumulated test runners
 * while preserving active dev servers.
 *
 * Usage:
 *   node scripts/run-vitest-single.js [options]
 *
 * Examples:
 *   node scripts/run-vitest-single.js --client
 *   node scripts/run-vitest-single.js --run
 *   node scripts/run-vitest-single.js --watch
 */

import { execSync, spawn } from 'child_process';
import { createWriteStream, existsSync, readFileSync, unlinkSync } from 'fs';
import { platform } from 'os';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PID_FILE = resolve(__dirname, '../.vitest-runner.pid');

function isWindows() {
  return platform() === 'win32';
}

/**
 * Read the previous instance's process-group id from the lock file.
 */
function readPreviousPid() {
  try {
    if (!existsSync(PID_FILE)) return null;
    const pid = parseInt(readFileSync(PID_FILE, 'utf-8').trim(), 10);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch (e) {
    return null;
  }
}

/**
 * Synchronous sleep (idle, not a busy-wait) — laisse au groupe en cours de
 * terminaison le temps de mourir avant d'escalader en SIGKILL.
 */
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Kill ONLY the vitest instance this wrapper launched previously, via the
 * process group recorded in the lock file. Targeted (pas un `pkill vitest`
 * global) : worktrees parallèles / shards CI / autres projets restent
 * intacts. Les orphelins lancés hors wrapper relèvent de
 * scripts/cleanup-processes.js (le balai global explicite).
 */
function killPreviousInstance() {
  const prev = readPreviousPid();
  if (prev != null) {
    try {
      if (isWindows()) {
        execSync(`taskkill /F /T /PID ${prev} 2>nul`, { stdio: 'pipe' });
      } else {
        process.kill(-prev, 0);            // throws si le groupe n'existe plus
        process.kill(-prev, 'SIGTERM');
        sleepSync(400);
        try {
          process.kill(-prev, 0);          // encore vivant ?
          process.kill(-prev, 'SIGKILL');  // escalade
        } catch (e) {
          // Groupe bien mort après SIGTERM - OK
        }
      }
    } catch (e) {
      // Pas de groupe vivant (pid recyclé / déjà mort) - silent
    }
  }
  cleanupPidFile();
}

/**
 * Record the spawned vitest process-group id in the lock file
 */
function writePid(pid) {
  try {
    const stream = createWriteStream(PID_FILE, { flags: 'w' });
    stream.write(String(pid));
    stream.end();
  } catch (e) {
    // Failed to write PID file - continue anyway
  }
}

/**
 * Remove the PID lock file
 */
function cleanupPidFile() {
  try {
    if (existsSync(PID_FILE)) {
      unlinkSync(PID_FILE);
    }
  } catch (e) {
    // PID file already removed or couldn't be deleted - silent
  }
}

/**
 * Parse command line arguments
 */
function parseArgs(args) {
  const parsed = {
    client: false,
    server: false,
    run: false,
    watch: false,
    coverage: false,
    vitestArgs: []
  };

  for (const arg of args) {
    switch (arg) {
      case '--client':
        parsed.client = true;
        break;
      case '--server':
        parsed.server = true;
        break;
      case '--run':
      case 'run':
        parsed.run = true;
        parsed.vitestArgs.push('run');
        break;
      case '--watch':
      case 'watch':
        parsed.watch = true;
        break;
      case '--coverage':
      case 'coverage':
        parsed.coverage = true;
        parsed.vitestArgs.push('--coverage');
        break;
      default:
        // Forward any other arguments to vitest
        if (!arg.startsWith('-')) {
          parsed.vitestArgs.push(arg);
        } else {
          parsed.vitestArgs.push(arg);
        }
    }
  }

  // Default to run mode if not watch (prevents watch mode accumulation)
  if (!parsed.watch && !parsed.run && !parsed.coverage) {
    parsed.vitestArgs.push('run');
  }

  return parsed;
}

/**
 * Build the vitest command
 */
function buildVitestCommand(options) {
  let command = '';
  let vitestArgs = [...options.vitestArgs];

  if (options.client) {
    command = 'cd client && npx vitest';
  } else if (options.server) {
    command = 'cd server && npx vitest';
  } else {
    // Default: run from client directory
    command = 'cd client && npx vitest';
  }

  if (vitestArgs.length > 0) {
    command += ' ' + vitestArgs.join(' ');
  }

  return command;
}

/**
 * Main execution
 */
function main() {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  // Step 1: Kill only our previous instance (targeted, via lock file)
  killPreviousInstance();

  // Step 2: Track the spawned vitest subtree so signals reap the whole group
  let vitestProcess = null;
  let terminating = false;

  const killChildGroup = (signal) => {
    if (!vitestProcess || vitestProcess.pid == null) return;
    try {
      // detached:true → le child est leader de son groupe ; un PID négatif tue
      // tout le groupe (shell + vitest + workers tinypool), pas juste le shell.
      process.kill(-vitestProcess.pid, signal);
    } catch (e) {
      // Groupe déjà mort ou jamais démarré - silent
    }
  };

  const shutdown = (code) => {
    if (terminating) return;
    terminating = true;
    killChildGroup('SIGTERM');
    cleanupPidFile();
    process.exit(code ?? 0);
  };

  process.on('SIGINT', () => shutdown(0));
  process.on('SIGTERM', () => shutdown(0));
  process.on('exit', () => {
    killChildGroup('SIGTERM');
    cleanupPidFile();
  });

  // Step 3: Build and execute vitest command
  const vitestCommand = buildVitestCommand(options);

  try {
    // Execute vitest and forward all output directly
    // Use shell: true for command string, but args are controlled internally
    // detached: true → nouveau groupe de process : on peut réaper vitest ET son
    // pool de workers tinypool en bloc sur signal/exit (évite les forks
    // orphelins qui s'accumulent et saturent la RAM entre sessions).
    // Pin TZ=Europe/Paris par défaut : les suites DST-sensibles (NFR1, story
    // multi-jours) tournent de façon déterministe et leur couverture « piège
    // UTC » reste active même en `npm test` / CI nu. Un `TZ=...` explicite
    // (ex. vérif cross-zone America/New_York) l'emporte toujours. Node lit TZ
    // au démarrage du process → on l'épingle sur l'env du spawn.
    vitestProcess = spawn(vitestCommand, [], {
      stdio: 'inherit',
      shell: true,
      detached: true,
      env: { ...process.env, TZ: process.env.TZ || 'Europe/Paris' }
    });

    // Record the child's process-group id (detached → pgid === pid) so a later
    // run reaps exactly this group via the lock file.
    writePid(vitestProcess.pid);

    vitestProcess.on('exit', (code) => {
      cleanupPidFile();
      process.exit(code ?? 0);
    });

    vitestProcess.on('error', (err) => {
      console.error('Failed to start vitest:', err.message);
      cleanupPidFile();
      process.exit(1);
    });

  } catch (error) {
    console.error('Error running vitest:', error.message);
    cleanupPidFile();
    process.exit(1);
  }
}

main();
