// Mock isomorphic-dompurify to avoid @exodus/bytes ESM trap.
// Auto-mock at server/src/__mocks__/isomorphic-dompurify.ts (Story 23.1, A4).
// Our controller path never touches DOMPurify — the mock is only needed because importing
// app.ts pulls in email.service.ts → render-email.service.ts → mjml-compile.service.ts → isomorphic-dompurify (post-Story 25-1 wiring).
jest.mock('isomorphic-dompurify')

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { query } from '../../db'
import { testServer } from '../helpers/test-server'
import { adminActionLimiter } from '../../middleware/adminActionLimiter'
import * as emailUploadService from '../../services/email-upload.service'

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret'

describe('Email Brand Settings API', () => {
  let adminToken: string
  let adminUserId: string

  async function createTestAdmin() {
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`
    const userResult = await query(
      `INSERT INTO users (email, first_name, role)
       VALUES ($1, $2, $3)
       RETURNING id, email, first_name, role`,
      [`test-brand-admin-${uniqueSuffix}@example.com`, 'Test Admin', 'admin']
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
      `UPDATE email_brand_settings SET logo_url=NULL, primary_color='#18181b', button_text_color='#ffffff', font_family='Inter, Arial, sans-serif', button_border_radius=4 WHERE id=1`
    )
  })

  afterAll(async () => {
    await query("DELETE FROM users WHERE email LIKE 'test-brand-admin-%' OR email LIKE 'test-brand-user-%'")
  })

  // ===================================================
  // GET /api/admin/settings/email-brand
  // ===================================================
  describe('GET /email-brand', () => {
    it('retourne les valeurs par défaut après le seed de la migration 006', async () => {
      const res = await request(testServer())
        .get('/api/admin/settings/email-brand')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data).toBeDefined()
      expect(res.body.data.primaryColor).toBe('#18181b')
      expect(res.body.data.buttonTextColor).toBe('#ffffff')
      expect(res.body.data.fontFamily).toBe('Inter, Arial, sans-serif')
      expect(res.body.data.buttonBorderRadius).toBe(4)
      expect(res.body.data.logoUrl).toBeNull()
      expect(res.body.data.updatedAt).toBeDefined()
      // id and createdAt are NOT exposed
      expect(res.body.data.id).toBeUndefined()
      expect(res.body.data.createdAt).toBeUndefined()
    })
  })

  // ===================================================
  // PATCH /email-brand — happy path
  // ===================================================
  describe('PATCH /email-brand — happy path', () => {
    it('met à jour un seul champ et fusionne avec les valeurs existantes', async () => {
      const res = await request(testServer())
        .patch('/api/admin/settings/email-brand')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ primaryColor: '#ff00ff' })

      expect(res.status).toBe(200)
      expect(res.body.data.primaryColor).toBe('#ff00ff')
      expect(res.body.data.fontFamily).toBe('Inter, Arial, sans-serif')
      expect(res.body.data.buttonBorderRadius).toBe(4)
      expect(res.body.data.logoUrl).toBeNull()
      expect(res.body.data.updatedAt).toBeDefined()
    })

    it('persiste tous les cinq champs — re-fetch via GET confirme', async () => {
      const patch = {
        logoUrl: 'https://example.com/logo.png',
        primaryColor: '#ff0000',
        buttonTextColor: '#0a0a0a',
        fontFamily: 'Georgia, serif',
        buttonBorderRadius: 16,
      }

      const patchRes = await request(testServer())
        .patch('/api/admin/settings/email-brand')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(patch)

      expect(patchRes.status).toBe(200)

      const getRes = await request(testServer())
        .get('/api/admin/settings/email-brand')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(getRes.status).toBe(200)
      expect(getRes.body.data.logoUrl).toBe('https://example.com/logo.png')
      expect(getRes.body.data.primaryColor).toBe('#ff0000')
      expect(getRes.body.data.buttonTextColor).toBe('#0a0a0a')
      expect(getRes.body.data.fontFamily).toBe('Georgia, serif')
      expect(getRes.body.data.buttonBorderRadius).toBe(16)
    })

    it('permet de remettre logoUrl à null (effacement explicite)', async () => {
      await request(testServer())
        .patch('/api/admin/settings/email-brand')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ logoUrl: 'https://example.com/logo.png' })

      const res = await request(testServer())
        .patch('/api/admin/settings/email-brand')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ logoUrl: null })

      expect(res.status).toBe(200)
      expect(res.body.data.logoUrl).toBeNull()
    })
  })

  // ===================================================
  // PATCH /email-brand — validation
  // ===================================================
  describe('PATCH /email-brand — validation', () => {
    it('rejette un body vide avec erreur de validation', async () => {
      const res = await request(testServer())
        .patch('/api/admin/settings/email-brand')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
      expect(res.body.error.message).toContain('Au moins un champ')
    })

    it('rejette un hex invalide pour primaryColor', async () => {
      const res = await request(testServer())
        .patch('/api/admin/settings/email-brand')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ primaryColor: '#zzzzzz' })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
      expect(res.body.error.message).toContain('hexadécimal')
    })

    it('rejette un hex invalide pour buttonTextColor', async () => {
      const res = await request(testServer())
        .patch('/api/admin/settings/email-brand')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ buttonTextColor: '#zzzzzz' })
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
      expect(res.body.error.message).toContain('hexadécimal')
    })

    it('rejette un radius négatif', async () => {
      const res = await request(testServer())
        .patch('/api/admin/settings/email-brand')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ buttonBorderRadius: -1 })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
      expect(res.body.error.message).toContain('négatif')
    })

    it('rejette un radius supérieur à 32', async () => {
      const res = await request(testServer())
        .patch('/api/admin/settings/email-brand')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ buttonBorderRadius: 33 })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
      expect(res.body.error.message).toContain('32')
    })

    it('rejette une police non supportée', async () => {
      const res = await request(testServer())
        .patch('/api/admin/settings/email-brand')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ fontFamily: 'Comic Sans MS' })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
      expect(res.body.error.message).toContain('police')
    })

    it('rejette une URL trop longue', async () => {
      const res = await request(testServer())
        .patch('/api/admin/settings/email-brand')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ logoUrl: `https://example.com/${'a'.repeat(2040)}` })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
      expect(res.body.error.message).toContain('2048')
    })

    it('rejette une clé snake_case (convention wire camelCase)', async () => {
      const res = await request(testServer())
        .patch('/api/admin/settings/email-brand')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ primary_color: '#ff0000' })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
    })
  })

  // ===================================================
  // Auth & RBAC
  // ===================================================
  describe('Auth & RBAC', () => {
    it('GET retourne 401 sans token', async () => {
      const res = await request(testServer())
        .get('/api/admin/settings/email-brand')

      expect(res.status).toBe(401)
    })

    it('GET retourne 403 pour un utilisateur non-admin', async () => {
      const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`
      const userResult = await query(
        `INSERT INTO users (email, first_name, role) VALUES ($1, $2, $3) RETURNING id`,
        [`test-brand-user-${uniqueSuffix}@example.com`, 'Test User', 'user']
      )
      const userToken = jwt.sign(
        { userId: userResult.rows[0].id, role: 'user' },
        JWT_SECRET,
        { expiresIn: '1h' }
      )

      const res = await request(testServer())
        .get('/api/admin/settings/email-brand')
        .set('Authorization', `Bearer ${userToken}`)

      expect(res.status).toBe(403)
    })

    it('PATCH retourne 401 sans token', async () => {
      const res = await request(testServer())
        .patch('/api/admin/settings/email-brand')
        .send({ primaryColor: '#ff0000' })

      expect(res.status).toBe(401)
    })

    it('PATCH retourne 403 pour un utilisateur non-admin', async () => {
      const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`
      const userResult = await query(
        `INSERT INTO users (email, first_name, role) VALUES ($1, $2, $3) RETURNING id`,
        [`test-brand-user-${uniqueSuffix}@example.com`, 'Test User', 'user']
      )
      const userToken = jwt.sign(
        { userId: userResult.rows[0].id, role: 'user' },
        JWT_SECRET,
        { expiresIn: '1h' }
      )

      const res = await request(testServer())
        .patch('/api/admin/settings/email-brand')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ primaryColor: '#ff0000' })

      expect(res.status).toBe(403)
    })
  })

  // ===================================================
  // updatedAt advancement
  // ===================================================
  describe('updatedAt advancement', () => {
    it('updatedAt avance après un PATCH réussi', async () => {
      const getBefore = await request(testServer())
        .get('/api/admin/settings/email-brand')
        .set('Authorization', `Bearer ${adminToken}`)
      const beforeUpdatedAt = new Date(getBefore.body.data.updatedAt)

      // Small delay to ensure timestamp difference
      await new Promise((r) => setTimeout(r, 50))

      const patchRes = await request(testServer())
        .patch('/api/admin/settings/email-brand')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ primaryColor: '#00ff00' })

      expect(patchRes.status).toBe(200)
      const afterUpdatedAt = new Date(patchRes.body.data.updatedAt)
      expect(afterUpdatedAt.getTime()).toBeGreaterThan(beforeUpdatedAt.getTime())
    })
  })

  // ===================================================
  // POST /api/admin/settings/email-brand/reset
  // ===================================================
  describe('POST /reset', () => {
    let tmpRoot: string
    let warnSpy: jest.SpyInstance
    let errorSpy: jest.SpyInstance
    let deleteSpy: jest.SpyInstance

    const FACTORY = {
      logoUrl: null,
      primaryColor: '#18181b',
      buttonTextColor: '#ffffff',
      fontFamily: 'Inter, Arial, sans-serif',
      buttonBorderRadius: 4,
    }

    beforeAll(() => {
      tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-uploads-'))
      process.env.UPLOADS_ROOT_OVERRIDE = tmpRoot
    })

    afterAll(() => {
      delete process.env.UPLOADS_ROOT_OVERRIDE
      fs.rmSync(tmpRoot, { recursive: true, force: true })
    })

    beforeEach(() => {
      warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
      errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
      // Spy without altering behavior — assertions below check call vs. no-call
      // depending on whether logo_url was null at reset time (AC8).
      deleteSpy = jest.spyOn(emailUploadService, 'deleteEmailImage')
      // Reset rate-limit counter for the admin user keyed by adminUserId.
      // Without this, requests accumulate across tests (windowMs=60s) and the
      // dedicated rate-limit test below becomes order-dependent.
      adminActionLimiter.resetKey(`admin:${adminUserId}`)
    })

    afterEach(() => {
      warnSpy.mockRestore()
      errorSpy.mockRestore()
      deleteSpy.mockRestore()
    })

    function writeLogoFile(rel: string, contents = 'fake-webp'): string {
      const abs = path.join(tmpRoot, rel)
      fs.mkdirSync(path.dirname(abs), { recursive: true })
      fs.writeFileSync(abs, contents)
      return abs
    }

    it('happy path sans logo : renvoie 200 + DTO factory et n\'appelle PAS deleteEmailImage (AC8)', async () => {
      const res = await request(testServer())
        .post('/api/admin/settings/email-brand/reset')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data).toMatchObject(FACTORY)
      expect(res.body.data.updatedAt).toBeDefined()
      expect(deleteSpy).not.toHaveBeenCalled()
    })

    it('happy path avec logo réel : supprime le fichier orphelin du disque', async () => {
      const rel = 'uploads/emails/2026/05/test.webp'
      const abs = writeLogoFile(rel)
      const stored = `https://test.example/${rel}`

      await query('UPDATE email_brand_settings SET logo_url = $1, primary_color = $2 WHERE id = 1', [
        stored,
        '#ff0000',
      ])

      const res = await request(testServer())
        .post('/api/admin/settings/email-brand/reset')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data.logoUrl).toBeNull()
      expect(res.body.data.primaryColor).toBe('#18181b')
      expect(fs.existsSync(abs)).toBe(false)
      expect(warnSpy).not.toHaveBeenCalled()
      expect(errorSpy).not.toHaveBeenCalled()
      expect(deleteSpy).toHaveBeenCalledTimes(1)
      expect(deleteSpy).toHaveBeenCalledWith(stored)
    })

    it('fichier déjà manquant (ENOENT) : 200 silencieux, pas de warn/error', async () => {
      const stored = 'https://test.example/uploads/emails/2026/05/already-gone.webp'
      await query('UPDATE email_brand_settings SET logo_url = $1 WHERE id = 1', [stored])

      const res = await request(testServer())
        .post('/api/admin/settings/email-brand/reset')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data.logoUrl).toBeNull()
      expect(warnSpy).not.toHaveBeenCalled()
      expect(errorSpy).not.toHaveBeenCalled()
    })

    it('path-traversal logoUrl : 200 + console.error avec préfixe Path-traversal blocked', async () => {
      const stored = 'https://test.example/uploads/emails/../../etc/passwd'
      await query('UPDATE email_brand_settings SET logo_url = $1 WHERE id = 1', [stored])

      const res = await request(testServer())
        .post('/api/admin/settings/email-brand/reset')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data.logoUrl).toBeNull()
      expect(errorSpy).toHaveBeenCalled()
      const errorCall = errorSpy.mock.calls.find((args) =>
        typeof args[0] === 'string' && args[0].includes('[EmailBrand] Path-traversal blocked'),
      )
      expect(errorCall).toBeDefined()
      expect(warnSpy).not.toHaveBeenCalled()
    })

    it('Auth : sans token → 401, DB inchangée', async () => {
      await query("UPDATE email_brand_settings SET primary_color = '#ff00ff' WHERE id = 1")
      const res = await request(testServer()).post('/api/admin/settings/email-brand/reset')
      expect(res.status).toBe(401)

      const after = await query<{ primary_color: string }>(
        'SELECT primary_color FROM email_brand_settings WHERE id = 1',
      )
      expect(after.rows[0].primary_color).toBe('#ff00ff')
    })

    it('Auth : utilisateur non-admin → 403, DB inchangée', async () => {
      await query("UPDATE email_brand_settings SET primary_color = '#abcdef' WHERE id = 1")

      const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`
      const userResult = await query<{ id: string }>(
        `INSERT INTO users (email, first_name, role) VALUES ($1, $2, $3) RETURNING id`,
        [`test-brand-user-${uniqueSuffix}@example.com`, 'Test User', 'user'],
      )
      const userToken = jwt.sign(
        { userId: userResult.rows[0].id, role: 'user' },
        JWT_SECRET,
        { expiresIn: '1h' },
      )

      const res = await request(testServer())
        .post('/api/admin/settings/email-brand/reset')
        .set('Authorization', `Bearer ${userToken}`)

      expect(res.status).toBe(403)
      const after = await query<{ primary_color: string }>(
        'SELECT primary_color FROM email_brand_settings WHERE id = 1',
      )
      expect(after.rows[0].primary_color).toBe('#abcdef')
    })

    it('Idempotent : deux POST consécutifs renvoient le même DTO factory', async () => {
      const r1 = await request(testServer())
        .post('/api/admin/settings/email-brand/reset')
        .set('Authorization', `Bearer ${adminToken}`)
      expect(r1.status).toBe(200)
      expect(r1.body.data).toMatchObject(FACTORY)

      const r2 = await request(testServer())
        .post('/api/admin/settings/email-brand/reset')
        .set('Authorization', `Bearer ${adminToken}`)
      expect(r2.status).toBe(200)
      expect(r2.body.data).toMatchObject(FACTORY)
    })

    it('Rate limit : la 11e requête en 60s renvoie 429 RATE_LIMITED', async () => {
      // Issue 11 sequential requests with the same admin token; the limiter
      // is keyed on IP, which supertest fixes to ::ffff:127.0.0.1 across
      // requests in this Express instance.
      const responses = []
      for (let i = 0; i < 11; i++) {
        // eslint-disable-next-line no-await-in-loop
        const r = await request(testServer())
          .post('/api/admin/settings/email-brand/reset')
          .set('Authorization', `Bearer ${adminToken}`)
        responses.push(r)
      }

      const last = responses[10]
      expect(last.status).toBe(429)
      expect(last.body?.error?.code).toBe('RATE_LIMITED')
    })
  })
})
