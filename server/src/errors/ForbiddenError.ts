/**
 * ForbiddenError
 * Custom error class for 403 Forbidden scenarios: la ressource existe et
 * l'appelant est authentifié, mais l'action lui est refusée (appartenance
 * `event_users` manquante, fenêtre de réservation pas encore ouverte, etc.)
 * — par opposition à `NotFoundError` (ressource absente) et `NotPublishedError`
 * (état de publication).
 */
import { HttpError } from './HttpError'
import { ERROR_CODES, type ErrorCode } from '@timepick/shared'

export class ForbiddenError extends HttpError {
  public readonly name = 'ForbiddenError'

  constructor(message: string, code: ErrorCode = ERROR_CODES.UNAUTHORIZED) {
    super(403, message, code)
  }
}
