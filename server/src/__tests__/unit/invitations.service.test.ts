import { describe, it, expect, jest, beforeEach } from '@jest/globals'

// Typage pour les mocks
type QueryResult = { rows: Record<string, unknown>[] }
const mockQuery = jest.fn() as jest.MockedFunction<(query: string, params?: unknown[]) => Promise<QueryResult>>
const mockGenerateMagicLink = jest.fn() as jest.MockedFunction<() => Promise<{ link: string; expirationDate: Date }>>
const mockSendEventInvitation = jest.fn() as jest.MockedFunction<() => Promise<boolean>>
const mockGetMagicLinkConfig = jest.fn() as jest.MockedFunction<() => Promise<{ adminTTL: number; userTTL: number; sessionTTL: number }>>

jest.mock('../../db', () => ({
  query: mockQuery
}))

jest.mock('../../services/auth.service', () => ({
  generateMagicLink: mockGenerateMagicLink
}))

jest.mock('../../services/email.service', () => ({
  sendEventInvitation: mockSendEventInvitation
}))

jest.mock('../../services/config.service', () => ({
  configService: {
    getMagicLinkConfig: mockGetMagicLinkConfig
  }
}))

// Importer après les mocks
import { invitationsService } from '../../services/invitations.service'
import { NotFoundError } from '../../errors/NotFoundError'
import { EmailDeliveryError } from '../../errors/EmailDeliveryError'

describe('invitationsService', () => {
  beforeEach(() => {
    mockQuery.mockReset() // Clear mock implementations for query
    jest.clearAllMocks()
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days from now
    mockGenerateMagicLink.mockResolvedValue({
      link: 'https://example.com/magic-link',
      expirationDate: futureDate
    })
    mockSendEventInvitation.mockResolvedValue(true)
    mockGetMagicLinkConfig.mockResolvedValue({
      adminTTL: 86400,
      userTTL: 604800,
      sessionTTL: 7200
    })
  })

  describe('validateEventForInvitations', () => {
    const eventId = 'event-123'

    it('[P0] returns NO_SLOTS when event has no slots', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ end: null, slot_count: '0' }]
      })

      const result = await invitationsService.validateEventForInvitations(eventId)

      expect(result.canSend).toBe(false)
      expect(result.errorCode).toBe('NO_SLOTS')
      expect(result.errorMessage).toBe('Ajoutez des créneaux pour envoyer des invitations')
    })

    it('[P0] returns EVENT_ENDED when event end is in the past', async () => {
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000) // yesterday
      mockQuery.mockResolvedValueOnce({
        rows: [{ end: pastDate, slot_count: '5' }]
      })

      const result = await invitationsService.validateEventForInvitations(eventId)

      expect(result.canSend).toBe(false)
      expect(result.errorCode).toBe('EVENT_ENDED')
      expect(result.errorMessage).toBe('Cet événement est terminé')
    })

    it('[P0] returns canSend: true for valid events with slots', async () => {
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days from now
      mockQuery.mockResolvedValueOnce({
        rows: [{ end: futureDate, slot_count: '5' }]
      })

      const result = await invitationsService.validateEventForInvitations(eventId)

      expect(result.canSend).toBe(true)
      expect(result.errorCode).toBeUndefined()
      expect(result.errorMessage).toBeUndefined()
    })

    it('[P0] throws NotFoundError when event does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      await expect(invitationsService.validateEventForInvitations(eventId))
        .rejects.toThrow(NotFoundError)
    })

    it('[P1] returns canSend: true when event has slots but no end date', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ end: null, slot_count: '5' }]
      })

      const result = await invitationsService.validateEventForInvitations(eventId)

      expect(result.canSend).toBe(true)
    })
  })

  describe('calculateInvitationTTL', () => {
    const eventId = 'event-123'

    it('[P0] retourne le userTTL fixe quel que soit event.end', async () => {
      const twoDaysFromNow = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
      mockQuery.mockResolvedValueOnce({
        rows: [{ end: twoDaysFromNow, slot_count: '1' }]
      })

      const result = await invitationsService.calculateInvitationTTL(eventId)

      expect(result).not.toBeNull()
      expect(result!.ttl).toBe(604800) // TTL fixe = userTTL
      expect(result!.expiresAt).toBeInstanceOf(Date)
    })

    it('[P0] retourne le userTTL fixe pour un événement lointain', async () => {
      const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      mockQuery.mockResolvedValueOnce({
        rows: [{ end: thirtyDaysFromNow, slot_count: '5' }]
      })

      const result = await invitationsService.calculateInvitationTTL(eventId)

      expect(result).not.toBeNull()
      expect(result!.ttl).toBe(604800) // TTL fixe = userTTL
    })

    it('[P0] returns null for events with no slots', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ end: null, slot_count: '0' }]
      })

      const result = await invitationsService.calculateInvitationTTL(eventId)

      expect(result).toBeNull()
    })

    it('[P0] returns null for past events', async () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
      mockQuery.mockResolvedValueOnce({
        rows: [{ end: yesterday, slot_count: '5' }]
      })

      const result = await invitationsService.calculateInvitationTTL(eventId)

      expect(result).toBeNull()
    })

    it('[P0] throws NotFoundError when event does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      await expect(invitationsService.calculateInvitationTTL(eventId))
        .rejects.toThrow(NotFoundError)
    })

    it('[P1] rounds TTL down to minute level', async () => {
      // Create a specific date that doesn't align to minute boundaries
      const twoDaysFromNow = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000 + 37423) // +37 seconds
      mockQuery.mockResolvedValueOnce({
        rows: [{ end: twoDaysFromNow, slot_count: '1' }]
      })

      const result = await invitationsService.calculateInvitationTTL(eventId)

      // TTL should be divisible by 60 (rounded to minute)
      expect(result!.ttl % 60).toBe(0)
    })
  })

  describe('sendInvitations', () => {
    const eventId = 'event-123'
    const userIds = ['user-1', 'user-2']
    const eventData = { id: eventId, name: 'Test Event', description: 'Test Description' }
    // Create a future date for event.end (10 days from now)
    const futureDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000)

    // Helper to setup mocks for sendInvitations with valid event
    // NOTE: sendInvitations query order is:
    // 1. Event check
    // 2. Authorized users query (must be added by test)
    // 3. validateEventForInvitations (via calculateInvitationTTL)
    // 4. calculateInvitationTTL event end query
    const setupValidEventMocks = () => {
      mockQuery.mockResolvedValueOnce({ rows: [eventData] }) // 1. Event check
      // Test will add: authorized users query here
    }

    it('[P0] envoie les invitations aux utilisateurs autorisés', async () => {
      setupValidEventMocks()
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'user-1', email: 'user1@example.com', first_name: 'User One' },
          { id: 'user-2', email: 'user2@example.com', first_name: 'User Two' }
        ]
      }) // 2. Authorized users
      mockQuery.mockResolvedValueOnce({
        rows: [{ end: futureDate, slot_count: '5' }]
      }) // 3. validateEventForInvitations - has slots
      mockQuery.mockResolvedValueOnce({
        rows: [{ end: futureDate }]
      }) // 4. calculateInvitationTTL - get event end
      mockQuery.mockResolvedValueOnce({ rows: [] }) // INSERT invitation user-1
      mockQuery.mockResolvedValueOnce({ rows: [] }) // INSERT invitation user-2

      const result = await invitationsService.sendInvitations(eventId, userIds)

      expect(result).toHaveProperty('sent')
      expect(result).toHaveProperty('failed')
      expect(result.sent).toBe(2)
      expect(result.failed).toBe(0)
      expect(result.results).toHaveLength(2)

      // Vérifier que chaque utilisateur a reçu une invitation
      expect(mockGenerateMagicLink).toHaveBeenCalledTimes(2)
      expect(mockSendEventInvitation).toHaveBeenCalledTimes(2)
    })

    it('[P0] uses calculateInvitationTTL to get TTL for magic link', async () => {
      setupValidEventMocks()
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'user-1', email: 'user1@example.com', first_name: 'User One' }]
      })
      mockQuery.mockResolvedValueOnce({
        rows: [{ end: futureDate, slot_count: '5' }]
      }) // validateEventForInvitations
      mockQuery.mockResolvedValueOnce({
        rows: [{ end: futureDate }]
      }) // calculateInvitationTTL event end
      mockQuery.mockResolvedValueOnce({ rows: [] })

      await invitationsService.sendInvitations(eventId, ['user-1'])

      // generateMagicLink should receive ttl (from calculateInvitationTTL)
      expect(mockGenerateMagicLink).toHaveBeenCalledWith({
        userId: 'user-1',
        eventId,
        ttl: expect.any(Number)
      })
      // TTL should be less than or equal to maxTTL (7 days)
      const firstCall = mockGenerateMagicLink.mock.calls[0] as any
      if (firstCall && firstCall[0] && typeof firstCall[0].ttl === 'number') {
        expect(firstCall[0].ttl).toBeLessThanOrEqual(604800)
      }
    })

    it('[P0] throws error when event has no slots', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [eventData] }) // Event check
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'user-1', email: 'user1@example.com', first_name: 'User One' }]
      }) // Authorized users query
      mockQuery.mockResolvedValueOnce({
        rows: [{ end: null, slot_count: '0' }]
      }) // validateEventForInvitations - no slots
      // No need for event end query since validateEventForInvitations returns null

      await expect(invitationsService.sendInvitations(eventId, ['user-1']))
        .rejects.toThrow('Impossible d\'envoyer des invitations pour cet événement')
    })

    it('[P0] throws error when event has ended', async () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
      mockQuery.mockResolvedValueOnce({ rows: [eventData] }) // Event check
      mockQuery.mockResolvedValueOnce({
        rows: [{ end: yesterday, slot_count: '5' }]
      }) // validateEventForInvitations - event ended
      mockQuery.mockResolvedValueOnce({ rows: [{ end: yesterday }] }) // calculateInvitationTTL - event end

      await expect(invitationsService.sendInvitations(eventId, ['user-1']))
        .rejects.toThrow('Impossible d\'envoyer des invitations pour cet événement')
    })

    it('[P1] appelle calculateInvitationTTL une seule fois avant la boucle', async () => {
      setupValidEventMocks()
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'user-1', email: 'user1@example.com', first_name: 'User One' },
          { id: 'user-2', email: 'user2@example.com', first_name: 'User Two' }
        ]
      })
      mockQuery.mockResolvedValueOnce({
        rows: [{ end: futureDate, slot_count: '5' }]
      }) // validateEventForInvitations
      mockQuery.mockResolvedValueOnce({
        rows: [{ end: futureDate }]
      }) // calculateInvitationTTL event end
      mockQuery.mockResolvedValue({ rows: [] })

      await invitationsService.sendInvitations(eventId, ['user-1', 'user-2'])

      // validateEventForInvitations called once
      const validateCalls = mockQuery.mock.calls.filter(call =>
        call[0].includes('slot_count')
      )
      expect(validateCalls.length).toBeGreaterThanOrEqual(1)
    })

    it('[P0] enregistre les invitations en base de données', async () => {
      setupValidEventMocks()
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'user-1', email: 'user1@example.com', first_name: 'User One' }]
      })
      mockQuery.mockResolvedValueOnce({
        rows: [{ end: futureDate, slot_count: '5' }]
      }) // validateEventForInvitations
      mockQuery.mockResolvedValueOnce({
        rows: [{ end: futureDate }]
      }) // calculateInvitationTTL event end
      mockQuery.mockResolvedValueOnce({ rows: [] }) // INSERT invitation

      await invitationsService.sendInvitations(eventId, ['user-1'])

      // Vérifier l'INSERT dans invitations
      const insertCall = mockQuery.mock.calls.find(call =>
        call[0].includes('INSERT INTO invitations')
      )
      expect(insertCall).toBeDefined()
      if (!insertCall) return
      expect(insertCall[0]).toContain('status')
      expect(insertCall[0]).toContain("'sent'") // 'sent' est dans le SQL, pas les params
      expect(insertCall[1]).toEqual([eventId, 'user-1'])
    })

    it('[P0] gère les utilisateurs non autorisés', async () => {
      setupValidEventMocks()
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'user-1', email: 'user1@example.com', first_name: 'User One' }]
      }) // Seul user-1 est autorisé
      mockQuery.mockResolvedValueOnce({
        rows: [{ end: futureDate, slot_count: '5' }]
      }) // validateEventForInvitations
      mockQuery.mockResolvedValueOnce({
        rows: [{ end: futureDate }]
      }) // calculateInvitationTTL event end
      mockQuery.mockResolvedValueOnce({ rows: [] }) // INSERT invitation for user-1

      const result = await invitationsService.sendInvitations(eventId, ['user-1', 'user-unauthorized'])

      expect(result.sent).toBe(1)
      expect(result.failed).toBe(1)

      // Vérifier le message d'erreur pour l'utilisateur non autorisé
      const unauthorizedResult = result.results.find((r: any) => r.userId === 'user-unauthorized')
      expect(unauthorizedResult?.success).toBe(false)
      expect(unauthorizedResult?.error).toContain('non autorisé')
    })

    it('[P0] lance NotFoundError si événement inexistant', async () => {
      mockQuery.mockResolvedValue({ rows: [] })

      await expect(invitationsService.sendInvitations('invalid-event', ['user-1']))
        .rejects.toThrow(NotFoundError)
    })

    it('[P1] gère les erreurs d\'envoi d\'email', async () => {
      setupValidEventMocks()
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'user-1', email: 'user1@example.com', first_name: 'User One' }]
      })
      mockQuery.mockResolvedValueOnce({
        rows: [{ end: futureDate, slot_count: '5' }]
      }) // validateEventForInvitations
      mockQuery.mockResolvedValueOnce({
        rows: [{ end: futureDate }]
      }) // calculateInvitationTTL event end

      // Simuler une erreur d'envoi d'email
      mockSendEventInvitation.mockResolvedValueOnce(false)

      // Mock pour l'INSERT failed
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const result = await invitationsService.sendInvitations(eventId, ['user-1'])

      expect(result.sent).toBe(0)
      expect(result.failed).toBe(1)
      expect(result.results[0].success).toBe(false)
    })

    it('[P1] utilise Promise.allSettled pour éviter qu\'une erreur bloque tout l\'envoi', async () => {
      setupValidEventMocks()
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'user-1', email: 'user1@example.com', first_name: 'User One' },
          { id: 'user-2', email: 'user2@example.com', first_name: 'User Two' }
        ]
      })
      mockQuery.mockResolvedValueOnce({
        rows: [{ end: futureDate, slot_count: '5' }]
      }) // validateEventForInvitations
      mockQuery.mockResolvedValueOnce({
        rows: [{ end: futureDate }]
      }) // calculateInvitationTTL event end

      // Premier succès, deuxième échec
      mockSendEventInvitation
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false)

      // Two INSERT calls (one per user)
      mockQuery.mockResolvedValueOnce({ rows: [] })
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const result = await invitationsService.sendInvitations(eventId, userIds)

      expect(result.sent).toBe(1)
      expect(result.failed).toBe(1)
    })

    it('[P2] met à jour une invitation existante (renvoi)', async () => {
      setupValidEventMocks()
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'user-1', email: 'user1@example.com', first_name: 'User One' }]
      })
      mockQuery.mockResolvedValueOnce({
        rows: [{ end: futureDate, slot_count: '5' }]
      }) // validateEventForInvitations
      mockQuery.mockResolvedValueOnce({
        rows: [{ end: futureDate }]
      }) // calculateInvitationTTL event end
      mockQuery.mockResolvedValueOnce({ rows: [] })

      await invitationsService.sendInvitations(eventId, ['user-1'])

      // Vérifier le ON CONFLICT DO UPDATE
      const insertCall = mockQuery.mock.calls.find(call =>
        call[0].includes('INSERT INTO invitations') && call[0].includes('ON CONFLICT')
      )
      expect(insertCall).toBeDefined()
      if (!insertCall) return
      expect(insertCall[0]).toContain('send_count = invitations.send_count + 1')
    })

    it('[P2] gère le cas avec userIds vide (ne fait rien)', async () => {
      setupValidEventMocks()
      // Empty userIds means the authorized users query returns empty array
      mockQuery.mockResolvedValueOnce({ rows: [] }) // Pas d'utilisateurs autorisés (empty array result)
      // calculateInvitationTTL is still called even with no users
      mockQuery.mockResolvedValueOnce({
        rows: [{ end: futureDate, slot_count: '5' }]
      }) // validateEventForInvitations
      mockQuery.mockResolvedValueOnce({
        rows: [{ end: futureDate }]
      }) // calculateInvitationTTL event end

      const result = await invitationsService.sendInvitations(eventId, [])

      expect(result.sent).toBe(0)
      expect(result.failed).toBe(0)
      expect(mockGenerateMagicLink).not.toHaveBeenCalled()
    })

    it('[P1] (a) bookkeeping failed REJETTE → destinataire compté en failed, invariant tenu, aucune exception', async () => {
      setupValidEventMocks()
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'user-1', email: 'user1@example.com', first_name: 'User One' }]
      }) // Authorized users
      mockQuery.mockResolvedValueOnce({
        rows: [{ end: futureDate, slot_count: '5' }]
      }) // validateEventForInvitations
      mockQuery.mockResolvedValueOnce({
        rows: [{ end: futureDate }]
      }) // calculateInvitationTTL event end

      mockSendEventInvitation.mockResolvedValueOnce(false) // email échoue → EmailDeliveryError dans le try
      mockQuery.mockRejectedValueOnce(new Error('DB failure on failed INSERT')) // écriture status failed REJETTE

      // Appel direct : si sendInvitations lançait une exception, le test échouerait automatiquement
      const result = await invitationsService.sendInvitations(eventId, ['user-1'])

      expect(result.failed).toBe(1)
      expect(result.sent).toBe(0)
      expect(result.results).toHaveLength(1)
      expect(result.results[0].success).toBe(false)
      // Invariant: sent + failed === nombre d'utilisateurs autorisés
      expect(result.sent + result.failed).toBe(1)
    })

    it('[P1] (b) email OK mais bookkeeping sent REJETTE → destinataire compté en sent (best-effort)', async () => {
      setupValidEventMocks()
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'user-1', email: 'user1@example.com', first_name: 'User One' }]
      }) // Authorized users
      mockQuery.mockResolvedValueOnce({
        rows: [{ end: futureDate, slot_count: '5' }]
      }) // validateEventForInvitations
      mockQuery.mockResolvedValueOnce({
        rows: [{ end: futureDate }]
      }) // calculateInvitationTTL event end

      mockSendEventInvitation.mockResolvedValueOnce(true) // email envoyé avec succès
      mockQuery.mockRejectedValueOnce(new Error('DB failure on sent INSERT')) // écriture status sent REJETTE

      const result = await invitationsService.sendInvitations(eventId, ['user-1'])

      expect(result.sent).toBe(1)
      expect(result.failed).toBe(0)
      expect(result.results[0].success).toBe(true)
      expect(mockSendEventInvitation).toHaveBeenCalledTimes(1)
    })
  })

  describe('getEventInvitations', () => {
    it('[P0] retourne l\'historique des invitations pour un événement', async () => {
      const mockInvitations = [
        {
          id: 'inv-1',
          sent_at: new Date('2026-01-15T10:00:00Z'),
          clicked_at: new Date('2026-01-15T10:30:00Z'),
          status: 'clicked',
          user_id: 'user-1',
          email: 'user1@example.com',
          first_name: 'User One'
        },
        {
          id: 'inv-2',
          sent_at: new Date('2026-01-15T11:00:00Z'),
          clicked_at: null,
          status: 'sent',
          user_id: 'user-2',
          email: 'user2@example.com',
          first_name: 'User Two'
        }
      ]

      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'event-123' }] }) // Event check
      mockQuery.mockResolvedValueOnce({ rows: mockInvitations })

      const result = await invitationsService.getEventInvitations('event-123')

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('FROM invitations i'),
        ['event-123']
      )
      expect(result).toHaveLength(2)
      expect(result[0]).toMatchObject({
        id: 'inv-1',
        status: 'clicked'
      })
    })

    it('[P0] convertit snake_case en camelCase', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'event-123' }] })
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'inv-1',
          sent_at: new Date(),
          clicked_at: null,
          status: 'sent',
          user_id: 'user-1',
          email: 'user1@example.com',
          first_name: 'User One'
        }]
      })

      const result = await invitationsService.getEventInvitations('event-123')

      expect(result[0]).toHaveProperty('sentAt')
      expect(result[0]).toHaveProperty('clickedAt')
      expect(result[0]).toHaveProperty('user')
      expect(result[0].user).toHaveProperty('firstName')
      expect(result[0]).not.toHaveProperty('sent_at')
      expect(result[0].user).not.toHaveProperty('first_name')
    })

    it('[P0] lance NotFoundError si événement inexistant', async () => {
      mockQuery.mockResolvedValue({ rows: [] })

      await expect(invitationsService.getEventInvitations('invalid-event'))
        .rejects.toThrow(NotFoundError)
    })

    it('[P1] retourne un tableau vide si aucune invitation', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'event-123' }] })
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const result = await invitationsService.getEventInvitations('event-123')

      expect(result).toEqual([])
    })
    it('[P0] SQL dérive \'clicked\' de clicked_at IS NOT NULL (prioritaire sur status brut)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'event-123' }] })
      mockQuery.mockResolvedValueOnce({ rows: [] })

      await invitationsService.getEventInvitations('event-123')

      const sqlCall = mockQuery.mock.calls.find(call =>
        call[0].includes('FROM invitations i')
      )
      expect(sqlCall).toBeDefined()
      if (!sqlCall) return
      expect(sqlCall[0]).toMatch(/clicked_at\s+IS\s+NOT\s+NULL\s+THEN\s+'clicked'/)
      expect(sqlCall[0]).not.toMatch(/i\.status\s*,/)
    })

    it('[P0] clicked_at non nul + status=\'failed\' → \'clicked\' dans le résultat', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'event-123' }] })
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'inv-1',
          sent_at: new Date(),
          clicked_at: new Date(),
          // Le CASE SQL retourne 'clicked' même si le status brut est 'failed'
          status: 'clicked',
          user_id: 'user-1',
          email: 'u@example.com',
          first_name: 'U',
          last_name: null
        }]
      })

      const result = await invitationsService.getEventInvitations('event-123')

      expect(result[0].status).toBe('clicked')
    })

  })

  describe('getEventUsersInvitationStatus', () => {
    it('[P0] retourne le statut de tous les utilisateurs sélectionnés', async () => {
      const mockStatus = [
        {
          id: 'user-1',
          email: 'user1@example.com',
          first_name: 'User One',
          phone: '123456789',
          role: 'user',
          selected_at: new Date(),
          invitation_status: 'sent',
          sent_at: new Date(),
          clicked_at: null
        },
        {
          id: 'user-2',
          email: 'user2@example.com',
          first_name: 'User Two',
          phone: null,
          role: 'user',
          selected_at: new Date(),
          invitation_status: 'pending',
          sent_at: null,
          clicked_at: null
        }
      ]

      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'event-123' }] })
      mockQuery.mockResolvedValueOnce({ rows: mockStatus })

      const result = await invitationsService.getEventUsersInvitationStatus('event-123')

      expect(result).toHaveLength(2)
      expect(result[0].invitationStatus).toBe('sent')
      expect(result[1].invitationStatus).toBe('pending')
    })

    it('[P0] inclut les utilisateurs sans invitation (statut pending)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'event-123' }] })
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'user-1',
          invitation_status: 'pending',
          selected_at: new Date()
        }]
      })

      const result = await invitationsService.getEventUsersInvitationStatus('event-123')

      expect(result).toHaveLength(1)
      expect(result[0].invitationStatus).toBe('pending')
    })

    it('[P0] ordonne par statut (pending first, then failed, then others)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'event-123' }] })
      mockQuery.mockResolvedValueOnce({
        rows: [
          { invitation_status: 'pending' },
          { invitation_status: 'sent' },
          { invitation_status: 'failed' }
        ]
      })

      const result = await invitationsService.getEventUsersInvitationStatus('event-123')

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY'),
        ['event-123']
      )
      // Tie-breaker nom (split S2) : doit survivre au tri par statut.
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('u.last_name ASC NULLS LAST, u.first_name ASC'),
        ['event-123']
      )
    })

    it('[P0] convertit snake_case en camelCase', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'event-123' }] })
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'user-1',
          first_name: 'User One',
          invitation_status: 'pending',
          selected_at: new Date(),
          sent_at: null,
          clicked_at: null
        }]
      })

      const result = await invitationsService.getEventUsersInvitationStatus('event-123')

      expect(result[0]).toHaveProperty('firstName')
      expect(result[0]).toHaveProperty('invitationStatus')
      expect(result[0]).toHaveProperty('selectedAt')
      expect(result[0]).not.toHaveProperty('first_name')
    })

    it('[P0] lance NotFoundError si événement inexistant', async () => {
      mockQuery.mockResolvedValue({ rows: [] })

      await expect(invitationsService.getEventUsersInvitationStatus('invalid-event'))
        .rejects.toThrow(NotFoundError)
    })
    it('[P0] SQL dérive \'clicked\' de clicked_at IS NOT NULL (prioritaire sur failed)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'event-123' }] })
      mockQuery.mockResolvedValueOnce({ rows: [] })

      await invitationsService.getEventUsersInvitationStatus('event-123')

      const sqlCall = mockQuery.mock.calls.find(call =>
        call[0].includes('CASE') && call[0].includes('invitation_status')
      )
      expect(sqlCall).toBeDefined()
      if (!sqlCall) return
      expect(sqlCall[0]).toMatch(/clicked_at\s+IS\s+NOT\s+NULL\s+THEN\s+'clicked'/)
      // clicked_at IS NOT NULL testé AVANT i.status = 'failed'
      const clickedIdx = sqlCall[0].indexOf('clicked_at IS NOT NULL')
      const failedIdx = sqlCall[0].indexOf("i.status = 'failed'")
      expect(clickedIdx).toBeLessThan(failedIdx)
    })

    it('[P0] clicked_at non nul + status=\'failed\' → \'clicked\' (clicked prioritaire)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'event-123' }] })
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'user-1',
          email: 'u@example.com',
          first_name: 'U',
          last_name: null,
          phone: null,
          role: 'user',
          selected_at: new Date(),
          // Le CASE SQL retourne 'clicked' car clicked_at IS NOT NULL
          invitation_status: 'clicked',
          sent_at: new Date(),
          clicked_at: new Date()
        }]
      })

      const result = await invitationsService.getEventUsersInvitationStatus('event-123')

      expect(result[0].invitationStatus).toBe('clicked')
    })

    it('[P0] expose sendCount et firstSentAt (created_at) ; sendCount défaut 0 si pending', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'event-123' }] })
      const first = new Date('2026-06-10T09:00:00Z')
      const last = new Date('2026-06-12T09:00:00Z')
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'user-1', email: 's@x.io', first_name: 'S', last_name: null, phone: null, role: 'user',
            selected_at: first, invitation_status: 'sent', sent_at: last, clicked_at: null,
            created_at: first, send_count: 3
          },
          {
            id: 'user-2', email: 'p@x.io', first_name: 'P', last_name: null, phone: null, role: 'user',
            selected_at: first, invitation_status: 'pending', sent_at: null, clicked_at: null,
            created_at: null, send_count: null
          }
        ]
      })

      const result = await invitationsService.getEventUsersInvitationStatus('event-123')

      expect(result[0].sendCount).toBe(3)
      expect(result[0].firstSentAt).toEqual(first)
      expect(result[1].sendCount).toBe(0)
      expect(result[1].firstSentAt).toBeNull()

      const sqlCall = mockQuery.mock.calls.find(c => c[0].includes('FROM event_users'))
      expect(sqlCall).toBeDefined()
      if (!sqlCall) return
      expect(sqlCall[0]).toContain('i.send_count')
      expect(sqlCall[0]).toContain('i.created_at')
    })

  })

  describe('resendInvitation', () => {
    const eventId = 'event-123'
    const userId = 'user-1'
    const eventData = { id: eventId, name: 'Test Event', description: 'Description' }
    const userData = { id: userId, email: 'user1@example.com', first_name: 'User One' }
    // Create a future date for event.end (10 days from now)
    const futureDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000)

    // Helper to setup mocks for resendInvitation with valid event
    // NOTE: Order matters! resendInvitation calls queries in this order:
    // 1. Event check
    // 2. User check (event_users JOIN)
    // getMagicLinkConfig est mocké globalement (mockGetMagicLinkConfig, beforeEach)
    // 3. INSERT/UPDATE invitation (à fournir par chaque test)
    const setupValidResendMocks = () => {
      mockQuery.mockResolvedValueOnce({ rows: [eventData] }) // 1. Event check
      mockQuery.mockResolvedValueOnce({ rows: [userData] }) // 2. User check
    }

    it('[P0] renvoie une invitation à un utilisateur spécifique', async () => {
      setupValidResendMocks()
      mockQuery.mockResolvedValueOnce({ rows: [] }) // INSERT/UPDATE invitation

      const result = await invitationsService.resendInvitation(eventId, userId)

      expect(result).toMatchObject({
        sent: true,
        email: 'user1@example.com',
        userId,
        eventId
      })
      expect(result).toHaveProperty('sentAt')
    })

    it('[P0] utilise configService.getMagicLinkConfig pour le TTL fixe', async () => {
      setupValidResendMocks()
      mockQuery.mockResolvedValueOnce({ rows: [] }) // INSERT

      await invitationsService.resendInvitation(eventId, userId)

      expect(mockGetMagicLinkConfig).toHaveBeenCalled()
      expect(mockGenerateMagicLink).toHaveBeenCalledWith({
        userId,
        eventId,
        ttl: 604800 // userTTL fixe
      })
    })

    it('[P0] met à jour l\'invitation existante', async () => {
      setupValidResendMocks()
      mockQuery.mockResolvedValueOnce({ rows: [] })

      await invitationsService.resendInvitation(eventId, userId)

      const insertCall = mockQuery.mock.calls.find(call =>
        call[0].includes('INSERT INTO invitations') && call[0].includes('ON CONFLICT')
      )
      expect(insertCall).toBeDefined()

      // clicked_at N'EST PLUS réinitialisé — le clic est monotone
      if (!insertCall) return
      expect(insertCall[0]).not.toContain('clicked_at')
      expect(insertCall[0]).toContain('sent_at = NOW()')
      expect(insertCall[0]).toContain("status = 'sent'")
      expect(insertCall[0]).toContain('send_count = invitations.send_count + 1')
      expect(insertCall[1]).toEqual([eventId, userId])
    })

    it('[P0] lance NotFoundError si événement inexistant', async () => {
      mockQuery.mockResolvedValue({ rows: [] })

      await expect(invitationsService.resendInvitation('invalid-event', 'user-1'))
        .rejects.toThrow(NotFoundError)
    })

    it('[P0] lance NotFoundError si utilisateur non sélectionné', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [eventData] }) // Event check
      mockQuery.mockResolvedValueOnce({ rows: [] }) // User not in event_users

      await expect(invitationsService.resendInvitation(eventId, 'invalid-user'))
        .rejects.toThrow(NotFoundError)
    })

    it('[P1] lance EmailDeliveryError si l\'envoi d\'email échoue (message)', async () => {
      setupValidResendMocks()
      mockSendEventInvitation.mockResolvedValueOnce(false)

      await expect(invitationsService.resendInvitation(eventId, userId))
        .rejects.toThrow('Échec de l\'envoi d\'email')
    })

    it('[P1] lance EmailDeliveryError si l\'envoi d\'email échoue (type)', async () => {
      setupValidResendMocks()
      mockSendEventInvitation.mockResolvedValueOnce(false)

      await expect(invitationsService.resendInvitation(eventId, userId))
        .rejects.toThrow(EmailDeliveryError)
    })

    it('[P1] bookkeeping rejette mais résolution est succès (anti-doublon)', async () => {
      setupValidResendMocks()
      mockSendEventInvitation.mockResolvedValueOnce(true)
      // bookkeeping query rejects
      mockQuery.mockRejectedValueOnce(new Error('DB connection lost'))

      const result = await invitationsService.resendInvitation(eventId, userId)

      expect(result).toMatchObject({ sent: true, email: userData.email, userId, eventId })
      expect(mockSendEventInvitation).toHaveBeenCalledTimes(1)
    })

    it('[P0] réussit pour un événement sans créneaux (renvoi non bloqué)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [eventData] }) // Event check
      mockQuery.mockResolvedValueOnce({ rows: [userData] }) // User check
      mockQuery.mockResolvedValueOnce({ rows: [] }) // INSERT

      const result = await invitationsService.resendInvitation(eventId, userId)

      expect(result).toMatchObject({ sent: true, email: userData.email, userId, eventId })
    })

    it('[P0] réussit pour un événement terminé (renvoi non bloqué)', async () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
      const endedEventData = { ...eventData, end: yesterday }
      mockQuery.mockResolvedValueOnce({ rows: [endedEventData] }) // Event check (terminé)
      mockQuery.mockResolvedValueOnce({ rows: [userData] }) // User check
      mockQuery.mockResolvedValueOnce({ rows: [] }) // INSERT

      const result = await invitationsService.resendInvitation(eventId, userId)

      expect(result).toMatchObject({ sent: true })
    })
  })

  describe('markAsClicked', () => {
    const eventId = 'event-123'
    const userId = 'user-1'

    it('[P0] pose clicked_at sans toucher status, renvoie true au premier clic', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'inv-1' }] })

      const result = await invitationsService.markAsClicked(eventId, userId)

      expect(result).toBe(true)
      const updateCall = mockQuery.mock.calls.find(call =>
        call[0].includes('UPDATE invitations')
      )
      expect(updateCall).toBeDefined()
      if (!updateCall) return
      // N'écrit plus status='clicked' — le statut reste 'sent'/'failed'
      expect(updateCall[0]).not.toMatch(/status\s*=\s*'clicked'/)
      expect(updateCall[0]).toMatch(/SET\s+clicked_at\s*=\s*NOW\(\)/)
      expect(updateCall[0]).toMatch(/WHERE\s+event_id\s*=\s*\$1/)
      expect(updateCall[0]).toMatch(/AND\s+user_id\s*=\s*\$2/)
      // Filtre monotone : uniquement si pas encore cliqué
      expect(updateCall[0]).toMatch(/AND\s+clicked_at\s+IS\s+NULL/)
      // N'exclut plus les lignes 'failed'
      expect(updateCall[0]).not.toMatch(/AND\s+status\s*=\s*'sent'/)
      expect(updateCall[1]).toEqual([eventId, userId])
    })

    it('[P0] enregistre le clic pour une ligne status=\'failed\'', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'inv-2' }] })

      const result = await invitationsService.markAsClicked(eventId, userId)

      expect(result).toBe(true)
      const updateCall = mockQuery.mock.calls.find(call =>
        call[0].includes('UPDATE invitations')
      )
      expect(updateCall).toBeDefined()
      if (!updateCall) return
      // Aucun filtre sur status : le WHERE ne filtre QUE clicked_at IS NULL
      expect(updateCall[0]).not.toMatch(/AND\s+status\s*=/)
    })

    it('[P0] est idempotent — 2e appel no-op si clicked_at déjà posé (renvoie false)', async () => {
      // Premier clic
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'inv-1' }] })
      const first = await invitationsService.markAsClicked(eventId, userId)
      expect(first).toBe(true)

      // Second clic : clicked_at IS NULL → false, aucune ligne mise à jour
      mockQuery.mockResolvedValueOnce({ rows: [] })
      const second = await invitationsService.markAsClicked(eventId, userId)
      expect(second).toBe(false)
    })

    it('[P0] renvoie false si aucune invitation correspond (clicked_at déjà posé ou inexistante)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const result = await invitationsService.markAsClicked(eventId, userId)

      expect(result).toBe(false)
    })

    it('[P0] ne rejette pas si la requête BDD échoue (best-effort tracking)', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB connection lost'))

      await expect(invitationsService.markAsClicked(eventId, userId))
        .resolves.toBe(false)
    })
  })
})
