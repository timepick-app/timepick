import { describe, it, expect, jest, beforeEach } from '@jest/globals'
import type { SlotDiff } from '../../utils/slot-diff'
import { deleteSlotBodySchema } from '../../validators/slot.validator'

// Typage pour les mocks
type QueryResult = { rows: Record<string, unknown>[] }
const mockQuery = jest.fn() as jest.MockedFunction<(query: string, params?: unknown[]) => Promise<QueryResult>>
const mockSendSlotCancellationEmail = jest.fn() as jest.MockedFunction<() => Promise<boolean>>
const mockSendSlotModificationEmail = jest.fn() as jest.MockedFunction<
  (
    recipients: Array<{ email: string; firstName: string; lastName?: string | null }>,
    slot: { id: string; eventName: string; eventId: string },
    diff: SlotDiff,
  ) => Promise<{ notified: number; failed: number }>
>

jest.mock('../../db', () => ({
  query: mockQuery,
  // withTransaction exécute le callback avec un client dont .query est mockQuery,
  // sans BEGIN/COMMIT réel — l'ordre des mockResolvedValueOnce devient
  // verrou (FOR UPDATE) → SELECT users → DELETE.
  withTransaction: jest.fn((callback: (client: { query: typeof mockQuery }) => unknown) =>
    callback({ query: mockQuery })
  )
}))

jest.mock('../../services/email.service', () => ({
  sendSlotCancellationEmail: mockSendSlotCancellationEmail,
  sendSlotModificationEmail: mockSendSlotModificationEmail,
}))

// Importer après les mocks
import { slotService } from '../../services/slot.service'
import { NotFoundError } from '../../errors/NotFoundError'

describe('slotService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Default : sendSlotModificationEmail résout silencieusement sans envoi SMTP.
    mockSendSlotModificationEmail.mockResolvedValue({ notified: 0, failed: 0 })
  })

  describe('createSlot', () => {
    it('[P0] crée un créneau avec des données valides', async () => {
      const slotData = {
        eventId: 'event-123',
        startTime: new Date('2026-06-15T09:00:00.000Z'),
        endTime: new Date('2026-06-15T11:00:00.000Z'),
        capacity: 5
      }
      const mockSlot = {
        id: 'slot-123',
        event_id: slotData.eventId,
        start_time: slotData.startTime,
        end_time: slotData.endTime,
        capacity: slotData.capacity,
        created_at: new Date(),
        updated_at: new Date()
      }

      mockQuery.mockResolvedValue({ rows: [mockSlot] })

      const result = await slotService.createSlot(slotData)

      expect(mockQuery).toHaveBeenCalledWith(
        `INSERT INTO slots (event_id, start_time, end_time, capacity, description)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
        [slotData.eventId, slotData.startTime, slotData.endTime, slotData.capacity, null]
      )
      expect(result).toEqual(mockSlot)
    })

    it('[P1] retourne le créneau créé avec tous les champs', async () => {
      const slotData = {
        eventId: 'event-123',
        startTime: new Date('2026-06-15T09:00:00.000Z'),
        endTime: new Date('2026-06-15T11:00:00.000Z'),
        capacity: 10
      }
      const mockSlot = {
        id: 'slot-123',
        event_id: slotData.eventId,
        start_time: slotData.startTime,
        end_time: slotData.endTime,
        capacity: slotData.capacity,
        created_at: new Date(),
        updated_at: new Date()
      }

      mockQuery.mockResolvedValue({ rows: [mockSlot] })

      const result = await slotService.createSlot(slotData)

      // The service returns raw DB rows (snake_case)
      expect(result).toHaveProperty('id')
      expect(result).toHaveProperty('event_id')
      expect(result).toHaveProperty('capacity')
      expect(result).toHaveProperty('created_at')
      expect(result).toHaveProperty('updated_at')
    })
  })

  describe('getSlotsByEvent', () => {
    it('[P0] retourne les créneaux d\'un événement avec compteur de réservations', async () => {
      const mockSlots = [
        { id: 'slot-1', event_id: 'event-123', capacity: 5, current_bookings: 2 },
        { id: 'slot-2', event_id: 'event-123', capacity: 3, current_bookings: 1 }
      ]

      mockQuery.mockResolvedValue({ rows: mockSlots })

      const result = await slotService.getSlotsByEvent('event-123')

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT s.*'),
        ['event-123']
      )
      expect(result).toHaveLength(2)
      // Service returns raw DB rows (snake_case)
      expect(result[0]).toHaveProperty('current_bookings', 2)
    })

    it('[P0] calcule dynamiquement current_bookings', async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: 'slot-1', current_bookings: 3 }] })

      const result = await slotService.getSlotsByEvent('event-123')

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('(SELECT COUNT(*) FROM bookings b'),
        ['event-123']
      )
      // Service returns raw DB rows (snake_case)
      // @ts-expect-error - Service returns raw DB rows (snake_case), Slot type uses camelCase
      expect(result[0].current_bookings).toBe(3)
    })

    it('[P0] trie par start_time ASC', async () => {
      mockQuery.mockResolvedValue({ rows: [] })

      await slotService.getSlotsByEvent('event-123')

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY s.start_time ASC'),
        ['event-123']
      )
    })

    it('[P1] retourne un tableau vide si aucun créneau', async () => {
      mockQuery.mockResolvedValue({ rows: [] })

      const result = await slotService.getSlotsByEvent('event-123')

      expect(result).toEqual([])
    })

    it('[P1] inclut le fragment json_agg des réservants (volunteers)', async () => {
      mockQuery.mockResolvedValue({ rows: [] })

      await slotService.getSlotsByEvent('event-123')

      const sql = mockQuery.mock.calls[0][0] as string
      expect(sql).toContain('json_agg')
      expect(sql).toContain('AS volunteers')
    })

    it('[P1] propage volunteers depuis les rows (annulé avec réservants inclus)', async () => {
      const mockSlots = [
        { id: 'slot-1', cancelled_at: '2026-05-01T00:00:00Z', volunteers: [{ id: 'u1', name: 'Alice Martin' }] },
        { id: 'slot-2', cancelled_at: null, volunteers: null }
      ]
      mockQuery.mockResolvedValue({ rows: mockSlots })

      const result = await slotService.getSlotsByEvent('event-123', { includeCancelled: true })

      expect(result[0].volunteers).toEqual([{ id: 'u1', name: 'Alice Martin' }])
      expect(result[1].volunteers).toBeNull()
    })
  })

  describe('getPublicSlotsByEventUuid', () => {
    it('[P0] retourne les créneaux publics d\'un événement publié', async () => {
      const mockSlots = [
        {
          id: 'slot-1',
          capacity: 5,
          current_bookings: 2,
          available_places: 3
        }
      ]

      mockQuery.mockResolvedValue({ rows: mockSlots })

      const result = await slotService.getPublicSlotsByEventUuid('event-uuid')

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('e.is_published = true'),
        ['event-uuid', null]
      )
      expect(result).toHaveLength(1)
      expect(result[0].capacity).toBe(5)
      // @ts-expect-error - Service returns raw DB rows (snake_case), Slot type uses camelCase
      expect(result[0].current_bookings).toBe(2)
      // @ts-expect-error - Service returns raw DB rows (snake_case), Slot type uses camelCase
      expect(result[0].available_places).toBe(3)
    })

    it('[P0] inclut le nombre de places disponibles', async () => {
      mockQuery.mockResolvedValue({
        rows: [{
          capacity: 5,
          current_bookings: 2,
          available_places: 3
        }]
      })

      const result = await slotService.getPublicSlotsByEventUuid('event-uuid')

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('s.capacity - (SELECT COUNT(*) FROM bookings b'),
        ['event-uuid', null]
      )
    })

    it('[P1] trie par heure de début', async () => {
      mockQuery.mockResolvedValue({ rows: [] })

      await slotService.getPublicSlotsByEventUuid('event-uuid')

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY s.start_time ASC'),
        ['event-uuid', null]
      )
    })

    it('[P1] expose cancelled_at/cancellation_reason et borne l\'exception is_published à l\'utilisateur (décision #8)', async () => {
      mockQuery.mockResolvedValue({ rows: [] })

      await slotService.getPublicSlotsByEventUuid('event-uuid', 'user-42')

      // Le créneau annulé n'est visible que si l'utilisateur courant l'a réservé
      // (EXISTS borné), quelle que soit la publication.
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('s.cancelled_at IS NOT NULL'),
        ['event-uuid', 'user-42']
      )
      const sql = mockQuery.mock.calls[0][0] as string
      expect(sql).toContain('s.cancelled_at')
      expect(sql).toContain('s.cancellation_reason')
      expect(sql).toMatch(/b3\.user_id = \$2/)
    })
  })

  describe('getSlotById', () => {
    it('[P0] retourne un créneau par ID avec currentBookings', async () => {
      const mockSlot = {
        id: 'slot-123',
        event_id: 'event-123',
        capacity: 5,
        current_bookings: 2
      }

      mockQuery.mockResolvedValue({ rows: [mockSlot] })

      const result = await slotService.getSlotById('slot-123')

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT s.*,'),
        ['slot-123']
      )
      expect(result).toEqual(mockSlot)
    })

    it('[P0] lance NotFoundError si créneau inexistant', async () => {
      mockQuery.mockResolvedValue({ rows: [] })

      await expect(slotService.getSlotById('invalid-slot'))
        .rejects.toThrow(NotFoundError)
      await expect(slotService.getSlotById('invalid-slot'))
        .rejects.toThrow('Créneau non trouvé')
    })

    it('[P0] inclut le compteur de réservations', async () => {
      mockQuery.mockResolvedValue({ rows: [{ current_bookings: 3 }] })

      const result = await slotService.getSlotById('slot-123')

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('(SELECT COUNT(*) FROM bookings b'),
        ['slot-123']
      )
      // Service returns raw DB rows (snake_case)
      // @ts-expect-error - Service returns raw DB rows (snake_case), Slot type uses camelCase
      expect(result.current_bookings).toBe(3)
    })
  })

  describe('updateSlot', () => {
    it('[P0] met à jour la capacité d\'un créneau', async () => {
      const slotTime = {
        start_time: new Date('2026-06-15T08:00:00.000Z'),
        end_time: new Date('2026-06-15T12:00:00.000Z'),
      }
      const mockUpdatedSlot = { id: 'slot-123', capacity: 10, description: null as string | null, ...slotTime }
      mockQuery.mockResolvedValueOnce({ rows: [{ cancelled_at: null, description: null as string | null, ...slotTime }] }) // SELECT FOR UPDATE
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] }) // Booking check → 0 bookings
      mockQuery.mockResolvedValueOnce({ rows: [mockUpdatedSlot] }) // UPDATE RETURNING *

      const result = await slotService.updateSlot('slot-123', { capacity: 10 })

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE slots SET'),
        expect.arrayContaining([10, 'slot-123'])
      )
      // capacity non surveillée → diff vide → aucun dispatch
      expect(result.slot.capacity).toBe(10)
      expect(result.notified).toBe(0)
      expect(result.failed).toBe(0)
    })

    it('[P0] met à jour les heures d\'un créneau', async () => {
      const newStartTime = new Date('2026-06-15T08:00:00.000Z')
      const newEndTime = new Date('2026-06-15T12:00:00.000Z')
      const mockUpdatedSlot = {
        id: 'slot-123',
        capacity: 5,
        start_time: newStartTime,
        end_time: newEndTime,
        event_id: 'event-123',
        created_at: new Date(),
        updated_at: new Date(),
        current_bookings: 0
      }

      mockQuery.mockResolvedValueOnce({ rows: [{ // SELECT FOR UPDATE — snapshot complet pour computeSlotDiff
        cancelled_at: null,
        start_time: new Date('2026-06-15T06:00:00.000Z'), // valeurs originales (différentes des nouvelles)
        end_time: new Date('2026-06-15T10:00:00.000Z'),
        description: null as string | null,
      }] })
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] }) // 0 bookings → pas de dispatch même si diff
      mockQuery.mockResolvedValueOnce({ rows: [mockUpdatedSlot] })

      await slotService.updateSlot('slot-123', { startTime: newStartTime, endTime: newEndTime })

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE slots SET'),
        expect.arrayContaining([newStartTime, newEndTime, 'slot-123'])
      )
    })

    it('[P0] met à jour plusieurs champs simultanément', async () => {
      // Explicitly reset mock to avoid pollution from previous tests
      mockQuery.mockReset()
      const beforeRow = {
        cancelled_at: null,
        start_time: new Date('2026-06-15T08:00:00.000Z'), // original — sera différent après UPDATE
        end_time: new Date('2026-06-15T11:00:00.000Z'),
        description: null as string | null,
      }
      mockQuery.mockResolvedValueOnce({ rows: [beforeRow] }) // SELECT FOR UPDATE
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '2' }] }) // 2 bookings
      const mockUpdatedSlot = {
        id: 'slot-123',
        capacity: 8,
        start_time: new Date('2026-06-15T09:00:00.000Z'), // modifié → diff détecte 'start_time'
        end_time: new Date('2026-06-15T11:00:00.000Z'),
        event_id: 'event-123',
        created_at: new Date(),
        updated_at: new Date(),
        current_bookings: 2,
        description: null,
      }
      mockQuery.mockResolvedValueOnce({ rows: [mockUpdatedSlot] }) // UPDATE RETURNING *
      // diff non vide ['start_time'] + 2 bookings → dispatch → SELECT recipients (post-commit)
      mockQuery.mockResolvedValueOnce({ rows: [
        { email: 'a@test.com', first_name: 'Alice', last_name: null, event_name: 'Test Event' },
        { email: 'b@test.com', first_name: 'Bob',   last_name: null, event_name: 'Test Event' },
      ] })

      const result = await slotService.updateSlot('slot-123', {
        capacity: 8,
        startTime: new Date('2026-06-15T09:00:00.000Z')
      })

      expect(result.slot.capacity).toBe(8)

      // I2 — dispatch appelé exactement une fois avec les bons recipients et diff.fields
      expect(mockSendSlotModificationEmail).toHaveBeenCalledTimes(1)
      const [callRecipients, , callDiff] = mockSendSlotModificationEmail.mock.calls[0]
      expect(callRecipients).toEqual([
        { email: 'a@test.com', firstName: 'Alice', lastName: null },
        { email: 'b@test.com', firstName: 'Bob',   lastName: null },
      ])
      expect(callDiff.fields).toContain('start_time')
    })

    it('[P0] lance NotFoundError si créneau inexistant', async () => {
      mockQuery.mockResolvedValue({ rows: [] })

      await expect(slotService.updateSlot('invalid-slot', { capacity: 5 }))
        .rejects.toThrow(NotFoundError)
    })

    it('[P0] lance Error si capacité réduite sous le nombre de réservations', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ // SELECT FOR UPDATE
        cancelled_at: null,
        start_time: new Date('2026-06-15T08:00:00.000Z'),
        end_time: new Date('2026-06-15T10:00:00.000Z'),
        description: null as string | null,
      }] })
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '3' }] }) // 3 réservations existantes

      await expect(slotService.updateSlot('slot-123', { capacity: 2 }))
        .rejects.toThrow('Impossible de réduire la capacité en dessous du nombre de réservations actuelles (3)')
    })

    it('[P1] autorise la réduction de capacité si supérieur aux réservations', async () => {
      const slotTime = { start_time: new Date('2026-06-15T08:00:00.000Z'), end_time: new Date('2026-06-15T10:00:00.000Z') }
      mockQuery.mockResolvedValueOnce({ rows: [{ cancelled_at: null, description: null as string | null, ...slotTime }] }) // SELECT FOR UPDATE
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '3' }] })
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'slot-123', capacity: 5, description: null, ...slotTime }] }) // UPDATE RETURNING *

      const result = await slotService.updateSlot('slot-123', { capacity: 5 })

      // capacity seule (non surveillée) → diff vide → pas de dispatch
      expect(result.slot.capacity).toBe(5)
    })

    it('[P1] autorise l\'augmentation de capacité', async () => {
      const slotTime = { start_time: new Date('2026-06-15T08:00:00.000Z'), end_time: new Date('2026-06-15T10:00:00.000Z') }
      mockQuery.mockResolvedValueOnce({ rows: [{ cancelled_at: null, description: null as string | null, ...slotTime }] }) // SELECT FOR UPDATE
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '2' }] })
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'slot-123', capacity: 10, description: null, ...slotTime }] }) // UPDATE RETURNING *

      const result = await slotService.updateSlot('slot-123', { capacity: 10 })

      // capacity seule (non surveillée) → diff vide → pas de dispatch
      expect(result.slot.capacity).toBe(10)
    })

    it('[P1] lance Error si aucun champ à mettre à jour', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ // SELECT FOR UPDATE
        cancelled_at: null,
        start_time: new Date('2026-06-15T08:00:00.000Z'),
        end_time: new Date('2026-06-15T10:00:00.000Z'),
        description: null as string | null,
      }] })
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] }) // COUNT avant le guard "aucun champ"
      await expect(slotService.updateSlot('slot-123', {}))
        .rejects.toThrow('Aucun champ à mettre à jour')
    })

    it('[P0] lance ConflictError (409) si le créneau est annulé (F5/AC6)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ cancelled_at: '2026-05-30T10:00:00Z' }] })

      await expect(slotService.updateSlot('slot-123', { capacity: 5 }))
        .rejects.toMatchObject({ name: 'ConflictError', statusCode: 409 })
    })
  })

  describe('cancelSlot', () => {
    it('[P0] supprime définitivement un créneau actif sans inscrit (DELETE, pas UPDATE, aucun email)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'slot-123' }] }) // FOR UPDATE lock (actif)
      mockQuery.mockResolvedValueOnce({ rows: [] }) // 0 inscrit à notifier
      mockQuery.mockResolvedValueOnce({ rows: [] }) // DELETE FROM slots

      const result = await slotService.cancelSlot('slot-123')

      // Le verrou ne porte que sur les créneaux actifs (garantie « un seul email »).
      expect(mockQuery).toHaveBeenCalledWith(
        `SELECT id FROM slots WHERE id = $1 AND cancelled_at IS NULL FOR UPDATE`,
        ['slot-123']
      )
      // 0 inscrit → suppression définitive : DELETE et non UPDATE.
      expect(mockQuery).toHaveBeenCalledWith(
        `DELETE FROM slots WHERE id = $1`,
        ['slot-123']
      )
      const updateCall = mockQuery.mock.calls.find(
        ([sql]) => typeof sql === 'string' && sql.includes('UPDATE slots SET cancelled_at')
      )
      expect(updateCall).toBeUndefined()
      // Aucun email : pas d'inscrit à notifier.
      expect(mockSendSlotCancellationEmail).not.toHaveBeenCalled()
      expect(result.cancelled).toBe(true)
    })

    it('[P0] lance NotFoundError (404) si créneau inexistant', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }) // FOR UPDATE lock → row absente
      mockQuery.mockResolvedValueOnce({ rows: [] }) // existence check → n'existe pas

      await expect(slotService.cancelSlot('invalid-slot'))
        .rejects.toThrow(NotFoundError)
    })

    it('[P0] lance ConflictError (409) sans renvoyer d\'email si déjà annulé (décision #9/AC5)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }) // lock filtré (cancelled_at déjà posé)
      mockQuery.mockResolvedValueOnce({ rows: [{ exists: 1 }] }) // existence check → la row existe

      await expect(slotService.cancelSlot('slot-123'))
        .rejects.toMatchObject({ name: 'ConflictError', statusCode: 409 })
      // Aucun email : on n'atteint jamais le chemin de notification.
      expect(mockSendSlotCancellationEmail).not.toHaveBeenCalled()
    })

    it('[P1] envoie des emails de notification aux utilisateurs avec réservations', async () => {
      const usersToNotify = [
        {
          email: 'user1@example.com',
          first_name: 'User One',
          event_name: 'Test Event',
          event_id: 'evt-uuid-123',
          start_time: new Date('2026-06-15T09:00:00Z'),
          end_time: new Date('2026-06-15T11:00:00Z')
        },
        {
          email: 'user2@example.com',
          first_name: 'User Two',
          event_name: 'Test Event',
          event_id: 'evt-uuid-123',
          start_time: new Date('2026-06-15T09:00:00Z'),
          end_time: new Date('2026-06-15T11:00:00Z')
        }
      ]

      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'slot-123' }] }) // FOR UPDATE lock
      mockQuery.mockResolvedValueOnce({ rows: usersToNotify })
      mockQuery.mockResolvedValueOnce({ rows: [] }) // Delete
      mockSendSlotCancellationEmail.mockResolvedValue(true)

      await slotService.cancelSlot('slot-123')

      expect(mockSendSlotCancellationEmail).toHaveBeenCalledTimes(2)
      expect(mockSendSlotCancellationEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          userEmail: 'user1@example.com',
          userFirstName: 'User One',
          eventName: 'Test Event'
        })
      )
    })

    it('[P1] gère les erreurs d\'envoi d\'email sans bloquer la suppression', async () => {
      const usersToNotify = [
        { email: 'user1@example.com', first_name: 'User One', event_name: 'Test Event', event_id: 'evt-uuid-123', start_time: new Date(), end_time: new Date() }
      ]

      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'slot-123' }] }) // FOR UPDATE lock
      mockQuery.mockResolvedValueOnce({ rows: usersToNotify })
      mockQuery.mockResolvedValueOnce({ rows: [] }) // Delete

      // Simuler un échec d'envoi d'email
      mockSendSlotCancellationEmail.mockResolvedValue(false)

      // Ne doit pas lancer d'erreur
      const result = await slotService.cancelSlot('slot-123')

      expect(result.cancelled).toBe(true)
    })

    // F-B (post-5b-defer-a-L3-data-F-B) — un envoi qui *rejette* (exception hors
    // du contrat interne de sendSlotCancellationEmail) doit être comptabilisé dans
    // le log d'alerte, pas seulement les retours `false`.
    it('[P1] comptabilise les rejets de sendSlotCancellationEmail dans les échecs (F-B)', async () => {
      const usersToNotify = [
        { email: 'user1@example.com', first_name: 'User One', event_name: 'Test Event', event_id: 'evt-uuid-123', start_time: new Date(), end_time: new Date() }
      ]

      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'slot-123' }] }) // FOR UPDATE lock
      mockQuery.mockResolvedValueOnce({ rows: usersToNotify })
      mockQuery.mockResolvedValueOnce({ rows: [] }) // Delete

      mockSendSlotCancellationEmail.mockRejectedValue(new Error('boom'))
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})

      const result = await slotService.cancelSlot('slot-123')

      expect(result.cancelled).toBe(true)
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('1 email(s) de notification ont échoué'),
        expect.objectContaining({
          rejections: expect.arrayContaining([expect.any(Error)])
        })
      )

      warnSpy.mockRestore()
    })

    it('[P2] utilise Promise.allSettled pour les envois d\'email', async () => {
      const usersToNotify = [
        { email: 'user1@example.com', first_name: 'User One', event_name: 'Test Event', event_id: 'evt-uuid-123', start_time: new Date(), end_time: new Date() },
        { email: 'user2@example.com', first_name: 'User Two', event_name: 'Test Event', event_id: 'evt-uuid-123', start_time: new Date(), end_time: new Date() }
      ]

      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'slot-123' }] }) // FOR UPDATE lock
      mockQuery.mockResolvedValueOnce({ rows: usersToNotify })
      mockQuery.mockResolvedValueOnce({ rows: [] }) // Delete

      await slotService.cancelSlot('slot-123')

      // Vérifier que Promise.allSettled est utilisé pour les emails
      expect(mockSendSlotCancellationEmail).toHaveBeenCalled()
    })

    it('[P2] format correctement la date et l\'heure pour l\'email', async () => {
      const usersToNotify = [{
        email: 'user1@example.com',
        first_name: 'User One',
        event_name: 'Test Event',
        event_id: 'evt-uuid-123',
        start_time: new Date('2026-06-15T09:30:00Z'),
        end_time: new Date('2026-06-15T11:30:00Z')
      }]

      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'slot-123' }] }) // FOR UPDATE lock
      mockQuery.mockResolvedValueOnce({ rows: usersToNotify })
      mockQuery.mockResolvedValueOnce({ rows: [] }) // Delete

      await slotService.cancelSlot('slot-123')

      expect(mockSendSlotCancellationEmail).toHaveBeenCalled()
      // Vérifier le format de la date et de l'heure via le mock
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const firstCall: any = mockSendSlotCancellationEmail.mock.calls[0]
      expect(firstCall).toBeDefined()
      if (firstCall && firstCall[0]) {
        expect(firstCall[0]).toHaveProperty('slotDate')
        expect(firstCall[0]).toHaveProperty('slotTime')
      }
    })

    // Plan 5b defer-A L3-data-F (2026-05-26) — propagation du motif d'annulation
    // optionnel saisi par l'admin via la modale `SlotDeleteDialog` jusqu'à
    // `sendSlotCancellationEmail`. Vérifie les 3 cas : motif fourni → propagé,
    // motif omis → undefined côté email, motif vide après trim → undefined.
    it('[P1] propage cancellationReason à sendSlotCancellationEmail quand fourni', async () => {
      const usersToNotify = [{
        email: 'user1@example.com',
        first_name: 'User One',
        event_name: 'Test Event',
        event_id: 'evt-uuid-123',
        start_time: new Date('2026-06-15T09:30:00Z'),
        end_time: new Date('2026-06-15T11:30:00Z')
      }]

      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'slot-123' }] }) // FOR UPDATE lock
      mockQuery.mockResolvedValueOnce({ rows: usersToNotify })
      mockQuery.mockResolvedValueOnce({ rows: [] }) // Delete
      mockSendSlotCancellationEmail.mockResolvedValue(true)

      await slotService.cancelSlot('slot-123', 'Événement reporté')

      expect(mockSendSlotCancellationEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          cancellationReason: 'Événement reporté',
        })
      )
    })

    // Plan 5b defer-A L3-data-F — Patch step-04 finding AC12 (couverture I/O
     // Matrix scenario "Motif > 500 chars"). Vérifie le bound exact du schema
     // Zod consommé par le controller DELETE.
    describe('deleteSlotBodySchema bound 500 chars', () => {
      it('accepte exactement 500 caractères', () => {
        const reason = 'a'.repeat(500)
        const result = deleteSlotBodySchema.parse({ cancellationReason: reason })
        expect(result.cancellationReason).toBe(reason)
      })

      it('rejette 501 caractères', () => {
        const reason = 'a'.repeat(501)
        expect(() => deleteSlotBodySchema.parse({ cancellationReason: reason })).toThrow(
          /500 caractères/
        )
      })

      it('accepte 502 caractères avec 2 espaces aux bords (trim avant max)', () => {
        // Zod trim s'applique avant max → 502 visibles devient 500 après trim
        const reason = ' ' + 'a'.repeat(500) + ' '
        const result = deleteSlotBodySchema.parse({ cancellationReason: reason })
        expect(result.cancellationReason).toBe('a'.repeat(500))
      })

      it('accepte body absent (parameter optional)', () => {
        const result = deleteSlotBodySchema.parse({})
        expect(result.cancellationReason).toBeUndefined()
      })
    })

    it('[P1] propage cancellationReason=undefined quand omis (annulation user-side)', async () => {
      const usersToNotify = [{
        email: 'user1@example.com',
        first_name: 'User One',
        event_name: 'Test Event',
        event_id: 'evt-uuid-123',
        start_time: new Date('2026-06-15T09:30:00Z'),
        end_time: new Date('2026-06-15T11:30:00Z')
      }]

      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'slot-123' }] }) // FOR UPDATE lock
      mockQuery.mockResolvedValueOnce({ rows: usersToNotify })
      mockQuery.mockResolvedValueOnce({ rows: [] }) // Delete
      mockSendSlotCancellationEmail.mockResolvedValue(true)

      await slotService.cancelSlot('slot-123')

      const call: any = mockSendSlotCancellationEmail.mock.calls[0]
      expect(call[0].cancellationReason).toBeUndefined()
    })

    // spec-cancellation-notification-reliability — marqueur durable
    // bookings.cancellation_notified_at : posé UNIQUEMENT sur les envois réussis.
    it('[P0] marque cancellation_notified_at sur les bookings dont l\'envoi a réussi', async () => {
      const usersToNotify = [
        { booking_id: 'bk-1', email: 'u1@example.com', first_name: 'U1', event_name: 'E', event_id: 'evt-uuid-123', start_time: new Date('2026-06-15T09:00:00Z'), end_time: new Date('2026-06-15T11:00:00Z') },
        { booking_id: 'bk-2', email: 'u2@example.com', first_name: 'U2', event_name: 'E', event_id: 'evt-uuid-123', start_time: new Date('2026-06-15T09:00:00Z'), end_time: new Date('2026-06-15T11:00:00Z') },
      ]
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'slot-123' }] }) // FOR UPDATE lock
      mockQuery.mockResolvedValueOnce({ rows: usersToNotify })        // SELECT users (+ b.id)
      mockQuery.mockResolvedValueOnce({ rows: [] })                  // UPDATE soft-delete
      mockQuery.mockResolvedValue({ rows: [] })                      // marqueurs (post-commit)
      mockSendSlotCancellationEmail.mockResolvedValue(true)

      const result = await slotService.cancelSlot('slot-123', 'Reporté')
      expect(result).toEqual({ cancelled: true, hadReservations: true, notified: 2, failed: 0 })

      const markerCalls = mockQuery.mock.calls.filter(
        ([sql]) => typeof sql === 'string' && sql.includes('UPDATE bookings SET cancellation_notified_at')
      )
      expect(markerCalls).toHaveLength(2)
      expect(markerCalls.map(([, params]) => (params as string[])[0]).sort()).toEqual(['bk-1', 'bk-2'])
      // Le garde d'idempotence est présent dans la requête de marquage.
      expect(markerCalls[0][0]).toEqual(expect.stringContaining('AND cancellation_notified_at IS NULL'))
    })

    it('[P0] ne marque PAS cancellation_notified_at quand l\'envoi échoue (false)', async () => {
      const usersToNotify = [
        { booking_id: 'bk-1', email: 'u1@example.com', first_name: 'U1', event_name: 'E', event_id: 'evt-uuid-123', start_time: new Date(), end_time: new Date() },
      ]
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'slot-123' }] }) // FOR UPDATE lock
      mockQuery.mockResolvedValueOnce({ rows: usersToNotify })        // SELECT users
      mockQuery.mockResolvedValueOnce({ rows: [] })                  // UPDATE soft-delete
      mockQuery.mockResolvedValue({ rows: [] })
      mockSendSlotCancellationEmail.mockResolvedValue(false)

      const result = await slotService.cancelSlot('slot-123')
      expect(result).toEqual({ cancelled: true, hadReservations: true, notified: 0, failed: 1 })

      const markerCalls = mockQuery.mock.calls.filter(
        ([sql]) => typeof sql === 'string' && sql.includes('UPDATE bookings SET cancellation_notified_at')
      )
      expect(markerCalls).toHaveLength(0)
    })
  })
})
