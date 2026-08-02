/**
 * Enveloppe d'erreur de l'API, telle qu'elle arrive dans une erreur axios.
 *
 * Trois formes coexistent côté serveur — il n'y a pas de middleware d'erreur
 * central, chaque contrôleur formate sa réponse :
 *
 * - **étiquetée** : `{ error: { code, message } }` (réglages, auth, modèles
 *   d'e-mail, blocs de coque) ;
 * - **plate** : `{ error: "phrase" }` (événements, créneaux, membres,
 *   réservations, organisation, téléversements) — aucun code, donc jamais
 *   affichée ;
 * - **plate avec code frère** : `{ error: "phrase", code }` (événement public).
 *
 * Ce type remplace les redéclarations locales du motif
 * `as { response?: { data?: { error?: string } }; message?: string }`, qui
 * décrivaient chacune une seule des trois formes.
 */
export interface ApiErrorEnvelope {
  response?: {
    status?: number
    data?: {
      error?: string | { code?: string; message?: string }
      /** Code frère de la forme plate. */
      code?: string
    }
  }
  /** Code de transport axios (`ERR_NETWORK`, `ECONNABORTED`…). */
  code?: string
  /** Message technique d'axios ou d'une `Error` — jamais affiché. */
  message?: string
}
