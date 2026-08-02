import { ERROR_CODES } from '@timepick/shared'
import rateLimit, { ipKeyGenerator } from 'express-rate-limit'
import type { Request } from 'express'

const keyGenerator = (req: Request): string => {
  if (req.user?.userId) return `admin:${req.user.userId}`
  return ipKeyGenerator(req.ip ?? '')
}

/**
 * Rate limiter for destructive admin endpoints.
 *
 * 10 actions per minute per admin user is generous for legitimate flows but
 * caps abuse from a leaked admin token. Mirrors the `uploadLimiter` pattern
 * in `routes/uploads.routes.ts:18-24`. The structured `{ error: { code,
 * message } }` body matches the project's standard error envelope so the
 * client can detect rate-limit failures by `code === 'RATE_LIMITED'`.
 *
 * Keying:
 *   - Primary key: `req.user.userId` (set by `requireAdmin`, which MUST run
 *     before this middleware on every route that uses it). This means the
 *     10/min budget is per-admin, not per-source-IP, which is correct under
 *     a reverse proxy where every legitimate admin shares the proxy IP.
 *   - Fallback (defense in depth): `req.ip` if `req.user` is somehow absent
 *     (shouldn't happen with proper middleware ordering — surfacing this as
 *     a misconfigured route would be louder than failing open).
 *
 * Deployment note: when TimePick is deployed behind a reverse proxy
 * (nginx/Caddy/Cloudflare), `app.set('trust proxy', ...)` MUST be configured
 * so `req.ip` reflects the real client IP for the fallback path. Without it,
 * the fallback collapses to a single shared key for all admins missing
 * `req.user` — practically not a problem given primary keying, but worth
 * verifying in the Express bootstrap.
 */
export const adminActionLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  message: {
    error: {
      code: ERROR_CODES.RATE_LIMITED,
      message: 'Trop de requêtes. Veuillez patienter avant de réessayer.',
    },
  },
})

/**
 * Stricter limiter dedicated to the email "test-send" endpoints. Unlike the
 * other admin actions gated by `adminActionLimiter`, test-send delivers an
 * email to an admin-chosen, *unrestricted* recipient — so a leaked token is a
 * direct harassment / sender-reputation vector (M1, 2026-06-07 API review).
 * 5/min per admin is ample for iterating on a template while sharply bounding
 * abuse. Same keying + error envelope as `adminActionLimiter`.
 */
export const testSendLimiter = rateLimit({
  windowMs: 60_000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  message: {
    error: {
      code: ERROR_CODES.RATE_LIMITED,
      message: 'Trop d’envois de test. Veuillez patienter avant de réessayer.',
    },
  },
})
