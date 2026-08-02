/**
 * HttpError
 * Base class for all custom HTTP errors.
 * Subclasses set their statusCode via super(...) and their own `name` field.
 *
 * Chaque erreur porte aussi le **code** de la réponse qu'elle produira. C'est ce
 * qui permet à un contrôleur de relayer `{ error: err.message, code: err.code }`
 * sans se demander si le message est présentable : la décision d'affichage se
 * prend sur le code, dans la liste blanche du client, et un code non nommé au
 * lancer reste invisible par défaut.
 */
import type { ErrorCode } from '@timepick/shared'

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code: ErrorCode,
  ) {
    super(message)
    // Maintains proper stack trace (V8 only); new.target = concrete subclass
    Error.captureStackTrace?.(this, new.target)
  }
}
