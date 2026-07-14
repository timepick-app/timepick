import { Router } from 'express'
import * as eventsController from '../controllers/events.controller'
import * as slotsPublicController from '../controllers/slots.public.controller'
import * as reservationsController from '../controllers/reservations.controller'
import { requireAuth } from '../middleware/auth.middleware'

const router = Router()

// Routes publiques pour les événements publiés avec authentification optionnelle
// - Sans auth: mode consultation (canReserve: false, slots: [])
// - Avec auth: vérifie l'appartenance à event_users (403 si non autorisé)

// Accéder à un événement publié par UUID
router.get('/events/:uuid', eventsController.getPublicEventWithAuth)

// Récupérer les créneaux d'un événement public par UUID (Epic 6 - Calendrier Public)
router.get('/events/:uuid/slots', slotsPublicController.getPublicEventSlots)

// Routes de réservation (authentification requise)
// Ces routes permettent aux utilisateurs authentifiés de gérer leurs réservations
router.post('/reservations', requireAuth, reservationsController.createReservation)
router.get('/reservations', requireAuth, reservationsController.getMyReservations)
router.delete('/reservations/:id', requireAuth, reservationsController.cancelReservation)
router.delete('/reservations/by-slot/:slotId', requireAuth, reservationsController.cancelReservationBySlot)

export default router
