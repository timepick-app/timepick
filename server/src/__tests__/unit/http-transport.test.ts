import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals'

import { createHttpTransport } from '../../services/email-transport/http-transport'
import { flattenAddress, flattenAddresses, type ProviderHttpSpec } from '../../services/email-transport/types'

// ---------------------------------------------------------------------------
// Fixture — descripteur générique "resend-like" (baseUrl mock, /emails +
// /domains, auth Bearer, idempotence opt-in). Repris de resend-transport.test.ts
// (chantier C) : le moteur (`http-transport.ts`) doit se comporter à
// l'identique pour ce descripteur, PLUS les cas génériques introduits par le
// contrat §3.2 (verifyPath optionnel, idempotence opt-in, buildUrl custom).
// ---------------------------------------------------------------------------

function makeSpec(overrides: Partial<ProviderHttpSpec> = {}): ProviderHttpSpec {
  return {
    id: 'test-provider',
    baseUrl: 'https://mock.test',
    sendPath: '/emails',
    verifyPath: '/domains',
    buildAuthHeaders: cred => ({ Authorization: `Bearer ${cred.apiKey}` }),
    buildSendPayload: mail => ({
      from: mail.from ? flattenAddress(mail.from) : undefined,
      to: flattenAddresses(mail.to),
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    }),
    idempotency: { header: 'Idempotency-Key' },
    ...overrides,
  }
}

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
    json: async () => body,
  } as unknown as Response
}

function mailMessage(to: string | string[], overrides: Partial<{ from: string; subject: string; html: string; text: string }> = {}) {
  return {
    data: {
      from: overrides.from ?? '"TimePick" <noreply@example.com>',
      to,
      subject: overrides.subject ?? 'Sujet de test',
      html: overrides.html ?? '<p>Bonjour</p>',
      text: overrides.text ?? 'Bonjour',
    },
  }
}

/**
 * Laisse la chaîne de microtâches (acquire sémaphore → fetch → .then/.catch)
 * se dérouler entièrement. `setImmediate` s'exécute après que la queue de
 * microtâches est vidée — plus fiable qu'un nombre fixe de `await Promise.resolve()`.
 */
async function flush(): Promise<void> {
  await new Promise(resolve => setImmediate(resolve))
}

type CallbackMock = jest.Mock<(err: Error | null, info?: { messageId: string; envelope: { from?: string; to: string[] } }) => void>

describe('createHttpTransport (moteur générique, contrat §3.2)', () => {
  let mockFetch: jest.Mock<(...args: unknown[]) => Promise<Response>>

  beforeEach(() => {
    mockFetch = jest.fn<(...args: unknown[]) => Promise<Response>>()
    jest.spyOn(globalThis, 'fetch').mockImplementation(mockFetch as unknown as typeof fetch)
  })

  afterEach(() => {
    jest.restoreAllMocks()
    jest.useRealTimers()
  })

  // -----------------------------------------------------------------------
  // send() — payload, adresses, URL, headers d'auth (délégués au descripteur)
  // -----------------------------------------------------------------------

  describe('send() — succès et payload (délégué au descripteur)', () => {
    it('T1: POST sendPath avec payload construit par buildSendPayload + auth par buildAuthHeaders + Content-Type JSON', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(200, { id: 'msg-123' }))

      const transport = createHttpTransport(makeSpec(), { apiKey: 'key-abc' })
      const cb: CallbackMock = jest.fn()
      transport.send(mailMessage('dest@example.com', { from: '"TimePick" <from@example.com>' }), cb)
      await flush()

      expect(mockFetch).toHaveBeenCalledTimes(1)
      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
      expect(url).toBe('https://mock.test/emails')
      expect(init.method).toBe('POST')
      expect(init.headers).toMatchObject({ Authorization: 'Bearer key-abc', 'Content-Type': 'application/json' })
      expect(JSON.parse(init.body as string)).toEqual({
        from: 'TimePick <from@example.com>',
        to: ['dest@example.com'],
        subject: 'Sujet de test',
        html: '<p>Bonjour</p>',
        text: 'Bonjour',
      })

      expect(cb).toHaveBeenCalledWith(null, {
        messageId: 'msg-123',
        envelope: { from: 'from@example.com', to: ['dest@example.com'] },
      })
    })

    it('T2: to (chaîne unique) est toujours envoyé comme tableau', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(200, { id: 'x' }))
      const transport = createHttpTransport(makeSpec(), { apiKey: 'k' })
      transport.send(mailMessage('single@example.com'), jest.fn())
      await flush()

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
      expect(JSON.parse(init.body as string).to).toEqual(['single@example.com'])
    })

    it('T3: to déjà en tableau est préservé tel quel', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(200, { id: 'x' }))
      const transport = createHttpTransport(makeSpec(), { apiKey: 'k' })
      transport.send(mailMessage(['a@example.com', 'b@example.com']), jest.fn())
      await flush()

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
      expect(JSON.parse(init.body as string).to).toEqual(['a@example.com', 'b@example.com'])
    })

    it('T4: adresses structurées {name, address} passées directement (sans parsing chaîne) sont aplaties via buildSendPayload', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(200, { id: 'x' }))
      const transport = createHttpTransport(makeSpec(), { apiKey: 'k' })
      const mail = { data: { from: { name: 'Struct', address: 'struct@example.com' }, to: [{ address: 'dest@example.com' }], subject: 's', html: 'h', text: 't' } }
      transport.send(mail, jest.fn())
      await flush()

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
      expect(JSON.parse(init.body as string)).toMatchObject({ from: 'Struct <struct@example.com>', to: ['dest@example.com'] })
    })

    it("T5: buildUrl du descripteur surcharge la concaténation par défaut (ex. région dans l'URL)", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(200, { id: 'x' }))
      const spec = makeSpec({
        baseUrl: 'https://api.example.com/regions/{region}',
        buildUrl: (path, cred) => `https://api.example.com/regions/${cred.region}${path}`,
      })
      const transport = createHttpTransport(spec, { apiKey: 'k', region: 'fr-par' })
      transport.send(mailMessage('a@example.com'), jest.fn())
      await flush()

      const [url] = mockFetch.mock.calls[0] as [string]
      expect(url).toBe('https://api.example.com/regions/fr-par/emails')
    })
  })

  // -----------------------------------------------------------------------
  // send() — mapping erreurs par défaut (contrat §3.2/§4)
  // -----------------------------------------------------------------------

  describe('send() — mapping erreurs par défaut', () => {
    it('T6: 401 → code EAUTH', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(401, { message: 'Invalid API key' }))
      const transport = createHttpTransport(makeSpec(), { apiKey: 'bad-key' })
      const cb: CallbackMock = jest.fn()
      transport.send(mailMessage('a@example.com'), cb)
      await flush()

      expect(cb).toHaveBeenCalledTimes(1)
      const err = cb.mock.calls[0][0] as (Error & { code?: string }) | null
      expect(err).toBeInstanceOf(Error)
      expect(err?.code).toBe('EAUTH')
      expect(err?.message).toContain('401')
    })

    it('T7: 403 → code EAUTH', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(403, { message: 'Forbidden' }))
      const transport = createHttpTransport(makeSpec(), { apiKey: 'k' })
      const cb: CallbackMock = jest.fn()
      transport.send(mailMessage('a@example.com'), cb)
      await flush()

      const err = cb.mock.calls[0][0] as (Error & { code?: string }) | null
      expect(err?.code).toBe('EAUTH')
    })

    it('T8: erreur réseau (fetch rejette) → code ECONNECTION', async () => {
      mockFetch.mockRejectedValueOnce(new Error('getaddrinfo ENOTFOUND'))
      const transport = createHttpTransport(makeSpec(), { apiKey: 'k' })
      const cb: CallbackMock = jest.fn()
      transport.send(mailMessage('a@example.com'), cb)
      await flush()

      const err = cb.mock.calls[0][0] as (Error & { code?: string }) | null
      expect(err?.code).toBe('ECONNECTION')
    })

    it('T9: timeout (AbortSignal.timeout déclenché, fetch rejette TimeoutError) → ECONNECTION, message dédié', async () => {
      const timeoutErr = Object.assign(new Error('The operation was aborted'), { name: 'TimeoutError' })
      mockFetch.mockRejectedValueOnce(timeoutErr)
      const transport = createHttpTransport(makeSpec(), { apiKey: 'k' })
      const cb: CallbackMock = jest.fn()
      transport.send(mailMessage('a@example.com'), cb)
      await flush()

      const err = cb.mock.calls[0][0] as (Error & { code?: string }) | null
      expect(err?.code).toBe('ECONNECTION')
      expect(err?.message).toMatch(/Délai fournisseur dépassé/)
    })

    it('T10: 500 → code ECONNECTION (déclenche le retry-rebuild de sendMailWithFallback)', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(500, { message: 'Internal error' }))
      const transport = createHttpTransport(makeSpec(), { apiKey: 'k' })
      const cb: CallbackMock = jest.fn()
      transport.send(mailMessage('a@example.com'), cb)
      await flush()

      const err = cb.mock.calls[0][0] as (Error & { code?: string }) | null
      expect(err?.code).toBe('ECONNECTION')
    })

    it('T11: 400 (autre 4xx) → code EMESSAGE, pas de retry', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(400, { message: 'Invalid `to` field' }))
      const transport = createHttpTransport(makeSpec(), { apiKey: 'k' })
      const cb: CallbackMock = jest.fn()
      transport.send(mailMessage('a@example.com'), cb)
      await flush()

      expect(mockFetch).toHaveBeenCalledTimes(1)
      const err = cb.mock.calls[0][0] as (Error & { code?: string }) | null
      expect(err?.code).toBe('EMESSAGE')
      expect(err?.message).toContain('Invalid `to` field')
    })

    it("T12: parseError du descripteur REMPLACE le mapping par défaut", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(422, { error: 'unprocessable' }))
      const spec = makeSpec({
        parseError: (status, body) => ({
          code: 'EMESSAGE',
          message: `Custom(${status}): ${(body as { error?: string })?.error ?? '?'}`,
        }),
      })
      const transport = createHttpTransport(spec, { apiKey: 'k' })
      const cb: CallbackMock = jest.fn()
      transport.send(mailMessage('a@example.com'), cb)
      await flush()

      const err = cb.mock.calls[0][0] as (Error & { code?: string }) | null
      expect(err?.message).toBe('Custom(422): unprocessable')
    })

    it('T13: la clé/le secret n’apparaissent jamais dans un message d’erreur', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(401, { message: 'Invalid API key' }))
      const transport = createHttpTransport(makeSpec(), { apiKey: 'sk_live_super_secret_12345' })
      const cb: CallbackMock = jest.fn()
      transport.send(mailMessage('a@example.com'), cb)
      await flush()

      // La clé a bien été utilisée pour authentifier la requête...
      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk_live_super_secret_12345')
      // ...mais ne fuite jamais dans le message d'erreur retourné à l'appelant.
      const err = cb.mock.calls[0][0] as Error | null
      expect(err?.message).not.toContain('sk_live_super_secret_12345')
    })
  })

  // -----------------------------------------------------------------------
  // Retry 429 + backoff
  // -----------------------------------------------------------------------

  describe('send() — retry 429 avec backoff (contrat §4)', () => {
    it('T14: 429 puis succès → un seul retry, callback succès', async () => {
      jest.useFakeTimers()
      mockFetch
        .mockResolvedValueOnce(jsonResponse(429, {}))
        .mockResolvedValueOnce(jsonResponse(200, { id: 'ok-after-retry' }))

      const transport = createHttpTransport(makeSpec(), { apiKey: 'k' })
      const cb: CallbackMock = jest.fn()
      transport.send(mailMessage('a@example.com'), cb)

      await jest.advanceTimersByTimeAsync(0)
      await jest.advanceTimersByTimeAsync(600) // > 500ms (500 * 2^0)

      expect(mockFetch).toHaveBeenCalledTimes(2)
      expect(cb).toHaveBeenCalledWith(null, expect.objectContaining({ messageId: 'ok-after-retry' }))
    })

    it('T15: 429 répété au-delà de maxRetries (spec.maxRetries) → code ERATELIMIT', async () => {
      jest.useFakeTimers()
      mockFetch
        .mockResolvedValueOnce(jsonResponse(429, {}))
        .mockResolvedValueOnce(jsonResponse(429, {}))

      const transport = createHttpTransport(makeSpec({ maxRetries: 1 }), { apiKey: 'k' })
      const cb: CallbackMock = jest.fn()
      transport.send(mailMessage('a@example.com'), cb)

      await jest.advanceTimersByTimeAsync(0)
      await jest.advanceTimersByTimeAsync(600)

      expect(mockFetch).toHaveBeenCalledTimes(2) // 1 essai initial + 1 retry (maxRetries=1)
      const err = cb.mock.calls[0][0] as (Error & { code?: string }) | null
      expect(err?.code).toBe('ERATELIMIT')
    })

    it("T16: en-tête Retry-After (secondes) honoré au lieu du backoff exponentiel", async () => {
      jest.useFakeTimers()
      mockFetch
        .mockResolvedValueOnce(jsonResponse(429, {}, { 'retry-after': '2' }))
        .mockResolvedValueOnce(jsonResponse(200, { id: 'ok' }))

      const transport = createHttpTransport(makeSpec(), { apiKey: 'k' })
      const cb: CallbackMock = jest.fn()
      transport.send(mailMessage('a@example.com'), cb)

      await jest.advanceTimersByTimeAsync(0)
      // Le backoff par défaut (500ms) aurait déjà relancé ici si Retry-After n'était pas honoré.
      await jest.advanceTimersByTimeAsync(900)
      expect(mockFetch).toHaveBeenCalledTimes(1)

      // Retry-After=2s : à 2100ms cumulés, la relance a eu lieu.
      await jest.advanceTimersByTimeAsync(1300)
      expect(mockFetch).toHaveBeenCalledTimes(2)
      expect(cb).toHaveBeenCalledWith(null, expect.objectContaining({ messageId: 'ok' }))
    })

    it('T17: Retry-After absurde (3600s) plafonné à 30s (MAX_RETRY_AFTER_MS)', async () => {
      jest.useFakeTimers()
      mockFetch
        .mockResolvedValueOnce(jsonResponse(429, {}, { 'retry-after': '3600' }))
        .mockResolvedValueOnce(jsonResponse(200, { id: 'ok' }))

      const transport = createHttpTransport(makeSpec(), { apiKey: 'k' })
      const cb: CallbackMock = jest.fn()
      transport.send(mailMessage('a@example.com'), cb)

      await jest.advanceTimersByTimeAsync(0)
      // À 29s : toujours en attente (le plafond est 30s, pas 500ms — Retry-After reste honoré).
      await jest.advanceTimersByTimeAsync(29_000)
      expect(mockFetch).toHaveBeenCalledTimes(1)
      // À 30s+ : la relance a eu lieu — l'en-tête n'a PAS gelé le slot pendant 1h.
      await jest.advanceTimersByTimeAsync(1_100)
      expect(mockFetch).toHaveBeenCalledTimes(2)
      expect(cb).toHaveBeenCalledWith(null, expect.objectContaining({ messageId: 'ok' }))
    })

    it('T17b: Retry-After au format HTTP-date honoré (RFC 7231)', async () => {
      jest.useFakeTimers()
      jest.setSystemTime(new Date('2026-07-21T12:00:00Z'))
      const retryDate = new Date('2026-07-21T12:00:03Z').toUTCString() // +3 s
      mockFetch
        .mockResolvedValueOnce(jsonResponse(429, {}, { 'retry-after': retryDate }))
        .mockResolvedValueOnce(jsonResponse(200, { id: 'ok' }))

      const transport = createHttpTransport(makeSpec(), { apiKey: 'k' })
      const cb: CallbackMock = jest.fn()
      transport.send(mailMessage('a@example.com'), cb)

      await jest.advanceTimersByTimeAsync(0)
      // À 2 s : encore en attente (la date demande +3 s, pas le backoff 500 ms).
      await jest.advanceTimersByTimeAsync(2_000)
      expect(mockFetch).toHaveBeenCalledTimes(1)
      // À 3 s+ : la relance a eu lieu.
      await jest.advanceTimersByTimeAsync(1_100)
      expect(mockFetch).toHaveBeenCalledTimes(2)
      expect(cb).toHaveBeenCalledWith(null, expect.objectContaining({ messageId: 'ok' }))
    })
  })

  // -----------------------------------------------------------------------
  // Idempotence — opt-in par descripteur (amendement revue delta 3)
  // -----------------------------------------------------------------------

  describe('send() — idempotence opt-in (spec.idempotency)', () => {
    it("T18: header d'idempotence présent sur POST sendPath, absent sur GET verifyPath", async () => {
      mockFetch.mockResolvedValue(jsonResponse(200, { id: 'x', data: [] }))

      const transport = createHttpTransport(makeSpec(), { apiKey: 'k' })
      const cb: CallbackMock = jest.fn()
      transport.send(mailMessage('a@example.com'), cb)
      await flush()
      await transport.verify()

      const [, sendInit] = mockFetch.mock.calls[0] as [string, RequestInit]
      const [, verifyInit] = mockFetch.mock.calls[1] as [string, RequestInit]
      const sendHeaders = sendInit.headers as Record<string, string>
      const verifyHeaders = verifyInit.headers as Record<string, string>
      expect(sendHeaders['Idempotency-Key']).toMatch(/^tp-[0-9a-f]{64}$/)
      expect(verifyHeaders['Idempotency-Key']).toBeUndefined()
    })

    it('T19: même payload → même clé (rejeu dédoublonné), payload différent → clé différente', async () => {
      jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
      mockFetch.mockResolvedValue(jsonResponse(200, { id: 'x' }))

      // Deux INSTANCES distinctes : le retry ECONNECTION reconstruit le transport,
      // la clé doit être stable à travers les instances pour le même contenu.
      const spec = makeSpec()
      const t1 = createHttpTransport(spec, { apiKey: 'k' })
      const t2 = createHttpTransport(spec, { apiKey: 'k' })
      const cb: CallbackMock = jest.fn()
      t1.send(mailMessage('a@example.com'), cb)
      await flush()
      t2.send(mailMessage('a@example.com'), cb)
      await flush()
      t2.send(mailMessage('autre@example.com'), cb)
      await flush()

      const keys = mockFetch.mock.calls.map(call => ((call as [string, RequestInit])[1].headers as Record<string, string>)['Idempotency-Key'])
      expect(keys[0]).toBe(keys[1])
      expect(keys[2]).not.toBe(keys[0])
    })

    it("T20: spec.idempotency absent → AUCUNE clé d'idempotence envoyée (double-envoi possible sur retry, acté par fournisseur)", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(200, { id: 'x' }))
      const spec = makeSpec({ idempotency: undefined })
      const transport = createHttpTransport(spec, { apiKey: 'k' })
      transport.send(mailMessage('a@example.com'), jest.fn())
      await flush()

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
      expect(Object.keys(init.headers as Record<string, string>)).not.toContain('Idempotency-Key')
    })
  })

  // -----------------------------------------------------------------------
  // to vide
  // -----------------------------------------------------------------------

  it('T21: to vide → erreur locale EMESSAGE sans aucun appel réseau', async () => {
    const transport = createHttpTransport(makeSpec(), { apiKey: 'k' })
    const cb: CallbackMock = jest.fn()
    transport.send(mailMessage([]), cb)
    await flush()

    expect(mockFetch).not.toHaveBeenCalled()
    const err = cb.mock.calls[0][0] as (Error & { code?: string }) | null
    expect(err?.code).toBe('EMESSAGE')
    expect(err?.message).toMatch(/destinataire/i)
  })

  // -----------------------------------------------------------------------
  // verify()
  // -----------------------------------------------------------------------

  describe('verify() — GET verifyPath authentifié (remplacement du verify() SMTP)', () => {
    it('T22: 2xx → résout true (mode promesse)', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(200, { domains: [] }))
      const transport = createHttpTransport(makeSpec(), { apiKey: 'k' })

      await expect(transport.verify()).resolves.toBe(true)
      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
      expect(url).toBe('https://mock.test/domains')
      expect(init.method).toBe('GET')
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer k')
    })

    it('T23: 401 → rejette avec code EAUTH (mode promesse)', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(401, { message: 'Invalid API key' }))
      const transport = createHttpTransport(makeSpec(), { apiKey: 'bad' })

      await expect(transport.verify()).rejects.toMatchObject({ code: 'EAUTH' })
    })

    it('T24: erreur réseau → rejette avec code ECONNECTION (mode promesse)', async () => {
      mockFetch.mockRejectedValueOnce(new Error('network down'))
      const transport = createHttpTransport(makeSpec(), { apiKey: 'k' })

      await expect(transport.verify()).rejects.toMatchObject({ code: 'ECONNECTION' })
    })

    it('T25: mode callback — succès', done => {
      mockFetch.mockResolvedValueOnce(jsonResponse(200, {}))
      const transport = createHttpTransport(makeSpec(), { apiKey: 'k' })

      transport.verify((err, success) => {
        expect(err).toBeNull()
        expect(success).toBe(true)
        done()
      })
    })

    it('T26: mode callback — échec (401) propage EAUTH sans lever', done => {
      mockFetch.mockResolvedValueOnce(jsonResponse(401, { message: 'nope' }))
      const transport = createHttpTransport(makeSpec(), { apiKey: 'k' })

      transport.verify(err => {
        expect((err as (Error & { code?: string }) | null)?.code).toBe('EAUTH')
        done()
      })
    })

    it('T27: verifyPath absent (amendement revue delta 2) → résout true SANS appel réseau (skip)', async () => {
      const transport = createHttpTransport(makeSpec({ verifyPath: undefined }), { apiKey: 'k' })

      await expect(transport.verify()).resolves.toBe(true)
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('T28: verifyPath absent, mode callback → succès immédiat sans appel réseau', done => {
      const transport = createHttpTransport(makeSpec({ verifyPath: undefined }), { apiKey: 'k' })

      transport.verify((err, success) => {
        expect(err).toBeNull()
        expect(success).toBe(true)
        expect(mockFetch).not.toHaveBeenCalled()
        done()
      })
    })
  })

  // -----------------------------------------------------------------------
  // Concurrence bornée (sémaphore FIFO)
  // -----------------------------------------------------------------------

  describe('concurrence bornée (spec.maxConcurrency)', () => {
    it('T29: au plus maxConcurrency requêtes HTTP en vol, FIFO au-delà', async () => {
      const pending: Array<() => void> = []
      mockFetch.mockImplementation(
        () =>
          new Promise<Response>(resolve => {
            pending.push(() => resolve(jsonResponse(200, { id: 'x' })))
          }),
      )

      const transport = createHttpTransport(makeSpec({ maxConcurrency: 2 }), { apiKey: 'k' })
      const cb: CallbackMock = jest.fn()
      for (let i = 0; i < 4; i++) {
        transport.send(mailMessage(`${i}@example.com`), cb)
      }
      await flush()

      // Seules 2 requêtes sont parties — les 2 autres attendent un slot libre.
      expect(mockFetch).toHaveBeenCalledTimes(2)

      pending.shift()!()
      await flush()
      expect(mockFetch).toHaveBeenCalledTimes(3) // un slot libéré → la 3e requête démarre

      pending.shift()!()
      await flush()
      expect(mockFetch).toHaveBeenCalledTimes(4)

      pending.shift()!()
      pending.shift()!()
      await flush()
      expect(cb).toHaveBeenCalledTimes(4)
    })

    it('T30: défaut moteur (spec.maxConcurrency absent) = 2 requêtes en vol', async () => {
      const pending: Array<() => void> = []
      mockFetch.mockImplementation(
        () =>
          new Promise<Response>(resolve => {
            pending.push(() => resolve(jsonResponse(200, { id: 'x' })))
          }),
      )

      const transport = createHttpTransport(makeSpec(), { apiKey: 'k' }) // pas de maxConcurrency
      for (let i = 0; i < 3; i++) {
        transport.send(mailMessage(`${i}@example.com`), jest.fn())
      }
      await flush()

      expect(mockFetch).toHaveBeenCalledTimes(2)
      pending.forEach(resolve => resolve())
    })

    it('T30b: maxConcurrency:0 est clampé à 1 (pas de deadlock du sémaphore)', async () => {
      mockFetch.mockResolvedValue(jsonResponse(200, { id: 'ok' }))
      const transport = createHttpTransport(makeSpec({ maxConcurrency: 0 }), { apiKey: 'k' })
      const cb: CallbackMock = jest.fn()
      transport.send(mailMessage('a@example.com'), cb)
      await flush()
      // Semaphore(0) pendrait éternellement ; le clamp à 1 laisse la requête partir et aboutir.
      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(cb).toHaveBeenCalledWith(null, expect.objectContaining({ messageId: 'ok' }))
    })
  })

  // -----------------------------------------------------------------------
  // close()
  // -----------------------------------------------------------------------

  it('T31: close() est un no-op qui ne lève jamais', () => {
    const transport = createHttpTransport(makeSpec(), { apiKey: 'k' })
    expect(() => transport.close()).not.toThrow()
  })

  // -----------------------------------------------------------------------
  // name — reflète spec.id (contrat : le moteur ne connaît aucun fournisseur)
  // -----------------------------------------------------------------------

  it('T32: transport.name reflète spec.id', () => {
    const transport = createHttpTransport(makeSpec({ id: 'brevo' }), { apiKey: 'k' })
    expect(transport.name).toBe('brevo')
  })
})

describe('flattenAddress — quoting RFC 5322 (amendement revue delta 5)', () => {
  it('laisse un nom simple non quoté', () => {
    expect(flattenAddress({ name: 'TimePick', address: 'a@example.com' })).toBe('TimePick <a@example.com>')
  })
  it('quote un nom contenant une virgule', () => {
    expect(flattenAddress({ name: 'TimePick, Inc.', address: 'a@example.com' })).toBe('"TimePick, Inc." <a@example.com>')
  })
  it('échappe guillemets et antislashs dans le nom', () => {
    expect(flattenAddress({ name: 'A"B\\C', address: 'a@example.com' })).toBe('"A\\"B\\\\C" <a@example.com>')
  })
  it("retourne l'adresse seule si pas de nom", () => {
    expect(flattenAddress({ address: 'a@example.com' })).toBe('a@example.com')
  })
})
