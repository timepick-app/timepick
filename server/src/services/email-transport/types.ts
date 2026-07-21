/**
 * Chantier email-providers (B1) — types partagés du moteur HTTP générique
 * (contrat §3.2). Séparés de `http-transport.ts` pour que les descripteurs
 * par fournisseur (`descriptors/*`, chantier B2) puissent importer les types
 * + le helper d'aplatissement SANS tirer l'implémentation du moteur.
 */

/**
 * Adresse email structurée — jamais de chaîne pré-aplatie `"Nom <addr>"`.
 * Brevo/Mailjet exigent `{email,name}` séparés ; aplatir puis re-parser une
 * chaîne composite est fragile (virgules/guillemets dans le nom). Les
 * descripteurs « plats » (Resend/Scaleway) aplatissent eux-mêmes via
 * `flattenAddress`/`flattenAddresses` ci-dessous.
 */
export interface MailAddress {
  name?: string
  address: string
}

/**
 * Message normalisé passé à `ProviderHttpSpec.buildSendPayload`. Périmètre
 * réel de l'app (email-send.service.ts, envois transactionnels) : jamais de
 * pièces jointes.
 */
export interface NormalizedMail {
  from?: MailAddress
  to: MailAddress[]
  subject?: string
  html?: string
  text?: string
}

/**
 * Aplatit une adresse structurée en chaîne `"Nom" <addr>` (ou `addr` seul
 * sans nom) — pour les descripteurs qui attendent un champ texte unique
 * (Resend, Scaleway). Amendement revue delta 5.
 */
export function flattenAddress(addr: MailAddress): string {
  if (!addr.name) return addr.address
  // Quoting RFC 5322 : un nom d'affichage contenant des caractères spéciaux (virgule,
  // guillemet, chevrons…) doit être une quoted-string, sinon `"TimePick, Inc." <addr>`
  // serait lu comme deux adresses par le fournisseur (Resend consomme la chaîne aplatie).
  const needsQuoting = /[",<>@;:\\.[\]()\r\n]/.test(addr.name)
  const name = needsQuoting ? `"${addr.name.replace(/([\\"])/g, '\\$1')}"` : addr.name
  return `${name} <${addr.address}>`
}

/** Variante tableau de `flattenAddress`. */
export function flattenAddresses(addrs: MailAddress[]): string[] {
  return addrs.map(flattenAddress)
}

/** Mapping d'erreurs par défaut du moteur (contrat §3.2/§4) — un descripteur
 *  peut surcharger via `parseError`, mais reste dans ce vocabulaire fermé. */
export type TransportErrorCode = 'EAUTH' | 'ECONNECTION' | 'EMESSAGE' | 'ERATELIMIT'

/**
 * Descripteur serveur d'un fournisseur HTTP (contrat §3.2) — peut contenir
 * des fonctions, contrairement à `ProviderMeta` (couche partagée avec le
 * client, chantier A). Consommé UNIQUEMENT par `createHttpTransport`
 * (moteur, `http-transport.ts`) et construit par les descripteurs (B2).
 */
export interface ProviderHttpSpec {
  id: string
  /** Peut contenir `{region}` (Scaleway) — substitué par `buildUrl`. */
  baseUrl: string
  sendPath: string
  /**
   * Sonde d'auth GET idempotente, SANS quota. OPTIONNEL (amendement revue
   * delta 2) : absent → `verify()` résout `true` (skip), la validation
   * repose alors sur l'envoi de test (Sweego notamment).
   */
  verifyPath?: string
  buildAuthHeaders: (cred: Record<string, string>) => Record<string, string>
  buildSendPayload: (mail: NormalizedMail, cred: Record<string, string>) => unknown
  /** Défaut : `baseUrl + path`. Scaleway injecte `{region}` + `project_id`. */
  buildUrl?: (path: string, cred: Record<string, string>) => string
  /** Surcharge le mapping d'erreurs par défaut pour une réponse non-2xx
   *  donnée (y compris un 429 finalement épuisé). */
  parseError?: (status: number, body: unknown) => { code: TransportErrorCode; message: string }
  /**
   * Idempotence NON standard (Resend seul l'honore aujourd'hui). Opt-in par
   * descripteur (amendement revue delta 3) ; absent → aucune clé
   * d'idempotence envoyée (double-envoi possible sur retry — acté par
   * fournisseur).
   */
  idempotency?: { header: string }
  /** Débit/concurrence par fournisseur (amendement revue delta 4). Défauts
   *  moteur : concurrence 2, retries 3. */
  maxConcurrency?: number
  maxRetries?: number
}
