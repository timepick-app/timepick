import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals'

import type { SmtpSettings } from '../../db/settings.db'

// ---------------------------------------------------------------------------
// Mocks — must be declared BEFORE importing the module under test
// ---------------------------------------------------------------------------

const mockGetSmtpSettings = jest.fn<() => Promise<SmtpSettings>>()
jest.mock('../../db/settings.db', () => ({
  getSmtpSettings: mockGetSmtpSettings
}))

const mockVerify = jest.fn<() => Promise<void>>().mockResolvedValue(undefined)
const mockSendMail = jest.fn<() => Promise<{ messageId: string }>>().mockResolvedValue({ messageId: 'test-msg-id' })
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
  getEmailTransportSource
} from '../../services/email.service'

// ---------------------------------------------------------------------------
// Helpers
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

const DB_SETTINGS_EMPTY: SmtpSettings = {
  smtpHost: '',
  smtpPort: '',
  smtpSecure: false,
  smtpUser: '',
  smtpPassword: '',
  smtpFromName: 'TimePick',
  smtpFromEmail: ''
}

describe('email transport factory', () => {
  const originalEnv = { ...process.env } as Record<string, string | undefined>

  beforeEach(() => {
    jest.clearAllMocks()
    invalidateTransportCache()
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  // -----------------------------------------------------------------------
  // T6: Transport factory cascade (AC1)
  // -----------------------------------------------------------------------

  describe('createSmtpTransport — cascade resolution (AC1)', () => {
    it('T6.1: uses DB config when available', async () => {
      mockGetSmtpSettings.mockResolvedValue(DB_SETTINGS_FULL)

      await getTransporter()

      expect(mockCreateTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'smtp.example.org',
          port: 465,
          secure: true,
        })
      )
      expect(getEmailTransportSource()).toBe('db')
    })

    it('T6.2: falls back to .env SMTP_* when DB is empty', async () => {
      mockGetSmtpSettings.mockResolvedValue(DB_SETTINGS_EMPTY)
      process.env.SMTP_HOST = 'smtp.example.com'
      process.env.SMTP_PORT = '587'
      process.env.SMTP_SECURE = 'false'
      process.env.SMTP_USER = 'envuser@test.com'
      process.env.SMTP_PASSWORD = 'envpass'

      await getTransporter()

      expect(mockCreateTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'smtp.example.com',
          port: 587,
          secure: false,
          auth: { user: 'envuser@test.com', pass: 'envpass' }
        })
      )
      expect(getEmailTransportSource()).toBe('env')
    })

    it('T6.3: falls back to Mailpit when both DB and .env are empty', async () => {
      mockGetSmtpSettings.mockResolvedValue(DB_SETTINGS_EMPTY)
      delete process.env.SMTP_HOST
      delete process.env.EMAIL_FROM

      await getTransporter()

      expect(mockCreateTransport).toHaveBeenCalledWith({
        host: '127.0.0.1',
        port: 1025,
        secure: false,
        ignoreTLS: true
      })
      expect(getEmailTransportSource()).toBe('fallback')
    })

    it('falls back to Mailpit when getSmtpSettings throws and no env SMTP config', async () => {
      mockGetSmtpSettings.mockRejectedValue(new Error('DB down'))
      delete process.env.SMTP_HOST

      await getTransporter()

      expect(mockCreateTransport).toHaveBeenCalledWith({
        host: '127.0.0.1',
        port: 1025,
        secure: false,
        ignoreTLS: true
      })
    })
  })

  // -----------------------------------------------------------------------
  // T6: SSL/TLS configuration (AC2)
  // -----------------------------------------------------------------------

  describe('createSmtpTransport — SSL/TLS (AC2)', () => {
    it('T6.4: uses secure: true (SSL/TLS direct) when smtpSecure=true', async () => {
      mockGetSmtpSettings.mockResolvedValue({ ...DB_SETTINGS_FULL, smtpSecure: true })

      await getTransporter()

      expect(mockCreateTransport).toHaveBeenCalledWith(
        expect.objectContaining({ secure: true })
      )
    })

    it('T6.5: uses secure: false (STARTTLS) when smtpSecure=false', async () => {
      mockGetSmtpSettings.mockResolvedValue({
        ...DB_SETTINGS_FULL,
        smtpSecure: false,
        smtpPort: '587',
      })

      await getTransporter()

      expect(mockCreateTransport).toHaveBeenCalledWith(
        expect.objectContaining({ secure: false })
      )
    })
  })

  // -----------------------------------------------------------------------
  // T6: SMTP Authentication (AC3)
  // -----------------------------------------------------------------------

  describe('createSmtpTransport — auth (AC3)', () => {
    it('T6.6: includes auth object when smtp_user is set', async () => {
      mockGetSmtpSettings.mockResolvedValue(DB_SETTINGS_FULL)

      await getTransporter()

      expect(mockCreateTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          auth: { user: 'user@example.com', pass: 'secret' }
        })
      )
    })

    it('T6.7: no auth property when smtp_user is empty', async () => {
      mockGetSmtpSettings.mockResolvedValue({
        ...DB_SETTINGS_FULL,
        smtpUser: '',
        smtpPassword: '',
      })

      await getTransporter()

      const call = mockCreateTransport.mock.calls[0][0] as Record<string, unknown>
      expect('auth' in call).toBe(false)
    })
  })

  // -----------------------------------------------------------------------
  // Direct createSmtpTransport call (H4)
  // -----------------------------------------------------------------------

  describe('createSmtpTransport — direct call', () => {
    it('returns a transporter without caching', async () => {
      mockGetSmtpSettings.mockResolvedValue(DB_SETTINGS_FULL)
      invalidateTransportCache()

      const transport = await createSmtpTransport()
      expect(transport).toBeDefined()
      expect(mockCreateTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'smtp.example.org',
          port: 465,
          secure: true,
        })
      )
    })

    it('falls back to port 587 when smtpPort is empty', async () => {
      mockGetSmtpSettings.mockResolvedValue({
        ...DB_SETTINGS_FULL,
        smtpPort: '',
      })
      invalidateTransportCache()

      await createSmtpTransport()

      expect(mockCreateTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          port: 587,
        })
      )
    })
  })

  // -----------------------------------------------------------------------
  // T7: Cache invalidation (AC4)
  // -----------------------------------------------------------------------

  describe('transport cache (AC4)', () => {
    it('T7.1: returns same transporter when cache is warm', async () => {
      mockGetSmtpSettings.mockResolvedValue(DB_SETTINGS_FULL)
      // First call creates and caches transporter
      await getTransporter()

      // Clear mock to track new calls
      mockCreateTransport.mockClear()

      // Second call should return cached transporter — no new createTransport call
      await getTransporter()

      expect(mockCreateTransport).not.toHaveBeenCalled()
    })

    it('T7.2: creates new transporter after invalidation', async () => {
      mockGetSmtpSettings.mockResolvedValue(DB_SETTINGS_FULL)
      // First call — creates transporter
      await getTransporter()

      // Invalidate cache
      invalidateTransportCache()

      // Second call — should create new transporter
      mockGetSmtpSettings.mockResolvedValue({
        ...DB_SETTINGS_FULL,
        smtpHost: 'new.smtp.server',
      })
      await getTransporter()

      expect(mockCreateTransport).toHaveBeenCalledTimes(2)
    })

    it('T7.3: closes old transporter on invalidation', async () => {
      mockGetSmtpSettings.mockResolvedValue(DB_SETTINGS_FULL)
      await getTransporter()

      invalidateTransportCache()

      expect(mockClose).toHaveBeenCalled()
    })
  })

  // -----------------------------------------------------------------------
  // T8: Configurable sender address (AC6)
  // -----------------------------------------------------------------------

  describe('getFromAddress (AC6)', () => {
    it('T8.1: uses DB settings for from address', async () => {
      mockGetSmtpSettings.mockResolvedValue(DB_SETTINGS_FULL)

      const from = await getFromAddress()
      expect(from).toBe('"TimePick" <noreply@example.com>')
    })

    it('T8.2: falls back to .env SMTP_FROM_* when DB empty', async () => {
      mockGetSmtpSettings.mockResolvedValue(DB_SETTINGS_EMPTY)
      process.env.SMTP_FROM_EMAIL = 'env-from@test.com'
      process.env.SMTP_FROM_NAME = 'Env TimePick'
      delete process.env.EMAIL_FROM

      const from = await getFromAddress()
      expect(from).toBe('"Env TimePick" <env-from@test.com>')
    })

    it('T8.3: falls back to .env EMAIL_FROM when SMTP_FROM_* not set', async () => {
      mockGetSmtpSettings.mockResolvedValue(DB_SETTINGS_EMPTY)
      delete process.env.SMTP_FROM_EMAIL
      delete process.env.SMTP_FROM_NAME
      process.env.EMAIL_FROM = '"Legacy" <legacy@test.com>'

      const from = await getFromAddress()
      expect(from).toBe('"Legacy" <legacy@test.com>')
    })

    it('returns default when all sources empty', async () => {
      mockGetSmtpSettings.mockResolvedValue(DB_SETTINGS_EMPTY)
      delete process.env.SMTP_FROM_EMAIL
      delete process.env.SMTP_FROM_NAME
      delete process.env.EMAIL_FROM

      const from = await getFromAddress()
      expect(from).toBe('"TimePick" <noreply@example.com>')
    })

    it('uses default name "TimePick" when smtp_from_name is empty', async () => {
      mockGetSmtpSettings.mockResolvedValue({
        ...DB_SETTINGS_FULL,
        smtpFromName: '',
        smtpFromEmail: 'custom@test.com',
      })

      const from = await getFromAddress()
      expect(from).toBe('"TimePick" <custom@test.com>')
    })

    it('falls back gracefully when getSmtpSettings throws', async () => {
      mockGetSmtpSettings.mockRejectedValue(new Error('DB down'))
      delete process.env.SMTP_FROM_EMAIL
      process.env.EMAIL_FROM = '"Fallback" <fallback@test.com>'

      const from = await getFromAddress()
      expect(from).toBe('"Fallback" <fallback@test.com>')
    })

    it('caches from address and does not re-query DB', async () => {
      mockGetSmtpSettings.mockResolvedValue(DB_SETTINGS_FULL)
      invalidateTransportCache()

      const from1 = await getFromAddress()
      const callCountAfterFirst = mockGetSmtpSettings.mock.calls.length

      const from2 = await getFromAddress()

      expect(from1).toBe('"TimePick" <noreply@example.com>')
      expect(from2).toBe(from1)
      expect(mockGetSmtpSettings.mock.calls.length).toBe(callCountAfterFirst)
    })

    it('invalidates from address cache along with transporter', async () => {
      mockGetSmtpSettings.mockResolvedValue(DB_SETTINGS_FULL)

      await getFromAddress()
      invalidateTransportCache()

      mockGetSmtpSettings.mockResolvedValue({
        ...DB_SETTINGS_FULL,
        smtpFromEmail: 'new@example.com',
      })

      const from = await getFromAddress()
      expect(from).toBe('"TimePick" <new@example.com>')
    })

    it('escapes double quotes in from name', async () => {
      mockGetSmtpSettings.mockResolvedValue({
        ...DB_SETTINGS_FULL,
        smtpFromName: 'TimePick "Pro"',
        smtpFromEmail: 'test@example.com',
      })

      const from = await getFromAddress()
      expect(from).toBe('"TimePick \\"Pro\\"" <test@example.com>')
    })
  })

  // -----------------------------------------------------------------------
  // getTransporter — verify + cache (health awareness)
  // -----------------------------------------------------------------------

  describe('getTransporter — verify + cache', () => {
    it('calls verify() on first use and caches result', async () => {
      mockGetSmtpSettings.mockResolvedValue(DB_SETTINGS_FULL)
      const t = await getTransporter()
      expect(t).not.toBeNull()
      expect(mockVerify).toHaveBeenCalledTimes(1)
    })

    it('returns null when verify() fails', async () => {
      mockGetSmtpSettings.mockResolvedValue(DB_SETTINGS_FULL)
      mockVerify.mockRejectedValueOnce(new Error('ECONNREFUSED'))
      const t = await getTransporter()
      expect(t).toBeNull()
    })

    it('returns cached transporter on second call without re-verifying', async () => {
      mockGetSmtpSettings.mockResolvedValue(DB_SETTINGS_FULL)
      await getTransporter()
      await getTransporter()
      expect(mockVerify).toHaveBeenCalledTimes(1)
    })

    it('rebuilds after invalidation', async () => {
      mockGetSmtpSettings.mockResolvedValue(DB_SETTINGS_FULL)
      await getTransporter()
      invalidateTransportCache()
      await getTransporter()
      expect(mockCreateTransport).toHaveBeenCalledTimes(2)
    })
  })

  // -----------------------------------------------------------------------
  // sendMailWithFallback — retry on connection errors
  // -----------------------------------------------------------------------

  describe('sendMailWithFallback — retry logic', () => {
    it('returns true on first-try success', async () => {
      mockGetSmtpSettings.mockResolvedValue(DB_SETTINGS_FULL)
      mockSendMail.mockResolvedValueOnce({ messageId: 'ok' })
      const result = await sendAdminMagicLinkEmail('a@b.com', 'http://link', 1440, undefined, true)
      expect(result).toBe(true)
    })

    it('retries once on ECONNECTION and succeeds', async () => {
      mockGetSmtpSettings.mockResolvedValue(DB_SETTINGS_FULL)
      const econnErr = Object.assign(new Error('conn'), { code: 'ECONNECTION' })
      mockSendMail
        .mockRejectedValueOnce(econnErr)
        .mockResolvedValueOnce({ messageId: 'ok' })
      const result = await sendAdminMagicLinkEmail('a@b.com', 'http://link', 1440, undefined, true)
      expect(result).toBe(true)
    })

    it('returns false on EAUTH (no retry)', async () => {
      mockGetSmtpSettings.mockResolvedValue(DB_SETTINGS_FULL)
      const eauthErr = Object.assign(new Error('auth'), { code: 'EAUTH' })
      mockSendMail.mockRejectedValueOnce(eauthErr)
      const result = await sendAdminMagicLinkEmail('a@b.com', 'http://link', 1440, undefined, true)
      expect(result).toBe(false)
    })
  })

  // -----------------------------------------------------------------------
  // sendXxx — null transporter handling
  // -----------------------------------------------------------------------

  describe('sendXxx — null transporter handling', () => {
    it('returns false without throwing when getTransporter() returns null', async () => {
      mockGetSmtpSettings.mockResolvedValue(DB_SETTINGS_FULL)
      mockVerify.mockRejectedValue(new Error('conn fail'))
      const result = await sendAdminMagicLinkEmail('a@b.com', 'http://link', 1440, undefined, true)
      expect(result).toBe(false)
      mockVerify.mockResolvedValue(undefined)
    })
  })
})
