import net from 'net'
import type { Request, Response } from 'express'
import { getSmtpSettings } from '../db/settings.db'
import { sendBrandedSmtpTest } from '../services/email.service'
import { smtpSetupTestSchema } from '../validators/settings.validator'
import { formatApiError } from '../validators/config.validator'

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
 * Retourne la config SMTP avec le mot de passe masqué.
 * Endpoint public gated (checkSetupNotDone + rate-limit).
 */
export const getSetupSmtpConfigHandler = async (_req: Request, res: Response): Promise<void> => {
  try {
    const s = await getSmtpSettings()
    res.json({ data: { ...s, smtpPassword: s.smtpPassword ? '****' : '' } })
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
 */
export const testSetupSmtpHandler = async (req: Request, res: Response): Promise<void> => {
  try {
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
