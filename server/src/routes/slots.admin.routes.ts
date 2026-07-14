import { Router } from 'express'
import { requireAdmin } from '../middleware/adminAuth'
import { slotsController } from '../controllers/slots.controller'

const router = Router()

// Toutes les routes nécessitent le rôle admin
router.use(requireAdmin)

// Routes pour la gestion individuelle des créneaux
router.get('/slots/:id', slotsController.getSlotById)
router.put('/slots/:id', slotsController.updateSlot)
router.delete('/slots/:id', slotsController.deleteSlot)

export default router
