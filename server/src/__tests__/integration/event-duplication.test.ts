import request from 'supertest'
import jwt from 'jsonwebtoken'
import { testServer } from '../helpers/test-server'
import { query } from '../../db'

/**
 * Tests d'intégration pour la duplication d'événement
 * POST /api/admin/events/:id/duplicate
 *
 * Story 10-4: Dupliquer un Événement
 */
describe('POST /api/admin/events/:id/duplicate', () => {
  const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret'
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
      [`test-dup-admin-${uniqueSuffix}@example.com`, 'Test Admin', 'admin']
    )
    return userResult.rows[0]
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

  // Nettoyer après tous les tests
  afterAll(async () => {
    await query('DELETE FROM event_users WHERE user_id = $1', [adminUserId])
    await query('DELETE FROM users WHERE id = $1', [adminUserId])
  })

  /**
   * AC1: Créer une copie avec nom suffixé " (copie)", état Brouillon, sans créneaux
   */
  it('should duplicate event with suffixed name', async () => {
    const uniqueId = Date.now()
    const eventName = `Test Event Duplication ${uniqueId}`

    // 1. Créer un événement original
    const createRes = await request(testServer())
      .post('/api/admin/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: eventName,
        description: 'Original event description'
      })

    expect(createRes.status).toBe(201)
    const originalEvent = createRes.body.data

    // 2. Dupliquer l'événement
    const duplicateRes = await request(testServer())
      .post(`/api/admin/events/${originalEvent.id}/duplicate`)
      .set('Authorization', `Bearer ${adminToken}`)

    // 3. Vérifier la réponse
    expect(duplicateRes.status).toBe(201)
    const duplicatedEvent = duplicateRes.body.data

    // AC1: Le nom doit être suffixé de " (copie)"
    expect(duplicatedEvent.name).toBe(`${eventName} (copie)`)
    expect(duplicatedEvent.id).toBeDefined()
    expect(duplicatedEvent.id).not.toBe(originalEvent.id)

    // AC1: La description est copiée
    expect(duplicatedEvent.description).toBe('Original event description')

    // AC1/AC4: L'état doit être "Brouillon" (isPublished = false)
    expect(duplicatedEvent.isPublished).toBe(false)

    // AC1: opens_at doit être null (réinitialisé)
    expect(duplicatedEvent.opensAt).toBeNull()

    // Nettoyer
    await query('DELETE FROM events WHERE id = $1', [duplicatedEvent.id])
    await query('DELETE FROM events WHERE id = $1', [originalEvent.id])
  })

  /**
   * AC4: L'état est forcé à "Brouillon" même si l'original était publié
   */
  it('should force is_published = false even if original was published', async () => {
    const uniqueId = Date.now()
    const eventName = `Published Event ${uniqueId}`

    // 1. Créer un événement
    const createRes = await request(testServer())
      .post('/api/admin/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: eventName,
        description: 'Original description'
      })

    expect(createRes.status).toBe(201)
    const originalEvent = createRes.body.data

    // 2. Publier l'événement original
    const publishRes = await request(testServer())
      .put(`/api/admin/events/${originalEvent.id}/publish`)
      .set('Authorization', `Bearer ${adminToken}`)

    expect(publishRes.status).toBe(200)
    expect(publishRes.body.data.isPublished).toBe(true)

    // 3. Dupliquer l'événement publié
    const duplicateRes = await request(testServer())
      .post(`/api/admin/events/${originalEvent.id}/duplicate`)
      .set('Authorization', `Bearer ${adminToken}`)

    // 4. Vérifier que la copie est en brouillon
    expect(duplicateRes.status).toBe(201)
    expect(duplicateRes.body.data.isPublished).toBe(false)

    // Nettoyer
    const duplicatedId = duplicateRes.body.data.id
    await query('DELETE FROM events WHERE id = $1', [duplicatedId])
    await query('DELETE FROM events WHERE id = $1', [originalEvent.id])
  })

  /**
   * AC5: Les créneaux ne sont pas copiés
   */
  it('should not copy slots', async () => {
    const uniqueId = Date.now()
    const eventName = `Event With Slots ${uniqueId}`

    // 1. Créer un événement
    const createRes = await request(testServer())
      .post('/api/admin/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: eventName
      })

    expect(createRes.status).toBe(201)
    const originalEvent = createRes.body.data

    // 2. Créer des créneaux pour l'événement original
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(10, 0, 0, 0)

    const slotRes = await request(testServer())
      .post(`/api/admin/events/${originalEvent.id}/slots`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        startTime: tomorrow.toISOString(),
        endTime: new Date(tomorrow.getTime() + 2 * 60 * 60 * 1000).toISOString(),
        capacity: 5
      })

    expect(slotRes.status).toBe(201)

    // 3. Vérifier que l'original a des créneaux
    const originalSlotsRes = await request(testServer())
      .get(`/api/admin/events/${originalEvent.id}/slots`)
      .set('Authorization', `Bearer ${adminToken}`)

    expect(originalSlotsRes.status).toBe(200)
    expect(originalSlotsRes.body.data.length).toBeGreaterThan(0)

    // 4. Dupliquer l'événement
    const duplicateRes = await request(testServer())
      .post(`/api/admin/events/${originalEvent.id}/duplicate`)
      .set('Authorization', `Bearer ${adminToken}`)

    expect(duplicateRes.status).toBe(201)
    const duplicatedEvent = duplicateRes.body.data

    // 5. Vérifier que le duplicata n'a AUCUN créneau
    const duplicatedSlotsRes = await request(testServer())
      .get(`/api/admin/events/${duplicatedEvent.id}/slots`)
      .set('Authorization', `Bearer ${adminToken}`)

    expect(duplicatedSlotsRes.status).toBe(200)
    expect(duplicatedSlotsRes.body.data.length).toBe(0)

    // Nettoyer
    await query('DELETE FROM slots WHERE event_id = $1', [duplicatedEvent.id])
    await query('DELETE FROM slots WHERE event_id = $1', [originalEvent.id])
    await query('DELETE FROM events WHERE id = $1', [duplicatedEvent.id])
    await query('DELETE FROM events WHERE id = $1', [originalEvent.id])
  })

  /**
   * AC6: Les utilisateurs autorisés ne sont pas copiés
   */
  it('should not copy event_users', async () => {
    const uniqueId = Date.now()
    const eventName = `Event With Users ${uniqueId}`

    // 1. Créer un événement
    const createRes = await request(testServer())
      .post('/api/admin/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: eventName
      })

    expect(createRes.status).toBe(201)
    const originalEvent = createRes.body.data

    // 2. Créer un utilisateur
    const userEmail = `test-user-${uniqueId}@example.com`
    const userRes = await request(testServer())
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: userEmail,
        first_name: 'Test User'
      })

    expect(userRes.status).toBe(201)
    const testUser = userRes.body
    expect(testUser).toHaveProperty('id')
    const testUserId = testUser.id

    // 3. Ajouter l'utilisateur à l'événement original
    const addUserRes = await request(testServer())
      .post(`/api/admin/events/${originalEvent.id}/users/${testUserId}`)
      .set('Authorization', `Bearer ${adminToken}`)

    expect(addUserRes.status).toBe(200)

    // 4. Vérifier que l'original a des utilisateurs
    const originalUsersRes = await request(testServer())
      .get(`/api/admin/events/${originalEvent.id}/users`)
      .set('Authorization', `Bearer ${adminToken}`)

    expect(originalUsersRes.status).toBe(200)
    expect(originalUsersRes.body.data.length).toBeGreaterThan(0)

    // 5. Dupliquer l'événement
    const duplicateRes = await request(testServer())
      .post(`/api/admin/events/${originalEvent.id}/duplicate`)
      .set('Authorization', `Bearer ${adminToken}`)

    expect(duplicateRes.status).toBe(201)
    const duplicatedEvent = duplicateRes.body.data

    // 6. Vérifier que le duplicata n'a AUCUN utilisateur
    const duplicatedUsersRes = await request(testServer())
      .get(`/api/admin/events/${duplicatedEvent.id}/users`)
      .set('Authorization', `Bearer ${adminToken}`)

    expect(duplicatedUsersRes.status).toBe(200)
    expect(duplicatedUsersRes.body.data.length).toBe(0)

    // Nettoyer
    await query('DELETE FROM event_users WHERE event_id = $1', [duplicatedEvent.id])
    await query('DELETE FROM event_users WHERE event_id = $1', [originalEvent.id])
    await query('DELETE FROM event_users WHERE user_id = $1', [testUserId])
    await query('DELETE FROM users WHERE id = $1', [testUserId])
    await query('DELETE FROM events WHERE id = $1', [duplicatedEvent.id])
    await query('DELETE FROM events WHERE id = $1', [originalEvent.id])
  })

  /**
   * AC4: 404 si l'événement n'existe pas
   */
  it('should return 404 if event not found', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000'

    const res = await request(testServer())
      .post(`/api/admin/events/${fakeId}/duplicate`)
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(404)
    expect(res.body.error).toContain('non trouvé')
  })

  /**
   * Test: Nom avec " (copie)" si l'original a déjà ce suffixe
   */
  it('should add suffix even if original already has (copie)', async () => {
    const uniqueId = Date.now()

    // 1. Créer un événement avec le suffixe
    const createRes = await request(testServer())
      .post('/api/admin/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `Event (copie) ${uniqueId}`
      })

    expect(createRes.status).toBe(201)
    const originalEvent = createRes.body.data

    // 2. Dupliquer
    const duplicateRes = await request(testServer())
      .post(`/api/admin/events/${originalEvent.id}/duplicate`)
      .set('Authorization', `Bearer ${adminToken}`)

    expect(duplicateRes.status).toBe(201)
    // Le duplicata doit aussi avoir le suffixe
    expect(duplicateRes.body.data.name).toBe(`Event (copie) ${uniqueId} (copie)`)

    // Nettoyer
    const duplicatedId = duplicateRes.body.data.id
    await query('DELETE FROM events WHERE id = $1', [duplicatedId])
    await query('DELETE FROM events WHERE id = $1', [originalEvent.id])
  })

  /**
   * Test: Auth requise
   */
  it('should return 401 without auth token', async () => {
    const res = await request(testServer()).post('/api/admin/events/some-id/duplicate')

    expect(res.status).toBe(401)
  })

  /**
   * Test: Duplication multiple crée des noms uniques
   */
  it('should create unique names for multiple duplications', async () => {
    const uniqueId = Date.now()
    const eventName = `Multi Copy Event ${uniqueId}`

    // 1. Créer un événement original
    const createRes = await request(testServer())
      .post('/api/admin/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: eventName })

    expect(createRes.status).toBe(201)
    const originalEvent = createRes.body.data

    // 2. Première duplication
    const dup1Res = await request(testServer())
      .post(`/api/admin/events/${originalEvent.id}/duplicate`)
      .set('Authorization', `Bearer ${adminToken}`)

    expect(dup1Res.status).toBe(201)
    expect(dup1Res.body.data.name).toBe(`${eventName} (copie)`)

    // 3. Deuxième duplication (de la première copie)
    const dup1Event = dup1Res.body.data
    const dup2Res = await request(testServer())
      .post(`/api/admin/events/${dup1Event.id}/duplicate`)
      .set('Authorization', `Bearer ${adminToken}`)

    expect(dup2Res.status).toBe(201)
    expect(dup2Res.body.data.name).toBe(`${eventName} (copie) (copie)`)

    // Nettoyer
    await query('DELETE FROM events WHERE id = $1', [dup2Res.body.data.id])
    await query('DELETE FROM events WHERE id = $1', [dup1Event.id])
    await query('DELETE FROM events WHERE id = $1', [originalEvent.id])
  })
})
