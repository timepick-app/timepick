// Évite le piège ESM @exodus/bytes via isomorphic-dompurify au chargement de app.ts
jest.mock('isomorphic-dompurify')

// Mock partiel du service email : seul sendTemplateTestEmail est remplacé.
jest.mock('../../services/email.service', () => {
  const actual = jest.requireActual('../../services/email.service')
  return {
    __esModule: true,
    ...actual,
    sendTemplateTestEmail: jest.fn(),
  }
})

import request from 'supertest'
import jwt from 'jsonwebtoken'
import { query } from '../../db'
import * as queryMod from '../../db/query'
import { testServer } from '../helpers/test-server'
import { testSendLimiter } from '../../middleware/adminActionLimiter'
import { sendTemplateTestEmail } from '../../services/email.service'

const mockSendTemplateTestEmail = sendTemplateTestEmail as jest.MockedFunction<
  typeof sendTemplateTestEmail
>

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret'

describe('Email test-send API', () => {
  let adminToken: string
  let adminUserId: string
  let adminEmail: string
  let testEventId: string

  beforeAll(async () => {
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`
    adminEmail = `test-tsend-admin-${uniqueSuffix}@example.com`
    const userResult = await query(
      `INSERT INTO users (email, first_name, role) VALUES ($1, $2, $3) RETURNING id`,
      [adminEmail, 'Test Admin', 'admin'],
    )
    adminUserId = userResult.rows[0].id
    adminToken = jwt.sign({ userId: adminUserId, role: 'admin' }, JWT_SECRET, {
      expiresIn: '1h',
    })

    const createRes = await request(testServer())
      .post('/api/admin/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Test test-send Event' })
    testEventId = createRes.body.data.id
  })

  afterEach(() => {
    testSendLimiter.resetKey(`admin:${adminUserId}`)
    mockSendTemplateTestEmail.mockReset()
  })

  afterAll(async () => {
    await query('DELETE FROM events WHERE id = $1', [testEventId])
    await query("DELETE FROM users WHERE email LIKE 'test-tsend-%'")
  })

  describe('POST /api/admin/settings/email-templates/:templateKey/test-send', () => {
    it('retourne 200 et appelle le sender avec templateKey + to', async () => {
      mockSendTemplateTestEmail.mockResolvedValue({ ok: true })
      const res = await request(testServer())
        .post('/api/admin/settings/email-templates/magic_link_login/test-send')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ to: 'dest@example.com' })
      expect(res.status).toBe(200)
      expect(res.body.data).toEqual({ sent: true })
      expect(mockSendTemplateTestEmail).toHaveBeenCalledWith({
        templateKey: 'magic_link_login',
        to: 'dest@example.com',
        isAdmin: false,
      })
    })

    it('retourne 400 quand to est invalide', async () => {
      const res = await request(testServer())
        .post('/api/admin/settings/email-templates/invitation/test-send')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ to: 'pas-un-email' })
      expect(res.status).toBe(400)
      expect(mockSendTemplateTestEmail).not.toHaveBeenCalled()
    })

    it('retourne 503 quand aucun transport SMTP', async () => {
      mockSendTemplateTestEmail.mockResolvedValue({ ok: false, reason: 'no_transport' })
      const res = await request(testServer())
        .post('/api/admin/settings/email-templates/invitation/test-send')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ to: 'dest@example.com' })
      expect(res.status).toBe(503)
      expect(res.body.error.code).toBe('SMTP_NOT_CONFIGURED')
    })

    it('retourne 502 quand l’envoi échoue', async () => {
      mockSendTemplateTestEmail.mockResolvedValue({ ok: false, reason: 'send_failed' })
      const res = await request(testServer())
        .post('/api/admin/settings/email-templates/invitation/test-send')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ to: 'dest@example.com' })
      expect(res.status).toBe(502)
      expect(res.body.error.code).toBe('SEND_FAILED')
    })

    it('retourne 500 quand le template est introuvable', async () => {
      mockSendTemplateTestEmail.mockResolvedValue({ ok: false, reason: 'template_not_found' })
      const res = await request(testServer())
        .post('/api/admin/settings/email-templates/invitation/test-send')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ to: 'dest@example.com' })
      expect(res.status).toBe(500)
      expect(res.body.error.code).toBe('TEMPLATE_NOT_FOUND')
    })
    it('propage isAdmin: true quand le destinataire est admin', async () => {
      mockSendTemplateTestEmail.mockResolvedValue({ ok: true })
      const res = await request(testServer())
        .post('/api/admin/settings/email-templates/magic_link_login/test-send')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ to: adminEmail })
      expect(res.status).toBe(200)
      expect(mockSendTemplateTestEmail).toHaveBeenCalledWith({
        templateKey: 'magic_link_login',
        to: adminEmail,
        isAdmin: true,
      })
    })

    it('retourne 500 quand le lookup du rôle échoue (DB indisponible)', async () => {
      mockSendTemplateTestEmail.mockResolvedValue({ ok: true })
      // Rejette UNIQUEMENT la requête de lookup rôle ; l'auth (user-exists) passe par la vraie DB.
      const realQuery = queryMod.query
      const querySpy = jest.spyOn(queryMod, 'query').mockImplementation(((text: any, params: any) =>
        typeof text === 'string' && text.includes('SELECT role FROM users WHERE LOWER(email)')
          ? Promise.reject(new Error('DB indisponible (lookup rôle)'))
          : (realQuery as any)(text, params)) as typeof queryMod.query)
      try {
        const res = await request(testServer())
          .post('/api/admin/settings/email-templates/magic_link_login/test-send')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ to: 'dest@example.com' })
        expect(res.status).toBe(500)
        // L'échec survient AVANT tout envoi : le sender ne doit jamais être appelé.
        expect(mockSendTemplateTestEmail).not.toHaveBeenCalled()
      } finally {
        querySpy.mockRestore()
      }
    })
  })

  describe('POST /api/admin/events/:id/email-template/test-send', () => {
    const UNKNOWN_EVENT_ID = '00000000-0000-0000-0000-000000000000'

    it('retourne 200 et appelle le sender avec invitation + eventId', async () => {
      mockSendTemplateTestEmail.mockResolvedValue({ ok: true })
      const res = await request(testServer())
        .post(`/api/admin/events/${testEventId}/email-template/test-send`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ to: 'dest@example.com' })
      expect(res.status).toBe(200)
      expect(res.body.data).toEqual({ sent: true })
      expect(mockSendTemplateTestEmail).toHaveBeenCalledWith({
        templateKey: 'invitation',
        eventId: testEventId,
        to: 'dest@example.com',
        eventName: 'Test test-send Event',
        eventDescription: '',
      })
    })

    it('retourne 404 pour un event inconnu (sans appeler le sender)', async () => {
      const res = await request(testServer())
        .post(`/api/admin/events/${UNKNOWN_EVENT_ID}/email-template/test-send`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ to: 'dest@example.com' })
      expect(res.status).toBe(404)
      expect(mockSendTemplateTestEmail).not.toHaveBeenCalled()
    })

    it('retourne 400 quand to est invalide', async () => {
      const res = await request(testServer())
        .post(`/api/admin/events/${testEventId}/email-template/test-send`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ to: 'invalide' })
      expect(res.status).toBe(400)
      expect(mockSendTemplateTestEmail).not.toHaveBeenCalled()
    })

    it('retourne 502 quand l’envoi échoue', async () => {
      mockSendTemplateTestEmail.mockResolvedValue({ ok: false, reason: 'send_failed' })
      const res = await request(testServer())
        .post(`/api/admin/events/${testEventId}/email-template/test-send`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ to: 'dest@example.com' })
      expect(res.status).toBe(502)
      expect(res.body.error.code).toBe('SEND_FAILED')
    })

    it('retourne 500 INVITATION_TEMPLATE_NOT_FOUND quand le template invitation manque', async () => {
      mockSendTemplateTestEmail.mockResolvedValue({ ok: false, reason: 'template_not_found' })
      const res = await request(testServer())
        .post(`/api/admin/events/${testEventId}/email-template/test-send`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ to: 'dest@example.com' })
      expect(res.status).toBe(500)
      expect(res.body.error.code).toBe('INVITATION_TEMPLATE_NOT_FOUND')
    })
  })

  describe('rate limiting (testSendLimiter, 5/min)', () => {
    it('retourne 429 RATE_LIMITED au-delà de 5 envois/minute', async () => {
      testSendLimiter.resetKey(`admin:${adminUserId}`)
      mockSendTemplateTestEmail.mockResolvedValue({ ok: true })

      const send = () =>
        request(testServer())
          .post('/api/admin/settings/email-templates/invitation/test-send')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ to: 'dest@example.com' })

      for (let i = 0; i < 5; i++) {
        const ok = await send()
        expect(ok.status).toBe(200)
      }
      const blocked = await send()
      expect(blocked.status).toBe(429)
      expect(blocked.body.error.code).toBe('RATE_LIMITED')
    })
  })
})
