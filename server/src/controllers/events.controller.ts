import type { Request, Response } from 'express'
import { z } from 'zod'
import { eventService } from '../services/event.service'
import { eventUsersService } from '../services/eventUsers.service'
import { createEventSchema, updateEventSchema, updateOpeningDateSchema, formatZodError } from '../validators/event.validator'
import { NotFoundError } from '../errors/NotFoundError'
import { ValidationError } from '../errors/ValidationError'
import { NotPublishedError } from '../errors/NotPublishedError'
import { UUID_RE } from '../lib/constants'
import { ERROR_CODES } from '@timepick/shared'

/**
 * Vérifie si l'erreur est une violation de contrainte unique PostgreSQL
 * @param error - L'erreur à vérifier
 * @returns true si c'est une erreur de contrainte unique (code 23505)
 */
function isUniqueConstraintError(error: unknown): boolean {
  if (error && typeof error === 'object' && 'code' in error) {
    return (error as { code: string }).code === '23505'
  }
  return false
}

/**
 * Créer un nouvel événement
 * POST /api/admin/events
 */
export const createEvent = async (req: Request, res: Response): Promise<void> => {
  try {
    const input = createEventSchema.parse(req.body)
    const event = await eventService.createEvent(input)
    res.status(201).json({ data: event })
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: formatZodError(error), code: ERROR_CODES.VALIDATION_ERROR })
      return
    }
    // Détecter la violation de contrainte unique (nom d'événement dupliqué)
    if (isUniqueConstraintError(error)) {
      res.status(409).json({ error: 'Un événement avec ce nom existe déjà. Choisissez un autre nom.', code: ERROR_CODES.EVENT_NAME_TAKEN })
      return
    }
    console.error('Error creating event:', error)
    res.status(500).json({ error: 'Erreur lors de la création de l\'événement' })
  }
}

/**
 * Lister tous les événements (admin uniquement)
 * GET /api/admin/events
 */
export const getEvents = async (req: Request, res: Response): Promise<void> => {
  try {
    const events = await eventService.getEvents()
    res.json({ data: events })
  } catch (error) {
    console.error('Error fetching events:', error)
    res.status(500).json({ error: 'Erreur lors de la récupération des événements' })
  }
}

/**
 * Récupérer un événement par ID
 * GET /api/admin/events/:id
 */
export const getEventById = async (req: Request, res: Response): Promise<void> => {
  try {
    const event = await eventService.getEventById(req.params.id)
    res.json({ data: event })
  } catch (error) {
    if (error instanceof NotFoundError) {
      res.status(404).json({ error: error.message, code: error.code })
      return
    }
    console.error('Error fetching event:', error)
    res.status(500).json({ error: 'Erreur lors de la récupération de l\'événement' })
  }
}

/**
 * Mettre à jour un événement
 * PUT /api/admin/events/:id
 */
export const updateEvent = async (req: Request, res: Response): Promise<void> => {
  try {
    const input = updateEventSchema.parse(req.body)
    const event = await eventService.updateEvent(req.params.id, input)
    res.json({ data: event })
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: formatZodError(error), code: ERROR_CODES.VALIDATION_ERROR })
      return
    }
    if (error instanceof NotFoundError) {
      res.status(404).json({ error: error.message, code: error.code })
      return
    }
    if (error instanceof ValidationError) {
      res.status(400).json({ error: error.message, code: error.code })
      return
    }
    // Détecter la violation de contrainte unique (nom d'événement dupliqué)
    if (isUniqueConstraintError(error)) {
      res.status(409).json({ error: 'Un événement avec ce nom existe déjà. Choisissez un autre nom.', code: ERROR_CODES.EVENT_NAME_TAKEN })
      return
    }
    console.error('Error updating event:', error)
    res.status(500).json({ error: 'Erreur lors de la mise à jour de l\'événement' })
  }
}

/**
 * Supprimer un événement
 * DELETE /api/admin/events/:id
 */
export const deleteEvent = async (req: Request, res: Response): Promise<void> => {
  try {
    const deleted = await eventService.deleteEvent(req.params.id)
    if (!deleted) {
      res.status(404).json({ error: 'Événement non trouvé', code: ERROR_CODES.EVENT_NOT_FOUND })
      return
    }
    res.status(204).send()
  } catch (error) {
    console.error('Error deleting event:', error)
    res.status(500).json({ error: 'Erreur lors de la suppression de l\'événement' })
  }
}

/**
 * Publier un événement
 * PUT /api/admin/events/:id/publish
 */
export const publishEvent = async (req: Request, res: Response): Promise<void> => {
  try {
    const event = await eventService.publishEvent(req.params.id)
    res.json({ data: event })
  } catch (error) {
    if (error instanceof NotFoundError) {
      res.status(404).json({ error: error.message, code: error.code })
      return
    }
    if (error instanceof ValidationError) {
      res.status(400).json({ error: error.message, code: error.code })
      return
    }
    console.error('Error publishing event:', error)
    res.status(500).json({ error: 'Erreur lors de la publication de l\'événement' })
  }
}

/**
 * Dépublier un événement
 * PUT /api/admin/events/:id/unpublish
 */
export const unpublishEvent = async (req: Request, res: Response): Promise<void> => {
  try {
    const event = await eventService.unpublishEvent(req.params.id)
    res.json({ data: event })
  } catch (error) {
    if (error instanceof NotFoundError) {
      res.status(404).json({ error: error.message, code: error.code })
      return
    }
    console.error('Error unpublishing event:', error)
    res.status(500).json({ error: 'Erreur lors de la dépublication de l\'événement' })
  }
}

/**
 * Récupérer un événement publié par ID (accès public)
 * GET /api/events/:id
 */
export const getPublicEvent = async (req: Request, res: Response): Promise<void> => {
  try {
    const event = await eventService.getPublicEvent(req.params.id)
    res.json({ data: event })
  } catch (error) {
    if (error instanceof NotPublishedError) {
      res.status(404).json({ error: 'Événement non trouvé ou non publié', code: ERROR_CODES.EVENT_NOT_PUBLISHED })
      return
    }
    if (error instanceof NotFoundError) {
      res.status(404).json({ error: error.message, code: error.code })
      return
    }
    console.error('Error fetching public event:', error)
    res.status(500).json({ error: 'Erreur lors de la récupération de l\'événement' })
  }
}

/**
 * Lister tous les événements publiés (accès public)
 * GET /api/events
 */
export const getPublicEvents = async (req: Request, res: Response): Promise<void> => {
  try {
    const events = await eventService.getPublicEvents()
    res.json({ data: events })
  } catch (error) {
    console.error('Error fetching public events:', error)
    res.status(500).json({ error: 'Erreur lors de la récupération des événements' })
  }
}

/**
 * Définir la date d'ouverture des inscriptions
 * PUT /api/admin/events/:id/opening-date
 * Body: { opensAt: string | null } - ISO 8601 date string ou null
 */
export const setOpeningDate = async (req: Request, res: Response): Promise<void> => {
  try {
    const input = updateOpeningDateSchema.parse(req.body)
    // Convertir Date en ISO string ou null
    const opensAtString = input.opensAt ? input.opensAt.toISOString() : null
    const event = await eventService.setOpeningDate(req.params.id, opensAtString)
    res.json({ data: event })
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: formatZodError(error), code: ERROR_CODES.VALIDATION_ERROR })
      return
    }
    if (error instanceof NotFoundError) {
      res.status(404).json({ error: error.message, code: error.code })
      return
    }
    console.error('Error setting opening date:', error)
    res.status(500).json({ error: 'Erreur lors de la mise à jour de la date d\'ouverture' })
  }
}

/**
 * Récupérer un événement publié par UUID avec vérification d'autorisation
 * GET /api/public/events/:uuid
 *
 * Vérifications :
 * - L'événement doit être publié (404 sinon)
 * - Si authentifié avec rôle admin: accès autorisé (bypass event_users)
 * - Si authentifié sans rôle admin: vérifier que l'utilisateur est dans event_users (403 sinon)
 * - Si non authentifié: mode consultation (slots vides, canReserve=false)
 */
export const getPublicEventWithAuth = async (req: Request, res: Response): Promise<void> => {
  try {
    const { uuid } = req.params
    const userId = req.user?.userId

    // Récupérer l'événement (doit être publié)
    const event = await eventService.getPublicEventByUuid(uuid)

    // Mode consultation si non authentifié
    if (!userId) {
      // Utilisateur non connecté: mode lecture seule
      const canReserve = false
      const slots: unknown[] = []

      res.json({
        data: {
          ...event,
          slots,
          canReserve
        }
      })
      return
    }

    // Story 11.5: Admin bypass l'autorisation event_users pour les événements publiés
    // Les admins peuvent prévisualiser la page publique sans être dans event_users
    const userRole = req.user?.role
    if (userRole === 'admin') {
      // Vérifier si l'événement est ouvert (réservations)
      const canReserve = isEventOpen(event.opensAt)
      const slots: unknown[] = []

      res.json({
        data: {
          ...event,
          slots,
          canReserve
        }
      })
      return
    }

    // Utilisateur authentifié: vérifier l'autorisation
    const isAuthorized = await eventUsersService.isUserAuthorizedForEvent(event.id, userId)

    if (!isAuthorized) {
      res.status(403).json({
        error: "Vous n'êtes pas autorisé à accéder à cet événement",
        code: ERROR_CODES.EVENT_ACCESS_DENIED
      })
      return
    }

    // Vérifier si l'événement est ouvert (réservations)
    const canReserve = isEventOpen(event.opensAt)

    // Récupérer les slots de l'événement (pour l'instant vide - Epic 4/6)
    const slots: unknown[] = []

    res.json({
      data: {
        ...event,
        slots,
        canReserve
      }
    })
  } catch (error) {
    // TODO(security): NotPublishedError → 403 leaks draft existence to authenticated probes
    // (NotFoundError → 404 returns when UUID does not exist). The two responses are distinguishable.
    // Story 11.5 admin draft preview is also blocked here because getPublicEventByUuid throws
    // before the admin role check (line 309). Future story should either (a) move the admin
    // bypass into the service, or (b) collapse 403/404 into a single 404 to avoid the leak.
    // See findings F1+F2 from pre-E4 cleanup adversarial review (2026-05-02).
    if (error instanceof NotPublishedError) {
      res.status(403).json({ error: error.message, code: ERROR_CODES.EVENT_NOT_PUBLISHED })
      return
    }
    if (error instanceof NotFoundError) {
      res.status(404).json({ error: 'Événement non trouvé', code: ERROR_CODES.EVENT_NOT_FOUND })
      return
    }
    console.error('Error fetching public event:', error)
    res.status(500).json({ error: 'Erreur lors de la récupération de l\'événement' })
  }
}

/**
 * Vérifie si l'événement est ouvert aux réservations
 * @param opensAt - Date d'ouverture ou null
 * @returns true si ouvert, false si dans le futur
 */
function isEventOpen(opensAt: string | null | undefined): boolean {
  if (!opensAt) return true
  return new Date() >= new Date(opensAt)
}

/**
 * Dupliquer un événement
 * POST /api/admin/events/:id/duplicate
 *
 * Crée une copie de l'événement avec:
 * - Nom suffixé de " (copie)"
 * - État "Brouillon" (is_published = false)
 * - opens_at réinitialisé à NULL
 * - Les créneaux (slots) ne sont PAS copiés
 * - Les utilisateurs autorisés (event_users) ne sont PAS copiés
 */
export const duplicateEvent = async (req: Request, res: Response): Promise<void> => {
  try {
    const duplicatedEvent = await eventService.duplicateEvent(req.params.id)
    res.status(201).json({ data: duplicatedEvent })
  } catch (error) {
    if (error instanceof NotFoundError) {
      res.status(404).json({ error: error.message, code: error.code })
      return
    }
    console.error('Error duplicating event:', error)
    res.status(500).json({ error: 'Erreur lors de la duplication de l\'événement' })
  }
}

/**
 * Supprimer plusieurs événements en masse
 * POST /api/admin/events/bulk-delete
 */
export const bulkDeleteEvents = async (req: Request, res: Response): Promise<void> => {
  const { ids } = req.body

  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id: unknown) => typeof id === 'string')) {
    res.status(400).json({ error: 'ids doit être un tableau non vide de chaînes', code: ERROR_CODES.VALIDATION_ERROR })
    return
  }
  if (ids.length > 100) {
    res.status(400).json({ error: 'ids ne peut contenir plus de 100 éléments', code: ERROR_CODES.VALIDATION_ERROR })
    return
  }
  if (!(ids as string[]).every((id) => UUID_RE.test(id))) {
    res.status(400).json({ error: 'ids doit contenir des UUID valides', code: ERROR_CODES.VALIDATION_ERROR })
    return
  }

  const uniqueIds: string[] = [...new Set(ids as string[])]

  try {
    const result = await eventService.bulkDeleteEvents(uniqueIds)
    res.status(200).json(result)
  } catch (err) {
    console.error('Erreur bulk-delete events:', err)
    res.status(500).json({ error: 'Erreur serveur lors de la suppression groupée des événements' })
  }
}
