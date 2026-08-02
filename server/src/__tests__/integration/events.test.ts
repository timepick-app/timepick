import request from 'supertest'
import jwt from 'jsonwebtoken'
import { testServer } from '../helpers/test-server'
import { query } from '../../db'
import {
  startTestTransaction,
  rollbackTestTransaction
} from '../helpers/transaction'

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret'

describe('Events API', () => {
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
      [`test-events-admin-${uniqueSuffix}@example.com`, 'Test Admin', 'admin']
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

  // Nettoyer la base de données après chaque test via transaction rollback
  beforeEach(async () => {
    await startTestTransaction()
  })

  afterEach(async () => {
    await rollbackTestTransaction()
  })

  describe('POST /api/admin/events', () => {
    it('crée un événement avec name et description', async () => {
      const res = await request(testServer())
        .post('/api/admin/events')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Test Event',
          description: 'Test description'
        })

      expect(res.status).toBe(201)
      expect(res.body.data).toMatchObject({
        name: 'Test Event',
        description: 'Test description',
        isPublished: false
      })
      expect(res.body.data).toHaveProperty('id')
      expect(res.body.data).toHaveProperty('createdAt')
      expect(res.body.data).toHaveProperty('updatedAt')
    })

    it('crée un événement avec seulement le nom (description optionnelle)', async () => {
      const res = await request(testServer())
        .post('/api/admin/events')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Test Event No Description'
        })

      expect(res.status).toBe(201)
      expect(res.body.data).toMatchObject({
        name: 'Test Event No Description',
        description: null,
        isPublished: false
      })
    })

    it('retourne 400 si le nom est vide', async () => {
      const res = await request(testServer())
        .post('/api/admin/events')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: '' })

      expect(res.status).toBe(400)
      expect(res.body.error).toBeTruthy()
    })

    it('crée un événement avec opensAt (ISO 8601) et le persiste', async () => {
      const opensAt = '2026-09-01T08:00:00.000Z'
      const res = await request(testServer())
        .post('/api/admin/events')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Événement avec date', opensAt })

      expect(res.status).toBe(201)
      expect(res.body.data).toMatchObject({
        name: 'Événement avec date',
        isPublished: false
      })
      expect(res.body.data.opensAt).toBeTruthy()
      expect(new Date(res.body.data.opensAt).toISOString()).toBe(opensAt)
    })

    it('retourne 400 si name dépasse 200 caractères', async () => {
      const res = await request(testServer())
        .post('/api/admin/events')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'a'.repeat(201) })

      expect(res.status).toBe(400)
      expect(res.body.error).toContain('200')
    })

    it('retourne 401 sans auth', async () => {
      const res = await request(testServer())
        .post('/api/admin/events')
        .send({ name: 'Test Event' })

      expect(res.status).toBe(401)
    })

    it('retourne 403 sans rôle admin', async () => {
      // Créer un utilisateur régulier (membre)
      const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`
      const userResult = await query(
        `INSERT INTO users (email, first_name, role) VALUES ($1, $2, $3) RETURNING id`,
        [`test-events-user-${uniqueSuffix}@example.com`, 'Test User', 'user']
      )
      const userToken = jwt.sign({ userId: userResult.rows[0].id, role: 'user' }, JWT_SECRET, { expiresIn: '1h' })

      const res = await request(testServer())
        .post('/api/admin/events')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ name: 'Test Event' })

      expect(res.status).toBe(403)

      // Nettoyer
      await query('DELETE FROM users WHERE id = $1', [userResult.rows[0].id])
    })

    it('P0 — opensAt:null persiste NULL (pas epoch 1970)', async () => {
      const name = `Événement null-date-${Date.now()}`
      const res = await request(testServer())
        .post('/api/admin/events')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name, opensAt: null })

      expect(res.status).toBe(201)
      expect(res.body.data.opensAt).toBeNull()
    })

    it('F4 — opensAt datetime-local naïf accepté et persisté', async () => {
      const name = `Événement datetime-local-${Date.now()}`
      const res = await request(testServer())
        .post('/api/admin/events')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name, opensAt: '2026-09-01T08:00' })

      expect(res.status).toBe(201)
      expect(res.body.data.opensAt).not.toBeNull()
    })

    it('P3 — nom composé uniquement d\'espaces retourne 400', async () => {
      const res = await request(testServer())
        .post('/api/admin/events')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: '   ' })

      expect(res.status).toBe(400)
      expect(res.body.error).toBeTruthy()
    })

    it('F6 — doublon de nom retourne 409 avec message mentionnant le nom', async () => {
      const name = `Événement doublon-${Date.now()}`

      const first = await request(testServer())
        .post('/api/admin/events')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name })
      expect(first.status).toBe(201)

      const second = await request(testServer())
        .post('/api/admin/events')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name })
      expect(second.status).toBe(409)
      expect(second.body.error).toMatch(/nom/i)
    })
  })

  describe('GET /api/admin/events', () => {
    it('liste tous les événements', async () => {
      // Créer quelques événements de test
      await request(testServer())
        .post('/api/admin/events')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Test Event 1' })

      await request(testServer())
        .post('/api/admin/events')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Test Event 2' })

      const res = await request(testServer())
        .get('/api/admin/events')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body.data)).toBe(true)
      expect(res.body.data.length).toBeGreaterThanOrEqual(2)
    })

    it('retourne un tableau vide si aucun événement', async () => {
      const res = await request(testServer())
        .get('/api/admin/events')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body.data)).toBe(true)
    })

    it('retourne 401 sans auth', async () => {
      const res = await request(testServer())
        .get('/api/admin/events')

      expect(res.status).toBe(401)
    })

    it('retourne 403 sans rôle admin', async () => {
      // Créer un utilisateur régulier (membre)
      const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`
      const userResult = await query(
        `INSERT INTO users (email, first_name, role) VALUES ($1, $2, $3) RETURNING id`,
        [`test-events-get-user-${uniqueSuffix}@example.com`, 'Test User', 'user']
      )
      const userToken = jwt.sign({ userId: userResult.rows[0].id, role: 'user' }, JWT_SECRET, { expiresIn: '1h' })

      const res = await request(testServer())
        .get('/api/admin/events')
        .set('Authorization', `Bearer ${userToken}`)

      expect(res.status).toBe(403)

      // Nettoyer
      await query('DELETE FROM users WHERE id = $1', [userResult.rows[0].id])
    })
  })

  describe('GET /api/admin/events/:id', () => {
    it('récupère un événement par ID', async () => {
      // Créer un événement
      const createRes = await request(testServer())
        .post('/api/admin/events')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Test Event GetByID' })

      const eventId = createRes.body.data.id

      const res = await request(testServer())
        .get(`/api/admin/events/${eventId}`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data).toMatchObject({
        id: eventId,
        name: 'Test Event GetByID'
      })
    })

    it('retourne 404 si événement inexistant', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000'
      const res = await request(testServer())
        .get(`/api/admin/events/${fakeId}`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(404)
      expect(res.body.error).toBe('Événement non trouvé')
    })
  })

  describe('hasCustomInvitation field (FR59 — E3.S1)', () => {
    const customMjmlBody = '<!-- BODY:START --><mj-text>perso</mj-text><!-- BODY:END -->'

    it('GET /api/admin/events retourne hasCustomInvitation=false pour un événement fraîchement créé', async () => {
      const createRes = await request(testServer())
        .post('/api/admin/events')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Event Default Template' })

      const eventId = createRes.body.data.id

      const res = await request(testServer())
        .get('/api/admin/events')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      const found = res.body.data.find((e: { id: string }) => e.id === eventId)
      expect(found).toBeDefined()
      expect(found.hasCustomInvitation).toBe(false)
    })

    it('GET /api/admin/events retourne hasCustomInvitation=true après UPDATE invitation_mjml', async () => {
      const createRes = await request(testServer())
        .post('/api/admin/events')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Event Custom Template' })

      const eventId = createRes.body.data.id

      await query('UPDATE events SET invitation_mjml = $1 WHERE id = $2', [customMjmlBody, eventId])

      const res = await request(testServer())
        .get('/api/admin/events')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      const found = res.body.data.find((e: { id: string }) => e.id === eventId)
      expect(found).toBeDefined()
      expect(found.hasCustomInvitation).toBe(true)
    })

    it('GET /api/admin/events/:id retourne hasCustomInvitation=false pour un événement fraîchement créé', async () => {
      const createRes = await request(testServer())
        .post('/api/admin/events')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Event Detail Default' })

      const eventId = createRes.body.data.id

      const res = await request(testServer())
        .get(`/api/admin/events/${eventId}`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data.hasCustomInvitation).toBe(false)
    })

    it('GET /api/admin/events/:id retourne hasCustomInvitation=true après UPDATE invitation_mjml', async () => {
      const createRes = await request(testServer())
        .post('/api/admin/events')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Event Detail Custom' })

      const eventId = createRes.body.data.id

      await query('UPDATE events SET invitation_mjml = $1 WHERE id = $2', [customMjmlBody, eventId])

      const res = await request(testServer())
        .get(`/api/admin/events/${eventId}`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data.hasCustomInvitation).toBe(true)
    })

    it('POST /api/admin/events retourne hasCustomInvitation=false dans la réponse de création', async () => {
      const res = await request(testServer())
        .post('/api/admin/events')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Event Create Returns Field' })

      expect(res.status).toBe(201)
      expect(res.body.data.hasCustomInvitation).toBe(false)
    })

    it('PUT /api/admin/events/:id préserve hasCustomInvitation=true dans la réponse après UPDATE invitation_mjml', async () => {
      const createRes = await request(testServer())
        .post('/api/admin/events')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Event Put Preserves Field' })

      const eventId = createRes.body.data.id

      await query('UPDATE events SET invitation_mjml = $1 WHERE id = $2', [customMjmlBody, eventId])

      const res = await request(testServer())
        .put(`/api/admin/events/${eventId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Event Put Preserves Field Renamed' })

      expect(res.status).toBe(200)
      expect(res.body.data.hasCustomInvitation).toBe(true)
    })

    it('GET /api/admin/events retourne hasCustomInvitation=true pour un événement coque-seule (sans body override)', async () => {
      const createRes = await request(testServer())
        .post('/api/admin/events')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Event Shell Only List' })

      const eventId = createRes.body.data.id

      // Seed a shell_parts row for this event (header only, no invitation_mjml)
      await query(
        `INSERT INTO shell_parts (owner_kind, owner_id, part_kind, content_mjml)
         VALUES ('event', $1, 'header', '<mj-section><mj-column><mj-text>Shell header</mj-text></mj-column></mj-section>')
         ON CONFLICT (owner_kind, owner_id, part_kind) DO UPDATE SET content_mjml = EXCLUDED.content_mjml`,
        [eventId]
      )

      const res = await request(testServer())
        .get('/api/admin/events')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      const found = res.body.data.find((e: { id: string }) => e.id === eventId)
      expect(found).toBeDefined()
      expect(found.hasCustomInvitation).toBe(true)

      await query(`DELETE FROM shell_parts WHERE owner_kind = 'event' AND owner_id = $1`, [eventId])
    })

    it('GET /api/admin/events/:id retourne hasCustomInvitation=true pour un événement coque-seule (sans body override)', async () => {
      const createRes = await request(testServer())
        .post('/api/admin/events')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Event Shell Only Detail' })

      const eventId = createRes.body.data.id

      // Seed a shell_parts row for this event (header only, no invitation_mjml)
      await query(
        `INSERT INTO shell_parts (owner_kind, owner_id, part_kind, content_mjml)
         VALUES ('event', $1, 'header', '<mj-section><mj-column><mj-text>Shell header</mj-text></mj-column></mj-section>')
         ON CONFLICT (owner_kind, owner_id, part_kind) DO UPDATE SET content_mjml = EXCLUDED.content_mjml`,
        [eventId]
      )

      const res = await request(testServer())
        .get(`/api/admin/events/${eventId}`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data.hasCustomInvitation).toBe(true)

      await query(`DELETE FROM shell_parts WHERE owner_kind = 'event' AND owner_id = $1`, [eventId])
    })

    it('PUT /api/admin/events/:id retourne hasCustomInvitation=true pour un événement coque-seule (RETURNING corrélé)', async () => {
      const createRes = await request(testServer())
        .post('/api/admin/events')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Event Shell Only Put' })

      const eventId = createRes.body.data.id

      // Seed a shell_parts row for this event (no invitation_mjml)
      await query(
        `INSERT INTO shell_parts (owner_kind, owner_id, part_kind, content_mjml)
         VALUES ('event', $1, 'footer', '<mj-section><mj-column><mj-text>Shell footer</mj-text></mj-column></mj-section>')
         ON CONFLICT (owner_kind, owner_id, part_kind) DO UPDATE SET content_mjml = EXCLUDED.content_mjml`,
        [eventId]
      )

      const res = await request(testServer())
        .put(`/api/admin/events/${eventId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Event Shell Only Put Renamed' })

      expect(res.status).toBe(200)
      expect(res.body.data.hasCustomInvitation).toBe(true)

      await query(`DELETE FROM shell_parts WHERE owner_kind = 'event' AND owner_id = $1`, [eventId])
    })
  })

  describe('PUT /api/admin/events/:id', () => {
    it('met à jour le nom d\'un événement', async () => {
      const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`
      const createRes = await request(testServer())
        .post('/api/admin/events')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: `Test Event Update ${uniqueSuffix}` })

      const eventId = createRes.body.data.id

      const res = await request(testServer())
        .put(`/api/admin/events/${eventId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: `Updated Event Name ${uniqueSuffix}` })

      expect(res.status).toBe(200)
      expect(res.body.data).toMatchObject({
        id: eventId,
        name: `Updated Event Name ${uniqueSuffix}`
      })
    })

    it('met à jour is_published à true', async () => {
      const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`
      const createRes = await request(testServer())
        .post('/api/admin/events')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: `Test Event Publish ${uniqueSuffix}` })

      const eventId = createRes.body.data.id

      const res = await request(testServer())
        .put(`/api/admin/events/${eventId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isPublished: true })

      expect(res.status).toBe(200)
      expect(res.body.data).toMatchObject({
        id: eventId,
        isPublished: true
      })
    })

    it('retourne 400 si aucun champ à mettre à jour', async () => {
      const createRes = await request(testServer())
        .post('/api/admin/events')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Test Event Empty Update' })

      const eventId = createRes.body.data.id

      const res = await request(testServer())
        .put(`/api/admin/events/${eventId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})

      expect(res.status).toBe(400)
      expect(res.body.error).toBe("Aucune donnée à mettre à jour. Modifiez au moins une information avant d'enregistrer.")
      // Le refus porte son code : il devient affichable au lieu de retomber
      // sur la phrase générique de l'appelant.
      expect(res.body.code).toBe('NO_FIELDS_TO_UPDATE')
    })

    it('retourne 409 si le nom existe déjà', async () => {
      const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`

      // Créer un premier événement
      await request(testServer())
        .post('/api/admin/events')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: `Existing Event ${uniqueSuffix}` })

      // Créer un deuxième événement
      const createRes = await request(testServer())
        .post('/api/admin/events')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: `Event To Update ${uniqueSuffix}` })

      const eventId = createRes.body.data.id

      // Essayer de mettre à jour le deuxième événement avec le nom du premier
      const res = await request(testServer())
        .put(`/api/admin/events/${eventId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: `Existing Event ${uniqueSuffix}` })

      expect(res.status).toBe(409)
      expect(res.body.error).toContain('nom')
    })
  })

  describe('DELETE /api/admin/events/:id', () => {
    it('supprime un événement', async () => {
      const createRes = await request(testServer())
        .post('/api/admin/events')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Test Event Delete' })

      const eventId = createRes.body.data.id

      const res = await request(testServer())
        .delete(`/api/admin/events/${eventId}`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(204)

      // Vérifier que l'événement n'existe plus
      const getRes = await request(testServer())
        .get(`/api/admin/events/${eventId}`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(getRes.status).toBe(404)
    })

    it('retourne 404 si événement inexistant', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000'
      const res = await request(testServer())
        .delete(`/api/admin/events/${fakeId}`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(404)
    })
  })

  describe('PUT /api/admin/events/:id/publish', () => {
    it('retourne 400 si le nom est vide', async () => {
      // Le nom est requis à la création : on crée avec un nom valide, puis on le vide
      // via update (updateEventSchema autorise le nom vide) pour atteindre la garde de publication.
      const createRes = await request(testServer())
        .post('/api/admin/events')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: `Publish Vide ${Date.now()}` })

      const eventId = createRes.body.data.id

      await request(testServer())
        .put(`/api/admin/events/${eventId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: '' })

      const res = await request(testServer())
        .put(`/api/admin/events/${eventId}/publish`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(400)
      expect(res.body.error).toContain('nom')
    })

    it('publie un événement (is_published = true)', async () => {
      const createRes = await request(testServer())
        .post('/api/admin/events')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Test Event Publish' })

      const eventId = createRes.body.data.id

      const res = await request(testServer())
        .put(`/api/admin/events/${eventId}/publish`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data).toMatchObject({
        id: eventId,
        isPublished: true
      })
    })

    it('retourne 401 sans auth', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000'
      const res = await request(testServer())
        .put(`/api/admin/events/${fakeId}/publish`)

      expect(res.status).toBe(401)
    })

    it('retourne 403 sans rôle admin', async () => {
      // Créer un utilisateur régulier (membre)
      const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`
      const userResult = await query(
        `INSERT INTO users (email, first_name, role) VALUES ($1, $2, $3) RETURNING id`,
        [`test-events-publish-user-${uniqueSuffix}@example.com`, 'Test User', 'user']
      )
      const userToken = jwt.sign({ userId: userResult.rows[0].id, role: 'user' }, JWT_SECRET, { expiresIn: '1h' })

      const res = await request(testServer())
        .put(`/api/admin/events/00000000-0000-0000-0000-000000000000/publish`)
        .set('Authorization', `Bearer ${userToken}`)

      expect(res.status).toBe(403)

      // Nettoyer
      await query('DELETE FROM users WHERE id = $1', [userResult.rows[0].id])
    })

    it('retourne 404 pour ID invalide', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000'
      const res = await request(testServer())
        .put(`/api/admin/events/${fakeId}/publish`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(404)
      expect(res.body.error).toBe('Événement non trouvé')
    })
  })

  describe('PUT /api/admin/events/:id/unpublish', () => {
    it('dépublie un événement (is_published = false)', async () => {
      // D'abord créer et publier l'événement
      const createRes = await request(testServer())
        .post('/api/admin/events')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Test Event Unpublish' })

      const eventId = createRes.body.data.id

      await request(testServer())
        .put(`/api/admin/events/${eventId}/publish`)
        .set('Authorization', `Bearer ${adminToken}`)

      // Puis le dépublier
      const res = await request(testServer())
        .put(`/api/admin/events/${eventId}/unpublish`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data).toMatchObject({
        id: eventId,
        isPublished: false
      })
    })

    it('retourne 401 sans auth', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000'
      const res = await request(testServer())
        .put(`/api/admin/events/${fakeId}/unpublish`)

      expect(res.status).toBe(401)
    })

    it('retourne 403 sans rôle admin', async () => {
      // Créer un utilisateur régulier (membre)
      const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`
      const userResult = await query(
        `INSERT INTO users (email, first_name, role) VALUES ($1, $2, $3) RETURNING id`,
        [`test-events-unpublish-user-${uniqueSuffix}@example.com`, 'Test User', 'user']
      )
      const userToken = jwt.sign({ userId: userResult.rows[0].id, role: 'user' }, JWT_SECRET, { expiresIn: '1h' })

      const res = await request(testServer())
        .put(`/api/admin/events/00000000-0000-0000-0000-000000000000/unpublish`)
        .set('Authorization', `Bearer ${userToken}`)

      expect(res.status).toBe(403)

      // Nettoyer
      await query('DELETE FROM users WHERE id = $1', [userResult.rows[0].id])
    })

    it('retourne 404 pour ID invalide', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000'
      const res = await request(testServer())
        .put(`/api/admin/events/${fakeId}/unpublish`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(404)
      expect(res.body.error).toBe('Événement non trouvé')
    })
  })

  describe('GET /api/events (public)', () => {
    it('liste uniquement les événements publiés', async () => {
      // Créer un événement publié
      await request(testServer())
        .post('/api/admin/events')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Test Event Public Published' })

      const publishedRes = await request(testServer())
        .post('/api/admin/events')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Test Event Public Published 2' })

      const publishedId = publishedRes.body.data.id

      await request(testServer())
        .put(`/api/admin/events/${publishedId}/publish`)
        .set('Authorization', `Bearer ${adminToken}`)

      // Appel public sans auth
      const res = await request(testServer())
        .get('/api/events')

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body.data)).toBe(true)
      // Tous les événements retournés doivent être publiés
      res.body.data.forEach((event: any) => {
        expect(event.isPublished).toBe(true)
      })
    })

    it('retourne un tableau vide si aucun événement publié', async () => {
      const res = await request(testServer())
        .get('/api/events')

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body.data)).toBe(true)
    })
  })

  describe('GET /api/events/:id (public)', () => {
    it('récupère un événement publié par ID', async () => {
      // Créer et publier un événement
      const createRes = await request(testServer())
        .post('/api/admin/events')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Test Public Event', description: 'Public description' })

      const eventId = createRes.body.data.id

      await request(testServer())
        .put(`/api/admin/events/${eventId}/publish`)
        .set('Authorization', `Bearer ${adminToken}`)

      // Appel public sans auth
      const res = await request(testServer())
        .get(`/api/events/${eventId}`)

      expect(res.status).toBe(200)
      expect(res.body.data).toMatchObject({
        id: eventId,
        name: 'Test Public Event',
        description: 'Public description',
        isPublished: true
      })
    })

    it('retourne 404 pour un événement non publié', async () => {
      // Créer un événement sans le publier
      const createRes = await request(testServer())
        .post('/api/admin/events')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Test Unpublished Event' })

      const eventId = createRes.body.data.id

      // Appel public - devrait retourner 404 car non publié
      const res = await request(testServer())
        .get(`/api/events/${eventId}`)

      expect(res.status).toBe(404)
      expect(res.body.error).toBe('Événement non trouvé ou non publié')
    })

    it('retourne 404 pour un ID invalide', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000'
      const res = await request(testServer())
        .get(`/api/events/${fakeId}`)

      expect(res.status).toBe(404)
    })
  })
})
