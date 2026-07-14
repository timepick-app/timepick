import request from 'supertest'
import jwt from 'jsonwebtoken'
import { testServer } from '../helpers/test-server'
import { query } from '../../db'

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret'

/**
 * Tests d'intégration pour le service d'export CSV
 *
 * Ces tests vérifient que l'endpoint d'export génère un CSV valide
 * avec le bon format (UTF-8 BOM, point-virgule, dates françaises)
 */
describe('Export Réservations CSV', () => {
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
      [`test-export-admin-${uniqueSuffix}@example.com`, 'Test Admin', 'admin']
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
   * Helper pour créer un créneau de test
   * Note: La date doit être dans le futur selon le validateur
   */
  async function createTestSlot(eventId: string, startTimeOffsetHours: number, capacity: number) {
    // Date dans le futur (maintenant + offset heures)
    const startTime = new Date(Date.now() + startTimeOffsetHours * 60 * 60 * 1000)
    const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000) // +2 heures

    const res = await request(testServer())
      .post(`/api/admin/events/${eventId}/slots`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        eventId,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        capacity
      })
    return res.body?.data
  }

  /**
   * Helper pour créer un utilisateur de test
   */
  async function createTestUser(overrides?: { firstName?: string; role?: string }) {
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`
    const userResult = await query(
      `INSERT INTO users (email, first_name, role) VALUES ($1, $2, $3) RETURNING id`,
      [
        `test-export-user-${uniqueSuffix}@example.com`,
        overrides?.firstName || 'Test User',
        overrides?.role || 'user'
      ]
    )
    const userId = userResult.rows[0].id
    const token = jwt.sign({ userId, role: overrides?.role || 'user' }, JWT_SECRET, { expiresIn: '1h' })
    return { id: userId, token }
  }

  /**
   * Helper pour créer une réservation de test
   */
  async function createTestBooking(slotId: string, userId: string) {
    const result = await query(
      'INSERT INTO bookings (slot_id, user_id) VALUES ($1, $2) RETURNING *',
      [slotId, userId]
    )
    return result.rows[0]
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

  // Nettoyer l'admin à la fin
  afterAll(async () => {
    await query("DELETE FROM users WHERE email LIKE '%test-export-%'")
  })

  describe('GET /api/admin/events/:id/export/reservations', () => {
    beforeEach(async () => {
      const event = await createTestEvent('Test Export Event')
      testEventId = event.id
    })

    afterEach(async () => {
      await query('DELETE FROM bookings WHERE slot_id IN (SELECT id FROM slots WHERE event_id = $1)', [testEventId])
      await query('DELETE FROM slots WHERE event_id = $1', [testEventId])
      await query('DELETE FROM event_users WHERE event_id = $1', [testEventId])
      await query('DELETE FROM events WHERE id = $1', [testEventId])
    })

    it('retourne un fichier CSV valide', async () => {
      const res = await request(testServer())
        .get(`/api/admin/events/${testEventId}/export/reservations`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.headers['content-type']).toContain('text/csv')
      expect(res.headers['content-disposition']).toContain('attachment')
      // Vérifier que le contenu contient les en-têtes CSV (avec ou sans BOM)
      expect(res.text).toMatch(/Prénom;Nom;Email;Téléphone/)
    })

    it('inclut l\'UTF-8 BOM pour Excel', async () => {
      const res = await request(testServer())
        .get(`/api/admin/events/${testEventId}/export/reservations`)
        .set('Authorization', `Bearer ${adminToken}`)

      // Le BOM UTF-8 est \uFEFF (caractère invisible en début de fichier)
      const firstChar = res.text.charAt(0)
      expect(firstChar.charCodeAt(0)).toBe(0xFEFF) // BOM UTF-8
    })

    it('utilise le point-virgule comme délimiteur', async () => {
      const res = await request(testServer())
        .get(`/api/admin/events/${testEventId}/export/reservations`)
        .set('Authorization', `Bearer ${adminToken}`)

      // Vérifier que la première ligne contient des points-virgules
      // On retire le BOM pour la vérification
      const textWithoutBOM = res.text.replace(/^\uFEFF/, '')
      const firstLine = textWithoutBOM.split('\n')[0]
      expect(firstLine).toMatch(/;/)
    })

    it('génère un CSV avec toutes les colonnes attendues', async () => {
      const res = await request(testServer())
        .get(`/api/admin/events/${testEventId}/export/reservations`)
        .set('Authorization', `Bearer ${adminToken}`)

      // Retirer le BOM UTF-8 pour la comparaison
      const textWithoutBOM = res.text.replace(/^\uFEFF/, '')
      const lines = textWithoutBOM.split('\n').filter((line: string) => line.trim())
      expect(lines[0]).toBe('Prénom;Nom;Email;Téléphone;Date de réservation;Créneau;Événement')
    })

    it('génère un nom de fichier dynamique avec nom événement et date', async () => {
      const res = await request(testServer())
        .get(`/api/admin/events/${testEventId}/export/reservations`)
        .set('Authorization', `Bearer ${adminToken}`)

      const contentDisposition = res.headers['content-disposition']
      expect(contentDisposition).toMatch(/reservations_.*_\d{4}-\d{2}-\d{2}\.csv/)
    })

    it('expose le header Content-Disposition via CORS', async () => {
      const res = await request(testServer())
        .get(`/api/admin/events/${testEventId}/export/reservations`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.headers['access-control-expose-headers']?.toLowerCase()).toContain('content-disposition')
    })

    it('translittère les accents du nom événement dans le nom de fichier', async () => {
      const event = await createTestEvent('Fête de la Lune')
      const res = await request(testServer())
        .get(`/api/admin/events/${event.id}/export/reservations`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.headers['content-disposition']).toMatch(/reservations_fete_de_la_lune_\d{4}-\d{2}-\d{2}\.csv/)

      await query('DELETE FROM events WHERE id = $1', [event.id])
    })

    it('inclut les données de réservations quand il y en a', async () => {
      // Créer un créneau et une réservation
      const slot = await createTestSlot(testEventId, 24, 5) // 24h dans le futur
      expect(slot).toBeDefined()

      const testUser = await createTestUser()
      await createTestBooking(slot.id, testUser.id)

      const res = await request(testServer())
        .get(`/api/admin/events/${testEventId}/export/reservations`)
        .set('Authorization', `Bearer ${adminToken}`)

      const textWithoutBOM = res.text.replace(/^\uFEFF/, '')
      const lines = textWithoutBOM.split('\n').filter((line: string) => line.trim())
      // Au moins 2 lignes: en-têtes + 1 réservation
      expect(lines.length).toBeGreaterThanOrEqual(2)

      // Vérifier que la ligne de réservation contient des données
      const dataLine = lines[1]
      expect(dataLine).toContain(';') // Au moins un délimiteur
      expect(dataLine).toMatch(/\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/) // Format date française
    })

    it('retourne uniquement les en-têtes si aucune réservation', async () => {
      const res = await request(testServer())
        .get(`/api/admin/events/${testEventId}/export/reservations`)
        .set('Authorization', `Bearer ${adminToken}`)

      const textWithoutBOM = res.text.replace(/^\uFEFF/, '')
      const lines = textWithoutBOM.split('\n').filter((line: string) => line.trim())
      // Seulement la ligne d'en-têtes
      expect(lines.length).toBe(1)
      expect(lines[0]).toBe('Prénom;Nom;Email;Téléphone;Date de réservation;Créneau;Événement')
    })

    it('formate les dates en français', async () => {
      // Créer un créneau avec une date dans le futur
      const slot = await createTestSlot(testEventId, 48, 5) // 48h dans le futur
      expect(slot).toBeDefined()

      const testUser = await createTestUser()
      await createTestBooking(slot.id, testUser.id)

      const res = await request(testServer())
        .get(`/api/admin/events/${testEventId}/export/reservations`)
        .set('Authorization', `Bearer ${adminToken}`)

      const text = res.text
      // Vérifier le format de date français JJ/MM/AAAA
      expect(text).toMatch(/\d{2}\/\d{2}\/\d{4}/)
    })

    it('trie les réservations par date de créneau puis par nom', async () => {
      // Créer plusieurs créneaux et réservations
      const slot1 = await createTestSlot(testEventId, 72, 5)  // 72h dans le futur
      const slot2 = await createTestSlot(testEventId, 96, 5)  // 96h dans le futur

      expect(slot1).toBeDefined()
      expect(slot2).toBeDefined()

      // Créer des utilisateurs avec des noms différents pour tester le tri
      const userZ = await createTestUser({ firstName: 'Zoe Test' })
      const userA = await createTestUser({ firstName: 'Alice Test' })

      // Créer des réservations dans le désordre
      await createTestBooking(slot2.id, userZ.id)
      await createTestBooking(slot1.id, userA.id)

      const res = await request(testServer())
        .get(`/api/admin/events/${testEventId}/export/reservations`)
        .set('Authorization', `Bearer ${adminToken}`)

      const textWithoutBOM = res.text.replace(/^\uFEFF/, '')
      const lines = textWithoutBOM.split('\n').filter((line: string) => line.trim())
      // Vérifier qu'Alice (slot1, plus tôt) apparaît avant Zoe (slot2, plus tard)
      const aliceLine = lines.find((line: string) => line.includes('Alice Test'))
      const zoeLine = lines.find((line: string) => line.includes('Zoe Test'))
      expect(aliceLine).toBeDefined()
      expect(zoeLine).toBeDefined()

      // L'index d'Alice doit être avant celui de Zoe
      expect(lines.indexOf(aliceLine!)).toBeLessThan(lines.indexOf(zoeLine!))
    })

    it('retourne 404 si événement non trouvé', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000'
      const res = await request(testServer())
        .get(`/api/admin/events/${fakeId}/export/reservations`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(404)
      expect(res.body.error).toContain('Événement non trouvé')
    })

    it('retourne 403 sans auth admin', async () => {
      // Créer un utilisateur non-admin
      const regularUser = await createTestUser()

      const res = await request(testServer())
        .get(`/api/admin/events/${testEventId}/export/reservations`)
        .set('Authorization', `Bearer ${regularUser.token}`)

      expect(res.status).toBe(403)
    })

    it('retourne 401 sans token', async () => {
      const res = await request(testServer())
        .get(`/api/admin/events/${testEventId}/export/reservations`)

      expect(res.status).toBe(401)
    })

    it('gère les caractères spéciaux dans les noms (point-virgule, guillemets)', async () => {
      // Créer un créneau et une réservation avec un nom contenant des caractères spéciaux
      const slot = await createTestSlot(testEventId, 24, 5)
      expect(slot).toBeDefined()

      // Créer un utilisateur avec un nom contenant un point-virgule et des guillemets
      const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`
      const userResult = await query(
        `INSERT INTO users (email, first_name, role) VALUES ($1, $2, $3) RETURNING id`,
        [`test-special-${uniqueSuffix}@example.com`, 'Dupont; Jean "Le Boss"', 'user']
      )
      const userId = userResult.rows[0].id
      await createTestBooking(slot.id, userId)

      const res = await request(testServer())
        .get(`/api/admin/events/${testEventId}/export/reservations`)
        .set('Authorization', `Bearer ${adminToken}`)

      const textWithoutBOM = res.text.replace(/^\uFEFF/, '')
      // Le champ avec des caractères spéciaux doit être entre guillemets
      expect(textWithoutBOM).toMatch(/"Dupont; Jean ""Le Boss"""/)
      // Nettoyer
      await query('DELETE FROM users WHERE id = $1', [userId])
    })

    it('gère correctement les téléphones null (champ vide dans le CSV)', async () => {
      const slot = await createTestSlot(testEventId, 24, 5)
      expect(slot).toBeDefined()

      // Créer un utilisateur sans téléphone (phone = NULL)
      const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`
      const userResult = await query(
        `INSERT INTO users (email, first_name, phone, role) VALUES ($1, $2, NULL, $3) RETURNING id`,
        [`test-nophone-${uniqueSuffix}@example.com`, 'No Phone User', 'user']
      )
      const userId = userResult.rows[0].id
      await createTestBooking(slot.id, userId)

      const res = await request(testServer())
        .get(`/api/admin/events/${testEventId}/export/reservations`)
        .set('Authorization', `Bearer ${adminToken}`)

      const textWithoutBOM = res.text.replace(/^\uFEFF/, '')
      const lines = textWithoutBOM.split('\n').filter((line: string) => line.trim())

      // Trouver la ligne de l'utilisateur
      const userLine = lines.find((line: string) => line.includes('No Phone User'))
      expect(userLine).toBeDefined()

      // Vérifier que le téléphone est vide (3ème colonne après le nom et l'email)
      // Format: Nom;Email;Téléphone;...
      const parts = userLine!.split(';')
      expect(parts[3]).toBe('') // Téléphone vide (index 3 : colonnes Prénom;Nom;Email;Téléphone)
      // Nettoyer
      await query('DELETE FROM users WHERE id = $1', [userId])
    })

    it('aligne Prénom/Nom en colonnes distinctes (D5, détecte un swap)', async () => {
      const slot = await createTestSlot(testEventId, 26, 5)
      const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`
      const userResult = await query(
        `INSERT INTO users (email, first_name, last_name, role) VALUES ($1, 'Jean', 'Dupont', 'user') RETURNING id`,
        [`split-align-${uniqueSuffix}@example.com`]
      )
      const userId = userResult.rows[0].id
      await createTestBooking(slot.id, userId)

      const res = await request(testServer())
        .get(`/api/admin/events/${testEventId}/export/reservations`)
        .set('Authorization', `Bearer ${adminToken}`)

      const textWithoutBOM = res.text.replace(/^\uFEFF/, '')
      const lines = textWithoutBOM.split('\n').filter((line: string) => line.trim())
      const userLine = lines.find((line: string) => line.includes(`split-align-${uniqueSuffix}@example.com`))
      expect(userLine).toBeDefined()

      // Format: Prénom;Nom;Email;... → Prénom=index 0, Nom=index 1
      const parts = userLine!.split(';')
      expect(parts[0]).toBe('Jean')
      expect(parts[1]).toBe('Dupont')
      await query('DELETE FROM users WHERE id = $1', [userId])
    })
  })
})
