// app.ts transitively imports isomorphic-dompurify (ESM trap) — mock it defensively
// as the newer upload/brand suites do (mirror uploads.routes.test.ts).
jest.mock('isomorphic-dompurify')

import { describe, it, expect, jest, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { query } from '../../db'
import { swapOrganizationLogo } from '../../services/organization.service'
import { testServer } from '../helpers/test-server'
import * as organizationLogoService from '../../services/organization-logo.service'

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret'

/**
 * Tests d'intégration — chantier A1 (façade d'instance & identité d'organisation).
 * Couvre GET /api/public/organization, GET/PUT /api/admin/settings/organization et
 * POST/DELETE /api/admin/settings/organization/logo. Le miroir /api/setup/organization*
 * est couvert par setup-organization.test.ts.
 *
 * `processOrganizationLogo` est stubbé pour les tests d'upload : son import
 * dynamique ESM (`file-type`) ne peut pas s'exécuter dans le VM CommonJS de
 * ts-jest (`ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING_FLAG`, vérifié empiriquement) —
 * même contrainte que `processEmailImage` (cf. uploads.routes.test.ts). La détection
 * magic-bytes réelle n'est donc exercée par aucun test de ce dépôt (email inclus).
 */
describe('Organization Settings API', () => {
  let adminToken: string
  let adminUserId: string

  async function createTestAdmin() {
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`
    const userResult = await query(
      `INSERT INTO users (email, first_name, role)
       VALUES ($1, $2, $3)
       RETURNING id, email, first_name, role`,
      [`test-org-admin-${uniqueSuffix}@example.com`, 'Test Admin', 'admin'],
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
    await query("DELETE FROM users WHERE email LIKE '%test-org-admin-%' OR email LIKE '%test-org-user-%'")
  })

  // Baseline déterministe reproduisant l'état post-migration 041, appliquée avant
  // CHAQUE test — indépendant de l'ordre d'exécution (mirrors config.test.ts).
  beforeEach(async () => {
    await query(
      `INSERT INTO app_config (key, value) VALUES
         ('organization_name', ''),
         ('organization_logo', ''),
         ('organization_description', ''),
         ('homepage_mode', 'facade')
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    )
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  // ===================================================
  // GET /api/public/organization
  // ===================================================
  describe('GET /api/public/organization', () => {
    it('retourne EXACTEMENT les 4 champs du contrat, rien d’autre', async () => {
      await query(`UPDATE app_config SET value = 'TimePick Test' WHERE key = 'organization_name'`)

      const res = await request(testServer()).get('/api/public/organization')

      expect(res.status).toBe(200)
      expect(Object.keys(res.body.data).sort()).toEqual(['description', 'homepageFacade', 'logo', 'name'].sort())
      expect(res.body.data).toEqual({
        name: 'TimePick Test',
        logo: '',
        description: '',
        homepageFacade: true,
      })
    })

    it('retourne les valeurs par défaut post-migration : name vide et façade activée', async () => {
      const res = await request(testServer()).get('/api/public/organization')

      expect(res.status).toBe(200)
      expect(res.body.data).toEqual({ name: '', logo: '', description: '', homepageFacade: true })
    })

    it('ne nécessite aucune authentification', async () => {
      const res = await request(testServer()).get('/api/public/organization')
      expect(res.status).toBe(200)
    })
  })

  // ===================================================
  // GET /api/admin/settings/organization
  // ===================================================
  describe('GET /api/admin/settings/organization', () => {
    it('retourne les mêmes 4 champs que la façade publique', async () => {
      const res = await request(testServer())
        .get('/api/admin/settings/organization')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data).toEqual({ name: '', logo: '', description: '', homepageFacade: true })
    })

    it('retourne 401 sans token', async () => {
      const res = await request(testServer()).get('/api/admin/settings/organization')
      expect(res.status).toBe(401)
    })

    it('retourne 403 pour un utilisateur non-admin', async () => {
      const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`
      const userResult = await query(
        `INSERT INTO users (email, first_name, role) VALUES ($1, $2, $3) RETURNING id`,
        [`test-org-user-${uniqueSuffix}@example.com`, 'Test User', 'user'],
      )
      const userToken = jwt.sign({ userId: userResult.rows[0].id, role: 'user' }, JWT_SECRET, { expiresIn: '1h' })

      const res = await request(testServer())
        .get('/api/admin/settings/organization')
        .set('Authorization', `Bearer ${userToken}`)

      expect(res.status).toBe(403)
    })
  })

  // ===================================================
  // PUT /api/admin/settings/organization
  // ===================================================
  describe('PUT /api/admin/settings/organization', () => {
    it('sauvegarde name + description et retourne 200', async () => {
      const res = await request(testServer())
        .put('/api/admin/settings/organization')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Mon Club', description: 'Une description' })

      expect(res.status).toBe(200)
      expect(res.body.data).toEqual({
        name: 'Mon Club',
        logo: '',
        description: 'Une description',
        homepageFacade: true,
      })
    })

    it('trim le nom', async () => {
      const res = await request(testServer())
        .put('/api/admin/settings/organization')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: '  Mon Club  ' })

      expect(res.status).toBe(200)
      expect(res.body.data.name).toBe('Mon Club')
    })

    it('un nom composé uniquement d’espaces devient un nom vide après trim', async () => {
      const res = await request(testServer())
        .put('/api/admin/settings/organization')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: '   ' })

      expect(res.status).toBe(200)
      expect(res.body.data.name).toBe('')
    })

    it('accepte un nom vide et enregistre la description : identité non affichée, pas non enregistrable', async () => {
      const res = await request(testServer())
        .put('/api/admin/settings/organization')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: '', description: 'Une description' })

      expect(res.status).toBe(200)
      expect(res.body.data.name).toBe('')
      expect(res.body.data.description).toBe('Une description')

      const getRes = await request(testServer()).get('/api/admin/settings/organization').set('Authorization', `Bearer ${adminToken}`)
      expect(getRes.body.data.description).toBe('Une description')
    })

    it('rejette un nom manquant (400)', async () => {
      const res = await request(testServer())
        .put('/api/admin/settings/organization')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})

      expect(res.status).toBe(400)
    })

    it('rejette un nom trop long (400)', async () => {
      const res = await request(testServer())
        .put('/api/admin/settings/organization')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'a'.repeat(201) })

      expect(res.status).toBe(400)
    })

    it('accepte un nom de exactement 200 caractères', async () => {
      const res = await request(testServer())
        .put('/api/admin/settings/organization')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'a'.repeat(200) })

      expect(res.status).toBe(200)
    })

    it('rejette une description trop longue (400)', async () => {
      const res = await request(testServer())
        .put('/api/admin/settings/organization')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Mon Club', description: 'a'.repeat(5001) })

      expect(res.status).toBe(400)
    })

    // `isomorphic-dompurify` est remplacé par un passthrough dans Jest
    // (server/src/__mocks__/isomorphic-dompurify.ts — le vrai paquet est
    // ESM-only et fait exploser ts-jest à l'import). On vérifie donc que le
    // transform `sanitizeRichText` est bien CÂBLÉ sur cette route via son
    // effet observable hors DOMPurify : l'aplatissement « retour = <br> ».
    // La correction du sanitiseur lui-même est couverte côté client par
    // client/src/lib/__tests__/richText.test.ts (allowlist identique).
    it('applique le modèle « retour = <br> » à la description riche', async () => {
      const res = await request(testServer())
        .put('/api/admin/settings/organization')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Mon Club',
          description: '<p>Bonjour <strong>tout le monde</strong></p><p></p><p></p><p>À bientôt</p>',
        })

      expect(res.status).toBe(200)
      expect(res.body.data.description).toBe(
        '<p>Bonjour <strong>tout le monde</strong><br><br>À bientôt</p>',
      )
    })

    it('description absente ⇒ vidée (défaut "")', async () => {
      await query(`UPDATE app_config SET value = 'ancienne description' WHERE key = 'organization_description'`)

      const res = await request(testServer())
        .put('/api/admin/settings/organization')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Mon Club' })

      expect(res.status).toBe(200)
      expect(res.body.data.description).toBe('')
    })

    it('homepageFacade absent ne modifie pas homepage_mode', async () => {
      await query(`UPDATE app_config SET value = 'login' WHERE key = 'homepage_mode'`)

      const res = await request(testServer())
        .put('/api/admin/settings/organization')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Mon Club' })

      expect(res.status).toBe(200)
      expect(res.body.data.homepageFacade).toBe(false)

      const row = await query(`SELECT value FROM app_config WHERE key = 'homepage_mode'`)
      expect(row.rows[0].value).toBe('login')
    })

    it('homepageFacade=false désactive la façade — la GET publique le reflète', async () => {
      const putRes = await request(testServer())
        .put('/api/admin/settings/organization')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Mon Club', homepageFacade: false })

      expect(putRes.status).toBe(200)
      expect(putRes.body.data.homepageFacade).toBe(false)

      const publicRes = await request(testServer()).get('/api/public/organization')
      expect(publicRes.body.data.homepageFacade).toBe(false)

      const row = await query(`SELECT value FROM app_config WHERE key = 'homepage_mode'`)
      expect(row.rows[0].value).toBe('login')
    })

    it('homepageFacade=true réactive la façade', async () => {
      await query(`UPDATE app_config SET value = 'login' WHERE key = 'homepage_mode'`)

      const res = await request(testServer())
        .put('/api/admin/settings/organization')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Mon Club', homepageFacade: true })

      expect(res.status).toBe(200)
      expect(res.body.data.homepageFacade).toBe(true)
    })

    it('retourne 401 sans token', async () => {
      const res = await request(testServer())
        .put('/api/admin/settings/organization')
        .send({ name: 'Mon Club' })

      expect(res.status).toBe(401)
    })
  })

  // ===================================================
  // POST /api/admin/settings/organization/logo
  // ===================================================
  describe('POST /api/admin/settings/organization/logo', () => {
    it('téléverse un logo et retourne son URL', async () => {
      const spy = jest
        .spyOn(organizationLogoService, 'processOrganizationLogo')
        .mockResolvedValue('https://cdn.example.com/uploads/emails/org-logos/2026/07/org-logo-abc.webp')

      const res = await request(testServer())
        .post('/api/admin/settings/organization/logo')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('logo', Buffer.from('fake-png-bytes'), { filename: 'logo.png', contentType: 'image/png' })

      expect(res.status).toBe(200)
      expect(res.body.data).toEqual({ logo: 'https://cdn.example.com/uploads/emails/org-logos/2026/07/org-logo-abc.webp' })
      expect(spy).toHaveBeenCalledTimes(1)

      const row = await query(`SELECT value FROM app_config WHERE key = 'organization_logo'`)
      expect(row.rows[0].value).toBe('https://cdn.example.com/uploads/emails/org-logos/2026/07/org-logo-abc.webp')
    })

    it('supprime best-effort l’ancien fichier au remplacement', async () => {
      await query(
        `UPDATE app_config SET value = 'https://cdn.example.com/uploads/emails/org-logos/2026/06/old.webp' WHERE key = 'organization_logo'`,
      )
      jest
        .spyOn(organizationLogoService, 'processOrganizationLogo')
        .mockResolvedValue('https://cdn.example.com/uploads/emails/org-logos/2026/07/new.webp')
      const deleteSpy = jest.spyOn(organizationLogoService, 'deleteOrganizationLogoFile').mockResolvedValue(undefined)

      const res = await request(testServer())
        .post('/api/admin/settings/organization/logo')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('logo', Buffer.from('fake-png-bytes'), { filename: 'logo.png', contentType: 'image/png' })

      expect(res.status).toBe(200)
      expect(deleteSpy).toHaveBeenCalledWith('https://cdn.example.com/uploads/emails/org-logos/2026/06/old.webp')
    })

    it('rejette un fichier non-image (415)', async () => {
      jest
        .spyOn(organizationLogoService, 'processOrganizationLogo')
        .mockRejectedValue(new organizationLogoService.UnsupportedOrganizationLogoError("Format d'image non supporté"))

      const res = await request(testServer())
        .post('/api/admin/settings/organization/logo')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('logo', Buffer.from('this is not an image'), { filename: 'evil.txt', contentType: 'text/plain' })

      expect(res.status).toBe(415)
    })

    it('rejette un fichier vide (400)', async () => {
      const res = await request(testServer())
        .post('/api/admin/settings/organization/logo')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('logo', Buffer.alloc(0), { filename: 'empty.png', contentType: 'image/png' })

      expect(res.status).toBe(400)
    })

    it('rejette une requête sans fichier (400)', async () => {
      const res = await request(testServer())
        .post('/api/admin/settings/organization/logo')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(400)
    })

    it('retourne 401 sans token', async () => {
      const res = await request(testServer())
        .post('/api/admin/settings/organization/logo')
        .attach('logo', Buffer.from('x'), { filename: 'logo.png', contentType: 'image/png' })

      expect(res.status).toBe(401)
    })
  })

  // ===================================================
  // DELETE /api/admin/settings/organization/logo
  // ===================================================
  describe('DELETE /api/admin/settings/organization/logo', () => {
    it('efface la clé et retourne 204', async () => {
      await query(
        `UPDATE app_config SET value = 'https://cdn.example.com/uploads/emails/org-logos/2026/07/x.webp' WHERE key = 'organization_logo'`,
      )
      const deleteSpy = jest.spyOn(organizationLogoService, 'deleteOrganizationLogoFile').mockResolvedValue(undefined)

      const res = await request(testServer())
        .delete('/api/admin/settings/organization/logo')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(204)
      expect(deleteSpy).toHaveBeenCalledWith('https://cdn.example.com/uploads/emails/org-logos/2026/07/x.webp')

      const row = await query(`SELECT value FROM app_config WHERE key = 'organization_logo'`)
      expect(row.rows[0].value).toBe('')
    })

    it('reste 204 quand il n’y a pas de logo (idempotente)', async () => {
      const res = await request(testServer())
        .delete('/api/admin/settings/organization/logo')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(204)
    })

    it('retourne 401 sans token', async () => {
      const res = await request(testServer()).delete('/api/admin/settings/organization/logo')
      expect(res.status).toBe(401)
    })
  })

  // ===================================================
  // swapOrganizationLogo — atomicité lecture/écriture
  // ===================================================
  describe('swapOrganizationLogo (course entre deux téléversements concurrents)', () => {
    it('attribue chaque URL à un seul destinataire : rien ne devient orphelin', async () => {
      const [previousForA, previousForB] = await Promise.all([
        swapOrganizationLogo('a.webp'),
        swapOrganizationLogo('b.webp'),
      ])
      const stored = await query<{ value: string }>(
        `SELECT value FROM app_config WHERE key = 'organization_logo'`,
      )

      // Invariant de non-orphelinage : sans verrou les deux appelants lisent
      // l'état initial, et l'URL du perdant n'est rendue à personne.
      expect([previousForA, previousForB, stored.rows[0].value].sort()).toEqual(['', 'a.webp', 'b.webp'])
    })

    it('échoue bruyamment si la ligne organization_logo seedée a disparu', async () => {
      await query(`DELETE FROM app_config WHERE key = 'organization_logo'`)

      await expect(swapOrganizationLogo('a.webp')).rejects.toThrow(/organization_logo/)
    })
  })
})
