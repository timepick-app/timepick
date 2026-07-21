/**
 * Chantier email-providers (B2) — descripteur Mailjet (contrat §3.1/§3.2).
 *
 * Sources officielles vérifiées 2026-07-21 (context7/web, contrat §3.3) :
 *  - Envoi  : POST https://api.mailjet.com/v3.1/send
 *             https://dev.mailjet.com/email/guides/send-api-v31/
 *  - Auth   : HTTPS Basic Auth `base64(apiKey:secretKey)`
 *             https://dev.mailjet.com/email/reference/overview/authentication/
 *  - Sonde  : GET https://api.mailjet.com/v3/REST/sender (idempotent, liste
 *             des senders — sans quota d'envoi)
 *             https://dev.mailjet.com/email/reference/sender-addresses-and-domains/sender/
 *  - Payload: enveloppe `{ Messages: [{ From:{Email,Name}, To:[{Email,Name}],
 *             Subject, TextPart, HTMLPart }] }` (champs CAPITALISÉS)
 *             https://github.com/mailjet/api-documentation/blob/master/guides/_send-api.md
 * Confiance : CONFIRMÉ (documentation officielle dev.mailjet.com).
 */
import type { ProviderHttpSpec } from '../types'
import type { ProviderMeta } from './provider-meta'

export const mailjetMeta: ProviderMeta = {
  id: 'mailjet',
  label: 'Mailjet',
  region: 'eu',
  freeTierNote: '6 000 emails/mois (≈ 200/jour, gratuit)',
  docsUrl: 'https://dev.mailjet.com/email/guides/getting-started/',
  credentialFields: [
    { key: 'apiKey', label: 'Clé API', secret: true, required: true },
    { key: 'secretKey', label: 'Clé secrète', secret: true, required: true },
  ],
}

export const mailjetSpec: ProviderHttpSpec = {
  id: 'mailjet',
  baseUrl: 'https://api.mailjet.com',
  sendPath: '/v3.1/send',
  verifyPath: '/v3/REST/sender',
  buildAuthHeaders: cred => ({
    Authorization: `Basic ${Buffer.from(`${cred.apiKey ?? ''}:${cred.secretKey ?? ''}`).toString('base64')}`,
  }),
  buildSendPayload: mail => ({
    Messages: [
      {
        From: mail.from ? { Email: mail.from.address, Name: mail.from.name } : undefined,
        To: mail.to.map(a => ({ Email: a.address, Name: a.name })),
        Subject: mail.subject,
        TextPart: mail.text,
        HTMLPart: mail.html,
      },
    ],
  }),
}
