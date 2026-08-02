/**
 * ValidationError
 * Custom error class for "invalid input / bad request" scenarios
 * Allows controller to reliably identify 400 cases without fragile string matching
 *
 * Le code par défaut est `VALIDATION_ERROR`, qui n'entre jamais en liste
 * blanche : relayer son message est donc sûr par construction, il n'atteint pas
 * l'écran. Un refus de saisie **montrable** doit nommer son propre code
 * (`NO_FIELDS_TO_UPDATE`, `CSV_FORMAT_ERROR`…).
 */
import { HttpError } from './HttpError'
import { ERROR_CODES, type ErrorCode } from '@timepick/shared'

export class ValidationError extends HttpError {
  public readonly name = 'ValidationError'

  constructor(message: string, code: ErrorCode = ERROR_CODES.VALIDATION_ERROR) {
    super(400, message, code)
  }
}
