import request from 'supertest'
import jwt from 'jsonwebtoken'
import { testServer } from '../helpers/test-server'
import pool from '../../db/pool'
import * as emailService from '../../services/email-send.service'

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret'

// Mocke les emails transactionnels au niveau fichier : les routes /api/public/reservations
// passent par reservation.service, qui émet sendReservationEmail (création) et
// sendUnregistrationEmail (désinscription) en fire-and-forget. Sans mock, ces envois
// atteindraient le vrai Mailpit dev (127.0.0.1:1025) par intermittence. Ces tests valident
// la logique de réservation / anti-surbooking, pas la livraison email.
// beforeAll/afterAll au niveau fichier → couvre tous les describe (POST, GET, DELETE, race…).
beforeAll(() => {
  jest.spyOn(emailService, 'sendReservationEmail').mockResolvedValue(true)
  jest.spyOn(emailService, 'sendUnregistrationEmail').mockResolvedValue(true)
})

afterAll(() => {
  jest.restoreAllMocks()
})

/**
 * Integration Tests pour le système de réservations
 * API: /api/public/reservations
 *
 * Teste:
 * - Création de réservation avec transaction SELECT FOR UPDATE
 * - Protection contre le surbooking (capacité)
 * - Protection contre la double réservation (UNIQUE constraint)
 * - Race conditions avec requêtes concurrentes
 * - Annulation de réservation
 * - Liste des réservations utilisateur
 */

describe('POST /api/public/reservations - Create Reservation', () => {
  let adminUserId: string
  let adminToken: string
  let testUserId: string
  let testUserToken: string
  let testUserId2: string
  let testUserToken2: string
  let testEventId: string
  let testSlotId: string

  beforeAll(async () => {
    // Create admin user
    const adminResult = await pool.query(`
      INSERT INTO users (email, first_name, role)
      VALUES ('reservations-admin@test.com', 'Reservations Admin', 'admin')
      ON CONFLICT (email) DO UPDATE SET role = 'admin'
      RETURNING id
    `)
    adminUserId = adminResult.rows[0].id
    adminToken = jwt.sign({ userId: adminUserId, role: 'admin' }, JWT_SECRET, { expiresIn: '1h' })

    // Create test user 1
    const userResult = await pool.query(`
      INSERT INTO users (email, first_name, role)
      VALUES ('reservations-user@test.com', 'Reservations User', 'user')
      ON CONFLICT (email) DO UPDATE SET role = 'user'
      RETURNING id
    `)
    testUserId = userResult.rows[0].id
    testUserToken = jwt.sign({ userId: testUserId, role: 'user' }, JWT_SECRET, { expiresIn: '1h' })

    // Create test user 2
    const userResult2 = await pool.query(`
      INSERT INTO users (email, first_name, role)
      VALUES ('reservations-user2@test.com', 'Reservations User 2', 'user')
      ON CONFLICT (email) DO UPDATE SET role = 'user'
      RETURNING id
    `)
    testUserId2 = userResult2.rows[0].id
    testUserToken2 = jwt.sign({ userId: testUserId2, role: 'user' }, JWT_SECRET, { expiresIn: '1h' })

    // Create a test event
    const eventResult = await pool.query(`
      INSERT INTO events (name, description, is_published)
      VALUES ('Test Event for Reservations', 'Event description', true)
      RETURNING id
    `)
    testEventId = eventResult.rows[0].id

    // Create a test slot with capacity 2
    const slotResult = await pool.query(`
      INSERT INTO slots (event_id, start_time, end_time, capacity)
      VALUES ($1, NOW() + INTERVAL '1 day', NOW() + INTERVAL '1 day 2 hours', 2)
      RETURNING id
    `, [testEventId])
    testSlotId = slotResult.rows[0].id
  })

  afterAll(async () => {
    // Clean up test data
    await pool.query("DELETE FROM users WHERE email LIKE 'reservations-%@test.com'")
    await pool.query("DELETE FROM slots WHERE event_id = $1", [testEventId])
    await pool.query("DELETE FROM events WHERE name = 'Test Event for Reservations'")
  })

  afterEach(async () => {
    // Clean up bookings after each test
    await pool.query("DELETE FROM bookings WHERE slot_id = $1", [testSlotId])
  })

  describe('[P0] Création de réservation avec succès', () => {
    it('[P0] devrait créer une réservation avec authentification valide', async () => {
      const res = await request(testServer())
        .post('/api/public/reservations')
        .set('Authorization', `Bearer ${testUserToken}`)
        .send({ slotId: testSlotId })

      expect(res.status).toBe(201)
      expect(res.body.data).toHaveProperty('id')
      expect(res.body.data.slotId).toBe(testSlotId)
      expect(res.body.data.userId).toBe(testUserId)
      expect(res.body.message).toBe('Réservation confirmée')
    })

    it('[P0] devrait retourner 401 sans authentification', async () => {
      const res = await request(testServer())
        .post('/api/public/reservations')
        .send({ slotId: testSlotId })

      expect(res.status).toBe(401)
    })
  })

  describe('[P0] Protection contre le surbooking', () => {
    it('[P0] devrait empêcher la réservation si capacité atteinte', async () => {
      // Remplir le créneau (capacity = 2)
      await request(testServer())
        .post('/api/public/reservations')
        .set('Authorization', `Bearer ${testUserToken}`)
        .send({ slotId: testSlotId })

      await request(testServer())
        .post('/api/public/reservations')
        .set('Authorization', `Bearer ${testUserToken2}`)
        .send({ slotId: testSlotId })

      // Vérifier que les 2 réservations existent
      const bookings = await pool.query(
        'SELECT COUNT(*) as count FROM bookings WHERE slot_id = $1',
        [testSlotId]
      )
      expect(parseInt(bookings.rows[0].count)).toBe(2)

      // Troisième tentative doit échouer
      const res = await request(testServer())
        .post('/api/public/reservations')
        .set('Authorization', `Bearer ${testUserToken}`)
        .send({ slotId: testSlotId })

      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('SLOT_FULL')
      expect(res.body.error.message).toContain('vient d\'être pris')
    })

    it('[P0] devrait gérer les race conditions avec SELECT FOR UPDATE (3 requêtes pour 1 place)', async () => {
      // Créer un nouveau créneau avec capacité 1
      const slotResult = await pool.query(`
        INSERT INTO slots (event_id, start_time, end_time, capacity)
        VALUES ($1, NOW() + INTERVAL '2 days', NOW() + INTERVAL '2 days 2 hours', 1)
        RETURNING id
      `, [testEventId])
      const singleSlotId = slotResult.rows[0].id

      // Créer 2 utilisateurs supplémentaires
      const users = await Promise.all([
        pool.query(`INSERT INTO users (email, first_name, role) VALUES ('race1@test.com', 'Race 1', 'user') ON CONFLICT (email) DO UPDATE SET role = 'user' RETURNING id`),
        pool.query(`INSERT INTO users (email, first_name, role) VALUES ('race2@test.com', 'Race 2', 'user') ON CONFLICT (email) DO UPDATE SET role = 'user' RETURNING id`),
      ])

      const userTokens = users.map(u => jwt.sign({ userId: u.rows[0].id, role: 'user' }, JWT_SECRET, { expiresIn: '1h' }))

      // 3 requêtes simultanées pour 1 place
      const bookingPromises = [
        ...userTokens.map(token =>
          request(testServer())
            .post('/api/public/reservations')
            .set('Authorization', `Bearer ${token}`)
            .send({ slotId: singleSlotId })
        ),
        request(testServer()).post('/api/public/reservations')
          .set('Authorization', `Bearer ${testUserToken}`)
          .send({ slotId: singleSlotId }),
      ]

      const results = await Promise.all(bookingPromises)

      // Exactement 1 réservation doit réussir
      const successfulBookings = results.filter(r => r.status === 201)
      const failedBookings = results.filter(r => r.status === 409)

      expect(successfulBookings).toHaveLength(1)
      expect(failedBookings).toHaveLength(2)

      // Vérifier l'état de la base de données (0 surbooking)
      const bookingCount = await pool.query('SELECT COUNT(*) FROM bookings WHERE slot_id = $1', [singleSlotId])
      expect(parseInt(bookingCount.rows[0].count)).toBe(1)

      // Clean up
      await pool.query("DELETE FROM users WHERE email LIKE 'race%@test.com'")
      await pool.query("DELETE FROM slots WHERE id = $1", [singleSlotId])
    })

    it('[P0] devrait garantir 0 surbooking avec 10 requêtes simultanées pour capacité 5', async () => {
      // Créer un créneau avec capacité 5
      const slotResult = await pool.query(`
        INSERT INTO slots (event_id, start_time, end_time, capacity)
        VALUES ($1, NOW() + INTERVAL '3 days', NOW() + INTERVAL '3 days 2 hours', 5)
        RETURNING id
      `, [testEventId])
      const slotId = slotResult.rows[0].id

      // Créer 10 utilisateurs
      const userIds: string[] = []
      for (let i = 0; i < 10; i++) {
        const result = await pool.query(
          `INSERT INTO users (email, first_name, role) VALUES ('capacity${i}@test.com', 'Capacity User ${i}', 'user')
           ON CONFLICT (email) DO UPDATE SET role = 'user' RETURNING id`
        )
        userIds.push(result.rows[0].id)
      }

      const tokens = userIds.map(id => jwt.sign({ userId: id, role: 'user' }, JWT_SECRET, { expiresIn: '1h' }))

      // 10 requêtes simultanées pour 5 places
      const bookingPromises = tokens.map(token =>
        request(testServer())
          .post('/api/public/reservations')
          .set('Authorization', `Bearer ${token}`)
          .send({ slotId })
      )

      const results = await Promise.all(bookingPromises)

      // Exactement 5 réservations doivent réussir
      const successCount = results.filter(r => r.status === 201).length
      const conflictCount = results.filter(r => r.status === 409).length

      expect(successCount).toBe(5)
      expect(conflictCount).toBe(5)

      // Vérifier l'intégrité en DB (0 surbooking)
      const dbBookings = await pool.query(
        'SELECT COUNT(*) as count FROM bookings WHERE slot_id = $1',
        [slotId]
      )
      expect(parseInt(dbBookings.rows[0].count)).toBe(5)

      // Clean up
      await pool.query("DELETE FROM users WHERE email LIKE 'capacity%@test.com'")
      await pool.query("DELETE FROM bookings WHERE slot_id = $1", [slotId])
      await pool.query("DELETE FROM slots WHERE id = $1", [slotId])
    })

    it('[P0] devrait garantir 0 surbooking avec forte charge (20 requêtes pour capacité 3)', async () => {
      // Créer un créneau avec capacité 3
      const slotResult = await pool.query(`
        INSERT INTO slots (event_id, start_time, end_time, capacity)
        VALUES ($1, NOW() + INTERVAL '4 days', NOW() + INTERVAL '4 days 2 hours', 3)
        RETURNING id
      `, [testEventId])
      const slotId = slotResult.rows[0].id

      // Créer 20 utilisateurs
      const userIds: string[] = []
      for (let i = 0; i < 20; i++) {
        const result = await pool.query(
          `INSERT INTO users (email, first_name, role) VALUES ('load${i}@test.com', 'Load User ${i}', 'user')
           ON CONFLICT (email) DO UPDATE SET role = 'user' RETURNING id`
        )
        userIds.push(result.rows[0].id)
      }

      const tokens = userIds.map(id => jwt.sign({ userId: id, role: 'user' }, JWT_SECRET, { expiresIn: '1h' }))

      // 20 requêtes simultanées pour 3 places
      const bookingPromises = tokens.map(token =>
        request(testServer())
          .post('/api/public/reservations')
          .set('Authorization', `Bearer ${token}`)
          .send({ slotId })
      )

      const results = await Promise.all(bookingPromises)

      // Exactement 3 réservations doivent réussir
      const successCount = results.filter(r => r.status === 201).length
      const conflictCount = results.filter(r => r.status === 409).length

      expect(successCount).toBe(3)
      expect(conflictCount).toBe(17)

      // Vérifier l'intégrité en DB (0 surbooking)
      const dbBookings = await pool.query(
        'SELECT COUNT(*) as count FROM bookings WHERE slot_id = $1',
        [slotId]
      )
      expect(parseInt(dbBookings.rows[0].count)).toBe(3)

      // Vérifier que current_bookings ne dépasse jamais capacity
      const slotBookings = parseInt(dbBookings.rows[0].count)
      expect(slotBookings).toBeLessThanOrEqual(3)

      // Clean up
      await pool.query("DELETE FROM users WHERE email LIKE 'load%@test.com'")
      await pool.query("DELETE FROM bookings WHERE slot_id = $1", [slotId])
      await pool.query("DELETE FROM slots WHERE id = $1", [slotId])
    })

    it('[P1] devrait garantir 0 surbooking avec test de bord (capacité 2, 3 requêtes)', async () => {
      // Test de bord : capacité minimale > 1 avec une requête en plus
      const slotResult = await pool.query(`
        INSERT INTO slots (event_id, start_time, end_time, capacity)
        VALUES ($1, NOW() + INTERVAL '5 days', NOW() + INTERVAL '5 days 2 hours', 2)
        RETURNING id
      `, [testEventId])
      const slotId = slotResult.rows[0].id

      // Créer 3 utilisateurs pour 2 places
      const userIds: string[] = []
      for (let i = 0; i < 3; i++) {
        const result = await pool.query(
          `INSERT INTO users (email, first_name, role) VALUES ('edge${i}@test.com', 'Edge User ${i}', 'user')
           ON CONFLICT (email) DO UPDATE SET role = 'user' RETURNING id`
        )
        userIds.push(result.rows[0].id)
      }

      const tokens = userIds.map(id => jwt.sign({ userId: id, role: 'user' }, JWT_SECRET, { expiresIn: '1h' }))

      // 3 requêtes simultanées pour 2 places (test de bord)
      const bookingPromises = tokens.map(token =>
        request(testServer())
          .post('/api/public/reservations')
          .set('Authorization', `Bearer ${token}`)
          .send({ slotId })
      )

      const results = await Promise.all(bookingPromises)

      // Exactement 2 réservations doivent réussir, 1 échouer
      const successCount = results.filter(r => r.status === 201).length
      const conflictCount = results.filter(r => r.status === 409).length

      expect(successCount).toBe(2)
      expect(conflictCount).toBe(1)

      // Vérifier l'intégrité en DB (0 surbooking)
      const dbBookings = await pool.query(
        'SELECT COUNT(*) as count FROM bookings WHERE slot_id = $1',
        [slotId]
      )
      expect(parseInt(dbBookings.rows[0].count)).toBe(2)

      // Clean up
      await pool.query("DELETE FROM users WHERE email LIKE 'edge%@test.com'")
      await pool.query("DELETE FROM bookings WHERE slot_id = $1", [slotId])
      await pool.query("DELETE FROM slots WHERE id = $1", [slotId])
    })
  })

  describe('[P1] Protection contre la double réservation', () => {
    it('[P1] devrait empêcher un utilisateur de réserver deux fois le même créneau', async () => {
      // Première réservation
      await request(testServer())
        .post('/api/public/reservations')
        .set('Authorization', `Bearer ${testUserToken}`)
        .send({ slotId: testSlotId })

      // Deuxième tentative avec le même utilisateur
      const res = await request(testServer())
        .post('/api/public/reservations')
        .set('Authorization', `Bearer ${testUserToken}`)
        .send({ slotId: testSlotId })

      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('ALREADY_BOOKED')
    })
  })

  describe('[P1] Validation et erreurs', () => {
    it('[P1] devrait retourner 404 pour un créneau inexistant', async () => {
      const res = await request(testServer())
        .post('/api/public/reservations')
        .set('Authorization', `Bearer ${testUserToken}`)
        .send({ slotId: '00000000-0000-0000-0000-000000000000' })

      expect(res.status).toBe(404)
      expect(res.body.error).toBe('Créneau non trouvé')
    })

    it('[P1] devrait valider le format du slotId', async () => {
      const res = await request(testServer())
        .post('/api/public/reservations')
        .set('Authorization', `Bearer ${testUserToken}`)
        .send({ slotId: 'invalid-uuid' })

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Données invalides')
    })

    it('[P1] devrait retourner 400 pour slotId manquant', async () => {
      const res = await request(testServer())
        .post('/api/public/reservations')
        .set('Authorization', `Bearer ${testUserToken}`)
        .send({})

      expect(res.status).toBe(400)
    })
  })

  describe('[P1] GET /api/public/reservations - Mes réservations', () => {
    it('[P1] devrait retourner les réservations de l\'utilisateur', async () => {
      // Créer une réservation
      await request(testServer())
        .post('/api/public/reservations')
        .set('Authorization', `Bearer ${testUserToken}`)
        .send({ slotId: testSlotId })

      const res = await request(testServer())
        .get('/api/public/reservations')
        .set('Authorization', `Bearer ${testUserToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data).toBeInstanceOf(Array)
      expect(res.body.data.length).toBeGreaterThan(0)
      expect(res.body.data[0]).toHaveProperty('slot')
      expect(res.body.data[0].slot).toHaveProperty('startTime')
    })

    it('[P1] devrait retourner 401 sans authentification', async () => {
      const res = await request(testServer())
        .get('/api/public/reservations')

      expect(res.status).toBe(401)
    })
  })

  describe('[P1] DELETE /api/public/reservations/:id - Annuler réservation', () => {
    it('[P1] devrait annuler une réservation', async () => {
      // Créer une réservation
      const createRes = await request(testServer())
        .post('/api/public/reservations')
        .set('Authorization', `Bearer ${testUserToken}`)
        .send({ slotId: testSlotId })

      const bookingId = createRes.body.data.id

      // Annuler
      const deleteRes = await request(testServer())
        .delete(`/api/public/reservations/${bookingId}`)
        .set('Authorization', `Bearer ${testUserToken}`)

      expect(deleteRes.status).toBe(200)
      expect(deleteRes.body.message).toBe('Réservation annulée')

      // Vérifier que la réservation n'existe plus
      const booking = await pool.query(
        'SELECT * FROM bookings WHERE id = $1',
        [bookingId]
      )
      expect(booking.rows.length).toBe(0)
    })

    it('[P1] devrait retourner 404 pour une réservation inexistante', async () => {
      const res = await request(testServer())
        .delete('/api/public/reservations/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${testUserToken}`)

      expect(res.status).toBe(404)
    })

    it('[P1] ne devrait pas permettre d\'annuler la réservation d\'un autre utilisateur', async () => {
      // Créer une réservation avec user1
      const createRes = await request(testServer())
        .post('/api/public/reservations')
        .set('Authorization', `Bearer ${testUserToken}`)
        .send({ slotId: testSlotId })

      const bookingId = createRes.body.data.id

      // Tenter d'annuler avec user2
      const deleteRes = await request(testServer())
        .delete(`/api/public/reservations/${bookingId}`)
        .set('Authorization', `Bearer ${testUserToken2}`)

      expect(deleteRes.status).toBe(404) // NotFound car pas la réservation de user2
    })
  })

  describe('[P1] DELETE /api/public/reservations/by-slot/:slotId - Annuler par créneau', () => {
    it('[P1] devrait annuler une réservation en utilisant slotId', async () => {
      // Créer une réservation
      await request(testServer())
        .post('/api/public/reservations')
        .set('Authorization', `Bearer ${testUserToken}`)
        .send({ slotId: testSlotId })

      // Annuler par slotId
      const deleteRes = await request(testServer())
        .delete(`/api/public/reservations/by-slot/${testSlotId}`)
        .set('Authorization', `Bearer ${testUserToken}`)

      expect(deleteRes.status).toBe(200)
      expect(deleteRes.body.message).toBe('Réservation annulée')
    })

    it('[P1] devrait être idempotent (pas d\'erreur si pas de réservation)', async () => {
      const res = await request(testServer())
        .delete(`/api/public/reservations/by-slot/${testSlotId}`)
        .set('Authorization', `Bearer ${testUserToken}`)

      expect(res.status).toBe(200) // Succès même si aucune réservation
    })
  })

  describe('[Régression] Désinscription utilise sendUnregistrationEmail, pas sendSlotCancellationEmail', () => {
    it('DELETE by-id déclenche sendUnregistrationEmail', async () => {
      const spyUnreg = jest.spyOn(emailService, 'sendUnregistrationEmail').mockResolvedValue(true)
      // sendSlotCancellationEmail ne doit PAS être appelée — vérifier par absence
      const spyCancellation = jest.spyOn(emailService, 'sendSlotCancellationEmail').mockResolvedValue(true)

      // Créer + annuler une réservation
      const createRes = await request(testServer())
        .post('/api/public/reservations')
        .set('Authorization', `Bearer ${testUserToken}`)
        .send({ slotId: testSlotId })
      const bookingId = createRes.body.data.id

      await request(testServer())
        .delete(`/api/public/reservations/${bookingId}`)
        .set('Authorization', `Bearer ${testUserToken}`)

      // Laisser le fire-and-forget se terminer
      await new Promise((r) => setTimeout(r, 100))

      expect(spyUnreg).toHaveBeenCalled()
      expect(spyCancellation).not.toHaveBeenCalled()
      spyUnreg.mockRestore()
      spyCancellation.mockRestore()
    })

    it('DELETE by-slot déclenche sendUnregistrationEmail', async () => {
      const spyUnreg = jest.spyOn(emailService, 'sendUnregistrationEmail').mockResolvedValue(true)
      const spyCancellation = jest.spyOn(emailService, 'sendSlotCancellationEmail').mockResolvedValue(true)

      // Créer une réservation
      await request(testServer())
        .post('/api/public/reservations')
        .set('Authorization', `Bearer ${testUserToken}`)
        .send({ slotId: testSlotId })

      await request(testServer())
        .delete(`/api/public/reservations/by-slot/${testSlotId}`)
        .set('Authorization', `Bearer ${testUserToken}`)

      await new Promise((r) => setTimeout(r, 100))

      expect(spyUnreg).toHaveBeenCalled()
      expect(spyCancellation).not.toHaveBeenCalled()
      spyUnreg.mockRestore()
      spyCancellation.mockRestore()
    })
  })

  describe('[Régression] Inscription → email de confirmation au bon destinataire', () => {
    it("POST création déclenche sendReservationEmail avec l'email du membre (bug snake/camel)", async () => {
      // Slot dédié → isole de la capacité/contention des autres tests du describe.
      const slot = await pool.query(
        `INSERT INTO slots (event_id, start_time, end_time, capacity)
         VALUES ($1, NOW() + INTERVAL '3 days', NOW() + INTERVAL '3 days 1 hour', 1)
         RETURNING id`,
        [testEventId],
      )
      const slotId = slot.rows[0].id

      const spyConfirm = jest.spyOn(emailService, 'sendReservationEmail').mockResolvedValue(true)
      spyConfirm.mockClear()

      const res = await request(testServer())
        .post('/api/public/reservations')
        .set('Authorization', `Bearer ${testUserToken2}`)
        .send({ slotId })
      expect(res.status).toBe(201)

      // Laisser le fire-and-forget se terminer.
      await new Promise((r) => setTimeout(r, 150))

      // Régression : la requête utilisait booking.userId (undefined sur la row brute
      // snake_case) → 0 ligne → email silencieusement sauté. On exige l'appel avec le
      // bon destinataire.
      expect(spyConfirm).toHaveBeenCalled()
      const emails = spyConfirm.mock.calls.map((c) => c[0].userEmail)
      expect(emails).toContain('reservations-user2@test.com')
    })
  })
})
