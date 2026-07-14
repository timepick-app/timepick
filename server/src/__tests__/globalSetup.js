'use strict'

/**
 * globalSetup du projet Jest « main » : prépare la base partagée des suites de rendu.
 * La logique (DROP/CREATE + bootstrap + migrations + lock) est factorisée dans
 * helpers/prepare-test-db.js, partagée avec globalSetup.migrations.js.
 */

const { TEST_DB_NAME } = require('./helpers/test-db-config')
const { prepareDatabaseWithLock } = require('./helpers/prepare-test-db')

module.exports = async function globalSetup() {
  await prepareDatabaseWithLock(TEST_DB_NAME)
}
