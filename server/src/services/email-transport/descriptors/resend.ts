/**
 * Chantier email-providers (B2) — descripteur Resend (contrat §3.1/§3.2).
 * Parité stricte avec l'ancien `resend-transport.ts` (chantier C, retiré —
 * cf. rapport B2) : mêmes endpoints, mêmes headers, même aplatissement
 * d'adresse, même idempotence.
 *
 * Sources officielles vérifiées 2026-07-21 (context7/web, contrat §3.3) :
 *  - Envoi  : POST https://api.resend.com/emails
 *             https://resend.com/docs/api-reference/emails/send-email
 *  - Auth   : `Authorization: Bearer <clé>`
 *             https://resend.com/docs/api-reference/emails/send-email
 *  - Sonde  : GET https://api.resend.com/domains (idempotent, sans quota —
 *             déjà utilisé tel quel par l'ancien resend-transport.ts)
 * Confiance : CONFIRMÉ (documentation officielle resend.com + parité code existant).
 */
import type { ProviderHttpSpec } from '../types'
import { flattenAddress, flattenAddresses } from '../types'
import type { ProviderMeta } from './provider-meta'

export const resendMeta: ProviderMeta = {
  id: 'resend',
  label: 'Resend',
  region: 'us',
  freeTierNote: '3 000 emails/mois (≈ 100/jour, gratuit)',
  docsUrl: 'https://resend.com/docs/api-reference/emails/send-email',
  credentialFields: [
    { key: 'apiKey', label: 'Clé API', secret: true, placeholder: 're_…', required: true },
  ],
}

export const resendSpec: ProviderHttpSpec = {
  id: 'resend',
  baseUrl: 'https://api.resend.com',
  sendPath: '/emails',
  verifyPath: '/domains',
  // buildUrl (plutôt qu'un `baseUrl` figé au chargement du module) : relit
  // RESEND_API_BASE_URL à CHAQUE requête, pour le smoke local contre une API
  // mockée (parité avec l'ancien transport Resend qui acceptait un `baseUrl`
  // par appel).
  buildUrl: path => `${process.env.RESEND_API_BASE_URL && process.env.RESEND_API_BASE_URL.trim() ? process.env.RESEND_API_BASE_URL : 'https://api.resend.com'}${path}`,
  buildAuthHeaders: cred => ({ Authorization: `Bearer ${cred.apiKey ?? ''}` }),
  buildSendPayload: mail => ({
    from: mail.from ? flattenAddress(mail.from) : undefined,
    to: flattenAddresses(mail.to),
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
  }),
  idempotency: { header: 'Idempotency-Key' },
}
