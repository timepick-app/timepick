import { Router } from 'express'
import { requireAdmin } from '../middleware/adminAuth'
import { cancellationNotificationsController } from '../controllers/cancellation-notifications.controller'

const router = Router()

// Toutes les routes nécessitent le rôle admin
router.use(requireAdmin)

// Lecture groupée des notifications d'annulation en attente (global ou par
// événement via ?eventId=) + renvoi groupé idempotent.
router.get('/cancellation-notifications', cancellationNotificationsController.getPending)
router.post('/cancellation-notifications/resend', cancellationNotificationsController.resend)

export default router
