import request from 'supertest'
import { testServer } from '../helpers/test-server'
import { query } from '../../db'
import {
  initializeTestTransactions,
  startTestTransaction,
  rollbackTestTransaction,
  cleanupTestTransactions,
} from '../helpers/transaction'
import * as emailService from '../../services/email-send.service'

// POST /api/setup crée le premier admin → sendAdminMagicLinkEmail. Sans mock, un vrai email
// (magic-link admin) part vers Mailpit. On stub au niveau fichier — aucun test n'assert l'envoi.
beforeAll(() => {
  jest.spyOn(emailService, 'sendAdminMagicLinkEmail').mockResolvedValue(true)
})

afterAll(() => {
  jest.restoreAllMocks()
})

describe('Setup API - Integration Tests', () => {
  beforeAll(async () => {
    await initializeTestTransactions()
  })

  afterAll(async () => {
    await cleanupTestTransactions()
  })

  beforeEach(async () => {
    await startTestTransaction()
    // Setup tests require a clean state (no admins)
    // We use query (not testQuery) because API calls need to see the empty state
    await query("DELETE FROM users WHERE role = 'admin'")
  })

  afterEach(async () => {
    await rollbackTestTransaction()
  })

  describe('GET /api/setup/status', () => {
    /**
     * AC1.1: GET /api/setup/status returns needsSetup: true when DB empty
     */
    it('AC1.1: should return needsSetup: true when no admin exists', async () => {
      // NOTE: Setup tests require a clean state (no admins). We must delete ALL admins here.
      // This is safe because setup tests are designed to test first-run behavior.
      // Other tests use unique email patterns and cleanup their own data.
      await query("DELETE FROM users WHERE role = 'admin'");

      const response = await request(testServer())
        .get('/api/setup/status')
        .expect(200);

      expect(response.body).toEqual({ needsSetup: true });
    });

    /**
     * AC1.2: Returns needsSetup: false when admin exists
     */
    it('AC1.2: should return needsSetup: false when admin exists', async () => {
      // Use query (not testQuery) because API needs to see this data
      // API calls bypass the transaction, so we create data outside transaction
      const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`
      await query(
        "INSERT INTO users (email, first_name, role) VALUES ($1, $2, $3)",
        [`setup-status-${uniqueSuffix}@test.com`, 'Admin Test', 'admin']
      );

      const response = await request(testServer())
        .get('/api/setup/status')
        .expect(200);

      expect(response.body).toEqual({ needsSetup: false });

      // Cleanup API-created data manually (API bypasses transaction)
      await query("DELETE FROM users WHERE email = $1", [`setup-status-${uniqueSuffix}@test.com`]);
    });
  });

  describe('POST /api/setup/create-admin', () => {
    /**
     * AC2.1: POST /api/setup/create-admin envoie le lien bootstrap et retourne 202 (aucun user créé)
     */
    it('AC2.1: should send bootstrap link and return 202 without creating a user', async () => {
      const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`
      const email = `first-admin-${uniqueSuffix}@test.com`

      const spy = jest.spyOn(emailService, 'sendAdminMagicLinkEmail').mockResolvedValue(true)

      const response = await request(testServer())
        .post('/api/setup/create-admin')
        .send({ email })
        .expect(202)

      expect(response.body).toMatchObject({
        data: { message: 'Lien de connexion envoyé. Vérifiez votre boîte mail.' }
      })

      // Aucun user créé en base
      const dbResult = await query("SELECT * FROM users WHERE email = $1", [email])
      expect(dbResult.rows.length).toBe(0)

      // L'email de bootstrap a bien été appelé une fois
      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy).toHaveBeenCalledWith(email, expect.stringContaining('/login?token='), expect.any(Number), expect.any(Date), true, 'Administrateur', null)
    })

    /**
     * AC2.3: Validates email format (400 for invalid)
     */
    it('AC2.3: should return 400 for invalid email', async () => {
      const response = await request(testServer())
        .post('/api/setup/create-admin')
        .send({ email: 'invalid-email' })
        .expect(400)

      expect(response.body).toMatchObject({
        error: 'Email invalide'
      })
    })

    /**
     * AC2.2: POST /api/setup/create-admin returns 404 if admin already exists
     * Middleware checkSetupNotDone blocks route — no user created by this endpoint anyway.
     */
    it('AC2.2: should return 404 if admin already exists (middleware gate)', async () => {
      const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`
      const existingEmail = `existing-admin-${uniqueSuffix}@test.com`

      // Insérer directement un admin en base pour simuler setup déjà fait
      await query(
        "INSERT INTO users (email, first_name, role) VALUES ($1, 'Existing', 'admin')",
        [existingEmail]
      )

      const response = await request(testServer())
        .post('/api/setup/create-admin')
        .send({ email: `second-${uniqueSuffix}@test.com` })
        .expect(404)

      expect(response.body).toMatchObject({ error: 'Not Found' })

      // Cleanup
      await query("DELETE FROM users WHERE email = $1", [existingEmail])
    })

    /**
     * Test: retourne 400 pour body manquant
     */
    it('should return 400 when email is missing', async () => {
      const response = await request(testServer())
        .post('/api/setup/create-admin')
        .send({})
        .expect(400)

      expect(response.body.error).toBe('Required')
    })

    /**
     * Test: reject disposable email addresses
     */
    it('should return 400 for disposable email addresses', async () => {
      const disposableEmails = [
        'test@tempmail.com',
        'admin@guerrillamail.com',
        'user@10minutemail.com',
        'fake@mailinator.com',
      ]

      for (const email of disposableEmails) {
        const response = await request(testServer())
          .post('/api/setup/create-admin')
          .send({ email })
          .expect(400)

        expect(response.body.error).toContain('temporaire')
      }
    })

    /**
     * Test: retourne 500 si l'envoi email échoue
     */
    it('should return 500 if email sending fails', async () => {
      jest.spyOn(emailService, 'sendAdminMagicLinkEmail').mockResolvedValueOnce(false)

      const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`
      const response = await request(testServer())
        .post('/api/setup/create-admin')
        .send({ email: `fail-email-${uniqueSuffix}@test.com` })
        .expect(500)

      expect(response.body.error.code).toBe('EMAIL_SEND_FAILED')
    })
  })
})
