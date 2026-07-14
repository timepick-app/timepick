import { Router } from 'express'
import { requireAdmin } from '../middleware/adminAuth'
import { adminActionLimiter, testSendLimiter } from '../middleware/adminActionLimiter'
import * as eventsController from '../controllers/events.controller'
import * as eventEmailTemplateController from '../controllers/event-email-template.controller'
import * as eventUsersController from '../controllers/eventUsers.controller'
import * as invitationsController from '../controllers/invitations.controller'
import { slotsController } from '../controllers/slots.controller'

const router = Router()

// Toutes les routes pour la gestion des événements (admin uniquement)
// Toutes les routes nécessitent le rôle admin
router.use(requireAdmin)

// Lister tous les événements
router.get('/', eventsController.getEvents)

// Créer un nouvel événement
router.post('/', eventsController.createEvent)

// Supprimer plusieurs événements en masse (doit précéder /:id pour éviter tout conflit)
router.post('/bulk-delete', eventsController.bulkDeleteEvents)

// Récupérer un événement par ID
router.get('/:id', eventsController.getEventById)

// Mettre à jour un événement
router.put('/:id', eventsController.updateEvent)

// Supprimer un événement
router.delete('/:id', eventsController.deleteEvent)

// Dupliquer un événement
router.post('/:id/duplicate', eventsController.duplicateEvent)

// Publier un événement
router.put('/:id/publish', eventsController.publishEvent)

// Dépublier un événement
router.put('/:id/unpublish', eventsController.unpublishEvent)

// Définir la date d'ouverture des inscriptions
router.put('/:id/opening-date', eventsController.setOpeningDate)

// Per-event email template (events.invitation_mjml column)
router.get('/:id/email-template', eventEmailTemplateController.readEventEmailTemplateHandler)
router.patch('/:id/email-template', eventEmailTemplateController.patchEventEmailTemplateHandler)
router.post('/:id/email-template/reset', eventEmailTemplateController.resetEventEmailTemplateHandler)
// Preview endpoint (E3.S3) — runs renderEmail() with eventId for inheritance resolution
router.post('/:id/email-template/preview', eventEmailTemplateController.previewEventEmailTemplateHandler)
// Test-send endpoint (Task 46) — envoie l'invitation per-event à une adresse choisie
router.post(
  '/:id/email-template/test-send',
  testSendLimiter,
  eventEmailTemplateController.testSendEventEmailTemplateHandler,
)

// Routes pour la gestion des utilisateurs autorisés
router.post('/:id/users', eventUsersController.setEventUsers)
router.get('/:id/users', eventUsersController.getEventUsers)
router.post('/:id/users/:userId', eventUsersController.addEventUser)
router.delete('/:id/users/:userId', eventUsersController.removeEventUser)

// Routes pour la gestion des créneaux horaires (slots)
router.get('/:eventId/slots', slotsController.getEventSlots)
router.post('/:eventId/slots', slotsController.createSlot)

// Routes pour la gestion des invitations
router.post('/:id/invitations/send', invitationsController.sendInvitations)
router.get('/:id/invitations', invitationsController.getEventInvitations)
router.get('/:id/invitations/status', invitationsController.getEventUsersInvitationStatus)
router.get('/:id/invitations/eligibility', invitationsController.checkInvitationEligibility)
router.post('/:id/invitations/:userId/resend', invitationsController.resendInvitation)
router.post('/:id/invitations/resend-unanswered', adminActionLimiter, invitationsController.resendUnanswered)

export default router
