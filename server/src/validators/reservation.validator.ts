import { z } from 'zod'

/**
 * Schémas de validation pour les réservations
 * Utilise Zod pour la validation des requêtes API
 */

/**
 * Schema pour créer une réservation
 */
export const createReservationSchema = z.object({
  slotId: z.string().uuid('Format UUID invalide pour slotId'),
})
