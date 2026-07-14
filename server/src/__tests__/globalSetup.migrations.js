'use strict'

/**
 * globalSetup du projet Jest « migrations » : prépare une base DÉDIÉE
 * (timepick_test_migrations) pour les tests qui jouent des cycles forward/rollback
 * de migrations. Leurs rollbacks (DROP TABLE email_templates, etc.) restent ainsi
 * confinés à cette base et n'altèrent JAMAIS la base des suites de rendu (timepick_test).
 */

const { MIGRATIONS_DB_NAME } = require('./helpers/test-db-config')
const { prepareDatabaseWithLock } = require('./helpers/prepare-test-db')

module.exports = async function globalSetupMigrations() {
  await prepareDatabaseWithLock(MIGRATIONS_DB_NAME)
}
