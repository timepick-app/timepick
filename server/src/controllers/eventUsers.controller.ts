import type { Request, Response } from 'express'
import { z } from 'zod'
import { eventUsersService } from '../services/eventUsers.service'
import { setEventUsersSchema, formatZodError } from '../validators/eventUsers.validator'
import { NotFoundError } from '../errors/NotFoundError'

/**
 * Définir les utilisateurs autorisés pour un événement
 * Remplace complètement la sélection existante
 * POST /api/admin/events/:id/users
 * Body: { userIds: string[] }
 */
export const setEventUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    const input = setEventUsersSchema.parse(req.body)
    // Dédoublonner les userIds pour avoir le compte réel
    const uniqueUserIds = [...new Set(input.userIds)]
    await eventUsersService.setEventUsers(req.params.id, uniqueUserIds)
    res.json({ data: { success: true, count: uniqueUserIds.length } })
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: formatZodError(error) })
      return
    }
    if (error instanceof NotFoundError) {
      res.status(404).json({ error: error.message })
      return
    }
    console.error('Error setting event users:', error)
    res.status(500).json({ error: 'Erreur lors de la mise à jour des utilisateurs' })
  }
}

/**
 * Obtenir la liste des utilisateurs autorisés pour un événement
 * GET /api/admin/events/:id/users
 */
export const getEventUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    const users = await eventUsersService.getEventUsers(req.params.id)
    res.json({ data: users })
  } catch (error) {
    console.error('Error fetching event users:', error)
    res.status(500).json({ error: 'Erreur lors de la récupération des utilisateurs' })
  }
}

/**
 * Ajouter un utilisateur à la sélection
 * POST /api/admin/events/:id/users/:userId
 */
export const addEventUser = async (req: Request, res: Response): Promise<void> => {
  try {
    await eventUsersService.addEventUser(req.params.id, req.params.userId)
    res.json({ data: { success: true } })
  } catch (error) {
    if (error instanceof NotFoundError) {
      res.status(404).json({ error: error.message })
      return
    }
    console.error('Error adding event user:', error)
    res.status(500).json({ error: "Erreur lors de l'ajout de l'utilisateur" })
  }
}

/**
 * Retirer un utilisateur de la sélection
 * DELETE /api/admin/events/:id/users/:userId
 */
export const removeEventUser = async (req: Request, res: Response): Promise<void> => {
  try {
    await eventUsersService.removeEventUser(req.params.id, req.params.userId)
    res.json({ data: { success: true } })
  } catch (error) {
    if (error instanceof NotFoundError) {
      res.status(404).json({ error: error.message })
      return
    }
    console.error('Error removing event user:', error)
    res.status(500).json({ error: 'Erreur lors du retrait de l\'utilisateur' })
  }
}
