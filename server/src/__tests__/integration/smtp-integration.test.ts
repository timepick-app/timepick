import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals'

import type { SmtpSettings } from '../../db/settings.db'

// ---------------------------------------------------------------------------
// Mocks — declared BEFORE importing module under test
// ---------------------------------------------------------------------------

const mockGetSmtpSettings = jest.fn<() => Promise<SmtpSettings>>()
jest.mock('../../db/settings.db', () => ({
  getSmtpSettings: mockGetSmtpSettings
}))

const mockSendMail = jest.fn<() => Promise<{ messageId: string }>>().mockResolvedValue({ messageId: 'test-msg-id' })
const mockVerify = jest.fn<() => Promise<void>>().mockResolvedValue(undefined)
const mockClose = jest.fn()
const mockCreateTransport = jest.fn().mockReturnValue({
  sendMail: mockSendMail,
  verify: mockVerify,
  close: mockClose
})
jest.mock('nodemailer', () => ({
  createTransport: mockCreateTransport
}))

import {
  createSmtpTransport,
  getTransporter,
  invalidateTransportCache,
  getFromAddress,
  sendAdminMagicLinkEmail,
  sendEventInvitation,
} from '../../services/email.service'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DB_SETTINGS_FULL: SmtpSettings = {
  smtpHost: 'smtp.example.org',
  smtpPort: '465',
  smtpSecure: true,
  smtpUser: 'user@example.com',
  smtpPassword: 'secret',
  smtpFromName: 'TimePick',
  smtpFromEmail: 'noreply@example.com'
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SMTP integration — inter-component failure modes', () => {
  const originalEnv = { ...process.env } as Record<string, string | undefined>
  let consoleErrorSpy: jest.SpiedFunction<typeof console.error>

  beforeEach(() => {
    jest.clearAllMocks()
    invalidateTransportCache()
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    consoleErrorSpy.mockRestore()
  })

  // -----------------------------------------------------------------------
  // T1.1: Decrypt failure cascade
  // -----------------------------------------------------------------------

  it('T1.1a: falls back to Mailpit in dev/test when decrypt fails', async () => {
    const origEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'test'
    mockGetSmtpSettings.mockRejectedValueOnce(
      new Error('Unsupported state or unable to authenticate data')
    )
    // Ensure no env fallbacks exist so Mailpit is the only option after DB failure
    process.env = { ...process.env, NODE_ENV: 'test', SMTP_HOST: '' }

    await createSmtpTransport()

    expect(mockCreateTransport).toHaveBeenCalledWith({
      host: '127.0.0.1',
      port: 1025,
      secure: false,
      ignoreTLS: true
    })
    // Le chemin decrypt-failure logge un message unique (guidage ENCRYPTION_KEY),
    // sans second argument Error — contrairement au chemin d'échec générique.
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[EmailService] ENCRYPTION_KEY mismatch')
    )
    process.env.NODE_ENV = origEnv
  })

  it('T1.1b: throws in production when all SMTP sources fail', async () => {
    const origEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    mockGetSmtpSettings.mockRejectedValueOnce(new Error('Decryption failed'))
    process.env = { ...process.env, NODE_ENV: 'production', SMTP_HOST: '' }

    await expect(createSmtpTransport()).rejects.toThrow('No SMTP transport available')

    process.env.NODE_ENV = origEnv
  })

  // -----------------------------------------------------------------------
  // T1.2: Partial config
  // -----------------------------------------------------------------------

  it('T1.2: uses fallback port 587 when DB has host but empty port', async () => {
    mockGetSmtpSettings.mockResolvedValue({
      ...DB_SETTINGS_FULL,
      smtpPort: '',
    })

    await createSmtpTransport()

    expect(mockCreateTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.example.org',
        port: 587,
      })
    )
  })

  // -----------------------------------------------------------------------
  // T1.3: Full provider-like config (secure SSL, port 465)
  // -----------------------------------------------------------------------

  it('T1.3: passes correct secure SMTP params (secure=true, port 465, auth)', async () => {
    mockGetSmtpSettings.mockResolvedValue(DB_SETTINGS_FULL)

    await createSmtpTransport()

    expect(mockCreateTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.example.org',
        port: 465,
        secure: true,
        auth: { user: 'user@example.com', pass: 'secret' }
      })
    )
  })

  // -----------------------------------------------------------------------
  // T1.4: Cache invalidation integration cycle
  // -----------------------------------------------------------------------

  it('T1.4: recreates transport with fresh DB config after invalidation', async () => {
    // Initial config
    mockGetSmtpSettings.mockResolvedValue(DB_SETTINGS_FULL)
    await getTransporter()
    expect(mockCreateTransport).toHaveBeenCalledTimes(1)

    // Admin saves new config → controller calls invalidateTransportCache()
    invalidateTransportCache()
    expect(mockClose).toHaveBeenCalled()

    // New config in DB
    mockGetSmtpSettings.mockResolvedValue({
      ...DB_SETTINGS_FULL,
      smtpHost: 'new-server.example.com',
      smtpPort: '587',
      smtpSecure: false,
    })

    await getTransporter()

    expect(mockCreateTransport).toHaveBeenCalledTimes(2)
    expect(mockCreateTransport).toHaveBeenLastCalledWith(
      expect.objectContaining({
        host: 'new-server.example.com',
        port: 587,
        secure: false,
      })
    )
  })

  // -----------------------------------------------------------------------
  // T1.5: getFromAddress integration
  // -----------------------------------------------------------------------

  it('T1.5: resolves from address from DB settings', async () => {
    // beforeEach calls invalidateTransportCache() which also clears cachedFromAddress
    mockGetSmtpSettings.mockResolvedValue({
      ...DB_SETTINGS_FULL,
      smtpFromName: 'Mon Asso',
      smtpFromEmail: 'contact@monasso.fr',
    })

    const from = await getFromAddress()

    expect(from).toBe('"Mon Asso" <contact@monasso.fr>')
  })
})

describe('SMTP integration — email flow smoke tests', () => {
  const originalEnv = { ...process.env } as Record<string, string | undefined>
  let consoleErrorSpy: jest.SpiedFunction<typeof console.error>
  let consoleLogSpy: jest.SpiedFunction<typeof console.log>

  beforeEach(() => {
    jest.clearAllMocks()
    invalidateTransportCache()
    mockGetSmtpSettings.mockResolvedValue(DB_SETTINGS_FULL)
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    consoleErrorSpy.mockRestore()
    consoleLogSpy.mockRestore()
  })

  // -----------------------------------------------------------------------
  // T2.1: sendAdminMagicLinkEmail uses dynamic transport
  // -----------------------------------------------------------------------

  it('T2.1: sendAdminMagicLinkEmail uses getTransporter and getFromAddress', async () => {
    const result = await sendAdminMagicLinkEmail('admin@test.com', 'http://link', 1440, undefined, true)

    expect(result).toBe(true)
    // Transport was created from DB config
    expect(mockCreateTransport).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'smtp.example.org' })
    )
    // sendMail was called with DB-derived from address
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: '"TimePick" <noreply@example.com>',
        to: 'admin@test.com',
      })
    )
  })

  // -----------------------------------------------------------------------
  // T2.2: sendEventInvitation uses dynamic transport
  // -----------------------------------------------------------------------

  it('T2.2: sendEventInvitation uses getTransporter and getFromAddress', async () => {
    const result = await sendEventInvitation(
      'user@test.com',
      { id: '00000000-0000-0000-0000-000000000001', name: 'Test Event', description: 'A test event' },
      'http://magic-link'
    )

    expect(result).toBe(true)
    expect(mockCreateTransport).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'smtp.example.org' })
    )
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: '"TimePick" <noreply@example.com>',
        to: 'user@test.com',
        subject: expect.stringContaining('Test Event'),
      })
    )
  })
})
