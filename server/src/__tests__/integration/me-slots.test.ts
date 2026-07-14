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
 * Tests d'intégration de `GET /api/me/slots` (Story 1.8).
 *
 * Pattern A (transaction rollback) : les users sont créés en beforeAll via
 * `query()` et persistent pour le fichier ; les events/slots/bookings sont
 * créés DANS la transaction (via les helpers `query()`) et rollbackés en
 * afterEach. Le serveur partagé (testServer) tourne dans le process Jest, donc
 * la requête HTTP voit l'état de la transaction courante (même client central).
 *
 * Helpers copiés/collés depuis me-events.test.ts (anti-pattern #3 : ne pas
 * extraire en shared helper — story scope limitée). `createSlot` étendu d'un
 * paramètre `durationMinutes` (défaut 60) pour le test « 1h30 » (AC2).
 */
describe('GET /api/me/slots', () => {
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
      [`test-me-slots-${label}-${uniqueSuffix}@example.com`, label]
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
    await query(`DELETE FROM users WHERE email LIKE 'test-me-slots-%@example.com'`)
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

  /**
   * Crée un créneau actif (cancelled_at NULL) et retourne son UUID.
   * @param durationMinutes - durée en minutes (défaut 60). Étend le helper
   *   me-events.test.ts pour le test « 1h30 » (AC2).
   */
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

  describe('authentification — AC5 (déléguée à requireAuth)', () => {
    it('401 sans header Authorization sur GET /slots', async () => {
      const res = await request(testServer()).get('/api/me/slots')

      expect(res.status).toBe(401)
      expect(res.body).toHaveProperty('error')
    })

    it("401 avec un token invalide sur GET /slots ('Bearer invalid')", async () => {
      const res = await request(testServer())
        .get('/api/me/slots')
        .set('Authorization', 'Bearer invalid')

      expect(res.status).toBe(401)
      expect(res.body).toHaveProperty('error')
    })
  })

  describe('contenu — AC2/AC3/AC6/AC7', () => {
    it('AC2 — shape { upcoming, past, nextCursor, totalRealizedHours } avec 2 futurs + 1 passé', async () => {
      const eventId = await createTestEvent('Event Slots AC2')
      await attachUser(eventId, memberUserId)

      const futureSlot1 = await createSlot(eventId, FUTURE())
      const futureSlot2 = await createSlot(
        eventId,
        new Date(Date.now() + 12 * 86400 * 1000)
      )
      const pastSlot = await createSlot(eventId, PAST())
      await createBooking(futureSlot1, memberUserId)
      await createBooking(futureSlot2, memberUserId)
      await createBooking(pastSlot, memberUserId)

      const res = await request(testServer())
        .get('/api/me/slots')
        .set('Authorization', `Bearer ${memberToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveProperty('upcoming')
      expect(res.body.data).toHaveProperty('past')
      expect(res.body.data).toHaveProperty('nextCursor')
      expect(res.body.data).toHaveProperty('totalRealizedHours')
      expect(Array.isArray(res.body.data.upcoming)).toBe(true)
      expect(Array.isArray(res.body.data.past)).toBe(true)
      expect(res.body.data.upcoming).toHaveLength(2)
      expect(res.body.data.past).toHaveLength(1)
      expect(typeof res.body.data.totalRealizedHours).toBe('number')
      expect(res.body.data.totalRealizedHours).toBe(1) // 1 booking passé × 1h
    })

    it('AC3 — créneau futur EXCLU de totalRealizedHours (futur + passé chacun 1h → total 1)', async () => {
      const eventId = await createTestEvent('Event AC3 Futur')
      await attachUser(eventId, memberUserId)
      const futureSlot = await createSlot(eventId, FUTURE())
      const pastSlot = await createSlot(eventId, PAST())
      await createBooking(futureSlot, memberUserId)
      await createBooking(pastSlot, memberUserId)

      const res = await request(testServer())
        .get('/api/me/slots')
        .set('Authorization', `Bearer ${memberToken}`)

      expect(res.status).toBe(200)
      // Le futur est dans upcoming, pas dans le total.
      expect(res.body.data.upcoming).toHaveLength(1)
      expect(res.body.data.totalRealizedHours).toBe(1) // pas 2
    })

    it('AC3 — créneau en cours (start < now < end) EXCLU du total (end_time > NOW())', async () => {
      const eventId = await createTestEvent('Event AC3 EnCours')
      await attachUser(eventId, memberUserId)
      // Slot en cours : a commencé il y a 30 min, finit dans 30 min.
      const inProgressSlot = await createSlot(
        eventId,
        new Date(Date.now() - 30 * 60 * 1000),
        5,
        60
      )
      await createBooking(inProgressSlot, memberUserId)

      const res = await request(testServer())
        .get('/api/me/slots')
        .set('Authorization', `Bearer ${memberToken}`)

      expect(res.status).toBe(200)
      // start_time < now → le slot est dans past (pas upcoming).
      expect(res.body.data.past).toHaveLength(1)
      // MAIS end_time > now → non compté dans total_realized_hours.
      expect(res.body.data.totalRealizedHours).toBe(0)
    })

    it('AC3 — créneau annulé EXCLU de totalRealizedHours (passé mais annulé)', async () => {
      const eventId = await createTestEvent('Event AC3 Annulé')
      await attachUser(eventId, memberUserId)
      const cancelledPastSlot = await createSlot(eventId, PAST())
      await createBooking(cancelledPastSlot, memberUserId)
      await cancelSlot(cancelledPastSlot)

      const res = await request(testServer())
        .get('/api/me/slots')
        .set('Authorization', `Bearer ${memberToken}`)

      expect(res.status).toBe(200)
      // Clé #2 : le booking sur slot annulé reste visible dans past...
      expect(res.body.data.past).toHaveLength(1)
      expect(res.body.data.past[0].status).toBe('cancelled')
      // ...mais EXCLU du total (l'heure n'a pas été effectuée).
      expect(res.body.data.totalRealizedHours).toBe(0)
    })

    it('AC2/AC3 — membre sans booking : totalRealizedHours = 0, tableaux vides', async () => {
      const eventId = await createTestEvent('Event Vide AC2')
      await attachUser(eventId, memberUserId)
      await createSlot(eventId, FUTURE())

      const res = await request(testServer())
        .get('/api/me/slots')
        .set('Authorization', `Bearer ${memberToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data.upcoming).toEqual([])
      expect(res.body.data.past).toEqual([])
      expect(res.body.data.nextCursor).toBeNull()
      expect(res.body.data.totalRealizedHours).toBe(0)
    })

    it('AC2 — cancelled booking reste visible dans upcoming/past avec status=cancelled', async () => {
      const eventId = await createTestEvent('Event Status AC2')
      await attachUser(eventId, memberUserId)
      const futureCancelledSlot = await createSlot(eventId, FUTURE())
      await createBooking(futureCancelledSlot, memberUserId)
      await cancelSlot(futureCancelledSlot)

      const res = await request(testServer())
        .get('/api/me/slots')
        .set('Authorization', `Bearer ${memberToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data.upcoming).toHaveLength(1)
      expect(res.body.data.upcoming[0].status).toBe('cancelled')
      // Champs camelCase présents (conversion auto via middleware).
      const booking = res.body.data.upcoming[0]
      expect(booking).toHaveProperty('slotUuid')
      expect(booking).toHaveProperty('eventUuid')
      expect(booking).toHaveProperty('eventName')
      expect(booking).toHaveProperty('startTime')
      expect(booking).toHaveProperty('endTime')
      // camelCase strict : pas de snake_case qui aurait échappé à la conversion.
      expect(booking).not.toHaveProperty('slot_uuid')
      expect(booking).not.toHaveProperty('event_name')
    })

    it('AC6 — isolation user_id : chaque membre ne voit que ses bookings', async () => {
      const eventForMember = await createTestEvent('Event Member AC6')
      await attachUser(eventForMember, memberUserId)
      const slot1 = await createSlot(eventForMember, FUTURE())
      await createBooking(slot1, memberUserId)

      const eventForOther = await createTestEvent('Event Other AC6')
      await attachUser(eventForOther, otherMemberUserId)
      const slot2 = await createSlot(eventForOther, FUTURE())
      await createBooking(slot2, otherMemberUserId)

      const resAsMember = await request(testServer())
        .get('/api/me/slots')
        .set('Authorization', `Bearer ${memberToken}`)

      expect(resAsMember.status).toBe(200)
      expect(resAsMember.body.data.upcoming).toHaveLength(1)
      expect(resAsMember.body.data.upcoming[0].slotUuid).toBe(slot1)

      const resAsOther = await request(testServer())
        .get('/api/me/slots')
        .set('Authorization', `Bearer ${otherMemberToken}`)

      expect(resAsOther.status).toBe(200)
      expect(resAsOther.body.data.upcoming).toHaveLength(1)
      expect(resAsOther.body.data.upcoming[0].slotUuid).toBe(slot2)
    })

    it('AC2 — tri upcoming ASC, past DESC', async () => {
      const eventId = await createTestEvent('Event Tri AC2')
      await attachUser(eventId, memberUserId)
      // 3 futurs à dates distinctes.
      const f1 = await createSlot(eventId, new Date(Date.now() + 5 * 86400 * 1000))
      const f2 = await createSlot(eventId, new Date(Date.now() + 3 * 86400 * 1000))
      const f3 = await createSlot(eventId, new Date(Date.now() + 1 * 86400 * 1000))
      await createBooking(f1, memberUserId)
      await createBooking(f2, memberUserId)
      await createBooking(f3, memberUserId)
      // 3 passés à dates distinctes.
      const p1 = await createSlot(eventId, new Date(Date.now() - 5 * 86400 * 1000))
      const p2 = await createSlot(eventId, new Date(Date.now() - 3 * 86400 * 1000))
      const p3 = await createSlot(eventId, new Date(Date.now() - 1 * 86400 * 1000))
      await createBooking(p1, memberUserId)
      await createBooking(p2, memberUserId)
      await createBooking(p3, memberUserId)

      const res = await request(testServer())
        .get('/api/me/slots')
        .set('Authorization', `Bearer ${memberToken}`)

      expect(res.status).toBe(200)
      const upcoming = res.body.data.upcoming
      const past = res.body.data.past
      // upcoming ASC : f3 (+1j) < f2 (+3j) < f1 (+5j) par start_time.
      expect(upcoming.map((b: { slotUuid: string }) => b.slotUuid)).toEqual([
        f3,
        f2,
        f1,
      ])
      // past DESC : start_time décroissant → le plus récent d'abord.
      // p3 (-1j) > p2 (-3j) > p1 (-5j) en valeur de start_time.
      expect(past.map((b: { slotUuid: string }) => b.slotUuid)).toEqual([
        p3,
        p2,
        p1,
      ])
    })

    it('AC7 — curseur invalide → 400', async () => {
      const res = await request(testServer())
        .get('/api/me/slots?cursor=not-a-date')
        .set('Authorization', `Bearer ${memberToken}`)

      expect(res.status).toBe(400)
      expect(res.body.error).toContain('Curseur')
    })

    it('AC7 — curseur absent = page 1 (200)', async () => {
      const res = await request(testServer())
        .get('/api/me/slots')
        .set('Authorization', `Bearer ${memberToken}`)

      expect(res.status).toBe(200)
    })

    it('AC7 — curseur valide pagine : 25 passés → page 1 (20) + nextCursor, page 2 (5)', async () => {
      const eventId = await createTestEvent('Event Pagination AC7')
      await attachUser(eventId, memberUserId)
      // 25 bookings passés à dates distinctes (croissantes pour la prévisibilité).
      for (let i = 0; i < 25; i++) {
        const slot = await createSlot(
          eventId,
          new Date(Date.now() - (i + 1) * 86400 * 1000)
        )
        await createBooking(slot, memberUserId)
      }

      // Page 1 : LIMIT 20.
      const res1 = await request(testServer())
        .get('/api/me/slots')
        .set('Authorization', `Bearer ${memberToken}`)

      expect(res1.status).toBe(200)
      expect(res1.body.data.past).toHaveLength(20)
      expect(res1.body.data.nextCursor).not.toBeNull()

      // Page 2 : les 5 plus anciens.
      const res2 = await request(testServer())
        .get(`/api/me/slots?cursor=${encodeURIComponent(res1.body.data.nextCursor)}`)
        .set('Authorization', `Bearer ${memberToken}`)

      expect(res2.status).toBe(200)
      expect(res2.body.data.past).toHaveLength(5)
      // Page finale atteinte → nextCursor null.
      expect(res2.body.data.nextCursor).toBeNull()
    })

    it('AC2 — nextCursor null quand fin atteinte (< LIMIT)', async () => {
      const eventId = await createTestEvent('Event Fin AC2')
      await attachUser(eventId, memberUserId)
      // 5 bookings passés (< LIMIT 20) → page 1 = fin d'historique.
      for (let i = 0; i < 5; i++) {
        const slot = await createSlot(
          eventId,
          new Date(Date.now() - (i + 1) * 86400 * 1000)
        )
        await createBooking(slot, memberUserId)
      }

      const res = await request(testServer())
        .get('/api/me/slots')
        .set('Authorization', `Bearer ${memberToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data.past).toHaveLength(5)
      expect(res.body.data.nextCursor).toBeNull() // rowCount < LIMIT
    })

    it('AC2 — totalRealizedHours numérique 1 décimale (1h30 → 1.5)', async () => {
      const eventId = await createTestEvent('Event Decimale AC2')
      await attachUser(eventId, memberUserId)
      // Slot passé de 90 minutes (1h30).
      const slot = await createSlot(eventId, PAST(), 5, 90)
      await createBooking(slot, memberUserId)

      const res = await request(testServer())
        .get('/api/me/slots')
        .set('Authorization', `Bearer ${memberToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data.totalRealizedHours).toBe(1.5)
    })

    it('is_published — booking sur event dépublié EXCLU de upcoming/past et de totalRealizedHours', async () => {
      const eventId = await createTestEvent('Event Non Publié', { published: false })
      await attachUser(eventId, memberUserId)
      const futureSlot = await createSlot(eventId, FUTURE())
      const pastSlot = await createSlot(eventId, PAST())
      await createBooking(futureSlot, memberUserId)
      await createBooking(pastSlot, memberUserId)

      const res = await request(testServer())
        .get('/api/me/slots')
        .set('Authorization', `Bearer ${memberToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data.upcoming).toEqual([])
      expect(res.body.data.past).toEqual([])
      expect(res.body.data.totalRealizedHours).toBe(0)
    })

    it("AC7 — curseur valide au-delà de l'historique → past vide", async () => {
      const eventId = await createTestEvent('Event AC7 Beyond')
      await attachUser(eventId, memberUserId)
      for (let i = 0; i < 3; i++) {
        const slot = await createSlot(eventId, new Date(Date.now() - (i + 1) * 86400 * 1000))
        await createBooking(slot, memberUserId)
      }

      // Curseur composite valide pointant sur l'an 2000 (avant tout booking de test)
      const cursor = '2000-01-01T00:00:00.000Z|00000000-0000-0000-0000-000000000000'
      const res = await request(testServer())
        .get(`/api/me/slots?cursor=${encodeURIComponent(cursor)}`)
        .set('Authorization', `Bearer ${memberToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data.past).toEqual([])
      expect(res.body.data.nextCursor).toBeNull()
    })

    it('AC7 — curseur composite : ties start_time non perdus', async () => {
      const eventId = await createTestEvent('Event Ties AC7')
      await attachUser(eventId, memberUserId)

      // 19 slots plus récents (positions 1-19 en tri DESC, dates toutes distinctes)
      for (let i = 0; i < 19; i++) {
        const slot = await createSlot(eventId, new Date(Date.now() - (i + 1) * 86400 * 1000))
        await createBooking(slot, memberUserId)
      }

      // 2 slots avec EXACTEMENT le même start_time (frontière de page : positions 20-21)
      const tiedStart = new Date(Date.now() - 50 * 86400 * 1000)
      const slotTie1 = await createSlot(eventId, tiedStart)
      await createBooking(slotTie1, memberUserId)
      const slotTie2 = await createSlot(eventId, tiedStart)
      await createBooking(slotTie2, memberUserId)

      // Page 1 : LIMIT 20 → nextCursor non null
      const res1 = await request(testServer())
        .get('/api/me/slots')
        .set('Authorization', `Bearer ${memberToken}`)

      expect(res1.status).toBe(200)
      expect(res1.body.data.past).toHaveLength(20)
      expect(res1.body.data.nextCursor).not.toBeNull()

      // Page 2 : le 21ème slot ne doit pas être perdu (ORDER BY s.id DESC brise le tie)
      const res2 = await request(testServer())
        .get(`/api/me/slots?cursor=${encodeURIComponent(res1.body.data.nextCursor)}`)
        .set('Authorization', `Bearer ${memberToken}`)

      expect(res2.status).toBe(200)
      expect(res2.body.data.past).toHaveLength(1)
      expect(res2.body.data.nextCursor).toBeNull()
    })
  })
})
