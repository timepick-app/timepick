import { Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcrypt'
import { z } from 'zod'
import { query } from '../db'
import { configService } from '../services/config.service'
import {
  BCRYPT_COST,
  RECOVERY_CODES_PER_BATCH,
  generateAndStoreCodes,
} from '../services/recovery.service'

const JWT_SECRET = process.env.JWT_SECRET!
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required')
}

// Pre-computed padding hash. Generated synchronously at module load so the
// constant-time compare loop on /emergency-login never has to hash-on-demand.
// Cost MUST equal BCRYPT_COST for timing equivalence against real code hashes.
const DUMMY_HASH = bcrypt.hashSync(
  'timepick-dummy-recovery-placeholder-do-not-use',
  BCRYPT_COST
)

const LOCKOUT_THRESHOLD = 10
const REGEN_WINDOW_MS = 24 * 60 * 60 * 1000 // 24h

// ---------------------------------------------------------------------------
// Audit helpers
// ---------------------------------------------------------------------------

type AuditResult = 'success' | 'invalid_code' | 'account_locked' | 'expired' | 'unknown_account'

async function writeAuditLog(
  adminId: string | null,
  ip: string | null,
  userAgent: string | null,
  result: AuditResult
): Promise<void> {
  try {
    await query(
      `INSERT INTO recovery_audit_log (admin_id, ip_address, user_agent, result)
       VALUES ($1, $2, $3, $4)`,
      [adminId, ip, userAgent, result]
    )
  } catch (err) {
    console.error('[RecoveryController] Failed to write audit log:', err)
  }
}

function getClientIp(req: Request): string | null {
  return (req.ip || req.socket.remoteAddress || null) as string | null
}

function getUserAgent(req: Request): string | null {
  const ua = req.headers['user-agent']
  return typeof ua === 'string' ? ua : null
}

// ---------------------------------------------------------------------------
// POST /api/admin/recovery-codes/generate
// ---------------------------------------------------------------------------

export const generateCodes = async (req: Request, res: Response): Promise<void> => {
  const adminId = req.user?.userId
  if (!adminId) {
    res.status(401).json({ error: 'Authentification requise' })
    return
  }

  try {
    // DB-backed 24h rate limit via last_recovery_resend_at
    const row = await query<{ last_recovery_resend_at: Date | null }>(
      `SELECT last_recovery_resend_at FROM users WHERE id = $1`,
      [adminId]
    )
    const last = row.rows[0]?.last_recovery_resend_at
    if (last) {
      const elapsed = Date.now() - new Date(last).getTime()
      if (elapsed < REGEN_WINDOW_MS) {
        res.status(429).json({
          code: 'RATE_LIMITED',
          retryAfterMs: REGEN_WINDOW_MS - elapsed,
        })
        return
      }
    }

    const codes = await generateAndStoreCodes(adminId)

    res.status(200).json({ codes })
  } catch (err) {
    console.error('[RecoveryController] generateCodes error:', err)
    res.status(500).json({ error: 'Erreur lors de la génération des codes de secours' })
  }
}

// ---------------------------------------------------------------------------
// GET /api/admin/recovery-codes/status
// ---------------------------------------------------------------------------

export const getStatus = async (req: Request, res: Response): Promise<void> => {
  const adminId = req.user?.userId
  if (!adminId) {
    res.status(401).json({ error: 'Authentification requise' })
    return
  }

  try {
    const remainingRes = await query<{ remaining: number; expires_at: Date | null; last_generated_at: Date | null }>(
      `SELECT
         COUNT(*) FILTER (WHERE used_at IS NULL AND expires_at > NOW())::int AS remaining,
         MIN(expires_at) FILTER (WHERE used_at IS NULL AND expires_at > NOW()) AS expires_at,
         MAX(created_at) AS last_generated_at
       FROM admin_recovery_codes
       WHERE admin_id = $1`,
      [adminId]
    )

    const userRes = await query<{ emergency_login_notified: boolean }>(
      `SELECT emergency_login_notified FROM users WHERE id = $1`,
      [adminId]
    )

    const remaining = remainingRes.rows[0]?.remaining ?? 0
    const expiresAt = remainingRes.rows[0]?.expires_at ?? null
    const lastGeneratedAt = remainingRes.rows[0]?.last_generated_at ?? null

    res.status(200).json({
      remaining,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      lastGeneratedAt: lastGeneratedAt ? new Date(lastGeneratedAt).toISOString() : null,
      emergencyLoginNotified: userRes.rows[0]?.emergency_login_notified ?? true,
    })
  } catch (err) {
    console.error('[RecoveryController] getStatus error:', err)
    res.status(500).json({ error: 'Erreur lors de la lecture du statut' })
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/admin/recovery-codes/dismiss
// ---------------------------------------------------------------------------

export const dismissBanner = async (req: Request, res: Response): Promise<void> => {
  const adminId = req.user?.userId
  if (!adminId) {
    res.status(401).json({ error: 'Authentification requise' })
    return
  }

  try {
    await query(
      `UPDATE users
       SET recovery_codes_dismissed_at = NOW(),
           emergency_login_notified = true
       WHERE id = $1`,
      [adminId]
    )
    res.status(200).json({ ok: true })
  } catch (err) {
    console.error('[RecoveryController] dismissBanner error:', err)
    res.status(500).json({ error: 'Erreur lors de la mise à jour' })
  }
}

// ---------------------------------------------------------------------------
// POST /api/auth/emergency-login
// ---------------------------------------------------------------------------

const emergencyLoginSchema = z.object({
  email: z.string().email('Identifiants incorrects'),
  code: z.string().min(1, 'Identifiants incorrects'),
})

/**
 * Run exactly RECOVERY_CODES_PER_BATCH bcrypt.compare operations so total
 * response time is constant regardless of user-existence, code-count, or
 * match position. Never short-circuits on first match — that would
 * re-introduce the timing oracle.
 *
 * Defence-in-depth: if `activeHashes` somehow exceeds the batch size (should
 * be impossible given the invalidation step in generateAndStoreCodes), we
 * truncate to the first 8 rather than lengthen the loop. Truncating is safer
 * than silently leaking timing — a match at index ≥ 8 is discarded, which
 * degrades gracefully to "invalid code" rather than observably slower.
 */
export async function constantTimeCompare(
  code: string,
  activeHashes: string[]
): Promise<number | null> {
  const hashes = activeHashes.slice(0, RECOVERY_CODES_PER_BATCH)
  const padded: string[] = new Array(RECOVERY_CODES_PER_BATCH)
  for (let i = 0; i < RECOVERY_CODES_PER_BATCH; i++) {
    padded[i] = hashes[i] ?? DUMMY_HASH
  }

  let matchIdx: number | null = null
  for (let i = 0; i < RECOVERY_CODES_PER_BATCH; i++) {
    const ok = await bcrypt.compare(code, padded[i])
    if (ok && matchIdx === null && i < hashes.length) {
      matchIdx = i
    }
  }
  return matchIdx
}

// Fallback session TTL used when configService.getSessionTTL() throws. Keeps
// the happy-path response shape identical to failure paths so a transient DB
// outage doesn't create a status-code oracle on valid codes.
const SESSION_TTL_FALLBACK_SECONDS = 2 * 60 * 60

const INVALID_CREDENTIALS_BODY = { code: 'INVALID_CREDENTIALS' } as const

export const emergencyLogin = async (req: Request, res: Response): Promise<void> => {
  const ip = getClientIp(req)
  const userAgent = getUserAgent(req)

  // Resolve session TTL up front so both success and failure paths share the
  // same failure mode and no timing/status oracle leaks from a config outage.
  let sessionTtl = SESSION_TTL_FALLBACK_SECONDS
  try {
    sessionTtl = await configService.getSessionTTL()
  } catch (ttlErr) {
    console.error('[RecoveryController] getSessionTTL failed, using fallback:', ttlErr)
  }

  try {
    const parsed = emergencyLoginSchema.safeParse(req.body)
    if (!parsed.success) {
      // Burn bcrypt cycles so malformed requests don't short-circuit timing.
      await constantTimeCompare('_', [])
      res.status(401).json(INVALID_CREDENTIALS_BODY)
      return
    }
    const { email, code } = parsed.data

    // 1. Lookup admin (case-insensitive). Anti-enumeration: always burn 8
    //    bcrypt.compare calls against DUMMY_HASH if no admin matches.
    const userRes = await query<{ id: string; email: string; first_name: string | null; last_name: string | null; role: string }>(
      `SELECT id, email, first_name, last_name, role FROM users
       WHERE LOWER(email) = LOWER($1) AND role = 'admin'
       LIMIT 1`,
      [email]
    )

    if (userRes.rows.length === 0) {
      await constantTimeCompare(code, [])
      // Audit with NULL admin_id so enumeration probes leave a forensic trail.
      await writeAuditLog(null, ip, userAgent, 'unknown_account')
      res.status(401).json(INVALID_CREDENTIALS_BODY)
      return
    }

    const admin = userRes.rows[0]

    // 2. Account-level lockout check — only count actual invalid-code attempts.
    // 'account_locked' rows are advisory audit entries; including them in the
    // count would let an attacker extend the lockout indefinitely by probing.
    //
    // Anti-enumeration: lockout path returns the SAME 401 INVALID_CREDENTIALS
    // as unknown-email/invalid-code. Exposing a 429+retryAfterMs would let
    // an attacker enumerate real admin emails by probing 11+ times and
    // watching for the status change. The IP-based 5/15min rate limit on
    // the route plus the 10/1h account lockout still apply server-side.
    const lockoutRes = await query<{ count: number }>(
      `SELECT COUNT(*)::int AS count
       FROM recovery_audit_log
       WHERE admin_id = $1
         AND result = 'invalid_code'
         AND created_at > NOW() - INTERVAL '1 hour'`,
      [admin.id]
    )
    const failures = lockoutRes.rows[0]?.count ?? 0
    if (failures >= LOCKOUT_THRESHOLD) {
      await constantTimeCompare(code, [])
      await writeAuditLog(admin.id, ip, userAgent, 'account_locked')
      res.status(401).json(INVALID_CREDENTIALS_BODY)
      return
    }

    // 3. Load active codes
    const activeRes = await query<{ id: string; code_hash: string; code_index: number }>(
      `SELECT id, code_hash, code_index
       FROM admin_recovery_codes
       WHERE admin_id = $1 AND used_at IS NULL AND expires_at > NOW()
       ORDER BY code_index ASC`,
      [admin.id]
    )

    // 4. Constant-time compare (exactly 8 bcrypt.compare calls)
    const hashes = activeRes.rows.map((r) => r.code_hash)
    const matchIdx = await constantTimeCompare(code, hashes)

    if (matchIdx === null) {
      await writeAuditLog(admin.id, ip, userAgent, 'invalid_code')
      res.status(401).json(INVALID_CREDENTIALS_BODY)
      return
    }

    const matchedRow = activeRes.rows[matchIdx]

    // 5. Optimistic lock: only succeed if the row is still unused
    const updateRes = await query(
      `UPDATE admin_recovery_codes
       SET used_at = NOW()
       WHERE id = $1 AND used_at IS NULL`,
      [matchedRow.id]
    )
    if ((updateRes.rowCount ?? 0) === 0) {
      await writeAuditLog(admin.id, ip, userAgent, 'invalid_code')
      res.status(401).json(INVALID_CREDENTIALS_BODY)
      return
    }

    // 6. Stamp emergency-login metadata on the user row
    await query(
      `UPDATE users
       SET last_emergency_login_at = NOW(),
           last_emergency_login_ip = $1,
           emergency_login_notified = false
       WHERE id = $2`,
      [ip, admin.id]
    )

    // 7. Compute remaining active codes after consumption
    const remainingRes = await query<{ remaining: number }>(
      `SELECT COUNT(*)::int AS remaining
       FROM admin_recovery_codes
       WHERE admin_id = $1 AND used_at IS NULL AND expires_at > NOW()`,
      [admin.id]
    )
    const remainingCodes = remainingRes.rows[0]?.remaining ?? 0

    // 8. Issue emergency session JWT
    const token = jwt.sign(
      { userId: admin.id, role: 'admin', sessionType: 'emergency' },
      JWT_SECRET,
      { expiresIn: sessionTtl }
    )

    // 9. Audit success (best-effort)
    await writeAuditLog(admin.id, ip, userAgent, 'success')

    res.status(200).json({
      token,
      user: {
        id: admin.id,
        email: admin.email,
        firstName: admin.first_name,
        lastName: admin.last_name,
        role: 'admin',
      },
      remainingCodes,
      isLastCode: remainingCodes === 0,
      sessionTtl,
    })
  } catch (err) {
    console.error('[RecoveryController] emergencyLogin error:', err)
    res.status(500).json({ error: 'Erreur interne' })
  }
}
