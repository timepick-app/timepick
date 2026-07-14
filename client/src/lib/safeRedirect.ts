/** Vrai ssi `value` est un chemin interne sûr (un seul '/', pas de scheme/backslash/controle). */
export function isSafeInternalPath(value: string | null | undefined): value is string {
  return (
    typeof value === 'string' &&
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.includes('\\') &&
    // eslint-disable-next-line no-control-regex -- détection volontaire des caractères de contrôle (anti-injection redirection)
    !/[\u0000-\u001f\u007f]/.test(value)
  )
}
