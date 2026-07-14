import request from 'supertest'
import jwt from 'jsonwebtoken'
import { testServer } from '../helpers/test-server'
import { query } from '../../db'

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret'

describe('Event Users API', () => {
  let adminToken: string
  let adminUserId: string
  let testEventId: string
  let testUserIds: string[]

  /**
   * Helper pour créer un utilisateur admin de test
   */
  async function createTestAdmin() {
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`
    const userResult = await query(
      `INSERT INTO users (email, first_name, role)
       VALUES ($1, $2, $3)
       RETURNING id, email, first_name, role`,
      [`test-event-users-admin-${uniqueSuffix}@example.com`, 'Test Admin', 'admin']
    )
    return userResult.rows[0]
  }

  /**
   * Helper pour créer des utilisateurs de test
   */
  async function createTestUser(index: number) {
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`
    const userResult = await query(
      `INSERT INTO users (email, first_name, role)
       VALUES ($1, $2, $3)
       RETURNING id, email, first_name, role`,
      [`test-event-users-user-${index}-${uniqueSuffix}@example.com`, `Test User ${index}`, 'user']
    )
    return userResult.rows[0]
  }

  /**
   * Helper pour créer un événement de test
   */
  async function createTestEvent() {
    const eventResult = await query(
      `INSERT INTO events (name, description)
       VALUES ($1, $2)
       RETURNING id`,
      ['test-event-users-event', 'Test event for users']
    )
    return eventResult.rows[0].id
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

  // Setup: Créer un événement et des utilisateurs pour les tests
  beforeEach(async () => {
    testEventId = await createTestEvent()
    testUserIds = []
    for (let i = 0; i < 3; i++) {
      const user = await createTestUser(i)
      testUserIds.push(user.id)
    }
  })

  // Nettoyer la base de données après chaque test
  afterEach(async () => {
    await query('DELETE FROM event_users WHERE event_id = $1', [testEventId])
    await query('DELETE FROM events WHERE id = $1', [testEventId])
    for (const userId of testUserIds) {
      await query('DELETE FROM users WHERE id = $1', [userId])
    }
  })

  // Nettoyer l'admin à la fin
  afterAll(async () => {
    await query('DELETE FROM users WHERE id = $1', [adminUserId])
  })

  describe('POST /api/admin/events/:id/users', () => {
    it('définit les utilisateurs autorisés pour un événement', async () => {
      const res = await request(testServer())
        .post(`/api/admin/events/${testEventId}/users`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userIds: testUserIds })

      expect(res.status).toBe(200)
      expect(res.body.data).toMatchObject({
        success: true,
        count: 3
      })
    })

    it('remplace la sélection existante', async () => {
      // Première sélection avec 2 utilisateurs
      await request(testServer())
        .post(`/api/admin/events/${testEventId}/users`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userIds: [testUserIds[0], testUserIds[1]] })

      // Remplacement avec 1 utilisateur
      const res = await request(testServer())
        .post(`/api/admin/events/${testEventId}/users`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userIds: [testUserIds[2]] })

      expect(res.status).toBe(200)
      expect(res.body.data.count).toBe(1)

      // Vérifier que seul le dernier utilisateur est sélectionné
      const users = await query(
        'SELECT user_id FROM event_users WHERE event_id = $1',
        [testEventId]
      )
      expect(users.rows.length).toBe(1)
      expect(users.rows[0].user_id).toBe(testUserIds[2])
    })

    it('accepte un tableau vide pour vider la sélection', async () => {
      // D'abord ajouter des utilisateurs
      await request(testServer())
        .post(`/api/admin/events/${testEventId}/users`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userIds: testUserIds })

      // Puis vider
      const res = await request(testServer())
        .post(`/api/admin/events/${testEventId}/users`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userIds: [] })

      expect(res.status).toBe(200)
      expect(res.body.data.count).toBe(0)

      // Vérifier que la table est vide
      const users = await query(
        'SELECT user_id FROM event_users WHERE event_id = $1',
        [testEventId]
      )
      expect(users.rows.length).toBe(0)
    })

    it('retourne 400 pour userIds invalide (pas UUID)', async () => {
      const res = await request(testServer())
        .post(`/api/admin/events/${testEventId}/users`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userIds: ['not-a-uuid'] })

      expect(res.status).toBe(400)
      expect(res.body.error).toContain('Format')
    })

    it('retourne 404 pour event inexistant', async () => {
      const fakeEventId = '00000000-0000-0000-0000-000000000000'
      const res = await request(testServer())
        .post(`/api/admin/events/${fakeEventId}/users`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userIds: testUserIds })

      expect(res.status).toBe(404)
      expect(res.body.error).toBe('Événement non trouvé')
    })

    it('retourne 404 pour user inexistant', async () => {
      const fakeUserId = '00000000-0000-4000-8000-000000000001'
      const res = await request(testServer())
        .post(`/api/admin/events/${testEventId}/users`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userIds: [fakeUserId] })

      expect(res.status).toBe(404)
      expect(res.body.error).toBe('Un ou plusieurs utilisateurs non trouvés')
    })

    it('retourne 401 sans auth', async () => {
      const res = await request(testServer())
        .post(`/api/admin/events/${testEventId}/users`)
        .send({ userIds: testUserIds })

      expect(res.status).toBe(401)
    })

    it('retourne 403 sans rôle admin', async () => {
      const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`
      const userResult = await query(
        `INSERT INTO users (email, first_name, role) VALUES ($1, $2, $3) RETURNING id`,
        [`test-event-users-nonadmin-${uniqueSuffix}@example.com`, 'Test NonAdmin', 'user']
      )
      const userToken = jwt.sign({ userId: userResult.rows[0].id, role: 'user' }, JWT_SECRET, { expiresIn: '1h' })

      const res = await request(testServer())
        .post(`/api/admin/events/${testEventId}/users`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ userIds: testUserIds })

      expect(res.status).toBe(403)

      // Nettoyer
      await query('DELETE FROM users WHERE id = $1', [userResult.rows[0].id])
    })

    it('gère les doublons dans userIds', async () => {
      const res = await request(testServer())
        .post(`/api/admin/events/${testEventId}/users`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userIds: [testUserIds[0], testUserIds[0], testUserIds[1]] })

      expect(res.status).toBe(200)
      // Le service déduplique, donc on attend 2 utilisateurs uniques
      expect(res.body.data.count).toBe(2)

      // Vérifier en base
      const users = await query(
        'SELECT user_id FROM event_users WHERE event_id = $1',
        [testEventId]
      )
      expect(users.rows.length).toBe(2)
    })
  })

  describe('GET /api/admin/events/:id/users', () => {
    it('retourne la liste des utilisateurs sélectionnés', async () => {
      // D'abord ajouter des utilisateurs
      await request(testServer())
        .post(`/api/admin/events/${testEventId}/users`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userIds: [testUserIds[0], testUserIds[1]] })

      const res = await request(testServer())
        .get(`/api/admin/events/${testEventId}/users`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body.data)).toBe(true)
      expect(res.body.data.length).toBe(2)
      expect(res.body.data[0]).toHaveProperty('id')
      expect(res.body.data[0]).toHaveProperty('email')
      expect(res.body.data[0]).toHaveProperty('firstName')
      expect(res.body.data[0]).toHaveProperty('role')
      expect(res.body.data[0]).toHaveProperty('lastName')
      expect(res.body.data[0]).not.toHaveProperty('fullName')
    })

    it('retourne un tableau vide si aucune sélection', async () => {
      const res = await request(testServer())
        .get(`/api/admin/events/${testEventId}/users`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(0)
    })

    it('retourne 401 sans auth', async () => {
      const res = await request(testServer())
        .get(`/api/admin/events/${testEventId}/users`)

      expect(res.status).toBe(401)
    })

    it('retourne 403 sans rôle admin', async () => {
      const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`
      const userResult = await query(
        `INSERT INTO users (email, first_name, role) VALUES ($1, $2, $3) RETURNING id`,
        [`test-event-users-get-nonadmin-${uniqueSuffix}@example.com`, 'Test NonAdmin', 'user']
      )
      const userToken = jwt.sign({ userId: userResult.rows[0].id, role: 'user' }, JWT_SECRET, { expiresIn: '1h' })

      const res = await request(testServer())
        .get(`/api/admin/events/${testEventId}/users`)
        .set('Authorization', `Bearer ${userToken}`)

      expect(res.status).toBe(403)

      // Nettoyer
      await query('DELETE FROM users WHERE id = $1', [userResult.rows[0].id])
    })
  })

  describe('POST /api/admin/events/:id/users/:userId', () => {
    it('ajoute un utilisateur à la sélection', async () => {
      const res = await request(testServer())
        .post(`/api/admin/events/${testEventId}/users/${testUserIds[0]}`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data).toMatchObject({ success: true })

      // Vérifier en base
      const users = await query(
        'SELECT user_id FROM event_users WHERE event_id = $1',
        [testEventId]
      )
      expect(users.rows.length).toBe(1)
      expect(users.rows[0].user_id).toBe(testUserIds[0])
    })

    it('ne crée pas de doublon (ON CONFLICT)', async () => {
      // Ajouter le même utilisateur deux fois
      await request(testServer())
        .post(`/api/admin/events/${testEventId}/users/${testUserIds[0]}`)
        .set('Authorization', `Bearer ${adminToken}`)

      const res = await request(testServer())
        .post(`/api/admin/events/${testEventId}/users/${testUserIds[0]}`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)

      // Vérifier qu'il n'y a qu'une association
      const users = await query(
        'SELECT user_id FROM event_users WHERE event_id = $1',
        [testEventId]
      )
      expect(users.rows.length).toBe(1)
    })

    it('retourne 404 si utilisateur inexistant', async () => {
      const fakeUserId = '00000000-0000-0000-0000-000000000001'
      const res = await request(testServer())
        .post(`/api/admin/events/${testEventId}/users/${fakeUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(404)
      expect(res.body.error).toBe('Utilisateur non trouvé')
    })

    it('retourne 404 si événement inexistant', async () => {
      const fakeEventId = '00000000-0000-0000-0000-000000000000'
      const res = await request(testServer())
        .post(`/api/admin/events/${fakeEventId}/users/${testUserIds[0]}`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(404)
      expect(res.body.error).toBe('Événement non trouvé')
    })

    it('retourne 401 sans auth', async () => {
      const res = await request(testServer())
        .post(`/api/admin/events/${testEventId}/users/${testUserIds[0]}`)

      expect(res.status).toBe(401)
    })
  })

  describe('DELETE /api/admin/events/:id/users/:userId', () => {
    it('retire un utilisateur de la sélection', async () => {
      // D'abord ajouter des utilisateurs
      await request(testServer())
        .post(`/api/admin/events/${testEventId}/users`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userIds: testUserIds })

      // Retirer le premier
      const res = await request(testServer())
        .delete(`/api/admin/events/${testEventId}/users/${testUserIds[0]}`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data).toMatchObject({ success: true })

      // Vérifier qu'il reste 2 utilisateurs
      const users = await query(
        'SELECT user_id FROM event_users WHERE event_id = $1',
        [testEventId]
      )
      expect(users.rows.length).toBe(2)
    })

    it('retourne 404 si l\'association n\'existe pas', async () => {
      const res = await request(testServer())
        .delete(`/api/admin/events/${testEventId}/users/${testUserIds[0]}`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(404)
      expect(res.body.error).toBe('Association utilisateur-événement non trouvée')
    })

    it('retourne 404 si événement inexistant', async () => {
      const fakeEventId = '00000000-0000-0000-0000-000000000000'
      const res = await request(testServer())
        .delete(`/api/admin/events/${fakeEventId}/users/${testUserIds[0]}`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(404)
      expect(res.body.error).toBe('Association utilisateur-événement non trouvée')
    })

    it('retourne 401 sans auth', async () => {
      const res = await request(testServer())
        .delete(`/api/admin/events/${testEventId}/users/${testUserIds[0]}`)

      expect(res.status).toBe(401)
    })
  })
})
