/**
 * NotPublishedError
 * Custom error class for "resource exists but is not published" scenarios
 * Allows controller to reliably identify unpublished cases and return 403
 */
import { HttpError } from './HttpError'

export class NotPublishedError extends HttpError {
  public readonly name = 'NotPublishedError'

  constructor(message: string) {
    super(403, message)
  }
}
