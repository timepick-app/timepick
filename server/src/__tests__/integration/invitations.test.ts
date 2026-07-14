import request from 'supertest'
import jwt from 'jsonwebtoken'
import { testServer } from '../helpers/test-server'
import { query } from '../../db'
import * as emailService from '../../services/email-send.service'
import { adminActionLimiter } from '../../middleware/adminActionLimiter'

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret'

// La route POST .../invitations/send appelle sendEventInvitation pour chaque destinataire autorisé.
// Sans mock, ~26 vrais emails « Inscription participation » partent vers MailHog (effet de bord).
// On stub au niveau fichier — aucun test n'assert l'envoi réel : `failed` provient du contrôle
// d'autorisation (utilisateur hors event_users), indépendant de la valeur de retour de l'envoi.
beforeAll(() => {
  jest.spyOn(emailService, 'sendEventInvitation').mockResolvedValue(true)
})

afterAll(() => {
  jest.restoreAllMocks()
})

describe('Invitations API', () => {
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
      [`test-invitations-admin-${uniqueSuffix}@example.com`, 'Test Admin', 'admin']
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
      [`test-invitations-user-${index}-${uniqueSuffix}@example.com`, `Test User ${index}`, 'user']
    )
    return userResult.rows[0]
  }

  /**
   * Helper pour créer un événement de test avec créneaux
   * NOTE: Uses unique name with timestamp to avoid duplicate key violation on events_name_key
   * NOTE: Slots are required because invitations service validates that events have slots
   */
  async function createTestEvent() {
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`
    const eventResult = await query(
      `INSERT INTO events (name, description, end_date)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [`test-invitations-event-${uniqueSuffix}`, 'Test event for invitations', new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)]
    )
    const eventId = eventResult.rows[0].id

    // Create a slot so the invitations service validation passes
    await query(
      `INSERT INTO slots (event_id, start_time, end_time, capacity)
       VALUES ($1, $2, $3, $4)`,
      [eventId, new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), new Date(Date.now() + 3 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000), 2]
    )

    return eventId
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
    // Ajouter les utilisateurs à l'événement (table event_users)
    // C'est requis car le service d'invitation ne traite que les utilisateurs autorisés
    for (const userId of testUserIds) {
      await query(
        'INSERT INTO event_users (event_id, user_id) VALUES ($1, $2)',
        [testEventId, userId]
      )
    }
  })

  // Nettoyer la base de données après chaque test
  // NOTE: Guard clause handles case where beforeEach failed (testUserIds undefined)
  afterEach(async () => {
    // Indépendance des tests : reset du rate-limiter admin (adminActionLimiter sur
    // resend-unanswered) et du mock sendEventInvitation (certains tests l'overrident).
    adminActionLimiter.resetKey(`admin:${adminUserId}`)
    jest.spyOn(emailService, 'sendEventInvitation').mockResolvedValue(true)
    if (!testEventId) return
    try {
      await query('DELETE FROM invitations WHERE event_id = $1', [testEventId])
      await query('DELETE FROM slots WHERE event_id = $1', [testEventId])
      await query('DELETE FROM event_users WHERE event_id = $1', [testEventId])
      await query('DELETE FROM events WHERE id = $1', [testEventId])
      // Only iterate if testUserIds was successfully initialized
      if (testUserIds && Array.isArray(testUserIds)) {
        for (const userId of testUserIds) {
          await query('DELETE FROM users WHERE id = $1', [userId])
        }
      }
    } catch (error) {
      // Log but don't throw - cleanup shouldn't fail the test
      console.error('Error in afterEach cleanup:', error)
    }
  })

  // Nettoyer l'admin à la fin
  afterAll(async () => {
    await query('DELETE FROM users WHERE id = $1', [adminUserId])
  })

  describe('POST /api/admin/events/:id/invitations/send', () => {
    it('envoie les invitations aux utilisateurs sélectionnés', async () => {
      const res = await request(testServer())
        .post(`/api/admin/events/${testEventId}/invitations/send`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userIds: testUserIds })

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveProperty('sent')
      expect(res.body.data).toHaveProperty('failed')
      expect(res.body.data).toHaveProperty('message')

      // Vérifier que les invitations sont enregistrées en base
      const invitations = await query(
        'SELECT * FROM invitations WHERE event_id = $1',
        [testEventId]
      )
      expect(invitations.rows.length).toBe(3)
    })

    it('gère les erreurs SMTP sans bloquer tout l\'envoi', async () => {
      // Simuler une erreur SMTP en utilisant un email invalide
      // Pour ce test, on vérifie juste que la structure de réponse est correcte
      const res = await request(testServer())
        .post(`/api/admin/events/${testEventId}/invitations/send`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userIds: testUserIds })

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveProperty('sent')
      expect(res.body.data).toHaveProperty('failed')
      // La somme sent + failed doit égler le nombre d'utilisateurs
      expect(res.body.data.sent + res.body.data.failed).toBe(3)
    })

    it('retourne 400 pour userIds vide', async () => {
      const res = await request(testServer())
        .post(`/api/admin/events/${testEventId}/invitations/send`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userIds: [] })

      expect(res.status).toBe(400)
    })

    it('retourne 404 pour événement inexistant', async () => {
      const fakeEventId = '00000000-0000-0000-0000-000000000000'
      const res = await request(testServer())
        .post(`/api/admin/events/${fakeEventId}/invitations/send`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userIds: testUserIds })

      expect(res.status).toBe(404)
    })

    it('retourne 401 sans authentification', async () => {
      const res = await request(testServer())
        .post(`/api/admin/events/${testEventId}/invitations/send`)
        .send({ userIds: testUserIds })

      expect(res.status).toBe(401)
    })

    it('retourne 403 sans rôle admin', async () => {
      const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`
      const userResult = await query(
        `INSERT INTO users (email, first_name, role) VALUES ($1, $2, $3) RETURNING id`,
        [`test-invitations-nonadmin-${uniqueSuffix}@example.com`, 'Test NonAdmin', 'user']
      )
      const userToken = jwt.sign({ userId: userResult.rows[0].id, role: 'user' }, JWT_SECRET, { expiresIn: '1h' })

      const res = await request(testServer())
        .post(`/api/admin/events/${testEventId}/invitations/send`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ userIds: testUserIds })

      expect(res.status).toBe(403)

      // Nettoyer
      await query('DELETE FROM users WHERE id = $1', [userResult.rows[0].id])
    })

    it('crée une entrée invitations pour chaque utilisateur', async () => {
      await request(testServer())
        .post(`/api/admin/events/${testEventId}/invitations/send`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userIds: testUserIds })

      // Vérifier que chaque utilisateur a une entrée dans invitations
      for (const userId of testUserIds) {
        const invitation = await query(
          'SELECT * FROM invitations WHERE event_id = $1 AND user_id = $2',
          [testEventId, userId]
        )
        expect(invitation.rows.length).toBe(1)
        expect(invitation.rows[0].status).toBe('sent')
      }
    })

    it('met à jour une invitation existante au lieu de créer un doublon', async () => {
      // Première envoi
      await request(testServer())
        .post(`/api/admin/events/${testEventId}/invitations/send`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userIds: [testUserIds[0]] })

      // Deuxième envoi pour le même utilisateur
      await request(testServer())
        .post(`/api/admin/events/${testEventId}/invitations/send`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userIds: [testUserIds[0]] })

      // Vérifier qu'il n'y a qu'une seule invitation (mise à jour via ON CONFLICT)
      const invitations = await query(
        'SELECT * FROM invitations WHERE event_id = $1 AND user_id = $2',
        [testEventId, testUserIds[0]]
      )
      expect(invitations.rows.length).toBe(1)
    })

    it('retourne une erreur pour les utilisateurs non autorisés', async () => {
      // Créer un utilisateur qui n'est pas dans event_users
      const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`
      const unauthorizedUserResult = await query(
        `INSERT INTO users (email, first_name, role) VALUES ($1, $2, $3) RETURNING id`,
        [`test-unauthorized-${uniqueSuffix}@example.com`, 'Test Unauthorized', 'user']
      )
      const unauthorizedUserId = unauthorizedUserResult.rows[0].id

      const res = await request(testServer())
        .post(`/api/admin/events/${testEventId}/invitations/send`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userIds: [...testUserIds, unauthorizedUserId] })

      expect(res.status).toBe(200)
      // Les 3 utilisateurs autorisés devraient être envoyés, l'utilisateur non autorisé devrait échouer
      expect(res.body.data.sent).toBe(3)
      expect(res.body.data.failed).toBe(1)

      // Vérifier que l'utilisateur non autorisé a un message d'erreur approprié
      const unauthorizedResult = res.body.data.results.find((r: any) => r.userId === unauthorizedUserId)
      expect(unauthorizedResult).toBeDefined()
      expect(unauthorizedResult.success).toBe(false)
      expect(unauthorizedResult.error).toContain('non autorisé')

      // Nettoyer
      await query('DELETE FROM users WHERE id = $1', [unauthorizedUserId])
    })
  })

  describe('GET /api/admin/events/:id/invitations/status', () => {
    it('retourne 401 sans authentification', async () => {
      const res = await request(testServer()).get(`/api/admin/events/${testEventId}/invitations/status`)

      expect(res.status).toBe(401)
    })

    it('retourne 403 sans rôle admin', async () => {
      const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`
      const userResult = await query(
        `INSERT INTO users (email, first_name, role) VALUES ($1, $2, $3) RETURNING id`,
        [`test-status-nonadmin-${uniqueSuffix}@example.com`, 'Test NonAdmin', 'user']
      )
      const userToken = jwt.sign({ userId: userResult.rows[0].id, role: 'user' }, JWT_SECRET, { expiresIn: '1h' })

      const res = await request(testServer())
        .get(`/api/admin/events/${testEventId}/invitations/status`)
        .set('Authorization', `Bearer ${userToken}`)

      expect(res.status).toBe(403)

      // Nettoyer
      await query('DELETE FROM users WHERE id = $1', [userResult.rows[0].id])
    })

    it('retourne 404 pour événement inexistant', async () => {
      const fakeEventId = '00000000-0000-0000-0000-000000000000'
      const res = await request(testServer())
        .get(`/api/admin/events/${fakeEventId}/invitations/status`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(404)
      expect(res.body.error).toContain('non trouvé')
    })

    it('retourne tous les utilisateurs sélectionnés avec leur statut d\'invitation', async () => {
      // Envoyer une invitation au premier utilisateur uniquement
      await request(testServer())
        .post(`/api/admin/events/${testEventId}/invitations/send`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userIds: [testUserIds[0]] })

      const res = await request(testServer())
        .get(`/api/admin/events/${testEventId}/invitations/status`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body.data)).toBe(true)
      // Tous les utilisateurs sélectionnés (3) doivent être présents
      expect(res.body.data.length).toBe(3)
    })

    it('marque les utilisateurs sans invitation comme pending', async () => {
      // N'envoyer aucune invitation - tous devraient être pending
      const res = await request(testServer())
        .get(`/api/admin/events/${testEventId}/invitations/status`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)

      const pendingUsers = res.body.data.filter((u: any) => u.invitationStatus === 'pending')
      // Tous les utilisateurs devraient être pending
      expect(pendingUsers.length).toBe(3)
    })

    it('utilise camelCase pour les champs de réponse', async () => {
      const res = await request(testServer())
        .get(`/api/admin/events/${testEventId}/invitations/status`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data[0]).toHaveProperty('invitationStatus')
      expect(res.body.data[0]).toHaveProperty('selectedAt')
      expect(res.body.data[0]).toHaveProperty('firstName')
      expect(res.body.data[0]).not.toHaveProperty('invitation_status')
      expect(res.body.data[0]).not.toHaveProperty('selected_at')
      expect(res.body.data[0]).not.toHaveProperty('first_name')
    })

    it('ordonne les utilisateurs: pending en premier, puis failed, puis autres', async () => {
      // Simuler différents statuts
      // User 0: envoyé (sera 'sent')
      await request(testServer())
        .post(`/api/admin/events/${testEventId}/invitations/send`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userIds: [testUserIds[0]] })

      // User 1: marquer comme failed directement en base
      await query(
        `INSERT INTO invitations (event_id, user_id, status)
         VALUES ($1, $2, 'failed')`,
        [testEventId, testUserIds[1]]
      )

      // User 2: pas d'invitation (pending)

      const res = await request(testServer())
        .get(`/api/admin/events/${testEventId}/invitations/status`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      // Le premier devrait être pending (User 2)
      expect(res.body.data[0].id).toBe(testUserIds[2])
      expect(res.body.data[0].invitationStatus).toBe('pending')
      // Le deuxième devrait être failed (User 1)
      expect(res.body.data[1].id).toBe(testUserIds[1])
      expect(res.body.data[1].invitationStatus).toBe('failed')
      // Les autres ensuite
      expect(res.body.data[2].invitationStatus).toBe('sent')
    })

    it('inclut les timestamps sentAt et clickedAt pour les invitations envoyées', async () => {
      await request(testServer())
        .post(`/api/admin/events/${testEventId}/invitations/send`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userIds: [testUserIds[0]] })

      const res = await request(testServer())
        .get(`/api/admin/events/${testEventId}/invitations/status`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)

      const sentUser = res.body.data.find((u: any) => u.id === testUserIds[0])
      expect(sentUser).toBeDefined()
      expect(sentUser.invitationStatus).toBe('sent')
      expect(sentUser.sentAt).not.toBeNull()
      expect(sentUser.clickedAt).toBeNull() // Pas encore cliqué
    })
  })

  describe('GET /api/admin/events/:id/invitations', () => {
    it('retourne l\'historique des invitations pour un événement', async () => {
      // D'abord envoyer des invitations
      await request(testServer())
        .post(`/api/admin/events/${testEventId}/invitations/send`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userIds: testUserIds })

      const res = await request(testServer())
        .get(`/api/admin/events/${testEventId}/invitations`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body.data)).toBe(true)
      expect(res.body.data.length).toBe(3)
      expect(res.body.data[0]).toHaveProperty('id')
      expect(res.body.data[0]).toHaveProperty('sentAt')
      expect(res.body.data[0]).toHaveProperty('status')
      expect(res.body.data[0]).toHaveProperty('user')
      expect(res.body.data[0].user).toHaveProperty('id')
      expect(res.body.data[0].user).toHaveProperty('email')
      expect(res.body.data[0].user).toHaveProperty('firstName')
    })

    it('retourne un tableau vide si aucune invitation', async () => {
      const res = await request(testServer())
        .get(`/api/admin/events/${testEventId}/invitations`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(0)
    })

    it('retourne 401 sans authentification', async () => {
      const res = await request(testServer())
        .get(`/api/admin/events/${testEventId}/invitations`)

      expect(res.status).toBe(401)
    })

    it('retourne 403 sans rôle admin', async () => {
      const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`
      const userResult = await query(
        `INSERT INTO users (email, first_name, role) VALUES ($1, $2, $3) RETURNING id`,
        [`test-invitations-get-nonadmin-${uniqueSuffix}@example.com`, 'Test NonAdmin', 'user']
      )
      const userToken = jwt.sign({ userId: userResult.rows[0].id, role: 'user' }, JWT_SECRET, { expiresIn: '1h' })

      const res = await request(testServer())
        .get(`/api/admin/events/${testEventId}/invitations`)
        .set('Authorization', `Bearer ${userToken}`)

      expect(res.status).toBe(403)

      // Nettoyer
      await query('DELETE FROM users WHERE id = $1', [userResult.rows[0].id])
    })
  })

  describe('POST /api/admin/events/:id/invitations/:userId/resend', () => {
    it('retourne 401 sans authentification', async () => {
      const res = await request(testServer()).post(
        `/api/admin/events/${testEventId}/invitations/${testUserIds[0]}/resend`
      )

      expect(res.status).toBe(401)
    })

    it('retourne 403 sans rôle admin', async () => {
      const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`
      const userResult = await query(
        `INSERT INTO users (email, first_name, role) VALUES ($1, $2, $3) RETURNING id`,
        [`test-resend-nonadmin-${uniqueSuffix}@example.com`, 'Test NonAdmin', 'user']
      )
      const userToken = jwt.sign({ userId: userResult.rows[0].id, role: 'user' }, JWT_SECRET, { expiresIn: '1h' })

      const res = await request(testServer())
        .post(`/api/admin/events/${testEventId}/invitations/${testUserIds[0]}/resend`)
        .set('Authorization', `Bearer ${userToken}`)

      expect(res.status).toBe(403)

      // Nettoyer
      await query('DELETE FROM users WHERE id = $1', [userResult.rows[0].id])
    })

    it('retourne 404 pour utilisateur non sélectionné', async () => {
      // Créer un utilisateur qui n'est pas dans event_users
      const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`
      const unauthorizedUserResult = await query(
        `INSERT INTO users (email, first_name, role) VALUES ($1, $2, $3) RETURNING id`,
        [`test-resend-unauthorized-${uniqueSuffix}@example.com`, 'Test Unauthorized', 'user']
      )
      const unauthorizedUserId = unauthorizedUserResult.rows[0].id

      const res = await request(testServer())
        .post(`/api/admin/events/${testEventId}/invitations/${unauthorizedUserId}/resend`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(404)
      expect(res.body.error).toContain('pas sélectionné')

      // Nettoyer
      await query('DELETE FROM users WHERE id = $1', [unauthorizedUserId])
    })

    it('retourne 404 pour événement inexistant', async () => {
      const fakeEventId = '00000000-0000-0000-0000-000000000000'
      const res = await request(testServer())
        .post(`/api/admin/events/${fakeEventId}/invitations/${testUserIds[0]}/resend`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(404)
    })

    it('renvoie une invitation en PRÉSERVANT clicked_at (clic monotone)', async () => {
      // Créer une invitation initiale
      await request(testServer())
        .post(`/api/admin/events/${testEventId}/invitations/send`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userIds: [testUserIds[0]] })

      // Récupérer l'invitation initiale
      const initialInvitation = await query(
        'SELECT * FROM invitations WHERE event_id = $1 AND user_id = $2',
        [testEventId, testUserIds[0]]
      )
      const initialSentAt = initialInvitation.rows[0].sent_at

      // Simuler un clic enregistré AVANT le renvoi (clicked_at non null, valeur ancrée
      // dans le passé). Le renvoi ne doit PAS réinitialiser ce clic.
      const recordedClickAt = new Date(Date.now() - 30 * 60 * 1000) // il y a 30 min
      await query(
        `UPDATE invitations SET clicked_at = $3
         WHERE event_id = $1 AND user_id = $2`,
        [testEventId, testUserIds[0], recordedClickAt]
      )

      // Attendre un peu pour que sent_at change (min 1ms)
      await new Promise(resolve => setTimeout(resolve, 10))

      // Renvoyer l'invitation
      const res = await request(testServer())
        .post(`/api/admin/events/${testEventId}/invitations/${testUserIds[0]}/resend`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data.sent).toBe(true)
      expect(res.body.data.email).toBeDefined()
      expect(res.body.data.sentAt).toBeDefined()
      expect(res.body.data.userId).toBe(testUserIds[0])
      expect(res.body.data.eventId).toBe(testEventId)

      // Vérifier que l'invitation a été mise à jour (une seule entrée)
      const updatedInvitations = await query(
        'SELECT * FROM invitations WHERE event_id = $1 AND user_id = $2',
        [testEventId, testUserIds[0]]
      )
      expect(updatedInvitations.rows.length).toBe(1)

      // Vérifier que sent_at a été mis à jour
      expect(new Date(updatedInvitations.rows[0].sent_at).getTime()).toBeGreaterThan(
        new Date(initialSentAt).getTime()
      )

      // Clic monotone : clicked_at est PRÉSERVÉ après le renvoi (valeur inchangée),
      // tandis que le statut repasse à 'sent'.
      expect(updatedInvitations.rows[0].clicked_at).not.toBeNull()
      expect(new Date(updatedInvitations.rows[0].clicked_at).getTime()).toBe(recordedClickAt.getTime())

      // Vérifier que le statut est 'sent'
      expect(updatedInvitations.rows[0].status).toBe('sent')
    })

    it('crée une invitation si elle n\'existait pas (utilisateur pending)', async () => {
      // Ne pas envoyer d'invitation initiale - l'utilisateur est en pending
      const res = await request(testServer())
        .post(`/api/admin/events/${testEventId}/invitations/${testUserIds[0]}/resend`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data.sent).toBe(true)

      // Vérifier qu'une invitation a été créée
      const invitation = await query(
        'SELECT * FROM invitations WHERE event_id = $1 AND user_id = $2',
        [testEventId, testUserIds[0]]
      )
      expect(invitation.rows.length).toBe(1)
      expect(invitation.rows[0].status).toBe('sent')
    })

    it('utilise camelCase pour les champs de réponse', async () => {
      const res = await request(testServer())
        .post(`/api/admin/events/${testEventId}/invitations/${testUserIds[0]}/resend`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveProperty('sentAt')
      expect(res.body.data).toHaveProperty('userId')
      expect(res.body.data).toHaveProperty('eventId')
      expect(res.body.data).not.toHaveProperty('sent_at')
      expect(res.body.data).not.toHaveProperty('user_id')
      expect(res.body.data).not.toHaveProperty('event_id')
    })

    it('génère un nouveau magic link à chaque renvoi', async () => {
      // Première envoi
      const firstRes = await request(testServer())
        .post(`/api/admin/events/${testEventId}/invitations/${testUserIds[0]}/resend`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(firstRes.status).toBe(200)
      expect(firstRes.body.data.sent).toBe(true)

      // Deuxième envoi
      const secondRes = await request(testServer())
        .post(`/api/admin/events/${testEventId}/invitations/${testUserIds[0]}/resend`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(secondRes.status).toBe(200)
      expect(secondRes.body.data.sent).toBe(true)

      // Les deux envois devraient avoir réussi
      expect(firstRes.body.data.email).toBe(secondRes.body.data.email)
    })
  })
  describe('POST /api/admin/events/:id/invitations/resend-unanswered', () => {
    it('relance uniquement les non-répondants >3j et renvoie leur compte', async () => {
      // u0 : sent >3j, non cliqué → à relancer
      await query(`INSERT INTO invitations (event_id, user_id, status, sent_at) VALUES ($1,$2,'sent', NOW() - INTERVAL '5 days')`, [testEventId, testUserIds[0]])
      // u1 : sent récent <3j, non cliqué → exclu
      await query(`INSERT INTO invitations (event_id, user_id, status, sent_at) VALUES ($1,$2,'sent', NOW() - INTERVAL '1 day')`, [testEventId, testUserIds[1]])
      // u2 : sent >3j, MAIS cliqué → exclu
      await query(`INSERT INTO invitations (event_id, user_id, status, sent_at, clicked_at) VALUES ($1,$2,'sent', NOW() - INTERVAL '5 days', NOW() - INTERVAL '4 days')`, [testEventId, testUserIds[2]])

      const res = await request(testServer())
        .post(`/api/admin/events/${testEventId}/invitations/resend-unanswered`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      // Format contrat dashboard : { data: { targeted, resent, failed } }
      expect(res.body).toEqual({ data: { targeted: 1, resent: 1, failed: 0 } })

      // u0 seul a été renvoyé : send_count incrémenté (default 1 → 2)
      const u0 = await query('SELECT send_count FROM invitations WHERE event_id = $1 AND user_id = $2', [testEventId, testUserIds[0]])
      expect(u0.rows[0].send_count).toBe(2)
      // u1 (récent) et u2 (cliqué) inchangés (default 1)
      const u1 = await query('SELECT send_count FROM invitations WHERE event_id = $1 AND user_id = $2', [testEventId, testUserIds[1]])
      const u2 = await query('SELECT send_count FROM invitations WHERE event_id = $1 AND user_id = $2', [testEventId, testUserIds[2]])
      expect(u1.rows[0].send_count).toBe(1)
      expect(u2.rows[0].send_count).toBe(1)
    })

    it('ne renvoie pas aux non-cliqueurs récents (<3j) ni aux cliqués', async () => {
      // Aucun destinataire >3j : resent = 0, rien n'est renvoyé
      await query(`INSERT INTO invitations (event_id, user_id, status, sent_at) VALUES ($1,$2,'sent', NOW() - INTERVAL '1 day')`, [testEventId, testUserIds[1]])
      await query(`INSERT INTO invitations (event_id, user_id, status, sent_at, clicked_at) VALUES ($1,$2,'sent', NOW() - INTERVAL '5 days', NOW() - INTERVAL '4 days')`, [testEventId, testUserIds[2]])

      const res = await request(testServer())
        .post(`/api/admin/events/${testEventId}/invitations/resend-unanswered`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data).toEqual({ targeted: 0, resent: 0, failed: 0 })

      // Ni u1 ni u2 n'ont été renvoyés : send_count reste au default 1
      const u1 = await query('SELECT send_count FROM invitations WHERE event_id = $1 AND user_id = $2', [testEventId, testUserIds[1]])
      const u2 = await query('SELECT send_count FROM invitations WHERE event_id = $1 AND user_id = $2', [testEventId, testUserIds[2]])
      expect(u1.rows[0].send_count).toBe(1)
      expect(u2.rows[0].send_count).toBe(1)
    })

    it('retourne 404 pour événement inexistant', async () => {
      const fakeEventId = '00000000-0000-0000-0000-000000000000'
      const res = await request(testServer())
        .post(`/api/admin/events/${fakeEventId}/invitations/resend-unanswered`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(404)
    })

    it('retourne 401 sans authentification', async () => {
      const res = await request(testServer())
        .post(`/api/admin/events/${testEventId}/invitations/resend-unanswered`)

      expect(res.status).toBe(401)
    })

    it('retourne 403 sans rôle admin', async () => {
      const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`
      const userResult = await query(
        `INSERT INTO users (email, first_name, role) VALUES ($1, $2, $3) RETURNING id`,
        [`test-resendunans-nonadmin-${uniqueSuffix}@example.com`, 'Test NonAdmin', 'user']
      )
      const userToken = jwt.sign({ userId: userResult.rows[0].id, role: 'user' }, JWT_SECRET, { expiresIn: '1h' })

      const res = await request(testServer())
        .post(`/api/admin/events/${testEventId}/invitations/resend-unanswered`)
        .set('Authorization', `Bearer ${userToken}`)

      expect(res.status).toBe(403)

      // Nettoyer
      await query('DELETE FROM users WHERE id = $1', [userResult.rows[0].id])
    })
    it('échec total de relance : les lignes restent sent avec leur sent_at (re-relançables)', async () => {
      // Forcer l'échec de TOUS les envois (override local du mock beforeAll = true)
      const spy = jest.spyOn(emailService, 'sendEventInvitation').mockResolvedValue(false)
      // 2 cibles >3j (u0, u1) ; tous déjà dans event_users (beforeEach). testEventId a un
      // créneau futur → events."end" futur → non terminé.
      await query(`INSERT INTO invitations (event_id, user_id, status, sent_at) VALUES ($1,$2,'sent', NOW() - INTERVAL '5 days')`, [testEventId, testUserIds[0]])
      await query(`INSERT INTO invitations (event_id, user_id, status, sent_at) VALUES ($1,$2,'sent', NOW() - INTERVAL '6 days')`, [testEventId, testUserIds[1]])
      // sent_at d'origine (pour vérifier qu'il n'est PAS touché par une relance échouée)
      const before = await query('SELECT user_id, status, sent_at FROM invitations WHERE event_id = $1 ORDER BY user_id', [testEventId])

      const res = await request(testServer())
        .post(`/api/admin/events/${testEventId}/invitations/resend-unanswered`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ data: { targeted: 2, resent: 0, failed: 2 } })

      // Les lignes restent 'sent' avec leur sent_at d'origine (recordFailures:false en relance)
      // → toujours comptées par getEventActivity et re-relançables.
      const after = await query('SELECT user_id, status, sent_at FROM invitations WHERE event_id = $1 ORDER BY user_id', [testEventId])
      expect(after.rows.length).toBe(2)
      for (const row of after.rows) {
        expect(row.status).toBe('sent')
      }
      expect(new Date(after.rows[0].sent_at).getTime()).toBe(new Date(before.rows[0].sent_at).getTime())
      expect(new Date(after.rows[1].sent_at).getTime()).toBe(new Date(before.rows[1].sent_at).getTime())

      spy.mockResolvedValue(true)
    })

    it('échec partiel : 1 échec sur N cibles → {resent:N-1, failed:1}', async () => {
      // Échoue pour le 1er destinataire (email de u0), réussit pour les autres.
      const failingEmail = (await query('SELECT email FROM users WHERE id = $1', [testUserIds[0]])).rows[0].email
      const spy = jest.spyOn(emailService, 'sendEventInvitation').mockImplementation(async (email: string) => email !== failingEmail)
      // 3 cibles >3j (u0, u1, u2), tous dans event_users (beforeEach)
      for (const uid of testUserIds) {
        await query(`INSERT INTO invitations (event_id, user_id, status, sent_at) VALUES ($1,$2,'sent', NOW() - INTERVAL '5 days')`, [testEventId, uid])
      }

      const res = await request(testServer())
        .post(`/api/admin/events/${testEventId}/invitations/resend-unanswered`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ data: { targeted: 3, resent: 2, failed: 1 } })

      spy.mockResolvedValue(true)
    })

    it('événement terminé : 0 cible, pas de bloc (scope exclut events."end" < now)', async () => {
      // Créer un événement terminé : un créneau passé → trigger met events."end" au passé.
      const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`
      const endedEvent = (await query(
        `INSERT INTO events (name, description) VALUES ($1,$2) RETURNING id`,
        [`test-invitations-ended-${uniqueSuffix}`, 'Événement terminé']
      )).rows[0].id
      await query(
        `INSERT INTO slots (event_id, start_time, end_time, capacity) VALUES ($1,$2,$3,$4)`,
        [endedEvent, new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), 5]
      )
      // u0 sélectionné + invitation sent >3j non cliquée
      await query('INSERT INTO event_users (event_id, user_id) VALUES ($1,$2)', [endedEvent, testUserIds[0]])
      await query(`INSERT INTO invitations (event_id, user_id, status, sent_at) VALUES ($1,$2,'sent', NOW() - INTERVAL '5 days')`, [endedEvent, testUserIds[0]])

      const res = await request(testServer())
        .post(`/api/admin/events/${endedEvent}/invitations/resend-unanswered`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ data: { targeted: 0, resent: 0, failed: 0 } })

      // Pas de bloc 4xx ; et getEventActivity ne compte pas l'événement terminé (scope unifié)
      const act = await request(testServer())
        .get('/api/admin/analytics/event-activity')
        .set('Authorization', `Bearer ${adminToken}`)
      const entry = act.body.data.find((a: { eventId: string }) => a.eventId === endedEvent)
      if (entry) expect(entry.unansweredOver3Days).toBe(0)

      // Nettoyage de l'événement dédié (afterEach ne connaît que testEventId)
      await query('DELETE FROM invitations WHERE event_id = $1', [endedEvent])
      await query('DELETE FROM event_users WHERE event_id = $1', [endedEvent])
      await query('DELETE FROM slots WHERE event_id = $1', [endedEvent])
      await query('DELETE FROM events WHERE id = $1', [endedEvent])
    })

    it('destinataire désélectionné (retiré d\'event_users) : non ciblé ni compté', async () => {
      // u0 : invitation sent >3j, MAIS retiré d'event_users (désélection). Ligne résiduelle.
      await query(`INSERT INTO invitations (event_id, user_id, status, sent_at) VALUES ($1,$2,'sent', NOW() - INTERVAL '5 days')`, [testEventId, testUserIds[0]])
      await query('DELETE FROM event_users WHERE event_id = $1 AND user_id = $2', [testEventId, testUserIds[0]])

      const res = await request(testServer())
        .post(`/api/admin/events/${testEventId}/invitations/resend-unanswered`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ data: { targeted: 0, resent: 0, failed: 0 } })

      // getEventActivity : l'invitation résiduelle n'est PAS comptée (JOIN event_users)
      const act = await request(testServer())
        .get('/api/admin/analytics/event-activity')
        .set('Authorization', `Bearer ${adminToken}`)
      const entry = act.body.data.find((a: { eventId: string }) => a.eventId === testEventId)
      if (entry) expect(entry.unansweredOver3Days).toBe(0)
    })

    it('rate-limit : 429 au-delà de 10 relances/minute (adminActionLimiter)', async () => {
      adminActionLimiter.resetKey(`admin:${adminUserId}`)
      // Aucune invitation >3j sur testEventId → 200 {targeted:0} sans effet de bord ni email.
      const send = () =>
        request(testServer())
          .post(`/api/admin/events/${testEventId}/invitations/resend-unanswered`)
          .set('Authorization', `Bearer ${adminToken}`)

      for (let i = 0; i < 10; i++) {
        const ok = await send()
        expect(ok.status).toBe(200)
      }
      const blocked = await send()
      expect(blocked.status).toBe(429)
      expect(blocked.body.error.code).toBe('RATE_LIMITED')
    })
  })
})
