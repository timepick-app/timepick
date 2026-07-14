import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals'

// --- Mocks (hoisted) -------------------------------------------------------
jest.mock('../../services/email.service', () => {
  const actual = jest.requireActual('../../services/email.service') as Record<string, unknown>
  return {
    ...actual,
    getTransportStatus: jest.fn(() => ({ healthy: null })),
    checkSmtpConnection: jest.fn(() => Promise.resolve(true)),
    invalidateTransportCache: jest.fn(),
  }
})

jest.mock('../../db/settings.db', () => {
  const actual = jest.requireActual('../../db/settings.db') as Record<string, unknown>
  return {
    ...actual,
    clearSmtpSettings: jest.fn(() => Promise.resolve()),
  }
})

// --- Imports (after mocks) -------------------------------------------------
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { query } from '../../db'
import { testServer } from '../helpers/test-server'

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret'

/**
 * Tests d'intégration pour les endpoints de santé
 * - GET /health (public)
 * - GET /api/admin/health (admin)
 * - DELETE /api/admin/settings/smtp (admin)
 */
describe('Health & SMTP Deletion API', () => {
  let adminToken: string
  let adminUserId: string
  let getTransportStatusMock: jest.Mock
  let checkSmtpConnectionMock: jest.Mock

  async function createTestAdmin() {
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`
    const userResult = await query(
      `INSERT INTO users (email, first_name, role)
       VALUES ($1, $2, $3)
       RETURNING id, email, first_name, role`,
      [`test-health-admin-${uniqueSuffix}@example.com`, 'Test Health Admin', 'admin']
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

    const emailService = await import('../../services/email.service')
    getTransportStatusMock = emailService.getTransportStatus as unknown as jest.Mock
    checkSmtpConnectionMock = emailService.checkSmtpConnection as unknown as jest.Mock
  })

  afterAll(async () => {
    await query("DELETE FROM users WHERE email LIKE '%test-health-admin-%'")
  })

  beforeEach(() => {
    jest.clearAllMocks()
    // Default: transport status unknown, connection probe succeeds
    getTransportStatusMock.mockReturnValue({ healthy: null })
    checkSmtpConnectionMock.mockImplementation(() => Promise.resolve(true))
  })

  // ===================================================
  // GET /health — Public endpoint (binary SMTP status)
  // ===================================================
  describe('GET /health (public)', () => {
    it("retourne 200 avec status:'ok' quand getTransportStatus indique healthy:true", async () => {
      getTransportStatusMock.mockReturnValue({ healthy: true })

      const res = await request(testServer()).get('/health')

      expect(res.status).toBe(200)
      expect(res.body.status).toBe('ok')
      expect(res.body.services.smtp).toBe('ok')
      expect(typeof res.body.timestamp).toBe('string')
    })

    it("retourne 200 avec status:'degraded' quand getTransportStatus indique healthy:false", async () => {
      getTransportStatusMock.mockReturnValue({ healthy: false })

      const res = await request(testServer()).get('/health')

      expect(res.status).toBe(200)
      expect(res.body.status).toBe('degraded')
      expect(res.body.services.smtp).toBe('degraded')
      expect(typeof res.body.timestamp).toBe('string')
    })

    it("retourne 200 avec status:'ok' quand getTransportStatus indique healthy:null (démarrage)", async () => {
      getTransportStatusMock.mockReturnValue({ healthy: null })

      const res = await request(testServer()).get('/health')

      expect(res.status).toBe(200)
      expect(res.body.status).toBe('ok')
      expect(res.body.services.smtp).toBe('ok')
    })

    it("n'exige pas d'authentification (pas de 401 sans token)", async () => {
      const res = await request(testServer()).get('/health')

      expect(res.status).not.toBe(401)
      expect(res.status).toBe(200)
    })
  })

  // ===================================================
  // GET /api/admin/health — Detailed admin health
  // ===================================================
  describe('GET /api/admin/health (admin)', () => {
    it('retourne 401 sans header Authorization', async () => {
      const res = await request(testServer()).get('/api/admin/health')

      expect(res.status).toBe(401)
    })

    it('retourne 403 pour un utilisateur non-admin', async () => {
      const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`
      const userResult = await query(
        `INSERT INTO users (email, first_name, role) VALUES ($1, $2, $3) RETURNING id`,
        [`test-health-admin-user-${uniqueSuffix}@example.com`, 'Test User', 'user']
      )
      const userToken = jwt.sign(
        { userId: userResult.rows[0].id, role: 'user' },
        JWT_SECRET,
        { expiresIn: '1h' }
      )

      const res = await request(testServer())
        .get('/api/admin/health')
        .set('Authorization', `Bearer ${userToken}`)

      expect(res.status).toBe(403)

      await query('DELETE FROM users WHERE id = $1', [userResult.rows[0].id])
    })

    it('retourne 200 avec status détaillé quand un token admin est fourni et smtp healthy:true', async () => {
      getTransportStatusMock.mockReturnValue({ healthy: true })

      const res = await request(testServer())
        .get('/api/admin/health')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.status).toBe('ok')
      expect(typeof res.body.timestamp).toBe('string')
      expect(res.body.services).toBeDefined()
      expect(res.body.services.database).toEqual({ status: 'ok' })
      expect(res.body.services.smtp).toEqual({ status: 'ok', healthy: true })
      // Probe should NOT be called when status is already known (not null)
      expect(checkSmtpConnectionMock).not.toHaveBeenCalled()
    })

    it('appelle checkSmtpConnection quand getTransportStatus retourne healthy:null', async () => {
      getTransportStatusMock.mockReturnValue({ healthy: null })
      checkSmtpConnectionMock.mockImplementation(() => Promise.resolve(true))

      const res = await request(testServer())
        .get('/api/admin/health')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(checkSmtpConnectionMock).toHaveBeenCalledTimes(1)
      expect(res.body.services.smtp).toEqual({ status: 'ok', healthy: true })
      expect(res.body.status).toBe('ok')
    })
  })

  // ===================================================
  // DELETE /api/admin/settings/smtp — Clear SMTP config
  // ===================================================
  describe('DELETE /api/admin/settings/smtp (admin)', () => {
    it('retourne 401 sans header Authorization', async () => {
      const res = await request(testServer()).delete('/api/admin/settings/smtp')

      expect(res.status).toBe(401)
    })

    it('retourne 204 avec un token admin et appelle clearSmtpSettings', async () => {
      const settingsDb = await import('../../db/settings.db')
      const clearSmtpSettingsMock = settingsDb.clearSmtpSettings as unknown as jest.Mock

      const res = await request(testServer())
        .delete('/api/admin/settings/smtp')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(204)
      expect(clearSmtpSettingsMock).toHaveBeenCalledTimes(1)
    })
  })
})
