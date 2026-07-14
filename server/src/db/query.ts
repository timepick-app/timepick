/**
 * Centralized Database Query Module
 *
 * This module provides a single entry point for all database operations.
 * It supports transaction client injection for test isolation.
 *
 * @module db/query
 */

import pool, { PoolClient } from './pool'

/**
 * Transaction client for test isolation
 * When set, all queries use this client instead of the pool
 */
let transactionClient: PoolClient | null = null

/**
 * Set the transaction client (used by tests)
 *
 * @param client - A PostgreSQL client from pool.connect()
 *
 * @example
 * ```ts
 * const client = await pool.connect()
 * await client.query('BEGIN')
 * setTransactionClient(client)
 * // All query() calls now use the transaction client
 * ```
 */
export function setTransactionClient(client: PoolClient): void {
  transactionClient = client
}

/**
 * Clear the transaction client (return to pool usage)
 *
 * Call this in afterEach after ROLLBACK
 */
export function clearTransactionClient(): void {
  transactionClient = null
}

/**
 * Get the current transaction client (if any)
 *
 * Used by test helpers to check if a transaction is active
 */
export function getTransactionClient(): PoolClient | null {
  return transactionClient
}

/**
 * Query result type matching pg's QueryResult
 */
export type QueryResult<T = any> = {
  rows: T[]
  command: string
  rowCount: number | null
  fields?: any[]
  oid?: number
}

/**
 * Execute a query using either the transaction client (if set) or the pool
 *
 * This is the PRIMARY database access method for the entire application.
 * All controllers and services MUST use this function instead of pool.query().
 *
 * @param text - SQL query string
 * @param params - Query parameters
 * @returns Promise<QueryResult<T>>
 *
 * @example
 * ```ts
 * import { query } from '../db/query'
 *
 * const result = await query<User>('SELECT * FROM users WHERE id = $1', [userId])
 * ```
 */
export async function query<T = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  const client = transactionClient || pool
  return client.query(text, params) as Promise<QueryResult<T>>
}

/**
 * Get a client from the pool (for transactions)
 *
 * NOTE: During tests with transaction isolation, this returns the
 * transaction client if one is set. This allows controllers that use
 * explicit transactions to participate in test transaction rollback.
 *
 * @example
 * ```ts
 * const client = await getClient()
 * try {
 *   await client.query('BEGIN')
 *   // ... operations ...
 *   await client.query('COMMIT')
 * } finally {
 *   client.release()
 * }
 * ```
 */
export function getClient(): Promise<PoolClient> {
  // During tests, return the transaction client if available
  // This ensures controllers using explicit transactions participate in test isolation
  if (transactionClient) {
    return Promise.resolve(transactionClient)
  }
  return pool.connect()
}

/**
 * Transaction helper for controller-level transactions.
 *
 * When a test transaction client is active (set via `setTransactionClient` —
 * cf. `__tests__/helpers/transaction.ts`), this helper runs the callback
 * against that same client WITHOUT issuing its own BEGIN / COMMIT /
 * ROLLBACK. Doing so would (a) emit Postgres warnings about nested
 * transactions, and (b) prematurely commit / rollback the test's outer
 * transaction, breaking the per-test rollback isolation contract. Errors
 * still propagate up to the test's outer rollback as expected.
 *
 * @example
 * ```ts
 * import { withTransaction } from '../db/query'
 *
 * await withTransaction(async (client) => {
 *   await client.query('SELECT * FROM slots WHERE id = $1 FOR UPDATE', [slotId])
 *   // ... more operations ...
 * })
 * ```
 */
export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  if (transactionClient) {
    return callback(transactionClient)
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await callback(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

