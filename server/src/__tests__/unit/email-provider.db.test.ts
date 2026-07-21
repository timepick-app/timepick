import { describe, it, expect, jest, beforeEach } from '@jest/globals'

interface MockQueryResult {
  rows: Array<Record<string, string>>
}

const mockQuery = jest.fn<(text: string, params?: unknown[]) => Promise<MockQueryResult>>()
jest.mock('../../db/query', () => ({
  query: mockQuery,
}))

const mockEncrypt = jest.fn<(plaintext: string) => string>()
const mockDecrypt = jest.fn<(encrypted: string) => string>()
jest.mock('../../services/encryption.service', () => ({
  encrypt: mockEncrypt,
  decrypt: mockDecrypt,
}))

import { saveEmailProviderConfig, type SecretFieldsResolver } from '../../db/email-provider.db'

/** Miroir simplifié du resolver dérivé du catalogue (B2) — apiKey/secretKey secrets, projectId/region en clair. */
const secretFields: SecretFieldsResolver = provider => (provider === 'mailjet' ? ['apiKey', 'secretKey'] : ['apiKey'])

describe('email-provider.db — saveEmailProviderConfig, sentinelle scopée au provider (durcissement revue B1, contrat §7.7)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockEncrypt.mockImplementation((v: string) => `enc(${v})`)
  })

  it("même provider stocké → sentinelle '****' préservée depuis le blob stocké", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ value: 'resend' }] }) // SELECT email_provider
      .mockResolvedValueOnce({ rows: [{ key: 'email_api_credentials', value: JSON.stringify({ apiKey: 'enc(re_old)' }) }] }) // readRawStoredCredentials
      .mockResolvedValueOnce({ rows: [] }) // INSERT credentials
      .mockResolvedValueOnce({ rows: [] }) // INSERT provider

    await saveEmailProviderConfig({ provider: 'resend', credentials: { apiKey: '****' } }, secretFields)

    const credentialsInsert = mockQuery.mock.calls.find(c => c[0].startsWith('INSERT') && c[1]?.[0] === 'email_api_credentials')
    expect(credentialsInsert?.[1]?.[1]).toBe(JSON.stringify({ apiKey: 'enc(re_old)' }))
  })

  it("provider DIFFÉRENT stocké (switch resend→mailjet) → sentinelle '****' NE préserve RIEN (champ omis, jamais fusionné)", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ value: 'resend' }] }) // SELECT email_provider — le blob stocké appartient à resend
      .mockResolvedValueOnce({ rows: [] }) // INSERT credentials
      .mockResolvedValueOnce({ rows: [] }) // INSERT provider

    await saveEmailProviderConfig(
      { provider: 'mailjet', credentials: { apiKey: '****', secretKey: 'sk_new' } },
      secretFields,
    )

    // readRawStoredCredentials n'est PAS appelé (storedProvider 'resend' !== data.provider 'mailjet')
    expect(mockQuery).toHaveBeenCalledTimes(3)
    const credentialsInsert = mockQuery.mock.calls.find(c => c[0].startsWith('INSERT') && c[1]?.[0] === 'email_api_credentials')
    const stored: Record<string, string> = JSON.parse(credentialsInsert?.[1]?.[1] as string)
    expect(stored).toEqual({ secretKey: 'enc(sk_new)' }) // apiKey OMIS — jamais réinjecté depuis le blob resend
    expect(JSON.stringify(stored)).not.toContain('re_')
  })
})
