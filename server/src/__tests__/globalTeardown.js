'use strict'

module.exports = async function globalTeardown() {
  // Intentionally a no-op.
  // The test database is left intact for post-run inspection (psql -d timepick_test).
  // Connections leaked by the pool singleton are terminated at the start of the next
  // test run via pg_terminate_backend() in globalSetup.js, so no cleanup is needed here.
}
