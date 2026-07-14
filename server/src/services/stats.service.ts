import { query } from '../db'
import { NotFoundError } from '../errors/NotFoundError'

/**
 * Type EventStats pour les réponses API (camelCase)
 * Représente les statistiques de remplissage d'un événement
 */
export interface EventStats {
  eventId: string
  totalSlots: number
  filledSlots: number
  vacantSlots: number
  fillRate: number
  totalCapacity: number
  totalBookings: number
}

/**
 * Service de gestion des statistiques
 * Calcule les taux de remplissage et métriques pour les événements
 */
export const statsService = {
  /**
   * Récupérer les statistiques d'un événement
   *
   * Calcule:
   * - totalSlots: nombre total de créneaux
   * - filledSlots: nombre de créneaux avec au moins une réservation
   * - vacantSlots: nombre de créneaux sans réservation
   * - fillRate: pourcentage de remplissage (totalBookings / totalCapacity * 100)
   * - totalCapacity: capacité totale (somme des capacités de tous les créneaux)
   * - totalBookings: nombre total de réservations
   *
   * @param eventId - UUID de l'événement
   * @returns Les statistiques de l'événement
   * @throws NotFoundError si l'événement n'existe pas
   */
  async getEventStats(eventId: string): Promise<EventStats> {
    // Vérifier que l'événement existe
    const eventCheck = await query(
      'SELECT id FROM events WHERE id = $1',
      [eventId]
    )

    if (eventCheck.rows.length === 0) {
      throw new NotFoundError('Événement non trouvé')
    }

    // Calculer les statistiques
    const stats = await query(
      `SELECT
        COUNT(s.id) as total_slots,
        COUNT(DISTINCT b.slot_id) as filled_slots,
        COALESCE(SUM(s.capacity), 0) as total_capacity,
        COALESCE(COUNT(b.id), 0) as total_bookings
       FROM slots s
       LEFT JOIN bookings b ON s.id = b.slot_id
       WHERE s.event_id = $1`,
      [eventId]
    )

    const row = stats.rows[0]
    const totalSlots = parseInt(row.total_slots) || 0
    const filledSlots = parseInt(row.filled_slots) || 0
    const totalCapacity = parseInt(row.total_capacity) || 0
    const totalBookings = parseInt(row.total_bookings) || 0
    const vacantSlots = totalSlots - filledSlots

    // Calculer le taux de remplissage
    // Option 2 (recommandée): Réservations / Capacité totale
    // Si pas de capacité, le taux est 0
    const fillRate = totalCapacity > 0 ? Math.round((totalBookings / totalCapacity) * 100) : 0

    return {
      eventId,
      totalSlots,
      filledSlots,
      vacantSlots,
      fillRate,
      totalCapacity,
      totalBookings,
    }
  },

  /**
   * Récupérer les statistiques de tous les événements ou d'un événement spécifique
   *
   * @param eventId - UUID de l'événement (optionnel). Si fourni, retourne uniquement
   *                  les stats de cet événement dans un tableau. Si null/undefined,
   *                  retourne les stats de tous les événements.
   * @returns Liste des statistiques par événement (1 élément si eventId fourni,
   *          sinon tous les événements)
   * @throws NotFoundError si eventId est fourni mais l'événement n'existe pas
   */
  async getAllEventsStats(eventId?: string): Promise<EventStats[]> {
    // Si un eventId est fourni, on retourne uniquement les stats de cet événement
    if (eventId) {
      const eventStats = await this.getEventStats(eventId)
      return [eventStats]
    }

    // Sinon, on retourne toutes les stats (comportement par défaut)
    const stats = await query(
      `SELECT
        e.id as event_id,
        COUNT(s.id) as total_slots,
        COUNT(DISTINCT b.slot_id) as filled_slots,
        COALESCE(SUM(s.capacity), 0) as total_capacity,
        COALESCE(COUNT(b.id), 0) as total_bookings
       FROM events e
       LEFT JOIN slots s ON s.event_id = e.id
       LEFT JOIN bookings b ON s.id = b.slot_id
       GROUP BY e.id
       ORDER BY e.created_at DESC`
    )

    return stats.rows.map((row: Record<string, unknown>) => {
      const totalSlots = parseInt(row.total_slots as string) || 0
      const filledSlots = parseInt(row.filled_slots as string) || 0
      const totalCapacity = parseInt(row.total_capacity as string) || 0
      const totalBookings = parseInt(row.total_bookings as string) || 0
      const vacantSlots = totalSlots - filledSlots
      // Option 2 (recommandée): Réservations / Capacité totale
      const fillRate = totalCapacity > 0 ? Math.round((totalBookings / totalCapacity) * 100) : 0

      return {
        eventId: row.event_id as string,
        totalSlots,
        filledSlots,
        vacantSlots,
        fillRate,
        totalCapacity,
        totalBookings,
      }
    }) as EventStats[]
  },
}
