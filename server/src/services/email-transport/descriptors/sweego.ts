/**
 * Chantier email-providers (B2) — descripteur Sweego (contrat §3.1/§3.2).
 *
 * Sources vérifiées 2026-07-21 (web — Sweego n'a pas de présence context7) :
 *  - Envoi  : POST https://api.sweego.io/send
 *             https://www.sweego.io/channel/email/integrate-sweegos-api-to-send-transactional-emails
 *             https://www.sweego.io/send-email-sms-api-smtp (schéma complet du payload)
 *  - Auth   : header `Api-Key: <clé>`
 *             https://www.sweego.io/channel/email/integrate-sweegos-api-to-send-transactional-emails
 *  - Payload: `channel:'email'`, `provider:'sweego'`, `recipients:[{email,name?}]`,
 *             `from:{email,name?}`, `subject`, `message-txt`, `message-html`
 *             https://www.sweego.io/send-email-sms-api-smtp
 *
 * À CONFIRMER / SIGNALÉ (contrat §3.3, Sweego = fournisseur le plus
 * incertain) : AUCUN endpoint GET idempotent (compte/domaines) n'a été
 * trouvé dans la documentation publique (learn.sweego.io/docs/sweego/sweego-api
 * est une SPA React dont le contenu API détaillé n'est pas accessible en
 * fetch statique — seules les pages marketing/guide ci-dessus ont livré du
 * contenu concret). `verifyPath` est donc VOLONTAIREMENT absent : le moteur
 * (amendement revue delta 2, contrat §3.2) résout `verify()` à `true` (skip)
 * pour ce fournisseur — la validation repose sur l'envoi de test réel. À
 * ré-investiguer avec un compte Sweego (accès à la doc API authentifiée) ou
 * en contactant leur support pour confirmer une sonde GET si elle existe.
 * Confiance : CONFIRMÉ pour l'envoi (POST /send, header Api-Key, champs du
 * payload) ; NON CONFIRMÉ pour la sonde de santé (verify).
 */
import type { ProviderHttpSpec } from '../types'
import type { ProviderMeta } from './provider-meta'

export const sweegoMeta: ProviderMeta = {
  id: 'sweego',
  label: 'Sweego',
  region: 'eu',
  freeTierNote: '100 emails/jour (gratuit)',
  docsUrl: 'https://www.sweego.io/channel/email/integrate-sweegos-api-to-send-transactional-emails',
  credentialFields: [
    { key: 'apiKey', label: 'Clé API', secret: true, required: true },
  ],
}

export const sweegoSpec: ProviderHttpSpec = {
  id: 'sweego',
  baseUrl: 'https://api.sweego.io',
  sendPath: '/send',
  // verifyPath : volontairement absent — cf. note "À CONFIRMER" ci-dessus.
  buildAuthHeaders: cred => ({ 'Api-Key': cred.apiKey ?? '' }),
  buildSendPayload: mail => ({
    channel: 'email',
    provider: 'sweego',
    recipients: mail.to.map(a => (a.name ? { email: a.address, name: a.name } : { email: a.address })),
    from: mail.from ? (mail.from.name ? { email: mail.from.address, name: mail.from.name } : { email: mail.from.address }) : undefined,
    subject: mail.subject,
    'message-txt': mail.text,
    'message-html': mail.html,
  }),
}
