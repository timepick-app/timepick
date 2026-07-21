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
 * Tests d'intégration Chantier email-providers (B2) — dispatch provider
 * (`body.provider`) DATA-DRIVEN des routes admin SMTP existantes : GET
 * expose emailProvider/credentials masquées PAR CHAMP, PUT/POST dispatchent
 * par provider avec un modèle `credentials` multi-champ, DELETE réinitialise
 * aussi le provider. Ne duplique PAS les cas déjà couverts par
 * settings.test.ts (chemin smtp historique, validation, protection des routes).
 */
describe('SMTP Settings API — dispatch provider data-driven (chantier email-providers)', () => {
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
    ;(emailProviderDb.getEmailProviderConfig as jest.Mock).mockResolvedValue({ provider: 'smtp', credentials: { apiKey: '' } })
    ;(emailProviderDb.saveEmailProviderConfig as jest.Mock).mockResolvedValue(undefined)
    ;(emailProviderDb.clearEmailProviderConfig as jest.Mock).mockResolvedValue(undefined)
  })

  // ===================================================
  // GET — expose emailProvider + credentials masquées PAR CHAMP
  // ===================================================
  describe('GET /api/admin/settings/smtp', () => {
    it('mailjet — champs secrets → "****", champs non-secrets absents restent \'\' (aucun champ non-secret pour mailjet)', async () => {
      ;(emailProviderDb.getEmailProviderConfig as jest.Mock).mockResolvedValue({
        provider: 'mailjet',
        credentials: { apiKey: 'ak_stored', secretKey: 'sk_stored' },
      })

      const res = await request(testServer())
        .get('/api/admin/settings/smtp')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data.emailProvider).toBe('mailjet')
      expect(res.body.data.credentials).toEqual({ apiKey: '****', secretKey: '****' })
      expect(res.body.data.emailApiKey).toBe('****') // compat §4.1
      expect(JSON.stringify(res.body)).not.toContain('ak_stored')
      expect(JSON.stringify(res.body)).not.toContain('sk_stored')
    })

    it('scaleway — champ non-secret (region, projectId) renvoyé EN CLAIR, secretKey masqué', async () => {
      ;(emailProviderDb.getEmailProviderConfig as jest.Mock).mockResolvedValue({
        provider: 'scaleway',
        credentials: { secretKey: 'sec_stored', projectId: 'proj-123', region: 'fr-par' },
      })

      const res = await request(testServer())
        .get('/api/admin/settings/smtp')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data.credentials).toEqual({ secretKey: '****', projectId: 'proj-123', region: 'fr-par' })
      expect(JSON.stringify(res.body)).not.toContain('sec_stored')
    })

    it("expose credentials={} et emailApiKey='' quand aucune clé n'est stockée (provider smtp par défaut)", async () => {
      ;(emailProviderDb.getEmailProviderConfig as jest.Mock).mockResolvedValue({ provider: 'smtp', credentials: {} })

      const res = await request(testServer())
        .get('/api/admin/settings/smtp')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data.emailProvider).toBe('smtp')
      expect(res.body.data.emailApiKey).toBe('')
    })

    it('fail-safe masquage (delta revue 7) — descripteur inconnu (provider "smtp" avec des credentials résiduels) → tout masqué', async () => {
      // 'smtp' n'a pas de descripteur HTTP (getProviderMeta('smtp') === undefined) : simule
      // le cas d'un champ résiduel non nettoyé — doit être masqué, jamais renvoyé en clair.
      ;(emailProviderDb.getEmailProviderConfig as jest.Mock).mockResolvedValue({
        provider: 'smtp',
        credentials: { residual: 'leftover-value' },
      })

      const res = await request(testServer())
        .get('/api/admin/settings/smtp')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data.credentials).toEqual({ residual: '****' })
      expect(JSON.stringify(res.body)).not.toContain('leftover-value')
    })
  })

  // ===================================================
  // PUT — dispatch par body.provider (multi-champ)
  // ===================================================
  describe('PUT /api/admin/settings/smtp — dispatch provider multi-champ', () => {
    it("provider:'mailjet' avec clé+secret → saveEmailProviderConfig + saveSmtpSettings (smtpFromEmail requis)", async () => {
      const res = await request(testServer())
        .put('/api/admin/settings/smtp')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          provider: 'mailjet',
          credentials: { apiKey: 'ak_new', secretKey: 'sk_new' },
          smtpFromName: 'MonApp',
          smtpFromEmail: 'from@example.com',
        })

      expect(res.status).toBe(200)
      expect(emailProviderDb.saveEmailProviderConfig).toHaveBeenCalledWith(
        { provider: 'mailjet', credentials: { apiKey: 'ak_new', secretKey: 'sk_new' } },
        expect.any(Function),
      )
      expect(settingsDb.saveSmtpSettings).toHaveBeenCalledWith({ smtpFromName: 'MonApp', smtpFromEmail: 'from@example.com' })
      expect(emailService.invalidateTransportCache).toHaveBeenCalledTimes(1)
    })

    it("provider:'scaleway' avec secretKey+projectId+region → sauvegardé tel quel", async () => {
      const res = await request(testServer())
        .put('/api/admin/settings/smtp')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          provider: 'scaleway',
          credentials: { secretKey: 'sec', projectId: 'proj-1', region: 'fr-par' },
          smtpFromEmail: 'from@example.com',
        })

      expect(res.status).toBe(200)
      expect(emailProviderDb.saveEmailProviderConfig).toHaveBeenCalledWith(
        { provider: 'scaleway', credentials: { secretKey: 'sec', projectId: 'proj-1', region: 'fr-par' } },
        expect.any(Function),
      )
    })

    it("provider:'scaleway' avec region hors options → 400 VALIDATION_ERROR", async () => {
      const res = await request(testServer())
        .put('/api/admin/settings/smtp')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          provider: 'scaleway',
          credentials: { secretKey: 'sec', projectId: 'proj-1', region: 'us-east-1' },
          smtpFromEmail: 'from@example.com',
        })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
      expect(emailProviderDb.saveEmailProviderConfig).not.toHaveBeenCalled()
    })

    it("provider:'scaleway' avec region='****' (sentinelle sur champ non-secret) → 400, aucune écriture", async () => {
      const res = await request(testServer())
        .put('/api/admin/settings/smtp')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          provider: 'scaleway',
          credentials: { secretKey: 'sec', projectId: 'proj-1', region: '****' },
          smtpFromEmail: 'from@example.com',
        })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
      expect(emailProviderDb.saveEmailProviderConfig).not.toHaveBeenCalled()
    })

    it("provider:'mailjet' sans secretKey (champ requis absent) → 400, aucune écriture", async () => {
      const res = await request(testServer())
        .put('/api/admin/settings/smtp')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ provider: 'mailjet', credentials: { apiKey: 'ak' }, smtpFromEmail: 'from@example.com' })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
      expect(emailProviderDb.saveEmailProviderConfig).not.toHaveBeenCalled()
    })

    it("provider:'resend' sans smtpFromEmail → 400 (requis pour tout provider HTTP, contrat §4.2/§7.6)", async () => {
      const res = await request(testServer())
        .put('/api/admin/settings/smtp')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ provider: 'resend', credentials: { apiKey: 're_key' } })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
      expect(emailProviderDb.saveEmailProviderConfig).not.toHaveBeenCalled()
    })

    it("provider:'resend' avec apiKey='****' (sentinelle, même provider stocké) → préservée telle quelle vers saveEmailProviderConfig", async () => {
      ;(emailProviderDb.getEmailProviderConfig as jest.Mock).mockResolvedValue({ provider: 'resend', credentials: { apiKey: 're_stored' } })

      const res = await request(testServer())
        .put('/api/admin/settings/smtp')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ provider: 'resend', credentials: { apiKey: '****' }, smtpFromEmail: 'from@example.com' })

      expect(res.status).toBe(200)
      expect(emailProviderDb.saveEmailProviderConfig).toHaveBeenCalledWith(
        { provider: 'resend', credentials: { apiKey: '****' } },
        expect.any(Function),
      )
    })

    it("durcissement revue — switch resend→mailjet avec apiKey='****' → 400, AUCUNE fuite de la clé resend stockée", async () => {
      ;(emailProviderDb.getEmailProviderConfig as jest.Mock).mockResolvedValue({ provider: 'resend', credentials: { apiKey: 're_secret_stored' } })

      const res = await request(testServer())
        .put('/api/admin/settings/smtp')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          provider: 'mailjet',
          credentials: { apiKey: '****', secretKey: 'sk_new' },
          smtpFromEmail: 'from@example.com',
        })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
      expect(emailProviderDb.saveEmailProviderConfig).not.toHaveBeenCalled()
      expect(JSON.stringify(res.body)).not.toContain('re_secret_stored')
    })

    it("provider:'brevo' non reconnu → 400 VALIDATION_ERROR (id invalide, ex. faute de frappe)", async () => {
      const res = await request(testServer())
        .put('/api/admin/settings/smtp')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ provider: 'brevoo', credentials: { apiKey: 'xkeysib-x' }, smtpFromEmail: 'from@example.com' })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
      expect(emailProviderDb.saveEmailProviderConfig).not.toHaveBeenCalled()
    })

    it("body sans provider (chemin historique) → saveEmailProviderConfig({provider:'smtp'}) rend la bascule HTTP→smtp effective", async () => {
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
  describe('POST /api/admin/settings/smtp/test — dispatch provider multi-champ', () => {
    it("provider:'resend' avec clé fournie → sendBrandedProviderTest appelé avec les credentials du body (pas de résolution DB)", async () => {
      ;(emailService.sendBrandedProviderTest as jest.Mock).mockResolvedValue({ success: true, message: 'Connexion réussie' })

      const res = await request(testServer())
        .post('/api/admin/settings/smtp/test')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ provider: 'resend', credentials: { apiKey: 're_given_key' }, smtpFromEmail: 'from@example.com' })

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ success: true, message: 'Connexion réussie' })
      expect(emailProviderDb.getEmailProviderConfig).not.toHaveBeenCalled()
      expect(emailService.sendBrandedProviderTest).toHaveBeenCalledWith(
        { provider: 'resend', credentials: { apiKey: 're_given_key' }, fromName: undefined, fromEmail: 'from@example.com' },
        adminEmail,
      )
    })

    it("provider:'resend' avec sentinelle '****' (même provider stocké) → résout la clé RÉELLEMENT stockée", async () => {
      ;(emailProviderDb.getEmailProviderConfig as jest.Mock).mockResolvedValue({ provider: 'resend', credentials: { apiKey: 're_stored' } })
      ;(emailService.sendBrandedProviderTest as jest.Mock).mockResolvedValue({ success: true, message: 'Connexion réussie' })

      const res = await request(testServer())
        .post('/api/admin/settings/smtp/test')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ provider: 'resend', credentials: { apiKey: '****' }, smtpFromEmail: 'from@example.com' })

      expect(res.status).toBe(200)
      expect(emailProviderDb.getEmailProviderConfig).toHaveBeenCalledTimes(1)
      expect(emailService.sendBrandedProviderTest).toHaveBeenCalledWith(
        expect.objectContaining({ credentials: { apiKey: 're_stored' } }),
        adminEmail,
      )
    })

    it("provider:'resend' sans clé fournie ni stockée → {success:false} explicite, transport jamais tenté", async () => {
      ;(emailProviderDb.getEmailProviderConfig as jest.Mock).mockResolvedValue({ provider: 'resend', credentials: { apiKey: '' } })

      const res = await request(testServer())
        .post('/api/admin/settings/smtp/test')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ provider: 'resend', smtpFromEmail: 'from@example.com' })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(false)
      expect(res.body.message).toContain('requis manquant')
      expect(emailService.sendBrandedProviderTest).not.toHaveBeenCalled()
    })

    it("durcissement revue — test provider:'mailjet' avec apiKey='****' alors que resend est stocké → success:false, AUCUNE fuite de la clé resend", async () => {
      ;(emailProviderDb.getEmailProviderConfig as jest.Mock).mockResolvedValue({ provider: 'resend', credentials: { apiKey: 're_secret_stored' } })

      const res = await request(testServer())
        .post('/api/admin/settings/smtp/test')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ provider: 'mailjet', credentials: { apiKey: '****', secretKey: 'sk_new' }, smtpFromEmail: 'from@example.com' })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(false)
      expect(emailService.sendBrandedProviderTest).not.toHaveBeenCalled()
      expect(JSON.stringify(res.body)).not.toContain('re_secret_stored')
    })

    it("provider:'brevoo' (id invalide) → 400 VALIDATION_ERROR", async () => {
      const res = await request(testServer())
        .post('/api/admin/settings/smtp/test')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ provider: 'brevoo', credentials: { apiKey: 'k' }, smtpFromEmail: 'from@example.com' })

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

  // ===================================================
  // GET /api/admin/settings/email-providers — catalogue (contrat §1/§3.1)
  // ===================================================
  describe('GET /api/admin/settings/email-providers', () => {
    it('catalogue EU-first / resend dernier, AUCUN secret', async () => {
      const res = await request(testServer())
        .get('/api/admin/settings/email-providers')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data.map((p: { id: string }) => p.id)).toEqual(['brevo', 'mailjet', 'scaleway', 'sweego', 'resend'])
      for (const provider of res.body.data) {
        expect(provider).not.toHaveProperty('credentials.apiKey')
        for (const field of provider.credentialFields) {
          expect(field).not.toHaveProperty('value')
        }
      }
    })
  })
})
