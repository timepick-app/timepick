import type { Request, Response } from 'express'
import { getSmtpSettings, saveSmtpSettings, clearSmtpSettings } from '../db/settings.db'
import { getEmailProviderConfig, saveEmailProviderConfig, clearEmailProviderConfig } from '../db/email-provider.db'
import { invalidateTransportCache, sendBrandedSmtpTest, sendBrandedProviderTest } from '../services/email.service'
import { query } from '../db'
import {
  smtpSettingsSchema,
  smtpTestSchema,
  emailApiProviderSettingsSchema,
} from '../validators/settings.validator'
import { formatApiError } from '../validators/config.validator'

/**
 * Récupérer les paramètres SMTP
 * GET /api/admin/settings/smtp
 *
 * Retourne la config SMTP complète avec le mot de passe masqué, ainsi que le
 * provider email actif (Chantier C) — la clé API du provider est masquée
 * ('****' si stockée, '' sinon), jamais en clair.
 */
export const getSmtpSettingsHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const settings = await getSmtpSettings()
    const { provider, apiKey } = await getEmailProviderConfig()
    res.json({ data: { ...settings, emailProvider: provider, emailApiKey: apiKey ? '****' : '' } })
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
 *
 * Chantier C — dispatch par body.provider : absent/'smtp' → chemin historique
 * intact (ci-dessous) + saveEmailProviderConfig({provider:'smtp'}) pour rendre
 * la bascule resend→smtp effective ; 'resend' → schéma API provider (clé +
 * champs from communs, optionnels) ; 'brevo' → 400 (rejeté par le validateur).
 */
export const saveSmtpSettingsHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const provider = typeof req.body?.provider === 'string' ? req.body.provider : undefined

    if (provider && provider !== 'smtp') {
      const validatedData = emailApiProviderSettingsSchema.parse(req.body)
      await saveEmailProviderConfig({ provider: validatedData.provider, apiKey: validatedData.emailApiKey })

      const fromFields: { smtpFromName?: string; smtpFromEmail?: string } = {}
      if (validatedData.smtpFromName !== undefined) fromFields.smtpFromName = validatedData.smtpFromName
      if (validatedData.smtpFromEmail !== undefined) fromFields.smtpFromEmail = validatedData.smtpFromEmail
      if (Object.keys(fromFields).length > 0) await saveSmtpSettings(fromFields)
    } else {
      const validatedData = smtpSettingsSchema.parse(req.body)
      // Convert port from number to string for DB layer
      await saveSmtpSettings({
        ...validatedData,
        smtpPort: String(validatedData.smtpPort),
      })
      await saveEmailProviderConfig({ provider: 'smtp' })
    }

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
 * Résout l'email de l'admin connecté pour le destinataire du test. Répond
 * directement (401/400) et retourne null si la résolution échoue — le
 * contrôleur appelant doit alors `return` sans traitement supplémentaire.
 */
async function resolveAdminEmail(req: Request, res: Response): Promise<string | null> {
  if (!req.user) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentification requise' } })
    return null
  }

  const result = await query('SELECT email FROM users WHERE id = $1', [req.user.userId])
  const adminEmail = result.rows[0]?.email

  if (!adminEmail) {
    res.status(400).json({ error: { code: 'USER_NOT_FOUND', message: 'Impossible de trouver votre adresse email' } })
    return null
  }

  return adminEmail
}

/**
 * Tester la connexion SMTP
 * POST /api/admin/settings/smtp/test
 *
 * Crée un transport nodemailer temporaire avec les paramètres fournis,
 * vérifie la connexion et envoie un email de test à l'adresse de l'admin.
 * Les paramètres viennent du body (pas de la DB) pour permettre
 * le test avant sauvegarde.
 *
 * Chantier C — body.provider:'resend' dispatche vers le transport API : la
 * clé résolue (fournie, ou sentinelle/'' → clé stockée) est testée par un
 * vrai verify() + envoi ; sans clé disponible, réponse { success:false } sans
 * jamais construire de transport. La blocklist d'IPs privées (chemin SMTP
 * historique) ne s'applique pas ici — hors de propos pour une API HTTPS.
 */
export const testSmtpConnectionHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const provider = typeof req.body?.provider === 'string' ? req.body.provider : undefined

    if (provider && provider !== 'smtp') {
      // Test admin : mêmes champs que la sauvegarde ; la sentinelle **** est résolue plus bas (clé stockée) → vrai appel authentifié.
      const validated = emailApiProviderSettingsSchema.parse(req.body)
      const adminEmail = await resolveAdminEmail(req, res)
      if (!adminEmail) return

      let apiKey = validated.emailApiKey
      if (!apiKey || apiKey === '****') {
        apiKey = (await getEmailProviderConfig()).apiKey
      }
      if (!apiKey) {
        res.json({ success: false, message: 'Aucune clé API configurée pour ce provider.' })
        return
      }

      res.json(
        await sendBrandedProviderTest(
          { provider: validated.provider, apiKey, fromName: validated.smtpFromName, fromEmail: validated.smtpFromEmail },
          adminEmail,
        ),
      )
      return
    }

    const params = smtpTestSchema.parse(req.body)
    const adminEmail = await resolveAdminEmail(req, res)
    if (!adminEmail) return

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
 * Clears all SMTP settings from the DB, reverting to the env/local-interceptor
 * fallback. Chantier C : réinitialise aussi le provider email (→ défaut 'smtp').
 */
export const deleteSmtpSettingsHandler = async (_req: Request, res: Response): Promise<void> => {
  try {
    await clearSmtpSettings()
    await clearEmailProviderConfig()
    invalidateTransportCache()
    res.status(204).send()
  } catch (error) {
    console.error('[SettingsController] Error clearing SMTP settings:', error)
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Erreur lors de la suppression des paramètres SMTP' } })
  }
}
