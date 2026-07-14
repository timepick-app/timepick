import request from 'supertest'
import jwt from 'jsonwebtoken'
import { testServer } from '../helpers/test-server'
import { query } from '../../db'

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret'

/**
 * Helper pour générer un token valide
 */
function generateToken(userId: string, role: string = 'user'): string {
  return jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: '1h' })
}

describe('Public Event Access API with Authorization', () => {
  let testEventUuid: string
  let draftEventUuid: string
  let adminToken: string
  let userToken: string
  let otherUserToken: string
  let adminUserId: string
  let userId: string
  let otherUserId: string

  beforeAll(async () => {
    // Créer un admin pour les tests
    const adminRes = await query(
      `INSERT INTO users (email, first_name, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE SET role = $3
       RETURNING id`,
      ['admin-test-public@local.dev', 'Admin Test', 'admin']
    )
    adminUserId = adminRes.rows[0].id
    adminToken = generateToken(adminUserId, 'admin')

    // Créer un utilisateur autorisé
    const userRes = await query(
      `INSERT INTO users (email, first_name, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE SET role = $3
       RETURNING id`,
      ['user-test-public@local.dev', 'User Test', 'user']
    )
    userId = userRes.rows[0].id
    userToken = generateToken(userId, 'user')

    // Créer un utilisateur non autorisé
    const otherUserRes = await query(
      `INSERT INTO users (email, first_name, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE SET role = $3
       RETURNING id`,
      ['other-test-public@local.dev', 'Other User', 'user']
    )
    otherUserId = otherUserRes.rows[0].id
    otherUserToken = generateToken(otherUserId, 'user')

    // Créer un événement publié
    const eventRes = await query(
      `INSERT INTO events (name, description, is_published, opens_at)
       VALUES ($1, $2, true, NULL)
       RETURNING id`,
      ['Test Public Event', 'This is a test event for public access']
    )
    testEventUuid = eventRes.rows[0].id

    // Créer un événement non publié (brouillon)
    const draftRes = await query(
      `INSERT INTO events (name, description, is_published)
       VALUES ($1, $2, false)
       RETURNING id`,
      ['Draft Event', 'This event is not published']
    )
    draftEventUuid = draftRes.rows[0].id

    // Ajouter l'utilisateur autorisé et l'admin à event_users
    await query(
      `INSERT INTO event_users (event_id, user_id)
       VALUES ($1, $2), ($1, $3)`,
      [testEventUuid, userId, adminUserId]
    )
  })

  afterAll(async () => {
    // Nettoyer les données de test
    await query(`DELETE FROM event_users WHERE event_id = $1`, [testEventUuid])
    await query(`DELETE FROM events WHERE id IN ($1, $2)`, [testEventUuid, draftEventUuid])
    await query(`DELETE FROM users WHERE email IN ($1, $2, $3)`, [
      'admin-test-public@local.dev',
      'user-test-public@local.dev',
      'other-test-public@local.dev'
    ])
  })

  describe('GET /api/public/events/:uuid', () => {
    it('retourne 200 pour événement publié avec admin auth', async () => {
      const res = await request(testServer())
        .get(`/api/public/events/${testEventUuid}`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveProperty('name', 'Test Public Event')
      expect(res.body.data).toHaveProperty('isPublished', true)
      expect(res.body.data).toHaveProperty('canReserve')
      expect(res.body.data).toHaveProperty('slots')
    })

    it('retourne 200 pour utilisateur autorisé dans event_users', async () => {
      const res = await request(testServer())
        .get(`/api/public/events/${testEventUuid}`)
        .set('Authorization', `Bearer ${userToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveProperty('name', 'Test Public Event')
      expect(res.body.data).toHaveProperty('canReserve', true)
      expect(res.body.data).toHaveProperty('slots')
    })

    it('retourne 200 pour utilisateur non authentifié (mode consultation)', async () => {
      const res = await request(testServer())
        .get(`/api/public/events/${testEventUuid}`)
        // Pas de header Authorization

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveProperty('name', 'Test Public Event')
      expect(res.body.data).toHaveProperty('canReserve', false)
      expect(res.body.data).toHaveProperty('slots')
    })

    it('retourne 403 pour utilisateur authentifié non autorisé (pas dans event_users)', async () => {
      const res = await request(testServer())
        .get(`/api/public/events/${testEventUuid}`)
        .set('Authorization', `Bearer ${otherUserToken}`)

      expect(res.status).toBe(403)
      expect(res.body.error).toMatch(/autorisé/i)
    })

    it('retourne 403 pour événement non publié (brouillon)', async () => {
      const res = await request(testServer())
        .get(`/api/public/events/${draftEventUuid}`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(403)
      expect(res.body.error).toContain('pas encore accessible')
    })

    it('retourne 404 pour UUID inexistant', async () => {
      const fakeUuid = '00000000-0000-0000-0000-000000000000'
      const res = await request(testServer())
        .get(`/api/public/events/${fakeUuid}`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(404)
    })

    it('retourne des slots vides pour utilisateur autorisé', async () => {
      const res = await request(testServer())
        .get(`/api/public/events/${testEventUuid}`)
        .set('Authorization', `Bearer ${userToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveProperty('slots')
      expect(Array.isArray(res.body.data.slots)).toBe(true)
    })

  })

  // Story 11.5: Tests spécifiques pour le bypass admin
  describe('Story 11.5: Admin bypass event_users authorization', () => {
    let adminOnlyEventUuid: string
    let adminBypassUserId: string
    let adminBypassToken: string

    beforeAll(async () => {
      // Créer un admin dédié pour ce test (pour éviter les conflits)
      const adminRes = await query(
        `INSERT INTO users (email, first_name, role)
         VALUES ($1, $2, $3)
         ON CONFLICT (email) DO UPDATE SET role = $3
         RETURNING id`,
        ['admin-bypass-test@local.dev', 'Admin Bypass Test', 'admin']
      )
      adminBypassUserId = adminRes.rows[0].id
      adminBypassToken = generateToken(adminBypassUserId, 'admin')

      // Créer un événement publié SANS ajouter l'admin à event_users
      const eventRes = await query(
        `INSERT INTO events (name, description, is_published, opens_at)
         VALUES ($1, $2, true, NULL)
         RETURNING id`,
        ['Admin Bypass Event', 'Event to test admin bypass without event_users']
      )
      adminOnlyEventUuid = eventRes.rows[0].id

      // NOTE: On ajoute intentionnellement PAS l'admin à event_users
      // pour tester le bypass du rôle admin (Story 11.5 AC2)
    })

    afterAll(async () => {
      await query(`DELETE FROM events WHERE id = $1`, [adminOnlyEventUuid])
      await query(`DELETE FROM users WHERE email = $1`, ['admin-bypass-test@local.dev'])
    })

    it('AC2: admin NOT in event_users can access published event (bypass)', async () => {
      // Vérifier que l'admin n'est PAS dans event_users pour cet événement
      const eventUsersCheck = await query(
        `SELECT COUNT(*) FROM event_users WHERE event_id = $1 AND user_id = $2`,
        [adminOnlyEventUuid, adminBypassUserId]
      )
      expect(parseInt(eventUsersCheck.rows[0].count)).toBe(0)

      const res = await request(testServer())
        .get(`/api/public/events/${adminOnlyEventUuid}`)
        .set('Authorization', `Bearer ${adminBypassToken}`)

      // AC2: L'admin devrait avoir 200 même SANS être dans event_users
      expect(res.status).toBe(200)
      expect(res.body.data).toHaveProperty('name', 'Admin Bypass Event')
      expect(res.body.data).toHaveProperty('slots')
    })

    it('regular user still blocked if not in event_users (AC3)', async () => {
      const res = await request(testServer())
        .get(`/api/public/events/${adminOnlyEventUuid}`)
        .set('Authorization', `Bearer ${otherUserToken}`)

      // AC3: Utilisateur standard toujours bloqué
      expect(res.status).toBe(403)
      expect(res.body.error).toMatch(/autorisé/i)
    })
  })
})
