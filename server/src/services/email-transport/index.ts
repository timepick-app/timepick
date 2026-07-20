import type { EmailProvider } from '../../db/email-provider.db'
import { createResendTransport, type ResendTransport } from './resend-transport'

/**
 * Chantier C — factory des transports API HTTP (alternative au SMTP), §4 du
 * contrat de barrière. `resend` implémenté maintenant ; `brevo` est accepté
 * par le type DB/client mais REFUSÉ par le validateur serveur (jamais
 * atteignable ici) — itération future (GET /v3/account, POST /v3/smtp/email).
 */
export function createApiTransport(provider: Exclude<EmailProvider, 'smtp'>, apiKey: string): ResendTransport {
  if (provider === 'resend') {
    return createResendTransport({ apiKey, baseUrl: process.env.RESEND_API_BASE_URL })
  }
  throw new Error('Transport Brevo non implémenté — itération suivante (GET /v3/account, POST /v3/smtp/email)')
}
