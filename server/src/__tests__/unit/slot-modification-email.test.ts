import { describe, it, expect, jest, beforeEach } from '@jest/globals'

// ---------------------------------------------------------------------------
// Mock setup — nodemailer + renderEmail (AVANT tout import du service)
// ---------------------------------------------------------------------------

const mockSendMail = jest.fn<() => Promise<{ messageId: string }>>()
const mockVerify   = jest.fn<() => Promise<void>>()
const mockClose    = jest.fn<() => void>()
const mockCreateTransport = jest.fn(() => ({
  sendMail: mockSendMail,
  verify:   mockVerify,
  close:    mockClose,
}))

jest.mock('nodemailer', () => ({
  __esModule: true,
  default: {
    createTransport: mockCreateTransport,
  },
}))

const mockRenderEmail = jest.fn<(params: unknown) => Promise<{ html: string; text: string }>>()
// Classe stub partagée : le service importe TemplateNotFoundError depuis ce
// module mocké, donc instanceof matche les instances créées dans les tests.
const mockTemplateNotFoundError = class extends Error {
  constructor(message?: string) {
    super(message)
    this.name = 'TemplateNotFoundError'
  }
}

jest.mock('../../services/render-email.service', () => ({
  __esModule: true,
  renderEmail: (params: unknown) => mockRenderEmail(params),
  HEALTHCHECK_STUB_VARIABLES: {},
  TemplateNotFoundError: mockTemplateNotFoundError,
}))

// Import APRÈS les mocks
import {
  sendSlotModificationEmail,
  invalidateTransportCache,
} from '../../services/email.service'
import type { SlotDiff } from '../../utils/slot-diff'
import { formatSlotEmailDate, formatSlotEmailTime } from '../../utils/slotEmailFormat'

// ---------------------------------------------------------------------------
// Type utilitaire pour inspecter les appels à renderEmail
// ---------------------------------------------------------------------------

interface RenderEmailCall {
  templateKey: string
  eventId?: string
  variables: {
    user_first_name?: string
    event_name?: string
    changes_blocks?: string
    calendar_url?: string
  }
}

// ---------------------------------------------------------------------------
// Données de test communes
// ---------------------------------------------------------------------------

const recipients = [
  { email: 'alice@example.com', firstName: 'Alice' },
  { email: 'bob@example.com',   firstName: 'Bob'   },
]
const slot = {
  id:        'slot-uuid-1',
  eventName: 'Kermesse 2026',
  eventId:   'event-uuid-1',
}

// Horaires avant/après pour les diffs horaires (composantes locales)
const startBefore = new Date(2026, 5, 17, 9, 0)
const endBefore   = new Date(2026, 5, 17, 11, 0)
const startAfter  = new Date(2026, 5, 17, 10, 0)
const endAfter    = new Date(2026, 5, 17, 12, 0)

// ---------------------------------------------------------------------------

describe('sendSlotModificationEmail', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    invalidateTransportCache()
    mockSendMail.mockResolvedValue({ messageId: 'test-mod-1' })
    mockVerify.mockResolvedValue(undefined)
    mockRenderEmail.mockResolvedValue({ html: '<html>ok</html>', text: 'ok' })
  })

  it('cas 1 — diff horaire : renderEmail appelé par destinataire, changes_blocks contient les blocs horaire', async () => {
    const diff: SlotDiff = {
      fields: ['start_time', 'end_time'],
      before: { start_time: startBefore, end_time: endBefore, description: 'Desc inchangée' },
      after:  { start_time: startAfter,  end_time: endAfter,  description: 'Desc inchangée' },
    }

    const result = await sendSlotModificationEmail(recipients, slot, diff)

    // renderEmail appelé une fois par destinataire
    expect(mockRenderEmail).toHaveBeenCalledTimes(recipients.length)
    expect(result).toEqual({ notified: recipients.length, failed: 0 })

    const call = mockRenderEmail.mock.calls[0][0] as RenderEmailCall
    const blocks = call.variables.changes_blocks ?? ''

    // Bloc horaire présent
    expect(blocks).toContain('Nouvel horaire')
    expect(blocks).toContain('Avant :')
    expect(blocks).toContain('Après :')

    // Valeurs calculées via les formateurs réels (pas de chaîne en dur)
    expect(blocks).toContain(formatSlotEmailTime(startBefore, endBefore))
    expect(blocks).toContain(formatSlotEmailTime(startAfter, endAfter))
    expect(blocks).toContain(formatSlotEmailDate(startBefore, endBefore))
    expect(blocks).toContain(formatSlotEmailDate(startAfter, endAfter))

    // Pas de bloc description
    expect(blocks).not.toContain('Nouvelle description')

    // calendar_url absolu pointant vers /events/<eventId>
    const calendarUrl = call.variables.calendar_url ?? ''
    expect(calendarUrl).toMatch(/^https?:\/\//)
    expect(calendarUrl).toContain('/events/')
  })

  it('cas 2 — diff description seule : bloc description présent, pas de bloc horaire', async () => {
    const diff: SlotDiff = {
      fields: ['description'],
      before: { start_time: startAfter, end_time: endAfter, description: 'Ancienne description' },
      after:  { start_time: startAfter, end_time: endAfter, description: 'Nouveau texte' },
    }

    const result = await sendSlotModificationEmail(recipients, slot, diff)

    expect(result).toEqual({ notified: recipients.length, failed: 0 })

    const call = mockRenderEmail.mock.calls[0][0] as RenderEmailCall
    const blocks = call.variables.changes_blocks ?? ''

    expect(blocks).toContain('Nouvelle description')
    expect(blocks).toContain('Nouveau texte')
    expect(blocks).not.toContain('Nouvel horaire')
  })

  it('cas 3 — diff tous champs : blocs horaire ET description présents, sujet et calendar_url corrects', async () => {
    const diff: SlotDiff = {
      fields: ['start_time', 'end_time', 'description'],
      before: { start_time: startBefore, end_time: endBefore, description: 'Ancienne desc' },
      after:  { start_time: startAfter,  end_time: endAfter,  description: 'Nouvelle desc' },
    }

    await sendSlotModificationEmail(recipients, slot, diff)

    const call = mockRenderEmail.mock.calls[0][0] as RenderEmailCall
    const blocks = call.variables.changes_blocks ?? ''

    // Bloc horaire
    expect(blocks).toContain('Nouvel horaire')
    expect(blocks).toContain('Avant :')
    expect(blocks).toContain('Après :')

    // Bloc description
    expect(blocks).toContain('Nouvelle description')

    // calendar_url absolu
    const calendarUrl = call.variables.calendar_url ?? ''
    expect(calendarUrl).toMatch(/^https?:\/\//)
    expect(calendarUrl).toContain('/events/')

    // Sujet passé à sendMail pour chaque destinataire
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({ subject: `Créneau modifié - ${slot.eventName}` }),
    )
  })

  it('cas 4 — échec de rendu : tous les destinataires comptés comme failed', async () => {
    mockRenderEmail.mockRejectedValue(new Error('boom'))

    const oneRecipient = [recipients[0]]
    const result = await sendSlotModificationEmail(oneRecipient, slot, {
      fields: ['description'],
      before: { start_time: startAfter, end_time: endAfter, description: 'Avant' },
      after:  { start_time: startAfter, end_time: endAfter, description: 'Après' },
    })

    expect(result).toEqual({ notified: 0, failed: oneRecipient.length })
    // Envoi SMTP court-circuité : renderEmail a échoué avant sendMail
    expect(mockSendMail).not.toHaveBeenCalled()
  })

  it('cas 5 — pas de transport disponible : tous failed, renderEmail non appelé', async () => {
    // Faire échouer la vérification → getTransporter() retourne null
    mockVerify.mockRejectedValueOnce(new Error('Connection refused'))

    const result = await sendSlotModificationEmail(recipients, slot, {
      fields: ['start_time'],
      before: { start_time: startBefore, end_time: endAfter, description: null },
      after:  { start_time: startAfter,  end_time: endAfter, description: null },
    })

    expect(result).toEqual({ notified: 0, failed: recipients.length })
    // Court-circuit avant le rendu per-recipient
    expect(mockRenderEmail).not.toHaveBeenCalled()
  })

  it('G1 — succès partiel (2 ok, 1 smtp fail) → { notified: 2, failed: 1 }', async () => {
    const three = [
      { email: 'alice@example.com', firstName: 'Alice' },
      { email: 'bob@example.com',   firstName: 'Bob'   },
      { email: 'carol@example.com', firstName: 'Carol' },
    ]
    mockRenderEmail.mockResolvedValue({ html: '<html>ok</html>', text: 'ok' })
    mockSendMail
      .mockResolvedValueOnce({ messageId: 'msg-1' })
      .mockRejectedValueOnce(new Error('smtp'))
      .mockResolvedValueOnce({ messageId: 'msg-3' })

    const result = await sendSlotModificationEmail(three, slot, {
      fields: ['start_time'],
      before: { start_time: startBefore, end_time: endBefore, description: null },
      after:  { start_time: startAfter,  end_time: endAfter,  description: null },
    })

    expect(result).toEqual({ notified: 2, failed: 1 })
  })

  it('G2 — description HTML : changes_blocks échappe < > & " ; \\n converti en <br>', async () => {
    const xssDesc = '<script>alert(1)</script> & "x"\nLigne 2'
    const diff: SlotDiff = {
      fields: ['description'],
      before: { start_time: startAfter, end_time: endAfter, description: 'Avant' },
      after:  { start_time: startAfter, end_time: endAfter, description: xssDesc },
    }

    let capturedBlocks = ''
    mockRenderEmail.mockImplementation(async (params: unknown) => {
      const p = params as { variables?: { changes_blocks?: string } }
      capturedBlocks = p.variables?.changes_blocks ?? ''
      return { html: '<html>ok</html>', text: 'ok' }
    })

    await sendSlotModificationEmail([recipients[0]], slot, diff)

    expect(capturedBlocks).toContain('&lt;script&gt;')
    expect(capturedBlocks).not.toContain('<script>')
    expect(capturedBlocks).toContain('<br>')
  })
})
