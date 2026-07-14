import request from 'supertest'
import jwt from 'jsonwebtoken'
import { testServer } from '../helpers/test-server'
import { query } from '../../db'

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret'

describe('Events Opening Date API', () => {
  let testEventId: string
  let adminToken: string
  let adminUserId: string

  /**
   * Helper pour créer un utilisateur admin de test
   */
  async function createTestAdmin() {
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`
    const userResult = await query(
      `INSERT INTO users (email, first_name, role)
       VALUES ($1, $2, $3)
       RETURNING id, email, first_name, role`,
      [`test-opening-date-admin-${uniqueSuffix}@example.com`, 'Test Admin', 'admin']
    )
    return userResult.rows[0]
  }

  /**
   * Helper pour générer un token admin valide
   */
  function generateAdminToken(userId: string): string {
    return jwt.sign({ userId, role: 'admin' }, JWT_SECRET, { expiresIn: '1h' })
  }

  beforeAll(async () => {
    const admin = await createTestAdmin()
    adminUserId = admin.id
    adminToken = generateAdminToken(adminUserId)

    // Créer un événement de test
    const createRes = await request(testServer())
      .post('/api/admin/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Test Opening Date Event' })
    testEventId = createRes.body.data.id
  })

  afterAll(async () => {
    // Nettoyer
    await query(`DELETE FROM events WHERE name = 'Test Opening Date Event'`)
    await query(`DELETE FROM users WHERE id = $1`, [adminUserId])
  })

  describe('PUT /api/admin/events/:id/opening-date', () => {
    it('définit une date d\'ouverture', async () => {
      const opensAt = '2026-02-01T09:00:00.000Z'
      const res = await request(testServer())
        .put(`/api/admin/events/${testEventId}/opening-date`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ opensAt })

      expect(res.status).toBe(200)
      expect(res.body.data).toMatchObject({
        opensAt: '2026-02-01T09:00:00.000Z'
      })
    })

    it('supprime la date d\'ouverture (null)', async () => {
      // D'abord définir une date
      await request(testServer())
        .put(`/api/admin/events/${testEventId}/opening-date`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ opensAt: '2026-02-01T09:00:00.000Z' })

      // Puis la supprimer
      const res = await request(testServer())
        .put(`/api/admin/events/${testEventId}/opening-date`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ opensAt: null })

      expect(res.status).toBe(200)
      expect(res.body.data.opensAt).toBeNull()
    })

    it('retourne 401 sans auth', async () => {
      const res = await request(testServer())
        .put(`/api/admin/events/${testEventId}/opening-date`)
        .send({ opensAt: '2026-02-01T09:00:00.000Z' })

      expect(res.status).toBe(401)
    })

    it('retourne 403 sans rôle admin', async () => {
      // Créer un user non-admin (rôle = user)
      const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`
      const userResult = await query(
        `INSERT INTO users (email, first_name, role)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [`test-opening-date-user-${uniqueSuffix}@example.com`, 'Test User', 'user']
      )

      const userToken = jwt.sign({ userId: userResult.rows[0].id, role: 'user' }, JWT_SECRET, { expiresIn: '1h' })
      const res = await request(testServer())
        .put(`/api/admin/events/${testEventId}/opening-date`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ opensAt: '2026-02-01T09:00:00.000Z' })

      expect(res.status).toBe(403)

      // Nettoyer
      await query(`DELETE FROM users WHERE id = $1`, [userResult.rows[0].id])
    })

    it('retourne 404 pour ID invalide', async () => {
      const res = await request(testServer())
        .put('/api/admin/events/00000000-0000-0000-0000-000000000000/opening-date')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ opensAt: '2026-02-01T09:00:00.000Z' })

      expect(res.status).toBe(404)
    })

    it('accepte les dates passées (warning seulement)', async () => {
      const pastDate = '2020-01-01T09:00:00.000Z'
      const res = await request(testServer())
        .put(`/api/admin/events/${testEventId}/opening-date`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ opensAt: pastDate })

      expect(res.status).toBe(200)
      expect(res.body.data.opensAt).toBe(pastDate)
    })

    it('valide le format de date', async () => {
      const res = await request(testServer())
        .put(`/api/admin/events/${testEventId}/opening-date`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ opensAt: 'invalid-date' })

      expect(res.status).toBe(400)
    })
  })
})
