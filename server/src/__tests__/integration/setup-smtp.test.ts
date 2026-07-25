import request from 'supertest'
import nodemailer from 'nodemailer'
import { query } from '../../db'
import * as settingsDb from '../../db/settings.db'
import { testServer } from '../helpers/test-server'

// Mock settings.db — fonctions SMTP
jest.mock('../../db/settings.db')

// Mock nodemailer — factory sans dépendances externes
jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}))

const mockVerify = jest.fn()
const mockSendMail = jest.fn()
const mockClose = jest.fn()

/**
 * Tests d'intégration pour les endpoints SMTP setup-gated
 * GET/PUT/POST /api/setup/smtp — publics mais protégés par checkSetupNotDone
 */
describe('Setup SMTP API', () => {
  beforeEach(async () => {
    jest.clearAllMocks()

    // Pas d'admin → checkSetupNotDone laisse passer
    await query("DELETE FROM users WHERE role = 'admin'")

    // Transport nodemailer par défaut
    ;(nodemailer.createTransport as jest.Mock).mockReturnValue({
      verify: mockVerify,
      sendMail: mockSendMail,
      close: mockClose,
    })
  })

  afterAll(async () => {
    // Nettoyage au cas où un test aurait laissé un admin
    await query("DELETE FROM users WHERE email LIKE '%test-setup-smtp%'")
  })

  // ===================================================
  // GET /api/setup/smtp
  // ===================================================
  describe('GET /api/setup/smtp', () => {
    it('retourne 200 avec le mot de passe masqué quand un mot de passe existe', async () => {
      ;(settingsDb.getSmtpSettings as jest.Mock).mockResolvedValue({
        smtpHost: 'mail.example.com',
        smtpPort: '465',
        smtpSecure: true,
        smtpUser: 'user@example.com',
        smtpPassword: 'secret',
        smtpFromName: 'TimePick',
        smtpFromEmail: 'noreply@example.com',
      })

      const res = await request(testServer()).get('/api/setup/smtp')

      expect(res.status).toBe(200)
      expect(res.body.data.smtpPassword).toBe('****')
      expect(res.body.data.smtpHost).toBe('mail.example.com')
    })

    it("retourne '' pour smtpPassword quand aucun mot de passe en DB", async () => {
      ;(settingsDb.getSmtpSettings as jest.Mock).mockResolvedValue({
        smtpHost: '',
        smtpPort: '',
        smtpSecure: false,
        smtpUser: '',
        smtpPassword: '',
        smtpFromName: 'TimePick',
        smtpFromEmail: '',
      })

      const res = await request(testServer()).get('/api/setup/smtp')

      expect(res.status).toBe(200)
      expect(res.body.data.smtpPassword).toBe('')
    })

    it('retourne 404 quand un admin existe déjà (checkSetupNotDone)', async () => {
      await query(
        "INSERT INTO users (email, first_name, role) VALUES ($1, $2, 'admin')",
        ['test-setup-smtp-admin@example.com', 'Admin'],
      )

      try {
        const res = await request(testServer()).get('/api/setup/smtp')
        expect(res.status).toBe(404)
      } finally {
        await query("DELETE FROM users WHERE email = 'test-setup-smtp-admin@example.com'")
      }
    })
  })

  // ===================================================
  // PUT /api/setup/smtp
  // ===================================================
  describe('PUT /api/setup/smtp', () => {
    const validSettings = {
      smtpHost: 'smtp.example.com',
      smtpPort: 587,
      smtpSecure: false,
      smtpUser: 'sender@example.com',
      smtpPassword: 'my-secret',
      smtpFromName: 'TimePick',
      smtpFromEmail: 'noreply@example.com',
    }

    it('sauvegarde les paramètres SMTP et retourne 200', async () => {
      ;(settingsDb.saveSmtpSettings as jest.Mock).mockResolvedValue(undefined)

      const res = await request(testServer()).put('/api/setup/smtp').send(validSettings)

      expect(res.status).toBe(200)
      expect(res.body.data.message).toBeDefined()
      expect(settingsDb.saveSmtpSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          smtpHost: 'smtp.example.com',
          smtpPort: '587',
          smtpSecure: false,
        }),
      )
    })

    it('rejette un hôte SMTP renseigné sans email expéditeur', async () => {
      const res = await request(testServer())
        .put('/api/setup/smtp')
        .send({ ...validSettings, smtpFromEmail: '' })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
      expect(res.body.error.message).toContain('expéditeur')
    })

    it('accepte un hôte SMTP vide même sans email expéditeur (effacement)', async () => {
      ;(settingsDb.saveSmtpSettings as jest.Mock).mockResolvedValue(undefined)

      const res = await request(testServer())
        .put('/api/setup/smtp')
        .send({ smtpHost: '', smtpPort: 587, smtpSecure: false })

      expect(res.status).toBe(200)
    })
  })

  // ===================================================
  // POST /api/setup/smtp/test
  // ===================================================
  describe('POST /api/setup/smtp/test', () => {
    const validTestParams = {
      smtpHost: 'mail.example.com',
      smtpPort: 465,
      smtpSecure: true,
      smtpUser: 'admin@example.com',
      smtpPassword: 'test-password',
      smtpFromName: 'TimePick',
      smtpFromEmail: 'noreply@example.com',
      recipient: 'test@example.com',
    }

    it('retourne { success: true } quand transport.verify et sendMail réussissent', async () => {
      mockVerify.mockResolvedValue(undefined)
      mockSendMail.mockResolvedValue({ messageId: '<test@example.com>' })

      const res = await request(testServer()).post('/api/setup/smtp/test').send(validTestParams)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.message).toBe('Connexion réussie')
      expect(mockVerify).toHaveBeenCalled()
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test@example.com',
          subject: 'Test SMTP - TimePick',
        }),
      )
      expect(mockClose).toHaveBeenCalled()
    })

    it('retourne { success: false } quand verify échoue', async () => {
      mockVerify.mockRejectedValue(new Error('Connection refused'))

      const res = await request(testServer()).post('/api/setup/smtp/test').send(validTestParams)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(false)
      expect(res.body.message).toContain('Connection refused')
      expect(mockClose).toHaveBeenCalled()
    })

    it('retourne 400 VALIDATION_ERROR sans recipient', async () => {
      const { recipient: _r, ...withoutRecipient } = validTestParams

      const res = await request(testServer()).post('/api/setup/smtp/test').send(withoutRecipient)

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
    })

    it('retourne 400 VALIDATION_ERROR avec un recipient invalide', async () => {
      const res = await request(testServer())
        .post('/api/setup/smtp/test')
        .send({ ...validTestParams, recipient: 'pas-un-email' })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
    })

    it("utilise le mot de passe stocké quand smtpPassword est '****'", async () => {
      ;(settingsDb.getSmtpSettings as jest.Mock).mockResolvedValue({
        smtpHost: 'mail.example.com',
        smtpPort: '465',
        smtpSecure: true,
        smtpUser: 'admin@example.com',
        smtpPassword: 'real-stored-password',
        smtpFromName: 'TimePick',
        smtpFromEmail: 'noreply@example.com',
      })
      mockVerify.mockResolvedValue(undefined)
      mockSendMail.mockResolvedValue({ messageId: '<test@example.com>' })

      const res = await request(testServer())
        .post('/api/setup/smtp/test')
        .send({ ...validTestParams, smtpPassword: '****' })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(nodemailer.createTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          auth: expect.objectContaining({ pass: 'real-stored-password' }),
        }),
      )
    })

    it("utilise le mot de passe stocké quand smtpPassword est absent", async () => {
      ;(settingsDb.getSmtpSettings as jest.Mock).mockResolvedValue({
        smtpHost: 'mail.example.com',
        smtpPort: '465',
        smtpSecure: true,
        smtpUser: 'admin@example.com',
        smtpPassword: 'env-seeded-password',
        smtpFromName: 'TimePick',
        smtpFromEmail: 'noreply@example.com',
      })
      mockVerify.mockResolvedValue(undefined)
      mockSendMail.mockResolvedValue({ messageId: '<test@example.com>' })

      const { smtpPassword: _pw, ...withoutPassword } = validTestParams
      const res = await request(testServer())
        .post('/api/setup/smtp/test')
        .send(withoutPassword)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(nodemailer.createTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          auth: expect.objectContaining({ pass: 'env-seeded-password' }),
        }),
      )
    })

    it('retourne 400 SMTP_HOST_BLOCKED en production avec une IP loopback', async () => {
      const originalEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'production'
      try {
        const res = await request(testServer())
          .post('/api/setup/smtp/test')
          .send({ ...validTestParams, smtpHost: '127.0.0.1' })

        expect(res.status).toBe(400)
        expect(res.body.error.code).toBe('SMTP_HOST_BLOCKED')
      } finally {
        process.env.NODE_ENV = originalEnv
      }
    })

    it('autorise une IP privée en développement (Mailpit)', async () => {
      mockVerify.mockResolvedValue(undefined)
      mockSendMail.mockResolvedValue({ messageId: '<test@example.com>' })

      const res = await request(testServer())
        .post('/api/setup/smtp/test')
        .send({ ...validTestParams, smtpHost: '127.0.0.1' })

      // NODE_ENV n'est pas 'production' ici → pas bloqué
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    })
  })
})
