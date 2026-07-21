// Chantier email-providers (B2) — descripteurs table-driven (contrat §3.1/§3.2).
// Pour chaque fournisseur : buildSendPayload produit le JSON attendu (fixture),
// buildAuthHeaders correct, buildUrl (Scaleway {region}), region ∈ options.

import { describe, it, expect } from '@jest/globals'
import { PROVIDER_CATALOG, getProviderMeta, getProviderSpec } from '../../services/email-transport/descriptors'
import type { NormalizedMail } from '../../services/email-transport/types'

const mail: NormalizedMail = {
  from: { name: 'TimePick', address: 'from@example.com' },
  to: [{ name: 'Dest', address: 'dest@example.com' }],
  subject: 'Sujet de test',
  html: '<p>hi</p>',
  text: 'hi',
}

interface Fixture {
  id: string
  credentials: Record<string, string>
  expectedAuthHeaders: Record<string, string>
  expectedPayload: unknown
  sendPath: string
  verifyPath: string | undefined
}

const FIXTURES: Fixture[] = [
  {
    id: 'brevo',
    credentials: { apiKey: 'xkeysib-abc' },
    expectedAuthHeaders: { 'api-key': 'xkeysib-abc' },
    expectedPayload: {
      sender: { email: 'from@example.com', name: 'TimePick' },
      to: [{ email: 'dest@example.com', name: 'Dest' }],
      subject: 'Sujet de test',
      htmlContent: '<p>hi</p>',
      textContent: 'hi',
    },
    sendPath: '/v3/smtp/email',
    verifyPath: '/v3/account',
  },
  {
    id: 'mailjet',
    credentials: { apiKey: 'ak', secretKey: 'sk' },
    expectedAuthHeaders: { Authorization: `Basic ${Buffer.from('ak:sk').toString('base64')}` },
    expectedPayload: {
      Messages: [
        {
          From: { Email: 'from@example.com', Name: 'TimePick' },
          To: [{ Email: 'dest@example.com', Name: 'Dest' }],
          Subject: 'Sujet de test',
          TextPart: 'hi',
          HTMLPart: '<p>hi</p>',
        },
      ],
    },
    sendPath: '/v3.1/send',
    verifyPath: '/v3/REST/sender',
  },
  {
    id: 'scaleway',
    credentials: { secretKey: 'sec', projectId: 'proj-1', region: 'fr-par' },
    expectedAuthHeaders: { 'X-Auth-Token': 'sec' },
    expectedPayload: {
      from: { name: 'TimePick', email: 'from@example.com' },
      to: [{ name: 'Dest', email: 'dest@example.com' }],
      subject: 'Sujet de test',
      text: 'hi',
      html: '<p>hi</p>',
      project_id: 'proj-1',
    },
    sendPath: '/emails',
    verifyPath: '/domains',
  },
  {
    id: 'sweego',
    credentials: { apiKey: 'key' },
    expectedAuthHeaders: { 'Api-Key': 'key' },
    expectedPayload: {
      channel: 'email',
      provider: 'sweego',
      recipients: [{ email: 'dest@example.com', name: 'Dest' }],
      from: { email: 'from@example.com', name: 'TimePick' },
      subject: 'Sujet de test',
      'message-txt': 'hi',
      'message-html': '<p>hi</p>',
    },
    sendPath: '/send',
    verifyPath: undefined, // à confirmer (cf. commentaire sweego.ts) — le moteur skip verify() à true.
  },
  {
    id: 'resend',
    credentials: { apiKey: 're_x' },
    expectedAuthHeaders: { Authorization: 'Bearer re_x' },
    expectedPayload: {
      from: 'TimePick <from@example.com>',
      to: ['Dest <dest@example.com>'],
      subject: 'Sujet de test',
      html: '<p>hi</p>',
      text: 'hi',
    },
    sendPath: '/emails',
    verifyPath: '/domains',
  },
]

describe('catalogue (contrat §1/§3.1)', () => {
  it('ordonné EU-first, resend en dernier, ids = les 5 fournisseurs HTTP', () => {
    expect(PROVIDER_CATALOG.map(p => p.id)).toEqual(['brevo', 'mailjet', 'scaleway', 'sweego', 'resend'])
  })

  it('region eu pour les 4 EU, us pour resend', () => {
    for (const p of PROVIDER_CATALOG) {
      expect(p.region).toBe(p.id === 'resend' ? 'us' : 'eu')
    }
  })

  it('aucun champ secret sans label ni clé', () => {
    for (const p of PROVIDER_CATALOG) {
      for (const field of p.credentialFields) {
        expect(field.key.length).toBeGreaterThan(0)
        expect(field.label.length).toBeGreaterThan(0)
      }
    }
  })
})

describe.each(FIXTURES)('descripteur $id', ({ id, credentials, expectedAuthHeaders, expectedPayload, sendPath, verifyPath }) => {
  const spec = getProviderSpec(id)
  const meta = getProviderMeta(id)

  it('spec trouvée dans le catalogue', () => {
    expect(spec).toBeDefined()
    expect(meta).toBeDefined()
  })

  it('buildAuthHeaders produit les en-têtes attendus', () => {
    expect(spec!.buildAuthHeaders(credentials)).toEqual(expectedAuthHeaders)
  })

  it('buildSendPayload produit le JSON attendu', () => {
    expect(spec!.buildSendPayload(mail, credentials)).toEqual(expectedPayload)
  })

  it('sendPath/verifyPath conformes à la doc officielle citée en commentaire', () => {
    expect(spec!.sendPath).toBe(sendPath)
    expect(spec!.verifyPath).toBe(verifyPath)
  })
})

describe('scaleway — buildUrl {region} + project_id (contrat §3.2)', () => {
  const spec = getProviderSpec('scaleway')!

  it('injecte la région soumise dans le path', () => {
    expect(spec.buildUrl!('/emails', { region: 'fr-par' })).toBe(
      'https://api.scaleway.com/transactional-email/v1alpha1/regions/fr-par/emails',
    )
  })

  it('retombe sur fr-par si region absente des credentials', () => {
    expect(spec.buildUrl!('/domains', {})).toBe('https://api.scaleway.com/transactional-email/v1alpha1/regions/fr-par/domains')
  })

  it('region ∈ options — uniquement fr-par confirmée par la doc officielle (écart vs contrat §3.3, cf. commentaire scaleway.ts)', () => {
    const regionField = getProviderMeta('scaleway')!.credentialFields.find(f => f.key === 'region')
    expect(regionField?.options?.map(o => o.value)).toEqual(['fr-par'])
  })
})

describe('resend — idempotence opt-in (contrat §3.2, amendement revue delta 3)', () => {
  it("déclare l'en-tête Idempotency-Key", () => {
    expect(getProviderSpec('resend')!.idempotency).toEqual({ header: 'Idempotency-Key' })
  })
})

describe('sweego — verifyPath non confirmé (contrat §3.3, à signaler)', () => {
  it('aucun verifyPath fabriqué — le moteur B1 skip verify() à true (amendement revue delta 2)', () => {
    expect(getProviderSpec('sweego')!.verifyPath).toBeUndefined()
  })
})
