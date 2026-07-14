import { Router } from 'express'
import * as eventsController from '../controllers/events.controller'

const router = Router()

// Routes publiques pour les événements publiés
// Aucune authentification requise - accessible à tous

// Lister tous les événements publiés
router.get('/', eventsController.getPublicEvents)

// Récupérer un événement publié par ID
router.get('/:id', eventsController.getPublicEvent)

export default router
