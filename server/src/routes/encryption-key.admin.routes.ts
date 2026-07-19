import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { requireAdmin } from '../middleware/adminAuth'
import {
  getAdminEncryptionKeyStatus,
  revealAdminEncryptionKey,
} from '../controllers/admin-encryption-key.controller'

/**
 * Admin router — statut + révélation de la clé de chiffrement (mirrors
 * `recoveryAdminRoutes`). Posture B (§12 · D1) : le reveal brut n'existe QUE
 * derrière `requireAdmin`, jamais publiquement.
 */
const revealLimiter = rateLimit({
  windowMs: 60_000,
  limit: 5,
  skip: () => process.env.NODE_ENV === 'test',
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Trop de requêtes.' } },
})

export const encryptionKeyAdminRoutes = Router()
encryptionKeyAdminRoutes.use(requireAdmin)
encryptionKeyAdminRoutes.get('/encryption-key', getAdminEncryptionKeyStatus)
encryptionKeyAdminRoutes.post('/encryption-key/reveal', revealLimiter, revealAdminEncryptionKey)
