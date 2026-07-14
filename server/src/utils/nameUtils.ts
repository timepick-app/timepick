/**
 * Helpers de formatage du nom membre (split `full_name` → `first_name` /
 * `last_name`, story S2). Centralise les concaténations prénom/nom pour éviter
 * les `as string` ad hoc qui masquaient les régressions silencieuses.
 */

/** Concatène prénom + nom avec un espace si `lastName` est présent ; sinon prénom seul. */
export function formatFullName(firstName: string, lastName: string | null | undefined): string {
  return lastName ? `${firstName} ${lastName}` : firstName
}

/**
 * Construit les variables de nom pour les emails sortants.
 * La salutation est désormais littérale dans les templates (« Bonjour {{user_first_name}}, »),
 * donc seules les 3 clés prénom/nom/nom complet sont retournées.
 * Garantit l'absence d'espace orphelin quand `firstName` est vide ou null.
 */
export function emailNameVariables(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
): { user_first_name: string; user_last_name: string; user_full_name: string } {
  const first = (firstName ?? '').trim()
  const last = (lastName ?? '').trim()
  return {
    user_first_name: first,
    user_last_name: last,
    user_full_name: [first, last].filter(Boolean).join(' '),
  }
}
