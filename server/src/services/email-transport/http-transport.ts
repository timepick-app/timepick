/**
 * Chantier email-providers (B1) — moteur HTTP générique (contrat §3.2),
 * extrait de `resend-transport.ts` (chantier C, non modifié — B2 y branchera
 * un descripteur au lieu de sa logique actuelle). Un transport nodemailer
 * est un simple objet `{ name, version, send(mail, cb), verify(cb) }` — il
 * n'existe pas de transport officiel pour ces fournisseurs.
 * IMPORTANT (vérifié nodemailer 9.0.3, lib/mailer/index.js:101-121) :
 * `transporter.verify()` DÉLÈGUE au transport SI la méthode existe, sinon
 * renvoie `false` sans promesse — `verify` DOIT donc exister et supporter le
 * double mode promesse/callback.
 *
 * Le moteur ne connaît RIEN d'un fournisseur particulier : il reçoit un
 * `ProviderHttpSpec` (§3.2, `types.ts`) + les `credentials` du fournisseur
 * courant, et délègue au descripteur la construction des headers d'auth, de
 * l'URL et du payload d'envoi (`buildAuthHeaders`/`buildUrl`/`buildSendPayload`).
 *
 * Concurrence + retry 429 sont gérés ICI, pas côté consommateurs : les envois
 * parallélisés par Promise.allSettled (invitations, modifications de créneau)
 * sérialisent au niveau HTTP via un sémaphore FIFO interne à l'instance —
 * p-limit est ESM-only et casserait ts-jest CommonJS, d'où le sémaphore
 * écrit à la main ci-dessous (repris tel quel de resend-transport.ts).
 *
 * NB `new Promise(resolve => setTimeout(...))` (backoff) : `Promise.withResolvers`
 * n'est pas dans la lib TS configurée ici (target es2016), d'où la forme
 * executor classique.
 */

import { createHash } from 'crypto'
import type { MailAddress, NormalizedMail, ProviderHttpSpec, TransportErrorCode } from './types'
import { flattenAddress, flattenAddresses } from './types'

/** Aligné sur les timeouts SMTP (connection/greeting/socket = 10 s) — sans
 *  lui, fetch retombe sur les défauts undici (~300 s) et un hang API
 *  retiendrait un permis du sémaphore pendant toute cette durée. */
const REQUEST_TIMEOUT_MS = 10_000

/** Plafond défensif sur `Retry-After` : le permis du sémaphore est retenu
 *  pendant le backoff (throttle délibéré) — sans borne, un en-tête absurde
 *  (ex. 3600) gèlerait un slot pendant des heures. */
const MAX_RETRY_AFTER_MS = 30_000

/** Défauts moteur (amendement revue delta 4) — surchargeables par descripteur
 *  via `spec.maxConcurrency`/`spec.maxRetries`. */
const DEFAULT_MAX_CONCURRENCY = 2
const DEFAULT_MAX_RETRIES = 3

/**
 * `Retry-After` (RFC 7231) : soit un délai en secondes, soit une HTTP-date.
 * Retourne le délai d'attente en ms borné à MAX_RETRY_AFTER_MS, ou null si
 * l'en-tête est absent/invalide/négatif → l'appelant retombe sur le backoff
 * exponentiel.
 */
function retryAfterDelayMs(header: string | null): number | null {
  if (!header) return null
  const seconds = Number(header)
  if (Number.isFinite(seconds)) {
    return seconds >= 0 ? Math.min(seconds * 1000, MAX_RETRY_AFTER_MS) : null
  }
  const dateMs = Date.parse(header)
  if (Number.isFinite(dateMs)) {
    return Math.min(Math.max(dateMs - Date.now(), 0), MAX_RETRY_AFTER_MS)
  }
  return null
}

function transportError(code: TransportErrorCode, message: string): Error {
  return Object.assign(new Error(message), { code })
}

// ---------------------------------------------------------------------------
// Adresses — parsing du format nodemailer brut (`mail.data`) vers
// NormalizedMail (adresses structurées, amendement revue delta 5).
// ---------------------------------------------------------------------------

type RawAddress = string | MailAddress

/** Parse une adresse nodemailer brute — chaîne `"Nom" <addr>` / `Nom <addr>` /
 *  `addr` seul, ou objet déjà structuré `{name?, address}` — en `MailAddress`. */
function parseAddress(raw: RawAddress): MailAddress {
  if (typeof raw !== 'string') return raw
  const match = raw.match(/^\s*(?:"?([^"<]*?)"?\s*)?<([^>]+)>\s*$/)
  if (!match) return { address: raw.trim() }
  const name = match[1]?.trim()
  return name ? { name, address: match[2].trim() } : { address: match[2].trim() }
}

interface RawMailData {
  from?: RawAddress
  to?: RawAddress | RawAddress[]
  subject?: string
  html?: string
  text?: string
}

function normalizeMail(data: RawMailData): NormalizedMail {
  const toList = data.to ? (Array.isArray(data.to) ? data.to : [data.to]) : []
  return {
    from: data.from ? parseAddress(data.from) : undefined,
    to: toList.map(parseAddress),
    subject: data.subject,
    html: data.html,
    text: data.text,
  }
}

// ---------------------------------------------------------------------------
// Sémaphore FIFO minimal — borne le nombre de requêtes HTTP simultanées vers
// l'API du fournisseur à `max`. File d'attente = tableau de résolveurs,
// servie dans l'ordre d'arrivée (FIFO).
// ---------------------------------------------------------------------------

class Semaphore {
  private available: number
  private readonly queue: Array<() => void> = []

  constructor(max: number) {
    this.available = max
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    await this.acquire()
    try {
      return await task()
    } finally {
      this.release()
    }
  }

  private acquire(): Promise<void> {
    if (this.available > 0) {
      this.available--
      return Promise.resolve()
    }
    return new Promise(resolve => this.queue.push(resolve))
  }

  private release(): void {
    const next = this.queue.shift()
    if (next) next()
    else this.available++
  }
}

async function extractJsonBody(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

function extractApiMessage(body: unknown): string | null {
  if (body && typeof body === 'object' && 'message' in body && typeof body.message === 'string') {
    return body.message
  }
  return null
}

/** Extrait un identifiant de message de la réponse JSON d'envoi — les
 *  fournisseurs varient (`id` chez Resend, `messageId` ailleurs) ; '' si
 *  aucun des deux champs connus n'est présent (jamais bloquant). */
function extractMessageId(result: unknown): string {
  if (!result || typeof result !== 'object') return ''
  if ('id' in result && typeof result.id === 'string') return result.id
  if ('messageId' in result && typeof result.messageId === 'string') return result.messageId
  return ''
}

/**
 * Requête HTTP authentifiée générique, avec retry+backoff sur 429
 * UNIQUEMENT. Mapping erreurs par défaut (contrat §3.2/§4) : 401/403 →
 * EAUTH ; erreur réseau (fetch rejette) ou 5xx → ECONNECTION (déclenche le
 * retry-rebuild existant de sendMailWithFallback) ; autres 4xx → EMESSAGE
 * (pas de retry) ; 429 épuisé → ERATELIMIT. `parseError`, si fourni par le
 * descripteur, REMPLACE ce mapping par défaut pour toute réponse non-2xx (y
 * compris le 429 finalement épuisé). Le message d'erreur porte le statut +
 * le message API, JAMAIS la clé/le secret (les headers d'auth ne sont
 * jamais interpolés dans un message d'erreur).
 */
async function requestHttp(
  fullUrl: string,
  headers: Record<string, string>,
  init: { method: 'GET' | 'POST'; body?: string },
  maxRetries: number,
  parseError: ProviderHttpSpec['parseError'],
): Promise<unknown> {
  let attempt = 0
  for (;;) {
    let response: Response
    try {
      response = await fetch(fullUrl, {
        method: init.method,
        body: init.body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers,
      })
    } catch (networkErr) {
      const isTimeout = networkErr instanceof Error && networkErr.name === 'TimeoutError'
      throw transportError('ECONNECTION', isTimeout
        ? `Délai fournisseur dépassé (${REQUEST_TIMEOUT_MS / 1000}s sans réponse)`
        : `Erreur réseau fournisseur: ${networkErr instanceof Error ? networkErr.message : 'inconnue'}`)
    }

    if (response.ok) {
      if (response.status === 204) return null
      return response.json().catch(() => null)
    }

    if (response.status === 429) {
      if (attempt >= maxRetries) {
        const body = await extractJsonBody(response)
        const mapped = parseError?.(429, body)
        throw transportError(
          mapped?.code ?? 'ERATELIMIT',
          mapped?.message ?? `Limite de débit atteinte après ${maxRetries} tentative(s) de retry`,
        )
      }
      // Retry-After (secondes OU HTTP-date, RFC 7231) honoré si valide, sinon backoff exponentiel.
      const waitMs = retryAfterDelayMs(response.headers.get('retry-after')) ?? 500 * 2 ** attempt
      await new Promise(resolve => setTimeout(resolve, waitMs))
      attempt++
      continue
    }

    const body = await extractJsonBody(response)
    const mapped = parseError?.(response.status, body)
    if (mapped) throw transportError(mapped.code, mapped.message)

    const apiMessage = extractApiMessage(body)
    const suffix = apiMessage ? `: ${apiMessage}` : ''
    if (response.status === 401 || response.status === 403) {
      throw transportError('EAUTH', `Authentification refusée (${response.status})${suffix}`)
    }
    if (response.status >= 500) {
      throw transportError('ECONNECTION', `Erreur serveur (${response.status})${suffix}`)
    }
    throw transportError('EMESSAGE', `Requête rejetée (${response.status})${suffix}`)
  }
}

/**
 * Clé d'idempotence opt-in (amendement revue delta 3) — neutralise le
 * DOUBLE ENVOI quand la réponse d'un POST accepté se perd : un retry
 * ECONNECTION reconstruit le transport puis re-poste le MÊME contenu →
 * même clé → le fournisseur renvoie la réponse d'origine sans renvoyer
 * l'email. Hash du payload + tranche de 5 min : le rejeu immédiat (secondes)
 * partage la clé ; un rejeu qui franchit la frontière de tranche perd la
 * protection — résidu accepté (identique au comportement historique
 * `resend-transport.ts`).
 */
function idempotencyKeyFor(body: string, now = Date.now()): string {
  const bucket = Math.floor(now / 300_000)
  return `tp-${createHash('sha256').update(`${bucket}:${body}`).digest('hex')}`
}

interface SendInfo {
  messageId: string
  envelope: { from?: string; to: string[] }
}

export interface HttpTransport {
  name: string
  version: string
  send(mail: { data: RawMailData }, callback: (err: Error | null, info?: SendInfo) => void): void
  verify(callback?: (err: Error | null, success?: true) => void): void | Promise<true>
  close(): void
}

/**
 * Construit un transport nodemailer-shaped pour un fournisseur HTTP donné.
 * `spec` décrit le fournisseur (contrat §3.2) ; `credentials` = les champs
 * déjà déchiffrés du fournisseur courant (cf.
 * `db/email-provider.db.ts#getEmailProviderConfig`).
 */
export function createHttpTransport(spec: ProviderHttpSpec, credentials: Record<string, string>): HttpTransport {
  const maxRetries = spec.maxRetries ?? DEFAULT_MAX_RETRIES
  const semaphore = new Semaphore(Math.max(1, spec.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY))

  const resolveUrl = (path: string): string => (spec.buildUrl ? spec.buildUrl(path, credentials) : `${spec.baseUrl}${path}`)

  const doVerify = async (): Promise<true> => {
    // Amendement revue delta 2 : verifyPath optionnel → skip (true) si absent.
    if (!spec.verifyPath) return true
    await semaphore.run(() =>
      requestHttp(resolveUrl(spec.verifyPath!), spec.buildAuthHeaders(credentials), { method: 'GET' }, maxRetries, spec.parseError),
    )
    return true
  }

  return {
    name: spec.id,
    version: '1.0.0',

    send(mail, callback) {
      const normalized = normalizeMail(mail.data)
      if (normalized.to.length === 0) {
        // Erreur locale immédiate : pas d'aller-retour HTTP ni de slot de
        // sémaphore consommé pour un message sans destinataire.
        callback(transportError('EMESSAGE', 'Destinataire manquant (mail.data.to vide)'))
        return
      }
      const payload = spec.buildSendPayload(normalized, credentials)
      const body = JSON.stringify(payload)
      // Amendement revue delta 3 : idempotence opt-in — aucune clé envoyée
      // si le descripteur ne déclare pas `idempotency`.
      const idempotencyKey = spec.idempotency ? idempotencyKeyFor(body) : undefined
      const headers: Record<string, string> = {
        ...spec.buildAuthHeaders(credentials),
        'Content-Type': 'application/json',
        ...(idempotencyKey && spec.idempotency ? { [spec.idempotency.header]: idempotencyKey } : {}),
      }
      void semaphore
        .run(() => requestHttp(resolveUrl(spec.sendPath), headers, { method: 'POST', body }, maxRetries, spec.parseError))
        .then(
          // Forme à deux arguments (comme verify) : un throw du callback de
          // succès ne doit JAMAIS ré-invoquer callback(err) — cb exactement 1×.
          result => {
            const messageId = extractMessageId(result)
            callback(null, {
              messageId,
              envelope: { from: normalized.from?.address, to: normalized.to.map(a => a.address) },
            })
          },
          (err: unknown) => callback(err instanceof Error ? err : new Error(String(err))),
        )
    },

    verify(callback?: (err: Error | null, success?: true) => void): void | Promise<true> {
      if (typeof callback !== 'function') return doVerify()
      doVerify().then(
        () => callback(null, true),
        (err: unknown) => callback(err instanceof Error ? err : new Error(String(err))),
      )
    },

    close() {
      // Transport HTTP sans connexion persistante — no-op toléré par le
      // cache existant (try { close() } catch en cas de méthode absente).
    },
  }
}

// Ré-export pour un point d'entrée unique côté descripteurs (B2) :
// `import { createHttpTransport, flattenAddress, type ProviderHttpSpec } from '.../http-transport'`.
export { flattenAddress, flattenAddresses }
export type { MailAddress, NormalizedMail, ProviderHttpSpec, TransportErrorCode }
