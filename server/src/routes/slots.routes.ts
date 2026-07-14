import { Router } from 'express'
import { requireAuth } from '../middleware/auth.middleware'
import { requireAdmin } from '../middleware/adminAuth'
import { slotsController } from '../controllers/slots.controller'
import { bookSlot, cancelBooking, getSlots } from '../controllers/slots.public.controller'

const router = Router()

// Routes admin - doivent être définies en PREMIER car Express match dans l'ordre
// Toutes nécessitent le rôle admin
router.get('/events/:eventId/slots', requireAdmin, slotsController.getEventSlots)
router.post('/events/:eventId/slots', requireAdmin, slotsController.createSlot)
router.get('/slots/:id', requireAdmin, slotsController.getSlotById)
router.put('/slots/:id', requireAdmin, slotsController.updateSlot)
router.delete('/slots/:id', requireAdmin, slotsController.deleteSlot)

// Routes de booking accessibles aux utilisateurs authentifiés (membre et admin)
// NOTE: Doivent être APRÈS les routes admin spécifiques pour éviter de les intercepter
router.post('/book', requireAuth, bookSlot)
router.delete('/book/:slotId', requireAuth, cancelBooking)

// Route de listing des slots accessibles aux utilisateurs authentifiés
// NOTE: Doit être en DERNIER car '/' match toutes les requêtes GET non matchées précédemment
router.get('/', requireAuth, getSlots)

export default router
