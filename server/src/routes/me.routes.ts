import { Router } from 'express'
import { requireAuth } from '../middleware/auth.middleware'
import * as meController from '../controllers/me.controller'

const router = Router()

// Toutes les routes /api/me/* requièrent un membre authentifié (isAuthenticated).
// Aucun check de rôle : un admin membre y a également accès (cadrage §3.4).
// Ne PAS passer requireAuth dans app.use(...) — la garde est au niveau routeur (D6).
router.use(requireAuth)

router.get('/events', meController.getMyEvents)
router.get('/profile', meController.getMyProfile)
router.patch('/profile', meController.updateMyProfile)
router.get('/slots', meController.getMySlots)
router.get('/available-slots', meController.getMyAvailableSlots)

export default router
