import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals'
import type { SmtpSettings } from '../../db/settings.db'

const mockGetSmtpSettings = jest.fn<() => Promise<SmtpSettings>>()
const mockSaveSmtpSettings = jest.fn<(data: Partial<SmtpSettings>) => Promise<void>>()
const mockIsSmtpProvisioned = jest.fn<() => Promise<boolean>>()
const mockMarkSmtpProvisioned = jest.fn<() => Promise<void>>()

jest.mock('../../db/settings.db', () => ({
  getSmtpSettings: mockGetSmtpSettings,
  saveSmtpSettings: mockSaveSmtpSettings,
  isSmtpProvisioned: mockIsSmtpProvisioned,
  markSmtpProvisioned: mockMarkSmtpProvisioned,
}))

import { provisionSmtpFromEnv } from '../../services/smtp-provisioning.service'

const emptySettings: SmtpSettings = {
  smtpHost: '',
  smtpPort: '',
  smtpSecure: false,
  smtpUser: '',
  smtpPassword: '',
  smtpFromName: 'TimePick',
  smtpFromEmail: '',
}

describe('provisionSmtpFromEnv()', () => {
  let savedEnv: typeof process.env

  beforeEach(() => {
    savedEnv = process.env
    process.env = { ...process.env }
    jest.clearAllMocks()
    mockGetSmtpSettings.mockResolvedValue(emptySettings)
    mockIsSmtpProvisioned.mockResolvedValue(false)
    mockSaveSmtpSettings.mockResolvedValue(undefined)
    mockMarkSmtpProvisioned.mockResolvedValue(undefined)
  })

  afterEach(() => {
    process.env = savedEnv
  })

  it('seed quand smtpHost vide + non provisionné + SMTP_HOST défini', async () => {
    process.env.SMTP_HOST = 'smtp.example.com'
    process.env.SMTP_PORT = '465'
    process.env.SMTP_SECURE = 'true'
    process.env.SMTP_USER = 'user@example.com'
    process.env.SMTP_PASSWORD = 'secret'
    process.env.SMTP_FROM_NAME = 'MyApp'
    process.env.SMTP_FROM_EMAIL = 'noreply@example.com'

    await provisionSmtpFromEnv()

    expect(mockSaveSmtpSettings).toHaveBeenCalledWith({
      smtpHost: 'smtp.example.com',
      smtpPort: '465',
      smtpSecure: true,
      smtpUser: 'user@example.com',
      smtpPassword: 'secret',
      smtpFromName: 'MyApp',
      smtpFromEmail: 'noreply@example.com',
    })
    expect(mockMarkSmtpProvisioned).toHaveBeenCalledTimes(1)
  })

  it('no-op quand smtpHost déjà renseigné en DB', async () => {
    mockGetSmtpSettings.mockResolvedValue({ ...emptySettings, smtpHost: 'existing.host' })
    process.env.SMTP_HOST = 'smtp.example.com'

    await provisionSmtpFromEnv()

    expect(mockSaveSmtpSettings).not.toHaveBeenCalled()
    expect(mockMarkSmtpProvisioned).not.toHaveBeenCalled()
  })

  it('no-op quand marqueur isSmtpProvisioned=true', async () => {
    mockIsSmtpProvisioned.mockResolvedValue(true)
    process.env.SMTP_HOST = 'smtp.example.com'

    await provisionSmtpFromEnv()

    expect(mockSaveSmtpSettings).not.toHaveBeenCalled()
    expect(mockMarkSmtpProvisioned).not.toHaveBeenCalled()
  })

  it('no-op sans marqueur quand SMTP_HOST absent', async () => {
    delete process.env.SMTP_HOST

    await provisionSmtpFromEnv()

    expect(mockSaveSmtpSettings).not.toHaveBeenCalled()
    expect(mockMarkSmtpProvisioned).not.toHaveBeenCalled()
  })

  it('port par défaut 587 si SMTP_PORT absent', async () => {
    process.env.SMTP_HOST = 'smtp.example.com'
    delete process.env.SMTP_PORT

    await provisionSmtpFromEnv()

    expect(mockSaveSmtpSettings).toHaveBeenCalledWith(
      expect.objectContaining({ smtpPort: '587' })
    )
  })

  it('smtpSecure=true si SMTP_SECURE="true"', async () => {
    process.env.SMTP_HOST = 'smtp.example.com'
    process.env.SMTP_SECURE = 'true'

    await provisionSmtpFromEnv()

    expect(mockSaveSmtpSettings).toHaveBeenCalledWith(
      expect.objectContaining({ smtpSecure: true })
    )
  })

  it('smtpSecure=false si SMTP_SECURE != "true"', async () => {
    process.env.SMTP_HOST = 'smtp.example.com'
    process.env.SMTP_SECURE = 'false'

    await provisionSmtpFromEnv()

    expect(mockSaveSmtpSettings).toHaveBeenCalledWith(
      expect.objectContaining({ smtpSecure: false })
    )
  })

  it('smtpFromName="TimePick" si SMTP_FROM_NAME absent', async () => {
    process.env.SMTP_HOST = 'smtp.example.com'
    delete process.env.SMTP_FROM_NAME

    await provisionSmtpFromEnv()

    expect(mockSaveSmtpSettings).toHaveBeenCalledWith(
      expect.objectContaining({ smtpFromName: 'TimePick' })
    )
  })

  it('ne throw jamais si saveSmtpSettings rejette', async () => {
    process.env.SMTP_HOST = 'smtp.example.com'
    mockSaveSmtpSettings.mockRejectedValue(new Error('DB error'))

    await expect(provisionSmtpFromEnv()).resolves.toBeUndefined()
  })
})
