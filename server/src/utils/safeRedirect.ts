/**
 * Prédicat de protection open-redirect.
 *
 * Vrai ssi `value` est un chemin interne sur la même origine : commence par un
 * seul '/', pas de scheme (`//`), pas de backslash, aucun caractère de contrôle.
 * Doit rester identique au prédicat homologue côté client (contract partagé).
 */
export function isSafeInternalPath(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.includes('\\') &&
    !/[\u0000-\u001f\u007f]/.test(value)
  )
}
