import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { requireAdmin } from '../middleware/adminAuth'
import {
  emergencyLogin,
  generateCodes,
  getStatus,
  dismissBanner,
} from '../controllers/recovery.controller'

/**
 * Public router — exposes `/emergency-login` with an IP-based rate limit.
 * In-memory store is acceptable here: the account-level 10/1h lockout in
 * the controller is the restart-safe defence-in-depth mechanism.
 */
const emergencyLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 'RATE_LIMITED' },
})

export const recoveryPublicRoutes = Router()
recoveryPublicRoutes.post('/emergency-login', emergencyLoginLimiter, emergencyLogin)

/**
 * Admin router — all routes require an authenticated admin session.
 * 24h regeneration rate-limit is enforced inside `generateCodes` using the
 * DB-persisted `last_recovery_resend_at` column (restart-safe).
 */
export const recoveryAdminRoutes = Router()
recoveryAdminRoutes.use(requireAdmin)
recoveryAdminRoutes.get('/recovery-codes/status', getStatus)
recoveryAdminRoutes.post('/recovery-codes/generate', generateCodes)
recoveryAdminRoutes.patch('/recovery-codes/dismiss', dismissBanner)
