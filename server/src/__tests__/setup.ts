// Test setup file for Jest
import dotenv from 'dotenv'

// Load environment variables for testing.
// envSetup.js (setupFiles) already loaded server/.env.test with override:true,
// so DATABASE_URL, JWT_SECRET, ENCRYPTION_KEY and EMAIL_FROM are already set.
// This bare dotenv.config() fills in anything missing (e.g., EMAIL_HOST) from server/.env,
// without overriding the already-set values.
dotenv.config()

// Defense-in-depth: triple-check the pool will connect to the test DB,
// not the dev DB. Runs after envSetup.js but before any test file imports the pool.
const dbUrl = process.env.DATABASE_URL
if (!dbUrl) {
  throw new Error('[setup.ts] DATABASE_URL is not set after dotenv.config(). Create server/.env.test.')
}
try {
  const parsed = new URL(dbUrl)
  const dbName = parsed.pathname.replace(/^\//, '').replace(/\/$/, '')
  // Les deux projets Jest ciblent une base de test dédiée : « main » → timepick_test,
  // « migrations » → timepick_test_migrations. Toute autre base est refusée.
  const ALLOWED_TEST_DBS = ['timepick_test', 'timepick_test_migrations']
  if (!ALLOWED_TEST_DBS.includes(dbName)) {
    throw new Error(
      `[setup.ts] DATABASE_URL points to database "${dbName}", expected one of ${ALLOWED_TEST_DBS.join(', ')}. ` +
      'Check server/.env.test and that the project envSetup ran first.'
    )
  }
} catch (err) {
  if (err instanceof TypeError) {
    throw new Error(`[setup.ts] DATABASE_URL "${dbUrl}" is not a valid URL.`)
  }
  throw err
}

// Extend Jest timeout for database operations
jest.setTimeout(10000)

// Clear all mocks after each test
afterEach(() => {
  jest.clearAllMocks()
})
