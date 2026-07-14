// sendBrandedSmtpTest — contrat « ne lève jamais » (patch review P1, 2026-06-28).
// Le diagnostic SMTP ne doit JAMAIS 500 sur un échec du pipeline de rendu.

import { describe, it, expect, jest, beforeEach } from '@jest/globals'

jest.mock('../../services/render-email.service', () => ({
  renderSmtpTestEmail: jest.fn(),
}))
jest.mock('../../services/email-transport.service', () => ({
  sendSmtpTest: jest.fn(),
}))

import { sendBrandedSmtpTest } from '../../services/email-send.service'
import { renderSmtpTestEmail } from '../../services/render-email.service'
import { sendSmtpTest } from '../../services/email-transport.service'
import type { SmtpTestParams } from '../../services/email-transport.service'

const mockedRender = renderSmtpTestEmail as unknown as {
  mockResolvedValue: (v: { html: string; text: string }) => void
  mockRejectedValue: (e: Error) => void
  mockReset: () => void
}
const mockedSend = sendSmtpTest as unknown as {
  mockResolvedValue: (v: { success: boolean; message: string }) => void
  mockReset: () => void
  mock: { calls: unknown[] }
}

const PARAMS: SmtpTestParams = { smtpHost: 'h', smtpPort: 465, smtpSecure: true }

describe('sendBrandedSmtpTest — contrat « ne lève jamais »', () => {
  beforeEach(() => {
    mockedRender.mockReset()
    mockedSend.mockReset()
  })

  it('renvoie { success: false } quand le rendu échoue (pas de propagation/500)', async () => {
    mockedRender.mockRejectedValue(new Error('row invitation absente'))
    const result = await sendBrandedSmtpTest(PARAMS, 'x@y.z')
    expect(result.success).toBe(false)
    expect(result.message).toMatch(/erreur de rendu/i)
    // Le transport n'est pas tenté puisque le corps n'a pas pu être rendu.
    expect(mockedSend.mock.calls).toHaveLength(0)
  })

  it('délègue à sendSmtpTest avec le corps rendu quand le rendu réussit', async () => {
    mockedRender.mockResolvedValue({ html: '<html/>', text: 't' })
    mockedSend.mockResolvedValue({ success: true, message: 'Connexion réussie' })
    const result = await sendBrandedSmtpTest(PARAMS, 'x@y.z')
    expect(result).toEqual({ success: true, message: 'Connexion réussie' })
    expect(mockedSend.mock.calls).toHaveLength(1)
  })
})
