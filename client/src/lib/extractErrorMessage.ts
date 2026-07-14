/**
 * Pulls a human-readable message out of an unknown error value.
 *
 * Accepts BOTH backend wire shapes:
 * - Flat string: `error.response.data.error` is a string (events / slots /
 *   reservations / invitations endpoints).
 * - Nested object: `error.response.data.error.message` (settings / email /
 *   auth endpoints).
 *
 * Priority: API message (flat string or nested `.message`) → `error.message`
 * (native `Error`, axios fallback) → caller-supplied fallback.
 *
 * Null-safe: `err === null` or `err === undefined` returns the fallback
 * without throwing (carries the M3 fix from Story 23-4 code review).
 */
export function extractErrorMessage(err: unknown, fallback: string): string {
  const error = (err ?? {}) as {
    response?: { data?: { error?: string | { message?: string } } }
    message?: string
  }
  const apiError = error.response?.data?.error
  const apiMessage = typeof apiError === 'string' ? apiError : apiError?.message
  return apiMessage || error.message || fallback
}
