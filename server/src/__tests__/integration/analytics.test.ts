import request from 'supertest'
import { testServer } from '../helpers/test-server'
import { query } from '../../db'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret'
const token = (userId: string, role = 'admin') =>
  jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: '1h' })

async function seedAdmin(): Promise<string> {
  const r = await query(
    `INSERT INTO users (email, first_name, role) VALUES ($1,$2,'admin') RETURNING id`,
    ['admin@test.com', 'Admin Test'],
  )
  return r.rows[0].id
}

describe('GET /api/admin/analytics/engagement', () => {
  let adminToken: string
  let eventId: string

  beforeEach(async () => {
    await query(`DELETE FROM invitations WHERE event_id IN (SELECT id FROM events WHERE name LIKE 'Analytics Test%')`)
    await query(`DELETE FROM event_users WHERE event_id IN (SELECT id FROM events WHERE name LIKE 'Analytics Test%')`)
    await query(`DELETE FROM bookings WHERE slot_id IN (SELECT id FROM slots WHERE event_id IN (SELECT id FROM events WHERE name LIKE 'Analytics Test%'))`)
    await query(`DELETE FROM slots WHERE event_id IN (SELECT id FROM events WHERE name LIKE 'Analytics Test%')`)
    await query(`DELETE FROM events WHERE name LIKE 'Analytics Test%'`)
    await query(`DELETE FROM users WHERE email LIKE '%@test.com'`)
    adminToken = token(await seedAdmin())
    const ev = await query(`INSERT INTO events (name, description) VALUES ($1,'d') RETURNING id`,
      [`Analytics Test ${Date.now()}-${Math.random().toString(36).slice(2)}`])
    eventId = ev.rows[0].id
  })

  it('agrège invited/sent/clicked/booked', async () => {
    const u1 = (await query(`INSERT INTO users (email, first_name, role) VALUES ('m1@test.com','M1','user') RETURNING id`)).rows[0].id
    const u2 = (await query(`INSERT INTO users (email, first_name, role) VALUES ('m2@test.com','M2','user') RETURNING id`)).rows[0].id
    await query(`INSERT INTO event_users (event_id, user_id) VALUES ($1,$2),($1,$3)`, [eventId, u1, u2])
    await query(`INSERT INTO invitations (event_id, user_id, status, sent_at, clicked_at) VALUES ($1,$2,'clicked', NOW(), NOW())`, [eventId, u1])
    await query(`INSERT INTO invitations (event_id, user_id, status, sent_at) VALUES ($1,$2,'sent', NOW() - INTERVAL '5 days')`, [eventId, u2])
    // Invitation en échec : ne doit jamais compter comme "envoyée" (garde-fou de régression).
    const u3 = (await query(`INSERT INTO users (email, first_name, role) VALUES ('m3@test.com','M3','user') RETURNING id`)).rows[0].id
    await query(`INSERT INTO invitations (event_id, user_id, status, sent_at) VALUES ($1,$2,'failed', NOW())`, [eventId, u3])
    const slot = (await query(`INSERT INTO slots (event_id, start_time, end_time, capacity) VALUES ($1, NOW()+INTERVAL '1 day', NOW()+INTERVAL '1 day 1 hour', 5) RETURNING id`, [eventId])).rows[0].id
    await query(`INSERT INTO bookings (slot_id, user_id) VALUES ($1,$2)`, [slot, u1])

    const res = await request(testServer())
      .get(`/api/admin/analytics/engagement?event_id=${eventId}`)
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    // sent reste 2 (l'invitation 'failed' est exclue) ; invited reste 2 (u3 hors event_users).
    expect(res.body.data).toMatchObject({
      invited: 2, sent: 2, clicked: 1, booked: 1, unansweredOver3Days: 1,
    })
  })

  it('clicked reste comptabilisé après un re-envoi (clic monotone)', async () => {
    // Invitation déjà cliquée (clicked_at IS NOT NULL) avec status='sent'
    const u = (await query(`INSERT INTO users (email, first_name, role) VALUES ('mono@test.com','Mono','user') RETURNING id`)).rows[0].id
    await query(`INSERT INTO event_users (event_id, user_id) VALUES ($1,$2)`, [eventId, u])
    await query(
      `INSERT INTO invitations (event_id, user_id, status, sent_at, clicked_at)
       VALUES ($1,$2,'sent', NOW() - INTERVAL '1 hour', NOW() - INTERVAL '30 minutes')`,
      [eventId, u]
    )

    // Simuler un re-envoi : remet sent_at=NOW() et status='sent', mais NE touche PAS clicked_at
    await query(
      `UPDATE invitations SET sent_at = NOW(), status = 'sent'
       WHERE event_id = $1 AND user_id = $2`,
      [eventId, u]
    )

    const res = await request(testServer())
      .get(`/api/admin/analytics/engagement?event_id=${eventId}`)
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    // clicked_at IS NOT NULL reste vrai → clic toujours comptabilisé
    expect(res.body.data.clicked).toBeGreaterThanOrEqual(1)
  })

  it('invariant clicked ⊆ sent : status=\'failed\' + clic compté dans sent ET clicked (régression ratio > 100 %)', async () => {
    // Cas de régression : une invitation en échec d'envoi (status='failed') MAIS cliquée
    // (faux-négatif SMTP — le lien est quand même arrivé). Le clic ne doit pas faire
    // déborder clicked au-dessus de sent : l'invariant clicked ⊆ sent est préservé.
    const u = (await query(`INSERT INTO users (email, first_name, role) VALUES ('invfail@test.com','InvFail','user') RETURNING id`)).rows[0].id
    await query(`INSERT INTO event_users (event_id, user_id) VALUES ($1,$2)`, [eventId, u])
    await query(
      `INSERT INTO invitations (event_id, user_id, status, sent_at, clicked_at)
       VALUES ($1,$2,'failed', NOW() - INTERVAL '1 hour', NOW() - INTERVAL '30 minutes')`,
      [eventId, u]
    )

    const res = await request(testServer())
      .get(`/api/admin/analytics/engagement?event_id=${eventId}`)
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    // Le clic est comptabilisé…
    expect(res.body.data.clicked).toBeGreaterThanOrEqual(1)
    // …et l'invariant clicked ⊆ sent tient : le clic étend le périmètre sent → ratio ≤ 100 %
    expect(res.body.data.sent).toBeGreaterThanOrEqual(res.body.data.clicked)
  })

  it('status=\'sent\' + clic → compté dans sent ET clicked (invariant symétrique)', async () => {
    // Cas nominal : invitation envoyée puis cliquée. sent et clicked progressent ensemble.
    const u = (await query(`INSERT INTO users (email, first_name, role) VALUES ('invsent@test.com','InvSent','user') RETURNING id`)).rows[0].id
    await query(`INSERT INTO event_users (event_id, user_id) VALUES ($1,$2)`, [eventId, u])
    await query(
      `INSERT INTO invitations (event_id, user_id, status, sent_at, clicked_at)
       VALUES ($1,$2,'sent', NOW() - INTERVAL '1 hour', NOW() - INTERVAL '30 minutes')`,
      [eventId, u]
    )

    const res = await request(testServer())
      .get(`/api/admin/analytics/engagement?event_id=${eventId}`)
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.body.data.clicked).toBeGreaterThanOrEqual(1)
    expect(res.body.data.sent).toBeGreaterThanOrEqual(res.body.data.clicked)
  })

  it('unanswered respecte le scope : un désélectionné (hors event_users) est exclu', async () => {
    // uSel : sent >3j, DANS event_users → compte (1)
    const uSel = (await query(`INSERT INTO users (email, first_name, role) VALUES ('scope1@test.com','Scope1','user') RETURNING id`)).rows[0].id
    await query('INSERT INTO event_users (event_id, user_id) VALUES ($1,$2)', [eventId, uSel])
    await query(`INSERT INTO invitations (event_id, user_id, status, sent_at) VALUES ($1,$2,'sent', NOW() - INTERVAL '5 days')`, [eventId, uSel])
    // uDrop : sent >3j, MAIS hors event_users → exclu du scope (== cible relance)
    const uDrop = (await query(`INSERT INTO users (email, first_name, role) VALUES ('scope2@test.com','Scope2','user') RETURNING id`)).rows[0].id
    await query(`INSERT INTO invitations (event_id, user_id, status, sent_at) VALUES ($1,$2,'sent', NOW() - INTERVAL '5 days')`, [eventId, uDrop])

    const res = await request(testServer())
      .get(`/api/admin/analytics/engagement?event_id=${eventId}`)
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    // Seul uSel (encore sélectionné) compte ; uDrop (désélectionné) est exclu.
    expect(res.body.data.unansweredOver3Days).toBe(1)
  })

  it('retourne 401 sans authentification', async () => {
    const res = await request(testServer()).get('/api/admin/analytics/engagement')
    expect(res.status).toBe(401)
  })

  it('retourne 403 pour un utilisateur non admin', async () => {
    const u = (await query(`INSERT INTO users (email, first_name, role) VALUES ('user@test.com','U','user') RETURNING id`)).rows[0].id
    const res = await request(testServer())
      .get('/api/admin/analytics/engagement')
      .set('Authorization', `Bearer ${token(u, 'user')}`)
    expect(res.status).toBe(403)
  })
})

describe('GET /api/admin/analytics/event-activity', () => {
  let adminToken: string
  let eventId: string

  beforeEach(async () => {
    await query(`DELETE FROM invitations WHERE event_id IN (SELECT id FROM events WHERE name LIKE 'Analytics Test%')`)
    await query(`DELETE FROM bookings WHERE slot_id IN (SELECT id FROM slots WHERE event_id IN (SELECT id FROM events WHERE name LIKE 'Analytics Test%'))`)
    await query(`DELETE FROM slots WHERE event_id IN (SELECT id FROM events WHERE name LIKE 'Analytics Test%')`)
    await query(`DELETE FROM events WHERE name LIKE 'Analytics Test%'`)
    await query(`DELETE FROM users WHERE email LIKE '%@test.com'`)
    adminToken = token(await seedAdmin())
    const ev = await query(`INSERT INTO events (name, description) VALUES ($1,'d') RETURNING id`,
      [`Analytics Test ${Date.now()}-${Math.random().toString(36).slice(2)}`])
    eventId = ev.rows[0].id
  })

  it("liste lastSentAt/lastBookingAt (camelCase) pour l'événement ayant activité", async () => {
    const u = (await query(`INSERT INTO users (email, first_name, role) VALUES ('m1@test.com','M1','user') RETURNING id`)).rows[0].id
    await query(`INSERT INTO invitations (event_id, user_id, status, sent_at) VALUES ($1,$2,'sent', NOW())`, [eventId, u])
    const slot = (await query(`INSERT INTO slots (event_id, start_time, end_time, capacity) VALUES ($1, NOW()+INTERVAL '1 day', NOW()+INTERVAL '1 day 1 hour', 5) RETURNING id`, [eventId])).rows[0].id
    await query(`INSERT INTO bookings (slot_id, user_id) VALUES ($1,$2)`, [slot, u])

    const res = await request(testServer())
      .get('/api/admin/analytics/event-activity')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
    // Agrégat global : on cherche l'événement du test, jamais d'assertion sur la longueur.
    const entry = res.body.data.find((a: { eventId: string }) => a.eventId === eventId)
    expect(entry).toBeDefined()
    expect(typeof entry.lastSentAt).toBe('string')
    expect(typeof entry.lastBookingAt).toBe('string')
  })

  it('inclut un événement avec réservation mais sans envoi (lastSentAt null)', async () => {
    const u = (await query(`INSERT INTO users (email, first_name, role) VALUES ('m2@test.com','M2','user') RETURNING id`)).rows[0].id
    const slot = (await query(`INSERT INTO slots (event_id, start_time, end_time, capacity) VALUES ($1, NOW()+INTERVAL '1 day', NOW()+INTERVAL '1 day 1 hour', 5) RETURNING id`, [eventId])).rows[0].id
    await query(`INSERT INTO bookings (slot_id, user_id) VALUES ($1,$2)`, [slot, u])

    const res = await request(testServer())
      .get('/api/admin/analytics/event-activity')
      .set('Authorization', `Bearer ${adminToken}`)

    const entry = res.body.data.find((a: { eventId: string }) => a.eventId === eventId)
    expect(entry).toMatchObject({ eventId, lastSentAt: null })
    expect(typeof entry.lastBookingAt).toBe('string')
  })

  it('compte unansweredOver3Days : sent non cliqué >3j inclus ; récent et cliqué exclus', async () => {
    const u1 = (await query(`INSERT INTO users (email, first_name, role) VALUES ('m1@test.com','M1','user') RETURNING id`)).rows[0].id
    const u2 = (await query(`INSERT INTO users (email, first_name, role) VALUES ('m2@test.com','M2','user') RETURNING id`)).rows[0].id
    const u3 = (await query(`INSERT INTO users (email, first_name, role) VALUES ('m3@test.com','M3','user') RETURNING id`)).rows[0].id
    // Tous sélectionnés (event_users) — requis par le scope partagé (JOIN event_users)
    await query('INSERT INTO event_users (event_id, user_id) VALUES ($1,$2),($1,$3),($1,$4)', [eventId, u1, u2, u3])
    // u1 : sent >3j, non cliqué → compte (1)
    await query(`INSERT INTO invitations (event_id, user_id, status, sent_at) VALUES ($1,$2,'sent', NOW() - INTERVAL '5 days')`, [eventId, u1])
    // u2 : sent récent <3j, non cliqué → exclu
    await query(`INSERT INTO invitations (event_id, user_id, status, sent_at) VALUES ($1,$2,'sent', NOW() - INTERVAL '1 day')`, [eventId, u2])
    // u3 : sent >3j, MAIS cliqué → exclu
    await query(`INSERT INTO invitations (event_id, user_id, status, sent_at, clicked_at) VALUES ($1,$2,'sent', NOW() - INTERVAL '5 days', NOW() - INTERVAL '4 days')`, [eventId, u3])

    const res = await request(testServer())
      .get('/api/admin/analytics/event-activity')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    const entry = res.body.data.find((a: { eventId: string }) => a.eventId === eventId)
    expect(entry).toBeDefined()
    expect(entry.unansweredOver3Days).toBe(1)
  })

  it('unansweredOver3Days = 0 pour un événement sans non-répondant >3j', async () => {
    const u = (await query(`INSERT INTO users (email, first_name, role) VALUES ('m4@test.com','M4','user') RETURNING id`)).rows[0].id
    // invitation récente non cliquée (<3j) → ne compte pas
    await query(`INSERT INTO invitations (event_id, user_id, status, sent_at) VALUES ($1,$2,'sent', NOW())`, [eventId, u])

    const res = await request(testServer())
      .get('/api/admin/analytics/event-activity')
      .set('Authorization', `Bearer ${adminToken}`)

    const entry = res.body.data.find((a: { eventId: string }) => a.eventId === eventId)
    expect(entry).toBeDefined()
    expect(entry.unansweredOver3Days).toBe(0)
  })

  it('événement terminé : unansweredOver3Days = 0 même avec une invitation >3j non répondue', async () => {
    const u = (await query(`INSERT INTO users (email, first_name, role) VALUES ('end1@test.com','End1','user') RETURNING id`)).rows[0].id
    await query('INSERT INTO event_users (event_id, user_id) VALUES ($1,$2)', [eventId, u])
    // Créneau passé → trigger refresh_event_end met events."end" au passé → terminé
    await query(`INSERT INTO slots (event_id, start_time, end_time, capacity) VALUES ($1, NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day', 5)`, [eventId])
    await query(`INSERT INTO invitations (event_id, user_id, status, sent_at) VALUES ($1,$2,'sent', NOW() - INTERVAL '5 days')`, [eventId, u])

    const res = await request(testServer())
      .get('/api/admin/analytics/event-activity')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    const entry = res.body.data.find((a: { eventId: string }) => a.eventId === eventId)
    expect(entry).toBeDefined()
    expect(entry.unansweredOver3Days).toBe(0)
  })

  it('destinataire désélectionné : invitation résiduelle >3j non comptée', async () => {
    // Invitation sent >3j MAIS l'utilisateur n'est PAS dans event_users (désélection)
    const u = (await query(`INSERT INTO users (email, first_name, role) VALUES ('sel1@test.com','Sel1','user') RETURNING id`)).rows[0].id
    await query(`INSERT INTO invitations (event_id, user_id, status, sent_at) VALUES ($1,$2,'sent', NOW() - INTERVAL '5 days')`, [eventId, u])

    const res = await request(testServer())
      .get('/api/admin/analytics/event-activity')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    const entry = res.body.data.find((a: { eventId: string }) => a.eventId === eventId)
    if (entry) expect(entry.unansweredOver3Days).toBe(0)
  })

  it('retourne 401 sans authentification', async () => {
    const res = await request(testServer()).get('/api/admin/analytics/event-activity')
    expect(res.status).toBe(401)
  })

  it('retourne 403 pour un utilisateur non admin', async () => {
    const u = (await query(`INSERT INTO users (email, first_name, role) VALUES ('user@test.com','U','user') RETURNING id`)).rows[0].id
    const res = await request(testServer())
      .get('/api/admin/analytics/event-activity')
      .set('Authorization', `Bearer ${token(u, 'user')}`)
    expect(res.status).toBe(403)
  })
})
