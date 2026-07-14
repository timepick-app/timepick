import { z } from 'zod'

// Schéma de création de créneau
export const createSlotSchema = z.object({
  eventId: z.string().uuid('Event ID invalide'),
  startTime: z.coerce.date({ error: () => 'Date de début invalide' })
    .refine((date) => date > new Date(), 'La date de début doit être dans le futur'),
  endTime: z.coerce.date({ error: () => 'Date de fin invalide' }),
  capacity: z.number().int('La capacité doit être un entier')
    .positive('La capacité doit être supérieure à 0')
    .max(100, 'La capacité ne peut pas dépasser 100'),
  description: z.string()
    .max(500, 'La description ne peut pas dépasser 500 caractères')
    .optional(),
}).refine(
  (data) => data.endTime > data.startTime,
  { message: 'L\'heure de fin doit être après l\'heure de début', path: ['endTime'] }
)

// Schéma de mise à jour de créneau
export const updateSlotSchema = z.object({
  startTime: z.coerce.date().optional(),
  endTime: z.coerce.date().optional(),
  capacity: z.number().int().positive().max(100).optional(),
  description: z.string()
    .max(500, 'La description ne peut pas dépasser 500 caractères')
    .optional(),
}).refine(
  (data) => {
    if (data.startTime && data.endTime) {
      return data.endTime > data.startTime
    }
    return true
  },
  { message: 'L\'heure de fin doit être après l\'heure de début' }
)

// Schéma du body de la requête DELETE /api/admin/slots/:id
// Le motif est optionnel et borné à 500 chars (cohérent avec description du
// slot). Trim côté serveur pour normaliser. Plan 5b defer-A L3-data-F.
export const deleteSlotBodySchema = z.object({
  cancellationReason: z.string()
    .trim()
    .max(500, 'Le motif d\'annulation ne peut pas dépasser 500 caractères')
    .optional(),
})

// Types générés depuis les schémas
export type CreateSlotInput = z.infer<typeof createSlotSchema>
export type UpdateSlotInput = z.infer<typeof updateSlotSchema>
