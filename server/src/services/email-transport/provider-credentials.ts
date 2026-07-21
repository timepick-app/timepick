/**
 * Chantier email-providers (B2) — résolution/masquage des credentials
 * multi-champ (contrat §4.1/§4.2/§7.7), factorisé une fois pour les 4 points
 * d'entrée contrôleur (settings + setup-smtp, PUT + test).
 */
import type { EmailProvider, SecretFieldsResolver } from '../../db/email-provider.db'
import { getProviderMeta } from './descriptors'
import type { ProviderMeta } from './descriptors/provider-meta'

const SENTINELS: readonly string[] = ['****', '']

/** SecretFieldsResolver dérivé du catalogue (contrat B1 §… — injecté dans
 *  get/saveEmailProviderConfig par les contrôleurs : db/email-provider.db.ts
 *  ne peut pas importer les descripteurs, cf. commentaire dans ce module). */
export const catalogSecretFieldsResolver: SecretFieldsResolver = provider => {
  const meta = getProviderMeta(provider)
  return meta ? meta.credentialFields.filter(f => f.secret).map(f => f.key) : []
}

/**
 * Masque les credentials pour une réponse GET (contrat §4.1) : champs
 * `secret:true` stockés → '****' (absents → ''), champs `secret:false` →
 * valeur réelle. Fail-safe masquage (delta revue 7) : descripteur
 * absent/inconnu → TOUT masquer (on ne peut pas distinguer secret/non-secret
 * sans descripteur — jamais de clair par défaut).
 */
export function maskCredentialsForResponse(provider: EmailProvider, credentials: Record<string, string>): Record<string, string> {
  const meta = getProviderMeta(provider)
  if (!meta) {
    return Object.fromEntries(Object.entries(credentials).map(([k, v]) => [k, v ? '****' : '']))
  }
  const out: Record<string, string> = {}
  for (const field of meta.credentialFields) {
    const value = credentials[field.key] ?? ''
    out[field.key] = field.secret ? (value ? '****' : '') : value
  }
  return out
}

/** true si au moins un champ secret soumis est une sentinelle — SEUL cas où
 *  une lecture DB (décryptage du provider actuellement stocké) est
 *  nécessaire pour la résolution (évite un aller-retour DB inutile quand le
 *  client soumet déjà des valeurs réelles). */
export function needsStoredCredentialLookup(meta: ProviderMeta, submitted: Record<string, string>): boolean {
  return meta.credentialFields.some(f => f.secret && SENTINELS.includes(submitted[f.key] ?? ''))
}

export interface CredentialResolution {
  /** Valeurs SOUMISES brutes (sentinelle incluse) — à passer telles quelles
   *  à `saveEmailProviderConfig`, qui applique sa propre préservation
   *  sentinelle scopée (défense en profondeur, cf. db/email-provider.db.ts). */
  raw: Record<string, string>
  /** Valeurs RÉSOLUES (sentinelle remplacée par la valeur stockée si scoped,
   *  sinon vide) — prêtes à l'emploi pour un test de connexion ad-hoc. */
  resolved: Record<string, string>
  /** Libellés des champs requis toujours vides après résolution. */
  missingLabels: string[]
}

/**
 * Résout les credentials soumis contre le stock, sentinelle SCOPÉE au
 * provider (contrat §4.2/§4.3/§7.7, durcissement revue delta 1) : `'****'`
 * ou `''` sur un champ secret ne préserve la valeur stockée QUE si
 * `meta.id === storedProvider` — sinon traité comme un champ ABSENT, jamais
 * de fusion inter-fournisseurs (ex. la clé Resend ne doit jamais réapparaître
 * sous Mailjet au motif qu'ils partagent tous deux la clé `apiKey`).
 */
export function resolveProviderCredentials(
  meta: ProviderMeta,
  submitted: Record<string, string>,
  storedProvider: EmailProvider,
  storedCredentials: Record<string, string>,
): CredentialResolution {
  const scoped = storedProvider === meta.id
  const raw: Record<string, string> = {}
  const resolved: Record<string, string> = {}
  const missingLabels: string[] = []
  for (const field of meta.credentialFields) {
    const submittedValue = submitted[field.key] ?? ''
    raw[field.key] = submittedValue
    const isSentinel = field.secret && SENTINELS.includes(submittedValue)
    const value = isSentinel ? (scoped ? (storedCredentials[field.key] ?? '') : '') : submittedValue
    resolved[field.key] = value
    if ((field.required ?? true) && !value) missingLabels.push(field.label)
  }
  return { raw, resolved, missingLabels }
}
