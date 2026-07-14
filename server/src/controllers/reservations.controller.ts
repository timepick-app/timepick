import { Request, Response } from 'express'
import { reservationService } from '../services/reservation.service'
import { NotFoundError } from '../errors/NotFoundError'
import { ConflictError } from '../errors/ConflictError'
import { createReservationSchema } from '../validators/reservation.validator'

/**
 * Contrôleur pour les routes de réservations
 * Ces routes permettent aux utilisateurs authentifiés de réserver des créneaux
 *
 * Endpoints:
 * - POST /api/public/reservations - Créer une réservation
 * - DELETE /api/public/reservations/:id - Annuler une réservation
 * - GET /api/public/reservations - Lister mes réservations
 */

/**
 * Créer une nouvelle réservation
 * POST /api/public/reservations
 *
 * Corps de la requête:
 * {
 *   "slotId": "uuid"
 * }
 *
 * Réponses:
 * - 201: Réservation créée avec succès
 * - 400: Erreur de validation (slotId manquant ou invalide)
 * - 401: Non authentifié
 * - 404: Créneau non trouvé
 * - 409: Conflit (créneau complet ou déjà réservé)
 */
export const createReservation = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId
    if (!userId) {
      res.status(401).json({ error: 'Authentification requise' })
      return
    }

    // Validation avec Zod
    const validationResult = createReservationSchema.safeParse(req.body)
    if (!validationResult.success) {
      res.status(400).json({
        error: 'Données invalides',
        details: validationResult.error.issues.map(e => ({ field: e.path[0], message: e.message }))
      })
      return
    }

    const { slotId } = validationResult.data

    // Créer la réservation via le service
    const booking = await reservationService.createReservation(slotId, userId)

    res.status(201).json({
      data: booking,
      message: 'Réservation confirmée'
    })
  } catch (error) {
    if (error instanceof NotFoundError) {
      res.status(404).json({ error: error.message })
      return
    }
    if (error instanceof ConflictError) {
      res.status(409).json({
        error: {
          code: error.code,
          message: error.message
        }
      })
      return
    }
    console.error('[Reservation] Error creating reservation:', error)
    res.status(500).json({ error: 'Erreur lors de la création de la réservation' })
  }
}

/**
 * Annuler une réservation
 * DELETE /api/public/reservations/:id
 *
 * L'utilisateur ne peut annuler que ses propres réservations
 *
 * Réponses:
 * - 200: Réservation annulée
 * - 401: Non authentifié
 * - 404: Réservation non trouvée
 */
export const cancelReservation = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId
    if (!userId) {
      res.status(401).json({ error: 'Authentification requise' })
      return
    }

    const { id } = req.params

    await reservationService.cancelReservation(id, userId)

    res.json({ message: 'Réservation annulée' })
  } catch (error) {
    if (error instanceof NotFoundError) {
      res.status(404).json({ error: error.message })
      return
    }
    console.error('[Reservation] Error canceling reservation:', error)
    res.status(500).json({ error: 'Erreur lors de l\'annulation de la réservation' })
  }
}

/**
 * Lister les réservations de l'utilisateur authentifié
 * GET /api/public/reservations
 *
 * Réponses:
 * - 200: Liste des réservations avec détails des créneaux
 * - 401: Non authentifié
 */
export const getMyReservations = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId
    if (!userId) {
      res.status(401).json({ error: 'Authentification requise' })
      return
    }

    const reservations = await reservationService.getUserReservations(userId)

    res.json({ data: reservations })
  } catch (error) {
    console.error('[Reservation] Error fetching reservations:', error)
    res.status(500).json({ error: 'Erreur lors de la récupération des réservations' })
  }
}

/**
 * Annuler une réservation par slot_id
 * DELETE /api/public/reservations/by-slot/:slotId
 *
 * Alternative pour annuler en utilisant le slotId au lieu du bookingId
 * Plus intuitif pour l'utilisateur qui voit le créneau dans l'UI
 *
 * NOTE: This endpoint is idempotent - returns 200 whether a reservation existed or not.
 * The desired end state (no reservation for this user/slot) is achieved either way.
 *
 * Réponses:
 * - 200: Réservation annulée (ou aucune réservation à annuler - idempotent)
 * - 401: Non authentifié
 * - 500: Erreur serveur
 */
export const cancelReservationBySlot = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId
    if (!userId) {
      res.status(401).json({ error: 'Authentification requise' })
      return
    }

    const { slotId } = req.params

    await reservationService.cancelReservationBySlot(slotId, userId)

    // Always return 200 - idempotent operation (desired end state: no reservation)
    res.json({ message: 'Réservation annulée' })
  } catch (error) {
    console.error('[Reservation] Error canceling reservation by slot:', error)
    res.status(500).json({ error: 'Erreur lors de l\'annulation de la réservation' })
  }
}
