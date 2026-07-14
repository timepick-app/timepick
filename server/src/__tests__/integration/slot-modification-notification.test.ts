import request from 'supertest'
import jwt from 'jsonwebtoken'
import { testServer } from '../helpers/test-server'
import { query } from '../../db'
import * as emailService from '../../services/email-send.service'
import type { SlotDiff } from '../../utils/slot-diff'

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret'

// ---------------------------------------------------------------------------
// Helpers — miroir de slots.test.ts
// ---------------------------------------------------------------------------

function generateToken(userId: string, role = 'user'): string {
  return jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: '1h' })
}

async function createTestUser(
  email: string,
  role = 'user',
): Promise<{ id: string; token: string }> {
  const res = await query(
    `INSERT INTO users (email, first_name, role) VALUES ($1, $2, $3) RETURNING id`,
    [email, `Test ${email}`, role],
  )
  const userId = res.rows[0].id as string
  return { id: userId, token: generateToken(userId, role) }
}

async function createTestEvent(name: string): Promise<string> {
  const suffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`
  const res = await query(
    `INSERT INTO events (name, description, is_published) VALUES ($1, $2, false) RETURNING id`,
    [`${name}-${suffix}`, 'Test description'],
  )
  return res.rows[0].id as string
}

async function createTestSlot(
  eventId: string,
  startTime: Date,
  endTime: Date,
  capacity = 5,
): Promise<string> {
  const res = await query(
    `INSERT INTO slots (event_id, start_time, end_time, capacity)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [eventId, startTime, endTime, capacity],
  )
  return res.rows[0].id as string
}

/**
 * Insère N réservations pour les userIds donnés sur le créneau slotId.
 * Construit un multi-row INSERT pour éviter plusieurs allers-retours DB.
 */
async function createBookings(slotId: string, userIds: string[]): Promise<void> {
  if (userIds.length === 0) return
  const placeholders = userIds.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(', ')
  const values = userIds.flatMap((uid): [string, string] => [uid, slotId])
  await query(`INSERT INTO bookings (user_id, slot_id) VALUES ${placeholders}`, values)
}

// ---------------------------------------------------------------------------
// Dates de référence (futur garanti pour le slot createSlot schema, mais
// updateSlotSchema n'impose pas de date future — cohérence uniquement).
// ---------------------------------------------------------------------------

/** Créneau de base : 2026-09-01 08:00–10:00 UTC */
const BASE_START = new Date('2026-09-01T08:00:00.000Z')
const BASE_END   = new Date('2026-09-01T10:00:00.000Z')
/** Heure de début décalée d'1h pour provoquer un diff start_time. */
const LATER_START = new Date('2026-09-01T09:00:00.000Z')

// ---------------------------------------------------------------------------
// Type local — évite ReturnType<typeof fn> sur la spy
// ---------------------------------------------------------------------------

/** Signature de sendSlotModificationEmail copiée du module email.service. */
type SendModificationFn = (
  recipients: Array<{ email: string; firstName: string; lastName?: string | null }>,
  slot: { id: string; eventName: string; eventId: string },
  diff: SlotDiff,
) => Promise<{ notified: number; failed: number }>

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('PUT /api/admin/slots/:id — matrice notification modification (9 cas)', () => {
  let eventId: string
  let adminToken: string
  let memberIds: string[]
  let slotId: string
  let modifySpy: jest.MockedFunction<SendModificationFn>

  beforeAll(async () => {
    const admin = await createTestUser('slotmod-admin@local.dev', 'admin')
    adminToken = admin.token
    eventId = await createTestEvent('Slot Modification Notification')

    // 3 membres réutilisés pour les cas N=3 inscrits.
    const m1 = await createTestUser('slotmod-m1@local.dev')
    const m2 = await createTestUser('slotmod-m2@local.dev')
    const m3 = await createTestUser('slotmod-m3@local.dev')
    memberIds = [m1.id, m2.id, m3.id]
  })

  beforeEach(async () => {
    // Créneau frais — sans description ni bookings par défaut.
    slotId = await createTestSlot(eventId, BASE_START, BASE_END)
    // Spy par défaut : retourne notified=recipients.length pour que le
    // contrôleur remonte le bon compte sans appel SMTP réel.
    modifySpy = jest
      .spyOn(emailService, 'sendSlotModificationEmail')
      .mockImplementation((recipients) =>
        Promise.resolve({ notified: recipients.length, failed: 0 }),
      ) as jest.MockedFunction<SendModificationFn>
  })

  afterEach(async () => {
    modifySpy.mockRestore()
    // CASCADE supprime aussi les bookings liés au créneau.
    await query(`DELETE FROM slots WHERE id = $1`, [slotId])
  })

  afterAll(async () => {
    await query(`DELETE FROM events WHERE id = $1`, [eventId])
    await query(
      `DELETE FROM users WHERE email IN ($1, $2, $3, $4)`,
      [
        'slotmod-admin@local.dev',
        'slotmod-m1@local.dev',
        'slotmod-m2@local.dev',
        'slotmod-m3@local.dev',
      ],
    )
  })

  // ── C1 ──────────────────────────────────────────────────────────────────
  it('[C1] payload identique (start/end/capacity inchangés) — spy NON appelée, notified=0', async () => {
    await createBookings(slotId, memberIds)

    // Lire les valeurs stockées pour construire un payload strictement identique.
    const { rows } = await query(
      `SELECT start_time, end_time, capacity FROM slots WHERE id = $1`,
      [slotId],
    )
    const row = rows[0] as { start_time: Date; end_time: Date; capacity: number }

    const res = await request(testServer())
      .put(`/api/admin/slots/${slotId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        startTime: row.start_time.toISOString(),
        endTime: row.end_time.toISOString(),
        capacity: row.capacity,
      })

    expect(res.status).toBe(200)
    expect(res.body.notified).toBe(0)
    expect(modifySpy).not.toHaveBeenCalled()
  })

  // ── C2 ──────────────────────────────────────────────────────────────────
  it('[C2] start_time changé, notifyBookings=true, 3 inscrits — spy 1x, 3 recipients, notified=3', async () => {
    await createBookings(slotId, memberIds)

    const res = await request(testServer())
      .put(`/api/admin/slots/${slotId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ startTime: LATER_START.toISOString() })

    expect(res.status).toBe(200)
    expect(modifySpy).toHaveBeenCalledTimes(1)
    expect(modifySpy.mock.calls[0][0]).toHaveLength(3)
    expect(res.body.notified).toBe(3)
  })

  // ── C3 ──────────────────────────────────────────────────────────────────
  it('[C3] start_time changé, notifyBookings=false, 3 inscrits — spy NON appelée, notified=0', async () => {
    await createBookings(slotId, memberIds)

    const res = await request(testServer())
      .put(`/api/admin/slots/${slotId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ startTime: LATER_START.toISOString(), notifyBookings: false })

    expect(res.status).toBe(200)
    expect(res.body.notified).toBe(0)
    expect(modifySpy).not.toHaveBeenCalled()
  })

  // ── C4 ──────────────────────────────────────────────────────────────────
  it('[C4] description seule changée, notifyBookings=true, 3 inscrits — spy 1x, 3 recipients, notified=3', async () => {
    await createBookings(slotId, memberIds)

    const res = await request(testServer())
      .put(`/api/admin/slots/${slotId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ description: 'Nouvelle description' })

    expect(res.status).toBe(200)
    expect(modifySpy).toHaveBeenCalledTimes(1)
    expect(modifySpy.mock.calls[0][0]).toHaveLength(3)
    expect(res.body.notified).toBe(3)
  })

  // ── C5 ──────────────────────────────────────────────────────────────────
  it('[C5] description seule changée, notifyBookings=false, 3 inscrits — spy NON appelée', async () => {
    await createBookings(slotId, memberIds)

    const res = await request(testServer())
      .put(`/api/admin/slots/${slotId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ description: 'Nouvelle description', notifyBookings: false })

    expect(res.status).toBe(200)
    expect(res.body.notified).toBe(0)
    expect(modifySpy).not.toHaveBeenCalled()
  })

  // ── C6 ──────────────────────────────────────────────────────────────────
  it('[C6] capacity seule changée, notifyBookings=true, 3 inscrits — spy NON appelée (champ non surveillé)', async () => {
    await createBookings(slotId, memberIds)

    const res = await request(testServer())
      .put(`/api/admin/slots/${slotId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ capacity: 6 })

    expect(res.status).toBe(200)
    expect(res.body.notified).toBe(0)
    expect(modifySpy).not.toHaveBeenCalled()
  })

  // ── C7 ──────────────────────────────────────────────────────────────────
  it('[C7] start_time + description changés, notifyBookings=true, 3 inscrits — spy EXACTEMENT 1x (pas 2x), notified=3', async () => {
    await createBookings(slotId, memberIds)

    const res = await request(testServer())
      .put(`/api/admin/slots/${slotId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ startTime: LATER_START.toISOString(), description: 'Multi-champs modifiés' })

    expect(res.status).toBe(200)
    expect(modifySpy).toHaveBeenCalledTimes(1)
    expect(modifySpy.mock.calls[0][0]).toHaveLength(3)
    expect(res.body.notified).toBe(3)
  })

  // ── C8 ──────────────────────────────────────────────────────────────────
  it('[C8] start_time changé, notifyBookings=true, 0 inscrit — spy NON appelée, notified=0', async () => {
    // Pas de createBookings → currentBookings = 0 → court-circuit dispatch.
    const res = await request(testServer())
      .put(`/api/admin/slots/${slotId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ startTime: LATER_START.toISOString() })

    expect(res.status).toBe(200)
    expect(res.body.notified).toBe(0)
    expect(modifySpy).not.toHaveBeenCalled()
  })

  // ── C9 ──────────────────────────────────────────────────────────────────
  it('[C9] échec SMTP simulé, notifyBookings=true, 3 inscrits — status 200, notified=0, failed=3', async () => {
    await createBookings(slotId, memberIds)
    // Override : le service catch l'erreur → failed = currentBookings = 3.
    modifySpy.mockRejectedValue(new Error('SMTP connection refused'))

    const res = await request(testServer())
      .put(`/api/admin/slots/${slotId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ startTime: LATER_START.toISOString() })

    expect(res.status).toBe(200)
    expect(res.body.notified).toBe(0)
    expect(res.body.failed).toBe(3)

    // G3 — le créneau est bien persisté en DB malgré l'échec SMTP
    const { rows } = await query('SELECT start_time FROM slots WHERE id=$1', [slotId])
    expect(new Date(rows[0].start_time as string).toISOString()).toBe(LATER_START.toISOString())
  })
})
