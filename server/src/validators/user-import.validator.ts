import { z } from 'zod'

/** Regex téléphone — miroir de user.validator.ts (cohérence create/update). */
export const PHONE_RE = /^\+?[0-9\s\-]{10,20}$/

/** Colonnes DB importables (hors clé `email`), par nom d'en-tête normalisé (minuscule). */
export const IMPORTABLE_COLUMNS = [
  'first_name',
  'last_name',
  'phone',
  'role',
  'profession',
  'informations',
] as const
export type ImportableColumn = (typeof IMPORTABLE_COLUMNS)[number]

/** Validation de la clé naturelle email. */
export const importEmailSchema = z
  .string()
  .trim()
  .min(1, "L'email est requis")
  .email("Format d'email invalide")

/** Longueurs max par colonne texte (miroir des validators create/update). */
export const MAX_LEN: Record<string, number> = {
  first_name: 100,
  last_name: 100,
  profession: 150,
  informations: 5000,
}
