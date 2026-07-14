import request from 'supertest'
import jwt from 'jsonwebtoken'
import { testServer } from '../helpers/test-server'
import { query } from '../../db'

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret'

describe('Stats API', () => {
  let adminToken: string
  let adminUserId: string
  let testEventId: string

  /**
   * Helper pour créer un utilisateur admin de test
   */
  async function createTestAdmin() {
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`
    const userResult = await query(
      `INSERT INTO users (email, first_name, role)
       VALUES ($1, $2, $3)
       RETURNING id, email, first_name, role`,
      [`test-stats-admin-${uniqueSuffix}@example.com`, 'Test Admin', 'admin']
    )
    return userResult.rows[0]
  }

  /**
   * Helper pour créer un événement de test
   */
  async function createTestEvent(name: string) {
    const res = await request(testServer())
      .post('/api/admin/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name })
    return res.body.data
  }

  /**
   * Helper pour générer un token admin valide
   */
  function generateAdminToken(userId: string): string {
    return jwt.sign({ userId, role: 'admin' }, JWT_SECRET, { expiresIn: '1h' })
  }

  // Setup: Créer un admin et générer son token avant tous les tests
  beforeAll(async () => {
    const admin = await createTestAdmin()
    adminUserId = admin.id
    adminToken = generateAdminToken(adminUserId)
  })

  // Setup: Créer un événement de test
  beforeEach(async () => {
    const event = await createTestEvent('Test Stats Event')
    testEventId = event.id
  })

  // Nettoyer la base de données après chaque test
  afterEach(async () => {
    await query('DELETE FROM bookings WHERE slot_id IN (SELECT id FROM slots WHERE event_id = $1)', [testEventId])
    await query('DELETE FROM slots WHERE event_id = $1', [testEventId])
    await query('DELETE FROM events WHERE id = $1', [testEventId])
  })

  // Nettoyer l'admin à la fin
  afterAll(async () => {
    await query('DELETE FROM users WHERE id = $1', [adminUserId])
  })

  describe('GET /api/admin/stats (with event filter)', () => {
    let secondEventId: string

    // Setup: Créer un deuxième événement pour les tests de filtrage
    beforeEach(async () => {
      const event = await createTestEvent('Second Test Event')
      secondEventId = event.id
    })

    // Nettoyer le deuxième événement après chaque test
    afterEach(async () => {
      await query('DELETE FROM bookings WHERE slot_id IN (SELECT id FROM slots WHERE event_id = $1)', [secondEventId])
      await query('DELETE FROM slots WHERE event_id = $1', [secondEventId])
      await query('DELETE FROM events WHERE id = $1', [secondEventId])
    })

    it('retourne toutes les stats sans paramètre event_id', async () => {
      const res = await request(testServer())
        .get('/api/admin/stats')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data).toBeInstanceOf(Array)
      // Devrait avoir au moins 2 événements (testEventId et secondEventId)
      expect(res.body.data.length).toBeGreaterThanOrEqual(2)
    })

    it('filtre par événement avec event_id', async () => {
      const res = await request(testServer())
        .get(`/api/admin/stats?event_id=${testEventId}`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data).toBeInstanceOf(Array)
      expect(res.body.data.length).toBe(1)
      expect(res.body.data[0].eventId).toBe(testEventId)
    })

    it('retourne 404 si event_id invalide', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000'
      const res = await request(testServer())
        .get(`/api/admin/stats?event_id=${fakeId}`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(404)
      expect(res.body.error).toContain('non trouvé')
    })

    it('gère event_id vide comme "tous les événements"', async () => {
      const res = await request(testServer())
        .get('/api/admin/stats?event_id=')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      // Devrait retourner toutes les stats, pas seulement une
      expect(res.body.data.length).toBeGreaterThan(1)
    })

    it('retourne 401 sans authentification', async () => {
      const res = await request(testServer())
        .get('/api/admin/stats')

      expect(res.status).toBe(401)
    })
  })
})
