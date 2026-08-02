import type { Request, Response } from 'express'
import { invitationsService } from '../services/invitations.service'
import { sendInvitationsSchema, formatZodError } from '../validators/invitations.validator'
import { NotFoundError } from '../errors/NotFoundError'
import { z } from 'zod'
import { ERROR_CODES } from '@timepick/shared'

/**
 * Envoie les invitations aux utilisateurs sélectionnés pour un événement
 * POST /api/admin/events/:id/invitations/send
 * Body: { userIds: string[] }
 */
export const sendInvitations = async (req: Request, res: Response): Promise<void> => {
  try {
    const input = sendInvitationsSchema.parse(req.body)

    const result = await invitationsService.sendInvitations(
      req.params.id,
      input.userIds
    )

    res.json({
      data: {
        sent: result.sent,
        failed: result.failed,
        results: result.results,
        message: `${result.sent} invitation(s) envoyée(s) avec succès${result.failed > 0 ? `, ${result.failed} échec(s)` : ''}`
      }
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: formatZodError(error), code: ERROR_CODES.VALIDATION_ERROR })
      return
    }
    if (error instanceof NotFoundError) {
      res.status(404).json({ error: error.message, code: error.code })
      return
    }
    console.error('Error sending invitations:', error)
    res.status(500).json({ error: 'Erreur lors de l\'envoi des invitations' })
  }
}

/**
 * Récupère l'historique des invitations pour un événement
 * GET /api/admin/events/:id/invitations
 */
export const getEventInvitations = async (req: Request, res: Response): Promise<void> => {
  try {
    const invitations = await invitationsService.getEventInvitations(req.params.id)
    res.json({ data: invitations })
  } catch (error) {
    if (error instanceof NotFoundError) {
      res.status(404).json({ error: error.message, code: error.code })
      return
    }
    console.error('Error getting invitations:', error)
    res.status(500).json({ error: 'Erreur lors de la récupération des invitations' })
  }
}

/**
 * Récupère le statut d'invitation de tous les utilisateurs sélectionnés pour un événement
 * GET /api/admin/events/:id/invitations/status
 */
export const getEventUsersInvitationStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const users = await invitationsService.getEventUsersInvitationStatus(req.params.id)
    res.json({ data: users })
  } catch (error) {
    if (error instanceof NotFoundError) {
      res.status(404).json({ error: error.message, code: error.code })
      return
    }
    console.error('Error getting invitation status:', error)
    res.status(500).json({ error: 'Erreur lors de la récupération du statut des invitations' })
  }
}

/**
 * Renvoie une invitation à un utilisateur spécifique pour un événement
 * POST /api/admin/events/:id/invitations/:userId/resend
 */
export const resendInvitation = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await invitationsService.resendInvitation(
      req.params.id,
      req.params.userId
    )

    res.json({
      data: {
        sent: result.sent,
        email: result.email,
        sentAt: result.sentAt.toISOString(),
        userId: result.userId,
        eventId: result.eventId
      }
    })
  } catch (error) {
    if (error instanceof NotFoundError) {
      res.status(404).json({ error: error.message, code: error.code })
      return
    }
    console.error('Error resending invitation:', error)
    res.status(500).json({ error: 'Erreur lors du renvoi de l\'invitation' })
  }
}

/**
 * Relance les invitations sans réponse depuis plus de 3 jours pour un événement
 * POST /api/admin/events/:id/invitations/resend-unanswered
 * Enveloppe { data } (alignée sur les handlers frères ; le client lit data.data) :
 *   { data: { targeted, resent, failed } }
 */
export const resendUnanswered = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await invitationsService.resendUnanswered(req.params.id)

    res.json({ data: result })
  } catch (error) {
    if (error instanceof NotFoundError) {
      res.status(404).json({ error: error.message, code: error.code })
      return
    }
    console.error('Error resending unanswered invitations:', error)
    res.status(500).json({ error: 'Erreur lors de la relance des invitations sans réponse' })
  }
}

/**
 * Vérifie si un événement peut recevoir des invitations
 * GET /api/admin/events/:id/invitations/eligibility
 */
export const checkInvitationEligibility = async (req: Request, res: Response): Promise<void> => {
  try {
    const validation = await invitationsService.validateEventForInvitations(req.params.id)

    if (!validation.canSend) {
      res.status(400).json({
        error: {
          code: validation.errorCode,
          message: validation.errorMessage
        }
      })
      return
    }

    res.json({ data: { canSend: true } })
  } catch (error) {
    if (error instanceof NotFoundError) {
      res.status(404).json({ error: error.message, code: error.code })
      return
    }
    console.error('Error checking invitation eligibility:', error)
    res.status(500).json({ error: 'Erreur lors de la vérification de l\'éligibilité' })
  }
}
