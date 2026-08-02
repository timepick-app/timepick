import { z, ZodError } from 'zod'
import { ERROR_CODES, type ErrorCode } from '@timepick/shared'
import { formatZodError } from './zod-utils'

/**
 * Limites de l'intervalle de polling
 */
const MIN_POLLING_INTERVAL = 10000 // 10 secondes
const MAX_POLLING_INTERVAL = 120000 // 120 secondes (2 minutes)

/**
 * Limites des TTL pour les magic links (en secondes)
 */
const MIN_MAGIC_LINK_TTL = 60 // 1 minute
const MAX_ADMIN_TTL = 7 * 24 * 60 * 60 // 7 jours
const MAX_USER_TTL = 30 * 24 * 60 * 60 // 30 jours

/**
 * Limites du TTL de session (en secondes)
 *
 * NOTE: Ces limites sont dupliquées dans le frontend (useUpdateMagicLinkConfig.ts)
 * pour fournir une validation locale immédiate et améliorer l'UX. Si ces limites
 * changent, elles doivent être mises à jour des deux côtés.
 */
const MIN_SESSION_TTL = 5 * 60 // 5 minutes
const MAX_SESSION_TTL = 24 * 60 * 60 // 24 heures

/**
 * Schéma de validation pour la mise à jour de l'intervalle de polling
 * - 0 pour désactiver le polling
 * - Entre 10000 et 120000 pour activer le polling
 */
export const updatePollingIntervalSchema = z.object({
  interval: z.number({
    error: (issue) => issue.input === undefined ? "L'intervalle est requis" : "L'intervalle doit être un nombre"
  })
    .int("L'intervalle doit être un nombre entier")
    .min(0, "L'intervalle ne peut pas être négatif")
    .max(MAX_POLLING_INTERVAL, `L'intervalle ne peut pas dépasser ${MAX_POLLING_INTERVAL} millisecondes`)
    .refine((val) => val === 0 || val >= MIN_POLLING_INTERVAL, {
      message: `L'intervalle doit être 0 (désactivé) ou au moins ${MIN_POLLING_INTERVAL} millisecondes`
    })
})

/**
 * Schéma de validation pour la mise à jour de la configuration des magic links
 * - adminTTL: 1min à 7j (pour les administrateurs)
 * - userTTL: 1min à 24h (pour les utilisateurs standards)
 * - sessionTTL: 5min à 24h (pour la durée de session après connexion)
 */
export const updateMagicLinkConfigSchema = z.object({
  adminTTL: z.number({
    error: (issue) => issue.input === undefined ? "Le TTL admin est requis" : "Le TTL admin doit être un nombre"
  })
    .int("Le TTL admin doit être un nombre entier de secondes")
    .min(MIN_MAGIC_LINK_TTL, `Le TTL admin doit être d'au moins ${MIN_MAGIC_LINK_TTL} secondes (1 minute)`)
    .max(MAX_ADMIN_TTL, `Le TTL admin ne peut pas dépasser ${MAX_ADMIN_TTL} secondes (${Math.round(MAX_ADMIN_TTL / 86400)} jours)`),
  userTTL: z.number({
    error: (issue) => issue.input === undefined ? "Le TTL user est requis" : "Le TTL user doit être un nombre"
  })
    .int("Le TTL user doit être un nombre entier de secondes")
    .min(MIN_MAGIC_LINK_TTL, `Le TTL user doit être d'au moins ${MIN_MAGIC_LINK_TTL} secondes (1 minute)`)
    .max(MAX_USER_TTL, `Le TTL user ne peut pas dépasser ${MAX_USER_TTL} secondes (30 jours)`),
  sessionTTL: z.number({
    error: (issue) => issue.input === undefined ? "Le TTL de session est requis" : "Le TTL de session doit être un nombre"
  })
    .int("Le TTL de session doit être un nombre entier de secondes")
    .min(MIN_SESSION_TTL, `Le TTL de session doit être d'au moins ${MIN_SESSION_TTL} secondes (5 minutes)`)
    .max(MAX_SESSION_TTL, `Le TTL de session ne peut pas dépasser ${MAX_SESSION_TTL} secondes (24 heures)`)
})

/**
 * Format validation/API errors for controller responses.
 * Handles ZodError → VALIDATION_ERROR (400), others → INTERNAL_ERROR (500).
 */
export function formatApiError(error: unknown, fallbackMessage = 'Erreur lors du traitement'): { code: ErrorCode; message: string } {
  if (error instanceof ZodError) {
    return {
      code: ERROR_CODES.VALIDATION_ERROR,
      message: formatZodError(error)
    }
  }
  return {
    code: ERROR_CODES.INTERNAL_ERROR,
    message: fallbackMessage
  }
}
