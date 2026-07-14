/**
 * Test Transaction Helper v4
 *
 * Provides automatic transaction rollback for test isolation.
 *
 * APPROACH: Uses the centralized query() function with transaction client injection.
 * This ensures ALL database operations (including API calls) use the transaction.
 *
 * Usage:
 *   1. In beforeAll: await initializeTestTransactions() (optional - for setup)
 *   2. In beforeEach: await startTestTransaction()
 *   3. Use query() from '../../db' - it will automatically use the transaction
 *   4. In afterEach: await rollbackTestTransaction()
 *   5. In afterAll: await cleanupTestTransactions() (optional - for cleanup)
 *
 * @module __tests__/helpers/transaction
 */

import pool from '../../db/pool'
import {
  setTransactionClient,
  clearTransactionClient,
  getTransactionClient,
  query as centralizedQuery
} from '../../db/query'

let transactionClient: any = null

/**
 * Initialize test transaction helpers
 *
 * Optional - only needed if you want separate pool configuration for tests
 */
export async function initializeTestTransactions(): Promise<void> {
  // The centralized query module handles everything
  // This function is kept for API compatibility
}

/**
 * Start a transaction for the current test
 *
 * After calling this, all query() calls will use the transaction client
 */
export async function startTestTransaction(): Promise<void> {
  const client = await pool.connect()
  await client.query('BEGIN')
  transactionClient = client

  // Inject the transaction client into the centralized query module
  setTransactionClient(client)
}

/**
 * Query function that uses the transaction client when active
 *
 * This is now just an alias to the centralized query() function
 * which automatically uses the transaction client when set
 */
export async function testQuery(text: string, params?: any[]): Promise<any> {
  return centralizedQuery(text, params)
}

/**
 * Rollback the current test transaction
 *
 * After calling this, all query() calls will use the pool again
 */
export async function rollbackTestTransaction(): Promise<void> {
  if (transactionClient) {
    await transactionClient.query('ROLLBACK')
    transactionClient.release()
    transactionClient = null

    // Clear the transaction client from the centralized query module
    clearTransactionClient()
  }
}

/**
 * Cleanup test transaction pool
 */
export async function cleanupTestTransactions(): Promise<void> {
  // The centralized query module handles everything
  // This function is kept for API compatibility
}

/**
 * Check if currently in a test transaction
 */
export function isInTransaction(): boolean {
  return getTransactionClient() !== null
}

/**
 * Helper: Run a callback within a test transaction
 * Useful for one-off test data setup
 *
 * @example
 * ```ts
 * await withTestTransaction(async () => {
 *   await testQuery('INSERT INTO users ...')
 *   // Data is rolled back after callback
 * })
 * ```
 */
export async function withTestTransaction<T>(
  callback: () => Promise<T>
): Promise<T> {
  await startTestTransaction()
  try {
    const result = await callback()
    return result
  } finally {
    await rollbackTestTransaction()
  }
}
