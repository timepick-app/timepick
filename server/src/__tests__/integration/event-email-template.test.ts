import request from 'supertest'
import jwt from 'jsonwebtoken'
import { testServer } from '../helpers/test-server'
import { query } from '../../db'
import {
  startTestTransaction,
  rollbackTestTransaction,
} from '../helpers/transaction'
import { MAX_BODY_MJML_BYTES } from '../../validators/email-templates.validator'

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret'

const VALID_MJML_BODY =
  '<!-- BODY:START -->\n<mj-section><mj-column><mj-text>Custom invitation</mj-text></mj-column></mj-section>\n<!-- BODY:END -->'

const ANOTHER_VALID_MJML_BODY =
  '<!-- BODY:START -->\n<mj-section><mj-column><mj-text>Another body</mj-text></mj-column></mj-section>\n<!-- BODY:END -->'

const UNKNOWN_BUT_VALID_UUID = '00000000-0000-0000-0000-000000000000'

describe('Event Email Template API (E3.S2)', () => {
  let adminToken: string
  let adminUserId: string
  let userToken: string
  let testEventId: string

  async function createTestAdmin() {
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`
    const userResult = await query(
      `INSERT INTO users (email, first_name, role)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [`test-event-email-template-admin-${uniqueSuffix}@example.com`, 'Test Admin', 'admin'],
    )
    return userResult.rows[0]
  }

  async function createTestUser() {
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`
    const userResult = await query(
      `INSERT INTO users (email, first_name, role)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [`test-event-email-template-user-${uniqueSuffix}@example.com`, 'Test User', 'user'],
    )
    return userResult.rows[0]
  }

  function generateToken(userId: string, role: string): string {
    return jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: '1h' })
  }

  beforeAll(async () => {
    const admin = await createTestAdmin()
    adminUserId = admin.id
    adminToken = generateToken(adminUserId, 'admin')

    const user = await createTestUser()
    userToken = generateToken(user.id, 'user')
  })

  beforeEach(async () => {
    await startTestTransaction()
    // Create a fresh event inside the transaction (auto-rolled back per test)
    const createRes = await request(testServer())
      .post('/api/admin/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Test E3.S2 Event' })
    testEventId = createRes.body.data.id
  })

  afterEach(async () => {
    await rollbackTestTransaction()
  })

  describe('GET /api/admin/events/:id/email-template', () => {
    it('returns isCustom=false and bodyMjml===defaultBodyMjml for an event with NULL invitation_mjml', async () => {
      const res = await request(testServer())
        .get(`/api/admin/events/${testEventId}/email-template`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data).toMatchObject({
        eventId: testEventId,
        templateKey: 'invitation',
        isCustom: false,
      })
      expect(res.body.data.bodyMjml).toBe(res.body.data.defaultBodyMjml)
      expect(typeof res.body.data.defaultBodyMjml).toBe('string')
      expect(res.body.data.defaultBodyMjml.length).toBeGreaterThan(0)
      expect(res.body.data.updatedAt).toEqual(expect.any(String))
    })

    it('returns isCustom=true and bodyMjml===custom when invitation_mjml is non-NULL', async () => {
      // Seed the override directly (the PATCH endpoint is tested separately)
      await query(
        `UPDATE events SET invitation_mjml = $1 WHERE id = $2`,
        [VALID_MJML_BODY, testEventId],
      )

      const res = await request(testServer())
        .get(`/api/admin/events/${testEventId}/email-template`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data.isCustom).toBe(true)
      expect(res.body.data.bodyMjml).toBe(VALID_MJML_BODY)
      expect(res.body.data.defaultBodyMjml).not.toBe(VALID_MJML_BODY)
      expect(res.body.data.eventId).toBe(testEventId)
    })

    it('returns isCustom=true when only a shell_part @ event exists (no body override)', async () => {
      // Seed a shell_parts row for the event without any invitation_mjml override
      await query(
        `INSERT INTO shell_parts (owner_kind, owner_id, part_kind, content_mjml)
         VALUES ('event', $1, 'header', '<mj-section><mj-column><mj-text>Event header</mj-text></mj-column></mj-section>')
         ON CONFLICT (owner_kind, owner_id, part_kind)
         DO UPDATE SET content_mjml = EXCLUDED.content_mjml`,
        [testEventId],
      )

      const res = await request(testServer())
        .get(`/api/admin/events/${testEventId}/email-template`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data.isCustom).toBe(true)
      // bodyMjml falls back to default because invitation_mjml is still NULL
      expect(res.body.data.bodyMjml).toBe(res.body.data.defaultBodyMjml)
      expect(res.body.data.eventId).toBe(testEventId)
    })

    it('returns 404 for an unknown but valid UUID', async () => {
      const res = await request(testServer())
        .get(`/api/admin/events/${UNKNOWN_BUT_VALID_UUID}/email-template`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(404)
      expect(res.body.error).toMatchObject({ code: 'EVENT_NOT_FOUND' })
    })

    it('returns 400 for an invalid UUID format', async () => {
      const res = await request(testServer())
        .get(`/api/admin/events/not-a-uuid/email-template`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(400)
      expect(res.body.error).toMatchObject({ code: 'VALIDATION_ERROR' })
    })

    it('returns 401 without auth', async () => {
      const res = await request(testServer()).get(
        `/api/admin/events/${testEventId}/email-template`,
      )
      expect(res.status).toBe(401)
    })

    it('returns 403 with non-admin token', async () => {
      const res = await request(testServer())
        .get(`/api/admin/events/${testEventId}/email-template`)
        .set('Authorization', `Bearer ${userToken}`)
      expect(res.status).toBe(403)
    })
  })

  describe('PATCH /api/admin/events/:id/email-template', () => {
    it('persists bodyMjml and round-trips on subsequent GET', async () => {
      const patchRes = await request(testServer())
        .patch(`/api/admin/events/${testEventId}/email-template`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ bodyMjml: VALID_MJML_BODY })

      expect(patchRes.status).toBe(200)
      expect(patchRes.body.data).toMatchObject({
        eventId: testEventId,
        templateKey: 'invitation',
        isCustom: true,
        bodyMjml: VALID_MJML_BODY,
      })
      expect(patchRes.body.data.defaultBodyMjml).not.toBe(VALID_MJML_BODY)

      const getRes = await request(testServer())
        .get(`/api/admin/events/${testEventId}/email-template`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(getRes.status).toBe(200)
      expect(getRes.body.data.bodyMjml).toBe(VALID_MJML_BODY)
      expect(getRes.body.data.isCustom).toBe(true)
    })

    it('returns 400 for empty bodyMjml', async () => {
      const res = await request(testServer())
        .patch(`/api/admin/events/${testEventId}/email-template`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ bodyMjml: '' })

      expect(res.status).toBe(400)
      expect(res.body.error).toMatchObject({ code: 'VALIDATION_ERROR' })
    })

    it('returns 400 when BODY:START / BODY:END markers are missing', async () => {
      const res = await request(testServer())
        .patch(`/api/admin/events/${testEventId}/email-template`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ bodyMjml: '<mj-section><mj-column><mj-text>No markers</mj-text></mj-column></mj-section>' })

      expect(res.status).toBe(400)
      expect(res.body.error).toMatchObject({ code: 'VALIDATION_ERROR' })
    })

    it('returns 400 when bodyMjml exceeds 64 KiB', async () => {
      const oversizedBody =
        '<!-- BODY:START -->' + 'x'.repeat(MAX_BODY_MJML_BYTES) + '<!-- BODY:END -->'

      const res = await request(testServer())
        .patch(`/api/admin/events/${testEventId}/email-template`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ bodyMjml: oversizedBody })

      expect(res.status).toBe(400)
      expect(res.body.error).toMatchObject({ code: 'VALIDATION_ERROR' })
    })

    it('returns 400 for a multi-byte UTF-8 body whose char-count is below the limit but byte-count exceeds it', async () => {
      // 𝕏 ("MATHEMATICAL DOUBLE-STRUCK CAPITAL X") is U+1D54F → 4 UTF-8 bytes per char.
      // 16_385 × 4 = 65_540 bytes (>64 KiB) but only 32_770 UTF-16 code units.
      // Guards the byte-vs-char distinction: a regression to Zod's char-count `.max()` would silently pass.
      const multiByteFiller = '𝕏'.repeat(16_385)
      const body = '<!-- BODY:START -->' + multiByteFiller + '<!-- BODY:END -->'
      expect(body.length).toBeLessThan(MAX_BODY_MJML_BYTES)
      expect(Buffer.byteLength(body, 'utf8')).toBeGreaterThan(MAX_BODY_MJML_BYTES)

      const res = await request(testServer())
        .patch(`/api/admin/events/${testEventId}/email-template`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ bodyMjml: body })

      expect(res.status).toBe(400)
      expect(res.body.error).toMatchObject({ code: 'VALIDATION_ERROR' })
    })

    it('accepts a body whose byte-count equals the MAX_BODY_MJML_BYTES boundary exactly', async () => {
      // The validator uses `<=`, so a body whose bytes equal MAX_BODY_MJML_BYTES must pass.
      const start = '<!-- BODY:START -->'
      const end = '<!-- BODY:END -->'
      const padding = MAX_BODY_MJML_BYTES - Buffer.byteLength(start + end, 'utf8')
      const body = start + 'x'.repeat(padding) + end
      expect(Buffer.byteLength(body, 'utf8')).toBe(MAX_BODY_MJML_BYTES)

      const res = await request(testServer())
        .patch(`/api/admin/events/${testEventId}/email-template`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ bodyMjml: body })

      expect(res.status).toBe(200)
      expect(res.body.data.isCustom).toBe(true)
    })

    it('returns 400 when the body contains unknown extra keys (Zod .strict())', async () => {
      const res = await request(testServer())
        .patch(`/api/admin/events/${testEventId}/email-template`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ bodyMjml: VALID_MJML_BODY, foo: 'unexpected' })

      expect(res.status).toBe(400)
      expect(res.body.error).toMatchObject({ code: 'VALIDATION_ERROR' })
    })

    it('returns 401 without auth', async () => {
      const res = await request(testServer())
        .patch(`/api/admin/events/${testEventId}/email-template`)
        .send({ bodyMjml: VALID_MJML_BODY })
      expect(res.status).toBe(401)
    })

    it('returns 403 with non-admin token', async () => {
      const res = await request(testServer())
        .patch(`/api/admin/events/${testEventId}/email-template`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ bodyMjml: VALID_MJML_BODY })
      expect(res.status).toBe(403)
    })

    it('returns 404 for an unknown UUID', async () => {
      const res = await request(testServer())
        .patch(`/api/admin/events/${UNKNOWN_BUT_VALID_UUID}/email-template`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ bodyMjml: VALID_MJML_BODY })
      expect(res.status).toBe(404)
      expect(res.body.error).toMatchObject({ code: 'EVENT_NOT_FOUND' })
    })
  })

  describe('POST /api/admin/events/:id/email-template/preview', () => {
    const CUSTOM_PREVIEW_MARKER = 'CUSTOM-PREVIEW-MARKER-XYZ'
    const CUSTOM_BODY_FOR_PREVIEW = `<!-- BODY:START -->\n<mj-section><mj-column><mj-text>${CUSTOM_PREVIEW_MARKER}</mj-text></mj-column></mj-section>\n<!-- BODY:END -->`

    it('returns 200 + compiled HTML for an event with invitation_mjml IS NULL (inherited)', async () => {
      const res = await request(testServer())
        .post(`/api/admin/events/${testEventId}/email-template/preview`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data).toMatchObject({
        templateKey: 'invitation',
        eventId: testEventId,
      })
      expect(typeof res.body.data.html).toBe('string')
      expect(res.body.data.html.length).toBeGreaterThan(0)
      expect(typeof res.body.data.text).toBe('string')
      expect(res.body.data.text.length).toBeGreaterThan(0)
      expect(res.body.data.html).not.toContain('Healthcheck')
      expect(res.body.data.html).not.toContain('example.invalid')
    })

    it('returns 200 + compiled HTML for an event with custom invitation_mjml (override path)', async () => {
      // Seed a distinct override so we can prove the rendered HTML reflects the per-event body
      await query(`UPDATE events SET invitation_mjml = $1 WHERE id = $2`, [
        CUSTOM_BODY_FOR_PREVIEW,
        testEventId,
      ])

      const res = await request(testServer())
        .post(`/api/admin/events/${testEventId}/email-template/preview`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data.html).toContain(CUSTOM_PREVIEW_MARKER)
      expect(res.body.data.text).toContain(CUSTOM_PREVIEW_MARKER)
      expect(res.body.data.eventId).toBe(testEventId)
      expect(res.body.data.templateKey).toBe('invitation')
    })

    it('returns 404 for an unknown but valid UUID', async () => {
      const res = await request(testServer())
        .post(`/api/admin/events/${UNKNOWN_BUT_VALID_UUID}/email-template/preview`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(404)
      expect(res.body.error).toMatchObject({ code: 'EVENT_NOT_FOUND' })
    })

    it('returns 400 for an invalid UUID format', async () => {
      const res = await request(testServer())
        .post(`/api/admin/events/not-a-uuid/email-template/preview`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(400)
      expect(res.body.error).toMatchObject({ code: 'VALIDATION_ERROR' })
    })

    it('returns 401 without auth', async () => {
      const res = await request(testServer()).post(
        `/api/admin/events/${testEventId}/email-template/preview`,
      )
      expect(res.status).toBe(401)
    })

    it('returns 403 with non-admin token', async () => {
      const res = await request(testServer())
        .post(`/api/admin/events/${testEventId}/email-template/preview`)
        .set('Authorization', `Bearer ${userToken}`)
      expect(res.status).toBe(403)
    })
  })

  describe('POST /api/admin/events/:id/email-template/reset', () => {
    it('purges invitation_mjml after a PATCH', async () => {
      // PATCH first
      await request(testServer())
        .patch(`/api/admin/events/${testEventId}/email-template`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ bodyMjml: ANOTHER_VALID_MJML_BODY })
        .expect(200)

      // Then RESET
      const resetRes = await request(testServer())
        .post(`/api/admin/events/${testEventId}/email-template/reset`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(resetRes.status).toBe(200)
      expect(resetRes.body.data.isCustom).toBe(false)
      expect(resetRes.body.data.bodyMjml).toBe(resetRes.body.data.defaultBodyMjml)

      // Subsequent GET also confirms
      const getRes = await request(testServer())
        .get(`/api/admin/events/${testEventId}/email-template`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(getRes.status).toBe(200)
      expect(getRes.body.data.isCustom).toBe(false)
      expect(getRes.body.data.bodyMjml).toBe(getRes.body.data.defaultBodyMjml)
    })

    it('is idempotent on an event already at NULL', async () => {
      const res = await request(testServer())
        .post(`/api/admin/events/${testEventId}/email-template/reset`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data.isCustom).toBe(false)
    })

    it('deletes shell_parts @ event atomically with the body reset', async () => {
      // Seed body override
      await query(
        `UPDATE events SET invitation_mjml = $1 WHERE id = $2`,
        [ANOTHER_VALID_MJML_BODY, testEventId],
      )
      // Seed a shell_parts row for the event
      await query(
        `INSERT INTO shell_parts (owner_kind, owner_id, part_kind, content_mjml)
         VALUES ('event', $1, 'header', '<mj-section><mj-column><mj-text>Event header</mj-text></mj-column></mj-section>')
         ON CONFLICT (owner_kind, owner_id, part_kind)
         DO UPDATE SET content_mjml = EXCLUDED.content_mjml`,
        [testEventId],
      )

      // Verify both are set before reset
      const beforeCheck = await query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM shell_parts WHERE owner_kind = 'event' AND owner_id = $1`,
        [testEventId],
      )
      expect(parseInt(beforeCheck.rows[0].n, 10)).toBe(1)

      const resetRes = await request(testServer())
        .post(`/api/admin/events/${testEventId}/email-template/reset`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(resetRes.status).toBe(200)
      expect(resetRes.body.data.isCustom).toBe(false)
      expect(resetRes.body.data.bodyMjml).toBe(resetRes.body.data.defaultBodyMjml)

      // shell_parts @ event must be gone
      const afterShell = await query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM shell_parts WHERE owner_kind = 'event' AND owner_id = $1`,
        [testEventId],
      )
      expect(parseInt(afterShell.rows[0].n, 10)).toBe(0)

      // Subsequent GET confirms isCustom=false
      const getRes = await request(testServer())
        .get(`/api/admin/events/${testEventId}/email-template`)
        .set('Authorization', `Bearer ${adminToken}`)
      expect(getRes.status).toBe(200)
      expect(getRes.body.data.isCustom).toBe(false)
    })

    it('deletes shell_parts @ event even when invitation_mjml was already NULL', async () => {
      // Seed only a shell_parts row (body stays NULL)
      await query(
        `INSERT INTO shell_parts (owner_kind, owner_id, part_kind, content_mjml)
         VALUES ('event', $1, 'footer', '<mj-section><mj-column><mj-text>Footer</mj-text></mj-column></mj-section>')
         ON CONFLICT (owner_kind, owner_id, part_kind)
         DO UPDATE SET content_mjml = EXCLUDED.content_mjml`,
        [testEventId],
      )

      const resetRes = await request(testServer())
        .post(`/api/admin/events/${testEventId}/email-template/reset`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(resetRes.status).toBe(200)
      expect(resetRes.body.data.isCustom).toBe(false)

      const afterShell = await query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM shell_parts WHERE owner_kind = 'event' AND owner_id = $1`,
        [testEventId],
      )
      expect(parseInt(afterShell.rows[0].n, 10)).toBe(0)
    })

    it('reset scopes DELETE to this event only — does NOT touch template/brand/other-event shell_parts', async () => {
      // (a) template shell_part
      await query(
        `INSERT INTO shell_parts (owner_kind, owner_id, part_kind, content_mjml)
         VALUES ('template', 'invitation', 'footer', '<mj-section></mj-section>')
         ON CONFLICT (owner_kind, owner_id, part_kind)
         DO UPDATE SET content_mjml = EXCLUDED.content_mjml`,
      )

      // (b) brand shell_part
      await query(
        `INSERT INTO shell_parts (owner_kind, owner_id, part_kind, content_mjml)
         VALUES ('brand', '1', 'footer', '<mj-section></mj-section>')
         ON CONFLICT (owner_kind, owner_id, part_kind)
         DO UPDATE SET content_mjml = EXCLUDED.content_mjml`,
      )

      // (c) second event + its shell_part
      const event2Res = await request(testServer())
        .post('/api/admin/events')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Test E3.S2 Event scoping-sibling' })
      const event2Id: string = event2Res.body.data.id

      await query(
        `INSERT INTO shell_parts (owner_kind, owner_id, part_kind, content_mjml)
         VALUES ('event', $1, 'header', '<mj-section></mj-section>')
         ON CONFLICT (owner_kind, owner_id, part_kind)
         DO UPDATE SET content_mjml = EXCLUDED.content_mjml`,
        [event2Id],
      )

      // (d) testEventId shell_part — this one must be removed by reset
      await query(
        `INSERT INTO shell_parts (owner_kind, owner_id, part_kind, content_mjml)
         VALUES ('event', $1, 'header', '<mj-section></mj-section>')
         ON CONFLICT (owner_kind, owner_id, part_kind)
         DO UPDATE SET content_mjml = EXCLUDED.content_mjml`,
        [testEventId],
      )

      // POST reset on testEventId → 200
      const resetRes = await request(testServer())
        .post(`/api/admin/events/${testEventId}/email-template/reset`)
        .set('Authorization', `Bearer ${adminToken}`)
      expect(resetRes.status).toBe(200)

      // (a) template row must survive intact
      const { rows: templateRows } = await query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM shell_parts
         WHERE owner_kind = 'template' AND owner_id = 'invitation' AND part_kind = 'footer'`,
      )
      expect(parseInt(templateRows[0].n, 10)).toBe(1)

      // (b) brand row must survive intact
      const { rows: brandRows } = await query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM shell_parts
         WHERE owner_kind = 'brand' AND owner_id = '1' AND part_kind = 'footer'`,
      )
      expect(parseInt(brandRows[0].n, 10)).toBe(1)

      // (c) event2 shell_part must survive intact
      const { rows: event2Rows } = await query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM shell_parts
         WHERE owner_kind = 'event' AND owner_id = $1`,
        [event2Id],
      )
      expect(parseInt(event2Rows[0].n, 10)).toBe(1)

      // (d) testEventId shell_parts must be gone
      const { rows: testEventRows } = await query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM shell_parts
         WHERE owner_kind = 'event' AND owner_id = $1`,
        [testEventId],
      )
      expect(parseInt(testEventRows[0].n, 10)).toBe(0)
    })

    it('returns 404 for an unknown UUID', async () => {
      const res = await request(testServer())
        .post(`/api/admin/events/${UNKNOWN_BUT_VALID_UUID}/email-template/reset`)
        .set('Authorization', `Bearer ${adminToken}`)
      expect(res.status).toBe(404)
      expect(res.body.error).toMatchObject({ code: 'EVENT_NOT_FOUND' })
    })

    it('returns 401 without auth', async () => {
      const res = await request(testServer()).post(
        `/api/admin/events/${testEventId}/email-template/reset`,
      )
      expect(res.status).toBe(401)
    })

    it('returns 403 with non-admin token', async () => {
      const res = await request(testServer())
        .post(`/api/admin/events/${testEventId}/email-template/reset`)
        .set('Authorization', `Bearer ${userToken}`)
      expect(res.status).toBe(403)
    })
  })
})
