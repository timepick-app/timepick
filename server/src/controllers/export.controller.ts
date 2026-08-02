import { Request, Response } from 'express'
import { exportService } from '../services/export.service'
import { NotFoundError } from '../errors/NotFoundError'

/**
 * Contrôleur pour les routes d'export
 *
 * Endpoints:
 * - GET /api/admin/events/:id/export/reservations - Export CSV des réservations d'un événement
 */

/**
 * Exporter les réservations d'un événement en CSV
 * GET /api/admin/events/:id/export/reservations
 *
 * Génère un fichier CSV avec toutes les réservations de l'événement,
 * incluant les détails des utilisateurs et des créneaux.
 *
 * Format CSV:
 * - Encodage: UTF-8 avec BOM (pour Excel)
 * - Délimiteur: point-virgule (;)
 * - Dates: format français (JJ/MM/AAAA HH:MM)
 *
 * Colonnes:
 * - Nom du participant
 * - Email
 * - Téléphone
 * - Date de réservation
 * - Créneau réservé (date, heure)
 * - Événement
 *
 * Query params:
 * - id: UUID de l'événement (dans l'URL)
 *
 * Réponses:
 * - 200: Fichier CSV généré avec succès
 * - 401: Non authentifié
 * - 403: Non autorisé (pas admin)
 * - 404: Événement non trouvé
 * - 500: Erreur serveur
 */
export const exportEventReservations = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params

    // Générer le CSV via le service
    const { csvContent, filename } = await exportService.exportEventReservationsCSV(id)

    // Envoyer le fichier CSV avec les bons headers
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.send(csvContent)
  } catch (error) {
    if (error instanceof NotFoundError) {
      res.status(404).json({ error: error.message, code: error.code })
      return
    }
    console.error('[Export] Error exporting reservations:', error)
    res.status(500).json({ error: 'Erreur lors de la génération du CSV' })
  }
}

