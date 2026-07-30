import request from 'supertest'
import jwt from 'jsonwebtoken'
import { testServer } from '../helpers/test-server'
import pool from '../../db/pool'

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret'

/**
 * Integration Tests for Booking Flow
 * Testing CRITICAL zero-surbooking race condition protection with SELECT FOR UPDATE
 *
 * "ALL reservation operations MUST use SELECT FOR UPDATE"
 * This is CRITICAL - without it, concurrent bookings can exceed capacity.
 */

describe('Booking Integration - Zero-Surbooking Protection', () => {
  let adminUserId: string
  let adminToken: string
  let testUserId: string
  let testUserToken: string
  let testUserId2: string
  let testUserToken2: string
  let testEventId: string
  let testSlotId: string

  beforeAll(async () => {
    // Create admin user
    const adminResult = await pool.query(`
      INSERT INTO users (email, first_name, role)
      VALUES ('booking-admin@test.com', 'Booking Admin', 'admin')
      ON CONFLICT (email) DO UPDATE SET role = 'admin'
      RETURNING id
    `)
    adminUserId = adminResult.rows[0].id
    adminToken = jwt.sign({ userId: adminUserId, role: 'admin' }, JWT_SECRET, { expiresIn: '1h' })

    // Create test user 1
    const userResult = await pool.query(`
      INSERT INTO users (email, first_name, role)
      VALUES ('booking-user@test.com', 'Booking User', 'user')
      ON CONFLICT (email) DO UPDATE SET role = 'user'
      RETURNING id
    `)
    testUserId = userResult.rows[0].id
    testUserToken = jwt.sign({ userId: testUserId, role: 'user' }, JWT_SECRET, { expiresIn: '1h' })

    // Create test user 2 (for multi-user booking tests)
    const userResult2 = await pool.query(`
      INSERT INTO users (email, first_name, role)
      VALUES ('booking-user2@test.com', 'Booking User 2', 'user')
      ON CONFLICT (email) DO UPDATE SET role = 'user'
      RETURNING id
    `)
    testUserId2 = userResult2.rows[0].id
    testUserToken2 = jwt.sign({ userId: testUserId2, role: 'user' }, JWT_SECRET, { expiresIn: '1h' })

    // Create a test event first (required for slots FK)
    const eventResult = await pool.query(`
      INSERT INTO events (name, description, is_published)
      VALUES ('Booking Test Event', 'Event for booking integration tests', true)
      ON CONFLICT (name) DO UPDATE SET is_published = true
      RETURNING id
    `)
    testEventId = eventResult.rows[0].id

    // Create a test slot with capacity 2, linked to the event
    const slotResult = await pool.query(`
      INSERT INTO slots (event_id, start_time, end_time, capacity)
      VALUES ($1, NOW() + INTERVAL '1 day', NOW() + INTERVAL '1 day 2 hours', 2)
      RETURNING id
    `, [testEventId])
    testSlotId = slotResult.rows[0].id
  })

  afterAll(async () => {
    // Clean up test data
    await pool.query("DELETE FROM users WHERE email LIKE 'booking-%@test.com'")
    await pool.query("DELETE FROM slots WHERE event_id = $1", [testEventId])
    await pool.query("DELETE FROM events WHERE name = 'Booking Test Event'")
    // Note: ne pas fermer pool.end() ici car cela affecterait les autres tests
  })

  afterEach(async () => {
    // Clean up bookings after each test
    await pool.query("DELETE FROM bookings WHERE slot_id = $1", [testSlotId])
  })

  describe('[P0] POST /api/slots/book - Zero-Surbooking Race Condition Protection', () => {
    it('[P0] should prevent overbooking when capacity is reached', async () => {
      // GIVEN: A slot with capacity 2
      // AND 2 bookings already exist (at capacity)

      // First booking with user 1
      const res1 = await request(testServer())
        .post('/api/slots/book')
        .set('Authorization', `Bearer ${testUserToken}`)
        .send({ slotId: testSlotId })

      expect(res1.status).toBe(200)
      expect(res1.body.message).toBe('Booking successful')

      // Second booking with user 2 (fills capacity)
      const res2 = await request(testServer())
        .post('/api/slots/book')
        .set('Authorization', `Bearer ${testUserToken2}`)
        .send({ slotId: testSlotId })

      expect(res2.status).toBe(200)
      expect(res2.body.message).toBe('Booking successful')

      // Verify capacity is reached
      const checkRes = await request(testServer())
        .get(`/api/slots?eventId=${testEventId}`)
        .set('Authorization', `Bearer ${testUserToken}`)

      const slot = checkRes.body.find((s: { id: string }) => s.id === testSlotId)
      expect(slot).toBeDefined()
      expect(slot.currentBookings).toBe(2)

      // WHEN: Third booking attempt (over capacity)
      const res3 = await request(testServer())
        .post('/api/slots/book')
        .set('Authorization', `Bearer ${testUserToken}`)
        .send({ slotId: testSlotId })

      // THEN: Booking rejected with 409
      expect(res3.status).toBe(409)
      expect(res3.body.error).toMatch(/pris|complet/)
    })

    it('[P0] should handle concurrent booking attempts correctly (race condition test)', async () => {
      // NOTE: This test uses Promise.all to simulate concurrent requests.
      // While this doesn't guarantee exact simultaneous arrival at the server,
      // it provides reasonable assurance that the SELECT FOR UPDATE locking works correctly.
      // For true load testing, use tools like artillery or k6.
      // GIVEN: A slot with capacity 3
      // Create a new slot with higher capacity (need event_id)
      const slotResult = await pool.query(`
        INSERT INTO slots (event_id, start_time, end_time, capacity)
        VALUES ((SELECT id FROM events WHERE name = 'Booking Test Event' LIMIT 1),
                NOW() + INTERVAL '2 days', NOW() + INTERVAL '2 days 2 hours', 3)
        RETURNING id
      `)
      const highCapacitySlotId = slotResult.rows[0].id

      // Create 3 additional users for concurrent test
      const users = await Promise.all([
        pool.query(`INSERT INTO users (email, first_name, role) VALUES ('concurrent1@test.com', 'User 1', 'user') ON CONFLICT (email) DO UPDATE SET role = 'user' RETURNING id`),
        pool.query(`INSERT INTO users (email, first_name, role) VALUES ('concurrent2@test.com', 'User 2', 'user') ON CONFLICT (email) DO UPDATE SET role = 'user' RETURNING id`),
        pool.query(`INSERT INTO users (email, first_name, role) VALUES ('concurrent3@test.com', 'User 3', 'user') ON CONFLICT (email) DO UPDATE SET role = 'user' RETURNING id`),
      ])

      const userTokens = users.map(u => jwt.sign({ userId: u.rows[0].id, role: 'user' }, JWT_SECRET, { expiresIn: '1h' }))

      // WHEN: 5 concurrent booking requests arrive simultaneously
      const bookingPromises = [
        ...userTokens.map(token =>
          request(testServer())
            .post('/api/slots/book')
            .set('Authorization', `Bearer ${token}`)
            .send({ slotId: highCapacitySlotId })
        ),
        // Add 2 more requests with existing users (should be rejected due to capacity)
        request(testServer()).post('/api/slots/book').set('Authorization', `Bearer ${testUserToken}`).send({ slotId: highCapacitySlotId }),
        request(testServer()).post('/api/slots/book').set('Authorization', `Bearer ${testUserToken2}`).send({ slotId: highCapacitySlotId }),
      ]

      const results = await Promise.all(bookingPromises)

      // THEN: Exactly 3 bookings succeed (capacity), 2 fail
      const successfulBookings = results.filter(r => r.status === 200)
      const failedBookings = results.filter(r => r.status === 409)

      expect(successfulBookings).toHaveLength(3)
      expect(failedBookings).toHaveLength(2)

      // Verify database state is consistent (no overbooking)
      const bookingCount = await pool.query('SELECT COUNT(*) FROM bookings WHERE slot_id = $1', [highCapacitySlotId])
      expect(parseInt(bookingCount.rows[0].count)).toBe(3)

      // Clean up
      await pool.query("DELETE FROM users WHERE email LIKE 'concurrent%@test.com'")
      await pool.query("DELETE FROM slots WHERE id = $1", [highCapacitySlotId])
    })

    it('[P0] should use transaction and ROLLBACK on error', async () => {
      // GIVEN: A slot at capacity
      await pool.query("INSERT INTO bookings (user_id, slot_id) VALUES ($1, $2)", [testUserId, testSlotId])
      await pool.query("INSERT INTO bookings (user_id, slot_id) VALUES ($1, $2)", [testUserId2, testSlotId])

      // WHEN: Booking attempt at capacity
      const res = await request(testServer())
        .post('/api/slots/book')
        .set('Authorization', `Bearer ${testUserToken}`)
        .send({ slotId: testSlotId })

      // THEN: Returns 409 and transaction rolled back
      expect(res.status).toBe(409)

      // Verify no partial state in database
      const bookings = await pool.query("SELECT COUNT(*) FROM bookings WHERE slot_id = $1", [testSlotId])
      expect(parseInt(bookings.rows[0].count)).toBe(2) // Still 2, not 3
    })

    it('[P1] should prevent double booking by same user', async () => {
      // GIVEN: User has already booked this slot
      await pool.query("INSERT INTO bookings (user_id, slot_id) VALUES ($1, $2)", [testUserId, testSlotId])

      // WHEN: User attempts to book again
      const res = await request(testServer())
        .post('/api/slots/book')
        .set('Authorization', `Bearer ${testUserToken}`)
        .send({ slotId: testSlotId })

      // THEN: Booking rejected
      expect(res.status).toBe(400)
      expect(res.body.error).toContain('already booked')
    })

    it('[P1] should return 404 for non-existent slot', async () => {
      // WHEN: Booking non-existent slot
      const res = await request(testServer())
        .post('/api/slots/book')
        .set('Authorization', `Bearer ${testUserToken}`)
        .send({ slotId: '00000000-0000-0000-0000-000000000000' })

      // THEN: Returns 404
      expect(res.status).toBe(404)
      expect(res.body.error).toContain('not found')
    })

    it('[P1] should require authentication', async () => {
      // WHEN: Booking without auth token
      const res = await request(testServer())
        .post('/api/slots/book')
        .send({ slotId: testSlotId })

      // THEN: Returns 401
      expect(res.status).toBe(401)
    })

    it('[P1] should validate request body', async () => {
      // WHEN: Booking with missing slotId
      const res = await request(testServer())
        .post('/api/slots/book')
        .set('Authorization', `Bearer ${testUserToken}`)
        .send({})

      // THEN: Returns 400
      expect(res.status).toBe(400)
      expect(res.body.error).toContain('Missing')
    })
  })

  describe('[P1] DELETE /api/slots/book/:slotId - Cancel Booking', () => {
    it('[P1] should cancel user booking successfully', async () => {
      // GIVEN: User has a booking
      await pool.query("INSERT INTO bookings (user_id, slot_id) VALUES ($1, $2)", [testUserId, testSlotId])

      // WHEN: Cancelling booking
      const res = await request(testServer())
        .delete(`/api/slots/book/${testSlotId}`)
        .set('Authorization', `Bearer ${testUserToken}`)

      // THEN: Booking cancelled
      expect(res.status).toBe(200)
      expect(res.body.message).toBe('Booking cancelled')

      // Verify booking removed
      const booking = await pool.query(
        "SELECT * FROM bookings WHERE slot_id = $1 AND user_id = $2",
        [testSlotId, testUserId]
      )
      expect(booking.rows.length).toBe(0)
    })

    it('[P1] should allow rebooking after cancellation', async () => {
      // GIVEN: User booked, then cancelled
      await pool.query("INSERT INTO bookings (user_id, slot_id) VALUES ($1, $2)", [testUserId, testSlotId])
      await request(testServer())
        .delete(`/api/slots/book/${testSlotId}`)
        .set('Authorization', `Bearer ${testUserToken}`)

      // WHEN: Booking again after cancellation
      const res = await request(testServer())
        .post('/api/slots/book')
        .set('Authorization', `Bearer ${testUserToken}`)
        .send({ slotId: testSlotId })

      // THEN: Booking succeeds
      expect(res.status).toBe(200)
      expect(res.body.message).toBe('Booking successful')
    })

    it('[P2] should handle cancellation of non-existent booking gracefully', async () => {
      // WHEN: Cancelling booking that doesn't exist
      const res = await request(testServer())
        .delete(`/api/slots/book/${testSlotId}`)
        .set('Authorization', `Bearer ${testUserToken}`)

      // THEN: Still succeeds (idempotent) or returns error
      // Current implementation returns 200 even if no booking exists
      expect(res.status).toBe(200) // or could be 404 depending on implementation
    })

    it('[P1] should require authentication', async () => {
      // WHEN: Cancelling without auth
      const res = await request(testServer())
        .delete(`/api/slots/book/${testSlotId}`)

      // THEN: Returns 401 (auth checked before params)
      expect(res.status).toBe(401)
    })
  })

  describe('[P2] GET /api/slots - Fetch Slots with Booking Info', () => {
    it('[P2] should return slots with current booking count', async () => {
      // GIVEN: Slot exists with a booking
      await pool.query("INSERT INTO bookings (user_id, slot_id) VALUES ($1, $2)", [testUserId, testSlotId])

      // WHEN: Fetching slots
      const res = await request(testServer())
        .get(`/api/slots?eventId=${testEventId}`)
        .set('Authorization', `Bearer ${testUserToken}`)

      // THEN: Returns slot with currentBookings
      expect(res.status).toBe(200)
      const slot = res.body.find((s: { id: string }) => s.id === testSlotId)
      expect(slot).toBeDefined()
      expect(slot.currentBookings).toBe(1)
    })

    it('[P2] should return volunteers list for each slot', async () => {
      // GIVEN: Slot has a booking
      await pool.query("INSERT INTO bookings (user_id, slot_id) VALUES ($1, $2)", [testUserId, testSlotId])

      // WHEN: Fetching slots
      const res = await request(testServer())
        .get(`/api/slots?eventId=${testEventId}`)
        .set('Authorization', `Bearer ${testUserToken}`)

      // THEN: Returns volunteers array
      const slot = res.body.find((s: { id: string }) => s.id === testSlotId)
      expect(slot).toBeDefined()
      expect(slot.volunteers).toBeDefined()
      expect(slot.volunteers.length).toBeGreaterThan(0)
      expect(slot.volunteers[0].id).toBe(testUserId)
    })
  })
})
