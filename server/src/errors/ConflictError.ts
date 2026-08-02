/**
 * ConflictError
 * Custom error class for 409 Conflict scenarios
 * Used when a request cannot be completed due to a conflict with current state
 * Examples: slot at capacity, duplicate booking, resource locked
 */
import { HttpError } from './HttpError'
import { ERROR_CODES, type ErrorCode } from '@timepick/shared'

export class ConflictError extends HttpError {
  public readonly name = 'ConflictError'

  constructor(message: string, code: ErrorCode = ERROR_CODES.CONFLICT) {
    super(409, message, code)
  }
}
