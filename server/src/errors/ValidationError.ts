/**
 * ValidationError
 * Custom error class for "invalid input / bad request" scenarios
 * Allows controller to reliably identify 400 cases without fragile string matching
 */
import { HttpError } from './HttpError'

export class ValidationError extends HttpError {
  public readonly name = 'ValidationError'

  constructor(message: string) {
    super(400, message)
  }
}
