import { Router } from 'express'
import * as eventsController from '../controllers/events.controller'
import * as slotsPublicController from '../controllers/slots.public.controller'
import * as reservationsController from '../controllers/reservations.controller'
import * as organizationController from '../controllers/organization.controller'
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

// Chantier A1 — identité de l'organisation (façade publique, contrat §Q4 : expose
// UNIQUEMENT name/logo/description + booléen façade, aucune fuite d'un autre champ app_config)
router.get('/organization', organizationController.getOrganizationHandler)

export default router
