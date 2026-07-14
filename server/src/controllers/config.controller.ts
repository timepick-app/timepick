import type { Request, Response } from 'express'
import { configService } from '../services/config.service'
import { updatePollingIntervalSchema, updateMagicLinkConfigSchema, formatApiError } from '../validators/config.validator'

/**
 * Récupérer la configuration de polling
 * GET /api/admin/config/polling-interval
 *
 * Retourne l'intervalle de polling configuré en millisecondes.
 * La valeur par défaut est 30000 (30 secondes).
 * La valeur 0 indique que le polling est désactivé.
 */
export const getPollingInterval = async (req: Request, res: Response): Promise<void> => {
  try {
    const config = await configService.getPollingInterval()
    res.json({ data: config })
  } catch (error) {
    console.error('Error fetching polling config:', error)
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Erreur lors de la récupération de la configuration' } })
  }
}

/**
 * Mettre à jour la configuration de polling
 * PUT /api/admin/config/polling-interval
 *
 * Permet de modifier l'intervalle de polling.
 * Valeurs acceptées:
 * - 0: désactive le polling
 * - 10000 à 120000: active le polling avec cet intervalle (en ms)
 *
 * Body:
 * {
 *   "interval": number
 * }
 */
export const updatePollingInterval = async (req: Request, res: Response): Promise<void> => {
  try {
    // Validation avec Zod
    const validatedData = updatePollingIntervalSchema.parse(req.body)

    const config = await configService.updatePollingInterval(validatedData.interval)
    res.json({ data: config })
  } catch (error) {
    const validationError = formatApiError(error, 'Erreur lors de la mise à jour de la configuration')
    const statusCode = validationError.code === 'VALIDATION_ERROR' ? 400 : 500
    res.status(statusCode).json({ error: validationError })
  }
}

/**
 * Récupérer la configuration des magic links
 * GET /api/admin/config/magic-link
 *
 * Retourne les durées de validité des magic links en secondes.
 * - adminTTL: pour les administrateurs (défaut: 86400 = 24h)
 * - userTTL: pour les utilisateurs standards (défaut: 604800 = 7 jours)
 * - sessionTTL: pour la durée de session après connexion (défaut: 7200 = 2h)
 */
export const getMagicLinkConfig = async (req: Request, res: Response): Promise<void> => {
  try {
    const config = await configService.getMagicLinkConfig()
    res.json({ data: config })
  } catch (error) {
    console.error('Error fetching magic link config:', error)
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Erreur lors de la récupération de la configuration' } })
  }
}

/**
 * Mettre à jour la configuration des magic links
 * PUT /api/admin/config/magic-link
 *
 * Permet de modifier les durées de validité des magic links et de session.
 * Valeurs acceptées (en secondes):
 * - adminTTL: 60 à 604800 (1min à 7j)
 * - userTTL: 60 à 2592000 (1min à 30 jours)
 * - sessionTTL: 300 à 86400 (5min à 24h)
 *
 * Body:
 * {
 *   "adminTTL": number,
 *   "userTTL": number,
 *   "sessionTTL": number
 * }
 */
export const updateMagicLinkConfig = async (req: Request, res: Response): Promise<void> => {
  try {
    // Validation avec Zod
    const validatedData = updateMagicLinkConfigSchema.parse(req.body)

    const config = await configService.updateMagicLinkConfig(
      validatedData.adminTTL,
      validatedData.userTTL,
      validatedData.sessionTTL
    )
    res.json({ data: config })
  } catch (error) {
    const validationError = formatApiError(error, 'Erreur lors de la mise à jour de la configuration')
    const statusCode = validationError.code === 'VALIDATION_ERROR' ? 400 : 500
    res.status(statusCode).json({ error: validationError })
  }
}
