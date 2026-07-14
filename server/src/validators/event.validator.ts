import { z } from 'zod'
import { sanitizeRichText } from '../utils/sanitize-rich-text'
export { formatZodError } from './zod-utils'

/**
 * Schéma de validation pour la création d'un événement
 * Le nom est requis, non-vide (trim appliqué), min 1 car. après trim, max 200
 * La description est optionnelle
 * opensAt est optionnel : null → NULL persisté ; accepte ISO 8601 et datetime-local naïf (YYYY-MM-DDTHH:mm)
 */
export const createEventSchema = z.object({
  name: z.string()
    .trim()
    .min(1, 'Le nom est requis')
    .max(200, 'Le nom ne peut pas dépasser 200 caractères'),
  description: z.string().max(20000, 'Description trop longue').transform(sanitizeRichText).optional(),
  opensAt: z.coerce.date().nullable().optional()
})

/**
 * Schéma de validation pour la mise à jour d'un événement
 * Tous les champs sont optionnels pour permettre les mises à jour partielles
 *
 * Note: Le nom peut être vide pour les brouillons (drafts).
 * La validation du nom non-vide se fait lors de la publication.
 */
export const updateEventSchema = z.object({
  name: z.string()
    .max(200, 'Le nom ne peut pas dépasser 200 caractères')
    .optional(),
  description: z.string().max(20000, 'Description trop longue').transform(sanitizeRichText).nullable().optional(),
  isPublished: z.boolean().optional(),
  opensAt: z.union([
    z.string().datetime(),
    z.coerce.date(),
    z.null()
  ]).optional()
})

/**
 * Schéma de validation pour la mise à jour de la date d'ouverture
 * Accepte une date ISO 8601 ou null pour supprimer la date
 */
export const updateOpeningDateSchema = z.object({
  opensAt: z.coerce.date().nullable()
})

// Types générés depuis les schémas Zod
export type CreateEventInput = z.infer<typeof createEventSchema>
export type UpdateEventInput = z.infer<typeof updateEventSchema>

