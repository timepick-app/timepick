import type { Request, Response } from 'express'
import { getSmtpSettings, saveSmtpSettings, clearSmtpSettings } from '../db/settings.db'
import { getEmailProviderConfig, saveEmailProviderConfig, clearEmailProviderConfig, type EmailProvider } from '../db/email-provider.db'
import { invalidateTransportCache, sendBrandedSmtpTest, sendBrandedProviderTest } from '../services/email.service'
import { query } from '../db'
import {
  smtpSettingsSchema,
  smtpTestSchema,
  emailApiProviderSettingsSchema,
} from '../validators/settings.validator'
import { formatApiError } from '../validators/config.validator'
import { getProviderMeta } from '../services/email-transport/descriptors'
import {
  catalogSecretFieldsResolver,
  maskCredentialsForResponse,
  needsStoredCredentialLookup,
  resolveProviderCredentials,
} from '../services/email-transport/provider-credentials'

/**
 * Récupérer les paramètres SMTP
 * GET /api/admin/settings/smtp
 *
 * Retourne la config SMTP complète avec le mot de passe SMTP **déchiffré** (clair,
 * route admin authentifiée ; comportement intentionnel), ainsi que le
 * provider email actif et ses `credentials` masquées champ par champ
 * (contrat §4.1 : secrets → '****'/'', non-secrets en clair ; fail-safe si
 * descripteur inconnu → tout masquer). `emailApiKey` reste renvoyé par
 * compat (= `credentials.apiKey`, déprécié).
 */
export const getSmtpSettingsHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const settings = await getSmtpSettings()
    const { provider, credentials } = await getEmailProviderConfig(catalogSecretFieldsResolver)
    const maskedCredentials = maskCredentialsForResponse(provider, credentials)
    res.json({
      data: {
        ...settings,
        emailProvider: provider,
        emailApiKey: maskedCredentials.apiKey ?? '',
        credentials: maskedCredentials,
      },
    })
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
 * Chantier email-providers (B2) — dispatch par body.provider : absent/'smtp'
 * → chemin historique intact (ci-dessous) + saveEmailProviderConfig({provider:'smtp'})
 * pour rendre la bascule HTTP→smtp effective ; tout autre id du catalogue →
 * schéma data-driven (`credentials` multi-champ). Résolution des sentinelles
 * SCOPÉE au provider stocké (contrat §4.2/§7.7, durcissement revue delta 1) :
 * un champ requis toujours vide après résolution → 400 (jamais de fusion
 * inter-fournisseurs, jamais d'écriture partielle en DB).
 */
export const saveSmtpSettingsHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const provider = typeof req.body?.provider === 'string' ? req.body.provider : undefined

    if (provider && provider !== 'smtp') {
      const validatedData = emailApiProviderSettingsSchema.parse(req.body)
      const meta = getProviderMeta(validatedData.provider)
      if (!meta) {
        // Filet défensif — déjà rejeté par le schéma ci-dessus en principe.
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Fournisseur email non supporté' } })
        return
      }

      const stored = needsStoredCredentialLookup(meta, validatedData.credentials)
        ? await getEmailProviderConfig(catalogSecretFieldsResolver)
        : { provider: 'smtp' as EmailProvider, credentials: {} }

      const { raw, missingLabels } = resolveProviderCredentials(meta, validatedData.credentials, stored.provider, stored.credentials)
      if (missingLabels.length > 0) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: `Champ(s) requis manquant(s) : ${missingLabels.join(', ')}.` },
        })
        return
      }

      await saveEmailProviderConfig({ provider: meta.id as EmailProvider, credentials: raw }, catalogSecretFieldsResolver)
      await saveSmtpSettings({
        ...(validatedData.smtpFromName !== undefined ? { smtpFromName: validatedData.smtpFromName } : {}),
        smtpFromEmail: validatedData.smtpFromEmail ?? '',
      })
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
 * Chantier email-providers (B2) — body.provider ≠ 'smtp' dispatche vers le
 * transport API : credentials résolus PAR CHAMP, sentinelle SCOPÉE au
 * provider stocké (même garde-fou que le PUT, contrat §4.3/§7.7) — sans
 * valeur utilisable pour un champ requis, réponse { success:false } sans
 * jamais construire de transport. La blocklist d'IPs privées (chemin SMTP
 * historique) ne s'applique pas ici — hors de propos pour une API HTTPS.
 */
export const testSmtpConnectionHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const provider = typeof req.body?.provider === 'string' ? req.body.provider : undefined

    if (provider && provider !== 'smtp') {
      const validated = emailApiProviderSettingsSchema.parse(req.body)
      const adminEmail = await resolveAdminEmail(req, res)
      if (!adminEmail) return

      const meta = getProviderMeta(validated.provider)
      if (!meta) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Fournisseur email non supporté' } })
        return
      }

      const stored = needsStoredCredentialLookup(meta, validated.credentials)
        ? await getEmailProviderConfig(catalogSecretFieldsResolver)
        : { provider: 'smtp' as EmailProvider, credentials: {} }

      const { resolved, missingLabels } = resolveProviderCredentials(meta, validated.credentials, stored.provider, stored.credentials)
      if (missingLabels.length > 0) {
        res.json({ success: false, message: `Champ(s) requis manquant(s) pour ce fournisseur : ${missingLabels.join(', ')}.` })
        return
      }

      res.json(
        await sendBrandedProviderTest(
          { provider: meta.id as Exclude<EmailProvider, 'smtp'>, credentials: resolved, fromName: validated.smtpFromName, fromEmail: validated.smtpFromEmail },
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
