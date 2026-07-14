/**
 * Migration runner with `schema_migrations` tracker + bootstrap detection.
 *
 * Idempotency contract:
 *   - On fresh DB: applies 001 → 0NN, marks each in `schema_migrations`.
 *   - On up-to-date DB: no-op (only logs "up to date").
 *   - On pre-existing DB without tracker, the bootstrap requires BOTH the
 *     `events` table AND the sentinel table (`shell_parts`, migration 009) to
 *     be present. When both exist it marks all known migration files as applied
 *     WITHOUT replaying their SQL. When `events` exists but the sentinel does
 *     NOT, the database is partially migrated: the runner REFUSES (throws)
 *     rather than silently marking un-applied migrations as done.
 *   - Each pending migration runs in its own transaction with tracker insert
 *     in the same tx — partial failure does not pollute the tracker.
 *   - Migration .sql files may contain top-level BEGIN/COMMIT (e.g. 008); the
 *     runner strips them so they don't break the per-migration outer tx.
 *
 * Concurrency: runMigrations holds a session-scoped pg_advisory_lock on the
 * migration connection for its whole duration, so parallel boots are serialized
 * (the second waits, then sees "up to date" and no-ops). The lock is released
 * explicitly before the connection returns to the pool.
 *
 * Bootstrap fires only when the tracker table is absent — once created, even
 * an empty tracker means "I have been invoked"; pending logic takes over and
 * rolled-back versions correctly re-apply.
 *
 * Design goal: idempotent runner — safe to invoke concurrently on boot without duplicate migration application.
 */
import fs from 'fs'
import path from 'path'
import { PoolClient } from 'pg'
import pool from './db/pool'

const DEFAULT_MIGRATIONS_DIR = path.join(__dirname, 'migrations')
const MIGRATION_FILENAME_RE = /^(\d{3})_.+\.sql$/

// Sentinel table required for the bootstrap (mark-all-without-replay) to fire on
// a tracker-less DB. `shell_parts` is the highest-ranked table created when the
// schema_migrations tracker was introduced (migration 009, commit 8d8eb78a);
// migrations 010+ postdate the tracker, so any tracker-less DB is realistically
// frozen at <= 009. Its presence marks a "fully migrated for its era" legacy DB;
// its absence (with `events` present) marks a partial DB. The existing bootstrap
// test applies this table, so it also guards against a future migration silently
// dropping it.
const BOOTSTRAP_SENTINEL_TABLE = 'shell_parts'

// Session-level pg_advisory_lock key serializing runMigrations across concurrent
// boots. 0x54504D47 = ASCII "TPMG" (TimePick MiGrate). No other advisory lock
// exists in this codebase; the value is arbitrary and only needs to stay stable
// and distinct from any future advisory lock added here.
const MIGRATION_LOCK_KEY = 0x54504d47

const versionOf = (filename: string): string => {
  const match = filename.match(MIGRATION_FILENAME_RE)
  if (!match) {
    throw new Error(`[migrate] Invalid migration filename: ${filename} (expected NNN_<slug>.sql)`)
  }
  return match[1]
}

const listMigrationFiles = (dir: string): string[] => {
  if (!fs.existsSync(dir)) {
    throw new Error(`[migrate] Migrations directory not found: ${dir}`)
  }
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.sql') && MIGRATION_FILENAME_RE.test(f))
    .sort()
}

const stripTopLevelTransactionControl = (sql: string): string =>
  sql.replace(/^\s*(BEGIN|COMMIT)\s*;\s*$/gim, '')

const tableExists = async (client: PoolClient, tableName: string): Promise<boolean> => {
  const { rows } = await client.query<{ exists: boolean }>(
    `
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND table_name = $1
        AND table_type = 'BASE TABLE'
    ) AS exists
  `,
    [tableName]
  )
  return rows[0].exists
}

const createTrackerTable = async (client: PoolClient): Promise<void> => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
}

const bootstrapMarkAllApplied = async (client: PoolClient, files: string[]): Promise<void> => {
  try {
    await client.query('BEGIN')
    await createTrackerTable(client)
    for (const file of files) {
      await client.query(
        'INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT (version) DO NOTHING',
        [versionOf(file)]
      )
    }
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw err
  }
}

const fetchAppliedVersions = async (client: PoolClient): Promise<Set<string>> => {
  const { rows } = await client.query<{ version: string }>(
    'SELECT version FROM schema_migrations'
  )
  return new Set(rows.map(r => r.version))
}

const applyMigration = async (client: PoolClient, dir: string, file: string): Promise<void> => {
  const rawSql = fs.readFileSync(path.join(dir, file), 'utf8')
  const sql = stripTopLevelTransactionControl(rawSql)
  try {
    await client.query('BEGIN')
    await client.query(sql)
    await client.query(
      'INSERT INTO schema_migrations (version) VALUES ($1)',
      [versionOf(file)]
    )
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw new Error(`[migrate] Migration failed: ${file} — ${(err as Error).message}`)
  }
}

export const runMigrations = async (migrationsDir: string = DEFAULT_MIGRATIONS_DIR): Promise<void> => {
  const client = await pool.connect()
  // Marked before the await on purpose: an acquisition interrupted after the
  // server takes the lock but before the client sees the ack must still be
  // released in finally.
  let lockHeld = false
  try {
    // Serialize concurrent boots: a session-level advisory lock held on this
    // same connection for the whole run. Released explicitly in finally —
    // release() returns the connection to the pool without ending the session.
    lockHeld = true
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY])

    const files = listMigrationFiles(migrationsDir)
    if (files.length === 0) {
      console.log('[migrate] No migration files found — nothing to do')
      return
    }

    if (!(await tableExists(client, 'schema_migrations'))) {
      if (await tableExists(client, 'events')) {
        if (!(await tableExists(client, BOOTSTRAP_SENTINEL_TABLE))) {
          throw new Error(
            `[migrate] Partial pre-existing schema detected: 'events' is present but the ` +
              `sentinel table '${BOOTSTRAP_SENTINEL_TABLE}' (migration 009) is missing, and ` +
              `no 'schema_migrations' tracker exists. Refusing to bootstrap — marking all ` +
              `migrations as applied would silently hide the un-applied ones. Apply the ` +
              `missing migrations manually (psql -f src/migrations/NNN_*.sql) or start from ` +
              `a fresh database.`
          )
        }
        console.log('[migrate] Detected pre-existing schema (events + sentinel present, tracker absent)')
        await bootstrapMarkAllApplied(client, files)
        console.log(`[migrate] Bootstrap: ${files.length} migration(s) marked as applied without replay`)
        return
      }
      await createTrackerTable(client)
      console.log('[migrate] Fresh DB detected — applying all migrations from scratch')
    }

    const applied = await fetchAppliedVersions(client)
    const pending = files.filter(f => !applied.has(versionOf(f)))

    if (pending.length === 0) {
      console.log('[migrate] Up to date (no pending migrations)')
      return
    }

    let succeeded = 0
    try {
      for (const file of pending) {
        console.log(`[migrate] Applying: ${file}`)
        await applyMigration(client, migrationsDir, file)
        succeeded += 1
      }
      console.log(`[migrate] Done: ${succeeded} migration(s) applied`)
    } catch (err) {
      console.error(`[migrate] Aborted after ${succeeded}/${pending.length} migration(s) applied`)
      throw err
    }
  } finally {
    let unlockFailed = false
    if (lockHeld) {
      try {
        await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY])
      } catch (unlockErr) {
        unlockFailed = true
        console.error(`[migrate] Failed to release advisory lock: ${(unlockErr as Error).message}`)
      }
    }
    // If the lock could not be released cleanly, destroy the connection so the
    // server tears down the session (and any locks it still holds) rather than
    // returning a lock-holding connection to the pool.
    client.release(unlockFailed)
  }
}

if (require.main === module) {
  runMigrations()
    .then(async () => {
      await pool.end()
    })
    .catch(async (err) => {
      console.error(err instanceof Error ? err.message : err)
      await pool.end().catch(() => undefined)
      process.exit(1)
    })
}
