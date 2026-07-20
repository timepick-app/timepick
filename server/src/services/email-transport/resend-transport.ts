/**
 * Chantier C — transport nodemailer custom pour Resend (contrat de barrière §4).
 *
 * Un transport nodemailer est un simple objet `{ name, version, send(mail, cb),
 * verify(cb?) }` — il n'existe pas de transport officiel Resend pour nodemailer.
 * IMPORTANT (vérifié nodemailer 9.0.3, lib/mailer/index.js:101-121) :
 * `transporter.verify()` DÉLÈGUE au transport SI la méthode existe, sinon
 * renvoie `false` sans promesse — `verify` DOIT donc exister et supporter le
 * double mode promesse/callback, à l'image de smtp-transport. C'est LE
 * remplacement du verify() SMTP : un vrai GET authentifié qui échoue sur
 * mauvaise clé (jamais de fausse réassurance).
 *
 * Périmètre réel de l'app (email-send.service.ts, 9 fonctions d'envoi) :
 * `mail.data` = { from, to, subject, html, text } — jamais de pièces jointes.
 *
 * Concurrence + retry 429 sont gérés ICI, pas côté consommateurs : les envois
 * parallélisés par Promise.allSettled (invitations, modifications de créneau)
 * sérialisent au niveau HTTP via un sémaphore FIFO interne à l'instance —
 * p-limit est ESM-only et casserait ts-jest CommonJS (contrat §1/§8), d'où le
 * sémaphore écrit à la main ci-dessous.
 *
 * NB `new Promise(resolve => setTimeout(...))` (backoff) : `Promise.withResolvers`
 * n'est pas dans la lib TS configurée ici (target es2016, pas de `lib` ES2024
 * — vérifié, `tsc --noEmit` échoue sinon), donc forme executor classique.
 */

import { createHash } from 'crypto'

/** Aligné sur les timeouts SMTP (connection/greeting/socket = 10 s) — sans lui,
 *  fetch retombe sur les défauts undici (~300 s) et un hang API retiendrait un
 *  permis du sémaphore pendant toute cette durée. */
const REQUEST_TIMEOUT_MS = 10_000

/** Plafond défensif sur `Retry-After` : le permis du sémaphore est retenu
 *  pendant le backoff (throttle délibéré) — sans borne, un en-tête absurde
 *  (ex. 3600) gèlerait les deux slots pendant des heures. */
const MAX_RETRY_AFTER_MS = 30_000

export interface ResendTransportOptions {
  apiKey: string
  /** Défaut 'https://api.resend.com'. Surchargeable (tests/smoke mock). */
  baseUrl?: string
  /** Requêtes HTTP simultanées max vers l'API (rate limit Resend ~2 req/s). Défaut 2. */
  maxConcurrency?: number
  /** Tentatives de retry max sur 429 UNIQUEMENT. Défaut 3. */
  maxRetries?: number
}

type ResendAddress = string | { name?: string; address: string }

interface ResendMailData {
  from?: ResendAddress
  to?: ResendAddress | ResendAddress[]
  subject?: string
  html?: string
  text?: string
}

interface ResendMailMessage {
  data: ResendMailData
}

interface ResendSendInfo {
  messageId: string
  envelope: { from?: string; to: string[] }
}

export interface ResendTransport {
  name: 'Resend'
  version: string
  send(mail: ResendMailMessage, callback: (err: Error | null, info?: ResendSendInfo) => void): void
  verify(callback?: (err: Error | null, success?: true) => void): void | Promise<true>
  close(): void
}

type TransportErrorCode = 'EAUTH' | 'ECONNECTION' | 'EMESSAGE' | 'ERATELIMIT'

/** Fabrique une erreur nodemailer-shaped (code + message) — 5 sites de throw
 *  dans requestResend() ci-dessous doivent produire la même forme. */
function transportError(code: TransportErrorCode, message: string): Error {
  return Object.assign(new Error(message), { code })
}

function normalizeAddress(addr: ResendAddress): string {
  if (typeof addr === 'string') return addr
  return addr.name ? `${addr.name} <${addr.address}>` : addr.address
}

interface ResendEmailPayload {
  from?: string
  to: string[]
  subject?: string
  html?: string
  text?: string
}

function buildEmailPayload(data: ResendMailData): ResendEmailPayload {
  const to = data.to ? (Array.isArray(data.to) ? data.to : [data.to]).map(normalizeAddress) : []
  return {
    from: data.from ? normalizeAddress(data.from) : undefined,
    to,
    subject: data.subject,
    html: data.html,
    text: data.text,
  }
}

/**
 * Sémaphore FIFO minimal — borne le nombre de requêtes HTTP simultanées vers
 * l'API Resend à `max`. File d'attente = tableau de résolveurs, servie dans
 * l'ordre d'arrivée (FIFO).
 */
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

async function extractApiMessage(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as { message?: string } | null
    return body && typeof body.message === 'string' ? body.message : null
  } catch {
    return null
  }
}

/**
 * Requête authentifiée vers l'API Resend, avec retry+backoff sur 429
 * UNIQUEMENT. Mapping erreurs (contrat §4) : 401/403 → EAUTH ; erreur réseau
 * (fetch rejette) ou 5xx → ECONNECTION (déclenche le retry-rebuild existant
 * de sendMailWithFallback) ; autres 4xx → EMESSAGE (pas de retry). Le message
 * d'erreur porte le statut + le message API, JAMAIS la clé.
 */
async function requestResend(
  baseUrl: string,
  apiKey: string,
  path: string,
  init: { method: 'GET' | 'POST'; body?: string; idempotencyKey?: string },
  maxRetries: number,
): Promise<unknown> {
  let attempt = 0
  for (;;) {
    let response: Response
    try {
      response = await fetch(`${baseUrl}${path}`, {
        method: init.method,
        body: init.body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
          ...(init.idempotencyKey ? { 'Idempotency-Key': init.idempotencyKey } : {}),
        },
      })
    } catch (networkErr) {
      const isTimeout = networkErr instanceof Error && networkErr.name === 'TimeoutError'
      throw transportError('ECONNECTION', isTimeout
        ? `Délai Resend dépassé (${REQUEST_TIMEOUT_MS / 1000}s sans réponse)`
        : `Erreur réseau Resend: ${networkErr instanceof Error ? networkErr.message : 'inconnue'}`)
    }

    if (response.ok) {
      if (response.status === 204) return null
      return response.json().catch(() => null)
    }

    if (response.status === 429) {
      if (attempt >= maxRetries) {
        throw transportError('ERATELIMIT', `Limite de débit Resend atteinte après ${maxRetries} tentative(s) de retry`)
      }
      const retryAfterHeader = response.headers.get('retry-after')
      const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : NaN
      const waitMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0
        ? Math.min(retryAfterSeconds * 1000, MAX_RETRY_AFTER_MS)
        : 500 * 2 ** attempt
      await new Promise(resolve => setTimeout(resolve, waitMs))
      attempt++
      continue
    }

    const apiMessage = await extractApiMessage(response)
    const suffix = apiMessage ? `: ${apiMessage}` : ''
    if (response.status === 401 || response.status === 403) {
      throw transportError('EAUTH', `Clé API Resend refusée (${response.status})${suffix}`)
    }
    if (response.status >= 500) {
      throw transportError('ECONNECTION', `Erreur serveur Resend (${response.status})${suffix}`)
    }
    throw transportError('EMESSAGE', `Requête Resend rejetée (${response.status})${suffix}`)
  }
}

/**
 * Clé d'idempotence Resend (POST /emails) — neutralise le DOUBLE ENVOI quand la
 * réponse d'un POST accepté se perd : `sendMailWithFallback` rejoue les
 * ECONNECTION avec un transport reconstruit, qui re-poste le MÊME contenu →
 * même clé → Resend renvoie la réponse d'origine sans renvoyer l'email.
 * Hash du payload + tranche de 5 min : le rejeu immédiat (secondes) partage la
 * clé ; deux envois volontairement identiques (ex. email de test re-cliqué
 * plus tard) ne sont pas dédoublonnés au-delà de la tranche (la fenêtre Resend
 * seule serait de 24 h). Un rejeu qui franchit la frontière de tranche perd la
 * protection — fenêtre de quelques secondes sur 300, résidu accepté.
 */
function idempotencyKeyFor(body: string, now = Date.now()): string {
  const bucket = Math.floor(now / 300_000)
  return `tp-${createHash('sha256').update(`${bucket}:${body}`).digest('hex')}`
}

export function createResendTransport(opts: ResendTransportOptions): ResendTransport {
  const apiKey = opts.apiKey
  const baseUrl = opts.baseUrl && opts.baseUrl.trim() ? opts.baseUrl : 'https://api.resend.com'
  const maxRetries = opts.maxRetries ?? 3
  const semaphore = new Semaphore(opts.maxConcurrency ?? 2)

  const doVerify = async (): Promise<true> => {
    await semaphore.run(() => requestResend(baseUrl, apiKey, '/domains', { method: 'GET' }, maxRetries))
    return true
  }

  return {
    name: 'Resend',
    version: '1.0.0',

    send(mail, callback) {
      const payload = buildEmailPayload(mail.data)
      if (payload.to.length === 0) {
        // Erreur locale immédiate : pas d'aller-retour HTTP ni de slot de
        // sémaphore consommé pour un message sans destinataire.
        callback(transportError('EMESSAGE', 'Destinataire manquant (mail.data.to vide)'))
        return
      }
      const body = JSON.stringify(payload)
      const idempotencyKey = idempotencyKeyFor(body)
      void semaphore
        .run(() => requestResend(baseUrl, apiKey, '/emails', { method: 'POST', body, idempotencyKey }, maxRetries))
        .then(
          // Forme à deux arguments (comme verify) : un throw du callback de
          // succès ne doit JAMAIS ré-invoquer callback(err) — cb exactement 1×.
          result => {
            const id = (result as { id?: string } | null)?.id ?? ''
            callback(null, { messageId: id, envelope: { from: payload.from, to: payload.to } })
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
      // Transport HTTP sans connexion persistante — no-op toléré par le cache
      // existant (try { close() } catch en cas de méthode absente/qui jette).
    },
  }
}
