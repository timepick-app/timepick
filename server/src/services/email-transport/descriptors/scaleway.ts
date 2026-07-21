/**
 * Chantier email-providers (B2) — descripteur Scaleway Transactional Email
 * (contrat §3.1/§3.2).
 *
 * Sources officielles vérifiées 2026-07-21 (context7/web, contrat §3.3) :
 *  - Envoi  : POST https://api.scaleway.com/transactional-email/v1alpha1/regions/{region}/emails
 *             https://www.scaleway.com/en/docs/transactional-email/api-cli/send-emails-with-api/
 *  - Auth   : header `X-Auth-Token: <secretKey>`
 *             https://www.scaleway.com/en/docs/transactional-email/how-to/generate-api-keys-for-tem-with-iam/
 *  - Sonde  : GET .../regions/{region}/domains (idempotent, sans quota)
 *             https://www.scaleway.com/en/docs/transactional-email/api-cli/send-emails-with-api/
 *  - Payload: `from:{name,email}`, `to:[{name,email}]`, `subject`, `text`,
 *             `html`, `project_id` (dans le BODY, pas l'URL)
 *             https://www.scaleway.com/en/developers/api/transactional-email
 *
 * ÉCART vs contrat §3.3 (à signaler) : le contrat liste `region` avec 3
 * options `{fr-par, nl-ams, pl-waw}`. La doc officielle Scaleway
 * (scaleway.com/en/developers/api/transactional-email) affirme explicitement
 * au 2026-07-21 : « Transactional Email is available in the Paris region,
 * which is represented by the following path parameter: fr-par » — AUCUNE
 * mention de nl-ams/pl-waw pour CE produit (ils existent pour d'autres
 * produits Scaleway, pas confirmés ici). On expose donc UNIQUEMENT `fr-par`
 * pour ne pas fabriquer d'endpoint régional non documenté ; à élargir dès
 * que Scaleway documente d'autres régions pour Transactional Email.
 * Confiance : CONFIRMÉ pour fr-par ; nl-ams/pl-waw NON confirmés (retirés).
 */
import type { ProviderHttpSpec } from '../types'
import type { ProviderMeta } from './provider-meta'

export const scalewayMeta: ProviderMeta = {
  id: 'scaleway',
  label: 'Scaleway',
  region: 'eu',
  freeTierNote: '300 emails/mois (gratuit)',
  docsUrl: 'https://www.scaleway.com/en/docs/transactional-email/how-to/generate-api-keys-for-tem-with-iam/',
  credentialFields: [
    { key: 'secretKey', label: 'Clé secrète', secret: true, required: true },
    { key: 'projectId', label: 'ID de projet', secret: false, required: true },
    {
      key: 'region',
      label: 'Région',
      secret: false,
      required: true,
      // Cf. écart documenté ci-dessus : seule fr-par est confirmée disponible.
      options: [{ value: 'fr-par', label: 'Paris (fr-par)' }],
    },
  ],
}

export const scalewaySpec: ProviderHttpSpec = {
  id: 'scaleway',
  // {region} substitué par buildUrl ci-dessous (contrat §3.2) — baseUrl reste
  // documentaire (ignoré tant que buildUrl est défini).
  baseUrl: 'https://api.scaleway.com/transactional-email/v1alpha1/regions/{region}',
  sendPath: '/emails',
  verifyPath: '/domains',
  buildUrl: (path, cred) => `https://api.scaleway.com/transactional-email/v1alpha1/regions/${cred.region || 'fr-par'}${path}`,
  buildAuthHeaders: cred => ({ 'X-Auth-Token': cred.secretKey ?? '' }),
  buildSendPayload: (mail, cred) => ({
    from: mail.from ? { name: mail.from.name, email: mail.from.address } : undefined,
    to: mail.to.map(a => ({ name: a.name, email: a.address })),
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    project_id: cred.projectId ?? '',
  }),
}
