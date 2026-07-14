import { Request, Response } from 'express'
import { z } from 'zod'
import { cancellationNotificationService } from '../services/cancellation-notification.service'

// `eventId` optionnel et validé en UUID : absent = global, présent = un seul
// événement. Le cast SQL `$1::uuid` exige un UUID bien formé — on rejette en
// amont (400) plutôt que de laisser remonter une erreur de cast Postgres (500).
const eventIdQuerySchema = z.object({
  eventId: z.string().uuid('Event ID invalide').optional(),
})

export const cancellationNotificationsController = {
  /**
   * Lister les notifications d'annulation en attente, groupées
   * event › créneau › destinataire, avec compteurs.
   * GET /api/admin/cancellation-notifications?eventId=<optionnel>
   *
   * Sans `eventId` = global ; avec = un seul événement. Un événement inexistant
   * (ou sans réservation en attente) renvoie simplement `{ pending: 0, events: [] }`
   * — l'absence de notification en attente est un état valide, pas une erreur.
   */
  async getPending(req: Request, res: Response): Promise<void> {
    try {
      const { eventId } = eventIdQuerySchema.parse({
        eventId: (req.query.eventId as string | undefined) || undefined,
      })
      const data = await cancellationNotificationService.getPending(eventId)
      res.json({ data })
    } catch (error: any) {
      if (error.name === 'ZodError') {
        res.status(400).json({ error: error.issues[0].message })
      } else {
        console.error('Error fetching cancellation notifications:', error)
        res.status(500).json({ error: 'Erreur lors de la récupération des notifications en attente' })
      }
    }
  },

  /**
   * Renvoyer les notifications d'annulation en attente (groupé, idempotent).
   * POST /api/admin/cancellation-notifications/resend
   * Body optionnel : { eventId?: string } — absent = global, présent = un seul
   * événement.
   *
   * Ne cible jamais une réservation déjà notifiée : un re-clic à 0 en attente
   * renvoie `{ sent: 0, failed: 0 }` sans aucun envoi.
   */
  async resend(req: Request, res: Response): Promise<void> {
    try {
      const { eventId } = eventIdQuerySchema.parse(req.body ?? {})
      const data = await cancellationNotificationService.resend(eventId)
      res.json({ data })
    } catch (error: any) {
      if (error.name === 'ZodError') {
        res.status(400).json({ error: error.issues[0].message })
      } else {
        console.error('Error resending cancellation notifications:', error)
        res.status(500).json({ error: 'Erreur lors du renvoi des notifications' })
      }
    }
  },
}
