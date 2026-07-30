import { describe, it, expect, jest, beforeEach } from '@jest/globals'

// ---------------------------------------------------------------------------
// Mock setup — nodemailer + renderEmail
// ---------------------------------------------------------------------------

const mockSendMail = jest.fn() as any
const mockVerify = jest.fn().mockResolvedValue(undefined as never) as any
const mockClose = jest.fn() as any
const mockCreateTransport = jest.fn(() => ({
  sendMail: mockSendMail,
  verify: mockVerify,
  close: mockClose
}))

jest.mock('nodemailer', () => ({
  __esModule: true,
  default: {
    createTransport: mockCreateTransport
  }
}))

const mockRenderEmail = jest.fn() as any
// Classe stub partagée : le service importe `TemplateNotFoundError` depuis ce
// module mocké, donc `instanceof` matche les instances créées dans les tests.
const mockTemplateNotFoundError = class extends Error {
  constructor(message?: string) {
    super(message)
    this.name = 'TemplateNotFoundError'
  }
}
type SetupAdminEmailVars = {
  magic_link: string
  expiration_date: string
  user_first_name: string
  user_last_name: string
  user_full_name: string
}
const mockRenderSetupAdminEmail =
  jest.fn<(vars: SetupAdminEmailVars) => Promise<{ html: string; text: string }>>()
jest.mock('../../services/render-email.service', () => ({
  __esModule: true,
  renderEmail: (...args: any[]) => mockRenderEmail(...args),
  renderSetupAdminEmail: (vars: SetupAdminEmailVars) => mockRenderSetupAdminEmail(vars),
  HEALTHCHECK_STUB_VARIABLES: {},
  TemplateNotFoundError: mockTemplateNotFoundError,
}))

// Import AFTER mocks
import {
  sendSlotCancellationEmail,
  sendAdminMagicLinkEmail,
  sendSetupAdminEmail,
  sendWelcomeInvitation,
  sendUserMagicLinkEmail,
  sendEventInvitation,
  sendReservationEmail,
  sendUnregistrationEmail,
  sendTemplateTestEmail,
  sendRoleChangedEmail,
  withAdminCtx,
  invalidateTransportCache,
  buildPreviewVariables,
} from '../../services/email.service'

// ---------------------------------------------------------------------------
// sendSlotCancellationEmail — wired via renderEmail (Plan 5b defer-A L3-data-F)
// ---------------------------------------------------------------------------

describe('sendSlotCancellationEmail', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    invalidateTransportCache()
    mockSendMail.mockResolvedValue({ messageId: 'test-123' } as never)
    mockVerify.mockResolvedValue(undefined as never)
    mockRenderEmail.mockResolvedValue({ html: '<html>rendered</html>', text: 'rendered text' })
  })

  it('calls renderEmail with templateKey cancellation_confirmation and canonical variables', async () => {
    const sent = await sendSlotCancellationEmail({
      userEmail: 'user@example.com',
      userFirstName: 'Jean',
      userLastName: 'Dupont',
      eventName: "Fête de l'école",
      slotDate: '15/06/2026',
      slotTime: '14h00 → 16h00',
      eventId: 'evt-uuid-123',
    })

    expect(sent).toBe(true)
    expect(mockRenderEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        templateKey: 'cancellation_confirmation',
        variables: expect.objectContaining({
          event_name: "Fête de l'école",
          user_first_name: 'Jean',
          slot_date: '15/06/2026',
          slot_time: '14h00 → 16h00',
          cancellation_reason: '',
          calendar_url: expect.stringContaining('/events/evt-uuid-123'),
        }),
      })
    )
  })

  it('pre-formats cancellation_reason as escaped HTML when motif is provided', async () => {
    await sendSlotCancellationEmail({
      userEmail: 'user@example.com',
      userFirstName: 'Marie',
      eventName: 'Kermesse',
      slotDate: '20/06/2026',
      slotTime: '10:00 - 12:00',
      eventId: 'evt-uuid-123',
      cancellationReason: 'Événement <reporté>',
    })

    const call = mockRenderEmail.mock.calls[0][0] as { variables: { cancellation_reason: string } }
    expect(call.variables.cancellation_reason).toContain('<strong>Motif :</strong>')
    // user input is HTML-escaped
    expect(call.variables.cancellation_reason).toContain('&lt;reporté&gt;')
    expect(call.variables.cancellation_reason).not.toContain('<reporté>')
  })

  it('omits motif HTML wrapper when cancellationReason is whitespace-only', async () => {
    await sendSlotCancellationEmail({
      userEmail: 'user@example.com',
      userFirstName: 'Marie',
      eventName: 'Kermesse',
      slotDate: '20/06/2026',
      slotTime: '10:00 - 12:00',
      eventId: 'evt-uuid-123',
      cancellationReason: '   ',
    })

    const call = mockRenderEmail.mock.calls[0][0] as { variables: { cancellation_reason: string } }
    expect(call.variables.cancellation_reason).toBe('')
  })

  it('uses subject "Créneau annulé - ${eventName}"', async () => {
    await sendSlotCancellationEmail({
      userEmail: 'u@b.com',
      userFirstName: 'Test',
      eventName: 'Gala',
      slotDate: '01/01/2026',
      slotTime: '10:00',
      eventId: 'evt-uuid-123',
    })

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'Créneau annulé - Gala',
        text: 'rendered text',
        html: '<html>rendered</html>',
      })
    )
  })

  it('returns false and skips SMTP when renderEmail rejects', async () => {
    mockRenderEmail.mockRejectedValueOnce(new Error('mjml compile fail'))

    const sent = await sendSlotCancellationEmail({
      userEmail: 'user@example.com',
      userFirstName: 'Test',
      userLastName: 'User',
      eventName: 'Test Event',
      slotDate: '01/01/2026',
      slotTime: '09:00 - 10:00',
      eventId: 'evt-uuid-123',
    })

    expect(sent).toBe(false)
    expect(mockSendMail).not.toHaveBeenCalled()
  })

  it('returns false when SMTP transport rejects', async () => {
    mockSendMail.mockRejectedValueOnce(new Error('SMTP error'))

    const sent = await sendSlotCancellationEmail({
      userEmail: 'user@example.com',
      userFirstName: 'Test',
      userLastName: 'User',
      eventName: 'Test Event',
      slotDate: '01/01/2026',
      slotTime: '09:00 - 10:00',
      eventId: 'evt-uuid-123',
    })

    expect(sent).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// sendUnregistrationEmail — confirmation de désinscription volontaire membre
// ---------------------------------------------------------------------------

describe('sendUnregistrationEmail', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    invalidateTransportCache()
    mockSendMail.mockResolvedValue({ messageId: 'test-123' } as never)
    mockVerify.mockResolvedValue(undefined as never)
    mockRenderEmail.mockResolvedValue({ html: '<html>rendered</html>', text: 'rendered text' })
  })

  it('calls renderEmail with templateKey unregistration_confirmation and canonical variables', async () => {
    const sent = await sendUnregistrationEmail({
      userEmail: 'user@example.com',
      userFirstName: 'Jean',
      userLastName: 'Dupont',
      eventName: "Fête de l'école",
      eventId: 'event-uuid-123',
      slotDate: '15/06/2026',
      slotTime: '14h00 → 16h00',
    })

    expect(sent).toBe(true)
    expect(mockRenderEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        templateKey: 'unregistration_confirmation',
        variables: expect.objectContaining({
          event_name: "Fête de l'école",
          user_first_name: 'Jean',
          slot_date: '15/06/2026',
          slot_time: '14h00 → 16h00',
          calendar_url: expect.stringContaining('/events/event-uuid-123'),
        }),
      })
    )
  })

  it('uses subject "Désinscription confirmée - ${eventName}"', async () => {
    await sendUnregistrationEmail({
      userEmail: 'u@b.com',
      userFirstName: 'Test',
      eventName: 'Gala',
      eventId: 'event-uuid-123',
      slotDate: '01/01/2026',
      slotTime: '10:00',
    })

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'Désinscription confirmée - Gala',
        text: 'rendered text',
        html: '<html>rendered</html>',
      })
    )
  })

  it('returns false and skips SMTP when renderEmail rejects', async () => {
    mockRenderEmail.mockRejectedValueOnce(new Error('mjml compile fail'))

    const sent = await sendUnregistrationEmail({
      userEmail: 'user@example.com',
      userFirstName: 'Test',
      userLastName: 'User',
      eventName: 'Test Event',
      eventId: 'event-uuid-123',
      slotDate: '01/01/2026',
      slotTime: '09:00 - 10:00',
    })

    expect(sent).toBe(false)
    expect(mockSendMail).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// sendWelcomeInvitation — wired via renderEmail (account_created)
// ---------------------------------------------------------------------------

describe('sendWelcomeInvitation', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    invalidateTransportCache()
    mockSendMail.mockResolvedValue({ messageId: 'test-123' } as never)
    mockVerify.mockResolvedValue(undefined as never)
    mockRenderEmail.mockResolvedValue({ html: '<html>rendered</html>', text: 'rendered text' })
  })

  it('appelle renderEmail avec templateKey account_created et login_url + ctx=admin quand isAdmin=true', async () => {
    const sent = await sendWelcomeInvitation('a@b.com', 'Admin', 'User', true)
    expect(sent).toBe(true)
    expect(mockRenderEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        templateKey: 'account_created',
        variables: expect.objectContaining({
          user_first_name: 'Admin',
          login_url: expect.stringContaining('ctx=admin'),
        }),
      })
    )
  })

  it("n'ajoute PAS ctx=admin quand isAdmin=false", async () => {
    await sendWelcomeInvitation('a@b.com', 'Regular', 'User', false)
    const loginUrl = (mockRenderEmail.mock.calls[0][0] as { variables: { login_url: string } }).variables.login_url
    expect(loginUrl).not.toContain('ctx=admin')
    expect(
      (mockRenderEmail.mock.calls[0][0] as { variables: { user_first_name: string } }).variables.user_first_name
    ).toBe('Regular')
  })

  it('utilise user_first_name vide quand firstName est undefined', async () => {
    await sendWelcomeInvitation('a@b.com', undefined, undefined, false)
    expect(mockRenderEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: expect.objectContaining({
          user_first_name: '',
        }),
      })
    )
  })

  it('transmet le bon sujet et le payload rendu à sendMail', async () => {
    await sendWelcomeInvitation('a@b.com', 'X', null, false)

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'Bienvenue — votre compte a été créé',
        text: 'rendered text',
        html: '<html>rendered</html>',
      })
    )
  })

  it('retourne false et saute le SMTP quand renderEmail rejette', async () => {
    mockRenderEmail.mockRejectedValueOnce(new Error('mjml compile fail'))

    const sent = await sendWelcomeInvitation('a@b.com', 'X', null, false)

    expect(sent).toBe(false)
    expect(mockSendMail).not.toHaveBeenCalled()
  })

  it('retourne false quand le transport SMTP rejette', async () => {
    mockSendMail.mockRejectedValueOnce(new Error('SMTP error'))

    const sent = await sendWelcomeInvitation('a@b.com', 'X', null, false)

    expect(sent).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// sendRoleChangedEmail — wired via renderEmail (role_promoted / role_demoted)
// ---------------------------------------------------------------------------

describe('sendRoleChangedEmail', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    invalidateTransportCache()
    mockSendMail.mockResolvedValue({ messageId: 'test-role' } as never)
    mockVerify.mockResolvedValue(undefined as never)
    mockRenderEmail.mockResolvedValue({ html: '<html>rendered</html>', text: 'rendered text' })
  })

  it("promotion : templateKey role_promoted + login_url avec ctx=admin", async () => {
    const sent = await sendRoleChangedEmail('a@b.com', 'Promu', 'User', 'promoted')
    expect(sent).toBe(true)
    expect(mockRenderEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        templateKey: 'role_promoted',
        variables: expect.objectContaining({
          user_first_name: 'Promu',
          login_url: expect.stringContaining('ctx=admin'),
        }),
      })
    )
  })

  it("rétrogradation : templateKey role_demoted + login_url SANS ctx=admin", async () => {
    const sent = await sendRoleChangedEmail('a@b.com', 'Retro', 'User', 'demoted')
    expect(sent).toBe(true)
    const arg = mockRenderEmail.mock.calls[0][0] as { templateKey: string; variables: { login_url: string } }
    expect(arg.templateKey).toBe('role_demoted')
    expect(arg.variables.login_url).not.toContain('ctx=admin')
  })

  it('utilise user_first_name vide quand firstName est undefined', async () => {
    await sendRoleChangedEmail('a@b.com', undefined, undefined, 'promoted')
    expect(
      (mockRenderEmail.mock.calls[0][0] as { variables: { user_first_name: string } }).variables.user_first_name
    ).toBe('')
  })

  it('retourne false quand le rendu échoue', async () => {
    mockRenderEmail.mockRejectedValueOnce(new Error('render boom') as never)
    const sent = await sendRoleChangedEmail('a@b.com', 'X', null, 'demoted')
    expect(sent).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// withAdminCtx — URL helper
// ---------------------------------------------------------------------------

describe('withAdminCtx', () => {
  it('appends ctx=admin to a bare URL', () => {
    expect(withAdminCtx('http://app/login')).toBe('http://app/login?ctx=admin')
  })

  it('preserves existing query params when adding ctx=admin', () => {
    const result = withAdminCtx('http://app/login?token=xyz')
    const params = new URL(result).searchParams
    expect(params.get('token')).toBe('xyz')
    expect(params.get('ctx')).toBe('admin')
  })

  it('is idempotent — re-applying yields exactly one ctx=admin param', () => {
    const result = withAdminCtx('http://app/login?ctx=admin')
    expect(new URL(result).searchParams.getAll('ctx')).toHaveLength(1)
    expect(new URL(result).searchParams.get('ctx')).toBe('admin')
  })

  it('preserves URL fragment and places ctx=admin before it', () => {
    const result = withAdminCtx('http://app/login#token=xyz')
    const u = new URL(result)
    expect(u.hash).toBe('#token=xyz')
    expect(u.searchParams.get('ctx')).toBe('admin')
  })

  it('returns the original link (without throwing) on malformed URLs', () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    expect(withAdminCtx('not-a-valid-url')).toBe('not-a-valid-url')
    expect(withAdminCtx('')).toBe('')
    expect(withAdminCtx('/relative/path')).toBe('/relative/path')
    errSpy.mockRestore()
  })
})

// ---------------------------------------------------------------------------
// T6.1: Wiring contracts — renderEmail call signatures
// ---------------------------------------------------------------------------

describe('wired functions — renderEmail contracts', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    invalidateTransportCache()
    mockSendMail.mockResolvedValue({ messageId: 'test' } as never)
    mockVerify.mockResolvedValue(undefined as never)
    mockRenderEmail.mockResolvedValue({ html: '<html>rendered</html>', text: 'rendered text' })
  })

  // #1 sendAdminMagicLinkEmail
  it('sendAdminMagicLinkEmail calls renderEmail with magic_link_login + is_admin=true', async () => {
    const sent = await sendAdminMagicLinkEmail(
      'admin@test.com',
      'http://app/login?token=xyz',
      1440,
      undefined,
      true
    )
    expect(sent).toBe(true)
    expect(mockRenderEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        templateKey: 'magic_link_login',
        variables: expect.objectContaining({ is_admin: 'true' }),
      })
    )
    // ctx=admin is in the magic_link variable
    const call = mockRenderEmail.mock.calls[0][0] as { variables: { magic_link: string } }
    expect(call.variables.magic_link).toContain('ctx=admin')
  })

  it('sendAdminMagicLinkEmail uses subject "Connexion à l\'administration TimePick"', async () => {
    await sendAdminMagicLinkEmail('a@b.com', 'http://link', 1440, undefined, true)
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({ subject: expect.stringContaining('administration') })
    )
  })

  // #1bis sendSetupAdminEmail — email de setup dédié (wizard d'installation)
  it('sendSetupAdminEmail calls renderSetupAdminEmail (not renderEmail) with ctx=admin link, formatted expiration, prénom/nom, sujet dédié', async () => {
    mockRenderSetupAdminEmail.mockResolvedValue({ html: '<html>setup</html>', text: 'setup text' })
    const sent = await sendSetupAdminEmail(
      'first-admin@test.com',
      'http://app/login?token=bootstrap',
      new Date('2026-07-28T14:30:00'),
      'Camille',
      'Martin'
    )
    expect(sent).toBe(true)
    expect(mockRenderEmail).not.toHaveBeenCalled()
    expect(mockRenderSetupAdminEmail).toHaveBeenCalledTimes(1)
    const vars = mockRenderSetupAdminEmail.mock.calls[0][0]
    expect(vars.magic_link).toContain('ctx=admin')
    expect(vars.expiration_date).toBe('28 juillet 2026 a 14h30')
    expect(vars.user_first_name).toBe('Camille')
    expect(vars.user_full_name).toBe('Camille Martin')
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({ subject: 'Bienvenue sur TimePick — configurez votre espace' })
    )
  })

  it('sendSetupAdminEmail returns false when rendering fails', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    mockRenderSetupAdminEmail.mockRejectedValueOnce(new Error('mjml boom'))
    const sent = await sendSetupAdminEmail('a@b.com', 'http://link', new Date())
    expect(sent).toBe(false)
    expect(mockSendMail).not.toHaveBeenCalled()
    errSpy.mockRestore()
  })

  // #2 sendUserMagicLinkEmail
  it('sendUserMagicLinkEmail calls renderEmail with magic_link_login + is_admin=false', async () => {
    const sent = await sendUserMagicLinkEmail('user@test.com', 'http://app/login?token=abc')
    expect(sent).toBe(true)
    expect(mockRenderEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        templateKey: 'magic_link_login',
        variables: expect.objectContaining({ is_admin: 'false' }),
      })
    )
    // NO ctx=admin in the link
    const call = mockRenderEmail.mock.calls[0][0] as { variables: { magic_link: string } }
    expect(call.variables.magic_link).not.toContain('ctx=admin')
  })

  it('sendUserMagicLinkEmail uses subject "Connexion à TimePick"', async () => {
    await sendUserMagicLinkEmail('u@b.com', 'http://link')
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({ subject: 'Connexion à TimePick' })
    )
  })

  // #6 sendEventInvitation
  it('sendEventInvitation calls renderEmail with invitation + eventId', async () => {
    const expDate = new Date('2026-12-31T23:59:59Z')
    const sent = await sendEventInvitation(
      'user@test.com',
      { id: 'event-uuid-1', name: 'Fête', description: 'Une belle fête' },
      'http://magic',
      expDate
    )
    expect(sent).toBe(true)
    expect(mockRenderEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        templateKey: 'invitation',
        eventId: 'event-uuid-1',
        variables: expect.objectContaining({
          event_name: 'Fête',
          event_description: 'Une belle fête',
          magic_link: 'http://magic',
        }),
      })
    )
  })

  it('sendEventInvitation uses subject with event name', async () => {
    await sendEventInvitation(
      'u@b.com',
      { id: 'evt-1', name: 'Gala', description: null },
      'http://link'
    )
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({ subject: expect.stringContaining('Gala') })
    )
  })

  // #9 sendReservationEmail
  it('sendReservationEmail calls renderEmail with reservation_confirmation', async () => {
    const sent = await sendReservationEmail({
      userEmail: 'user@test.com',
      userFirstName: 'Marie',
      userLastName: null,
      eventId: 'event-uuid-1',
      eventName: 'Kermesse',
      slotDate: '25/06/2026',
      slotTime: '14h00 → 16h00',
    })
    expect(sent).toBe(true)
    expect(mockRenderEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        templateKey: 'reservation_confirmation',
        variables: expect.objectContaining({
          event_name: 'Kermesse',
          user_first_name: 'Marie',
          slot_date: '25/06/2026',
          slot_time: '14h00 → 16h00',
          calendar_url: expect.stringContaining('/events/'),
        }),
      })
    )
  })

  it('sendReservationEmail uses subject with event name', async () => {
    await sendReservationEmail({
      userEmail: 'u@b.com',
      userFirstName: 'Test',
      userLastName: null,
      eventId: 'event-uuid-2',
      eventName: 'Gala',
      slotDate: '01/01/2026',
      slotTime: '10:00',
    })
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({ subject: expect.stringContaining('Gala') })
    )
  })

  // T6.3: sendEventInvitation is used by bulk (verify the delegate is wired)
  it('sendEventInvitation is the function used by callers (no separate bulk render)', async () => {
    // Call sendEventInvitation and verify it goes through renderEmail (not inline)
    await sendEventInvitation(
      'u@b.com',
      { id: 'e1', name: 'Test' },
      'http://link'
    )
    expect(mockRenderEmail).toHaveBeenCalledTimes(1)
    expect(mockRenderEmail).toHaveBeenCalledWith(
      expect.objectContaining({ templateKey: 'invitation' })
    )
  })
})

// ---------------------------------------------------------------------------
// T6.4: Structured-log helper on reject path
// ---------------------------------------------------------------------------

describe('logRenderEmailFailure — structured logging on render failure', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    invalidateTransportCache()
    mockRenderEmail.mockRejectedValue(new Error('MJML compile failed'))
    mockVerify.mockResolvedValue(undefined as never)
  })

  it('logs structured payload with templateKey, errorName, errorMessage on failure', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

    await sendAdminMagicLinkEmail('a@b.com', 'http://link', 1440, undefined, true)

    expect(errSpy).toHaveBeenCalledTimes(1)
    expect(errSpy.mock.calls[0][0]).toBe('[EmailService] renderEmail failed:')
    const logArg = errSpy.mock.calls[0][1] as Record<string, unknown>
    expect(logArg).toMatchObject({
      templateKey: 'magic_link_login',
      errorName: 'Error',
      errorMessage: 'MJML compile failed',
    })

    errSpy.mockRestore()
  })

  it('includes eventId when provided (invitation template)', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

    await sendEventInvitation(
      'u@b.com',
      { id: 'event-123', name: 'Test' },
      'http://link'
    )

    expect(errSpy).toHaveBeenCalledTimes(1)
    const logArg = errSpy.mock.calls[0][1] as Record<string, unknown>
    expect(logArg).toMatchObject({ eventId: 'event-123', templateKey: 'invitation' })

    errSpy.mockRestore()
  })

  it('redacts recipient email', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

    await sendUserMagicLinkEmail('sensitive@email.com', 'http://link')

    expect(errSpy).toHaveBeenCalledTimes(1)
    const logArg = errSpy.mock.calls[0][1] as Record<string, unknown>
    expect(logArg.recipient).toBe('se***@email.com')

    errSpy.mockRestore()
  })

  it('redacts short email locals (≤2 chars before @) without leaking PII', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

    await sendUserMagicLinkEmail('a@x.com', 'http://link')

    expect(errSpy).toHaveBeenCalledTimes(1)
    const logArg = errSpy.mock.calls[0][1] as Record<string, unknown>
    expect(logArg.recipient).toBe('***@x.com')
    expect(logArg.recipient).not.toContain('a@')

    errSpy.mockRestore()
  })

  it('returns false when renderEmail fails (does not throw)', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {})
    const result = await sendReservationEmail({
      userEmail: 'u@b.com',
      userFirstName: 'Test',
      userLastName: null,
      eventId: 'event-uuid-3',
      eventName: 'Ev',
      slotDate: '01/01',
      slotTime: '10:00',
    })
    expect(result).toBe(false)
  })
})
describe('sendTemplateTestEmail', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    invalidateTransportCache()
    mockSendMail.mockResolvedValue({ messageId: 'test-123' } as never)
    mockVerify.mockResolvedValue(undefined as never)
    mockRenderEmail.mockResolvedValue({ html: '<html>rendu</html>', text: 'rendu texte' })
  })

  it('rend le template et envoie avec le sujet de test mappé', async () => {
    const result = await sendTemplateTestEmail({
      templateKey: 'magic_link_login',
      to: 'dest@example.com',
    })

    expect(result).toEqual({ ok: true })
    expect(mockRenderEmail).toHaveBeenCalledWith(
      expect.objectContaining({ templateKey: 'magic_link_login' }),
    )
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'dest@example.com',
        subject: '[Test TimePick] Connexion à TimePick',
        html: '<html>rendu</html>',
        text: 'rendu texte',
      }),
    )
  })

  it('transmet eventId à renderEmail pour une invitation per-event', async () => {
    await sendTemplateTestEmail({
      templateKey: 'invitation',
      eventId: '11111111-1111-1111-1111-111111111111',
      to: 'dest@example.com',
    })

    expect(mockRenderEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        templateKey: 'invitation',
        eventId: '11111111-1111-1111-1111-111111111111',
        variables: expect.objectContaining({ event_name: 'Réunion de présentation' }),
      }),
    )
  })

  it('retourne {ok:false, reason:"no_transport"} quand le transport ne se vérifie pas', async () => {
    mockVerify.mockRejectedValue(new Error('connexion impossible') as never)

    const result = await sendTemplateTestEmail({
      templateKey: 'invitation',
      to: 'dest@example.com',
    })

    expect(result).toEqual({ ok: false, reason: 'no_transport' })
    expect(mockSendMail).not.toHaveBeenCalled()
  })

  it('retourne {ok:false, reason:"template_not_found"} quand le template est absent', async () => {
    mockRenderEmail.mockRejectedValue(new mockTemplateNotFoundError('invitation'))

    const result = await sendTemplateTestEmail({
      templateKey: 'invitation',
      to: 'dest@example.com',
    })

    expect(result).toEqual({ ok: false, reason: 'template_not_found' })
  })

  it('retourne {ok:false, reason:"send_failed"} quand sendMail échoue (erreur non-réseau)', async () => {
    mockSendMail.mockRejectedValue(new Error('550 rejected') as never)

    const result = await sendTemplateTestEmail({
      templateKey: 'invitation',
      to: 'dest@example.com',
    })

    expect(result).toEqual({ ok: false, reason: 'send_failed' })
  })

  it('magic_link_login admin : sujet admin + lien ctx=admin', async () => {
    await sendTemplateTestEmail({ templateKey: 'magic_link_login', to: 'dest@example.com', isAdmin: true })
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({ subject: "[Test TimePick] Connexion à l'administration TimePick" }),
    )
    expect(mockRenderEmail).toHaveBeenCalledWith(
      expect.objectContaining({ variables: expect.objectContaining({ is_admin: 'true', magic_link: expect.stringContaining('ctx=admin') }) }),
    )
  })

  it('invitation per-event : sujet = [Test TimePick] + vrai sujet avec le nom réel', async () => {
    await sendTemplateTestEmail({ templateKey: 'invitation', eventId: '11111111-1111-1111-1111-111111111111', to: 'dest@example.com', eventName: 'Gala' })
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({ subject: '[Test TimePick] Inscription participation - Gala' }),
    )
  })
})

// ---------------------------------------------------------------------------
// buildPreviewVariables — pure function, no DB/network
// ---------------------------------------------------------------------------

describe('buildPreviewVariables', () => {
  it('sans arguments : event_name est la valeur démo et aucune valeur ne contient Healthcheck ou example.invalid', () => {
    const vars = buildPreviewVariables()
    expect(vars.event_name).toBe('Réunion de présentation')
    expect(vars.event_name).not.toContain('Healthcheck')
    expect(vars.magic_link).not.toContain('example.invalid')
    expect(vars.expiration_date).not.toContain('example.invalid')
    expect(vars.login_url).not.toContain('example.invalid')
    expect(vars.calendar_url).not.toContain('example.invalid')
  })

  it('avec eventName et eventDescription : les valeurs réelles sont reflétées', () => {
    const vars = buildPreviewVariables({
      eventName: 'Fête de la lune',
      eventDescription: 'Desc réelle',
    })
    expect(vars.event_name).toBe('Fête de la lune')
    expect(vars.event_description).toBe('Desc réelle')
  })

  it('avec eventDescription vide : event_description est une chaîne vide (pas le texte démo)', () => {
    const vars = buildPreviewVariables({ eventName: 'X', eventDescription: '' })
    expect(vars.event_description).toBe('')
  })

  it('expiration_date est une chaîne non vide', () => {
    const vars = buildPreviewVariables()
    expect(typeof vars.expiration_date).toBe('string')
    expect((vars.expiration_date ?? '').length).toBeGreaterThan(0)
  })

  it('avec isAdmin: true — is_admin vaut "true" et les liens portent ctx=admin', () => {
    const vars = buildPreviewVariables({ isAdmin: true })
    expect(vars.is_admin).toBe('true')
    expect(vars.magic_link).toContain('ctx=admin')
    expect(vars.login_url).toContain('ctx=admin')
  })
})
