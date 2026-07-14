import type { Request, Response } from 'express'
import { statsService } from '../services/stats.service'
import { NotFoundError } from '../errors/NotFoundError'

/**
 * Récupérer les statistiques de tous les événements
 * GET /api/admin/stats
 *
 * Supporte le filtrage par événement via query param ?event_id=:id
 * Retourne une liste des statistiques pour tous les événements ou un seul
 */
export const getAllEventsStats = async (req: Request, res: Response): Promise<void> => {
  try {
    // Extraire le query param event_id (optionnel)
    const { event_id } = req.query

    // Convertir en string ou undefined
    const eventId = typeof event_id === 'string' && event_id.trim() !== ''
      ? event_id.trim()
      : undefined

    const stats = await statsService.getAllEventsStats(eventId)
    res.json({ data: stats })
  } catch (error) {
    // Si c'est une NotFoundError (événement non trouvé), retourner 404
    if (error instanceof NotFoundError) {
      res.status(404).json({ error: error.message })
      return
    }
    console.error('Error fetching all events stats:', error)
    res.status(500).json({ error: 'Erreur lors de la récupération des statistiques' })
  }
}
