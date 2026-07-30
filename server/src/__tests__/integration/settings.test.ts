import request from 'supertest'
import jwt from 'jsonwebtoken'
import { query } from '../../db'
import * as settingsDb from '../../db/settings.db'
import nodemailer from 'nodemailer'
import { testServer } from '../helpers/test-server'

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret'

// Mock settings.db — hoisted
jest.mock('../../db/settings.db')

// Mock nodemailer — hoisted, factory uses no external variables
jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}))

// Mock functions — NOT hoisted, but we set them on createTransport in beforeEach
const mockVerify = jest.fn()
const mockSendMail = jest.fn()
const mockClose = jest.fn()

/**
 * Tests d'intégration pour les paramètres SMTP
 * GET/PUT /api/admin/settings/smtp + POST /api/admin/settings/smtp/test
 */
describe('SMTP Settings API', () => {
  let adminToken: string
  let adminUserId: string

  async function createTestAdmin() {
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`
    const userResult = await query(
      `INSERT INTO users (email, first_name, role)
       VALUES ($1, $2, $3)
       RETURNING id, email, first_name, role`,
      [`test-settings-admin-${uniqueSuffix}@example.com`, 'Test Admin', 'admin']
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

  afterAll(async () => {
    await query("DELETE FROM users WHERE email LIKE '%test-settings-admin-%'")
  })

  beforeEach(() => {
    jest.clearAllMocks()
    // Set default mock transport for nodemailer
    ;(nodemailer.createTransport as jest.Mock).mockReturnValue({
      verify: mockVerify,
      sendMail: mockSendMail,
      close: mockClose,
    })
  })

  // ===================================================
  // T5.1: GET returns decrypted password (AC1)
  // ===================================================
  describe('GET /api/admin/settings/smtp', () => {
    it('retourne les paramètres SMTP avec mot de passe déchiffré', async () => {
      ;(settingsDb.getSmtpSettings as jest.Mock).mockResolvedValue({
        smtpHost: 'mail.example.com',
        smtpPort: '465',
        smtpSecure: true,
        smtpUser: 'admin@example.com',
        smtpPassword: 'secret-password',
        smtpFromName: 'TimePick',
        smtpFromEmail: 'noreply@example.com',
      })

      const res = await request(testServer())
        .get('/api/admin/settings/smtp')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data).toBeDefined()
      expect(res.body.data.smtpHost).toBe('mail.example.com')
      // Password returned in clear for admin (decrypted by settings.db)
      expect(res.body.data.smtpPassword).toBe('secret-password')
    })

    it('retourne un mot de passe vide si aucun configuré', async () => {
      ;(settingsDb.getSmtpSettings as jest.Mock).mockResolvedValue({
        smtpHost: 'mail.example.com',
        smtpPort: '465',
        smtpSecure: true,
        smtpUser: '',
        smtpPassword: '',
        smtpFromName: 'TimePick',
        smtpFromEmail: '',
      })

      const res = await request(testServer())
        .get('/api/admin/settings/smtp')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data.smtpPassword).toBe('')
    })
  })

  // ===================================================
  // T5.2: PUT saves settings (AC2)
  // ===================================================
  describe('PUT /api/admin/settings/smtp', () => {
    const validSettings = {
      smtpHost: 'mail.example.com',
      smtpPort: 465,
      smtpSecure: true,
      smtpUser: 'admin@example.com',
      smtpPassword: 'new-secret',
      smtpFromName: 'TimePick',
      smtpFromEmail: 'noreply@example.com',
    }

    it('sauvegarde les paramètres SMTP', async () => {
      ;(settingsDb.saveSmtpSettings as jest.Mock).mockResolvedValue(undefined)

      const res = await request(testServer())
        .put('/api/admin/settings/smtp')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(validSettings)

      expect(res.status).toBe(200)
      expect(res.body.data.message).toBeDefined()
      expect(settingsDb.saveSmtpSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          smtpHost: 'mail.example.com',
          smtpPort: '465',  // Converted to string for DB layer
          smtpSecure: true,
          smtpPassword: 'new-secret',
        })
      )
    })
  })

  // ===================================================
  // T5.3: PUT preserves password when sentinel (AC2)
  // ===================================================
  describe('PUT /api/admin/settings/smtp — sentinelle mot de passe', () => {
    it('préserve le mot de passe quand la valeur est "****"', async () => {
      ;(settingsDb.saveSmtpSettings as jest.Mock).mockResolvedValue(undefined)

      const res = await request(testServer())
        .put('/api/admin/settings/smtp')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          smtpHost: 'mail.example.com',
          smtpPort: 465,
          smtpSecure: true,
          smtpFromEmail: 'noreply@example.com',
          smtpPassword: '****',
        })

      expect(res.status).toBe(200)
      expect(settingsDb.saveSmtpSettings).toHaveBeenCalledWith(
        expect.objectContaining({ smtpPassword: '****' })
      )
    })

    it('préserve le mot de passe quand la valeur est vide', async () => {
      ;(settingsDb.saveSmtpSettings as jest.Mock).mockResolvedValue(undefined)

      const res = await request(testServer())
        .put('/api/admin/settings/smtp')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          smtpHost: 'mail.example.com',
          smtpPort: 465,
          smtpSecure: true,
          smtpFromEmail: 'noreply@example.com',
          smtpPassword: '',
        })

      expect(res.status).toBe(200)
      expect(settingsDb.saveSmtpSettings).toHaveBeenCalledWith(
        expect.objectContaining({ smtpPassword: '' })
      )
    })
  })

  // ===================================================
  // T5.4: Validation rejects invalid input (AC4)
  // ===================================================
  describe('PUT /api/admin/settings/smtp — validation', () => {
    it('accepte un hôte SMTP vide (permet la suppression de la config)', async () => {
      ;(settingsDb.saveSmtpSettings as jest.Mock).mockResolvedValue(undefined)

      const res = await request(testServer())
        .put('/api/admin/settings/smtp')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ smtpHost: '', smtpPort: 465, smtpSecure: true })

      expect(res.status).toBe(200)
    })

    it('rejette un port SMTP invalide (négatif)', async () => {
      const res = await request(testServer())
        .put('/api/admin/settings/smtp')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ smtpHost: 'mail.example.com', smtpPort: -1, smtpSecure: true })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
    })

    it('rejette un port SMTP invalide (> 65535)', async () => {
      const res = await request(testServer())
        .put('/api/admin/settings/smtp')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ smtpHost: 'mail.example.com', smtpPort: 70000, smtpSecure: true })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
    })

    it('rejette smtpSecure non booléen', async () => {
      const res = await request(testServer())
        .put('/api/admin/settings/smtp')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ smtpHost: 'mail.example.com', smtpPort: 465, smtpSecure: 'yes' })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
    })

    it('rejette un email from invalide', async () => {
      const res = await request(testServer())
        .put('/api/admin/settings/smtp')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          smtpHost: 'mail.example.com',
          smtpPort: 465,
          smtpSecure: true,
          smtpFromEmail: 'not-an-email',
        })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
    })

    it("rejette un hôte SMTP renseigné sans email expéditeur (smtpFromEmail requis dès qu'un serveur est configuré)", async () => {
      const res = await request(testServer())
        .put('/api/admin/settings/smtp')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ smtpHost: 'mail.example.com', smtpPort: 465, smtpSecure: true, smtpFromEmail: '' })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
      expect(res.body.error.message).toContain('expéditeur')
    })
  })

  // ===================================================
  // T5.5: 403 for non-admin users (AC5)
  // ===================================================
  describe('Protection des routes (AC5)', () => {
    it('GET retourne 401 sans token', async () => {
      const res = await request(testServer())
        .get('/api/admin/settings/smtp')

      expect(res.status).toBe(401)
    })

    it('PUT retourne 401 sans token', async () => {
      const res = await request(testServer())
        .put('/api/admin/settings/smtp')
        .send({ smtpHost: 'test', smtpPort: 465, smtpSecure: true })

      expect(res.status).toBe(401)
    })

    it('POST /test retourne 401 sans token', async () => {
      const res = await request(testServer())
        .post('/api/admin/settings/smtp/test')
        .send({ smtpHost: 'test', smtpPort: 465, smtpSecure: true })

      expect(res.status).toBe(401)
    })

    it('GET retourne 403 pour un utilisateur non-admin', async () => {
      const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`
      const userResult = await query(
        `INSERT INTO users (email, first_name, role) VALUES ($1, $2, $3) RETURNING id`,
        [`test-settings-user-${uniqueSuffix}@example.com`, 'Test User', 'user']
      )
      const userToken = jwt.sign(
        { userId: userResult.rows[0].id, role: 'user' },
        JWT_SECRET,
        { expiresIn: '1h' }
      )

      const res = await request(testServer())
        .get('/api/admin/settings/smtp')
        .set('Authorization', `Bearer ${userToken}`)

      expect(res.status).toBe(403)

      await query('DELETE FROM users WHERE id = $1', [userResult.rows[0].id])
    })
  })

  // ===================================================
  // T5.6: SMTP connection test (mock nodemailer) (AC3)
  // ===================================================
  describe('POST /api/admin/settings/smtp/test', () => {
    const validTestParams = {
      smtpHost: 'mail.example.com',
      smtpPort: 465,
      smtpSecure: true,
      smtpUser: 'admin@example.com',
      smtpPassword: 'test-password',
      smtpFromName: 'TimePick',
      smtpFromEmail: 'noreply@example.com',
    }

    it('teste la connexion SMTP avec succès', async () => {
      mockVerify.mockResolvedValue(undefined)
      mockSendMail.mockResolvedValue({ messageId: '<test@example.com>' })

      const res = await request(testServer())
        .post('/api/admin/settings/smtp/test')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(validTestParams)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.message).toBe('Connexion réussie')
      expect(mockVerify).toHaveBeenCalled()
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: expect.any(String),
          subject: 'Test SMTP - TimePick',
        })
      )
      expect(mockClose).toHaveBeenCalled()
      // Verify transport was created with correct parameters (L2 fix)
      expect(nodemailer.createTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'mail.example.com',
          port: 465,
          secure: true,
          auth: expect.objectContaining({
            user: 'admin@example.com',
            pass: 'test-password',
          }),
        })
      )
    })

    it('retourne une erreur quand la connexion échoue', async () => {
      mockVerify.mockRejectedValue(Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:1026'), { code: 'ECONNREFUSED' }))

      const res = await request(testServer())
        .post('/api/admin/settings/smtp/test')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(validTestParams)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(false)
      expect(res.body.message).toContain('Connexion refusée')
      expect(res.body.message).toContain('ECONNREFUSED')
      expect(mockClose).toHaveBeenCalled()
    })

    it("retourne une erreur quand l'envoi échoue", async () => {
      mockVerify.mockResolvedValue(undefined)
      mockSendMail.mockRejectedValue(Object.assign(new Error('Invalid login: 535 Authentication failed'), { code: 'EAUTH' }))

      const res = await request(testServer())
        .post('/api/admin/settings/smtp/test')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(validTestParams)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(false)
      expect(res.body.message).toContain('Authentification refusée')
      expect(res.body.message).toContain('EAUTH')
      expect(mockClose).toHaveBeenCalled()
    })

    it('rejette des paramètres invalides', async () => {
      const res = await request(testServer())
        .post('/api/admin/settings/smtp/test')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ smtpHost: '', smtpPort: 465, smtpSecure: true })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
    })

    it('rejette le mot de passe sentinelle "****"', async () => {
      const res = await request(testServer())
        .post('/api/admin/settings/smtp/test')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          smtpHost: 'mail.example.com',
          smtpPort: 465,
          smtpSecure: true,
          smtpUser: 'admin@example.com',
          smtpPassword: '****',
        })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
      expect(res.body.error.message).toContain('mot de passe masqué')
    })

    it('fonctionne sans authentification SMTP', async () => {
      mockVerify.mockResolvedValue(undefined)
      mockSendMail.mockResolvedValue({ messageId: '<test@example.com>' })

      const res = await request(testServer())
        .post('/api/admin/settings/smtp/test')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          smtpHost: 'open-relay.example.com',
          smtpPort: 25,
          smtpSecure: false,
        })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    })
  })
})
