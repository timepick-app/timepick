import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals'

import type { SmtpSettings } from '../../db/settings.db'
import type { EmailProvider } from '../../db/email-provider.db'

// ---------------------------------------------------------------------------
// Mocks — must be declared BEFORE importing the module under test (style
// email-transport.test.ts). `descriptors`/`provider-credentials` restent
// RÉELS (données pures + fonctions sans effet de bord) — seuls les modules à
// effet de bord (DB, transport HTTP, nodemailer) sont mockés.
// ---------------------------------------------------------------------------

const mockGetSmtpSettings = jest.fn<() => Promise<SmtpSettings>>()
jest.mock('../../db/settings.db', () => ({
  getSmtpSettings: mockGetSmtpSettings,
}))

const mockGetEmailProviderConfig = jest.fn<() => Promise<{ provider: EmailProvider; credentials: Record<string, string> }>>()
jest.mock('../../db/email-provider.db', () => ({
  getEmailProviderConfig: mockGetEmailProviderConfig,
}))

const mockCreateApiTransport = jest.fn()
jest.mock('../../services/email-transport', () => ({
  createApiTransport: mockCreateApiTransport,
}))

const mockVerify = jest.fn<() => Promise<void>>()
const mockSendMail = jest.fn<() => Promise<{ messageId: string }>>()
const mockClose = jest.fn()
const mockCreateTransport = jest.fn().mockReturnValue({
  verify: mockVerify,
  sendMail: mockSendMail,
  close: mockClose,
})
jest.mock('nodemailer', () => ({
  createTransport: mockCreateTransport,
}))

import {
  getTransporter,
  invalidateTransportCache,
  getEmailTransportSource,
  getEncryptionKeyMismatch,
  sendProviderTest,
} from '../../services/email-transport.service'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DB_SETTINGS_EMPTY: SmtpSettings = {
  smtpHost: '',
  smtpPort: '',
  smtpSecure: false,
  smtpUser: '',
  smtpPassword: '',
  smtpFromName: 'TimePick',
  smtpFromEmail: '',
}

const DB_SETTINGS_HOST: SmtpSettings = { ...DB_SETTINGS_EMPTY, smtpHost: 'smtp.example.com' }

/** Credentials COMPLETS par fournisseur (tous les champs requis du catalogue). */
const COMPLETE_CREDENTIALS: Record<Exclude<EmailProvider, 'smtp'>, Record<string, string>> = {
  brevo: { apiKey: 'xkeysib-abc' },
  mailjet: { apiKey: 'ak', secretKey: 'sk' },
  scaleway: { secretKey: 'sec', projectId: 'proj-1', region: 'fr-par' },
  sweego: { apiKey: 'sw-key' },
  resend: { apiKey: 'abc-key' },
}

// ---------------------------------------------------------------------------
// buildTransport() dispatch — contrat §5, testé via getTransporter()
// ---------------------------------------------------------------------------

describe('buildTransport — dispatch provider data-driven (contrat §5, 5 fournisseurs)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    invalidateTransportCache()
    mockGetSmtpSettings.mockResolvedValue(DB_SETTINGS_EMPTY)
    mockVerify.mockResolvedValue(undefined)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it.each(Object.entries(COMPLETE_CREDENTIALS) as [Exclude<EmailProvider, 'smtp'>, Record<string, string>][])(
    "T1.%s: email_provider='%s' avec credentials complets → court-circuite vers createApiTransport, source='db', getSmtpSettings jamais appelé",
    async (provider, credentials) => {
      mockGetEmailProviderConfig.mockResolvedValue({ provider, credentials })
      const fakeApiTransport = { name: provider }
      mockCreateApiTransport.mockReturnValue(fakeApiTransport)

      await getTransporter()

      expect(mockCreateApiTransport).toHaveBeenCalledWith(provider, credentials)
      expect(mockCreateTransport).toHaveBeenCalledWith(fakeApiTransport)
      expect(getEmailTransportSource()).toBe('db')
      expect(mockGetSmtpSettings).not.toHaveBeenCalled()
    },
  )

  it("T2: email_provider='resend' sans clé → log explicite + cascade SMTP inchangée", async () => {
    mockGetEmailProviderConfig.mockResolvedValue({ provider: 'resend', credentials: { apiKey: '' } })
    mockGetSmtpSettings.mockResolvedValue(DB_SETTINGS_HOST)
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)

    await getTransporter()

    expect(mockCreateApiTransport).not.toHaveBeenCalled()
    expect(mockGetSmtpSettings).toHaveBeenCalled()
    expect(mockCreateTransport).toHaveBeenCalledWith(expect.objectContaining({ host: 'smtp.example.com' }))
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('email_provider=resend sans identifiants complets'))
  })

  it("T2b: email_provider='mailjet' avec apiKey mais SANS secretKey (multi-champ incomplet) → cascade SMTP", async () => {
    mockGetEmailProviderConfig.mockResolvedValue({ provider: 'mailjet', credentials: { apiKey: 'ak', secretKey: '' } })
    mockGetSmtpSettings.mockResolvedValue(DB_SETTINGS_HOST)
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)

    await getTransporter()

    expect(mockCreateApiTransport).not.toHaveBeenCalled()
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('email_provider=mailjet sans identifiants complets'))
  })

  it("T3: email_provider='smtp' → createApiTransport jamais appelé, cascade SMTP byte-identique", async () => {
    mockGetEmailProviderConfig.mockResolvedValue({ provider: 'smtp', credentials: { apiKey: '' } })
    mockGetSmtpSettings.mockResolvedValue(DB_SETTINGS_HOST)

    await getTransporter()

    expect(mockCreateApiTransport).not.toHaveBeenCalled()
    expect(mockCreateTransport).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'smtp.example.com', port: 587, secure: false }),
    )
    expect(getEmailTransportSource()).toBe('db')
  })

  it('T4: échec de déchiffrement de la clé provider → encryptionKeyMismatch=true, PAS réinitialisé par le try SMTP qui suit (seul delta autorisé)', async () => {
    mockGetEmailProviderConfig.mockRejectedValue(new Error('Unsupported state or unable to authenticate data'))
    mockGetSmtpSettings.mockResolvedValue(DB_SETTINGS_HOST) // le try SMTP réussit quand même
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)

    await getTransporter()

    expect(getEncryptionKeyMismatch()).toBe(true)
    expect(mockGetSmtpSettings).toHaveBeenCalled() // la cascade SMTP continue malgré l'échec provider
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('ENCRYPTION_KEY mismatch'))
  })

  it("T5: échec générique de lecture provider (pas un échec de déchiffrement) → log + cascade SMTP, encryptionKeyMismatch réinitialisé à false", async () => {
    mockGetEmailProviderConfig.mockRejectedValue(new Error('DB connection timeout'))
    mockGetSmtpSettings.mockResolvedValue(DB_SETTINGS_HOST)
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)

    await getTransporter()

    expect(getEncryptionKeyMismatch()).toBe(false)
    expect(errSpy).toHaveBeenCalledWith('[EmailService] Failed to read email provider config:', expect.any(Error))
  })
})

// ---------------------------------------------------------------------------
// sendProviderTest() — verify() puis sendMail(), contrat §3/§5
// ---------------------------------------------------------------------------

describe('sendProviderTest — transport ad-hoc, ne lève jamais', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCreateApiTransport.mockReturnValue({ name: 'resend' })
    mockVerify.mockResolvedValue(undefined)
    mockSendMail.mockResolvedValue({ messageId: 'id-1' })
  })

  it('T6: succès — verify() puis sendMail(), close() toujours appelé, message générique', async () => {
    const result = await sendProviderTest(
      { provider: 'resend', credentials: { apiKey: 'abc' }, fromName: 'MonApp', fromEmail: 'from@example.com' },
      'admin@example.com',
      { html: '<p>hi</p>', text: 'hi' },
    )

    expect(result).toEqual({ success: true, message: 'Connexion réussie' })
    expect(mockCreateApiTransport).toHaveBeenCalledWith('resend', { apiKey: 'abc' })
    expect(mockVerify).toHaveBeenCalledTimes(1)
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: '"MonApp" <from@example.com>',
        to: 'admin@example.com',
        html: '<p>hi</p>',
        text: 'hi',
      }),
    )
    expect(mockClose).toHaveBeenCalledTimes(1)
  })

  it('T6b: mailjet — credentials multi-champ transmis tels quels au transport', async () => {
    await sendProviderTest(
      { provider: 'mailjet', credentials: { apiKey: 'ak', secretKey: 'sk' } },
      'admin@example.com',
      { html: 'h', text: 't' },
    )

    expect(mockCreateApiTransport).toHaveBeenCalledWith('mailjet', { apiKey: 'ak', secretKey: 'sk' })
  })

  it("T7: verify() rejette (mauvaise clé) → success:false, message propagé tel quel (jamais de faux succès)", async () => {
    const eauthErr = Object.assign(new Error('Clé API refusée (401): Invalid API key'), { code: 'EAUTH' })
    mockVerify.mockRejectedValue(eauthErr)

    const result = await sendProviderTest({ provider: 'resend', credentials: { apiKey: 'bad' } }, 'admin@example.com', { html: 'h', text: 't' })

    expect(result.success).toBe(false)
    expect(result.message).toBe('Clé API refusée (401): Invalid API key')
    expect(mockSendMail).not.toHaveBeenCalled()
    expect(mockClose).toHaveBeenCalledTimes(1)
  })

  it('T8: sendMail() rejette après verify() réussi → success:false, message propagé', async () => {
    mockSendMail.mockRejectedValue(new Error('Requête rejetée (400): destinataire invalide'))

    const result = await sendProviderTest({ provider: 'resend', credentials: { apiKey: 'abc' } }, 'admin@example.com', { html: 'h', text: 't' })

    expect(result).toEqual({ success: false, message: 'Requête rejetée (400): destinataire invalide' })
  })

  it("T9: from par défaut '\"TimePick\" <recipient>' quand fromName/fromEmail absents", async () => {
    await sendProviderTest({ provider: 'resend', credentials: { apiKey: 'abc' } }, 'admin@example.com', { html: 'h', text: 't' })

    expect(mockSendMail).toHaveBeenCalledWith(expect.objectContaining({ from: '"TimePick" <admin@example.com>' }))
  })

  it('T10: ne lève jamais même si la construction du transport échoue', async () => {
    mockCreateApiTransport.mockImplementation(() => {
      throw new Error('Descripteur introuvable')
    })

    await expect(
      sendProviderTest({ provider: 'resend', credentials: { apiKey: 'abc' } }, 'a@b.com', { html: 'h', text: 't' }),
    ).resolves.toEqual({ success: false, message: 'Descripteur introuvable' })
    expect(mockClose).not.toHaveBeenCalled() // transport jamais construit → rien à fermer
  })
})
