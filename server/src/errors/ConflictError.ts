/**
 * ConflictError
 * Custom error class for 409 Conflict scenarios
 * Used when a request cannot be completed due to a conflict with current state
 * Examples: slot at capacity, duplicate booking, resource locked
 */
import { HttpError } from './HttpError'

export class ConflictError extends HttpError {
  public readonly name = 'ConflictError'
  public readonly code: string

  constructor(message: string, code: string = 'CONFLICT') {
    super(409, message)
    this.code = code
  }
}
