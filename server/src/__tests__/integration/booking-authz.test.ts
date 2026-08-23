import request from 'supertest'
import jwt from 'jsonwebtoken'
import { testServer } from '../helpers/test-server'
import pool from '../../db/pool'
import * as emailService from '../../services/email-send.service'

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret'

// Mocke les emails transactionnels : POST /api/public/reservations passe par
// reservation.service, qui émet sendReservationEmail en fire-and-forget. Sans
// mock, ces envois atteindraient le vrai Mailpit dev par intermittence.
beforeAll(() => {
  jest.spyOn(emailService, 'sendReservationEmail').mockResolvedValue(true)
  jest.spyOn(emailService, 'sendUnregistrationEmail').mockResolvedValue(true)
})

afterAll(() => {
  jest.restoreAllMocks()
})

/**
 * Tests de régression post-remédiation pour :
 * - F-021 : booking sur événement dépublié + absence de check `event_users`
 * - F-020 : contournement de `opens_at` (booking avant l'ouverture)
 * - F-002 : catch-all `GET /api/slots/?eventId=` sans vérif publication/membership
 *
 * Couvre les DEUX chemins d'écriture (`POST /api/slots/book`,
 * `POST /api/public/reservations`) — ils partagent la même règle
 * d'autorisation (cf. hunts/validation/V1.verdicts.md F-020/F-021).
 */
describe('Booking authorization regressions (F-002, F-020, F-021)', () => {
  let adminToken: string
  let memberToken: string
  let memberUserId: string
  let outsiderToken: string

  let draftEventId: string
  let draftSlotId: string

  let notOpenEventId: string
  let notOpenSlotId: string

  let publishedOpenEventId: string
  let publishedOpenSlotId: string

  beforeAll(async () => {
    const admin = await pool.query(`
      INSERT INTO users (email, first_name, role)
      VALUES ('booking-authz-admin@test.com', 'Booking Authz Admin', 'admin')
      ON CONFLICT (email) DO UPDATE SET role = 'admin'
      RETURNING id
    `)
    adminToken = jwt.sign({ userId: admin.rows[0].id, role: 'admin' }, JWT_SECRET, { expiresIn: '1h' })

    const member = await pool.query(`
      INSERT INTO users (email, first_name, role)
      VALUES ('booking-authz-member@test.com', 'Booking Authz Member', 'user')
      ON CONFLICT (email) DO UPDATE SET role = 'user'
      RETURNING id
    `)
    memberUserId = member.rows[0].id
    memberToken = jwt.sign({ userId: memberUserId, role: 'user' }, JWT_SECRET, { expiresIn: '1h' })

    const outsider = await pool.query(`
      INSERT INTO users (email, first_name, role)
      VALUES ('booking-authz-outsider@test.com', 'Booking Authz Outsider', 'user')
      ON CONFLICT (email) DO UPDATE SET role = 'user'
      RETURNING id
    `)
    outsiderToken = jwt.sign({ userId: outsider.rows[0].id, role: 'user' }, JWT_SECRET, { expiresIn: '1h' })

    // F-021 (volet dépublication) : membre légitime (event_users), event dépublié.
    const draftEvent = await pool.query(`
      INSERT INTO events (name, description, is_published)
      VALUES ('Booking Authz Draft Event', 'draft', false)
      RETURNING id
    `)
    draftEventId = draftEvent.rows[0].id
    await pool.query(`INSERT INTO event_users (event_id, user_id) VALUES ($1, $2)`, [draftEventId, memberUserId])
    const draftSlot = await pool.query(`
      INSERT INTO slots (event_id, start_time, end_time, capacity)
      VALUES ($1, NOW() + INTERVAL '1 day', NOW() + INTERVAL '1 day 1 hour', 5)
      RETURNING id
    `, [draftEventId])
    draftSlotId = draftSlot.rows[0].id

    // F-020 : membre légitime, event publié mais opens_at dans le futur.
    const notOpenEvent = await pool.query(`
      INSERT INTO events (name, description, is_published, opens_at)
      VALUES ('Booking Authz Not Open Event', 'not open yet', true, NOW() + INTERVAL '8 days')
      RETURNING id
    `)
    notOpenEventId = notOpenEvent.rows[0].id
    await pool.query(`INSERT INTO event_users (event_id, user_id) VALUES ($1, $2)`, [notOpenEventId, memberUserId])
    const notOpenSlot = await pool.query(`
      INSERT INTO slots (event_id, start_time, end_time, capacity)
      VALUES ($1, NOW() + INTERVAL '9 days', NOW() + INTERVAL '9 days 1 hour', 5)
      RETURNING id
    `, [notOpenEventId])
    notOpenSlotId = notOpenSlot.rows[0].id

    // F-021 (volet membership) + happy path : event publié et ouvert.
    // memberUserId est rattaché (event_users), outsiderToken JAMAIS.
    const publishedOpenEvent = await pool.query(`
      INSERT INTO events (name, description, is_published, opens_at)
      VALUES ('Booking Authz Published Open Event', 'open', true, NULL)
      RETURNING id
    `)
    publishedOpenEventId = publishedOpenEvent.rows[0].id
    await pool.query(`INSERT INTO event_users (event_id, user_id) VALUES ($1, $2)`, [publishedOpenEventId, memberUserId])
    const publishedOpenSlot = await pool.query(`
      INSERT INTO slots (event_id, start_time, end_time, capacity)
      VALUES ($1, NOW() + INTERVAL '1 day', NOW() + INTERVAL '1 day 1 hour', 5)
      RETURNING id
    `, [publishedOpenEventId])
    publishedOpenSlotId = publishedOpenSlot.rows[0].id
  })

  afterAll(async () => {
    await pool.query("DELETE FROM users WHERE email LIKE 'booking-authz-%@test.com'")
    await pool.query('DELETE FROM slots WHERE event_id IN ($1, $2, $3)', [draftEventId, notOpenEventId, publishedOpenEventId])
    await pool.query('DELETE FROM events WHERE id IN ($1, $2, $3)', [draftEventId, notOpenEventId, publishedOpenEventId])
  })

  afterEach(async () => {
    await pool.query('DELETE FROM bookings WHERE slot_id IN ($1, $2, $3)', [draftSlotId, notOpenSlotId, publishedOpenSlotId])
  })

  describe('F-021 — booking sur événement dépublié', () => {
    it('POST /api/slots/book refuse un membre légitime si l\'événement est dépublié (403), rien en DB', async () => {
      const res = await request(testServer())
        .post('/api/slots/book')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ slotId: draftSlotId })

      expect(res.status).toBe(403)
      expect(res.body.code).toBe('EVENT_NOT_PUBLISHED')

      const bookings = await pool.query('SELECT COUNT(*) FROM bookings WHERE slot_id = $1', [draftSlotId])
      expect(parseInt(bookings.rows[0].count)).toBe(0)
    })

    it('POST /api/public/reservations refuse un membre légitime si l\'événement est dépublié (403), rien en DB', async () => {
      const res = await request(testServer())
        .post('/api/public/reservations')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ slotId: draftSlotId })

      expect(res.status).toBe(403)
      expect(res.body.code).toBe('EVENT_NOT_PUBLISHED')

      const bookings = await pool.query('SELECT COUNT(*) FROM bookings WHERE slot_id = $1', [draftSlotId])
      expect(parseInt(bookings.rows[0].count)).toBe(0)
    })
  })

  describe('F-020 — booking avant opens_at', () => {
    it('POST /api/slots/book refuse avant l\'heure d\'ouverture (403), rien en DB', async () => {
      const res = await request(testServer())
        .post('/api/slots/book')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ slotId: notOpenSlotId })

      expect(res.status).toBe(403)
      expect(res.body.code).toBe('BOOKING_NOT_OPEN')

      const bookings = await pool.query('SELECT COUNT(*) FROM bookings WHERE slot_id = $1', [notOpenSlotId])
      expect(parseInt(bookings.rows[0].count)).toBe(0)
    })

    it('POST /api/public/reservations refuse avant l\'heure d\'ouverture (403), rien en DB', async () => {
      const res = await request(testServer())
        .post('/api/public/reservations')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ slotId: notOpenSlotId })

      expect(res.status).toBe(403)
      expect(res.body.code).toBe('BOOKING_NOT_OPEN')

      const bookings = await pool.query('SELECT COUNT(*) FROM bookings WHERE slot_id = $1', [notOpenSlotId])
      expect(parseInt(bookings.rows[0].count)).toBe(0)
    })
  })

  describe('F-021 — booking par un non-membre (événement publié et ouvert)', () => {
    it('POST /api/slots/book refuse un non-membre (403 EVENT_ACCESS_DENIED), rien en DB', async () => {
      const res = await request(testServer())
        .post('/api/slots/book')
        .set('Authorization', `Bearer ${outsiderToken}`)
        .send({ slotId: publishedOpenSlotId })

      expect(res.status).toBe(403)
      expect(res.body.code).toBe('EVENT_ACCESS_DENIED')

      const bookings = await pool.query('SELECT COUNT(*) FROM bookings WHERE slot_id = $1', [publishedOpenSlotId])
      expect(parseInt(bookings.rows[0].count)).toBe(0)
    })

    it('POST /api/public/reservations refuse un non-membre (403 EVENT_ACCESS_DENIED), rien en DB', async () => {
      const res = await request(testServer())
        .post('/api/public/reservations')
        .set('Authorization', `Bearer ${outsiderToken}`)
        .send({ slotId: publishedOpenSlotId })

      expect(res.status).toBe(403)
      expect(res.body.code).toBe('EVENT_ACCESS_DENIED')

      const bookings = await pool.query('SELECT COUNT(*) FROM bookings WHERE slot_id = $1', [publishedOpenSlotId])
      expect(parseInt(bookings.rows[0].count)).toBe(0)
    })

    it('un admin bypass event_users et peut réserver sans être membre', async () => {
      const res = await request(testServer())
        .post('/api/slots/book')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ slotId: publishedOpenSlotId })

      expect(res.status).toBe(200)
    })
  })

  describe('Happy path — booking normal (publié + ouvert + membre)', () => {
    it('POST /api/slots/book réussit pour un membre légitime', async () => {
      const res = await request(testServer())
        .post('/api/slots/book')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ slotId: publishedOpenSlotId })

      expect(res.status).toBe(200)
      expect(res.body.message).toBe('Booking successful')
    })

    it('POST /api/public/reservations réussit pour un membre légitime', async () => {
      const res = await request(testServer())
        .post('/api/public/reservations')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ slotId: publishedOpenSlotId })

      expect(res.status).toBe(201)
    })
  })

  describe('F-002 — GET /api/slots/?eventId= catch-all', () => {
    it('refuse un non-membre sur un événement draft (403 EVENT_ACCESS_DENIED)', async () => {
      const res = await request(testServer())
        .get(`/api/slots?eventId=${draftEventId}`)
        .set('Authorization', `Bearer ${outsiderToken}`)

      expect(res.status).toBe(403)
      expect(res.body.code).toBe('EVENT_ACCESS_DENIED')
    })

    it('autorise un membre sur un événement draft (200)', async () => {
      const res = await request(testServer())
        .get(`/api/slots?eventId=${draftEventId}`)
        .set('Authorization', `Bearer ${memberToken}`)

      expect(res.status).toBe(200)
    })

    it('retourne 404 pour un eventId inexistant', async () => {
      const res = await request(testServer())
        .get('/api/slots?eventId=00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${memberToken}`)

      expect(res.status).toBe(404)
      expect(res.body.code).toBe('EVENT_NOT_FOUND')
    })

    it('retourne 404 (pas 500) pour un eventId au format non-UUID', async () => {
      const res = await request(testServer())
        .get('/api/slots?eventId=not-a-uuid')
        .set('Authorization', `Bearer ${memberToken}`)

      expect(res.status).toBe(404)
      expect(res.body.code).toBe('EVENT_NOT_FOUND')
    })

    it('un admin accède sans être membre', async () => {
      const res = await request(testServer())
        .get(`/api/slots?eventId=${draftEventId}`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
    })
  })
})
