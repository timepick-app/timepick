import dns from 'dns'

/**
 * Strict email regex used for the preflight format check. Deliberately tighter
 * than `z.string().email()` (RFC 5322) so that obvious typos are rejected
 * client-side before any DNS lookup. Mirror this regex on the client.
 */
export const STRICT_EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/

/**
 * Lifetime of a positive/negative MX cache entry. Domains rarely flip MX
 * presence, and a 1h window keeps cold-start cost negligible without serving
 * stale data through a real outage.
 */
export const MX_CACHE_TTL_MS = 60 * 60 * 1000

/**
 * Hard ceiling on a DNS lookup. Beyond this we degrade silently to a warning
 * the UI ignores so a slow resolver never blocks an admin's create flow.
 */
export const DNS_TIMEOUT_MS = 3000

export type ValidationResult =
  | { valid: true; warning: null }
  | { valid: true; warning: 'NO_MX_RECORD'; domain: string }
  | { valid: true; warning: 'DNS_UNAVAILABLE' }
  | { valid: false; code: 'INVALID_FORMAT' }

interface CacheEntry {
  hasMX: boolean
  expiresAt: number
}

const mxCache = new Map<string, CacheEntry>()

/**
 * Pure regex check. Public so the controller can short-circuit before the
 * async path.
 */
export function validateFormat(email: string): boolean {
  return STRICT_EMAIL_REGEX.test(email)
}

/**
 * Race a DNS lookup against a deterministic timeout. The timeout handle is
 * always cleared so a slow resolver returning later doesn't keep the event
 * loop alive past the request lifecycle.
 */
async function resolveMxWithTimeout(domain: string): Promise<dns.MxRecord[]> {
  let timeoutHandle: NodeJS.Timeout | undefined
  try {
    return await Promise.race([
      dns.promises.resolveMx(domain),
      new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          const err = new Error('DNS lookup timed out') as NodeJS.ErrnoException
          err.code = 'TIMEOUT'
          reject(err)
        }, DNS_TIMEOUT_MS)
      }),
    ])
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle)
  }
}

/**
 * Validate an email's format, then probe its domain for MX records. Returns
 * a non-throwing result describing the outcome:
 *
 * - format KO              → { valid: false, code: 'INVALID_FORMAT' }
 * - MX present             → { valid: true,  warning: null }
 * - MX absent (determinist)→ { valid: true,  warning: 'NO_MX_RECORD', domain }
 * - DNS slow / unreachable → { valid: true,  warning: 'DNS_UNAVAILABLE' }
 *
 * Deterministic outcomes (MX yes/no via ENOTFOUND/ENODATA/empty array) are
 * cached for `MX_CACHE_TTL_MS`. Transient failures are NOT cached so a real
 * outage doesn't lock out a domain for an hour.
 */
export async function validateEmail(email: string): Promise<ValidationResult> {
  if (!validateFormat(email)) {
    return { valid: false, code: 'INVALID_FORMAT' }
  }

  const domain = email.split('@')[1].toLowerCase().trim()

  const cached = mxCache.get(domain)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.hasMX
      ? { valid: true, warning: null }
      : { valid: true, warning: 'NO_MX_RECORD', domain }
  }

  try {
    const addresses = await resolveMxWithTimeout(domain)
    const hasMX = addresses.length > 0
    mxCache.set(domain, { hasMX, expiresAt: Date.now() + MX_CACHE_TTL_MS })
    return hasMX
      ? { valid: true, warning: null }
      : { valid: true, warning: 'NO_MX_RECORD', domain }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code
    if (code === 'ENOTFOUND' || code === 'ENODATA') {
      mxCache.set(domain, { hasMX: false, expiresAt: Date.now() + MX_CACHE_TTL_MS })
      return { valid: true, warning: 'NO_MX_RECORD', domain }
    }
    return { valid: true, warning: 'DNS_UNAVAILABLE' }
  }
}

/**
 * Test-only hook to reset the in-memory cache between cases. Underscored to
 * signal it is not part of the production API.
 */
export function _resetMxCacheForTests(): void {
  mxCache.clear()
}
