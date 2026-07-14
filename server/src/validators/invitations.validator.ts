import { z } from 'zod'
export { formatZodError } from './zod-utils'

/**
 * Schéma de validation pour l'envoi d'invitations
 * userIds doit être un tableau d'UUIDs valides avec au moins un utilisateur
 */
export const sendInvitationsSchema = z.object({
  userIds: z.array(z.string().uuid('Format d\'ID utilisateur invalide'))
    .min(1, 'Au moins un utilisateur est requis')
})

