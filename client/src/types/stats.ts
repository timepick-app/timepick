/**
 * Type EventStats pour les statistiques d'événement
 * Représente les statistiques de remplissage d'un événement
 */
export interface EventStats {
  eventId: string
  totalSlots: number
  filledSlots: number
  vacantSlots: number
  /** Taux de remplissage en pourcentage (0-100), pas un décimal (0-1) */
  fillRate: number
  totalCapacity: number
  totalBookings: number
}
