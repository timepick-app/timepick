import net from 'net'
import type { Request, Response } from 'express'
import { getSmtpSettings } from '../db/settings.db'
import { getEmailProviderConfig, type EmailProvider } from '../db/email-provider.db'
import { sendBrandedSmtpTest, sendBrandedProviderTest } from '../services/email.service'
import { smtpSetupTestSchema, emailApiProviderSetupTestSchema } from '../validators/settings.validator'
import { formatApiError } from '../validators/config.validator'
import { getProviderMeta } from '../services/email-transport/descriptors'
import {
  catalogSecretFieldsResolver,
  maskCredentialsForResponse,
  needsStoredCredentialLookup,
  resolveProviderCredentials,
} from '../services/email-transport/provider-credentials'

/**
 * Vérifie si l'hôte SMTP est une adresse IP privée/loopback/link-local littérale.
 * Retourne true uniquement pour les IPs littérales : les hostnames passent
 * (la résolution DNS et le rebinding sont hors scope de cette protection).
 */
function isBlockedSmtpHost(host: string): boolean {
  const ipVersion = net.isIP(host)
  if (ipVersion === 0) return false // Hostname — non bloqué

  if (ipVersion === 4) {
    const parts = host.split('.').map(Number)
    const [a, b] = parts
    if (a === 127) return true                         // 127.0.0.0/8 loopback
    if (a === 10) return true                          // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true  // 172.16.0.0/12
    if (a === 192 && b === 168) return true            // 192.168.0.0/16
    if (a === 169 && b === 254) return true            // 169.254.0.0/16 link-local (ex. metadata cloud)
    return false
  }

  // IPv6 — vérifie les plages communes via préfixe (forme normalisée)
  const h = host.toLowerCase()
  if (h === '::1') return true               // loopback
  if (/^f[cd]/i.test(h)) return true        // fc00::/7 ULA (fc** et fd**)
  if (/^fe[89ab]/i.test(h)) return true     // fe80::/10 link-local
  return false
}

/**
 * GET /api/setup/smtp
 * Retourne la config SMTP avec le mot de passe masqué, ainsi que le provider
 * email actif et ses `credentials` masquées champ par champ (contrat §4.1,
 * même règle que `settings.controller.ts` — fail-safe masquage si
 * descripteur inconnu). Endpoint public gated (checkSetupNotDone + rate-limit).
 */
export const getSetupSmtpConfigHandler = async (_req: Request, res: Response): Promise<void> => {
  try {
    const s = await getSmtpSettings()
    const { provider, credentials } = await getEmailProviderConfig(catalogSecretFieldsResolver)
    const maskedCredentials = maskCredentialsForResponse(provider, credentials)
    res.json({
      data: {
        ...s,
        smtpPassword: s.smtpPassword ? '****' : '',
        emailProvider: provider,
        emailApiKey: maskedCredentials.apiKey ?? '',
        credentials: maskedCredentials,
      },
    })
  } catch (e) {
    console.error('[SetupSmtp] get error:', e)
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Erreur lors de la récupération de la configuration SMTP' },
    })
  }
}

/**
 * POST /api/setup/smtp/test
 * Teste la connexion SMTP avec les paramètres du body et envoie un email à `recipient`.
 * Endpoint public gated (checkSetupNotDone + rate-limit).
 *
 * Sentinel '****' : si smtpPassword est absent ou vaut '****', le mot de passe
 * chiffré en DB est chargé et utilisé (cas env-seed pré-rempli).
 *
 * Chantier email-providers (B2) — body.provider ≠ 'smtp' dispatche vers
 * `emailApiProviderSetupTestSchema` (même schéma + recipient) : résolution
 * des credentials PAR CHAMP, sentinelle SCOPÉE au provider stocké (même
 * garde-fou que le chemin admin, contrat §4.3/§7.7). La blocklist d'IPs
 * privées reste scoped au chemin SMTP ci-dessous.
 */
export const testSetupSmtpHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const provider = typeof req.body?.provider === 'string' ? req.body.provider : undefined

    if (provider && provider !== 'smtp') {
      const validated = emailApiProviderSetupTestSchema.parse(req.body)

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
          validated.recipient,
        ),
      )
      return
    }

    const p = smtpSetupTestSchema.parse(req.body)
    const { recipient, ...smtpParams } = p

    // Blocklist prod : rejeter les IPs privées/loopback littérales (ex. 169.254.169.254)
    if (process.env.NODE_ENV === 'production' && isBlockedSmtpHost(smtpParams.smtpHost)) {
      res.status(400).json({
        error: { code: 'SMTP_HOST_BLOCKED', message: 'Hôte SMTP non autorisé (adresse interne).' },
      })
      return
    }

    // Résolution sentinel '****' : charger le mot de passe stocké depuis la DB
    let resolvedPassword = smtpParams.smtpPassword
    if (!resolvedPassword || resolvedPassword === '****') {
      const stored = await getSmtpSettings()
      resolvedPassword = stored.smtpPassword || undefined
    }

    res.json(await sendBrandedSmtpTest({ ...smtpParams, smtpPassword: resolvedPassword }, recipient))
  } catch (error) {
    const ve = formatApiError(error, 'Erreur lors du test de connexion SMTP')
    if (ve.code !== 'VALIDATION_ERROR') {
      console.error('[SetupSmtp] test error:', error)
    }
    res.status(ve.code === 'VALIDATION_ERROR' ? 400 : 500).json({ error: ve })
  }
}
