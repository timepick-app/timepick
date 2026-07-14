import { z } from 'zod'
export { formatZodError } from './zod-utils'

/**
 * Schéma de validation pour définir les utilisateurs d'un événement
 * userIds doit être un tableau d'UUIDs valides (tableau vide autorisé pour vider la sélection)
 */
export const setEventUsersSchema = z.object({
  userIds: z.array(z.string().uuid('Format d\'ID utilisateur invalide'))
    .min(0, 'Le tableau ne peut pas être vide (utilisez un tableau vide pour vider la sélection)')
})

