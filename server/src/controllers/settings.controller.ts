import type { Request, Response } from 'express'
import { getSmtpSettings, saveSmtpSettings, clearSmtpSettings } from '../db/settings.db'
import { invalidateTransportCache, sendBrandedSmtpTest } from '../services/email.service'
import { query } from '../db'
import { smtpSettingsSchema, smtpTestSchema } from '../validators/settings.validator'
import { formatApiError } from '../validators/config.validator'

/**
 * Récupérer les paramètres SMTP
 * GET /api/admin/settings/smtp
 *
 * Retourne la config SMTP complète avec le mot de passe masqué.
 */
export const getSmtpSettingsHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const settings = await getSmtpSettings()
    res.json({ data: settings })
  } catch (error) {
    console.error('[SettingsController] Error fetching SMTP settings:', error)
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Erreur lors de la récupération des paramètres SMTP' } })
  }
}

/**
 * Sauvegarder les paramètres SMTP
 * PUT /api/admin/settings/smtp
 *
 * Valide les paramètres, chiffre le mot de passe si nécessaire,
 * et sauvegarde en base. Le sentinelle "****" préserve l'ancien mot de passe.
 */
export const saveSmtpSettingsHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const validatedData = smtpSettingsSchema.parse(req.body)
    // Convert port from number to string for DB layer
    await saveSmtpSettings({
      ...validatedData,
      smtpPort: String(validatedData.smtpPort),
    })
    invalidateTransportCache()
    res.json({ data: { message: 'Paramètres SMTP sauvegardés avec succès' } })
  } catch (error) {
    console.error('[SettingsController] Error saving SMTP settings:', error)
    const validationError = formatApiError(error, 'Erreur lors de la sauvegarde des paramètres SMTP')
    const statusCode = validationError.code === 'VALIDATION_ERROR' ? 400 : 500
    res.status(statusCode).json({ error: validationError })
  }
}

/**
 * Tester la connexion SMTP
 * POST /api/admin/settings/smtp/test
 *
 * Crée un transport nodemailer temporaire avec les paramètres fournis,
 * vérifie la connexion et envoie un email de test à l'adresse de l'admin.
 * Les paramètres viennent du body (pas de la DB) pour permettre
 * le test avant sauvegarde.
 */
export const testSmtpConnectionHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const params = smtpTestSchema.parse(req.body)

    // Récupérer l'email de l'admin connecté
    if (!req.user) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentification requise' } })
      return
    }

    const result = await query('SELECT email FROM users WHERE id = $1', [req.user.userId])
    const adminEmail = result.rows[0]?.email

    if (!adminEmail) {
      res.status(400).json({ error: { code: 'USER_NOT_FOUND', message: 'Impossible de trouver votre adresse email' } })
      return
    }

    res.json(await sendBrandedSmtpTest(params, adminEmail))
  } catch (error) {
    const validationError = formatApiError(error, 'Erreur lors du test de connexion SMTP')
    const statusCode = validationError.code === 'VALIDATION_ERROR' ? 400 : 500
    if (statusCode === 500) {
      console.error('[SettingsController] SMTP test error:', error)
    }
    res.status(statusCode).json({ error: validationError })
  }
}

/**
 * DELETE /api/admin/settings/smtp
 * Clears all SMTP settings from the DB, reverting to the env/local-interceptor fallback.
 */
export const deleteSmtpSettingsHandler = async (_req: Request, res: Response): Promise<void> => {
  try {
    await clearSmtpSettings()
    invalidateTransportCache()
    res.status(204).send()
  } catch (error) {
    console.error('[SettingsController] Error clearing SMTP settings:', error)
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Erreur lors de la suppression des paramètres SMTP' } })
  }
}
