/**
 * NotFoundError
 * Custom error class for "resource not found" scenarios
 * Allows controller to reliably identify 404 cases without fragile string matching
 */
import { HttpError } from './HttpError'

export class NotFoundError extends HttpError {
  public readonly name = 'NotFoundError'

  constructor(message: string) {
    super(404, message)
  }
}
