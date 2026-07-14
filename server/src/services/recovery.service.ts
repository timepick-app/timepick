import crypto from 'crypto'
import bcrypt from 'bcrypt'
import { withTransaction, query } from '../db'

/**
 * Shared bcrypt cost — MUST match between DUMMY_HASH and real-code hashing
 * to keep timing equivalence on the `/emergency-login` path. Change in one
 * place only.
 */
export const BCRYPT_COST = 12

/**
 * Number of recovery codes issued per batch (GitHub-style).
 */
export const RECOVERY_CODES_PER_BATCH = 8

/**
 * Lifetime of a recovery code. Codes silently expire after this interval.
 */
export const RECOVERY_CODE_LIFETIME_DAYS = 365

const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
const CHARSET_LEN = CHARSET.length // 36
// 216 = 6 * 36 — largest multiple of 36 below 256, eliminates modulo bias.
const REJECTION_THRESHOLD = 216

/**
 * Generate raw alphanumeric chars via rejection sampling on crypto.randomBytes.
 * Uniform distribution with at most ~2 syscalls for the default batch size.
 */
function generateRandomChars(count: number): string {
  let out = ''
  while (out.length < count) {
    const buf = crypto.randomBytes(256)
    for (let i = 0; i < buf.length && out.length < count; i++) {
      const byte = buf[i]
      if (byte < REJECTION_THRESHOLD) {
        out += CHARSET[byte % CHARSET_LEN]
      }
    }
  }
  return out
}

/**
 * Format contiguous chars into 8 `TIMEPICK-XXXX-XXXX` codes. Asserts the
 * caller provided enough entropy so a future refactor can't silently produce
 * truncated codes.
 */
function formatCodes(chars: string): string[] {
  const required = RECOVERY_CODES_PER_BATCH * 8
  if (chars.length < required) {
    throw new Error(
      `[recovery.service] formatCodes requires ${required} chars, got ${chars.length}`
    )
  }
  const codes: string[] = []
  for (let i = 0; i < RECOVERY_CODES_PER_BATCH; i++) {
    const slice = chars.slice(i * 8, i * 8 + 8)
    codes.push(`TIMEPICK-${slice.slice(0, 4)}-${slice.slice(4, 8)}`)
  }
  return codes
}

export interface GenerateCodesOptions {
  /**
   * When true, sets `last_recovery_resend_at = NOW()` to start the 24h
   * regeneration rate-limit window. Pass `false` at account-creation time so
   * a newly-minted admin isn't blocked from regenerating for 24h immediately
   * after signup. Defaults to `true` (the regenerate-from-Settings path).
   */
  stampResendAt?: boolean
}

/**
 * Invalidate existing unused codes, generate+hash 8 new codes, and persist
 * them atomically. All three statements run inside a single transaction so a
 * crash between invalidation and insertion can't leave the admin with zero
 * usable codes.
 *
 * Returns plaintext codes — caller is responsible for emailing / displaying
 * them once and never storing them.
 */
export async function generateAndStoreCodes(
  adminId: string,
  options: GenerateCodesOptions = {}
): Promise<string[]> {
  const { stampResendAt = true } = options
  const totalChars = RECOVERY_CODES_PER_BATCH * 8
  const rawChars = generateRandomChars(totalChars)
  const codes = formatCodes(rawChars)

  const hashes = await Promise.all(codes.map((c) => bcrypt.hash(c, BCRYPT_COST)))

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE admin_recovery_codes
       SET used_at = NOW()
       WHERE admin_id = $1 AND used_at IS NULL`,
      [adminId]
    )

    const placeholders = hashes
      .map((_, idx) => `($1, $${idx * 2 + 2}, $${idx * 2 + 3}, NOW() + INTERVAL '${RECOVERY_CODE_LIFETIME_DAYS} days')`)
      .join(', ')
    const params: (string | number)[] = [adminId]
    hashes.forEach((hash, idx) => {
      params.push(hash, idx + 1)
    })

    await client.query(
      `INSERT INTO admin_recovery_codes (admin_id, code_hash, code_index, expires_at)
       VALUES ${placeholders}`,
      params
    )

    if (stampResendAt) {
      await client.query(
        `UPDATE users SET last_recovery_resend_at = NOW() WHERE id = $1`,
        [adminId]
      )
    }
  })

  return codes
}

/**
 * Invalide tous les codes de secours actifs d'un utilisateur (marque
 * `used_at = NOW()` sur les codes non encore utilisés). Idempotent : un second
 * appel ne touche aucune row (toutes déjà `used_at IS NOT NULL`).
 *
 * Utilisé à la rétrogradation Administrateur → Membre : hygiène, pas urgence —
 * l'emergency login filtre déjà `AND role = 'admin'`, donc un ex-admin ne peut
 * de toute façon plus s'en servir. Idempotent et best-effort côté contrôleur.
 */
export async function invalidateRecoveryCodes(userId: string): Promise<void> {
  await query(
    `UPDATE admin_recovery_codes
     SET used_at = NOW()
     WHERE admin_id = $1 AND used_at IS NULL`,
    [userId]
  )
}
