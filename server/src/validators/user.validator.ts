import { z } from 'zod'
export { formatZodError } from './zod-utils'

export const createUserSchema = z.object({
  email: z
    .string({ error: (issue) => issue.input === undefined ? "L'email est requis" : undefined })
    .min(1, "L'email est requis")
    .email("Format d'email invalide"),
  first_name: z
    .string({ error: (issue) => issue.input === undefined ? 'Le prénom est requis' : undefined })
    .min(1, 'Le prénom est requis')
    .max(100, 'Le prénom ne peut pas dépasser 100 caractères'),
  last_name: z
    .string()
    .max(100, 'Le nom ne peut pas dépasser 100 caractères')
    .optional()
    .nullable(),
  profession: z
    .string()
    .max(150, 'La profession ne peut pas dépasser 150 caractères')
    .optional()
    .nullable(),
  informations: z
    .string()
    .max(5000, 'Les informations ne peuvent pas dépasser 5000 caractères')
    .optional()
    .nullable(),
  phone: z
    .string()
    .regex(/^\+?[0-9\s\-]{10,20}$/, 'Format de téléphone invalide')
    .optional()
    .nullable(),
  role: z
    .enum(['user', 'admin'], {
      error: () => 'Le rôle doit être "user" ou "admin"'
    })
    .default('user')
})

export const updateUserSchema = z.object({
  first_name: z
    .string()
    .min(1, 'Le prénom ne peut pas être vide')
    .max(100, 'Le prénom ne peut pas dépasser 100 caractères')
    .optional(),
  last_name: z
    .string()
    .max(100, 'Le nom ne peut pas dépasser 100 caractères')
    .optional()
    .nullable(),
  profession: z
    .string()
    .max(150, 'La profession ne peut pas dépasser 150 caractères')
    .optional()
    .nullable(),
  informations: z
    .string()
    .max(5000, 'Les informations ne peuvent pas dépasser 5000 caractères')
    .optional()
    .nullable(),
  phone: z
    .string()
    .regex(/^\+?[0-9\s\-]{10,20}$/, 'Format de téléphone invalide')
    .optional()
    .nullable(),
  role: z
    .enum(['user', 'admin'], {
      error: () => 'Le rôle doit être "user" ou "admin"'
    })
    .optional()
})

// Dérive d'updateUserSchema en retirant 'role' (protection mass-assignment).
// 'email' est déjà absent d'updateUserSchema (jamais modifiable par qui que ce
// soit hors flux admin dédié). Utilisé par `PATCH /api/me/profile` : un membre
// ne peut modifier QUE first_name, last_name, phone, profession, informations.
// Les clés non déclarées (role, email, id…) sont stripées par Zod `.omit` +
// l'absence dans le schéma objet → ignorées silencieusement côté parse.
export const patchMeProfileSchema = updateUserSchema.omit({ role: true })


