'use strict'

/**
 * Préparation d'une base de test (DROP/CREATE + bootstrap + migrations), paramétrée
 * par NOM DE BASE. Factorisé depuis globalSetup.js pour servir les deux projets Jest :
 *   - projet « main »        → timepick_test
 *   - projet « migrations »  → timepick_test_migrations (tests mutateurs de schéma isolés)
 *
 * Chaque base a son propre lock-file (anti-concurrence) pour que les deux préparations
 * ne se bloquent pas mutuellement. Le garde-fou assertTestDbUrl interdit toute cible
 * hors des bases de test autorisées.
 */

const { Client } = require('pg')
const fs = require('fs')
const path = require('path')
const os = require('os')
const {
  loadEnvTest,
  assertTestDbUrl,
  buildMaintenanceUrl,
  withDbName,
  ALLOWED_TEST_DBS,
} = require('./test-db-config')

const SETUP_TIMEOUT_MS = 30000

function lockFileFor(dbName) {
  return path.join(os.tmpdir(), `timepick-test-db-${dbName}.lock`)
}

function acquireLock(lockFile) {
  try {
    const fd = fs.openSync(lockFile, 'wx')
    fs.writeSync(fd, String(process.pid))
    fs.closeSync(fd)
    return true
  } catch (err) {
    if (err.code === 'EEXIST') return false
    throw err
  }
}

function releaseLock(lockFile) {
  try {
    fs.unlinkSync(lockFile)
  } catch (err) {
    if (err.code !== 'ENOENT') throw err
  }
}

async function withTimeout(promise, ms, label) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`[prepare-test-db] Timeout after ${ms}ms: ${label}`)), ms)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    clearTimeout(timer)
  }
}

async function setup(dbName) {
  // L'URL de base vient de .env.test (timepick_test) ; on dérive l'URL de la base cible.
  loadEnvTest({ override: false })
  const baseUrl = process.env.DATABASE_URL
  const dbUrl = withDbName(baseUrl, dbName)
  assertTestDbUrl(dbUrl, 'prepare-test-db', ALLOWED_TEST_DBS)

  const maintenanceUrl = buildMaintenanceUrl(dbUrl)
  const verbose = process.env.TEST_DB_VERBOSE === '1'

  const mainClient = new Client({ connectionString: maintenanceUrl })
  await mainClient.connect()
  try {
    // Terminate any lingering connections so DROP DATABASE doesn't fail.
    await mainClient.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
       WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [dbName]
    )
    await mainClient.query(`DROP DATABASE IF EXISTS ${dbName}`)
    await mainClient.query(`CREATE DATABASE ${dbName}`)
  } finally {
    await mainClient.end()
  }

  const testClient = new Client({ connectionString: dbUrl })
  await testClient.connect()
  try {
    // Smoke check: confirm we actually connected to the target test DB.
    const { rows } = await testClient.query('SELECT current_database() AS db')
    if (rows[0].db !== dbName) {
      throw new Error(`[prepare-test-db] Connected to "${rows[0].db}", expected "${dbName}"`)
    }

    // Idempotent bootstrap DDL shared with scripts/init-db.ts.
    const bootstrapSql = fs.readFileSync(path.resolve(__dirname, '../bootstrap.sql'), 'utf8')
    await testClient.query(bootstrapSql)

    // Run SQL migrations in alphabetical order, each wrapped in a transaction.
    const migrationsDir = path.resolve(__dirname, '../../migrations')
    const migrationFiles = fs
      .readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort()

    for (const file of migrationFiles) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8')
      try {
        await testClient.query('BEGIN')
        await testClient.query(sql)
        await testClient.query('COMMIT')
      } catch (err) {
        await testClient.query('ROLLBACK').catch(() => {})
        throw new Error(`[prepare-test-db] Migration failed: ${file} — ${err.message}`)
      }
    }

    if (verbose) {
      console.log(`[prepare-test-db] ${dbName} ready (${migrationFiles.length} migrations applied) [OK]`)
    }
  } finally {
    await testClient.end()
  }
}

/**
 * Prépare `dbName` sous protection d'un lock-file dédié à cette base.
 */
async function prepareDatabaseWithLock(dbName) {
  const lockFile = lockFileFor(dbName)
  if (!acquireLock(lockFile)) {
    throw new Error(
      `[prepare-test-db] Another test run is preparing ${dbName} (lock: ${lockFile}). ` +
      'Wait for it to finish, or delete the lock file if stale.'
    )
  }
  try {
    await withTimeout(setup(dbName), SETUP_TIMEOUT_MS, `prepare ${dbName}`)
  } finally {
    releaseLock(lockFile)
  }
}

module.exports = { prepareDatabaseWithLock }
