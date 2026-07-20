import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals'

import { createResendTransport } from '../../services/email-transport/resend-transport'

// ---------------------------------------------------------------------------
// Helpers — fetch mocked via jest.spyOn(globalThis, 'fetch'), pas de module
// à mocker avant import (resend-transport.ts ne dépend que du fetch global).
// ---------------------------------------------------------------------------

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
 * Laisse la chaîne de microtâches (acquire sémaphore → fetch → .then/.catch,
 * potentiellement via extractApiMessage → response.json()) se dérouler
 * entièrement. `setImmediate` s'exécute après que la queue de microtâches
 * est vidée — plus fiable qu'un nombre fixe de `await Promise.resolve()`.
 */
async function flush(): Promise<void> {
  await new Promise(resolve => setImmediate(resolve))
}

type CallbackMock = jest.Mock<(err: Error | null, info?: { messageId: string; envelope: { from?: string; to: string[] } }) => void>

describe('createResendTransport', () => {
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
  // send() — payload, adresses, mapping erreurs
  // -----------------------------------------------------------------------

  describe('send() — succès et payload', () => {
    it('T1: POST /emails avec payload exact + auth Bearer + Content-Type JSON', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(200, { id: 'msg-123' }))

      const transport = createResendTransport({ apiKey: 'key-abc', baseUrl: 'https://mock.test' })
      const cb: CallbackMock = jest.fn()
      transport.send(mailMessage('dest@example.com', { from: '"TimePick" <from@example.com>' }), cb)
      await flush()

      expect(mockFetch).toHaveBeenCalledTimes(1)
      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
      expect(url).toBe('https://mock.test/emails')
      expect(init.method).toBe('POST')
      expect(init.headers).toMatchObject({ Authorization: 'Bearer key-abc', 'Content-Type': 'application/json' })
      expect(JSON.parse(init.body as string)).toEqual({
        from: '"TimePick" <from@example.com>',
        to: ['dest@example.com'],
        subject: 'Sujet de test',
        html: '<p>Bonjour</p>',
        text: 'Bonjour',
      })

      expect(cb).toHaveBeenCalledWith(null, {
        messageId: 'msg-123',
        envelope: { from: '"TimePick" <from@example.com>', to: ['dest@example.com'] },
      })
    })

    it('T2: to (chaîne unique) est toujours envoyé comme tableau', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(200, { id: 'x' }))
      const transport = createResendTransport({ apiKey: 'k', baseUrl: 'https://mock.test' })
      transport.send(mailMessage('single@example.com'), jest.fn())
      await flush()

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
      expect(JSON.parse(init.body as string).to).toEqual(['single@example.com'])
    })

    it('T3: to déjà en tableau est préservé tel quel', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(200, { id: 'x' }))
      const transport = createResendTransport({ apiKey: 'k', baseUrl: 'https://mock.test' })
      transport.send(mailMessage(['a@example.com', 'b@example.com']), jest.fn())
      await flush()

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
      expect(JSON.parse(init.body as string).to).toEqual(['a@example.com', 'b@example.com'])
    })

    it("T4: baseUrl par défaut 'https://api.resend.com' quand non fourni", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(200, { id: 'x' }))
      const transport = createResendTransport({ apiKey: 'k' })
      transport.send(mailMessage('a@example.com'), jest.fn())
      await flush()

      const [url] = mockFetch.mock.calls[0] as [string]
      expect(url).toBe('https://api.resend.com/emails')
    })
  })

  describe('send() — mapping erreurs (contrat §4)', () => {
    it('T5: 401 → code EAUTH', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(401, { message: 'Invalid API key' }))
      const transport = createResendTransport({ apiKey: 'bad-key', baseUrl: 'https://mock.test' })
      const cb: CallbackMock = jest.fn()
      transport.send(mailMessage('a@example.com'), cb)
      await flush()

      expect(cb).toHaveBeenCalledTimes(1)
      const err = cb.mock.calls[0][0] as (Error & { code?: string }) | null
      expect(err).toBeInstanceOf(Error)
      expect(err?.code).toBe('EAUTH')
      expect(err?.message).toContain('401')
    })

    it('T6: 403 → code EAUTH', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(403, { message: 'Forbidden' }))
      const transport = createResendTransport({ apiKey: 'k', baseUrl: 'https://mock.test' })
      const cb: CallbackMock = jest.fn()
      transport.send(mailMessage('a@example.com'), cb)
      await flush()

      const err = cb.mock.calls[0][0] as (Error & { code?: string }) | null
      expect(err?.code).toBe('EAUTH')
    })

    it('T7: erreur réseau (fetch rejette) → code ECONNECTION', async () => {
      mockFetch.mockRejectedValueOnce(new Error('getaddrinfo ENOTFOUND'))
      const transport = createResendTransport({ apiKey: 'k', baseUrl: 'https://mock.test' })
      const cb: CallbackMock = jest.fn()
      transport.send(mailMessage('a@example.com'), cb)
      await flush()

      const err = cb.mock.calls[0][0] as (Error & { code?: string }) | null
      expect(err?.code).toBe('ECONNECTION')
    })

    it('T8: 500 → code ECONNECTION (déclenche le retry-rebuild de sendMailWithFallback)', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(500, { message: 'Internal error' }))
      const transport = createResendTransport({ apiKey: 'k', baseUrl: 'https://mock.test' })
      const cb: CallbackMock = jest.fn()
      transport.send(mailMessage('a@example.com'), cb)
      await flush()

      const err = cb.mock.calls[0][0] as (Error & { code?: string }) | null
      expect(err?.code).toBe('ECONNECTION')
    })

    it('T9: 400 (autre 4xx) → code EMESSAGE, pas de retry', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(400, { message: 'Invalid `to` field' }))
      const transport = createResendTransport({ apiKey: 'k', baseUrl: 'https://mock.test' })
      const cb: CallbackMock = jest.fn()
      transport.send(mailMessage('a@example.com'), cb)
      await flush()

      expect(mockFetch).toHaveBeenCalledTimes(1)
      const err = cb.mock.calls[0][0] as (Error & { code?: string }) | null
      expect(err?.code).toBe('EMESSAGE')
      expect(err?.message).toContain('Invalid `to` field')
    })

    it('T10: la clé API n’apparaît jamais dans un message d’erreur', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(401, { message: 'Invalid API key' }))
      const transport = createResendTransport({ apiKey: 'sk_live_super_secret_12345', baseUrl: 'https://mock.test' })
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
    it('T11: 429 puis succès → un seul retry, callback succès', async () => {
      jest.useFakeTimers()
      mockFetch
        .mockResolvedValueOnce(jsonResponse(429, {}))
        .mockResolvedValueOnce(jsonResponse(200, { id: 'ok-after-retry' }))

      const transport = createResendTransport({ apiKey: 'k', baseUrl: 'https://mock.test' })
      const cb: CallbackMock = jest.fn()
      transport.send(mailMessage('a@example.com'), cb)

      await jest.advanceTimersByTimeAsync(0)
      await jest.advanceTimersByTimeAsync(600) // > 500ms (500 * 2^0)

      expect(mockFetch).toHaveBeenCalledTimes(2)
      expect(cb).toHaveBeenCalledWith(null, expect.objectContaining({ messageId: 'ok-after-retry' }))
    })

    it('T12: 429 répété au-delà de maxRetries → code ERATELIMIT', async () => {
      jest.useFakeTimers()
      mockFetch
        .mockResolvedValueOnce(jsonResponse(429, {}))
        .mockResolvedValueOnce(jsonResponse(429, {}))

      const transport = createResendTransport({ apiKey: 'k', baseUrl: 'https://mock.test', maxRetries: 1 })
      const cb: CallbackMock = jest.fn()
      transport.send(mailMessage('a@example.com'), cb)

      await jest.advanceTimersByTimeAsync(0)
      await jest.advanceTimersByTimeAsync(600)

      expect(mockFetch).toHaveBeenCalledTimes(2) // 1 essai initial + 1 retry (maxRetries=1)
      const err = cb.mock.calls[0][0] as (Error & { code?: string }) | null
      expect(err?.code).toBe('ERATELIMIT')
    })

    it('T13: en-tête Retry-After (secondes) honoré au lieu du backoff exponentiel', async () => {
      jest.useFakeTimers()
      mockFetch
        .mockResolvedValueOnce(jsonResponse(429, {}, { 'retry-after': '2' }))
        .mockResolvedValueOnce(jsonResponse(200, { id: 'ok' }))

      const transport = createResendTransport({ apiKey: 'k', baseUrl: 'https://mock.test' })
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
  })

  // -----------------------------------------------------------------------
  // Durcissements post-review : idempotence, plafond Retry-After, to vide
  // -----------------------------------------------------------------------

  describe('send() — durcissements (review chantier C)', () => {
    it('T21: Idempotency-Key présent sur POST /emails, absent sur GET /domains', async () => {
      mockFetch.mockResolvedValue(jsonResponse(200, { id: 'x', data: [] }))

      const transport = createResendTransport({ apiKey: 'k', baseUrl: 'https://mock.test' })
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

    it('T22: même payload → même clé (le rejeu de sendMailWithFallback est dédoublonné), payload différent → clé différente', async () => {
      // Date.now figé : la clé inclut une tranche de 5 min — on reste dans la même tranche.
      jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
      mockFetch.mockResolvedValue(jsonResponse(200, { id: 'x' }))

      // Deux INSTANCES distinctes : le retry ECONNECTION reconstruit le transport,
      // la clé doit être stable à travers les instances pour le même contenu.
      const t1 = createResendTransport({ apiKey: 'k', baseUrl: 'https://mock.test' })
      const t2 = createResendTransport({ apiKey: 'k', baseUrl: 'https://mock.test' })
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

    it('T23: Retry-After absurde (3600s) plafonné à 30s', async () => {
      jest.useFakeTimers()
      mockFetch
        .mockResolvedValueOnce(jsonResponse(429, {}, { 'retry-after': '3600' }))
        .mockResolvedValueOnce(jsonResponse(200, { id: 'ok' }))

      const transport = createResendTransport({ apiKey: 'k', baseUrl: 'https://mock.test' })
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

    it('T24: to vide → erreur locale EMESSAGE sans aucun appel réseau', async () => {
      const transport = createResendTransport({ apiKey: 'k', baseUrl: 'https://mock.test' })
      const cb: CallbackMock = jest.fn()
      transport.send(mailMessage([]), cb)
      await flush()

      expect(mockFetch).not.toHaveBeenCalled()
      const err = cb.mock.calls[0][0] as (Error & { code?: string }) | null
      expect(err?.code).toBe('EMESSAGE')
      expect(err?.message).toMatch(/destinataire/i)
    })
  })

  // -----------------------------------------------------------------------
  // verify()
  // -----------------------------------------------------------------------

  describe('verify() — GET /domains authentifié (remplacement du verify() SMTP)', () => {
    it('T14: 2xx → résout true (mode promesse)', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(200, { domains: [] }))
      const transport = createResendTransport({ apiKey: 'k', baseUrl: 'https://mock.test' })

      await expect(transport.verify()).resolves.toBe(true)
      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
      expect(url).toBe('https://mock.test/domains')
      expect(init.method).toBe('GET')
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer k')
    })

    it('T15: 401 → rejette avec code EAUTH (mode promesse)', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(401, { message: 'Invalid API key' }))
      const transport = createResendTransport({ apiKey: 'bad', baseUrl: 'https://mock.test' })

      await expect(transport.verify()).rejects.toMatchObject({ code: 'EAUTH' })
    })

    it('T16: erreur réseau → rejette avec code ECONNECTION (mode promesse)', async () => {
      mockFetch.mockRejectedValueOnce(new Error('network down'))
      const transport = createResendTransport({ apiKey: 'k', baseUrl: 'https://mock.test' })

      await expect(transport.verify()).rejects.toMatchObject({ code: 'ECONNECTION' })
    })

    it('T17: mode callback — succès', done => {
      mockFetch.mockResolvedValueOnce(jsonResponse(200, {}))
      const transport = createResendTransport({ apiKey: 'k', baseUrl: 'https://mock.test' })

      transport.verify((err, success) => {
        expect(err).toBeNull()
        expect(success).toBe(true)
        done()
      })
    })

    it('T18: mode callback — échec (401) propage EAUTH sans lever', done => {
      mockFetch.mockResolvedValueOnce(jsonResponse(401, { message: 'nope' }))
      const transport = createResendTransport({ apiKey: 'k', baseUrl: 'https://mock.test' })

      transport.verify(err => {
        expect((err as (Error & { code?: string }) | null)?.code).toBe('EAUTH')
        done()
      })
    })
  })

  // -----------------------------------------------------------------------
  // Concurrence bornée (sémaphore FIFO)
  // -----------------------------------------------------------------------

  describe('concurrence bornée (maxConcurrency)', () => {
    it('T19: au plus maxConcurrency requêtes HTTP en vol, FIFO au-delà', async () => {
      const pending: Array<() => void> = []
      mockFetch.mockImplementation(
        () =>
          new Promise<Response>(resolve => {
            pending.push(() => resolve(jsonResponse(200, { id: 'x' })))
          }),
      )

      const transport = createResendTransport({ apiKey: 'k', baseUrl: 'https://mock.test', maxConcurrency: 2 })
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
  })

  // -----------------------------------------------------------------------
  // close()
  // -----------------------------------------------------------------------

  it('T20: close() est un no-op qui ne lève jamais', () => {
    const transport = createResendTransport({ apiKey: 'k', baseUrl: 'https://mock.test' })
    expect(() => transport.close()).not.toThrow()
  })
})
