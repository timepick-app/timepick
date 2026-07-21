// sendBrandedProviderTest — contrat « ne lève jamais » (Chantier C, miroir de
// email-send-smtp-test.test.ts pour le transport provider HTTP).

import { describe, it, expect, jest, beforeEach } from '@jest/globals'

jest.mock('../../services/render-email.service', () => ({
  renderSmtpTestEmail: jest.fn(),
}))
jest.mock('../../services/email-transport.service', () => ({
  sendProviderTest: jest.fn(),
}))

import { sendBrandedProviderTest } from '../../services/email-send.service'
import { renderSmtpTestEmail } from '../../services/render-email.service'
import { sendProviderTest } from '../../services/email-transport.service'
import type { ProviderTestParams } from '../../services/email-transport.service'

const mockedRender = renderSmtpTestEmail as unknown as {
  mockResolvedValue: (v: { html: string; text: string }) => void
  mockRejectedValue: (e: Error) => void
  mockReset: () => void
}
const mockedSend = sendProviderTest as unknown as {
  mockResolvedValue: (v: { success: boolean; message: string }) => void
  mockReset: () => void
  mock: { calls: unknown[] }
}

const PARAMS: ProviderTestParams = { provider: 'resend', credentials: { apiKey: 'k' } }

describe('sendBrandedProviderTest — contrat « ne lève jamais »', () => {
  beforeEach(() => {
    mockedRender.mockReset()
    mockedSend.mockReset()
  })

  it('renvoie { success: false } quand le rendu échoue (pas de propagation/500)', async () => {
    mockedRender.mockRejectedValue(new Error('row invitation absente'))
    const result = await sendBrandedProviderTest(PARAMS, 'x@y.z')
    expect(result.success).toBe(false)
    expect(result.message).toMatch(/erreur de rendu/i)
    // Le transport n'est pas tenté puisque le corps n'a pas pu être rendu.
    expect(mockedSend.mock.calls).toHaveLength(0)
  })

  it('délègue à sendProviderTest avec le corps rendu quand le rendu réussit', async () => {
    mockedRender.mockResolvedValue({ html: '<html/>', text: 't' })
    mockedSend.mockResolvedValue({ success: true, message: 'Connexion réussie' })
    const result = await sendBrandedProviderTest(PARAMS, 'x@y.z')
    expect(result).toEqual({ success: true, message: 'Connexion réussie' })
    expect(mockedSend.mock.calls).toHaveLength(1)
    expect(mockedSend.mock.calls[0]).toEqual([PARAMS, 'x@y.z', { html: '<html/>', text: 't' }])
  })

  it('propage le message d’échec de sendProviderTest tel quel (clé refusée)', async () => {
    mockedRender.mockResolvedValue({ html: '<html/>', text: 't' })
    mockedSend.mockResolvedValue({ success: false, message: 'Clé API Resend refusée (401): Invalid API key' })
    const result = await sendBrandedProviderTest(PARAMS, 'x@y.z')
    expect(result).toEqual({ success: false, message: 'Clé API Resend refusée (401): Invalid API key' })
  })
})
