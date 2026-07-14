import type { Request, Response } from 'express'
import { validateEmail } from '../services/emailValidator.service'

/**
 * Pre-flight email validation for the admin user-create form.
 * GET /api/admin/users/validate-email?email=<urlencoded>
 *
 * Strategy: regex format check first (fast, deterministic), then a DNS MX
 * probe with cache + timeout. Format failures return 400 so the client knows
 * to block submit; everything else returns 200 with an optional warning code
 * the client can surface as a non-blocking hint.
 */
export const validateUserEmail = async (req: Request, res: Response): Promise<void> => {
  const raw = req.query.email
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    res.status(400).json({
      error: { code: 'MISSING_EMAIL', message: "Paramètre 'email' requis" },
    })
    return
  }

  try {
    const result = await validateEmail(raw.trim())

    if (!result.valid) {
      res.status(400).json({
        error: { code: result.code, message: "Format d'email invalide" },
      })
      return
    }

    res.json(result)
  } catch (err) {
    // The service is designed never to throw — surface as DNS_UNAVAILABLE
    // rather than a 500 so the UX stays non-blocking.
    console.error('[emailValidator.controller] Unexpected error:', err)
    res.json({ valid: true, warning: 'DNS_UNAVAILABLE' })
  }
}
