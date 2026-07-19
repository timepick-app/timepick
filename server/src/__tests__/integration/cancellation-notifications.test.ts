import request from 'supertest'
import jwt from 'jsonwebtoken'

// Email mocké (non négociable — pas de vrais envois Mailpit en test). On
// préserve les autres exports (getTransportStatus, etc. consommés par app.ts)
// via requireActual et on ne remplace que sendSlotCancellationEmail.
jest.mock('../../services/email.service', () => {
  const actual = jest.requireActual('../../services/email.service')
  return { ...actual, sendSlotCancellationEmail: jest.fn() }
})

import { testServer } from '../helpers/test-server'
import { query } from '../../db'
import { sendSlotCancellationEmail } from '../../services/email.service'

const mockSend = sendSlotCancellationEmail as jest.MockedFunction<typeof sendSlotCancellationEmail>

/**
 * Tests d'intégration des routes de notifications d'annulation en attente, sur
 * la vraie base timepick_test. Couvre la lecture groupée (global + filtrée),
 * le renvoi groupé idempotent (global + par événement), le comptage sent/failed
 * et la validation (400 sur eventId malformé).
 * cf. spec-cancellation-notification-reliability.
 *
 * Fixtures : deux événements publiés A et B, chacun avec un créneau annulé
 * réservé (booking.cancellation_notified_at NULL = « en attente »).
 */

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret'
const token = (userId: string, role = 'user') =>
  jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: '1h' })

async function insertCancelledBookedSlot(
  eventId: string,
  userId: string,
  offsetHours: number,
  reason: string
): Promise<{ slotId: string; bookingId: string }> {
  const start = new Date(Date.now() + offsetHours * 3600_000)
  const end = new Date(Date.now() + (offsetHours + 2) * 3600_000)
  const slot = await query(
    `INSERT INTO slots (event_id, start_time, end_time, capacity, cancelled_at, cancellation_reason)
     VALUES ($1, $2, $3, 5, NOW(), $4) RETURNING id`,
    [eventId, start, end, reason]
  )
  const slotId = slot.rows[0].id
  const booking = await query(
    `INSERT INTO bookings (user_id, slot_id) VALUES ($1, $2) RETURNING id`,
    [userId, slotId]
  )
  return { slotId, bookingId: booking.rows[0].id }
}

async function notifiedAt(bookingId: string): Promise<string | null> {
  const { rows } = await query(
    `SELECT cancellation_notified_at FROM bookings WHERE id = $1`,
    [bookingId]
  )
  return rows[0]?.cancellation_notified_at ?? null
}

describe('Notifications d\'annulation en attente — routes admin', () => {
  let adminToken: string
  let adminId: string
  let aliceId: string
  let bobId: string
  let eventAId: string
  let eventBId: string
  let aliceBookingId: string
  let bobBookingId: string

  beforeAll(async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`

    const admin = await query(
      `INSERT INTO users (email, first_name, role) VALUES ($1, $2, 'admin')
       ON CONFLICT (email) DO UPDATE SET role = 'admin' RETURNING id`,
      [`cn-admin-${stamp}@local.dev`, 'CN Admin']
    )
    adminId = admin.rows[0].id
    adminToken = token(adminId, 'admin')

    const alice = await query(
      `INSERT INTO users (email, first_name, role) VALUES ($1, $2, 'user') RETURNING id`,
      [`cn-alice-${stamp}@local.dev`, 'CN Alice']
    )
    aliceId = alice.rows[0].id

    const bob = await query(
      `INSERT INTO users (email, first_name, role) VALUES ($1, $2, 'user') RETURNING id`,
      [`cn-bob-${stamp}@local.dev`, 'CN Bob']
    )
    bobId = bob.rows[0].id

    const eventA = await query(
      `INSERT INTO events (name, description, is_published) VALUES ($1, 'CN fixture A', true) RETURNING id`,
      [`cn-event-a-${stamp}`]
    )
    eventAId = eventA.rows[0].id
    const eventB = await query(
      `INSERT INTO events (name, description, is_published) VALUES ($1, 'CN fixture B', true) RETURNING id`,
      [`cn-event-b-${stamp}`]
    )
    eventBId = eventB.rows[0].id

    const a = await insertCancelledBookedSlot(eventAId, aliceId, 24, 'Reporté <A>')
    aliceBookingId = a.bookingId
    const b = await insertCancelledBookedSlot(eventBId, bobId, 48, 'Annulé')
    bobBookingId = b.bookingId

    mockSend.mockResolvedValue(true)
  })

  afterAll(async () => {
    await query(`DELETE FROM bookings WHERE id IN ($1, $2)`, [aliceBookingId, bobBookingId])
    await query(`DELETE FROM slots WHERE event_id IN ($1, $2)`, [eventAId, eventBId])
    await query(`DELETE FROM events WHERE id IN ($1, $2)`, [eventAId, eventBId])
    await query(`DELETE FROM users WHERE id IN ($1, $2, $3)`, [adminId, aliceId, bobId])
  })

  // --- Lecture (GET) -------------------------------------------------------

  it('GET (global) → liste groupée des 2 événements en attente avec compteurs', async () => {
    const res = await request(testServer())
      .get('/api/admin/cancellation-notifications')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.body.data.pending).toBe(2)
    const events = res.body.data.events as Array<{ eventId: string; pendingCount: number; slots: any[] }>
    const ids = events.map((e) => e.eventId).sort()
    expect(ids).toEqual([eventAId, eventBId].sort())

    const eventA = events.find((e) => e.eventId === eventAId)!
    expect(eventA.pendingCount).toBe(1)
    expect(eventA.slots).toHaveLength(1)
    const recipient = eventA.slots[0].recipients[0]
    expect(recipient).toMatchObject({ bookingId: aliceBookingId })
    expect(recipient.email).toContain('cn-alice')
    expect(recipient.firstName).toBe('CN Alice')
    expect(eventA.slots[0].cancellationReason).toBe('Reporté <A>')
    expect(typeof eventA.slots[0].startTime).toBe('string')
  })

  it('GET ?eventId=A → uniquement les en-attente de A', async () => {
    const res = await request(testServer())
      .get(`/api/admin/cancellation-notifications?eventId=${eventAId}`)
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.body.data.pending).toBe(1)
    expect(res.body.data.events).toHaveLength(1)
    expect(res.body.data.events[0].eventId).toBe(eventAId)
  })

  it('GET ?eventId=<malformé> → 400 (validation UUID)', async () => {
    const res = await request(testServer())
      .get('/api/admin/cancellation-notifications?eventId=not-a-uuid')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(400)
  })

  it('GET sans token admin → 401/403 (route protégée)', async () => {
    const res = await request(testServer()).get('/api/admin/cancellation-notifications')
    expect([401, 403]).toContain(res.status)
  })

  // --- Renvoi (POST) — narratif séquentiel (état muté progressivement) ------

  it('POST resend { eventId: A } → renvoie A seul, marque A, laisse B en attente', async () => {
    mockSend.mockClear()
    const res = await request(testServer())
      .post('/api/admin/cancellation-notifications/resend')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ eventId: eventAId })

    expect(res.status).toBe(200)
    expect(res.body.data).toEqual({ sent: 1, failed: 0 })
    expect(mockSend).toHaveBeenCalledTimes(1)
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ userFirstName: 'CN Alice', cancellationReason: 'Reporté <A>' })
    )

    // A marqué, B intact.
    expect(await notifiedAt(aliceBookingId)).not.toBeNull()
    expect(await notifiedAt(bobBookingId)).toBeNull()

    // La lecture globale ne montre plus que B.
    const after = await request(testServer())
      .get('/api/admin/cancellation-notifications')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(after.body.data.pending).toBe(1)
    expect(after.body.data.events[0].eventId).toBe(eventBId)
  })

  it('POST resend {} (global) → renvoie le reste (B), plus rien en attente', async () => {
    mockSend.mockClear()
    const res = await request(testServer())
      .post('/api/admin/cancellation-notifications/resend')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})

    expect(res.status).toBe(200)
    expect(res.body.data).toEqual({ sent: 1, failed: 0 })
    expect(mockSend).toHaveBeenCalledTimes(1)
    expect(await notifiedAt(bobBookingId)).not.toBeNull()

    const after = await request(testServer())
      .get('/api/admin/cancellation-notifications')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(after.body.data.pending).toBe(0)
    expect(after.body.data.events).toEqual([])
  })

  it('POST resend {} de nouveau → idempotent : aucun envoi, { sent: 0, failed: 0 }', async () => {
    mockSend.mockClear()
    const res = await request(testServer())
      .post('/api/admin/cancellation-notifications/resend')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})

    expect(res.status).toBe(200)
    expect(res.body.data).toEqual({ sent: 0, failed: 0 })
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('POST resend { eventId: <malformé> } → 400 (validation UUID)', async () => {
    const res = await request(testServer())
      .post('/api/admin/cancellation-notifications/resend')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ eventId: 'not-a-uuid' })

    expect(res.status).toBe(400)
  })
})
