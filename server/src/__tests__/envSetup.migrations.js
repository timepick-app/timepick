'use strict'

/**
 * envSetup du projet Jest « migrations » (setupFiles) : pose DATABASE_URL sur la base
 * DÉDIÉE timepick_test_migrations AVANT que les fichiers de test n'importent le pool pg.
 * Dérive l'URL depuis .env.test en réécrivant uniquement le nom de base.
 */

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {
  loadEnvTest,
  withDbName,
  assertTestDbUrl,
  MIGRATIONS_DB_NAME,
  ALLOWED_TEST_DBS,
} = require('./helpers/test-db-config')

loadEnvTest({ override: true })
process.env.DATABASE_URL = withDbName(process.env.DATABASE_URL, MIGRATIONS_DB_NAME)

if (!process.env.DATA_DIR) {
  process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'timepick-data-'))
}

assertTestDbUrl(process.env.DATABASE_URL, 'envSetup.migrations', ALLOWED_TEST_DBS)
