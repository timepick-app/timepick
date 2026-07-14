// Mock isomorphic-dompurify to avoid ESM trap when app.ts imports email.service.ts.
jest.mock('isomorphic-dompurify')

import request from 'supertest'
import jwt from 'jsonwebtoken'
import { query } from '../../db'
import { testServer } from '../helpers/test-server'
import { CONTENT_MJML_MAX_BYTES } from '../../validators/shell-parts.validator'

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret'
const TEST_EVENT_ID = '33333333-3333-3333-3333-333333333333'
const GHOST_EVENT_ID = '99999999-9999-9999-9999-999999999999'

const VALID_HEADER = `<mj-section data-part-kind="header" background-color="#000000"><mj-column><mj-text>Header</mj-text></mj-column></mj-section>`
const VALID_BODY = `<mj-section data-part-kind="body"><mj-column><mj-text>Body</mj-text></mj-column></mj-section>`
const VALID_FOOTER = `<mj-section data-part-kind="footer"><mj-column><mj-text>Footer</mj-text></mj-column></mj-section>`

describe('PUT /api/admin/shell-parts/:ownerKind/:ownerId/:partKind', () => {
  let adminToken: string
  let userToken: string

  async function createTestUserWithRole(role: 'admin' | 'user'): Promise<string> {
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`
    const userResult = await query<{ id: string }>(
      `INSERT INTO users (email, first_name, role)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [`test-shell-parts-${role}-${uniqueSuffix}@example.com`, `Test ${role}`, role],
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
       VALUES ($1, $2, 'Shell-parts PUT test event')
       ON CONFLICT (id) DO NOTHING`,
      [TEST_EVENT_ID, `shell-parts-put-test-${TEST_EVENT_ID}`],
    )
  })

  // Scoped cleanup: only rows touched by this suite (brand singleton, the
  // test event, every known template key). Prevents racing with other suites
  // when Jest is run with --maxWorkers > 1.
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
    await query(`DELETE FROM users WHERE email LIKE 'test-shell-parts-%'`)
  })

  // ---------------------------------------------------------------------------
  // auth gate (AC1)
  // ---------------------------------------------------------------------------

  describe('auth', () => {
    it('401 when Authorization header is missing', async () => {
      const res = await request(testServer())
        .put('/api/admin/shell-parts/brand/1/header')
        .send({ contentMjml: VALID_HEADER })
      expect(res.status).toBe(401)
    })

    it('403 when the token belongs to a non-admin user (P3)', async () => {
      const res = await request(testServer())
        .put('/api/admin/shell-parts/brand/1/header')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ contentMjml: VALID_HEADER })
      // requireAdmin returns 403 for an authenticated non-admin caller. This
      // is the critical guarantee of the server-side barrier (Finding #9):
      // a leaked user token must NOT be enough to write shell_parts.
      expect(res.status).toBe(403)
    })
  })

  // ---------------------------------------------------------------------------
  // pre-flight: UNIQUE constraint required by ON CONFLICT (P7)
  // ---------------------------------------------------------------------------

  describe('pre-flight: schema invariants', () => {
    it('shell_parts has a UNIQUE constraint on (owner_kind, owner_id, part_kind)', async () => {
      // `upsertShellPart` uses `ON CONFLICT (owner_kind, owner_id, part_kind)
      // DO UPDATE`. Without the matching UNIQUE constraint, the INSERT
      // throws `ERROR: there is no unique or exclusion constraint matching
      // the ON CONFLICT specification` at runtime. Lock the invariant here
      // so a future migration drop is caught by CI rather than by users.
      const { rows } = await query<{ indexdef: string }>(
        `SELECT indexdef FROM pg_indexes WHERE tablename = 'shell_parts'`,
      )
      const hasUnique = rows.some(
        (r) =>
          /UNIQUE/i.test(r.indexdef) &&
          /\bowner_kind\b/.test(r.indexdef) &&
          /\bowner_id\b/.test(r.indexdef) &&
          /\bpart_kind\b/.test(r.indexdef),
      )
      expect(hasUnique).toBe(true)
    })
  })

  // ---------------------------------------------------------------------------
  // AC2 — path params validation
  // ---------------------------------------------------------------------------

  describe('AC2 — path params validation', () => {
    it('400 when ownerKind is not in OWNER_KINDS', async () => {
      const res = await request(testServer())
        .put('/api/admin/shell-parts/unknown/1/header')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ contentMjml: VALID_HEADER })
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
      expect(res.body.error.message).toMatch(/ownerKind must be one of/)
    })

    it('400 when ownerKind=event and ownerId is not a UUID', async () => {
      const res = await request(testServer())
        .put('/api/admin/shell-parts/event/not-a-uuid/header')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ contentMjml: VALID_HEADER })
      expect(res.status).toBe(400)
      expect(res.body.error.message).toMatch(/UUID/)
    })

    it('400 when ownerKind=template and ownerId is an unknown templateKey', async () => {
      const res = await request(testServer())
        .put('/api/admin/shell-parts/template/newsletter/body')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ contentMjml: VALID_BODY })
      expect(res.status).toBe(400)
      expect(res.body.error.message).toMatch(/known templateKey/)
    })

    it('400 when ownerKind=brand and ownerId is not "1"', async () => {
      const res = await request(testServer())
        .put('/api/admin/shell-parts/brand/42/footer')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ contentMjml: VALID_FOOTER })
      expect(res.status).toBe(400)
      expect(res.body.error.message).toMatch(/singleton/)
    })

    it('400 when partKind is not in PART_KINDS', async () => {
      const res = await request(testServer())
        .put('/api/admin/shell-parts/brand/1/sidebar')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ contentMjml: VALID_HEADER })
      expect(res.status).toBe(400)
      expect(res.body.error.message).toMatch(/partKind must be one of/)
    })

    it('200 when the path is fully well-formed', async () => {
      const res = await request(testServer())
        .put('/api/admin/shell-parts/brand/1/header')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ contentMjml: VALID_HEADER })
      expect(res.status).toBe(200)
    })

    it('normalises an uppercase event UUID to lowercase before persistence (P1)', async () => {
      const upper = TEST_EVENT_ID.toUpperCase()
      const res = await request(testServer())
        .put(`/api/admin/shell-parts/event/${upper}/header`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ contentMjml: VALID_HEADER })
      expect(res.status).toBe(200)
      expect(res.body.data.ownerId).toBe(TEST_EVENT_ID) // lowercased
      const { rows } = await query<{ owner_id: string }>(
        `SELECT owner_id FROM shell_parts WHERE owner_kind='event' AND part_kind='header'`,
      )
      expect(rows).toHaveLength(1)
      expect(rows[0].owner_id).toBe(TEST_EVENT_ID)
    })
  })

  // ---------------------------------------------------------------------------
  // AC3 — body content validation
  // ---------------------------------------------------------------------------

  describe('AC3 — body content validation', () => {
    it('400 when contentMjml is missing', async () => {
      const res = await request(testServer())
        .put('/api/admin/shell-parts/brand/1/header')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
    })

    it('400 when contentMjml is an empty string', async () => {
      const res = await request(testServer())
        .put('/api/admin/shell-parts/brand/1/header')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ contentMjml: '' })
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
    })

    it('400 when contentMjml exceeds the size limit (P5)', async () => {
      const oversize = 'x'.repeat(CONTENT_MJML_MAX_BYTES + 1)
      const res = await request(testServer())
        .put('/api/admin/shell-parts/brand/1/header')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ contentMjml: oversize })
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
      expect(res.body.error.message).toMatch(/exceeds size limit/)
    })

    it('400 when contentMjml contains a NUL byte (P6)', async () => {
      const fragment = `<mj-section data-part-kind="header"><mj-column><mj-text>X Y</mj-text></mj-column></mj-section>`
      const res = await request(testServer())
        .put('/api/admin/shell-parts/brand/1/header')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ contentMjml: fragment })
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
      expect(res.body.error.message).toMatch(/NUL byte/)
    })

    it('400 when the body contains zero mj-section', async () => {
      const res = await request(testServer())
        .put('/api/admin/shell-parts/brand/1/header')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ contentMjml: '<mj-text>no section here</mj-text>' })
      expect(res.status).toBe(400)
      expect(res.body.error.message).toMatch(/exactly one <mj-section> root \(got: 0\)/)
    })

    it('400 when the body contains two mj-section roots', async () => {
      const fragment = `${VALID_HEADER}<mj-section data-part-kind="footer"><mj-column><mj-text>F</mj-text></mj-column></mj-section>`
      const res = await request(testServer())
        .put('/api/admin/shell-parts/brand/1/header')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ contentMjml: fragment })
      expect(res.status).toBe(400)
      expect(res.body.error.message).toMatch(/exactly one <mj-section> root \(got: 2\)/)
    })

    it('400 when the section is missing data-part-kind', async () => {
      const fragment = `<mj-section background-color="#fff"><mj-column><mj-text>X</mj-text></mj-column></mj-section>`
      const res = await request(testServer())
        .put('/api/admin/shell-parts/brand/1/header')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ contentMjml: fragment })
      expect(res.status).toBe(400)
      expect(res.body.error.message).toMatch(/must declare data-part-kind="header"/)
    })

    it('400 when data-part-kind mismatches the URL partKind', async () => {
      const fragment = `<mj-section data-part-kind="footer"><mj-column><mj-text>X</mj-text></mj-column></mj-section>`
      const res = await request(testServer())
        .put('/api/admin/shell-parts/brand/1/header')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ contentMjml: fragment })
      expect(res.status).toBe(400)
      expect(res.body.error.message).toBe(
        'data-part-kind mismatch: expected "header", got "footer"',
      )
    })

    it('400 when the root mj-section has no mj-column child (P23)', async () => {
      const fragment = `<mj-section data-part-kind="header"></mj-section>`
      const res = await request(testServer())
        .put('/api/admin/shell-parts/brand/1/header')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ contentMjml: fragment })
      expect(res.status).toBe(400)
      expect(res.body.error.message).toBe(
        'Root <mj-section> must contain at least one <mj-column>',
      )
    })

    it('400 when the section contains a forbidden component (mj-raw)', async () => {
      const fragment = `<mj-section data-part-kind="body"><mj-column><mj-raw><script>alert(1)</script></mj-raw></mj-column></mj-section>`
      const res = await request(testServer())
        .put('/api/admin/shell-parts/brand/1/body')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ contentMjml: fragment })
      expect(res.status).toBe(400)
      expect(res.body.error.message).toMatch(/Forbidden component <mj-raw>/)
    })

    it('400 when an attribute is outside the whitelist (P20)', async () => {
      const fragment = `<mj-section data-part-kind="header"><mj-column><mj-text box-shadow="0 0 10px #000">X</mj-text></mj-column></mj-section>`
      const res = await request(testServer())
        .put('/api/admin/shell-parts/brand/1/header')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ contentMjml: fragment })
      expect(res.status).toBe(400)
      expect(res.body.error.message).toMatch(/Invalid attribute on <mj-text>.*box-shadow/)
    })
  })

  // ---------------------------------------------------------------------------
  // AC4 — owner existence
  // ---------------------------------------------------------------------------

  describe('AC4 — owner existence', () => {
    it('404 when ownerKind=event and the event row is missing', async () => {
      const res = await request(testServer())
        .put(`/api/admin/shell-parts/event/${GHOST_EVENT_ID}/header`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ contentMjml: VALID_HEADER })
      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe('NOT_FOUND')
    })

    it('200 when ownerKind=event and the event row exists', async () => {
      const res = await request(testServer())
        .put(`/api/admin/shell-parts/event/${TEST_EVENT_ID}/header`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ contentMjml: VALID_HEADER })
      expect(res.status).toBe(200)
      expect(res.body.data.ownerKind).toBe('event')
      expect(res.body.data.ownerId).toBe(TEST_EVENT_ID)
    })

    it('200 when ownerKind=brand (singleton, no existence check)', async () => {
      const res = await request(testServer())
        .put('/api/admin/shell-parts/brand/1/header')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ contentMjml: VALID_HEADER })
      expect(res.status).toBe(200)
      expect(res.body.data.ownerKind).toBe('brand')
    })

    it('200 when ownerKind=template with a known templateKey (P8)', async () => {
      const res = await request(testServer())
        .put('/api/admin/shell-parts/template/invitation/body')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ contentMjml: VALID_BODY })
      expect(res.status).toBe(200)
      expect(res.body.data.ownerKind).toBe('template')
      expect(res.body.data.ownerId).toBe('invitation')
      expect(res.body.data.partKind).toBe('body')
    })
  })

  // ---------------------------------------------------------------------------
  // AC5 — success response shape
  // ---------------------------------------------------------------------------

  describe('AC5 — success response shape', () => {
    it('returns { data: ShellPart } with id, ownerKind, ownerId, partKind, contentMjml, createdAt, updatedAt', async () => {
      const res = await request(testServer())
        .put('/api/admin/shell-parts/brand/1/header')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ contentMjml: VALID_HEADER })
      expect(res.status).toBe(200)
      expect(res.body.data).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          ownerKind: 'brand',
          ownerId: '1',
          partKind: 'header',
          contentMjml: VALID_HEADER,
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
        }),
      )
    })

    it('keeps the same id across two PUTs to the same (owner_kind, owner_id, part_kind)', async () => {
      const first = await request(testServer())
        .put('/api/admin/shell-parts/brand/1/body')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ contentMjml: VALID_BODY })
      const updated = `<mj-section data-part-kind="body"><mj-column><mj-text>Body v2</mj-text></mj-column></mj-section>`
      const second = await request(testServer())
        .put('/api/admin/shell-parts/brand/1/body')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ contentMjml: updated })
      expect(first.status).toBe(200)
      expect(second.status).toBe(200)
      expect(second.body.data.id).toBe(first.body.data.id)
      expect(second.body.data.contentMjml).toBe(updated)
    })

    it('bumps updatedAt strictly above the first updatedAt on subsequent writes (P2)', async () => {
      const first = await request(testServer())
        .put('/api/admin/shell-parts/brand/1/footer')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ contentMjml: VALID_FOOTER })
      const firstUpdatedAt = new Date(first.body.data.updatedAt).getTime()
      const updated = `<mj-section data-part-kind="footer"><mj-column><mj-text>Footer v2</mj-text></mj-column></mj-section>`
      // Postgres NOW() advances at sub-millisecond resolution; on very fast
      // machines two consecutive writes may share the same timestamp. We
      // retry up to a handful of times before asserting strict monotonicity.
      let secondUpdatedAt = firstUpdatedAt
      for (let i = 0; i < 5 && secondUpdatedAt <= firstUpdatedAt; i++) {
        const second = await request(testServer())
          .put('/api/admin/shell-parts/brand/1/footer')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ contentMjml: updated })
        secondUpdatedAt = new Date(second.body.data.updatedAt).getTime()
      }
      expect(secondUpdatedAt).toBeGreaterThan(firstUpdatedAt)
    })
  })

  // ---------------------------------------------------------------------------
  // AC6 — error envelope
  // ---------------------------------------------------------------------------

  describe('AC6 — error envelope', () => {
    it('path validation error → error.code=VALIDATION_ERROR', async () => {
      const res = await request(testServer())
        .put('/api/admin/shell-parts/brand/42/header')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ contentMjml: VALID_HEADER })
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
    })

    it('body validation error → error.code=VALIDATION_ERROR', async () => {
      const res = await request(testServer())
        .put('/api/admin/shell-parts/brand/1/header')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ contentMjml: '' })
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
    })

    it('partKind coherence violation → error.code=VALIDATION_ERROR + “data-part-kind mismatch”', async () => {
      const fragment = `<mj-section data-part-kind="footer"><mj-column><mj-text>X</mj-text></mj-column></mj-section>`
      const res = await request(testServer())
        .put('/api/admin/shell-parts/brand/1/header')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ contentMjml: fragment })
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
      expect(res.body.error.message).toMatch(/data-part-kind mismatch/)
    })
  })

  // ---------------------------------------------------------------------------
  // idempotence
  // ---------------------------------------------------------------------------

  describe('idempotence', () => {
    it('PUT × 3 with identical content yields a single row', async () => {
      for (let i = 0; i < 3; i++) {
        const res = await request(testServer())
          .put('/api/admin/shell-parts/brand/1/header')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ contentMjml: VALID_HEADER })
        expect(res.status).toBe(200)
      }
      const { rows } = await query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM shell_parts WHERE owner_kind='brand' AND owner_id='1' AND part_kind='header'`,
      )
      expect(rows[0].count).toBe('1')
    })

    it('PUT × 2 with identical content bumps updated_at (upsert semantics, P21)', async () => {
      // The `ON CONFLICT … DO UPDATE SET updated_at = NOW()` clause refreshes
      // the timestamp on every write, including identical content. Locking
      // this in keeps callers honest about the cache/ETag implications.
      const first = await request(testServer())
        .put('/api/admin/shell-parts/brand/1/body')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ contentMjml: VALID_BODY })
      const firstUpdatedAt = new Date(first.body.data.updatedAt).getTime()
      let secondUpdatedAt = firstUpdatedAt
      for (let i = 0; i < 5 && secondUpdatedAt <= firstUpdatedAt; i++) {
        const second = await request(testServer())
          .put('/api/admin/shell-parts/brand/1/body')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ contentMjml: VALID_BODY })
        secondUpdatedAt = new Date(second.body.data.updatedAt).getTime()
      }
      expect(secondUpdatedAt).toBeGreaterThan(firstUpdatedAt)
    })

    it('PUT successifs avec contenu différent → contentMjml final correct', async () => {
      const v1 = VALID_HEADER
      const v2 = `<mj-section data-part-kind="header"><mj-column><mj-text>v2</mj-text></mj-column></mj-section>`
      const v3 = `<mj-section data-part-kind="header"><mj-column><mj-text>v3 final</mj-text></mj-column></mj-section>`
      for (const content of [v1, v2, v3]) {
        const res = await request(testServer())
          .put('/api/admin/shell-parts/brand/1/header')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ contentMjml: content })
        expect(res.status).toBe(200)
      }
      const { rows } = await query<{ content_mjml: string }>(
        `SELECT content_mjml FROM shell_parts WHERE owner_kind='brand' AND owner_id='1' AND part_kind='header'`,
      )
      expect(rows[0].content_mjml).toBe(v3)
    })
  })

  // ---------------------------------------------------------------------------
  // Plan 1 du 2026-05-22 — PUT mj-body (branche slot-d'attributs)
  // ---------------------------------------------------------------------------

  describe('PUT mj-body (Plan 1 du 2026-05-22)', () => {
    const VALID_MJ_BODY = `<mj-body background-color="#f5f5f5" padding-top="20px" padding-bottom="10px"></mj-body>`

    it('200 — admin sauvegarde un mj-body au niveau template invitation', async () => {
      const res = await request(testServer())
        .put('/api/admin/shell-parts/template/invitation/mj-body')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ contentMjml: VALID_MJ_BODY })

      expect(res.status).toBe(200)
      expect(res.body.data).toEqual(
        expect.objectContaining({
          ownerKind: 'template',
          ownerId: 'invitation',
          partKind: 'mj-body',
          contentMjml: VALID_MJ_BODY,
        }),
      )

      const { rows } = await query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM shell_parts WHERE part_kind='mj-body' AND owner_kind='template'`,
      )
      expect(rows[0].count).toBe('1')
    })

    it('200 — admin sauvegarde un mj-body au niveau event (override)', async () => {
      const res = await request(testServer())
        .put(`/api/admin/shell-parts/event/${TEST_EVENT_ID}/mj-body`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ contentMjml: VALID_MJ_BODY })

      expect(res.status).toBe(200)
      expect(res.body.data.ownerKind).toBe('event')
      expect(res.body.data.partKind).toBe('mj-body')
    })

    it('200 — admin sauvegarde un mj-body vide (canonical "back to defaults")', async () => {
      const res = await request(testServer())
        .put('/api/admin/shell-parts/brand/1/mj-body')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ contentMjml: `<mj-body></mj-body>` })
      expect(res.status).toBe(200)
    })

    it('400 — refuse un mj-body avec enfants (slot d\'attributs uniquement)', async () => {
      const fragment = `<mj-body background-color="#fff"><mj-section><mj-column><mj-text>X</mj-text></mj-column></mj-section></mj-body>`
      const res = await request(testServer())
        .put('/api/admin/shell-parts/brand/1/mj-body')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ contentMjml: fragment })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
      expect(res.body.error.message).toMatch(/must have no children/)
    })

    it('400 — refuse un attr hors whitelist (padding-left)', async () => {
      const fragment = `<mj-body padding-left="10px"></mj-body>`
      const res = await request(testServer())
        .put('/api/admin/shell-parts/brand/1/mj-body')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ contentMjml: fragment })

      expect(res.status).toBe(400)
      expect(res.body.error.message).toMatch(/Invalid attribute on <mj-body>/)
    })

    it('400 — refuse padding-top > 100px (borne haute)', async () => {
      const fragment = `<mj-body padding-top="200px"></mj-body>`
      const res = await request(testServer())
        .put('/api/admin/shell-parts/brand/1/mj-body')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ contentMjml: fragment })

      expect(res.status).toBe(400)
      expect(res.body.error.message).toMatch(/0-100px/)
    })

    it('400 — refuse une couleur non-hex (gradient guard)', async () => {
      const fragment = `<mj-body background-color="linear-gradient(#fff,#000)"></mj-body>`
      const res = await request(testServer())
        .put('/api/admin/shell-parts/brand/1/mj-body')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ contentMjml: fragment })

      expect(res.status).toBe(400)
      expect(res.body.error.message).toMatch(/hex color/i)
    })

    it('400 — refuse un payload sans <mj-body> racine', async () => {
      const fragment = `<mj-section><mj-column><mj-text>X</mj-text></mj-column></mj-section>`
      const res = await request(testServer())
        .put('/api/admin/shell-parts/brand/1/mj-body')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ contentMjml: fragment })

      expect(res.status).toBe(400)
      expect(res.body.error.message).toMatch(/exactly one <mj-body> root/)
    })

    it('404 — ownerKind=event avec event UUID absent', async () => {
      const res = await request(testServer())
        .put(`/api/admin/shell-parts/event/${GHOST_EVENT_ID}/mj-body`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ contentMjml: VALID_MJ_BODY })

      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe('NOT_FOUND')
    })

    it('idempotence — PUT × 2 mj-body identique → une seule row', async () => {
      for (let i = 0; i < 2; i++) {
        const res = await request(testServer())
          .put('/api/admin/shell-parts/brand/1/mj-body')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ contentMjml: VALID_MJ_BODY })
        expect(res.status).toBe(200)
      }
      const { rows } = await query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM shell_parts WHERE owner_kind='brand' AND owner_id='1' AND part_kind='mj-body'`,
      )
      expect(rows[0].count).toBe('1')
    })
  })

  // ---------------------------------------------------------------------------
  // Plan-5b-defer-A L2 (2026-05-25) — PUT shell-parts content-wrapper.
  // Slot d'attributs hors-bloc, whitelist Outlook-safe (background-color,
  // padding*, border-radius). Pattern miroir mj-body : pas de data-part-kind
  // requis, pas d'enfants. Cf. docs/EMAIL_SHELL_POLICY.md § content-wrapper.
  // ---------------------------------------------------------------------------

  describe('PUT content-wrapper (Plan-5b-defer-A L2)', () => {
    const VALID_CONTENT_WRAPPER = `<mj-section background-color="#f9f9f9" padding="20px" border-radius="8px"></mj-section>`

    it('200 — admin sauvegarde un content-wrapper au niveau template invitation', async () => {
      const res = await request(testServer())
        .put('/api/admin/shell-parts/template/invitation/content-wrapper')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ contentMjml: VALID_CONTENT_WRAPPER })

      expect(res.status).toBe(200)
      expect(res.body.data).toEqual(
        expect.objectContaining({
          ownerKind: 'template',
          ownerId: 'invitation',
          partKind: 'content-wrapper',
          contentMjml: VALID_CONTENT_WRAPPER,
        }),
      )

      const { rows } = await query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM shell_parts WHERE part_kind='content-wrapper' AND owner_kind='template' AND owner_id='invitation'`,
      )
      expect(rows[0].count).toBe('1')
    })

    it('200 — admin sauvegarde un content-wrapper au niveau brand', async () => {
      const res = await request(testServer())
        .put('/api/admin/shell-parts/brand/1/content-wrapper')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ contentMjml: VALID_CONTENT_WRAPPER })

      expect(res.status).toBe(200)
      expect(res.body.data.ownerKind).toBe('brand')
      expect(res.body.data.partKind).toBe('content-wrapper')
    })

    it('200 — admin sauvegarde un content-wrapper au niveau event (override)', async () => {
      const res = await request(testServer())
        .put(`/api/admin/shell-parts/event/${TEST_EVENT_ID}/content-wrapper`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ contentMjml: VALID_CONTENT_WRAPPER })

      expect(res.status).toBe(200)
      expect(res.body.data.ownerKind).toBe('event')
      expect(res.body.data.partKind).toBe('content-wrapper')
    })

    it('200 — admin sauvegarde un content-wrapper vide (canonical "back to defaults")', async () => {
      const res = await request(testServer())
        .put('/api/admin/shell-parts/brand/1/content-wrapper')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ contentMjml: `<mj-section></mj-section>` })

      expect(res.status).toBe(200)
    })

    it('200 — accepte padding longhand (padding-top/bottom/left/right)', async () => {
      const fragment = `<mj-section background-color="#f9f9f9" padding-top="10px" padding-bottom="20px" padding-left="15px" padding-right="15px" border-radius="4px 8px 4px 8px"></mj-section>`
      const res = await request(testServer())
        .put('/api/admin/shell-parts/brand/1/content-wrapper')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ contentMjml: fragment })

      expect(res.status).toBe(200)
    })

    it('400 — refuse un content-wrapper avec enfants (slot d\'attributs uniquement)', async () => {
      const fragment = `<mj-section background-color="#f9f9f9"><mj-column><mj-text>X</mj-text></mj-column></mj-section>`
      const res = await request(testServer())
        .put('/api/admin/shell-parts/brand/1/content-wrapper')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ contentMjml: fragment })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
      expect(res.body.error.message).toMatch(/no children/)
    })

    it('400 — refuse un attr hors whitelist (color)', async () => {
      const fragment = `<mj-section color="#ff0000" padding="20px"></mj-section>`
      const res = await request(testServer())
        .put('/api/admin/shell-parts/brand/1/content-wrapper')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ contentMjml: fragment })

      expect(res.status).toBe(400)
      expect(res.body.error.message).toMatch(/Invalid attribute on <mj-section> for content-wrapper/)
    })

    it('400 — refuse une couleur non-hex (gradient guard)', async () => {
      const fragment = `<mj-section background-color="linear-gradient(#fff,#000)"></mj-section>`
      const res = await request(testServer())
        .put('/api/admin/shell-parts/brand/1/content-wrapper')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ contentMjml: fragment })

      expect(res.status).toBe(400)
      expect(res.body.error.message).toMatch(/hex color/i)
    })

    it('400 — refuse un border-radius mal formé (unités non-px)', async () => {
      const fragment = `<mj-section border-radius="0.5rem"></mj-section>`
      const res = await request(testServer())
        .put('/api/admin/shell-parts/brand/1/content-wrapper')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ contentMjml: fragment })

      expect(res.status).toBe(400)
      expect(res.body.error.message).toMatch(/border-radius/)
    })

    it('400 — refuse plusieurs <mj-section> racines', async () => {
      const fragment = `<mj-section padding="10px"></mj-section><mj-section padding="20px"></mj-section>`
      const res = await request(testServer())
        .put('/api/admin/shell-parts/brand/1/content-wrapper')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ contentMjml: fragment })

      expect(res.status).toBe(400)
      expect(res.body.error.message).toMatch(/exactly one <mj-section> root/)
    })

    it('idempotence — PUT × 2 content-wrapper identique → une seule row', async () => {
      for (let i = 0; i < 2; i++) {
        const res = await request(testServer())
          .put('/api/admin/shell-parts/brand/1/content-wrapper')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ contentMjml: VALID_CONTENT_WRAPPER })
        expect(res.status).toBe(200)
      }
      const { rows } = await query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM shell_parts WHERE owner_kind='brand' AND owner_id='1' AND part_kind='content-wrapper'`,
      )
      expect(rows[0].count).toBe('1')
    })

    it('UPSERT update — PUT × 2 content-wrapper avec attrs différents → row unique avec contenu mis à jour', async () => {
      const firstFragment = `<mj-section background-color="#f9f9f9" padding="20px" border-radius="8px"></mj-section>`
      const updatedFragment = `<mj-section background-color="#eeeeee" padding="10px"></mj-section>`

      const first = await request(testServer())
        .put('/api/admin/shell-parts/brand/1/content-wrapper')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ contentMjml: firstFragment })
      expect(first.status).toBe(200)

      const second = await request(testServer())
        .put('/api/admin/shell-parts/brand/1/content-wrapper')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ contentMjml: updatedFragment })
      expect(second.status).toBe(200)
      expect(second.body.data.contentMjml).toBe(updatedFragment)

      const { rows } = await query<{ count: string; content_mjml: string }>(
        `SELECT COUNT(*)::text AS count, MAX(content_mjml) AS content_mjml FROM shell_parts WHERE owner_kind='brand' AND owner_id='1' AND part_kind='content-wrapper'`,
      )
      expect(rows[0].count).toBe('1')
      expect(rows[0].content_mjml).toBe(updatedFragment)
    })
  })
})
