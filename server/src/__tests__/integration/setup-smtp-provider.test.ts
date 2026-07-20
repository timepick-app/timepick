import request from 'supertest'
import { query } from '../../db'
import * as settingsDb from '../../db/settings.db'
import * as emailProviderDb from '../../db/email-provider.db'
import * as emailService from '../../services/email.service'
import { testServer } from '../helpers/test-server'

// Mocks fermés — settings.db et email-provider.db entièrement remplacés (miroir
// de setup-smtp.test.ts, qui mocke déjà settings.db pour cette suite-juge).
jest.mock('../../db/settings.db')
jest.mock('../../db/email-provider.db')
// email.service est aussi consommé par app.ts (getTransportStatus/checkSmtpConnection
// pour /health) : automock complet casserait ce graphe. On garde les exports réels et
// on ne remplace QUE la fonction dont ce contrôleur dépend (miroir health.test.ts).
jest.mock('../../services/email.service', () => {
  const actual = jest.requireActual('../../services/email.service') as Record<string, unknown>
  return {
    ...actual,
    sendBrandedProviderTest: jest.fn(),
  }
})

/**
 * Tests d'intégration Chantier C — dispatch provider sur les endpoints setup
 * (publics gated) : GET expose emailProvider/emailApiKey masqués, POST /test
 * dispatche par provider avec `recipient` dans le body (schéma setup dédié).
 * Ne duplique PAS les cas déjà couverts par setup-smtp.test.ts (chemin smtp
 * historique, blocklist IP, validation, checkSetupNotDone).
 */
describe('Setup SMTP API — dispatch provider (Chantier C)', () => {
  beforeEach(async () => {
    jest.clearAllMocks()
    // Pas d'admin → checkSetupNotDone laisse passer (comme setup-smtp.test.ts)
    await query("DELETE FROM users WHERE role = 'admin'")

    ;(settingsDb.getSmtpSettings as jest.Mock).mockResolvedValue({
      smtpHost: '',
      smtpPort: '',
      smtpSecure: false,
      smtpUser: '',
      smtpPassword: '',
      smtpFromName: 'TimePick',
      smtpFromEmail: '',
    })
    ;(emailProviderDb.getEmailProviderConfig as jest.Mock).mockResolvedValue({ provider: 'smtp', apiKey: '' })
  })

  afterAll(async () => {
    await query("DELETE FROM users WHERE role = 'admin'")
  })

  // ===================================================
  // GET /api/setup/smtp — expose emailProvider + emailApiKey masqué
  // ===================================================
  describe('GET /api/setup/smtp', () => {
    it('expose emailProvider + emailApiKey="****" quand une clé est stockée', async () => {
      ;(emailProviderDb.getEmailProviderConfig as jest.Mock).mockResolvedValue({ provider: 'resend', apiKey: 're_stored' })

      const res = await request(testServer()).get('/api/setup/smtp')

      expect(res.status).toBe(200)
      expect(res.body.data.emailProvider).toBe('resend')
      expect(res.body.data.emailApiKey).toBe('****')
      expect(JSON.stringify(res.body)).not.toContain('re_stored')
    })

    it("expose emailApiKey='' quand aucune clé n'est stockée", async () => {
      const res = await request(testServer()).get('/api/setup/smtp')

      expect(res.status).toBe(200)
      expect(res.body.data.emailProvider).toBe('smtp')
      expect(res.body.data.emailApiKey).toBe('')
    })
  })

  // ===================================================
  // POST /api/setup/smtp/test — dispatch par body.provider
  // ===================================================
  describe('POST /api/setup/smtp/test — dispatch provider', () => {
    const recipient = 'invitee@example.com'

    it("provider:'resend' avec clé fournie → sendBrandedProviderTest appelé avec recipient du body", async () => {
      ;(emailService.sendBrandedProviderTest as jest.Mock).mockResolvedValue({ success: true, message: 'Connexion réussie' })

      const res = await request(testServer())
        .post('/api/setup/smtp/test')
        .send({ provider: 'resend', emailApiKey: 're_given', recipient })

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ success: true, message: 'Connexion réussie' })
      expect(emailProviderDb.getEmailProviderConfig).not.toHaveBeenCalled()
      expect(emailService.sendBrandedProviderTest).toHaveBeenCalledWith(
        { provider: 'resend', apiKey: 're_given', fromName: undefined, fromEmail: undefined },
        recipient,
      )
    })

    it("provider:'resend' avec sentinelle '****' → résout la clé stockée", async () => {
      ;(emailProviderDb.getEmailProviderConfig as jest.Mock).mockResolvedValue({ provider: 'resend', apiKey: 're_stored' })
      ;(emailService.sendBrandedProviderTest as jest.Mock).mockResolvedValue({ success: true, message: 'Connexion réussie' })

      const res = await request(testServer())
        .post('/api/setup/smtp/test')
        .send({ provider: 'resend', emailApiKey: '****', recipient })

      expect(res.status).toBe(200)
      expect(emailService.sendBrandedProviderTest).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: 're_stored' }),
        recipient,
      )
    })

    it("provider:'resend' sans clé fournie ni stockée → {success:false} explicite", async () => {
      ;(emailProviderDb.getEmailProviderConfig as jest.Mock).mockResolvedValue({ provider: 'resend', apiKey: '' })

      const res = await request(testServer())
        .post('/api/setup/smtp/test')
        .send({ provider: 'resend', recipient })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(false)
      expect(res.body.message).toContain('Aucune clé API configurée')
      expect(emailService.sendBrandedProviderTest).not.toHaveBeenCalled()
    })

    it("provider:'resend' sans recipient → 400 VALIDATION_ERROR (schéma setup exige recipient)", async () => {
      const res = await request(testServer())
        .post('/api/setup/smtp/test')
        .send({ provider: 'resend', emailApiKey: 'k' })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
    })

    it("provider:'brevo' → 400 VALIDATION_ERROR (jamais atteignable)", async () => {
      const res = await request(testServer())
        .post('/api/setup/smtp/test')
        .send({ provider: 'brevo', emailApiKey: 'k', recipient })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
    })
  })
})
