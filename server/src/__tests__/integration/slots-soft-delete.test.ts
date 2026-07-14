import request from 'supertest'
import jwt from 'jsonwebtoken'
import { testServer } from '../helpers/test-server'
import { query } from '../../db'
import { slotService } from '../../services/slot.service'

/**
 * Tests d'intégration du soft-delete (filtrage des lectures + garde-fous), sur la
 * vraie base timepick_test. Couvre AC2-AC8 du soft-delete des créneaux annulés
 * (2026-05-29).
 *
 * Fixtures : un événement publié avec 3 créneaux —
 *   - activeSlot           : actif, sans réservation
 *   - cancelledBookedSlot  : annulé, réservé par Alice (canal de secours)
 *   - cancelledUnbookedSlot: annulé, sans réservation
 * Alice est inscrite (event_users) ; Bob est autorisé mais n'a aucune réservation.
 */

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret'
const token = (userId: string, role = 'user') =>
  jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: '1h' })

const futureSlot = (offsetHours: number) => ({
  start: new Date(Date.now() + offsetHours * 3600_000),
  end: new Date(Date.now() + (offsetHours + 2) * 3600_000),
})

async function insertSlot(eventId: string, offsetHours: number): Promise<string> {
  const { start, end } = futureSlot(offsetHours)
  const res = await query(
    `INSERT INTO slots (event_id, start_time, end_time, capacity)
     VALUES ($1, $2, $3, 5) RETURNING id`,
    [eventId, start, end]
  )
  return res.rows[0].id
}

describe('Soft-delete slots — filtrage des lectures + garde-fous (AC2-AC8)', () => {
  let eventId: string
  let adminId: string
  let aliceId: string
  let bobId: string
  let adminToken: string
  let bobToken: string
  let activeSlotId: string
  let cancelledBookedSlotId: string
  let cancelledUnbookedSlotId: string

  beforeAll(async () => {
    const admin = await query(
      `INSERT INTO users (email, first_name, role) VALUES ($1, $2, 'admin')
       ON CONFLICT (email) DO UPDATE SET role = 'admin' RETURNING id`,
      ['sd-admin@local.dev', 'SD Admin']
    )
    adminId = admin.rows[0].id
    adminToken = token(adminId, 'admin')

    const alice = await query(
      `INSERT INTO users (email, first_name, role) VALUES ($1, $2, 'user')
       ON CONFLICT (email) DO UPDATE SET role = 'user' RETURNING id`,
      ['sd-alice@local.dev', 'SD Alice']
    )
    aliceId = alice.rows[0].id

    const bob = await query(
      `INSERT INTO users (email, first_name, role) VALUES ($1, $2, 'user')
       ON CONFLICT (email) DO UPDATE SET role = 'user' RETURNING id`,
      ['sd-bob@local.dev', 'SD Bob']
    )
    bobId = bob.rows[0].id
    bobToken = token(bobId, 'user')

    const event = await query(
      `INSERT INTO events (name, description, is_published)
       VALUES ($1, 'soft-delete fixture', true) RETURNING id`,
      [`sd-event-${Date.now()}-${Math.random().toString(36).slice(2)}`]
    )
    eventId = event.rows[0].id

    await query(
      `INSERT INTO event_users (event_id, user_id) VALUES ($1, $2), ($1, $3)`,
      [eventId, aliceId, bobId]
    )

    activeSlotId = await insertSlot(eventId, 24)
    cancelledBookedSlotId = await insertSlot(eventId, 48)
    cancelledUnbookedSlotId = await insertSlot(eventId, 72)

    // Alice réserve le créneau qui sera annulé.
    await query(
      `INSERT INTO bookings (user_id, slot_id) VALUES ($1, $2)`,
      [aliceId, cancelledBookedSlotId]
    )

    // Annuler deux créneaux directement (fixtures — pas d'email).
    await query(
      `UPDATE slots SET cancelled_at = NOW() - interval '90 days',
              cancellation_reason = 'Reporté'
       WHERE id = ANY($1)`,
      [[cancelledBookedSlotId, cancelledUnbookedSlotId]]
    )
  })

  afterAll(async () => {
    await query(`DELETE FROM bookings WHERE slot_id IN ($1, $2, $3)`, [
      activeSlotId,
      cancelledBookedSlotId,
      cancelledUnbookedSlotId,
    ])
    await query(`DELETE FROM event_users WHERE event_id = $1`, [eventId])
    await query(`DELETE FROM slots WHERE event_id = $1`, [eventId])
    await query(`DELETE FROM events WHERE id = $1`, [eventId])
    await query(`DELETE FROM users WHERE id IN ($1, $2, $3)`, [adminId, aliceId, bobId])
  })

  describe('getSlotsByEvent — 3 modes de filtrage', () => {
    it('mode true (admin) → tous les créneaux, annulés inclus (arbitrage #1)', async () => {
      const slots = await slotService.getSlotsByEvent(eventId, { includeCancelled: true })
      expect(slots.map((s) => s.id).sort()).toEqual(
        [activeSlotId, cancelledBookedSlotId, cancelledUnbookedSlotId].sort()
      )
    })

    it('mode false (défaut, public non-auth) → seulement les créneaux actifs', async () => {
      const slots = await slotService.getSlotsByEvent(eventId)
      expect(slots.map((s) => s.id)).toEqual([activeSlotId])
    })

    it("mode forCurrentUser → actif + créneau annulé réservé par l'inscrit, sans borne temporelle (AC2)", async () => {
      const slots = await slotService.getSlotsByEvent(eventId, {
        includeCancelled: 'forCurrentUser',
        userId: aliceId,
      })
      // Annulé il y a 90 jours et toujours visible → aucune borne temporelle.
      expect(slots.map((s) => s.id).sort()).toEqual(
        [activeSlotId, cancelledBookedSlotId].sort()
      )
      expect(slots.find((s) => s.id === cancelledUnbookedSlotId)).toBeUndefined()
    })

    it('mode forCurrentUser pour un non-inscrit → aucun créneau annulé (AC3)', async () => {
      const slots = await slotService.getSlotsByEvent(eventId, {
        includeCancelled: 'forCurrentUser',
        userId: bobId,
      })
      expect(slots.map((s) => s.id)).toEqual([activeSlotId])
    })
  })

  describe('getPublicSlotsByEventUuid — filtrage + exception is_published', () => {
    it("inscrit (publié) → actif + son créneau annulé réservé (AC2)", async () => {
      const slots = await slotService.getPublicSlotsByEventUuid(eventId, aliceId)
      expect(slots.map((s) => s.id).sort()).toEqual(
        [activeSlotId, cancelledBookedSlotId].sort()
      )
      // Le service renvoie les rows DB brutes (snake_case) ; la conversion
      // camelCase a lieu dans snakeToCamelMiddleware au niveau HTTP (couvert par
      // le GET /api/admin/slots/:id de slots.test.ts qui voit `cancelledAt`).
      const cancelled = slots.find((s) => s.id === cancelledBookedSlotId) as
        | (Record<string, unknown> & { id: string })
        | undefined
      expect(cancelled?.cancelled_at).not.toBeNull()
      expect(cancelled?.cancellation_reason).toBe('Reporté')
    })

    it('non-inscrit (publié) → seulement les créneaux actifs (AC3)', async () => {
      const slots = await slotService.getPublicSlotsByEventUuid(eventId, bobId)
      expect(slots.map((s) => s.id)).toEqual([activeSlotId])
    })

    it('anonyme (publié) → seulement les créneaux actifs (AC3)', async () => {
      const slots = await slotService.getPublicSlotsByEventUuid(eventId)
      expect(slots.map((s) => s.id)).toEqual([activeSlotId])
    })

    it("événement dépublié → l'inscrit voit son créneau annulé, et RIEN d'autre (AC4)", async () => {
      await query(`UPDATE events SET is_published = false WHERE id = $1`, [eventId])
      try {
        const aliceSlots = await slotService.getPublicSlotsByEventUuid(eventId, aliceId)
        // Uniquement son créneau annulé réservé : pas le créneau actif (brouillon),
        // pas l'annulé non réservé.
        expect(aliceSlots.map((s) => s.id)).toEqual([cancelledBookedSlotId])

        // Un non-inscrit ne voit rien d'un brouillon.
        const bobSlots = await slotService.getPublicSlotsByEventUuid(eventId, bobId)
        expect(bobSlots).toEqual([])

        // Anonyme : rien non plus.
        const anonSlots = await slotService.getPublicSlotsByEventUuid(eventId)
        expect(anonSlots).toEqual([])
      } finally {
        await query(`UPDATE events SET is_published = true WHERE id = $1`, [eventId])
      }
    })
  })

  describe('Garde-fous HTTP', () => {
    it('PUT /api/admin/slots/:id sur un créneau annulé → 409 (AC6)', async () => {
      const res = await request(testServer())
        .put(`/api/admin/slots/${cancelledBookedSlotId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ capacity: 3 })
      expect(res.status).toBe(409)

      // Aucune mutation : la capacité n'a pas changé.
      const row = await query(`SELECT capacity FROM slots WHERE id = $1`, [cancelledBookedSlotId])
      expect(row.rows[0].capacity).toBe(5)
    })

    it('POST /api/slots/book sur un créneau annulé → 409 (AC7)', async () => {
      const res = await request(testServer())
        .post('/api/slots/book')
        .set('Authorization', `Bearer ${bobToken}`)
        .send({ slotId: cancelledUnbookedSlotId })
      expect(res.status).toBe(409)

      // Aucune réservation créée.
      const row = await query(
        `SELECT COUNT(*)::int AS count FROM bookings WHERE slot_id = $1`,
        [cancelledUnbookedSlotId]
      )
      expect(row.rows[0].count).toBe(0)
    })
  })
})
