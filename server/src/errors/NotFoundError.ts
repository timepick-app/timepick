/**
 * NotFoundError
 * Custom error class for "resource not found" scenarios
 * Allows controller to reliably identify 404 cases without fragile string matching
 *
 * Le `code` est **le** discriminant d'affichage : le lanceur nomme l'objet
 * manquant (`SLOT_NOT_FOUND`, `BOOKING_NOT_FOUND`…) et le message part avec lui.
 * Sans code explicite, le défaut `NOT_FOUND` n'est pas en liste blanche côté
 * client : le message reste invisible et l'appelant affiche sa propre phrase.
 * C'est voulu — un « X non trouvé » qu'on n'a pas jugé montrable ne doit pas
 * s'afficher parce qu'il transite par un contrôleur qui relaie.
 */
import { HttpError } from './HttpError'
import { ERROR_CODES, type ErrorCode } from '@timepick/shared'

export class NotFoundError extends HttpError {
  public readonly name = 'NotFoundError'

  constructor(message: string, code: ErrorCode = ERROR_CODES.NOT_FOUND) {
    super(404, message, code)
  }
}
