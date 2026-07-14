import request from 'supertest'
import jwt from 'jsonwebtoken'
import { testServer } from '../helpers/test-server'
import { query } from '../../db'
import {
  startTestTransaction,
  rollbackTestTransaction,
} from '../helpers/transaction'

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret'

describe('POST /api/admin/events/bulk-delete', () => {
  let adminToken: string
  let adminUserId: string

  async function createTestAdmin() {
    const suffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`
    const result = await query(
      `INSERT INTO users (email, first_name, role)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [`test-events-bulk-${suffix}@example.com`, 'Admin Bulk', 'admin']
    )
    return result.rows[0] as { id: string }
  }

  function makeToken(userId: string): string {
    return jwt.sign({ userId, role: 'admin' }, JWT_SECRET, { expiresIn: '1h' })
  }

  beforeAll(async () => {
    const admin = await createTestAdmin()
    adminUserId = admin.id
    adminToken = makeToken(adminUserId)
  })

  beforeEach(async () => {
    await startTestTransaction()
  })

  afterEach(async () => {
    await rollbackTestTransaction()
  })

  // ---------------------------------------------------------------------------
  // Cas 1 : suppression de 3 evenements avec creneaux et reservations
  // ---------------------------------------------------------------------------
  it('supprime 3 evenements et retourne deleted=3 + deletedBookings corrects', async () => {
    const ev1 = await query(
      `INSERT INTO events (name) VALUES ($1) RETURNING id`,
      ['Bulk Test Event Alpha']
    )
    const ev2 = await query(
      `INSERT INTO events (name) VALUES ($1) RETURNING id`,
      ['Bulk Test Event Beta']
    )
    const ev3 = await query(
      `INSERT INTO events (name) VALUES ($1) RETURNING id`,
      ['Bulk Test Event Gamma']
    )
    const ids: string[] = [
      ev1.rows[0].id as string,
      ev2.rows[0].id as string,
      ev3.rows[0].id as string,
    ]

    // 1 creneau par evenement
    const sl1 = await query(
      `INSERT INTO slots (event_id, start_time, end_time, capacity)
       VALUES ($1, '2027-01-01 10:00+00', '2027-01-01 12:00+00', 5)
       RETURNING id`,
      [ids[0]]
    )
    const sl2 = await query(
      `INSERT INTO slots (event_id, start_time, end_time, capacity)
       VALUES ($1, '2027-01-01 10:00+00', '2027-01-01 12:00+00', 5)
       RETURNING id`,
      [ids[1]]
    )
    const sl3 = await query(
      `INSERT INTO slots (event_id, start_time, end_time, capacity)
       VALUES ($1, '2027-01-01 10:00+00', '2027-01-01 12:00+00', 5)
       RETURNING id`,
      [ids[2]]
    )

    // 1 reservation par creneau (meme user, creneaux differents — pas de conflit unique)
    await query(`INSERT INTO bookings (slot_id, user_id) VALUES ($1, $2)`, [sl1.rows[0].id, adminUserId])
    await query(`INSERT INTO bookings (slot_id, user_id) VALUES ($1, $2)`, [sl2.rows[0].id, adminUserId])
    await query(`INSERT INTO bookings (slot_id, user_id) VALUES ($1, $2)`, [sl3.rows[0].id, adminUserId])

    const res = await request(testServer())
      .post('/api/admin/events/bulk-delete')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ids })

    expect(res.status).toBe(200)
    expect(res.body.deleted).toBe(3)
    expect(res.body.deletedBookings).toBe(3)
    expect(res.body.notFound).toBe(0)

    // Les evenements ne doivent plus exister en base
    const check = await query('SELECT id FROM events WHERE id = ANY($1)', [ids])
    expect(check.rows).toHaveLength(0)
  })

  // ---------------------------------------------------------------------------
  // Cas 2 : IDs inexistants -> comptes dans notFound, pas d'erreur
  // ---------------------------------------------------------------------------
  it('retourne notFound pour les ids inexistants sans lever d\'erreur', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000099'

    const res = await request(testServer())
      .post('/api/admin/events/bulk-delete')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ids: [fakeId] })

    expect(res.status).toBe(200)
    expect(res.body.deleted).toBe(0)
    expect(res.body.notFound).toBe(1)
    expect(res.body.deletedBookings).toBe(0)
  })

  // ---------------------------------------------------------------------------
  // Cas 2b : mix d'IDs existants et inexistants
  // ---------------------------------------------------------------------------
  it('compte correctement deleted et notFound pour un mix d\'IDs', async () => {
    const ev = await query(
      `INSERT INTO events (name) VALUES ($1) RETURNING id`,
      ['Bulk Test Event Mix']
    )
    const realId = ev.rows[0].id as string
    const fakeId = '00000000-0000-0000-0000-000000000042'

    const res = await request(testServer())
      .post('/api/admin/events/bulk-delete')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ids: [realId, fakeId] })

    expect(res.status).toBe(200)
    expect(res.body.deleted).toBe(1)
    expect(res.body.notFound).toBe(1)
    expect(res.body.deletedBookings).toBe(0)
  })

  // ---------------------------------------------------------------------------
  // Cas 3 : body invalide -> 400
  // ---------------------------------------------------------------------------
  it('retourne 400 si le body est vide', async () => {
    const res = await request(testServer())
      .post('/api/admin/events/bulk-delete')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})

    expect(res.status).toBe(400)
  })

  it('retourne 400 si ids est un tableau vide', async () => {
    const res = await request(testServer())
      .post('/api/admin/events/bulk-delete')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ids: [] })

    expect(res.status).toBe(400)
  })

  it('retourne 400 si ids n\'est pas un tableau', async () => {
    const res = await request(testServer())
      .post('/api/admin/events/bulk-delete')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ids: 'pas-un-tableau' })

    expect(res.status).toBe(400)
  })

  it('retourne 400 si ids contient un id non-UUID', async () => {
    const res = await request(testServer())
      .post('/api/admin/events/bulk-delete')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ids: ['pas-un-uuid'] })

    expect(res.status).toBe(400)
  })

  // ---------------------------------------------------------------------------
  // Cas 4 : plus de 100 ids -> 400
  // ---------------------------------------------------------------------------
  it('retourne 400 si ids contient plus de 100 elements', async () => {
    const ids = Array.from({ length: 101 }, (_, i) => {
      const n = String(i + 1).padStart(12, '0')
      return `00000000-0000-0000-0000-${n}`
    })

    const res = await request(testServer())
      .post('/api/admin/events/bulk-delete')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ids })

    expect(res.status).toBe(400)
  })

  // ---------------------------------------------------------------------------
  // Cas 5 : sans authentification -> 401
  // ---------------------------------------------------------------------------
  it('retourne 401 sans token d\'authentification', async () => {
    const res = await request(testServer())
      .post('/api/admin/events/bulk-delete')
      .send({ ids: ['00000000-0000-0000-0000-000000000001'] })

    expect(res.status).toBe(401)
  })
})
