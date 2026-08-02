import { Request, Response } from 'express'
import { slotService } from '../services/slot.service'
import { createSlotSchema, updateSlotSchema, deleteSlotBodySchema } from '../validators/slot.validator'
import { ERROR_CODES } from '@timepick/shared'

export const slotsController = {
  /**
   * Créer un nouveau créneau pour un événement
   * POST /api/admin/events/:eventId/slots
   */
  async createSlot(req: Request, res: Response): Promise<void> {
    try {
      const input = createSlotSchema.parse({
        ...req.body,
        eventId: req.params.eventId
      })
      const slot = await slotService.createSlot(input)
      res.status(201).json({ data: slot })
    } catch (error: any) {
      if (error.name === 'ZodError') {
        res.status(400).json({ error: error.issues[0].message, code: ERROR_CODES.VALIDATION_ERROR })
      } else {
        console.error('Error creating slot:', error)
        res.status(500).json({ error: 'Erreur lors de la création du créneau' })
      }
    }
  },

  /**
   * Lister tous les créneaux d'un événement
   * GET /api/admin/events/:eventId/slots
   */
  async getEventSlots(req: Request, res: Response): Promise<void> {
    try {
      // Surface admin (arbitrage #1) : tous les créneaux, annulés inclus.
      const slots = await slotService.getSlotsByEvent(req.params.eventId, { includeCancelled: true })
      res.json({ data: slots })
    } catch (error: any) {
      console.error('Error fetching slots:', error)
      res.status(500).json({ error: 'Erreur lors de la récupération des créneaux' })
    }
  },

  /**
   * Récupérer un créneau par ID
   * GET /api/admin/slots/:id
   */
  async getSlotById(req: Request, res: Response): Promise<void> {
    try {
      const slot = await slotService.getSlotById(req.params.id)
      res.json({ data: slot })
    } catch (error: any) {
      if (error.name === 'NotFoundError') {
        res.status(404).json({ error: error.message, code: error.code })
      } else {
        console.error('Error fetching slot:', error)
        res.status(500).json({ error: 'Erreur lors de la récupération du créneau' })
      }
    }
  },

  /**
   * Mettre à jour un créneau
   * PUT /api/admin/slots/:id
   */
  async updateSlot(req: Request, res: Response): Promise<void> {
    try {
      const input = updateSlotSchema.parse(req.body)
      // notifyBookings : intention d'envoi, hors schéma domaine (strippé par Zod).
      // Défaut true ; l'admin doit explicitement passer false pour désactiver.
      const notify = req.body?.notifyBookings !== false
      const result = await slotService.updateSlot(req.params.id, input, { notify })
      res.json({ data: result.slot, notified: result.notified, failed: result.failed })
    } catch (error: any) {
      if (error.name === 'ZodError') {
        res.status(400).json({ error: error.issues[0].message, code: ERROR_CODES.VALIDATION_ERROR })
      } else if (error.name === 'NotFoundError') {
        res.status(404).json({ error: error.message, code: error.code })
      } else if (error.name === 'ConflictError') {
        res.status(409).json({ error: error.message, code: error.code })
      } else {
        console.error('Error updating slot:', error)
        res.status(500).json({ error: 'Erreur lors de la mise à jour du créneau' })
      }
    }
  },

  /**
   * Annuler un créneau, conditionnellement au nombre d'inscrits.
   * DELETE /api/admin/slots/:id
   * Body optionnel : { cancellationReason?: string } — motif inclus dans le mail
   * d'annulation (cas réservé uniquement ; ignoré si le créneau est vide).
   *
   * Délègue à `slotService.cancelSlot` : 0 inscrit → suppression définitive (aucun
   * email) ; ≥1 inscrit → soft-delete + notifications (spec-conditional-slot-
   * cancellation).
   *
   * Réponses : 200 + { data: { cancelled, hadReservations, notified, failed } }
   * (supprimé OU annulé — `failed > 0` signale au client une notification non
   * envoyée à renvoyer), 404 (introuvable — incl. 2ᵉ DELETE d'un créneau vide
   * déjà supprimé), 409 (créneau réservé déjà annulé — décision #9).
   */
  async deleteSlot(req: Request, res: Response): Promise<void> {
    try {
      const { cancellationReason } = deleteSlotBodySchema.parse(req.body ?? {})
      const result = await slotService.cancelSlot(req.params.id, cancellationReason)
      res.status(200).json({ data: result })
    } catch (error: any) {
      if (error.name === 'ZodError') {
        res.status(400).json({ error: error.issues[0].message, code: ERROR_CODES.VALIDATION_ERROR })
      } else if (error.name === 'NotFoundError') {
        res.status(404).json({ error: error.message, code: error.code })
      } else if (error.name === 'ConflictError') {
        res.status(409).json({ error: error.message, code: error.code })
      } else {
        console.error('Error cancelling slot:', error)
        res.status(500).json({ error: "Erreur lors de l'annulation du créneau" })
      }
    }
  },
}

