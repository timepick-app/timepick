// Auto-mock isomorphic-dompurify (Story 23.1, A4) — avoids @exodus/bytes ESM trap
// when app.ts pulls in email.service.ts → render-email.service.ts → mjml-compile.service.ts (post-Story 25-1 wiring).
jest.mock('isomorphic-dompurify')

import request from 'supertest'
import jwt from 'jsonwebtoken'
import { query } from '../../db'
import { testServer } from '../helpers/test-server'
import { adminActionLimiter } from '../../middleware/adminActionLimiter'
import * as shellPartsService from '../../services/shell-parts.service'

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret'

describe('Email Templates API', () => {
  let adminToken: string
  let adminUserId: string

  async function createTestAdmin() {
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`
    const userResult = await query(
      `INSERT INTO users (email, first_name, role)
       VALUES ($1, $2, $3)
       RETURNING id, email, first_name, role`,
      [`test-tpl-admin-${uniqueSuffix}@example.com`, 'Test Admin', 'admin'],
    )
    return userResult.rows[0]
  }

  function generateAdminToken(userId: string): string {
    return jwt.sign({ userId, role: 'admin' }, JWT_SECRET, { expiresIn: '1h' })
  }

  beforeAll(async () => {
    const admin = await createTestAdmin()
    adminUserId = admin.id
    adminToken = generateAdminToken(adminUserId)
  })

  afterEach(async () => {
    await query(
      `UPDATE email_templates SET body_mjml = default_body_mjml WHERE template_key = ANY($1)`,
      [['invitation', 'magic_link_login', 'reservation_confirmation', 'account_created', 'cancellation_confirmation', 'role_promoted', 'role_demoted', 'unregistration_confirmation']],
    )
  })

  afterAll(async () => {
    await query("DELETE FROM users WHERE email LIKE 'test-tpl-%'")
  })

  // ===================================================
  // GET /:templateKey — invitation
  // ===================================================
  describe('GET /:templateKey — invitation', () => {
    it('returns bodyMjml and defaultBodyMjml', async () => {
      const res = await request(testServer())
        .get('/api/admin/settings/email-templates/invitation')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data.templateKey).toBe('invitation')
      expect(res.body.data.bodyMjml).toBeDefined()
      expect(res.body.data.defaultBodyMjml).toBeDefined()
    })

    it('does NOT include introText/signatureText keys', async () => {
      const res = await request(testServer())
        .get('/api/admin/settings/email-templates/invitation')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data.introText).toBeUndefined()
      expect(res.body.data.signatureText).toBeUndefined()
    })

    it('returns updatedAt as ISO 8601 string', async () => {
      const res = await request(testServer())
        .get('/api/admin/settings/email-templates/invitation')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(typeof res.body.data.updatedAt).toBe('string')
      expect(new Date(res.body.data.updatedAt).getTime()).toBeGreaterThan(0)
    })

    it('includes shellCustomized (boolean) reflecting the shell state', async () => {
      // Pied présent = coque déviée de l'usine → flag true.
      await shellPartsService.seedShellPart({ ownerKind: 'template', ownerId: 'invitation', partKind: 'footer', contentMjml: '<mj-section><mj-column><mj-text>FLAG TEST FOOTER</mj-text></mj-column></mj-section>' })
      try {
        const res = await request(testServer())
          .get('/api/admin/settings/email-templates/invitation')
          .set('Authorization', `Bearer ${adminToken}`)

        expect(res.status).toBe(200)
        expect(typeof res.body.data.shellCustomized).toBe('boolean')
        expect(res.body.data.shellCustomized).toBe(true)
      } finally {
        await query("DELETE FROM shell_parts WHERE owner_kind = 'template' AND owner_id = 'invitation' AND part_kind = 'footer'")
      }
    })
  })

  // ===================================================
  // GET /:templateKey — system templates
  // ===================================================
  describe('GET /:templateKey — system templates', () => {
    it('magic_link_login returns introText and signatureText', async () => {
      const res = await request(testServer())
        .get('/api/admin/settings/email-templates/magic_link_login')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data.templateKey).toBe('magic_link_login')
      expect(res.body.data.introText).toContain('lien de connexion')
      expect(res.body.data.signatureText).toContain('expire')
    })

    it('reservation_confirmation returns introText and signatureText', async () => {
      const res = await request(testServer())
        .get('/api/admin/settings/email-templates/reservation_confirmation')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data.templateKey).toBe('reservation_confirmation')
      expect(res.body.data.introText).toContain('réservation')
      expect(res.body.data.signatureText).toContain('bientôt')
    })

    it('account_created returns introText and signatureText', async () => {
      // Valide le parse contre le vrai corps seedé en base (détecte une désync skeleton↔SQL)
      const res = await request(testServer())
        .get('/api/admin/settings/email-templates/account_created')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data.templateKey).toBe('account_created')
      expect(res.body.data.introText).toBe('Bonjour {{user_first_name}},\n\nvotre compte vient d\'être créé. Cliquez sur le bouton ci-dessous pour vous connecter à votre espace.')
      expect(res.body.data.signatureText).toBe('Saisissez votre adresse email pour recevoir un lien de connexion sécurisé. À bientôt !')
    })

    it('cancellation_confirmation returns introText and signatureText', async () => {
      // Valide le parse contre le vrai corps seedé en base (migration 024 — détecte une désync skeleton↔SQL)
      const res = await request(testServer())
        .get('/api/admin/settings/email-templates/cancellation_confirmation')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data.templateKey).toBe('cancellation_confirmation')
      expect(res.body.data.introText).toBe('Bonjour {{user_first_name}},\n\nnous vous informons que le créneau de participation suivant a été annulé :')
      expect(res.body.data.signatureText).toBe("Cordialement, L'équipe d'organisation")
    })

    it('role_promoted returns introText and signatureText', async () => {
      // Valide le parse contre le vrai corps seedé en base (migration 026 — détecte une désync skeleton↔SQL)
      const res = await request(testServer())
        .get('/api/admin/settings/email-templates/role_promoted')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data.templateKey).toBe('role_promoted')
      expect(res.body.data.introText).toBe('Bonjour {{user_first_name}},\n\nvotre accès a été mis à jour.\n\nVous êtes désormais Administrateur : vous pouvez gérer les membres, les événements et les paramètres.')
      expect(res.body.data.signatureText).toBe('Connectez-vous avec votre adresse email pour retrouver votre espace. À bientôt !')
    })

    it('role_demoted returns introText and signatureText', async () => {
      // Valide le parse contre le vrai corps seedé en base (migration 026 — détecte une désync skeleton↔SQL)
      const res = await request(testServer())
        .get('/api/admin/settings/email-templates/role_demoted')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data.templateKey).toBe('role_demoted')
      expect(res.body.data.introText).toBe("Bonjour {{user_first_name}},\n\nvotre accès a été ajusté.\n\nVous êtes désormais Membre : vous continuez à accéder à vos événements et à votre profil ; les fonctions d'administration ne sont plus disponibles.")
      expect(res.body.data.signatureText).toBe('Connectez-vous avec votre adresse email pour retrouver votre espace. À bientôt !')
    })

    it('system responses do NOT include bodyMjml or defaultBodyMjml', async () => {
      const res = await request(testServer())
        .get('/api/admin/settings/email-templates/magic_link_login')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data.bodyMjml).toBeUndefined()
      expect(res.body.data.defaultBodyMjml).toBeUndefined()
    })
  })

  // ===================================================
  // GET /:templateKey — error path
  // ===================================================
  describe('GET /:templateKey — errors', () => {
    it('returns 400 for unknown templateKey', async () => {
      const res = await request(testServer())
        .get('/api/admin/settings/email-templates/newsletter')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
    })
  })

  // ===================================================
  // PATCH /:templateKey — invitation happy path
  // ===================================================
  describe('PATCH /:templateKey — invitation happy path', () => {
    it('updates bodyMjml and returns updated row', async () => {
      const newBody = '<mj-section padding="20px"><mj-column><mj-text>Edited invitation</mj-text></mj-column></mj-section>'
      const res = await request(testServer())
        .patch('/api/admin/settings/email-templates/invitation')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ bodyMjml: newBody })

      expect(res.status).toBe(200)
      expect(res.body.data.bodyMjml).toBe(newBody)

      // Confirm via GET
      const getRes = await request(testServer())
        .get('/api/admin/settings/email-templates/invitation')
        .set('Authorization', `Bearer ${adminToken}`)
      expect(getRes.body.data.bodyMjml).toBe(newBody)
    })
  })

  // ===================================================
  // PATCH /:templateKey — invitation validation
  // ===================================================
  describe('PATCH /:templateKey — invitation validation', () => {
    it('rejects empty body', async () => {
      const res = await request(testServer())
        .patch('/api/admin/settings/email-templates/invitation')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
    })

    it('rejects wrong shape (system fields on invitation)', async () => {
      const res = await request(testServer())
        .patch('/api/admin/settings/email-templates/invitation')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ introText: 'x', signatureText: 'y' })

      expect(res.status).toBe(400)
    })

    it('rejects oversized bodyMjml', async () => {
      const res = await request(testServer())
        .patch('/api/admin/settings/email-templates/invitation')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ bodyMjml: 'a'.repeat(65_537) })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
    })
  })

  // ===================================================
  // PATCH /:templateKey — system happy path
  // ===================================================
  describe('PATCH /:templateKey — system happy path', () => {
    it('updates introText and signatureText, round-trips', async () => {
      const res = await request(testServer())
        .patch('/api/admin/settings/email-templates/magic_link_login')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ introText: 'Bonjour cher utilisateur', signatureText: 'À très vite' })

      expect(res.status).toBe(200)
      expect(res.body.data.introText).toBe('Bonjour cher utilisateur')
      expect(res.body.data.signatureText).toBe('À très vite')

      // Confirm via GET
      const getRes = await request(testServer())
        .get('/api/admin/settings/email-templates/magic_link_login')
        .set('Authorization', `Bearer ${adminToken}`)
      expect(getRes.body.data.introText).toBe('Bonjour cher utilisateur')
    })
  })

  // ===================================================
  // PATCH /:templateKey — system validation
  // ===================================================
  describe('PATCH /:templateKey — system validation', () => {
    it('rejects missing field', async () => {
      const res = await request(testServer())
        .patch('/api/admin/settings/email-templates/magic_link_login')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ introText: 'Hello' })

      expect(res.status).toBe(400)
    })

    it('rejects wrong shape (invitation field on system template)', async () => {
      const res = await request(testServer())
        .patch('/api/admin/settings/email-templates/magic_link_login')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ bodyMjml: '<mj-section></mj-section>' })

      expect(res.status).toBe(400)
    })
  })

  // ===================================================
  // POST /reset-all — global transactional reset (R2)
  // ===================================================
  describe('POST /reset-all', () => {
    const ENDPOINT = '/api/admin/settings/email-templates/reset-all'
    const CUSTOM_BODY =
      '<mj-section><mj-column><mj-text>CUSTOM RESET-ALL BODY</mj-text></mj-column></mj-section>'
    const UI_KEYS = [
      'invitation',
      'magic_link_login',
      'reservation_confirmation',
      'account_created',
      'cancellation_confirmation',
      'role_promoted',
      'role_demoted',
      'unregistration_confirmation',
    ]
    // shell_parts.owner_id is TEXT with no FK (migration 009), so a synthetic
    // UUID stands in for an event override without needing a real event row.
    const EVENT_OWNER_ID = '00000000-0000-0000-0000-000000000099'

    beforeEach(async () => {
      // Reset the per-admin quota so the dedicated rate-limit test stays
      // order-independent (mirror email-brand-settings.test.ts).
      adminActionLimiter.resetKey(`admin:${adminUserId}`)
      // Non-factory bodies on the 4 UI keys (must come back to default).
      await query(`UPDATE email_templates SET body_mjml = $1 WHERE template_key = ANY($2)`, [
        CUSTOM_BODY,
        UI_KEYS,
      ])
      // Shared design (header/mj-body/content-wrapper @ invitation) + per-template
      // footers — owner_kind='template' = must be wiped kind-wide.
      await shellPartsService.seedShellPart({ ownerKind: 'template', ownerId: 'invitation', partKind: 'header', contentMjml: '<mj-section><mj-column><mj-text>SEED HEADER</mj-text></mj-column></mj-section>' })
      await shellPartsService.seedShellPart({ ownerKind: 'template', ownerId: 'invitation', partKind: 'mj-body', contentMjml: '<mj-body></mj-body>' })
      await shellPartsService.seedShellPart({ ownerKind: 'template', ownerId: 'invitation', partKind: 'content-wrapper', contentMjml: '<mj-section></mj-section>' })
      await shellPartsService.seedShellPart({ ownerKind: 'template', ownerId: 'invitation', partKind: 'footer', contentMjml: '<mj-section><mj-column><mj-text>SEED FOOTER A</mj-text></mj-column></mj-section>' })
      await shellPartsService.seedShellPart({ ownerKind: 'template', ownerId: 'reservation_confirmation', partKind: 'footer', contentMjml: '<mj-section><mj-column><mj-text>SEED FOOTER B</mj-text></mj-column></mj-section>' })
      // Event override (owner_kind='event') — must be preserved.
      await shellPartsService.seedShellPart({ ownerKind: 'event', ownerId: EVENT_OWNER_ID, partKind: 'header', contentMjml: '<mj-section><mj-column><mj-text>EVENT HEADER</mj-text></mj-column></mj-section>' })
      // Brand shell row (owner_kind='brand') — must be preserved. Distinct
      // part_kind from the migration-012 content-wrapper@brand so this suite
      // owns/cleans it without mutating the migration row.
      await shellPartsService.seedShellPart({ ownerKind: 'brand', ownerId: '1', partKind: 'header', contentMjml: '<mj-section><mj-column><mj-text>BRAND HEADER</mj-text></mj-column></mj-section>' })
      // Non-factory brand setting — must be preserved.
      await query("UPDATE email_brand_settings SET primary_color = '#abcdef' WHERE id = 1")
    })

    afterEach(async () => {
      // The outer afterEach restores the 4 UI bodies; clean what THIS suite
      // seeded (template rows survive only if a test mocked the DELETE).
      await query("DELETE FROM shell_parts WHERE owner_kind = 'event' AND owner_id = $1", [EVENT_OWNER_ID])
      await query("DELETE FROM shell_parts WHERE owner_kind = 'brand' AND part_kind = 'header'")
      await query("DELETE FROM shell_parts WHERE owner_kind = 'template'")
      await query("UPDATE email_templates SET body_mjml = default_body_mjml WHERE template_key = 'cancellation_confirmation'")
      await query("UPDATE email_brand_settings SET primary_color = '#18181b' WHERE id = 1")
    })

    it('resets the 8 UI bodies to factory (data.templatesReset === 8)', async () => {
      const res = await request(testServer()).post(ENDPOINT).set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data.templatesReset).toBe(8)

      const { rows } = await query<{ body_mjml: string; default_body_mjml: string }>(
        `SELECT body_mjml, default_body_mjml FROM email_templates WHERE template_key = ANY($1)`,
        [UI_KEYS],
      )
      expect(rows).toHaveLength(8)
      for (const row of rows) {
        expect(row.body_mjml).toBe(row.default_body_mjml)
      }
    })

    it('restores the factory common-shell card @ template[invitation] and deletes other template rows', async () => {
      const res = await request(testServer()).post(ENDPOINT).set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      // Only the 2 per-template footers are deleted; the 3 common-shell card
      // rows are RESTORED to their migration-018 factory value (upsert), not
      // counted as deletions (régression 2026-06-08 : un DELETE faisait
      // retomber la cascade sur le header noir hardcodé).
      expect(res.body.data.shellPartsDeleted).toBe(2)

      const { rows } = await query<{ part_kind: string; content_mjml: string }>(
        `SELECT part_kind, content_mjml FROM shell_parts
           WHERE owner_kind = 'template' AND owner_id = 'invitation'
           ORDER BY part_kind`,
      )
      expect(rows).toHaveLength(3)
      const byKind = Object.fromEntries(rows.map((r) => [r.part_kind, r.content_mjml]))
      expect(byKind['header']).toBe(shellPartsService.INVITATION_FACTORY_HEADER_MJML)
      expect(byKind['content-wrapper']).toBe(shellPartsService.INVITATION_FACTORY_CONTENT_WRAPPER_MJML)
      expect(byKind['mj-body']).toBe(shellPartsService.INVITATION_FACTORY_MJBODY_MJML)

      // No footer / other-key template rows survive.
      const others = await query<{ n: number }>(
        `SELECT count(*)::int AS n FROM shell_parts
           WHERE owner_kind = 'template'
             AND NOT (owner_id = 'invitation' AND part_kind IN ('header', 'content-wrapper', 'mj-body'))`,
      )
      expect(others.rows[0].n).toBe(0)
    })

    it('preserves brand settings AND owner_kind=brand shell parts', async () => {
      const before = await query<{ n: number }>(
        "SELECT count(*)::int AS n FROM shell_parts WHERE owner_kind = 'brand'",
      )

      const res = await request(testServer()).post(ENDPOINT).set('Authorization', `Bearer ${adminToken}`)
      expect(res.status).toBe(200)

      const after = await query<{ n: number }>(
        "SELECT count(*)::int AS n FROM shell_parts WHERE owner_kind = 'brand'",
      )
      expect(after.rows[0].n).toBe(before.rows[0].n)
      expect(after.rows[0].n).toBeGreaterThanOrEqual(1)

      const brand = await query<{ primary_color: string }>(
        'SELECT primary_color FROM email_brand_settings WHERE id = 1',
      )
      expect(brand.rows[0].primary_color).toBe('#abcdef')
    })

    it('preserves owner_kind=event shell parts', async () => {
      const res = await request(testServer()).post(ENDPOINT).set('Authorization', `Bearer ${adminToken}`)
      expect(res.status).toBe(200)

      const { rows } = await query<{ n: number }>(
        "SELECT count(*)::int AS n FROM shell_parts WHERE owner_kind = 'event' AND owner_id = $1",
        [EVENT_OWNER_ID],
      )
      expect(rows[0].n).toBe(1)
    })


    it('is idempotent: second consecutive call is a no-op', async () => {
      const r1 = await request(testServer()).post(ENDPOINT).set('Authorization', `Bearer ${adminToken}`)
      expect(r1.status).toBe(200)

      const r2 = await request(testServer()).post(ENDPOINT).set('Authorization', `Bearer ${adminToken}`)
      expect(r2.status).toBe(200)
      expect(r2.body.data.templatesReset).toBe(8)
      expect(r2.body.data.shellPartsDeleted).toBe(0)

      const { rows } = await query<{ body_mjml: string; default_body_mjml: string }>(
        `SELECT body_mjml, default_body_mjml FROM email_templates WHERE template_key = ANY($1)`,
        [UI_KEYS],
      )
      for (const row of rows) {
        expect(row.body_mjml).toBe(row.default_body_mjml)
      }
    })

    it('rolls back atomically: if the shell reset throws, bodies are NOT reset (500)', async () => {
      const shellSpy = jest
        .spyOn(shellPartsService, 'resetSharedShellToFactory')
        .mockRejectedValueOnce(new Error('boom: forced rollback'))
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

      const res = await request(testServer()).post(ENDPOINT).set('Authorization', `Bearer ${adminToken}`)
      expect(res.status).toBe(500)

      // The UPDATE on the 4 bodies must have rolled back: bodies still custom.
      const { rows } = await query<{ body_mjml: string }>(
        `SELECT body_mjml FROM email_templates WHERE template_key = ANY($1)`,
        [UI_KEYS],
      )
      for (const row of rows) {
        expect(row.body_mjml).toBe(CUSTOM_BODY)
      }

      shellSpy.mockRestore()
      errorSpy.mockRestore()
    })

    it('returns 401 without Authorization', async () => {
      const res = await request(testServer()).post(ENDPOINT)
      expect(res.status).toBe(401)
    })

    it('rate limits: the 11th call within the window returns 429 RATE_LIMITED', async () => {
      const responses = []
      for (let i = 0; i < 11; i++) {
        // eslint-disable-next-line no-await-in-loop
        const r = await request(testServer()).post(ENDPOINT).set('Authorization', `Bearer ${adminToken}`)
        responses.push(r)
      }
      const last = responses[10]
      expect(last.status).toBe(429)
      expect(last.body?.error?.code).toBe('RATE_LIMITED')
    })
  })

  // ===================================================
  // Auth
  // ===================================================
  describe('Auth', () => {
    it('GET returns 401 without token', async () => {
      const res = await request(testServer())
        .get('/api/admin/settings/email-templates/invitation')

      expect(res.status).toBe(401)
    })

    it('PATCH returns 403 for non-admin', async () => {
      const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`
      const userResult = await query(
        `INSERT INTO users (email, first_name, role) VALUES ($1, $2, $3) RETURNING id`,
        [`test-tpl-user-${uniqueSuffix}@example.com`, 'Test User', 'user'],
      )
      const userToken = jwt.sign(
        { userId: userResult.rows[0].id, role: 'user' },
        JWT_SECRET,
        { expiresIn: '1h' },
      )

      const res = await request(testServer())
        .patch('/api/admin/settings/email-templates/invitation')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ bodyMjml: 'test' })

      expect(res.status).toBe(403)
    })
  })
})
