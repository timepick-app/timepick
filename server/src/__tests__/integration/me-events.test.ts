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
 * Tests d'intégration de `GET /api/me/events` (Story 1.2).
 *
 * Pattern A (transaction rollback) : les users sont créés en beforeAll via
 * `query()` et persistent pour le fichier ; les events/slots/bookings sont
 * créés DANS la transaction (via les helpers `query()`) et rollbackés en
 * afterEach. Le serveur partagé (testServer) tourne dans le process Jest, donc
 * la requête HTTP voit l'état de la transaction courante (même client central).
 */
describe('GET /api/me/events', () => {
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
      [`test-me-${label}-${uniqueSuffix}@example.com`, label]
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

  // Les users sont créés en beforeAll HORS transaction (committés) : nettoyage explicite
  // pour éviter l'accumulation de rows orphelines `test-me-%@example.com` à chaque run.
  afterAll(async () => {
    await query(`DELETE FROM users WHERE email LIKE 'test-me-%@example.com'`)
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
    capacity = 5
  ): Promise<string> {
    const end = new Date(start.getTime() + 60 * 60 * 1000) // +1h
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

  describe('authentification — AC2 (déléguée à requireAuth)', () => {
    it('401 sans header Authorization', async () => {
      const res = await request(testServer()).get('/api/me/events')

      expect(res.status).toBe(401)
      expect(res.body).toHaveProperty('error')
    })

    it("401 avec un token invalide ('Bearer invalid')", async () => {
      const res = await request(testServer())
        .get('/api/me/events')
        .set('Authorization', 'Bearer invalid')

      expect(res.status).toBe(401)
      expect(res.body).toHaveProperty('error')
    })

    it('401 avec un token expiré', async () => {
      const expiredToken = jwt.sign({ userId: memberUserId, role: 'user' }, JWT_SECRET, {
        expiresIn: '-1h',
      })
      const res = await request(testServer())
        .get('/api/me/events')
        .set('Authorization', `Bearer ${expiredToken}`)

      expect(res.status).toBe(401)
      expect(res.body).toHaveProperty('error')
    })
  })

  describe('contenu', () => {
    it('AC3 — membre rattaché à 0 événement → 200 + tableau vide', async () => {
      const res = await request(testServer())
        .get('/api/me/events')
        .set('Authorization', `Bearer ${memberToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data).toEqual([])
    })

    it('AC1 — membre rattaché à 2 events (futur + passé) : champs camelCase, isUpcoming/myBookingCount corrects', async () => {
      const futureEventId = await createTestEvent('Event Futur AC1')
      await attachUser(futureEventId, memberUserId)
      const futureSlotId = await createSlot(futureEventId, FUTURE())
      await createBooking(futureSlotId, memberUserId)

      const pastEventId = await createTestEvent('Event Passé AC1')
      await attachUser(pastEventId, memberUserId)
      await createSlot(pastEventId, PAST())

      const res = await request(testServer())
        .get('/api/me/events')
        .set('Authorization', `Bearer ${memberToken}`)

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body.data)).toBe(true)
      expect(res.body.data).toHaveLength(2)

      // P3 — ORDER BY period_start DESC NULLS LAST : le futur (période plus récente) précède le passé.
      expect(res.body.data[0].uuid).toBe(futureEventId)
      expect(res.body.data[1].uuid).toBe(pastEventId)

      const future = res.body.data.find(
        (e: { uuid: string }) => e.uuid === futureEventId
      )
      const past = res.body.data.find(
        (e: { uuid: string }) => e.uuid === pastEventId
      )

      // Chaque élément expose les 6 champs camelCase (AC1 + note casse).
      for (const item of [future, past]) {
        expect(item).toHaveProperty('uuid')
        expect(item).toHaveProperty('name')
        expect(item).toHaveProperty('startDate')
        expect(item).toHaveProperty('endDate')
        expect(item).toHaveProperty('myBookingCount')
        expect(item).toHaveProperty('isUpcoming')
        // camelCase strict : pas de snake_case qui aurait échappé à la conversion.
        expect(item).not.toHaveProperty('start_date')
        expect(item).not.toHaveProperty('my_booking_count')
        expect(item).not.toHaveProperty('is_upcoming')
      }

      expect(future.isUpcoming).toBe(true)
      expect(future.myBookingCount).toBe(1)

      expect(past.isUpcoming).toBe(false)
      expect(past.myBookingCount).toBe(0)

      // P4 — Format ISO string : verrouille la conversion .toISOString() du service.
      expect(typeof future.startDate).toBe('string')
      expect(Number.isNaN(new Date(future.startDate).getTime())).toBe(false)
    })

    it('AC4 — isolation structurelle : les events des autres membres n’apparaissent jamais', async () => {
      const ownEventId = await createTestEvent('Event Member AC4')
      await attachUser(ownEventId, memberUserId)
      await createSlot(ownEventId, FUTURE())

      const otherEventId = await createTestEvent('Event Other AC4')
      await attachUser(otherEventId, otherMemberUserId)
      await createSlot(otherEventId, FUTURE())

      // member ne voit QUE son event ; l'event d'otherMember est absent.
      const resAsMember = await request(testServer())
        .get('/api/me/events')
        .set('Authorization', `Bearer ${memberToken}`)

      expect(resAsMember.status).toBe(200)
      const memberUuids = resAsMember.body.data.map(
        (e: { uuid: string }) => e.uuid
      )
      expect(memberUuids).toContain(ownEventId)
      expect(
        resAsMember.body.data.find(
          (e: { uuid: string }) => e.uuid === otherEventId
        )
      ).toBeUndefined()

      // otherMember ne voit QUE son event ; l'event de member est absent.
      const resAsOther = await request(testServer())
        .get('/api/me/events')
        .set('Authorization', `Bearer ${otherMemberToken}`)

      expect(resAsOther.status).toBe(200)
      const otherUuids = resAsOther.body.data.map(
        (e: { uuid: string }) => e.uuid
      )
      expect(otherUuids).toContain(otherEventId)
      expect(
        resAsOther.body.data.find(
          (e: { uuid: string }) => e.uuid === ownEventId
        )
      ).toBeUndefined()
    })

    it('AC6 + D10 — un événement brouillon (is_published=false) est masqué au membre', async () => {
      const publishedId = await createTestEvent('Event Publié AC6')
      await attachUser(publishedId, memberUserId)
      await createSlot(publishedId, FUTURE())

      const draftId = await createTestEvent('Event Brouillon AC6', {
        published: false,
      })
      // Le membre est BIEN rattaché au brouillon, mais celui-ci doit rester masqué.
      await attachUser(draftId, memberUserId)
      await createSlot(draftId, FUTURE())

      const res = await request(testServer())
        .get('/api/me/events')
        .set('Authorization', `Bearer ${memberToken}`)

      expect(res.status).toBe(200)
      const uuids = res.body.data.map((e: { uuid: string }) => e.uuid)
      expect(uuids).toContain(publishedId)
      expect(
        res.body.data.find((e: { uuid: string }) => e.uuid === draftId)
      ).toBeUndefined()
    })

    it('D4 — les bookings sur créneaux annulés ne gonflent pas myBookingCount', async () => {
      const eventId = await createTestEvent('Event Soft-Delete D4')
      await attachUser(eventId, memberUserId)

      // Créneau actif futur + réservation → compte.
      const activeSlotId = await createSlot(eventId, FUTURE())
      await createBooking(activeSlotId, memberUserId)

      // Créneau futur annulé + réservation → NE compte pas.
      const cancelledSlotId = await createSlot(eventId, FUTURE())
      await createBooking(cancelledSlotId, memberUserId)
      await cancelSlot(cancelledSlotId)

      const res = await request(testServer())
        .get('/api/me/events')
        .set('Authorization', `Bearer ${memberToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(1)
      const event = res.body.data[0]
      expect(event.myBookingCount).toBe(1) // seul le booking sur slot actif compte
      expect(event.isUpcoming).toBe(true) // slot actif futur → à venir
      // La période dérivée ignore le créneau annulé (startDate/endDate = slot actif).
      expect(event.startDate).not.toBeNull()
      expect(event.endDate).not.toBeNull()
    })

    it('D5 — la période (startDate/endDate) exclut les créneaux annulés même à une date distincte', async () => {
      const eventId = await createTestEvent('Event Période D5')
      await attachUser(eventId, memberUserId)
      // Slot actif futur → définit la période.
      await createSlot(eventId, FUTURE())
      // Slot annulé dans le PASSÉ (date distincte) : s'il était inclus dans MIN(start_time),
      // la période basculerait dans le passé. Le filtre cancelled_at IS NULL doit l'exclure.
      const cancelledPastSlotId = await createSlot(eventId, PAST())
      await cancelSlot(cancelledPastSlotId)

      const res = await request(testServer())
        .get('/api/me/events')
        .set('Authorization', `Bearer ${memberToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(1)
      const event = res.body.data[0]
      // La période dérive UNIQUEMENT du slot actif futur (pas du slot annulé passé).
      expect(new Date(event.startDate).getTime()).toBeGreaterThan(Date.now())
      expect(event.isUpcoming).toBe(true)
    })

    it('D3 — un événement avec un créneau passé ET un futur compte comme « à venir » (isUpcoming true)', async () => {
      const eventId = await createTestEvent('Event En Cours D3')
      await attachUser(eventId, memberUserId)
      await createSlot(eventId, PAST()) // créneau passé
      await createSlot(eventId, FUTURE()) // créneau futur → MAX(end_time) > NOW()

      const res = await request(testServer())
        .get('/api/me/events')
        .set('Authorization', `Bearer ${memberToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(1)
      expect(res.body.data[0].isUpcoming).toBe(true)
    })

    it("D3 — un événement sans créneau : startDate/endDate null, isUpcoming false, myBookingCount 0", async () => {
      const eventId = await createTestEvent('Event Sans Slot D3')
      await attachUser(eventId, memberUserId)

      const res = await request(testServer())
        .get('/api/me/events')
        .set('Authorization', `Bearer ${memberToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(1)
      const event = res.body.data[0]
      expect(event.uuid).toBe(eventId)
      expect(event.startDate).toBeNull()
      expect(event.endDate).toBeNull()
      expect(event.isUpcoming).toBe(false)
      expect(event.myBookingCount).toBe(0)
    })

    it('DN1 — un événement publié dont tous les créneaux sont annulés reste affiché (startDate/endDate null, isUpcoming false)', async () => {
      const eventId = await createTestEvent('Event Tous Annulés DN1')
      await attachUser(eventId, memberUserId)
      const slotId = await createSlot(eventId, FUTURE())
      await createBooking(slotId, memberUserId)
      await cancelSlot(slotId) // tous les créneaux annulés

      const res = await request(testServer())
        .get('/api/me/events')
        .set('Authorization', `Bearer ${memberToken}`)

      expect(res.status).toBe(200)
      // Décision DN1 (option 1) : l'event reste visible plutôt que masqué — cohérent avec D3.
      expect(res.body.data).toHaveLength(1)
      const event = res.body.data[0]
      expect(event.uuid).toBe(eventId)
      expect(event.startDate).toBeNull() // période ignore le slot annulé
      expect(event.endDate).toBeNull()
      expect(event.isUpcoming).toBe(false)
      expect(event.myBookingCount).toBe(0) // booking sur slot annulé ne compte pas
    })
  })
})
