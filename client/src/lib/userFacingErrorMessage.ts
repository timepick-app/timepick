import type { ApiErrorEnvelope } from '@/types/apiError'
import { USER_FACING_ERROR_CODES } from './userFacingErrorCodes'

/**
 * Panne de transport SANS réponse HTTP : `ERR_NETWORK` couvre aussi bien une
 * requête jamais partie qu'une requête traitée par le serveur dont la
 * réponse s'est perdue en route (connexion coupée après envoi — cf.
 * `axios/lib/adapters/xhr.js`, `request.onerror`, qui ne distingue jamais les
 * deux cas). On ne peut donc affirmer QUE le fait côté client : les
 * modifications de l'utilisateur sont toujours à l'écran. Affirmer que rien
 * n'est parti serait un mensonge à chaque coupure survenant après l'envoi —
 * exactement le scénario qui a doublé un lot d'invitations (l'admin, croyant
 * l'envoi perdu, a réessayé).
 */
const NETWORK_MESSAGE =
  "Connexion interrompue avant la réponse du serveur. Vos modifications sont toujours à l'écran ; vérifiez si l'action a été prise en compte avant de réessayer."

/**
 * Délai dépassé : on ne sait PAS si le serveur a traité la demande. Le message
 * ne l'affirme donc dans aucun sens — affirmer serait mentir une fois sur deux.
 */
const TIMEOUT_MESSAGE =
  "Le serveur n'a pas répondu à temps. Vérifiez si votre modification a été prise en compte avant de réessayer."

/** Codes de transport axios signalant un délai dépassé plutôt qu'une coupure. */
const TIMEOUT_CODES: Record<string, true> = { ECONNABORTED: true, ETIMEDOUT: true }

/**
 * Donne la phrase à afficher à l'utilisateur quand une action échoue.
 *
 * Trois règles, dans cet ordre, et rien d'autre :
 *
 * 1. **Pas de réponse HTTP** → la phrase réseau ou la phrase délai. Jamais
 *    `error.message` : aucun texte d'axios (« Network Error », « timeout of
 *    30000ms exceeded ») n'atteint l'écran.
 * 2. **Réponse portant un code de la liste blanche** → le message du serveur,
 *    tel quel. Ces messages sont déjà écrits pour l'utilisateur et parfois
 *    dynamiques ; les recopier côté client créerait deux sources pour un même
 *    texte.
 * 3. **Tout le reste** → `fallback`, la phrase de l'appelant.
 *
 * Un message serveur sans code, ou sous un code hors liste, n'est donc jamais
 * affiché. C'est voulu : un code inconnu est invisible par défaut, et le repli
 * français de l'appelant est le comportement souhaité, pas une dégradation.
 *
 * Le nom compte. `extractErrorMessage` — le nom précédent — rendait évident de
 * faire remonter le message du serveur en premier, et faisait passer la phrase
 * de l'appelant pour un secours. Elle est le défaut.
 *
 * Null-safe : `null` / `undefined` retournent `fallback` sans lever.
 */
export function userFacingErrorMessage(err: unknown, fallback: string): string {
  const error = (err ?? {}) as ApiErrorEnvelope

  // Règle 1 — aucune réponse HTTP reçue.
  if (!error.response) {
    if (error.code && TIMEOUT_CODES[error.code]) return TIMEOUT_MESSAGE
    if (error.code === 'ERR_NETWORK') return NETWORK_MESSAGE
    // Ni panne de transport ni délai : une erreur locale, dont le message est
    // technique par nature.
    return fallback
  }

  // Règle 2 — code figurant dans la liste blanche.
  const apiError = error.response.data?.error
  const labelled = typeof apiError === 'string' ? undefined : apiError
  const code = labelled?.code ?? error.response.data?.code
  // `Object.hasOwn` et non `in` : `in` remonte la chaîne de prototypes, donc
  // `'toString' in USER_FACING_ERROR_CODES` vaut `true`. Aucun émetteur réel ne
  // peut poser un tel code — mais ce fichier est la barrière, il doit se lire au
  // premier degré.
  if (code && Object.hasOwn(USER_FACING_ERROR_CODES, code)) {
    // Forme étiquetée `{ error: { code, message } }`, ou forme plate avec code
    // frère `{ error: "phrase", code }`.
    const message = labelled?.message ?? (typeof apiError === 'string' ? apiError : undefined)
    if (message) return message
  }

  // Règle 3.
  return fallback
}
