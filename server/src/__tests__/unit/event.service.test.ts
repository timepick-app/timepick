import { describe, it, expect, jest, beforeEach } from '@jest/globals'

// Typage pour les mocks
type QueryResult = { rows: Record<string, unknown>[]; rowCount?: number }
const mockQuery = jest.fn() as jest.MockedFunction<(query: string, params?: unknown[]) => Promise<QueryResult>>
// withTransaction passes a fake client to the callback; the callback's
// `client.query` is routed through the same mockQuery so deleteEvent's
// transactional path remains assertable by the existing expectations.
const mockClient = { query: mockQuery } as { query: typeof mockQuery }
const mockWithTransaction = jest.fn(async (cb: (client: typeof mockClient) => Promise<unknown>) => cb(mockClient))

jest.mock('../../db', () => ({
  query: mockQuery,
  withTransaction: mockWithTransaction,
}))

// shell-parts service participates in the transaction via the optional
// `client` parameter — under unit-test mock, it runs against the same
// mockClient.query so deleteEvent's body still asserts cleanly.
jest.mock('../../services/shell-parts.service', () => ({
  deleteShellPartsForOwner: jest.fn(async () => 0),
}))

// Importer après le mock
import { eventService } from '../../services/event.service'
import { NotFoundError } from '../../errors/NotFoundError'
import { NotPublishedError } from '../../errors/NotPublishedError'

describe('eventService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('createEvent', () => {
    it('[P0] crée un événement avec nom et description', async () => {
      const eventData = { name: 'Test Event', description: 'Test description' }
      const mockEvent = { id: 'uuid-123', ...eventData, is_published: false, created_at: new Date(), updated_at: new Date() }

      mockQuery.mockResolvedValue({ rows: [mockEvent] })

      const result = await eventService.createEvent(eventData)

      expect(mockQuery).toHaveBeenCalledWith(
        `INSERT INTO events (name, description, is_published, opens_at)
       VALUES ($1, $2, false, $3)
       RETURNING *, (invitation_mjml IS NOT NULL OR EXISTS(SELECT 1 FROM shell_parts WHERE owner_kind = 'event' AND owner_id = events.id::text)) AS has_custom_invitation`,
        [eventData.name, eventData.description, null]
      )
      expect(result).toEqual(mockEvent)
    })

    it('[P0] crée un événement sans description (undefined)', async () => {
      const eventData = { name: 'Test Event', description: undefined }
      const mockEvent = { id: 'uuid-123', ...eventData, is_published: false, created_at: new Date(), updated_at: new Date() }

      mockQuery.mockResolvedValue({ rows: [mockEvent] })

      const result = await eventService.createEvent(eventData)

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO events'),
        [eventData.name, null, null]
      )
      expect(result).toEqual(mockEvent)
    })

    it('[P1] crée un événement avec is_published = false par défaut', async () => {
      const eventData = { name: 'Test Event' }
      const mockEvent = { id: 'uuid-123', ...eventData, is_published: false, created_at: new Date(), updated_at: new Date() }

      mockQuery.mockResolvedValue({ rows: [mockEvent] })

      await eventService.createEvent(eventData)

      // Vérifier que is_published est toujours false dans la requête
      const callArg = mockQuery.mock.calls[0][0]
      expect(callArg).toContain('is_published')
      expect(callArg).toContain('false')
    })
  })

  describe('getEvents', () => {
    it('[P0] retourne la liste de tous les événements triés par date décroissante', async () => {
      const mockEvents = [
        { id: 'uuid-2', name: 'Event 2', created_at: new Date('2026-01-15') },
        { id: 'uuid-1', name: 'Event 1', created_at: new Date('2026-01-10') }
      ]

      mockQuery.mockResolvedValue({ rows: mockEvents })

      const result = await eventService.getEvents()

      expect(mockQuery).toHaveBeenCalledWith(
        `SELECT e.*, (e.invitation_mjml IS NOT NULL OR EXISTS(SELECT 1 FROM shell_parts WHERE owner_kind = 'event' AND owner_id = e.id::text)) AS has_custom_invitation,
              MIN(s.start_time) as period_start, MAX(s.end_time) as period_end
       FROM events e
       LEFT JOIN slots s ON s.event_id = e.id
       GROUP BY e.id
       ORDER BY e.created_at DESC`
      )
      expect(result).toEqual(mockEvents)
      expect(result.length).toBe(2)
    })

    it('[P0] retourne un tableau vide si aucun événement', async () => {
      mockQuery.mockResolvedValue({ rows: [] })

      const result = await eventService.getEvents()

      expect(result).toEqual([])
    })
  })

  describe('getEventById', () => {
    it('[P0] retourne un événement par UUID', async () => {
      const mockEvent = { id: 'uuid-123', name: 'Test Event', is_published: false, has_custom_invitation: false }
      mockQuery.mockResolvedValue({ rows: [mockEvent] })

      const result = await eventService.getEventById('uuid-123')

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT *, (invitation_mjml IS NOT NULL OR EXISTS(SELECT 1 FROM shell_parts WHERE owner_kind = \'event\' AND owner_id = events.id::text)) AS has_custom_invitation'),
        ['uuid-123']
      )
      expect(result).toEqual(mockEvent)
    })

    it('[P0] lance NotFoundError si événement inexistant', async () => {
      mockQuery.mockResolvedValue({ rows: [] })

      await expect(eventService.getEventById('invalid-uuid'))
        .rejects.toThrow(NotFoundError)
      await expect(eventService.getEventById('invalid-uuid'))
        .rejects.toThrow('Événement non trouvé')
    })
  })

  describe('getPublicEvent', () => {
    it('[P0] retourne un événement publié', async () => {
      const mockEvent = { id: 'uuid-123', name: 'Public Event', is_published: true }
      // First call: check query (returns event exists + published)
      // Second call: fetch full event
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'uuid-123', is_published: true }] })
        .mockResolvedValueOnce({ rows: [mockEvent] })

      const result = await eventService.getPublicEvent('uuid-123')

      expect(mockQuery).toHaveBeenCalledTimes(2)
      expect(mockQuery).toHaveBeenNthCalledWith(1,
        `SELECT id, is_published FROM events WHERE id = $1`,
        ['uuid-123']
      )
      expect(mockQuery).toHaveBeenNthCalledWith(2,
        `SELECT id, name, description, is_published, opens_at,
              (invitation_mjml IS NOT NULL OR EXISTS(SELECT 1 FROM shell_parts WHERE owner_kind = 'event' AND owner_id = events.id::text)) AS has_custom_invitation,
              created_at, updated_at
         FROM events WHERE id = $1`,
        ['uuid-123']
      )
      expect(result).toEqual(mockEvent)
    })

    it('[P0] lance NotPublishedError si événement non publié', async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: 'uuid-123', is_published: false }] })

      await expect(eventService.getPublicEvent('uuid-123'))
        .rejects.toThrow(NotPublishedError)
      await expect(eventService.getPublicEvent('uuid-123'))
        .rejects.toThrow("Cet événement n'est pas encore accessible")
    })

    it('[P1] lance NotFoundError si événement inexistant', async () => {
      mockQuery.mockResolvedValue({ rows: [] })

      await expect(eventService.getPublicEvent('invalid-uuid'))
        .rejects.toThrow(NotFoundError)
    })
  })

  describe('getPublicEvents', () => {
    it('[P0] retourne uniquement les événements publiés', async () => {
      const mockEvents = [
        { id: 'uuid-1', name: 'Public Event 1', is_published: true },
        { id: 'uuid-2', name: 'Public Event 2', is_published: true }
      ]
      mockQuery.mockResolvedValue({ rows: mockEvents })

      const result = await eventService.getPublicEvents()

      expect(mockQuery).toHaveBeenCalledWith(
        `SELECT id, name, description, is_published, opens_at,
              (invitation_mjml IS NOT NULL OR EXISTS(SELECT 1 FROM shell_parts WHERE owner_kind = 'event' AND owner_id = events.id::text)) AS has_custom_invitation,
              created_at, updated_at
         FROM events WHERE is_published = true ORDER BY created_at DESC`
      )
      expect(result).toEqual(mockEvents)
    })

    it('[P0] retourne un tableau vide si aucun événement publié', async () => {
      mockQuery.mockResolvedValue({ rows: [] })

      const result = await eventService.getPublicEvents()

      expect(result).toEqual([])
    })
  })

  describe('getPublicEventByUuid', () => {
    it('[P0] retourne un événement publié par UUID', async () => {
      const mockEvent = { id: 'uuid-123', name: 'Public Event', is_published: true }
      // First call: check query (returns event exists + published)
      // Second call: fetch full event
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'uuid-123', is_published: true }] })
        .mockResolvedValueOnce({ rows: [mockEvent] })

      const result = await eventService.getPublicEventByUuid('uuid-123')

      expect(mockQuery).toHaveBeenCalledTimes(2)
      expect(mockQuery).toHaveBeenNthCalledWith(1,
        `SELECT id, is_published FROM events WHERE id = $1`,
        ['uuid-123']
      )
      expect(mockQuery).toHaveBeenNthCalledWith(2,
        `SELECT id, name, description, is_published, opens_at,
              (invitation_mjml IS NOT NULL OR EXISTS(SELECT 1 FROM shell_parts WHERE owner_kind = 'event' AND owner_id = events.id::text)) AS has_custom_invitation,
              created_at, updated_at
         FROM events WHERE id = $1`,
        ['uuid-123']
      )
      expect(result).toEqual(mockEvent)
    })

    it('[P0] lance NotFoundError si UUID invalide', async () => {
      mockQuery.mockResolvedValue({ rows: [] })

      await expect(eventService.getPublicEventByUuid('invalid-uuid'))
        .rejects.toThrow(NotFoundError)
    })
  })

  describe('updateEvent', () => {
    it('[P0] met à jour le nom d\'un événement', async () => {
      const mockUpdatedEvent = { id: 'uuid-123', name: 'Updated Name' }
      mockQuery.mockResolvedValue({ rows: [mockUpdatedEvent] })

      const result = await eventService.updateEvent('uuid-123', { name: 'Updated Name' })

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE events SET name = $1'),
        ['Updated Name', 'uuid-123']
      )
      expect(result.name).toBe('Updated Name')
    })

    it('[P0] met à jour la description d\'un événement', async () => {
      const mockUpdatedEvent = { id: 'uuid-123', description: 'New description' }
      mockQuery.mockResolvedValue({ rows: [mockUpdatedEvent] })

      await eventService.updateEvent('uuid-123', { description: 'New description' })

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('description = $1'),
        ['New description', 'uuid-123']
      )
    })

    it('[P0] met à jour is_published d\'un événement', async () => {
      const mockUpdatedEvent = { id: 'uuid-123', is_published: true }
      mockQuery.mockResolvedValue({ rows: [mockUpdatedEvent] })

      await eventService.updateEvent('uuid-123', { isPublished: true })

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('is_published = $1'),
        [true, 'uuid-123']
      )
    })

    it('[P0] met à jour opensAt d\'un événement', async () => {
      const opensAt = new Date('2026-06-15T10:00:00.000Z')
      const mockUpdatedEvent = { id: 'uuid-123', opens_at: opensAt }
      mockQuery.mockResolvedValue({ rows: [mockUpdatedEvent] })

      await eventService.updateEvent('uuid-123', { opensAt })

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('opens_at = $1'),
        [opensAt, 'uuid-123']
      )
    })

    it('[P0] met à jour plusieurs champs simultanément', async () => {
      const mockUpdatedEvent = { id: 'uuid-123', name: 'New Name', is_published: true }
      mockQuery.mockResolvedValue({ rows: [mockUpdatedEvent] })

      await eventService.updateEvent('uuid-123', {
        name: 'New Name',
        isPublished: true
      })

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE events SET'),
        expect.arrayContaining([expect.any(String), expect.any(String), 'uuid-123'])
      )
    })

    it('[P1] lance NotFoundError si événement inexistant', async () => {
      mockQuery.mockResolvedValue({ rows: [] })

      await expect(eventService.updateEvent('invalid-uuid', { name: 'Test' }))
        .rejects.toThrow(NotFoundError)
    })

    it('[P1] lance ValidationError si aucun champ à mettre à jour', async () => {
      await expect(eventService.updateEvent('uuid-123', {}))
        .rejects.toThrow("Aucune donnée à mettre à jour. Modifiez au moins une information avant d'enregistrer.")
    })
  })

  describe('deleteEvent', () => {
    it('[P0] supprime un événement existant', async () => {
      // Story 26.1 — deleteEvent now wraps cleanup + DELETE in withTransaction.
      // The mockClient routes back to mockQuery so the assertion stays focused
      // on the DELETE SQL contract.
      mockQuery.mockResolvedValue({ rows: [{ id: 'uuid-123' }], rowCount: 1 })

      const result = await eventService.deleteEvent('uuid-123')

      expect(mockWithTransaction).toHaveBeenCalledTimes(1)
      expect(mockQuery).toHaveBeenCalledWith(
        `DELETE FROM events WHERE id = $1 RETURNING id`,
        ['uuid-123']
      )
      expect(result).toBe(true)
    })

    it('[P0] retourne false si événement inexistant', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 })

      const result = await eventService.deleteEvent('invalid-uuid')

      expect(result).toBe(false)
    })
  })

  describe('publishEvent', () => {
    it('[P0] publie un événement (is_published = true)', async () => {
      const mockEvent = { id: 'uuid-123', name: 'Test Event', is_published: true, has_custom_invitation: false }
      // First call: getEventById check (returns event exists)
      // Second call: UPDATE query
      mockQuery
        .mockResolvedValueOnce({ rows: [mockEvent] })
        .mockResolvedValueOnce({ rows: [mockEvent] })

      const result = await eventService.publishEvent('uuid-123')

      expect(mockQuery).toHaveBeenCalledTimes(2)
      expect(mockQuery).toHaveBeenNthCalledWith(1,
        `SELECT *, (invitation_mjml IS NOT NULL OR EXISTS(SELECT 1 FROM shell_parts WHERE owner_kind = 'event' AND owner_id = events.id::text)) AS has_custom_invitation
       FROM events WHERE id = $1`,
        ['uuid-123']
      )
      expect(mockQuery).toHaveBeenNthCalledWith(2,
        `UPDATE events
       SET is_published = true
       WHERE id = $1
       RETURNING *, (invitation_mjml IS NOT NULL OR EXISTS(SELECT 1 FROM shell_parts WHERE owner_kind = 'event' AND owner_id = events.id::text)) AS has_custom_invitation`,
        ['uuid-123']
      )
      expect(result).toEqual(mockEvent)
    })

    it('[P0] lance NotFoundError si événement inexistant', async () => {
      mockQuery.mockResolvedValue({ rows: [] })

      await expect(eventService.publishEvent('invalid-uuid'))
        .rejects.toThrow(NotFoundError)
    })
  })

  describe('unpublishEvent', () => {
    it('[P0] dépublie un événement (is_published = false)', async () => {
      const mockEvent = { id: 'uuid-123', name: 'Test Event', is_published: false, has_custom_invitation: false }
      mockQuery.mockResolvedValue({ rows: [mockEvent] })

      const result = await eventService.unpublishEvent('uuid-123')

      expect(mockQuery).toHaveBeenCalledWith(
        `UPDATE events
       SET is_published = false
       WHERE id = $1
       RETURNING *, (invitation_mjml IS NOT NULL OR EXISTS(SELECT 1 FROM shell_parts WHERE owner_kind = 'event' AND owner_id = events.id::text)) AS has_custom_invitation`,
        ['uuid-123']
      )
      expect(result).toEqual(mockEvent)
    })

    it('[P0] lance NotFoundError si événement inexistant', async () => {
      mockQuery.mockResolvedValue({ rows: [] })

      await expect(eventService.unpublishEvent('invalid-uuid'))
        .rejects.toThrow(NotFoundError)
    })
  })

  describe('setOpeningDate', () => {
    it('[P0] définit la date d\'ouverture d\'un événement', async () => {
      const opensAt = '2026-06-15T10:00:00.000Z'
      const mockEvent = { id: 'uuid-123', opens_at: opensAt }
      mockQuery.mockResolvedValue({ rows: [mockEvent] })

      const result = await eventService.setOpeningDate('uuid-123', opensAt)

      expect(mockQuery).toHaveBeenCalledWith(
        `UPDATE events
       SET opens_at = $1
       WHERE id = $2
       RETURNING *, (invitation_mjml IS NOT NULL OR EXISTS(SELECT 1 FROM shell_parts WHERE owner_kind = 'event' AND owner_id = events.id::text)) AS has_custom_invitation`,
        [opensAt, 'uuid-123']
      )
      expect(result).toEqual(mockEvent)
    })

    it('[P0] supprime la date d\'ouverture (null)', async () => {
      const mockEvent = { id: 'uuid-123', opens_at: null }
      mockQuery.mockResolvedValue({ rows: [mockEvent] })

      const result = await eventService.setOpeningDate('uuid-123', null)

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE events'),
        [null, 'uuid-123']
      )
      expect(result).toEqual(mockEvent)
    })

    it('[P0] lance NotFoundError si événement inexistant', async () => {
      mockQuery.mockResolvedValue({ rows: [] })

      await expect(eventService.setOpeningDate('invalid-uuid', '2026-06-15'))
        .rejects.toThrow(NotFoundError)
    })
  })
})
