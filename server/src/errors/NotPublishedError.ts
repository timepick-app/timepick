/**
 * NotPublishedError
 * Custom error class for "resource exists but is not published" scenarios
 * Allows controller to reliably identify unpublished cases and return 403
 */
import { HttpError } from './HttpError'
import { ERROR_CODES } from '@timepick/shared'

export class NotPublishedError extends HttpError {
  public readonly name = 'NotPublishedError'

  constructor(message: string) {
    super(403, message, ERROR_CODES.EVENT_NOT_PUBLISHED)
  }
}
