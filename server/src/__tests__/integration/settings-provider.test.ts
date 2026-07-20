import request from 'supertest'
import jwt from 'jsonwebtoken'
import { query } from '../../db'
import * as settingsDb from '../../db/settings.db'
import * as emailProviderDb from '../../db/email-provider.db'
import * as emailService from '../../services/email.service'
import { testServer } from '../helpers/test-server'

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret'

// Mocks fermés — settings.db et email-provider.db entièrement remplacés
// (miroir de settings.test.ts, qui mocke déjà settings.db pour cette suite-juge).
jest.mock('../../db/settings.db')
jest.mock('../../db/email-provider.db')
// email.service est le barrel consommé PAR settings.controller.ts MAIS AUSSI par
// app.ts (getTransportStatus/checkSmtpConnection pour /health). Automock complet
// casserait le graphe d'imports d'app.ts — on garde donc les exports réels et on
// ne remplace QUE les 3 fonctions dont ce contrôleur dépend (miroir health.test.ts).
jest.mock('../../services/email.service', () => {
  const actual = jest.requireActual('../../services/email.service') as Record<string, unknown>
  return {
    ...actual,
    invalidateTransportCache: jest.fn(),
    sendBrandedSmtpTest: jest.fn(),
    sendBrandedProviderTest: jest.fn(),
  }
})

/**
 * Tests d'intégration Chantier C — dispatch provider (`body.provider`) des
 * routes admin SMTP existantes : GET expose emailProvider/emailApiKey masqués,
 * PUT/POST dispatchent par provider, DELETE réinitialise aussi le provider.
 * Ne duplique PAS les cas déjà couverts par settings.test.ts (chemin smtp
 * historique, validation, protection des routes).
 */
describe('SMTP Settings API — dispatch provider (Chantier C)', () => {
  let adminToken: string
  let adminEmail: string

  async function createTestAdmin() {
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`
    const email = `test-settings-provider-admin-${uniqueSuffix}@example.com`
    const userResult = await query(
      `INSERT INTO users (email, first_name, role) VALUES ($1, $2, $3) RETURNING id, email`,
      [email, 'Test Admin Provider', 'admin'],
    )
    return userResult.rows[0]
  }

  function generateAdminToken(userId: string): string {
    return jwt.sign({ userId, role: 'admin' }, JWT_SECRET, { expiresIn: '1h' })
  }

  beforeAll(async () => {
    const admin = await createTestAdmin()
    adminEmail = admin.email
    adminToken = generateAdminToken(admin.id)
  })

  afterAll(async () => {
    await query("DELETE FROM users WHERE email LIKE '%test-settings-provider-admin-%'")
  })

  beforeEach(() => {
    jest.clearAllMocks()
    ;(settingsDb.getSmtpSettings as jest.Mock).mockResolvedValue({
      smtpHost: '',
      smtpPort: '',
      smtpSecure: false,
      smtpUser: '',
      smtpPassword: '',
      smtpFromName: 'TimePick',
      smtpFromEmail: '',
    })
    ;(settingsDb.saveSmtpSettings as jest.Mock).mockResolvedValue(undefined)
    ;(settingsDb.clearSmtpSettings as jest.Mock).mockResolvedValue(undefined)
    ;(emailProviderDb.getEmailProviderConfig as jest.Mock).mockResolvedValue({ provider: 'smtp', apiKey: '' })
    ;(emailProviderDb.saveEmailProviderConfig as jest.Mock).mockResolvedValue(undefined)
    ;(emailProviderDb.clearEmailProviderConfig as jest.Mock).mockResolvedValue(undefined)
  })

  // ===================================================
  // GET — expose emailProvider + emailApiKey masqué
  // ===================================================
  describe('GET /api/admin/settings/smtp', () => {
    it('expose emailProvider + emailApiKey="****" quand une clé est stockée', async () => {
      ;(emailProviderDb.getEmailProviderConfig as jest.Mock).mockResolvedValue({ provider: 'resend', apiKey: 're_stored_key' })

      const res = await request(testServer())
        .get('/api/admin/settings/smtp')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data.emailProvider).toBe('resend')
      expect(res.body.data.emailApiKey).toBe('****')
      // La clé réelle ne fuite JAMAIS dans la réponse.
      expect(JSON.stringify(res.body)).not.toContain('re_stored_key')
    })

    it("expose emailApiKey='' quand aucune clé n'est stockée (provider smtp par défaut)", async () => {
      ;(emailProviderDb.getEmailProviderConfig as jest.Mock).mockResolvedValue({ provider: 'smtp', apiKey: '' })

      const res = await request(testServer())
        .get('/api/admin/settings/smtp')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data.emailProvider).toBe('smtp')
      expect(res.body.data.emailApiKey).toBe('')
    })
  })

  // ===================================================
  // PUT — dispatch par body.provider
  // ===================================================
  describe('PUT /api/admin/settings/smtp — dispatch provider', () => {
    it("provider:'resend' → saveEmailProviderConfig + saveSmtpSettings (from fields fournis uniquement)", async () => {
      const res = await request(testServer())
        .put('/api/admin/settings/smtp')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ provider: 'resend', emailApiKey: 're_new_key', smtpFromName: 'MonApp', smtpFromEmail: 'from@example.com' })

      expect(res.status).toBe(200)
      expect(emailProviderDb.saveEmailProviderConfig).toHaveBeenCalledWith({ provider: 'resend', apiKey: 're_new_key' })
      expect(settingsDb.saveSmtpSettings).toHaveBeenCalledWith({ smtpFromName: 'MonApp', smtpFromEmail: 'from@example.com' })
      expect(emailService.invalidateTransportCache).toHaveBeenCalledTimes(1)
    })

    it("provider:'resend' sans champs from → saveSmtpSettings n'est PAS appelé", async () => {
      const res = await request(testServer())
        .put('/api/admin/settings/smtp')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ provider: 'resend', emailApiKey: 're_key' })

      expect(res.status).toBe(200)
      expect(emailProviderDb.saveEmailProviderConfig).toHaveBeenCalledWith({ provider: 'resend', apiKey: 're_key' })
      expect(settingsDb.saveSmtpSettings).not.toHaveBeenCalled()
    })

    it("provider:'resend' avec emailApiKey='****' (sentinelle) → préservée telle quelle vers saveEmailProviderConfig", async () => {
      const res = await request(testServer())
        .put('/api/admin/settings/smtp')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ provider: 'resend', emailApiKey: '****' })

      expect(res.status).toBe(200)
      expect(emailProviderDb.saveEmailProviderConfig).toHaveBeenCalledWith({ provider: 'resend', apiKey: '****' })
    })

    it("provider:'brevo' → 400 VALIDATION_ERROR (rejeté par le validateur, jamais enregistrable)", async () => {
      const res = await request(testServer())
        .put('/api/admin/settings/smtp')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ provider: 'brevo', emailApiKey: 'xkeysib-x' })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
      expect(emailProviderDb.saveEmailProviderConfig).not.toHaveBeenCalled()
    })

    it("body sans provider (chemin historique) → saveEmailProviderConfig({provider:'smtp'}) rend la bascule resend→smtp effective", async () => {
      const res = await request(testServer())
        .put('/api/admin/settings/smtp')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ smtpHost: 'mail.example.com', smtpPort: 465, smtpSecure: true })

      expect(res.status).toBe(200)
      expect(settingsDb.saveSmtpSettings).toHaveBeenCalledWith(
        expect.objectContaining({ smtpHost: 'mail.example.com', smtpPort: '465', smtpSecure: true }),
      )
      expect(emailProviderDb.saveEmailProviderConfig).toHaveBeenCalledWith({ provider: 'smtp' })
    })

    it("body provider:'smtp' explicite → même chemin historique + bascule provider", async () => {
      const res = await request(testServer())
        .put('/api/admin/settings/smtp')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ provider: 'smtp', smtpHost: 'mail.example.com', smtpPort: 465, smtpSecure: true })

      expect(res.status).toBe(200)
      expect(emailProviderDb.saveEmailProviderConfig).toHaveBeenCalledWith({ provider: 'smtp' })
    })
  })

  // ===================================================
  // POST /test — dispatch par body.provider
  // ===================================================
  describe('POST /api/admin/settings/smtp/test — dispatch provider', () => {
    it("provider:'resend' avec clé fournie → sendBrandedProviderTest appelé avec la clé du body (pas de résolution DB)", async () => {
      ;(emailService.sendBrandedProviderTest as jest.Mock).mockResolvedValue({ success: true, message: 'Connexion réussie' })

      const res = await request(testServer())
        .post('/api/admin/settings/smtp/test')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ provider: 'resend', emailApiKey: 're_given_key' })

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ success: true, message: 'Connexion réussie' })
      expect(emailProviderDb.getEmailProviderConfig).not.toHaveBeenCalled()
      expect(emailService.sendBrandedProviderTest).toHaveBeenCalledWith(
        { provider: 'resend', apiKey: 're_given_key', fromName: undefined, fromEmail: undefined },
        adminEmail,
      )
    })

    it("provider:'resend' avec sentinelle '****' → résout la clé RÉELLEMENT stockée", async () => {
      ;(emailProviderDb.getEmailProviderConfig as jest.Mock).mockResolvedValue({ provider: 'resend', apiKey: 're_stored' })
      ;(emailService.sendBrandedProviderTest as jest.Mock).mockResolvedValue({ success: true, message: 'Connexion réussie' })

      const res = await request(testServer())
        .post('/api/admin/settings/smtp/test')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ provider: 'resend', emailApiKey: '****' })

      expect(res.status).toBe(200)
      expect(emailProviderDb.getEmailProviderConfig).toHaveBeenCalledTimes(1)
      expect(emailService.sendBrandedProviderTest).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: 're_stored' }),
        adminEmail,
      )
    })

    it("provider:'resend' sans clé fournie ni stockée → {success:false} explicite, transport jamais tenté", async () => {
      ;(emailProviderDb.getEmailProviderConfig as jest.Mock).mockResolvedValue({ provider: 'resend', apiKey: '' })

      const res = await request(testServer())
        .post('/api/admin/settings/smtp/test')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ provider: 'resend' })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(false)
      expect(res.body.message).toContain('Aucune clé API configurée')
      expect(emailService.sendBrandedProviderTest).not.toHaveBeenCalled()
    })

    it("provider:'brevo' → 400 VALIDATION_ERROR", async () => {
      const res = await request(testServer())
        .post('/api/admin/settings/smtp/test')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ provider: 'brevo', emailApiKey: 'k' })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
    })
  })

  // ===================================================
  // DELETE — réinitialise aussi le provider
  // ===================================================
  describe('DELETE /api/admin/settings/smtp', () => {
    it('efface aussi la config provider (clearEmailProviderConfig)', async () => {
      const res = await request(testServer())
        .delete('/api/admin/settings/smtp')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(204)
      expect(settingsDb.clearSmtpSettings).toHaveBeenCalledTimes(1)
      expect(emailProviderDb.clearEmailProviderConfig).toHaveBeenCalledTimes(1)
      expect(emailService.invalidateTransportCache).toHaveBeenCalledTimes(1)
    })
  })
})
