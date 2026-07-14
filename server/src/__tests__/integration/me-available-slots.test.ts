import request from 'supertest'
import jwt from 'jsonwebtoken'
import { testServer } from '../helpers/test-server'
import { query } from '../../db'
import {
  startTestTransaction,
  rollbackTestTransaction
} from '../helpers/transaction'

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret'

/**
 * Tests d'intégration de `GET /api/me/available-slots` (Story 1.8, AC4/AC5/AC6).
 *
 * Pattern A (transaction rollback) : les users sont créés en beforeAll via
 * `query()` et persistent pour le fichier ; les events/slots/bookings sont
 * créés DANS la transaction (via les helpers `query()`) et rollbackés en
 * afterEach. Le serveur partagé (testServer) tourne dans le process Jest, donc
 * la requête HTTP voit l'état de la transaction courante (même client central).
 *
 * Helpers copiés/collés depuis me-slots.test.ts (anti-pattern #3 : ne pas
 * extraire en shared helper — story scope limitée).
 */
describe('GET /api/me/available-slots', () => {
  let memberToken: string
  let otherMemberToken: string
  let memberUserId: string
  let otherMemberUserId: string

  /** Crée un user de test (role='user'). Persistant pour le fichier. */
  async function createTestUser(label: string): Promise<{ id: string }> {
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`
    const result = await query(
      `INSERT INTO users (email, first_name, role)
       VALUES ($1, $2, 'user')
       RETURNING id`,
      [`test-me-avail-${label}-${uniqueSuffix}@example.com`, label]
    )
    return result.rows[0]
  }

  function generateMemberToken(userId: string): string {
    return jwt.sign({ userId, role: 'user' }, JWT_SECRET, { expiresIn: '1h' })
  }

  beforeAll(async () => {
    const member = await createTestUser('Member')
    memberUserId = member.id
    memberToken = generateMemberToken(memberUserId)

    const other = await createTestUser('Other')
    otherMemberUserId = other.id
    otherMemberToken = generateMemberToken(otherMemberUserId)
  })

  beforeEach(async () => {
    await startTestTransaction()
  })

  afterEach(async () => {
    await rollbackTestTransaction()
  })

  // Les users sont créés en beforeAll HORS transaction (committés) : nettoyage
  // explicite pour éviter l'accumulation de rows orphelines à chaque run.
  afterAll(async () => {
    await query(`DELETE FROM users WHERE email LIKE 'test-me-avail-%@example.com'`)
  })

  // --- Helpers de fixtures (créés DANS la transaction, rollback auto) ---

  /** Crée un événement (publié par défaut) et retourne son UUID. */
  async function createTestEvent(
    name: string,
    options: { published?: boolean } = {}
  ): Promise<string> {
    const published = options.published ?? true
    const uniqueName = `${name} ${Date.now()}-${Math.random().toString(36).substring(7)}`
    const result = await query(
      `INSERT INTO events (name, is_published) VALUES ($1, $2) RETURNING id`,
      [uniqueName, published]
    )
    return result.rows[0].id
  }

  /** Rattache un user à un événement (table event_users). */
  async function attachUser(eventId: string, userId: string): Promise<void> {
    await query(
      `INSERT INTO event_users (event_id, user_id) VALUES ($1, $2)`,
      [eventId, userId]
    )
  }

  /** Crée un créneau actif (cancelled_at NULL) et retourne son UUID. */
  async function createSlot(
    eventId: string,
    start: Date,
    capacity = 5,
    durationMinutes = 60
  ): Promise<string> {
    const end = new Date(start.getTime() + durationMinutes * 60 * 1000)
    const result = await query(
      `INSERT INTO slots (event_id, start_time, end_time, capacity)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [eventId, start, end, capacity]
    )
    return result.rows[0].id
  }

  /** Marque un créneau comme annulé (soft-delete). */
  async function cancelSlot(slotId: string): Promise<void> {
    await query(`UPDATE slots SET cancelled_at = NOW() WHERE id = $1`, [slotId])
  }

  /** Crée une réservation d'un user sur un créneau. */
  async function createBooking(slotId: string, userId: string): Promise<void> {
    await query(
      `INSERT INTO bookings (slot_id, user_id) VALUES ($1, $2)`,
      [slotId, userId]
    )
  }

  const FUTURE = (): Date => new Date(Date.now() + 10 * 86400 * 1000) // +10j
  const PAST = (): Date => new Date(Date.now() - 10 * 86400 * 1000) // -10j

  it('401 sans token', async () => {
    const res = await request(testServer()).get('/api/me/available-slots')

    expect(res.status).toBe(401)
    expect(res.body).toHaveProperty('error')
  })

  it('AC4 — créneaux futurs libres dans mes événements', async () => {
    // Event 1 : 1 slot futur LIBRE (capacity 5, 0 bookings)
    const event1 = await createTestEvent('Evt libre')
    await attachUser(event1, memberUserId)
    const slotLibre = await createSlot(event1, FUTURE(), 5)

    // Event 2 : 1 slot futur PLEIN (capacity 1, 1 booking d'otherMember)
    const event2 = await createTestEvent('Evt plein')
    await attachUser(event2, memberUserId)
    const slotPlein = await createSlot(event2, FUTURE(), 1)
    await createBooking(slotPlein, otherMemberUserId)

    const res = await request(testServer())
      .get('/api/me/available-slots')
      .set('Authorization', `Bearer ${memberToken}`)

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)

    const slot = res.body.data[0]
    // Champs camelCase présents
    expect(slot).toHaveProperty('slotUuid', slotLibre)
    expect(slot).toHaveProperty('eventUuid', event1)
    expect(slot).toHaveProperty('eventName')
    expect(slot).toHaveProperty('startTime')
    expect(slot).toHaveProperty('endTime')
    expect(slot).toHaveProperty('availableSpots')
    // Pas de snake_case
    expect(slot).not.toHaveProperty('slot_uuid')
    expect(slot).not.toHaveProperty('available_spots')
  })

  it('AC4 — exclut créneaux déjà réservés par moi', async () => {
    const event = await createTestEvent('Evt reservé')
    await attachUser(event, memberUserId)
    const slot = await createSlot(event, FUTURE(), 5)
    // Le membre réserve lui-même ce slot
    await createBooking(slot, memberUserId)

    const res = await request(testServer())
      .get('/api/me/available-slots')
      .set('Authorization', `Bearer ${memberToken}`)

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(0)
  })

  it('AC4 — LIMIT 10', async () => {
    const event = await createTestEvent('Evt limit')
    await attachUser(event, memberUserId)

    // 15 slots futurs libres avec dates croissantes distinctes
    for (let i = 0; i < 15; i++) {
      const start = new Date(Date.now() + (i + 1) * 86400 * 1000)
      await createSlot(event, start, 5)
    }

    const res = await request(testServer())
      .get('/api/me/available-slots')
      .set('Authorization', `Bearer ${memberToken}`)

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(10)

    // Vérification du tri ASC
    const data: Array<{ startTime: string }> = res.body.data
    for (let i = 1; i < data.length; i++) {
      expect(new Date(data[i].startTime).getTime()).toBeGreaterThanOrEqual(
        new Date(data[i - 1].startTime).getTime()
      )
    }
  })

  it('AC4 — exclut slots annulés et events non publiés', async () => {
    // (a) event publié rattaché avec 1 slot futur ANNULÉ
    const eventPublié = await createTestEvent('Evt publié avec slot annulé')
    await attachUser(eventPublié, memberUserId)
    const slotAnnulé = await createSlot(eventPublié, FUTURE(), 5)
    await cancelSlot(slotAnnulé)

    // (b) event BROUILLON rattaché avec 1 slot futur libre
    const eventBrouillon = await createTestEvent('Evt brouillon', { published: false })
    await attachUser(eventBrouillon, memberUserId)
    await createSlot(eventBrouillon, FUTURE(), 5)

    const res = await request(testServer())
      .get('/api/me/available-slots')
      .set('Authorization', `Bearer ${memberToken}`)

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(0)
  })

  it('AC4 — exclut slots passés (start_time < now)', async () => {
    const event = await createTestEvent('Evt passé')
    await attachUser(event, memberUserId)
    await createSlot(event, PAST(), 5)

    const res = await request(testServer())
      .get('/api/me/available-slots')
      .set('Authorization', `Bearer ${memberToken}`)

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(0)
  })

  it('AC6 — isolation user_id', async () => {
    // Event rattaché au member MAIS PAS à otherMember
    const event = await createTestEvent('Evt isolation')
    await attachUser(event, memberUserId)
    await createSlot(event, FUTURE(), 5)

    const resMember = await request(testServer())
      .get('/api/me/available-slots')
      .set('Authorization', `Bearer ${memberToken}`)

    const resOther = await request(testServer())
      .get('/api/me/available-slots')
      .set('Authorization', `Bearer ${otherMemberToken}`)

    expect(resMember.status).toBe(200)
    expect(resMember.body.data).toHaveLength(1)

    expect(resOther.status).toBe(200)
    expect(resOther.body.data).toHaveLength(0)
  })

  it('AC4 — availableSpots = capacity - booked_count', async () => {
    const event = await createTestEvent('Evt available spots')
    await attachUser(event, memberUserId)
    // Slot capacity 5, le membre courant ne réserve PAS
    const slot = await createSlot(event, FUTURE(), 5)

    // 3 autres users distincts réservent ce slot
    const user1 = await createTestUser('Booker1')
    const user2 = await createTestUser('Booker2')
    const user3 = await createTestUser('Booker3')
    await createBooking(slot, user1.id)
    await createBooking(slot, user2.id)
    await createBooking(slot, user3.id)

    const res = await request(testServer())
      .get('/api/me/available-slots')
      .set('Authorization', `Bearer ${memberToken}`)

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
    // availableSpots = capacity - bookings, exposé comme number (cast ::int côté SQL).
    expect(res.body.data[0].availableSpots).toBe(2) // 5 - 3
    expect(typeof res.body.data[0].availableSpots).toBe('number')
  })
})
