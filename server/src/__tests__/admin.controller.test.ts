import request from 'supertest'
import jwt from 'jsonwebtoken'
import { testServer } from './helpers/test-server'
import pool from '../db/pool'
import * as emailService from '../services/email.service'
import type { Request, Response } from 'express'
import { bulkDeleteUsers } from '../controllers/admin.controller'

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret'


afterAll(() => {
  jest.restoreAllMocks()
})

// Helper to generate admin token
const generateAdminToken = (userId: string) => {
  return jwt.sign({ userId, role: 'admin' }, JWT_SECRET, { expiresIn: '1h' })
}

// Helper to generate user token (membre)
const generateUserToken = (userId: string) => {
  return jwt.sign({ userId, role: 'user' }, JWT_SECRET, { expiresIn: '1h' })
}

describe('Admin User Management', () => {
  let adminUserId: string
  let adminToken: string
  let testUserId: string

  beforeAll(async () => {
    // Create an admin user for testing
    const result = await pool.query(`
      INSERT INTO users (email, first_name, role)
      VALUES ('test-admin@test.com', 'Test Admin', 'admin')
      ON CONFLICT (email) DO UPDATE SET role = 'admin'
      RETURNING id
    `)
    adminUserId = result.rows[0].id
    adminToken = generateAdminToken(adminUserId)
  })

  afterAll(async () => {
    // Clean up test data - ne supprimer que les données de CE test (pattern spécifique)
    await pool.query("DELETE FROM users WHERE email = 'test-admin@test.com' OR email LIKE 'test-created-%@test.com'")
    // Note: ne pas fermer pool.end() ici car cela affecterait les autres tests
  })

  afterEach(async () => {
    // Clean up created test users except admin
    await pool.query("DELETE FROM users WHERE email LIKE 'test-created-%@test.com'")
  })

  describe('requireAdmin middleware', () => {
    it('refuses access without token', async () => {
      const res = await request(testServer()).get('/api/admin/users')
      expect(res.status).toBe(401)
      expect(res.body.error).toContain('Token')
    })

    it('refuses access with invalid token', async () => {
      const res = await request(testServer())
        .get('/api/admin/users')
        .set('Authorization', 'Bearer invalid-token')
      expect(res.status).toBe(401)
    })

    it('refuses access with expired token', async () => {
      const expiredToken = jwt.sign(
        { userId: adminUserId, role: 'admin' },
        JWT_SECRET,
        { expiresIn: '-1h' }
      )
      const res = await request(testServer())
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${expiredToken}`)
      expect(res.status).toBe(401)
      expect(res.body.error).toContain('expiré')
    })

    it('refuses access for non-admin user', async () => {
      // Create a regular user (membre)
      const userResult = await pool.query(`
        INSERT INTO users (email, first_name, role)
        VALUES ('test-user@test.com', 'Test', 'user')
        ON CONFLICT (email) DO NOTHING
        RETURNING id
      `)

      if (userResult.rows.length > 0) {
        const userToken = generateUserToken(userResult.rows[0].id)
        const res = await request(testServer())
          .get('/api/admin/users')
          .set('Authorization', `Bearer ${userToken}`)
        expect(res.status).toBe(403)
        expect(res.body.error).toContain('administrateurs')
      }
    })

    it('allows access for valid admin', async () => {
      const res = await request(testServer())
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
      expect(res.status).toBe(200)
    })
  })

  describe('POST /admin/users', () => {
    it('creates a user with valid email', async () => {
      const res = await request(testServer())
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'test-created-user1@test.com',
          first_name: 'Test User 1',
          role: 'user'
        })

      expect(res.status).toBe(201)
      expect(res.body.email).toBe('test-created-user1@test.com')
      expect(res.body.firstName).toBe('Test User 1')
      expect(res.body.role).toBe('user')
      expect(res.body.id).toBeDefined()
    })

    it('returns 400 if email is missing', async () => {
      const res = await request(testServer())
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ first_name: 'No Email User' })

      expect(res.status).toBe(400)
      expect(res.body.error).toContain('email')
    })

    it('returns 400 if email format is invalid', async () => {
      const res = await request(testServer())
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: 'not-an-email' })

      expect(res.status).toBe(400)
      expect(res.body.error).toContain('email')
    })

    it('returns 409 if email already exists', async () => {
      // Create first user
      await request(testServer())
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: 'test-created-duplicate@test.com', first_name: 'Dup' })

      // Try to create duplicate
      const res = await request(testServer())
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: 'test-created-duplicate@test.com', first_name: 'Dup' })

      expect(res.status).toBe(409)
      expect(res.body.error).toContain('existe déjà')
    })

    it('sets user role by default', async () => {
      const res = await request(testServer())
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: 'test-created-default@test.com', first_name: 'Default' })

      expect(res.status).toBe(201)
      expect(res.body.role).toBe('user')
    })

    it('allows creating an admin user', async () => {
      const res = await request(testServer())
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: 'test-created-admin@test.com', first_name: 'Admin User', role: 'admin' })

      expect(res.status).toBe(201)
      expect(res.body.role).toBe('admin')
    })

    it('accepts valid phone number format', async () => {
      const res = await request(testServer())
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'test-created-phone@test.com',
          first_name: 'Phone User',
          phone: '+33 6 12 34 56 78'
        })

      expect(res.status).toBe(201)
      expect(res.body.phone).toBe('+33 6 12 34 56 78')
    })

    it('accepts user without phone (optional field)', async () => {
      const res = await request(testServer())
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'test-created-no-phone@test.com',
          first_name: 'No Phone User'
        })

      expect(res.status).toBe(201)
      expect(res.body.phone).toBeNull()
    })

    it('returns 400 for invalid phone format', async () => {
      const res = await request(testServer())
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'test-created-invalid-phone@test.com',
          first_name: 'Invalid Phone',
          phone: '123'
        })

      expect(res.status).toBe(400)
      expect(res.body.error).toContain('téléphone')
    })

    it('converts snake_case DB response to camelCase API response', async () => {
      const res = await request(testServer())
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'test-created-camelcase@test.com',
          first_name: 'CamelCase Test',
          phone: '+33612345678'
        })

      expect(res.status).toBe(201)
      // Vérifier que les clés sont en camelCase, pas snake_case
      expect(res.body).toHaveProperty('firstName')
      expect(res.body).toHaveProperty('createdAt')
      expect(res.body).not.toHaveProperty('first_name')
      expect(res.body).not.toHaveProperty('created_at')
      expect(res.body.firstName).toBe('CamelCase Test')
    })

    it('returns 400 for invalid role value', async () => {
      const res = await request(testServer())
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'test-created-invalid-role@test.com',
          first_name: 'Invalid Role',
          role: 'superadmin'
        })

      expect(res.status).toBe(400)
      expect(res.body.error).toContain('rôle')
    })
  })

  describe('PUT /admin/users/:id', () => {
    let updateUserId: string

    beforeEach(async () => {
      const result = await pool.query(`
        INSERT INTO users (email, first_name, role)
        VALUES ('test-created-update@test.com', 'Original Name', 'user')
        RETURNING id
      `)
      updateUserId = result.rows[0].id
    })

    it('updates name and phone', async () => {
      const res = await request(testServer())
        .put(`/api/admin/users/${updateUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          first_name: 'Updated Name',
          phone: '+33612345678'
        })

      expect(res.status).toBe(200)
      expect(res.body.firstName).toBe('Updated Name')
      expect(res.body.phone).toBe('+33612345678')
    })

    it('changes role from user to admin', async () => {
      const res = await request(testServer())
        .put(`/api/admin/users/${updateUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'admin' })

      expect(res.status).toBe(200)
      expect(res.body.role).toBe('admin')
    })

    it('prevents demoting the last admin', async () => {
      // First, ensure only one admin exists by demoting all others
      await pool.query("UPDATE users SET role = 'user' WHERE role = 'admin' AND id != $1", [adminUserId])

      const res = await request(testServer())
        .put(`/api/admin/users/${adminUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'user' })

      expect(res.status).toBe(409)
      expect(res.body.error).toContain('dernier administrateur')
    })

    it('returns 404 if user not found', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000'
      const res = await request(testServer())
        .put(`/api/admin/users/${fakeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ first_name: 'Does Not Exist' })

      expect(res.status).toBe(404)
      expect(res.body.error).toContain('non trouvé')
    })
  })

  describe('profession + informations (S1)', () => {
    it('createUser persists profession + informations and returns them (camelCase)', async () => {
      const res = await request(testServer())
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'test-created-profession@test.com',
          first_name: 'Prof Test',
          profession: 'Enseignant',
          informations: 'Disponible le mercredi matin',
        })

      expect(res.status).toBe(201)
      expect(res.body.profession).toBe('Enseignant')
      expect(res.body.informations).toBe('Disponible le mercredi matin')

      // Persistance confirmée via getUserDetails (relecture)
      const details = await request(testServer())
        .get(`/api/admin/users/${res.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(details.status).toBe(200)
      expect(details.body.profession).toBe('Enseignant')
      expect(details.body.informations).toBe('Disponible le mercredi matin')
    })

    it('getUsers list exposes profession + informations', async () => {
      await request(testServer())
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'test-created-list-info@test.com',
          first_name: 'Info List',
          profession: 'Médecin',
          informations: 'note libre',
        })

      const res = await request(testServer())
        .get('/api/admin/users?search=test-created-list-info@test.com')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      const created = res.body.users.find(
        (u: { email: string }) => u.email === 'test-created-list-info@test.com'
      )
      expect(created).toBeDefined()
      expect(created).toHaveProperty('profession', 'Médecin')
      expect(created).toHaveProperty('informations', 'note libre')
    })

    it('updateUser patches profession alone, leaving informations untouched', async () => {
      const created = await request(testServer())
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'test-created-patch-info@test.com',
          first_name: 'Patch Info',
          profession: 'Initial',
          informations: 'à conserver',
        })

      const res = await request(testServer())
        .put(`/api/admin/users/${created.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ profession: 'Médecin' })

      expect(res.status).toBe(200)
      expect(res.body.profession).toBe('Médecin')
      expect(res.body.informations).toBe('à conserver')
    })

    it('updateUser accepts explicit null profession (clears field, no 400)', async () => {
      const created = await request(testServer())
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'test-created-null-info@test.com',
          first_name: 'Null Info',
          profession: 'À effacer',
        })

      const res = await request(testServer())
        .put(`/api/admin/users/${created.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ profession: null })

      expect(res.status).toBe(200)
      expect(res.body.profession).toBeNull()
    })

    it('updateUser coerces empty-string profession to null (parity with create)', async () => {
      const created = await request(testServer())
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'test-created-empty-prof@test.com',
          first_name: 'Empty Prof',
          profession: 'À vider',
        })

      const res = await request(testServer())
        .put(`/api/admin/users/${created.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ profession: '' })

      expect(res.status).toBe(200)
      expect(res.body.profession).toBeNull()
    })

    it('rejects informations longer than 5000 chars (400)', async () => {
      const res = await request(testServer())
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'test-created-long-info@test.com',
          informations: 'x'.repeat(5001),
        })

      expect(res.status).toBe(400)
    })
  })

  describe('DELETE /admin/users/:id', () => {
    let deleteUserId: string

    beforeEach(async () => {
      const result = await pool.query(`
        INSERT INTO users (email, first_name, role)
        VALUES ('test-created-delete@test.com', 'Test', 'user')
        RETURNING id
      `)
      deleteUserId = result.rows[0].id
    })

    it('deletes a user and returns deleted bookings count', async () => {
      const res = await request(testServer())
        .delete(`/api/admin/users/${deleteUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.message).toContain('supprimé')
      expect(res.body.deletedBookings).toBeDefined()
    })

    it('prevents self-deletion', async () => {
      const res = await request(testServer())
        .delete(`/api/admin/users/${adminUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(409)
      expect(res.body.error).toContain('propre compte')
    })

    it('prevents deleting the last admin', async () => {
      // Ensure this is the only admin and try to delete
      await pool.query("UPDATE users SET role = 'user' WHERE role = 'admin' AND id != $1", [adminUserId])

      // Create another admin, then delete them
      const secondAdmin = await pool.query(`
        INSERT INTO users (email, first_name, role)
        VALUES ('test-created-second-admin@test.com', 'Test', 'admin')
        RETURNING id
      `)

      // Update original admin role to user temporarily so second admin is last
      await pool.query("UPDATE users SET role = 'user' WHERE id = $1", [adminUserId])

      // Try to delete the last admin
      const secondAdminToken = generateAdminToken(secondAdmin.rows[0].id)
      const res = await request(testServer())
        .delete(`/api/admin/users/${secondAdmin.rows[0].id}`)
        .set('Authorization', `Bearer ${secondAdminToken}`)

      // This should fail due to self-deletion check (not last admin check)
      expect(res.status).toBe(409)

      // Restore admin role
      await pool.query("UPDATE users SET role = 'admin' WHERE id = $1", [adminUserId])
    })

    it('returns 404 if user not found', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000'
      const res = await request(testServer())
        .delete(`/api/admin/users/${fakeId}`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(404)
      expect(res.body.error).toContain('non trouvé')
    })

    it('deletes user bookings cascade when user is deleted', async () => {
      // Create a test event first (required for slots FK constraint)
      const eventResult = await pool.query(`
        INSERT INTO events (name, is_published)
        VALUES ('Test Event for Booking Cascade', true)
        RETURNING id
      `)
      const testEventId = eventResult.rows[0].id

      // Create a test slot with a future date (2 days to avoid cleanup issues)
      const slotResult = await pool.query(`
        INSERT INTO slots (event_id, start_time, end_time, capacity)
        VALUES ($1, NOW() + INTERVAL '2 days', NOW() + INTERVAL '2 days 1 hour', 2)
        RETURNING id
      `, [testEventId])
      const slotId = slotResult.rows[0].id

      // Verify slot was created
      expect(slotId).toBeDefined()

      // Create a test user with a unique email to avoid conflicts
      const uniqueEmail = `test-created-with-booking-${Date.now()}@test.com`
      const userResult = await pool.query(`
        INSERT INTO users (email, first_name, role)
        VALUES ($1, 'Test', 'user')
        RETURNING id
      `, [uniqueEmail])
      const userId = userResult.rows[0].id

      // Verify user was created
      expect(userId).toBeDefined()

      // Create a booking for the user
      const bookingResult = await pool.query(`
        INSERT INTO bookings (user_id, slot_id)
        VALUES ($1, $2)
        RETURNING id
      `, [userId, slotId])

      // Verify booking was created
      expect(bookingResult.rows[0].id).toBeDefined()

      // Verify booking exists
      const bookingBefore = await pool.query(
        'SELECT COUNT(*) FROM bookings WHERE user_id = $1',
        [userId]
      )
      expect(parseInt(bookingBefore.rows[0].count)).toBe(1)

      // Delete the user
      const res = await request(testServer())
        .delete(`/api/admin/users/${userId}`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.deletedBookings).toBe(1)

      // Verify booking was cascade deleted
      const bookingAfter = await pool.query(
        'SELECT COUNT(*) FROM bookings WHERE user_id = $1',
        [userId]
      )
      expect(parseInt(bookingAfter.rows[0].count)).toBe(0)

      // Verify user was deleted
      const userAfter = await pool.query(
        'SELECT * FROM users WHERE id = $1',
        [userId]
      )
      expect(userAfter.rows.length).toBe(0)

      // Clean up slot
      await pool.query('DELETE FROM slots WHERE id = $1', [slotId])
    })

    it('deletes multiple bookings when user with multiple bookings is deleted', async () => {
      // Create a test event first (required for slots FK constraint)
      const eventResult = await pool.query(`
        INSERT INTO events (name, is_published)
        VALUES ('Test Event for Multiple Bookings', true)
        RETURNING id
      `)
      const testEventId = eventResult.rows[0].id

      // Create two test slots
      const slot1Result = await pool.query(`
        INSERT INTO slots (event_id, start_time, end_time, capacity)
        VALUES ($1, NOW() + INTERVAL '1 day', NOW() + INTERVAL '1 day 1 hour', 2)
        RETURNING id
      `, [testEventId])
      const slot2Result = await pool.query(`
        INSERT INTO slots (event_id, start_time, end_time, capacity)
        VALUES ($1, NOW() + INTERVAL '2 days', NOW() + INTERVAL '2 days 1 hour', 2)
        RETURNING id
      `, [testEventId])
      const slotId1 = slot1Result.rows[0].id
      const slotId2 = slot2Result.rows[0].id

      // Create a test user
      const userResult = await pool.query(`
        INSERT INTO users (email, first_name, role)
        VALUES ('test-created-multiple-bookings@test.com', 'Test', 'user')
        RETURNING id
      `)
      const userId = userResult.rows[0].id

      // Create two bookings for the user
      await pool.query(`
        INSERT INTO bookings (user_id, slot_id)
        VALUES ($1, $2)
      `, [userId, slotId1])
      await pool.query(`
        INSERT INTO bookings (user_id, slot_id)
        VALUES ($1, $2)
      `, [userId, slotId2])

      // Delete the user
      const res = await request(testServer())
        .delete(`/api/admin/users/${userId}`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.deletedBookings).toBe(2)

      // Verify all bookings were cascade deleted
      const bookingsAfter = await pool.query(
        'SELECT COUNT(*) FROM bookings WHERE user_id = $1',
        [userId]
      )
      expect(parseInt(bookingsAfter.rows[0].count)).toBe(0)

      // Clean up slots
      await pool.query('DELETE FROM slots WHERE id IN ($1, $2)', [slotId1, slotId2])
    })
  })

  describe('POST /admin/users/bulk-delete', () => {
    it('supprime plusieurs membres et retourne les comptages corrects', async () => {
      // Create 3 test users
      const u1 = await pool.query(`
        INSERT INTO users (email, role, first_name)
        VALUES ('test-created-bulk-a@test.com', 'user', 'BulkA')
        RETURNING id
      `)
      const u2 = await pool.query(`
        INSERT INTO users (email, role, first_name)
        VALUES ('test-created-bulk-b@test.com', 'user', 'BulkB')
        RETURNING id
      `)
      const u3 = await pool.query(`
        INSERT INTO users (email, role, first_name)
        VALUES ('test-created-bulk-c@test.com', 'user', 'BulkC')
        RETURNING id
      `)
      const ids = [u1.rows[0].id, u2.rows[0].id, u3.rows[0].id]

      const res = await request(testServer())
        .post('/api/admin/users/bulk-delete')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ids })

      expect(res.status).toBe(200)
      expect(res.body.deleted).toBe(3)
      expect(res.body.deletedBookings).toBeDefined()
      expect(Array.isArray(res.body.skipped)).toBe(true)
      expect(res.body.skipped.length).toBe(0)

      // Verify users no longer exist
      for (const id of ids) {
        const check = await pool.query('SELECT id FROM users WHERE id = $1', [id])
        expect(check.rows.length).toBe(0)
      }
    })

    it('supprime des membres avec bookings et retourne deletedBookings cumulé', async () => {
      // Create event + slot for bookings
      const eventResult = await pool.query(`
        INSERT INTO events (name, is_published)
        VALUES ('Test Event Bulk Delete', true)
        RETURNING id
      `)
      const slotResult = await pool.query(`
        INSERT INTO slots (event_id, start_time, end_time, capacity)
        VALUES ($1, NOW() + INTERVAL '3 days', NOW() + INTERVAL '3 days 1 hour', 10)
        RETURNING id
      `, [eventResult.rows[0].id])
      const slotId = slotResult.rows[0].id

      const u1 = await pool.query(`
        INSERT INTO users (email, first_name, role) VALUES ('test-created-bulk-booking-1@test.com', 'Test', 'user') RETURNING id
      `)
      const u2 = await pool.query(`
        INSERT INTO users (email, first_name, role) VALUES ('test-created-bulk-booking-2@test.com', 'Test', 'user') RETURNING id
      `)
      const userId1 = u1.rows[0].id
      const userId2 = u2.rows[0].id

      // 2 bookings total (1 each)
      await pool.query('INSERT INTO bookings (user_id, slot_id) VALUES ($1, $2)', [userId1, slotId])
      await pool.query('INSERT INTO bookings (user_id, slot_id) VALUES ($1, $2)', [userId2, slotId])

      const res = await request(testServer())
        .post('/api/admin/users/bulk-delete')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ids: [userId1, userId2] })

      expect(res.status).toBe(200)
      expect(res.body.deleted).toBe(2)
      expect(res.body.deletedBookings).toBe(2)

      // Clean up slot (users and bookings were cascade-deleted)
      await pool.query('DELETE FROM slots WHERE id = $1', [slotId])
    })

    it('skip self: inclut le token courant dans ids → skipped reason self, user existe toujours', async () => {
      const other = await pool.query(`
        INSERT INTO users (email, first_name, role) VALUES ('test-created-bulk-other@test.com', 'Test', 'user') RETURNING id
      `)
      const otherId = other.rows[0].id

      const res = await request(testServer())
        .post('/api/admin/users/bulk-delete')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ids: [adminUserId, otherId] })

      expect(res.status).toBe(200)
      expect(res.body.deleted).toBe(1)
      expect(res.body.skipped).toContainEqual(
        expect.objectContaining({ id: adminUserId, reason: 'self' })
      )

      // Admin still exists
      const check = await pool.query('SELECT id FROM users WHERE id = $1', [adminUserId])
      expect(check.rows.length).toBe(1)
    })

    it('skip not_found: UUID inexistant → skipped reason not_found', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000099'
      const realUser = await pool.query(`
        INSERT INTO users (email, first_name, role) VALUES ('test-created-bulk-real@test.com', 'Test', 'user') RETURNING id
      `)
      const realId = realUser.rows[0].id

      const res = await request(testServer())
        .post('/api/admin/users/bulk-delete')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ids: [fakeId, realId] })

      expect(res.status).toBe(200)
      expect(res.body.deleted).toBe(1)
      expect(res.body.skipped).toContainEqual(
        expect.objectContaining({ id: fakeId, email: null, reason: 'not_found' })
      )
    })

    it('garde-fou dernier admin (appel direct, requérant non-admin): protège le dernier admin', async () => {
      // Défense en profondeur : via l'API le garde-fou "last_admin" est inatteignable
      // (l'admin courant est toujours exclu via "self" et reste donc administrateur, si
      // bien qu'au moins un admin subsiste). On l'exerce en appelant le contrôleur
      // directement avec un requérant non-admin — seul cas où tous les admins peuvent
      // être candidats à la suppression.
      const soleAdmin = await pool.query(`
        INSERT INTO users (email, first_name, role) VALUES ('test-created-bulk-sole-admin@test.com', 'Test', 'admin') RETURNING id
      `)
      const soleAdminId = soleAdmin.rows[0].id
      const requester = await pool.query(`
        INSERT INTO users (email, first_name, role) VALUES ('test-created-bulk-nonadmin@test.com', 'Test', 'user') RETURNING id
      `)
      const requesterId = requester.rows[0].id
      // soleAdmin devient le seul administrateur en base.
      await pool.query("UPDATE users SET role = 'user' WHERE role = 'admin' AND id != $1", [soleAdminId])

      try {
        const captured: { statusCode: number; body: unknown } = { statusCode: 200, body: null }
        const res = {
          status(code: number) { captured.statusCode = code; return this },
          json(payload: unknown) { captured.body = payload; return this },
        } as unknown as Response
        const req = {
          body: { ids: [soleAdminId] },
          user: { userId: requesterId, role: 'user' },
        } as unknown as Request

        await bulkDeleteUsers(req, res)

        expect(captured.statusCode).toBe(200)
        const body = captured.body as {
          deleted: number
          skipped: Array<{ id: string; reason: string }>
        }
        expect(body.deleted).toBe(0)
        expect(body.skipped).toContainEqual(
          expect.objectContaining({ id: soleAdminId, reason: 'last_admin' })
        )
        const check = await pool.query('SELECT id FROM users WHERE id = $1', [soleAdminId])
        expect(check.rows.length).toBe(1)
      } finally {
        await pool.query("UPDATE users SET role = 'admin' WHERE id = $1", [adminUserId])
      }
    })

    it('retourne 400 si ids est absent', async () => {
      const res = await request(testServer())
        .post('/api/admin/users/bulk-delete')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})

      expect(res.status).toBe(400)
    })

    it('retourne 400 si ids est un tableau vide', async () => {
      const res = await request(testServer())
        .post('/api/admin/users/bulk-delete')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ids: [] })

      expect(res.status).toBe(400)
    })

    it("retourne 400 si ids n'est pas un tableau", async () => {
      const res = await request(testServer())
        .post('/api/admin/users/bulk-delete')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ids: 'not-an-array' })

      expect(res.status).toBe(400)
    })

    it('retourne 400 si ids contient des non-strings', async () => {
      const res = await request(testServer())
        .post('/api/admin/users/bulk-delete')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ids: [123, null] })

      expect(res.status).toBe(400)
    })

    it('retourne 400 si ids dépasse 100 éléments', async () => {
      const ids = Array.from({ length: 101 }, (_, i) => `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`)
      const res = await request(testServer())
        .post('/api/admin/users/bulk-delete')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ids })

      expect(res.status).toBe(400)
    })

    it('retourne 403 sans droits admin (token user)', async () => {
      // requireAdmin relit le rôle en base : il faut un vrai membre non-admin.
      const member = await pool.query(`
        INSERT INTO users (email, first_name, role) VALUES ('test-created-bulk-member@test.com', 'Test', 'user') RETURNING id
      `)
      const userToken = generateUserToken(member.rows[0].id)
      const res = await request(testServer())
        .post('/api/admin/users/bulk-delete')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ ids: [adminUserId] })

      expect(res.status).toBe(403)
    })

    it('T4 déduplication: même UUID inexistant en double → 1 seule entrée not_found', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000042'

      const res = await request(testServer())
        .post('/api/admin/users/bulk-delete')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ids: [fakeId, fakeId] })

      expect(res.status).toBe(200)
      expect(res.body.deleted).toBe(0)
      expect(res.body.skipped).toHaveLength(1)
      expect(res.body.skipped[0]).toMatchObject({ id: fakeId, reason: 'not_found' })
    })

    it('T4b déduplication: même UUID réel en double → deleted=1, user supprimé une seule fois', async () => {
      const u = await pool.query(`
        INSERT INTO users (email, first_name, role) VALUES ('test-created-dedup-real@test.com', 'Test', 'user') RETURNING id
      `)
      const realId: string = u.rows[0].id

      const res = await request(testServer())
        .post('/api/admin/users/bulk-delete')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ids: [realId, realId] })

      expect(res.status).toBe(200)
      expect(res.body.deleted).toBe(1)

      const check = await pool.query('SELECT id FROM users WHERE id = $1', [realId])
      expect(check.rows).toHaveLength(0)
    })

    it('T5 suppression partielle admins (appel direct): protège exactement 1 admin (smallest id localeCompare)', async () => {
      const a1 = await pool.query(`
        INSERT INTO users (email, first_name, role) VALUES ('test-created-admin-t5a@test.com', 'Test', 'admin') RETURNING id
      `)
      const a2 = await pool.query(`
        INSERT INTO users (email, first_name, role) VALUES ('test-created-admin-t5b@test.com', 'Test', 'admin') RETURNING id
      `)
      const a3 = await pool.query(`
        INSERT INTO users (email, first_name, role) VALUES ('test-created-admin-t5c@test.com', 'Test', 'admin') RETURNING id
      `)
      const threeAdminIds: string[] = [a1.rows[0].id, a2.rows[0].id, a3.rows[0].id]

      const requester = await pool.query(`
        INSERT INTO users (email, first_name, role) VALUES ('test-created-nonadmin-t5@test.com', 'Test', 'user') RETURNING id
      `)
      const requesterId: string = requester.rows[0].id

      // Les 3 nouveaux admins deviennent les seuls admins — tous les autres sont rétrogradés.
      await pool.query(
        "UPDATE users SET role = 'user' WHERE role = 'admin' AND id != ALL($1::uuid[])",
        [threeAdminIds]
      )

      try {
        const captured: { statusCode: number; body: unknown } = { statusCode: 200, body: null }
        const mockRes = {
          status(code: number) { captured.statusCode = code; return this },
          json(payload: unknown) { captured.body = payload; return this },
        } as unknown as Response
        const mockReq = {
          body: { ids: threeAdminIds },
          user: { userId: requesterId, role: 'user' },
        } as unknown as Request

        await bulkDeleteUsers(mockReq, mockRes)

        expect(captured.statusCode).toBe(200)
        const body = captured.body as {
          deleted: number
          skipped: Array<{ id: string; email: string | null; reason: string }>
        }
        expect(body.deleted).toBe(2)

        const lastAdminSkips = body.skipped.filter((s) => s.reason === 'last_admin')
        expect(lastAdminSkips).toHaveLength(1)

        // Le plus petit id après tri localeCompare doit être protégé
        const sortedIds = [...threeAdminIds].sort((a, b) => a.localeCompare(b))
        expect(lastAdminSkips[0].id).toBe(sortedIds[0])

        // Au moins 1 admin subsiste en base
        const adminCheck = await pool.query("SELECT id FROM users WHERE role = 'admin'")
        expect(adminCheck.rows.length).toBeGreaterThanOrEqual(1)
      } finally {
        await pool.query("UPDATE users SET role = 'admin' WHERE id = $1", [adminUserId])
      }
    })

    it('T6 mélange skip+delete via HTTP: self+not_found+2 réels → deleted=2, skips corrects', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000066'
      const u1 = await pool.query(`
        INSERT INTO users (email, first_name, role) VALUES ('test-created-mix1-t6@test.com', 'Test', 'user') RETURNING id
      `)
      const u2 = await pool.query(`
        INSERT INTO users (email, first_name, role) VALUES ('test-created-mix2-t6@test.com', 'Test', 'user') RETURNING id
      `)
      const userId1: string = u1.rows[0].id
      const userId2: string = u2.rows[0].id

      const res = await request(testServer())
        .post('/api/admin/users/bulk-delete')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ids: [adminUserId, fakeId, userId1, userId2] })

      expect(res.status).toBe(200)
      expect(res.body.deleted).toBe(2)
      expect(res.body.skipped).toContainEqual(
        expect.objectContaining({ id: adminUserId, reason: 'self' })
      )
      expect(res.body.skipped).toContainEqual(
        expect.objectContaining({ id: fakeId, reason: 'not_found' })
      )

      // user1 et user2 sont supprimés
      const check1 = await pool.query('SELECT id FROM users WHERE id = $1', [userId1])
      expect(check1.rows).toHaveLength(0)
      const check2 = await pool.query('SELECT id FROM users WHERE id = $1', [userId2])
      expect(check2.rows).toHaveLength(0)

      // L'admin courant (self) existe toujours
      const selfCheck = await pool.query('SELECT id FROM users WHERE id = $1', [adminUserId])
      expect(selfCheck.rows).toHaveLength(1)
    })

    it('T9 tous ignorés: 2 UUID inexistants → deleted=0, deletedBookings=0, skipped.length===2', async () => {
      const fake1 = '00000000-0000-0000-0000-000000000091'
      const fake2 = '00000000-0000-0000-0000-000000000092'

      const res = await request(testServer())
        .post('/api/admin/users/bulk-delete')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ids: [fake1, fake2] })

      expect(res.status).toBe(200)
      expect(res.body.deleted).toBe(0)
      expect(res.body.deletedBookings).toBe(0)
      expect(res.body.skipped).toHaveLength(2)
      expect(
        (res.body.skipped as Array<{ reason: string }>).every((s) => s.reason === 'not_found')
      ).toBe(true)
    })

    it('retourne 400 si ids contient un UUID invalide (format)', async () => {
      const res = await request(testServer())
        .post('/api/admin/users/bulk-delete')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ids: ['not-a-uuid'] })

      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/UUID/)
    })

    it('retourne 400 si ids mélange UUID valide et UUID invalide', async () => {
      const validUuid = '00000000-0000-0000-0000-000000000001'

      const res = await request(testServer())
        .post('/api/admin/users/bulk-delete')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ids: [validUuid, 'abc'] })

      expect(res.status).toBe(400)
    })
  })


  describe('GET /admin/users', () => {
    it('returns paginated users with bookingCount', async () => {
      const res = await request(testServer())
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body).toHaveProperty('users')
      expect(res.body).toHaveProperty('pagination')
      expect(Array.isArray(res.body.users)).toBe(true)
      expect(res.body.pagination).toHaveProperty('page')
      expect(res.body.pagination).toHaveProperty('limit')
      expect(res.body.pagination).toHaveProperty('total')
      expect(res.body.pagination).toHaveProperty('totalPages')
      if (res.body.users.length > 0) {
        expect(res.body.users[0]).toHaveProperty('bookingCount')
      }
    })

    it('supports search parameter', async () => {
      const res = await request(testServer())
        .get('/api/admin/users?search=admin')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.users.some((u: any) => u.email.includes('admin'))).toBe(true)
    })

    it('retourne tableau vide si aucun résultat pour la recherche', async () => {
      const res = await request(testServer())
        .get('/api/admin/users?search=utilisateurinexistantxyz123')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.users).toHaveLength(0)
      expect(res.body.pagination.total).toBe(0)
    })

    it('recherche est insensible à la casse', async () => {
      const res1 = await request(testServer())
        .get('/api/admin/users?search=ADMIN')
        .set('Authorization', `Bearer ${adminToken}`)
      const res2 = await request(testServer())
        .get('/api/admin/users?search=admin')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res1.status).toBe(200)
      expect(res2.status).toBe(200)
      // Même nombre de résultats pour ADMIN et admin (insensible à la casse)
      expect(res1.body.users.length).toBe(res2.body.users.length)
    })

    it('retourne tous les utilisateurs si search est vide', async () => {
      const resEmpty = await request(testServer())
        .get('/api/admin/users?search=')
        .set('Authorization', `Bearer ${adminToken}`)
      const resNone = await request(testServer())
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(resEmpty.status).toBe(200)
      expect(resNone.status).toBe(200)
      // Recherche vide = même comportement que sans paramètre search
      expect(resEmpty.body.users.length).toBe(resNone.body.users.length)
    })

    it('recherche trouve des résultats partiels dans email et nom', async () => {
      // Créer un utilisateur de test avec ON CONFLICT pour éviter les doublons
      await pool.query(
        "INSERT INTO users (email, first_name, role) VALUES ('test.search.partial@test.com', 'Jean SearchTest', 'user') ON CONFLICT (email) DO UPDATE SET first_name = EXCLUDED.first_name"
      )

      const resEmail = await request(testServer())
        .get('/api/admin/users?search=partial')
        .set('Authorization', `Bearer ${adminToken}`)

      const resNom = await request(testServer())
        .get('/api/admin/users?search=SearchTest')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(resEmail.status).toBe(200)
      expect(resNom.status).toBe(200)
      expect(resEmail.body.users.some((u: any) => u.email.includes('partial'))).toBe(true)
      expect(resNom.body.users.some((u: any) => u.firstName?.includes('SearchTest'))).toBe(true)
    })

    it('échappe les caractères spéciaux SQL % et _ dans la recherche', async () => {
      // Créer un utilisateur avec % et _ dans son nom pour tester l'échappement
      await pool.query(
        "INSERT INTO users (email, first_name, role) VALUES ('search.percent@test.com', 'Test 100% complet', 'user') ON CONFLICT (email) DO UPDATE SET first_name = EXCLUDED.first_name"
      )
      await pool.query(
        "INSERT INTO users (email, first_name, role) VALUES ('search.underscore@test.com', 'Test_underscore', 'user') ON CONFLICT (email) DO UPDATE SET first_name = EXCLUDED.first_name"
      )

      // Rechercher "100%" - ne devrait trouver QUE "Test 100% complet", pas "1000" ou "100abc"
      const res = await request(testServer())
        .get('/api/admin/users?search=100%')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      // Les caractères % sont échappés donc on cherche littéralement "100%"
      expect(res.body.users.some((u: any) => u.firstName === 'Test 100% complet')).toBe(true)
    })

    it('permet l\'utilisation de * comme wildcard (remplace %)', async () => {
      // Créer des utilisateurs de test avec ON CONFLICT
      await pool.query(
        "INSERT INTO users (email, first_name, role) VALUES ('search.wildcard1@test.com', 'Jean Durant', 'user') ON CONFLICT (email) DO UPDATE SET first_name = EXCLUDED.first_name"
      )
      await pool.query(
        "INSERT INTO users (email, first_name, role) VALUES ('search.wildcard2@test.com', 'Paul Duroc', 'user') ON CONFLICT (email) DO UPDATE SET first_name = EXCLUDED.first_name"
      )

      // Utiliser * comme wildcard - devrait trouver "Durant" ET "Duroc" (commencent par "Dur")
      const res = await request(testServer())
        .get('/api/admin/users?search=Dur*')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.users.some((u: any) => u.firstName?.includes('Durant'))).toBe(true)
      expect(res.body.users.some((u: any) => u.firstName?.includes('Duroc'))).toBe(true)
    })

    it('échappe les backslashes dans la recherche', async () => {
      // Créer un utilisateur avec des backslashes potentiels
      await pool.query(
        "INSERT INTO users (email, first_name, role) VALUES ('search.backslash@test.com', 'Test\\Backslash', 'user') ON CONFLICT (email) DO UPDATE SET first_name = EXCLUDED.first_name"
      )

      // Rechercher avec backslash - ne devrait pas provoquer d'erreur SQL
      const res = await request(testServer())
        .get('/api/admin/users?search=Test%5C')  // %5C est le backslash encodé URL
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      // La recherche ne devrait pas planter (échappement correct)
    })

    it('supports role filter parameter', async () => {
      const res = await request(testServer())
        .get('/api/admin/users?role=admin')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.users.every((u: any) => u.role === 'admin')).toBe(true)
    })

    it('supports pagination parameters', async () => {
      const res = await request(testServer())
        .get('/api/admin/users?page=1&limit=5')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.pagination.page).toBe(1)
      expect(res.body.pagination.limit).toBe(5)
      expect(res.body.users.length).toBeLessThanOrEqual(5)
    })

    it('converts snake_case DB response to camelCase API response', async () => {
      const res = await request(testServer())
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      // Vérifier que les clés sont en camelCase, pas snake_case
      if (res.body.users.length > 0) {
        expect(res.body.users[0]).toHaveProperty('firstName')
        expect(res.body.users[0]).toHaveProperty('lastName')
        expect(res.body.users[0]).toHaveProperty('createdAt')
        expect(res.body.users[0]).toHaveProperty('bookingCount')
        expect(res.body.users[0]).not.toHaveProperty('first_name')
        expect(res.body.users[0]).not.toHaveProperty('created_at')
        expect(res.body.users[0]).not.toHaveProperty('booking_count')
        expect(res.body.users[0]).not.toHaveProperty('fullName')
      }
    })
  })

  describe('GET /admin/users/:id', () => {
    it('returns user details with bookings', async () => {
      const res = await request(testServer())
        .get(`/api/admin/users/${adminUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.email).toBe('test-admin@test.com')
      expect(res.body).toHaveProperty('bookingCount')
      expect(res.body).toHaveProperty('bookings')
      expect(Array.isArray(res.body.bookings)).toBe(true)
      expect(res.body).toHaveProperty('firstName')
      expect(res.body).toHaveProperty('lastName')
      expect(res.body).not.toHaveProperty('fullName')
    })

    it('inclut le nom et l\'id de l\'événement dans chaque réservation (camelCase)', async () => {
      const eventResult = await pool.query(`
        INSERT INTO events (name, is_published)
        VALUES ($1, true)
        RETURNING id
      `, [`Détails Event ${Date.now()}`])
      const eventId = eventResult.rows[0].id

      const slotResult = await pool.query(`
        INSERT INTO slots (event_id, start_time, end_time, capacity)
        VALUES ($1, NOW() + INTERVAL '1 day', NOW() + INTERVAL '1 day 1 hour', 5)
        RETURNING id
      `, [eventId])
      const slotId = slotResult.rows[0].id

      const userResult = await pool.query(`
        INSERT INTO users (email, first_name, role)
        VALUES ($1, 'Test', 'user')
        RETURNING id
      `, [`details-booking-${Date.now()}@test.com`])
      const userId = userResult.rows[0].id

      await pool.query('INSERT INTO bookings (user_id, slot_id) VALUES ($1, $2)', [userId, slotId])

      const res = await request(testServer())
        .get(`/api/admin/users/${userId}`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.bookings).toHaveLength(1)
      const booking = res.body.bookings[0]
      expect(booking.eventId).toBe(eventId)
      expect(booking.eventName).toMatch(/Détails Event/)
      expect(booking).toHaveProperty('startTime')
      expect(booking).toHaveProperty('endTime')
      expect(booking).not.toHaveProperty('event_name')
      expect(booking).not.toHaveProperty('event_id')

      await pool.query('DELETE FROM bookings WHERE slot_id = $1', [slotId])
      await pool.query('DELETE FROM slots WHERE id = $1', [slotId])
      await pool.query('DELETE FROM events WHERE id = $1', [eventId])
      await pool.query('DELETE FROM users WHERE id = $1', [userId])
    })

    it('returns 404 if user not found', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000'
      const res = await request(testServer())
        .get(`/api/admin/users/${fakeId}`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(404)
      expect(res.body.error).toContain('non trouvé')
    })
  })

  describe('full_name split contract (S2)', () => {
    it('persists a member with first_name + last_name and returns both (camelCase)', async () => {
      const res = await request(testServer())
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: `split-both-${Date.now()}@test.com`, first_name: 'Marie', last_name: 'Curie' })
      expect(res.status).toBe(201)
      expect(res.body.firstName).toBe('Marie')
      expect(res.body.lastName).toBe('Curie')
      expect(res.body).not.toHaveProperty('fullName')
      expect(res.body).not.toHaveProperty('full_name')
    })

    it('persists a mononym (last_name absent → null)', async () => {
      const res = await request(testServer())
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: `split-mono-${Date.now()}@test.com`, first_name: 'Cher' })
      expect(res.status).toBe(201)
      expect(res.body.firstName).toBe('Cher')
      expect(res.body.lastName).toBeNull()
    })

    it('persists last_name=null explicitly (mononym)', async () => {
      const res = await request(testServer())
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: `split-null-${Date.now()}@test.com`, first_name: 'Luc', last_name: null })
      expect(res.status).toBe(201)
      expect(res.body.lastName).toBeNull()
    })

    it('rejects a create without first_name (400 Zod)', async () => {
      const res = await request(testServer())
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: `split-noname-${Date.now()}@test.com` })
      expect(res.status).toBe(400)
      expect(res.body.error).toContain('prénom')
    })

    it('searches members by last_name (ILIKE first_name OR last_name)', async () => {
      const email = `split-search-${Date.now()}@test.com`
      await request(testServer())
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email, first_name: 'Solène', last_name: 'Lateigne' })
      const res = await request(testServer())
        .get('/api/admin/users?search=Lateigne')
        .set('Authorization', `Bearer ${adminToken}`)
      expect(res.status).toBe(200)
      expect(res.body.users.some((u: { email: string }) => u.email === email)).toBe(true)
    })

    it('searches members by first_name (last_name distinct)', async () => {
      const email = `split-search-fn-${Date.now()}@test.com`
      await request(testServer())
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email, first_name: 'Solène', last_name: 'Lateigne' })
      const res = await request(testServer())
        .get('/api/admin/users?search=Solène')
        .set('Authorization', `Bearer ${adminToken}`)
      expect(res.status).toBe(200)
      expect(res.body.users.some((u: { email: string }) => u.email === email)).toBe(true)
    })

    it('efface last_name via null en update (D1, effaçable)', async () => {
      const created = await request(testServer())
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: `split-erase-${Date.now()}@test.com`, first_name: 'Marie', last_name: 'Curie' })
      expect(created.body.lastName).toBe('Curie')

      const res = await request(testServer())
        .put(`/api/admin/users/${created.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ last_name: null })
      expect(res.status).toBe(200)
      expect(res.body.lastName).toBeNull()
    })

    it('coerce last_name vide ("") en null en update (parité profession, D1)', async () => {
      const created = await request(testServer())
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: `split-erase-empty-${Date.now()}@test.com`, first_name: 'Luc', last_name: 'Martin' })
      expect(created.body.lastName).toBe('Martin')

      const res = await request(testServer())
        .put(`/api/admin/users/${created.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ last_name: '' })
      expect(res.status).toBe(200)
      expect(res.body.lastName).toBeNull()
    })
  })
})

