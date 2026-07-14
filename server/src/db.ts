/**
 * Database Connection Module
 *
 * This file serves as the main entry point for database operations.
 * It re-exports the centralized query function with transaction support.
 *
 * @deprecated For database operations, prefer using the centralized query()
 * function from './db/query'. Direct pool usage bypasses transaction isolation.
 *
 * ⚠️ CRITICAL: All controllers and services MUST use `query()` instead of `pool`.
 * Direct pool usage will be removed in a future update.
 *
 * @module db
 */

// Re-export functions from query module
export {
  query,
  getTransactionClient,
  withTransaction,
  getClient
} from './db/query'

