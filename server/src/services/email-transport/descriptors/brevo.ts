/**
 * Chantier email-providers (B2) — descripteur Brevo (contrat §3.1/§3.2).
 *
 * Sources officielles vérifiées 2026-07-21 (context7/web, contrat §3.3) :
 *  - Envoi  : POST https://api.brevo.com/v3/smtp/email
 *             https://developers.brevo.com/docs/send-a-transactional-email
 *  - Auth   : header `api-key: <clé>`
 *             https://developers.brevo.com/docs/api-key-authentication
 *  - Sonde  : GET https://api.brevo.com/v3/account (idempotent, sans quota)
 *             https://developers.brevo.com/reference/get-account
 *  - Payload: `sender:{email,name}`, `to:[{email,name}]`, `subject`,
 *             `htmlContent`, `textContent`
 *             https://developers.brevo.com/reference/send-transac-email
 * Confiance : CONFIRMÉ (documentation officielle developers.brevo.com).
 */
import type { ProviderHttpSpec } from '../types'
import type { ProviderMeta } from './provider-meta'

export const brevoMeta: ProviderMeta = {
  id: 'brevo',
  label: 'Brevo',
  region: 'eu',
  freeTierNote: '≈ 300 emails/jour (gratuit)',
  docsUrl: 'https://developers.brevo.com/docs/api-key-authentication',
  credentialFields: [
    { key: 'apiKey', label: 'Clé API', secret: true, placeholder: 'xkeysib-…', required: true },
  ],
}

export const brevoSpec: ProviderHttpSpec = {
  id: 'brevo',
  baseUrl: 'https://api.brevo.com',
  sendPath: '/v3/smtp/email',
  verifyPath: '/v3/account',
  buildAuthHeaders: cred => ({ 'api-key': cred.apiKey ?? '' }),
  buildSendPayload: mail => ({
    sender: mail.from ? { email: mail.from.address, name: mail.from.name } : undefined,
    to: mail.to.map(a => ({ email: a.address, name: a.name })),
    subject: mail.subject,
    htmlContent: mail.html,
    textContent: mail.text,
  }),
}
