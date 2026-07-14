/**
 * POC - Test Transaction Isolation v2
 *
 * Proof of concept for transaction-based test isolation.
 * This demonstrates the approach that would be used in Story 2-14.
 *
 * KEY FINDING: For full transaction isolation, production code would need
 * to use a centralized query() function instead of pool.query() directly.
 * The POC shows the working approach using testQuery().
 */

import request from 'supertest'
import jwt from 'jsonwebtoken'
import { testServer } from '../helpers/test-server'
import {
  initializeTestTransactions,
  startTestTransaction,
  rollbackTestTransaction,
  cleanupTestTransactions,
  testQuery,
  isInTransaction
} from '../helpers/transaction'

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret'

describe('POC - Transaction Rollback Isolation v2', () => {
  let adminToken: string

  beforeAll(async () => {
    await initializeTestTransactions()
    // Create admin once (outside transaction)
    const { query: regularQuery } = require('../../db')
    const result = await regularQuery(`
      INSERT INTO users (email, first_name, role)
      VALUES ($1, $2, 'admin')
      ON CONFLICT (email) DO UPDATE SET role = 'admin'
      RETURNING id
    `, ['poc-transaction-admin@test.com', 'POC Admin'])
    adminToken = jwt.sign({ userId: result.rows[0].id, role: 'admin' }, JWT_SECRET, { expiresIn: '1h' })
  })

  afterAll(async () => {
    // Clean up admin
    const { query: regularQuery } = require('../../db')
    await regularQuery("DELETE FROM users WHERE email = 'poc-transaction-admin@test.com'")
    await cleanupTestTransactions()
  })

  beforeEach(async () => {
    await startTestTransaction()
  })

  afterEach(async () => {
    await rollbackTestTransaction()
  })

  it('POC 1: create event with FIXED name using testQuery', async () => {
    expect(isInTransaction()).toBe(true)

    const result = await testQuery(`
      INSERT INTO events (name, description, is_published)
      VALUES ($1, $2, true)
      RETURNING id
    `, ['POC Test Event', 'Proof of concept v2'])

    expect(result.rows.length).toBe(1)
    const eventId = result.rows[0].id
    expect(eventId).toBeDefined()

    // Verify we can read it back within the same transaction
    const read = await testQuery('SELECT * FROM events WHERE id = $1', [eventId])
    expect(read.rows.length).toBe(1)
  })

  it('POC 2: create ANOTHER event with SAME fixed name (no conflict)', async () => {
    // This test creates an event with the SAME name as POC 1
    // With transaction rollback, POC 1's data is gone, so this succeeds
    const result = await testQuery(`
      INSERT INTO events (name, description, is_published)
      VALUES ($1, $2, true)
      RETURNING id
    `, ['POC Test Event', 'Proof of concept - second test'])

    expect(result.rows.length).toBe(1)
    const eventId = result.rows[0].id
    expect(eventId).toBeDefined()

    // Verify within this transaction
    const read = await testQuery('SELECT * FROM events WHERE id = $1', [eventId])
    expect(read.rows.length).toBe(1)
  })

  it('POC 3: verify NO data leaked from previous tests', async () => {
    // The BEFORE hook rolled back previous test's transaction
    // So POC Test Event should NOT exist in this transaction
    const result = await testQuery("SELECT * FROM events WHERE name = $1", ['POC Test Event'])

    // Should be 0 because previous transactions were rolled back
    expect(result.rows.length).toBe(0)

    // Additional check with error message if test fails
    if (result.rows.length !== 0) {
      throw new Error(`Expected 0 events named 'POC Test Event', but found ${result.rows.length}. Transaction rollback may not be working correctly.`)
    }
  })

  it('POC 4: full flow - user, event, slot, booking with testQuery', async () => {
    // Create a user
    const userResult = await testQuery(`
      INSERT INTO users (email, first_name, role)
      VALUES ($1, $2, 'user')
      RETURNING id
    `, ['poc-user@test.com', 'POC User'])

    const userId = userResult.rows[0].id

    // Create an event
    const eventResult = await testQuery(`
      INSERT INTO events (name, description, is_published)
      VALUES ($1, $2, true)
      RETURNING id
    `, ['POC Complex Event', 'Complex flow test'])

    const eventId = eventResult.rows[0].id

    // Create a slot
    const slotResult = await testQuery(`
      INSERT INTO slots (event_id, start_time, end_time, capacity)
      VALUES ($1, NOW() + INTERVAL '1 day', NOW() + INTERVAL '2 days', 5)
      RETURNING id
    `, [eventId])

    const slotId = slotResult.rows[0].id

    // Create a booking
    await testQuery(`
      INSERT INTO bookings (user_id, slot_id)
      VALUES ($1, $2)
    `, [userId, slotId])

    // Verify everything was created within this transaction
    const booking = await testQuery('SELECT * FROM bookings WHERE slot_id = $1', [slotId])
    expect(booking.rows.length).toBe(1)
  })

  it('POC 5: verify ALL data from POC 4 was rolled back', async () => {
    // All data created in POC 4 should be gone
    const events = await testQuery("SELECT * FROM events WHERE name = 'POC Complex Event'")
    const users = await testQuery("SELECT * FROM users WHERE email = 'poc-user@test.com'")
    const slots = await testQuery(`
      SELECT * FROM slots WHERE event_id IN (SELECT id FROM events WHERE name = 'POC Complex Event')
    `)
    const bookings = await testQuery(`
      SELECT * FROM bookings WHERE slot_id IN (SELECT id FROM slots WHERE event_id IN (SELECT id FROM events WHERE name = 'POC Complex Event'))
    `)

    expect(events.rows.length).toBe(0)
    expect(users.rows.length).toBe(0)
    expect(slots.rows.length).toBe(0)
    expect(bookings.rows.length).toBe(0)
  })

  it('POC 6: API call within transaction (LIMITATION)', async () => {
    // NOTE: This test demonstrates a limitation
    // API calls use pool.query() directly, so they BYPASS the transaction
    // This is why production code would need refactoring for full isolation

    // Create event via API (bypasses transaction!)
    const apiRes = await request(testServer())
      .post('/api/admin/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'API Test Event' })

    expect(apiRes.status).toBe(201)

    // This test can still read data created in previous tests via API
    // because API calls bypass the transaction
    const getRes = await request(testServer())
      .get('/api/admin/events')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(getRes.status).toBe(200)
    expect(getRes.body.data.some((e: any) => e.name === 'API Test Event')).toBe(true)
  })

  it('POC 7: verify API calls now use centralized query (Story 2-15)', async () => {
    // NOTE: After Story 2-15, API calls use the centralized query() function
    // This means API-created data IS rolled back with the transaction

    // The event created in POC 6 should NOT exist because it was rolled back
    const events = await testQuery("SELECT * FROM events WHERE name = 'API Test Event'")
    expect(events.rows.length).toBe(0)

    // Verify API data is isolated (API uses transaction - this is the FIXED behavior)
    if (events.rows.length > 0) {
      throw new Error('API data from POC 6 should have been rolled back (Story 2-15 fixed this)')
    }

    // No cleanup needed - transaction rollback handles it
  })
})

describe('POC - Conclusion and Recommendations', () => {
  it('POC: Summary of findings', () => {
    /*
    CONCLUSION:
    ==========

    ✓ Transaction rollback WORKS for queries using testQuery()
    ✗ API calls (pool.query()) BYPASS the transaction
    ✗ Full isolation requires production code refactoring

    OPTIONS:
    ========

    Option A - Minimal (Recommended for Story 2-14):
    ----------------------------------------------
    • Use transaction helper for test data setup (testQuery)
    • Keep API calls as-is (they bypass transaction)
    • Add explicit cleanup for API-created data in afterEach
    • Benefit: 80% improvement without major refactoring
    • Limitation: Some tests may still conflict on API-created data

    Option B - Full Isolation (Future Tech Debt):
    --------------------------------------------
    • Create a centralized query() function in production code
    • Replace all pool.query() calls with query()
    • Transaction helper then works for everything
    • Benefit: 100% test isolation
    • Effort: Large refactoring (affects all controllers/services)

    Option C - Database Isolation:
    ---------------------------
    • Use a separate test database per test suite
    • Drop/recreate between test runs
    • Benefit: Clean slate for each test
    • Effort: Medium (CI/CD config changes)

    RECOMMENDATION:
    ===============
    Story 2-14 should implement Option A:
    1. Add transaction helper to existing tests
    2. Use testQuery() for test data setup
    3. Keep API calls (they bypass transaction - this is OK)
    4. Add targeted cleanup in afterEach for API-created data

    This resolves most conflicts without major refactoring.
    */
    expect(true).toBe(true) // Placeholder test for documentation
  })
})
