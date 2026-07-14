/**
 * Integration tests for the migration runner (server/src/migrate.ts).
 *
 * Covers the idempotency I/O matrix (safe to invoke concurrently on boot without duplicate application):
 *   - Bootstrap on pre-existing DB (no replay)
 *   - Up-to-date no-op
 *   - Pending migration application via custom dir
 *   - Failed migration rolls back its transaction (tracker unchanged)
 *
 * The shared `timepick_test` DB is provisioned by globalSetup.js with all
 * production migrations applied AND no `schema_migrations` tracker (the
 * globalSetup does not depend on the tracker — see design note in the spec).
 * Each test resets the tracker state in beforeEach/afterEach so suites are
 * order-independent.
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import type { PoolClient } from 'pg'
import { query } from '../../db'
import pool from '../../db/pool'
import { runMigrations } from '../../migrate'

const PROD_MIGRATIONS_DIR = path.resolve(__dirname, '../../migrations')

const allKnownVersions = (): string[] =>
  fs.readdirSync(PROD_MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort()
    .map(f => f.slice(0, 3))

const dropTracker = async (): Promise<void> => {
  await query('DROP TABLE IF EXISTS schema_migrations')
}

const seedTrackerWithAllProdVersions = async (): Promise<void> => {
  await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  for (const v of allKnownVersions()) {
    await query(
      'INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING',
      [v]
    )
  }
}

const trackerRowCount = async (): Promise<number> => {
  const { rows } = await query<{ n: string }>('SELECT COUNT(*) AS n FROM schema_migrations')
  return Number(rows[0].n)
}

const trackerHasVersion = async (version: string): Promise<boolean> => {
  const { rows } = await query<{ exists: boolean }>(
    'SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version = $1) AS exists',
    [version]
  )
  return rows[0].exists
}

describe('Migration runner — schema_migrations tracker + bootstrap', () => {
  beforeEach(async () => {
    await dropTracker()
  })

  afterEach(async () => {
    await dropTracker()
    // Defensive self-heal: if a sentinel-guard test was interrupted between the
    // quarantine rename and its restore, rename the table back so later suites
    // (which share this DB) still see `shell_parts`. No-op when absent.
    await query('ALTER TABLE IF EXISTS shell_parts_quarantine RENAME TO shell_parts')
  })

  describe('Bootstrap on pre-existing DB', () => {
    it('creates the tracker and marks all migrations as applied without replay', async () => {
      const expectedVersions = allKnownVersions()

      await runMigrations()

      expect(await trackerRowCount()).toBe(expectedVersions.length)
      for (const v of expectedVersions) {
        expect(await trackerHasVersion(v)).toBe(true)
      }
    })

    it('does NOT re-execute migration 001 (regression: would crash on COMMENT ON dropped column)', async () => {
      // If 001 were replayed, line 79's COMMENT ON events.invitation_template would throw
      // (column dropped by 008). Reaching this assertion means bootstrap skipped replay.
      await expect(runMigrations()).resolves.not.toThrow()
    })
  })

  describe('Up-to-date no-op', () => {
    it('runs as no-op when all versions are already tracked', async () => {
      await seedTrackerWithAllProdVersions()
      const before = await trackerRowCount()

      await runMigrations()

      expect(await trackerRowCount()).toBe(before)
    })
  })

  describe('Pending migration via custom dir', () => {
    let tmpDir: string

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'migrate-runner-test-'))
    })

    afterEach(async () => {
      fs.rmSync(tmpDir, { recursive: true, force: true })
      // The temp migration may have created an artefact table — drop it.
      await query('DROP TABLE IF EXISTS migrate_runner_probe_table')
    })

    it('applies a pending migration and inserts its version row', async () => {
      await seedTrackerWithAllProdVersions()
      const versions = allKnownVersions()
      expect(versions.length).toBeGreaterThan(0)
      // Use a deliberately out-of-band prefix (900) to avoid collision with future
      // production migrations that may bump past the current highest version.
      const probeVersion = '900'
      const probeFile = `${probeVersion}_probe.sql`
      fs.writeFileSync(
        path.join(tmpDir, probeFile),
        'CREATE TABLE IF NOT EXISTS migrate_runner_probe_table (id INT PRIMARY KEY);'
      )
      // Tracker contains prod versions but the custom dir only has the probe file,
      // so the runner will see exactly 1 pending entry.

      await runMigrations(tmpDir)

      expect(await trackerHasVersion(probeVersion)).toBe(true)
      const { rows } = await query<{ exists: boolean }>(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_name = 'migrate_runner_probe_table'
        ) AS exists
      `)
      expect(rows[0].exists).toBe(true)
    })

    it('rolls back the transaction when a migration fails, leaving the tracker unchanged', async () => {
      await seedTrackerWithAllProdVersions()
      const before = await trackerRowCount()
      const brokenVersion = '999'
      fs.writeFileSync(
        path.join(tmpDir, `${brokenVersion}_broken.sql`),
        'CREATE TABLE migrate_runner_probe_table (id INT); SELECT * FROM table_that_does_not_exist;'
      )

      await expect(runMigrations(tmpDir)).rejects.toThrow(/999_broken\.sql/)

      expect(await trackerRowCount()).toBe(before)
      expect(await trackerHasVersion(brokenVersion)).toBe(false)
      // The CREATE TABLE inside the failing tx must NOT have persisted.
      const { rows } = await query<{ exists: boolean }>(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_name = 'migrate_runner_probe_table'
        ) AS exists
      `)
      expect(rows[0].exists).toBe(false)
    })
  })

  describe('Bootstrap sentinel guard (partial-migration DB)', () => {
    // The sentinel-present case (events + shell_parts present → silent bootstrap)
    // is covered by the "Bootstrap on pre-existing DB" describe above, which runs
    // against the fully-migrated test DB. Here we cover only the partial DB.
    it('refuses to bootstrap and creates no tracker when the sentinel table is absent', async () => {
      // Quarantine the sentinel to simulate a partially-migrated legacy DB
      // (events present, shell_parts absent, no tracker). Rename round-trips the
      // table without touching its data, so the shared test DB is restored intact.
      await query('ALTER TABLE shell_parts RENAME TO shell_parts_quarantine')
      try {
        await expect(runMigrations()).rejects.toThrow(/Partial pre-existing schema|shell_parts/)

        // Neither the bootstrap nor the fresh-DB path may have created the tracker.
        const { rows } = await query<{ exists: boolean }>(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_name = 'schema_migrations'
          ) AS exists
        `)
        expect(rows[0].exists).toBe(false)
      } finally {
        await query('ALTER TABLE shell_parts_quarantine RENAME TO shell_parts')
      }
    })
  })

  describe('Advisory lock serialization', () => {
    // Restore the per-client query/release spies created below — they wrap the
    // real pooled client, which is recycled into later tests.
    afterEach(() => {
      jest.restoreAllMocks()
    })

    // Spy on pool.connect so we can observe the lock/unlock/release sequence on
    // the exact connection runMigrations uses, while letting every query run for real.
    const spyOnConnect = () => {
      const realConnect = pool.connect.bind(pool) as () => Promise<PoolClient>
      const spies: { query?: jest.SpyInstance; release?: jest.SpyInstance } = {}
      const connectSpy = jest.spyOn(pool, 'connect').mockImplementation((async () => {
        const client = await realConnect()
        spies.query = jest.spyOn(client, 'query')
        spies.release = jest.spyOn(client, 'release')
        return client
      }) as unknown as typeof pool.connect)
      return { connectSpy, spies }
    }

    const assertLockReleasedBeforeRelease = (spies: {
      query?: jest.SpyInstance
      release?: jest.SpyInstance
    }): string[] => {
      const queryTexts = spies.query!.mock.calls.map(c => String(c[0]))
      expect(queryTexts.filter(t => t.includes('pg_advisory_unlock('))).toHaveLength(1)
      expect(spies.release!.mock.invocationCallOrder).toHaveLength(1)
      const unlockIndex = queryTexts.findIndex(t => t.includes('pg_advisory_unlock('))
      expect(spies.query!.mock.invocationCallOrder[unlockIndex]).toBeLessThan(
        spies.release!.mock.invocationCallOrder[0]
      )
      return queryTexts
    }

    it('acquires the lock first and releases it before returning the connection', async () => {
      await seedTrackerWithAllProdVersions()
      const { connectSpy, spies } = spyOnConnect()

      try {
        await runMigrations()
      } finally {
        connectSpy.mockRestore()
      }

      const queryTexts = assertLockReleasedBeforeRelease(spies)
      expect(queryTexts.filter(t => t.includes('pg_advisory_lock('))).toHaveLength(1)
      expect(queryTexts[0]).toContain('pg_advisory_lock(')
    })

    it('releases the lock even when the run throws (partial DB)', async () => {
      await query('ALTER TABLE shell_parts RENAME TO shell_parts_quarantine')
      const { connectSpy, spies } = spyOnConnect()

      try {
        await expect(runMigrations()).rejects.toThrow(/Partial pre-existing schema|shell_parts/)
      } finally {
        connectSpy.mockRestore()
        await query('ALTER TABLE shell_parts_quarantine RENAME TO shell_parts')
      }

      assertLockReleasedBeforeRelease(spies)
    })

    it('destroys the connection (release(true)) when releasing the lock fails', async () => {
      await seedTrackerWithAllProdVersions()
      const realConnect = pool.connect.bind(pool) as () => Promise<PoolClient>
      let releaseSpy: jest.SpyInstance | undefined
      const connectSpy = jest.spyOn(pool, 'connect').mockImplementation((async () => {
        const client = await realConnect()
        const realQuery = client.query.bind(client) as (...a: unknown[]) => unknown
        jest.spyOn(client, 'query').mockImplementation(((...args: unknown[]) => {
          const sql = typeof args[0] === 'string' ? args[0] : ''
          if (sql.includes('pg_advisory_unlock(')) {
            return Promise.reject(new Error('simulated unlock failure'))
          }
          return realQuery(...args)
        }) as never)
        releaseSpy = jest.spyOn(client, 'release')
        return client
      }) as unknown as typeof pool.connect)

      try {
        // Lock acquisition + the no-op run succeed; only the unlock fails, so the
        // runner must destroy the connection to force the server to drop the lock.
        await runMigrations()
      } finally {
        connectSpy.mockRestore()
      }

      expect(releaseSpy!).toHaveBeenCalledWith(true)
    })
  })
})
