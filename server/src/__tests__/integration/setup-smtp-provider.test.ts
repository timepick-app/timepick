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
 * Tests d'intégration chantier email-providers (B2) — dispatch provider
 * DATA-DRIVEN sur les endpoints setup (publics gated) : GET expose
 * emailProvider/credentials masquées PAR CHAMP, POST /test dispatche par
 * provider avec `recipient` dans le body (schéma setup dédié). Ne duplique
 * PAS les cas déjà couverts par setup-smtp.test.ts (chemin smtp historique,
 * blocklist IP, validation, checkSetupNotDone).
 */
describe('Setup SMTP API — dispatch provider data-driven (chantier email-providers)', () => {
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
    ;(emailProviderDb.getEmailProviderConfig as jest.Mock).mockResolvedValue({ provider: 'smtp', credentials: {} })
  })

  afterAll(async () => {
    await query("DELETE FROM users WHERE role = 'admin'")
  })

  // ===================================================
  // GET /api/setup/smtp — expose emailProvider + credentials masquées PAR CHAMP
  // ===================================================
  describe('GET /api/setup/smtp', () => {
    it('scaleway — secretKey masqué, projectId/region en clair', async () => {
      ;(emailProviderDb.getEmailProviderConfig as jest.Mock).mockResolvedValue({
        provider: 'scaleway',
        credentials: { secretKey: 'sec_stored', projectId: 'proj-9', region: 'fr-par' },
      })

      const res = await request(testServer()).get('/api/setup/smtp')

      expect(res.status).toBe(200)
      expect(res.body.data.emailProvider).toBe('scaleway')
      expect(res.body.data.credentials).toEqual({ secretKey: '****', projectId: 'proj-9', region: 'fr-par' })
      expect(JSON.stringify(res.body)).not.toContain('sec_stored')
    })

    it("expose credentials={} et emailApiKey='' quand aucune clé n'est stockée", async () => {
      const res = await request(testServer()).get('/api/setup/smtp')

      expect(res.status).toBe(200)
      expect(res.body.data.emailProvider).toBe('smtp')
      expect(res.body.data.emailApiKey).toBe('')
    })
  })

  // ===================================================
  // GET /api/setup/email-providers — catalogue public (contrat §1)
  // ===================================================
  describe('GET /api/setup/email-providers', () => {
    it('catalogue byte-identique à /api/admin/settings/email-providers (même handler, source unique)', async () => {
      const res = await request(testServer()).get('/api/setup/email-providers')

      expect(res.status).toBe(200)
      expect(res.body.data.map((p: { id: string }) => p.id)).toEqual(['brevo', 'mailjet', 'scaleway', 'sweego', 'resend'])
    })
  })

  // ===================================================
  // POST /api/setup/smtp/test — dispatch par body.provider
  // ===================================================
  describe('POST /api/setup/smtp/test — dispatch provider multi-champ', () => {
    const recipient = 'invitee@example.com'

    it("provider:'resend' avec clé fournie → sendBrandedProviderTest appelé avec recipient du body", async () => {
      ;(emailService.sendBrandedProviderTest as jest.Mock).mockResolvedValue({ success: true, message: 'Connexion réussie' })

      const res = await request(testServer())
        .post('/api/setup/smtp/test')
        .send({ provider: 'resend', credentials: { apiKey: 're_given' }, smtpFromEmail: 'from@example.com', recipient })

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ success: true, message: 'Connexion réussie' })
      expect(emailProviderDb.getEmailProviderConfig).not.toHaveBeenCalled()
      expect(emailService.sendBrandedProviderTest).toHaveBeenCalledWith(
        { provider: 'resend', credentials: { apiKey: 're_given' }, fromName: undefined, fromEmail: 'from@example.com' },
        recipient,
      )
    })

    it("provider:'mailjet' avec clé+secret → dispatch multi-champ complet", async () => {
      ;(emailService.sendBrandedProviderTest as jest.Mock).mockResolvedValue({ success: true, message: 'Connexion réussie' })

      const res = await request(testServer())
        .post('/api/setup/smtp/test')
        .send({ provider: 'mailjet', credentials: { apiKey: 'ak', secretKey: 'sk' }, smtpFromEmail: 'from@example.com', recipient })

      expect(res.status).toBe(200)
      expect(emailService.sendBrandedProviderTest).toHaveBeenCalledWith(
        { provider: 'mailjet', credentials: { apiKey: 'ak', secretKey: 'sk' }, fromName: undefined, fromEmail: 'from@example.com' },
        recipient,
      )
    })

    it("provider:'resend' avec sentinelle '****' (même provider stocké) → résout la clé stockée", async () => {
      ;(emailProviderDb.getEmailProviderConfig as jest.Mock).mockResolvedValue({ provider: 'resend', credentials: { apiKey: 're_stored' } })
      ;(emailService.sendBrandedProviderTest as jest.Mock).mockResolvedValue({ success: true, message: 'Connexion réussie' })

      const res = await request(testServer())
        .post('/api/setup/smtp/test')
        .send({ provider: 'resend', credentials: { apiKey: '****' }, smtpFromEmail: 'from@example.com', recipient })

      expect(res.status).toBe(200)
      expect(emailService.sendBrandedProviderTest).toHaveBeenCalledWith(
        expect.objectContaining({ credentials: { apiKey: 're_stored' } }),
        recipient,
      )
    })

    it("provider:'resend' sans clé fournie ni stockée → {success:false} explicite", async () => {
      ;(emailProviderDb.getEmailProviderConfig as jest.Mock).mockResolvedValue({ provider: 'resend', credentials: { apiKey: '' } })

      const res = await request(testServer())
        .post('/api/setup/smtp/test')
        .send({ provider: 'resend', smtpFromEmail: 'from@example.com', recipient })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(false)
      expect(res.body.message).toContain('requis manquant')
      expect(emailService.sendBrandedProviderTest).not.toHaveBeenCalled()
    })

    it("durcissement revue — provider:'mailjet' avec apiKey='****' alors que resend est stocké → success:false, AUCUNE fuite de la clé resend", async () => {
      ;(emailProviderDb.getEmailProviderConfig as jest.Mock).mockResolvedValue({ provider: 'resend', credentials: { apiKey: 're_secret_stored' } })

      const res = await request(testServer())
        .post('/api/setup/smtp/test')
        .send({ provider: 'mailjet', credentials: { apiKey: '****', secretKey: 'sk_new' }, smtpFromEmail: 'from@example.com', recipient })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(false)
      expect(emailService.sendBrandedProviderTest).not.toHaveBeenCalled()
      expect(JSON.stringify(res.body)).not.toContain('re_secret_stored')
    })

    it("provider:'resend' sans recipient → 400 VALIDATION_ERROR (schéma setup exige recipient)", async () => {
      const res = await request(testServer())
        .post('/api/setup/smtp/test')
        .send({ provider: 'resend', credentials: { apiKey: 'k' }, smtpFromEmail: 'from@example.com' })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
    })

    it("provider:'brevoo' (id invalide) → 400 VALIDATION_ERROR (jamais atteignable)", async () => {
      const res = await request(testServer())
        .post('/api/setup/smtp/test')
        .send({ provider: 'brevoo', credentials: { apiKey: 'k' }, smtpFromEmail: 'from@example.com', recipient })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
    })

    it("provider:'scaleway' avec region hors options → 400 VALIDATION_ERROR", async () => {
      const res = await request(testServer())
        .post('/api/setup/smtp/test')
        .send({
          provider: 'scaleway',
          credentials: { secretKey: 'sec', projectId: 'proj-1', region: 'nl-ams' },
          smtpFromEmail: 'from@example.com',
          recipient,
        })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
    })

    it("provider:'scaleway' avec region='****' (sentinelle sur champ non-secret) → 400 VALIDATION_ERROR", async () => {
      const res = await request(testServer())
        .post('/api/setup/smtp/test')
        .send({
          provider: 'scaleway',
          credentials: { secretKey: 'sec', projectId: 'proj-1', region: '****' },
          smtpFromEmail: 'from@example.com',
          recipient,
        })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
    })
  })
})
