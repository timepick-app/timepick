// Mock isomorphic-dompurify to avoid ESM trap when app.ts imports email.service.ts.
jest.mock('isomorphic-dompurify')

import request from 'supertest'
import jwt from 'jsonwebtoken'
import { query } from '../../db'
import { testServer } from '../helpers/test-server'
import { seedShellPart } from '../../services/shell-parts.service'

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret'
const TEST_EVENT_ID = '44444444-4444-4444-4444-444444444444'
const GHOST_EVENT_ID = '88888888-8888-8888-8888-888888888888'

const VALID_HEADER = `<mj-section data-part-kind="header" background-color="#000000"><mj-column><mj-text>Header</mj-text></mj-column></mj-section>`

describe('DELETE /api/admin/shell-parts/:ownerKind/:ownerId/:partKind', () => {
  let adminToken: string
  let userToken: string

  async function createTestUserWithRole(role: 'admin' | 'user'): Promise<string> {
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`
    const userResult = await query<{ id: string }>(
      `INSERT INTO users (email, first_name, role)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [`test-shell-parts-del-${role}-${uniqueSuffix}@example.com`, `Test ${role}`, role],
    )
    return userResult.rows[0].id
  }

  beforeAll(async () => {
    const adminUserId = await createTestUserWithRole('admin')
    adminToken = jwt.sign({ userId: adminUserId, role: 'admin' }, JWT_SECRET, { expiresIn: '1h' })

    const regularUserId = await createTestUserWithRole('user')
    userToken = jwt.sign({ userId: regularUserId, role: 'user' }, JWT_SECRET, { expiresIn: '1h' })

    await query(
      `INSERT INTO events (id, name, description)
       VALUES ($1, $2, 'Shell-parts DELETE test event')
       ON CONFLICT (id) DO NOTHING`,
      [TEST_EVENT_ID, `shell-parts-delete-test-${TEST_EVENT_ID}`],
    )
  })

  afterEach(async () => {
    await query(
      `DELETE FROM shell_parts
       WHERE (owner_kind = 'brand' AND owner_id = '1')
          OR (owner_kind = 'event' AND owner_id = $1)
          OR owner_kind = 'template'`,
      [TEST_EVENT_ID],
    )
  })

  afterAll(async () => {
    await query('DELETE FROM events WHERE id = $1', [TEST_EVENT_ID])
    await query(`DELETE FROM users WHERE email LIKE 'test-shell-parts-del-%'`)
  })

  // ---------------------------------------------------------------------------
  // auth gate
  // ---------------------------------------------------------------------------

  describe('auth', () => {
    it('401 when Authorization header is missing', async () => {
      const res = await request(testServer()).delete('/api/admin/shell-parts/brand/1/header')
      expect(res.status).toBe(401)
    })

    it('403 when the token belongs to a non-admin user', async () => {
      const res = await request(testServer())
        .delete('/api/admin/shell-parts/brand/1/header')
        .set('Authorization', `Bearer ${userToken}`)
      expect(res.status).toBe(403)
    })
  })

  // ---------------------------------------------------------------------------
  // path params validation (mêmes règles que PUT — schema partagé)
  // ---------------------------------------------------------------------------

  describe('path params validation', () => {
    it('400 when ownerKind is not in OWNER_KINDS', async () => {
      const res = await request(testServer())
        .delete('/api/admin/shell-parts/unknown/1/header')
        .set('Authorization', `Bearer ${adminToken}`)
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
    })

    it('400 when ownerKind/ownerId coupling is violated (brand singleton ≠ "1")', async () => {
      const res = await request(testServer())
        .delete('/api/admin/shell-parts/brand/42/footer')
        .set('Authorization', `Bearer ${adminToken}`)
      expect(res.status).toBe(400)
      expect(res.body.error.message).toMatch(/singleton/)
    })

    it('400 when partKind is not in PART_KINDS', async () => {
      const res = await request(testServer())
        .delete('/api/admin/shell-parts/brand/1/sidebar')
        .set('Authorization', `Bearer ${adminToken}`)
      expect(res.status).toBe(400)
      expect(res.body.error.message).toMatch(/partKind must be one of/)
    })

    it('400 when ownerKind=event and ownerId is not a UUID', async () => {
      const res = await request(testServer())
        .delete('/api/admin/shell-parts/event/not-a-uuid/header')
        .set('Authorization', `Bearer ${adminToken}`)
      expect(res.status).toBe(400)
    })
  })

  // ---------------------------------------------------------------------------
  // owner existence (event)
  // ---------------------------------------------------------------------------

  describe('owner existence', () => {
    it('404 when ownerKind=event and the event row is missing', async () => {
      const res = await request(testServer())
        .delete(`/api/admin/shell-parts/event/${GHOST_EVENT_ID}/header`)
        .set('Authorization', `Bearer ${adminToken}`)
      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe('EVENT_NOT_FOUND')
    })
  })

  // ---------------------------------------------------------------------------
  // idempotent 204 — coeur du contrat
  // ---------------------------------------------------------------------------

  describe('idempotent 204', () => {
    it('204 when the row exists (deleted)', async () => {
      await seedShellPart({
        ownerKind: 'brand',
        ownerId: '1',
        partKind: 'header',
        contentMjml: VALID_HEADER,
      })

      const res = await request(testServer())
        .delete('/api/admin/shell-parts/brand/1/header')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(204)
      expect(res.body).toEqual({})

      const { rows } = await query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM shell_parts WHERE owner_kind='brand' AND owner_id='1' AND part_kind='header'`,
      )
      expect(rows[0].count).toBe('0')
    })

    it('204 when no row matches (absent)', async () => {
      const res = await request(testServer())
        .delete('/api/admin/shell-parts/brand/1/header')
        .set('Authorization', `Bearer ${adminToken}`)
      expect(res.status).toBe(204)
    })

    it('204 × 2 in a row stays 204 (idempotent)', async () => {
      await seedShellPart({
        ownerKind: 'brand',
        ownerId: '1',
        partKind: 'footer',
        contentMjml: VALID_HEADER,
      })

      const first = await request(testServer())
        .delete('/api/admin/shell-parts/brand/1/footer')
        .set('Authorization', `Bearer ${adminToken}`)
      const second = await request(testServer())
        .delete('/api/admin/shell-parts/brand/1/footer')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(first.status).toBe(204)
      expect(second.status).toBe(204)
    })

    it('targets only the requested partKind (leaves siblings intact)', async () => {
      await seedShellPart({
        ownerKind: 'event',
        ownerId: TEST_EVENT_ID,
        partKind: 'header',
        contentMjml: 'H',
      })
      await seedShellPart({
        ownerKind: 'event',
        ownerId: TEST_EVENT_ID,
        partKind: 'footer',
        contentMjml: 'F',
      })

      const res = await request(testServer())
        .delete(`/api/admin/shell-parts/event/${TEST_EVENT_ID}/header`)
        .set('Authorization', `Bearer ${adminToken}`)
      expect(res.status).toBe(204)

      const { rows } = await query<{ part_kind: string }>(
        `SELECT part_kind FROM shell_parts WHERE owner_kind='event' AND owner_id=$1 ORDER BY part_kind`,
        [TEST_EVENT_ID],
      )
      expect(rows.map((r) => r.part_kind)).toEqual(['footer'])
    })
  })

  // ---------------------------------------------------------------------------
  // brand symétrie — accepté par le validator path, garde UI-only documentée
  // à la conception de la persistance des shell parts (2026-05-17).
  // ---------------------------------------------------------------------------

  describe('brand symétrie (UI-only gate)', () => {
    it('204 when ownerKind=brand (no asymmetric server rejection)', async () => {
      await seedShellPart({
        ownerKind: 'brand',
        ownerId: '1',
        partKind: 'header',
        contentMjml: VALID_HEADER,
      })

      const res = await request(testServer())
        .delete('/api/admin/shell-parts/brand/1/header')
        .set('Authorization', `Bearer ${adminToken}`)
      expect(res.status).toBe(204)
    })
  })

  // ---------------------------------------------------------------------------
  // event lowercase normalisation — héritée du path schema partagé avec PUT
  // ---------------------------------------------------------------------------

  describe('event UUID normalisation', () => {
    it('lowercases an uppercase event UUID before targeting the row', async () => {
      await seedShellPart({
        ownerKind: 'event',
        ownerId: TEST_EVENT_ID,
        partKind: 'header',
        contentMjml: VALID_HEADER,
      })

      const upper = TEST_EVENT_ID.toUpperCase()
      const res = await request(testServer())
        .delete(`/api/admin/shell-parts/event/${upper}/header`)
        .set('Authorization', `Bearer ${adminToken}`)
      expect(res.status).toBe(204)

      const { rows } = await query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM shell_parts WHERE owner_kind='event' AND owner_id=$1 AND part_kind='header'`,
        [TEST_EVENT_ID],
      )
      expect(rows[0].count).toBe('0')
    })
  })
})
