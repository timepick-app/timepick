import request from 'supertest'
import jwt from 'jsonwebtoken'
import { testServer } from '../helpers/test-server'
import { query } from '../../db'
import * as emailService from '../../services/email-send.service'
import { slotService } from '../../services/slot.service'
import { ConflictError } from '../../errors/ConflictError'

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret'

/**
 * Helper pour générer un token valide
 */
function generateToken(userId: string, role: string = 'user'): string {
  return jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: '1h' })
}

/**
 * Helper pour créer un utilisateur de test
 */
async function createTestUser(email: string, role: string = 'admin'): Promise<{ id: string; token: string }> {
  const res = await query(
    `INSERT INTO users (email, first_name, role)
     VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE SET role = $3
     RETURNING id`,
    [email, `Test ${email}`, role]
  )
  const userId = res.rows[0].id
  const token = generateToken(userId, role)
  return { id: userId, token }
}

/**
 * Helper pour créer un événement de test
 * NOTE: Uses unique name to avoid duplicate key violation on events_name_key
 */
async function createTestEvent(name: string = 'Test Event'): Promise<string> {
  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`
  const res = await query(
    `INSERT INTO events (name, description, is_published)
     VALUES ($1, $2, false)
     RETURNING id`,
    [`${name}-${uniqueSuffix}`, 'Test event description']
  )
  return res.rows[0].id
}

/**
 * Helper pour créer un créneau de test
 */
async function createTestSlot(eventId: string, startTime: Date, endTime: Date, capacity: number = 5): Promise<string> {
  const res = await query(
    `INSERT INTO slots (event_id, start_time, end_time, capacity)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [eventId, startTime, endTime, capacity]
  )
  return res.rows[0].id
}

describe('Slots API - Integration Tests', () => {
  let eventId: string
  let adminToken: string
  let adminUserId: string
  let userToken: string

  beforeAll(async () => {
    // Créer un admin pour les tests
    const admin = await createTestUser('admin-slot-test@local.dev', 'admin')
    adminUserId = admin.id
    adminToken = admin.token

    // Créer un utilisateur non-admin pour les tests
    const user = await createTestUser('user-slot-test@local.dev', 'user')
    userToken = user.token

    // Créer un événement pour les tests
    eventId = await createTestEvent('Slots Test Event')
  })

  afterAll(async () => {
    // Nettoyer les données de test
    await query(`DELETE FROM slots WHERE event_id = $1`, [eventId])
    await query(`DELETE FROM events WHERE id = $1`, [eventId])
    await query(`DELETE FROM users WHERE email IN ($1, $2)`, [
      'admin-slot-test@local.dev',
      'user-slot-test@local.dev'
    ])
  })

  describe('POST /api/admin/events/:eventId/slots', () => {
    it('crée un créneau avec des données valides', async () => {
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      tomorrow.setHours(9, 0, 0, 0)

      const endTime = new Date(tomorrow)
      endTime.setHours(11, 0, 0, 0)

      const res = await request(testServer())
        .post(`/api/admin/events/${eventId}/slots`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          startTime: tomorrow.toISOString(),
          endTime: endTime.toISOString(),
          capacity: 5
        })

      expect(res.status).toBe(201)
      expect(res.body.data).toMatchObject({
        eventId,
        capacity: 5
      })
      expect(res.body.data).toHaveProperty('id')
      expect(res.body.data).toHaveProperty('startTime')
      expect(res.body.data).toHaveProperty('createdAt')
      // Note: currentBookings n'est pas inclus dans la réponse de création (INSERT RETURNING)
      // mais est disponible lors du GET
    })

    it('retourne 400 si end_time <= start_time', async () => {
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      tomorrow.setHours(9, 0, 0, 0)

      const res = await request(testServer())
        .post(`/api/admin/events/${eventId}/slots`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          startTime: tomorrow.toISOString(),
          endTime: tomorrow.toISOString(), // Même heure
          capacity: 5
        })

      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/après/i)
    })

    it('retourne 400 si capacity <= 0', async () => {
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      tomorrow.setHours(9, 0, 0, 0)

      const res = await request(testServer())
        .post(`/api/admin/events/${eventId}/slots`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          startTime: tomorrow.toISOString(),
          endTime: new Date(tomorrow.getTime() + 2 * 60 * 60 * 1000).toISOString(),
          capacity: 0
        })

      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/supérieure à 0/i)
    })

    it('retourne 400 si capacity > 100', async () => {
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)

      const res = await request(testServer())
        .post(`/api/admin/events/${eventId}/slots`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          startTime: tomorrow.toISOString(),
          endTime: new Date(tomorrow.getTime() + 2 * 60 * 60 * 1000).toISOString(),
          capacity: 101
        })

      expect(res.status).toBe(400)
    })

    it('retourne 401 sans auth', async () => {
      const res = await request(testServer())
        .post(`/api/admin/events/${eventId}/slots`)
        .send({ capacity: 5 })

      expect(res.status).toBe(401)
    })

    it('retourne 403 pour un user non-admin', async () => {
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)

      const res = await request(testServer())
        .post(`/api/admin/events/${eventId}/slots`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          startTime: tomorrow.toISOString(),
          endTime: new Date(tomorrow.getTime() + 3600000).toISOString(),
          capacity: 5
        })

      expect(res.status).toBe(403)
    })

    it('retourne 400 si date dans le passé', async () => {
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)

      const res = await request(testServer())
        .post(`/api/admin/events/${eventId}/slots`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          startTime: yesterday.toISOString(),
          endTime: new Date(yesterday.getTime() + 3600000).toISOString(),
          capacity: 5
        })

      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/futur/i)
    })
  })

  describe('GET /api/admin/events/:eventId/slots', () => {
    beforeEach(async () => {
      // Nettoyer les créneaux avant chaque test (doit être fait en premier)
      await query(`DELETE FROM slots WHERE event_id = $1`, [eventId])

      // Créer des créneaux pour les tests
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)

      const morning = new Date(tomorrow)
      morning.setHours(9, 0, 0, 0)

      const afternoon = new Date(tomorrow)
      afternoon.setHours(14, 0, 0, 0)

      await createTestSlot(eventId, afternoon, new Date(afternoon.getTime() + 2 * 60 * 60 * 1000), 3)
      await createTestSlot(eventId, morning, new Date(morning.getTime() + 2 * 60 * 60 * 1000), 5)
    })

    it('liste tous les créneaux d\'un événement triés par start_time', async () => {
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)

      const morning = new Date(tomorrow)
      morning.setHours(9, 0, 0, 0)

      const afternoon = new Date(tomorrow)
      afternoon.setHours(14, 0, 0, 0)

      // Créer les créneaux dans le désordre
      await createTestSlot(eventId, afternoon, new Date(afternoon.getTime() + 2 * 60 * 60 * 1000), 3)
      await createTestSlot(eventId, morning, new Date(morning.getTime() + 2 * 60 * 60 * 1000), 5)

      const res = await request(testServer())
        .get(`/api/admin/events/${eventId}/slots`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body.data)).toBe(true)
      expect(res.body.data.length).toBeGreaterThanOrEqual(2)
      // Vérifier le tri par start_time (matin avant après-midi)
      expect(new Date(res.body.data[0].startTime).getHours()).toBeLessThanOrEqual(
        new Date(res.body.data[1].startTime).getHours()
      )
    })

    it('retourne une liste vide si aucun créneau', async () => {
      // Nettoyer tous les créneaux
      await query(`DELETE FROM slots WHERE event_id = $1`, [eventId])

      const res = await request(testServer())
        .get(`/api/admin/events/${eventId}/slots`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body.data)).toBe(true)
      expect(res.body.data.length).toBe(0)
    })

    it('retourne 401 sans auth', async () => {
      const res = await request(testServer())
        .get(`/api/admin/events/${eventId}/slots`)

      expect(res.status).toBe(401)
    })
  })

  describe('GET /api/admin/slots/:id', () => {
    let slotId: string

    beforeEach(async () => {
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      tomorrow.setHours(10, 0, 0, 0)

      slotId = await createTestSlot(
        eventId,
        tomorrow,
        new Date(tomorrow.getTime() + 2 * 60 * 60 * 1000),
        5
      )
    })

    it('récupère un créneau par ID', async () => {
      const res = await request(testServer())
        .get(`/api/admin/slots/${slotId}`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveProperty('id', slotId)
      expect(res.body.data).toHaveProperty('eventId', eventId)
      expect(res.body.data).toHaveProperty('capacity')
      expect(res.body.data).toHaveProperty('currentBookings', 0)
    })

    it('retourne 404 pour un ID inexistant', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000'
      const res = await request(testServer())
        .get(`/api/admin/slots/${fakeId}`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(404)
      expect(res.body.error).toContain('non trouvé')
    })

    it('retourne 401 sans auth', async () => {
      const res = await request(testServer())
        .get(`/api/admin/slots/${slotId}`)

      expect(res.status).toBe(401)
    })
  })

  describe('PUT /api/admin/slots/:id', () => {
    let slotId: string

    beforeEach(async () => {
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      tomorrow.setHours(10, 0, 0, 0)

      slotId = await createTestSlot(
        eventId,
        tomorrow,
        new Date(tomorrow.getTime() + 2 * 60 * 60 * 1000),
        5
      )
    })

    it('met à jour la capacité d\'un créneau', async () => {
      const res = await request(testServer())
        .put(`/api/admin/slots/${slotId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ capacity: 10 })

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveProperty('capacity', 10)
    })

    it('met à jour les heures d\'un créneau', async () => {
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 2)
      tomorrow.setHours(8, 0, 0, 0)

      const res = await request(testServer())
        .put(`/api/admin/slots/${slotId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          startTime: tomorrow.toISOString(),
          endTime: new Date(tomorrow.getTime() + 3 * 60 * 60 * 1000).toISOString()
        })

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveProperty('startTime')
    })

    it('retourne 400 si end_time <= start_time lors de la mise à jour', async () => {
      const res = await request(testServer())
        .put(`/api/admin/slots/${slotId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          startTime: new Date().toISOString(),
          endTime: new Date().toISOString() // Même heure
        })

      expect(res.status).toBe(400)
    })

    it('retourne 404 pour un ID inexistant', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000'
      const res = await request(testServer())
        .put(`/api/admin/slots/${fakeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ capacity: 10 })

      expect(res.status).toBe(404)
    })
  })

  describe('DELETE /api/admin/slots/:id', () => {
    let slotId: string

    beforeEach(async () => {
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      tomorrow.setHours(10, 0, 0, 0)

      slotId = await createTestSlot(
        eventId,
        tomorrow,
        new Date(tomorrow.getTime() + 2 * 60 * 60 * 1000),
        5
      )
    })

    it('supprime définitivement un créneau sans inscrit (→ 200, ligne absente, aucun email)', async () => {
      const sendEmailSpy = jest.spyOn(emailService, 'sendSlotCancellationEmail').mockResolvedValue(true)

      const res = await request(testServer())
        .delete(`/api/admin/slots/${slotId}`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      // Hard-delete : pas de réservation, donc aucune notification.
      expect(res.body.data).toEqual({ cancelled: true, hadReservations: false, notified: 0, failed: 0 })

      // 0 inscrit : suppression définitive. Le créneau n'existe plus côté admin.
      const checkRes = await request(testServer())
        .get(`/api/admin/slots/${slotId}`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(checkRes.status).toBe(404)

      // La ligne est bien absente en base, et aucun email n'a été envoyé.
      const slotRow = await query(`SELECT 1 FROM slots WHERE id = $1`, [slotId])
      expect(slotRow.rows.length).toBe(0)
      expect(sendEmailSpy).not.toHaveBeenCalled()

      sendEmailSpy.mockRestore()
    })

    it('retourne 409 si un créneau réservé est déjà annulé (décision #9/AC5)', async () => {
      // Un créneau réservé est soft-deleted (pas supprimé) : la ré-annulation tombe
      // sur cancelled_at IS NOT NULL → 409 (et non 404).
      const user = await createTestUser('slot-recancel-user@local.dev', 'user')
      await query(`INSERT INTO bookings (user_id, slot_id) VALUES ($1, $2)`, [user.id, slotId])
      const sendEmailSpy = jest.spyOn(emailService, 'sendSlotCancellationEmail').mockResolvedValue(true)

      await request(testServer())
        .delete(`/api/admin/slots/${slotId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)

      const res = await request(testServer())
        .delete(`/api/admin/slots/${slotId}`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(409)

      sendEmailSpy.mockRestore()
      await query(`DELETE FROM users WHERE id = $1`, [user.id])
    })

    it('supprime un créneau vide ; un 2ᵉ DELETE renvoie 404 (ligne absente)', async () => {
      await request(testServer())
        .delete(`/api/admin/slots/${slotId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)

      const res = await request(testServer())
        .delete(`/api/admin/slots/${slotId}`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(404)
    })

    it('retourne 404 pour un ID inexistant', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000'
      const res = await request(testServer())
        .delete(`/api/admin/slots/${fakeId}`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(404)
    })

    it('retourne 401 sans auth', async () => {
      const res = await request(testServer())
        .delete(`/api/admin/slots/${slotId}`)

      expect(res.status).toBe(401)
    })

    it('préserve les réservations associées (soft-delete, pas de cascade) — AC1', async () => {
      // L'objet de ce test est la préservation des réservations + cancelled_at/motif,
      // PAS la livraison email (couverte par le voisin « envoie des emails »). On mocke
      // comme les 4 tests voisins, sinon `cancelSlot` enverrait 2 vrais emails vers MailHog.
      const sendEmailSpy = jest.spyOn(emailService, 'sendSlotCancellationEmail').mockResolvedValue(true)

      // Créer des utilisateurs et des réservations pour ce créneau
      const user1 = await createTestUser('slot-delete-user1@local.dev', 'user')
      const user2 = await createTestUser('slot-delete-user2@local.dev', 'user')

      // Créer des réservations
      await query(
        `INSERT INTO bookings (user_id, slot_id) VALUES ($1, $2), ($3, $4)`,
        [user1.id, slotId, user2.id, slotId]
      )

      // Vérifier que les réservations existent
      const bookingsBefore = await query(
        `SELECT COUNT(*) as count FROM bookings WHERE slot_id = $1`,
        [slotId]
      )
      expect(parseInt(bookingsBefore.rows[0].count)).toBe(2)

      // Annuler le créneau avec un motif
      const res = await request(testServer())
        .delete(`/api/admin/slots/${slotId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ cancellationReason: 'Événement reporté' })

      expect(res.status).toBe(200)
      // 2 inscrits, envois mockés à true → 2 notifiés, 0 échec.
      expect(res.body.data).toEqual({ cancelled: true, hadReservations: true, notified: 2, failed: 0 })

      // Soft-delete : les réservations sont PRÉSERVÉES (canal de secours inscrit).
      const bookingsAfter = await query(
        `SELECT COUNT(*) as count FROM bookings WHERE slot_id = $1`,
        [slotId]
      )
      expect(parseInt(bookingsAfter.rows[0].count)).toBe(2)

      // cancelled_at + motif stockés.
      const slotRow = await query(
        `SELECT cancelled_at, cancellation_reason FROM slots WHERE id = $1`,
        [slotId]
      )
      expect(slotRow.rows[0].cancelled_at).not.toBeNull()
      expect(slotRow.rows[0].cancellation_reason).toBe('Événement reporté')

      // Nettoyer les utilisateurs de test
      await query(`DELETE FROM users WHERE id IN ($1, $2)`, [user1.id, user2.id])

      sendEmailSpy.mockRestore()
    })

    it('envoie des emails de notification aux utilisateurs dont les réservations sont annulées', async () => {
      // Mock de la fonction d'envoi d'email pour vérifier qu'elle est appelée
      const sendEmailSpy = jest.spyOn(emailService, 'sendSlotCancellationEmail').mockResolvedValue(true)

      // Créer des utilisateurs et des réservations pour ce créneau
      const user1 = await createTestUser('slot-delete-email-user1@local.dev', 'user')
      const user2 = await createTestUser('slot-delete-email-user2@local.dev', 'user')

      // Créer des réservations
      await query(
        `INSERT INTO bookings (user_id, slot_id) VALUES ($1, $2), ($3, $4)`,
        [user1.id, slotId, user2.id, slotId]
      )

      // Vérifier que les réservations existent
      const bookingsBefore = await query(
        `SELECT COUNT(*) as count FROM bookings WHERE slot_id = $1`,
        [slotId]
      )
      expect(parseInt(bookingsBefore.rows[0].count)).toBe(2)

      // Annuler le créneau
      const res = await request(testServer())
        .delete(`/api/admin/slots/${slotId}`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)

      // Soft-delete : les réservations sont préservées (pas de cascade)
      const bookingsAfter = await query(
        `SELECT COUNT(*) as count FROM bookings WHERE slot_id = $1`,
        [slotId]
      )
      expect(parseInt(bookingsAfter.rows[0].count)).toBe(2)

      // Vérifier que sendSlotCancellationEmail a été appelé pour chaque utilisateur
      expect(sendEmailSpy).toHaveBeenCalledTimes(2)

      // Vérifier que les appels contiennent les bonnes données (structure de l'objet)
      expect(sendEmailSpy).toHaveBeenNthCalledWith(1, expect.objectContaining({
        userEmail: expect.any(String),
        userFirstName: expect.any(String),
        eventName: expect.any(String),
        slotDate: expect.any(String),
        slotTime: expect.any(String)
      }))
      expect(sendEmailSpy).toHaveBeenNthCalledWith(2, expect.objectContaining({
        userEmail: expect.any(String),
        userFirstName: expect.any(String),
        eventName: expect.any(String),
        slotDate: expect.any(String),
        slotTime: expect.any(String)
      }))

      // Nettoyer les utilisateurs de test
      await query(`DELETE FROM users WHERE id IN ($1, $2)`, [user1.id, user2.id])

      // Restaurer le mock
      sendEmailSpy.mockRestore()
    })

    // spec-cancellation-notification-reliability — la réponse remonte le nombre
    // d'envois échoués pour que le client alerte l'admin (panne SMTP simulée).
    it('renvoie failed > 0 quand l\'envoi de notification échoue (panne SMTP)', async () => {
      const sendEmailSpy = jest.spyOn(emailService, 'sendSlotCancellationEmail').mockResolvedValue(false)

      const user1 = await createTestUser('slot-failnotif-user1@local.dev', 'user')
      const user2 = await createTestUser('slot-failnotif-user2@local.dev', 'user')
      await query(
        `INSERT INTO bookings (user_id, slot_id) VALUES ($1, $2), ($3, $4)`,
        [user1.id, slotId, user2.id, slotId]
      )

      const res = await request(testServer())
        .delete(`/api/admin/slots/${slotId}`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data).toEqual({ cancelled: true, hadReservations: true, notified: 0, failed: 2 })

      // Soft-delete bien effectué malgré l'échec d'envoi ; bookings restent « en attente ».
      const slotRow = await query(`SELECT cancelled_at FROM slots WHERE id = $1`, [slotId])
      expect(slotRow.rows[0].cancelled_at).not.toBeNull()
      const notNotified = await query(
        `SELECT COUNT(*)::int AS count FROM bookings WHERE slot_id = $1 AND cancellation_notified_at IS NULL`,
        [slotId]
      )
      expect(notNotified.rows[0].count).toBe(2)

      await query(`DELETE FROM users WHERE id IN ($1, $2)`, [user1.id, user2.id])
      sendEmailSpy.mockRestore()
    })

    // F-C (post-5b-defer-a-L3-data-F-C) — deux annulations simultanées du même
    // créneau : le verrou `FOR UPDATE ... cancelled_at IS NULL` sérialise ; un seul
    // gagnant annule et notifie, l'autre voit la row filtrée après commit et lève
    // ConflictError (déjà annulé) sans re-notifier. Chaque participant reçoit au
    // plus un courriel.
    it('concurrence : 2 annulations simultanées du même créneau → 1 seul lot de courriels (F-C)', async () => {
      const sendEmailSpy = jest.spyOn(emailService, 'sendSlotCancellationEmail').mockResolvedValue(true)

      const user1 = await createTestUser('slot-race-user1@local.dev', 'user')
      const user2 = await createTestUser('slot-race-user2@local.dev', 'user')
      await query(
        `INSERT INTO bookings (user_id, slot_id) VALUES ($1, $2), ($3, $4)`,
        [user1.id, slotId, user2.id, slotId]
      )

      const results = await Promise.allSettled([
        slotService.cancelSlot(slotId),
        slotService.cancelSlot(slotId),
      ])

      const fulfilled = results.filter((r) => r.status === 'fulfilled')
      const rejected = results.filter((r) => r.status === 'rejected')

      // Un seul gagnant annule ; l'autre échoue avec ConflictError (déjà annulé)
      expect(fulfilled).toHaveLength(1)
      expect(rejected).toHaveLength(1)
      expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictError)

      // Exactement un lot : 2 participants → 2 appels au total, pas 4
      expect(sendEmailSpy).toHaveBeenCalledTimes(2)

      // Les réservations sont préservées (soft-delete)
      const bookingsAfter = await query(
        `SELECT COUNT(*) as count FROM bookings WHERE slot_id = $1`,
        [slotId]
      )
      expect(parseInt(bookingsAfter.rows[0].count)).toBe(2)

      await query(`DELETE FROM users WHERE id IN ($1, $2)`, [user1.id, user2.id])
      sendEmailSpy.mockRestore()
    })
  })
})
