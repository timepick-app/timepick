// Mock isomorphic-dompurify to avoid ESM trap when app.ts imports email.service.ts.
jest.mock('isomorphic-dompurify')

import request from 'supertest'
import jwt from 'jsonwebtoken'
import { query } from '../../db'
import { testServer } from '../helpers/test-server'
import { seedShellPart } from '../../services/shell-parts.service'
import * as brandDb from '../../db/email-brand-settings.db'
import { invalidateEmailBrandCache } from '../../lib/email-brand-cache'
import { adminActionLimiter } from '../../middleware/adminActionLimiter'

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret'
const TEST_EVENT_ID = '22222222-2222-2222-2222-222222222222'

describe('GET /api/admin/editor-context', () => {
  let adminToken: string

  async function createTestAdmin(): Promise<string> {
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`
    const userResult = await query<{ id: string }>(
      `INSERT INTO users (email, first_name, role)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [`test-editor-context-admin-${uniqueSuffix}@example.com`, 'Test Admin', 'admin'],
    )
    return userResult.rows[0].id
  }

  beforeAll(async () => {
    const adminUserId = await createTestAdmin()
    adminToken = jwt.sign({ userId: adminUserId, role: 'admin' }, JWT_SECRET, { expiresIn: '1h' })

    await query(
      `INSERT INTO events (id, name, description)
       VALUES ($1, $2, 'Editor context test event')
       ON CONFLICT (id) DO NOTHING`,
      [TEST_EVENT_ID, `editor-context-test-${TEST_EVENT_ID}`],
    )
  })

  // Migration 018 sème la coque commune carte (template[invitation] header /
  // content-wrapper / mj-body) dans la DB de test au boot. Ces tests asservissent
  // la cascade à un état explicite ; on repart d'une table vide à chaque test
  // pour que les cas « no row exists » (fallback hardcoded) soient déterministes.
  beforeEach(async () => {
    await query('DELETE FROM shell_parts')
  })

  afterEach(async () => {
    await query('DELETE FROM shell_parts')
    await query(`UPDATE events SET invitation_mjml = NULL WHERE id = $1`, [TEST_EVENT_ID])
    // Reset brand singleton logo_url to NULL so the "hardcoded fallback"
    // tests do not depend on a prior test's mutation. Other brand fields
    // are recreated by the factory seed and stay valid.
    await query(`UPDATE email_brand_settings SET logo_url = NULL WHERE id = 1`)
    // Direct SQL mutations above bypass the brand cache invalidation that
    // runs inside the controllers — wipe the module-scope cache so the
    // next test sees fresh DB state.
    invalidateEmailBrandCache()
  })

  afterAll(async () => {
    await query(`DELETE FROM events WHERE id = $1`, [TEST_EVENT_ID])
    await query(`DELETE FROM users WHERE email LIKE 'test-editor-context-admin-%'`)
  })

  describe('200 — success', () => {
    it('returns hardcoded fallback for ownerKind=brand when no row exists', async () => {
      const res = await request(testServer())
        .get('/api/admin/editor-context')
        .query({ ownerKind: 'brand', ownerId: '1', templateKey: 'invitation' })
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data).toMatchObject({
        header: { origin: 'hardcoded' },
        body: { origin: 'template' },
        footer: { origin: 'hardcoded' },
      })
      expect(res.body.data.header.contentMjml).toContain('mj-section')
    })

    it('returns origin=brand when a brand row is seeded', async () => {
      await seedShellPart({
        ownerKind: 'brand',
        ownerId: '1',
        partKind: 'header',
        contentMjml: '<mj-section><mj-column><mj-text>BRAND HEAD</mj-text></mj-column></mj-section>',
      })

      const res = await request(testServer())
        .get('/api/admin/editor-context')
        .query({ ownerKind: 'brand', ownerId: '1', templateKey: 'invitation' })
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data.header.origin).toBe('brand')
      expect(res.body.data.header.contentMjml).toContain('BRAND HEAD')
    })

    it('returns origin=template when querying ownerKind=template', async () => {
      await seedShellPart({
        ownerKind: 'template',
        ownerId: 'invitation',
        partKind: 'header',
        contentMjml: '<mj-section><mj-column><mj-text>TPL HEAD</mj-text></mj-column></mj-section>',
      })

      const res = await request(testServer())
        .get('/api/admin/editor-context')
        .query({ ownerKind: 'template', ownerId: 'invitation', templateKey: 'invitation' })
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data.header.origin).toBe('template')
      expect(res.body.data.header.contentMjml).toContain('TPL HEAD')
    })

    it('returns event-cascade view for ownerKind=event with full cascade', async () => {
      await seedShellPart({
        ownerKind: 'brand',
        ownerId: '1',
        partKind: 'footer',
        contentMjml: '<mj-section><mj-column><mj-text>BRAND FOOTER</mj-text></mj-column></mj-section>',
      })
      await seedShellPart({
        ownerKind: 'event',
        ownerId: TEST_EVENT_ID,
        partKind: 'header',
        contentMjml: '<mj-section><mj-column><mj-text>EVENT HEADER</mj-text></mj-column></mj-section>',
      })

      const res = await request(testServer())
        .get('/api/admin/editor-context')
        .query({ ownerKind: 'event', ownerId: TEST_EVENT_ID, templateKey: 'invitation' })
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data.header).toMatchObject({ origin: 'event' })
      expect(res.body.data.header.contentMjml).toContain('EVENT HEADER')
      expect(res.body.data.footer).toMatchObject({ origin: 'brand' })
      expect(res.body.data.body.origin).toBe('template') // body cascade is gel — events.invitation_mjml is NULL
    })
  })

  describe('400 — validation errors', () => {
    it('400 when ownerKind is missing', async () => {
      const res = await request(testServer())
        .get('/api/admin/editor-context')
        .query({ ownerId: '1', templateKey: 'invitation' })
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
    })

    it('400 when ownerKind is invalid', async () => {
      const res = await request(testServer())
        .get('/api/admin/editor-context')
        .query({ ownerKind: 'unknown', ownerId: '1', templateKey: 'invitation' })
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
    })

    it('400 when templateKey is not in the enum', async () => {
      const res = await request(testServer())
        .get('/api/admin/editor-context')
        .query({ ownerKind: 'brand', ownerId: '1', templateKey: 'newsletter' })
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
    })

    it('400 when ownerKind=event and ownerId is not a UUID', async () => {
      const res = await request(testServer())
        .get('/api/admin/editor-context')
        .query({ ownerKind: 'event', ownerId: 'not-a-uuid', templateKey: 'invitation' })
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(400)
      expect(res.body.error.message).toMatch(/UUID/i)
    })

    it('400 when ownerKind=brand and ownerId is not "1"', async () => {
      const res = await request(testServer())
        .get('/api/admin/editor-context')
        .query({ ownerKind: 'brand', ownerId: '42', templateKey: 'invitation' })
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(400)
      expect(res.body.error.message).toMatch(/singleton/i)
    })
  })

  describe('404 — not found', () => {
    it('404 when ownerKind=event and eventId does not exist', async () => {
      const res = await request(testServer())
        .get('/api/admin/editor-context')
        .query({
          ownerKind: 'event',
          ownerId: '99999999-9999-9999-9999-999999999999',
          templateKey: 'invitation',
        })
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe('EVENT_NOT_FOUND')
    })
  })

  describe('auth', () => {
    it('401 when Authorization header is missing', async () => {
      const res = await request(testServer())
        .get('/api/admin/editor-context')
        .query({ ownerKind: 'brand', ownerId: '1', templateKey: 'invitation' })

      expect(res.status).toBe(401)
    })
  })

  // ===================================================
  // Z4 — Cache email_brand_settings + invalidation
  // ===================================================
  describe('cache — brand singleton (Z4)', () => {
    let getBrandSpy: jest.SpyInstance
    let adminUserId: string

    beforeEach(async () => {
      // Re-derive the admin id from the JWT so we can reset the rate limit key
      // for the POST /reset test.
      adminUserId = (jwt.decode(adminToken) as { userId: string }).userId
      adminActionLimiter.resetKey(`admin:${adminUserId}`)
      invalidateEmailBrandCache()
      getBrandSpy = jest.spyOn(brandDb, 'getEmailBrandSettings')
    })

    afterEach(() => {
      getBrandSpy.mockRestore()
    })

    it('sert le brand depuis le cache sur deux GET /editor-context consécutifs sans mutation', async () => {
      const first = await request(testServer())
        .get('/api/admin/editor-context')
        .query({ ownerKind: 'brand', ownerId: '1', templateKey: 'invitation' })
        .set('Authorization', `Bearer ${adminToken}`)
      const second = await request(testServer())
        .get('/api/admin/editor-context')
        .query({ ownerKind: 'brand', ownerId: '1', templateKey: 'invitation' })
        .set('Authorization', `Bearer ${adminToken}`)

      expect(first.status).toBe(200)
      expect(second.status).toBe(200)
      expect(getBrandSpy).toHaveBeenCalledTimes(1)
    })

    it('invalide le cache après PATCH /email-brand : le GET suivant retape la DB', async () => {
      await request(testServer())
        .get('/api/admin/editor-context')
        .query({ ownerKind: 'brand', ownerId: '1', templateKey: 'invitation' })
        .set('Authorization', `Bearer ${adminToken}`)
      expect(getBrandSpy).toHaveBeenCalledTimes(1)

      const patch = await request(testServer())
        .patch('/api/admin/settings/email-brand')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ primaryColor: '#abc123' })
      expect(patch.status).toBe(200)

      await request(testServer())
        .get('/api/admin/editor-context')
        .query({ ownerKind: 'brand', ownerId: '1', templateKey: 'invitation' })
        .set('Authorization', `Bearer ${adminToken}`)
      expect(getBrandSpy).toHaveBeenCalledTimes(2)
    })

    it('invalide le cache après POST /email-brand/reset : le GET suivant retape la DB', async () => {
      await request(testServer())
        .get('/api/admin/editor-context')
        .query({ ownerKind: 'brand', ownerId: '1', templateKey: 'invitation' })
        .set('Authorization', `Bearer ${adminToken}`)
      expect(getBrandSpy).toHaveBeenCalledTimes(1)

      const reset = await request(testServer())
        .post('/api/admin/settings/email-brand/reset')
        .set('Authorization', `Bearer ${adminToken}`)
      expect(reset.status).toBe(200)

      await request(testServer())
        .get('/api/admin/editor-context')
        .query({ ownerKind: 'brand', ownerId: '1', templateKey: 'invitation' })
        .set('Authorization', `Bearer ${adminToken}`)
      expect(getBrandSpy).toHaveBeenCalledTimes(2)
    })

    it("un PATCH refusé par la validation ne touche pas au cache", async () => {
      await request(testServer())
        .get('/api/admin/editor-context')
        .query({ ownerKind: 'brand', ownerId: '1', templateKey: 'invitation' })
        .set('Authorization', `Bearer ${adminToken}`)
      expect(getBrandSpy).toHaveBeenCalledTimes(1)

      const patch = await request(testServer())
        .patch('/api/admin/settings/email-brand')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ primaryColor: 'not-a-hex' })
      expect(patch.status).toBe(400)

      await request(testServer())
        .get('/api/admin/editor-context')
        .query({ ownerKind: 'brand', ownerId: '1', templateKey: 'invitation' })
        .set('Authorization', `Bearer ${adminToken}`)
      // Toujours 1 : la validation a échoué avant l'UPDATE, l'invalidation
      // n'a pas dû tourner, le 2e GET sert depuis le cache.
      expect(getBrandSpy).toHaveBeenCalledTimes(1)
    })
  })
})
