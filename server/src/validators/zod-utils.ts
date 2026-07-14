import { z } from 'zod'

/** Retourne le message de la première erreur Zod, ou un fallback générique. */
export const formatZodError = (error: z.ZodError): string => {
  const firstError = error.issues[0]
  return firstError?.message || 'Données invalides'
}
